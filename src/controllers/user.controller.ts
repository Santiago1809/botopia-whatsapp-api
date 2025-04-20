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
      .json({ message: 'Número creado', number: newNumber })
  } catch (error) {
    console.error('Error adding WhatsApp number:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error creando número de WhatsApp' })
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
    if (clients[numberId]) {
      await clients[numberId].pupBrowser?.close()
      await clients[numberId].destroy()
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
