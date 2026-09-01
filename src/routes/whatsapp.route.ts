import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware.js'
import {
  sendMessage,
  getMessageUsage,
  startWhatsApp,
  stopWhatsApp,
  getContacts,
  syncContacts,
  syncContactsToDB,
  updateAgenteHabilitado,
  bulkUpdateAgenteHabilitado,
  updateCustomContact,
  getSyncedContacts,
  deleteSynced,
  fotosDeChats
} from '../controllers/whatsapp.controller.js'
import { toggleUnknownAi } from '../controllers/user.controller.js'

const router = express.Router()

router.get('/fotos', authenticateToken, fotosDeChats)
router.post('/start-whatsapp', authenticateToken, startWhatsApp)
router.post('/send-message', authenticateToken, sendMessage)
router.get('/message-usage', authenticateToken, getMessageUsage)
router.post('/stop-whatsapp', authenticateToken, stopWhatsApp)
router.get('/contacts', authenticateToken, getContacts)
router.post('/sync-contacts', authenticateToken, syncContacts)
router.post('/sync-contacts-db', authenticateToken, syncContactsToDB)
router.post(
  '/update-agente-habilitado',
  authenticateToken,
  updateAgenteHabilitado
)
router.post(
  '/bulk-update-agente-habilitado',
  authenticateToken,
  bulkUpdateAgenteHabilitado
)
// Nombre y foto personalizados de un contacto/grupo sincronizado.
router.post('/update-custom', authenticateToken, updateCustomContact)
router.get('/synced-contacts', authenticateToken, getSyncedContacts)
router.post('/delete-synced', authenticateToken, deleteSynced)
router.post('/toggle-unknown-ai', authenticateToken, toggleUnknownAi)

export default router
