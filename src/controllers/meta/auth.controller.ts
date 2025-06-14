/**
 * @file Meta Authentication Controller
 * @description Controller para gestionar la autenticación con las APIs de Meta
 * @author Botopia Team
 * @created June 14, 2025
 */

import type { Request, Response } from 'express'
import { metaApiService } from '../../services/meta.service'
import { supabase } from '../../config/db'
import type { CustomRequest } from '../../interfaces/global'

/**
 * Genera una URL de autenticación para OAuth de Meta
 * @route GET /api/meta/auth/url
 */
export const getAuthUrl = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    // Genera un estado único para prevenir CSRF
    const state = `${userId}-${Date.now()}`
    
    // Almacena el estado en la base de datos para validarlo después
    await supabase.from('MetaAuthState').insert({
      userId,
      state,
      createdAt: new Date().toISOString(),
    })
    
    // URL a la que Meta redirigirá después de la autenticación
    const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/meta/auth/callback`
    
    // Genera la URL de autorización
    const authUrl = metaApiService.getAuthUrl(redirectUri, state)
    
    return res.status(200).json({
      success: true,
      url: authUrl,
    })
  } catch (error) {
    console.error('Error al generar URL de autenticación:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al generar URL de autenticación',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Procesa la respuesta de OAuth de Meta
 * @route GET /api/meta/auth/callback
 */
export const handleCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query
    
    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de callback faltantes',
      })
    }
    
    // Verifica el estado para prevenir CSRF
    const { data: stateData } = await supabase
      .from('MetaAuthState')
      .select('*')
      .eq('state', state as string)
      .single()
    
    if (!stateData) {
      return res.status(403).json({
        success: false,
        message: 'Estado de autenticación inválido',
      })
    }
    
    // Elimina el estado usado para prevenir reuso
    await supabase
      .from('MetaAuthState')
      .delete()
      .eq('state', state as string)
    
    // URL a la que Meta redirigió
    const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/meta/auth/callback`
    
    // Intercambia el código por tokens
    const tokenData = await metaApiService.exchangeCodeForToken(code as string, redirectUri)
    
    if (!tokenData) {
      return res.status(500).json({
        success: false,
        message: 'Error al obtener token de acceso',
      })
    }
    
    // Obtiene información del usuario de Meta
    const metaUserInfo = await metaApiService.getUserInfo(tokenData.access_token)
    
    // Guarda los tokens en la base de datos
    await supabase.from('MetaTokens').upsert({
      userId: stateData.userId,
      metaUserId: metaUserInfo?.id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    // Redirecciona al frontend con un mensaje de éxito
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meta/auth-success`
    return res.redirect(redirectUrl)
  } catch (error) {
    console.error('Error en callback de autenticación:', error)
    const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meta/auth-error`
    return res.redirect(errorUrl)
  }
}

/**
 * Refresca el token de acceso de Meta
 * @route POST /api/meta/auth/refresh
 */
export const refreshToken = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    // Obtiene el token de refresco de la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData || !tokenData.refreshToken) {
      return res.status(404).json({
        success: false,
        message: 'No hay token de refresco disponible',
      })
    }
    
    // Refresca el token
    const newTokenData = await metaApiService.refreshAccessToken(tokenData.refreshToken)
    
    if (!newTokenData) {
      return res.status(500).json({
        success: false,
        message: 'Error al refrescar token',
      })
    }
    
    // Actualiza los tokens en la base de datos
    await supabase.from('MetaTokens').update({
      accessToken: newTokenData.access_token,
      refreshToken: newTokenData.refresh_token || tokenData.refreshToken,
      expiresAt: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString(),
      updatedAt: new Date().toISOString(),
    }).eq('userId', userId)
    
    return res.status(200).json({
      success: true,
      message: 'Token refrescado exitosamente',
    })
  } catch (error) {
    console.error('Error al refrescar token:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al refrescar token',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Verifica el estado de autenticación con Meta
 * @route GET /api/meta/auth/status
 */
export const getAuthStatus = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
    
    // Verifica si hay tokens en la base de datos
    const { data: tokenData } = await supabase
      .from('MetaTokens')
      .select('*')
      .eq('userId', userId)
      .single()
    
    if (!tokenData) {
      return res.status(200).json({
        success: true,
        authenticated: false,
        message: 'Usuario no autenticado con Meta',
      })
    }
    
    // Verifica si el token ha expirado
    const expiresAt = new Date(tokenData.expiresAt).getTime()
    const now = Date.now()
    const isExpired = expiresAt <= now
    
    // Si el token está expirado y hay un token de refresco, intenta refrescarlo
    if (isExpired && tokenData.refreshToken) {
      const newTokenData = await metaApiService.refreshAccessToken(tokenData.refreshToken)
      
      if (newTokenData) {
        // Actualiza los tokens en la base de datos
        await supabase.from('MetaTokens').update({
          accessToken: newTokenData.access_token,
          refreshToken: newTokenData.refresh_token || tokenData.refreshToken,
          expiresAt: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString(),
          updatedAt: new Date().toISOString(),
        }).eq('userId', userId)
        
        return res.status(200).json({
          success: true,
          authenticated: true,
          message: 'Usuario autenticado con Meta (token refrescado)',
        })
      }
      
      // Si no se pudo refrescar, considera al usuario como no autenticado
      return res.status(200).json({
        success: true,
        authenticated: false,
        message: 'Token expirado y no se pudo refrescar',
      })
    }
    
    // Token válido
    return res.status(200).json({
      success: true,
      authenticated: !isExpired,
      message: isExpired
        ? 'Token expirado'
        : 'Usuario autenticado con Meta',
    })
  } catch (error) {
    console.error('Error al verificar estado de autenticación:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al verificar estado de autenticación',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}

/**
 * Obtiene los permisos disponibles con el token actual
 * @route GET /api/meta/auth/permissions
 */
export const getPermissions = async (req: CustomRequest, res: Response) => {
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
    
    // Obtiene los permisos
    const permissions = await metaApiService.getPermissions(tokenData.accessToken)
    
    return res.status(200).json({
      success: true,
      permissions,
    })
  } catch (error) {
    console.error('Error al obtener permisos:', error)
    return res.status(500).json({
      success: false,
      message: 'Error al obtener permisos',
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
