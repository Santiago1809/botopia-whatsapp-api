// EL CHAT QUE WHATSAPP NO NOS QUISO DAR, RECONSTRUIDO DESDE EL PROPIO MENSAJE.
//
// EL SÍNTOMA: el usuario vincula su WhatsApp, el QR funciona, la sesión queda
// activa... y no entra NADA. En la app el chat dice "Sin mensajes" y el agente
// no contesta. En el log del servidor solo aparecía:
//     ❌ Mensaje entrante PERDIDO en la línea 4 (de 101692108443891@lid): r
//     ❌ No se pudo cargar el historial del chat 1203634...@g.us: r
// Ese "r" de una sola letra es un error MINIFICADO: no nace en nuestro código,
// nace dentro del WhatsApp Web que corre en el navegador de puppeteer.
//
// LA CAUSA: `msg.getChat()` NO es una llamada genérica; es literalmente
// `client.getChatById(msg.from)` (Message.js:387 -> `getChat() { return
// this.client.getChatById(this._getChatId()) }`, y `_getChatId()` es
// `fromMe ? to : from`, Message.js:347 — en el evento `message` siempre
// `fromMe === false` porque Client.js:657 hace `if (msg.id.fromMe) return`
// antes de emitirlo). Y `getChatById` pide el chat CON MODELO
// (`getAsModel` vale true por defecto, Client.js:1693), lo que obliga a pasar
// por `window.WWebJS.getChatModel`. Ahí dentro (Utils.js:938-1004) se hace
// `chat.serialize()`, `groupMetadata.update(chatWid)` y
// `window.require('WAWebLidMigrationUtils')` — un módulo del navegador que la
// versión de WhatsApp Web que Meta está sirviendo hoy puede no exponer con ese
// nombre. Si ese `require` no resuelve, revienta y el mensaje se perdía.
//
// EL ARREGLO: de todo el objeto Chat, este backend solo usa `id._serialized`,
// `id.server` y cuatro métodos —`sendMessage`, `sendStateTyping`, `clearState`
// y `fetchMessages`—, y los cuatro son azúcar sobre `client` + el id
// serializado (Chat.js:101, 252, 272, 219). O sea: el id lo tenemos en el
// propio mensaje y no hace falta preguntárselo al navegador. Un mensaje
// entrante NUNCA debería perderse porque `getChat()` falle.
//
// Se instancia la CLASE REAL de la librería (exportada en su index.js) en vez
// de inventar un objeto: así ningún método se queda fuera por olvido.
import whatsappWeb from 'whatsapp-web.js'
import type { Chat, Client, Message } from 'whatsapp-web.js'

// En el index.d.ts, Chat/PrivateChat/GroupChat están declarados como
// `interface` (index.d.ts:1866, 2099, 2177), no como clase: TypeScript no deja
// hacerles `new`. Pero en RUNTIME sí son clases y están exportadas
// (node_modules/whatsapp-web.js/index.js: `PrivateChat: require(...)`,
// `GroupChat: require(...)`). El cast solo recupera el constructor.
const constructores = whatsappWeb as unknown as {
  PrivateChat?: new (client: Client, data: unknown) => Chat
  GroupChat?: new (client: Client, data: unknown) => Chat
}

// Las funciones de `sendStateTyping`/`clearState` se serializan y se ejecutan
// DENTRO del navegador, donde `window` sí existe. El tsconfig de este backend
// solo carga la lib ES2022 (nada de DOM), así que hay que declararlo a mano.
declare const window: {
  WWebJS: { sendChatstate: (estado: string, chatId: string) => unknown }
}

type IdChat = { server: string; user: string; _serialized: string }

/**
 * Parte un id de WhatsApp en las tres piezas que usa el resto del código.
 * Sirve para `@c.us` (persona), `@g.us` (grupo) y `@lid` (el identificador
 * nuevo de WhatsApp), sin dar por hecho ningún sufijo concreto.
 */
function widDe(serializado: string): IdChat | null {
  const arroba = serializado.lastIndexOf('@')
  if (arroba <= 0 || arroba === serializado.length - 1) return null
  return {
    user: serializado.slice(0, arroba),
    server: serializado.slice(arroba + 1),
    _serialized: serializado
  }
}

/**
 * El id del chat al que pertenece un mensaje, con la MISMA regla que usa la
 * librería (`fromMe ? to : from`, Message.js:347). Es exactamente el id que se
 * le habría pedido a WhatsApp, así que el chat sustituto queda indistinguible
 * del real para todo lo que hace este backend.
 *
 * Nunca se reconstruye un `@c.us` a mano: si el mensaje no trae un id con
 * arroba, se devuelve null y quien llama decide.
 */
export function idDeChatDelMensaje(msg: Message): string | null {
  const candidatos = [
    msg?.fromMe ? msg?.to : msg?.from,
    // `msg.id.remote` viene ya serializado como texto desde el navegador
    // (Utils.js:831-834). Es la red por si `from`/`to` faltaran.
    msg?.id?.remote
  ]
  for (const candidato of candidatos) {
    if (typeof candidato === 'string' && candidato.includes('@')) {
      return candidato.trim()
    }
  }
  return null
}

/**
 * Un Chat utilizable construido solo con el id, sin preguntarle nada al
 * navegador.
 *
 * OJO para quien venga después: en un grupo, `groupMetadata` queda `undefined`,
 * así que `chat.owner`, `chat.participants`, `chat.description` y
 * `chat.createdAt` LANZARÍAN (son getters sobre `groupMetadata`,
 * GroupChat.js:27 en adelante). Hoy no se usa ninguno. Si algún día hacen
 * falta, hay que pedirle el chat de verdad a WhatsApp y aceptar que puede
 * fallar.
 */
export function chatDeRespaldo(
  client: Client,
  idSerializado: string,
  timestamp = 0
): Chat | null {
  const id = widDe(idSerializado)
  if (!id) return null

  const esGrupo = id.server === 'g.us'
  const datos = {
    id,
    isGroup: esGrupo,
    isReadOnly: false,
    unreadCount: 0,
    timestamp,
    archived: false,
    pinned: false,
    isMuted: false,
    muteExpiration: 0
  }

  // `Chat._patch` solo asigna campos y el único imprescindible es `data.id`
  // (Chat.js:16-22); el resto queda undefined sin lanzar.
  const Constructor = esGrupo
    ? constructores.GroupChat
    : constructores.PrivateChat
  if (typeof Constructor === 'function') {
    try {
      return new Constructor(client, datos)
    } catch {
      // Cae al plan B de abajo.
    }
  }

  // PLAN B: si una versión futura de la librería dejara de exportar esas clases,
  // el mensaje TAMPOCO se pierde. Se delega a mano en el cliente, que es lo
  // mismo que hacen los métodos reales.
  return {
    ...datos,
    sendMessage: (contenido: unknown, opciones?: unknown) =>
      (
        client as unknown as {
          sendMessage: (a: string, b: unknown, c?: unknown) => Promise<unknown>
        }
      ).sendMessage(id._serialized, contenido, opciones),
    sendSeen: () => client.sendSeen(id._serialized),
    sendStateTyping: () =>
      client.pupPage?.evaluate((chatId: string) => {
        window.WWebJS.sendChatstate('typing', chatId)
        return true
      }, id._serialized),
    clearState: () =>
      client.pupPage?.evaluate((chatId: string) => {
        window.WWebJS.sendChatstate('stop', chatId)
        return true
      }, id._serialized),
    // Sin el chat real no hay historial que devolver: array vacío, nunca una
    // excepción. Perder el historial es una degradación; perder el mensaje no.
    fetchMessages: async () => []
  } as unknown as Chat
}

/**
 * Pide el chat a WhatsApp y, si el navegador falla, sigue adelante con el
 * sustituto. NUNCA lanza: devolver null solo es posible si el id no es un id de
 * WhatsApp.
 *
 * `motivo` sale por el log para que el fallo del navegador quede a la vista en
 * vez de esconderse detrás de un chat que "funciona".
 */
export async function resolverChat(
  client: Client,
  idSerializado: string,
  etiqueta: string
): Promise<{ chat: Chat | null; esRespaldo: boolean }> {
  try {
    const real = await client.getChatById(idSerializado)
    if (real && real.id && real.id._serialized) {
      return { chat: real, esRespaldo: false }
    }
  } catch (error) {
    // El error del navegador viene minificado ("r", "t"): se recorta y se
    // etiqueta para que al menos se sepa QUÉ chat y de qué línea.
    const detalle = error instanceof Error ? error.message : String(error)
    console.warn(
      `⚠️ WhatsApp no devolvió el chat ${idSerializado} (${etiqueta}): ${detalle.slice(0, 200)}. Se continúa con un chat derivado del id.`
    )
  }
  return { chat: chatDeRespaldo(client, idSerializado), esRespaldo: true }
}

/**
 * Los últimos N mensajes de un chat, sin que un fallo del navegador deje la
 * conversación en blanco a la primera.
 *
 * `fetchMessages({ limit })` entra en un bucle que llama a
 * `window.require('WAWebChatLoadMessages').loadEarlierMsgs` (Chat.js:226-232):
 * OTRO módulo del navegador que puede no existir en la versión de WhatsApp Web
 * que Meta esté sirviendo. Sin `limit` ese bucle no se ejecuta y se devuelve lo
 * que ya está en el store (Chat.js:224). Así que si la petición con límite
 * falla, se reintenta sin él y se recorta aquí: un módulo menos que pueda dejar
 * el chat en "Sin mensajes".
 *
 * Nunca lanza: sin historial se devuelve una lista vacía. Perder el historial es
 * una degradación molesta; perder el mensaje entrante no es aceptable.
 */
export async function traerMensajes(
  chat: Chat,
  limite: number,
  etiqueta: string
): Promise<Awaited<ReturnType<Chat['fetchMessages']>>> {
  try {
    return await chat.fetchMessages({ limit: limite })
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    try {
      const todos = await chat.fetchMessages({})
      console.warn(
        `⚠️ El historial de ${etiqueta} falló con límite (${detalle.slice(0, 120)}); se sirvió lo que ya estaba cargado (${todos.length} mensajes).`
      )
      return todos.slice(-limite)
    } catch (error2) {
      const detalle2 = error2 instanceof Error ? error2.message : String(error2)
      console.warn(
        `⚠️ No se pudo leer el historial de ${etiqueta}: ${detalle2.slice(0, 200)}. Se sigue sin historial.`
      )
      return []
    }
  }
}

/**
 * ¿Esto que manda el front es un id de WhatsApp de verdad?
 *
 * Hacía falta porque el front mandaba la CLAVE PRIMARIA de la tabla
 * `SyncedContactOrGroup` (un entero, "188") como si fuera un id de WhatsApp. El
 * backend le pegaba "@c.us" y pedía `188@c.us`, un chat que no existe: de ahí
 * las decenas de "No se pudo cargar el historial del chat 188". Ahora se
 * rechaza con un aviso legible en vez de inventar un id.
 */
export const ES_ID_WHATSAPP =
  /^[\w.:-]+@(c\.us|g\.us|lid|s\.whatsapp\.net|broadcast|newsletter)$/i
