import type { Request, Response } from 'express'
import type {
  CustomRequest,
  SendMessageBody,
  StartWhatsApp
} from '../interfaces/global'
import { prisma } from '../config/db'
import { clients } from '../WhatsAppClients'
import { Client, LocalAuth } from 'whatsapp-web.js'
import QRCode from 'qrcode'
import type { Server } from 'socket.io'
import { PhoneNumberUtil } from 'google-libphonenumber'
import { getAIResponse } from '../services/ai.service'
import { HttpStatusCode } from 'axios'
import { registerCreditUsage } from './credits.controller'
import { convertUTCToLocal, getCurrentUTCDate } from '../lib/dateUtils'
const phoneUtil = PhoneNumberUtil.getInstance()

export async function startWhatsApp(req: Request, res: Response) {
  const { numberId } = req.body as Partial<StartWhatsApp>
  if (!numberId) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Falta el id del número' })
    return
  }

  try {
    const number = await prisma.whatsAppNumber.findFirst({
      where: {
        id: numberId
      }
    })
    if (!number) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    if (clients[numberId]) {
      const client = clients[numberId]

      // Define a safer cleanup function
      const safeCleanup = async () => {
        // Remove event listeners first
        try {
          client.removeAllListeners()
        } catch (err) {
          console.warn('removeAllListeners failed', err)
        }

        // Attempt logout if possible
        try {
          if (client.pupBrowser && client.pupBrowser.isConnected()) {
            await client.logout()
          }
        } catch (err) {
          console.warn('logout failed', err)
        }

        // Close browser resources
        try {
          // Check if page exists and is not closed before attempting to close
          if (client.pupPage && !client.pupPage.isClosed?.()) {
            await client.pupPage.close().catch(() => {})
          }
        } catch (err) {
          console.warn('pupPage close failed', err)
        }

        // Handle browser disconnection
        try {
          if (client.pupBrowser) {
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
          if (typeof client.destroy === 'function') {
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
      delete clients[numberId]
    }
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: numberId.toString() }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    })
    clients[numberId] = client
    const io: Server = req.app.get('io')

    client.on('qr', async (qr) => {
      try {
        const qrImage = await QRCode.toDataURL(qr)
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

          // Define a safer cleanup function
          const safeCleanup = async () => {
            // Remove event listeners first
            try {
              client.removeAllListeners()
            } catch (err) {
              console.warn('removeAllListeners failed', err)
            }

            // Attempt logout if possible
            try {
              if (client.pupBrowser && client.pupBrowser.isConnected()) {
                await client.logout()
              }
            } catch (err) {
              console.warn('logout failed', err)
            }

            // Close browser resources
            try {
              // Check if page exists and is not closed before attempting to close
              if (client.pupPage && !client.pupPage.isClosed?.()) {
                await client.pupPage.close().catch(() => {})
              }
            } catch (err) {
              console.warn('pupPage close failed', err)
            }

            // Handle browser disconnection
            try {
              if (client.pupBrowser) {
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
              if (typeof client.destroy === 'function') {
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
          delete clients[numberId]
          io.to(numberId.toString()).emit('whatsapp-numbers-updated')
        }
      } catch (error) {
        console.log('❌ Error destruyendo la sesión de WhatsApp:', error)
      }
    })

    client.on('message', async (msg) => {
      let phoneNumberRaw = msg.to.split('@')[0]
      if (!phoneNumberRaw?.startsWith('+')) {
        phoneNumberRaw = '+' + phoneNumberRaw
      }

      try {
        const numberProto = phoneUtil.parseAndKeepRawInput(phoneNumberRaw)
        const clientNumber = phoneUtil.getNationalSignificantNumber(numberProto)
        const number = await prisma.whatsAppNumber.findFirst({
          where: {
            number: clientNumber
          },
          include: {
            user: true
          }
        })
        if (!number) {
          res
            .status(HttpStatusCode.NotFound)
            .json({ message: 'Número no encontrado' })
          return
        }
        const chat = await msg.getChat()
        const messages = await chat.fetchMessages({ limit: 20 })

        const chatHistory = messages.map((m) => ({
          role: m.fromMe ? 'assistant' : 'user',
          content: m.body,
          timestamp: m.timestamp * 1000, // Convertir timestamp de segundos a milisegundos
          to: chat.id
        }))
        io.to(numberId.toString()).emit('chat-history', {
          numberId,
          chatHistory,
          to: chat.id._serialized
        })
        const isGroup = chat.id.server === 'g.us'
        const shouldRespond =
          (!isGroup && number.aiEnabled) ||
          (isGroup && number.aiEnabled && number.responseGroups)
        if (shouldRespond) {
          const [aiResponse, tokens] = await getAIResponse(
            number.aiPrompt,
            msg.body,
            number.aiModel,
            chatHistory,
            number.user
          )

          if (aiResponse) {
            await msg.reply(aiResponse as string)
            chatHistory.push({
              role: 'assistant',
              content: aiResponse as string,
              timestamp: getCurrentUTCDate().getTime(), // Usar UTC para timestamp
              to: chat.id
            })

            // Registrar el uso de créditos
            const creditsUsed = tokens !== undefined ? +tokens : 0
            await registerCreditUsage(number.user.id, creditsUsed)
            io.to(numberId.toString()).emit('creditsUpdated', {creditsUsed} )

            io.to(numberId.toString()).emit('chat-history', {
              numberId,
              chatHistory,
              to: chat.id._serialized
            })
          }
        }
      } catch (error) {
        console.error(
          '❌ Error procesando el mensaje:',
          (error as Error).message
        )
      }
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

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, to, numberId } = req.body as SendMessageBody
    if (!to) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de destino' })
      return
    }
    const client = clients[numberId]
    if (!client) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'CNo hay sesión activa para este número'
      })
      return
    }
    await client.sendMessage(to, content)
    res.status(HttpStatusCode.Ok).json({ message: 'Mensaje enviado' })
  } catch (error) {
    console.error('❌ Error al enviar el mensaje:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error interno del servidor al enviar el mensaje'
    })
  }
}
export async function stopWhatsApp(req: CustomRequest, res: Response) {
  const user = await prisma.user.findFirst({
    where: {
      username: req.user?.username
    },
    include: {
      whatsappNumbers: true
    }
  })

  if (!user) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'Usuario no encontrado' })
    return
  }

  try {
    for (const number of user.whatsappNumbers || []) {
      await prisma.whatsAppNumber.delete({
        where: {
          id: number.id
        }
      })
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
            // Check if page exists and is not closed before attempting to close
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
    socket.onAny(async () => {
      const startCPU = process.cpuUsage()

      const endMem = process.memoryUsage()
      const memUsageMB = (endMem.rss / 1024 / 1024).toFixed(2)
      const cpuDiff = process.cpuUsage(startCPU)
      const cpuUsedMs = ((cpuDiff.user + cpuDiff.system) / 1000).toFixed(2)

      try {
        await prisma.telemetry.create({
          data: {
            cpuUsageMs: +cpuUsedMs,
            ramUsageMB: +memUsageMB,
            networkEgressKB: 0.05,
            ip: '0.0.0.0.0',
            city: 'Bogota',
            country: 'Colombia'
          }
        })
      } catch (error) {
        console.error('❌ Error guardando datos de telemetría:', error)
      }
    })
  })
}
