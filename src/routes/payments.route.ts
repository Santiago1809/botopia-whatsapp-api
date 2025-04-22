import express from 'express'
import { getPayUInfo } from '../controllers/payment.controller'

const router = express.Router()

router.post('/payu', getPayUInfo)

export default router
