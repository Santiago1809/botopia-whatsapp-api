import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { CustomJwtPaylod, CustomRequest } from '../interfaces/global'

export async function authenticateToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    void res.sendStatus(401) // Unauthorized
  }

  try {
    jwt.verify(
      token as string,
      process.env.JWT_SECRET || 'secret',
      (err, decoded) => {
        if (err) {
          return res.sendStatus(403)
        }
        const user = (decoded as CustomJwtPaylod)?.user
        req.user = user
        next()
      }
    )
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
    }

    res.status(403).json({ message: 'Token inválido.' })
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
