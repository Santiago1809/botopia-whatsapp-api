import type { Request } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import type { Role } from '../../generated/prisma'
import type WAWebJS from 'whatsapp-web.js'

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
