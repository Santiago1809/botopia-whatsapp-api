// EL CERROJO QUE DEJABA UNA LÍNEA MUERTA PARA SIEMPRE.
//
// EL SÍNTOMA: el chat sale vacío ("No hay mensajes en este chat aún") aunque la
// conversación exista, y el log repite:
//     Failed to launch the browser process: Code: 21
//     The profile appears to be in use by another Chromium process (217)
//     on another computer (06cc25de49b7). Chromium has locked the profile...
//     ⚠️ WhatsApp no devolvió el chat 101692108443891@lid (historial de la línea 10):
//        Cannot read properties of null (reading 'evaluate')
//
// LA CAUSA: `LocalAuth` guarda el perfil de Chromium en
// `<dataPath>/session-<clientId>` (LocalAuth.js:25 y :50) y ese dataPath es
// `./.wwebjs_auth`, que en Railway es UN VOLUMEN PERSISTENTE. Chromium escribe
// ahí `SingletonLock` (un enlace simbólico con hostname y pid) y lo borra al
// salir limpiamente. Cuando el contenedor muere de golpe —un redespliegue, un
// OOM— el cerrojo SOBREVIVE en el volumen con el hostname del contenedor
// anterior, y el Chromium del contenedor nuevo se niega a abrir el perfil. Para
// siempre: cada intento posterior falla exactamente igual.
//
// Y como `Client` nace con `pupPage = null` (Client.js:103) y solo recibe la
// página DESPUÉS de que el navegador arranque (Client.js:478), un arranque
// fallido deja un cliente sin navegador. De ahí el "reading 'evaluate'" de null.
//
// SON FICHEROS DE COORDINACIÓN, NO CREDENCIALES: la sesión de WhatsApp vive en
// `session-<id>/Default/` (IndexedDB, Local Storage). Retirar el cerrojo NO
// obliga a escanear el QR otra vez.
import fs from 'node:fs'
import path from 'node:path'

/** El mismo cálculo que hace LocalAuth.js:25 — `path.resolve('./.wwebjs_auth/')`. */
const RAIZ = path.resolve('./.wwebjs_auth')

/** Los tres ficheros de coordinación que Chromium deja en el perfil. */
const CERROJOS = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']

/** La carpeta de perfil de una línea, tal como la nombra LocalAuth. */
export function carpetaDeSesion(numberId: string | number): string {
  return path.join(RAIZ, `session-${numberId}`)
}

/**
 * Retira el cerrojo huérfano de una línea, si lo hay.
 *
 * SOLO se debe llamar cuando este proceso NO tiene un navegador vivo para esa
 * línea (ver `clienteVivo` en WhatsAppClients.ts). Con dos Chromium sobre el
 * mismo perfil, el cerrojo es justo lo que impide que se corrompa la sesión: es
 * su razón de existir. Por eso cada retirada deja rastro en el log.
 */
export function soltarCerrojoDeSesion(numberId: string | number): void {
  const dir = carpetaDeSesion(numberId)
  for (const nombre of CERROJOS) {
    const ruta = path.join(dir, nombre)
    try {
      // `lstatSync` y NO `existsSync`: `SingletonLock` es un enlace simbólico
      // que apunta a "<hostname>-<pid>", un destino que no existe. `existsSync`
      // sigue el enlace, no encuentra el destino y devuelve false — o sea que
      // con existsSync el cerrojo era invisible justo cuando estorbaba.
      if (!fs.lstatSync(ruta, { throwIfNoEntry: false })) continue
      fs.rmSync(ruta, { force: true })
      console.warn(
        `🔓 Cerrojo huérfano de Chromium retirado antes de arrancar la línea ${numberId}: ${ruta}`
      )
    } catch (error) {
      console.warn(
        `⚠️ No se pudo retirar ${ruta}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}

/**
 * Borra el perfil COMPLETO de una línea. Irreversible: se pierde la sesión de
 * WhatsApp y hay que volver a escanear el QR.
 *
 * Solo se llama al ELIMINAR el número, y es lo que faltaba: nada en el
 * repositorio borraba nunca estas carpetas, así que cada id quemado dejaba un
 * perfil de Chromium permanente en el volumen (1,5 GB ya ocupados) y, con él,
 * su cerrojo.
 */
export function borrarPerfilDeSesion(numberId: string | number): void {
  const dir = carpetaDeSesion(numberId)
  try {
    if (!fs.existsSync(dir)) return
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4 })
    console.info(`🧹 Perfil de Chromium borrado con la línea ${numberId}: ${dir}`)
  } catch (error) {
    console.warn(
      `⚠️ No se pudo borrar el perfil ${dir}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
