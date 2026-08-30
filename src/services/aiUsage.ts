/**
 * =============================================================================
 *  REGISTRO DE CONSUMO DE IA
 * =============================================================================
 *
 *  POR QUÉ EXISTE ESTE ARCHIVO
 *
 *  Hasta ahora la plataforma no medía lo que gasta. El dato llegaba y se tiraba:
 *  `ai.service.ts` recibe `response.usageMetadata` de Gemini en CADA respuesta y
 *  devolvía únicamente `candidatesTokenCount`; los dos llamadores que existen
 *  (whatsapp/messages.controller.ts) descartaban ese segundo elemento. No había
 *  tabla, ni columna, ni log. Sin esto no se puede calcular el costo por cliente
 *  y, por tanto, tampoco el margen — el número más importante del negocio.
 *
 *  Este módulo escribe una fila en app.ai_usage por cada llamada a la IA.
 *
 *  REGLA DURA: MEDIR NUNCA PUEDE ROMPER EL SERVICIO.
 *  Todas las funciones de aquí se llaman SIN await (`void registrarUsoIA(...)`) y
 *  no lanzan nunca. Que la base esté caída, que falte la tabla o que el INSERT
 *  choque no puede impedir que el lead reciba su respuesta. El precio de esa
 *  decisión es explícito: si el INSERT falla, ese consumo se pierde y solo queda
 *  un console.error. Es el intercambio correcto — un cobro perdido es mucho más
 *  barato que un cliente sin respuesta.
 *
 *  QUÉ NO MIDE, PARA QUE NADIE LO DÉ POR HECHO
 *    · El carril Meta (CRM-ms) no pasa por ai.service.ts. Si algún día ese
 *      servicio llama a un modelo, tiene que escribir aquí también.
 *    · La latencia que se guarda es la de la llamada al SDK, no la del extremo
 *      a extremo del mensaje.
 * =============================================================================
 */

import { query } from '../lib/db.js'

/**
 * Forma mínima del `usageMetadata` de Gemini que aquí se usa.
 * Se declara local en vez de importar el tipo del SDK para que este módulo no
 * dependa de la versión de @google/genai: si el SDK renombra un campo, lo que
 * falla es un número que llega en 0, no la compilación.
 */
export interface UsoDeTokens {
  /** Prompt EFECTIVO completo. Incluye los cacheados; no restarlos aquí. */
  promptTokenCount?: number
  /** Tokens de la respuesta. */
  candidatesTokenCount?: number
  /** Subconjunto de promptTokenCount que salió de caché (tarifa distinta). */
  cachedContentTokenCount?: number
  totalTokenCount?: number
}

export interface RegistroUsoIA {
  userId: number
  /** Número QR del que salió la llamada. */
  numberId?: number | string | null
  /** Línea de Meta. Hoy siempre nulo: ese carril no pasa por ai.service.ts. */
  lineId?: string | null
  agentId?: number | null
  model: string
  uso?: UsoDeTokens | null
  latencyMs?: number | null
  ok?: boolean
  /** Categoría corta del fallo ('quota', 'api_key', 'timeout', 'desconocido'…). */
  errorKind?: string | null
}

/** Convierte a entero no negativo; cualquier cosa rara se guarda como 0. */
function entero(valor: unknown): number {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** numberId puede llegar como string desde el socket; se normaliza o se anula. */
function enteroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? Math.floor(n) : null
}

/**
 * Escribe una fila de consumo. NO lanza y NO hay que esperarla.
 *
 * Se registra también cuando la llamada FALLÓ (`ok: false`): una cuenta que
 * quema cuota a base de errores es justo la que hay que poder ver, y si solo se
 * guardaran los aciertos ese gasto sería invisible.
 */
export async function registrarUsoIA(registro: RegistroUsoIA): Promise<void> {
  try {
    await query(
      `INSERT INTO app.ai_usage
         (user_id, number_id, line_id, agent_id, model,
          prompt_tokens, output_tokens, cached_tokens,
          latency_ms, ok, error_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        registro.userId,
        enteroOpcional(registro.numberId),
        registro.lineId ?? null,
        enteroOpcional(registro.agentId),
        registro.model || 'desconocido',
        entero(registro.uso?.promptTokenCount),
        entero(registro.uso?.candidatesTokenCount),
        entero(registro.uso?.cachedContentTokenCount),
        registro.latencyMs ?? null,
        registro.ok !== false,
        registro.errorKind ?? null
      ]
    )
  } catch (error) {
    // A propósito: solo se avisa. Ver "REGLA DURA" en la cabecera del archivo.
    console.error(
      '⚠️ No se pudo registrar el consumo de IA (la respuesta al lead NO se ve afectada):',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Clasifica el error de la IA en una categoría corta y estable.
 *
 * Se guarda la CATEGORÍA y no el mensaje entero por dos motivos: el mensaje del
 * SDK puede traer fragmentos del prompt (o sea, contenido del cliente) y además
 * cambia de una versión a otra, con lo que agrupar por él es imposible.
 */
export function clasificarErrorIA(error: unknown): string {
  const mensaje = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (mensaje.includes('google_genai_api_key')) return 'sin_api_key'
  if (mensaje.includes('quota') || mensaje.includes('429')) return 'cuota'
  if (mensaje.includes('timeout') || mensaje.includes('etimedout')) return 'timeout'
  if (mensaje.includes('safety') || mensaje.includes('blocked')) return 'bloqueado_por_seguridad'
  if (mensaje.includes('not found') || mensaje.includes('404')) return 'modelo_inexistente'
  if (mensaje.includes('permission') || mensaje.includes('403')) return 'sin_permiso'
  return 'desconocido'
}
