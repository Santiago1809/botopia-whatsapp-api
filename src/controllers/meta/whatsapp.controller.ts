/**
 * @file Meta WhatsApp Controller
 * @description Controller para gestionar las operaciones con WhatsApp Business API
 * @author Botopia Team
 * @created June 14, 2025
 */

import type { Response } from 'express'
import { metaApiService } from '../../services/meta.service'
import { supabase } from '../../config/db'
import type { CustomRequest } from '../../interfaces/global'

/**
 * Obtiene las cuentas de WhatsApp Business del usuario
 * @route GET /api/meta/whatsapp/accounts
 */
export const getAccounts = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Obtiene las cuentas de WhatsApp Business
    const accounts = await metaApiService.getWhatsAppBusinessAccounts(tokenData.accessToken)
    
    return res.status(200).json({
      success: true,
      accounts,
    })
  } catch (error) {
    console.error('Error al obtener cuentas de WhatsApp Business:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener cuentas de WhatsApp Business',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Obtiene detalles de una cuenta específica de WhatsApp Business
 * @route GET /api/meta/whatsapp/account/:id
 */
export const getAccount = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const accountId = req.params.id
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Obtiene detalles de la cuenta
    const account = await metaApiService.getWhatsAppBusinessAccount(tokenData.accessToken, accountId)
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Cuenta no encontrada',
      })
    }
    
    return res.status(200).json({
      success: true,
      account,
    })
  } catch (error) {
    console.error('Error al obtener detalles de cuenta de WhatsApp Business:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener detalles de cuenta',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Obtiene las plantillas de mensajes de WhatsApp
 * @route GET /api/meta/whatsapp/templates
 */
export const getTemplates = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    // Parámetros opcionales para filtrado y paginación
    const limit = parseInt(req.query.limit as string) || 20
    const offset = parseInt(req.query.offset as string) || 0
    const status = req.query.status as string | undefined
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Obtiene las plantillas
    const templates = await metaApiService.getWhatsAppTemplates(
      tokenData.accessToken,
      limit,
      offset,
      status,
    )
    
    return res.status(200).json({
      success: true,
      ...templates,
    })
  } catch (error) {
    console.error('Error al obtener plantillas de WhatsApp:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener plantillas',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Crea una nueva plantilla de mensaje de WhatsApp
 * @route POST /api/meta/whatsapp/templates
 */
export const createTemplate = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const templateData = req.body
    if (!templateData || !templateData.name || !templateData.category) {
      return res.status(400).json({
        success: false,
        message: 'Datos de plantilla incompletos',
      })
    }
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Crea la plantilla
    const result = await metaApiService.createWhatsAppTemplate(tokenData.accessToken, templateData)
    
    // Guarda la plantilla en la base de datos
    await supabase.from('WhatsAppTemplates').insert({
      userId,
      templateId: result.id,
      name: templateData.name,
      category: templateData.category,
      language: templateData.language || 'es_ES',
      status: 'PENDING',
      components: templateData.components,
      createdAt: new Date().toISOString(),
    })
    
    return res.status(201).json({
      success: true,
      template: result,
    })
  } catch (error) {
    console.error('Error al crear plantilla de WhatsApp:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al crear plantilla',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Envía un mensaje usando una plantilla de WhatsApp
 * @route POST /api/meta/whatsapp/messages/template
 */
export const sendTemplateMessage = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const { to, templateName, language, components } = req.body
    
    if (!to || !templateName) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios',
      })
    }
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Envía el mensaje
    const result = await metaApiService.sendWhatsAppTemplateMessage(
      tokenData.accessToken,
      to,
      templateName,
      language || 'es_ES',
      components,
    )
    
    // Guarda el registro del mensaje en la base de datos
    await supabase.from('Messages').insert({
      userId,
      platform: 'whatsapp',
      type: 'template',
      to,
      templateName,
      components,
      messageId: result.messages?.[0]?.id,
      status: 'sent',
      sentAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      message: result,
    })
  } catch (error) {
    console.error('Error al enviar mensaje de plantilla:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Envía un mensaje de texto por WhatsApp
 * @route POST /api/meta/whatsapp/messages/text
 */
export const sendTextMessage = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const { to, text } = req.body
    
    if (!to || !text) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios',
      })
    }
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
    
    // Envía el mensaje
    const result = await metaApiService.sendWhatsAppTextMessage(
      tokenData.accessToken,
      to,
      text,
    )
    
    // Guarda el registro del mensaje en la base de datos
    await supabase.from('Messages').insert({
      userId,
      platform: 'whatsapp',
      type: 'text',
      to,
      content: text,
      messageId: result.messages?.[0]?.id,
      status: 'sent',
      sentAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      message: result,
    })
  } catch (error) {
    console.error('Error al enviar mensaje de texto:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Envía un mensaje con contenido multimedia por WhatsApp
 * @route POST /api/meta/whatsapp/messages/media
 */
export const sendMediaMessage = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const { to, mediaUrl, mediaType, caption } = req.body
    
    if (!to || !mediaUrl || !mediaType) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios',
      })
    }
    
    // Validar el tipo de medio
    const validTypes = ['image', 'video', 'audio', 'document']
    if (!validTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de medio no válido',
      })
    }
    
    // Obtiene el token de acceso de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'No hay token disponible',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    
    if (expiresAt <= now) {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
      })
    }
      // Envía el mensaje
    const result = await metaApiService.sendWhatsAppMediaMessage(
      tokenData.accessToken,
      to,
      mediaUrl,
      mediaType as 'image' | 'video' | 'audio' | 'document',
      caption,
    )
    
    // Guarda el registro del mensaje en la base de datos
    await supabase.from('Messages').insert({
      userId,
      platform: 'whatsapp',
      type: mediaType,
      to,
      mediaUrl,
      caption,
      messageId: result.messages?.[0]?.id,
      status: 'sent',
      sentAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      message: result,
    })
  } catch (error) {
    console.error('Error al enviar mensaje multimedia:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
