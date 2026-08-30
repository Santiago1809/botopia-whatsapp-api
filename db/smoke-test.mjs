#!/usr/bin/env node
/**
 * SMOKE TEST del adaptador contra un Postgres real.
 *
 * Hace insert / select / update / delete por CADA tabla del esquema `app`
 * pasando por el adaptador (no por SQL directo), ejercita las 3 funciones RPC,
 * el upsert con onConflict, la semántica PGRST116 de .single() y las guardas
 * del adaptador (mutación sin filtro, método no soportado).
 *
 * Requiere: db/schema.sql ya aplicado y `npm run build` hecho (lee de out/).
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node db/smoke-test.mjs
 *
 * Todo lo que crea lo borra al final; usa un sufijo aleatorio para no chocar
 * con datos reales. Aun así: correrlo contra una base de PRUEBA, no producción.
 */
import { supabase } from '../out/src/lib/supabase-adapter.js'
import { pool } from '../out/src/lib/db.js'

const TAG = `smoke_${Math.random().toString(36).slice(2, 8)}`
let passed = 0
let failed = 0

function ok(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

function section(title) {
  console.log(`\n▸ ${title}`)
}

const created = { userId: null, numberId: null, agentId: null }

async function run() {
  // ---------------------------------------------------------------- User ----
  section('app."User"')
  {
    const { data: user, error } = await supabase
      .from('User')
      .insert({
        username: `${TAG}_user`,
        password: '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfake',
        email: `${TAG}@example.test`,
        phoneNumber: `+99${Date.now().toString().slice(-9)}`,
        countryCode: 'CO',
        role: 'user'
      })
      .select()
      .single()
    ok('INSERT + RETURNING', !error && user?.id > 0, error?.message)
    created.userId = user?.id

    const { data: found } = await supabase
      .from('User')
      .select('id, username, email, subscription, active')
      .eq('id', created.userId)
      .single()
    ok('SELECT columnas explícitas + .single()', found?.username === `${TAG}_user`)
    ok('DEFAULT subscription = FREE', found?.subscription === 'FREE')
    ok('DEFAULT active = true', found?.active === true)

    const { error: upErr } = await supabase
      .from('User')
      .update({ tokensPerResponse: 500, subscription: 'PRO' })
      .eq('id', created.userId)
    ok('UPDATE con filtro', !upErr, upErr?.message)

    const { data: after } = await supabase
      .from('User')
      .select('tokensPerResponse, subscription')
      .eq('id', created.userId)
      .single()
    ok('UPDATE se persistió', after?.tokensPerResponse === 500 && after?.subscription === 'PRO')

    const { data: none, error: noneErr } = await supabase
      .from('User')
      .select('*')
      .eq('username', 'no-existe-jamas')
      .single()
    ok('.single() sin filas -> PGRST116', none === null && noneErr?.code === 'PGRST116')
  }

  // ------------------------------------------------------ WhatsAppNumber ----
  section('app."WhatsAppNumber"')
  {
    const { data: num, error } = await supabase
      .from('WhatsAppNumber')
      .insert({ number: `${TAG}_573001112233`, name: 'Línea smoke', userId: created.userId })
      .select('*')
      .single()
    ok('INSERT con FK userId', !error && num?.id > 0, error?.message)
    created.numberId = num?.id
    ok('DEFAULT aiEnabled = false', num?.aiEnabled === false)

    await supabase.from('WhatsAppNumber').update({ aiEnabled: true, aiPrompt: 'hola' }).eq('id', created.numberId)
    const { data: list } = await supabase.from('WhatsAppNumber').select('*').eq('userId', created.userId)
    ok('SELECT lista por userId devuelve array', Array.isArray(list) && list.length === 1)
    ok('UPDATE de banderas de IA', list?.[0]?.aiEnabled === true && list?.[0]?.aiPrompt === 'hola')
  }

  // --------------------------------------------------------------- Agent ----
  section('app."Agent"')
  {
    const { error } = await supabase.from('Agent').insert({
      title: `${TAG}_agente`,
      prompt: 'eres un asesor',
      ownerId: created.userId,
      isGlobal: false,
      allowAdvisor: true,
      advisorEmail: 'asesor@example.test'
    })
    ok('INSERT sin .select() -> data null, sin error', !error, error?.message)

    // Reemplazo del .or('isGlobal.eq.true,ownerId.eq.N') que se reescribió a SQL.
    const { rows } = await pool.query(
      'SELECT * FROM app."Agent" WHERE "isGlobal" = true OR "ownerId" = $1',
      [created.userId]
    )
    ok('OR reescrito a SQL encuentra el agente', rows.length >= 1)
    created.agentId = rows.find((r) => r.title === `${TAG}_agente`)?.id

    const { data: byId } = await supabase
      .from('Agent')
      .select('id, title, advisorEmail, allowAdvisor, ownerId')
      .eq('id', created.agentId)
      .single()
    ok('SELECT agente por id', byId?.advisorEmail === 'asesor@example.test')

    const { data: ordered } = await supabase
      .from('Agent')
      .select('*')
      .eq('ownerId', created.userId)
      .eq('isGlobal', false)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    ok('.order().limit(1).single()', ordered?.id === created.agentId)
  }

  // ------------------------------------------------ SyncedContactOrGroup ----
  section('app."SyncedContactOrGroup"')
  {
    const { error } = await supabase.from('SyncedContactOrGroup').insert([
      { numberId: created.numberId, type: 'contact', wa_id: `${TAG}_1@c.us`, name: 'Ana', agenteHabilitado: true },
      { numberId: created.numberId, type: 'group', wa_id: `${TAG}_2@g.us`, name: 'Grupo', agenteHabilitado: true }
    ])
    ok('INSERT en lote', !error, error?.message)

    const { data: one } = await supabase
      .from('SyncedContactOrGroup')
      .select('agenteHabilitado')
      .eq('numberId', created.numberId)
      .eq('wa_id', `${TAG}_1@c.us`)
      .eq('type', 'contact')
      .single()
    ok('SELECT por (numberId, wa_id, type) .single()', one?.agenteHabilitado === true)

    const { data: all } = await supabase
      .from('SyncedContactOrGroup')
      .select('*')
      .eq('numberId', created.numberId)
    const ids = all.map((r) => r.id)
    const { error: bulkErr } = await supabase
      .from('SyncedContactOrGroup')
      .update({ agenteHabilitado: false })
      .in('id', ids)
    ok('UPDATE con .in(ids)', !bulkErr, bulkErr?.message)

    const { data: afterBulk } = await supabase
      .from('SyncedContactOrGroup')
      .select('agenteHabilitado')
      .eq('numberId', created.numberId)
    ok('el .in() afectó las 2 filas', afterBulk.every((r) => r.agenteHabilitado === false))

    // RPC 1
    const { error: rpcErr } = await supabase.rpc('delete_contacts_by_numberid', {
      p_numberid: created.numberId
    })
    ok('rpc delete_contacts_by_numberid', !rpcErr, rpcErr?.message)
    const { data: gone } = await supabase
      .from('SyncedContactOrGroup')
      .select('*')
      .eq('numberId', created.numberId)
    ok('la RPC dejó la tabla vacía para ese número', gone.length === 0)
  }

  // ----------------------------------------------------- Unsyncedcontact ----
  section('app."Unsyncedcontact"')
  {
    const base = {
      numberid: created.numberId,
      wa_id: `${TAG}_desconocido@c.us`,
      number: '573009998877',
      name: '573009998877',
      agentehabilitado: true,
      lastmessagetimestamp: Date.now(),
      lastmessagepreview: 'hola, quiero info'
    }
    const { error: e1 } = await supabase
      .from('Unsyncedcontact')
      .upsert([base], { onConflict: 'numberid,wa_id', ignoreDuplicates: false })
    ok('UPSERT (inserta)', !e1, e1?.message)

    const { error: e2 } = await supabase
      .from('Unsyncedcontact')
      .upsert([{ ...base, lastmessagepreview: 'segundo mensaje', lastmessagetimestamp: Date.now() + 1 }],
        { onConflict: 'numberid,wa_id', ignoreDuplicates: false })
    ok('UPSERT (actualiza en conflicto)', !e2, e2?.message)

    const { data: rows } = await supabase
      .from('Unsyncedcontact')
      .select('*')
      .eq('numberid', created.numberId)
    ok('el upsert NO duplicó la fila', rows.length === 1)
    ok('el upsert actualizó el preview', rows[0]?.lastmessagepreview === 'segundo mensaje')
    ok('lastmessagetimestamp vuelve como número (bigint)', typeof rows[0]?.lastmessagetimestamp === 'number')

    const { error: updErr } = await supabase
      .from('Unsyncedcontact')
      .update({ agentehabilitado: false })
      .eq('id', rows[0].id)
    ok('UPDATE por id', !updErr, updErr?.message)

    const { error: delErr } = await supabase
      .from('Unsyncedcontact')
      .delete()
      .eq('numberid', created.numberId)
      .eq('wa_id', `${TAG}_desconocido@c.us`)
    ok('DELETE con dos filtros', !delErr, delErr?.message)
    const { data: left } = await supabase
      .from('Unsyncedcontact')
      .select('*')
      .eq('numberid', created.numberId)
    ok('el DELETE borró la fila', left.length === 0)
  }

  // ----------------------------------------------------------- Telemetry ----
  section('app."Telemetry"')
  {
    const { error } = await supabase.from('Telemetry').insert({
      city: `${TAG}`,
      country: 'Colombia',
      ip: '10.0.0.1',
      cpuUsageMs: 12.5,
      networkEgressKB: 3.25,
      ramUsageMB: 128.75,
      timeStamp: new Date()
    })
    ok('INSERT con timeStamp explícito', !error, error?.message)

    // session.controller.ts inserta SIN timeStamp: depende del DEFAULT now().
    const { error: e2 } = await supabase.from('Telemetry').insert({
      city: `${TAG}`,
      country: 'Colombia',
      ip: '10.0.0.2',
      cpuUsageMs: 1,
      networkEgressKB: 1,
      ramUsageMB: 1
    })
    ok('INSERT sin timeStamp (DEFAULT now())', !e2, e2?.message)

    const from = new Date(Date.now() - 60_000)
    const to = new Date(Date.now() + 60_000)
    const { data: recs } = await supabase
      .from('Telemetry')
      .select('*')
      .gte('timeStamp', from)
      .lte('timeStamp', to)
    ok('SELECT con .gte()/.lte() sobre timestamptz', Array.isArray(recs) && recs.length >= 2)
    // Con PostgREST esto llegaba como string y stats.controller.ts:85 hacía
    // .toISOString() sobre un string -> TypeError. Con pg vuelve como Date.
    ok('timeStamp vuelve como Date (arregla stats.controller.ts:85)', recs[0]?.timeStamp instanceof Date)

    // RPC 2
    const { data: summary, error: rpcErr } = await supabase.rpc('telemetry_summary', {
      start_date: from,
      end_date: to
    })
    ok('rpc telemetry_summary responde', !rpcErr, rpcErr?.message)
    ok('forma _sum/_count intacta (fósil de Prisma)',
      summary && typeof summary._sum === 'object' && typeof summary._count?._all === 'number')
    ok('_sum.ramUsageMB suma bien', Number(summary._sum.ramUsageMB) >= 129.75)

    const { error: upErr } = await supabase
      .from('Telemetry')
      .update({ country: 'Chile' })
      .eq('city', TAG)
    ok('UPDATE por ciudad', !upErr, upErr?.message)

    const { error: delErr } = await supabase.from('Telemetry').delete().eq('city', TAG)
    ok('DELETE por ciudad', !delErr, delErr?.message)
  }

  // ----------------------------------------------------------- PlanLimit ----
  section('app."PlanLimit"')
  {
    const { error } = await supabase
      .from('PlanLimit')
      .insert({ plan_name: `${TAG}_PLAN`, monthly_message_limit: 42 })
    ok('INSERT', !error, error?.message)

    const { data: plan } = await supabase
      .from('PlanLimit')
      .select('monthly_message_limit')
      .eq('plan_name', `${TAG}_PLAN`)
      .single()
    ok('SELECT .single()', plan?.monthly_message_limit === 42)

    await supabase.from('PlanLimit').update({ monthly_message_limit: 43 }).eq('plan_name', `${TAG}_PLAN`)
    const { data: plan2 } = await supabase
      .from('PlanLimit')
      .select('monthly_message_limit')
      .eq('plan_name', `${TAG}_PLAN`)
      .single()
    ok('UPDATE', plan2?.monthly_message_limit === 43)

    const { error: delErr } = await supabase.from('PlanLimit').delete().eq('plan_name', `${TAG}_PLAN`)
    ok('DELETE', !delErr, delErr?.message)

    const { data: seeded } = await supabase.from('PlanLimit').select('*').eq('plan_name', 'PRO').single()
    ok('la semilla del schema.sql dejó el plan PRO', seeded?.monthly_message_limit === 5000)
  }

  // ---------------------------------------------------- UserMessageUsage ----
  section('app."UserMessageUsage"')
  {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const { data: nada, error: nadaErr } = await supabase
      .from('UserMessageUsage')
      .select('*')
      .eq('userid', created.userId)
      .eq('year', year)
      .eq('month', month)
      .single()
    ok('sin uso todavía -> PGRST116 (no es un fallo real)', nada === null && nadaErr?.code === 'PGRST116')

    const { error } = await supabase
      .from('UserMessageUsage')
      .insert({ userid: created.userId, year, month, usedmessages: 1 })
    ok('INSERT primer mensaje del mes', !error, error?.message)

    const { data: usage } = await supabase
      .from('UserMessageUsage')
      .select('*')
      .eq('userid', created.userId)
      .eq('year', year)
      .eq('month', month)
      .single()
    ok('SELECT (userid, year, month) .single()', usage?.usedmessages === 1)

    const { error: upErr } = await supabase
      .from('UserMessageUsage')
      .update({ usedmessages: usage.usedmessages + 1, updatedat: new Date().toISOString() })
      .eq('id', usage.id)
    ok('UPDATE del contador', !upErr, upErr?.message)

    // RPC 3 — la que destapó el bug de message_limit vs msg_limit.
    const { data: stats, error: rpcErr } = await supabase.rpc('get_user_message_usage', {
      p_user_id: created.userId
    })
    ok('rpc get_user_message_usage responde un array', !rpcErr && Array.isArray(stats) && stats.length === 1, rpcErr?.message)
    const s = stats[0]
    ok('current_usage refleja el contador', s.current_usage === 2)
    ok('devuelve message_limit (lo que leen :169 y :303)', s.message_limit === 5000)
    ok('devuelve msg_limit (lo que lee :1170)', s.msg_limit === 5000)
    ok('message_limit === msg_limit', s.message_limit === s.msg_limit)
    ok('devuelve plan', s.plan === 'PRO')

    const { error: delErr } = await supabase.from('UserMessageUsage').delete().eq('id', usage.id)
    ok('DELETE', !delErr, delErr?.message)
  }

  // ------------------------------------------------------- subscriptions ----
  section('app.subscriptions')
  {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .insert([{
        user_id: created.userId,
        email: `${TAG}@example.test`,
        plan_token: `${TAG}tok`,
        external_id: `sub_${created.userId}_${Date.now()}`,
        amount: 49900,
        plan_name: 'Plan PRO',
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single()
    ok('INSERT + RETURNING', !error && sub?.id > 0, error?.message)
    ok('amount vuelve como número, no string', typeof sub?.amount === 'number')

    const { data: pend } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('plan_token', `${TAG}tok`)
      .eq('email', `${TAG}@example.test`)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
    ok('búsqueda del webhook (3 filtros + order + limit)', Array.isArray(pend) && pend.length === 1)

    const { error: upErr } = await supabase
      .from('subscriptions')
      .update({
        status: 'PAID',
        invoice_id: 'inv_1',
        amount_paid: 49900,
        currency: 'COP',
        scheduled_date: '2026-09-28',
        updated_at: new Date().toISOString()
      })
      .eq('id', sub.id)
    ok('UPDATE del webhook', !upErr, upErr?.message)

    const { data: paid } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', created.userId)
      .eq('status', 'PAID')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    ok('.limit(1).single() de la última pagada', paid?.invoice_id === 'inv_1')

    const { error: delErr } = await supabase.from('subscriptions').delete().eq('id', sub.id)
    ok('DELETE', !delErr, delErr?.message)
  }

  // ------------------------------------------------- guardas del adaptador --
  section('Guardas del adaptador')
  {
    // El caso admin.controller.ts:207: un UPDATE sin filtro habría reescrito la
    // contraseña de TODOS los usuarios.
    const { data, error } = await supabase.from('User').update({ password: 'x' })
    ok('UPDATE sin filtro se bloquea', data === null && error?.code === 'ADAPTER_NO_FILTER')

    const del = await supabase.from('WhatsAppNumber').delete()
    ok('DELETE sin filtro se bloquea', del.error?.code === 'ADAPTER_NO_FILTER')

    let threw = null
    try {
      await supabase.from('User').select('*').or('username.eq.a,email.eq.b')
    } catch (e) { threw = e }
    ok('.or() lanza "no soportado"', threw && /no soportado por el adaptador/.test(threw.message))

    threw = null
    try { supabase.from('TablaQueNoExiste') } catch (e) { threw = e }
    ok('tabla desconocida lanza', threw && /no soportado por el adaptador/.test(threw.message))

    threw = null
    try { await supabase.rpc('funcion_inventada', {}) } catch (e) { threw = e }
    ok('rpc desconocida lanza', threw && /no soportado por el adaptador/.test(threw.message))

    threw = null
    try {
      await supabase.from('Agent').select('*, User!inner(email)')
    } catch (e) { threw = e }
    ok('join embebido lanza', threw && /join embebido/.test(threw.message))

    threw = null
    try { supabase.channel('contacts-changes') } catch (e) { threw = e }
    ok('supabase.channel() lanza (el realtime ahora es LISTEN/NOTIFY)', threw !== null)
  }

  // ------------------------------------------------------------ limpieza ----
  section('Limpieza')
  {
    // El ON DELETE CASCADE de User arrastra WhatsAppNumber, Agent y sus hijos.
    const { error } = await supabase.from('User').delete().eq('id', created.userId)
    ok('DELETE del usuario de prueba', !error, error?.message)

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM app."WhatsAppNumber" WHERE "userId" = $1',
      [created.userId]
    )
    ok('el CASCADE limpió los números', rows[0].n === 0)
  }
}

try {
  console.log(`\n=== SMOKE TEST · esquema app · etiqueta ${TAG} ===`)
  await run()
} catch (err) {
  failed++
  console.error('\n💥 Excepción no controlada:', err)
} finally {
  await pool.end()
  console.log(`\n=== ${passed} OK · ${failed} FALLOS ===\n`)
  process.exit(failed === 0 ? 0 : 1)
}
