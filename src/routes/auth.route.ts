import express from 'express'
import {
  activateAccount,
  changePassword,
  getUserInfo,
  loginUser,
  logOut,
  registerUser,
  requestResetPassword,
  resendWhatsappOtp,
  verifyEmail,
  verifyOtp,
  verifyWhatsapp
} from '../controllers/auth.controller.js'
import { authenticateToken } from '../middleware/jwt.middleware.js'

const router = express.Router()

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/logout', authenticateToken,logOut)
router.get('/user-info', authenticateToken, getUserInfo)
router.post('/request-reset', requestResetPassword)
router.post('/verify-code', verifyOtp)
// Alias del paso 2 de "recuperar contraseña": el front lo llamaba así y respondía
// 404, de modo que nadie llegaba nunca a poner la contraseña nueva. El front ya usa
// /verify-code; el alias se mantiene para los bundles cacheados en el navegador.
router.post('/request-password-verification', verifyOtp)
router.post('/change-password', changePassword)

// Pantallas de confirmación de cuenta del front. Antes las cuatro daban 404.
router.post('/activate', activateAccount)
router.post('/verify-email', verifyEmail)
router.post('/verify-whatsapp', verifyWhatsapp)
router.post('/resend-otp', resendWhatsappOtp)

export default router
