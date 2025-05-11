import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { PhoneNumberUtil } from 'google-libphonenumber'
import QRCode from 'qrcode'
import type { Server } from 'socket.io'
import { Client, LocalAuth } from 'whatsapp-web.js'
import type {
  CustomRequest,
  SendMessageBody,
  StartWhatsApp
} from '../interfaces/global'
import { getCurrentUTCDate } from '../lib/dateUtils'
import { getAIResponse } from '../services/ai.service'
import { clients } from '../WhatsAppClients'
import { registerCreditUsage } from './credits.controller'
import { supabase } from '../config/db'
const phoneUtil = PhoneNumberUtil.getInstance()

// Estructura en memoria para sincronizados por sesión
const syncedContactsMemory: {
  [numberId: string]: { contacts: string[]; groups: string[] }
} = {}

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
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', number.userId)
      .single()
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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    })
    if (client) {
      clients[numberId] = client
    }
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
          await client.logout()
          await client.destroy()

          // Always delete the client reference
          delete clients[numberId]
          io.to(numberId.toString()).emit('whatsapp-numbers-updated')
        }
      } catch (error) {
        console.log('❌ Error destruyendo la sesión de WhatsApp:', error)
      }
    })

    client.on('message', async (msg) => {
      const chat = await msg.getChat()
      const idToCheck = chat.id._serialized
      const isGroup = chat.id.server === 'g.us'

      // Busca en la base de datos si está sincronizado y habilitado
      const { data: syncDb, error: syncDbError } = await supabase
        .from('SyncedContactOrGroup')
        .select('agenteHabilitado')
        .eq('numberId', numberId)
        .eq('wa_id', idToCheck)
        .eq('type', isGroup ? 'group' : 'contact')
        .single()

      if (syncDbError || !syncDb || !syncDb.agenteHabilitado) {
        // No está habilitado el agente para este chat, no responder
        return
      }

      let phoneNumberRaw = msg.to.split('@')[0]
      if (!phoneNumberRaw?.startsWith('+')) {
        phoneNumberRaw = '+' + phoneNumberRaw
      }

      try {
        const numberProto = phoneUtil.parseAndKeepRawInput(phoneNumberRaw)
        const clientNumber = phoneUtil.getNationalSignificantNumber(numberProto)
        const { data: number } = await supabase
          .from('WhatsAppNumber')
          .select('*')
          .eq('number', clientNumber)
          .single()

        if (!number) {
          res
            .status(HttpStatusCode.NotFound)
            .json({ message: 'Número no encontrado' })
          return
        }
        const messages = await chat.fetchMessages({ limit: 30 })
        // Ordenar de más antiguo a más reciente
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
          to: chat.id
        }))
        io.to(numberId.toString()).emit('chat-history', {
          numberId,
          chatHistory,
          to: chat.id._serialized,
          lastMessageTimestamp
        })
        const shouldRespond =
          (!isGroup && number.aiEnabled) ||
          (isGroup && number.aiEnabled && number.responseGroups)
        if (shouldRespond) {
          const [aiResponse, tokens] = await getAIResponse(
            number.aiPrompt,
            msg.body,
            number.aiModel,
            chatHistory,
            user
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
            await registerCreditUsage(user.id, creditsUsed)
            io.to(numberId.toString()).emit('creditsUpdated', { creditsUsed })

            // Espera un pequeño delay para que WhatsApp sincronice el mensaje
            await new Promise((res) => setTimeout(res, 500))
            // Vuelve a obtener los últimos 30 mensajes
            const updatedMessages = await chat.fetchMessages({ limit: 30 })
            updatedMessages.sort((a, b) => a.timestamp - b.timestamp)
            const updatedChatHistory = updatedMessages.map((m) => ({
              role: m.fromMe ? 'assistant' : 'user',
              content: m.body,
              timestamp: m.timestamp * 1000,
              to: chat.id
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
    const { data: contact } = await supabase
      .from('SyncedContactOrGroup')
      .select('wa_id')
      .eq('id', to)
      .single()
    const client = clients[numberId]
    if (!client) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'CNo hay sesión activa para este número'
      })
      return
    }
    await client.sendMessage(contact?.wa_id, content)
    res.status(HttpStatusCode.Ok).json({ message: 'Mensaje enviado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error interno del servidor al enviar el mensaje: ${
        (error as Error).message
      }`
    })
  }
}
export async function stopWhatsApp(req: CustomRequest, res: Response) {
  /* const user = await prisma.user.findFirst({
    where: {
      username: req.user?.username
    },
    include: {
      whatsappNumbers: true
    }
  }) */
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
            const { Client, LocalAuth } = require('whatsapp-web.js')
            client = new Client({
              authStrategy: new LocalAuth({ clientId: numberId.toString() }),
              puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        const messages = await chat.fetchMessages({ limit: 30 })
        // Ordenar de más antiguo a más reciente
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
          to: chat.id
        }))
        io.to(numberId.toString()).emit('chat-history', {
          numberId,
          chatHistory,
          to: chat.id._serialized,
          lastMessageTimestamp
        })
      } catch (err) {
        // Error fetching chat history
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
          ip: '0.0.0.0.0',
          city: 'Bogota',
          country: 'Colombia'
        })
      } catch (error) {
        console.error('❌ Error guardando datos de telemetría:', error)
      }
    })
  })
}

export async function getContacts(req: Request, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  const client = clients[numberId as string]
  if (!client) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'WhatsApp client not found for this numberId' })
    return
  }
  try {
    const contacts = await client.getContacts()
    // Puedes filtrar o mapear los datos si quieres devolver solo ciertos campos
    const contactList = contacts.map((contact) => ({
      id: contact.id._serialized,
      name: contact.name || contact.pushname || contact.number,
      number: contact.number,
      isGroup: contact.isGroup,
      isMyContact: contact.isMyContact
    }))
    res.status(HttpStatusCode.Ok).json(contactList)
  } catch (error) {
    console.error('Error getting contacts:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error getting contacts' })
  }
}

export async function syncContacts(req: Request, res: Response) {
  const { numberId, contacts, groups } = req.body
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  // Guardar en memoria
  syncedContactsMemory[numberId] = {
    contacts: contacts || [],
    groups: groups || []
  }
  res.status(HttpStatusCode.Ok).json({ message: 'Contacts and groups synced!' })
}

// NUEVO: Guardar sincronización en base de datos
export async function syncContactsToDB(req: Request, res: Response) {
  const { numberId, contacts, groups } = req.body
  // console.log('SYNC REQUEST:', { numberId, contacts, groups }); // LOG para depuración
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  await supabase.from('SyncedContactOrGroup').delete().eq('numberId', numberId)

  // Limpia los objetos para que solo tengan los campos válidos
  const toInsert = [
    ...(contacts || []).map((c: any) => ({
      numberId: Number(numberId),
      type: 'contact',
      wa_id: c.id,
      name: c.name,
      agenteHabilitado: true
    })),
    ...(groups || []).map((g: any) => ({
      numberId: Number(numberId),
      type: 'group',
      wa_id: g.id,
      name: g.name,
      agenteHabilitado: true
    }))
  ]

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('SyncedContactOrGroup')
      .insert(toInsert)
    if (error) {
      console.error('SUPABASE INSERT ERROR:', error)
      res
        .status(500)
        .json({ message: 'Error insertando en la base de datos', error })
      return
    }
  }

  res.status(200).json({ message: 'Sincronización guardada en base de datos' })
  return
}

export async function updateAgenteHabilitado(req: Request, res: Response) {
  const { id, agenteHabilitado } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }

  const { error } = await supabase
    .from('SyncedContactOrGroup')
    .update({ agenteHabilitado })
    .eq('id', id)

  if (error) {
    res.status(500).json({ message: 'Error actualizando' })
    return
  }
  res.status(200).json({ message: 'Actualizado correctamente' })
  return
}

export async function getSyncedContacts(req: Request, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  const { data, error } = await supabase
    .from('SyncedContactOrGroup')
    .select('*')
    .eq('numberId', numberId)

  if (error) {
    res.status(500).json({ message: 'Error obteniendo datos' })
    return
  }
  // Siempre devuelve un array
  res.status(200).json(data || [])
  return
}

// NUEVO: Eliminar un sincronizado por id
export async function deleteSynced(req: Request, res: Response) {
  const { id } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }
  const { error } = await supabase
    .from('SyncedContactOrGroup')
    .delete()
    .eq('id', id)
  if (error) {
    res.status(500).json({ message: 'Error eliminando', error })
    return
  }
  res.status(200).json({ message: 'Eliminado correctamente' })
}
