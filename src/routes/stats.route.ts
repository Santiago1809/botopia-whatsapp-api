import express from 'express'
import { authenticateToken, isAdmin } from '../middleware/jwt.middleware'
import { calculatePrice, getUsageStats } from '../controllers/stats.controller'

const router = express.Router()

router.get('/price', authenticateToken, isAdmin, calculatePrice)
router.get('/stats', authenticateToken, isAdmin, getUsageStats)
