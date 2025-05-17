import express from 'express'
import {
  changePassword,
  getUserInfo,
  loginUser,
  logOut,
  registerUser,
  requestResetPassword,
  verifyOtp
} from '../controllers/auth.controller'
import { authenticateToken } from '../middleware/jwt.middleware'

const router = express.Router()

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/logout', authenticateToken,logOut)
router.get('/user-info', authenticateToken, getUserInfo)
router.post('/request-reset', requestResetPassword)
router.post('/verify-code', verifyOtp)
router.post('/change-password', changePassword)

export default router
