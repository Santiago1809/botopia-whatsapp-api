import type { Client } from 'whatsapp-web.js'

/**
 * LAS SESIONES DE WHATSAPP VIVAS DE ESTE PROCESO, POR numberId.
 *
 * OJO: que haya una entrada NO significa que sirva. Un `Client` recién
 * construido tiene `pupPage = null` (Client.js:103) y solo recibe la página
 * cuando el navegador arranca de verdad (Client.js:478). Si Chromium no
 * arranca, la entrada se queda ocupada por un cliente SIN NAVEGADOR y todo el
 * que la use revienta con "Cannot read properties of null (reading 'evaluate')"
 * —el chat vacío que el usuario ve en pantalla—. Por eso el mapa NO se lee
 * crudo: se lee con `clienteVivo()`.
 */
export const clients: Record<string, Client> = {}

/**
 * Líneas cuyo navegador se está abriendo ahora mismo.
 *
 * Durante el arranque, la entrada del mapa existe pero todavía no tiene
 * navegador: es "aún no", no "está podrida". Sin esta marca, `clienteVivo` la
 * tiraría del mapa a mitad del arranque y las vías de limpieza (parar la línea,
 * borrar el número) se quedarían sin nadie a quien cerrar el Chromium.
 */
const arrancando = new Set<string>()

export function marcarArranque(numberId: string | number, activo: boolean): void {
  const clave = String(numberId)
  if (activo) arrancando.add(clave)
  else arrancando.delete(clave)
}

export function estaArrancando(numberId: string | number): boolean {
  return arrancando.has(String(numberId))
}

/**
 * ¿Este cliente tiene navegador? Hay dos formas de no tenerlo, con errores
 * distintos y la misma consecuencia:
 *
 *   · `pupPage` null — `initialize()` nunca pasó de Client.js:478 porque
 *     `puppeteer.launch` falló (Client.js:462). Da el "reading 'evaluate'" de
 *     null.
 *   · página cerrada o navegador desconectado — `destroy()` cierra el navegador
 *     pero NO pone `pupPage` a null (Client.js:1277-1283). Da "Session closed"
 *     o "Target closed".
 *
 * Lo que esto NO detecta: que el WhatsApp Web de dentro del navegador se haya
 * colgado (el error minificado "r" que documenta chatDeRespaldo.ts). Eso es otro
 * problema y esta comprobación no lo cubre.
 */
export function clienteUtilizable(client?: Client | null): boolean {
  if (!client) return false
  const page = client.pupPage
  if (!page) return false
  try {
    if (typeof page.isClosed === 'function' && page.isClosed()) return false
  } catch {
    return false
  }
  const browser = client.pupBrowser
  try {
    if (browser && typeof browser.isConnected === 'function' && !browser.isConnected()) {
      return false
    }
  } catch {
    return false
  }
  return true
}

/**
 * El cliente de esa línea, o undefined si no hay uno utilizable.
 *
 * Si la entrada está podrida la SACA del mapa, salvo que la línea esté
 * arrancando. Ese efecto secundario es deliberado y es lo que rompe el bucle:
 * mientras el cadáver seguía en el mapa, el `if (!client)` que reconstruye la
 * sesión NUNCA se alcanzaba, la línea quedaba envenenada hasta reiniciar el
 * proceso y el usuario acababa creando una línea NUEVA para esquivarla (por eso
 * el numberId iba 2, 4, 5, 7, 8, 9, 10 con el mismo teléfono).
 *
 * NO usar en las vías de LIMPIEZA (parar WhatsApp, borrar número, cerrar
 * sesión): esas necesitan el objeto aunque esté muerto, para cerrarle el
 * navegador y liberar la memoria. Ahí se lee `clients[...]` directamente.
 */
/**
 * CERRAR UNA SESIÓN SIN DESVINCULAR EL TELÉFONO, Y SIN MORIR EN EL INTENTO.
 *
 * Dos fallos que este orden arregla y que estaban repetidos en cuatro sitios:
 *
 * 1. SE LLAMABA A `logout()`. Son dos daños distintos a la vez:
 *      · `Client.logout()` es `this.pupPage.evaluate(...)` (Client.js:1290), así
 *        que con `pupPage` null lanza "Cannot read properties of null (reading
 *        'evaluate')" —y como el `delete clients[...]` venía DESPUÉS, la entrada
 *        podrida se quedaba en el mapa para siempre; la línea ya no se podía
 *        revivir y al usuario solo le quedaba crear otra—;
 *      · `LocalAuth.logout()` hace `fs.rm(userDataDir)` (LocalAuth.js:56-68), o
 *        sea que BORRA la sesión guardada y obliga a escanear el QR otra vez.
 *    Cerrar no es desvincular. Desvincular es DELETE /api/user/delete-number.
 *
 * 2. EL `delete` IBA DETRÁS DE UN `await` QUE PODÍA LANZAR. Ahora va en
 *    `finally`: pase lo que pase, la entrada sale del mapa.
 *
 * `destroy()` es seguro incluso sobre un cliente que nunca arrancó: comprueba
 * `browser?.isConnected?.()` antes de cerrar nada (Client.js:1277-1283) y
 * `LocalAuth` no redefine `destroy()` (BaseAuthStrategy.destroy es un no-op).
 */
export async function cerrarCliente(
  client: Client,
  numberId: string | number,
  motivo: string
): Promise<void> {
  const clave = String(numberId)
  try {
    client.removeAllListeners()
  } catch {
    /* un cliente a medio construir puede no tener ni emisor: da igual */
  }
  try {
    await client.destroy()
  } catch (error) {
    console.warn(
      `⚠️ No se pudo cerrar del todo el navegador de la línea ${clave} (${motivo}): ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  } finally {
    delete clients[clave]
    marcarArranque(clave, false)
  }
}

export function clienteVivo(numberId: string | number): Client | undefined {
  const clave = String(numberId)
  const client = clients[clave]
  if (!client) return undefined
  if (clienteUtilizable(client)) return client
  if (estaArrancando(clave)) return undefined
  console.warn(
    `🧟 El cliente de la línea ${clave} no tiene navegador: se retira del mapa para poder rearrancarla.`
  )
  delete clients[clave]
  return undefined
}
