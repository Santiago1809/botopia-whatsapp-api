import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'
import {
  sendMessage,
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

const router = express.Router()

router.post('/start-whatsapp', authenticateToken, startWhatsApp)
router.post('/send-message', authenticateToken, sendMessage)
router.post('/stop-whatsapp', authenticateToken, stopWhatsApp)
router.get('/contacts', authenticateToken, getContacts)
router.post('/sync-contacts', authenticateToken, syncContacts)
router.post('/sync-contacts-db', authenticateToken, syncContactsToDB)
router.post('/update-agente-habilitado', authenticateToken, updateAgenteHabilitado)
router.post('/bulk-update-agente-habilitado', authenticateToken, bulkUpdateAgenteHabilitado)
router.get('/synced-contacts', authenticateToken, getSyncedContacts)
router.post('/delete-synced', authenticateToken, deleteSynced)

export default router
