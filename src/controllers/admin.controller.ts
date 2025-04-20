import type { Request, Response } from 'express'
import { prisma } from '../config/db'
import { HttpStatusCode } from 'axios'
import type { AddAgent, CustomRequest } from '../interfaces/global'
import { generateSecurePassword } from '../lib/utils'
import bcrypt from 'bcrypt'
import { notifyNewPassword } from '../lib/constants'
import { transporter } from '../services/email.service'

export async function getAgents(_req: Request, res: Response) {
  try {
    const agents = await prisma.agent.findMany({
      where: {
        isGlobal: true
      }
    })
    res.status(HttpStatusCode.Ok).json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error fetching agents',
      error: (error as Error).message
    })
  }
}

export async function addAgent(req: CustomRequest, res: Response) {
  try {
    const { title, prompt } = req.body as AddAgent
    const user = await prisma.user.findUnique({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res.status(HttpStatusCode.Unauthorized).json({
        message: 'User not found'
      })
      return
    }
    await prisma.agent.create({
      data: {
        title,
        prompt,
        ownerId: user.id,
        isGlobal: true
      }
    })
    res.status(HttpStatusCode.Created).json({ message: 'Agente creado' })
  } catch (error) {
    console.error('Error creating agent:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error creating agent',
      error: (error as Error).message
    })
  }
}

export async function editAgent(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { title, prompt } = req.body as Partial<AddAgent>
    const agent = await prisma.agent.findUnique({
      where: {
        id: Number(id)
      }
    })
    if (!agent) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'Agent not found'
      })
      return
    }
    await prisma.agent.update({
      where: {
        id: Number(id)
      },
      data: {
        title: title || agent.title,
        prompt: prompt || agent.prompt
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Agente editado' })
  } catch (error) {
    console.error('Error editing agent:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error editing agent',
      error: (error as Error).message
    })
  }
}
export function deleteAgent(req: Request, res: Response) {
  try {
    const { id } = req.params
    prisma.agent.delete({
      where: {
        id: Number(id)
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Agente eliminado' })
  } catch (error) {
    console.error('Error deleting agent:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error deleting agent',
      error: (error as Error).message
    })
  }
}

export async function deactivateUser(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({
      where: {
        id: Number(id)
      }
    })
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await prisma.user.update({
      where: {
        id: Number(id)
      },
      data: {
        active: false
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Usuario desactivado' })
  } catch (error) {
    console.error('Error deactivating user:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error deactivating user',
      error: (error as Error).message
    })
  }
}

export async function activateUser(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({
      where: {
        id: Number(id)
      }
    })
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await prisma.user.update({
      where: {
        id: Number(id)
      },
      data: {
        active: true
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Usuario activado' })
  } catch (error) {
    console.error('Error activating user:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error activating user',
      error: (error as Error).message
    })
  }
}
export async function updateUserTokens(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { tokens } = req.body as { tokens: number }
    const user = await prisma.user.findUnique({
      where: {
        id: Number(id)
      }
    })
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await prisma.user.update({
      where: {
        id: Number(id)
      },
      data: {
        AiTokensLimit: tokens || user.AiTokensLimit
      }
    })
    res
      .status(HttpStatusCode.Ok)
      .json({ message: 'Tokens de usuario actualizados' })
  } catch (error) {
    console.error('Error updating user tokens:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error updating user tokens',
      error: (error as Error).message
    })
  }
}
export async function getAllUsers(req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true
      },
      omit: {
        password: true
      }
    })
    res.status(HttpStatusCode.Ok).json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error fetching users',
      error: (error as Error).message
    })
  }
}

export async function setUserTokenLimit(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { tokensPerResponse } = req.body as { tokensPerResponse: number }

    if (
      !id ||
      !tokensPerResponse ||
      isNaN(+tokensPerResponse) ||
      tokensPerResponse <= 0
    ) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'Datos inválidos'
      })
      return
    }
    const user = await prisma.user.findUnique({
      where: {
        id: Number(id)
      }
    })
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await prisma.user.update({
      where: {
        id: Number(id)
      },
      data: {
        tokensPerResponse: tokensPerResponse || user.tokensPerResponse
      }
    })
    res
      .status(HttpStatusCode.Ok)
      .json({ message: 'Límite de tokens actualizado' })
  } catch (error) {
    console.error('Error updating user tokens:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error updating user tokens',
      error: (error as Error).message
    })
  }
}

export async function changeUserPassword(req: Request, res: Response) {
  try {
    const { email } = req.body
    const password = generateSecurePassword()
    const user = await prisma.user.findUnique({
      where: {
        email
      }
    })
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: {
        email
      },
      data: {
        password: hashedPassword
      }
    })
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Contraseña actualizada',
      html: notifyNewPassword(password)
    }
    await transporter.sendMail(mailOptions)
    res.status(HttpStatusCode.Ok).json({
      message: 'Contraseña actualizada y enviada al correo electrónico'
    })
  } catch (error) {
    console.error('Error changing user password:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: 'Error changing user password',
      error: (error as Error).message
    })
  }
}
