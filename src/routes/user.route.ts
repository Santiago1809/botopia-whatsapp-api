import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware'
import {
  updateAgentNumber,
  addWhatsAppNumber,
  deleteWhatsAppNumer,
  toggleAI,
  toggleResponseGroups
} from '../controllers/user.controller'

const router = express.Router()

router.post('/toggle-ai', authenticateToken, toggleAI)
router.post('/response-groups', authenticateToken, toggleResponseGroups)
router.post('/add-number', authenticateToken, addWhatsAppNumber)
router.delete(
  '/delete-number/:numberId',
  authenticateToken,
  deleteWhatsAppNumer
)

router.patch('/update-prompt/:numberId', authenticateToken, updateAgentNumber)

export default router
