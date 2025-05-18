// Maneja el envío y recepción de mensajes
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { supabase } from '../../config/db'
import { clients } from '../../WhatsAppClients'
import type { SendMessageBody } from '../../interfaces/global'
import { getCurrentUTCDate } from '../../lib/dateUtils'
import { getAIResponse } from '../../services/ai.service'
import { registerCreditUsage } from '../credits.controller'

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, to, numberId } = req.body as SendMessageBody
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
    const { data: syncDb, error: syncDbError } = await supabase
      .from('SyncedContactOrGroup')
      .select('id, wa_id, type')
      .eq('numberId', numberId)
      .eq('wa_id', to)
      .single()
    if (syncDbError || !syncDb) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El chat no está sincronizado para este número',
        to
      })
      return
    }
    const client = clients[numberId]
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
  numberId: string | number,
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
        io.to(numberId.toString()).emit('chat-history', {
          numberId,
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
    io.to(numberId.toString()).emit('sync-progress', {
      numberId,
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

  if (syncDbError || !syncDb || !syncDb.agenteHabilitado) {
    return;
  }

  // SIEMPRE emitir historial aunque no responda (si está sincronizado)
  let phoneNumberRaw = msg.to.split('@')[0];
  if (!phoneNumberRaw?.startsWith('+')) {
    phoneNumberRaw = '+' + phoneNumberRaw;
  }
  try {
    const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
    const numberProto = phoneUtil.parseAndKeepRawInput(phoneNumberRaw);
    const clientNumber = phoneUtil.getNationalSignificantNumber(numberProto);
    const { data: number } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('number', clientNumber)
      .single();

    if (!number) {
      return;
    }

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

    // Solo responde si está habilitado y debe responder
    if (!syncDb.agenteHabilitado) {
      return;
    }
    // --- NUEVO: Asegúrate de tener el usuario ---
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
      (isGroup && number.aiEnabled && number.responseGroups);
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
      if (aiResponse) {
        await msg.reply(aiResponse as string);
        chatHistory.push({
          role: 'assistant',
          content: aiResponse as string,
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
  } catch (error) {
    console.error(
      '❌ Error procesando el mensaje:',
      (error as Error).message
    );
  }
} 