import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { CustomRequest, RequestUser } from '../interfaces/global.js'

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
      jwt.verify(
        token as string,
        process.env.JWT_SECRET || 'secret',
        (err, decoded) => {
          if (err) reject(err)
          else resolve(decoded as RequestUser)
        }
      )
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

export async function isAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Acceso denegado' })
    return
  }
  next()
}
