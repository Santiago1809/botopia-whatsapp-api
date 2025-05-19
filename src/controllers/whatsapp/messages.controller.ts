// image.pngManeja el envío y recepción de mensajes
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { supabase } from '../../config/db'
import { clients } from '../../WhatsAppClients'
import type { SendMessageBody } from '../../interfaces/global'
import { getCurrentUTCDate } from '../../lib/dateUtils'
import { getAIResponse } from '../../services/ai.service'
import { registerCreditUsage } from '../credits.controller'
import { transporter, sendEmail } from '../../services/email.service'

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, to, numberId } = req.body as SendMessageBody;
    const numberid = numberId; // Usar numberid solo para la base de datos
    if (!to) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de destino' })
      return
    }
    // Validar que 'to' sea un WhatsApp ID válido
    function isValidWhatsAppId(id: any) {
      return typeof id === 'string' && (
        id.match(/^[0-9]+@c\.us$/) || // usuario
        id.match(/^[0-9]+(-[0-9]+)?@g\.us$/) // grupo (con o sin guion)
      );
    }
    if (!isValidWhatsAppId(to)) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El destinatario no es un WhatsApp ID válido',
        to
      })
      return
    }
    // Normalizar wa_id y numberId para la consulta
    const waIdToCheck = (to || '').trim().toLowerCase();
    const numberIdNum = Number(numberid);
    const { data: syncDb, error: syncDbError } = await supabase
      .from('SyncedContactOrGroup')
      .select('id, wa_id, type')
      .eq('numberId', numberIdNum)
      .eq('wa_id', waIdToCheck)
      .single();
    if (syncDbError || !syncDb) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El chat no está sincronizado para este número',
        to
      })
      return
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
  io: any,
  numberid: string | number,
  chatIds: string[],
  client: any,
  batchSize = 20
) {
  let completed = 0;
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    await Promise.all(batch.map(async (chatId) => {
      try {
        const chat = await client.getChatById(chatId);
        if (!chat) return;
        const messages = await chat.fetchMessages({ limit: 10 });
        messages.sort((a: any, b: any) => a.timestamp - b.timestamp);
        const chatHistory = messages.map((m: any) => ({
          role: m.fromMe ? 'assistant' : 'user',
          content: m.body,
          timestamp: m.timestamp * 1000,
          to: chat.id,
          fromMe: m.fromMe
        }));
        const lastMessageTimestamp = messages.length > 0 ? messages[messages.length - 1].timestamp * 1000 : null;
        io.to(numberid.toString()).emit('chat-history', {
          numberid,
          chatHistory,
          to: chat.id._serialized,
          lastMessageTimestamp
        });
      } catch (err) {
        console.error('Error sincronizando chat:', chatId, err);
      }
    }));
    completed += batch.length;
    // Emitir progreso
    io.to(numberid.toString()).emit('sync-progress', {
      numberid,
      completed,
      total: chatIds.length
    });
  }
}

// Función para manejar mensajes entrantes
export async function handleIncomingMessage(msg: any, chat: any, numberId: string | number, io: any) {
  const idToCheck = chat.id._serialized;
  const isGroup = chat.id.server === 'g.us';

  // Busca en la base de datos si está sincronizado y habilitado
  const { data: syncDb, error: syncDbError } = await supabase
    .from('SyncedContactOrGroup')
    .select('agenteHabilitado')
    .eq('numberId', numberId)
    .eq('wa_id', idToCheck)
    .eq('type', isGroup ? 'group' : 'contact')
    .single();

  // Obtener el número completo
  let phoneNumberRaw = msg.to.split('@')[0];
  if (!phoneNumberRaw?.startsWith('+')) {
    phoneNumberRaw = '+' + phoneNumberRaw;
  }
  const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
  const numberProto = phoneUtil.parseAndKeepRawInput(phoneNumberRaw);
  const clientNumber = phoneUtil.getNationalSignificantNumber(numberProto);
  const { data: number, error: numberError } = await supabase
    .from('WhatsAppNumber')
    .select('*')
    .eq('number', clientNumber)
    .single();

  if (!number) {
    return;
  }

  const waIdToCheck = (msg.from || '').trim().toLowerCase();

  // --- NO SINCRONIZADO: Solo responde si aiUnknownEnabled y agentehabilitado en Unsyncedcontact ---
  if (!syncDb) {
    let { data: unsyncedContact, error: unsyncedError } = await supabase
      .from('Unsyncedcontact')
      .select('agentehabilitado')
      .eq('numberid', numberId)
    .eq('wa_id', waIdToCheck)
    .single();
    // Si no existe, lo inserta automáticamente
    if (!unsyncedContact) {
      const insertObj = {
        numberid: numberId,
        wa_id: waIdToCheck,
        number: waIdToCheck.split('@')[0],
        agentehabilitado: true,
        lastmessagetimestamp: Date.now(),
        lastmessagepreview: msg.body || ''
      };
      const { data: inserted, error: insertError } = await supabase
        .from('Unsyncedcontact')
        .insert([insertObj]);
      // Vuelve a consultar
      const resync = await supabase
        .from('Unsyncedcontact')
        .select('agentehabilitado')
        .eq('numberid', numberId)
        .eq('wa_id', waIdToCheck)
        .single();
      unsyncedContact = resync.data;
      unsyncedError = resync.error;
    }
    if (number.aiUnknownEnabled === true && unsyncedContact && unsyncedContact.agentehabilitado === true) {
      return handleIncomingMessageSynced(msg, chat, numberId, io, number, false);
    }
    return;
  }

  // --- GRUPO SINCRONIZADO ---
  if (
    isGroup &&
    number.aiEnabled === true &&
    number.responseGroups === true &&
    syncDb.agenteHabilitado === true
  ) {
    return handleIncomingMessageSynced(msg, chat, numberId, io, number, true);
  }

  // --- CONTACTO SINCRONIZADO ---
  if (
    !isGroup &&
    number.aiEnabled === true &&
    syncDb.agenteHabilitado === true
  ) {
    return handleIncomingMessageSynced(msg, chat, numberId, io, number, true);
  }

  // Si no, no responde
  return;
}

// Nueva función para manejar la lógica de respuesta (sincronizado o no)
async function handleIncomingMessageSynced(msg: any, chat: any, numberId: string | number, io: any, number: any, isSynced: boolean, agentId?: number) {
  const isGroup = chat.id.server === 'g.us';
  const messages = await chat.fetchMessages({ limit: 30 });
  messages.sort((a: any, b: any) => a.timestamp - b.timestamp);
  let lastMessageTimestamp: number | null = null;
  if (messages && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      lastMessageTimestamp = lastMsg.timestamp * 1000;
    }
  }
  const chatHistory = messages.map((m: any) => ({
    role: m.fromMe ? 'user' : 'assistant',
    content: m.body,
    timestamp: m.timestamp * 1000,
    to: chat.id,
    fromMe: m.fromMe
  }));
  io.to(numberId.toString()).emit('chat-history', {
    numberId,
    chatHistory,
    to: chat.id._serialized,
    lastMessageTimestamp
  });

  let user = null;
  if (number && number.userId) {
    const { data: userData } = await supabase
      .from('User')
      .select('*')
      .eq('id', number.userId)
      .single();
    user = userData;
  }
  const shouldRespond =
    (!isGroup && number.aiEnabled) ||
    (isGroup && number.aiEnabled && number.responseGroups) ||
    (!isGroup && number.aiUnknownEnabled && !isSynced); // Solo para no sincronizados
  if (!shouldRespond) {
    return;
  }
  if (shouldRespond) {
    const [aiResponse, tokens] = await getAIResponse(
      number.aiPrompt,
      msg.body,
      number.aiModel,
      chatHistory,
      user
    );
    const fraseAsesorEspecial = 'Un momento, por favor. Un asesor especializado te atenderá en breve.';
    let finalResponse = aiResponse;
    let notificacionEnviada = false;
    let agent = null;
    if (agentId) {
      const agentResult = await supabase
        .from('Agent')
        .select('id, title, advisorEmail, allowAdvisor, ownerId')
        .eq('id', agentId)
        .single();
      agent = agentResult.data;
    } else {
      const agentResult = await supabase
        .from('Agent')
        .select('id, title, advisorEmail, allowAdvisor, ownerId')
        .eq('ownerId', number.userId)
        .eq('isGlobal', false)
        .order('id', { ascending: false })
        .limit(1)
        .single();
      agent = agentResult.data;
    }
    if (
      typeof aiResponse === 'string' &&
      aiResponse.trim().toLowerCase() === fraseAsesorEspecial.toLowerCase() &&
      agent && agent.allowAdvisor && agent.advisorEmail
    ) {
      try {
        const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        await transporter.sendMail({
          from: process.env.SMTP_USER,
            to: agent.advisorEmail,
            subject: `Nuevo cliente quiere hablar con un asesor (${agent.title})`,
          html: `<p style='font-size:16px;'><b>Un cliente ha solicitado hablar con un asesor en WhatsApp.</b></p>\n<table style='font-size:15px;'>\n  <tr><td><b>Mensaje del cliente:</b></td><td>${msg.body}</td></tr>\n  <tr><td><b>Fecha y hora:</b></td><td>${fecha}</td></tr>\n  <tr><td><b>Número del cliente:</b></td><td>${msg.from}</td></tr>\n  <tr><td><b>Número destino (bot):</b></td><td>${number.number}</td></tr>\n</table>`
          });
        notificacionEnviada = true;
      } catch (err) {
        notificacionEnviada = false;
      }
    }
    if (finalResponse) {
      await msg.reply(finalResponse as string);
      chatHistory.push({
        role: 'assistant',
        content: finalResponse as string,
        timestamp: getCurrentUTCDate().getTime(),
        to: chat.id,
        fromMe: false
      });
      // Registrar el uso de créditos
      const creditsUsed = tokens !== undefined ? +tokens : 0;
      await registerCreditUsage(user.id, creditsUsed);
      io.to(numberId.toString()).emit('creditsUpdated', { creditsUsed });
      // Espera un pequeño delay para que WhatsApp sincronice el mensaje
      await new Promise((res) => setTimeout(res, 500));
      // Vuelve a obtener los últimos 30 mensajes
      const updatedMessages = await chat.fetchMessages({ limit: 30 });
      updatedMessages.sort((a: any, b: any) => a.timestamp - b.timestamp);
      const updatedChatHistory = updatedMessages.map((m: any) => ({
        role: m.fromMe ? 'assistant' : 'user',
        content: m.body,
        timestamp: m.timestamp * 1000,
        to: chat.id,
        fromMe: m.fromMe
      }));
      let lastMessageTimestamp: number | null = null;
      if (updatedMessages && updatedMessages.length > 0) {
        const lastMsg = updatedMessages[updatedMessages.length - 1];
        if (lastMsg) {
          lastMessageTimestamp = lastMsg.timestamp * 1000;
        }
      }
      io.to(numberId.toString()).emit('chat-history', {
        numberId,
        chatHistory: updatedChatHistory,
        to: chat.id._serialized,
        lastMessageTimestamp
      });
    }
  }
} 