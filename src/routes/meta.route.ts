import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'

// Import Meta controllers
import * as authController from '../controllers/meta/auth.controller'
import * as whatsappController from '../controllers/meta/whatsapp.controller'
import * as facebookController from '../controllers/meta/facebook.controller'
import * as instagramController from '../controllers/meta/instagram.controller'
import * as webhookController from '../controllers/meta/webhook.controller'
import * as analyticsController from '../controllers/meta/analytics.controller.fixed'
import type { Request, Response, NextFunction } from 'express'

const router = express.Router()

/**
 * Middleware para manejar errores de controladores asíncronos o síncronos
 * @param fn Función controladora que puede ser asíncrona o síncrona
 */
const asyncHandler = (fn: (req: Request, res: Response) => Promise<unknown> | void) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
};

// Auth routes
router.get('/auth/url', authenticateToken, asyncHandler(authController.getAuthUrl))
router.get('/auth/callback', asyncHandler(authController.handleCallback))
router.post('/auth/refresh', authenticateToken, asyncHandler(authController.refreshToken))
router.get('/auth/status', authenticateToken, asyncHandler(authController.getAuthStatus))
router.get('/auth/permissions', authenticateToken, asyncHandler(authController.getPermissions))

// WhatsApp routes
router.get('/whatsapp/accounts', authenticateToken, asyncHandler(whatsappController.getAccounts))
router.get('/whatsapp/account/:id', authenticateToken, asyncHandler(whatsappController.getAccount))
router.get('/whatsapp/templates', authenticateToken, asyncHandler(whatsappController.getTemplates))
router.post('/whatsapp/templates', authenticateToken, asyncHandler(whatsappController.createTemplate))
router.post('/whatsapp/messages/template', authenticateToken, asyncHandler(whatsappController.sendTemplateMessage))
router.post('/whatsapp/messages/text', authenticateToken, asyncHandler(whatsappController.sendTextMessage))
router.post('/whatsapp/messages/media', authenticateToken, asyncHandler(whatsappController.sendMediaMessage))

// Facebook routes
router.get('/facebook/pages', authenticateToken, asyncHandler(facebookController.getPages))
router.get('/facebook/page/:id/token', authenticateToken, asyncHandler(facebookController.getPageToken))
router.post('/facebook/page/:id/posts', authenticateToken, asyncHandler(facebookController.createPost))

// Instagram routes
router.get('/instagram/accounts', authenticateToken, asyncHandler(instagramController.getAccounts))
router.post('/instagram/media', authenticateToken, asyncHandler(instagramController.publishMedia))

// Webhook routes
router.get('/webhook', asyncHandler(webhookController.verifyWebhook))
router.post('/webhook', asyncHandler(webhookController.handleWebhook))

// Analytics routes
router.get('/analytics/whatsapp', authenticateToken, asyncHandler(analyticsController.getWhatsAppAnalytics))
router.get('/analytics/facebook', authenticateToken, asyncHandler(analyticsController.getFacebookAnalytics))
router.get('/analytics/instagram', authenticateToken, asyncHandler(analyticsController.getInstagramAnalytics))

export default router
