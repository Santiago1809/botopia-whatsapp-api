// Prueba funcional del carril de eventos contra la base desechable.
import pg from 'pg'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false })
await c.connect()

const q = async (sql, params = []) => (await c.query(sql, params)).rows

// ---- semilla mínima ------------------------------------------------------
const [user] = await q(
  `INSERT INTO app."User" (username, password, email) VALUES ('probador','x','probador@test.local')
   ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email RETURNING id`
)
const [linea] = await q(
  `INSERT INTO crm.lines (number, user_id, "NOMBRE_LINEA", "JWT", "NUMBER_ID")
   VALUES ('573001112233', $1, 'Clínica Norte', 'TOKEN-SUPER-SECRETO', '999888')
   RETURNING id`,
  [user.id]
)
const [numero] = await q(
  `INSERT INTO app."WhatsAppNumber" (number, name, "userId") VALUES ('573009998877','Línea QR',$1)
   ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  [user.id]
)

// ---- suscripciones -------------------------------------------------------
const [endpoint] = await q(
  `INSERT INTO events.webhook_endpoint (account_id, url, label, secret_ciphertext, secret_prefix)
   VALUES ($1,'https://ejemplo.test/hook','Prueba','\\x00'::bytea,'whsec_aaa…') RETURNING id`,
  [user.id]
)
await q(
  `INSERT INTO events.webhook_endpoint_event (endpoint_id, event_type)
   SELECT $1, unnest(ARRAY['message.received','contact.replied','contact.stage_changed','contact.created','line.disconnected'])`,
  [endpoint.id]
)
await q(
  `INSERT INTO events.email_preference (account_id, to_email, event_type)
   VALUES ($1,'dueno@test.local','contact.replied')`,
  [user.id]
)

// ---- hechos --------------------------------------------------------------
const [contacto] = await q(
  `INSERT INTO crm.contacts (phone, name, line_id, funnel_stage, user_id) VALUES ('573005554444','Ana Pérez',$1,'nuevo',$2) RETURNING id`,
  [linea.id, user.id]
)
// bot escribe, luego el lead contesta 3 días después
await q(
  `INSERT INTO crm.conversations (contact_id, line_id, sender, message, "timestamp", user_id)
   VALUES ($1,$2,'bot','Hola, ¿te interesa?', now() - interval '3 days', $3)`,
  [contacto.id, linea.id, user.id]
)
await q(
  `INSERT INTO crm.conversations (contact_id, line_id, sender, message, "timestamp", user_id)
   VALUES ($1,$2,'user','Sí, cuéntame más', now(), $3)`,
  [contacto.id, linea.id, user.id]
)
// movimiento de tarjeta
await q(`UPDATE crm.contacts SET funnel_stage='en-contacto' WHERE id=$1`, [contacto.id])
// IA apagada
await q(`UPDATE crm.contacts SET is_ai_enabled=false WHERE id=$1`, [contacto.id])
// contacto de la vía QR
await q(
  `INSERT INTO app."Unsyncedcontact" (numberid, wa_id, number, name) VALUES ($1,'573007776666@c.us','573007776666','573007776666')`,
  [numero.id]
)
// emisión desde "código"
await q(`SELECT events.emitir('line.disconnected',$1,'{"reason":"service_restart"}'::jsonb,'ln-1')`, [user.id])
await q(`SELECT events.emitir('line.disconnected',$1,'{"reason":"service_restart"}'::jsonb,'ln-1')`, [user.id])

// ---- comprobaciones ------------------------------------------------------
console.log('\n=== EVENTOS PRODUCIDOS ===')
for (const r of await q(
  `SELECT type, account_id, dedupe_key, payload FROM events.event ORDER BY id`
)) {
  const p = r.payload
  const extra =
    r.type === 'contact.replied'
      ? ` silencio=${p.silence_seconds}s`
      : r.type === 'contact.stage_changed'
        ? ` ${p.from_stage} -> ${p.to_stage}`
        : r.type === 'contact.ai_disabled'
          ? ` motivo=${p.reason}`
          : ''
  console.log(` ${r.type.padEnd(24)} cuenta=${r.account_id} dedupe=${r.dedupe_key ?? '-'}${extra}`)
}

console.log('\n=== ENTREGAS CREADAS (fan-out) ===')
for (const r of await q(
  `SELECT e.type, d.channel, d.status FROM events.delivery d JOIN events.event e ON e.id=d.event_id ORDER BY d.id`
)) {
  console.log(` ${r.type.padEnd(24)} ${r.channel.padEnd(8)} ${r.status}`)
}

console.log('\n=== FUGAS DE CREDENCIALES EN LOS PAYLOADS ===')
const fugas = await q(
  `SELECT type FROM events.event
    WHERE payload::text ILIKE '%TOKEN-SUPER-SECRETO%'
       OR payload::text ILIKE '%999888%'`
)
console.log(fugas.length === 0 ? ' ninguna ✅' : ` ¡${fugas.length} FUGAS! ${JSON.stringify(fugas)}`)

console.log('\n=== IDEMPOTENCIA (dedupe ln-1) ===')
const [{ n }] = await q(`SELECT COUNT(*)::int n FROM events.event WHERE dedupe_key='ln-1'`)
console.log(` eventos con la misma clave: ${n} ${n === 1 ? '✅' : '❌'}`)

console.log('\n=== EVENTOS SIN TENANT ===')
console.log(` ${(await q('SELECT * FROM events.evento_sin_dueno')).length}`)

console.log('\n=== BORRADO EN CASCADA DEL USUARIO ===')
await q('DELETE FROM app."User" WHERE id=$1', [user.id])
const [{ ev }] = await q('SELECT COUNT(*)::int ev FROM events.event')
const [{ de }] = await q('SELECT COUNT(*)::int de FROM events.delivery')
const [{ we }] = await q('SELECT COUNT(*)::int we FROM events.webhook_endpoint')
console.log(` eventos=${ev} entregas=${de} endpoints=${we} ${ev === 0 && de === 0 && we === 0 ? '✅' : '❌'}`)

await c.end()
