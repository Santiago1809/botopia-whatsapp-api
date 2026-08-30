import express from 'express'
import {
  getResumenConsumo,
  getSeriesConsumo
} from '../controllers/usage.controller.js'
import { authenticateToken } from '../middleware/jwt.middleware.js'

const router = express.Router()

// authenticateToken A SECAS, sin isAdmin: este es el panel del propio cliente.
//
// Lo importante no está aquí sino en el controlador: el id de la cuenta se
// resuelve SIEMPRE desde el username del token y no se acepta ningún `:id` ni
// `?userId=`. Un endpoint compartido entre cliente y admin con un parámetro
// opcional de usuario es la forma más común de filtrar datos entre cuentas, así
// que los dos casos viven en rutas distintas: esta, y /api/admin/console/*.
router.use(authenticateToken)

router.get('/summary', getResumenConsumo)
router.get('/series', getSeriesConsumo)

export default router
