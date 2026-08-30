/**
 * COMPARAR TELÉFONOS SIN REESCRIBIRLOS.
 *
 * EL SÍNTOMA: el numberId de un mismo usuario, con un mismo teléfono, fue
 * 2, 4, 5, 7, 8, 9, 10 a lo largo de una sola sesión. Cada línea nueva estrena
 * su propia carpeta `/app/.wwebjs_auth/session-<id>` y su propio Chromium, y los
 * anteriores se quedan en memoria comiéndose el contenedor.
 *
 * Parte de la culpa era del guardia de duplicados, que comparaba el TEXTO CRUDO:
 * "3203813929", "+573203813929" y "320 381 3929" son tres filas distintas del
 * mismo teléfono, y el campo del formulario es texto libre.
 *
 * AQUÍ SOLO SE COMPARA, NO SE GUARDA NORMALIZADO. Reescribir el texto de la
 * columna sería otro cambio, y uno con cola: hay endpoints que resuelven la
 * línea comparando ese texto literal (`propiedad.ts`, `WHERE number = $1`), a
 * los que llegan `toggle-ai`, `response-groups` y `toggle-unknown-ai` con lo que
 * el front tenga en pantalla. Si se normalizara la columna sin tocar esa
 * consulta, esos tres botones empezarían a devolver 404.
 */

/**
 * La forma comparable de un teléfono: solo sus dígitos, y sin el prefijo de país
 * cuando es Colombia (+57) delante de un móvil de 10 dígitos.
 *
 * Se recorta a los últimos 10 dígitos como último criterio porque es lo que
 * distingue de verdad a un móvil colombiano; con eso, "3203813929",
 * "573203813929" y "+57 320 381 3929" caen en la misma clave. Es deliberadamente
 * conservador: NO intenta ser una librería de E.164, solo evitar que el mismo
 * teléfono entre dos veces.
 */
export function comparablePorTelefono(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D+/g, '')
  if (!digitos) return ''
  return digitos.length > 10 ? digitos.slice(-10) : digitos
}
