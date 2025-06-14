/**
 * @file Meta API Service
 * @description Servicio para interactuar con WhatsApp Business API, Facebook Pages API e Instagram Graph API
 * @author Botopia Team
 * @created June 14, 2025
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { MetaUserInfo, MetaPermissions, WhatsappBusinessAccount, WhatsAppTemplate, WhatsAppMessageSendResult, FacebookPage, FacebookPostResult, InstagramBusinessAccount, InstagramMediaResult } from '../types/meta'

// URLs de la API de Meta
const META_API_VERSION = 'v17.0'
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`
const META_OAUTH_URL = 'https://www.facebook.com/v17.0/dialog/oauth'
const META_TOKEN_URL = 'https://graph.facebook.com/v17.0/oauth/access_token'

// Configuración inicial de la app de Meta
const META_APP_ID = process.env.META_APP_ID || ''
const META_APP_SECRET = process.env.META_APP_SECRET || ''

/**
 * Clase para manejar las solicitudes a la API de Meta
 */
class MetaApiService {
  private axios: AxiosInstance
  
  constructor() {
    this.axios = axios.create({
      baseURL: META_GRAPH_API_BASE_URL,
      timeout: 10000,
    })
    
    // Interceptor para manejo de errores
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Error en solicitud a Meta API:', error.response?.data || error.message)
        return Promise.reject(error)
      }
    )
  }
  
  /**
   * Genera la URL para autenticación OAuth con Meta
   * @param redirectUri URI de redirección después de la autenticación
   * @param state Estado para verificación CSRF
   * @returns URL para redireccionar al usuario
   */
  public getAuthUrl(redirectUri: string, state: string): string {
    const scope = [
      'whatsapp_business_management',
      'whatsapp_business_messaging',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_messaging',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_messages',
    ].join(',')
    
    const params = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: redirectUri,
      state,
      scope,
      response_type: 'code',
    })
    
    return `${META_OAUTH_URL}?${params.toString()}`
  }
  
  /**
   * Intercambia el código de autorización por tokens de acceso
   * @param code Código de autorización de Meta
   * @param redirectUri URI de redirección
   * @returns Tokens de acceso y refresco
   */
  public async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<{
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
  } | null> {
    try {
      const params = new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      
      const response = await axios.post(META_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      
      return response.data
    } catch (error) {
      console.error('Error intercambiando código por token:', error)
      return null
    }
  }
  
  /**
   * Refresca un token de acceso usando el token de refresco
   * @param refreshToken Token de refresco
   * @returns Nuevo token de acceso
   */
  public async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
  } | null> {
    try {
      const params = new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      })
      
      const response = await axios.post(META_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      
      return response.data
    } catch (error) {
      console.error('Error refrescando token:', error)
      return null
    }
  }
  
  /**
   * Obtiene información del usuario conectado a Meta
   * @param accessToken Token de acceso
   * @returns Información del usuario
   */
  public async getUserInfo(accessToken: string): Promise<MetaUserInfo | null> {
    try {
      const response = await this.axios.get('/me', {
        params: {
          fields: 'id,name,email',
          access_token: accessToken,
        },
      })
      
      return response.data
    } catch (error) {
      console.error('Error obteniendo información del usuario:', error)
      return null
    }
  }
  
  /**
   * Obtiene los permisos disponibles para el token de acceso
   * @param accessToken Token de acceso
   * @returns Permisos disponibles
   */
  public async getPermissions(accessToken: string): Promise<MetaPermissions | null> {
    try {
      const response = await this.axios.get('/me/permissions', {
        params: {
          access_token: accessToken,
        },
      })
      
      return response.data.data.reduce((acc: Record<string, boolean>, perm: { permission: string; status: string }) => {
        acc[perm.permission] = perm.status === 'granted'
        return acc
      }, {})
    } catch (error) {
      console.error('Error obteniendo permisos:', error)
      return {}
    }
  }
  
  /* ----------------------------------------------------------------------------------
   * WhatsApp Business API Methods
   * ---------------------------------------------------------------------------------- */
  
  /**
   * Obtiene todas las cuentas de WhatsApp Business disponibles
   * @param accessToken Token de acceso
   * @returns Lista de cuentas de WhatsApp Business
   */
  public async getWhatsAppBusinessAccounts(accessToken: string): Promise<WhatsappBusinessAccount[]> {
    try {
      // Primero, obtener los Business Accounts
      const businessesResponse = await this.axios.get('/me/businesses', {
        params: {
          access_token: accessToken,
        },
      })
      
      const businesses = businessesResponse.data.data || []
      const wabaAccounts: WhatsappBusinessAccount[] = []
      
      // Por cada Business, obtener sus WhatsApp Business Accounts
      for (const business of businesses) {
        const wabaResponse = await this.axios.get(`/${business.id}/whatsapp_business_accounts`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,currency,timezone_id,message_template_namespace,analytics',
          },
        })
        
        if (wabaResponse.data?.data) {
          wabaAccounts.push(...wabaResponse.data.data)
        }
      }
      
      return wabaAccounts
    } catch (error) {
      console.error('Error obteniendo cuentas de WhatsApp Business:', error)
      return []
    }
  }
  
  /**
   * Obtiene detalles de una cuenta específica de WhatsApp Business
   * @param accessToken Token de acceso
   * @param wabaId ID de la cuenta de WhatsApp Business
   * @returns Detalles de la cuenta
   */
  public async getWhatsAppBusinessAccount(accessToken: string, wabaId?: string): Promise<WhatsappBusinessAccount | null> {
    try {      if (!wabaId) {
        // Si no se proporcionó un ID, obtener la primera cuenta disponible
        const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
        if (!accounts || accounts.length === 0) {
          throw new Error('No se encontraron cuentas de WhatsApp Business')
        }
        wabaId = accounts[0]?.id
        if (!wabaId) {
          throw new Error('ID de cuenta de WhatsApp Business inválido')
        }
      }
      
      const response = await this.axios.get(`/${wabaId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,currency,timezone_id,message_template_namespace,analytics,verification_status,quality_score',
        },
      })
      
      return response.data
    } catch (error) {
      console.error('Error obteniendo cuenta de WhatsApp Business:', error)
      return null
    }
  }
  
  /**
   * Obtiene las plantillas de mensajes de WhatsApp
   * @param accessToken Token de acceso
   * @param limit Límite de resultados
   * @param offset Offset para paginación
   * @param status Estado de las plantillas (APPROVED, PENDING, REJECTED)
   * @returns Lista de plantillas
   */  public async getWhatsAppTemplates(
    accessToken: string,
    limit = 20,
    offset = 0,
    status?: string,
  ): Promise<{ data: WhatsAppTemplate[] }> {
    try {      const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
      if (!accounts || accounts.length === 0) {
        return { data: [] }
      }
      
      const wabaId = accounts[0]?.id
      if (!wabaId) {
        throw new Error('ID de cuenta de WhatsApp Business inválido')
      }
      
      const params: Record<string, string | number> = {
        access_token: accessToken,
        limit,
        offset,
      }
      
      if (status) {
        params.status = status
      }
      
      const response = await this.axios.get(`/${wabaId}/message_templates`, {
        params,
      })
      
      return response.data
    } catch (error) {
      console.error('Error obteniendo plantillas de WhatsApp:', error)
      return { data: [] }
    }
  }
  
  /**
   * Crea una nueva plantilla de mensaje de WhatsApp
   * @param accessToken Token de acceso
   * @param templateData Datos de la plantilla
   * @returns Resultado de la creación
   */  public async createWhatsAppTemplate(accessToken: string, templateData: Record<string, unknown>): Promise<{ id: string; status: string }> {
    try {
      const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
      if (accounts.length === 0) {
        throw new Error('No se encontraron cuentas de WhatsApp Business')
      }
      
      if (!accounts[0]?.id) {
        throw new Error('ID de cuenta de WhatsApp Business inválido')
      }
      
      const response = await this.axios.post(
        `/${accounts[0].id}/message_templates`,
        templateData,
        {
          params: {
            access_token: accessToken,
          },
        },
      )
      
      return response.data
    } catch (error) {
      console.error('Error creando plantilla de WhatsApp:', error)
      throw error
    }
  }
  
  /**
   * Envía un mensaje de WhatsApp usando una plantilla
   * @param accessToken Token de acceso
   * @param to Número de teléfono destino con código de país
   * @param templateName Nombre de la plantilla
   * @param language Código de idioma de la plantilla
   * @param components Componentes de la plantilla (variables)
   * @returns Resultado del envío
   */  public async sendWhatsAppTemplateMessage(
    accessToken: string,
    to: string,
    templateName: string,
    language = 'es_ES',    components?: Array<Record<string, unknown>>,
  ): Promise<WhatsAppMessageSendResult> {
    try {
      const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
      if (accounts.length === 0) {
        throw new Error('No se encontraron cuentas de WhatsApp Business')
      }
      
      if (!accounts[0]?.id) {
        throw new Error('ID de cuenta de WhatsApp Business inválido')
      }
      
      const phoneNumberId = await this.getPhoneNumberId(accessToken, accounts[0].id)
      if (!phoneNumberId) {
        throw new Error('No se encontró un número de teléfono asociado')
      }
        const data: {
        messaging_product: string;
        to: string;
        type: string;
        template: {
          name: string;
          language: {
            code: string;
          };
          components?: Array<Record<string, unknown>>;
        };
      } = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language,
          },
        },
      }
      
      if (components && components.length > 0) {
        data.template.components = components
      }
      
      const response = await this.axios.post(
        `/${phoneNumberId}/messages`,
        data,
        {
          params: {
            access_token: accessToken,
          },
        },
      )
      
      return response.data
    } catch (error) {
      console.error('Error enviando mensaje de plantilla de WhatsApp:', error)
      throw error
    }
  }
  
  /**
   * Envía un mensaje de texto por WhatsApp
   * @param accessToken Token de acceso
   * @param to Número de teléfono destino con código de país
   * @param text Texto del mensaje
   * @returns Resultado del envío
   */  public async sendWhatsAppTextMessage(
    accessToken: string,
    to: string,
    text: string,
  ): Promise<WhatsAppMessageSendResult> {
    try {
      const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
      if (accounts.length === 0) {
        throw new Error('No se encontraron cuentas de WhatsApp Business')
      }
      
      if (!accounts[0]?.id) {
        throw new Error('ID de cuenta de WhatsApp Business inválido')
      }
      
      const phoneNumberId = await this.getPhoneNumberId(accessToken, accounts[0].id)
      if (!phoneNumberId) {
        throw new Error('No se encontró un número de teléfono asociado')
      }
      
      const response = await this.axios.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: {
            body: text,
          },
        },
        {
          params: {
            access_token: accessToken,
          },
        },
      )
      
      return response.data
    } catch (error) {
      console.error('Error enviando mensaje de texto de WhatsApp:', error)
      throw error
    }
  }
  
  /**
   * Obtiene el ID del número de teléfono asociado a una cuenta de WhatsApp Business
   * @param accessToken Token de acceso
   * @param wabaId ID de la cuenta de WhatsApp Business
   * @returns ID del número de teléfono
   */
  private async getPhoneNumberId(accessToken: string, wabaId: string): Promise<string | null> {
    try {
      const response = await this.axios.get(`/${wabaId}/phone_numbers`, {
        params: {
          access_token: accessToken,
        },
      })
      
      if (!response.data.data || response.data.data.length === 0) {
        return null
      }
      
      return response.data.data[0].id
    } catch (error) {
      console.error('Error obteniendo ID de número de teléfono:', error)
      return null
    }
  }
  
  /**
   * Envía un mensaje de WhatsApp con contenido multimedia
   * @param accessToken Token de acceso
   * @param to Número de teléfono destino con código de país
   * @param mediaUrl URL del contenido multimedia
   * @param mediaType Tipo de contenido (image, video, audio, document)
   * @param caption Descripción opcional para imágenes y videos
   * @returns Resultado del envío
   */  public async sendWhatsAppMediaMessage(
    accessToken: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    caption?: string,
  ): Promise<WhatsAppMessageSendResult> {
    try {
      const accounts = await this.getWhatsAppBusinessAccounts(accessToken)
      if (accounts.length === 0) {
        throw new Error('No se encontraron cuentas de WhatsApp Business')
      }
      
      if (!accounts[0]?.id) {
        throw new Error('ID de cuenta de WhatsApp Business inválido')
      }
      
      const phoneNumberId = await this.getPhoneNumberId(accessToken, accounts[0].id)
      if (!phoneNumberId) {
        throw new Error('No se encontró un número de teléfono asociado')
      }
      
      const mediaData: Record<string, string> = {
        link: mediaUrl,
      }
      
      if (caption && (mediaType === 'image' || mediaType === 'video')) {
        mediaData.caption = caption
      }
      
      const response = await this.axios.post(
        `/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: mediaType,
          [mediaType]: mediaData,
        },
        {
          params: {
            access_token: accessToken,
          },
        },
      )
      
      return response.data
    } catch (error) {
      console.error('Error enviando mensaje multimedia de WhatsApp:', error)
      throw error
    }
  }
  
  /* ----------------------------------------------------------------------------------
   * Facebook Pages API Methods
   * ---------------------------------------------------------------------------------- */
  
  /**
   * Obtiene las páginas de Facebook asociadas a la cuenta
   * @param accessToken Token de acceso
   * @returns Lista de páginas
   */
  public async getFacebookPages(accessToken: string): Promise<FacebookPage[]> {
    try {
      const response = await this.axios.get('/me/accounts', {
        params: {
          access_token: accessToken,
          fields: 'id,name,category,fan_count,link,picture',
        },
      })
      
      return response.data.data || []
    } catch (error) {
      console.error('Error obteniendo páginas de Facebook:', error)
      return []
    }
  }
  
  /**
   * Obtiene el token de acceso para una página específica
   * @param accessToken Token de acceso del usuario
   * @param pageId ID de la página
   * @returns Token de acceso de la página
   */
  public async getFacebookPageAccessToken(accessToken: string, pageId: string): Promise<string | null> {
    try {
      const response = await this.axios.get('/me/accounts', {
        params: {
          access_token: accessToken,
          fields: 'id,access_token',
        },
      })
      
      const pages = response.data.data || []
      const page = pages.find((p: FacebookPage) => p.id === pageId)
      
      return page ? page.access_token : null
    } catch (error) {
      console.error('Error obteniendo token de página:', error)
      return null
    }
  }
  
  /**
   * Crea una publicación en una página de Facebook
   * @param pageToken Token de acceso de la página
   * @param pageId ID de la página
   * @param message Texto del mensaje
   * @param link URL opcional para compartir
   * @param mediaUrl URL opcional para contenido multimedia
   * @param published Si la publicación debe ser publicada inmediatamente
   * @param scheduledTime Fecha programada para la publicación
   * @returns Resultado de la creación
   */  public async createFacebookPost(
    pageToken: string,
    pageId: string,
    message?: string,
    link?: string,
    mediaUrl?: string,
    published = true,
    scheduledTime?: string,
  ): Promise<FacebookPostResult> {
    try {      const data: Record<string, unknown> = {
        access_token: pageToken,
        published,
      }
      
      if (message) {
        data.message = message
      }
      
      if (link) {
        data.link = link
      }
      
      if (!published && scheduledTime) {
        data.scheduled_publish_time = new Date(scheduledTime).getTime() / 1000
      }
        if (mediaUrl) {
        // Si hay medios, primero subimos el archivo
        const mediaResponse = await this.axios.post(
          `/${pageId}/photos`,
          {
            url: mediaUrl,
            access_token: pageToken,
            published: false,
          },
        )
        
        // Luego creamos el post con el archivo subido
        data.attached_media = [
          {
            media_fbid: mediaResponse.data.id,
          },
        ]
      }
      
      // Crear la publicación
      const response = await this.axios.post(
        `/${pageId}/feed`,
        data,
      )
      
      return response.data
    } catch (error) {
      console.error('Error creando publicación en Facebook:', error)
      throw error
    }
  }
  
  /* ----------------------------------------------------------------------------------
   * Instagram Graph API Methods
   * ---------------------------------------------------------------------------------- */
  
  /**
   * Obtiene las cuentas de Instagram Business asociadas
   * @param accessToken Token de acceso
   * @returns Lista de cuentas de Instagram
   */
  public async getInstagramAccounts(accessToken: string): Promise<InstagramBusinessAccount[]> {
    try {
      // Primero obtenemos las páginas de Facebook asociadas
      const pages = await this.getFacebookPages(accessToken)
      const instagramAccounts: InstagramBusinessAccount[] = []
      
      // Para cada página, verificamos si hay una cuenta de Instagram vinculada
      for (const page of pages) {
        const pageToken = await this.getFacebookPageAccessToken(accessToken, page.id)
        
        if (!pageToken) continue
        
        const igResponse = await this.axios.get(`/${page.id}`, {
          params: {
            fields: 'instagram_business_account{id,name,username,profile_picture_url,ig_id}',
            access_token: pageToken,
          },
        })
        
        if (igResponse.data.instagram_business_account) {
          const igAccount = igResponse.data.instagram_business_account
          instagramAccounts.push({
            ...igAccount,
            facebook_page_id: page.id,
            facebook_page_name: page.name,
          })
        }
      }
      
      return instagramAccounts
    } catch (error) {
      console.error('Error obteniendo cuentas de Instagram:', error)
      return []
    }
  }
  
  /**
   * Crea una publicación de imagen en Instagram
   * @param accessToken Token de acceso
   * @param igAccountId ID de la cuenta de Instagram
   * @param imageUrl URL de la imagen
   * @param caption Descripción de la publicación
   * @returns Resultado de la creación
   */  public async createInstagramImage(
    accessToken: string,
    igAccountId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<InstagramMediaResult> {
    try {
      // Primero crear un contenedor de medios
      const containerResponse = await this.axios.post(
        `/${igAccountId}/media`,
        {
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        },
      )
      
      const creationId = containerResponse.data.id
      
      // Luego publicar el contenido
      const publishResponse = await this.axios.post(
        `/${igAccountId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken,
        },
      )
      
      return publishResponse.data
    } catch (error) {
      console.error('Error creando publicación en Instagram:', error)
      throw error
    }
  }
}

// Instancia singleton del servicio
export const metaApiService = new MetaApiService()
