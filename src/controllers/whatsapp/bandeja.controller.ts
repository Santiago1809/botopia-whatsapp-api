// Acciones de bandeja sobre los chats de una línea: fijar, archivar y marcar
// como no leído — más la foto del estado (qué chats están fijados/archivados)
// para que la lista de la app refleje lo que el teléfono ya sabe.
//
// TODO por id de chat y SIN getChatById: los métodos del Client
// (pinChat/archiveChat/markChatUnread, Client.js:2007-2131 en 1.34.7) resuelven
// el chat dentro del navegador con `getChat(chatId, { getAsModel: false })`,
// que se salta `getChatModel` — el módulo que hoy revienta con grupos y @lid
// (mismo motivo documentado en lib/chatDeRespaldo.ts). Pasar antes por
// `getChatById` para llamar `chat.pin()` sería sumar el paso frágil para
// terminar en la misma llamada.
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'

import type { CustomRequest } from '../../interfaces/global.js'
import { ES_ID_WHATSAPP } from '../../lib/chatDeRespaldo.js'
import { exigirNumeroPropio, type NumeroPropio } from '../../lib/propiedad.js'
import { clienteVivo } from '../../WhatsAppClients.js'
import type { Client } from 'whatsapp-web.js'

// La lectura del estado corre DENTRO del navegador de puppeteer, donde `window`
// existe. El tsconfig de este backend no carga la lib DOM (mismo patrón que
// lib/chatDeRespaldo.ts), así que se declara a mano lo poco que se usa.
declare const window: {
  require: (modulo: string) => {
    Chat: {
      getModelsArray: () => Array<{
        id?: { _serialized?: string }
        pin?: number
        archive?: boolean
        unreadCount?: number
      }>
    }
  }
}

interface AccionBandejaBody {
  numberId?: number | string
  chatId?: string
}

/**
 * Valida cuerpo, propiedad y sesión — el prólogo común de las tres acciones.
 * Devuelve null si ya respondió con el error correspondiente.
 */
async function prepararAccion(
  req: CustomRequest,
  res: Response
): Promise<{ client: Client; chatId: string; number: NumeroPropio } | null> {
  const { numberId, chatId } = req.body as AccionBandejaBody

  const idChat = String(chatId ?? '').trim()
  if (!ES_ID_WHATSAPP.test(idChat)) {
    res.status(HttpStatusCode.BadRequest).json({
      message: 'chatId no es un WhatsApp ID válido',
      chatId: idChat
    })
    return null
  }

  // Propiedad verificada: sin esto, cualquier cuenta podría archivarle los
  // chats a otra probando numberIds seriales.
  const number = await exigirNumeroPropio(req, res, { id: numberId })
  if (!number) return null

  const client = clienteVivo(number.id)
  if (!client) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'No hay sesión activa para este número' })
    return null
  }

  return { client, chatId: idChat, number }
}

/**
 * POST /api/whatsapp/bandeja/pin  { numberId, chatId, pinned: boolean }
 * Responde { pinned } con el estado REAL: WhatsApp limita los fijados a 3 y
 * `pinChat` devuelve false cuando el tope ya está lleno — el front tiene que
 * saberlo para no pintar un pin que no ocurrió.
 */
export async function fijarChat(req: CustomRequest, res: Response) {
  try {
    const contexto = await prepararAccion(req, res)
    if (!contexto) return
    const { pinned } = req.body as { pinned?: boolean }

    const resultado =
      pinned === false
        ? await contexto.client.unpinChat(contexto.chatId)
        : await contexto.client.pinChat(contexto.chatId)

    res.status(HttpStatusCode.Ok).json({
      pinned: resultado === true,
      ...(pinned !== false && resultado !== true
        ? { message: 'WhatsApp solo permite 3 chats fijados' }
        : {})
    })
  } catch (error) {
    console.error('Error fijando chat:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo cambiar el fijado del chat' })
  }
}

/** POST /api/whatsapp/bandeja/archive  { numberId, chatId, archived: boolean } */
export async function archivarChat(req: CustomRequest, res: Response) {
  try {
    const contexto = await prepararAccion(req, res)
    if (!contexto) return
    const { archived } = req.body as { archived?: boolean }

    if (archived === false) await contexto.client.unarchiveChat(contexto.chatId)
    else await contexto.client.archiveChat(contexto.chatId)

    res.status(HttpStatusCode.Ok).json({ archived: archived !== false })
  } catch (error) {
    console.error('Error archivando chat:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo cambiar el archivado del chat' })
  }
}

/** POST /api/whatsapp/bandeja/mark-unread  { numberId, chatId } */
export async function marcarNoLeido(req: CustomRequest, res: Response) {
  try {
    const contexto = await prepararAccion(req, res)
    if (!contexto) return

    await contexto.client.markChatUnread(contexto.chatId)
    res.status(HttpStatusCode.Ok).json({ ok: true })
  } catch (error) {
    console.error('Error marcando chat como no leído:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo marcar el chat como no leído' })
  }
}

/**
 * GET /api/whatsapp/bandeja/estado?numberId=X
 * → { [wa_id]: { pinned, archived, unreadCount } }
 *
 * NO usa `client.getChats()`: ese camino pasa cada chat por
 * `window.WWebJS.getChatModel` (Utils.js:920-926) y basta UN chat @lid o grupo
 * para que el Promise.all entero rechace con el error minificado "r" — la
 * lista completa se caería por un solo chat. Aquí se lee la colección cruda y
 * solo los tres campos que la bandeja necesita, que no requieren serializar
 * ningún modelo.
 */
export async function estadoDeBandeja(req: CustomRequest, res: Response) {
  try {
    const { numberId } = req.query as { numberId?: string }
    const number = await exigirNumeroPropio(req, res, { id: numberId })
    if (!number) return

    const client = clienteVivo(number.id)
    if (!client || !client.pupPage) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'No hay sesión activa para este número' })
      return
    }

    const filas = await client.pupPage.evaluate(() => {
      const chats = window.require('WAWebCollections').Chat.getModelsArray()
      return chats.map((c) => ({
        id: c?.id?._serialized ?? '',
        // `pin` es el rango de fijado (número) y `archive` el booleano crudo,
        // exactamente lo que la librería normaliza en Chat.js:58-64.
        pinned: !!c?.pin,
        archived: !!c?.archive,
        // -1 significa "marcado como no leído a mano": también cuenta.
        unreadCount: Number(c?.unreadCount ?? 0)
      }))
    })

    const estado: Record<
      string,
      { pinned: boolean; archived: boolean; unreadCount: number }
    > = {}
    for (const fila of filas) {
      if (!fila.id) continue
      estado[fila.id] = {
        pinned: fila.pinned,
        archived: fila.archived,
        unreadCount: fila.unreadCount
      }
    }
    res.status(HttpStatusCode.Ok).json(estado)
  } catch (error) {
    console.error('Error leyendo el estado de la bandeja:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'No se pudo leer el estado de la bandeja de esta línea'
    })
  }
}
