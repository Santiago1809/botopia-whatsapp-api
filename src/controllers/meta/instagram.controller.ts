/**
 * @file Meta Instagram Controller
 * @description Controller para gestionar las operaciones con Instagram Graph API
 * @author Botopia Team
 * @created June 14, 2025
 */

import type { Response } from 'express'
import { metaApiService } from '../../services/meta.service'
import { supabase } from '../../config/db'
import type { CustomRequest } from '../../interfaces/global'

/**
 * Obtiene las cuentas de Instagram Business del usuario
 * @route GET /api/meta/instagram/accounts
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
    
    // Obtiene las cuentas de Instagram
    const accounts = await metaApiService.getInstagramAccounts(tokenData.accessToken)
    
    return res.status(200).json({
      success: true,
      accounts,
    })
  } catch (error) {
    console.error('Error al obtener cuentas de Instagram:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener cuentas',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Publica una imagen en Instagram
 * @route POST /api/meta/instagram/media
 */
export const publishMedia = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    const { igAccountId, imageUrl, caption } = req.body
    
    if (!igAccountId || !imageUrl) {
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
    
    // Publica la imagen
    const result = await metaApiService.createInstagramImage(
      tokenData.accessToken,
      igAccountId,
      imageUrl,
      caption,
    )
    
    // Guarda en la base de datos
    await supabase.from('InstagramPosts').insert({
      userId,
      igAccountId,
      postId: result.id,
      imageUrl,
      caption,
      createdAt: new Date().toISOString(),
    })
    
    return res.status(200).json({
      success: true,
      post: result,
    })
  } catch (error) {
    console.error('Error al publicar en Instagram:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al publicar contenido',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
