/**
 * =============================================================================
 *  FIRMA DE LOS WEBHOOKS — esquema Svix (Stripe, Resend, GitHub usan el mismo)
 * =============================================================================
 *
 *  No se copia por elegancia: es el esquema que ya usan Stripe, Resend, Svix y
 *  GitHub, así que un cliente que hoy recibe webhooks de cualquiera de ellos
 *  verifica los nuestros cambiando tres líneas, y las librerías de verificación
 *  ya existen en todos los lenguajes.
 *
 *  Contenido firmado:  `${event_id}.${timestamp}.${cuerpo_crudo}`
 *  Algoritmo:          HMAC-SHA256, salida en base64
 *  Cabecera:           X-Lumintik-Signature: "v1,<base64> v1,<base64>"
 *
 *  El secreto tiene formato `whsec_<base64(32 bytes)>` y se firma con los BYTES
 *  DECODIFICADOS, no con la cadena. Parece un detalle cosmético y no lo es: si
 *  el receptor firma la cadena y nosotros los bytes, no valida nunca nada y el
 *  cliente pierde una tarde buscando el error en otro sitio.
 */

import crypto from 'node:crypto'

/** Ventana anti-replay, en segundos. Ver el comentario de `cabeceras()`. */
export const VENTANA_ANTIREPLAY_SEG = 300

/** Genera un secreto nuevo: `whsec_` + 32 bytes aleatorios en base64. */
export function generarSecreto(): string {
  return `whsec_${crypto.randomBytes(32).toString('base64')}`
}

/** Los primeros caracteres, para que la UI pueda decir CUÁL secreto es. */
export function prefijoDeSecreto(secreto: string): string {
  return `${secreto.slice(0, 14)}…`
}

function bytesDelSecreto(secreto: string): Buffer {
  // "whsec_XXXX" -> XXXX. Se admite también un secreto sin prefijo.
  const guion = secreto.indexOf('_')
  const material = guion === -1 ? secreto : secreto.slice(guion + 1)
  return Buffer.from(material, 'base64')
}

/**
 * Firma un cuerpo YA SERIALIZADO.
 *
 * Recibe un Buffer y no un objeto a propósito. La regla, que es donde esto se
 * rompe en la práctica: serializar UNA vez, firmar ese buffer exacto y enviar
 * ese buffer exacto. Volver a hacer JSON.stringify entre firmar y enviar
 * reordena claves y cambia escapes; la firma deja de cuadrar en un porcentaje
 * de los casos y el fallo parece aleatorio.
 */
export function firmar(
  secreto: string,
  eventId: string,
  timestampSeg: number,
  cuerpo: Buffer
): string {
  const contenido = `${eventId}.${timestampSeg}.${cuerpo.toString('utf8')}`
  return crypto.createHmac('sha256', bytesDelSecreto(secreto)).update(contenido).digest('base64')
}

export interface CabecerasFirmadas {
  [nombre: string]: string
}

/**
 * Arma el juego completo de cabeceras.
 *
 * `secretoAnterior` se pasa durante la ventana de rotación: se mandan las DOS
 * firmas separadas por espacio y el receptor acepta si ALGUNA cuadra. Sin eso,
 * rotar un secreto es una caída coordinada con el cliente.
 *
 * El timestamp va DENTRO del contenido firmado, así que un atacante no puede
 * moverlo sin invalidar la firma. La ventana es de 5 minutos: no 30 segundos,
 * porque los relojes de contenedores derivan y una ventana estrecha genera
 * rechazos que el cliente no puede depurar; y no una hora, porque la ventana es
 * exactamente el tiempo durante el cual una petición capturada se puede repetir.
 */
export function cabeceras(opciones: {
  tipo: string
  eventPublicId: string
  deliveryPublicId: string
  cuerpo: Buffer
  secreto: string
  secretoAnterior?: string | null
  timestampSeg?: number
}): CabecerasFirmadas {
  const ts = opciones.timestampSeg ?? Math.floor(Date.now() / 1000)
  const firmas = [`v1,${firmar(opciones.secreto, opciones.eventPublicId, ts, opciones.cuerpo)}`]
  if (opciones.secretoAnterior) {
    firmas.push(`v1,${firmar(opciones.secretoAnterior, opciones.eventPublicId, ts, opciones.cuerpo)}`)
  }

  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Lumintik-Webhooks/1',
    'X-Lumintik-Event': opciones.tipo,
    'X-Lumintik-Event-Id': opciones.eventPublicId,
    // ESTABLE entre reintentos: es la clave con la que el receptor deduplica.
    'X-Lumintik-Delivery': opciones.deliveryPublicId,
    'X-Lumintik-Timestamp': String(ts),
    'X-Lumintik-Signature': firmas.join(' ')
  }
}

/**
 * Verificación. No la usa el emisor — la usa la documentación y el día que
 * queramos probar de punta a punta que lo que firmamos se puede verificar.
 * Comparación en tiempo constante y comprobando la longitud primero:
 * timingSafeEqual lanza si los buffers miden distinto, y un `===` normal filtra
 * la firma correcta byte a byte por el tiempo de respuesta.
 */
export function verificar(
  secretos: string[],
  eventId: string,
  timestampSeg: number,
  cuerpo: Buffer,
  cabeceraFirma: string
): boolean {
  const ahora = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(timestampSeg)) return false
  if (Math.abs(ahora - timestampSeg) > VENTANA_ANTIREPLAY_SEG) return false

  const esperadas = secretos.map((s) => Buffer.from(firmar(s, eventId, timestampSeg, cuerpo)))

  return cabeceraFirma.split(' ').some((parte) => {
    const coma = parte.indexOf(',')
    const firma = Buffer.from(coma === -1 ? parte : parte.slice(coma + 1))
    return esperadas.some(
      (esperada) => firma.length === esperada.length && crypto.timingSafeEqual(firma, esperada)
    )
  })
}
