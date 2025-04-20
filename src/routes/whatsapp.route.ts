import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'
import {
  sendMessage,
  startWhatsApp,
  stopWhatsApp
} from '../controllers/whatsapp.controller'

const router = express.Router()

router.post('/start-whatsapp', authenticateToken, startWhatsApp)
router.post('/send-message', authenticateToken, sendMessage)
router.post('/stop-whatsapp', authenticateToken, stopWhatsApp)

export default router
