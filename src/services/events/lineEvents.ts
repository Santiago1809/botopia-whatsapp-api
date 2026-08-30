/**
 * =============================================================================
 *  EVENTOS DE LÍNEA — vía whatsapp-web.js (la línea propia por QR)
 * =============================================================================
 *
 *  Estos eventos NO cuelgan de ninguna fila de la base, así que no hay trigger
 *  del que salgan: app."WhatsAppNumber" no tiene columna de estado y el estado
 *  vive solo en el mapa `clients` de memoria (src/WhatsAppClients.ts).
 *
 *  EL HUECO QUE ESTO TAPA: tras un redespliegue de Railway todas las sesiones
 *  desaparecen del mapa y nadie emite 'disconnected' — la base sigue listando el
 *  número como si existiera y el cliente no se entera de que su línea está
 *  muerta hasta que alguien nota que no llegan mensajes. Por eso el apagado
 *  graceful emite line.disconnected con reason='service_restart'.
 *
 *  SOLO SE EMITE EN LAS TRANSICIONES. 'ready' puede dispararse varias veces
 *  sobre la misma sesión y un cliente que recibe "línea conectada" cada dos
 *  minutos deja de leer el aviso. El estado conocido se guarda en memoria: si el
 *  proceso reinicia, el primer evento posterior vuelve a considerarse transición,
 *  que es exactamente lo correcto porque la sesión también se reinició.
 */

import { query } from '../../lib/db.js'
import { enmascararTelefono } from './catalog.js'
import { emitirEvento } from './emitter.js'

export type MotivoConexion = 'qr_scanned' | 'restored'
export type MotivoDesconexion =
  | 'logged_out'
  | 'auth_failure'
  | 'service_restart'
  | 'credentials_invalid'
  | 'startup_failed'

type Estado = 'connected' | 'disconnected' | 'qr_pending'

const estadoConocido = new Map<string, Estado>()

function clave(numberId: string | number): string {
  return String(numberId)
}

interface FichaNumero {
  userId: number
  id: number
  label: string
  phone_masked: string | null
}

/**
 * Lee el dueño y la etiqueta de la línea. Si el número ya no existe (por ejemplo
 * porque stopWhatsApp borró la fila antes de que llegara el 'disconnected'),
 * devuelve null y no se emite nada: un evento sin tenant no le sirve a nadie y
 * esa baja fue deliberada, no una caída.
 */
async function fichaDeNumero(numberId: string | number): Promise<FichaNumero | null> {
  try {
    const res = await query<{ id: number; userId: number; name: string | null; number: string | null }>(
      `SELECT id, "userId", name, number FROM app."WhatsAppNumber" WHERE id = $1`,
      [numberId]
    )
    const fila = res.rows[0]
    if (!fila) return null
    return {
      userId: fila.userId,
      id: fila.id,
      label: (fila.name || '').trim() || fila.number || `Línea ${fila.id}`,
      phone_masked: enmascararTelefono(fila.number)
    }
  } catch (error) {
    console.error(
      '❌ No se pudo leer la línea para emitir su evento:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}

function fichaLinea(numero: FichaNumero) {
  return {
    id: numero.id,
    label: numero.label,
    channel: 'whatsapp_web',
    phone_masked: numero.phone_masked
  }
}

/** La línea quedó operativa. Solo emite si antes no lo estaba. */
export async function marcarLineaConectada(
  numberId: string | number,
  reason: MotivoConexion
): Promise<void> {
  if (estadoConocido.get(clave(numberId)) === 'connected') return
  estadoConocido.set(clave(numberId), 'connected')

  const numero = await fichaDeNumero(numberId)
  if (!numero) return
  emitirEvento(
    'line.connected',
    { line: fichaLinea(numero), reason, connected_at: new Date().toISOString() },
    numero.userId
  )
}

/** La línea dejó de estar operativa. Solo emite si antes lo estaba. */
export async function marcarLineaDesconectada(
  numberId: string | number,
  reason: MotivoDesconexion
): Promise<void> {
  if (estadoConocido.get(clave(numberId)) === 'disconnected') return
  estadoConocido.set(clave(numberId), 'disconnected')

  const numero = await fichaDeNumero(numberId)
  if (!numero) return
  emitirEvento(
    'line.disconnected',
    { line: fichaLinea(numero), reason, disconnected_at: new Date().toISOString() },
    numero.userId
  )
}

/**
 * Hay un QR esperando a que alguien lo escanee.
 *
 * EL QR NO VIAJA EN EL EVENTO, y no es una omisión: es una credencial de sesión
 * de WhatsApp — quien lo escanee se apodera de la línea. Viaja solo el aviso, y
 * el código se ve únicamente en la pantalla que lo pidió.
 */
export async function marcarQRPendiente(numberId: string | number): Promise<void> {
  if (estadoConocido.get(clave(numberId)) === 'qr_pending') return
  estadoConocido.set(clave(numberId), 'qr_pending')

  const numero = await fichaDeNumero(numberId)
  if (!numero) return
  emitirEvento(
    'line.qr_pending',
    {
      line: fichaLinea(numero),
      // Los QR de WhatsApp Web se renuevan cada ~20 s; se informa el momento de
      // caducidad aproximado del que se acaba de generar, no el código.
      expires_at: new Date(Date.now() + 20_000).toISOString(),
      requested_at: new Date().toISOString()
    },
    numero.userId
  )
}

/**
 * Baja deliberada: el usuario paró la línea. Se limpia el estado para que un
 * arranque posterior vuelva a emitir 'connected' como transición real, y NO se
 * emite line.disconnected porque no es una caída — es lo que pidió el usuario.
 */
export function olvidarLinea(numberId: string | number): void {
  estadoConocido.delete(clave(numberId))
}

/**
 * Apagado graceful: todas las sesiones vivas mueren con el proceso.
 *
 * Se espera de verdad (a diferencia del resto de emisiones, que son fire and
 * forget) porque el proceso está a punto de terminar: si no se espera, el
 * INSERT no llega a la base y el evento se pierde, que es justo el agujero que
 * esta función existe para tapar.
 */
export async function emitirCaidaPorReinicio(numberIds: Array<string | number>): Promise<void> {
  const vivos = numberIds.filter((id) => estadoConocido.get(clave(id)) !== 'disconnected')
  if (vivos.length === 0) return

  const { emitirYEsperar } = await import('./emitter.js')
  await Promise.all(
    vivos.map(async (numberId) => {
      estadoConocido.set(clave(numberId), 'disconnected')
      const numero = await fichaDeNumero(numberId)
      if (!numero) return
      await emitirYEsperar(
        'line.disconnected',
        {
          line: fichaLinea(numero),
          reason: 'service_restart',
          disconnected_at: new Date().toISOString()
        },
        numero.userId
      )
    })
  )
}
