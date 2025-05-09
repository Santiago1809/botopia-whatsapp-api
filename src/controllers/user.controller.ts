import type { Request, Response } from 'express'
import { supabase } from '../config/db'
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
    const { data: num } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('number', number)
      .single()
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    await supabase
      .from('WhatsAppNumber')
      .update({ aiEnabled: enabled })
      .eq('id', num.id)
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
    const { data: num } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('number', number)
      .single()
    if (!num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }
    await supabase
      .from('WhatsAppNumber')
      .update({ responseGroups: enabled })
      .eq('id', num.id)
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
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const { data: existingNumber } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('number', number)
      .single()
    if (existingNumber) {
      res.status(HttpStatusCode.Conflict).json({ message: 'Número ya existe' })
      return
    }
    const { data: newNumber } = await supabase
      .from('WhatsAppNumber')
      .insert({
        number,
        name,
        userId: user.id
      })
      .select('*')
      .single()
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
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()

    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    const { data: whatsappNumbers } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('userId', user.id)

    res.status(HttpStatusCode.Ok).json(whatsappNumbers || [])
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error obteniendo números de WhatsApp: ${
        (error as Error).message
      }`
    })
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

    const { data: num, error: findError } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('id', Number(numberId))
      .single()

    if (findError || !num) {
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

    const { error: deleteError } = await supabase
      .from('WhatsAppNumber')
      .delete()
      .eq('id', Number(numberId))

    if (deleteError) {
      throw deleteError
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Número eliminado' })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error eliminando número de WhatsApp ${(error as Error).message}`
    })
  }
}

export async function getAgents(req: CustomRequest, res: Response) {
  try {
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()

    if (userError || !user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    const { data: agents, error: agentsError } = await supabase
      .from('Agent')
      .select('*')
      .or(`isGlobal.eq.true,ownerId.eq.${user.id}`)

    if (agentsError) {
      throw agentsError
    }

    res.status(HttpStatusCode.Ok).json(agents)
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({
        message: `Error obteniendo agentes: ${(error as Error).message}`
      })
  }
}

export async function addAgent(req: CustomRequest, res: Response) {
  const { title, prompt } = req.body as { title: string; prompt: string }
  try {
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()

    if (userError || !user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    const { error: insertError } = await supabase.from('Agent').insert({
      title,
      prompt,
      ownerId: user.id,
      isGlobal: false
    })

    if (insertError) {
      throw insertError
    }

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
    const { data: agent, error: agentError } = await supabase
      .from('Agent')
      .select('*')
      .eq('id', Number(agentId))
      .single()

    if (agentError || !agent) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Agente no encontrado' })
      return
    }

    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()

    if (userError || !user) {
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

    const { error: updateError } = await supabase
      .from('Agent')
      .update({
        title: title ? title : agent.title,
        prompt: prompt ? prompt : agent.prompt
      })
      .eq('id', Number(agentId))

    if (updateError) {
      throw updateError
    }

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
    const { data: agent, error: agentError } = await supabase
      .from('Agent')
      .select('*')
      .eq('id', Number(agentId))
      .single()

    if (agentError || !agent) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Agente no encontrado' })
      return
    }

    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()

    if (userError || !user) {
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

    const { error: deleteError } = await supabase
      .from('Agent')
      .delete()
      .eq('id', Number(agentId))

    if (deleteError) {
      throw deleteError
    }

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
    const { data: num, error: findError } = await supabase
      .from('WhatsAppNumber')
      .select('*')
      .eq('id', Number(numberId))
      .single()

    if (findError || !num) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Número no encontrado' })
      return
    }

    const { error: updateError } = await supabase
      .from('WhatsAppNumber')
      .update({ aiPrompt })
      .eq('id', Number(numberId))

    if (updateError) {
      throw updateError
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Número actualizado' })
  } catch (error) {
    console.error('Error adding agent to number:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error actualizando número de WhatsApp' })
  }
}
