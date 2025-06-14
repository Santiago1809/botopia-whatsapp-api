/**
 * @file Meta Webhook Controller
 * @description Controller para gestionar los webhooks de las APIs de Meta
 * @author Botopia Team
 * @created June 14, 2025
 */

import crypto from 'crypto'
import type { Request, Response } from 'express'
import { supabase } from '../../config/db'

// Se usa para verificar que las solicitudes provengan realmente de Meta
const APP_SECRET = process.env.META_APP_SECRET || ''
const WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'botopia_webhook_verify'

/**
 * Verifica el webhook cuando Meta lo configura
 * @route GET /api/meta/webhook
 */
export const verifyWebhook = (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    
    // Verifica si los tokens coinciden
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verificado exitosamente')
      res.status(200).send(challenge)
    } else {
      // Tokens no coinciden
      console.log('❌ Verificación de webhook fallida')
      res.status(403).send('Verificación fallida')
    }
  } catch (error) {
    console.error('Error en verificación de webhook:', error)
    res.status(500).send('Error interno')
  }
}

/**
 * Procesa los eventos enviados por Meta a través del webhook
 * @route POST /api/meta/webhook
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string
    
    // Verifica la firma si hay un secreto configurado
    if (APP_SECRET && !verifySignature(req.body, signature)) {
      console.error('❌ Firma de webhook inválida')
      return res.status(401).json({ message: 'Firma inválida' })
    }
    
    const { object, entry } = req.body
    
    if (!object || !entry) {
      return res.status(400).json({ message: 'Datos de webhook incompletos' })
    }
    
    // Guarda el evento en la base de datos para procesamiento posterior
    await supabase.from('WebhookEvents').insert({
      object,
      entry: JSON.stringify(entry),
      timestamp: new Date().toISOString(),
      processed: false,
    })
    
    // Procesamos distintos tipos de eventos
    switch (object) {
      case 'whatsapp_business_account':
        await handleWhatsAppEvents(entry)
        break
      case 'page':
        await handleFacebookPageEvents(entry)
        break
      case 'instagram':
        await handleInstagramEvents(entry)
        break
      default:
        console.log(`Tipo de objeto desconocido: ${object}`)
    }
    
    // Responde a Meta rápidamente para evitar reintentos
    return res.status(200).json({ message: 'Evento recibido' })
  } catch (error) {
    console.error('Error procesando webhook:', error)
    // Siempre devolvemos 200 para que Meta no reintente el evento
    return res.status(200).json({ message: 'Evento recibido con errores' })
  }
}

/**
 * Verifica la firma HMAC del webhook
 */
function verifySignature(payload: Record<string, unknown>, signature: string): boolean {
  try {
    if (!signature) return false
    
    // Extrae el valor del hash
    const signatureParts = signature.split('=')
    const signatureHash = signatureParts[1]
    
    // Calcula el hash esperado
    const expectedHash = crypto
      .createHmac('sha256', APP_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex')
    
    return signatureHash === expectedHash
  } catch (error) {
    console.error('Error verificando firma:', error)
    return false
  }
}

/**
 * Procesa eventos de WhatsApp Business
 */
interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    field: string;
    value: {
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string };
        video?: { id: string };
        audio?: { id: string };
        document?: { id: string };
      }>;
      statuses?: Array<{
        id: string;
        recipient_id: string;
        status: string;
        timestamp: string;
      }>;
    };
  }>;
}

async function handleWhatsAppEvents(entry: WhatsAppWebhookEntry[]): Promise<void> {
  try {
    for (const entryItem of entry) {
      const changes = entryItem.changes || []
      
      for (const change of changes) {
        if (change.field !== 'messages') continue
        
        const value = change.value
        if (!value) continue
        
        // Eventos de mensajes entrantes
        if (value.messages?.length) {
          for (const message of value.messages) {
            await supabase.from('WhatsAppIncomingMessages').insert({
              wabaId: entryItem.id,
              messageId: message.id,
              from: message.from,
              timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
              type: message.type,
              text: message.text?.body,
              mediaId: message.image?.id || message.video?.id || message.audio?.id || message.document?.id,
              mediaType: message.image ? 'image' : (message.video ? 'video' : (message.audio ? 'audio' : (message.document ? 'document' : null))),
              rawData: JSON.stringify(message),
              processed: false,
            })
          }
        }
        
        // Eventos de estado de mensajes
        if (value.statuses?.length) {
          for (const status of value.statuses) {
            await supabase.from('WhatsAppMessageStatus').insert({
              wabaId: entryItem.id,
              messageId: status.id,
              recipientId: status.recipient_id,
              status: status.status,
              timestamp: new Date(parseInt(status.timestamp) * 1000).toISOString(),
              rawData: JSON.stringify(status),
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Error procesando eventos de WhatsApp:', error)
  }
}

/**
 * Procesa eventos de páginas de Facebook
 */
interface FacebookWebhookEntry {
  id: string;
  changes?: Array<{
    field: string;
    value: Record<string, unknown>;
  }>;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message: Record<string, unknown>;
  }>;
}

async function handleFacebookPageEvents(entry: FacebookWebhookEntry[]): Promise<void> {
  try {
    for (const entryItem of entry) {
      const pageId = entryItem.id
      const changes = entryItem.changes || []
      
      for (const change of changes) {
        await supabase.from('FacebookPageEvents').insert({
          pageId,
          field: change.field,
          value: JSON.stringify(change.value),
          timestamp: new Date().toISOString(),
        })
      }
      
      // Si hay mensajes en el feed
      if (entryItem.messaging) {
        for (const message of entryItem.messaging) {
          await supabase.from('FacebookMessages').insert({
            pageId,
            senderId: message.sender?.id,
            recipientId: message.recipient?.id,
            timestamp: new Date(message.timestamp).toISOString(),
            message: JSON.stringify(message.message),
            rawData: JSON.stringify(message),
            processed: false,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error procesando eventos de Facebook:', error)
  }
}

/**
 * Procesa eventos de Instagram
 */
interface InstagramWebhookEntry {
  id: string;
  changes: Array<{
    field: string;
    value: Record<string, unknown>;
  }>;
}

async function handleInstagramEvents(entry: InstagramWebhookEntry[]): Promise<void> {
  try {
    for (const entryItem of entry) {
      const igUserId = entryItem.id
      const changes = entryItem.changes || []
      
      for (const change of changes) {
        await supabase.from('InstagramEvents').insert({
          igUserId,
          field: change.field,
          value: JSON.stringify(change.value),
          timestamp: new Date().toISOString(),
        })
      }
    }
  } catch (error) {
    console.error('Error procesando eventos de Instagram:', error)
  }
}
