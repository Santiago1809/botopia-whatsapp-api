// Identidad de la LÍNEA (el propio número de WhatsApp) y vinculación por código.
//
// Todo lo que hay aquí opera sobre el perfil PROPIO de la sesión —nombre público,
// "about", foto— y sobre el flujo de emparejamiento. No toca chats ni contactos,
// así que no cruza ningún id con las tablas de contactos: el único wid que se usa
// es el de la propia línea (client.info.wid), que no necesita la resolución @lid
// de los mensajes. Tampoco envía mensajes: por eso ningún endpoint de este
// archivo pasa por increment_message_usage.
import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import whatsappWeb from 'whatsapp-web.js'
import type { Client, ClientInfo } from 'whatsapp-web.js'
import type { CustomRequest } from '../../interfaces/global.js'
import { exigirNumeroPropio, type NumeroPropio } from '../../lib/propiedad.js'
import { clienteVivo } from '../../WhatsAppClients.js'

// La librería es CommonJS: los valores de runtime se sacan del import por
// defecto, igual que hace session.controller con Client y LocalAuth.
const { MessageMedia } = whatsappWeb

/** Límites que impone WhatsApp, no este API: más largo se rechaza allá igual. */
const TOPE_NOMBRE = 25
const TOPE_ESTADO = 139

/**
 * Tope de la foto sobre la dataURL ya codificada (base64 infla ~33%). El front
 * comprime con canvas a menos de 200KB antes de mandar; esto es la red de
 * seguridad para quien llame al API directo con un archivo sin comprimir.
 */
const TOPE_FOTO_DATAURL = 1024 * 1024

/**
 * Cuánto se espera el código de emparejamiento antes de rendirse. El método de
 * la librería espera EN BUCLE a que el módulo de vinculación exista dentro del
 * navegador: si la página no está en la pantalla de vincular, no termina nunca,
 * y una petición HTTP colgada para siempre es peor que un 504 con explicación.
 */
const PLAZO_CODIGO_MS = 20_000

/**
 * `client.info` está tipado como siempre presente pero en runtime es undefined
 * hasta el evento 'ready' (la librería lo asigna al autenticar). Ese hueco es
 * exactamente lo que estos endpoints necesitan distinguir, así que se lee con
 * el tipo honesto.
 */
function infoDeCliente(client: Client): ClientInfo | undefined {
  return client.info as ClientInfo | undefined
}

/**
 * Resuelve línea + sesión CONECTADA, o contesta y devuelve null.
 *
 * Las cuatro operaciones de perfil necesitan lo mismo: que el número sea del
 * usuario del token (exigirNumeroPropio: 401/404) y que la sesión esté de
 * verdad lista. "Lista" son DOS comprobaciones, no una:
 *
 *   · `clienteVivo` — hay navegador. Un cliente sin navegador está en el mapa
 *     igual que uno bueno y usarlo revienta con el "reading 'evaluate'" de null.
 *   · `client.info` — ya pasó 'ready'. Entre el QR y el escaneo hay navegador
 *     pero no sesión, y `setProfilePicture`/`deleteProfilePicture` leen
 *     `this.info.wid` por dentro: sin esta guarda, ese hueco era un 500 opaco
 *     en vez de un 409 que explica qué falta.
 */
async function lineaConectada(
  req: CustomRequest,
  res: Response
): Promise<{ numero: NumeroPropio; client: Client; info: ClientInfo } | null> {
  // En Express 5 un parámetro de ruta viene tipado como string | string[]:
  // se aplana a texto y la validación numérica la hace exigirNumeroPropio.
  const numero = await exigirNumeroPropio(req, res, {
    id: String(req.params.numberId ?? '')
  })
  if (!numero) return null

  const client = clienteVivo(numero.id)
  if (!client) {
    res.status(HttpStatusCode.Conflict).json({
      message:
        'La línea no está conectada: no hay sesión de WhatsApp activa para este número.'
    })
    return null
  }

  const info = infoDeCliente(client)
  if (!info?.wid?._serialized) {
    res.status(HttpStatusCode.Conflict).json({
      message:
        'La línea todavía no terminó de vincularse: escanea el QR (o usa el código) y vuelve a intentarlo.'
    })
    return null
  }

  return { numero, client, info }
}

/**
 * GET /api/profile/:numberId — el perfil de la propia línea.
 *
 * El "about" y la foto salen de llamadas al navegador que pueden fallar sin que
 * sea un error de la petición (el store a medio cargar, la privacidad): en ese
 * caso van como null y el front pinta el hueco, en vez de tumbar toda la ficha
 * por el dato que faltó.
 */
export async function obtenerPerfilLinea(req: CustomRequest, res: Response) {
  try {
    const listo = await lineaConectada(req, res)
    if (!listo) return
    const { numero, client, info } = listo
    const wid = info.wid._serialized

    let about: string | null = null
    try {
      const contacto = await client.getContactById(wid)
      about = await contacto.getAbout()
    } catch {
      /* sin about legible: se entrega null y el front deja el campo vacío */
    }

    let photoUrl: string | null = null
    try {
      photoUrl = (await client.getProfilePicUrl(wid)) ?? null
    } catch {
      /* sin foto (o no legible): null, el front pinta iniciales */
    }

    res.status(HttpStatusCode.Ok).json({
      numberId: numero.id,
      wid,
      // pushname es el nombre público que la línea muestra; puede venir vacío
      // en una cuenta recién vinculada.
      name: info.pushname ?? '',
      about,
      photoUrl
    })
  } catch (error) {
    console.error('❌ Error leyendo el perfil de la línea:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo leer el perfil de la línea' })
  }
}

/** PATCH /api/profile/:numberId/name — nombre público (pushname), ≤25 chars. */
export async function cambiarNombreLinea(req: CustomRequest, res: Response) {
  try {
    const bruto = (req.body as { name?: unknown })?.name
    if (typeof bruto !== 'string' || bruto.trim().length === 0) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el nombre (texto no vacío)' })
      return
    }
    const nombre = bruto.trim()
    if (nombre.length > TOPE_NOMBRE) {
      res.status(HttpStatusCode.BadRequest).json({
        message: `El nombre supera los ${TOPE_NOMBRE} caracteres que permite WhatsApp`
      })
      return
    }

    const listo = await lineaConectada(req, res)
    if (!listo) return

    // Devuelve false cuando WhatsApp no deja tocar el pushname en este momento
    // (canSetMyPushname). No es un fallo del servidor ni de la petición: se
    // contesta 409 con el motivo para que el usuario no reintente a ciegas.
    const acepto = await listo.client.setDisplayName(nombre)
    if (!acepto) {
      res.status(HttpStatusCode.Conflict).json({
        message:
          'WhatsApp no permitió cambiar el nombre en este momento. Inténtalo de nuevo en unos minutos.'
      })
      return
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Nombre actualizado', name: nombre })
  } catch (error) {
    console.error('❌ Error cambiando el nombre de la línea:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo cambiar el nombre de la línea' })
  }
}

/** PATCH /api/profile/:numberId/status — el "about"/info, ≤139 chars. Vacío lo limpia. */
export async function cambiarEstadoLinea(req: CustomRequest, res: Response) {
  try {
    const bruto = (req.body as { status?: unknown })?.status
    if (typeof bruto !== 'string') {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta el estado (texto; vacío lo limpia)' })
      return
    }
    const estado = bruto.trim()
    if (estado.length > TOPE_ESTADO) {
      res.status(HttpStatusCode.BadRequest).json({
        message: `El estado supera los ${TOPE_ESTADO} caracteres que permite WhatsApp`
      })
      return
    }

    const listo = await lineaConectada(req, res)
    if (!listo) return

    await listo.client.setStatus(estado)
    res
      .status(HttpStatusCode.Ok)
      .json({ message: 'Estado actualizado', status: estado })
  } catch (error) {
    console.error('❌ Error cambiando el estado de la línea:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo cambiar el estado de la línea' })
  }
}

/**
 * PATCH /api/profile/:numberId/photo — foto de perfil de la línea.
 *
 * El cuerpo trae { photo: dataURL } tal como sale del canvas del front. Se
 * valida ANTES de construir el MessageMedia: la clase no comprueba nada en el
 * constructor (y `fromBase64` no existe en la 1.34.7 — solo fromFilePath y
 * fromUrl, verificado en node_modules), así que mandarle basura acabaría en un
 * error opaco dentro del navegador en vez de un 400 que diga qué está mal.
 */
export async function cambiarFotoLinea(req: CustomRequest, res: Response) {
  try {
    const bruto = (req.body as { photo?: unknown })?.photo
    if (typeof bruto !== 'string' || bruto.length === 0) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Falta la foto (dataURL de imagen en base64)' })
      return
    }
    if (bruto.length > TOPE_FOTO_DATAURL) {
      res.status(HttpStatusCode.BadRequest).json({
        message: `La foto supera el tope de ${Math.round(TOPE_FOTO_DATAURL / 1024)}KB`
      })
      return
    }

    const partes = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(bruto)
    if (!partes) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'La foto debe ser una dataURL de imagen (data:image/...;base64,...)'
      })
      return
    }
    const [, mimetype, datos] = partes as unknown as [string, string, string]

    // Base64 de verdad, no solo "una cadena": Buffer.from ignora en silencio lo
    // que no entiende, así que un payload corrupto pasaría y reventaría después
    // dentro de WhatsApp. Se comprueba el alfabeto y que decodifique a algo.
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(datos) ||
      datos.length % 4 !== 0 ||
      Buffer.from(datos, 'base64').length === 0
    ) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'La foto no es base64 válido' })
      return
    }

    const listo = await lineaConectada(req, res)
    if (!listo) return

    const media = new MessageMedia(mimetype, datos)
    const acepto = await listo.client.setProfilePicture(media)
    if (!acepto) {
      res.status(HttpStatusCode.BadRequest).json({
        message:
          'WhatsApp rechazó la imagen. Usa una foto cuadrada en JPEG o PNG.'
      })
      return
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Foto de perfil actualizada' })
  } catch (error) {
    console.error('❌ Error cambiando la foto de la línea:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo cambiar la foto de la línea' })
  }
}

/** DELETE /api/profile/:numberId/photo — quita la foto de perfil de la línea. */
export async function quitarFotoLinea(req: CustomRequest, res: Response) {
  try {
    const listo = await lineaConectada(req, res)
    if (!listo) return

    const acepto = await listo.client.deleteProfilePicture()
    if (!acepto) {
      res.status(HttpStatusCode.Conflict).json({
        message: 'WhatsApp no permitió quitar la foto en este momento.'
      })
      return
    }

    res.status(HttpStatusCode.Ok).json({ message: 'Foto de perfil eliminada' })
  } catch (error) {
    console.error('❌ Error quitando la foto de la línea:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo quitar la foto de la línea' })
  }
}

/**
 * POST /api/profile/:numberId/pairing-code — vincular SIN escanear el QR.
 *
 * Cuerpo: { phone } en formato internacional sin símbolos (p.ej. 573001234567).
 * Respuesta: { code } de 8 caracteres para teclear en WhatsApp > Dispositivos
 * vinculados > Vincular con número de teléfono.
 *
 * SOLO opera sobre el cliente vivo que ya dejó `arrancarLinea` (el flujo de
 * session.controller): aquí no se construye ningún Client ni se toca el mapa.
 * El estado válido es el hueco entre el evento 'qr' y 'ready' —la pantalla de
 * vincular de WhatsApp Web—, y se detecta sin tocar session.controller:
 *
 *   · sin cliente vivo            -> nadie pulsó "conectar": no hay navegador
 *   · `client.info` presente      -> ya pasó 'ready': la línea YA está vinculada
 *   · `getState()` revienta       -> el navegador abre pero WhatsApp Web aún no
 *                                    cargó (todavía no hubo 'qr')
 *   · estado UNPAIRED/UNPAIRED_IDLE -> la pantalla de vincular: el único estado
 *                                    en el que el código se puede pedir
 *
 * Los tres primeros contestan 409 con el paso que falta, porque cada uno se
 * arregla distinto y "estado inválido" a secas manda a adivinar.
 */
export async function pedirCodigoVinculacion(req: CustomRequest, res: Response) {
  try {
    const bruto = (req.body as { phone?: unknown })?.phone
    // Se admiten +, espacios y guiones porque es como la gente escribe su
    // número; a WhatsApp solo le sirven los dígitos.
    const telefono =
      typeof bruto === 'string' ? bruto.replace(/[^\d]/g, '') : ''
    if (!/^\d{8,15}$/.test(telefono)) {
      res.status(HttpStatusCode.BadRequest).json({
        message:
          'Teléfono no válido: usa formato internacional con indicativo y solo dígitos (p.ej. 573001234567).'
      })
      return
    }

    const numero = await exigirNumeroPropio(req, res, {
      id: String(req.params.numberId ?? '')
    })
    if (!numero) return

    const client = clienteVivo(numero.id)
    if (!client) {
      res.status(HttpStatusCode.Conflict).json({
        message:
          'La línea no está esperando vinculación: pulsa "conectar" primero para abrir la sesión y vuelve a pedir el código.'
      })
      return
    }

    if (infoDeCliente(client)?.wid) {
      res.status(HttpStatusCode.Conflict).json({
        message: 'Esta línea ya está vinculada: no hace falta ningún código.'
      })
      return
    }

    // `getState()` lee el estado del socket DENTRO del navegador. Antes del
    // evento 'qr' los módulos de WhatsApp Web no existen todavía y la llamada
    // lanza: ese fallo ES la señal de "aún no", no un error del servidor.
    let estado: string | null = null
    try {
      estado = String((await client.getState()) ?? '')
    } catch {
      estado = null
    }
    if (estado !== 'UNPAIRED' && estado !== 'UNPAIRED_IDLE') {
      res.status(HttpStatusCode.Conflict).json({
        message:
          estado === null
            ? 'WhatsApp Web todavía está cargando: espera a que aparezca el QR y vuelve a intentarlo.'
            : `La línea no está en la pantalla de vinculación (estado: ${estado}).`
      })
      return
    }

    // Con plazo: si la página cambió justo después de comprobar el estado, el
    // método de la librería se queda esperando su módulo para siempre.
    const codigo = await Promise.race([
      client.requestPairingCode(telefono, true),
      new Promise<never>((_, rechazar) =>
        setTimeout(
          () => rechazar(new Error('WhatsApp no entregó el código a tiempo')),
          PLAZO_CODIGO_MS
        )
      )
    ])

    console.info(
      `🔗 Código de vinculación emitido para la línea ${numero.id} (teléfono ${telefono}).`
    )
    res.status(HttpStatusCode.Ok).json({ code: codigo, phone: telefono })
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    console.error('❌ Error pidiendo el código de vinculación:', detalle)
    if (detalle.includes('no entregó el código')) {
      res.status(HttpStatusCode.GatewayTimeout).json({
        message:
          'WhatsApp no entregó el código a tiempo. Vuelve a intentarlo; si insiste, reconecta la línea y prueba de nuevo.'
      })
      return
    }
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No se pudo generar el código de vinculación' })
  }
}
