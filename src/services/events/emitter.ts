/**
 * =============================================================================
 *  EL EMISOR — punto único por el que nace todo evento escrito desde código
 * =============================================================================
 *
 *  Tres cosas pasan al emitir, y las tres ocurren dentro de UNA transacción de
 *  Postgres porque las hace `events.emitir()` (db/schema.sql):
 *    (a) se guarda el evento en el outbox `events.event`
 *    (b) se crea una entrega por cada webhook suscrito
 *    (c) se crea una entrega por cada aviso de correo suscrito
 *  y solo entonces se despierta al worker con un NOTIFY.
 *
 *  POR QUÉ LA LÓGICA VIVE EN SQL Y ESTO ES UNA ENVOLTURA DE 40 LÍNEAS:
 *  el otro productor son los triggers de la base, que son los únicos que ven el
 *  valor VIEJO de una columna (from_stage) y los únicos que ven TODO el tráfico
 *  de la vía Meta. Si el fan-out estuviera aquí, habría dos implementaciones que
 *  se desincronizarían; teniéndolo en `events.emitir()`, el trigger y el código
 *  emiten literalmente lo mismo. El CRM usa una envoltura gemela de esta.
 *
 *  REGLA DURA: EMITIR NO PUEDE BLOQUEAR NI ROMPER EL CAMINO PRINCIPAL.
 *  Si el webhook del cliente tarda, falla o la base de eventos se atraganta, el
 *  mensaje del lead se procesa igual. Por eso `emitirEvento` no devuelve promesa
 *  y no lanza nunca: se dispara y se olvida, y un fallo deja un log, no una
 *  excepción que suba hasta el handler del mensaje.
 */

import { query } from '../../lib/db.js'
import { esTipoValido } from './catalog.js'

export interface OpcionesEmision {
  /**
   * Clave de idempotencia del productor. Si ya existe un evento con la misma
   * (cuenta, tipo, clave), no se emite nada. Es lo que hace que un reintento o
   * un reinicio a medias no duplique.
   */
  dedupeKey?: string | null
  /** Momento del HECHO, no del envío. Por defecto, ahora. */
  occurredAt?: Date | string | null
}

export interface ResultadoEmision {
  /** id interno del evento, o null si la dedupe lo descartó. */
  eventId: number | null
  /** true si no se emitió porque ya existía. No es un error. */
  duplicado: boolean
  /** Solo se rellena si algo falló; el llamador normal no lo mira. */
  error?: string
}

/**
 * Emite y ESPERA. Úsalo solo cuando de verdad hace falta el id — hoy: el evento
 * de prueba de /connections, que tiene que responder "se creó la entrega N".
 * Nunca lanza: devuelve el error dentro del resultado.
 */
export async function emitirYEsperar(
  tipo: string,
  payload: Record<string, unknown>,
  userId: number | null | undefined,
  opciones: OpcionesEmision = {}
): Promise<ResultadoEmision> {
  if (!esTipoValido(tipo)) {
    // Un tipo fuera del catálogo es un error de programación, no de datos: si
    // se dejara pasar, el cliente nunca podría suscribirse a él y el evento se
    // guardaría para no llegarle a nadie.
    const error = `Tipo de evento desconocido: "${tipo}". Los tipos válidos están en src/services/events/catalog.ts`
    console.error(`❌ ${error}`)
    return { eventId: null, duplicado: false, error }
  }

  try {
    // api_version NO se mete aquí: va en el SOBRE que arma el worker al enviar.
    // Si se añadiera al payload, los eventos que nacen de un trigger (que no
    // pasan por este módulo) saldrían sin él y el contrato tendría dos formas.
    const res = await query<{ emitir: string | number | null }>(
      'SELECT events.emitir($1, $2, $3::jsonb, $4, COALESCE($5::timestamptz, now())) AS emitir',
      [
        tipo,
        userId ?? null,
        JSON.stringify(payload),
        opciones.dedupeKey ?? null,
        opciones.occurredAt
          ? opciones.occurredAt instanceof Date
            ? opciones.occurredAt.toISOString()
            : opciones.occurredAt
          : null
      ]
    )
    const bruto = res.rows[0]?.emitir ?? null
    if (bruto === null) return { eventId: null, duplicado: true }
    return { eventId: Number(bruto), duplicado: false }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error(`❌ No se pudo emitir el evento "${tipo}":`, mensaje)
    return { eventId: null, duplicado: false, error: mensaje }
  }
}

/**
 * Emite sin esperar. ESTA es la que se llama desde los enganches.
 *
 * Devuelve void a propósito, no una promesa: así es imposible que alguien meta
 * un `await` por costumbre en mitad del camino del mensaje entrante y le añada
 * la latencia de la base —o peor, la de un webhook lento— a la respuesta que el
 * lead está esperando.
 */
export function emitirEvento(
  tipo: string,
  payload: Record<string, unknown>,
  userId: number | null | undefined,
  opciones: OpcionesEmision = {}
): void {
  void emitirYEsperar(tipo, payload, userId, opciones)
}
