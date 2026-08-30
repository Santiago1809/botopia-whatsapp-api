#!/usr/bin/env node
/**
 * Aplica db/schema.sql sobre la base que apunte DATABASE_URL.
 *
 * Existe porque `psql` no siempre está instalado en la máquina de quien despliega,
 * y el driver `pg` ya es una dependencia del proyecto. Es equivalente a:
 *   psql "$DATABASE_URL" -f db/schema.sql
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node db/apply-schema.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(here, 'schema.sql'), 'utf8')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌ Falta DATABASE_URL')
  process.exit(1)
}

// Misma regla de SSL que src/lib/db.ts: el host privado de Railway no habla TLS,
// el público lo exige con un certificado que Node no valida por sí solo.
function resolveSsl(url) {
  try {
    const host = new URL(url).hostname
    const noTls =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.internal')
    return noTls ? false : { rejectUnauthorized: false }
  } catch {
    return false
  }
}

const client = new pg.Client({ connectionString, ssl: resolveSsl(connectionString) })

// El endurecimiento del esquema (FKs, índices únicos) MIRA los datos antes de
// actuar y, cuando no puede aplicar algo, lo dice con RAISE NOTICE en vez de
// reventar. Sin este listener esos avisos se pierden y el despliegue diría "todo
// bien" mientras la mitad de las restricciones quedó sin poner.
//
// Se filtra el ruido de los CREATE ... IF NOT EXISTS ("already exists") y de los
// DROP ... IF EXISTS ("does not exist"): en un arranque normal son decenas y solo
// tapan lo que sí importa leer.
const RUIDO = /(already exists|does not exist), skipping/i
const avisos = []
client.on('notice', (n) => {
  const msg = (n?.message ?? '').trim()
  if (!msg || RUIDO.test(msg)) return
  avisos.push(msg)
  console.warn(`⚠️  ${msg}`)
})

try {
  await client.connect()
  await client.query(sql)
  if (avisos.length === 0) {
    console.log('✅ schema.sql aplicado (sin pendientes)')
  } else {
    console.log(
      `✅ schema.sql aplicado, con ${avisos.length} aviso(s) arriba. ` +
        'Los que hablen de FK o UNIQUE omitidos requieren limpiar datos: ver db/migrations/.'
    )
  }
} catch (err) {
  console.error('❌ Error aplicando schema.sql:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
