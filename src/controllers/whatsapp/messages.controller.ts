// image.pngManeja el envío y recepción de mensajes
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import type { Server } from 'socket.io'
// Import de VALOR aparte del de tipos: whatsapp-web.js es CommonJS y en ESM las
// clases solo llegan por el default (mismo patrón que session.controller.ts).
import whatsappWeb from 'whatsapp-web.js'
import type { Chat, Client, Message } from 'whatsapp-web.js'

const { MessageMedia } = whatsappWeb

import { supabase } from '../../config/db.js'
import { traerMensajes } from '../../lib/chatDeRespaldo.js'
import type {
  CustomRequest,
  SendMessageBody
} from '../../interfaces/global.js'
import type { WhatsAppNumber as WhatsAppNumberType } from '../../types/global.js'
import {
  advisorRequestEmailTemplate,
  limitReachedEmailTemplate
} from '../../lib/constants.js'
import { getCurrentUTCDate } from '../../lib/dateUtils.js'
import { getAIResponse } from '../../services/ai.service.js'
import { exigirNumeroPropio } from '../../lib/propiedad.js'
// SQL directo para app."ChatMedia": el adaptador supabase lleva una lista blanca
// de tablas (supabase-adapter.ts) que no es de este módulo; `query` es la vía
// oficial para tablas nuevas (mismo patrón que propiedad.ts).
import { query } from '../../lib/db.js'
import { clasificarErrorIA, registrarUsoIA } from '../../services/aiUsage.js'
import { transporter } from '../../services/email.service.js'
import {
  emitirEscalamiento,
  emitirMensajeEntrante,
  emitirTopeAlcanzado
} from '../../services/events/webjsEvents.js'
import { clienteVivo } from '../../WhatsAppClients.js'

/**
 * Consume un mensaje del cupo mensual del usuario.
 *
 * ESTO ES LO QUE SE COBRA, así que no puede depender de la suerte. La versión
 * anterior hacía cuatro viajes a la base y, entre ellos, tenía dos carreras:
 *
 *   1. leer usedmessages -> decidir -> UPDATE usedmessages = leido + 1
 *      Dos mensajes simultáneos leían el mismo 10 y los dos escribían 11: uno de
 *      los dos se enviaba sin cobrarse.
 *   2. si no había fila del mes, hacía un INSERT pelado. El índice único
 *      (userid, year, month) hacía que el segundo mensaje del primer día del mes
 *      chocara con 23505 y devolviera "Error registrando primer mensaje".
 *
 * Ahora es UNA llamada a app.increment_message_usage, que resuelve el conflicto
 * con ON CONFLICT, bloquea la fila con FOR UPDATE y hace el chequeo del tope y el
 * incremento dentro de la misma operación: no queda ventana entre comprobar y
 * cobrar. Ver db/schema.sql, sección de endurecimiento.
 */
async function incrementMessageUsage(userId: number): Promise<{
  success: boolean
  message?: string
  currentUsage?: number
  limit?: number
  /**
   * `true` cuando el fallo es de infraestructura (la base no respondió) y no una
   * decisión de negocio. El llamador lo necesita para distinguir un 500 de un
   * 400: ahora que esta función es la que DECIDE si se puede enviar, confundir
   * "la base está caída" con "te quedaste sin cupo" le diría al cliente que
   * agotó su plan cuando no es verdad.
   */
  fallaDeInfraestructura?: boolean
}> {
  try {
    const { data, error } = await supabase.rpc('increment_message_usage', {
      p_user_id: userId
    })

    if (error) {
      console.error('Error en increment_message_usage:', error)
      return {
        success: false,
        message: 'Error consultando uso de mensajes',
        fallaDeInfraestructura: true
      }
    }

    const fila = Array.isArray(data) ? data[0] : undefined
    if (!fila) {
      return { success: false, message: 'Usuario no encontrado' }
    }

    const currentUsage = Number(fila.current_usage ?? 0)
    const limit = Number(fila.message_limit ?? 0)

    if (!fila.allowed) {
      // limit 0 significa que el usuario no tiene fila en PlanLimit para su plan.
      // Antes ese caso se confundía con "límite alcanzado"; distinguirlo evita
      // buscar durante media hora por qué "nadie puede enviar nada".
      return {
        success: false,
        message:
          limit === 0
            ? 'El plan del usuario no tiene tope configurado en PlanLimit'
            : 'Límite mensual de mensajes alcanzado',
        currentUsage,
        limit
      }
    }

    return { success: true, currentUsage, limit }
  } catch (error) {
    console.error('Error en incrementMessageUsage:', error)
    return {
      success: false,
      message: 'Error interno del servidor',
      fallaDeInfraestructura: true
    }
  }
}

/**
 * Devuelve al cupo un mensaje que se reservó y NO se llegó a enviar.
 *
 * Existe porque el cupo ahora se reserva antes de mandar el WhatsApp (ver
 * sendMessage): sin esta vuelta atrás, un fallo de la sesión de whatsapp-web.js
 * le costaría al cliente un mensaje que nunca salió.
 *
 * Si la devolución falla, se registra con el id del usuario y el motivo pero NO
 * se propaga: el error que importa contar es el del envío, y enterrar ese detrás
 * de "no se pudo devolver el cupo" hace más difícil entender qué pasó. Un
 * mensaje cobrado de más se corrige mirando el log; uno enviado y no cobrado, no.
 */
async function devolverMessageUsage(
  userId: number,
  motivo: unknown
): Promise<void> {
  try {
    const { error } = await supabase.rpc('refund_message_usage', {
      p_user_id: userId
    })
    if (error) throw error
    console.warn(
      `↩️ Cupo devuelto al usuario ${userId}: el envío falló (${
        motivo instanceof Error ? motivo.message : String(motivo)
      }).`
    )
  } catch (error) {
    console.error(
      `❌ No se pudo devolver el cupo reservado del usuario ${userId} tras un envío fallido. ` +
        'Queda un mensaje cobrado de más este mes:',
      error instanceof Error ? error.message : error
    )
  }
}
// ---------------------------------------------------------------------------
//  MEDIA (adjuntos): envío desde el panel, recepción y vista previa.
// ---------------------------------------------------------------------------

/**
 * ¿Es un id de chat de WhatsApp? Vivía como función local de sendMessage; se iza
 * a módulo para que send-media aplique EXACTAMENTE la misma regla y las dos vías
 * no puedan separarse.
 */
function esWhatsAppIdValido(id: string | undefined): boolean {
  return (
    typeof id === 'string' &&
    (/^[0-9]+@c\.us$/.test(id) || // usuario
      /^[0-9]+(-[0-9]+)?@g\.us$/.test(id)) // grupo (con o sin guion)
  )
}

/**
 * Tipos que el panel puede ENVIAR. Lista cerrada a propósito: un mp4 de 10MB o
 * un .exe disfrazado no tienen por qué pasar por la línea del cliente. audio/mp3
 * no es un MIME estándar pero los navegadores lo producen: se normaliza a mpeg.
 */
const MIME_PERMITIDOS = new Map<string, string>([
  ['image/jpeg', 'image/jpeg'],
  ['image/png', 'image/png'],
  ['image/webp', 'image/webp'],
  ['application/pdf', 'application/pdf'],
  ['audio/ogg', 'audio/ogg'],
  ['audio/mpeg', 'audio/mpeg'],
  ['audio/mp3', 'audio/mpeg']
])

/** 10MB de archivo real (no de base64): tope de envío. */
const TOPE_ADJUNTO_BYTES = 10 * 1024 * 1024
/** Hasta aquí se guarda el base64 como vista previa; más grande, solo metadatos. */
const TOPE_PREVIA_BYTES = 200 * 1024
/** Un downloadMedia colgado no puede frenar el flujo del mensaje. */
const TIEMPO_MAX_DESCARGA_MS = 15000

/** Bytes reales de un base64 (el string pesa 4/3 del archivo). */
function bytesDeBase64(b64: string): number {
  const sinRelleno = b64.replace(/=+$/, '')
  return Math.floor((sinRelleno.length * 3) / 4)
}

/** La forma en que un adjunto viaja al front, pegado a su mensaje del historial. */
export interface MediaDeMensaje {
  mimetype: string
  filename: string | null
  filesize: number | null
  /** Solo presente si el archivo pesa ≤200KB; si no, el front pinta la tarjeta. */
  dataBase64: string | null
}

interface FilaChatMedia {
  wa_msg_id: string | null
  from_me: boolean
  mimetype: string
  filename: string | null
  filesize: number | null
  data_base64: string | null
  msg_timestamp: string | number
}

/**
 * Guarda la vista previa de un adjunto. Nunca lanza: perder la vista previa es
 * un detalle; perder el mensaje (o la respuesta del agente), no.
 * El ON CONFLICT usa el índice parcial chatmedia_msg_key: el reintento de un
 * mismo mensaje no duplica filas.
 */
async function guardarMediaDeChat(fila: {
  numberId: string | number
  chatWaId: string
  waMsgId: string | null
  fromMe: boolean
  media: MediaDeMensaje
  msgTimestampMs: number
}): Promise<void> {
  try {
    await query(
      `INSERT INTO app."ChatMedia"
         (numberid, chat_wa_id, wa_msg_id, from_me, mimetype, filename, filesize, data_base64, msg_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (numberid, wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING`,
      [
        Number(fila.numberId),
        fila.chatWaId,
        fila.waMsgId,
        fila.fromMe,
        fila.media.mimetype,
        fila.media.filename,
        fila.media.filesize,
        fila.media.dataBase64,
        fila.msgTimestampMs
      ]
    )
    // Limpieza oportunista: las vistas previas no son un archivo histórico.
    // Va sin await y sin propagar errores — es mantenimiento, no negocio.
    void query(
      `DELETE FROM app."ChatMedia" WHERE numberid = $1 AND created_at < now() - interval '60 days'`,
      [Number(fila.numberId)]
    ).catch(() => {})
  } catch (e) {
    console.warn(
      `⚠️ No se pudo guardar la vista previa del adjunto (línea ${fila.numberId}, chat ${fila.chatWaId}): ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
}

/** Las vistas previas guardadas de un chat (por sus dos ids, crudo y clásico). */
async function mediaGuardadaDelChat(
  numberId: string | number,
  idsDelChat: string[],
  limite = 60
): Promise<FilaChatMedia[]> {
  try {
    const { rows } = await query<FilaChatMedia>(
      `SELECT wa_msg_id, from_me, mimetype, filename, filesize, data_base64, msg_timestamp
         FROM app."ChatMedia"
        WHERE numberid = $1 AND chat_wa_id = ANY($2::text[])
        ORDER BY msg_timestamp DESC
        LIMIT $3`,
      [Number(numberId), idsDelChat, limite]
    )
    return rows
  } catch (e) {
    console.warn(
      `⚠️ No se pudieron leer las vistas previas del chat ${idsDelChat[0]}: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
    return []
  }
}

/**
 * Pega cada adjunto guardado a su mensaje del historial. La llave es el
 * timestamp en ms + la dirección (fromMe): los items del historial no viajan con
 * su id de WhatsApp, y el timestamp del mensaje es idéntico en ambos lados
 * porque los dos salen de msg.timestamp*1000. La tolerancia de 1,5s cubre el
 * redondeo de relojes al guardar un envío propio con Date.now() de respaldo.
 */
function adjuntarMediaAlHistorial<
  T extends { timestamp: number; fromMe: boolean }
>(chatHistory: T[], filas: FilaChatMedia[]): Array<T & { media?: MediaDeMensaje }> {
  if (!filas.length) return chatHistory
  return chatHistory.map((item) => {
    const fila = filas.find(
      (f) =>
        f.from_me === !!item.fromMe &&
        Math.abs(Number(f.msg_timestamp) - item.timestamp) < 1500
    )
    if (!fila) return item
    return {
      ...item,
      media: {
        mimetype: fila.mimetype,
        filename: fila.filename,
        filesize: fila.filesize == null ? null : Number(fila.filesize),
        dataBase64: fila.data_base64
      }
    }
  })
}

/**
 * Descarga el adjunto de un mensaje entrante SIN poder romper el flujo: timeout
 * duro y todo error degradado a "sin vista previa". Devuelve null si no se pudo.
 */
async function descargarMediaEntrante(
  msg: Message,
  etiqueta: string
): Promise<MediaDeMensaje | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    const media = await Promise.race([
      msg.downloadMedia(),
      new Promise<never>((_, reject) => {
        reloj = setTimeout(
          () => reject(new Error(`timeout de ${TIEMPO_MAX_DESCARGA_MS}ms descargando el adjunto`)),
          TIEMPO_MAX_DESCARGA_MS
        )
      })
    ])
    if (!media || !media.mimetype) return null
    const bytes =
      media.filesize != null ? Number(media.filesize) : bytesDeBase64(media.data ?? '')
    return {
      mimetype: media.mimetype,
      filename: media.filename ?? null,
      filesize: bytes,
      // Vista previa solo si es pequeño: la base guarda burbujas, no archivos.
      dataBase64: media.data && bytes <= TOPE_PREVIA_BYTES ? media.data : null
    }
  } catch (e) {
    console.warn(
      `⚠️ No se pudo descargar el adjunto de ${etiqueta}: ${
        e instanceof Error ? e.message : String(e)
      }. El mensaje sigue su flujo sin vista previa.`
    )
    return null
  } finally {
    if (reloj) clearTimeout(reloj)
  }
}

/**
 * POST /api/whatsapp/send-media — enviar un adjunto desde el panel.
 *
 * Cuerpo: { numberId, to, mimetype, dataBase64, filename?, caption?, comoNotaDeVoz? }
 * Misma disciplina que sendMessage y en el mismo orden: validar el destino, el
 * archivo, la PROPIEDAD de la línea, la sesión viva, y RESERVAR el cupo antes de
 * enviar (con devolución si el envío falla). Un adjunto cuesta un mensaje: se
 * cobra con el mismo increment que el texto.
 */
export async function sendMedia(req: CustomRequest, res: Response) {
  try {
    const {
      numberId,
      to,
      mimetype,
      dataBase64,
      filename,
      caption,
      comoNotaDeVoz
    } = req.body as {
      numberId: number
      to: string
      mimetype: string
      dataBase64: string
      filename?: string
      caption?: string
      comoNotaDeVoz?: boolean
    }

    if (!to) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de destino' })
      return
    }
    if (!esWhatsAppIdValido(to)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El destinatario no es un WhatsApp ID válido',
        to
      })
      return
    }

    // El MIME llega del navegador y puede traer parámetros ("audio/ogg; codecs=opus").
    const mimeBase = String(mimetype ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    const mimeNormalizado = MIME_PERMITIDOS.get(mimeBase)
    if (!mimeNormalizado) {
      res.status(HttpStatusCode.BadRequest).json({
        message:
          'Tipo de archivo no permitido. Se aceptan: jpg, png, webp, pdf, ogg y mp3.',
        mimetype: mimeBase
      })
      return
    }

    // El base64 puede venir como dataURL completa; se acepta y se recorta.
    const b64 = String(dataBase64 ?? '')
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s/g, '')
    if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El archivo no llegó como base64 válido'
      })
      return
    }
    const bytes = bytesDeBase64(b64)
    if (bytes > TOPE_ADJUNTO_BYTES) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El archivo supera el tope de 10MB',
        filesize: bytes
      })
      return
    }

    // La línea tiene que ser del usuario del token: mismo control que sendMessage.
    const numero = await exigirNumeroPropio(req, res, { id: numberId })
    if (!numero) return

    const client = clienteVivo(numberId)
    if (!client) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'No hay sesión activa para este número'
      })
      return
    }

    // Cupo RESERVADO antes de enviar, igual que el texto: un adjunto es un mensaje.
    const reserva = await incrementMessageUsage(numero.userId)
    if (!reserva.success) {
      res
        .status(
          reserva.fallaDeInfraestructura
            ? HttpStatusCode.InternalServerError
            : HttpStatusCode.BadRequest
        )
        .json({
          message: reserva.message ?? 'Límite mensual de mensajes alcanzado',
          currentUsage: reserva.currentUsage,
          limit: reserva.limit
        })
      return
    }

    const esAudio = mimeNormalizado.startsWith('audio/')
    const notaDeVoz = esAudio && comoNotaDeVoz === true
    const nombreArchivo =
      typeof filename === 'string' && filename.trim() ? filename.trim().slice(0, 200) : null

    let enviado: Message
    try {
      const chat = await client.getChatById(to)
      const media = new MessageMedia(mimeNormalizado, b64, nombreArchivo, bytes)
      if (notaDeVoz) {
        // "Grabando audio…" es puro adorno: si falla no puede costar el envío.
        void Promise.resolve(chat.sendStateRecording()).catch(() => {})
      }
      await client.sendSeen(to)
      enviado = await chat.sendMessage(media, {
        caption: caption?.trim() ? caption.trim() : undefined,
        sendAudioAsVoice: notaDeVoz || undefined
      })
      if (notaDeVoz) {
        void Promise.resolve(chat.clearState()).catch(() => {})
      }
    } catch (envioError) {
      await devolverMessageUsage(numero.userId, envioError)
      throw envioError
    }

    // Vista previa para el panel: sin ella, el propio envío desaparecería de la
    // burbuja en la próxima recarga (el historial vivo no trae el contenido).
    const mediaGuardada: MediaDeMensaje = {
      mimetype: mimeNormalizado,
      filename: nombreArchivo,
      filesize: bytes,
      dataBase64: bytes <= TOPE_PREVIA_BYTES ? b64 : null
    }
    const timestampMs = enviado?.timestamp ? enviado.timestamp * 1000 : Date.now()
    await guardarMediaDeChat({
      numberId,
      chatWaId: to,
      waMsgId: enviado?.id?._serialized ?? null,
      fromMe: true,
      media: mediaGuardada,
      msgTimestampMs: timestampMs
    })

    // Aviso a las demás pestañas del número. El que envió ya lo pinta solo; las
    // otras recargan historial pero el historial vivo no trae adjuntos.
    const io = req.app.get('io') as Server | undefined
    io?.to(String(numberId)).emit('chat-media-nueva', {
      numberid: numberId,
      to,
      media: { ...mediaGuardada, fromMe: true, timestamp: timestampMs }
    })

    res.status(HttpStatusCode.Ok).json({
      message: 'Adjunto enviado',
      media: { ...mediaGuardada, fromMe: true, timestamp: timestampMs }
    })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error interno del servidor al enviar el adjunto: ${
        (error as Error).message
      }`
    })
  }
}

/**
 * GET /api/whatsapp/chat-media?numberId=&chatId= — vistas previas de un chat.
 *
 * Existe porque get-chat-history (session.controller) lee el historial vivo de
 * WhatsApp, donde un adjunto es solo hasMedia=true: al abrir un chat, el front
 * pide aquí lo guardado y lo cruza por timestamp con los mensajes.
 */
export async function getChatMedia(req: CustomRequest, res: Response) {
  try {
    const numberId = req.query.numberId as string | undefined
    const chatId = ((req.query.chatId as string | undefined) ?? '').trim()
    if (!numberId || !chatId) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Faltan numberId o chatId' })
      return
    }
    // Propiedad primero: sin esto, cualquier cuenta leería los adjuntos de otra.
    const numero = await exigirNumeroPropio(req, res, { id: numberId })
    if (!numero) return

    const filas = await mediaGuardadaDelChat(numberId, [chatId], 100)
    res.status(HttpStatusCode.Ok).json({
      media: filas.map((f) => ({
        fromMe: f.from_me,
        mimetype: f.mimetype,
        filename: f.filename,
        filesize: f.filesize == null ? null : Number(f.filesize),
        dataBase64: f.data_base64,
        timestamp: Number(f.msg_timestamp)
      }))
    })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error consultando los adjuntos del chat: ${(error as Error).message}`
    })
  }
}

// ---------------------------------------------------------------------------
//  ACUSE POR REACCIÓN (👍 del bot a los mensajes entrantes con agente activo)
// ---------------------------------------------------------------------------

/**
 * POST /api/whatsapp/toggle-ack-reaction — { numberId, enabled }.
 * La columna nace en false (db/schema.sql): reaccionar en nombre del cliente es
 * algo que se enciende a propósito, nunca por defecto.
 */
export async function toggleAckReaction(req: CustomRequest, res: Response) {
  try {
    const { numberId, enabled } = req.body as {
      numberId: number
      enabled: boolean
    }
    const numero = await exigirNumeroPropio(req, res, { id: numberId })
    if (!numero) return
    const valor = enabled === true
    await query('UPDATE app."WhatsAppNumber" SET ack_reaction = $1 WHERE id = $2', [
      valor,
      numero.id
    ])
    res.status(HttpStatusCode.Ok).json({ numberId: numero.id, ackReaction: valor })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error cambiando el acuse por reacción: ${(error as Error).message}`
    })
  }
}

/**
 * El 👍 del bot. Va sin await desde los llamadores y con el error tragado aquí:
 * la reacción es un acuse, y un acuse fallido jamás puede costar la respuesta.
 * No hace falta resolver @lid para reaccionar —se reacciona sobre el PROPIO
 * objeto msg, no sobre un id—; la parte que sí exige la resolución (decidir si
 * el agente está activo para ese chat) ya la hizo quien nos llama con idCanonico.
 */
async function reaccionarAcuse(
  msg: Message,
  numberId: string | number
): Promise<void> {
  try {
    await msg.react('👍')
  } catch (e) {
    console.warn(
      `⚠️ No se pudo reaccionar 👍 al mensaje de ${msg?.from ?? '?'} (línea ${numberId}): ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
}

// Helper function to send upgrade email when limit is reached
async function sendLimitReachedMessage(
  msg: Message,
  chat: Chat,
  number: { userId: number }
) {
  try {
    const today = new Date().toDateString()
    const lastSent = limitMessagesSent.get(number.userId)

    if (lastSent === today) {
      return
    }

    // Obtener user: email, username, subscription
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, username, email, subscription')
      .eq('id', number.userId)
      .single()

    if (userError || !user) {
      console.error('Error obteniendo datos del usuario:', userError)
      return
    }

    if (!user.email) {
      console.error('Usuario no tiene email configurado:', user.username)
      return
    }

    // Obtener usage y limit en una sola llamada
    const { data: usageData, error: usageError } = await supabase.rpc(
      'get_user_message_usage',
      { p_user_id: number.userId }
    )

    if (usageError || !usageData || usageData.length === 0) {
      console.error('Error obteniendo uso del usuario:', usageError)
      return
    }

    const { current_usage, message_limit } = usageData[0]

    let subject = ''
    switch (user.subscription) {
      case 'FREE':
        subject = '🚀 Has alcanzado tu límite gratuito - Actualiza a BASIC'
        break
      case 'EXPIRED':
        subject = '⚠️ Plan expirado - Renueva tu suscripción'
        break
      case 'BASIC':
        subject = '📈 Límite BASIC alcanzado - Actualiza a PRO'
        break
      case 'PRO':
        subject = '🏭 Límite PRO alcanzado - Actualiza a INDUSTRIAL'
        break
      default:
        subject = '📋 Límite mensual de mensajes alcanzado'
    }

    const emailContent = limitReachedEmailTemplate(
      user.subscription,
      current_usage,
      message_limit
    )

    if (!transporter) {
      console.error('⚠️ Servicio de correo no configurado. No se pudo enviar email de límite alcanzado.')
      return
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: user.email,
      subject,
      html: emailContent
    })

    limitMessagesSent.set(number.userId, today)
  } catch (error) {
    console.error('Error sending limit reached email:', error)
  }
}

export async function sendMessage(req: CustomRequest, res: Response) {
  try {
    const { content, to, numberId } = req.body as SendMessageBody
    const numberid = numberId // Usar numberid solo para la base de datos
    if (!to) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de destino' })
      return
    }
    // Validar que 'to' sea un WhatsApp ID válido (misma regla que send-media,
    // definida una sola vez a nivel de módulo).
    if (!esWhatsAppIdValido(to)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El destinatario no es un WhatsApp ID válido',
        to
      })
      return
    }
    // EL NÚMERO TIENE QUE SER DEL USUARIO DEL TOKEN.
    //
    // `numberId` llegaba del cuerpo y se usaba tal cual: se enviaba el WhatsApp
    // desde la sesión de ese número —o sea, EN NOMBRE de otra empresa— y el
    // consumo se cargaba contra el cupo mensual de su dueño, que es lo que se le
    // factura. La comprobación va aquí arriba, antes de tocar nada.
    if (!(await exigirNumeroPropio(req, res, { id: numberId }))) return

    // Normalizar wa_id y numberId para la consulta
    const waIdToCheck = (to || '').trim().toLowerCase()
    const numberIdNum = Number(numberid)
    // Sin .single(). El índice único de la tabla es (numberId, wa_id, TYPE), y
    // aquí no se filtra por type: un contacto y un grupo con el mismo wa_id
    // devuelven DOS filas y .single() respondía PGRST116 — el mismo código que
    // significa "no hay ninguna". Con .limit(1) la pregunta que se hace es la que
    // de verdad importa: "¿existe alguna?".
    const { data: syncFilas, error: syncDbError } = await supabase
      .from('SyncedContactOrGroup')
      .select('id, wa_id, type')
      .eq('numberId', numberIdNum)
      .eq('wa_id', waIdToCheck)
      .limit(1)

    if (syncDbError) {
      console.error('Error buscando en SyncedContactOrGroup:', syncDbError)
      res.status(HttpStatusCode.InternalServerError).json({
        message: 'Error consultando el estado de sincronización del chat'
      })
      return
    }

    // La condición estaba INVERTIDA: era `if (syncDbError && code !== 'PGRST116')`,
    // o sea que solo entraba a validar cuando había un error REAL de base. Cuando
    // el contacto simplemente no estaba sincronizado —PGRST116, el caso normal—
    // se saltaba el bloque entero y la validación NUNCA se aplicaba.
    //
    // Arreglarla y activarla de golpe sería peligroso: lleva tanto tiempo muerta
    // que cualquier flujo que hoy manda a un chat no registrado empezaría a
    // recibir un 400 sin previo aviso. Por eso, por defecto AVISA en el log y deja
    // pasar —exactamente lo que ocurre hoy— y solo rechaza con
    // STRICT_CHAT_VALIDATION=true. Mirar los logs unos días, comprobar que el
    // aviso no aparece, y entonces encenderlo.
    if (!syncFilas || syncFilas.length === 0) {
      const { data: unsyncedFilas, error: unsyncedError } = await supabase
        .from('Unsyncedcontact')
        .select('id')
        .eq('numberid', numberIdNum)
        .eq('wa_id', waIdToCheck)
        .limit(1)

      if (unsyncedError) {
        console.error('Error buscando en Unsyncedcontact:', unsyncedError)
      }
      if (!unsyncedFilas || unsyncedFilas.length === 0) {
        const estricto = process.env.STRICT_CHAT_VALIDATION === 'true'
        console.warn(
          `⚠️ Envío a un chat no registrado para el número ${numberIdNum}: ${waIdToCheck}. ` +
            (estricto
              ? 'Rechazado (STRICT_CHAT_VALIDATION=true).'
              : 'Se deja pasar por compatibilidad; activar STRICT_CHAT_VALIDATION=true para rechazarlo.')
        )
        if (estricto) {
          res.status(HttpStatusCode.BadRequest).json({
            message:
              'El chat no está sincronizado ni registrado como no sincronizado para este número',
            to
          })
          return
        }
      }
      // Si está en Unsyncedcontact, permite el envío (sin importar agentehabilitado)
    }
    // Un cliente sin navegador está en el mapa igual que uno bueno: si se lee en
    // crudo, el envío revienta con el "reading 'evaluate'" de null en vez de
    // avisar de que la línea no está conectada.
    const client = clienteVivo(numberid)
    if (!client) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'No hay sesión activa para este número'
      })
      return
    }

    const { data: number } = await supabase
      .from('WhatsAppNumber')
      .select('userId')
      .eq('id', numberId)
      .single()

    if (!number) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'Número de WhatsApp no encontrado'
      })
      return
    }

    // -----------------------------------------------------------------------
    //  EL CUPO SE RESERVA ANTES DE ENVIAR, NO SE COBRA DESPUÉS.
    //
    //  Aquí había dos pasos separados: primero `get_user_message_usage` para
    //  comprobar `currentUsage >= limit`, y DESPUÉS del envío un
    //  `incrementMessageUsage`. Entre la comprobación y el cobro hay dos viajes
    //  a la base y un mensaje de WhatsApp, y en ese hueco cabe otra petición:
    //  con el cupo en 99 de 100, dos envíos simultáneos leen los dos 99, los dos
    //  pasan, los dos se envían — y el contador solo cuenta uno. Se envía sin
    //  cobrar, que es la mitad exacta del negocio.
    //
    //  `increment_message_usage` ya hace las dos cosas en una operación con la
    //  fila bloqueada (FOR UPDATE, ver db/schema.sql): comprueba el tope y
    //  suma 1, o no hace ninguna de las dos. Llamarla PRIMERO convierte el cupo
    //  en una reserva: el segundo de los dos envíos simultáneos ve 100 y se
    //  rechaza antes de tocar WhatsApp.
    //
    //  Y si el envío falla después de reservar, se devuelve el cupo. La reserva
    //  puede sobrar; el mensaje enviado gratis, no. Ante la duda se cobra de
    //  menos y se avisa en el log, nunca al revés.
    // -----------------------------------------------------------------------
    const reserva = await incrementMessageUsage(number.userId)
    if (!reserva.success) {
      // 500 si la base no respondió, 400 si es una decisión de negocio (tope
      // alcanzado, plan sin tope configurado). Decirle "límite alcanzado" a
      // quien en realidad topó con una base caída manda a buscar el problema al
      // sitio equivocado.
      res
        .status(
          reserva.fallaDeInfraestructura
            ? HttpStatusCode.InternalServerError
            : HttpStatusCode.BadRequest
        )
        .json({
          message: reserva.message ?? 'Límite mensual de mensajes alcanzado',
          currentUsage: reserva.currentUsage,
          limit: reserva.limit
        })
      return
    }

    try {
      await client.sendSeen(to)
      await client.sendMessage(to, content)
    } catch (envioError) {
      await devolverMessageUsage(number.userId, envioError)
      throw envioError
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Mensaje enviado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error interno del servidor al enviar el mensaje: ${
        (error as Error).message
      }`
    })
  }
}

// Función para sincronizar historiales de chat en lotes
export async function syncAllHistoriesBatch(
  io: Server,
  numberid: string | number,
  chatIds: string[],
  client: Client,
  batchSize = 20
) {
  let completed = 0
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (chatId) => {
        try {
          const chat = await client.getChatById(chatId)
          if (!chat) return
          const messages = await chat.fetchMessages({ limit: 10 })
          messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
          const chatHistory = messages.map((m: Message) => ({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.body,
            timestamp: m.timestamp * 1000,
            to: chat.id._serialized,
            fromMe: m.fromMe
          }))
          const lastMessage = messages[messages.length - 1]
          const lastMessageTimestamp =
            lastMessage !== undefined ? lastMessage.timestamp * 1000 : null

          io.to(numberid.toString()).emit('chat-history', {
            numberid,
            chatHistory,
            to: chat.id._serialized,
            lastMessageTimestamp
          })
          console.log('Emitido msg-controller 366')
        } catch (err) {
          console.error('Error sincronizando chat:', chatId, err)
        }
      })
    )
    completed += batch.length
    // Emitir progreso
    io.to(numberid.toString()).emit('sync-progress', {
      numberid,
      completed,
      total: chatIds.length
    })
  }
}

// --- CONTROL DE DUPLICADOS EN MEMORIA ---
const respondedMessages = new Map<string, number>() // msg.id._serialized -> timestamp

// Limpiar mensajes antiguos cada 5 minutos
setInterval(() => {
  const now = Date.now()
  for (const [id, timestamp] of respondedMessages.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      // 5 minutos
      respondedMessages.delete(id)
    }
  }
}, 5 * 60 * 1000)

// Control for limit reached messages (one per day per user)
const limitMessagesSent = new Map<number, string>() // userId -> date

// Control de último mensaje respondido a usuarios no sincronizados
const lastUnsyncedReplies = new Map<string, string>() // wa_id -> last reply

// Control de última respuesta ENVIADA por la IA a usuarios no sincronizados
const lastUnsyncedAIResponse = new Map<string, string>() // wa_id -> last AI response

// Control de última emisión de chat-history por numberId (para evitar duplicados)
const lastChatHistoryEmit: Record<number, number> = {}

// Función para manejar mensajes entrantes
export async function handleIncomingMessage(
  msg: Message,
  chat: Chat,
  numberId: string | number,
  io: Server
) {
  /**
   * TRAZA DEL MENSAJE ENTRANTE.
   *
   * Todas las salidas de este bloque hacían `return` a secas. Un mensaje podía morir en
   * cualquiera de ellas y en el servidor no quedaba ni una línea: en la app el chat decía
   * "Sin mensajes" y el agente no respondía, sin nada que mirar. Se perdieron horas por eso.
   *
   * Ahora cada descarte dice QUÉ mensaje y POR QUÉ. `descartar` centraliza el formato para
   * que se puedan buscar todos con un solo grep: "[msg]".
   */
  const traza = (etapa: string, detalle = '') =>
    console.log(
      `[msg] ${etapa} · línea ${numberId} · de ${msg?.from ?? '?'}${detalle ? ` · ${detalle}` : ''}`
    )
  const descartar = (motivo: string) => {
    console.warn(
      `[msg] DESCARTADO (${motivo}) · línea ${numberId} · de ${msg?.from ?? '?'}`
    )
  }

  /**
   * IDENTIFICADOR DEL MENSAJE, TOLERANTE.
   *
   * Se usa solo para no procesar dos veces el mismo mensaje. Venía de
   * `msg.id._serialized`, y con los remitentes @lid ese campo llega vacío: el mensaje se
   * descartaba entero con "el mensaje no trae id" —comprobado en producción con un
   * "Holalalas" que sí había llegado—. Tirar un mensaje real por no poder deduplicarlo es
   * el peor intercambio posible.
   *
   * Se cae en cascada al id crudo y, en último caso, a remitente+hora+texto, que para
   * detectar el duplicado de un reintento es igual de bueno.
   */
  const idBruto = msg?.id as { _serialized?: string; id?: string } | undefined
  const idMensaje =
    idBruto?._serialized ||
    idBruto?.id ||
    `${msg?.from ?? '?'}_${msg?.timestamp ?? 0}_${(msg?.body ?? '').slice(0, 40)}`

  traza('RECIBIDO', `${msg?.hasMedia ? 'con adjunto' : `"${(msg?.body ?? '').slice(0, 60)}"`}`)

  // Validaciones básicas para evitar errores de serialización
  try {
    // Verificar que el mensaje tiene las propiedades básicas
    if (!msg) {
      descartar('no llegó el mensaje')
      return
    }

    // Verificar que el chat tiene las propiedades básicas
    if (!chat || !chat.id || !chat.id._serialized) {
      descartar('no se pudo determinar el chat')
      return
    }

    // Verificar que el mensaje tiene contenido o es un tipo válido
    if (!msg.body && !msg.hasMedia) {
      descartar('sin texto ni adjunto')
      return
    }

    // Validación adicional: asegurarse de que el mensaje no es undefined o está corrupto
    if (typeof msg.from !== 'string' || typeof msg.to !== 'string') {
      descartar('remitente o destinatario no son texto')
      return
    }

    // Verificar que el mensaje no está corrupto
    if (!msg.from.includes('@') || !msg.to.includes('@')) {
      descartar(`identificadores sin @ (from=${msg.from}, to=${msg.to})`)
      return
    }

    // Verificar que el cliente WhatsApp está disponible
    const client = clienteVivo(numberId)
    if (!client || !client.info || !client.info.wid) {
      descartar('la sesión de WhatsApp de esta línea no está activa')
      return
    }

    // Esperar un poco para asegurar que el mensaje esté completamente cargado
    await new Promise((resolve) => setTimeout(resolve, 200))
  } catch (validationError) {
    console.error('Error en validación inicial del mensaje:', validationError)
    descartar('excepción en las validaciones iniciales')
    return
  }

  // --- CONTROL DE DUPLICADOS EN MEMORIA ---
  if (respondedMessages.has(idMensaje)) {
    descartar('duplicado: ya se procesó este mismo id')
    return
  }
  respondedMessages.set(idMensaje, Date.now()) // Log SIEMPRE que se reciba un mensaje
  const idToCheck = chat.id._serialized
  /**
   * EL ID CLÁSICO DEL CHAT, RESUELTO ANTES DE DECIDIR NADA.
   *
   * WhatsApp sirve algunos chats con el identificador nuevo @lid. El contacto
   * sincronizado está guardado con el clásico (teléfono@c.us), así que comparar
   * con el @lid crudo daba "SIN sincronizar" para gente que SÍ estaba en la
   * agenda: el sistema le creaba una ficha duplicada sin nombre ni foto y la
   * ficha real se quedaba en "Sin mensajes" para siempre (pasó con un contacto
   * agregado la noche del 1-sep).
   *
   * La traducción ya existía (getContactLidAndPhone) pero se usaba DESPUÉS de
   * decidir que el contacto era desconocido, solo para mostrar un número
   * legible. Izarla aquí hace que la decisión misma la aproveche.
   */
  let idCanonico = idToCheck
  if (idToCheck.endsWith('@lid')) {
    try {
      const clienteLid = clienteVivo(numberId)
      const [par] = ((await clienteLid?.getContactLidAndPhone([idToCheck])) ??
        []) as Array<{ pn?: string }>
      const telefonoLid = par?.pn?.split('@')[0]
      if (telefonoLid && /^\d{6,15}$/.test(telefonoLid)) {
        idCanonico = `${telefonoLid}@c.us`
        console.log(`[msg] LID RESUELTO TEMPRANO · ${idToCheck} -> ${idCanonico}`)
      }
    } catch (e) {
      console.warn(
        `⚠️ No se pudo resolver ${idToCheck} antes del pareo: ${
          e instanceof Error ? e.message : String(e)
        }. Se sigue con el identificador crudo.`
      )
    }
  }
  const isGroup = chat.id.server === 'g.us'
  if (msg.isStatus) {
    descartar('es un estado, no un mensaje de chat')
    return
  }

  traza('VALIDADO', `chat ${idToCheck}${isGroup ? ' (grupo)' : ''}`)

  // Los DOS ids del chat, definidos ANTES del historial: los usa tanto la
  // vista previa del adjunto como (más abajo) el pareo con la agenda.
  const idsDelChat =
    idCanonico === idToCheck ? [idToCheck] : [idToCheck, idCanonico]

  // ADJUNTO ENTRANTE: se descarga y se guarda ANTES de emitir el historial,
  // para que este mismo evento ya lleve la vista previa. La descarga tiene
  // timeout duro y nunca lanza: sin vista previa el mensaje sigue igual.
  if (msg.hasMedia) {
    const mediaEntrante = await descargarMediaEntrante(
      msg,
      `${msg.from} (línea ${numberId})`
    )
    if (mediaEntrante) {
      await guardarMediaDeChat({
        numberId,
        // El id CLÁSICO resuelto, no el @lid crudo: misma regla que la agenda.
        chatWaId: idCanonico,
        waMsgId: idBruto?._serialized || idBruto?.id || null,
        fromMe: false,
        media: mediaEntrante,
        msgTimestampMs: (msg.timestamp ?? 0) * 1000 || Date.now()
      })
      traza(
        'ADJUNTO GUARDADO',
        `${mediaEntrante.mimetype} · ${mediaEntrante.filesize ?? '?'} bytes · ` +
          `previa=${mediaEntrante.dataBase64 ? 'sí' : 'solo metadatos'}`
      )
    }
  }

  /**
   * TEXTO QUE VE LA IA. Un sticker, una foto o una nota de voz llegan con
   * `msg.body` vacío: hasta hoy esos mensajes se descartaban y el agente ni
   * respondía (el cliente mandó un sticker y no pasó nada — bug reportado). No
   * podemos leer el contenido del sticker, pero SÍ podemos decirle a la IA qué
   * llegó, para que responda con naturalidad ("¡jaja, buen sticker!" / "recibí
   * tu foto, ¿me cuentas de qué se trata?") en vez de quedarse muda. Si hay
   * caption o texto, ese manda; si no, una descripción por tipo. Nunca vacío
   * cuando hubo adjunto.
   */
  const textoParaIA = (() => {
    const cuerpo = (msg.body ?? '').trim()
    if (cuerpo) return cuerpo
    if (!msg.hasMedia) return cuerpo
    switch (msg.type) {
      case 'sticker':
        return '[el cliente envió un sticker]'
      case 'image':
        return '[el cliente envió una imagen sin texto]'
      case 'video':
        return '[el cliente envió un video sin texto]'
      case 'ptt':
      case 'audio':
        return '[el cliente envió una nota de voz]'
      case 'document':
        return '[el cliente envió un documento]'
      case 'location':
        return '[el cliente compartió una ubicación]'
      default:
        return '[el cliente envió un adjunto]'
    }
  })()

  // El historial se saca del try para que los eventos puedan mirarlo: es el
  // ÚNICO sitio del sistema donde se ve `m.fromMe`, o sea lo único que permite
  // distinguir "el lead escribió" de "el lead CONTESTÓ". Volver a pedirlo sería
  // repetir una llamada cara a WhatsApp.
  let historialDelChat: Message[] = []

  // EMITIR ACTUALIZACIÓN DEL HISTORIAL DEL CHAT SIEMPRE QUE LLEGUE UN MENSAJE
  try {
    traza('LEYENDO HISTORIAL', `chat ${idToCheck}`)
    const messages = await traerMensajes(chat, 30, `${idToCheck} (línea ${numberId})`)
    messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
    historialDelChat = messages

    let lastMessageTimestamp: number | null = null
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg) {
        lastMessageTimestamp = lastMsg.timestamp * 1000
      }
    }

    const chatHistory = messages.map((m: Message) => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.body,
      timestamp: m.timestamp * 1000,
      // El id CLÁSICO, no el @lid crudo: el front cuelga el historial del
      // contacto buscándolo por wa_id, y la agenda guarda el clásico.
      to: idCanonico,
      fromMe: m.fromMe
    }))

    // Las vistas previas guardadas del chat, pegadas a sus mensajes: el
    // historial vivo de WhatsApp solo dice hasMedia, el contenido vive en
    // app."ChatMedia". Así el MISMO evento del chat lleva el adjunto.
    const mediaDelChat = await mediaGuardadaDelChat(numberId, idsDelChat)

    io.to(numberId.toString()).emit('chat-history', {
      numberid: numberId,
      chatHistory: adjuntarMediaAlHistorial(chatHistory, mediaDelChat),
      to: idCanonico,
      lastMessageTimestamp
    })
    console.log(
      'Emitido chat-history para mensaje entrante - numberId:',
      numberId,
      'chat:',
      idToCheck
    )
  } catch (historyError) {
    console.error('Error obteniendo historial del chat:', historyError)
  }

  // Entrada única de todo mensaje entrante de esta vía: aquí nace
  // message.received (y contact.replied si procede). Va sin await a propósito —
  // el mensaje del lead no puede esperar a que se guarde un evento, y mucho
  // menos a que responda el webhook de nadie.
  void emitirMensajeEntrante(msg, chat, numberId, historialDelChat)

  // El cupo mensual cuenta SOLO lo que la cuenta ENVÍA. Aquí se cobraba también
  // cada mensaje ENTRANTE, así que un tercero cualquiera podía agotar el plan
  // del cliente simplemente escribiéndole. El cobro vive ahora únicamente en
  // los envíos: sendMessage y las respuestas de la IA (sincronizados y no
  // sincronizados), que reservan con increment_message_usage antes de mandar.
  if (isGroup) {
    const { data: number, error: numberError } = await supabase
      .from('WhatsAppNumber')
      .select('userId')
      .eq('id', numberId)
      .single()

    if (numberError || !number) {
      console.error('Error getting WhatsAppNumber:', numberError)
      return
    }

    const { data: user, error: userError } = await supabase
      .from('User')
      .select('subscription')
      .eq('id', number.userId)
      .single()

    if (userError || !user) {
      console.error('Error getting user:', userError)
      return
    }

    // Los grupos son de pago: solo PRO e INDUSTRIAL. No es un fallo, es una regla de
    // negocio — pero el `return` era mudo, así que desde fuera era indistinguible de un
    // bug: el interruptor "Grupos" encendido, el mensaje entrando, y el agente callado
    // sin que nada dijera por qué. Costó horas de búsqueda.
    if (user.subscription !== 'PRO' && user.subscription !== 'INDUSTRIAL') {
      console.log(
        `[msg] SIN RESPUESTA (los grupos requieren plan PRO o INDUSTRIAL) · línea ${numberId} · ` +
          `chat ${idToCheck} · plan actual: ${user.subscription}`
      )
      return
    }
  }
  // Busca en la base de datos si está sincronizado y habilitado, por los DOS ids
  // (crudo y clásico, idsDelChat ya definido arriba): con solo el crudo, un chat
  // servido como @lid nunca coincidía con la agenda (guardada como @c.us).
  const { data: syncRows, error: syncDbError } = await supabase
    .from('SyncedContactOrGroup')
    .select('agenteHabilitado')
    .eq('numberId', numberId)
    .in('wa_id', idsDelChat)
    .eq('type', isGroup ? 'group' : 'contact')
    .limit(1)
  const syncDb = syncRows?.[0] ?? null

  if (syncDbError) {
    console.error('Error buscando en SyncedContactOrGroup:', syncDbError)
    return
  }

  // El chat resolvió a un contacto sincronizado por su id clásico: si la vía
  // @lid alcanzó a crear una ficha duplicada "sin sincronizar", se limpia —
  // es la fila fantasma sin nombre ni foto que confundía la bandeja.
  if (syncDb && idCanonico !== idToCheck) {
    void supabase
      .from('Unsyncedcontact')
      .delete()
      .eq('numberid', numberId)
      .in('wa_id', idsDelChat)
      .then(({ error }) => {
        if (error)
          console.warn('No se pudo limpiar la ficha duplicada del lid:', error.message)
      })
  }
  // Punto ciego: entre "VALIDADO" y la respuesta no había ninguna traza, así que un
  // mensaje que se paraba aquí desaparecía sin dejar rastro. Esta línea dice por qué
  // rama va (sincronizado o no), que es lo que decide todo lo que viene después.
  console.log(
    `[msg] RUTA · línea ${numberId} · chat ${idToCheck} · ` +
      `${syncDb ? 'sincronizado' : 'SIN sincronizar'} · es-grupo=${isGroup}`
  )
  // Obtener el número completo
  // SEGUNDO SITIO DONDE SE PERDÍAN LOS MENSAJES, 120 líneas después del primero.
  //
  // Aquí se deducía QUÉ línea nuestra había recibido el mensaje parseando `msg.to`
  // con libphonenumber y buscando por `number`. Era una vuelta innecesaria —la línea
  // ya viene identificada por `numberId`, que es un parámetro de esta función y que
  // unas líneas más arriba ya se usa para consultar—, y encima se rompe en silencio:
  //
  //   · con un `@lid` (el identificador nuevo de WhatsApp), `parseAndKeepRawInput`
  //     NO lanza: a "+101692108443891" le saca el "número nacional" 01692108443891,
  //     que no casa con ninguna fila y hacía `return` sin más;
  //   · con ids largos pierde precisión de verdad: "+120363432268746487" sale como
  //     20363432268746490 (comprobado en local con la librería instalada), porque el
  //     número se guarda como double y se pasa de los 2^53.
  //
  // O sea: arreglar la entrada sin tocar esto solo habría mudado la pérdida de sitio.
  // Se busca por clave primaria, que es exacta y no depende del formato del id.
  const phoneNumberRaw = msg.to.split('@')[0] ?? ''
  if (phoneNumberRaw.startsWith('+')) {
    // Todo el tratamiento del mensaje vive dentro del `if` de abajo. Si el
    // destinatario llega con un '+' delante, no entra en ninguna rama y el mensaje se
    // esfuma sin log. No debería pasar —WhatsApp no pone '+' en los ids— pero si pasa,
    // que se vea.
    descartar(`el destinatario llegó con formato inesperado: ${msg.to}`)
  }
  if (!phoneNumberRaw.startsWith('+')) {
    const { data: number, error: numberError } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('id', numberId)
      .single()
    if (!number || numberError) {
      console.error(
        `❌ Mensaje entrante DESCARTADO: no existe la línea ${numberId} en WhatsAppNumber.`,
        numberError
      )
      descartar('punto 1: condición no cumplida más adelante en el flujo')
      return
    }

    const waIdToCheck = (msg.from || '').trim().toLowerCase()

    // --- NO SINCRONIZADO: Solo responde si aiUnknownEnabled y agentehabilitado en Unsyncedcontact ---
    if (!syncDb) {
      try {
        // Validar que el mensaje y el chat están correctamente formateados
        // Antes exigía msg.body y mataba el sticker/foto/nota de voz. Ahora basta
        // con que haya texto PARA LA IA (que ya describe el adjunto si no hay caption).
        if (!msg || !msg.from || !textoParaIA) {
          descartar('punto 2: condición no cumplida más adelante en el flujo')
          return
        }

        // Validar que el chat está disponible
        if (!chat || !chat.id || !chat.id._serialized) {
          descartar('punto 3: condición no cumplida más adelante en el flujo')
          return
        }

        // Extraer el número del wa_id (sin el @c.us)
        /**
         * EL NÚMERO DE VERDAD, NO EL IDENTIFICADOR INTERNO.
         *
         * Con los remitentes nuevos (@lid) la parte de delante de la arroba NO es un
         * teléfono: es un identificador interno de WhatsApp. En la lista de contactos
         * salía "101692108443891", que no le dice nada a nadie y no se puede marcar.
         *
         * `getContactLidAndPhone` traduce ese identificador al teléfono real. Va por un
         * camino distinto al que está roto, así que funciona donde getChatById falla.
         * Si no lo consigue, se queda el identificador: es preferible a inventarse un
         * número.
         *
         * También se guarda el nombre que la persona tiene puesto en su WhatsApp, que
         * es mucho más útil que cualquier número.
         */
        let numberFromWaId = waIdToCheck.split('@')[0] ?? waIdToCheck
        let nombreVisible = numberFromWaId
        if (waIdToCheck.endsWith('@lid')) {
          try {
            const cliente = clienteVivo(numberId)
            const [par] = ((await cliente?.getContactLidAndPhone([waIdToCheck])) ??
              []) as Array<{ pn?: string }>
            const telefono = par?.pn?.split('@')[0]
            if (telefono) {
              numberFromWaId = telefono
              nombreVisible = telefono
              console.log(
                `[msg] IDENTIFICADOR TRADUCIDO · ${waIdToCheck} -> ${telefono}`
              )
            }
          } catch (e) {
            console.warn(
              `⚠️ No se pudo traducir ${waIdToCheck} a un número: ${
                e instanceof Error ? e.message : String(e)
              }. Se guarda el identificador tal cual.`
            )
          }
        }
        // Manda el NÚMERO, con su prefijo de país, y no el nombre que la persona tenga
        // puesto en su WhatsApp: en una bandeja de trabajo lo que identifica a alguien
        // sin ambigüedad —y lo que se puede marcar o buscar— es el número. Dos personas
        // pueden llamarse igual; el número no se repite.
        nombreVisible = /^\d{6,15}$/.test(numberFromWaId)
          ? `+${numberFromWaId}`
          : numberFromWaId

        // OJO con lo que NO está aquí: `agentehabilitado`.
        //
        // El adaptador traduce el upsert a ON CONFLICT ... DO UPDATE SET con
        // TODAS las columnas que no son de conflicto. Con agentehabilitado en el
        // objeto, cada mensaje entrante lo devolvía a `true` — deshaciendo el
        // apagado que hace el propio controlador cuando el cliente pide hablar
        // con un asesor humano. Bastaba con que el cliente escribiera otra vez
        // para que la IA volviera a contestarle.
        //
        // Quitándolo del objeto: en una fila NUEVA la columna toma su DEFAULT
        // (true, en db/schema.sql) y en una fila EXISTENTE no se toca. Que es
        // justo lo que se quería.
        const contactData = {
          numberid: numberId,
          // El id CLÁSICO como llave cuando se pudo traducir: así la limpieza de
          // la sincronización (que borra por el wa_id de la agenda) encuentra la
          // fila, y no quedan fantasmas @lid imposibles de reconciliar.
          wa_id:
            waIdToCheck.endsWith('@lid') && /^\d{6,15}$/.test(numberFromWaId)
              ? `${numberFromWaId}@c.us`
              : waIdToCheck,
          number: numberFromWaId,
          name: nombreVisible,
          lastmessagetimestamp: Date.now(),
          lastmessagepreview: textoParaIA || ''
        }

        // Intentar insertar o actualizar
        const { error: upsertError } = await supabase
          .from('Unsyncedcontact')
          .upsert([contactData], {
            onConflict: 'numberid,wa_id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error(
            'Error al guardar contacto no sincronizado:',
            upsertError
          )
          descartar('punto 4: condición no cumplida más adelante en el flujo')
          return
        }

        // Sin esta traza no se distinguía "el contacto no se guardó" de "se guardó pero
        // la lista de la derecha no lo pinta", que son dos arreglos muy distintos.
        console.log(
          `[msg] CONTACTO NO AGENDADO GUARDADO · línea ${numberId} · wa_id ${waIdToCheck} · ` +
            `número ${numberFromWaId} · aviso enviado a la sala ${numberId}`
        )

        // EMITIR EVENTO SOCKET para refrescar lista en frontend SIEMPRE
        io.to(numberId.toString()).emit('unsynced-contacts-updated', {
          numberid: numberId
        })

        // Consultar el contacto actualizado — por el MISMO id con el que se
        // acaba de guardar. Con un chat servido como @lid la ficha se guarda
        // con el id clásico (teléfono@c.us); releer por el @lid crudo no la
        // encontraba y la IA nunca respondía al contacto nuevo.
        const { data: updatedContact, error: queryError } = await supabase
          .from('Unsyncedcontact')
          .select('id, agentehabilitado')
          .eq('numberid', numberId)
          .eq('wa_id', contactData.wa_id)
          .single()

        if (queryError) {
          console.error(
            'Error al consultar contacto no sincronizado:',
            queryError
          )
          descartar('punto 5: condición no cumplida más adelante en el flujo')
          return
        }

        /**
         * ¿Responde el agente a un chat que no está sincronizado?
         *
         * Esta rama exigía `!isGroup`, así que un GRUPO no sincronizado no podía recibir
         * respuesta jamás, tuviera el usuario los interruptores como los tuviera: el
         * mensaje entraba, se guardaba y ahí moría. Es lo que pasaba con el grupo de
         * prueba con "IA", "Grupos" y "No agregados" los tres encendidos.
         *
         * Ahora cada tipo de chat mira SU interruptor, y TODOS pasan primero por el
         * maestro "IA" del número (aiEnabled): sin él, apagar la IA dejaba al agente
         * respondiendo igual a los no agendados.
         *   · contacto suelto -> "IA" Y "No agregados" (aiUnknownEnabled), y que el
         *     agente esté habilitado para ese contacto en concreto.
         *   · grupo           -> "IA" Y "Grupos" (responseGroups) Y "No agregados",
         *     porque un grupo sin sincronizar es las dos cosas a la vez: es grupo y no
         *     está en la agenda. Exigir los dos respeta la intención de ambos controles
         *     y evita que el agente se ponga a hablar en un grupo al que lo metieron
         *     sin avisar.
         */
        const puedeResponderDesconocido = isGroup
          ? number.aiEnabled === true &&
            number.responseGroups === true &&
            number.aiUnknownEnabled === true
          : number.aiEnabled === true &&
            number.aiUnknownEnabled === true &&
            !!updatedContact &&
            updatedContact.agentehabilitado === true
        if (!puedeResponderDesconocido) {
          // Esta es LA decisión que hay que poder leer: aquí es donde el agente calla ante
          // un contacto que no está en la agenda. Con un motivo genérico había que abrir el
          // código para saber cuál de las cuatro condiciones falló.
          console.log(
            `[msg] SIN RESPUESTA (chat sin sincronizar) · línea ${numberId} · ` +
              `es-grupo=${isGroup} · IA=${number.aiEnabled ? 'on' : 'off'} · ` +
              `grupos=${number.responseGroups ? 'on' : 'off'} · ` +
              `no-agendados=${number.aiUnknownEnabled ? 'on' : 'off'} · ` +
              `contacto-en-bd=${updatedContact ? 'sí' : 'no'} · ` +
              `agente-para-este-contacto=${updatedContact?.agentehabilitado ? 'sí' : 'no'}`
          )
        }
        if (puedeResponderDesconocido) {
          console.log(
            `[msg] IA PENSANDO (chat sin sincronizar) · línea ${numberId} · chat ${idToCheck}`
          )
          // Aviso a la pantalla para que muestre "escribiendo…". El agente puede tardar
          // varios segundos en contestar y, sin esto, el chat parecía muerto justo en el
          // momento en que más está pasando.
          io.to(numberId.toString()).emit('agente-escribiendo', {
            numberId,
            to: idToCheck,
            escribiendo: true
          })
          // Lógica para evitar dos respuestas IA iguales seguidas
          const inicioIA = Date.now()
          let aiResponse
          try {
            aiResponse = await getAIResponse(
              number.aiPrompt,
              textoParaIA,
              number.aiModel,
              [] // Puedes pasar el historial si lo necesitas
            )
          } catch (errorIA) {
            // El fallo también se mide: una cuenta que quema cuota a base de
            // errores es justo la que hay que poder ver en el panel. Se re-lanza
            // para no cambiar el comportamiento que ya tenía este bloque.
            void registrarUsoIA({
              userId: number.userId,
              numberId,
              model: number.aiModel || 'gemini-3.6-flash',
              latencyMs: Date.now() - inicioIA,
              ok: false,
              errorKind: clasificarErrorIA(errorIA)
            })
            console.error(
              `[msg] LA IA FALLÓ · línea ${numberId} · chat ${idToCheck} · ` +
                `${errorIA instanceof Error ? errorIA.message : String(errorIA)}`
            )
            // Si falla, hay que apagarlo igual: un "escribiendo…" eterno es peor que
            // no haberlo puesto.
            io.to(numberId.toString()).emit('agente-escribiendo', {
              numberId,
              to: idToCheck,
              escribiendo: false
            })
            throw errorIA
          }
          // Punto de escritura #1 del consumo de IA. Va sin await: la respuesta
          // al lead no puede esperar a que se guarde una fila de medición.
          void registrarUsoIA({
            userId: number.userId,
            numberId,
            model: number.aiModel || 'gemini-3.6-flash',
            uso: aiResponse[1],
            latencyMs: Date.now() - inicioIA
          })
          if (!aiResponse[0] || typeof aiResponse[0] !== 'string') {
            descartar('punto 6: condición no cumplida más adelante en el flujo')
            return
          }
          const lastReply = lastUnsyncedReplies.get(waIdToCheck)
          const lastAIResponse = lastUnsyncedAIResponse.get(waIdToCheck)
          // Lógica: solo bloquear si el mensaje recibido es igual al anterior Y la respuesta IA también es igual a la anterior
          if (
            lastReply &&
            lastReply === textoParaIA &&
            lastAIResponse &&
            aiResponse[0] === lastAIResponse
          ) {
            // Es el mismo mensaje recibido y la misma respuesta IA, no respondas
            descartar('punto 7: condición no cumplida más adelante en el flujo')
            return
          }
          // Si vas a responder, guarda el mensaje recibido y la respuesta IA
          lastUnsyncedReplies.set(waIdToCheck, textoParaIA)
          lastUnsyncedAIResponse.set(waIdToCheck, aiResponse[0])

          // La respuesta de la IA es un mensaje SALIENTE: se cobra y se respeta
          // el tope igual que en la rama de contactos sincronizados. Sin esto,
          // la IA respondía gratis e ilimitado a los no agendados incluso con
          // el cupo del mes agotado.
          const usageResult = await incrementMessageUsage(number.userId)
          if (!usageResult.success) {
            console.error(
              'Límite de mensajes alcanzado, no se puede enviar respuesta de IA (no sincronizado):',
              usageResult.message
            )
            if (
              usageResult.message?.includes(
                'Límite mensual de mensajes alcanzado'
              )
            ) {
              await sendLimitReachedMessage(msg, chat, number)
              // El correo tiene un control diario EN MEMORIA que se pierde en
              // cada redespliegue; el evento lleva el periodo como clave de
              // dedupe en la base, así que sale una sola vez al mes.
              void emitirTopeAlcanzado(number.userId)
            }
            // Apagar el "escribiendo…": ya estaba encendido y no va a salir nada.
            io.to(numberId.toString()).emit('agente-escribiendo', {
              numberId,
              to: idToCheck,
              escribiendo: false
            })
            return
          }

          // Validar que el chat sigue disponible antes de responder
          try {
            // Verificar que el chat está activo y disponible
            if (!chat || !chat.id || !chat.id._serialized) {
              console.error(
                'Chat no disponible para responder a contacto no sincronizado'
              )
              descartar('punto 8: condición no cumplida más adelante en el flujo')
              return
            }

            // "Escribiendo…" en el WhatsApp de quien escribió. Va SIN await y con el
            // error capturado a propósito: es puro adorno, y estaba puesto de forma que
            // un fallo suyo se llevaba por delante la respuesta entera. Perder el
            // "escribiendo" es un detalle; perder la respuesta, no.
            void Promise.resolve(chat.sendStateTyping()).catch(() => {})
            await new Promise((res) => setTimeout(res, 1200)) // Simula que está escribiendo ~1.2s
            void Promise.resolve(chat.clearState()).catch(() => {})

            // Usar chat.sendMessage() en lugar de msg.reply() para evitar problemas de serialización
            await chat.sendMessage(aiResponse[0])
            console.log(
              `[msg] RESPUESTA ENVIADA · línea ${numberId} · chat ${chat.id._serialized} · ` +
                `"${String(aiResponse[0] ?? '').slice(0, 60)}"`
            )
            io.to(numberId.toString()).emit('agente-escribiendo', {
              numberId,
              to: idToCheck,
              escribiendo: false
            })

            // EMITIR actualización del historial después de respuesta IA para contacto no sincronizado
            try {
              const messages = await chat.fetchMessages({ limit: 30 })
              messages.sort(
                (a: Message, b: Message) => a.timestamp - b.timestamp
              )

              let lastMessageTimestamp: number | null = null
              if (messages && messages.length > 0) {
                const lastMsg = messages[messages.length - 1]
                if (lastMsg) {
                  lastMessageTimestamp = lastMsg.timestamp * 1000
                }
              }

              const chatHistory = messages.map((m: Message) => ({
                role: m.fromMe ? 'assistant' : 'user',
                content: m.body,
                timestamp: m.timestamp * 1000,
                to: chat.id._serialized,
                fromMe: m.fromMe
              }))

              io.to(numberId.toString()).emit('chat-history', {
                numberid: numberId,
                chatHistory,
                to: chat.id._serialized,
                lastMessageTimestamp
              })
              console.log(
                'Emitido chat-history para respuesta IA a contacto no sincronizado - numberId:',
                numberId
              )
            } catch (historyError) {
              console.error(
                'Error obteniendo historial después de respuesta IA no sincronizada:',
                historyError
              )
            }
          } catch (replyError) {
            // Los errores de serialización son normales en WhatsApp Web.js
            // Solo loguear si NO es un error de serialización
            if (
              replyError instanceof Error &&
              !replyError.message.includes('serialize') &&
              !replyError.message.includes('getMessageModel') &&
              !replyError.message.includes('Evaluation failed')
            ) {
              console.error(
                'Error crítico enviando respuesta a contacto no sincronizado:',
                replyError.message
              )
            }
            // No hacer nada más - los errores de serialización son normales
          }
          descartar('punto 9: condición no cumplida más adelante en el flujo')
          return
        }
      } catch (error) {
        console.error('Error en manejo de contacto no sincronizado:', error)
        // Registrar más detalles del error para debugging
        if (error instanceof Error) {
          console.error('Error stack:', error.stack)
        }
      }
      // (el motivo ya se explicó arriba, en "SIN RESPUESTA (contacto no agendado)")
      return
    }

    // --- GRUPO SINCRONIZADO ---
    if (
      isGroup &&
      number.aiEnabled === true &&
      number.responseGroups === true &&
      syncDb.agenteHabilitado === true
    ) {
      return handleIncomingMessageSynced(msg, chat, numberId, io, number, true)
    }

    // --- CONTACTO SINCRONIZADO ---
    if (
      !isGroup &&
      number.aiEnabled === true &&
      syncDb.agenteHabilitado === true
    ) {
      return handleIncomingMessageSynced(msg, chat, numberId, io, number, true)
    }

    // Si no, no responde
    descartar('punto 11: condición no cumplida más adelante en el flujo')
    return
  }

  // Nueva función para manejar la lógica de respuesta (sincronizado o no)
  async function handleIncomingMessageSynced(
    msg: Message,
    chat: Chat,
    numberId: string | number,
    io: Server,
    number: WhatsAppNumberType,
    isSynced: boolean,
    agentId?: number
  ) {
    try {
      // Validaciones de seguridad
      if (!chat || !chat.id) {
        console.error('Chat no válido en handleIncomingMessageSynced')
        descartar('punto 12: condición no cumplida más adelante en el flujo')
        return
      }

      const isGroup = chat.id.server === 'g.us'

      // Intentar obtener mensajes con manejo de errores
      let messages: Message[] = []
      try {
        messages = await chat.fetchMessages({ limit: 30 })
        messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
      } catch (fetchError) {
        console.error('Error al obtener mensajes del chat:', fetchError)
        // Continuar con array vacío en caso de error
        messages = []
      }
      let lastMessageTimestamp: number | null = null
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1]
        if (lastMsg) {
          lastMessageTimestamp = lastMsg.timestamp * 1000
        }
      }
      const chatHistory = messages.map((m: Message) => ({
        role: m.fromMe ? 'assistant' : 'user',
        content: m.body,
        timestamp: m.timestamp * 1000,
        to: chat.id._serialized,
        fromMe: m.fromMe
      }))
      io.to(numberId.toString()).emit('chat-history', {
        numberId,
        chatHistory,
        to: chat.id._serialized,
        lastMessageTimestamp
      })
      console.log(`Chat history emitted for numberId: ${numberId}, chatId: ${chat.id._serialized}`)
      console.log('Actualizando historial de chat')
      const shouldRespond =
        (!isGroup && number.aiEnabled) ||
        (isGroup && number.aiEnabled && number.responseGroups) ||
        (!isGroup && number.aiUnknownEnabled && !isSynced) // Solo para no sincronizados
      if (!shouldRespond) {
        // Sin esta línea, "el agente no contesta" era indistinguible de "el mensaje se
        // perdió": los dos se veían igual desde fuera. Aquí se ve QUÉ interruptor lo frenó.
        console.log(
          `[msg] SIN RESPUESTA · línea ${numberId} · chat ${idToCheck} · ` +
            `IA=${number.aiEnabled ? 'on' : 'off'}, grupo=${isGroup}, ` +
            `responder-grupos=${number.responseGroups ? 'on' : 'off'}, ` +
            `no-agendados=${number.aiUnknownEnabled ? 'on' : 'off'}, sincronizado=${isSynced}`
        )
        return
      }
      console.log(`[msg] IA PENSANDO · línea ${numberId} · chat ${idToCheck}`)
      io.to(numberId.toString()).emit('agente-escribiendo', {
        numberId,
        to: idToCheck,
        escribiendo: true
      })
      if (shouldRespond) {
        // Convertir chatHistory al formato mínimo requerido por getAIResponse
        const aiChatHistory = chatHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          to: chat.id // Usar el ChatId original
        }))

        // Punto de escritura #2 del consumo de IA. Esta es la rama CARA: manda
        // hasta 30 mensajes de historial más el prompt del agente, así que los
        // tokens de ENTRADA son casi siempre mayores que los de salida. Antes se
        // descartaba hasta el conteo de salida.
        const inicioIA = Date.now()
        let respuestaIA
        try {
          respuestaIA = await getAIResponse(
            number.aiPrompt,
            textoParaIA,
            number.aiModel,
            aiChatHistory
          )
        } catch (errorIA) {
          void registrarUsoIA({
            userId: number.userId,
            numberId,
            agentId: agentId ?? null,
            model: number.aiModel || 'gemini-3.6-flash',
            latencyMs: Date.now() - inicioIA,
            ok: false,
            errorKind: clasificarErrorIA(errorIA)
          })
          throw errorIA
        }
        void registrarUsoIA({
          userId: number.userId,
          numberId,
          agentId: agentId ?? null,
          model: number.aiModel || 'gemini-3.6-flash',
          uso: respuestaIA[1],
          latencyMs: Date.now() - inicioIA
        })
        const [aiResponse] = respuestaIA
        const fraseAsesorEspecial =
          'Un momento, por favor. Un asesor especializado te atenderá en breve.'
        const finalResponse = aiResponse
        let agent = null
        if (agentId) {
          const agentResult = await supabase
            .from('Agent')
            .select('id, title, advisorEmail, allowAdvisor, ownerId')
            .eq('id', agentId)
            .single()
          agent = agentResult.data
        } else {
          const agentResult = await supabase
            .from('Agent')
            .select('id, title, advisorEmail, allowAdvisor, ownerId')
            .eq('ownerId', number.userId)
            .eq('isGlobal', false)
            .order('id', { ascending: false })
            .limit(1)
            .single()
          agent = agentResult.data
        }
        // El evento se emite ANTES y con una condición más laxa que el correo de
        // abajo: el escalamiento OCURRIÓ aunque el agente no tenga advisorEmail
        // configurado y aunque no haya SMTP. El bloque de abajo se queda tal
        // cual —es el aviso monotenant que ya existía— y este carril lleva el
        // mismo hecho a los destinos que el cliente configuró en Conexiones.
        if (
          typeof aiResponse === 'string' &&
          aiResponse.trim().toLowerCase() === fraseAsesorEspecial.toLowerCase() &&
          agent &&
          agent.allowAdvisor
        ) {
          void emitirEscalamiento({
            numberId,
            msg,
            chat,
            agente: { id: agent.id, title: agent.title },
            ultimos: messages
          })
        }

        if (
          typeof aiResponse === 'string' &&
          aiResponse.trim().toLowerCase() ===
            fraseAsesorEspecial.toLowerCase() &&
          agent &&
          agent.allowAdvisor &&
          agent.advisorEmail
        ) {
          try {
            const fecha = new Date().toLocaleString('es-CO', {
              timeZone: 'America/Bogota'
            })
            // Obtener los últimos 5 mensajes del historial
            const ultimosMensajes = messages
              .slice(-5)
              .map((m: Message) => {
                const quien = m.fromMe ? 'Bot' : 'Cliente'
                return `<tr><td style='vertical-align:top;'><b>${quien}:</b></td><td>${m.body}</td></tr>`
              })
              .join('')
            // Extract client phone number from msg.from
            const clientPhone: string =
              (msg.from || 'unknown@domain.com').split('@')[0] ?? 'desconocido'

            if (!transporter) {
              console.error('⚠️ Servicio de correo no configurado. No se pudo enviar notificación al asesor.')
              return
            }

            await transporter.sendMail({
              from: process.env.SMTP_USER,
              to: agent.advisorEmail,
              subject: `Nuevo cliente quiere hablar con un asesor (${agent.title})`,
              html: advisorRequestEmailTemplate(
                msg.body || '',
                fecha,
                clientPhone,
                number.number || '',
                agent.title,
                ultimosMensajes
              )
            })
            // DESACTIVAR IA para este contacto (sincronizado o no).
            // Por los DOS ids del chat (crudo y clásico, idsDelChat): en un chat
            // @lid la agenda guarda el clásico, y buscar solo por el crudo no
            // encontraba la fila — la IA seguía contestando después de que el
            // cliente pidiera un asesor humano.
            const { data: syncedContactRows } = await supabase
              .from('SyncedContactOrGroup')
              .select('id')
              .eq('numberId', numberId)
              .in('wa_id', idsDelChat)
              .eq('type', isGroup ? 'group' : 'contact')
              .limit(1)
            const syncedContact = syncedContactRows?.[0] ?? null
            if (syncedContact && syncedContact.id) {
              await supabase
                .from('SyncedContactOrGroup')
                .update({ agenteHabilitado: false })
                .eq('id', syncedContact.id)
              // Emitir evento socket para refrescar sincronizados
              if (io && typeof io.to === 'function') {
                io.to(numberId.toString()).emit('synced-contacts-updated', {
                  numberid: numberId
                })
              }
            } else {
              // Si no está sincronizado, busca en Unsyncedcontact — también por
              // los dos ids: la ficha de un @lid se guarda con el clásico.
              const { data: unsyncedContactRows } = await supabase
                .from('Unsyncedcontact')
                .select('id')
                .eq('numberid', numberId)
                .in('wa_id', idsDelChat)
                .limit(1)
              const unsyncedContact = unsyncedContactRows?.[0] ?? null
              if (unsyncedContact && unsyncedContact.id) {
                await supabase
                  .from('Unsyncedcontact')
                  .update({ agentehabilitado: false })
                  .eq('id', unsyncedContact.id)
                // Emitir evento socket para refrescar no sincronizados
                if (io && typeof io.to === 'function') {
                  io.to(numberId.toString()).emit('unsynced-contacts-updated', {
                    numberid: numberId
                  })
                }
              }
            }
          } catch {
            console.error(
              'Error enviando notificación al asesor:',
              agent.advisorEmail
            )
          }
        }
        if (finalResponse) {
          // Check message limit before sending AI response
          const usageResult = await incrementMessageUsage(number.userId)
          if (!usageResult.success) {
            console.error(
              'Límite de mensajes alcanzado, no se puede enviar respuesta de IA:',
              usageResult.message
            )

            // Send upgrade email when limit is reached
            if (
              usageResult.message?.includes(
                'Límite mensual de mensajes alcanzado'
              )
            ) {
              await sendLimitReachedMessage(msg, chat, number)
              // El evento vivía en el cobro del ENTRANTE, que ya no existe;
              // se emite aquí, donde de verdad se topa con el límite.
              void emitirTopeAlcanzado(number.userId)
            }

            return // Don't send AI response if limit is reached
          }

          // El "escribiendo..." es cosmético y su promesa iba SUELTA: si fallaba, solo
          // la recogía el `unhandledRejection` global. Se le pone catch para que nunca
          // tumbe el envío de la respuesta, que es lo que de verdad importa.
          void Promise.resolve(chat.sendStateTyping()).catch(() => {})
          const messageLength = (finalResponse as string).length
          const baseDelay = 2000
          const additionalDelay = Math.min(2000, messageLength * 50)
          const totalDelay = baseDelay + additionalDelay

          setTimeout(async () => {
            try {
              // Validar que el chat sigue disponible
              if (!chat || !chat.id || !chat.id._serialized) {
                console.error('Chat no disponible para enviar respuesta de IA')
                return
              }

              await chat.clearState()

              // Intentar enviar el mensaje usando chat.sendMessage()
              await chat.sendMessage(finalResponse as string)
              console.log(
                `[msg] RESPUESTA ENVIADA · línea ${numberId} · chat ${idToCheck} · ` +
                  `"${String(finalResponse ?? '').slice(0, 60)}"`
              )
              // Apagar el "escribiendo…". Esta rama lo encendía y NO lo apagaba nunca,
              // así que los tres puntos se quedaban pegados para siempre después de la
              // primera respuesta en un grupo.
              io.to(numberId.toString()).emit('agente-escribiendo', {
                numberId,
                to: idToCheck,
                escribiendo: false
              })

              // EMITIR INMEDIATAMENTE la actualización del historial después de enviar
              chatHistory.push({
                role: 'assistant',
                content: finalResponse as string,
                timestamp: getCurrentUTCDate().getTime(),
                to: chat.id._serialized,
                fromMe: true
              })

              const now = getCurrentUTCDate().getTime();
              const numberIdNum = typeof numberId === 'string' ? Number(numberId) : numberId;
              if (!lastChatHistoryEmit[numberIdNum] || now - lastChatHistoryEmit[numberIdNum] > 1000) {
                io.to(numberId.toString()).emit('chat-history', {
                  numberId,
                  chatHistory,
                  to: chat.id._serialized,
                  lastMessageTimestamp: now
                });
                lastChatHistoryEmit[numberIdNum] = now;
                console.log(
                  'Emitido chat-history inmediato después de respuesta IA - numberId:',
                  numberId
                );
              } else {
                console.log(
                  'Emisión de chat-history omitida para evitar duplicados - numberId:',
                  numberId
                );
              }
              console.log(
                'Emitido chat-history inmediato después de respuesta IA - numberId:',
                numberId
              )
            } catch (sendError) {
              // ESTE FILTRO ESCONDÍA JUSTO EL FALLO QUE ESTAMOS PERSIGUIENDO.
              //
              // Callaba los errores que contienen 'serialize', 'getMessageModel' o
              // 'Evaluation failed' por considerarlos "normales". Son precisamente los
              // que lanza el WhatsApp Web de dentro del navegador cuando la versión que
              // sirve Meta no encaja con la librería. Resultado: el agente no enviaba
              // NADA y en el log no quedaba ni una línea que lo dijera; desde fuera
              // parecía que la IA simplemente no había querido contestar.
              //
              // Ahora se registra SIEMPRE. Los conocidos bajan a warn para no disparar
              // alertas, pero se ven; el resto sigue siendo error.
              const detalle =
                sendError instanceof Error ? sendError.message : String(sendError)
              const esFalloConocidoDelNavegador =
                detalle.includes('serialize') ||
                detalle.includes('getMessageModel') ||
                detalle.includes('Evaluation failed')
              if (esFalloConocidoDelNavegador) {
                console.warn(
                  `⚠️ La respuesta de la IA NO se pudo enviar al chat ${chat?.id?._serialized ?? '?'} (línea ${numberId}): ${detalle.slice(0, 200)}. Es un fallo del WhatsApp Web del navegador, no del contenido.`
                )
              } else {
                console.error(
                  `❌ Error crítico enviando respuesta de IA al chat ${chat?.id?._serialized ?? '?'} (línea ${numberId}):`,
                  detalle
                )
              }
            }
          }, totalDelay)

          // Opcional: Después de un delay adicional, obtener mensajes actualizados desde WhatsApp
          setTimeout(async () => {
            try {
              const updatedMessages = await chat.fetchMessages({ limit: 30 })
              updatedMessages.sort(
                (a: Message, b: Message) => a.timestamp - b.timestamp
              )
              const updatedChatHistory = updatedMessages.map((m: Message) => ({
                role: m.fromMe ? 'assistant' : 'user',
                content: m.body,
                timestamp: m.timestamp * 1000,
                to: chat.id._serialized,
                fromMe: m.fromMe
              }))
              let lastMessageTimestamp: number | null = null
              if (updatedMessages && updatedMessages.length > 0) {
                const lastMsg = updatedMessages[updatedMessages.length - 1]
                if (lastMsg) {
                  lastMessageTimestamp = lastMsg.timestamp * 1000
                }
              }
              io.to(numberId.toString()).emit('chat-history', {
                numberId,
                chatHistory: updatedChatHistory,
                to: chat.id._serialized,
                lastMessageTimestamp
              })
              console.log(
                'Emitido chat-history actualizado desde WhatsApp - numberId:',
                numberId
              )
            } catch (fetchError) {
              console.error(
                'Error al refrescar el historial del chat después de responder:',
                fetchError
              )
            }
          }, totalDelay + 1000) // 1 segundo después del envío
        }
      }
    } catch (syncError) {
      console.error('Error en handleIncomingMessageSynced:', syncError)
      if (syncError instanceof Error) {
        console.error('Error stack:', syncError.stack)
      }
    }
  }
}

// Endpoint to get message usage statistics
export async function getMessageUsage(req: CustomRequest, res: Response) {
  try {
    if (!req.user?.username) {
      res.status(HttpStatusCode.Unauthorized).json({
        message: 'Usuario no autenticado'
      })
      return
    }

    // Obtener información del usuario autenticado
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, subscription')
      .eq('username', req.user.username)
      .single()

    if (userError || !user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'Usuario no encontrado'
      })
      return
    } // Llamar función RPC directamente desde aquí
    const { data: usageStats, error: usageError } = await supabase.rpc(
      'get_user_message_usage',
      { p_user_id: user.id }
    )

    if (usageError || !usageStats || usageStats.length === 0) {
      console.error('Error obteniendo estadísticas de uso:', usageError)
      res.status(HttpStatusCode.InternalServerError).json({
        message: 'Error obteniendo estadísticas de uso'
      })
      return
    }

    // La función RPC devuelve un array, tomamos el primer elemento
    const stats = usageStats[0]

    // Obtener números de WhatsApp
    const { data: numbers, error: numbersError } = await supabase
      .from('WhatsAppNumber')
      .select('id, number, name')
      .eq('userId', user.id)

    if (numbersError) {
      console.error('Error obteniendo números:', numbersError)
    }

    res.status(HttpStatusCode.Ok).json({
      usage: stats.current_usage,
      limit: stats.msg_limit,
      plan: stats.plan,
      remaining: stats.msg_limit - stats.current_usage,
      percentage:
        stats.msg_limit > 0
          ? Math.round((stats.current_usage / stats.msg_limit) * 100)
          : 0,
      totalNumbers: numbers?.length || 0,
      numbers: numbers || []
    })
  } catch (error) {
    console.error('Error obteniendo uso de mensajes:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error interno del servidor'
    })
  }
}
