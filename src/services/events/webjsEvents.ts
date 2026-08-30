/**
 * =============================================================================
 *  ENGANCHES DE LA VÍA whatsapp-web.js
 * =============================================================================
 *
 *  Aquí viven los eventos que NO se pueden producir desde un trigger, con el
 *  motivo de cada uno:
 *
 *  · message.received — app."Unsyncedcontact" hace UPSERT (messages.controller.ts:618),
 *    así que la base ve "una fila cambió" pero no ve el mensaje ni su dirección.
 *    Además la clave de idempotencia natural, msg.id._serialized, solo existe
 *    aquí — es la MISMA que ya usa el control de duplicados en memoria de
 *    messages.controller.ts:463, así que un mensaje reprocesado no duplica nada.
 *
 *  · contact.replied — no se puede calcular desde la base: Unsyncedcontact no
 *    guarda la dirección de los mensajes. Se calcula aquí, donde
 *    chat.fetchMessages ya está en curso y `m.fromMe` está a la vista.
 *
 *  · conversation.handoff_requested / usage.limit_reached — son decisiones del
 *    controlador, no cambios de fila.
 *
 *  Todo lo de este archivo es fire and forget: si algo falla emitiendo, el
 *  mensaje del lead se sigue procesando igual.
 */

import type { Chat, Message } from 'whatsapp-web.js'
import { query } from '../../lib/db.js'
import { enmascararTelefono, recortarPreview } from './catalog.js'
import { emitirEvento } from './emitter.js'

interface Linea {
  userId: number
  linea: { id: number; label: string; channel: string; phone_masked: string | null }
}

const cacheLinea = new Map<string, { valor: Linea | null; hasta: number }>()
const TTL_CACHE_MS = 60_000

/**
 * Dueño y etiqueta de la línea. Con caché de 60 s porque esto se consulta en
 * CADA mensaje entrante y la fila casi nunca cambia; sin caché, un pico de
 * tráfico añade una consulta por mensaje al camino crítico.
 */
async function lineaDe(numberId: string | number): Promise<Linea | null> {
  const clave = String(numberId)
  const guardado = cacheLinea.get(clave)
  if (guardado && guardado.hasta > Date.now()) return guardado.valor

  let valor: Linea | null = null
  try {
    const res = await query<{ id: number; userId: number; name: string | null; number: string | null }>(
      `SELECT id, "userId", name, number FROM app."WhatsAppNumber" WHERE id = $1`,
      [numberId]
    )
    const fila = res.rows[0]
    if (fila) {
      valor = {
        userId: fila.userId,
        linea: {
          id: fila.id,
          label: (fila.name || '').trim() || fila.number || `Línea ${fila.id}`,
          channel: 'whatsapp_web',
          phone_masked: enmascararTelefono(fila.number)
        }
      }
    }
  } catch (error) {
    console.error(
      '❌ No se pudo resolver la línea para el evento:',
      error instanceof Error ? error.message : error
    )
    return null // sin cachear: que el siguiente mensaje lo vuelva a intentar
  }

  cacheLinea.set(clave, { valor, hasta: Date.now() + TTL_CACHE_MS })
  return valor
}

function telefonoDe(waId: string): string {
  return (waId.split('@')[0] ?? waId).replace(/^\+/, '')
}

/**
 * El nombre que WhatsApp adjunta al mensaje (`notifyName`). No está en los tipos
 * de whatsapp-web.js pero sí en la carga cruda, de ahí el acceso guardado. Si no
 * viene, va null: en esta vía el sistema NO tiene otro nombre del contacto —
 * app."Unsyncedcontact" guarda el número como nombre por defecto
 * (messages.controller.ts:611), y devolver eso como si fuera un nombre sería
 * inventar un dato.
 */
function nombreDe(msg: Message): string | null {
  const bruto = (msg as unknown as { _data?: { notifyName?: unknown } })._data?.notifyName
  return typeof bruto === 'string' && bruto.trim() !== '' ? bruto.trim() : null
}

/**
 * Emite message.received y, si corresponde, contact.replied.
 *
 * `historial` son los mensajes que el controlador ya trajo con
 * chat.fetchMessages({limit:30}). No se vuelve a pedir: esa llamada es cara y ya
 * está hecha unas líneas más arriba.
 */
export async function emitirMensajeEntrante(
  msg: Message,
  chat: Chat,
  numberId: string | number,
  historial: Message[]
): Promise<void> {
  const linea = await lineaDe(numberId)
  if (!linea) return

  const esGrupo = chat.id.server === 'g.us'
  const waId = (msg.from || '').trim().toLowerCase()
  const contacto = {
    phone: telefonoDe(waId),
    wa_id: waId,
    name: nombreDe(msg),
    is_group: esGrupo,
    group_id: esGrupo ? chat.id._serialized : null
  }

  const enviadoEn = new Date(msg.timestamp * 1000).toISOString()

  emitirEvento(
    'message.received',
    {
      message_id: msg.id._serialized,
      channel: 'whatsapp_web',
      line: linea.linea,
      contact: contacto,
      direction: 'inbound',
      has_media: Boolean(msg.hasMedia),
      preview: recortarPreview(msg.body),
      body: msg.body ?? null,
      sent_at: enviadoEn
    },
    linea.userId,
    // La misma clave que el dedupe en memoria del controlador: si el mensaje se
    // reprocesa tras un reinicio, el evento no se duplica.
    { dedupeKey: msg.id._serialized, occurredAt: enviadoEn }
  )

  // contact.replied SOLO en conversación uno a uno: en un grupo, que alguien
  // escriba después de un mensaje del bot no significa que "te contestó".
  if (esGrupo) return

  // La condición exacta: existe un mensaje NUESTRO anterior a este. Sin eso, el
  // lead escribió, no contestó — y son dos hechos distintos.
  let ultimoNuestro: Message | null = null
  for (const m of historial) {
    if (!m.fromMe) continue
    if (m.timestamp >= msg.timestamp) continue
    if (!ultimoNuestro || m.timestamp > ultimoNuestro.timestamp) ultimoNuestro = m
  }
  if (!ultimoNuestro) return

  emitirEvento(
    'contact.replied',
    {
      contact: contacto,
      line: linea.linea,
      message: {
        id: msg.id._serialized,
        preview: recortarPreview(msg.body),
        body: msg.body ?? null,
        sent_at: enviadoEn
      },
      replied_to: {
        sent_at: new Date(ultimoNuestro.timestamp * 1000).toISOString(),
        sender: 'bot'
      },
      // Lo que hace útil el aviso: "contestó a los 3 días" no es lo mismo que
      // "contestó a los 40 segundos".
      silence_seconds: Math.max(0, msg.timestamp - ultimoNuestro.timestamp)
    },
    linea.userId,
    { dedupeKey: `replied:${msg.id._serialized}`, occurredAt: enviadoEn }
  )
}

/**
 * La IA pidió un asesor humano. Es el mismo momento en el que
 * messages.controller.ts manda hoy un correo a `advisorEmail`: un destino fijo,
 * sin registro y sin reintentos. Ahora además nace el evento, que sí tiene las
 * dos cosas y va a los destinos que el cliente configuró.
 */
export async function emitirEscalamiento(opciones: {
  numberId: string | number
  msg: Message
  chat: Chat
  agente: { id: number | string; title: string }
  ultimos: Message[]
}): Promise<void> {
  const linea = await lineaDe(opciones.numberId)
  if (!linea) return

  const waId = (opciones.msg.from || '').trim().toLowerCase()

  emitirEvento(
    'conversation.handoff_requested',
    {
      contact: {
        phone: telefonoDe(waId),
        wa_id: waId,
        name: nombreDe(opciones.msg)
      },
      line: linea.linea,
      agent: { id: opciones.agente.id, title: opciones.agente.title },
      trigger_message: {
        preview: recortarPreview(opciones.msg.body),
        body: opciones.msg.body ?? null
      },
      recent_messages: opciones.ultimos.slice(-5).map((m) => ({
        sender: m.fromMe ? 'bot' : 'user',
        preview: recortarPreview(m.body),
        body: m.body ?? null,
        sent_at: new Date(m.timestamp * 1000).toISOString()
      })),
      requested_at: new Date().toISOString()
    },
    linea.userId,
    { dedupeKey: `handoff:${opciones.msg.id._serialized}` }
  )
}

/**
 * Se agotó el cupo mensual del plan.
 *
 * La clave de dedupe es el periodo, así que sale UNA vez al mes por cuenta por
 * más veces que se toque el tope — igual que el control diario en memoria de
 * messages.controller.ts:135-139, pero sin perderse en un redespliegue.
 */
export async function emitirTopeAlcanzado(userId: number): Promise<void> {
  try {
    const res = await query<{
      current_usage: number
      message_limit: number
      plan: string
    }>('SELECT * FROM app.get_user_message_usage($1)', [userId])
    const uso = res.rows[0]
    if (!uso) return

    const ahora = new Date()
    const year = ahora.getUTCFullYear()
    const month = ahora.getUTCMonth() + 1

    emitirEvento(
      'usage.limit_reached',
      {
        plan: uso.plan,
        used: Number(uso.current_usage),
        limit: Number(uso.message_limit),
        period: { year, month },
        reached_at: ahora.toISOString()
      },
      userId,
      { dedupeKey: `${year}-${String(month).padStart(2, '0')}` }
    )
  } catch (error) {
    console.error(
      '❌ No se pudo emitir usage.limit_reached:',
      error instanceof Error ? error.message : error
    )
  }
}
