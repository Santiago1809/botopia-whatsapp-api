import express from 'express'
import { authenticateToken } from '../middleware/jwt.middleware.js'
import {
  cambiarEstadoLinea,
  cambiarFotoLinea,
  cambiarNombreLinea,
  obtenerPerfilLinea,
  pedirCodigoVinculacion,
  quitarFotoLinea
} from '../controllers/whatsapp/profile.controller.js'

// Identidad de la LÍNEA (perfil del propio número) y vinculación por código.
// Todas con sesión: la propiedad del número la comprueba el controlador con
// exigirNumeroPropio, igual que el resto del API.
const router = express.Router()

router.get('/:numberId', authenticateToken, obtenerPerfilLinea)
router.patch('/:numberId/name', authenticateToken, cambiarNombreLinea)
router.patch('/:numberId/status', authenticateToken, cambiarEstadoLinea)
// PATCH y no PUT: el CORS de index.ts solo admite GET/POST/PATCH/DELETE, y un
// PUT moriría en el preflight sin llegar nunca al servidor.
router.patch('/:numberId/photo', authenticateToken, cambiarFotoLinea)
router.delete('/:numberId/photo', authenticateToken, quitarFotoLinea)
router.post('/:numberId/pairing-code', authenticateToken, pedirCodigoVinculacion)

export default router
