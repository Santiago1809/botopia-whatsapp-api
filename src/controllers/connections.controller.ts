/**
 * =============================================================================
 *  API DE LA SECCIÓN /connections
 * =============================================================================
 *
 *  Todo lo de aquí está acotado a la cuenta del token: cada consulta lleva
 *  `account_id = $usuario` en el WHERE, nunca "busca por id y luego comprueba
 *  el dueño". Es la diferencia entre no encontrar el recurso ajeno y encontrarlo
 *  y decidir no enseñarlo — la segunda forma filtra la existencia del recurso y
 *  se rompe en cuanto alguien añade una rama nueva.
 *
 *  El JWT solo lleva `username` y `role` (auth.controller.ts:161-165), así que
 *  el id numérico hay que resolverlo por username, igual que hace stopWhatsApp.
 */

import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import { query } from '../lib/db.js'
import type { CustomRequest } from '../interfaces/global.js'
import { CATALOGO, esTipoValido, TIPOS_CON_CORREO } from '../services/events/catalog.js'
import { construirResumen } from '../services/events/dailySummary.js'
import { cifrar, cifradoDisponible } from '../services/events/secretbox.js'
import { generarSecreto, prefijoDeSecreto } from '../services/events/signature.js'
import { validarDestino } from '../services/events/ssrf.js'
import { despertarWorker, enviarPrueba } from '../services/events/worker.js'

/** Ventana durante la que se acepta también la firma vieja tras rotar. */
const VENTANA_ROTACION_HORAS = 24

interface Cuenta {
  id: number
  email: string
}

async function cuentaDe(req: CustomRequest): Promise<Cuenta | null> {
  const username = req.user?.username
  if (!username) return null
  const res = await query<Cuenta>('SELECT id, email FROM app."User" WHERE username = $1', [username])
  return res.rows[0] ?? null
}

function sinCuenta(res: Response): void {
  res.status(HttpStatusCode.NotFound).json({ message: 'Usuario no encontrado' })
}

function fallo(res: Response, error: unknown, contexto: string): void {
  const mensaje = error instanceof Error ? error.message : String(error)
  console.error(`❌ ${contexto}:`, mensaje)
  res.status(HttpStatusCode.InternalServerError).json({ message: `${contexto}: ${mensaje}` })
}

/** Normaliza y valida la lista de eventos a suscribir. */
function tiposPedidos(bruto: unknown): { tipos: string[]; invalido?: string } {
  if (!Array.isArray(bruto)) return { tipos: [], invalido: 'La lista de eventos es obligatoria.' }
  const tipos = Array.from(new Set(bruto.map((t) => String(t))))
  if (tipos.length === 0) return { tipos: [], invalido: 'Hay que elegir al menos un evento.' }
  const malo = tipos.find((t) => !esTipoValido(t))
  if (malo) return { tipos: [], invalido: `El evento "${malo}" no existe en el catálogo.` }
  return { tipos }
}

// ---------------------------------------------------------------------------
//  Catálogo
// ---------------------------------------------------------------------------

export async function getCatalogo(_req: CustomRequest, res: Response): Promise<void> {
  res.json({
    events: CATALOGO,
    email_events: TIPOS_CON_CORREO,
    // La pantalla necesita saberlo para explicar por qué no puede crear nada,
    // en vez de fallar con un 500 opaco al guardar.
    cifrado_disponible: cifradoDisponible()
  })
}

// ---------------------------------------------------------------------------
//  Webhooks
// ---------------------------------------------------------------------------

export async function listarWebhooks(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    // El secreto NUNCA sale de aquí después de crearlo: solo su prefijo.
    const filas = await query(
      `SELECT e.id, e.url, e.label, e.secret_prefix, e.secret_rotated_at,
              e.include_message_body, e.is_active, e.disabled_at, e.disabled_reason,
              e.failure_streak, e.created_at,
              COALESCE(
                (SELECT array_agg(s.event_type ORDER BY s.event_type)
                   FROM events.webhook_endpoint_event s WHERE s.endpoint_id = e.id),
                ARRAY[]::text[]
              ) AS events,
              (SELECT COUNT(*)::int FROM events.delivery d
                WHERE d.endpoint_id = e.id AND d.status = 'succeeded') AS entregas_ok,
              (SELECT COUNT(*)::int FROM events.delivery d
                WHERE d.endpoint_id = e.id AND d.status IN ('exhausted','blocked')) AS entregas_fallidas,
              (SELECT COUNT(*)::int FROM events.delivery d
                WHERE d.endpoint_id = e.id AND d.status IN ('pending','failed','delivering')) AS en_cola
         FROM events.webhook_endpoint e
        WHERE e.account_id = $1
        ORDER BY e.created_at DESC`,
      [cuenta.id]
    )
    res.json({ webhooks: filas.rows })
  } catch (error) {
    fallo(res, error, 'Error listando webhooks')
  }
}

export async function crearWebhook(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const { url, label, include_message_body: incluirCuerpo } = req.body ?? {}
    if (typeof url !== 'string' || url.trim() === '') {
      res.status(HttpStatusCode.BadRequest).json({ message: 'La URL es obligatoria.' })
      return
    }

    const { tipos, invalido } = tiposPedidos(req.body?.events)
    if (invalido) {
      res.status(HttpStatusCode.BadRequest).json({ message: invalido })
      return
    }

    // Validación completa (forma + DNS) YA al guardar, para poder dar el motivo
    // exacto en la pantalla. Se repite igualmente antes de cada envío: entre el
    // alta y el primer webhook el DNS puede cambiar.
    const destino = await validarDestino(url.trim())
    if (!destino.ok) {
      res.status(HttpStatusCode.BadRequest).json({ message: destino.motivo })
      return
    }

    if (!cifradoDisponible()) {
      res.status(HttpStatusCode.InternalServerError).json({
        message:
          'El servidor no tiene configurada la clave para guardar secretos de webhook (WEBHOOK_SECRET_KEY o JWT_SECRET).'
      })
      return
    }

    const secreto = generarSecreto()

    const insertado = await query<{ id: string }>(
      `INSERT INTO events.webhook_endpoint
         (account_id, url, label, secret_ciphertext, secret_prefix, include_message_body)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_id, url) DO NOTHING
       RETURNING id`,
      [
        cuenta.id,
        url.trim(),
        typeof label === 'string' && label.trim() ? label.trim() : null,
        cifrar(secreto),
        prefijoDeSecreto(secreto),
        incluirCuerpo === true
      ]
    )
    const id = insertado.rows[0]?.id
    if (!id) {
      res.status(HttpStatusCode.Conflict).json({
        message: 'Ya tienes un webhook registrado con esa misma URL.'
      })
      return
    }

    await query(
      `INSERT INTO events.webhook_endpoint_event (endpoint_id, event_type)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, tipos]
    )

    // El secreto se devuelve UNA sola vez. A partir de aquí solo existe cifrado
    // en la base: si el cliente lo pierde, la salida es rotarlo, no recuperarlo.
    res.status(HttpStatusCode.Created).json({
      id,
      secret: secreto,
      secret_prefix: prefijoDeSecreto(secreto),
      events: tipos,
      aviso:
        'Guarda este secreto ahora: no se vuelve a mostrar. Con él se verifica la firma de cada webhook.'
    })
  } catch (error) {
    fallo(res, error, 'Error creando el webhook')
  }
}

export async function actualizarWebhook(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    const { id } = req.params

    const cambios: string[] = []
    const valores: unknown[] = [id, cuenta.id]

    if (typeof req.body?.url === 'string' && req.body.url.trim()) {
      const destino = await validarDestino(req.body.url.trim())
      if (!destino.ok) {
        res.status(HttpStatusCode.BadRequest).json({ message: destino.motivo })
        return
      }
      valores.push(req.body.url.trim())
      cambios.push(`url = $${valores.length}`)
    }
    if (req.body?.label !== undefined) {
      valores.push(req.body.label === null ? null : String(req.body.label))
      cambios.push(`label = $${valores.length}`)
    }
    if (req.body?.include_message_body !== undefined) {
      valores.push(req.body.include_message_body === true)
      cambios.push(`include_message_body = $${valores.length}`)
    }
    if (req.body?.is_active !== undefined) {
      const activo = req.body.is_active === true
      valores.push(activo)
      cambios.push(`is_active = $${valores.length}`)
      // Reactivar limpia la racha y el motivo: si no, el primer fallo posterior
      // volvería a apagarlo al instante por una racha que ya no describe nada.
      // Y reactivar NO reencola lo perdido — para eso está el botón de reenviar.
      if (activo) cambios.push('failure_streak = 0', 'disabled_at = NULL', 'disabled_reason = NULL')
      else cambios.push('disabled_at = now()', "disabled_reason = 'Desactivado desde Conexiones'")
    }

    if (cambios.length > 0) {
      const actualizado = await query(
        `UPDATE events.webhook_endpoint
            SET ${cambios.join(', ')}, updated_at = now()
          WHERE id = $1 AND account_id = $2
          RETURNING id`,
        valores
      )
      if (actualizado.rowCount === 0) {
        res.status(HttpStatusCode.NotFound).json({ message: 'Webhook no encontrado.' })
        return
      }
    }

    if (req.body?.events !== undefined) {
      const { tipos, invalido } = tiposPedidos(req.body.events)
      if (invalido) {
        res.status(HttpStatusCode.BadRequest).json({ message: invalido })
        return
      }
      // Comprobación de pertenencia explícita: sin ella, alguien podría cambiar
      // las suscripciones de un endpoint ajeno pasando su id.
      const propio = await query(
        'SELECT 1 FROM events.webhook_endpoint WHERE id = $1 AND account_id = $2',
        [id, cuenta.id]
      )
      if (propio.rowCount === 0) {
        res.status(HttpStatusCode.NotFound).json({ message: 'Webhook no encontrado.' })
        return
      }
      await query(
        'DELETE FROM events.webhook_endpoint_event WHERE endpoint_id = $1 AND event_type <> ALL($2::text[])',
        [id, tipos]
      )
      await query(
        `INSERT INTO events.webhook_endpoint_event (endpoint_id, event_type)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [id, tipos]
      )
    }

    res.json({ ok: true })
  } catch (error) {
    fallo(res, error, 'Error actualizando el webhook')
  }
}

export async function borrarWebhook(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    const borrado = await query(
      'DELETE FROM events.webhook_endpoint WHERE id = $1 AND account_id = $2 RETURNING id',
      [req.params.id, cuenta.id]
    )
    if (borrado.rowCount === 0) {
      res.status(HttpStatusCode.NotFound).json({ message: 'Webhook no encontrado.' })
      return
    }
    res.json({ ok: true })
  } catch (error) {
    fallo(res, error, 'Error borrando el webhook')
  }
}

/**
 * Rota el secreto. Durante VENTANA_ROTACION_HORAS se firma con el nuevo Y con el
 * viejo, y el receptor acepta si alguna de las dos cuadra. Sin esa ventana,
 * rotar sería una caída coordinada: habría que cambiar el secreto en los dos
 * lados en el mismo instante.
 */
export async function rotarSecreto(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    if (!cifradoDisponible()) {
      res
        .status(HttpStatusCode.InternalServerError)
        .json({ message: 'El servidor no tiene clave para guardar secretos de webhook.' })
      return
    }

    const nuevo = generarSecreto()
    const actualizado = await query(
      `UPDATE events.webhook_endpoint
          SET prev_secret_ciphertext = secret_ciphertext,
              prev_secret_expires_at = now() + make_interval(hours => $4),
              secret_ciphertext = $3,
              secret_prefix = $5,
              secret_rotated_at = now(),
              updated_at = now()
        WHERE id = $1 AND account_id = $2
        RETURNING id`,
      [req.params.id, cuenta.id, cifrar(nuevo), VENTANA_ROTACION_HORAS, prefijoDeSecreto(nuevo)]
    )
    if (actualizado.rowCount === 0) {
      res.status(HttpStatusCode.NotFound).json({ message: 'Webhook no encontrado.' })
      return
    }

    res.json({
      secret: nuevo,
      secret_prefix: prefijoDeSecreto(nuevo),
      ventana_horas: VENTANA_ROTACION_HORAS,
      aviso: `Guarda este secreto ahora. Durante las próximas ${VENTANA_ROTACION_HORAS} horas los envíos llevan las dos firmas, la nueva y la anterior, para que puedas cambiarlo sin cortar nada.`
    })
  } catch (error) {
    fallo(res, error, 'Error rotando el secreto')
  }
}

export async function probarWebhook(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const filas = await query<{
      id: string
      url: string
      label: string | null
      secret_ciphertext: Buffer
      prev_secret_ciphertext: Buffer | null
      prev_secret_expires_at: Date | null
      include_message_body: boolean
    }>(
      `SELECT id, url, label, secret_ciphertext, prev_secret_ciphertext,
              prev_secret_expires_at, include_message_body
         FROM events.webhook_endpoint
        WHERE id = $1 AND account_id = $2`,
      [req.params.id, cuenta.id]
    )
    const endpoint = filas.rows[0]
    if (!endpoint) {
      res.status(HttpStatusCode.NotFound).json({ message: 'Webhook no encontrado.' })
      return
    }

    const resultado = await enviarPrueba({ ...endpoint, account_id: cuenta.id })
    res.json({
      ok: resultado.ok,
      status: resultado.statusCode ?? null,
      duracion_ms: resultado.durationMs,
      ip: resultado.resolvedIp ?? null,
      error_tipo: resultado.errorKind ?? null,
      // El motivo exacto, en español: un cliente con una URL legítima pero
      // bloqueada necesita saber por qué, no un fallo mudo.
      error: resultado.errorMessage ?? null,
      respuesta: resultado.responseExcerpt ?? null
    })
  } catch (error) {
    fallo(res, error, 'Error enviando el evento de prueba')
  }
}

export async function listarEntregas(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const limite = Math.min(Number(req.query.limit) || 50, 200)
    const filas = await query(
      `SELECT d.id, d.public_id, d.status, d.attempt_count, d.next_attempt_at,
              d.last_status_code, d.last_error_kind, d.last_error,
              d.created_at, d.completed_at,
              e.type, e.public_id AS event_public_id, e.occurred_at,
              (SELECT jsonb_build_object(
                        'attempt_number', a.attempt_number,
                        'requested_at',   a.requested_at,
                        'duration_ms',    a.duration_ms,
                        'resolved_ip',    a.resolved_ip,
                        'response_status', a.response_status,
                        'error_kind',     a.error_kind,
                        'error_message',  a.error_message,
                        'response_excerpt', a.response_excerpt)
                 FROM events.delivery_attempt a
                WHERE a.delivery_id = d.id
                ORDER BY a.attempt_number DESC LIMIT 1) AS ultimo_intento
         FROM events.delivery d
         JOIN events.event e ON e.id = d.event_id
         JOIN events.webhook_endpoint w ON w.id = d.endpoint_id
        WHERE d.endpoint_id = $1 AND w.account_id = $2
        ORDER BY d.created_at DESC
        LIMIT $3`,
      [req.params.id, cuenta.id, limite]
    )
    res.json({ deliveries: filas.rows })
  } catch (error) {
    fallo(res, error, 'Error listando las entregas')
  }
}

/**
 * Reencola UNA entrega. Crea un intento nuevo sobre la misma delivery, así que
 * el receptor la ve con el MISMO X-Lumintik-Delivery y su dedupe la reconoce.
 *
 * Es un solo intento: si vuelve a fallar no arranca otra vez el calendario
 * completo de reintentos. Reenviar es una acción manual, no una nueva entrega.
 */
export async function reenviarEntrega(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const actualizado = await query(
      `UPDATE events.delivery d
          SET status = 'pending', next_attempt_at = now(), completed_at = NULL
         FROM events.webhook_endpoint w
        WHERE d.id = $1
          AND d.endpoint_id = w.id
          AND w.account_id = $2
          AND d.status IN ('failed','exhausted','blocked','succeeded')
        RETURNING d.id`,
      [req.params.id, cuenta.id]
    )
    if (actualizado.rowCount === 0) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Esa entrega no existe, no es tuya, o ya está en curso.' })
      return
    }
    despertarWorker()
    res.json({ ok: true })
  } catch (error) {
    fallo(res, error, 'Error reenviando la entrega')
  }
}

// ---------------------------------------------------------------------------
//  Avisos por correo
// ---------------------------------------------------------------------------

export async function listarAvisos(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    const filas = await query(
      `SELECT id, to_email, event_type, is_active, timezone, send_at, created_at
         FROM events.email_preference
        WHERE account_id = $1
        ORDER BY to_email, event_type`,
      [cuenta.id]
    )
    res.json({
      preferences: filas.rows,
      // La pantalla lo dice en claro en vez de dejar al cliente activando
      // interruptores que no van a mandar nada.
      smtp_configurado: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      email_cuenta: cuenta.email
    })
  } catch (error) {
    fallo(res, error, 'Error listando los avisos por correo')
  }
}

export async function guardarAviso(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const destino = String(req.body?.to_email ?? '').trim().toLowerCase()
    const tipo = String(req.body?.event_type ?? '')
    if (!destino || !destino.includes('@')) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'El correo de destino no es válido.' })
      return
    }
    if (!esTipoValido(tipo) || !TIPOS_CON_CORREO.includes(tipo)) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: `El evento "${tipo}" no tiene aviso por correo.` })
      return
    }

    const zona = typeof req.body?.timezone === 'string' && req.body.timezone.trim()
      ? req.body.timezone.trim()
      : 'America/Bogota'
    // Se comprueba que la zona exista ANTES de guardarla: una zona inválida
    // rompería el cálculo del resumen diario cada minuto, en silencio.
    try {
      new Intl.DateTimeFormat('es-CO', { timeZone: zona }).format(new Date())
    } catch {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: `La zona horaria "${zona}" no existe.` })
      return
    }

    const hora = tipo === 'daily.summary'
      ? typeof req.body?.send_at === 'string' && /^\d{2}:\d{2}$/.test(req.body.send_at)
        ? req.body.send_at
        : '08:00'
      : null

    const fila = await query<{ id: string }>(
      `INSERT INTO events.email_preference (account_id, to_email, event_type, timezone, send_at, is_active)
       VALUES ($1,$2,$3,$4,$5::time,true)
       ON CONFLICT (account_id, to_email, event_type)
       DO UPDATE SET is_active = true, timezone = EXCLUDED.timezone,
                     send_at = EXCLUDED.send_at, updated_at = now()
       RETURNING id`,
      [cuenta.id, destino, tipo, zona, hora]
    )
    res.status(HttpStatusCode.Created).json({ id: fila.rows[0]?.id ?? null })
  } catch (error) {
    fallo(res, error, 'Error guardando el aviso por correo')
  }
}

export async function borrarAviso(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    const borrado = await query(
      'DELETE FROM events.email_preference WHERE id = $1 AND account_id = $2 RETURNING id',
      [req.params.id, cuenta.id]
    )
    if (borrado.rowCount === 0) {
      res.status(HttpStatusCode.NotFound).json({ message: 'Aviso no encontrado.' })
      return
    }
    res.json({ ok: true })
  } catch (error) {
    fallo(res, error, 'Error borrando el aviso')
  }
}

// ---------------------------------------------------------------------------
//  Actividad
// ---------------------------------------------------------------------------

/** Últimos eventos de la cuenta, para que la pantalla muestre que esto vive. */
export async function listarEventos(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)
    const limite = Math.min(Number(req.query.limit) || 25, 100)
    const filas = await query(
      `SELECT public_id, type, occurred_at,
              payload->'contact'->>'name'  AS contacto,
              payload->'contact'->>'phone' AS telefono,
              payload->'line'->>'label'    AS linea
         FROM events.event
        WHERE account_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [cuenta.id, limite]
    )
    res.json({ events: filas.rows })
  } catch (error) {
    fallo(res, error, 'Error listando los eventos')
  }
}

/**
 * El resumen de un día, calculado en el momento. Existe para que el cliente lo
 * pueda VER en la pantalla aunque no haya SMTP: el resumen es una consulta, y
 * verlo en la app no debería depender del correo.
 */
export async function getResumen(req: CustomRequest, res: Response): Promise<void> {
  try {
    const cuenta = await cuentaDe(req)
    if (!cuenta) return sinCuenta(res)

    const zona = typeof req.query.tz === 'string' && req.query.tz ? req.query.tz : 'America/Bogota'
    let dia: string
    if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      dia = req.query.date
    } else {
      const hoyLocal = await query<{ dia: string }>(
        'SELECT (now() AT TIME ZONE $1)::date::text AS dia',
        [zona]
      )
      dia = hoyLocal.rows[0]?.dia ?? new Date().toISOString().slice(0, 10)
    }

    const resumen = await construirResumen(cuenta.id, dia, zona)
    res.json(resumen)
  } catch (error) {
    fallo(res, error, 'Error calculando el resumen')
  }
}
