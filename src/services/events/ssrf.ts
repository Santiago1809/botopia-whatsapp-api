/**
 * =============================================================================
 *  VALIDACIÓN ANTI-SSRF DE LAS URL DE DESTINO
 * =============================================================================
 *
 *  El problema, y aquí no es teórico: un cliente puede registrar
 *  `http://localhost:5005/api/contacts`, `http://169.254.169.254/latest/meta-data/`
 *  o `http://crm-ms.railway.internal/` y usarnos de proxy contra NUESTRA propia
 *  red privada. La red interna de Railway es exactamente donde viven esta API,
 *  el CRM y el Postgres.
 *
 *  REGLA DE ORO: se valida en DOS momentos y los dos son obligatorios.
 *    · Al guardar la URL, para poder dar un error útil en /connections.
 *    · EN CADA PETICIÓN, DESPUÉS DE RESOLVER EL DNS.
 *
 *  Validar solo al guardar es el agujero clásico: el cliente registra
 *  `webhooks.suempresa.com` apuntando a una IP pública, pasa la validación, y
 *  luego reapunta el DNS a 10.0.0.5. Se llama DNS rebinding y la única defensa
 *  es revalidar en el momento de conectar — y conectarse a la IP que se validó,
 *  no volver a resolver (eso sería una ventana TOCTOU).
 */

import dns from 'node:dns/promises'
import net from 'node:net'

export interface DireccionValidada {
  ip: string
  familia: 4 | 6
}

export interface ResultadoValidacion {
  ok: boolean
  /** Motivo en español, pensado para mostrarse tal cual en la pantalla. */
  motivo?: string
  /**
   * TODAS las direcciones comprobadas, en el orden en que hay que intentarlas.
   * Se devuelven todas y no solo una porque al fijar la conexión a una IP se
   * pierde el reintento automático que hace el sistema operativo cuando la
   * primera no responde: si un dominio tiene A y AAAA y el AAAA está roto (o el
   * contenedor no tiene salida IPv6, que es lo normal en Railway), quedarse con
   * la primera haría fallar entregas que cualquier navegador entrega bien.
   */
  ips?: DireccionValidada[]
}

/**
 * Puertos permitidos. Uno solo, más 8443 que es el alterno de HTTPS de facto.
 * Permitir puertos arbitrarios deja mapear la red interna midiendo tiempos de
 * respuesta, aunque nunca se llegue a leer una respuesta.
 */
const PUERTOS_PERMITIDOS = new Set([443, 8443])

/**
 * Sufijos de nombre denegados. `railway.internal` es EL que importa aquí: es el
 * dominio de la red privada donde viven la propia API, el CRM y la base.
 */
const SUFIJOS_DENEGADOS = [
  'localhost',
  '.localhost',
  '.local',
  '.internal',
  '.railway.internal',
  '.svc.cluster.local'
]

/**
 * Escotilla SOLO para desarrollo: WEBHOOK_ALLOW_INSECURE_HOSTS con una lista de
 * hosts separados por coma a los que se permite http:// y puerto libre. Nunca se
 * pone en producción; existe para poder probar contra un receptor local.
 */
function hostsPermitidosInseguros(): string[] {
  return (process.env.WEBHOOK_ALLOW_INSECURE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
//  Rangos privados / reservados
// ---------------------------------------------------------------------------

function ipv4ANumero(ip: string): number | null {
  const partes = ip.split('.')
  if (partes.length !== 4) return null
  let n = 0
  for (const parte of partes) {
    const octeto = Number(parte)
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null
    n = n * 256 + octeto
  }
  return n
}

/** [primera IP del rango, bits de prefijo] */
const RANGOS_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // metadata de nube: AWS, GCP, Azure, DigitalOcean
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32]
]

export function esIPv4Privada(ip: string): boolean {
  const n = ipv4ANumero(ip)
  if (n === null) return true // no se pudo interpretar: se rechaza
  for (const [base, bits] of RANGOS_V4) {
    const b = ipv4ANumero(base)
    if (b === null) continue
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    if ((n & mascara) >>> 0 === (b & mascara) >>> 0) return true
  }
  return false
}

/** Expande una IPv6 a sus 8 grupos numéricos. null si no se puede interpretar. */
function expandirIPv6(ip: string): number[] | null {
  let direccion = ip
  const porcentaje = direccion.indexOf('%')
  if (porcentaje !== -1) direccion = direccion.slice(0, porcentaje) // zona (fe80::1%eth0)

  // Forma mixta ::ffff:1.2.3.4 -> se convierte la cola v4 a dos grupos.
  const ultimoDosPuntos = direccion.lastIndexOf(':')
  const cola = direccion.slice(ultimoDosPuntos + 1)
  if (cola.includes('.')) {
    const n = ipv4ANumero(cola)
    if (n === null) return null
    direccion = `${direccion.slice(0, ultimoDosPuntos + 1)}${((n >>> 16) & 0xffff)
      .toString(16)}:${(n & 0xffff).toString(16)}`
  }

  const partes = direccion.split('::')
  if (partes.length > 2) return null

  const izquierda = partes[0] ? partes[0].split(':').filter((s) => s !== '') : []
  const derecha = partes.length === 2 && partes[1] ? partes[1].split(':').filter((s) => s !== '') : []
  const relleno = 8 - izquierda.length - derecha.length
  if (partes.length === 1 && izquierda.length !== 8) return null
  if (relleno < 0) return null

  const grupos = [...izquierda, ...Array(partes.length === 2 ? relleno : 0).fill('0'), ...derecha]
  if (grupos.length !== 8) return null

  const numeros: number[] = []
  for (const g of grupos) {
    const v = parseInt(g, 16)
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) return null
    numeros.push(v)
  }
  return numeros
}

/**
 * Rechaza ULA, link-local, loopback, multicast y documentación.
 *
 * Y, sobre todo, DECODIFICA las formas de IPv4 embebida en IPv6 y vuelve a
 * pasar la dirección v4 por la lista v4. Aquí es donde se cuela la mayoría de
 * implementaciones ingenuas: `::ffff:169.254.169.254` no está en ninguna lista
 * v6 y llega a la metadata de la nube igual de bien que la forma corta.
 */
export function esIPv6Privada(ip: string): boolean {
  const g = expandirIPv6(ip)
  if (!g) return true

  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number, number, number, number, number, number, number, number
  ]

  // ::/128 (sin especificar) y ::1/128 (loopback)
  const todosCero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0
  if (todosCero && g6 === 0 && (g7 === 0 || g7 === 1)) return true

  // ::ffff:0:0/96 (v4 mapeada) y ::/96 (v4 compatible, obsoleta pero viva)
  if (todosCero || (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff)) {
    const v4 = `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`
    return esIPv4Privada(v4)
  }

  // 64:ff9b::/96 — NAT64, traduce a una v4 que puede ser privada.
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    const v4 = `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`
    return esIPv4Privada(v4)
  }

  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7  ULA
  if ((g0 & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true // ff00::/8  multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // 2001:db8::/32 documentación

  return false
}

export function esIPPrivada(ip: string): boolean {
  const familia = net.isIP(ip)
  if (familia === 4) return esIPv4Privada(ip)
  if (familia === 6) return esIPv6Privada(ip)
  return true // ni v4 ni v6: no sabemos qué es, se rechaza
}

// ---------------------------------------------------------------------------
//  Validación de la forma de la URL (paso 1: al guardar)
// ---------------------------------------------------------------------------

export interface UrlAnalizada {
  ok: boolean
  motivo?: string
  hostname?: string
  puerto?: number
  inseguraPermitida?: boolean
}

export function validarFormaDeUrl(bruta: string): UrlAnalizada {
  let url: URL
  try {
    url = new URL(bruta)
  } catch {
    return { ok: false, motivo: 'La dirección no es una URL válida.' }
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const permitidosInseguros = hostsPermitidosInseguros()
  const inseguraPermitida = permitidosInseguros.includes(host)

  if (url.protocol !== 'https:' && !inseguraPermitida) {
    return {
      ok: false,
      motivo:
        'La dirección tiene que empezar por https://. La firma autentica el contenido pero no lo cifra: sin TLS el payload viaja legible.'
    }
  }

  if (url.username || url.password) {
    return {
      ok: false,
      motivo: 'La dirección no puede llevar usuario ni contraseña embebidos (usuario:clave@host).'
    }
  }

  const puerto = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!PUERTOS_PERMITIDOS.has(puerto) && !inseguraPermitida) {
    return {
      ok: false,
      motivo: `El puerto ${puerto} no está permitido. Solo se admite el 443 (o el 8443).`
    }
  }

  // El host tiene que ser un NOMBRE, no una IP literal. Esto solo ya mata
  // 169.254.169.254, 127.0.0.1, [::1] y todas las variantes ofuscadas
  // (decimal, octal, hexadecimal, IPv6 comprimida) sin enumerarlas.
  if (net.isIP(host) !== 0 && !inseguraPermitida) {
    return {
      ok: false,
      motivo:
        'La dirección tiene que apuntar a un nombre de dominio, no a una dirección IP escrita a mano.'
    }
  }

  for (const sufijo of SUFIJOS_DENEGADOS) {
    if (host === sufijo || host.endsWith(sufijo)) {
      if (inseguraPermitida) break
      return {
        ok: false,
        motivo: `"${host}" es un nombre de red interna y no se puede usar como destino.`
      }
    }
  }

  return { ok: true, hostname: host, puerto, inseguraPermitida }
}

// ---------------------------------------------------------------------------
//  Validación con resolución de DNS (paso 2: antes de CADA envío)
// ---------------------------------------------------------------------------

/**
 * Resuelve el nombre y comprueba TODAS las direcciones devueltas.
 *
 * Se rechaza si ALGUNA es privada, no si lo son todas: un nombre que resuelve a
 * una IP pública y a una privada es exactamente el ataque, porque el sistema
 * operativo puede elegir cualquiera de las dos al conectar.
 *
 * Devuelve la IP concreta a la que hay que conectarse, para fijar la conexión y
 * no volver a resolver (ver `agenteFijadoA` más abajo).
 */
export async function validarDestino(bruta: string): Promise<ResultadoValidacion> {
  const forma = validarFormaDeUrl(bruta)
  if (!forma.ok) return { ok: false, motivo: forma.motivo }

  const host = forma.hostname as string

  let direcciones: Array<{ address: string; family: number }>

  // Escotilla de desarrollo: el host está en la lista explícita de
  // WEBHOOK_ALLOW_INSECURE_HOSTS, así que se salta la comprobación de rangos
  // privados — apuntar a 127.0.0.1 es justamente para lo que existe. Si es una
  // IP literal se usa tal cual; si es un nombre (localhost) se resuelve y se
  // acepta lo que devuelva.
  if (forma.inseguraPermitida) {
    const familiaLiteral = net.isIP(host)
    if (familiaLiteral !== 0) {
      return { ok: true, ips: [{ ip: host, familia: familiaLiteral as 4 | 6 }] }
    }
    try {
      direcciones = await dns.lookup(host, { all: true, verbatim: true })
    } catch {
      return { ok: false, motivo: `No se pudo resolver el nombre "${host}".` }
    }
    if (direcciones.length === 0) {
      return { ok: false, motivo: `El nombre "${host}" no devolvió ninguna dirección.` }
    }
    return { ok: true, ips: ordenar(direcciones) }
  }

  try {
    // lookup y no resolve4/resolve6: es el mismo camino que usaría la conexión
    // real (respeta /etc/hosts y el resolvedor del sistema), así que lo que se
    // valida es lo que se va a conectar.
    direcciones = await dns.lookup(host, { all: true, verbatim: true })
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException)?.code || ''
    return {
      ok: false,
      motivo: `No se pudo resolver el nombre "${host}"${codigo ? ` (${codigo})` : ''}. Revisa el DNS del dominio.`
    }
  }

  if (direcciones.length === 0) {
    return { ok: false, motivo: `El nombre "${host}" no devolvió ninguna dirección.` }
  }

  for (const d of direcciones) {
    if (esIPPrivada(d.address)) {
      return {
        ok: false,
        motivo: `El nombre "${host}" resuelve a ${d.address}, que es una dirección privada o reservada. Los webhooks solo pueden salir a direcciones públicas.`
      }
    }
  }

  return { ok: true, ips: ordenar(direcciones) }
}

/**
 * IPv4 primero.
 *
 * No es una preferencia estética: la salida IPv6 de un contenedor de Railway no
 * está garantizada, y si se intenta primero el AAAA de un dominio de doble pila
 * la conexión muere con ENETUNREACH aunque el receptor esté perfectamente vivo
 * por IPv4. El orden `verbatim` del resolvedor no sabe nada de eso.
 */
function ordenar(direcciones: Array<{ address: string; family: number }>): DireccionValidada[] {
  const v4 = direcciones.filter((d) => d.family === 4).map((d) => ({ ip: d.address, familia: 4 as const }))
  const v6 = direcciones.filter((d) => d.family === 6).map((d) => ({ ip: d.address, familia: 6 as const }))
  return [...v4, ...v6]
}

/**
 * Función `lookup` que devuelve SIEMPRE la IP ya validada.
 *
 * Es el punto 7 del diseño y el que sobrevive a todo lo anterior: si se valida
 * y luego se deja que la librería resuelva otra vez, queda una ventana entre la
 * comprobación y el connect en la que el DNS puede cambiar. Pasando esto como
 * `lookup` al agente HTTP, la conexión va a la dirección comprobada, mientras
 * que el SNI y la cabecera Host siguen llevando el nombre original — que es lo
 * que necesita el certificado y el virtual host del receptor.
 */
export function lookupFijado(
  ip: string,
  familia: 4 | 6
): (
  hostname: string,
  opciones: { all?: boolean } | undefined,
  callback: (
    err: NodeJS.ErrnoException | null,
    direccion: string | Array<{ address: string; family: number }>,
    familia?: number
  ) => void
) => void {
  // Node llama a `lookup` de DOS formas y hay que responder a las dos. Desde
  // Node 20, `autoSelectFamily` está activo por defecto y pide `all: true`, con
  // lo que espera un ARRAY de direcciones; si se le devuelve la forma de un solo
  // valor, el socket falla con "ERR_INVALID_IP_ADDRESS: Invalid IP address:
  // undefined" y ninguna entrega sale nunca. Se descubrió probando de verdad
  // contra un receptor local, no leyendo la documentación.
  return (_hostname, opciones, callback) => {
    if (opciones && opciones.all === true) {
      callback(null, [{ address: ip, family: familia }])
      return
    }
    callback(null, ip, familia)
  }
}
