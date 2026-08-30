import express from 'express'
import { authenticateToken, isAdmin } from '../middleware/jwt.middleware.js'
import {
  calculatePrice,
  getUsageStats,
  runRetentionNow
} from '../controllers/stats.controller.js'

const router = express.Router()

router.get('/price', authenticateToken, isAdmin, calculatePrice)
router.get('/stats', authenticateToken, isAdmin, getUsageStats)

// Limpieza por antigüedad a mano. El disparo normal es al arrancar el servicio
// (src/lib/retention.ts); esto existe para el caso en que el proceso lleve
// semanas sin reiniciarse, o para vaciar de golpe una tabla que se desbordó.
// Solo admin: borra filas.
router.post('/retention', authenticateToken, isAdmin, runRetentionNow)

export default router
