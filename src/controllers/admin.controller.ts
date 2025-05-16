import { HttpStatusCode } from 'axios'
import bcrypt from 'bcrypt'
import type { Request, Response } from 'express'
import { supabase } from '../config/db'
import type { AddAgent, CustomRequest } from '../interfaces/global'
import { notifyNewPassword } from '../lib/constants'
import { generateSecurePassword } from '../lib/utils'
import { transporter } from '../services/email.service'

export async function getAgents(_req: Request, res: Response) {
  try {
    const { data: agents } = await supabase
      .from('Agent')
      .select('*')
      .eq('isGlobal', true)
    res.status(HttpStatusCode.Ok).json(agents)
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error fetching agents: ${(error as Error).message}`
    })
  }
}

export async function addAgent(req: CustomRequest, res: Response) {
  try {
    const { title, prompt } = req.body as AddAgent
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()
    if (!user) {
      res.status(HttpStatusCode.Unauthorized).json({
        message: 'User not found'
      })
      return
    }
    await supabase.from('Agent').insert({
      title,
      prompt,
      ownerId: user.id,
      isGlobal: true
    })
    res.status(HttpStatusCode.Created).json({ message: 'Agente creado' })
  } catch (error) {
    console.error('Error creating agent:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error creating agent ${(error as Error).message}`
    })
  }
}

export async function editAgent(req: Request, res: Response) {
  try {
    const { id } = req.params
    const data = req.body as Partial<AddAgent>
    const { data: agent } = await supabase
      .from('Agent')
      .select('*')
      .eq('id', id)
      .single()
    if (!agent) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'Agent not found'
      })
      return
    }
    await supabase.from('Agent').update(data).eq('id', id)
    res.status(HttpStatusCode.Ok).json({ message: 'Agente editado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error editing agent ${(error as Error).message}`
    })
  }
}
export async function deleteAgent(req: Request, res: Response) {
  try {
    const { id } = req.params
    await supabase.from('Agent').delete().eq('id', id)
    res.status(HttpStatusCode.Ok).json({ message: 'Agente eliminado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error deleting agent ${(error as Error).message}`
    })
  }
}

export async function deactivateUser(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', id)
      .single()
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await supabase.from('User').update({ active: false }).eq('id', id)
    res.status(HttpStatusCode.Ok).json({ message: 'Usuario desactivado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error deactivating user ${(error as Error).message}`
    })
  }
}

export async function activateUser(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', id)
      .single()
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await supabase.from('User').update({ active: true }).eq('id', id)
    res.status(HttpStatusCode.Ok).json({ message: 'Usuario activado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error activating user ${(error as Error).message}`
    })
  }
}
export async function updateUserTokens(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { tokens } = req.body as { tokens: number }
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', id)
      .single()
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await supabase
      .from('UserCredits')
      .update({ creditsLimit: tokens })
      .eq('id', id)
    res
      .status(HttpStatusCode.Ok)
      .json({ message: 'Tokens de usuario actualizados' })
  } catch (error) {
    console.error('Error updating user tokens:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error updating user tokens ${(error as Error).message}`
    })
  }
}
export async function getAllUsers(req: Request, res: Response) {
  try {
    const { data: users } = await supabase
      .from('User')
      .select('*,!password')
      .eq('active', true)
    res.status(HttpStatusCode.Ok).json(users)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error fetching users ${(error as Error).message}`
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
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('id', id)
      .single()
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    await supabase
      .from('User')
      .update({
        tokensPerResponse: tokensPerResponse || user.tokensPerResponse
      })
      .eq('id', id)
    res
      .status(HttpStatusCode.Ok)
      .json({ message: 'Límite de tokens actualizado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error updating user tokens ${(error as Error).message}`
    })
  }
}

export async function changeUserPassword(req: Request, res: Response) {
  try {
    const { email } = req.body
    const password = generateSecurePassword()
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('email', email)
      .single()
    if (!user) {
      res.status(HttpStatusCode.NotFound).json({
        message: 'User not found'
      })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    await supabase.from('User').update({ password: hashedPassword })
    const mailOptions = {
      from: `"Botopia Team" <contacto@botopia.tech>`,
      to: email,
      subject: 'Contraseña actualizada',
      html: notifyNewPassword(password)
    }
    await transporter.sendMail(mailOptions)
    res.status(HttpStatusCode.Ok).json({
      message: 'Contraseña actualizada y enviada al correo electrónico'
    })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error changing user password ${(error as Error).message}`
    })
  }
}
