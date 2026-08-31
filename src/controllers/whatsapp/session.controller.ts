// Maneja la gestión de sesiones de WhatsApp
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import type { Server, Socket as SocketIO } from 'socket.io'
import whatsappWeb from 'whatsapp-web.js'
// `Client` ya es una constante en este archivo (se desestructura del import por
// defecto), así que el TIPO se trae con otro nombre.
import type { Chat, Client as WhatsAppClient } from 'whatsapp-web.js'
import type { CustomRequest, StartWhatsApp } from '../../interfaces/global.js'

const { Client, LocalAuth } = whatsappWeb
import { supabase } from '../../config/db.js'
import {
  chatDeRespaldo,
  ES_ID_WHATSAPP,
  idDeChatDelMensaje,
  resolverChat,
  traerMensajes,
  traerMensajesPorId
} from '../../lib/chatDeRespaldo.js'
import {
  cerrarCliente,
  clienteVivo,
  clients,
  marcarArranque
} from '../../WhatsAppClients.js'
import {
  lineasConSesionGuardada,
  soltarCerrojoDeSesion
} from '../../lib/perfilChromium.js'
import { JWT_SECRET } from '../../middleware/jwt.middleware.js'
import {
  exigirNumeroPropio,
  numeroEsDelUsuario,
  usuarioPorUsername,
  type UsuarioSesion
} from '../../lib/propiedad.js'
import {
  marcarLineaConectada,
  marcarLineaDesconectada,
  marcarQRPendiente,
  olvidarLinea
} from '../../services/events/lineEvents.js'
import { handleIncomingMessage } from './messages.controller.js'
import { parcheMsgKey } from '../../lib/parcheMsgKey.js'

/**
 * EL ÚLTIMO QR DE CADA LÍNEA, PARA QUIEN LLEGA TARDE A LA SALA.
 *
 * El QR se emitía con `io.to(sala).emit(...)` y nada más. Un `emit` a una sala
 * vacía no es un error: no falla, no avisa y no se guarda. Si en ese instante no
 * había ningún socket dentro de la sala, el código simplemente dejaba de existir
 * —sin log en el servidor y sin error en el navegador— y la pantalla de vincular
 * se quedaba para siempre en "Generando código...".
 *
 * Y llegar tarde a la sala es lo NORMAL, no la excepción:
 *   · el navegador reconecta el socket (redespliegue, wifi, suspensión) y el
 *     socket nuevo no pertenece a ninguna sala del servidor;
 *   · el usuario abre o recarga la pantalla después de haber arrancado la sesión;
 *   · el efecto de React vuelve a montar y hace leave-room + join-room, y entre
 *     los dos hay un viaje a Postgres.
 *
 * Guardar el último QR convierte una carrera en un estado: quien entra a la sala
 * recibe el código vigente en el acto, en vez de esperar al siguiente refresco
 * (que puede tardar más de un minuto) o no recibir ninguno nunca.
 */
const ultimoQR = new Map<string, { qr: string; en: number }>()

/**
 * whatsapp-web.js rota el QR cada ~20 s y el anterior deja de servir. Reenviar
 * uno más viejo que esto sería peor que no reenviar nada: el teléfono lo rechaza
 * sin explicar por qué. Pasado el plazo se prefiere el "Generando código..." de
 * unos segundos, que el refresco siguiente resuelve.
 */
const VIGENCIA_QR_MS = 60_000

/**
 * Lo que el historial espera a que una línea caída vuelva a estar lista.
 *
 * No es un límite del arranque —ese no puede tenerlo: si hace falta QR, 'ready'
 * no llega hasta que una persona lo escanea y cortar por tiempo mataría una
 * vinculación legítima—. Es solo lo que esta petición concreta aguanta antes de
 * contestar "se está reconectando". El navegador sigue abriéndose por su cuenta.
 */
const ESPERA_LINEA_MS = Number(process.env.ESPERA_LINEA_MS || 45_000)

/**
 * El nombre de sala de una línea, SIEMPRE igual: el id numérico en texto.
 *
 * Sin esto, 4, "4" y " 4" son tres salas distintas de socket.io y el QR sale por
 * una sola. El emisor lo saca de la fila de Postgres y el que se une lo manda por
 * el socket, así que las dos puntas tienen que normalizar igual.
 */
function nombreDeSala(numberId: unknown): string {
  const id = Number(numberId)
  return Number.isInteger(id) ? String(id) : String(numberId)
}

/**
 * Clientes que ya tienen puesta la oreja, para no engancharles el manejador dos
 * veces y contestar cada mensaje por duplicado.
 */
const clientesEscuchando = new WeakSet<object>()

/**
 * PONERLE LA OREJA A UNA LÍNEA. Sin esto, la sesión es SORDA.
 *
 * Este manejador vivía suelto dentro de `startWhatsApp`, y era el ÚNICO
 * `client.on('message')` de todo el repositorio. El problema: no era el único
 * sitio donde se creaba un `new Client(...)` — `get-chat-history` creaba otro
 * cuando no había sesión, y ese solo registraba 'ready' y 'auth_failure'. Una
 * línea levantada por ese camino (o tras un reinicio del proceso en el que nadie
 * llame a POST /start) quedaba con el QR válido y la sesión activa pero SIN
 * NADIE ESCUCHANDO: "Sin mensajes" en la app, el agente mudo y —lo peor para
 * diagnosticar— ni una sola línea de "PERDIDO" en el log, porque no había
 * manejador que la escribiera.
 *
 * Hoy ya no hay dos caminos: los dos pasan por `arrancarLinea`, que es el único
 * sitio del repositorio que construye un Client, y que llama aquí.
 *
 * El manejador es async y sin try/catch cualquier fallo interno se convertía en
 * un "Unhandled Rejection" con un stack de puppeteer que no dice de qué mensaje
 * ni de qué línea venía.
 *
 * `msg.getChat()` es la parte frágil: hace una llamada al WhatsApp Web de dentro
 * del navegador y falla con un opaco "r" cuando el store todavía no está listo.
 * Se reintenta una vez tras un respiro.
 *
 * Y AQUÍ ESTABA EL FALLO QUE DEJABA AL USUARIO BLOQUEADO: si el segundo intento
 * también fallaba, el mensaje se DESCARTABA. Con la versión de WhatsApp Web que
 * Meta sirve hoy, `getChat()` revienta SIEMPRE para ciertos chats —grupos y
 * remitentes `@lid`—, así que "siempre" era exactamente el caso.
 *
 * Rendirse nunca tuvo sentido: `getChat()` es `getChatById(msg.from)`, o sea el
 * chat que ya sabemos cuál es. De ese objeto este código solo necesita el id y
 * cuatro métodos que se resuelven contra el cliente. Si WhatsApp no lo da, se
 * deriva del propio mensaje y se sigue: en el peor caso el historial vendrá
 * vacío, pero el mensaje se guarda y el agente responde, que es lo que importa.
 */
function escucharMensajesEntrantes(
  client: WhatsAppClient,
  numberId: string | number,
  io: Server
): void {
  if (clientesEscuchando.has(client)) return
  clientesEscuchando.add(client)

  client.on('message', async (msg) => {
    try {
      let chat: Chat | null = null
      try {
        chat = await msg.getChat()
      } catch {
        // El respiro de 1,5 s sigue teniendo sentido: si el store solo estaba
        // calentando tras el 'ready', el segundo intento sí trae el chat real.
        await new Promise((r) => setTimeout(r, 1500))
        try {
          chat = await msg.getChat()
        } catch (error) {
          const detalle = error instanceof Error ? error.message : String(error)
          const idChat = idDeChatDelMensaje(msg)
          chat = idChat ? chatDeRespaldo(client, idChat, msg?.timestamp ?? 0) : null
          console.warn(
            `⚠️ getChat() falló para ${msg?.from ?? '?'} en la línea ${numberId} (${detalle.slice(0, 200)}). ` +
              (chat
                ? 'Se continúa con un chat derivado del mensaje: NO se pierde.'
                : 'No se pudo derivar el chat del mensaje.')
          )
        }
      }
      if (!chat || !chat.id || !chat.id._serialized) {
        console.error(
          `❌ Mensaje entrante PERDIDO en la línea ${numberId}: no se pudo derivar el chat de ${msg?.from ?? '?'}`
        )
        return
      }
      await handleIncomingMessage(msg, chat, numberId, io)
    } catch (error) {
      console.error(
        `❌ Mensaje entrante PERDIDO en la línea ${numberId} (de ${msg?.from ?? '?'}):`,
        error instanceof Error ? error.message : error
      )
    }
  })
}

/** El QR vigente de esa línea, o null si no hay o ya caducó. */
function qrVigente(numberId: unknown): string | null {
  const clave = nombreDeSala(numberId)
  const guardado = ultimoQR.get(clave)
  if (!guardado) return null
  if (Date.now() - guardado.en > VIGENCIA_QR_MS) {
    ultimoQR.delete(clave)
    return null
  }
  return guardado.qr
}

/**
 * El QR de esta línea ya no sirve: se escaneó, la sesión se cayó o el número se
 * borró. Se exporta porque el borrado del número vive en user.controller.
 */
export function olvidarQR(numberId: string | number): void {
  ultimoQR.delete(nombreDeSala(numberId))
}

/**
 * LAS OPCIONES DEL CLIENTE, EN UN SOLO SITIO.
 *
 * Estaban copiadas palabra por palabra en `startWhatsApp` y en
 * `get-chat-history`. Dos copias del mismo bloque significan dos formas de
 * arrancar la misma línea que pueden separarse sin que nadie se entere: de
 * hecho ya se habían separado —la del historial no tenía `.catch` ni limpieza
 * del mapa— y esa diferencia es exactamente lo que dejaba clientes sin
 * navegador atrapados en el mapa.
 */
function opcionesDeCliente(numberId: string) {
  return {
    // SALIDA DE EMERGENCIA PARA LA VERSIÓN DE WHATSAPP WEB.
    //
    // whatsapp-web.js habla con el WhatsApp Web real dentro del navegador. Cuando Meta
    // publica una versión nueva, los selectores de la librería dejan de encajar y las
    // llamadas al store fallan con un error opaco —literalmente "r: r"—. El síntoma no
    // parece un error: el mensaje entrante se descarta y el chat se queda en "Sin
    // mensajes" con el agente mudo.
    //
    // Por defecto NO se fija nada: la librería elige, que es lo que funciona el 99% del
    // tiempo. Fijar una versión a ciegas es peor que no fijar ninguna —el repositorio de
    // versiones solo publica alphas, y apuntar a una que no existe devuelve 404 y deja
    // el navegador sin arrancar—. Con WWEB_VERSION se puede clavar una concreta el día
    // que haga falta, sin desplegar.
    ...(process.env.WWEB_VERSION
      ? {
          webVersionCache: {
            type: 'remote' as const,
            remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${process.env.WWEB_VERSION}.html`
          }
        }
      : {}),
    // Devuelve a MsgKey el `_serialized` que WhatsApp renombró a `$1` en julio.
    // Sin esto fallan la lectura del chat, el envío y el id del mensaje entrante.
    // Ver src/lib/parcheMsgKey.ts.
    evalOnNewDoc: parcheMsgKey,
    authStrategy: new LocalAuth({ clientId: numberId }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-first-run',
        '--disable-plugins',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-software-rasterizer',
        '--memory-pressure-off',
        '--max_old_space_size=512'
      ]
    }
  }
}

/**
 * ARRANQUES EN CURSO, PARA QUE NUNCA HAYA DOS NAVEGADORES SOBRE EL MISMO PERFIL.
 *
 * Había DOS sitios que hacían `new Client(...)` para la misma línea —el
 * endpoint de arranque y el socket del historial— sin mirar si el otro estaba a
 * medias. Dos Chromium sobre `session-<id>` es justo lo que el `SingletonLock`
 * existe para impedir; el segundo falla con "Code: 21" y deja el cerrojo (y un
 * cliente sin navegador) detrás. Ahora quien llegue segundo se engancha al
 * arranque que ya está en marcha.
 */
const arranques = new Map<string, Promise<WhatsAppClient>>()

/**
 * Deja la línea con un navegador vivo y devuelve el cliente cuando esté LISTO.
 *
 * La promesa se resuelve en 'ready' y se rechaza si el navegador no abre o si
 * la autenticación falla. NO lleva reloj propio a propósito: cuando hace falta
 * QR, 'ready' no llega hasta que una persona lo escanea, y cortar por tiempo
 * mataría una vinculación legítima. Quien no pueda esperar (el historial) pone
 * su propio límite SIN destruir el cliente.
 */
function arrancarLinea(
  numberId: string | number,
  io: Server
): Promise<WhatsAppClient> {
  const clave = nombreDeSala(numberId)
  const enMarcha = arranques.get(clave)
  if (enMarcha) return enMarcha

  const sala = clave
  const idLinea = Number(clave)

  const promesa = (async () => {
    // Lo que hubiera antes se cierra: puede ser un cliente sano al que el
    // usuario le dio a "reconectar", o el cadáver de un arranque fallido.
    const viejo = clients[clave]
    if (viejo) await cerrarCliente(viejo, clave, 'se va a rearrancar la línea')

    // EL ARREGLO DE LA CAUSA RAÍZ. Si un contenedor anterior murió sin cerrar
    // Chromium, su cerrojo sigue en el volumen y el navegador nuevo se niega a
    // abrir el perfil ("profile appears to be in use ... on another computer"),
    // así que la línea no arranca NUNCA. Solo se hace aquí, donde ya sabemos
    // que este proceso no tiene navegador para esta línea.
    soltarCerrojoDeSesion(clave)

    const client = new Client(opcionesDeCliente(clave))
    // Se publica en el mapa desde ya —aunque todavía no sirva— para que las
    // vías de limpieza (parar la línea, borrar el número) puedan cerrarle el
    // navegador si el usuario cancela a mitad. `clienteVivo()` es quien impide
    // que alguien lo USE antes de tiempo, y `marcarArranque` evita que lo tire
    // del mapa mientras está naciendo.
    clients[clave] = client
    marcarArranque(clave, true)

    client.on('qr', async (qr) => {
      try {
        const qrImage = await QRCode.toDataURL(qr)
        // Se guarda ANTES de emitir: si no hay nadie escuchando, el código sigue
        // disponible para el primer socket que entre a la sala (ver join-room).
        ultimoQR.set(sala, { qr: qrImage, en: Date.now() })
        // Cuántos sockets hay DENTRO de la sala en el instante del envío. Es el
        // dato que faltaba para diagnosticar esta pantalla: el log anterior decía
        // "generated successfully" exactamente igual cuando el QR llegaba a un
        // navegador que cuando se emitía al vacío.
        const enSala = io.sockets.adapter.rooms.get(sala)?.size ?? 0
        console.info(
          `✅ QR generado para numberId: ${idLinea} — sockets en la sala: ${enSala}`
        )
        io.to(sala).emit('qr-code', { numberId: idLinea, qr: qrImage })
      } catch (error) {
        console.error('❌ Error procesando el QR:', error)
      }
      // El evento avisa de que HAY un QR esperando, para que el cliente pueda
      // llamar a su operador. El código NO viaja: es una credencial de sesión y
      // quien lo escanee se apodera de la línea.
      void marcarQRPendiente(clave)
    })

    client.on('ready', () => {
      // Ya se escaneó: el QR guardado es una credencial gastada y no se le puede
      // volver a entregar a nadie que entre a la sala.
      olvidarQR(sala)
      // Se vuelve a fijar por si alguien retiró la entrada mientras arrancaba:
      // a partir de aquí el cliente SÍ tiene navegador y es el bueno.
      clients[clave] = client
      io.to(sala).emit('whatsapp-ready', { numberId: idLinea })
      // Único "línea conectada" que existe en esta vía.
      void marcarLineaConectada(clave, 'qr_scanned')
    })

    // La librería DESTRUYE el navegador ella sola en este caso (Client.js:193),
    // así que la entrada del mapa quedaba apuntando a un cliente sin navegador
    // y nadie la borraba nunca: el siguiente que pidiera el historial se
    // encontraba el cadáver. Ahora se retira aquí.
    client.on('auth_failure', () => {
      olvidarQR(sala)
      void marcarLineaDesconectada(clave, 'auth_failure')
      if (clients[clave] === client) delete clients[clave]
    })

    client.on('disconnected', async () => {
      // Se emite ANTES de cerrar nada: si el cierre se cuelga —que es
      // exactamente lo que pasa cuando Chromium ya murió— el aviso ya salió y el
      // cliente se entera igual de que su línea se cayó.
      olvidarQR(sala)
      void marcarLineaDesconectada(clave, 'logged_out')
      // Aquí NO se llama a logout(): la librería ya destruyó el navegador antes
      // de emitir este evento (Client.js:851-853), así que logout() fallaba
      // contra un navegador muerto y el `delete` que venía detrás no llegaba a
      // ejecutarse. Cliente destruido, entrada viva: otro cadáver en el mapa.
      if (clients[clave] === client) {
        await cerrarCliente(client, clave, 'la sesión se desconectó')
      }
      io.to(sala).emit('whatsapp-numbers-updated')
    })

    // Se le pasa el id NUMÉRICO, igual que antes: `handleIncomingMessage` lo usa
    // para consultar la base y para nombrar la sala de socket.io. Es el camino
    // por el que hoy entran los mensajes y responde el agente, y no se toca.
    escucharMensajesEntrantes(client, idLinea, io)

    await new Promise<void>((resolver, rechazar) => {
      let terminado = false
      const fallar = (motivo: unknown) => {
        if (terminado) return
        terminado = true
        rechazar(motivo instanceof Error ? motivo : new Error(String(motivo)))
      }
      client.once('ready', () => {
        if (terminado) return
        terminado = true
        resolver()
      })
      client.once('auth_failure', (mensaje: string) =>
        fallar(new Error(`auth_failure: ${mensaje}`))
      )
      // EL `.catch` QUE FALTABA. En la vía del historial, `initialize()` se
      // llamaba a pelo dentro del ejecutor de la promesa: cuando Chromium no
      // arrancaba, el rechazo salía por el `unhandledRejection` global de
      // index.ts —que lo imprime y sigue—, la promesa se quedaba pendiente para
      // siempre y la entrada del mapa se quedaba ocupada por un cliente sin
      // navegador. Ese era el "Cannot read properties of null (reading
      // 'evaluate')" que el usuario veía como un chat vacío.
      client.initialize().catch(fallar)
    })

    return client
  })().catch(async (error: unknown) => {
    const detalle = error instanceof Error ? error.message : String(error)
    console.error(
      `❌ No se pudo abrir el navegador de WhatsApp de la línea ${clave}: ${detalle}`
    )
    // Fallo de ARRANQUE, distinto de una caída: la línea nunca llegó a estar
    // viva. Se distingue en el evento por reason='startup_failed'.
    void marcarLineaDesconectada(clave, 'startup_failed')
    const roto = clients[clave]
    if (roto) await cerrarCliente(roto, clave, 'el arranque falló')
    olvidarQR(sala)
    io.to(sala).emit('whatsapp-error', {
      numberId: idLinea,
      message:
        'No pudimos abrir el navegador que genera el código QR. Vuelve a intentarlo; si insiste, la sesión guardada de esta línea puede estar bloqueada.',
      detail: detalle
    })
    throw error instanceof Error ? error : new Error(detalle)
  })

  arranques.set(clave, promesa)
  void promesa
    .catch(() => {
      /* ya se avisó arriba; aquí solo se limpia el registro */
    })
    .finally(() => {
      if (arranques.get(clave) === promesa) arranques.delete(clave)
      marcarArranque(clave, false)
    })

  return promesa
}

export async function startWhatsApp(req: CustomRequest, res: Response) {
  const { numberId } = req.body as Partial<StartWhatsApp>
  if (!numberId) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Falta el id del número' })
    return
  }

  try {
    // Con el numberId de otro cliente, este endpoint hacía DOS cosas graves:
    // cerraba su sesión de WhatsApp en marcha (líneas de abajo: logout +
    // destroy) y arrancaba una nueva emitiendo el QR de vinculación. Ahora el
    // número tiene que ser del usuario del token.
    const number = await exigirNumeroPropio(req, res, { id: numberId })
    if (!number) return

    // La sala y el id que viajan en los eventos salen de la FILA de Postgres, no
    // de lo que mandó el cuerpo de la petición. Dos motivos: el nombre de la sala
    // queda igual al que arma el front con el id del listado (`String(id)`), y el
    // campo `numberId` del evento sale como número —el front lo compara con `===`
    // contra un id numérico, así que un "4" en vez de un 4 tiraba el QR en
    // silencio, sin log en ninguno de los dos lados.
    const idLinea = Number(number.id)
    const io: Server = req.app.get('io')

    // ARRANCAR ES UNA SOLA COSA Y VIVE EN UN SOLO SITIO (`arrancarLinea`).
    //
    // Antes, aquí se hacía `await client.logout()` sobre el cliente anterior. Dos
    // problemas, los dos observados en producción:
    //
    //   · con `pupPage` null —un arranque que falló— `logout()` lanza el mismo
    //     "Cannot read properties of null (reading 'evaluate')" (Client.js:1290)
    //     ANTES de llegar al `delete clients[numberId]`. Este endpoint devolvía
    //     500 y la entrada podrida se quedaba en el mapa: la línea no se podía
    //     revivir de ninguna manera y la única salida que le quedaba al usuario
    //     era crear una línea NUEVA. De ahí que el numberId fuera subiendo
    //     2, 4, 5, 7, 8, 9, 10 con el mismo teléfono.
    //   · `LocalAuth.logout()` BORRA la carpeta de sesión (LocalAuth.js:56-68),
    //     así que reconectar exigía escanear el QR aunque la sesión estuviera
    //     perfecta. Ahora se cierra sin desvincular y la sesión guardada se
    //     restaura sola: en el caso normal el usuario no toca el teléfono.
    //
    // No se espera a 'ready': cuando hace falta QR, 'ready' no llega hasta que
    // alguien lo escanea. El QR y el resultado viajan por socket a la sala, que
    // es lo que la pantalla de vincular está escuchando.
    void arrancarLinea(idLinea, io).catch(() => {
      /* el fallo ya se avisó por 'whatsapp-error' dentro de arrancarLinea */
    })
    res.status(HttpStatusCode.Ok).json({ message: 'WhatsApp iniciado' })
  } catch (error) {
    console.error('❌ Error al iniciar WhatsApp:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error interno del servidor' })
  }
}

export async function stopWhatsApp(req: CustomRequest, res: Response) {
  const { data: user } = await supabase
    .from('User')
    .select('*')
    .eq('username', req.user?.username)
    .single()

  if (!user) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'Usuario no encontrado' })
    return
  }
  const { data: whatsappNumbers } = await supabase
    .from('WhatsAppNumber')
    .select('*')
    .eq('userId', user.id)
  try {
    for (const number of whatsappNumbers || []) {
      // Baja DELIBERADA: el usuario paró la línea. No se emite
      // line.disconnected —no es una caída— pero sí se olvida el estado, para
      // que un arranque posterior vuelva a contar como transición real.
      olvidarLinea(number.id)
      olvidarQR(number.id)

      // AQUÍ HABÍA UN `DELETE` DE LA FILA. "Detener" estaba implementado como
      // "borrar la vinculación": este bucle recorría TODOS los números del
      // usuario y borraba cada fila de app."WhatsAppNumber", y con ella —por el
      // ON DELETE CASCADE— toda su agenda de contactos. Después, volver a
      // conectar exigía crear una fila NUEVA, con un id nuevo, y de ahí que el
      // numberId subiera solo mientras el teléfono era siempre el mismo.
      // Detener es apagar el navegador. Borrar sigue siendo exclusivo de
      // DELETE /api/user/delete-number/:id, que es explícito y avisa.

      const clave = nombreDeSala(number.id)
      const client = clients[clave]
      if (client) {
        // Se lee `clients` en crudo y no `clienteVivo()`: esta vía necesita el
        // objeto AUNQUE esté muerto, que es justo a quien hay que cerrarle el
        // navegador para que no quede un Chromium huérfano comiéndose el
        // contenedor.
        //
        // Tampoco se llama a `logout()`: `LocalAuth.logout()` borra la carpeta
        // de sesión (LocalAuth.js:56-68) y pararía costando un QR nuevo.
        await Promise.race([
          cerrarCliente(client, clave, 'el usuario detuvo la línea'),
          new Promise((resolver) => setTimeout(resolver, 5000))
        ])
        delete clients[clave]
      }
    }
    res.status(HttpStatusCode.Ok).json({ message: 'WhatsApp detenido' })
  } catch (error) {
    console.error('❌ Error al detener WhatsApp:', (error as Error).message)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error interno del servidor al detener WhatsApp'
    })
  }
}

/**
 * -----------------------------------------------------------------------------
 *  EL QR SALÍA POR UNA PUERTA SIN CERRADURA.
 * -----------------------------------------------------------------------------
 *
 *  `join-room` recibía un roomId y hacía `socket.join(roomId)`. Punto. Y la sala
 *  de este servicio es el `numberId` a secas, así que poner un número —1, 2, 3…,
 *  que es un serial y no hay nada que adivinar— metía al socket en el canal en
 *  vivo de otra empresa. Por ese canal salen cinco cosas, todas con
 *  `io.to(numberId.toString())`:
 *
 *     qr-code                  · EL CÓDIGO DE VINCULACIÓN DE SU WHATSAPP
 *     whatsapp-ready           · su línea acaba de quedar conectada
 *     whatsapp-numbers-updated · su línea se cayó
 *     whatsapp-error           · el detalle del fallo de arranque
 *     chat-history             · SUS CONVERSACIONES, mensaje a mensaje
 *     sync-progress / *-contacts-updated · su agenda
 *
 *  El primero es el peor con diferencia: un QR de WhatsApp Web es una credencial
 *  de sesión. Quien esté en la sala en el momento en que el dueño le da a
 *  "conectar" lo ve, y si lo escanea antes que él se lleva la sesión de WhatsApp
 *  de esa empresa — leer y escribir en nombre de otro, sin tocar la contraseña de
 *  nadie y sin dejar rastro en esta API.
 *
 *  Ahora hay dos puertas: el handshake dice QUIÉN es (io.use, más abajo) y
 *  `join-room` comprueba que ese número sea suyo antes de dejarlo entrar.
 * -----------------------------------------------------------------------------
 */

/**
 * SOCKETS VIEJOS SIN TOKEN — misma decisión que en el CRM, y por lo mismo.
 *
 * Se rechazan. El front que se despliega con este cambio manda el token en el
 * handshake (`auth: { token }` en hooks/useSocket.ts y context/WhatsAppContext.tsx),
 * y un socket anónimo es indistinguible de alguien esperando el QR de otro.
 *
 * La salida de emergencia lleva fecha obligatoria: WS_GRACIA_SIN_TOKEN=YYYY-MM-DD
 * admite sockets sin token hasta el final de ESE día (UTC) y después vuelve a
 * rechazar sola, sin que nadie tenga que acordarse de quitarla. Mientras esté
 * activa, cada conexión anónima queda en el log con su origen. Un socket admitido
 * por gracia NO puede entrar en ninguna sala: se conecta, pero no ve nada de
 * nadie — que es lo que necesita una pestaña vieja para no romperse a gritos
 * mientras se recarga.
 */
const GRACIA_SIN_TOKEN: Date | null = (() => {
  const crudo = (process.env.WS_GRACIA_SIN_TOKEN ?? '').trim()
  if (!crudo) return null
  const hasta = new Date(`${crudo}T23:59:59.999Z`)
  if (Number.isNaN(hasta.getTime())) {
    console.error(
      `❌ WS_GRACIA_SIN_TOKEN="${crudo}" no es una fecha YYYY-MM-DD: se ignora y los sockets sin token se rechazan.`
    )
    return null
  }
  console.warn(
    `⚠️ MODO DE GRACIA ACTIVO: se aceptan sockets SIN token hasta ${hasta.toISOString()} (no podrán unirse a ninguna sala).`
  )
  return hasta
})()

let graciaVencidaAvisada = false

function graciaVigente(): boolean {
  if (!GRACIA_SIN_TOKEN) return false
  if (Date.now() > GRACIA_SIN_TOKEN.getTime()) {
    if (!graciaVencidaAvisada) {
      graciaVencidaAvisada = true
      console.warn(
        `⚠️ La gracia de WS_GRACIA_SIN_TOKEN venció el ${GRACIA_SIN_TOKEN.toISOString()}: ya se puede quitar la variable.`
      )
    }
    return false
  }
  return true
}

/** El token del handshake, en las tres formas en que lo manda un cliente. */
function tokenDelHandshake(socket: SocketIO): string {
  const auth = (socket.handshake?.auth ?? {}) as { token?: unknown }
  if (typeof auth.token === 'string' && auth.token) return auth.token

  const enQuery = socket.handshake?.query?.token
  const query = Array.isArray(enQuery) ? enQuery[0] : enQuery
  if (typeof query === 'string' && query) return query

  const cabecera = socket.handshake?.headers?.authorization ?? ''
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7)

  return ''
}

/** Usuario ya resuelto en el handshake; null si entró por el modo de gracia. */
function usuarioDeSocket(socket: SocketIO): UsuarioSesion | null {
  return (socket.data?.usuario as UsuarioSesion | null | undefined) ?? null
}

export function setupSocketEvents(io: Server) {
  // LA PUERTA. Corre durante el handshake, antes de que exista 'connection': un
  // socket que no la pasa no llega a registrar ningún manejador.
  io.use((socket, next) => {
    void (async () => {
      const token = tokenDelHandshake(socket)

      if (!token) {
        if (graciaVigente()) {
          socket.data.usuario = null
          console.warn(
            `⚠️ Socket ${socket.id} conectado SIN token (origen ${
              socket.handshake.headers.origin ?? 'desconocido'
            }): admitido por WS_GRACIA_SIN_TOKEN, sin acceso a salas.`
          )
          next()
          return
        }
        next(new Error('No autorizado: falta el token de sesión'))
        return
      }

      try {
        // MISMA verificación que el middleware HTTP (jwt.middleware.ts): misma
        // librería y MISMO JWT_SECRET, importado de allí para que no puedan
        // divergir. Después se relee el usuario en la base, que es lo que hace
        // que dar de baja una cuenta le corte también los sockets.
        const datos = jwt.verify(token, JWT_SECRET) as { username?: string }
        const usuario = datos?.username
          ? await usuarioPorUsername(datos.username)
          : null
        if (!usuario) {
          console.warn(
            `⛔ Socket ${socket.id} rechazado: token válido pero la cuenta no existe o está inactiva.`
          )
          next(new Error('No autorizado'))
          return
        }
        socket.data.usuario = usuario
        next()
      } catch (error) {
        // Firma inválida, token caducado o base caída: en los tres casos no se
        // puede afirmar quién es. Fail-closed.
        console.warn(
          `⛔ Socket ${socket.id} rechazado: ${
            error instanceof Error ? error.message : 'token inválido'
          }`
        )
        next(new Error('No autorizado'))
      }
    })()
  })

  io.on('connection', (socket) => {
    socket.on('join-room', async (roomId) => {
      const usuario = usuarioDeSocket(socket)
      if (!usuario) {
        // Sin identidad no hay número que comprobar. Solo ocurre dentro de la
        // ventana de gracia: el socket vive, pero no entra a ninguna sala.
        socket.emit('room-error', {
          roomId,
          message: 'Sesión no válida: vuelve a iniciar sesión'
        })
        return
      }

      // La sala ES el numberId. Que sea suyo es toda la comprobación que hacía
      // falta y la que no existía.
      if (!(await numeroEsDelUsuario(usuario.id, roomId))) {
        console.warn(
          `⛔ ${usuario.username} (id ${usuario.id}) intentó unirse a la sala del número ${roomId}, que no es suyo.`
        )
        // "No encontrado" y no "prohibido": distinguirlos convertiría el socket
        // en un detector de numberIds ajenos válidos, que son seriales.
        socket.emit('room-error', { roomId, message: 'Número no encontrado' })
        return
      }

      const sala = nombreDeSala(roomId)
      socket.join(sala)
      socket.emit('room-joined', { roomId })

      // EL ARREGLO DE "Generando código..." PARA SIEMPRE.
      //
      // El QR se emite a la sala cada ~20 s y se perdía entero si en ese instante
      // la sala estaba vacía. Quien entraba después no recibía nada hasta el
      // refresco siguiente —y si su socket se había caído y vuelto a conectar
      // entre medias, podía no recibir ninguno nunca—. Ahora el que entra se
      // lleva el código vigente en el acto.
      //
      // Esto NO abre ningún agujero: se ejecuta DESPUÉS de numeroEsDelUsuario(),
      // o sea con el mismo permiso que hace falta para estar en la sala, y va por
      // `socket.emit` (solo a este socket), no a la sala entera.
      const pendiente = qrVigente(sala)
      if (pendiente) {
        console.info(
          `↩️ QR vigente reenviado a ${usuario.username} al entrar a la sala ${sala}.`
        )
        socket.emit('qr-code', { numberId: Number(sala), qr: pendiente })
      }
    })
    // El front emite 'leave-room' al cambiar de número y nadie lo escuchaba: el
    // socket seguía en la sala del número anterior y recibía su QR y su historial.
    // Salir no necesita permiso: irse de una sala no revela nada.
    socket.on('leave-room', (roomId) => {
      // Misma normalización que al entrar: si no, se sale de una sala que no es
      // la que se pidió y el socket se queda dentro de la anterior.
      socket.leave(nombreDeSala(roomId))
    })
    socket.on('get-chat-history', async ({ numberId, to }) => {
      try {
        // El historial se pedía por numberId y se emitía a la sala de ese
        // numberId. Con join-room cerrado ya no se podría leer, pero seguiría
        // sirviendo para ARRANCAR el cliente de WhatsApp de otra empresa (mira
        // el bloque de abajo: si no hay sesión, la crea). Se comprueba igual.
        const usuario = usuarioDeSocket(socket)
        if (!usuario || !(await numeroEsDelUsuario(usuario.id, numberId))) {
          console.warn(
            `⛔ Petición de historial rechazada para el número ${numberId}: no es del usuario del socket.`
          )
          return
        }

        // EL CADÁVER QUE DEJABA EL CHAT EN BLANCO.
        //
        // Antes esto era `clients[numberId]` a pelo y la única condición era que
        // la entrada EXISTIERA. Un `Client` cuyo navegador nunca arrancó existe
        // igual —nace con `pupPage = null` (Client.js:103)— así que el
        // `if (!client)` que reconstruye la sesión no se alcanzaba nunca y todas
        // las peticiones acababan en `pupPage.evaluate` sobre null: los dos
        // avisos del log ("no devolvió el chat" y "chat derivado") y, en
        // pantalla, "No hay mensajes en este chat aún" sobre una conversación
        // que sí existe. `clienteVivo` comprueba que haya navegador y, si no lo
        // hay, retira la entrada para que la línea se pueda rearrancar.
        let client = clienteVivo(numberId)
        if (!client) {
          // La línea sigue existiendo en la base pero este proceso no tiene su
          // navegador (un redespliegue, un arranque que falló). Se rearranca con
          // la sesión guardada: no hace falta QR mientras la carpeta del perfil
          // siga en el volumen.
          const { data: number } = await supabase
            .from('WhatsAppNumber')
            .select('id')
            .eq('id', numberId)
            .single()
          if (!number) return

          try {
            // Con reloj PROPIO y sin destruir nada: si la sesión guardada ya no
            // vale, `arrancarLinea` acabará emitiendo un QR y 'ready' no llegará
            // hasta que alguien lo escanee. Esperar ahí para siempre dejaría la
            // pantalla colgada, así que se responde y se deja la línea
            // arrancando por su cuenta.
            client = await Promise.race([
              arrancarLinea(numberId, io),
              new Promise<never>((_, rechazar) =>
                setTimeout(
                  () => rechazar(new Error('la línea no llegó a estar lista')),
                  ESPERA_LINEA_MS
                )
              )
            ])
          } catch (error) {
            const detalle = error instanceof Error ? error.message : String(error)
            const pideQR = qrVigente(numberId) !== null
            console.warn(
              `⚠️ Historial de la línea ${numberId} sin sesión activa: ${detalle.slice(0, 200)}`
            )
            // Se distingue de FALLO_STORE a propósito: esto NO se arregla
            // reintentando, y el front reintentaba a ciegas hasta agotar su
            // techo mientras el usuario veía "Sin mensajes".
            socket.emit('chat-history-error', {
              numberId,
              to,
              code: 'LINEA_CAIDA',
              message: pideQR
                ? 'Esta línea perdió la sesión de WhatsApp: escanea el código QR para volver a vincularla.'
                : 'La línea de WhatsApp se está reconectando. Abre el chat de nuevo en unos segundos.'
            })
            return
          }
        }

        // El id del chat tiene que ir en el formato de WhatsApp (`<numero>@c.us` para
        // personas, `@g.us` para grupos). El front manda lo que tenga guardado del
        // contacto, que a veces es solo el número: así, getChatById reventaba con un
        // error opaco y —por el catch de abajo, que devolvía el error en vez de
        // avisar— el chat se quedaba en blanco para siempre, sin decir nada.
        //
        // Antes aquí se FABRICABA el id pegando "@c.us" a lo que llegara. El front
        // mandaba la clave primaria de `SyncedContactOrGroup` (un entero, "188") en vez
        // del `wa_id`, esto lo convertía en `188@c.us` —un chat que no existe— y el log
        // se llenaba de "No se pudo cargar el historial del chat 188" decenas de veces.
        // Ahora se VALIDA: un id que no es de WhatsApp se rechaza con un aviso que el
        // front puede leer y mostrar, en vez de convertirse en una petición imposible
        // que se reintenta para siempre.
        const bruto = String(to ?? '').trim()
        let idChat: string
        if (ES_ID_WHATSAPP.test(bruto)) {
          idChat = bruto
        } else if (/^\d{8,15}$/.test(bruto)) {
          // Un teléfono suelto sí se puede completar sin inventar nada.
          idChat = `${bruto}@c.us`
        } else {
          console.warn(
            `⛔ get-chat-history con un id que no es de WhatsApp: "${bruto}" (línea ${numberId}). Parece un id de base de datos: el front debe mandar wa_id.`
          )
          socket.emit('chat-history-error', {
            numberId,
            to,
            code: 'ID_NO_WHATSAPP',
            message:
              'Ese chat no tiene un identificador de WhatsApp válido. Vuelve a sincronizarlo desde la lista de contactos.'
          })
          return
        }

        // EL HISTORIAL NUNCA NECESITÓ EL OBJETO Chat, y pedirlo era el segundo
        // modo de fallo (el que se veía con los `@lid` y con los grupos).
        //
        // `Chat.fetchMessages` no es más que un `pupPage.evaluate` con el id
        // serializado, y por dentro pide el chat con
        // `window.WWebJS.getChat(chatId, { getAsModel: false })`
        // (Chat.js:203-246). Ese `getAsModel: false` SE SALTA
        // `window.WWebJS.getChatModel` (Utils.js:938), que es donde vive el
        // `window.require('WAWebLidMigrationUtils')` (Utils.js:961) que hace
        // reventar a `getChatById` (Client.js:1694, que llama a getChat sin
        // opciones, o sea con getAsModel = true). Traducción: pedir el historial
        // directamente por el id es ESTRICTAMENTE más fiable que pasar antes por
        // `getChatById`, porque no toca el módulo que falla.
        //
        // El camino de antes se conserva DETRÁS, como red: si esta lectura
        // devuelve vacío puede ser un chat realmente vacío o un módulo del
        // navegador que cambió de nombre, y en el segundo caso `resolverChat` +
        // `traerMensajes` todavía pueden traerlo.
        const CUANTOS = 20
        let messages = await traerMensajesPorId(
          client,
          idChat,
          CUANTOS,
          `${idChat} (línea ${numberId})`
        )
        // El chat solo se usa para su id: se deriva del propio identificador, sin
        // gastar una llamada al navegador que además puede fallar.
        let chat: Chat | null = messages.length > 0 ? chatDeRespaldo(client, idChat) : null

        if (!chat) {
          // Mismo motivo que en el manejador de mensajes entrantes: `getChatById` pasa por
          // `getChatModel` dentro del navegador y hoy revienta con un error minificado
          // ("r") para grupos y para chats `@lid`. Si falla, se sigue con un chat derivado
          // del id: puede que el historial venga vacío, pero la pantalla deja de quedarse
          // colgada sin explicación.
          const resuelto = await resolverChat(
            client,
            idChat,
            `historial de la línea ${numberId}`
          )
          chat = resuelto.chat
          if (!chat) {
            socket.emit('chat-history-error', {
              numberId,
              to,
              code: 'CHAT_NO_EXISTE',
              message: 'Ese chat no existe en la sesión de WhatsApp.'
            })
            return
          }
          // Los últimos 20 mensajes. `traerMensajes` reintenta sin `limit` si la petición
          // con límite falla —así se salta `WAWebChatLoadMessages`, otro módulo del
          // navegador que puede no existir en la versión servida— y devuelve una lista
          // vacía antes que lanzar: mejor un chat vacío que una pantalla colgada.
          messages = await traerMensajes(
            chat,
            CUANTOS,
            `${idChat} (línea ${numberId}${resuelto.esRespaldo ? ', chat derivado' : ''})`
          )
        }
        messages.sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)
        let lastMessageTimestamp: number | null = null
        if (messages && messages.length > 0) {
          const lastMsg = messages[messages.length - 1]
          if (lastMsg) {
            lastMessageTimestamp = lastMsg.timestamp * 1000
          }
        }
        /**
         * FOTOS DE PERFIL.
         *
         * `getProfilePicUrl` es una llamada al navegador por cada contacto, así que se
         * piden UNA VEZ por autor distinto —no una por mensaje— y en paralelo. Sin este
         * cuidado, un chat de 30 mensajes disparaba 30 llamadas para 2 personas.
         *
         * Que falle es normal y no es un error: mucha gente tiene la foto restringida a
         * sus contactos. En ese caso se queda sin foto y el front pinta las iniciales.
         */
        const autoresUnicos = Array.from(
          new Set(
            messages
              .filter((m: { fromMe: boolean }) => !m.fromMe)
              .map(
                (m: { author?: string; from?: string }) => m.author || m.from || ''
              )
              .filter(Boolean)
          )
        ) as string[]

        /**
         * NOMBRES, RESUELTOS UNA VEZ PARA TODO EL HILO.
         *
         * `notifyName` —el nombre que la persona tiene puesto en su WhatsApp— no viaja en
         * todos los mensajes: WhatsApp lo manda en unos sí y en otros no. Al leerlo
         * mensaje a mensaje, el nombre salía solo en el último y el resto del hilo
         * quedaba anónimo, como si fueran de personas distintas.
         *
         * Se recorre el historial una vez, se guarda el nombre en cuanto aparece para
         * cada remitente, y luego se aplica a TODOS sus mensajes.
         */
        const nombres = new Map<string, string>()
        for (const m of messages as Array<{
          fromMe: boolean
          author?: string
          from?: string
          _data?: { notifyName?: string }
        }>) {
          if (m.fromMe) continue
          const quien = m.author || m.from
          const comoSeLlama = m._data?.notifyName
          if (quien && comoSeLlama && !nombres.has(quien)) {
            nombres.set(quien, comoSeLlama)
          }
        }

        const fotos = new Map<string, string>()
        await Promise.all(
          autoresUnicos.map(async (id) => {
            try {
              const url = await client.getProfilePicUrl(id)
              if (url) fotos.set(id, url)
            } catch {
              /* sin foto pública: el front usa las iniciales */
            }
          })
        )

        const chatHistory = messages.map(
          (m: {
            fromMe: boolean
            body: string
            timestamp: number
            ack?: number
            author?: string
            from?: string
            _data?: { notifyName?: string }
          }) => ({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.body,
            timestamp: m.timestamp * 1000,
            to: chat.id,
            fromMe: m.fromMe,
            // Estado de entrega, para pintar los palomitas como en WhatsApp:
            // -1 error · 0 pendiente (reloj) · 1 enviado (✓) · 2 entregado (✓✓)
            // · 3 leído (✓✓ azul) · 4 reproducido (nota de voz escuchada).
            ack: m.ack,
            // Quién habló. En un grupo cada mensaje puede ser de alguien distinto, y
            // sin esto todos se veían iguales. `notifyName` es el nombre que la
            // persona tiene puesto en su WhatsApp; si no viene, queda su número.
            autor: m.fromMe
              ? undefined
              : nombres.get(m.author || m.from || '') ||
                m._data?.notifyName ||
                m.author ||
                undefined,
            fotoUrl: m.fromMe
              ? undefined
              : fotos.get(m.author || m.from || '') || undefined
          })
        )
        const respuesta = {
          numberId,
          chatHistory,
          to: chat.id._serialized,
          lastMessageTimestamp
        }
        // Se responde AL QUE PREGUNTÓ, no solo a la sala. El efecto de React que pide el
        // historial hace `leave-room` en su limpieza, así que había una ventana real en
        // la que la respuesta llegaba mientras el socket estaba fuera de la sala: el
        // historial se emitía al vacío y el chat se quedaba en "Sin mensajes" aunque la
        // petición hubiera ido bien.
        socket.emit('chat-history', respuesta)
        // Y a la sala, para que las demás pestañas del mismo número se enteren. El
        // socket que preguntó puede recibirlo dos veces: el handler del front sustituye
        // el historial completo, así que repetirlo es inofensivo.
        socket.broadcast.to(numberId.toString()).emit('chat-history', respuesta)
      } catch (err) {
        // Antes: `return err`. El error se devolvía al vacío —nadie lee lo que
        // retorna un handler de socket.io— así que el front pedía el historial, no
        // llegaba nunca y la conversación se quedaba en blanco sin explicación.
        const detalle = err instanceof Error ? err.message : String(err)
        console.error(
          `❌ No se pudo cargar el historial del chat ${to} en la línea ${numberId}: ${detalle}`
        )
        socket.emit('chat-history-error', {
          numberId,
          to,
          // El front necesita distinguir "esto no se arregla reintentando" (un id que no
          // es de WhatsApp) de "esto quizá sí" (el store del navegador falló). Sin el
          // code reintentaba a ciegas para siempre.
          code: 'FALLO_STORE',
          message: 'No se pudo cargar la conversación. Reintenta en unos segundos.'
        })
      }
    })
    socket.onAny(async () => {
      const startCPU = process.cpuUsage()

      const endMem = process.memoryUsage()
      const memUsageMB = (endMem.rss / 1024 / 1024).toFixed(2)
      const cpuDiff = process.cpuUsage(startCPU)
      const cpuUsedMs = ((cpuDiff.user + cpuDiff.system) / 1000).toFixed(2)

      try {
        await supabase.from('Telemetry').insert({
          cpuUsageMs: +cpuUsedMs,
          ramUsageMB: +memUsageMB,
          networkEgressKB: 0.05,
          ip: '0.0.0.0',
          city: 'Bogota',
          country: 'Colombia'
        })
      } catch (error) {
        console.error('❌ Error guardando datos de telemetría:', error)
      }
    })
  })
}


/**
 * RESTAURA LAS SESIONES DE WHATSAPP AL ARRANCAR EL PROCESO.
 *
 * Hasta ahora la ÚNICA forma de levantar un cliente era que alguien abriera la pantalla
 * y pulsara conectar: no había nada que lo hiciera al arrancar. Consecuencia: cada
 * despliegue —o cada reinicio del contenedor— dejaba WhatsApp mudo hasta que un humano
 * entraba a la app. Los mensajes que llegaban en ese hueco se perdían sin dejar rastro,
 * porque no había ningún `client.on('message')` escuchando.
 *
 * Las sesiones están en el volumen, así que se pueden reabrir sin pedir un QR nuevo. Se
 * levantan de una en una y no en paralelo: cada línea abre su propio Chromium, y
 * arrancar cinco a la vez es la forma más rápida de quedarse sin memoria en el
 * contenedor.
 *
 * Los fallos no detienen al resto ni tumban el arranque del servidor: una línea cuya
 * sesión caducó pedirá su QR cuando alguien abra su pantalla, que es exactamente lo que
 * pasaba antes para todas.
 */
export async function restaurarSesionesGuardadas(io: Server): Promise<void> {
  const enDisco = lineasConSesionGuardada()
  if (enDisco.length === 0) {
    console.log('ℹ️ No hay sesiones de WhatsApp guardadas que restaurar.')
    return
  }

  /**
   * Solo las líneas que SIGUEN EXISTIENDO en la base.
   *
   * El volumen acumula la carpeta de toda línea que alguna vez se vinculó, incluidas las
   * que el usuario ya borró. Sin este filtro se levantaban siete Chromium de golpe —uno
   * por carpeta— y eso agota la memoria del contenedor: el remedio sería peor que la
   * enfermedad que viene a curar.
   */
  const { data: filas } = await supabase
    .from('WhatsAppNumber')
    .select('id')
    .in('id', enDisco)

  const vivas = new Set((filas ?? []).map((f: { id: number }) => Number(f.id)))
  const lineas = enDisco.filter((id) => vivas.has(id))
  const huerfanas = enDisco.filter((id) => !vivas.has(id))

  if (huerfanas.length > 0) {
    console.log(
      `ℹ️ ${huerfanas.length} perfil(es) de Chromium sin línea en la base, no se levantan: ${huerfanas.join(', ')}. ` +
        'Ocupan sitio en el volumen y se pueden borrar.'
    )
  }

  if (lineas.length === 0) {
    console.log('ℹ️ Ninguna sesión guardada corresponde a una línea existente.')
    return
  }

  console.log(
    `🔄 Restaurando ${lineas.length} sesión(es) de WhatsApp guardada(s): ${lineas.join(', ')}`
  )

  for (const numberId of lineas) {
    try {
      await arrancarLinea(numberId, io)
      console.log(`✅ Línea ${numberId} restaurada y escuchando mensajes.`)
    } catch (e) {
      console.warn(
        `⚠️ No se pudo restaurar la línea ${numberId}: ${
          e instanceof Error ? e.message : String(e)
        }. Pedirá QR cuando alguien abra su pantalla.`
      )
    }
  }
}
