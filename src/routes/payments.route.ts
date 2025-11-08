import express from 'express'
import { createPayment, handleNotification, confirmPayment } from '../controllers/payment.controller.js'

const router = express.Router()

router.post("/create-payment", createPayment);
router.post("/notification", handleNotification);
router.get('/confirm-payment', confirmPayment);

export default router;
