import { GoogleGenAI } from '@google/genai'
import type { Message } from '../interfaces/global.js'
import { config } from 'dotenv'

config()
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

/** Mensaje único para la falta de clave: lo lee el controlador para avisar por socket. */
export const AI_KEY_MISSING_MESSAGE =
  'El agente de IA no está configurado: falta la variable GOOGLE_GENAI_API_KEY en el servidor.'

export async function getAIResponse(
  prompt: string,
  userMsg: string,
  model = 'gemini-2.0-flash',
  chatHistory: Message[] = [],
) {
  // Sin clave, el SDK falla con un error de red genérico y el chat mostraba un
  // "Failed to get AI response" que no dice nada. Se corta antes y se nombra
  // exactamente lo que falta.
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error(AI_KEY_MISSING_MESSAGE)
  }
  try {
    let messages = chatHistory.map((msg) => ({
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

    // Crea el chat
    const chat = ai.chats.create({
      model,
      history: messages,
      config: {
        temperature: 0,
        systemInstruction: prompt
      }
    })

    // Envía el mensaje del usuario
    const response = await chat.sendMessage({
      message: userMsg
    })

    return [response.text, response.usageMetadata?.candidatesTokenCount]
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
