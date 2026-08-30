/**
 * =============================================================================
 *  CIFRADO DEL SECRETO DE FIRMA — AES-256-GCM
 * =============================================================================
 *
 *  Por qué CIFRADO y no hasheado, que sería más seguro: para firmar un webhook
 *  hay que tener el secreto EN CLARO en el momento del envío. Un hash lo haría
 *  imposible. Lo que sí se consigue con esto es que un volcado de la base no
 *  baste para falsificar webhooks: hace falta además la clave del entorno.
 *
 *  GCM y no CBC: GCM autentica el texto cifrado. Con CBC, alguien con acceso de
 *  escritura a la base podría manipular bytes del secreto y la corrupción se
 *  detectaría como "las firmas no cuadran" en vez de como un error claro.
 *
 *  Formato guardado en bytea:  [ iv(12) | tag(16) | ciphertext(...) ]
 *  El IV va delante y es aleatorio por cifrado — reutilizar un IV en GCM rompe
 *  la confidencialidad del esquema entero, no solo de ese mensaje.
 */

import crypto from 'node:crypto'

const IV_BYTES = 12
const TAG_BYTES = 16

let claveCache: Buffer | null = null

/**
 * Resuelve la clave de 32 bytes.
 *
 *   1) WEBHOOK_SECRET_KEY  — la variable dedicada. Es lo correcto: se genera con
 *      `openssl rand -base64 32` y rotarla es una decisión aparte.
 *   2) JWT_SECRET          — respaldo, derivado con HKDF y una etiqueta propia
 *      para que la clave de cifrado NO sea el mismo material que firma sesiones.
 *      Existe porque sin él la pantalla de /connections nacería muerta en el
 *      primer despliegue, y JWT_SECRET ya está puesto en producción.
 *      Contrapartida, y hay que saberla: si algún día se rota JWT_SECRET, los
 *      secretos guardados dejan de poder descifrarse y hay que rotarlos también.
 *
 *  Si no hay ninguna de las dos, esto LANZA. No se inventa una clave por
 *  defecto: una clave conocida es exactamente igual de mala que no cifrar, con
 *  el agravante de que parece que sí.
 */
function clave(): Buffer {
  if (claveCache) return claveCache

  const directa = process.env.WEBHOOK_SECRET_KEY
  if (directa && directa.trim()) {
    // Se acepta base64, hex o texto plano: se normaliza a 32 bytes con SHA-256
    // para no obligar a que la variable tenga una longitud exacta.
    claveCache = crypto.createHash('sha256').update(directa.trim()).digest()
    return claveCache
  }

  const jwtSecret = process.env.JWT_SECRET
  if (jwtSecret && jwtSecret.trim()) {
    console.warn(
      '⚠️ WEBHOOK_SECRET_KEY no está configurada: los secretos de webhook se cifran con una clave derivada de JWT_SECRET. Funciona, pero si rotas JWT_SECRET los secretos guardados dejan de servir y hay que rotarlos.'
    )
    claveCache = Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(jwtSecret), Buffer.alloc(0), Buffer.from('lumintik-webhook-secret-v1'), 32)
    )
    return claveCache
  }

  throw new Error(
    'No hay clave para cifrar los secretos de webhook. Configura WEBHOOK_SECRET_KEY (por ejemplo: openssl rand -base64 32).'
  )
}

/** true si se puede cifrar/descifrar. La UI lo usa para explicar por qué no. */
export function cifradoDisponible(): boolean {
  try {
    clave()
    return true
  } catch {
    return false
  }
}

export function cifrar(textoPlano: string): Buffer {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', clave(), iv)
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado])
}

export function descifrar(paquete: Buffer): string {
  if (paquete.length < IV_BYTES + TAG_BYTES) {
    throw new Error('El secreto guardado está truncado o corrupto')
  }
  const iv = paquete.subarray(0, IV_BYTES)
  const tag = paquete.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const cifrado = paquete.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8')
}
