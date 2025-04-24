import { Router } from 'express'
import { getUserCredits } from '../controllers/credits.controller'
import { authenticateToken } from '../middleware/jwt.middleware'

const router = Router()

router.get('/user-credits', authenticateToken, getUserCredits)

export default router
