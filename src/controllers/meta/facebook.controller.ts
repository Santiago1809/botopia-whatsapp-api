/**
 * @file Meta Facebook Controller
 * @description Controller para gestionar las operaciones con Facebook Pages API
 * @author Botopia Team
 * @created June 14, 2025
 */

import type { Response } from 'express'
import { metaApiService } from '../../services/meta.service'
import { supabase } from '../../config/db'
import type { CustomRequest } from '../../interfaces/global'

/**
 * Obtiene las páginas de Facebook del usuario
 * @route GET /api/meta/facebook/pages
 */
export const getPages = async (req: CustomRequest, res: Response) => {
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
    
    // Obtiene las páginas
    const pages = await metaApiService.getFacebookPages(tokenData.accessToken)
    
    return res.status(200).json({
      success: true,
      pages,
    })
  } catch (error) {
    console.error('Error al obtener páginas de Facebook:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener páginas',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Obtiene el token de acceso para una página específica
 * @route GET /api/meta/facebook/page/:id/token
 */
export const getPageToken = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const pageId = req.params.id
    if (!pageId) {
      return res.status(400).json({
        success: false,
        message: 'ID de página no proporcionado',
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
    
    // Obtiene el token de la página
    const pageToken = await metaApiService.getFacebookPageAccessToken(
      tokenData.accessToken,
      pageId,
    )
    
    if (!pageToken) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo obtener el token de la página',
      })
    }
    
    // Almacena el token de página en la base de datos
    await supabase.from('FacebookPageTokens').upsert({
      userId,
      pageId,
      accessToken: pageToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      pageToken,
    })
  } catch (error) {
    console.error('Error al obtener token de página:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener token de página',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Crea una publicación en una página de Facebook
 * @route POST /api/meta/facebook/page/:id/posts
 */
export const createPost = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const pageId = req.params.id
    if (!pageId) {
      return res.status(400).json({
        success: false,
        message: 'ID de página no proporcionado',
      })
    }
    
    const { message, link, mediaUrl, published, scheduledTime } = req.body
    
    if (!message && !link && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos un mensaje, enlace o contenido multimedia',
      })
    }
    
    // Busca primero en la base de datos
    const { data: pageTokenData } = await supabase
      .from('FacebookPageTokens')
      .select('*')
      .eq('userId', userId)
      .eq('pageId', pageId)
      .single()
    
    let pageToken = pageTokenData?.accessToken
    
    // Si no encontramos el token en la base de datos, lo obtenemos de la API
    if (!pageToken) {
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
      
      // Obtiene el token de la página
      pageToken = await metaApiService.getFacebookPageAccessToken(
        tokenData.accessToken,
        pageId,
      )
      
      if (!pageToken) {
        return res.status(404).json({
          success: false,
          message: 'No se pudo obtener el token de la página',
        })
      }
      
      // Almacena el token de página en la base de datos
      await supabase.from('FacebookPageTokens').insert({
        userId,
        pageId,
        accessToken: pageToken,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
    
    // Crea la publicación en Facebook
    const result = await metaApiService.createFacebookPost(
      pageToken,
      pageId,
      message,
      link,
      mediaUrl,
      published !== undefined ? published : true,
      scheduledTime,
    )
    
    // Guarda en la base de datos
    await supabase.from('FacebookPosts').insert({
      userId,
      pageId,
      postId: result.id,
      message,
      link,
      mediaUrl,
      published: published !== undefined ? published : true,
      scheduledTime: scheduledTime ? new Date(scheduledTime).toISOString() : null,
      createdAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      post: result,
    })
  } catch (error) {
    console.error('Error al crear publicación:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al crear publicación',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
