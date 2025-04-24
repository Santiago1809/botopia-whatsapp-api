import * as bcrypt from 'bcrypt'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { User } from '../../generated/prisma'
import { Role } from '../../generated/prisma'
import { prisma } from '../config/db'
import type { ChangePassword, CustomRequest } from '../interfaces/global'
import { clients } from '../WhatsAppClients'
import { HttpStatusCode } from 'axios'
import { transporter } from '../services/email.service'
import { resetPasswordTemplate, welcomeUserTemplate } from '../lib/constants'
import type { Server } from 'socket.io'

const JWT_SECRET = process.env.JWT_SECRET || 'secret_super_seguro'
const otpStore: Record<string, { otp: string; token: string }> = {}

export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      username,
      password,
      role,
      email,
      phoneNumber,
      countryCode
    } = //private String final username
      req.body as Partial<User>
    if (!username || !password || !email) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Faltan datos para el registro' })
      return
    }
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }, ...(phoneNumber ? [{ phoneNumber }] : [])]
      }
    })
    if (existingUser) {
      res
        .status(409)
        .json({ message: 'El usuario, correo o número de teléfono ya existe' })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        phoneNumber,
        countryCode,
        role: role ?? Role.user
      }
    })
    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '5h' }
    )
    transporter.sendMail({
      from: `"Botopia Team" <contacto@botopia.tech>`,
      to: email,
      subject: 'Bienvenido Botopia',
      html: welcomeUserTemplate(user.username)
    })
    res.json({ token, user: { username: user.username, role: user.role } })
  } catch (error) {
    console.error('❌ Error en el registro:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error en el servidor' })
  }
}

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body
    if (!identifier || !password) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Faltan datos para el login' })
      return
    }

    // Buscar usuario por username, email o phoneNumber
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { phoneNumber: identifier }
        ]
      }
    })

    if (!user) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    if (!user.active) {
      res.status(403).json({ message: 'Usuario no autorizado' })
      return
    }

    const validPassword = await bcrypt.compare(
      password as string,
      user.password
    )
    if (!validPassword) {
      res.status(403).json({ message: 'Contraseña incorrecta' })
      return
    }
    const role = user.role || Role.user

    const token = jwt.sign(
      { username: user.username, role: role },
      JWT_SECRET,
      { expiresIn: '5h' }
    )
    res.json({ token, user: { username: user.username, role: role } })
  } catch (error) {
    console.error('❌ Error en el login:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error en el servidor' })
  }
}

export const getUserInfo = async (req: CustomRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: req?.user?.username
      },
      select: {
        username: true,
        role: true
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    res.json({ ...user })
  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error en el servidor' })
  }
}

export const getUsersList = async (req: CustomRequest, res: Response) => {
  try {
    if (req.user?.role !== Role.admin)
      return res.status(403).json({ message: 'Acceso denegado' })
    const users = await prisma.user.findMany({
      omit: {
        password: true
      }
    })
    res.json(users)
  } catch (error) {
    console.error('❌ Error obteniendo la lista de usuarios:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error en el servidor' })
  }
}

export async function logOut(req: CustomRequest, res: Response) {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    res.status(401).json({ message: 'Acceso denegado' })
    return
  }
  const token = authHeader.split(' ')[1]
  if (!token) {
    res.status(401).json({ message: 'Acceso denegado' })
    return
  }
  const user = await prisma.user.findFirst({
    where: {
      username: req.user?.username
    },
    include: {
      whatsappNumbers: true
    }
  })

  if (!user) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'Usuario no encontrado' })
    return
  }

  try {
    for (const numberData of user?.whatsappNumbers || []) {
      const numberId = numberData.id
      if (clients[numberId]) {
        try {
          const client = clients[numberId]
          // Define a safer cleanup function
          const safeCleanup = async () => {
            // Remove event listeners first
            try {
              client.removeAllListeners()
            } catch (err) {
              console.warn('removeAllListeners failed', err)
            }

            // Attempt logout if possible
            try {
              if (client.pupBrowser && client.pupBrowser.isConnected()) {
                await client.logout()
              }
            } catch (err) {
              console.warn('logout failed', err)
            }

            // Close browser resources
            try {
              // Check if page exists and is not closed before attempting to close
              if (client.pupPage && !client.pupPage.isClosed?.()) {
                await client.pupPage.close().catch(() => {})
              }
            } catch (err) {
              console.warn('pupPage close failed', err)
            }

            // Handle browser disconnection
            try {
              if (client.pupBrowser) {
                if (client.pupBrowser.isConnected?.()) {
                  client.pupBrowser.disconnect()
                }
                await client.pupBrowser.close().catch(() => {})
              }
            } catch (err) {
              console.warn('pupBrowser close failed', err)
            }

            // Final cleanup
            try {
              if (typeof client.destroy === 'function') {
                await client.destroy()
              }
            } catch (err) {
              console.warn('destroy failed', err)
            }
          }

          // Execute the cleanup with timeout protection
          try {
            await Promise.race([
              safeCleanup(),
              new Promise((resolve) => setTimeout(resolve, 5000))
            ])
          } catch (err) {
            console.error('Client cleanup failed:', err)
          }
        } catch (err) {
          console.warn(`Error cleaning up client ${numberId}:`, err)
        }
        // Always delete the client reference
        delete clients[numberId]
      }
    }
    // Attempt to delete WhatsApp numbers without crashing
    try {
      await prisma.whatsAppNumber.deleteMany({
        where: {
          userId: user?.id
        }
      })
    } catch (err) {
      console.warn('Error deleting WhatsApp numbers:', err)
    }
    // Respond success
    res.json({ message: 'Sesión cerrada correctamente' })
  } catch {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error al cerrar sesión' })
  }
}

export const requestResetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as Partial<User>
    if (!email) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Falta el email' })
      return
    }
    const user = await prisma.user.findUnique({
      where: {
        email
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const token = jwt.sign({ email, otp }, process.env.JWT_SECRET ?? 'secret', {
      expiresIn: '5m'
    })
    otpStore[email] = { otp, token }
    transporter.sendMail({
      from: `"Botopia Team" <contacto@botopia.tech>`,
      to: email,
      subject: 'Contraseña actualizada',
      html: resetPasswordTemplate(otp)
    })
    const io: Server = req.app.get('io')
    io.emit('otp-sent', { email, message: 'OTP enviado correctamente' })
    res.status(HttpStatusCode.Ok).json({
      message: 'OTP enviado correctamente'
    })
  } catch (error) {
    console.error(
      '❌ Error al solicitar el restablecimiento de contraseña:',
      error
    )
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error al solicitar el restablecimiento de contraseña' })
  }
}
export async function verifyOtp(req: Request, res: Response) {
  const { email, otp } = req.body
  const storedData = otpStore[email]

  if (!storedData) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'OTP no encontrado' })
    return
  }
  try {
    if (storedData.otp !== otp) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'OTP incorrecto' })
      return
    }
    delete otpStore[email]
    res.status(HttpStatusCode.Ok).json({ message: 'OTP verificado' })
  } catch (error) {
    console.error('❌ Error al verificar el OTP:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error al verificar el OTP'
    })
  }
}
export const changePassword = async (req: Request, res: Response) => {
  const { email, newPassword } = req.body as ChangePassword

  if (!email || !newPassword) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Faltan datos para cambiar la contraseña' })
    return
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: {
        email
      },
      data: {
        password: hashedPassword
      }
    })
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (error) {
    console.log(error)
    res.json({ message: 'Error al actualizar la contraseña' })
  }
}
