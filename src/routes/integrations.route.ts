/**
 * PUENTE SERVER-TO-SERVER: otros sistemas mandan WhatsApp por una línea del bot.
 *
 *   POST /api/integrations/send
 *   Authorization: Bearer <INTEGRATION_TOKEN>   (token estático, variable de entorno)
 *   { "numberId": "...", "to": "573001234567", "message": "texto" }
 *
 * ⚠️ EL CONTRATO ES FIJO: hay sistemas externos ya desplegados llamándolo
 * (la máquina de Piebald, entre otros). Cambiar nombres de campos, la forma del
 * Bearer o la semántica de los códigos de respuesta ROMPE integraciones ajenas
 * sin previo aviso. Ampliar con campos opcionales, sí; renombrar o quitar, no.
 *
 * POR QUÉ NO REUSA sendMessage (messages.controller.ts) TAL CUAL:
 * ese controlador es el envío MANUAL de un usuario del panel y hace tres cosas
 * que aquí no aplican: resuelve al dueño desde el token JWT de sesión, RESERVA
 * cupo del plan (increment_message_usage — esto se factura) y valida el chat
 * contra las tablas de sincronización. Este puente es tráfico interno de
 * notificación: no hay usuario de sesión, y NO debe descontar cupo. Lo que sí
 * se comparte es el camino de verdad importante —la sesión viva de
 * whatsapp-web.js— vía clienteVivo() + client.sendMessage(), que es exactamente
 * lo que usa el envío manual por debajo. No se duplica lógica de cliente.
 *
 * POR QUÉ NO DISPARA LA IA: el auto-responder cuelga de client.on('message')
 * (session.controller.ts:150), que solo se emite con mensajes ENTRANTES de
 * otros. Un sendMessage saliente no pasa por ahí, así que no hace falta ningún
 * flag para saltárselo.
 */
import { Router } from 'express'
import type { Response } from 'express'
import crypto from 'node:crypto'
import { supabase } from '../config/db.js'
import type { CustomRequest } from '../interfaces/global.js'
import { clienteVivo } from '../WhatsAppClients.js'

const router = Router()

/**
 * Comparación en tiempo constante. Se comparan los SHA-256 de los dos tokens y
 * no los tokens crudos porque timingSafeEqual LANZA si los buffers miden
 * distinto — y cortar por longitud con un if filtraría el largo del token real
 * por el tiempo de respuesta. Los hashes miden siempre 32 bytes, así que la
 * comparación nunca lanza y no filtra nada.
 */
function tokenValido(recibido: string, esperado: string): boolean {
  const a = crypto.createHash('sha256').update(recibido, 'utf8').digest()
  const b = crypto.createHash('sha256').update(esperado, 'utf8').digest()
  return crypto.timingSafeEqual(a, b)
}

router.post('/send', async (req: CustomRequest, res: Response) => {
  try {
    const esperado = process.env.INTEGRATION_TOKEN
    if (!esperado) {
      // Sin la variable el puente está APAGADO. Se dice claro y con 503 (no
      // 401): quien llama tiene que distinguir "configura el servidor" de
      // "tu token está mal", que se arreglan en sitios distintos.
      res.status(503).json({
        message:
          'El puente de integraciones está apagado: falta INTEGRATION_TOKEN en el entorno del API'
      })
      return
    }

    const cabecera = req.headers.authorization ?? ''
    const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : ''
    if (!recibido || !tokenValido(recibido, esperado)) {
      // Sin detalles a propósito: a un token inválido no se le cuenta nada.
      res.status(401).json({ message: 'No autorizado' })
      return
    }

    const { numberId, to, message } = (req.body ?? {}) as {
      numberId?: string | number
      to?: string
      message?: string
    }

    const idNumero = Number(numberId)
    if (!Number.isInteger(idNumero)) {
      res.status(400).json({ message: 'numberId debe ser el id de una línea de WhatsApp' })
      return
    }
    // Solo dígitos con prefijo de país, sin '+': es el contrato publicado, y es
    // lo que se convierte directo al chatId clásico <digitos>@c.us.
    if (typeof to !== 'string' || !/^[0-9]{8,15}$/.test(to)) {
      res.status(400).json({
        message: 'to debe ser el número destino con prefijo de país, solo dígitos (8-15)'
      })
      return
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ message: 'message no puede estar vacío' })
      return
    }
    if (message.length > 4096) {
      res.status(400).json({ message: 'message supera el tope de 4096 caracteres' })
      return
    }

    // La línea tiene que EXISTIR (404) antes de mirar si está conectada (409):
    // son averías distintas — un numberId equivocado no se arregla reconectando.
    const { data: numero } = await supabase
      .from('WhatsAppNumber')
      .select('id')
      .eq('id', idNumero)
      .single()
    if (!numero) {
      res.status(404).json({ message: 'No existe una línea de WhatsApp con ese numberId' })
      return
    }

    // El mismo acceso a la sesión viva que usa el envío manual: clienteVivo
    // descarta las entradas sin navegador en vez de reventar con ellas.
    const client = clienteVivo(idNumero)
    if (!client) {
      res.status(409).json({ message: 'la línea no está conectada' })
      return
    }

    const chatId = `${to}@c.us`
    // sendSeen es cosmético (marca el chat como leído, igual que hace el envío
    // manual); si falla —por ejemplo con un chat que aún no existe— no puede
    // llevarse por delante la notificación, que es lo único que importa aquí.
    await Promise.resolve(client.sendSeen(chatId)).catch(() => {})
    // El texto viaja tal cual: los *negritas* y \n son formato de WhatsApp y los
    // interpreta el teléfono, no este servidor.
    await client.sendMessage(chatId, message)

    console.log(`[integrations] enviado · línea ${idNumero} · a ${to} · ${message.length} caracteres`)
    res.status(200).json({ ok: true, message: 'Mensaje enviado' })
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    console.error('[integrations] fallo enviando:', detalle)
    res.status(500).json({ message: `No se pudo enviar el mensaje: ${detalle}` })
  }
})

export default router
