import { config } from 'dotenv'

config()

/**
 * URL pública del front (la que abre el usuario en el navegador).
 *
 * La usan los correos que llevan un enlace de vuelta a la app: el botón de
 * activación del correo de bienvenida y el "Ver Planes" del aviso de límite.
 * Antes estaba escrita a mano como `https://app.botopia.online`, un dominio que
 * ya no responde (verificado: no resuelve a un servidor vivo), así que TODOS los
 * enlaces que salían del sistema estaban muertos.
 *
 * No hay valor por defecto a propósito: preferimos un correo sin botón antes que
 * un botón que lleva a ninguna parte. Configúrala en Railway con el dominio real
 * del front, por ejemplo `APP_URL=https://mi-app.vercel.app`.
 */
export const APP_URL: string | null = (() => {
  const raw = process.env.APP_URL?.trim()
  if (!raw) {
    console.warn(
      '⚠️ APP_URL sin definir: los correos saldrán sin enlace a la app (activación de cuenta y "Ver Planes"). Configúrala con el dominio público del front.'
    )
    return null
  }
  return raw.replace(/\/+$/, '')
})()
