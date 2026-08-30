import express from 'express'
import {
  actualizarWebhook,
  borrarAviso,
  borrarWebhook,
  crearWebhook,
  getCatalogo,
  getResumen,
  guardarAviso,
  listarAvisos,
  listarEntregas,
  listarEventos,
  listarWebhooks,
  probarWebhook,
  reenviarEntrega,
  rotarSecreto
} from '../controllers/connections.controller.js'
import { authenticateToken } from '../middleware/jwt.middleware.js'

const router = express.Router()

// TODAS las rutas van autenticadas: aquí se administran destinos que reciben
// datos de conversaciones y los secretos con los que se firman.
router.use(authenticateToken)

router.get('/catalog', getCatalogo)

router.get('/webhooks', listarWebhooks)
router.post('/webhooks', crearWebhook)
router.patch('/webhooks/:id', actualizarWebhook)
router.delete('/webhooks/:id', borrarWebhook)
router.post('/webhooks/:id/rotate', rotarSecreto)
router.post('/webhooks/:id/test', probarWebhook)
router.get('/webhooks/:id/deliveries', listarEntregas)

router.post('/deliveries/:id/retry', reenviarEntrega)

router.get('/emails', listarAvisos)
router.post('/emails', guardarAviso)
router.delete('/emails/:id', borrarAviso)

router.get('/events', listarEventos)
router.get('/summary', getResumen)

export default router
