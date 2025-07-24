// Maneja la gestión de sesiones de WhatsApp
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import QRCode from 'qrcode'
import type { Server } from 'socket.io'
import { Client, LocalAuth } from 'whatsapp-web.js'
import type { CustomRequest, StartWhatsApp } from '../../interfaces/global'
import { supabase } from '../../config/db'
import { clients } from '../../WhatsAppClients'
import { handleIncomingMessage } from './messages.controller'

export async function startWhatsApp(req: Request, res: Response) {
  const { numberId } = req.body as Partial<StartWhatsApp>
  if (!numberId) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Falta el id del número' })
    return
  }

  try {
    const { data: number } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('id', numberId)
      .single()
    if (!number) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
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
    })

    client.on('ready', () => {
      io.to(numberId.toString()).emit('whatsapp-ready', { numberId })
    })

    client.on('disconnected', async () => {
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

    client.initialize()
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

export function setupSocketEvents(io: Server) {
  io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
      socket.join(roomId)
    })
    socket.on('get-chat-history', async ({ numberId, to }) => {
      try {
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
        messages.sort((a, b) => a.timestamp - b.timestamp)
        let lastMessageTimestamp: number | null = null
        if (messages && messages.length > 0) {
          const lastMsg = messages[messages.length - 1]
          if (lastMsg) {
            lastMessageTimestamp = lastMsg.timestamp * 1000
          }
        }
        const chatHistory = messages.map((m) => ({
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
