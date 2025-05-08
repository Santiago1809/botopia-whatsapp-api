import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'
import {
  sendMessage,
  startWhatsApp,
  stopWhatsApp,
  getContacts,
  syncContacts
} from '../controllers/whatsapp.controller'

const router = express.Router()

router.post('/start-whatsapp', authenticateToken, startWhatsApp)
router.post('/send-message', authenticateToken, sendMessage)
router.post('/stop-whatsapp', authenticateToken, stopWhatsApp)
router.get('/contacts', authenticateToken, getContacts)
router.post('/sync-contacts', authenticateToken, syncContacts)

export default router
