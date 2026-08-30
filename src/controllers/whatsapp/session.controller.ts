// Maneja la gestión de sesiones de WhatsApp
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import type { Server, Socket as SocketIO } from 'socket.io'
import whatsappWeb from 'whatsapp-web.js'
import type { CustomRequest, StartWhatsApp } from '../../interfaces/global.js'

const { Client, LocalAuth } = whatsappWeb
import { supabase } from '../../config/db.js'
import { clients } from '../../WhatsAppClients.js'
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

    if (clients[numberId]) {
      const client = clients[numberId]
      await client.logout()
      await client.destroy()
      delete clients[numberId]
    }
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: numberId.toString() }),
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
    })
    if (client) {
      clients[numberId] = client
    }
    const io: Server = req.app.get('io')

    client.on('qr', async (qr) => {
      try {
        const qrImage = await QRCode.toDataURL(qr)
        console.info(`✅ QR code generated successfully for numberId: ${numberId}`)
        io.to(numberId.toString()).emit('qr-code', { numberId, qr: qrImage })
      } catch (error) {
        console.error('❌ Error procesando el QR:', error)
      }
      // El evento avisa de que HAY un QR esperando, para que el cliente pueda
      // llamar a su operador. El código NO viaja: es una credencial de sesión y
      // quien lo escanee se apodera de la línea.
      void marcarQRPendiente(numberId)
    })

    client.on('ready', () => {
      io.to(numberId.toString()).emit('whatsapp-ready', { numberId })
      // Único "línea conectada" que existe en esta vía.
      void marcarLineaConectada(numberId, 'qr_scanned')
    })

    // No estaba registrado y es un fallo distinto de 'disconnected': aquí la
    // sesión ni siquiera llegó a autenticarse. Solo emite el evento, no cambia
    // nada del comportamiento existente.
    client.on('auth_failure', () => {
      void marcarLineaDesconectada(numberId, 'auth_failure')
    })

    client.on('disconnected', async () => {
      // Se emite ANTES de destruir la sesión: si logout() o destroy() se cuelgan
      // —que es exactamente lo que pasa cuando Chromium ya murió— el aviso ya
      // salió y el cliente se entera igual de que su línea se cayó.
      void marcarLineaDesconectada(numberId, 'logged_out')
      try {
        if (clients[numberId]) {
          const client = clients[numberId]
          await client.logout()
          await client.destroy()
          delete clients[numberId]
          io.to(numberId.toString()).emit('whatsapp-numbers-updated')
        }
      } catch (error) {
        console.log('❌ Error destruyendo la sesión de WhatsApp:', error)
      }
    })

    client.on('message', async (msg) => {
      const chat = await msg.getChat()
      await handleIncomingMessage(msg, chat, numberId, io)
    })

    // initialize() se lanzaba sin await y sin catch: si Chromium no arranca (es lo
    // que pasa cuando faltan sus librerías del sistema en el contenedor), el error
    // se perdía como unhandled rejection, el front recibía "WhatsApp iniciado" y se
    // quedaba esperando para siempre un QR que nunca iba a llegar. Ahora el fallo
    // viaja por socket a la misma pantalla que espera el QR.
    client.initialize().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('❌ No se pudo abrir el navegador de WhatsApp:', detail)
      // Fallo de ARRANQUE, distinto de una caída: la línea nunca llegó a estar
      // viva. Se distingue en el evento por reason='startup_failed'.
      void marcarLineaDesconectada(numberId, 'startup_failed')
      delete clients[numberId]
      io.to(numberId.toString()).emit('whatsapp-error', {
        numberId,
        message:
          'No pudimos abrir el navegador que genera el código QR. Al servidor le falta Chromium o alguna de sus librerías del sistema.',
        detail
      })
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
      await supabase.from('WhatsAppNumber').delete().eq('id', number.id)
      if (clients[number.id]) {
        const client = clients[number.id]

        // Define a safer cleanup function
        const safeCleanup = async () => {
          // Remove event listeners first
          try {
            client?.removeAllListeners()
          } catch (err) {
            console.warn('removeAllListeners failed', err)
          }

          // Attempt logout if possible
          try {
            if (client?.pupBrowser && client.pupBrowser.isConnected()) {
              await client.logout()
            }
          } catch (err) {
            console.warn('logout failed', err)
          }

          // Close browser resources
          try {
            if (client?.pupPage && !client.pupPage.isClosed?.()) {
              await client.pupPage.close().catch(() => {})
            }
          } catch (err) {
            console.warn('pupPage close failed', err)
          }

          // Handle browser disconnection
          try {
            if (client?.pupBrowser) {
              if (client.pupBrowser.isConnected?.()) {
                client.pupBrowser.disconnect()
              }
              await client.pupBrowser.close().catch(() => {})
            }
          } catch (err) {
            console.warn('pupBrowser close failed', err)
          }

          // Final cleanup
          try {
            if (typeof client?.destroy === 'function') {
              await client.destroy()
            }
          } catch (err) {
            console.warn('destroy failed', err)
          }
        }

        // Execute the cleanup with timeout protection
        try {
          await Promise.race([
            safeCleanup(),
            new Promise((resolve) => setTimeout(resolve, 5000))
          ])
        } catch (err) {
          console.error('Client cleanup failed:', err)
        }

        // Always delete the client reference
        delete clients[number.id]
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

      socket.join(String(roomId))
      socket.emit('room-joined', { roomId })
    })
    // El front emite 'leave-room' al cambiar de número y nadie lo escuchaba: el
    // socket seguía en la sala del número anterior y recibía su QR y su historial.
    // Salir no necesita permiso: irse de una sala no revela nada.
    socket.on('leave-room', (roomId) => {
      socket.leave(String(roomId))
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

        let client = clients[numberId]
        if (!client) {
          // Intentar inicializar el cliente automáticamente
          const { data: number } = await supabase
            .from('WhatsAppNumber')
            .select('*')
            .eq('id', numberId)
            .single()
          if (number) {
            client = new Client({
              authStrategy: new LocalAuth({ clientId: numberId.toString() }),
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
            })
            if (client) {
              clients[numberId] = client
            }
            await new Promise((resolve, reject) => {
              if (!client)
                return reject(new Error('Client is undefined after creation'))
              client.on('ready', resolve)
              client.on('auth_failure', reject)
              client.initialize()
            })
          } else {
            return
          }
        }
        if (!client) return
        const chat = await client.getChatById(to)
        if (!chat) {
          return
        }
        // Traer solo los últimos 20 mensajes, ordenados de más reciente a más antiguo
        const messages = await chat.fetchMessages({ limit: 20 })
        messages.sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)
        let lastMessageTimestamp: number | null = null
        if (messages && messages.length > 0) {
          const lastMsg = messages[messages.length - 1]
          if (lastMsg) {
            lastMessageTimestamp = lastMsg.timestamp * 1000
          }
        }
        const chatHistory = messages.map((m: { fromMe: boolean; body: string; timestamp: number }) => ({
          role: m.fromMe ? 'assistant' : 'user',
          content: m.body,
          timestamp: m.timestamp * 1000,
          to: chat.id,
          fromMe: m.fromMe
        }))
        io.to(numberId.toString()).emit('chat-history', {
          numberId,
          chatHistory,
          to: chat.id._serialized,
          lastMessageTimestamp
        })
        console.log('Emitido session-controller 292')
      } catch (err) {
        return err
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
