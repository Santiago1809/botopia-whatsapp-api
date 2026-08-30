import express from 'express'
import { authenticateToken, isAdmin } from '../middleware/jwt.middleware.js'
import {
  activateUser,
  addAgent,
  deactivateUser,
  deleteAgent,
  editAgent,
  getAgents,
  getAllUsers,
  setUserTokenLimit
} from '../controllers/admin.controller.js'
import {
  cambiarPlan,
  getActividad,
  getComercial,
  getFichaUsuario,
  getInfra,
  getOverview,
  getSalud,
  getUsuarios
} from '../controllers/adminConsole.controller.js'

const router = express.Router()

router.get('/users', authenticateToken, isAdmin, getAllUsers)
router.get('/agents', authenticateToken, isAdmin, getAgents)
router.post('/agents', authenticateToken, isAdmin, addAgent)
router.patch('/agents/:id', authenticateToken, isAdmin, editAgent)
router.delete('/agents/:id', authenticateToken, isAdmin, deleteAgent)
router.patch(
  '/config-tokens/:id',
  authenticateToken,
  isAdmin,
  setUserTokenLimit
)
router.patch('/activate/:id', authenticateToken, isAdmin, activateUser)
router.patch('/deactivate/:id', authenticateToken, isAdmin, deactivateUser)

// ---------------------------------------------------------------------------
//  CONSOLA DE ADMIN
//
//  Van bajo /console para que se lean de un vistazo como "lo que consulta la
//  pantalla nueva", separadas de las acciones (activar, desactivar, agentes).
//  Todas de solo lectura y todas con isAdmin, que RELEE el rol de la base: un
//  usuario normal que entre a /admin por URL directa recibe 403 del backend
//  aunque el menú no le enseñe el enlace.
//
//  Ninguna devuelve contenido de conversaciones. Ver la cabecera de
//  controllers/adminConsole.controller.ts.
// ---------------------------------------------------------------------------
router.get('/console/overview', authenticateToken, isAdmin, getOverview)
router.get('/console/users', authenticateToken, isAdmin, getUsuarios)
router.patch(
  '/console/users/:id/plan',
  authenticateToken,
  isAdmin,
  cambiarPlan
)
router.get('/console/users/:id', authenticateToken, isAdmin, getFichaUsuario)
router.get('/console/activity', authenticateToken, isAdmin, getActividad)
router.get('/console/health', authenticateToken, isAdmin, getSalud)
router.get('/console/commercial', authenticateToken, isAdmin, getComercial)
router.get('/console/infra', authenticateToken, isAdmin, getInfra)

export default router
