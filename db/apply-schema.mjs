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
  // TOPES DE ESPERA antes de tocar el esquema. Sin esto, un `ALTER TABLE ADD COLUMN` que
  // choca con un lock del contenedor VIEJO (que sigue vivo durante el despliegue) se queda
  // esperando PARA SIEMPRE: apply-schema no termina, `index.js` nunca arranca, el healthcheck
  // se agota y Railway marca el deploy como fallido sin un solo log. Con lock_timeout el
  // ALTER bloqueado falla rápido; el `|| echo …` del startCommand cataloga el fallo y el
  // servidor arranca igual (el esquema se aplica en un arranque posterior, con la tabla libre).
  await client.query("SET lock_timeout = '10s'")
  await client.query("SET statement_timeout = '120s'")
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

  // ---------------------------------------------------------------------------
  //  PLAN DE ARRANQUE PARA CUENTAS CONCRETAS
  //
  //  Mismo motivo que ADMIN_EMAILS: el plan solo se puede mover desde la consola de
  //  admin o pagando, y hay cuentas —la del dueño de la plataforma, las de prueba—
  //  que tienen que nacer con el plan bueno sin dar ese rodeo. Sin esto, funciones
  //  enteras quedan invisibles: los grupos, por ejemplo, solo responden en PRO e
  //  INDUSTRIAL, y desde fuera parece que el agente está roto.
  //
  //  Formato: PLAN_POR_CORREO="alguien@dominio.com:INDUSTRIAL,otro@x.com:PRO".
  //  Solo SUBE de plan: nunca degrada a nadie por editar una variable, y la fecha
  //  solo se toca si el plan cambia de verdad.
  // ---------------------------------------------------------------------------
  const planPorCorreo = (process.env.PLAN_POR_CORREO ?? '')
    .split(',')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [correo, plan] = par.split(':').map((x) => (x ?? '').trim())
      return { correo: (correo ?? '').toLowerCase(), plan: (plan ?? '').toUpperCase() }
    })
    .filter((x) => x.correo && x.plan)

  for (const { correo, plan } of planPorCorreo) {
    try {
      const { rows } = await client.query(
        `UPDATE app."User" u
            SET subscription = $2, subscription_updated_at = now(), "updatedAt" = now()
          FROM app."PlanLimit" pl
          WHERE lower(u.email) = $1
            AND pl.plan_name = $2
            AND u.subscription IS DISTINCT FROM $2
          RETURNING u.email, pl.monthly_message_limit`,
        [correo, plan]
      )
      if (rows.length > 0) {
        console.log(
          `✅ plan: ${rows[0].email} -> ${plan} (${rows[0].monthly_message_limit} mensajes/mes)`
        )
      } else {
        console.log(`✅ plan: ${correo} ya estaba en ${plan}, o no tiene cuenta todavía`)
      }
    } catch (e) {
      console.error(`❌ No se pudo poner el plan ${plan} a ${correo}:`, e.message)
    }
  }
} catch (err) {
  console.error('❌ Error aplicando schema.sql:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
