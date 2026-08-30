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

  // ---------------------------------------------------------------------------
  //  ADMIN INICIAL
  //
  //  app."User".role nace SIEMPRE en 'user' y no había forma de promover a nadie:
  //  la consola de admin exige rol admin, así que sin esto queda inalcanzable
  //  para todo el mundo, incluido el dueño de la plataforma. El huevo y la
  //  gallina se rompe desde fuera: ADMIN_EMAILS, separados por coma.
  //
  //  Solo PROMUEVE. Quitar a alguien de admin es una decisión deliberada y se
  //  hace a mano; que borrar un correo de la variable degradara la cuenta en el
  //  siguiente despliegue sería una sorpresa cara.
  // ---------------------------------------------------------------------------
  const correosAdmin = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
  if (correosAdmin.length > 0) {
    const { rows } = await client.query(
      `UPDATE app."User"
          SET role = 'admin', "updatedAt" = now()
        WHERE lower(email) = ANY($1::text[]) AND role <> 'admin'
        RETURNING email`,
      [correosAdmin]
    )
    if (rows.length > 0) {
      console.log(`✅ admin: ${rows.map((r) => r.email).join(', ')}`)
    } else {
      console.log(
        `✅ admin: sin cambios (${correosAdmin.length} correo(s) en ADMIN_EMAILS ya eran admin o no tienen cuenta todavía)`
      )
    }
  }
} catch (err) {
  console.error('❌ Error aplicando schema.sql:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
