import express from 'express'
import {
  getUserInfo,
  loginUser,
  logOut,
  registerUser
} from '../controllers/auth.controller'
import { authenticateToken } from '../middleware/jwt.middleware'

const router = express.Router()

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/logout', logOut)
router.get('/user-info', authenticateToken, getUserInfo)
