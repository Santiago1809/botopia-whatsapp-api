// image.pngManeja el envío y recepción de mensajes
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { PhoneNumberUtil } from 'google-libphonenumber'
import type { Server } from 'socket.io'
import type { Chat, Client, Message } from 'whatsapp-web.js'
import { supabase } from '../../config/db'
import type {
  CustomRequest,
  Number,
  SendMessageBody
} from '../../interfaces/global'
import {
  advisorRequestEmailTemplate,
  limitReachedEmailTemplate
} from '../../lib/constants'
import { getCurrentUTCDate } from '../../lib/dateUtils'
import { getAIResponse } from '../../services/ai.service'
import { transporter } from '../../services/email.service'
import { clients } from '../../WhatsAppClients'

// Helper function to handle message usage counting
async function incrementMessageUsage(userId: number): Promise<{
  success: boolean
  message?: string
  currentUsage?: number
  limit?: number
}> {
  try {
    // Get user subscription and plan limits
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, subscription')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.error('Error buscando en User:', userError)
      return { success: false, message: 'Usuario no encontrado' }
    }

    const { data: plan, error: planError } = await supabase
      .from('PlanLimit')
      .select('monthly_message_limit')
      .eq('plan_name', user.subscription)
      .single()

    if (planError || !plan) {
      console.error('Error buscando en PlanLimit:', planError)
      return { success: false, message: 'Plan no encontrado' }
    }

    const { monthly_message_limit } = plan
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // Get current usage
    const { data: usage, error } = await supabase
      .from('UserMessageUsage')
      .select('*')
      .eq('userid', user.id)
      .eq('year', year)
      .eq('month', month)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error buscando en UserMessageUsage:', error)
      return { success: false, message: 'Error consultando uso de mensajes' }
    }

    const currentUsage = usage ? usage.usedmessages : 0

    // Check if limit is reached
    if (currentUsage >= monthly_message_limit) {
      return {
        success: false,
        message: 'Límite mensual de mensajes alcanzado',
        currentUsage,
        limit: monthly_message_limit
      }
    }

    // Update or insert usage
    if (!usage) {
      const { error: insertError } = await supabase
        .from('UserMessageUsage')
        .insert({
          userid: user.id,
          year,
          month,
          usedmessages: 1
        })
      if (insertError) {
        console.error('Error registrando primer mensaje:', insertError)
        return { success: false, message: 'Error registrando uso de mensajes' }
      }
    } else {
      const { error: updateError } = await supabase
        .from('UserMessageUsage')
        .update({
          usedmessages: usage.usedmessages + 1,
          updatedat: new Date().toISOString()
        })
        .eq('id', usage.id)
      if (updateError) {
        console.error('Error actualizando contador:', updateError)
        return {
          success: false,
          message: 'Error actualizando contador de mensajes'
        }
      }
    }

    return {
      success: true,
      currentUsage: currentUsage + 1,
      limit: monthly_message_limit
    }
  } catch (error) {
    console.error('Error en incrementMessageUsage:', error)
    return { success: false, message: 'Error interno del servidor' }
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
      console.log(
        `Email de límite ya enviado hoy para usuario ${number.userId}`
      )
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

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: user.email,
      subject,
      html: emailContent
    })

    limitMessagesSent.set(number.userId, today)

    console.log(
      `Email de límite enviado a ${user.email} para usuario ${user.username} (ID: ${user.id}) con plan ${user.subscription}`
    )
  } catch (error) {
    console.error('Error sending limit reached email:', error)
  }
}

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
    const { error: syncDbError } = await supabase
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
        console.error('Error buscando en Unsyncedcontact:', unsyncedError)
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

    // Check message limit BEFORE sending
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

    // Check if user has reached message limit
    const { data: usageData, error: usageError } = await supabase.rpc(
      'get_user_message_usage',
      { p_user_id: number.userId }
    )

    if (usageError || !usageData || usageData.length === 0) {
      res.status(HttpStatusCode.InternalServerError).json({
        message: 'Error consultando uso de mensajes del usuario'
      })
      return
    }

    const { current_usage: currentUsage, message_limit: limit } = usageData[0]

    if (currentUsage >= limit) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'Límite mensual de mensajes alcanzado',
        currentUsage,
        limit
      })
      return
    }

    // Now send the message
    await client.sendSeen(to)
    await client.sendMessage(to, content)

    // Increment message usage after successful sending
    const usageResult = await incrementMessageUsage(number.userId)
    if (!usageResult.success) {
      // Message was sent but usage wasn't recorded properly
      console.error(
        'Error incrementando uso de mensajes después del envío:',
        usageResult.message
      )
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Mensaje enviado' })
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('serialize')) {
      // Considera el mensaje como enviado, pero no muestres ningún mensaje al usuario
      res.status(HttpStatusCode.Ok).json({});
      return;
    }
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

// Función para manejar mensajes entrantes
export async function handleIncomingMessage(
  msg: Message,
  chat: Chat,
  numberId: string | number,
  io: Server
) {
  // Validaciones básicas para evitar errores de serialización
  try {
    // Verificar que el mensaje tiene las propiedades básicas
    if (!msg || !msg.id || !msg.id._serialized) {
      console.log('Mensaje sin ID válido, omitiendo');
      return;
    }

    // Verificar que el chat tiene las propiedades básicas
    if (!chat || !chat.id || !chat.id._serialized) {
      console.log('Chat sin ID válido, omitiendo');
      return;
    }

    // Verificar que el mensaje tiene contenido o es un tipo válido
    if (!msg.body && !msg.hasMedia) {
      console.log('Mensaje sin contenido válido, omitiendo');
      return;
    }

    // Validación adicional: asegurarse de que el mensaje no es undefined o está corrupto
    if (typeof msg.from !== 'string' || typeof msg.to !== 'string') {
      console.log('Mensaje con propiedades from/to inválidas, omitiendo');
      return;
    }

    // Verificar que el mensaje no está corrupto
    if (!msg.from.includes('@') || !msg.to.includes('@')) {
      console.log('Mensaje con formato de WhatsApp ID inválido, omitiendo');
      return;
    }

    // Verificar que el cliente WhatsApp está disponible
    const client = clients[numberId];
    if (!client || !client.info || !client.info.wid) {
      console.log('Cliente WhatsApp no disponible o no inicializado, omitiendo mensaje');
      return;
    }

    // Esperar un poco para asegurar que el mensaje esté completamente cargado
    await new Promise(resolve => setTimeout(resolve, 200));
    
  } catch (validationError) {
    console.error('Error en validación inicial del mensaje:', validationError);
    return;
  }

  // --- CONTROL DE DUPLICADOS EN MEMORIA ---
  if (respondedMessages.has(msg.id._serialized)) {
    return
  }
  respondedMessages.set(msg.id._serialized, Date.now()) // Log SIEMPRE que se reciba un mensaje
  // console.log('[WHATSAPP][MSG RECIBIDO]', {
  //   from: msg.from,
  //   numberId,
  //   chatName: chat.name || chat.id._serialized,
  //   message: msg.body
  // });
  const idToCheck = chat.id._serialized
  const isGroup = chat.id.server === 'g.us'
  if (msg.isStatus) {
    return
  }

  // Increment message usage for incoming message
  const { data: number, error: numberError } = await supabase
    .from('WhatsAppNumber')
    .select('userId')
    .eq('id', numberId)
    .single()
  if (!numberError && number) {
    const usageResult = await incrementMessageUsage(number.userId)
    if (!usageResult.success) {
      // Send upgrade email when limit is reached
      if (
        usageResult.message?.includes('Límite mensual de mensajes alcanzado')
      ) {
        await sendLimitReachedMessage(msg, chat, number)
      }

      // Continue processing the message even if usage increment fails
    }
  }
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

    // Only allow group messages for PRO or INDUSTRIAL plans
    if (user.subscription !== 'PRO' && user.subscription !== 'INDUSTRIAL') {
      return
    }
  }
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
    console.error('Error buscando en SyncedContactOrGroup:', syncDbError)
    return
  } // Obtener el número completo
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
      console.error('Error buscando en WhatsAppNumber:', numberError)
      return
    }

    const waIdToCheck = (msg.from || '').trim().toLowerCase()
    //console.log('Datos para inserción:', { waIdToCheck, numberId, msgFrom: msg.from, msgBody: msg.body });

    // --- NO SINCRONIZADO: Solo responde si aiUnknownEnabled y agentehabilitado en Unsyncedcontact ---
    if (!syncDb) {
      try {
        // Validar que el mensaje y el chat están correctamente formateados
        if (!msg || !msg.from || !msg.body) {
          console.log('Mensaje incompleto recibido, omitiendo:', { from: msg?.from, body: msg?.body });
          return;
        }

        // Validar que el chat está disponible
        if (!chat || !chat.id || !chat.id._serialized) {
          console.log('Chat no válido, omitiendo:', chat);
          return;
        }

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
          // Lógica para evitar dos respuestas IA iguales seguidas
          const aiResponse = await getAIResponse(
            number.aiPrompt,
            msg.body,
            number.aiModel,
            [] // Puedes pasar el historial si lo necesitas
          );
          if (!aiResponse[0] || typeof aiResponse[0] !== 'string') {
            return;
          }
          const lastReply = lastUnsyncedReplies.get(waIdToCheck);
          const lastAIResponse = lastUnsyncedAIResponse.get(waIdToCheck);
          // Lógica: solo bloquear si el mensaje recibido es igual al anterior Y la respuesta IA también es igual a la anterior
          if (lastReply && lastReply === msg.body && lastAIResponse && aiResponse[0] === lastAIResponse) {
            // Es el mismo mensaje recibido y la misma respuesta IA, no respondas
            return;
          }
          // Si vas a responder, guarda el mensaje recibido y la respuesta IA
          lastUnsyncedReplies.set(waIdToCheck, msg.body);
          lastUnsyncedAIResponse.set(waIdToCheck, aiResponse[0]);
          
          // Validar que el chat sigue disponible antes de responder
          try {
            // Verificar que el chat está activo y disponible
            if (!chat || !chat.id || !chat.id._serialized) {
              console.error('Chat no disponible para responder a contacto no sincronizado');
              return;
            }

            // Mostrar 'escribiendo...' antes de responder
            await chat.sendStateTyping();
            await new Promise(res => setTimeout(res, 1200)); // Simula que está escribiendo ~1.2s
            await chat.clearState();
            
            // Usar chat.sendMessage() en lugar de msg.reply() para evitar problemas de serialización
            await chat.sendMessage(aiResponse[0]);
            console.log('✅ Respuesta enviada a contacto no sincronizado:', waIdToCheck);
          } catch (replyError) {
            // Los errores de serialización son normales en WhatsApp Web.js
            // Solo loguear si NO es un error de serialización
            if (replyError instanceof Error && 
                !replyError.message.includes('serialize') &&
                !replyError.message.includes('getMessageModel') &&
                !replyError.message.includes('Evaluation failed')) {
              console.error('Error crítico enviando respuesta a contacto no sincronizado:', replyError.message);
            }
            // No hacer nada más - los errores de serialización son normales
          }
          return;
        }
      } catch (error) {
        console.error('Error en manejo de contacto no sincronizado:', error)
        // Registrar más detalles del error para debugging
        if (error instanceof Error) {
          console.error('Error stack:', error.stack);
        }
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
    try {
      // Validaciones de seguridad
      if (!chat || !chat.id) {
        console.error('Chat no válido en handleIncomingMessageSynced');
        return;
      }

      const isGroup = chat.id.server === 'g.us'
      
      // Intentar obtener mensajes con manejo de errores
      let messages: Message[] = [];
      try {
        messages = await chat.fetchMessages({ limit: 30 })
        messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp)
      } catch (fetchError) {
        console.error('Error al obtener mensajes del chat:', fetchError);
        // Continuar con array vacío en caso de error
        messages = [];
      }
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
    const shouldRespond =
      (!isGroup && number.aiEnabled) ||
      (isGroup && number.aiEnabled && number.responseGroups) ||
      (!isGroup && number.aiUnknownEnabled && !isSynced) // Solo para no sincronizados
    if (!shouldRespond) {
      return
    }
    if (shouldRespond) {
      const [aiResponse] = await getAIResponse(
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
          // Extract client phone number from msg.from
          const clientPhone: string =
            (msg.from || 'unknown@domain.com').split('@')[0] ?? 'desconocido'

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
          }

          return // Don't send AI response if limit is reached
        }

        chat.sendStateTyping()
        const messageLength = (finalResponse as string).length
        const baseDelay = 2000
        const additionalDelay = Math.min(2000, messageLength * 50)
        const totalDelay = baseDelay + additionalDelay

        setTimeout(async () => {
          try {
            // Validar que el chat sigue disponible
            if (!chat || !chat.id || !chat.id._serialized) {
              console.error('Chat no disponible para enviar respuesta de IA');
              return;
            }

            await chat.clearState()
            
            // Intentar enviar el mensaje usando chat.sendMessage()
            await chat.sendMessage(finalResponse as string)
            
            console.log('✅ Respuesta de IA enviada a:', chat.id._serialized);
            
          } catch (sendError) {
            // Los errores de serialización son normales en WhatsApp Web.js
            // Solo loguear si NO es un error de serialización
            if (sendError instanceof Error && 
                !sendError.message.includes('serialize') &&
                !sendError.message.includes('getMessageModel') &&
                !sendError.message.includes('Evaluation failed')) {
              console.error('Error crítico enviando respuesta de IA:', sendError.message);
            }
            // No hacer nada más - los errores de serialización son normales
          }
        }, totalDelay)

        chatHistory.push({
          role: 'assistant',
          content: finalResponse as string,
          timestamp: getCurrentUTCDate().getTime(),
          to: chat.id,
          fromMe: false
        })

        // Espera un pequeño delay para que WhatsApp sincronice el mensaje
        await new Promise((res) => setTimeout(res, 500))
        
        // Vuelve a obtener los últimos 30 mensajes con manejo de errores
        try {
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
        } catch (fetchError) {
          console.error('Error al refrescar el historial del chat después de responder:', fetchError);
          // Emitir el historial original si falla la actualización
          io.to(numberId.toString()).emit('chat-history', {
            numberId,
            chatHistory,
            to: chat.id._serialized,
            lastMessageTimestamp
          })
        }
      }
    }
    } catch (syncError) {
      console.error('Error en handleIncomingMessageSynced:', syncError);
      if (syncError instanceof Error) {
        console.error('Error stack:', syncError.stack);
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
