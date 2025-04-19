import type { Request } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import type { Role } from '../../generated/prisma'

export interface CustomRequest extends Request {
  user?: RequestUser
}

export interface ChangePassword {
  email: string
  newPassword: string
}
export interface RequestUser {
  username: string
  role: Role
}
export interface CustomJwtPaylod extends JwtPayload {
  user: RequestUser
}
