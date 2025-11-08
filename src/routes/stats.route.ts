import express from 'express'
import { authenticateToken, isAdmin } from '../middleware/jwt.middleware.js'
import { calculatePrice, getUsageStats } from '../controllers/stats.controller.js'

const router = express.Router()

router.get('/price', authenticateToken, isAdmin, calculatePrice)
router.get('/stats', authenticateToken, isAdmin, getUsageStats)

export default router
