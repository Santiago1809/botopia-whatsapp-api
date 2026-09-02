// Encuestas nativas de WhatsApp: enviar y leer votos guardados.
// Montado en index.ts bajo /api/whatsapp/encuestas, siempre con sesión.
import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware.js'
import {
  enviarEncuesta,
  votosDeEncuestas
} from '../controllers/whatsapp/encuestas.controller.js'

const router = express.Router()

router.post('/enviar', authenticateToken, enviarEncuesta)
router.get('/votos', authenticateToken, votosDeEncuestas)

export default router
