/**
 * =============================================================================
 *  RESUMEN DIARIO — un evento por cuenta y por día
 * =============================================================================
 *
 *  QUÉ VENTANA CUBRE, que es la decisión que hay que dejar escrita para que
 *  nadie la interprete distinto después:
 *    el DÍA LOCAL COMPLETO ANTERIOR, de 00:00 a 24:00 en la zona horaria de la
 *    preferencia. Nunca un día a medias.
 *  Se manda a la hora local que elija el cliente (`send_at`, por defecto 08:00).
 *  Así el número que lee siempre es un día cerrado y comparable con el anterior;
 *  un resumen de "las últimas 24 horas" cambiaría de significado según a qué
 *  hora se mande y no se podría comparar consigo mismo.
 *
 *  POR QUÉ NO SE PIERDE SI EL PROCESO ESTUVO CAÍDO: la condición no es "son
 *  exactamente las 08:00" sino "ya pasaron las 08:00 locales y todavía no hay
 *  resumen de ese día". Si el servicio estuvo abajo de 8 a 11, a las 11:01 sale
 *  igual. La clave de dedupe (la fecha) es lo que impide que salga dos veces.
 *
 *  DE DÓNDE SALEN LOS NÚMEROS: de events.event, o sea de lo que la máquina
 *  registró que ocurrió. No se estima, no se interpola y no se rellena: si un
 *  día no hubo mensajes, el resumen dice 0. Es la misma regla que rige todo el
 *  subsistema — solo lo literal de la fuente.
 *
 *  Cron propio con setInterval y no una dependencia de planificación: el chequeo
 *  es una consulta por minuto y meter un paquete nuevo por eso no se paga.
 */

import { query } from '../../lib/db.js'
import { emitirYEsperar } from './emitter.js'
import { recortarPreview } from './catalog.js'

/** Hora local por defecto si la preferencia no fija una. */
const HORA_POR_DEFECTO = '08:00'
const CADA_MS = 60_000
/** Tope de filas de detalle: un correo con 400 contactos no lo lee nadie. */
const MAX_DETALLE = 20

interface Pendiente {
  account_id: number
  timezone: string
  dia: string
}

interface Conteo {
  type: string
  n: number
}

interface LineaCaida {
  label: string | null
  reason: string | null
  at: string
}

interface Respuesta {
  name: string | null
  phone: string | null
  preview: string | null
  at: string
}

/**
 * Cuentas a las que ya les toca el resumen y todavía no lo tienen.
 *
 * DISTINCT ON (account_id): una cuenta puede tener el aviso configurado hacia
 * varios correos, pero el EVENTO es uno solo — el fan-out de events.emitir() ya
 * se encarga de repartirlo a todos los destinatarios suscritos. Emitir uno por
 * destinatario crearía resúmenes duplicados.
 */
async function pendientes(): Promise<Pendiente[]> {
  const res = await query<Pendiente>(
    `SELECT DISTINCT ON (p.account_id)
            p.account_id,
            p.timezone,
            ((now() AT TIME ZONE p.timezone)::date - 1)::text AS dia
       FROM events.email_preference p
      WHERE p.is_active
        AND p.event_type = 'daily.summary'
        AND (now() AT TIME ZONE p.timezone)::time >= COALESCE(p.send_at, TIME '${HORA_POR_DEFECTO}')
        AND NOT EXISTS (
              SELECT 1 FROM events.event e
               WHERE e.account_id = p.account_id
                 AND e.type = 'daily.summary'
                 AND e.dedupe_key = ((now() AT TIME ZONE p.timezone)::date - 1)::text
            )
      ORDER BY p.account_id, COALESCE(p.send_at, TIME '${HORA_POR_DEFECTO}')`
  )
  return res.rows
}

/**
 * Arma el payload del resumen de un día para una cuenta.
 * Exportada porque la pantalla de /connections la usa para mostrar el resumen
 * de hoy sin necesidad de correo — verlo en la app no depende del SMTP.
 */
export async function construirResumen(
  accountId: number,
  dia: string,
  zona: string
): Promise<Record<string, unknown>> {
  // La ventana UTC del día local la calcula Postgres: `timestamp AT TIME ZONE`
  // hace la conversión con la base de datos de zonas horarias del sistema, que
  // sabe de horarios de verano. Hacerlo en JavaScript con un offset fijo se
  // rompe dos veces al año.
  const ventana = await query<{ desde: string; hasta: string }>(
    `SELECT ($1::date::timestamp AT TIME ZONE $2) AS desde,
            (($1::date + 1)::timestamp AT TIME ZONE $2) AS hasta`,
    [dia, zona]
  )
  const desde = ventana.rows[0]?.desde
  const hasta = ventana.rows[0]?.hasta
  if (!desde || !hasta) throw new Error(`No se pudo calcular la ventana del día ${dia} en ${zona}`)

  const conteos = await query<Conteo>(
    `SELECT type, COUNT(*)::int AS n
       FROM events.event
      WHERE account_id = $1 AND occurred_at >= $2 AND occurred_at < $3
      GROUP BY type`,
    [accountId, desde, hasta]
  )
  const porTipo = new Map<string, number>(conteos.rows.map((r) => [r.type, Number(r.n)]))
  const n = (tipo: string) => porTipo.get(tipo) ?? 0

  const caidas = await query<LineaCaida>(
    `SELECT payload->'line'->>'label' AS label,
            payload->>'reason'        AS reason,
            occurred_at::text         AS at
       FROM events.event
      WHERE account_id = $1 AND type = 'line.disconnected'
        AND occurred_at >= $2 AND occurred_at < $3
      ORDER BY occurred_at DESC
      LIMIT $4`,
    [accountId, desde, hasta, MAX_DETALLE]
  )

  const respuestas = await query<Respuesta>(
    `SELECT payload->'contact'->>'name'    AS name,
            payload->'contact'->>'phone'   AS phone,
            payload->'message'->>'preview' AS preview,
            occurred_at::text              AS at
       FROM events.event
      WHERE account_id = $1 AND type = 'contact.replied'
        AND occurred_at >= $2 AND occurred_at < $3
      ORDER BY occurred_at DESC
      LIMIT $4`,
    [accountId, desde, hasta, MAX_DETALLE]
  )

  return {
    date: dia,
    timezone: zona,
    desde,
    hasta,
    totales: {
      messages_in: n('message.received'),
      messages_out: n('message.sent'),
      new_contacts: n('contact.created'),
      replies: n('contact.replied'),
      handoffs: n('conversation.handoff_requested'),
      stage_changes: n('contact.stage_changed'),
      ai_disabled: n('contact.ai_disabled'),
      lines_down: n('line.disconnected'),
      lines_up: n('line.connected')
    },
    lines_down: caidas.rows.map((l) => ({
      label: l.label,
      reason: l.reason,
      at: l.at
    })),
    replied: respuestas.rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      preview: recortarPreview(r.preview),
      at: r.at
    }))
  }
}

async function revisar(): Promise<void> {
  let cuentas: Pendiente[]
  try {
    cuentas = await pendientes()
  } catch (error) {
    console.error(
      '❌ No se pudo consultar a quién le toca el resumen diario:',
      error instanceof Error ? error.message : error
    )
    return
  }

  for (const cuenta of cuentas) {
    try {
      const payload = await construirResumen(cuenta.account_id, cuenta.dia, cuenta.timezone)
      const resultado = await emitirYEsperar('daily.summary', payload, cuenta.account_id, {
        // La fecha como clave: un cron que dispare dos veces no manda dos
        // resúmenes, y el evento queda anclado al día que describe.
        dedupeKey: cuenta.dia
      })
      if (resultado.eventId) {
        console.log(`📊 Resumen diario ${cuenta.dia} emitido para la cuenta ${cuenta.account_id}`)
      }
    } catch (error) {
      console.error(
        `❌ No se pudo armar el resumen ${cuenta.dia} de la cuenta ${cuenta.account_id}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}

let temporizador: NodeJS.Timeout | null = null

export function iniciarResumenDiario(): void {
  if (temporizador) return
  temporizador = setInterval(() => void revisar(), CADA_MS)
  temporizador.unref?.()
  // Una pasada al arrancar: si el proceso estuvo caído durante la hora de envío,
  // el resumen sale en cuanto vuelve.
  void revisar()
  console.log('✅ Planificador del resumen diario activo')
}

export function detenerResumenDiario(): void {
  if (temporizador) clearInterval(temporizador)
  temporizador = null
}
