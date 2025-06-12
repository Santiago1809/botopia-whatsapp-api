import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'
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
  getSyncedContacts,
  deleteSynced
} from '../controllers/whatsapp.controller'
import { toggleUnknownAi } from '../controllers/user.controller'

const router = express.Router()

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
router.get('/synced-contacts', authenticateToken, getSyncedContacts)
router.post('/delete-synced', authenticateToken, deleteSynced)
router.post('/toggle-unknown-ai', authenticateToken, toggleUnknownAi)

export default router
