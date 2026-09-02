// Acciones de bandeja (fijar / archivar / no leído) y su estado.
// Montado en index.ts bajo /api/whatsapp/bandeja, siempre con sesión: cada
// controlador vuelve a comprobar que el número sea del usuario del token.
import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware.js'
import {
  archivarChat,
  estadoDeBandeja,
  fijarChat,
  marcarNoLeido
} from '../controllers/whatsapp/bandeja.controller.js'

const router = express.Router()

router.get('/estado', authenticateToken, estadoDeBandeja)
router.post('/pin', authenticateToken, fijarChat)
router.post('/archive', authenticateToken, archivarChat)
router.post('/mark-unread', authenticateToken, marcarNoLeido)

export default router
