import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { CustomRequest, RequestUser } from '../interfaces/global.js'
import { query } from '../lib/db.js'

/**
 * Clave de firma, resuelta UNA vez y FAIL-CLOSED en producción.
 *
 * EL AGUJERO QUE TAPA: aquí había `process.env.JWT_SECRET || 'secret_super_seguro'`.
 * Si la variable faltaba en Railway (un servicio nuevo, un rename, un despliegue
 * a medias), el servidor arrancaba tan contento verificando tokens firmados con
 * una cadena que está escrita en el repositorio. Cualquiera podía firmarse un
 * `{ username: 'x', role: 'admin' }` y entrar a /api/admin y /api/stats. Un
 * agujero que no da ningún síntoma: todo "funciona".
 *
 * Ahora, con NODE_ENV=production, sin JWT_SECRET el proceso NO ARRANCA. Es la
 * misma decisión que ya toma auth.controller.ts para firmar y la que toma
 * CRM-ms/src/middleware/auth.ts (devuelve 503 sin secreto): fallar ruidosamente
 * en el arranque es infinitamente mejor que quedar abierto en silencio.
 *
 * En desarrollo se conserva el valor de respaldo —y con un aviso— para no
 * obligar a configurar nada al levantar el proyecto en local.
 */
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET no está configurada. En Railway: servicio del API → Variables → JWT_SECRET (cadena larga y aleatoria). El servidor no arranca sin ella: con la clave de respaldo cualquiera se firma un token de admin.'
    )
  }
  console.warn(
    '⚠️ JWT_SECRET sin definir: se usa una clave de desarrollo. NO usar en producción.'
  )
  return 'secret_super_seguro'
})()

export async function authenticateToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    res.sendStatus(401) // Unauthorized
    return
  }

  try {
    // Convertir jwt.verify a promesa para mejor manejo de async/await
    const decoded = await new Promise<RequestUser>((resolve, reject) => {
      // MISMA clave que firma en auth.controller.ts. Estaban distintas ('secret' acá,
      // 'secret_super_seguro' allá): sin JWT_SECRET en el entorno, el login daba un token
      // que este middleware rechazaba, y la sesión se caía a los segundos.
      jwt.verify(token as string, JWT_SECRET, (err, decoded) => {
        if (err) reject(err)
        else resolve(decoded as RequestUser)
      })
    })
    // Asignar usuario decodificado a la solicitud
    req.user = decoded
    next()
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Error en la verificación del token:', error.message)
    } else {
      console.error('❌ Error en la verificación del token:', error)
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: string }).name === 'TokenExpiredError'
    ) {
      res
        .status(401)
        .json({ message: 'Token expirado. Por favor, inicia sesión de nuevo.' })
      return
    }

    res.status(403).json({ message: 'Token inválido.' })
    return
  }
}

/**
 * Puerta de admin. RELEE EL ROL DE LA BASE; no le cree al token.
 *
 * POR QUÉ NO BASTA CON `req.user?.role !== 'admin'` (que era lo que había):
 *
 *   1. El rol viaja DENTRO del token y el token dura 5 horas
 *      (auth.controller.ts). Quitarle admin a alguien en la base no le quitaba
 *      el acceso hasta 5 horas después. Desactivar una cuenta comprometida
 *      tampoco: `active = false` no invalida un token ya emitido.
 *   2. Un token es un dato que trae el cliente. La única razón por la que
 *      confiar en su contenido es la firma — y la firma tenía respaldo en claro
 *      hasta el arreglo de arriba. Dos defensas independientes valen más que
 *      una: aunque alguien consiguiera firmar, tendría que además ser admin
 *      activo en la base.
 *
 * COSTO: una consulta por request, SOLO en las rutas de admin (/api/admin/* y
 * /api/stats/*), resuelta por el índice único de `username`. Es despreciable
 * frente a lo que protege.
 *
 * Se responde 403 con el mismo cuerpo tanto si no es admin como si la cuenta no
 * existe: distinguirlos le diría a quien prueba tokens cuáles son usuarios reales.
 */
export async function isAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const username = req.user?.username
  if (!username) {
    res.status(403).json({ message: 'Acceso denegado' })
    return
  }

  try {
    const { rows } = await query<{ id: number; role: string; active: boolean }>(
      'SELECT id, role, active FROM app."User" WHERE username = $1',
      [username]
    )
    const usuario = rows[0]
    if (!usuario || usuario.role !== 'admin' || !usuario.active) {
      res.status(403).json({ message: 'Acceso denegado' })
      return
    }
    // Se deja el id resuelto para que los controladores de admin no repitan la
    // consulta: el token solo lleva username y role, nunca el id numérico.
    req.adminId = usuario.id
    next()
  } catch (error) {
    // Si la base no responde no se puede verificar el rol, y sin verificar no se
    // pasa. Fail-closed: un 503 es correcto, dejar entrar "por si acaso" no.
    console.error(
      '❌ No se pudo verificar el rol de admin contra la base:',
      error instanceof Error ? error.message : error
    )
    res.status(503).json({
      message: 'No se pudo verificar el permiso de administrador. Reintenta.'
    })
    return
  }
}
