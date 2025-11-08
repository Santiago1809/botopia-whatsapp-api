import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware.js'
import {
  updateAgentNumber,
  addWhatsAppNumber,
  deleteWhatsAppNumer,
  toggleAI,
  toggleResponseGroups,
  getWhatsAppNumbers,
  getAgents,
  addAgent,
  updateAgent,
  deleteAgent
} from '../controllers/user.controller.js'

const router = express.Router()

router.post('/toggle-ai', authenticateToken, toggleAI)
router.post('/response-groups', authenticateToken, toggleResponseGroups)
router.post('/add-number', authenticateToken, addWhatsAppNumber)
router.get('/get-numbers', authenticateToken, getWhatsAppNumbers)
router.get('/agents', authenticateToken, getAgents)
router.post('/agents', authenticateToken, addAgent)
router.patch('/agents/:agentId', authenticateToken, updateAgent)
router.delete('/agents/:agentId', authenticateToken, deleteAgent)
router.delete(
  '/delete-number/:numberId',
  authenticateToken,
  deleteWhatsAppNumer
)

router.patch('/update-prompt/:numberId', authenticateToken, updateAgentNumber)

export default router
