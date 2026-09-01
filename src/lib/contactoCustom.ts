/**
 * Validación de los campos PERSONALIZADOS de un contacto (custom_name /
 * custom_photo), compartida por los dos endpoints que los escriben:
 *
 *   · POST  /api/whatsapp/update-custom      (SyncedContactOrGroup)
 *   · PATCH /api/unsyncedcontacts/:id/custom (Unsyncedcontact)
 *
 * Vive aquí y no duplicada en cada ruta porque las reglas tienen que ser LAS
 * MISMAS en las dos tablas: si un día el tope de la foto cambia, cambia en un
 * solo sitio y las dos rutas lo heredan.
 *
 * Semántica de cada campo en el cuerpo de la petición:
 *   · ausente          -> no se toca (permite editar solo el nombre o solo la foto)
 *   · null o ''        -> se LIMPIA (vuelve a NULL, y el front cae al dato de WhatsApp)
 *   · string no vacío  -> se guarda, tras validar
 */

/**
 * 200KB de tope para la foto. Es sobre la dataURL YA codificada (base64 infla
 * ~33%), así que la imagen real ronda los 150KB: de sobra para un avatar que se
 * pinta a 48px. El front comprime con canvas antes de mandar; este tope es la
 * red de seguridad para quien llame a la API sin pasar por el front.
 */
export const TOPE_FOTO_BYTES = 200 * 1024

/** El nombre es para una lista de chats: más largo que esto es un error de pegado. */
export const TOPE_NOMBRE_CARACTERES = 120

// `type` y no `interface` a propósito: los alias de objeto tienen firma de
// índice implícita y las interfaces no, y el .update() del adaptador de base
// pide Record<string, unknown>. Con interface habría que castear en cada uso.
export type CamposCustom = {
  custom_name?: string | null
  custom_photo?: string | null
}

export type ResultadoCustom =
  | { ok: true; cambios: CamposCustom }
  | { ok: false; error: string }

/**
 * Lee custom_name/custom_photo del cuerpo y devuelve SOLO los campos presentes,
 * normalizados, o el motivo del rechazo. No devuelve nunca un objeto vacío como
 * éxito: pedir una edición sin campos es un error del llamador y hay que decirlo.
 */
export function validarCamposCustom(body: unknown): ResultadoCustom {
  const cuerpo = (body ?? {}) as Record<string, unknown>
  const cambios: CamposCustom = {}

  if ('custom_name' in cuerpo) {
    const bruto = cuerpo.custom_name
    if (bruto === null || bruto === '') {
      cambios.custom_name = null
    } else if (typeof bruto === 'string') {
      const limpio = bruto.trim()
      if (limpio.length === 0) {
        cambios.custom_name = null
      } else if (limpio.length > TOPE_NOMBRE_CARACTERES) {
        return {
          ok: false,
          error: `custom_name supera los ${TOPE_NOMBRE_CARACTERES} caracteres`
        }
      } else {
        cambios.custom_name = limpio
      }
    } else {
      return { ok: false, error: 'custom_name debe ser texto o null' }
    }
  }

  if ('custom_photo' in cuerpo) {
    const bruto = cuerpo.custom_photo
    if (bruto === null || bruto === '') {
      cambios.custom_photo = null
    } else if (typeof bruto === 'string') {
      // Solo dos formas aceptadas: una dataURL de imagen (lo que produce el
      // canvas del front) o una URL http(s). Cualquier otra cosa —un data: de
      // text/html, un javascript:— acabaría en el src de un <img> del panel.
      const esDataUrlDeImagen = /^data:image\/[a-z0-9.+-]+;base64,/i.test(bruto)
      const esUrlHttp = /^https?:\/\//i.test(bruto)
      if (!esDataUrlDeImagen && !esUrlHttp) {
        return {
          ok: false,
          error: 'custom_photo debe ser una dataURL de imagen o una URL http(s)'
        }
      }
      if (Buffer.byteLength(bruto, 'utf8') > TOPE_FOTO_BYTES) {
        return {
          ok: false,
          error: `custom_photo supera el tope de ${Math.round(TOPE_FOTO_BYTES / 1024)}KB`
        }
      }
      cambios.custom_photo = bruto
    } else {
      return { ok: false, error: 'custom_photo debe ser texto o null' }
    }
  }

  if (!('custom_name' in cambios) && !('custom_photo' in cambios)) {
    return { ok: false, error: 'No hay nada que actualizar: manda custom_name y/o custom_photo' }
  }

  return { ok: true, cambios }
}
