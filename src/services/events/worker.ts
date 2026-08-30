/**
 * =============================================================================
 *  WORKER DE ENTREGAS — saca la cola de events.delivery y la entrega
 * =============================================================================
 *
 *  Cómo despierta, y por qué son dos mecanismos y no uno:
 *    · LISTEN 'events_delivery_ready' — reacciona al instante al primer intento.
 *    · poll cada 2 s sobre el índice parcial delivery_cola_idx — recoge los
 *      reintentos programados Y las entregas cuyo NOTIFY se perdió porque este
 *      proceso estaba caído en ese momento.
 *  El NOTIFY es un despertador, no el transporte. Esa es exactamente la garantía
 *  que el carril de Realtime no tiene (pgListener.ts:30-32) y la razón de ser
 *  del outbox.
 *
 *  Varios workers pueden correr a la vez sin coordinarse: la reclamación usa
 *  FOR UPDATE SKIP LOCKED, así que dos procesos nunca cogen la misma fila.
 */

import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import type pg from 'pg'
import { createListenClient, query } from '../../lib/db.js'
import { transporter } from '../email.service.js'
import { API_VERSION, depurarPayload } from './catalog.js'
import { plantillaDeEvento, plantillaWebhookDeshabilitado } from './emailTemplates.js'
import { descifrar } from './secretbox.js'
import { cabeceras } from './signature.js'
import { lookupFijado, validarDestino, type DireccionValidada } from './ssrf.js'

// ---------------------------------------------------------------------------
//  Parámetros. Cada número tiene un motivo, no son redondeos.
// ---------------------------------------------------------------------------

/**
 * 6 intentos: 1 inmediato + 5 reintentos. Acumulado ~8,6 h.
 *
 * El primero a 30 s cubre el caso mayoritario (un reinicio de contenedor, un
 * pico de latencia). Los siguientes cubren un despliegue con migración
 * (minutos) y una ventana de mantenimiento nocturna (horas). El último cae a
 * ~8,6 h del evento, que es la banda donde un receptor caído deja de ser un
 * tropiezo y pasa a ser una avería: seguir reintentando no entrega nada y sí
 * acumula cola.
 */
const ESPERAS_SEG = [30, 5 * 60, 30 * 60, 2 * 60 * 60, 6 * 60 * 60]
const MAX_INTENTOS = ESPERAS_SEG.length + 1

/**
 * Jitter de ±20 %. Existe porque cuando un hosting compartido vuelve, todas las
 * entregas pendientes de todos sus clientes vencen en el mismo segundo y lo
 * tumban otra vez.
 */
const JITTER = 0.2

/** Un receptor correcto responde 200 y procesa en segundo plano. 10 s sobra. */
const TIMEOUT_MS = 10_000

/** Sin esto, un receptor hostil devuelve un cuerpo infinito y nos come la RAM. */
const MAX_RESPUESTA_BYTES = 64 * 1024
/** De esos 64 KB solo se guardan 2: la respuesta entera de un tercero llena discos. */
const MAX_EXTRACTO = 2 * 1024

/** Entregas agotadas SEGUIDAS antes de apagar un endpoint. */
const RACHA_PARA_APAGAR = 20

const LOTE = 50
const POLL_MS = 2_000
/** Máximo en vuelo por endpoint: un receptor lento no puede comerse el pool. */
const CONCURRENCIA_POR_DESTINO = 4
/** Arriendo de la reclamación: si el worker muere, la fila revive sola. */
const ARRIENDO = "interval '2 minutes'"

// ---------------------------------------------------------------------------

interface FilaEntrega {
  id: string | number
  public_id: string
  event_id: string | number
  channel: 'webhook' | 'email'
  endpoint_id: string | null
  email_preference_id: string | null
  attempt_count: number
  event_public_id: string
  type: string
  payload: Record<string, unknown>
  occurred_at: Date
  account_id: number | null
  url: string | null
  label: string | null
  secret_ciphertext: Buffer | null
  prev_secret_ciphertext: Buffer | null
  prev_secret_expires_at: Date | null
  include_message_body: boolean | null
  to_email: string | null
  timezone: string | null
}

export interface Resultado {
  ok: boolean
  statusCode?: number
  errorKind?: string
  errorMessage?: string
  resolvedIp?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, unknown>
  responseExcerpt?: string
  durationMs: number
  /** Segundos que pide el receptor esperar (Retry-After). */
  retryAfterSeg?: number
  /** true si no tiene sentido volver a intentarlo con el mismo cuerpo. */
  definitivo?: boolean
  /** true si ni siquiera se intentó (SSRF, sin SMTP): status 'blocked'. */
  bloqueado?: boolean
  /** true si el receptor dice que ese destino ya no existe (410). */
  destinoMuerto?: boolean
}

function jitter(segundos: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * JITTER
  return Math.max(1, Math.round(segundos * factor))
}

function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : texto.slice(0, max)
}

// ---------------------------------------------------------------------------
//  Envío por HTTP
// ---------------------------------------------------------------------------

async function enviarWebhook(fila: FilaEntrega): Promise<Resultado> {
  const inicio = Date.now()

  if (!fila.url || !fila.secret_ciphertext) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'endpoint_incompleto',
      errorMessage: 'El endpoint no tiene URL o secreto guardado.',
      durationMs: Date.now() - inicio
    }
  }

  // VALIDACIÓN ANTI-SSRF EN CADA ENVÍO, no solo al guardar. El cliente pudo
  // registrar un nombre que apuntaba a una IP pública y reapuntarlo después a
  // 10.0.0.5 — eso es DNS rebinding y la única defensa es revalidar aquí.
  const destino = await validarDestino(fila.url)
  if (!destino.ok || !destino.ips || destino.ips.length === 0) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'ssrf_blocked',
      errorMessage: destino.motivo || 'Destino rechazado por la validación de seguridad.',
      durationMs: Date.now() - inicio
    }
  }

  let secreto: string
  let secretoAnterior: string | null = null
  try {
    secreto = descifrar(fila.secret_ciphertext)
    // La firma vieja solo se manda mientras dure la ventana de rotación.
    if (
      fila.prev_secret_ciphertext &&
      fila.prev_secret_expires_at &&
      new Date(fila.prev_secret_expires_at).getTime() > Date.now()
    ) {
      secretoAnterior = descifrar(fila.prev_secret_ciphertext)
    }
  } catch (error) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'secreto_ilegible',
      errorMessage: `No se pudo descifrar el secreto de firma: ${
        error instanceof Error ? error.message : String(error)
      }`,
      durationMs: Date.now() - inicio
    }
  }

  // SE SERIALIZA UNA VEZ Y SE FIRMA Y ENVÍA ESE BUFFER EXACTO. Volver a hacer
  // JSON.stringify entre firmar y enviar reordena claves y cambia escapes: la
  // firma deja de cuadrar en un porcentaje de los casos y el fallo parece
  // aleatorio. Es el error más caro de depurar de todo el subsistema.
  const sobre = {
    id: fila.event_public_id,
    type: fila.type,
    occurred_at: new Date(fila.occurred_at).toISOString(),
    api_version: API_VERSION,
    account_id: fila.account_id,
    data: depurarPayload(fila.payload, fila.include_message_body === true)
  }
  const cuerpo = Buffer.from(JSON.stringify(sobre), 'utf8')

  const encabezados = cabeceras({
    tipo: fila.type,
    eventPublicId: fila.event_public_id,
    deliveryPublicId: fila.public_id,
    cuerpo,
    secreto,
    secretoAnterior
  })

  // Se prueban las direcciones validadas en orden (IPv4 primero) y se pasa a la
  // siguiente SOLO si el fallo fue de conexión. Un 500 del receptor, un timeout
  // o un error de TLS no se reintentan contra otra IP: el receptor ya contestó
  // o el problema no es de ruta, y machacar la segunda dirección solo duplica
  // la carga. Esto recupera el reintento automático que el sistema operativo
  // hacía por nosotros antes de fijar la IP.
  let ultimo: Resultado | null = null
  for (const direccion of destino.ips) {
    ultimo = await intentarEnvio(fila.url, direccion, encabezados, cuerpo, inicio)
    if (ultimo.ok || ultimo.errorKind !== 'conn_reset') return ultimo
  }
  return (
    ultimo ?? {
      ok: false,
      errorKind: 'dns',
      errorMessage: 'No quedó ninguna dirección utilizable.',
      durationMs: Date.now() - inicio
    }
  )
}

/** Un envío contra UNA dirección ya validada. */
function intentarEnvio(
  urlBruta: string,
  destino: DireccionValidada,
  encabezados: Record<string, string>,
  cuerpo: Buffer,
  inicio: number
): Promise<Resultado> {
  const url = new URL(urlBruta)
  const esHttps = url.protocol === 'https:'
  const transporte = esHttps ? https : http

  return new Promise<Resultado>((resolve) => {
    let resuelto = false
    const terminar = (r: Resultado) => {
      if (resuelto) return
      resuelto = true
      resolve(r)
    }

    const peticion = transporte.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (esHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          ...encabezados,
          'Content-Length': String(cuerpo.length),
          Host: url.host
        },
        // Conectar a la IP CONCRETA que se validó. Si se dejara resolver otra
        // vez, quedaría una ventana entre la comprobación y el connect en la
        // que el DNS puede cambiar (TOCTOU). El SNI y la cabecera Host siguen
        // llevando el nombre, que es lo que necesita el certificado.
        lookup: lookupFijado(destino.ip, destino.familia) as never,
        servername: esHttps ? url.hostname : undefined,
        timeout: TIMEOUT_MS
      },
      (respuesta) => {
        const status = respuesta.statusCode ?? 0
        const trozos: Buffer[] = []
        let leidos = 0

        respuesta.on('data', (trozo: Buffer) => {
          leidos += trozo.length
          if (leidos <= MAX_RESPUESTA_BYTES) trozos.push(trozo)
          else respuesta.destroy() // tope de lectura: se corta y se sigue
        })

        const cerrar = () => {
          const texto = recortar(Buffer.concat(trozos).toString('utf8'), MAX_EXTRACTO)
          const base = {
            statusCode: status,
            resolvedIp: destino.ip,
            requestHeaders: encabezados,
            responseHeaders: respuesta.headers as Record<string, unknown>,
            responseExcerpt: texto,
            durationMs: Date.now() - inicio
          }

          if (status >= 200 && status < 300) {
            terminar({ ok: true, ...base })
            return
          }

          // 3xx: NO se sigue. Seguir redirecciones reabre toda la validación
          // anti-SSRF en el nuevo destino, y no hay ninguna razón legítima para
          // que un endpoint de webhook redirija.
          if (status >= 300 && status < 400) {
            terminar({
              ok: false,
              definitivo: true,
              errorKind: 'redirect',
              errorMessage: `El destino respondió una redirección (${status}) hacia "${
                respuesta.headers.location ?? 'sin Location'
              }". No se siguen redirecciones.`,
              ...base
            })
            return
          }

          if (status === 410) {
            terminar({
              ok: false,
              definitivo: true,
              destinoMuerto: true,
              errorKind: 'http_410',
              errorMessage: 'El receptor respondió 410 Gone: ese destino ya no existe.',
              ...base
            })
            return
          }

          if (status === 429) {
            const cabecera = respuesta.headers['retry-after']
            const pedido = Number(Array.isArray(cabecera) ? cabecera[0] : cabecera)
            terminar({
              ok: false,
              errorKind: 'http_429',
              errorMessage: 'El receptor pidió bajar el ritmo (429).',
              retryAfterSeg:
                Number.isFinite(pedido) && pedido > 0 && pedido <= 6 * 60 * 60 ? pedido : undefined,
              ...base
            })
            return
          }

          // El resto de 4xx no se reintenta: el cuerpo es idéntico en cada
          // intento, así que la respuesta también lo será.
          if (status >= 400 && status < 500 && status !== 408) {
            terminar({
              ok: false,
              definitivo: true,
              errorKind: 'http_4xx',
              errorMessage: `El receptor rechazó la entrega con ${status}.`,
              ...base
            })
            return
          }

          terminar({
            ok: false,
            errorKind: status >= 500 ? 'http_5xx' : 'http_408',
            errorMessage: `El receptor respondió ${status}.`,
            ...base
          })
        }

        respuesta.on('end', cerrar)
        respuesta.on('close', cerrar)
        respuesta.on('error', (error: Error) => {
          terminar({
            ok: false,
            errorKind: 'conn_reset',
            errorMessage: error.message,
            statusCode: status,
            resolvedIp: destino.ip,
            requestHeaders: encabezados,
            durationMs: Date.now() - inicio
          })
        })
      }
    )

    peticion.on('timeout', () => {
      peticion.destroy()
      terminar({
        ok: false,
        errorKind: 'timeout',
        errorMessage: `El destino no respondió en ${TIMEOUT_MS / 1000} segundos.`,
        resolvedIp: destino.ip,
        requestHeaders: encabezados,
        durationMs: Date.now() - inicio
      })
    })

    peticion.on('error', (error: NodeJS.ErrnoException) => {
      const codigo = error.code || ''
      const clase = codigo.startsWith('ERR_TLS') || codigo === 'CERT_HAS_EXPIRED' || codigo === 'DEPTH_ZERO_SELF_SIGNED_CERT'
        ? 'tls'
        : codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN'
          ? 'dns'
          : 'conn_reset'
      terminar({
        ok: false,
        errorKind: clase,
        errorMessage: `${codigo ? `${codigo}: ` : ''}${error.message}`,
        resolvedIp: destino.ip,
        requestHeaders: encabezados,
        durationMs: Date.now() - inicio
      })
    })

    peticion.write(cuerpo)
    peticion.end()
  })
}

// ---------------------------------------------------------------------------
//  Envío por correo
// ---------------------------------------------------------------------------

async function enviarCorreo(fila: FilaEntrega): Promise<Resultado> {
  const inicio = Date.now()

  if (!fila.to_email) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'sin_destinatario',
      errorMessage: 'La preferencia de correo no tiene destinatario.',
      durationMs: Date.now() - inicio
    }
  }

  // SIN SMTP NO SE ROMPE NADA: la entrega queda 'blocked' con el motivo escrito,
  // se ve en la pantalla y el día que entren las credenciales empieza a mandar
  // sin tocar una línea. No se reintenta porque no es un fallo transitorio.
  if (!transporter) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'smtp_unconfigured',
      errorMessage:
        'No hay servicio de correo configurado (faltan SMTP_HOST, SMTP_PORT, SMTP_USER o SMTP_PASS). El aviso quedó registrado pero no se envió.',
      durationMs: Date.now() - inicio
    }
  }

  const zona = fila.timezone || 'America/Bogota'
  const correo = plantillaDeEvento(fila.type, fila.payload, zona)
  if (!correo) {
    return {
      ok: false,
      bloqueado: true,
      errorKind: 'sin_plantilla',
      errorMessage: `El evento "${fila.type}" no tiene plantilla de correo; solo se puede recibir por webhook.`,
      durationMs: Date.now() - inicio
    }
  }

  try {
    const info = await transporter.sendMail({
      // MAIL_FROM separado de SMTP_USER: con un proveedor transaccional y
      // dominio verificado, la cuenta de autenticación deja de valer como
      // remitente.
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: fila.to_email,
      subject: correo.subject,
      text: correo.text,
      html: correo.html
    })
    return {
      ok: true,
      durationMs: Date.now() - inicio,
      responseExcerpt: recortar(String(info?.messageId ?? ''), MAX_EXTRACTO)
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { responseCode?: number }
    // 5xx de SMTP es rechazo definitivo (buzón inexistente, dominio bloqueado);
    // 4xx es "vuelve más tarde". Es la misma semántica que en HTTP.
    const definitivo = typeof err.responseCode === 'number' && err.responseCode >= 500
    return {
      ok: false,
      definitivo,
      errorKind: `smtp_${err.responseCode ?? err.code ?? 'error'}`,
      errorMessage: recortar(err.message || String(error), 500),
      durationMs: Date.now() - inicio
    }
  }
}

// ---------------------------------------------------------------------------
//  Registro del intento y transición de estado
// ---------------------------------------------------------------------------

async function registrarResultado(fila: FilaEntrega, resultado: Resultado): Promise<void> {
  await query(
    `INSERT INTO events.delivery_attempt
       (delivery_id, attempt_number, duration_ms, resolved_ip, request_headers,
        response_status, response_headers, response_excerpt, error_kind, error_message)
     VALUES ($1,$2,$3,$4::inet,$5::jsonb,$6,$7::jsonb,$8,$9,$10)
     ON CONFLICT (delivery_id, attempt_number) DO NOTHING`,
    [
      fila.id,
      fila.attempt_count,
      resultado.durationMs,
      resultado.resolvedIp ?? null,
      resultado.requestHeaders ? JSON.stringify(resultado.requestHeaders) : null,
      resultado.statusCode ?? null,
      resultado.responseHeaders ? JSON.stringify(resultado.responseHeaders) : null,
      resultado.responseExcerpt ?? null,
      resultado.errorKind ?? null,
      resultado.errorMessage ?? null
    ]
  )

  if (resultado.ok) {
    await query(
      `UPDATE events.delivery
          SET status='succeeded', completed_at=now(), last_status_code=$2,
              last_error_kind=NULL, last_error=NULL
        WHERE id=$1`,
      [fila.id, resultado.statusCode ?? null]
    )
    if (fila.endpoint_id) {
      await query(
        `UPDATE events.webhook_endpoint SET failure_streak=0, updated_at=now() WHERE id=$1`,
        [fila.endpoint_id]
      )
    }
    return
  }

  const quedanIntentos = fila.attempt_count < MAX_INTENTOS
  const reintentable = !resultado.bloqueado && !resultado.definitivo && quedanIntentos

  if (reintentable) {
    const indice = Math.min(fila.attempt_count - 1, ESPERAS_SEG.length - 1)
    const base = resultado.retryAfterSeg ?? ESPERAS_SEG[indice] ?? ESPERAS_SEG[ESPERAS_SEG.length - 1] ?? 30
    // Un Retry-After explícito se respeta tal cual: el receptor sabe mejor que
    // nosotros cuándo va a poder atendernos.
    const espera = resultado.retryAfterSeg ? resultado.retryAfterSeg : jitter(base)
    await query(
      `UPDATE events.delivery
          SET status='failed', next_attempt_at = now() + make_interval(secs => $2),
              last_status_code=$3, last_error_kind=$4, last_error=$5
        WHERE id=$1`,
      [fila.id, espera, resultado.statusCode ?? null, resultado.errorKind ?? null, recortar(resultado.errorMessage ?? '', 1000)]
    )
    return
  }

  const estadoFinal = resultado.bloqueado ? 'blocked' : 'exhausted'
  await query(
    `UPDATE events.delivery
        SET status=$2, completed_at=now(), last_status_code=$3,
            last_error_kind=$4, last_error=$5
      WHERE id=$1`,
    [fila.id, estadoFinal, resultado.statusCode ?? null, resultado.errorKind ?? null, recortar(resultado.errorMessage ?? '', 1000)]
  )

  if (!fila.endpoint_id) return

  // 410 Gone: el receptor está diciendo explícitamente que ese destino ya no
  // existe. Es la convención de la industria y evita meses de reintentos contra
  // una URL muerta.
  if (resultado.destinoMuerto) {
    await apagarEndpoint(fila, 'El receptor respondió 410 Gone: ese destino ya no existe.', 0)
    return
  }

  // Un 429 no cuenta para la racha: nos están pidiendo bajar el ritmo, no
  // fallando. Un 'blocked' tampoco: no llegó a haber entrega.
  if (resultado.bloqueado || resultado.errorKind === 'http_429') return

  const racha = await query<{ failure_streak: number }>(
    `UPDATE events.webhook_endpoint
        SET failure_streak = failure_streak + 1, updated_at=now()
      WHERE id=$1
      RETURNING failure_streak`,
    [fila.endpoint_id]
  )
  const seguidos = racha.rows[0]?.failure_streak ?? 0

  // 20 y no 3: con el calendario de reintentos de arriba, 20 entregas agotadas
  // en una línea activa equivalen a cerca de un día entero de silencio — no se
  // apaga a nadie por una tarde mala. Y en una línea de poco tráfico esas 20
  // pueden tardar semanas, que es lo correcto: no se apaga un endpoint que
  // recibe tres eventos al día por una caída de una noche.
  if (seguidos >= RACHA_PARA_APAGAR) {
    await apagarEndpoint(
      fila,
      `${seguidos} entregas seguidas sin poder completarse. Último error: ${
        resultado.errorMessage ?? resultado.errorKind ?? 'desconocido'
      }`,
      seguidos
    )
  }
}

async function apagarEndpoint(fila: FilaEntrega, motivo: string, seguidos: number): Promise<void> {
  if (!fila.endpoint_id) return
  const res = await query<{ url: string; label: string | null; account_id: number }>(
    `UPDATE events.webhook_endpoint
        SET is_active=false, disabled_at=now(), disabled_reason=$2, updated_at=now()
      WHERE id=$1 AND is_active
      RETURNING url, label, account_id`,
    [fila.endpoint_id, recortar(motivo, 500)]
  )
  const endpoint = res.rows[0]
  if (!endpoint) return // ya estaba apagado

  console.warn(`⚠️ Webhook desactivado (${endpoint.url}): ${motivo}`)

  // La bandera en /connections no necesita nada. El correo sí necesita SMTP: si
  // no lo hay, se queda solo la bandera y se dice por qué.
  if (!transporter) {
    console.warn('⚠️ No se avisó por correo de la desactivación: no hay SMTP configurado.')
    return
  }
  try {
    const dueno = await query<{ email: string }>(`SELECT email FROM app."User" WHERE id=$1`, [
      endpoint.account_id
    ])
    const destino = dueno.rows[0]?.email
    if (!destino) return
    const correo = plantillaWebhookDeshabilitado({
      url: endpoint.url,
      label: endpoint.label,
      motivo,
      fallosSeguidos: seguidos
    })
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: destino,
      subject: correo.subject,
      text: correo.text,
      html: correo.html
    })
  } catch (error) {
    console.error(
      '❌ No se pudo avisar por correo de la desactivación del webhook:',
      error instanceof Error ? error.message : error
    )
  }
}

// ---------------------------------------------------------------------------
//  Bucle
// ---------------------------------------------------------------------------

/**
 * Reclama un lote. Todo en una sentencia para no dar dos vueltas a la base:
 * el CTE bloquea con SKIP LOCKED, el UPDATE marca 'delivering' y el SELECT final
 * trae ya el evento y el destino.
 *
 * next_attempt_at pasa a ser el VENCIMIENTO DEL ARRIENDO, no la próxima espera:
 * si este proceso muere ahora mismo, la fila vuelve a ser elegible sola en 2
 * minutos y no hace falta ningún proceso reaper que limpie 'delivering'.
 */
async function reclamarLote(): Promise<FilaEntrega[]> {
  const res = await query<FilaEntrega>(
    `WITH candidatas AS (
       SELECT id FROM events.delivery
        WHERE status IN ('pending','failed','delivering')
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), reclamadas AS (
       UPDATE events.delivery d
          SET status='delivering',
              attempt_count = d.attempt_count + 1,
              next_attempt_at = now() + ${ARRIENDO}
         FROM candidatas c
        WHERE d.id = c.id
        RETURNING d.id, d.public_id, d.event_id, d.channel, d.endpoint_id,
                  d.email_preference_id, d.attempt_count
     )
     SELECT r.*,
            e.public_id AS event_public_id, e.type, e.payload, e.occurred_at, e.account_id,
            w.url, w.label, w.secret_ciphertext, w.prev_secret_ciphertext,
            w.prev_secret_expires_at, w.include_message_body,
            p.to_email, p.timezone
       FROM reclamadas r
       JOIN events.event e ON e.id = r.event_id
       LEFT JOIN events.webhook_endpoint w ON w.id = r.endpoint_id
       LEFT JOIN events.email_preference p ON p.id = r.email_preference_id`,
    [LOTE]
  )
  return res.rows
}

/** Ejecuta `fn` sobre `items` con como mucho `limite` en vuelo. */
async function conLimite<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let indice = 0
  const carriles = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (indice < items.length) {
      const actual = items[indice++]
      if (actual === undefined) return
      await fn(actual)
    }
  })
  await Promise.all(carriles)
}

async function procesar(fila: FilaEntrega): Promise<void> {
  try {
    const resultado =
      fila.channel === 'email' ? await enviarCorreo(fila) : await enviarWebhook(fila)
    await registrarResultado(fila, resultado)
  } catch (error) {
    // Una excepción aquí no puede dejar la fila arrendada para siempre: se
    // registra como intento fallido y el calendario normal la recoge.
    console.error('❌ Fallo inesperado entregando:', error instanceof Error ? error.message : error)
    try {
      await registrarResultado(fila, {
        ok: false,
        errorKind: 'worker_error',
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: 0
      })
    } catch {
      // La base está caída; el arriendo vence solo y otro ciclo lo reintenta.
    }
  }
}

async function ciclo(): Promise<number> {
  const lote = await reclamarLote()
  if (lote.length === 0) return 0

  // Agrupado por destino: así un receptor lento solo se puede comer sus 4
  // carriles, no el worker entero.
  const porDestino = new Map<string, FilaEntrega[]>()
  for (const fila of lote) {
    const clave = fila.endpoint_id ?? `email:${fila.email_preference_id ?? 'x'}`
    const grupo = porDestino.get(clave)
    if (grupo) grupo.push(fila)
    else porDestino.set(clave, [fila])
  }

  await Promise.all(
    Array.from(porDestino.values()).map((grupo) =>
      conLimite(grupo, CONCURRENCIA_POR_DESTINO, procesar)
    )
  )
  return lote.length
}

// ---------------------------------------------------------------------------

let temporizador: NodeJS.Timeout | null = null
let escucha: pg.Client | null = null
let corriendo = false
let ciclando = false
let purgaHecha = ''

async function purgarSiTocaHoy(): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10)
  if (purgaHecha === hoy) return
  purgaHecha = hoy
  try {
    const res = await query<{ intentos_borrados: number; eventos_borrados: number }>(
      'SELECT * FROM events.purgar_retencion()'
    )
    const r = res.rows[0]
    if (r && (r.intentos_borrados > 0 || r.eventos_borrados > 0)) {
      console.log(
        `🧹 Retención de eventos: ${r.intentos_borrados} intentos y ${r.eventos_borrados} eventos purgados.`
      )
    }
  } catch (error) {
    console.error('❌ Error purgando la retención de eventos:', error instanceof Error ? error.message : error)
  }
}

async function tick(): Promise<void> {
  if (ciclando) return
  ciclando = true
  try {
    // Mientras siga saliendo un lote lleno hay cola acumulada: se vacía sin
    // esperar al siguiente poll.
    let procesados = 0
    do {
      procesados = await ciclo()
    } while (procesados >= LOTE && corriendo)
    await purgarSiTocaHoy()
  } catch (error) {
    console.error('❌ Error en el worker de entregas:', error instanceof Error ? error.message : error)
  } finally {
    ciclando = false
  }
}

/**
 * Arranca el worker. Se llama una vez desde index.ts.
 *
 * Se puede apagar con EVENTS_WORKER_ENABLED=false — útil si algún día hay dos
 * instancias del API y se quiere que solo una entregue, aunque el diseño con
 * SKIP LOCKED soporta que entreguen las dos.
 */
export function iniciarWorkerDeEntregas(): void {
  if (corriendo) return
  if ((process.env.EVENTS_WORKER_ENABLED || '').toLowerCase() === 'false') {
    console.log('ℹ️ Worker de entregas apagado por EVENTS_WORKER_ENABLED=false')
    return
  }
  corriendo = true

  temporizador = setInterval(() => void tick(), POLL_MS)
  // unref: este intervalo no debe mantener vivo el proceso por sí solo.
  temporizador.unref?.()

  const cliente = createListenClient()
  escucha = cliente
  cliente.on('notification', () => void tick())
  cliente.on('error', (error: Error) => {
    console.error('❌ Escucha de entregas caída, se reintenta:', error.message)
    escucha = null
    cliente.end().catch(() => undefined)
    if (corriendo) setTimeout(() => reconectarEscucha(), 5_000)
  })
  cliente
    .connect()
    .then(() => cliente.query('LISTEN "events_delivery_ready"'))
    .then(() => console.log('✅ Worker de entregas escuchando events_delivery_ready'))
    .catch((error: Error) => {
      // Que no se pueda escuchar no es fatal: el poll de 2 s recoge todo igual,
      // solo con un poco más de latencia en el primer intento.
      console.error('❌ No se pudo escuchar events_delivery_ready (el poll sigue activo):', error.message)
    })

  void tick()
}

function reconectarEscucha(): void {
  if (!corriendo || escucha) return
  const cliente = createListenClient()
  escucha = cliente
  cliente.on('notification', () => void tick())
  cliente.on('error', () => {
    escucha = null
    cliente.end().catch(() => undefined)
    if (corriendo) setTimeout(() => reconectarEscucha(), 5_000)
  })
  cliente
    .connect()
    .then(() => cliente.query('LISTEN "events_delivery_ready"'))
    .catch(() => {
      escucha = null
    })
}

export async function detenerWorkerDeEntregas(): Promise<void> {
  corriendo = false
  if (temporizador) clearInterval(temporizador)
  temporizador = null
  const cliente = escucha
  escucha = null
  if (cliente) {
    try {
      await cliente.query('UNLISTEN *')
    } catch {
      // conexión ya rota
    }
    await cliente.end().catch(() => undefined)
  }
}

/** Empuja el worker sin esperar al poll. La usa el botón "reenviar". */
export function despertarWorker(): void {
  void tick()
}

/**
 * Envía un evento de PRUEBA a un endpoint y devuelve el resultado en el acto.
 *
 * NO pasa por la cola y NO deja fila en events.event: un evento de prueba en el
 * flujo real dispararía las automatizaciones del cliente con datos falsos, que
 * es peor que no poder probar. A cambio, el llamador obtiene la respuesta HTTP
 * —o el motivo exacto del rechazo anti-SSRF— de forma síncrona, que es
 * justamente lo que hace útil el botón.
 */
export async function enviarPrueba(endpoint: {
  id: string
  url: string
  label: string | null
  secret_ciphertext: Buffer
  prev_secret_ciphertext: Buffer | null
  prev_secret_expires_at: Date | null
  include_message_body: boolean
  account_id: number
}): Promise<Resultado> {
  const ahora = new Date()
  const fila: FilaEntrega = {
    id: 0,
    public_id: crypto.randomUUID(),
    event_id: 0,
    channel: 'webhook',
    endpoint_id: endpoint.id,
    email_preference_id: null,
    attempt_count: 1,
    event_public_id: crypto.randomUUID(),
    type: 'line.qr_pending',
    payload: {
      prueba: true,
      mensaje:
        'Este es un evento de prueba enviado desde la pantalla de Conexiones de Lumintik Agents. No corresponde a ningún hecho real.',
      line: { id: 0, label: 'Línea de prueba', channel: 'whatsapp_web', phone_masked: null },
      expires_at: new Date(ahora.getTime() + 20_000).toISOString(),
      requested_at: ahora.toISOString()
    },
    occurred_at: ahora,
    account_id: endpoint.account_id,
    url: endpoint.url,
    label: endpoint.label,
    secret_ciphertext: endpoint.secret_ciphertext,
    prev_secret_ciphertext: endpoint.prev_secret_ciphertext,
    prev_secret_expires_at: endpoint.prev_secret_expires_at,
    include_message_body: endpoint.include_message_body,
    to_email: null,
    timezone: null
  }
  return await enviarWebhook(fila)
}
