// Prueba de punta a punta del worker: firma, reintento, SSRF y correo sin SMTP.
import http from 'node:http'
import { query } from '../out/src/lib/db.js'
import { cifrar } from '../out/src/services/events/secretbox.js'
import { generarSecreto, prefijoDeSecreto, verificar } from '../out/src/services/events/signature.js'
import { iniciarWorkerDeEntregas, detenerWorkerDeEntregas } from '../out/src/services/events/worker.js'

const recibidos = []
let fallosRestantes = 1

const servidor = http.createServer((req, res) => {
  const trozos = []
  req.on('data', (t) => trozos.push(t))
  req.on('end', () => {
    const cuerpo = Buffer.concat(trozos)
    recibidos.push({ ruta: req.url, headers: req.headers, cuerpo })
    if (req.url === '/inestable' && fallosRestantes > 0) {
      fallosRestantes--
      res.writeHead(503).end('no ahora')
      return
    }
    res.writeHead(200).end('ok')
  })
})
await new Promise((r) => servidor.listen(0, r))
const puerto = servidor.address().port
console.log(`receptor de prueba en http://localhost:${puerto}`)

const q = async (sql, params = []) => (await query(sql, params)).rows

await q('DELETE FROM app."User" WHERE username = $1', ['probador-worker'])
const [user] = await q(
  `INSERT INTO app."User" (username, password, email) VALUES ('probador-worker','x','w@test.local') RETURNING id`
)

const secreto = generarSecreto()
const [ok] = await q(
  `INSERT INTO events.webhook_endpoint (account_id, url, label, secret_ciphertext, secret_prefix)
   VALUES ($1,$2,'ok',$3,$4) RETURNING id`,
  [user.id, `http://localhost:${puerto}/ok`, cifrar(secreto), prefijoDeSecreto(secreto)]
)
const [inestable] = await q(
  `INSERT INTO events.webhook_endpoint (account_id, url, label, secret_ciphertext, secret_prefix)
   VALUES ($1,$2,'inestable',$3,$4) RETURNING id`,
  [user.id, `http://localhost:${puerto}/inestable`, cifrar(secreto), prefijoDeSecreto(secreto)]
)
const [privado] = await q(
  `INSERT INTO events.webhook_endpoint (account_id, url, label, secret_ciphertext, secret_prefix)
   VALUES ($1,'https://crm-ms.railway.internal/hook','interno',$2,$3) RETURNING id`,
  [user.id, cifrar(secreto), prefijoDeSecreto(secreto)]
)
for (const e of [ok, inestable, privado]) {
  await q(
    `INSERT INTO events.webhook_endpoint_event (endpoint_id, event_type) VALUES ($1,'line.disconnected')`,
    [e.id]
  )
}
await q(
  `INSERT INTO events.email_preference (account_id, to_email, event_type)
   VALUES ($1,'dueno@test.local','line.disconnected')`,
  [user.id]
)

await q(
  `SELECT events.emitir('line.disconnected',$1,
     '{"line":{"id":7,"label":"Clínica Norte","channel":"whatsapp_web"},"reason":"service_restart","body":"texto sensible"}'::jsonb,
     'prueba-worker')`,
  [user.id]
)

iniciarWorkerDeEntregas()
await new Promise((r) => setTimeout(r, 3500))

console.log('\n=== ESTADO DE LAS ENTREGAS ===')
for (const r of await q(
  `SELECT COALESCE(w.label,'correo') destino, d.channel, d.status, d.attempt_count,
          d.last_status_code, d.last_error_kind, left(d.last_error,90) err
     FROM events.delivery d LEFT JOIN events.webhook_endpoint w ON w.id=d.endpoint_id
    ORDER BY d.id`
)) {
  console.log(
    ` ${String(r.destino).padEnd(10)} ${r.channel.padEnd(8)} ${String(r.status).padEnd(10)} intentos=${r.attempt_count} http=${r.last_status_code ?? '-'} ${r.last_error_kind ?? ''} ${r.err ?? ''}`
  )
}

console.log('\n=== VERIFICACIÓN DE LA FIRMA (lado receptor) ===')
const entrega = recibidos.find((r) => r.ruta === '/ok')
if (!entrega) console.log(' ❌ el receptor no recibió nada')
else {
  const valida = verificar(
    [secreto],
    entrega.headers['x-lumintik-event-id'],
    Number(entrega.headers['x-lumintik-timestamp']),
    entrega.cuerpo,
    entrega.headers['x-lumintik-signature']
  )
  console.log(` firma válida: ${valida ? '✅' : '❌'}`)
  const conOtro = verificar(
    [generarSecreto()],
    entrega.headers['x-lumintik-event-id'],
    Number(entrega.headers['x-lumintik-timestamp']),
    entrega.cuerpo,
    entrega.headers['x-lumintik-signature']
  )
  console.log(` firma con secreto ajeno rechazada: ${conOtro ? '❌' : '✅'}`)
  console.log(` cabeceras: ${Object.keys(entrega.headers).filter((h) => h.startsWith('x-lumintik')).join(', ')}`)
  const sobre = JSON.parse(entrega.cuerpo.toString())
  console.log(` tipo=${sobre.type} api=${sobre.api_version}`)
  console.log(
    ` cuerpo del mensaje omitido (include_message_body=false): ${sobre.data.body === undefined ? '✅' : '❌ ' + sobre.data.body}`
  )
}

console.log('\n=== REINTENTO DEL 503 ===')
const golpes = recibidos.filter((r) => r.ruta === '/inestable').length
console.log(` golpes al destino inestable: ${golpes} (1 fallo + reintento programado)`)
const [{ prox }] = await q(
  `SELECT next_attempt_at > now() prox FROM events.delivery d
    JOIN events.webhook_endpoint w ON w.id=d.endpoint_id WHERE w.label='inestable'`
)
console.log(` reintento programado a futuro: ${prox ? '✅' : '❌'}`)

console.log('\n=== INTENTOS REGISTRADOS ===')
for (const r of await q(
  `SELECT COALESCE(w.label,'correo') destino, a.attempt_number, a.response_status, a.resolved_ip,
          a.error_kind, a.duration_ms
     FROM events.delivery_attempt a
     JOIN events.delivery d ON d.id=a.delivery_id
     LEFT JOIN events.webhook_endpoint w ON w.id=d.endpoint_id ORDER BY a.id`
)) {
  console.log(
    ` ${String(r.destino).padEnd(10)} #${r.attempt_number} http=${r.response_status ?? '-'} ip=${r.resolved_ip ?? '-'} ${r.error_kind ?? ''} ${r.duration_ms}ms`
  )
}

await detenerWorkerDeEntregas()
servidor.close()
await q('DELETE FROM app."User" WHERE id=$1', [user.id])
process.exit(0)
