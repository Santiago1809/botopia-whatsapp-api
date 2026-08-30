/**
 * =============================================================================
 *  PLANTILLAS DE LOS AVISOS POR CORREO
 * =============================================================================
 *
 *  Paleta tomada de botopia-whatsapp/src/app/globals.css (identidad Lumintik):
 *  azul de marca #2563EB, azul noche #0F172A, gris de texto #475569. Fondo claro
 *  y no oscuro: los clientes de correo tratan mucho mejor el fondo claro (Gmail
 *  en modo oscuro invierte colores y revienta las plantillas de fondo oscuro) y
 *  además pesa menos en los filtros de spam.
 *
 *  Regla que atraviesa todo el archivo: NADA de datos inventados. Si un campo no
 *  vino en el payload, no se rellena con un placeholder que parezca un dato — se
 *  escribe "—" o se omite la fila entera.
 */

import { API_VERSION } from './catalog.js'

export interface CorreoRenderizado {
  subject: string
  html: string
  text: string
}

/**
 * Escapa HTML. Obligatorio: el nombre de un contacto y el cuerpo de un mensaje
 * los escribe el lead, y aquí se meten dentro de un documento HTML que va a
 * abrir el cliente. Sin esto, un lead puede inyectar marcado en el correo del
 * cliente (o un enlace que parezca nuestro).
 */
function esc(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "—" y no una cadena vacía: deja claro que el dato no vino, no que está en blanco. */
function oGuion(valor: unknown): string {
  const s = valor === null || valor === undefined ? '' : String(valor).trim()
  return s === '' ? '—' : esc(s)
}

function duracionLegible(segundos: unknown): string {
  const s = Number(segundos)
  if (!Number.isFinite(s) || s < 0) return '—'
  if (s < 60) return `${Math.round(s)} segundos`
  if (s < 3600) return `${Math.round(s / 60)} minutos`
  if (s < 86400) return `${Math.round(s / 3600)} horas`
  return `${Math.round(s / 86400)} días`
}

function fechaLegible(iso: unknown, zona: string): string {
  if (!iso) return '—'
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return d.toLocaleString('es-CO', { timeZone: zona, dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return d.toISOString()
  }
}

function marco(titulo: string, cuerpo: string, pie?: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:24px 12px;background:#F1F5F9;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.12);">
    <tr><td style="background:linear-gradient(100deg,#2040B0 0%,#4070D0 45%,#60A0E0 82%,#8FD8F5 100%);padding:18px 24px;">
      <div style="color:#FFFFFF;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;">Lumintik Agents</div>
      <div style="color:#FFFFFF;font-size:20px;font-weight:700;margin-top:4px;">${esc(titulo)}</div>
    </td></tr>
    <tr><td style="padding:24px;color:#0F172A;font-size:15px;line-height:1.6;">${cuerpo}</td></tr>
    <tr><td style="padding:14px 24px;background:#F8FAFC;border-top:1px solid #E2E8F0;color:#475569;font-size:12px;line-height:1.5;">
      ${pie ? `${pie}<br>` : ''}Este aviso lo configuraste en <b>Conexiones</b>. Puedes apagarlo desde ahí.
    </td></tr>
  </table>
</body></html>`
}

function filas(pares: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;">
    ${pares
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#475569;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(
            k
          )}</td><td style="padding:6px 0;color:#0F172A;font-size:14px;font-weight:600;">${v}</td></tr>`
      )
      .join('')}
  </table>`
}

function cita(texto: string): string {
  return `<div style="margin:12px 0;padding:12px 14px;background:#F8FAFC;border-left:3px solid #2563EB;border-radius:0 6px 6px 0;color:#0F172A;font-size:14px;white-space:pre-wrap;">${esc(
    texto
  )}</div>`
}

type Payload = Record<string, unknown>

function obj(v: unknown): Payload {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : {}
}

/**
 * Devuelve el correo listo para un evento, o null si ese tipo no tiene aviso por
 * correo (por ejemplo message.received: avisar de cada mensaje entrante por
 * correo sería una máquina de spam contra el propio cliente).
 */
export function plantillaDeEvento(
  tipo: string,
  payload: Payload,
  zona: string
): CorreoRenderizado | null {
  const contacto = obj(payload.contact)
  const linea = obj(payload.line)
  const nombreContacto = String(contacto.name ?? '').trim() || String(contacto.phone ?? '').trim()

  switch (tipo) {
    case 'contact.replied': {
      const mensaje = obj(payload.message)
      const previo = obj(payload.replied_to)
      const cuerpo = String(mensaje.body ?? mensaje.preview ?? '')
      const asunto = `Te contestó ${nombreContacto || 'un contacto'}`
      const html = marco(
        asunto,
        `<p style="margin:0 0 4px;">Respondió después de <b>${duracionLegible(
          payload.silence_seconds
        )}</b> de silencio.</p>
        ${filas([
          ['Contacto', oGuion(contacto.name)],
          ['Teléfono', oGuion(contacto.phone)],
          ['Línea', oGuion(linea.label)],
          ['Etapa', oGuion(contacto.funnel_stage)],
          ['Le escribimos', fechaLegible(previo.sent_at, zona)],
          ['Contestó', fechaLegible(mensaje.sent_at, zona)]
        ])}
        ${cuerpo ? cita(cuerpo) : '<p style="margin:0;color:#475569;">El mensaje no traía texto.</p>'}`
      )
      const text = `${asunto}\nContacto: ${contacto.name ?? '—'}\nTeléfono: ${
        contacto.phone ?? '—'
      }\nSilencio previo: ${duracionLegible(payload.silence_seconds)}\n\n${cuerpo}`
      return { subject: asunto, html, text }
    }

    case 'contact.created': {
      const asunto = `Contacto nuevo: ${nombreContacto || 'sin nombre'}`
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">Alguien escribió por primera vez.</p>
          ${filas([
            ['Nombre', oGuion(contacto.name)],
            ['Teléfono', oGuion(contacto.phone)],
            ['Línea', oGuion(linea.label)],
            ['Origen', oGuion(payload.source)]
          ])}`
        ),
        text: `${asunto}\nTeléfono: ${contacto.phone ?? '—'}\nLínea: ${linea.label ?? '—'}`
      }
    }

    case 'contact.stage_changed': {
      const asunto = `${nombreContacto || 'Un contacto'} pasó a "${String(payload.to_stage ?? '')}"`
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">La tarjeta se movió en el embudo.</p>
          ${filas([
            ['Contacto', oGuion(contacto.name)],
            ['Teléfono', oGuion(contacto.phone)],
            ['Etapa anterior', oGuion(payload.from_stage)],
            ['Etapa nueva', oGuion(payload.to_stage)],
            ['Línea', oGuion(linea.label)],
            ['Cuándo', fechaLegible(payload.changed_at, zona)]
          ])}`
        ),
        text: `${asunto}\nDe "${payload.from_stage ?? '—'}" a "${payload.to_stage ?? '—'}"`
      }
    }

    case 'contact.ai_disabled': {
      const asunto = `IA apagada para ${nombreContacto || 'un contacto'}`
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">Ese contacto ya no recibe respuestas automáticas: a partir de ahora le responde una persona.</p>
          ${filas([
            ['Contacto', oGuion(contacto.name)],
            ['Teléfono', oGuion(contacto.phone)],
            ['Línea', oGuion(linea.label)],
            ['Motivo', oGuion(payload.reason)],
            ['Cuándo', fechaLegible(payload.disabled_at, zona)]
          ])}`
        ),
        text: `${asunto}\nMotivo: ${payload.reason ?? '—'}`
      }
    }

    case 'conversation.handoff_requested': {
      const agente = obj(payload.agent)
      const disparador = obj(payload.trigger_message)
      const recientes = Array.isArray(payload.recent_messages) ? payload.recent_messages : []
      const asunto = `Piden un asesor: ${nombreContacto || 'contacto sin nombre'}`
      const hilo = recientes
        .map((m) => {
          const mm = obj(m)
          const quien = String(mm.sender ?? '') === 'user' ? 'Cliente' : 'Bot'
          return `<tr><td style="padding:4px 10px 4px 0;color:#475569;font-size:12px;vertical-align:top;white-space:nowrap;">${quien}</td><td style="padding:4px 0;color:#0F172A;font-size:13px;">${esc(
            String(mm.body ?? mm.preview ?? '')
          )}</td></tr>`
        })
        .join('')
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">La IA escaló la conversación a una persona.</p>
          ${filas([
            ['Contacto', oGuion(contacto.name)],
            ['Teléfono', oGuion(contacto.phone)],
            ['Línea', oGuion(linea.label)],
            ['Agente', oGuion(agente.title)],
            ['Cuándo', fechaLegible(payload.requested_at, zona)]
          ])}
          ${cita(String(disparador.body ?? disparador.preview ?? ''))}
          ${
            hilo
              ? `<p style="margin:16px 0 4px;color:#475569;font-size:13px;font-weight:600;">Últimos mensajes</p><table role="presentation" width="100%" style="border-collapse:collapse;">${hilo}</table>`
              : ''
          }`
        ),
        text: `${asunto}\nTeléfono: ${contacto.phone ?? '—'}\nAgente: ${agente.title ?? '—'}`
      }
    }

    case 'line.connected': {
      const asunto = `Línea conectada: ${String(linea.label ?? payload.line_id ?? '')}`
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">La línea volvió a estar operativa.</p>
          ${filas([
            ['Línea', oGuion(linea.label)],
            ['Canal', oGuion(linea.channel)],
            ['Número', oGuion(linea.phone_masked)],
            ['Motivo', oGuion(payload.reason)],
            ['Cuándo', fechaLegible(payload.connected_at, zona)]
          ])}`
        ),
        text: `${asunto}\nMotivo: ${payload.reason ?? '—'}`
      }
    }

    case 'line.disconnected': {
      const asunto = `⚠️ Línea caída: ${String(linea.label ?? payload.line_id ?? '')}`
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">Esa línea dejó de estar operativa. Mientras siga así, sus mensajes no entran ni salen.</p>
          ${filas([
            ['Línea', oGuion(linea.label)],
            ['Canal', oGuion(linea.channel)],
            ['Número', oGuion(linea.phone_masked)],
            ['Motivo', oGuion(payload.reason)],
            ['Cuándo', fechaLegible(payload.disconnected_at, zona)]
          ])}`
        ),
        text: `${asunto}\nMotivo: ${payload.reason ?? '—'}`
      }
    }

    case 'usage.limit_reached': {
      const periodo = obj(payload.period)
      const asunto = 'Alcanzaste el tope mensual de mensajes'
      return {
        subject: asunto,
        html: marco(
          asunto,
          `<p style="margin:0 0 4px;">La cuenta agotó el cupo de su plan. Hasta que se renueve o se amplíe, los mensajes no se envían.</p>
          ${filas([
            ['Plan', oGuion(payload.plan)],
            ['Usados', oGuion(payload.used)],
            ['Tope', oGuion(payload.limit)],
            ['Periodo', `${oGuion(periodo.month)}/${oGuion(periodo.year)}`]
          ])}`
        ),
        text: `${asunto}\nPlan: ${payload.plan ?? '—'} · ${payload.used ?? '—'}/${payload.limit ?? '—'}`
      }
    }

    case 'daily.summary':
      return resumenDiario(payload, zona)

    default:
      // message.received, message.sent, contact.deleted y line.qr_pending no
      // tienen aviso por correo: uno por mensaje sería spam contra el propio
      // cliente, y para eso están los webhooks.
      return null
  }
}

function resumenDiario(payload: Payload, zona: string): CorreoRenderizado {
  const totales = obj(payload.totales)
  const fecha = String(payload.date ?? '')
  const asunto = `Resumen del ${fecha}`

  const tarjeta = (etiqueta: string, valor: unknown) =>
    `<td style="padding:10px 8px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#2563EB;">${esc(String(valor ?? 0))}</div>
      <div style="font-size:11px;color:#475569;margin-top:2px;">${esc(etiqueta)}</div>
    </td><td style="width:8px;"></td>`

  const lineasCaidas = Array.isArray(payload.lines_down) ? payload.lines_down : []
  const respondieron = Array.isArray(payload.replied) ? payload.replied : []

  const bloqueLineas = lineasCaidas.length
    ? `<p style="margin:20px 0 6px;color:#0F172A;font-size:14px;font-weight:700;">Líneas que se cayeron (${lineasCaidas.length})</p>
       <table role="presentation" width="100%" style="border-collapse:collapse;">${lineasCaidas
         .map((l) => {
           const ll = obj(l)
           return `<tr><td style="padding:5px 10px 5px 0;color:#0F172A;font-size:13px;">${oGuion(
             ll.label
           )}</td><td style="padding:5px 0;color:#475569;font-size:12px;">${oGuion(
             ll.reason
           )} · ${fechaLegible(ll.at, zona)}</td></tr>`
         })
         .join('')}</table>`
    : `<p style="margin:20px 0 0;color:#475569;font-size:13px;">Ninguna línea se cayó.</p>`

  const bloqueRespuestas = respondieron.length
    ? `<p style="margin:20px 0 6px;color:#0F172A;font-size:14px;font-weight:700;">Contactos que contestaron (${respondieron.length})</p>
       <table role="presentation" width="100%" style="border-collapse:collapse;">${respondieron
         .map((c) => {
           const cc = obj(c)
           return `<tr><td style="padding:5px 10px 5px 0;color:#0F172A;font-size:13px;white-space:nowrap;">${oGuion(
             cc.name
           )}</td><td style="padding:5px 10px 5px 0;color:#475569;font-size:12px;white-space:nowrap;">${oGuion(
             cc.phone
           )}</td><td style="padding:5px 0;color:#475569;font-size:12px;">${esc(
             String(cc.preview ?? '')
           )}</td></tr>`
         })
         .join('')}</table>`
    : ''

  const html = marco(
    asunto,
    `<table role="presentation" width="100%" style="border-collapse:separate;"><tr>
      ${tarjeta('recibidos', totales.messages_in)}
      ${tarjeta('enviados', totales.messages_out)}
      ${tarjeta('contactos nuevos', totales.new_contacts)}
    </tr><tr><td style="height:8px;"></td></tr><tr>
      ${tarjeta('contestaron', totales.replies)}
      ${tarjeta('escalamientos', totales.handoffs)}
      ${tarjeta('líneas caídas', totales.lines_down)}
    </tr></table>
    ${bloqueLineas}
    ${bloqueRespuestas}`,
    `Ventana: ${fechaLegible(payload.desde, zona)} → ${fechaLegible(payload.hasta, zona)} (${esc(zona)})`
  )

  const text = [
    asunto,
    `Mensajes recibidos: ${totales.messages_in ?? 0}`,
    `Mensajes enviados: ${totales.messages_out ?? 0}`,
    `Contactos nuevos: ${totales.new_contacts ?? 0}`,
    `Contactos que contestaron: ${totales.replies ?? 0}`,
    `Escalamientos a humano: ${totales.handoffs ?? 0}`,
    `Líneas caídas: ${totales.lines_down ?? 0}`
  ].join('\n')

  return { subject: asunto, html, text }
}

/**
 * Aviso al dueño de que le apagamos un endpoint. No es un evento del catálogo:
 * es una carta de la plataforma, y por eso vive aparte.
 */
export function plantillaWebhookDeshabilitado(opciones: {
  url: string
  label?: string | null
  motivo: string
  fallosSeguidos: number
}): CorreoRenderizado {
  const asunto = 'Desactivamos uno de tus webhooks'
  return {
    subject: asunto,
    html: marco(
      asunto,
      `<p style="margin:0 0 4px;">Un destino tuyo falló <b>${opciones.fallosSeguidos}</b> entregas seguidas, así que lo pusimos en pausa para no seguir golpeándolo.</p>
      ${filas([
        ['Destino', oGuion(opciones.label || opciones.url)],
        ['URL', oGuion(opciones.url)],
        ['Motivo', oGuion(opciones.motivo)]
      ])}
      <p style="margin:0;color:#475569;font-size:13px;">Cuando lo arregles, vuelve a activarlo desde <b>Conexiones</b>. Reactivarlo no reenvía lo que se perdió: para eso hay un botón de reenviar en cada entrega.</p>`,
      `Contrato de eventos ${esc(API_VERSION)}`
    ),
    text: `${asunto}\n${opciones.url}\nMotivo: ${opciones.motivo}\nFallos seguidos: ${opciones.fallosSeguidos}`
  }
}
