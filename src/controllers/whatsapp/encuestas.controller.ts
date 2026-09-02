// Envío de encuestas nativas de WhatsApp y lectura de sus votos.
//
// Vive en un archivo propio —y no dentro de messages.controller.ts— porque ese
// archivo está congelado: el camino de envío con cobro se replica aquí con las
// MISMAS dos llamadas a la base (app.increment_message_usage para reservar,
// app.refund_message_usage para devolver si el envío falla). Si el día de
// mañana el cobro cambia, cambia en la base y los dos controladores lo heredan.
//
// Los votos NO se escriben aquí: llegan por el evento 'vote_update' de
// whatsapp-web.js y los guarda el listener de session.controller.ts en
// app.poll_votes. Este archivo solo los LEE para pintar el conteo.
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import whatsappWeb from 'whatsapp-web.js'

import { supabase } from '../../config/db.js'
import type { CustomRequest } from '../../interfaces/global.js'
import { ES_ID_WHATSAPP } from '../../lib/chatDeRespaldo.js'
import { query } from '../../lib/db.js'
import { exigirNumeroPropio } from '../../lib/propiedad.js'
import { clienteVivo } from '../../WhatsAppClients.js'

// `Poll` es una clase en runtime (node_modules/whatsapp-web.js/src/structures/
// Poll.js): `new Poll(pollName, pollOptions, { allowMultipleAnswers })`.
// Client.sendMessage la reconoce por instanceof (Client.js:1486) y la convierte
// en `internalOptions.poll`, así que va por el MISMO camino que un texto.
const { Poll } = whatsappWeb

/** Límites del propio WhatsApp para una encuesta. */
const MIN_OPCIONES = 2
const MAX_OPCIONES = 12

interface EnviarEncuestaBody {
  numberId?: number | string
  to?: string
  pregunta?: string
  opciones?: unknown
  allowMultipleAnswers?: boolean
}

/**
 * POST /api/whatsapp/encuestas/enviar
 * { numberId, to, pregunta, opciones: string[2..12], allowMultipleAnswers? }
 *
 * El cupo se RESERVA antes de enviar y se devuelve si el envío falla — calcado
 * de sendMessage (messages.controller.ts): comprobar y cobrar son la misma
 * operación en la base (FOR UPDATE), así que dos envíos simultáneos en el
 * límite no pasan los dos.
 */
export async function enviarEncuesta(req: CustomRequest, res: Response) {
  try {
    const { numberId, to, pregunta, opciones, allowMultipleAnswers } =
      req.body as EnviarEncuestaBody

    const destino = String(to ?? '').trim()
    if (!ES_ID_WHATSAPP.test(destino)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El destinatario no es un WhatsApp ID válido',
        to: destino
      })
      return
    }

    const textoPregunta = String(pregunta ?? '').trim()
    if (!textoPregunta) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta la pregunta de la encuesta' })
      return
    }

    // Las opciones se limpian ANTES de contar: dos opciones y una vacía es, a
    // efectos reales, una encuesta de una sola opción y WhatsApp la rechazaría
    // del otro lado con un error opaco.
    const listaOpciones = (Array.isArray(opciones) ? opciones : [])
      .map((o) => String(o ?? '').trim())
      .filter(Boolean)
    if (
      listaOpciones.length < MIN_OPCIONES ||
      listaOpciones.length > MAX_OPCIONES
    ) {
      res.status(HttpStatusCode.BadRequest).json({
        message: `La encuesta necesita entre ${MIN_OPCIONES} y ${MAX_OPCIONES} opciones no vacías`
      })
      return
    }
    // Opciones repetidas: WhatsApp las colapsa y el conteo por nombre se vuelve
    // ambiguo. Mejor rechazarlas con un mensaje claro.
    if (new Set(listaOpciones).size !== listaOpciones.length) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Hay opciones repetidas en la encuesta' })
      return
    }

    // Propiedad verificada: el número tiene que ser del usuario del token, igual
    // que en send-message. Devuelve la fila con el userId, que es a quien se le
    // cobra el mensaje.
    const number = await exigirNumeroPropio(req, res, { id: numberId })
    if (!number) return

    const client = clienteVivo(number.id)
    if (!client) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'No hay sesión activa para este número' })
      return
    }

    // Reserva del cupo ANTES de enviar (misma RPC que el envío de texto).
    const { data, error } = await supabase.rpc('increment_message_usage', {
      p_user_id: number.userId
    })
    if (error) {
      console.error('Error en increment_message_usage (encuesta):', error)
      res
        .status(HttpStatusCode.InternalServerError)
        .json({ message: 'Error consultando uso de mensajes' })
      return
    }
    const fila = (Array.isArray(data) ? data[0] : undefined) as
      | { allowed?: boolean; current_usage?: number; message_limit?: number }
      | undefined
    if (!fila) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    if (!fila.allowed) {
      res.status(HttpStatusCode.BadRequest).json({
        message:
          Number(fila.message_limit ?? 0) === 0
            ? 'El plan del usuario no tiene tope configurado en PlanLimit'
            : 'Límite mensual de mensajes alcanzado',
        currentUsage: Number(fila.current_usage ?? 0),
        limit: Number(fila.message_limit ?? 0)
      })
      return
    }

    try {
      const encuesta = new Poll(textoPregunta, listaOpciones, {
        allowMultipleAnswers: allowMultipleAnswers === true,
        // El tipo lo exige explícito; undefined = la librería genera el secreto
        // interno de la encuesta al enviarla (uso normal).
        messageSecret: undefined
      })
      const enviado = await client.sendMessage(destino, encuesta)
      res.status(HttpStatusCode.Ok).json({
        message: 'Encuesta enviada',
        // El id del mensaje-encuesta: es el poll_id con el que llegarán los
        // votos a app.poll_votes, por si el front quiere correlacionarlos.
        pollId: enviado?.id?._serialized ?? null
      })
    } catch (envioError) {
      // La reserva puede sobrar; la encuesta enviada gratis, no. Si la
      // devolución también falla solo se avisa: el error que importa contar es
      // el del envío (mismo criterio que devolverMessageUsage).
      try {
        await query('SELECT app.refund_message_usage($1)', [number.userId])
        console.warn(
          `↩️ Cupo devuelto al usuario ${number.userId}: la encuesta no se pudo enviar (${
            envioError instanceof Error ? envioError.message : String(envioError)
          }).`
        )
      } catch (refundError) {
        console.error(
          `❌ No se pudo devolver el cupo del usuario ${number.userId} tras fallar la encuesta:`,
          refundError instanceof Error ? refundError.message : refundError
        )
      }
      throw envioError
    }
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error interno del servidor al enviar la encuesta: ${
        (error as Error).message
      }`
    })
  }
}

/**
 * GET /api/whatsapp/encuestas/votos?numberId=X&chatId=<wa_id>
 *
 * Devuelve los votos guardados de las encuestas de un chat, para que el front
 * pinte el conteo al abrir la conversación (los votos nuevos llegan en vivo por
 * el evento de socket 'poll-vote').
 */
export async function votosDeEncuestas(req: CustomRequest, res: Response) {
  try {
    const { numberId, chatId } = req.query as {
      numberId?: string
      chatId?: string
    }

    const chat = String(chatId ?? '').trim()
    if (!ES_ID_WHATSAPP.test(chat)) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'chatId no es un WhatsApp ID válido' })
      return
    }

    const number = await exigirNumeroPropio(req, res, { id: numberId })
    if (!number) return

    const { rows } = await query<{
      poll_id: string
      pregunta: string | null
      votante: string
      opcion: string[]
      voted_at: string | number
    }>(
      `SELECT poll_id, pregunta, votante, opcion, voted_at
         FROM app.poll_votes
        WHERE numberid = $1 AND chat = $2
        ORDER BY voted_at ASC`,
      [number.id, chat]
    )

    res.status(HttpStatusCode.Ok).json(
      rows.map((r) => ({
        pollId: r.poll_id,
        pregunta: r.pregunta,
        votante: r.votante,
        // jsonb llega ya parseado por pg; se blinda por si una fila vieja
        // guardara otra cosa.
        opciones: Array.isArray(r.opcion) ? r.opcion : [],
        votedAt: Number(r.voted_at)
      }))
    )
  } catch (error) {
    console.error('Error leyendo votos de encuestas:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error interno del servidor al leer los votos' })
  }
}
