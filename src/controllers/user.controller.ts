import type { Request, Response } from 'express'
import { prisma } from '../config/db'
import type {
  AddWhatsAppNumber,
  CustomRequest,
  ToggleAIBody
} from '../interfaces/global'
import { HttpStatusCode } from 'axios'
import { clients } from '../WhatsAppClients'

export async function toggleAI(req: Request, res: Response) {
  const { number, enabled } = req.body as ToggleAIBody
  try {
    const num = await prisma.whatsAppNumber.findFirst({
      where: {
        number
      }
    })
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    await prisma.whatsAppNumber.update({
      where: {
        id: num.id
      },
      data: {
        aiEnabled: enabled
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Número actualizado' })
  } catch {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error actualizando la IA' })
  }
}

export async function toggleResponseGroups(req: Request, res: Response) {
  const { number, enabled } = req.body as ToggleAIBody
  try {
    const num = await prisma.whatsAppNumber.findFirst({
      where: {
        number
      }
    })
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    await prisma.whatsAppNumber.update({
      where: {
        id: num.id
      },
      data: {
        responseGroups: enabled
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Número actualizado' })
  } catch {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error actualizando configuraciones de la IA' })
  }
}

export async function addWhatsAppNumber(req: CustomRequest, res: Response) {
  try {
    const { number, name } = req.body as AddWhatsAppNumber
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const existingNumber = await prisma.whatsAppNumber.findFirst({
      where: {
        number
      }
    })
    if (existingNumber) {
      res.status(HttpStatusCode.Conflict).json({ message: 'Número ya existe' })
      return
    }
    const newNumber = await prisma.whatsAppNumber.create({
      data: {
        number,
        name,
        userId: user.id
      }
    })
    res
      .status(HttpStatusCode.Created)
      .json({ message: 'Número creado', numberId: newNumber.id })
  } catch (error) {
    console.error('Error adding WhatsApp number:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error creando número de WhatsApp' })
  }
}

export async function getWhatsAppNumbers(req: CustomRequest, res: Response) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      },
      include: {
        whatsappNumbers: {
          omit: {
            userId: true
          }
        }
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    res.status(HttpStatusCode.Ok).json(user.whatsappNumbers)
  } catch (error) {
    console.error('Error getting WhatsApp numbers:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error obteniendo números de WhatsApp' })
  }
}

export async function deleteWhatsAppNumer(req: Request, res: Response) {
  const { numberId } = req.params
  try {
    if (!numberId) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Número no encontrado' })
      return
    }
    const num = await prisma.whatsAppNumber.findFirst({
      where: {
        id: Number(numberId)
      }
    })
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }

    // Handle WhatsApp client cleanup
    if (clients[numberId]) {
      const client = clients[numberId]
      await client.logout()
      await client.destroy()
      delete clients[numberId]
    }

    await prisma.whatsAppNumber.delete({
      where: {
        id: Number(numberId)
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Número eliminado' })
  } catch (error) {
    console.error('Error deleting WhatsApp number:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error eliminando número de WhatsApp' })
  }
}

export async function getAgents(req: CustomRequest, res: Response) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const agents = await prisma.agent.findMany({
      where: {
        OR: [
          {
            isGlobal: true
          },
          {
            ownerId: user.id
          }
        ]
      }
    })
    if (!agents) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Agentes no encontrados' })
      return
    }
    res.status(HttpStatusCode.Ok).json(agents)
  } catch (error) {
    console.error('Error getting agents:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error obteniendo agentes' })
  }
}

export async function addAgent(req: CustomRequest, res: Response) {
  const { title, prompt } = req.body as { title: string; prompt: string }
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    await prisma.agent.create({
      data: {
        title,
        prompt,
        ownerId: user.id,
        isGlobal: false
      }
    })
    res.status(HttpStatusCode.Created).json({ message: 'Agente creado' })
  } catch (error) {
    console.error('Error adding agent:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error creando agente' })
  }
}

export async function updateAgent(req: CustomRequest, res: Response) {
  const { agentId } = req.params
  const { title, prompt } = req.body as { title: string; prompt: string }
  try {
    const agent = await prisma.agent.findFirst({
      where: {
        id: Number(agentId)
      }
    })
    if (!agent) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Agente no encontrado' })
      return
    }
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    if (agent.ownerId !== user.id) {
      res.status(HttpStatusCode.Forbidden).json({
        message: 'No tienes permiso para editar este agente'
      })
      return
    }
    await prisma.agent.update({
      where: {
        id: Number(agentId)
      },
      data: {
        title: title ? title : agent.title,
        prompt: prompt ? prompt : agent.prompt
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Agente actualizado' })
  } catch (error) {
    console.error('Error updating agent:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error actualizando agente' })
  }
}

export async function deleteAgent(req: CustomRequest, res: Response) {
  const { agentId } = req.params
  try {
    const agent = await prisma.agent.findFirst({
      where: {
        id: Number(agentId)
      }
    })
    if (!agent) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Agente no encontrado' })
      return
    }
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    if (agent.ownerId !== user.id) {
      res.status(HttpStatusCode.Forbidden).json({
        message: 'No tienes permiso para eliminar este agente'
      })
      return
    }
    await prisma.agent.delete({
      where: {
        id: Number(agentId)
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Agente eliminado' })
  } catch (error) {
    console.error('Error deleting agent:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error eliminando agente' })
  }
}

export async function updateAgentNumber(req: Request, res: Response) {
  const { numberId } = req.params
  const { aiPrompt } = req.body as { aiPrompt: string }
  try {
    const num = await prisma.whatsAppNumber.findFirst({
      where: {
        id: Number(numberId)
      }
    })
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    await prisma.whatsAppNumber.update({
      where: {
        id: Number(numberId)
      },
      data: {
        aiPrompt
      }
    })
    res.status(HttpStatusCode.Ok).json({ message: 'Número actualizado' })
  } catch (error) {
    console.error('Error adding agent to number:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error actualizando número de WhatsApp' })
  }
}
