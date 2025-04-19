import * as bcrypt from 'bcrypt'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { User } from '../../generated/prisma'
import { Role } from '../../generated/prisma'
import { prisma } from '../config/db'
import type { ChangePassword, CustomRequest } from '../interfaces/global'
import { clients } from '../WhatsAppClients'

const JWT_SECRET = process.env.JWT_SECRET || 'secret_super_seguro' /* 
const otpStore: Record<string, string> = {} */

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { username, password, role, email } = req.body as Partial<User>
    if (!username || !password || !email) {
      res.status(400).json({ message: 'Faltan datos para el registro' })
      return
    }
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }]
      }
    })
    if (existingUser) {
      res.status(409).json({ message: 'El usuario o correo ya existe' })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        role: role ?? Role.user
      }
    })
    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    )
    res.json({ token, user: { username: user.username, role: user.role } })
  } catch (error) {
    console.error('❌ Error en el registro:', error)
    res.status(500).json({ message: 'Error en el servidor' })
  }
}

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as Partial<User>
    if (!username || !password) {
      res.status(400).json({ message: 'Faltan datos para el login' })
    }
    const user = await prisma.user.findUnique({
      where: {
        username
      }
    })

    if (!user) {
      res.status(400).json({ message: 'Usuario no encontrado' })
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
      { expiresIn: '2h' }
    )
    res.json({ token, user: { username: user.username, role: role } })
  } catch (error) {
    console.error('❌ Error en el login:', error)
    res.status(500).json({ message: 'Error en el servidor' })
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
      res.status(404).json({ message: 'Usuario no encontrado' })
      return
    }
    res.json({ ...user })
  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error)
    res.status(500).json({ message: 'Error en el servidor' })
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
    res.status(500).json({ message: 'Error en el servidor' })
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
    res.status(404).json({ message: 'Usuario no encontrado' })
    return
  }

  try {
    for (const numberData of user?.whatsappNumbers || []) {
      const numberId = numberData.id

      if (clients[numberId]) {
        await clients[numberId].logout()
        await clients[numberId].pupBrowser?.close()
        await clients[numberId].destroy()
      }
      delete clients[numberId]
    }
    await prisma.whatsAppNumber.deleteMany({
      where: {
        userId: user?.id
      }
    })
  } catch {
    res.status(500).json({ message: 'Error al cerrar sesión' })
  }
}

/* export const requestResetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as Partial<User>
    if (!email) {
      return res.status(400).json({ message: 'Falta el email' })
    }
    const user = await prisma.user.findUnique({
      where: {
        email
      }
    })
    if (!user)
      return res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const token = jwt.sign({ email, otp }, process.env.JWT_SECRET, {
      expiresIn: '5m'
    })
    otpStore[email] = { otp, token }
  } catch (error) {}
} */
export const changePassword = async (req: Request, res: Response) => {
  const { email, newPassword } = req.body as ChangePassword

  if (!email || !newPassword) {
    res.status(400).json({ message: 'Faltan datos para cambiar la contraseña' })
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
