/**
 * =============================================================================
 *  CONSOLA DE ADMIN (/api/admin/console) — operación de la PLATAFORMA
 * =============================================================================
 *
 *  ┌───────────────────────────────────────────────────────────────────────────┐
 *  │  EL LÍMITE DE PRIVACIDAD, EN UNA FRASE                                    │
 *  │                                                                           │
 *  │  Un admin de la plataforma ve METADATOS —cuántos, cuándo, de qué tipo, si  │
 *  │  falló y por qué— y NUNCA CONTENIDO: qué se dijo, a quién, con qué prompt. │
 *  └───────────────────────────────────────────────────────────────────────────┘
 *
 *  No es una preferencia estética. Los clientes de esta plataforma tienen sus
 *  propios clientes, y las conversaciones que guardamos son de ELLOS. Que un
 *  empleado nuestro pueda leerlas para "dar soporte" es exactamente el riesgo
 *  que un cliente no puede aceptar.
 *
 *  QUÉ NO SE CONSULTA DESDE AQUÍ, Y DÓNDE VIVE:
 *    · crm.conversations.message                 -> el chat del cliente con su lead
 *    · app."Unsyncedcontact".lastmessagepreview  -> vista previa del último mensaje
 *    · events.event.payload->>'body' / 'preview' -> el cuerpo DENTRO del evento
 *    · crm.contacts.phone, "Unsyncedcontact".number -> la cartera del cliente
 *    · crm.lines."JWT", "NUMBER_ID", "WABA_ID"   -> credenciales de Meta del cliente
 *    · crm.lines."Telefono_contacto_1..4"        -> celulares del equipo del cliente
 *    · app."Agent".prompt (isGlobal = false)     -> propiedad intelectual del cliente
 *    · app."User".password                       -> hash de la contraseña
 *    · events.webhook_endpoint.secret_ciphertext -> secretos de firma
 *
 *  EL AVISO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTE ARCHIVO:
 *  events.capturar_conversacion() mete el mensaje COMPLETO en el payload del
 *  evento ('body' y 'preview'). Eso es correcto para el carril de webhooks —el
 *  cuerpo solo cruza la frontera si el cliente marca include_message_body—, pero
 *  significa que un `SELECT payload FROM events.event` desde una consola de admin
 *  es leer las conversaciones de todos los clientes. Por eso la actividad se lee
 *  de la VISTA app.admin_actividad, donde esas columnas no existen: el límite es
 *  SQL, no una promesa. Si alguien añade aquí una consulta a events.event
 *  directamente, está saltándose la decisión — que la revise.
 *
 *  De la conversación solo sale `largo_mensaje` (la longitud del texto), que
 *  resuelve el caso de soporte real —"al lead le llegó un mensaje vacío"— sin
 *  enseñar una sola palabra.
 *
 *  ACCESO: todas las rutas van con authenticateToken + isAdmin, y ese isAdmin
 *  RELEE el rol de la base (ver middleware/jwt.middleware.ts). Ocultar el enlace
 *  en el menú del front es cosmético: cualquiera edita localStorage. Quien manda
 *  es el 403 de aquí.
 * =============================================================================
 */

import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import type { CustomRequest } from '../interfaces/global.js'
import { query } from '../lib/db.js'
import {
  MS_IN_VCPU_MONTH,
  PRICE_PER_MB_NETWORK,
  PRICE_PER_VCPU
} from '../lib/constants.js'
import { CATALOGO } from '../services/events/catalog.js'

const TITULOS: Record<string, string> = Object.fromEntries(
  CATALOGO.map((e) => [e.tipo, e.titulo])
)

function fallo(res: Response, error: unknown, contexto: string): void {
  const mensaje = error instanceof Error ? error.message : String(error)
  console.error(`❌ ${contexto}:`, mensaje)
  res
    .status(HttpStatusCode.InternalServerError)
    .json({ message: `${contexto}: ${mensaje}` })
}

/** Lee un entero positivo del querystring con tope, para que nadie pida 10^9 filas. */
function limite(bruto: unknown, porDefecto: number, maximo: number): number {
  const n = Number(bruto)
  if (!Number.isFinite(n) || n <= 0) return porDefecto
  return Math.min(Math.floor(n), maximo)
}

/**
 * GET /api/admin/console/overview
 * Estado de la plataforma en una pantalla.
 */
export async function getOverview(_req: CustomRequest, res: Response) {
  try {
    // Las dos cifras de mensajes van JUNTAS a propósito: enseñan de un vistazo
    // cuánto tráfico queda FUERA del contador que cobra. El carril Meta no
    // incrementa app."UserMessageUsage" (no hay una sola referencia a esa tabla
    // en CRM-ms/src), así que un cliente 100% WhatsApp Business consume 0 según
    // el sistema de cobro por mucho que mueva.
    const { rows: resumen } = await query(
      `SELECT
         (SELECT count(*) FROM app."User")                                     AS usuarios,
         (SELECT count(*) FROM app."User" WHERE active)                        AS activos,
         (SELECT count(*) FROM app."User" WHERE email_verified_at IS NOT NULL) AS correo_verificado,
         (SELECT count(*) FROM app."WhatsAppNumber")                           AS numeros_qr,
         (SELECT count(*) FROM crm.lines WHERE is_active)                      AS lineas_meta,
         (SELECT COALESCE(SUM(usedmessages), 0) FROM app."UserMessageUsage"
            WHERE year  = EXTRACT(YEAR  FROM now())::int
              AND month = EXTRACT(MONTH FROM now())::int)                      AS mensajes_qr_mes,
         (SELECT count(*) FROM crm.conversations
            WHERE "timestamp" >= date_trunc('month', now()))                   AS mensajes_meta_mes`
    )

    const { rows: planes } = await query(
      `SELECT u.subscription                     AS plan,
              count(*)                           AS usuarios,
              MAX(pl.monthly_message_limit)      AS tope,
              COALESCE(SUM(umu.usedmessages), 0) AS mensajes_mes
         FROM app."User" u
         LEFT JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
         LEFT JOIN app."UserMessageUsage" umu
                ON umu.userid = u.id
               AND umu.year   = EXTRACT(YEAR  FROM now())::int
               AND umu.month  = EXTRACT(MONTH FROM now())::int
        GROUP BY 1
        ORDER BY 2 DESC`
    )

    // Topes VIGENTES tal cual están en la base. Se devuelven crudos porque son
    // la única fuente que se aplica de verdad (la lee app.increment_message_usage)
    // y hoy NO coinciden con lo que se le promete al cliente por otros dos
    // canales: el correo de límite de src/lib/constants.ts dice 10.000 mensajes
    // para INDUSTRIAL (la tabla cobra 50.000) y la página de planes del front
    // dice 50 para FREE y 2000 para BASIC (la tabla dice 100 y 1000). Uno de los
    // tres le miente al cliente; la consola enseña el que manda para que se vea.
    const { rows: topes } = await query(
      'SELECT plan_name, monthly_message_limit FROM app."PlanLimit" ORDER BY monthly_message_limit'
    )

    // Ingresos cobrados del mes. Se agrupa por moneda y NO se suman entre sí:
    // app.subscriptions guarda COP y USD en la misma columna y sumarlas daría un
    // número sin significado. `amount_paid` es numeric y el driver lo entrega
    // como string a propósito (ver src/lib/db.ts): pasarlo por Number perdería
    // centavos, así que viaja tal cual hasta la UI.
    const { rows: ingresos } = await query(
      `SELECT s.currency,
              count(*)                     AS pagos,
              SUM(s.amount_paid)::text     AS cobrado
         FROM app.subscriptions s
        WHERE s.status ILIKE 'paid'
          AND s.created_at >= date_trunc('month', now())
        GROUP BY 1`
    )

    res.json({
      resumen: resumen[0] ?? null,
      planes,
      topes,
      ingresos_mes: ingresos,
      notas: {
        mensajes:
          'mensajes_qr_mes es lo que se cobra (entrantes + envíos manuales + respuestas de IA). mensajes_meta_mes es tráfico real de WhatsApp Business que HOY no descuenta de ningún tope.',
        ingresos:
          'Ingreso cobrado, no margen. El costo por cliente no se puede calcular todavía: falta la tarifa de IA en app.ai_model_price y falta app."Telemetry".user_id para repartir infraestructura.'
      }
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo el resumen de plataforma')
  }
}

/**
 * GET /api/admin/console/users
 *
 * Tabla maestra. Devuelve ACTIVOS E INACTIVOS: el filtro lo pone el front.
 *
 * (El endpoint viejo GET /api/admin/users terminaba en `.eq('active', true)`, y
 * eso hacía inalcanzable a PATCH /api/admin/activate/:id — el usuario desactivado
 * no salía en ningún listado, así que no había de dónde sacar su id para volver
 * a activarlo. Aquí no se repite ese error.)
 *
 * Ninguna columna de esta consulta lleva contenido: ni mensajes, ni teléfonos de
 * leads, ni prompts. El hash de la contraseña tampoco se enumera.
 */
export async function getUsuarios(req: CustomRequest, res: Response) {
  try {
    const max = limite(req.query.limit, 200, 1000)
    const { rows } = await query(
      `SELECT u.id, u.username, u.email, u.role, u.active,
              u.subscription, u.subscription_updated_at, u."createdAt", u.email_verified_at,
              COALESCE(umu.usedmessages, 0)          AS usados_mes,
              COALESCE(pl.monthly_message_limit, 0)  AS tope,
              ROUND(100.0 * COALESCE(umu.usedmessages, 0)
                    / NULLIF(pl.monthly_message_limit, 0), 1)                     AS pct,
              (SELECT count(*) FROM app."WhatsAppNumber" n WHERE n."userId" = u.id) AS numeros_qr,
              (SELECT count(*) FROM crm.lines l WHERE l.user_id = u.id AND l.is_active) AS lineas_meta,
              (SELECT max(e.occurred_at) FROM events.event e WHERE e.account_id = u.id) AS ultima_actividad,
              (SELECT s.amount_paid::text FROM app.subscriptions s
                WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1)        AS ultimo_pago,
              (SELECT s.currency FROM app.subscriptions s
                WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1)        AS ultimo_pago_moneda
         FROM app."User" u
         LEFT JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
         LEFT JOIN app."UserMessageUsage" umu
                ON umu.userid = u.id
               AND umu.year   = EXTRACT(YEAR  FROM now())::int
               AND umu.month  = EXTRACT(MONTH FROM now())::int
        ORDER BY usados_mes DESC, u.id
        LIMIT $1`,
      [max]
    )
    // ROUND() devuelve `numeric`, y el driver entrega numeric como STRING para no
    // perder precisión (decisión deliberada de src/lib/db.ts, ver el comentario
    // sobre los montos). Un porcentaje no necesita esa exactitud y el front lo
    // compara con 80, así que se convierte aquí: si llegara como "85.0", la
    // comparación funcionaría por coerción hoy y se rompería el día que alguien
    // ordene por esa columna.
    res.json(
      rows.map((u) => ({
        ...(u as Record<string, unknown>),
        pct: u.pct === null ? null : Number(u.pct)
      }))
    )
  } catch (error) {
    fallo(res, error, 'Error listando usuarios')
  }
}

/**
 * GET /api/admin/console/users/:id
 *
 * Ficha de una cuenta. Es el sitio donde más tienta enseñar de más, así que aquí
 * la regla se aplica con lupa:
 *   · de los agentes se cuentan, NO se leen los prompts (son del cliente);
 *   · de los eventos se enseñan tipos y horas, NO cuerpos;
 *   · de los pagos se enseña todo, porque el pago es nuestro dato, no del lead.
 */
export async function getFichaUsuario(req: CustomRequest, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Id inválido' })
      return
    }

    const { rows: usuario } = await query(
      `SELECT u.id, u.username, u.email, u.role, u.active, u.subscription,
              u.subscription_updated_at, u."createdAt", u.email_verified_at,
              u."tokensPerResponse",
              COALESCE(umu.usedmessages, 0)         AS usados_mes,
              COALESCE(pl.monthly_message_limit, 0) AS tope,
              umu.updatedat                         AS ultimo_movimiento
         FROM app."User" u
         LEFT JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
         LEFT JOIN app."UserMessageUsage" umu
                ON umu.userid = u.id
               AND umu.year   = EXTRACT(YEAR  FROM now())::int
               AND umu.month  = EXTRACT(MONTH FROM now())::int
        WHERE u.id = $1`,
      [id]
    )
    if (!usuario[0]) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    // Capacidad instalada. `agentes_propios` se CUENTA y el prompt no se toca:
    // el prompt de un agente privado es la propiedad intelectual del cliente.
    const { rows: capacidad } = await query(
      `SELECT
         (SELECT count(*) FROM app."WhatsAppNumber" WHERE "userId" = $1)                    AS numeros_qr,
         (SELECT count(*) FROM app."WhatsAppNumber" WHERE "userId" = $1 AND "aiEnabled")    AS numeros_con_ia,
         (SELECT count(*) FROM crm.lines           WHERE user_id  = $1 AND is_active)       AS lineas_meta,
         (SELECT count(*) FROM app."Agent"         WHERE "ownerId" = $1 AND NOT "isGlobal") AS agentes_propios,
         (SELECT count(*) FROM app."Agent"         WHERE "ownerId" = $1 AND "allowAdvisor") AS agentes_con_escalamiento,
         (SELECT count(*) FROM crm.contacts c JOIN crm.lines l ON l.id = c.line_id
           WHERE l.user_id = $1)                                                            AS contactos_crm`,
      [id]
    )

    const { rows: historico } = await query(
      `SELECT make_date(m.year, m.month, 1) AS mes, m.usedmessages AS usados
         FROM app."UserMessageUsage" m
        WHERE m.userid = $1
          AND make_date(m.year, m.month, 1) >= date_trunc('month', now()) - interval '11 months'
        ORDER BY 1`,
      [id]
    )

    const { rows: pagos } = await query(
      `SELECT s.created_at, s.plan_name, s.status, s.dlo_status,
              s.amount::text, s.amount_paid::text, s.currency, s.payment_method, s.invoice_id
         FROM app.subscriptions s
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC
        LIMIT 50`,
      [id]
    )

    // Consumo de IA de la cuenta, 30 días. Mismo criterio que el panel del
    // cliente: si no hay filas es que no se medía, no que no se gastó.
    const { rows: ia } = await query(
      `SELECT COALESCE(SUM(prompt_tokens), 0) AS tokens_entrada,
              COALESCE(SUM(output_tokens), 0) AS tokens_salida,
              count(*)                        AS llamadas,
              count(*) FILTER (WHERE NOT ok)  AS fallidas,
              min(occurred_at)                AS midiendo_desde
         FROM app.ai_usage
        WHERE user_id = $1 AND occurred_at >= now() - interval '30 days'`,
      [id]
    )

    const { rows: eventos } = await query<{ type: string; n: number }>(
      `SELECT e.type, count(*) AS n
         FROM app.admin_actividad e
        WHERE e.account_id = $1
          AND e.occurred_at >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY 2 DESC`,
      [id]
    )

    res.json({
      usuario: usuario[0],
      capacidad: capacidad[0] ?? null,
      historico: historico.map((h) => ({ ...h, usados: Number(h.usados) })),
      pagos,
      ia: {
        medido: ia[0]?.midiendo_desde != null,
        ...ia[0]
      },
      eventos_por_tipo: eventos.map((e) => ({
        tipo: e.type,
        titulo: TITULOS[e.type] ?? e.type,
        n: Number(e.n)
      })),
      privacidad:
        'Esta ficha no incluye texto de conversaciones, teléfonos de leads ni prompts de agentes privados. Es una decisión de producto, no una limitación técnica.'
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo la ficha del usuario')
  }
}

/**
 * GET /api/admin/console/activity
 *
 * Actividad reciente de toda la plataforma, leída de app.admin_actividad.
 *
 * NO se consulta events.event directamente, y esto no es un detalle: el payload
 * de ese evento lleva el mensaje entero. La vista no tiene esa columna, así que
 * es imposible que se cuele por descuido en un `SELECT *`.
 */
export async function getActividad(req: CustomRequest, res: Response) {
  try {
    const max = limite(req.query.limit, 100, 500)
    const cuenta = req.query.accountId ? Number(req.query.accountId) : null

    const { rows } = await query(
      `SELECT a.occurred_at, a.account_id, a.username, a.type,
              a.linea, a.contacto_id, a.etapa_anterior, a.etapa_nueva,
              a.largo_mensaje
         FROM app.admin_actividad a
        WHERE ($1::int IS NULL OR a.account_id = $1)
        ORDER BY a.occurred_at DESC
        LIMIT $2`,
      [Number.isInteger(cuenta) ? cuenta : null, max]
    )

    res.json(
      rows.map((r) => ({
        ...(r as Record<string, unknown>),
        titulo: TITULOS[(r as { type: string }).type] ?? (r as { type: string }).type
      }))
    )
  } catch (error) {
    fallo(res, error, 'Error obteniendo la actividad')
  }
}

/**
 * GET /api/admin/console/health
 *
 * Errores y salud. Lo único ESTRUCTURADO que existe en toda la plataforma son
 * events.delivery / events.delivery_attempt: el resto de los fallos son
 * console.error y no hay tabla de errores de aplicación, ni latencias. Lo que
 * esta pantalla no enseña, no es que esté a cero — es que no se registra.
 */
export async function getSalud(req: CustomRequest, res: Response) {
  try {
    // Entregas fallidas por tipo de error (7 días).
    const { rows: fallos } = await query(
      `SELECT d.status, d.last_error_kind, count(*) AS n, max(d.created_at) AS ultimo
         FROM events.delivery d
        WHERE d.created_at >= now() - interval '7 days'
          AND d.status IN ('failed', 'exhausted', 'blocked')
        GROUP BY 1, 2
        ORDER BY n DESC`
    )

    // Cuentas afectadas. Se enseña el username, no el contenido del evento.
    const { rows: cuentasAfectadas } = await query(
      `SELECT e.account_id, u.username,
              count(*) FILTER (WHERE d.status = 'exhausted') AS agotadas,
              count(*) FILTER (WHERE d.status = 'blocked')   AS bloqueadas
         FROM events.delivery d
         JOIN events.event e ON e.id = d.event_id
         LEFT JOIN app."User" u ON u.id = e.account_id
        WHERE d.created_at >= now() - interval '7 days'
        GROUP BY 1, 2
       HAVING count(*) FILTER (WHERE d.status IN ('exhausted', 'blocked')) > 0
        ORDER BY agotadas DESC
        LIMIT 50`
    )

    // Cola de entregas viva (usa el índice parcial delivery_cola_idx).
    const { rows: cola } = await query(
      `SELECT status, count(*) AS n, min(next_attempt_at) AS proxima
         FROM events.delivery
        WHERE status IN ('pending', 'failed', 'delivering')
        GROUP BY 1`
    )

    // Datos rotos: eventos sin dueño y su causa típica. crm.lines.user_id es
    // NULLABLE y no hay ningún INSERT INTO crm.lines en los tres repos — las
    // líneas se crean a mano —, así que una línea sin user_id deja huérfano
    // todo lo que cuelgue de ella.
    const { rows: huerfanos } = await query(
      `SELECT count(*) AS eventos_huerfanos, min(occurred_at) AS desde, max(occurred_at) AS hasta
         FROM events.evento_sin_dueno`
    )
    const { rows: lineasSinDueno } = await query(
      `SELECT id, number, "NOMBRE_LINEA" AS nombre, is_active
         FROM crm.lines WHERE user_id IS NULL LIMIT 50`
    )

    // Mantenimiento y tamaño de la tabla que más crece (una fila por request).
    const { rows: mantenimiento } = await query(
      'SELECT job, last_run_at, rows_deleted FROM app.maintenance_log ORDER BY job'
    )
    const { rows: telemetria } = await query(
      `SELECT count(*) AS filas,
              min("timeStamp") AS mas_antigua,
              pg_size_pretty(pg_total_relation_size('app."Telemetry"')) AS tamano
         FROM app."Telemetry"`
    )

    res.json({
      entregas_fallidas: fallos,
      cuentas_afectadas: cuentasAfectadas,
      cola: cola,
      eventos_huerfanos: huerfanos[0] ?? null,
      lineas_sin_dueno: lineasSinDueno,
      mantenimiento,
      telemetria: telemetria[0] ?? null,
      no_medido: [
        'Errores de aplicación: no hay tabla. Todo es console.error, así que solo se ven en los logs de Railway.',
        'Latencia de las peticiones: no se registra en ningún sitio.',
        'Costo de Meta: Meta cobra por conversación de 24 h y no se guarda la respuesta del envío (conversation id, categoría de precio). Cero rastro.'
      ]
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo la salud de la plataforma')
  }
}

/**
 * GET /api/admin/console/commercial
 * Las dos listas accionables: quién se está quedando sin cupo y quién se apagó.
 */
export async function getComercial(req: CustomRequest, res: Response) {
  try {
    // Al borde del tope. Se cruza contra PlanLimit y no contra un número fijo:
    // el umbral es el 80 % del tope REAL de cada plan.
    const { rows: alBorde } = await query<{ pct: string | null }>(
      `SELECT u.id, u.username, u.email, u.subscription,
              umu.usedmessages, pl.monthly_message_limit,
              ROUND(100.0 * umu.usedmessages / NULLIF(pl.monthly_message_limit, 0), 1) AS pct
         FROM app."UserMessageUsage" umu
         JOIN app."User"      u  ON u.id = umu.userid
         JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
        WHERE umu.year  = EXTRACT(YEAR  FROM now())::int
          AND umu.month = EXTRACT(MONTH FROM now())::int
          AND pl.monthly_message_limit > 0
          AND umu.usedmessages >= 0.8 * pl.monthly_message_limit
        ORDER BY pct DESC
        LIMIT 100`
    )

    // Cuentas mudas. OJO con leer esta lista: "sin actividad" quiere decir sin
    // EVENTOS, y los eventos tienen 90 días de retención. Una cuenta creada hace
    // un rato y otra que lleva un año parada salen iguales (ultima_actividad
    // NULL); por eso viaja también createdAt, para poder distinguirlas en la UI.
    const { rows: mudas } = await query(
      `SELECT u.id, u.username, u.subscription, u."createdAt",
              max(e.occurred_at) AS ultima_actividad
         FROM app."User" u
         LEFT JOIN events.event e ON e.account_id = u.id
        WHERE u.active
        GROUP BY 1, 2, 3, 4
       HAVING max(e.occurred_at) IS NULL
           OR max(e.occurred_at) < now() - interval '7 days'
        ORDER BY ultima_actividad NULLS FIRST
        LIMIT 100`
    )

    res.json({
      // Mismo motivo que en la tabla maestra: ROUND() viaja como numeric/string.
      al_borde_del_tope: alBorde.map((u) => ({
        ...(u as Record<string, unknown>),
        pct: u.pct === null ? null : Number(u.pct)
      })),
      cuentas_mudas: mudas,
      nota:
        'Las cuentas mudas se miden por eventos, que se purgan a los 90 días. Y el consumo que las ordena no incluye el carril Meta: un cliente 100% WhatsApp Business puede aparecer mudo y estar trabajando.'
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo la vista comercial')
  }
}

/**
 * GET /api/admin/console/infra
 *
 * Infraestructura. Va SOLO aquí y nunca en el panel de un cliente, porque
 * app."Telemetry" NO TIENE user_id: no hay forma honesta de decirle a un cliente
 * cuánta infraestructura consumió.
 *
 * LA TRAMPA DE LA RAM, que hay que decir en voz alta:
 * `ramUsageMB` es process.memoryUsage().rss — la huella del PROCESO ENTERO en
 * ese instante, no la memoria del request. stats.controller.ts y
 * app.telemetry_summary hacen SUM("ramUsageMB"), o sea suman el mismo RSS una
 * vez por request: el `totalRamGB` que devuelve GET /api/stats/price no tiene
 * unidad física, crece con el tráfico y no con la memoria. Aquí se usan AVG y
 * MAX, que es lo único que significa algo, y el término de RAM se OMITE del
 * costo: multiplicar por un precio una cantidad que no es una cantidad de RAM
 * daría un número con aspecto de dinero y sin relación con ninguno.
 */
export async function getInfra(_req: CustomRequest, res: Response) {
  try {
    const { rows: diario } = await query(
      `SELECT date_trunc('day', "timeStamp") AS dia,
              count(*)                       AS requests,
              SUM("cpuUsageMs") / 1000.0     AS cpu_segundos,
              SUM("networkEgressKB") / 1024.0 AS egress_mb,
              AVG("ramUsageMB")              AS rss_medio_mb,
              MAX("ramUsageMB")              AS rss_pico_mb
         FROM app."Telemetry"
        WHERE "timeStamp" >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY 1`
    )

    const { rows: paises } = await query(
      `SELECT country, count(*) AS requests
         FROM app."Telemetry"
        WHERE "timeStamp" >= now() - interval '30 days' AND country <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`
    )

    const { rows: mes } = await query<{
      cpu_ms: string
      egress_kb: string
      requests: number
    }>(
      `SELECT COALESCE(SUM("cpuUsageMs"), 0)      AS cpu_ms,
              COALESCE(SUM("networkEgressKB"), 0) AS egress_kb,
              count(*)                            AS requests
         FROM app."Telemetry"
        WHERE "timeStamp" >= date_trunc('month', now())`
    )

    const cpuMs = Number(mes[0]?.cpu_ms ?? 0)
    const egressKb = Number(mes[0]?.egress_kb ?? 0)
    const costoCpu = (cpuMs / MS_IN_VCPU_MONTH) * PRICE_PER_VCPU
    const costoRed = (egressKb / 1024) * PRICE_PER_MB_NETWORK

    res.json({
      diario,
      paises,
      mes_en_curso: {
        requests: Number(mes[0]?.requests ?? 0),
        cpu_vcpu_mes: cpuMs / MS_IN_VCPU_MONTH,
        egress_mb: egressKb / 1024,
        costo_cpu_usd: costoCpu,
        costo_red_usd: costoRed,
        costo_total_usd: costoCpu + costoRed,
        // Sin esto el número de arriba se leería como una factura, y no lo es.
        advertencia:
          'ESTIMACIÓN, no factura. Los precios por vCPU y por MB están escritos a fuego en src/lib/constants.ts y no salen de ninguna factura de Railway: hay que contrastarlos antes de llamar "costo" a esto. Se omite el término de RAM a propósito: SUM(rss) no es una cantidad de memoria.'
      },
      por_cliente: null,
      por_cliente_falta:
        'app."Telemetry" no tiene user_id, ni ruta, ni código de estado, ni duración: el middleware solo guarda ip/ciudad/país/cpu/ram/egress. Con un ALTER TABLE ... ADD COLUMN user_id integer (nullable, sin FK para no encarecer el insert) relleno desde el token ya verificado, el reparto de infraestructura dejaría de ser un prorrateo y pasaría a ser una medición.'
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo la infraestructura')
  }
}

/**
 * PATCH /api/admin/console/users/:id/plan — cambia el plan de una cuenta.
 *
 * Es la única escritura de esta consola. Existe porque el plan no se podía mover por
 * ningún camino: la pantalla de pagos depende de dLocal (sin credenciales todavía) y el
 * Postgres de Railway no expone puerto público, así que ni a mano. Un plan mal puesto deja
 * a un cliente que ya pagó tope de FREE.
 *
 * El plan se valida contra app."PlanLimit", no contra una lista escrita acá: si mañana se
 * agrega un plan a la tabla, este endpoint lo acepta sin tocar código. El CHECK de la
 * columna sigue siendo la última palabra.
 */
export async function cambiarPlan(req: CustomRequest, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Id inválido' })
      return
    }
    const plan = String(req.body?.plan ?? '').trim().toUpperCase()
    if (!plan) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Falta el plan.' })
      return
    }

    const { rows: planes } = await query(
      'SELECT plan_name, monthly_message_limit FROM app."PlanLimit" WHERE plan_name = $1',
      [plan]
    )
    if (!planes.length) {
      const { rows: validos } = await query(
        'SELECT plan_name FROM app."PlanLimit" ORDER BY monthly_message_limit'
      )
      res.status(HttpStatusCode.BadRequest).json({
        message: `Plan desconocido: ${plan}.`,
        planes_validos: validos.map((p) => p.plan_name)
      })
      return
    }

    const { rows } = await query(
      `UPDATE app."User"
          SET subscription = $1, subscription_updated_at = now(), "updatedAt" = now()
        WHERE id = $2
        RETURNING id, email, subscription`,
      [plan, id]
    )
    if (!rows.length) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    console.log(
      `[admin] plan de la cuenta ${id} cambiado a ${plan} por el admin ${req.user?.username ?? '?'}`
    )
    res.json({
      ...rows[0],
      tope_mensual: planes[0]?.monthly_message_limit ?? null
    })
  } catch (error) {
    fallo(res, error, 'Error cambiando el plan')
  }
}
