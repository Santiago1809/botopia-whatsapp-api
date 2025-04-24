/**
 * Utilidades para manejo de fechas en la aplicación
 * Por defecto todas las fechas se manejan en UTC pero se convierten a GMT-5 para presentación
 */

// Offset para GMT-5 en minutos
const GMT_OFFSET = -5 * 60

/**
 * Obtiene la fecha y hora actual en UTC
 */
export function getCurrentUTCDate(): Date {
  return new Date()
}

/**
 * Obtiene la fecha y hora actual en GMT-5
 */
export function getCurrentLocalDate(): Date {
  const now = new Date()
  const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000)
  return new Date(utcDate.getTime() + GMT_OFFSET * 60000)
}

/**
 * Convierte una fecha UTC a GMT-5
 */
export function convertUTCToLocal(utcDate: Date): Date {
  const date = new Date(utcDate)
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000
  return new Date(utcTime + GMT_OFFSET * 60000)
}

/**
 * Convierte una fecha GMT-5 a UTC
 */
export function convertLocalToUTC(localDate: Date): Date {
  const date = new Date(localDate)
  const localTime = date.getTime() - GMT_OFFSET * 60000
  return new Date(localTime - date.getTimezoneOffset() * 60000)
}

/**
 * Obtiene el mes actual en GMT-5 (1-12)
 */
export function getCurrentMonth(): number {
  return getCurrentLocalDate().getMonth() + 1 // getMonth() devuelve 0-11
}

/**
 * Obtiene el año actual en GMT-5
 */
export function getCurrentYear(): number {
  return getCurrentLocalDate().getFullYear()
}
