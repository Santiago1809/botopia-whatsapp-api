/**
 * @file Meta Analytics Controller (Fixed)
 * @description Controller para obtener analytics de WhatsApp, Facebook e Instagram
 * @author Botopia Team
 * @created June 14, 2025
 */

import type { Response } from 'express';
import { supabase } from '../../config/db';
import type { CustomRequest } from '../../interfaces/global';

/**
 * Obtiene analytics de WhatsApp
 * @route GET /api/meta/analytics/whatsapp
 */
export const getWhatsAppAnalytics = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }
    
    // Parámetros para filtrar por fecha
    const { startDate, endDate } = req.query;
    
    // Preparamos los filtros de consulta
    const queryFilters: Record<string, unknown> = { userId };
    
    if (startDate) {
      queryFilters.sentAt = {
        gte: new Date(startDate as string).toISOString(),
        ...(endDate ? { lte: new Date(endDate as string).toISOString() } : {}),
      };
    }
    
    // Consulta mensajes enviados para luego agruparlos manualmente
    const { data: messages, error: messagesError } = await supabase
      .from('Messages')
      .select('*')
      .eq('userId', userId)
      .eq('platform', 'whatsapp')
      .match(queryFilters);
    
    if (messagesError) {
      console.error('Error obteniendo mensajes:', messagesError);
    }
    
    // Agrupamos manualmente por tipo
    const messagesByType = messages
      ? Object.entries(
          messages.reduce((acc: Record<string, number>, message) => {
            const type = message.type || 'unknown';
            if (type) {
              acc[type] = (acc[type] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Agrupamos manualmente por estado
    const messagesByStatus = messages
      ? Object.entries(
          messages.reduce((acc: Record<string, number>, message) => {
            const status = message.status || 'unknown';
            if (status) {
              acc[status] = (acc[status] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Agrupamos manualmente por fecha (formato YYYY-MM-DD)
    const messagesByDate = messages
      ? Object.entries(
          messages.reduce((acc: Record<string, number>, message) => {
            // Extraer solo la fecha (YYYY-MM-DD)
            const dateStr = message.sentAt 
              ? new Date(message.sentAt).toISOString().split('T')[0]
              : 'unknown';
            if (dateStr) {
              acc[dateStr] = (acc[dateStr] || 0) + 1;
            }
            return acc;
          }, {})
        )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)) // Ordenar por fecha
      : [];
    
    // Consulta mensajes recibidos (desde webhooks)
    const { data: receivedMessages, error: receivedError } = await supabase
      .from('WhatsAppIncomingMessages')
      .select('*')
      .match(queryFilters);
    
    if (receivedError) {
      console.error('Error obteniendo mensajes recibidos:', receivedError);
    }
    
    // Formateamos los datos para la respuesta
    const analytics = {
      messagesByType,
      messagesByStatus,
      messagesByDate,
      received: {
        count: receivedMessages?.length || 0,
      },
      totals: {
        sent: messagesByType.reduce((acc: number, curr: {name: string, count: number}) => {
          return acc + (typeof curr.count === 'number' ? curr.count : 0);
        }, 0),
      },
    };
    
    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Error obteniendo analytics de WhatsApp:', error);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo analytics',
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
};

/**
 * Obtiene analytics de Facebook
 * @route GET /api/meta/analytics/facebook
 */
export const getFacebookAnalytics = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }
    
    // Parámetros para filtrar por fecha
    const { startDate, endDate, pageId } = req.query;
    
    // Preparamos los filtros de consulta
    const queryFilters: Record<string, unknown> = { userId };
    
    if (pageId) {
      queryFilters.pageId = pageId;
    }
    
    if (startDate) {
      queryFilters.createdAt = {
        gte: new Date(startDate as string).toISOString(),
        ...(endDate ? { lte: new Date(endDate as string).toISOString() } : {}),
      };
    }
    
    // Consulta publicaciones para agruparlas manualmente
    const { data: posts, error: postsError } = await supabase
      .from('FacebookPosts')
      .select('*')
      .eq('userId', userId)
      .match(queryFilters);
    
    if (postsError) {
      console.error('Error obteniendo publicaciones:', postsError);
    }
    
    // Consulta eventos de página recibidos
    const { data: events, error: eventsError } = await supabase
      .from('FacebookPageEvents')
      .select('*')
      .match(queryFilters);
    
    if (eventsError) {
      console.error('Error obteniendo eventos de página:', eventsError);
    }
    
    // Agrupamos manualmente por página
    const postsByPage = posts
      ? Object.entries(
          posts.reduce((acc: Record<string, number>, post) => {
            const pageId = post.pageId || 'unknown';
            if (pageId) {
              acc[pageId] = (acc[pageId] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Agrupamos manualmente por fecha
    const postsByDate = posts
      ? Object.entries(
          posts.reduce((acc: Record<string, number>, post) => {
            const dateStr = post.createdAt
              ? new Date(post.createdAt).toISOString().split('T')[0]
              : 'unknown';
            if (dateStr) {
              acc[dateStr] = (acc[dateStr] || 0) + 1;
            }
            return acc;
          }, {})
        )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    
    // Agrupamos manualmente por tipo de evento
    const pageEvents = events
      ? Object.entries(
          events.reduce((acc: Record<string, number>, event) => {
            const field = event.field || 'unknown';
            if (field) {
              acc[field] = (acc[field] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Formateamos los datos para la respuesta
    const analytics = {
      postsByPage,
      postsByDate,
      pageEvents,
      totals: {
        posts: posts?.length || 0,
        events: events?.length || 0,
      },
    };
    
    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Error obteniendo analytics de Facebook:', error);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo analytics',
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
};

/**
 * Obtiene analytics de Instagram
 * @route GET /api/meta/analytics/instagram
 */
export const getInstagramAnalytics = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.username;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }
    
    // Parámetros para filtrar por fecha
    const { startDate, endDate, igAccountId } = req.query;
    
    // Preparamos los filtros de consulta
    const queryFilters: Record<string, unknown> = { userId };
    
    if (igAccountId) {
      queryFilters.igAccountId = igAccountId;
    }
    
    if (startDate) {
      queryFilters.createdAt = {
        gte: new Date(startDate as string).toISOString(),
        ...(endDate ? { lte: new Date(endDate as string).toISOString() } : {}),
      };
    }
    
    // Consulta publicaciones para agruparlas manualmente
    const { data: posts, error: postsError } = await supabase
      .from('InstagramPosts')
      .select('*')
      .eq('userId', userId)
      .match(queryFilters);
    
    if (postsError) {
      console.error('Error obteniendo publicaciones:', postsError);
    }
    
    // Consulta eventos de Instagram recibidos
    const { data: events, error: eventsError } = await supabase
      .from('InstagramEvents')
      .select('*')
      .match(queryFilters);
    
    if (eventsError) {
      console.error('Error obteniendo eventos de Instagram:', eventsError);
    }
    
    // Agrupamos manualmente por cuenta
    const postsByAccount = posts
      ? Object.entries(
          posts.reduce((acc: Record<string, number>, post) => {
            const accountId = post.igAccountId || 'unknown';
            if (accountId) {
              acc[accountId] = (acc[accountId] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Agrupamos manualmente por fecha
    const postsByDate = posts
      ? Object.entries(
          posts.reduce((acc: Record<string, number>, post) => {
            const dateStr = post.createdAt
              ? new Date(post.createdAt).toISOString().split('T')[0]
              : 'unknown';
            if (dateStr) {
              acc[dateStr] = (acc[dateStr] || 0) + 1;
            }
            return acc;
          }, {})
        )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    
    // Agrupamos manualmente por tipo de evento
    const igEvents = events
      ? Object.entries(
          events.reduce((acc: Record<string, number>, event) => {
            const field = event.field || 'unknown';
            if (field) {
              acc[field] = (acc[field] || 0) + 1;
            }
            return acc;
          }, {})
        ).map(([name, count]) => ({ name, count }))
      : [];
    
    // Formateamos los datos para la respuesta
    const analytics = {
      postsByAccount,
      postsByDate,
      events: igEvents,
      totals: {
        posts: posts?.length || 0,
        events: events?.length || 0,
      },
    };
    
    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Error obteniendo analytics de Instagram:', error);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo analytics',
      error: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
};
