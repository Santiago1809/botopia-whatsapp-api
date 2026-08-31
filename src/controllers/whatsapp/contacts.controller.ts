// Maneja todo lo relacionado con contactos y grupos
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import { supabase } from '../../config/db.js'
import { clienteVivo } from '../../WhatsAppClients.js'
import type { CustomRequest } from '../../interfaces/global.js'
import {
  exigirNumeroPropio,
  exigirUsuario,
  sincronizadosDelUsuario
} from '../../lib/propiedad.js'
import type { Contact, Group } from '../../types/global.js'

/**
 * TODO ESTE ARCHIVO FILTRABA POR `numberId` O POR `id` A SECAS.
 *
 * Con ids seriales, eso significa que cualquier cuenta registrada podía listar,
 * modificar y borrar los contactos de otra probando números del 1 en adelante.
 * `syncContactsToDB` con `clearAll: true` era además destructivo: borraba la
 * agenda entera del número indicado antes de escribir la nueva.
 *
 * La forma de comprobarlo es la misma en los siete endpoints y vive en
 * lib/propiedad.ts. Aquí solo se llama.
 */

// Estructura en memoria para sincronizados por sesión
const syncedContactsMemory: {
  [numberId: string]: { contacts: string[]; groups: string[] }
} = {}

export async function getContacts(req: CustomRequest, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  // Lee la agenda de WhatsApp desde la sesión abierta: sin esta comprobación era
  // la libreta de contactos de otra empresa, nombres y teléfonos incluidos.
  if (!(await exigirNumeroPropio(req, res, { id: numberId as string }))) return

  // `clienteVivo` y no `clients[...]`: una entrada del mapa puede ser un cliente
  // cuyo navegador nunca arrancó (`pupPage` null, Client.js:103). Leerlo en crudo
  // hacía que `getContacts()` muriera con "Cannot read properties of null
  // (reading 'evaluate')" en vez de decir que la línea no está conectada.
  const client = clienteVivo(numberId as string)
  if (!client) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'WhatsApp client not found for this numberId' })
    return
  }
  try {
    const contacts = await client.getContacts()
    const contactList = contacts.map((contact: { id: { _serialized: string }; name?: string; pushname?: string; number?: string; isGroup: boolean; isMyContact: boolean }) => ({
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

export async function syncContacts(req: CustomRequest, res: Response) {
  const { numberId, contacts, groups } = req.body
  if (!numberId) {
    res.status(HttpStatusCode.BadRequest).json({ message: 'Missing numberId' })
    return
  }
  if (!(await exigirNumeroPropio(req, res, { id: numberId }))) return

  // Guardar en memoria
  syncedContactsMemory[numberId] = {
    contacts: contacts || [],
    groups: groups || []
  }
  res.status(HttpStatusCode.Ok).json({ message: 'Contacts and groups synced!' })
}

export async function syncContactsToDB(req: CustomRequest, res: Response) {
  const { numberId, contacts, groups, clearAll } = req.body
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  // `clearAll` BORRA la agenda del número antes de reescribirla. Con el numberId
  // de otro cliente, era un botón de "vaciar los contactos de esa empresa".
  if (!(await exigirNumeroPropio(req, res, { id: numberId }))) return

  if (clearAll) {
    await supabase.rpc('delete_contacts_by_numberid', { p_numberid: numberId })
  }

  // Limpia los objetos para que solo tengan los campos válidos
  const toInsert = [
    ...(contacts || []).map((c: Contact) => ({
      numberId: Number(numberId),
      type: 'contact',
      wa_id: c.id,
      name: c.name
    })),
    ...(groups || []).map((g: Group) => ({
      numberId: Number(numberId),
      type: 'group',
      wa_id: g.id,
      name: g.name
    }))
  ]

  if (toInsert.length > 0) {
    // upsert y no insert. La tabla tiene UNIQUE (numberId, wa_id, type), así que
    // un INSERT pelado hacía que la SEGUNDA sincronización sin clearAll fallara
    // entera con 500 "Error insertando en la base de datos": bastaba con volver a
    // sincronizar para que nada se guardara. Con ON CONFLICT, volver a sincronizar
    // actualiza el nombre y deja el resto como estaba.
    //
    // agenteHabilitado NO va en el objeto a propósito, por lo mismo que en
    // messages.controller: si fuera, el DO UPDATE SET lo devolvería a true en cada
    // resincronización y desharía los interruptores que el usuario ya movió. En
    // una fila nueva toma su DEFAULT (true).
    const { error } = await supabase
      .from('SyncedContactOrGroup')
      .upsert(toInsert, { onConflict: 'numberId,wa_id,type' })
    if (error) {
      console.error('SUPABASE UPSERT ERROR:', error)
      res
        .status(500)
        .json({ message: 'Error insertando en la base de datos', error })
      return
    }

    // ELIMINAR de Unsyncedcontact los que acaban de sincronizarse.
    // Antes esto era UNA consulta por contacto dentro de un for: 3.000 contactos
    // eran 3.000 idas y vueltas a la base con la petición HTTP abierta. Ahora va
    // en un solo DELETE por número, con la lista de wa_id de una vez.
    const porNumero = new Map<number, string[]>()
    for (const item of toInsert) {
      const lista = porNumero.get(item.numberId) ?? []
      lista.push(item.wa_id)
      porNumero.set(item.numberId, lista)
    }
    for (const [numId, waIds] of porNumero) {
      // En lotes: una lista de miles de parámetros en un solo IN también es un
      // problema, y 1.000 es un tamaño que Postgres maneja sin despeinarse.
      for (let i = 0; i < waIds.length; i += 1000) {
        const lote = waIds.slice(i, i + 1000)
        const { error: delError } = await supabase
          .from('Unsyncedcontact')
          .delete()
          .eq('numberid', numId)
          .in('wa_id', lote)
        if (delError) {
          // No es motivo para fallar la sincronización: los contactos ya quedaron
          // guardados. Solo queda algún duplicado en la lista de no sincronizados.
          console.error('Error limpiando Unsyncedcontact:', delError)
        }
      }
    }
  }

  res.status(200).json({ message: 'Sincronización guardada en base de datos' })
  return
}

export async function getSyncedContacts(req: CustomRequest, res: Response) {
  const { numberId } = req.query
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }
  if (!(await exigirNumeroPropio(req, res, { id: numberId as string }))) return

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

export async function deleteSynced(req: CustomRequest, res: Response) {
  const { id } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }

  // El id es de SyncedContactOrGroup, que no lleva userId: el dueño se resuelve
  // subiendo por numberId hasta WhatsAppNumber. Lo hace sincronizadosDelUsuario
  // en UNA consulta con el JOIN, sin traerse la fila primero.
  const usuario = await exigirUsuario(req, res)
  if (!usuario) return
  const propios = await sincronizadosDelUsuario(usuario.id, [id])
  if (!propios.has(Number(id))) {
    res.status(404).json({ message: 'Contacto no encontrado' })
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

export async function updateAgenteHabilitado(req: CustomRequest, res: Response) {
  const { id, agenteHabilitado } = req.body
  if (!id) {
    res.status(400).json({ message: 'Missing id' })
    return
  }

  const usuario = await exigirUsuario(req, res)
  if (!usuario) return
  const propios = await sincronizadosDelUsuario(usuario.id, [id])
  if (!propios.has(Number(id))) {
    res.status(404).json({ message: 'Contacto no encontrado' })
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

export async function bulkUpdateAgenteHabilitado(req: CustomRequest, res: Response) {
  const { updates } = req.body // [{id, agenteHabilitado}]
  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ message: 'Missing or empty updates array' })
    return
  }
  try {
    // Este endpoint recibe CIENTOS de ids de una vez. Se resuelven todos con UNA
    // consulta y se descartan los ajenos, en vez de comprobarlos de uno en uno
    // (eso volvería a meter aquí el N+1 que ya se quitó de la sincronización).
    //
    // Los ajenos se ignoran en silencio y se informa cuántos en la respuesta:
    // fallar entero por un id ajeno le diría a quien lo probó que existe.
    const usuario = await exigirUsuario(req, res)
    if (!usuario) return

    const propios = await sincronizadosDelUsuario(
      usuario.id,
      updates.map((u) => u.id)
    )
    const permitidos = updates.filter((u) => propios.has(Number(u.id)))
    const descartados = updates.length - permitidos.length
    if (descartados > 0) {
      console.warn(
        `⛔ ${usuario.username} mandó ${descartados} contacto(s) que no son de sus números en bulk-update-agente-habilitado.`
      )
    }
    if (permitidos.length === 0) {
      res.status(200).json({ success: true, updated: 0, ignored: descartados })
      return
    }
    // A partir de aquí se trabaja SOLO con `permitidos`. Se usa una constante
    // nueva en vez de reescribir `updates` para que no quede ninguna línea que
    // pueda volver a leer la lista original sin filtrar.
    const allSame = permitidos.every(
      (u) => u.agenteHabilitado === permitidos[0].agenteHabilitado
    )
    const ids = permitidos.map((u) => u.id)
    const value = permitidos[0].agenteHabilitado
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
      res.status(200).json({ success: true, updated: ids.length, ignored: descartados })
      return
    } else {
      // Mezcla de true/false: actualiza uno por uno
      const results = []
      for (const upd of permitidos) {
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
      res.status(200).json({ results, ignored: descartados })
      return
    }
  } catch (err) {
    console.error('Bulk update error:', err)
    res.status(500).json({ error: 'Error actualizando agentes' })
  }
}

/**
 * GET /api/whatsapp/fotos?numberId=N&ids=a@c.us,b@g.us
 *
 * Devuelve la foto de perfil de varios chats de una sola vez: { "a@c.us": "https://..." }.
 *
 * Va por aquí y no por la tabla porque `SyncedContactOrGroup` no guarda la foto, y añadir
 * una columna significaría además mantenerla al día: la gente cambia su foto y los enlaces
 * que da WhatsApp caducan. Pedirlas en el momento siempre da la actual.
 *
 * Se piden en paralelo, se ignoran las que fallen —mucha gente restringe su foto a sus
 * contactos, y eso no es un error— y se limita el lote para no lanzar cien llamadas al
 * navegador de golpe.
 */
export async function fotosDeChats(req: CustomRequest, res: Response) {
  try {
    const numberId = String(req.query?.numberId ?? '')
    const idsCrudos = String(req.query?.ids ?? '')
    if (!numberId || !idsCrudos) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Faltan numberId o ids' })
      return
    }

    const numero = await exigirNumeroPropio(req, res, { id: numberId })
    if (!numero) return

    const ids = idsCrudos
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.includes('@'))
      .slice(0, 60)

    // `clienteVivo` y no `clients[...]`: comprueba que el navegador exista de verdad y
    // retira del mapa al que esté muerto, en vez de reventar al usarlo.
    const cliente = clienteVivo(numberId)
    if (!cliente) {
      // Sin navegador vivo no hay fotos que pedir. No es un error: la pantalla se
      // queda con las iniciales, que es exactamente lo que hace WhatsApp.
      res.json({})
      return
    }

    const fotos: Record<string, string> = {}
    await Promise.all(
      ids.map(async (id) => {
        try {
          const url = await cliente.getProfilePicUrl(id)
          if (url) fotos[id] = url
        } catch {
          /* sin foto pública */
        }
      })
    )

    res.json(fotos)
  } catch (error) {
    console.error('❌ Error obteniendo fotos de perfil:', error)
    res.status(HttpStatusCode.InternalServerError).json({ message: 'Error obteniendo fotos' })
  }
}
