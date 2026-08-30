import type { Response } from 'express'
import { supabase } from '../config/db.js'
import { query } from '../lib/db.js'
import type {
  AddWhatsAppNumber,
  CustomRequest,
  ToggleAIBody
} from '../interfaces/global.js'
import { HttpStatusCode } from 'axios'
import { clients } from '../WhatsAppClients.js'
import { exigirNumeroPropio, exigirUsuario } from '../lib/propiedad.js'
import { comparablePorTelefono } from '../lib/telefono.js'
import { borrarPerfilDeSesion } from '../lib/perfilChromium.js'
import { olvidarQR } from './whatsapp/session.controller.js'

export async function toggleAI(req: CustomRequest, res: Response) {
  const { number, enabled } = req.body as ToggleAIBody
  try {
    // Buscaba el número SOLO por su teléfono, sin mirar de quién es: mandar el
    // número de otro cliente le apagaba (o encendía) la IA a él. Ahora el
    // "userId" va dentro de la misma consulta, así que no hay forma de resolver
    // un número que no sea del usuario del token.
    const num = await exigirNumeroPropio(req, res, { number })
    if (!num) return

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

export async function toggleResponseGroups(req: CustomRequest, res: Response) {
  const { number, enabled } = req.body as ToggleAIBody
  try {
    const num = await exigirNumeroPropio(req, res, { number })
    if (!num) return

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

/**
 * CREAR O REUTILIZAR: la misma línea, no una nueva cada vez.
 *
 * EL SÍNTOMA: el numberId del usuario fue 2, 4, 5, 7, 8, 9, 10 en una sola
 * sesión, siempre con el mismo teléfono, mientras en la barra lateral él veía
 * UNA sola línea. Cada línea nueva estrena su propia carpeta de sesión
 * (`LocalAuth({ clientId: numberId })` deriva el perfil del id) y su propio
 * Chromium; los anteriores quedan huérfanos con el navegador muerto. Eso es lo
 * que llenaba el contenedor y lo que dejaba, en el volumen, los cerrojos que
 * después impiden arrancar cualquier navegador.
 *
 * TRES COSAS ROMPÍAN, Y LAS TRES SE ARREGLAN AQUÍ:
 *
 * 1. El guardia comparaba el TEXTO CRUDO (`.eq('number', number)`), así que
 *    "3203813929" y "+573203813929" pasaban como teléfonos distintos.
 * 2. Era un mira-luego-inserta sin transacción: dos peticiones a la vez (el
 *    botón no tenía guarda de doble clic) pasaban las dos el chequeo, y la
 *    segunda reventaba con un 23505 que el código no miraba —accedía a
 *    `newNumber.id` sobre null— y salía como un 500 opaco. Eso QUEMA un valor
 *    del serial: los huecos 3 y 6.
 * 3. Devolver 409 obligaba al operador a inventarse un número distinto para
 *    poder reconectar. Ahora, si la línea ya es suya, se le devuelve LA MISMA
 *    con un 200 y el front sigue su camino normal (solo mira `res.ok` y
 *    `numberId`).
 *
 * Nota sobre el 409 que queda: `number` es UNIQUE a nivel de TODA la tabla
 * (schema.sql:101), así que si el teléfono ya está registrado por OTRA cuenta no
 * hay nada que reutilizar. Se mantiene el mensaje de antes.
 */
export async function addWhatsAppNumber(req: CustomRequest, res: Response) {
  try {
    const { number, name } = req.body as AddWhatsAppNumber
    const usuario = await exigirUsuario(req, res)
    if (!usuario) return

    const telefono = String(number ?? '').trim()
    if (!telefono) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el número de WhatsApp' })
      return
    }

    // ¿Ya tiene una línea con ese teléfono? La comparación es por dígitos, no
    // por el texto tal cual: es lo que impide que el mismo número entre otra vez
    // solo por venir escrito de otra forma.
    const buscado = comparablePorTelefono(telefono)
    const { rows: suyos } = await query<{ id: number; number: string }>(
      'SELECT id, number FROM app."WhatsAppNumber" WHERE "userId" = $1',
      [usuario.id]
    )
    const yaExiste = suyos.find(
      (fila) => comparablePorTelefono(fila.number) === buscado
    )
    if (yaExiste) {
      console.info(
        `↩️ ${usuario.username} pidió añadir ${telefono} y ya lo tiene como línea ${yaExiste.id}: se reutiliza en vez de crear otra.`
      )
      res.status(HttpStatusCode.Ok).json({
        message: 'Esta línea ya estaba: se reutiliza',
        numberId: yaExiste.id,
        reutilizado: true
      })
      return
    }

    try {
      const { rows } = await query<{ id: number }>(
        `INSERT INTO app."WhatsAppNumber" (number, name, "userId")
         VALUES ($1, $2, $3)
         RETURNING id`,
        [telefono, name ?? null, usuario.id]
      )
      const creado = rows[0]
      if (!creado) throw new Error('el INSERT no devolvió el id')
      res
        .status(HttpStatusCode.Created)
        .json({ message: 'Número creado', numberId: creado.id })
    } catch (error) {
      // 23505 = unique_violation. Aquí solo puede venir del UNIQUE global de
      // `number`, y significa una de dos: o dos peticiones nuestras corrieron a
      // la vez (doble clic) y la otra ya creó la fila, o el teléfono es de otra
      // cuenta. Se distingue releyendo, en vez de contestar 500 como antes.
      const codigo = (error as { code?: string })?.code
      if (codigo !== '23505') throw error

      const { rows } = await query<{ id: number; userId: number }>(
        'SELECT id, "userId" FROM app."WhatsAppNumber" WHERE number = $1',
        [telefono]
      )
      const fila = rows[0]
      if (fila && Number(fila.userId) === usuario.id) {
        res.status(HttpStatusCode.Ok).json({
          message: 'Esta línea ya estaba: se reutiliza',
          numberId: fila.id,
          reutilizado: true
        })
        return
      }
      res.status(HttpStatusCode.Conflict).json({ message: 'Número ya existe' })
    }
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

export async function deleteWhatsAppNumer(req: CustomRequest, res: Response) {
  // @types/express-serve-static-core 5.1+ tipa req.params como string | string[],
  // y `clients` se indexa por string. En una ruta con :numberId nunca llega un
  // array, así que normalizar aquí es equivalente y deja el build en verde.
  const numberId = String(req.params['numberId'] ?? '')
  try {
    if (!numberId) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Número no encontrado' })
      return
    }

    // EL PEOR DE LOS CINCO. Este endpoint borra el número y, por el
    // ON DELETE CASCADE de app."SyncedContactOrGroup" y app."Unsyncedcontact",
    // se lleva por delante TODA la agenda de contactos de ese número. Sin
    // comprobar el dueño, cualquier cuenta registrada podía destruir los datos de
    // otro cliente con un DELETE a /api/user/delete-number/1. No hay vuelta atrás.
    const num = await exigirNumeroPropio(req, res, { id: numberId })
    if (!num) return

    // Eliminar todos los sincronizados (contactos y grupos)
    await supabase
      .from('SyncedContactOrGroup')
      .delete()
      .eq('numberId', Number(numberId));

    // Eliminar todos los no sincronizados
    await supabase
      .from('Unsyncedcontact')
      .delete()
      .eq('numberid', Number(numberId));

    // Handle WhatsApp client cleanup
    // req.params en Express 5 puede tipar el valor como string | string[]; el mapa se indexa por string.
    const clientKey = String(numberId)
    // El QR guardado para reenviarlo a quien entre a la sala se queda huérfano si
    // el número desaparece: aquí no se dispara 'disconnected' (se le quitan los
    // listeners antes de destruirlo), así que hay que soltarlo a mano.
    olvidarQR(clientKey)
    if (clients[clientKey]) {
      const client = clients[clientKey];
      try {
        if (client.removeAllListeners) {
          try { client.removeAllListeners(); } catch (err) { console.warn('removeAllListeners failed', err); }
        }
        if (client.pupPage && typeof client.pupPage.isClosed === 'function' && !client.pupPage.isClosed()) {
          try { await client.pupPage.close(); } catch (err) { console.warn('pupPage close failed', err); }
        }
        if (client.pupBrowser && typeof client.pupBrowser.isConnected === 'function' && client.pupBrowser.isConnected()) {
          try { await client.pupBrowser.close(); } catch (err) { console.warn('pupBrowser close failed', err); }
        }
        if (typeof client.destroy === 'function') {
          try { await client.destroy(); } catch (err) { console.warn('destroy failed', err); }
        }
      } catch (err) {
        console.warn('Error cleaning up WhatsApp client:', err);
      }
      delete clients[clientKey];
    }

    const { error: deleteError } = await supabase
      .from('WhatsAppNumber')
      .delete()
      .eq('id', Number(numberId))

    if (deleteError) {
      throw deleteError
    }

    // LA CARPETA DE SESIÓN TAMBIÉN SE VA. Nada en todo el repositorio borraba
    // nunca `/app/.wwebjs_auth/session-<id>`, así que cada id eliminado dejaba un
    // perfil de Chromium permanente en el volumen —1,5 GB ya ocupados— y, con él,
    // su SingletonLock. Ese cerrojo rancio es lo que después impide arrancar
    // cualquier navegador ("the profile appears to be in use ... on another
    // computer") y deja la línea con `pupPage` null, que es el chat vacío.
    //
    // Va DESPUÉS del DELETE y solo del id que se acaba de borrar: sin fila que
    // apunte a esa sesión, el perfil no le sirve ya a nadie.
    borrarPerfilDeSesion(clientKey)

    res.status(HttpStatusCode.Ok).json({ message: 'Número eliminado' })
  } catch {
    res.status(HttpStatusCode.InternalServerError).json({ message: 'Error eliminando número de WhatsApp' })
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

    // Antes: .or(`isGlobal.eq.true,ownerId.eq.${user.id}`) — DSL de PostgREST.
    // Los agentes visibles para un usuario son los globales más los suyos.
    const agentsResult = await query(
      `SELECT * FROM app."Agent" WHERE "isGlobal" = true OR "ownerId" = $1`,
      [user.id]
    )

    res.status(HttpStatusCode.Ok).json(agentsResult.rows)
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({
        message: `Error obteniendo agentes: ${(error as Error).message}`
      })
  }
}

export async function addAgent(req: CustomRequest, res: Response) {
  const { title, prompt, allowAdvisor, advisorEmail } = req.body as { title: string; prompt: string; allowAdvisor?: boolean; advisorEmail?: string | null };
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
      isGlobal: false,
      allowAdvisor: allowAdvisor ?? false,
      advisorEmail: allowAdvisor ? advisorEmail : null
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
  const { title, prompt, allowAdvisor, advisorEmail } = req.body as { title: string; prompt: string; allowAdvisor?: boolean; advisorEmail?: string | null };
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
        prompt: prompt ? prompt : agent.prompt,
        allowAdvisor: typeof allowAdvisor === 'boolean' ? allowAdvisor : false,
        advisorEmail: allowAdvisor ? advisorEmail : null
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

export async function updateAgentNumber(req: CustomRequest, res: Response) {
  const { numberId } = req.params
  const { aiPrompt } = req.body as { aiPrompt: string }
  try {
    // El prompt es LO QUE EL BOT LE DICE A LOS CLIENTES DE ESA EMPRESA.
    // Reescribírselo a otro es poder hacer hablar a su bot como uno quiera; con
    // ids seriales, probar del 1 en adelante bastaba.
    const num = await exigirNumeroPropio(req, res, { id: numberId as string })
    if (!num) return

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

export async function toggleUnknownAi(req: CustomRequest, res: Response) {
  const { number, enabled } = req.body as { number: string; enabled: boolean };
  try {
    const num = await exigirNumeroPropio(req, res, { number });
    if (!num) return;

    await supabase
      .from('WhatsAppNumber')
      .update({ aiUnknownEnabled: enabled })
      .eq('id', num.id);
    res.status(HttpStatusCode.Ok).json({ message: 'Número actualizado' });
  } catch {
    res.status(HttpStatusCode.InternalServerError).json({ message: 'Error actualizando IA para no agregados' });
  }
}
