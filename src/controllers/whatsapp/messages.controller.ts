// image.pngManeja el envío y recepción de mensajes
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { PhoneNumberUtil } from 'google-libphonenumber'
import type { Server } from 'socket.io'
import type { Chat, Client, Message } from 'whatsapp-web.js'
import { supabase } from '../../config/db'
import type { Number, SendMessageBody } from '../../interfaces/global'
import { getCurrentUTCDate } from '../../lib/dateUtils'
import { getAIResponse } from '../../services/ai.service'
import { transporter } from '../../services/email.service'
import { clients } from '../../WhatsAppClients'
import { registerCreditUsage } from '../credits.controller'


export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, to, numberId } = req.body as SendMessageBody
    const numberid = numberId // Usar numberid solo para la base de datos
    if (!to) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de destino' })
      return
    }
    // Validar que 'to' sea un WhatsApp ID válido
    function isValidWhatsAppId(id: string | undefined) {
      return (
        typeof id === 'string' &&
        (id.match(/^[0-9]+@c\.us$/) || // usuario
          id.match(/^[0-9]+(-[0-9]+)?@g\.us$/)) // grupo (con o sin guion)
      )
    }
    if (!isValidWhatsAppId(to)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El destinatario no es un WhatsApp ID válido',
        to
      })
      return
    }
    // Normalizar wa_id y numberId para la consulta
    const waIdToCheck = (to || '').trim().toLowerCase()
    const numberIdNum = Number(numberid)
    const { data: syncDb, error: syncDbError } = await supabase
      .from('SyncedContactOrGroup')
      .select('id, wa_id, type')
      .eq('numberId', numberIdNum)
      .eq('wa_id', waIdToCheck)
      .single()
    if (syncDbError && syncDbError.code !== 'PGRST116') {
      // Buscar en Unsyncedcontact
      const { data: unsynced, error: unsyncedError } = await supabase
        .from('Unsyncedcontact')
        .select('id')
        .eq('numberid', numberIdNum)
        .eq('wa_id', waIdToCheck)
        .single()
      if (unsyncedError && unsyncedError.code !== 'PGRST116') {
        console.error('Error buscando en Unsyncedcontact:', unsyncedError);
      }
      if (!unsynced) {
        res.status(HttpStatusCode.BadRequest).json({
          message:
            'El chat no está sincronizado ni registrado como no sincronizado para este número',
          to
        })
        return
      }
      // Si está en Unsyncedcontact, permite el envío (sin importar agentehabilitado)
    }
    const client = clients[numberid]
    if (!client) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'No hay sesión activa para este número'
      })
      return
    }
    await client.sendMessage(to, content)
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
            to: chat.id,
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
const respondedMessages = new Set<string>();

// Función para manejar mensajes entrantes
export async function handleIncomingMessage(
  msg: Message,
  chat: Chat,
  numberId: string | number,
  io: Server
) {
  // --- CONTROL DE DUPLICADOS EN MEMORIA ---
  if (respondedMessages.has(msg.id._serialized)) {
    return;
  }
  respondedMessages.add(msg.id._serialized);
  // Log SIEMPRE que se reciba un mensaje
  // console.log('[WHATSAPP][MSG RECIBIDO]', {
  //   from: msg.from,
  //   numberId,
  //   chatName: chat.name || chat.id._serialized,
  //   message: msg.body
  // });
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

  // Solo hago return si el error es diferente a PGRST116 (no hay filas)
  if (syncDbError && syncDbError.code !== 'PGRST116') {
    console.error('Error buscando en SyncedContactOrGroup:', syncDbError);
    return;
  }
  // Obtener el número completo
  let phoneNumberRaw = msg.to.split('@')[0]
  if (!phoneNumberRaw?.startsWith('+')) {
    phoneNumberRaw = '+' + phoneNumberRaw
    const phoneUtil = PhoneNumberUtil.getInstance()
    const numberProto = phoneUtil.parseAndKeepRawInput(phoneNumberRaw)
    const clientNumber = phoneUtil.getNationalSignificantNumber(numberProto)
    const { data: number, error: numberError } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('number', clientNumber)
      .single()

    if (!number || numberError) {
      console.error('Error buscando en WhatsAppNumber:', numberError);
      return
    }

    const waIdToCheck = (msg.from || '').trim().toLowerCase()
    //console.log('Datos para inserción:', { waIdToCheck, numberId, msgFrom: msg.from, msgBody: msg.body });

    // --- NO SINCRONIZADO: Solo responde si aiUnknownEnabled y agentehabilitado en Unsyncedcontact ---
    if (!syncDb) {
      // Buscar en Unsyncedcontact
      let { data: unsyncedContact, error: unsyncedError } = await supabase
        .from('Unsyncedcontact')
        .select('agentehabilitado')
        .eq('numberid', numberId)
        .eq('wa_id', waIdToCheck)
        .single();
      if (unsyncedError && unsyncedError.code !== 'PGRST116') {
        console.error('Error buscando en Unsyncedcontact:', unsyncedError);
      }
      // Si no existe, lo inserta automáticamente
      if (!unsyncedContact || unsyncedError) {
        //console.log('Insertando nuevo no sincronizado:', waIdToCheck, numberId);
        const numberFromWaId = waIdToCheck.split('@')[0];
        const contactData = {
          numberid: numberId,
          wa_id: waIdToCheck,
          number: numberFromWaId,
          name: numberFromWaId, // Usar el número como nombre por defecto
          agentehabilitado: true,
          lastmessagetimestamp: Date.now(),
          lastmessagepreview: msg.body || ''
        };
        const { error: upsertError } = await supabase
          .from('Unsyncedcontact')
          .upsert([contactData], {
            onConflict: 'numberid,wa_id',
            ignoreDuplicates: false
          });
        if (upsertError) {
          console.error('Error al guardar contacto no sincronizado:', upsertError);
          return;
        }
        if (io && typeof io.to === 'function') {
          io.to(numberId.toString()).emit('unsynced-contacts-updated', {
            numberid: numberId
          });
        }
      }
      // Consultar el contacto actualizado
      const { data: updatedContact, error: queryError } = await supabase
        .from('Unsyncedcontact')
        .select('id, agentehabilitado')
        .eq('numberid', numberId)
        .eq('wa_id', waIdToCheck)
        .single();

      if (queryError) {
        console.error('Error al consultar contacto no sincronizado:', queryError);
        return;
      }

      // Si está habilitado y la IA está activada para desconocidos, responder SOLO si NO es grupo
      if (
        !isGroup &&
        number.aiUnknownEnabled === true &&
        updatedContact &&
        updatedContact.agentehabilitado === true
      ) {
        return handleIncomingMessageSynced(
          msg,
          chat,
          numberId,
          io,
          number,
          false
        );
      }
      return;
    }
    // --- NO SINCRONIZADO: Solo responde si aiUnknownEnabled y agentehabilitado en Unsyncedcontact ---
    if (!syncDb) {
      try {
        // Extraer el número del wa_id (sin el @c.us)
        const numberFromWaId = waIdToCheck.split('@')[0]

        // Preparar el objeto para insertar/actualizar
        const contactData = {
          numberid: numberId,
          wa_id: waIdToCheck,
          number: numberFromWaId,
          name: numberFromWaId, // Usar el número como nombre por defecto
          agentehabilitado: true,
          lastmessagetimestamp: Date.now(),
          lastmessagepreview: msg.body || ''
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
          return
        }

        // EMITIR EVENTO SOCKET para refrescar lista en frontend SIEMPRE
        if (io && typeof io.to === 'function') {
          io.to(numberId.toString()).emit('unsynced-contacts-updated', {
            numberid: numberId
          })
        }

        // Consultar el contacto actualizado
        const { data: updatedContact, error: queryError } = await supabase
          .from('Unsyncedcontact')
          .select('id, agentehabilitado')
          .eq('numberid', numberId)
          .eq('wa_id', waIdToCheck)
          .single()

        if (queryError) {
          console.error(
            'Error al consultar contacto no sincronizado:',
            queryError
          )
          return
        }

        // Si está habilitado y la IA está activada para desconocidos, responder SOLO si NO es grupo
        if (
          !isGroup &&
          number.aiUnknownEnabled === true &&
          updatedContact &&
          updatedContact.agentehabilitado === true
        ) {
          return handleIncomingMessageSynced(
            msg,
            chat,
            numberId,
            io,
            number,
            false
          )
        }
      } catch (error) {
        console.error('Error en manejo de contacto no sincronizado:', error)
      }
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
    return
  }

  // Nueva función para manejar la lógica de respuesta (sincronizado o no)
  async function handleIncomingMessageSynced(
    msg: Message,
    chat: Chat,
    numberId: string | number,
    io: Server,
    number: Number,
    isSynced: boolean,
    agentId?: number
  ) {
    const isGroup = chat.id.server === 'g.us'
    const messages = await chat.fetchMessages({ limit: 30 })
    messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
    let lastMessageTimestamp: number | null = null
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg) {
        lastMessageTimestamp = lastMsg.timestamp * 1000
      }
    }
    const chatHistory = messages.map((m: Message) => ({
      role: m.fromMe ? 'user' : 'assistant',
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

    let user = null
    if (number && number.userId) {
      const { data: userData } = await supabase
        .from('User')
        .select('*')
        .eq('id', number.userId)
        .single()
      user = userData
    }
    const shouldRespond =
      (!isGroup && number.aiEnabled) ||
      (isGroup && number.aiEnabled && number.responseGroups) ||
      (!isGroup && number.aiUnknownEnabled && !isSynced) // Solo para no sincronizados
    if (!shouldRespond) {
      return
    }
    if (shouldRespond) {
      const [aiResponse, tokens] = await getAIResponse(
        number.aiPrompt,
        msg.body,
        number.aiModel,
        chatHistory
      )
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
      if (
        typeof aiResponse === 'string' &&
        aiResponse.trim().toLowerCase() === fraseAsesorEspecial.toLowerCase() &&
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
          await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: agent.advisorEmail,
            subject: `Nuevo cliente quiere hablar con un asesor (${agent.title})`,
            html: `<p style='font-size:16px;'><b>Un cliente ha solicitado hablar con un asesor en WhatsApp.</b></p>
<table style='font-size:15px;'>
  <tr><td><b>Mensaje del cliente:</b></td><td>${msg.body}</td></tr>
  <tr><td><b>Fecha y hora:</b></td><td>${fecha}</td></tr>
  <tr><td><b>Número del cliente:</b></td><td>${msg.from.split('@')[0]}</td></tr>
  <tr><td><b>Número destino (bot):</b></td><td>${number.number}</td></tr>
</table>
<br>
<b>Historial reciente de la conversación:</b>
<table style='font-size:15px; margin-top:6px; margin-bottom:6px;'>
${ultimosMensajes}
</table>
<br><div style='color:#b91c1c;font-size:15px;'><b>⚠️ La IA ha sido desactivada para este contacto. Recuerda volver a activarla manualmente si deseas que la IA siga respondiendo a este cliente.</b></div>`
          })
          // DESACTIVAR IA para este contacto (sincronizado o no)
          // Primero intenta en SyncedContactOrGroup
          const { data: syncedContact } = await supabase
            .from('SyncedContactOrGroup')
            .select('id')
            .eq('numberId', numberId)
            .eq('wa_id', chat.id._serialized)
            .eq('type', isGroup ? 'group' : 'contact')
            .single()
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
            // Si no está sincronizado, busca en Unsyncedcontact
            const { data: unsyncedContact } = await supabase
              .from('Unsyncedcontact')
              .select('id')
              .eq('numberid', numberId)
              .eq('wa_id', chat.id._serialized)
              .single()
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
        chat.sendStateTyping()
        const messageLength = (finalResponse as string).length
        const baseDelay = 2000
        const additionalDelay = Math.min(2000, messageLength * 50)
        const totalDelay = baseDelay + additionalDelay

        setTimeout(async () => {
          chat.clearState()
          await msg.reply(finalResponse as string)
        }, totalDelay)

        chatHistory.push({
          role: 'assistant',
          content: finalResponse as string,
          timestamp: getCurrentUTCDate().getTime(),
          to: chat.id,
          fromMe: false
        })
        // Registrar el uso de créditos
        const creditsUsed = tokens !== undefined ? +tokens : 0
        await registerCreditUsage(user.id, creditsUsed)
        io.to(numberId.toString()).emit('creditsUpdated', { creditsUsed })
        // Espera un pequeño delay para que WhatsApp sincronice el mensaje
        await new Promise((res) => setTimeout(res, 500))
        // Vuelve a obtener los últimos 30 mensajes
        const updatedMessages = await chat.fetchMessages({ limit: 30 })
        updatedMessages.sort(
          (a: Message, b: Message) => a.timestamp - b.timestamp
        )
        const updatedChatHistory = updatedMessages.map((m: Message) => ({
          role: m.fromMe ? 'assistant' : 'user',
          content: m.body,
          timestamp: m.timestamp * 1000,
          to: chat.id,
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
      }
    }
  }
}
