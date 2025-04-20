import express from 'express'
import { authenticateToken, isAdmin } from '../middleware/jwt.middleware'
import {
  activateUser,
  addAgent,
  deactivateUser,
  deleteAgent,
  editAgent,
  getAgents,
  getAllUsers,
  setUserTokenLimit,
  updateUserTokens
} from '../controllers/admin.controller'

const router = express.Router()

router.get('/users', authenticateToken, isAdmin, getAllUsers)
router.get('/agents', authenticateToken, isAdmin, getAgents)
router.post('/agents', authenticateToken, isAdmin, addAgent)
router.patch('/agents/:id', authenticateToken, isAdmin, editAgent)
router.delete('/agents/:id', authenticateToken, isAdmin, deleteAgent)
router.patch(
  '/update-user-tokens/:id',
  authenticateToken,
  isAdmin,
  updateUserTokens
)
router.patch(
  '/config-tokens/:id',
  authenticateToken,
  isAdmin,
  setUserTokenLimit
)
router.patch('/activate/:id', authenticateToken, isAdmin, activateUser)
router.patch('/deactivate/:id', authenticateToken, isAdmin, deactivateUser)
