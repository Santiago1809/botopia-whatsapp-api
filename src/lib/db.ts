import { config } from 'dotenv'
import pg from 'pg'

// El resto del código importa este módulo de forma indirecta (config/db.ts), y
// dotenv puede no haberse cargado todavía cuando eso pasa. config() es idempotente.
config()

const { Pool, Client, types } = pg

// ---------------------------------------------------------------------------
//  Tipos de retorno
//
//  Por defecto, node-postgres devuelve int8 (bigint) como STRING para no perder
//  precisión. Eso rompería Unsyncedcontact.lastmessagetimestamp, que el código
//  trata como número (epoch ms de Date.now()), y los COUNT(*) de las funciones.
//  Los epoch ms caben de sobra en un double, así que convertirlos a number es
//  seguro y conserva el comportamiento que tenía PostgREST (que serializaba a
//  número en el JSON).
// ---------------------------------------------------------------------------
const INT8_OID = 20
types.setTypeParser(INT8_OID, (v: string) => Number(v))

// numeric (OID 1700) también sale como string. subscriptions.amount se compara
// con `!==` contra un número que viene de DLO (subscription.controller.ts:194):
// si queda como string, esa comparación es siempre verdadera y dispara un warning
// falso en cada webhook. Se convierte a number para igualar lo que hacía PostgREST.
const NUMERIC_OID = 1700
types.setTypeParser(NUMERIC_OID, (v: string) => Number(v))

// ---------------------------------------------------------------------------
//  SSL
//
//  Railway expone la misma base por dos hosts:
//    · privado  postgres.railway.internal  -> red interna del proyecto, SIN TLS
//                                             (el servidor ni siquiera lo ofrece:
//                                             forzar ssl da "server does not
//                                             support SSL connections")
//    · público  <algo>.proxy.rlwy.net      -> sale a internet, EXIGE TLS, y el
//                                             certificado es de una CA que Node no
//                                             trae, así que rejectUnauthorized
//                                             tiene que ir en false.
//
//  Por eso la decisión se toma mirando el host, no una variable aparte. Se puede
//  forzar con DATABASE_SSL=disable|require o con ?sslmode=... en la propia URL.
// ---------------------------------------------------------------------------
export function resolveSsl(
  connectionString: string
): false | { rejectUnauthorized: boolean } {
  const forced = (process.env.DATABASE_SSL || '').toLowerCase()
  if (forced === 'disable' || forced === 'false' || forced === 'off') return false
  if (forced === 'require' || forced === 'true' || forced === 'on') {
    return { rejectUnauthorized: false }
  }

  let host = ''
  let sslmode = ''
  try {
    const u = new URL(connectionString)
    host = u.hostname
    sslmode = (u.searchParams.get('sslmode') || '').toLowerCase()
  } catch {
    // URL inválida: que falle después el driver con un mensaje útil, no aquí.
    return false
  }

  if (sslmode === 'disable') return false
  if (sslmode) return { rejectUnauthorized: false }

  const noTls =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.railway.internal') || // red privada de Railway
    host.endsWith('.internal')

  return noTls ? false : { rejectUnauthorized: false }
}

if (!process.env.DATABASE_URL) {
  console.error(
    '❌ Error: DATABASE_URL debe estar configurada. En Railway: servicio Postgres → pestaña Variables → DATABASE_URL (privada) o DATABASE_PUBLIC_URL (pública).'
  )
  throw new Error('Variable de entorno DATABASE_URL no configurada')
}

const connectionString: string = process.env.DATABASE_URL

export const pool = new Pool({
  connectionString,
  ssl: resolveSsl(connectionString),
  // Railway corta conexiones ociosas; mantener el pool chico y reciclarlo evita
  // los "Connection terminated unexpectedly" del primer request tras un rato.
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
})

// Sin este handler, un error de una conexión ociosa del pool tumba el proceso
// entero (node-postgres emite 'error' en el Pool y un 'error' sin listener es fatal).
pool.on('error', (err) => {
  console.error('❌ Error inesperado en una conexión ociosa del pool:', err.message)
})

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
  rowCount: number
}

/**
 * Escotilla de escape del adaptador: SQL directo, siempre parametrizado.
 * La usan los call sites que PostgREST resolvía con DSL propio (joins embebidos
 * `tabla!inner(...)` y `.or(...)`), que no tienen traducción mecánica.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const res = await pool.query(text, params as never[])
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 }
}

/**
 * Cliente dedicado y permanente, FUERA del pool.
 * Necesario para LISTEN: una conexión del pool se devuelve tras cada query y el
 * LISTEN se perdería. No se usa en este repo (el que escucha es CRM-ms), pero se
 * expone aquí para que la fábrica viva junto al resto de la configuración.
 */
export function createListenClient(): pg.Client {
  return new Client({
    connectionString,
    ssl: resolveSsl(connectionString)
  })
}

export async function closePool(): Promise<void> {
  await pool.end()
}
