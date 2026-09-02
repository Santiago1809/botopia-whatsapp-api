import { GoogleGenAI } from '@google/genai'
import type { Message } from '../interfaces/global.js'
import { config } from 'dotenv'

config()
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

/** Mensaje único para la falta de clave: lo lee el controlador para avisar por socket. */
export const AI_KEY_MISSING_MESSAGE =
  'El agente de IA no está configurado: falta la variable GOOGLE_GENAI_API_KEY en el servidor.'

/**
 * Tope duro para la llamada a Gemini. Sin él, una conexión que se queda colgada
 * (el socket ni cierra ni responde) deja la promesa pendiente para siempre: el
 * agente queda mudo y el "escribiendo…" del chat encendido hasta reiniciar el
 * proceso. 30 s sobra para un chat con historial; ajustable por env igual que
 * el modelo.
 */
const AI_TIMEOUT_MS = (() => {
  const n = Number(process.env.GEMINI_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 30_000
})()

export async function getAIResponse(
  prompt: string,
  userMsg: string,
  // El modelo por defecto se puede mover sin tocar código: Google descontinúa versiones
  // (gemini-2.0-flash dejó de existir y devolvía error en cada respuesta del agente, con la
  // clave bien puesta). Con la env se cambia en caliente el día que pase otra vez.
  modelPedido?: string | null,
  chatHistory: Message[] = [],
) {
  /**
   * EL MODELO, NORMALIZADO A MANO Y NO CON UN VALOR POR DEFECTO.
   *
   * Antes esto era `model = process.env.GEMINI_MODEL || 'gemini-3.6-flash'`. En
   * JavaScript, el valor por defecto de un parámetro SOLO se aplica cuando el argumento
   * llega como `undefined`; si llega como `null` —que es lo que devuelve Postgres cuando
   * la línea no tiene modelo elegido— se pasa el `null` tal cual al SDK, y allí revienta
   * con "Cannot convert undefined or null to object".
   *
   * Desde fuera eso se veía como "el agente no responde", sin más. Es exactamente lo
   * que pasaba en producción, y lo mismo vale para el historial.
   */
  const model =
    (typeof modelPedido === 'string' && modelPedido.trim()) ||
    process.env.GEMINI_MODEL ||
    'gemini-3.6-flash'
  const historial = Array.isArray(chatHistory) ? chatHistory : []
  // Sin clave, el SDK falla con un error de red genérico y el chat mostraba un
  // "Failed to get AI response" que no dice nada. Se corta antes y se nombra
  // exactamente lo que falta.
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error(AI_KEY_MISSING_MESSAGE)
  }
  try {
    let messages = historial.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))
    // Asegura que el primer mensaje sea del usuario
    if (messages.length > 0 && messages[0]?.role !== 'user') {
      // Si no comienza con usuario, recorta desde el primer mensaje de usuario
      const firstUserIndex = messages.findIndex((m) => m.role === 'user')
      if (firstUserIndex === -1) {
        messages = []
      } else {
        messages = messages.slice(firstUserIndex)
      }
    }

    // Un agente sin instrucciones es un caso real: la línea se crea con el prompt
    // vacío y nadie lo rellena. Mandar `systemInstruction: null` hace que el modelo
    // rechace la petición, y desde fuera eso se ve como "el agente no contesta", sin
    // pista de que lo único que falta es escribirle qué debe hacer.
    const instruccion =
      typeof prompt === 'string' && prompt.trim()
        ? prompt
        : 'Eres un asistente de atención al cliente por WhatsApp. Responde de forma breve, cordial y en el mismo idioma en que te escriban.'
    if (instruccion !== prompt) {
      console.warn(
        '⚠️ El agente de esta línea no tiene instrucciones configuradas; se usa un texto por defecto. Configúralo en la pantalla del agente.'
      )
    }

    // Crea el chat
    const chat = ai.chats.create({
      model,
      history: messages,
      config: {
        temperature: 0,
        systemInstruction: instruccion,
        // El SDK corta la petición HTTP por su lado al vencer este plazo.
        httpOptions: { timeout: AI_TIMEOUT_MS }
      }
    })

    // Envía el mensaje del usuario, con tope duro ADEMÁS del del SDK: si el
    // socket se cuelga sin cerrar, esta carrera es la única garantía de que la
    // promesa termina. El error sale por el catch de abajo como cualquier otro
    // fallo de la IA — no se traga — y así el llamador limpia el estado de
    // "escribiendo…" por su camino normal de error.
    let temporizador: NodeJS.Timeout | undefined
    const tope = new Promise<never>((_, reject) => {
      temporizador = setTimeout(
        () =>
          reject(
            new Error(
              `La IA no respondió en ${Math.round(AI_TIMEOUT_MS / 1000)} segundos y se canceló la espera.`
            )
          ),
        AI_TIMEOUT_MS
      )
    })
    const response = await Promise.race([
      chat.sendMessage({ message: userMsg }),
      tope
    ]).finally(() => clearTimeout(temporizador))

    // Se devuelve el usageMetadata ENTERO y no solo candidatesTokenCount.
    //
    // Por qué importa: con `history` de hasta 30 mensajes + `systemInstruction`
    // (el prompt del agente), el PROMPT es la parte cara de la factura de Gemini,
    // y era justo la que no se miraba: antes aquí salía únicamente el conteo de
    // SALIDA y los dos llamadores tiraban hasta ese. El objeto trae
    // promptTokenCount, candidatesTokenCount, cachedContentTokenCount y
    // totalTokenCount; services/aiUsage.ts los persiste en app.ai_usage.
    //
    // La forma de tupla [texto, ...] se conserva a propósito: los llamadores
    // existentes hacen `aiResponse[0]` y `const [aiResponse] = ...`, y así el
    // cambio no toca ninguna de esas líneas.
    return [response.text, response.usageMetadata] as const
  } catch (error) {
    console.error('Error in getAIResponse:', error)
    // Se conserva el motivo real: antes se sustituía por un texto fijo y en los
    // logs no quedaba rastro de si era la clave, la cuota o el modelo.
    throw new Error(
      `No se pudo obtener respuesta de la IA: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
