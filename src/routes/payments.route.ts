import express from 'express'
import {
  confirmPayment,
  createPayment,
  handleNotification,
  latestSuccess
} from '../controllers/payment.controller.js'
import { authenticateToken } from '../middleware/jwt.middleware.js'

const router = express.Router()

router.post('/create-payment', createPayment)
router.post('/notification', handleNotification)
router.get('/confirm-payment', confirmPayment)
// Lo consulta /billing/processing mientras espera la confirmación del cobro.
router.get('/latest-success', authenticateToken, latestSuccess)

export default router
