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

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ schema.sql aplicado')
} catch (err) {
  console.error('❌ Error aplicando schema.sql:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
