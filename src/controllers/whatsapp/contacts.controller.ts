// Maneja todo lo relacionado con contactos y grupos
import { HttpStatusCode } from 'axios'
import type { Request, Response } from 'express'
import { supabase } from '../../config/db'
import { clients } from '../../WhatsAppClients'
import type { Contact, Group } from '../../types/global'

// Estructura en memoria para sincronizados por sesión
const syncedContactsMemory: {
  [numberId: string]: { contacts: string[]; groups: string[] }
} = {}

export async function getContacts(req: Request, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  const client = clients[numberId as string]
  if (!client) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'WhatsApp client not found for this numberId' })
    return
  }
  try {
    const contacts = await client.getContacts()
    const contactList = contacts.map((contact) => ({
      id: contact.id._serialized,
      name: contact.name || contact.pushname || contact.number,
      number: contact.number,
      isGroup: contact.isGroup,
      isMyContact: contact.isMyContact
    }))
    res.status(HttpStatusCode.Ok).json(contactList)
  } catch (error) {
    console.error('Error getting contacts:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error getting contacts' })
  }
}

export async function syncContacts(req: Request, res: Response) {
  const { numberId, contacts, groups } = req.body
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  // Guardar en memoria
  syncedContactsMemory[numberId] = {
    contacts: contacts || [],
    groups: groups || []
  }
  res.status(HttpStatusCode.Ok).json({ message: 'Contacts and groups synced!' })
}

export async function syncContactsToDB(req: Request, res: Response) {
  const { numberId, contacts, groups, clearAll } = req.body
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  if (clearAll) {
    await supabase.rpc('delete_contacts_by_numberid', { p_numberid: numberId })
  }

  // Limpia los objetos para que solo tengan los campos válidos
  const toInsert = [
    ...(contacts || []).map((c: Contact) => ({
      numberId: Number(numberId),
      type: 'contact',
      wa_id: c.id,
      name: c.name,
      agenteHabilitado: true
    })),
    ...(groups || []).map((g: Group) => ({
      numberId: Number(numberId),
      type: 'group',
      wa_id: g.id,
      name: g.name,
      agenteHabilitado: true
    }))
  ]

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('SyncedContactOrGroup')
      .insert(toInsert)
    if (error) {
      console.error('SUPABASE INSERT ERROR:', error)
      res
        .status(500)
        .json({ message: 'Error insertando en la base de datos', error })
      return
    }
    // ELIMINAR de Unsyncedcontact los que acaban de sincronizarse
    for (const item of toInsert) {
      await supabase
        .from('Unsyncedcontact')
        .delete()
        .eq('numberid', item.numberId)
        .eq('wa_id', item.wa_id)
    }
  }

  res.status(200).json({ message: 'Sincronización guardada en base de datos' })
  return
}

export async function getSyncedContacts(req: Request, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  const { data, error } = await supabase
    .from('SyncedContactOrGroup')
    .select('*')
    .eq('numberId', Number(numberId))

  if (error) {
    res.status(500).json({ message: 'Error obteniendo datos' })
    return
  }

  res.status(200).json(data)
  return
}

export async function deleteSynced(req: Request, res: Response) {
  const { id } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }
  const { error } = await supabase
    .from('SyncedContactOrGroup')
    .delete()
    .eq('id', id)
  if (error) {
    res.status(500).json({ message: 'Error eliminando', error })
    return
  }
  res.status(200).json({ message: 'Eliminado correctamente' })
}

export async function updateAgenteHabilitado(req: Request, res: Response) {
  const { id, agenteHabilitado } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }

  const { error } = await supabase
    .from('SyncedContactOrGroup')
    .update({ agenteHabilitado })
    .eq('id', id)

  if (error) {
    res.status(500).json({ message: 'Error actualizando' })
    return
  }
  res.status(200).json({ message: 'Actualizado correctamente' })
  return
}

export async function bulkUpdateAgenteHabilitado(req: Request, res: Response) {
  const { updates } = req.body // [{id, agenteHabilitado}]
  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ message: 'Missing or empty updates array' })
    return
  }
  try {
    // Verifica si todos los valores son iguales (todo true o todo false)
    const allSame = updates.every(
      (u) => u.agenteHabilitado === updates[0].agenteHabilitado
    )
    const ids = updates.map((u) => u.id)
    const value = updates[0].agenteHabilitado
    if (allSame) {
      // Update en lotes de 100
      const batchSize = 100
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize)
        const { error } = await supabase
          .from('SyncedContactOrGroup')
          .update({ agenteHabilitado: value })
          .in('id', batch)
        if (error) {
          res.status(500).json({ message: 'Error actualizando', error })
          return
        }
      }
      res.status(200).json({ success: true })
      return
    } else {
      // Mezcla de true/false: actualiza uno por uno
      const results = []
      for (const upd of updates) {
        if (!upd.id) {
          results.push({ id: upd.id, success: false, error: 'Missing id' })
          continue
        }
        const { error } = await supabase
          .from('SyncedContactOrGroup')
          .update({ agenteHabilitado: upd.agenteHabilitado })
          .eq('id', upd.id)
        if (error) {
          results.push({ id: upd.id, success: false, error })
        } else {
          results.push({ id: upd.id, success: true })
        }
      }
      res.status(200).json({ results })
      return
    }
  } catch (err) {
    console.error('Bulk update error:', err)
    res.status(500).json({ error: 'Error actualizando agentes' })
  }
}
