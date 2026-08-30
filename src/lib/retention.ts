import { query } from './db.js'

/**
 * =============================================================================
 *  LIMPIEZA POR ANTIGÜEDAD
 * =============================================================================
 *
 *  QUÉ CRECE Y POR QUÉ IMPORTA
 *
 *  app."Telemetry" recibe un INSERT por CADA request HTTP
 *  (src/middleware/telemetry.middleware.ts) y otro por CADA evento de socket
 *  (session.controller.ts, dentro de socket.onAny). Nada la borraba nunca: en los
 *  tres repos no hay una sola sentencia de purga, ni partición, ni política de
 *  retención. Es medición de infraestructura para calcular el costo del mes;
 *  stats.controller nunca mira más atrás de 12 meses, así que todo lo anterior es
 *  peso muerto que hace más lentas las consultas y engorda los backups.
 *
 *  POR QUÉ ASÍ Y NO CON UN CRON
 *
 *  No se instalan extensiones: sin pg_cron, el disparo tiene que venir de fuera.
 *  De las dos opciones sencillas se implementan las dos, y comparten la misma
 *  función de Postgres (app.run_retention), que ya trae dentro las dos defensas
 *  que hacen falta:
 *    · pg_try_advisory_xact_lock -> si dos instancias arrancan a la vez, purga una;
 *    · app.maintenance_log       -> no repite si ya corrió hace menos de 20 horas,
 *                                   así que un servicio reiniciándose en bucle no
 *                                   martillea la base.
 *  Por eso llamar a esto de más es inofensivo.
 *
 *  CADA CUÁNTO CONVIENE CORRERLO
 *  Una vez al día es de sobra. Con el disparo en el arranque, cualquier despliegue
 *  o reinicio ya lo cubre; si el servicio pasara semanas sin reiniciarse, el
 *  endpoint de admin (POST /api/stats/retention) sirve para forzarlo.
 *
 *  QUÉ SE BORRA — configurable por entorno, con valores prudentes por defecto:
 *    TELEMETRY_RETENTION_DAYS      (por defecto 90) telemetría de infraestructura
 *    EVENTS_RETENTION_DAYS         (por defecto 0 = NO borrar) bitácora crm.events
 *    CONVERSATIONS_RETENTION_DAYS  (por defecto 0 = NO borrar) historial de chat
 *    AI_USAGE_RETENTION_DAYS       (por defecto 0 = NO borrar) consumo de IA
 *
 *  Los tres últimos nacen APAGADOS a propósito: crm.conversations es la
 *  conversación con el cliente y app.ai_usage es la prueba de cuánto costó cada
 *  mes. Los dos son dato de negocio, no basura, así que borrarlos tiene que ser
 *  una decisión explícita de alguien, nunca el valor por defecto. Si algún día se
 *  activa el de IA, 400 días es el mínimo razonable: deja cerrar un ejercicio
 *  completo y comparar contra el mismo mes del año anterior.
 *
 *  LO QUE NO PASA POR AQUÍ: events.event, events.delivery y
 *  events.delivery_attempt (el carril de webhooks). Los purga su propio worker,
 *  también una vez al día, con events.purgar_retencion(). Se dejan separados
 *  porque el worker puede correr en un proceso distinto del API.
 * =============================================================================
 */

export interface ResultadoRetencion {
  telemetry?: number
  events?: number
  conversations?: number
  ai_usage?: number
  ran_at?: string
  skipped?: string
  last_run_at?: string
}

/** Lee un número de entorno; 0 o ausente significa "no borrar esta tabla". */
function dias(nombre: string, porDefecto: number): number {
  const raw = process.env[nombre]
  if (raw === undefined || raw === '') return porDefecto
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Ejecuta la purga. `force` salta el "ya corrió hace poco" (lo usa el endpoint
 * de admin, para que pedirla a mano sirva de algo).
 *
 * Se llama con argumentos NOMBRADOS (`p_telemetry_days => $1`) y no por posición:
 * la función tiene cinco parámetros con valor por defecto y ligarlos por orden
 * obligaría a mandar todos, incluidos los que se quieren dejar en su default.
 */
export async function runRetention(force = false): Promise<ResultadoRetencion> {
  const telemetryDays = dias('TELEMETRY_RETENTION_DAYS', 90)
  const eventsDays = dias('EVENTS_RETENTION_DAYS', 0)
  const conversationsDays = dias('CONVERSATIONS_RETENTION_DAYS', 0)
  const aiUsageDays = dias('AI_USAGE_RETENTION_DAYS', 0)

  const { rows } = await query<{ result: ResultadoRetencion }>(
    `SELECT app.run_retention(
        p_telemetry_days     => $1,
        p_events_days        => NULLIF($2, 0),
        p_conversations_days => NULLIF($3, 0),
        p_force              => $4,
        p_ai_usage_days      => NULLIF($5, 0)
      ) AS result`,
    [telemetryDays, eventsDays, conversationsDays, force, aiUsageDays]
  )

  return rows[0]?.result ?? {}
}

/**
 * Disparo en el arranque. Nunca lanza: que la limpieza falle no puede impedir que
 * el servidor levante — una base llena de telemetría vieja sigue funcionando, un
 * servicio que no arranca no.
 *
 * Va con un pequeño retraso para no competir con la ráfaga de conexiones del
 * arranque, y se puede desactivar del todo con RETENTION_ON_BOOT=false.
 */
export function scheduleRetentionOnBoot(delayMs = 30_000): void {
  if (process.env.RETENTION_ON_BOOT === 'false') {
    console.log('🧹 Limpieza por antigüedad desactivada (RETENTION_ON_BOOT=false)')
    return
  }

  const t = setTimeout(async () => {
    try {
      const r = await runRetention(false)
      if (r.skipped) {
        console.log(`🧹 Limpieza omitida (${r.skipped}).`)
      } else {
        console.log(
          `🧹 Limpieza hecha: ${r.telemetry ?? 0} filas de telemetría, ` +
            `${r.events ?? 0} eventos, ${r.conversations ?? 0} mensajes, ` +
            `${r.ai_usage ?? 0} registros de consumo de IA.`
        )
      }
    } catch (err) {
      console.error(
        '⚠️ No se pudo correr la limpieza por antigüedad:',
        err instanceof Error ? err.message : err
      )
    }
  }, delayMs)

  // unref: este temporizador no debe mantener vivo el proceso si todo lo demás
  // ya terminó (por ejemplo en un contenedor que se está apagando).
  t.unref?.()
}
