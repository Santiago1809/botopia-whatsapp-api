import type { Request } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import type { Role } from '../../generated/prisma'
import type WAWebJS from 'whatsapp-web.js'

export interface CustomRequest extends Request {
  user?: RequestUser
  /**
   * Id numérico del admin, resuelto por el middleware isAdmin al releer el rol
   * de la base. El JWT solo lleva { username, role }, así que sin esto cada
   * controlador de admin tendría que volver a buscar el usuario por username.
   */
  adminId?: number
}

export interface ChangePassword {
  email: string
  newPassword: string
  // Lo emite verify-code al acertar el OTP; sin él no se cambia ninguna contraseña.
  resetToken?: string
}
export interface RequestUser {
  username: string
  role: Role
}
export interface CustomJwtPaylod extends JwtPayload {
  user: RequestUser
}

export interface StartWhatsApp {
  numberId: number
}

export interface Message {
  role: string
  content: string
  timestamp: number
  to: WAWebJS.ChatId
}

export interface SendMessageBody {
  content: string
  to: string
  numberId: number
}

export interface ToggleAIBody {
  number: string
  enabled: boolean
}

export interface AddWhatsAppNumber extends Omit<ToggleAIBody, 'enabled'> {
  name: string
}

export interface AddAgent {
  title: string
  prompt: string
}
export interface Number {
  id: number
  number: string
  name: string
  aiEnabled: boolean
  aiPrompt: string
  aiModel: string
  responseGroups: boolean
  userId: number
  aiUnknownEnabled: boolean
}