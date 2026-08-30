/**
 * =============================================================================
 *  API DEL PANEL DE CONSUMO (/api/usage) — lo que ve el CLIENTE de su cuenta
 * =============================================================================
 *
 *  REGLA DE AISLAMIENTO, sin excepciones:
 *  el id de la cuenta sale SIEMPRE del token (resolviendo el username, porque el
 *  JWT solo lleva { username, role } — auth.controller.ts). NUNCA de la ruta ni
 *  del querystring. No hay ningún `?userId=` que honrar aquí: si mañana hiciera
 *  falta que un admin mire el consumo de otro, va por /api/admin/console, que
 *  pasa por isAdmin. Mezclar los dos casos en un mismo endpoint con un parámetro
 *  opcional es la forma más fácil de filtrar datos entre cuentas.
 *
 *  REGLA DE HONESTIDAD (la que manda en todo este archivo):
 *  no se devuelve ni un número estimado disfrazado de medición. Cada bloque de
 *  la respuesta trae su propia bandera de si el dato EXISTE de verdad, y cuando
 *  no existe se dice qué haría falta para que existiera. Ver `ia` más abajo:
 *  mientras nadie cargue la tarifa en app.ai_model_price, el costo va como
 *  "no disponible" y NO como un número inventado.
 *
 *  QUÉ CUENTA REALMENTE "MENSAJES" — hay que decirlo en la UI o la cifra miente:
 *  app.increment_message_usage se llama en TRES sitios de messages.controller.ts:
 *  el envío manual, el mensaje ENTRANTE del lead y la respuesta de la IA. O sea
 *  "mensaje" = evento de tráfico, no mensaje enviado: un ida y vuelta con IA
 *  consume 2. Y el carril de WhatsApp Business (Meta, CRM-ms) NO incrementa nada
 *  — no hay una sola referencia a UserMessageUsage en todo CRM-ms/src —, así que
 *  un cliente 100% Meta consume 0 según el contador. Por eso el panel enseña el
 *  tráfico Meta REAL al lado, contado desde crm.conversations.
 * =============================================================================
 */

import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import type { CustomRequest } from '../interfaces/global.js'
import { query } from '../lib/db.js'
import { CATALOGO } from '../services/events/catalog.js'

/** Rótulos legibles de los tipos de evento. Se reusan los que ya escribe el catálogo. */
const TITULOS: Record<string, string> = Object.fromEntries(
  CATALOGO.map((e) => [e.tipo, e.titulo])
)

/**
 * Resuelve la cuenta del token. Devuelve null si el username no existe (token
 * viejo de un usuario borrado), y el llamador responde 404.
 */
async function cuentaDelToken(
  req: CustomRequest
): Promise<{ id: number; subscription: string } | null> {
  const username = req.user?.username
  if (!username) return null
  const { rows } = await query<{ id: number; subscription: string }>(
    'SELECT id, subscription FROM app."User" WHERE username = $1',
    [username]
  )
  return rows[0] ?? null
}

function fallo(res: Response, error: unknown, contexto: string): void {
  const mensaje = error instanceof Error ? error.message : String(error)
  console.error(`❌ ${contexto}:`, mensaje)
  res
    .status(HttpStatusCode.InternalServerError)
    .json({ message: `${contexto}: ${mensaje}` })
}

/**
 * GET /api/usage/summary
 *
 * Todo lo que es "este mes": mensajes contra el tope, ritmo, capacidad instalada,
 * contactos y consumo de IA. Va en una sola respuesta porque el panel las pinta
 * juntas y seis peticiones para seis tarjetas es peor para todos.
 */
export async function getResumenConsumo(req: CustomRequest, res: Response) {
  try {
    const cuenta = await cuentaDelToken(req)
    if (!cuenta) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const id = cuenta.id

    // ---------------------------------------------------------------------
    // Mensajes del mes contra el tope + ritmo.
    //
    // No se llama a app.get_user_message_usage() aunque exista: esa función
    // devuelve las cuatro columnas del chequeo de envío y aquí hacen falta
    // además `updatedat` (¿está viva la cuenta?) y los días del mes para la
    // proyección. Es la MISMA lógica de tope (LEFT JOIN a PlanLimit, COALESCE
    // a 0), en una sola ida a la base en vez de dos.
    //
    // La proyección se marca como CÁLCULO en la respuesta, no como dato:
    // extrapola linealmente y un cliente que arrancó ayer sale disparado.
    // ---------------------------------------------------------------------
    const { rows: mensualRows } = await query<{
      plan: string
      usados: number
      tope: number
      pct: string | null
      ultimo_movimiento: string | null
      dia_del_mes: number
      dias_del_mes: number
      proyeccion_fin_mes: number
    }>(
      `SELECT u.subscription                                   AS plan,
              COALESCE(umu.usedmessages, 0)                    AS usados,
              COALESCE(pl.monthly_message_limit, 0)            AS tope,
              ROUND(100.0 * COALESCE(umu.usedmessages, 0)
                    / NULLIF(pl.monthly_message_limit, 0), 1)  AS pct,
              umu.updatedat                                    AS ultimo_movimiento,
              EXTRACT(DAY FROM now())::int                     AS dia_del_mes,
              EXTRACT(DAY FROM (date_trunc('month', now())
                                + interval '1 month - 1 day'))::int AS dias_del_mes,
              CEIL(COALESCE(umu.usedmessages, 0)
                   * EXTRACT(DAY FROM (date_trunc('month', now())
                                       + interval '1 month - 1 day'))
                   / GREATEST(EXTRACT(DAY FROM now()), 1))::int    AS proyeccion_fin_mes
         FROM app."User" u
         LEFT JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
         LEFT JOIN app."UserMessageUsage" umu
                ON umu.userid = u.id
               AND umu.year   = EXTRACT(YEAR  FROM now())::int
               AND umu.month  = EXTRACT(MONTH FROM now())::int
        WHERE u.id = $1`,
      [id]
    )
    const mensual = mensualRows[0]

    // ---------------------------------------------------------------------
    // Capacidad instalada y universo de contactos.
    //
    // Los contactos van por dos caminos distintos porque son dos productos
    // distintos: SyncedContactOrGroup/Unsyncedcontact cuelgan del número QR, y
    // crm.contacts cuelga de la línea de Meta. Sumarlos en una sola cifra
    // escondería justo lo que el cliente necesita ver.
    // ---------------------------------------------------------------------
    const { rows: capacidadRows } = await query<{
      numeros_qr: number
      numeros_con_ia: number
      lineas_meta: number
      agentes_propios: number
      sincronizados: number
      espontaneos: number
      contactos_crm: number
    }>(
      `SELECT
         (SELECT count(*) FROM app."WhatsAppNumber" WHERE "userId" = $1)                    AS numeros_qr,
         (SELECT count(*) FROM app."WhatsAppNumber" WHERE "userId" = $1 AND "aiEnabled")    AS numeros_con_ia,
         (SELECT count(*) FROM crm.lines           WHERE user_id  = $1 AND is_active)       AS lineas_meta,
         (SELECT count(*) FROM app."Agent"         WHERE "ownerId" = $1 AND NOT "isGlobal") AS agentes_propios,
         (SELECT count(*) FROM app."SyncedContactOrGroup" s
            JOIN app."WhatsAppNumber" n ON n.id = s."numberId" WHERE n."userId" = $1)       AS sincronizados,
         (SELECT count(*) FROM app."Unsyncedcontact" uc
            JOIN app."WhatsAppNumber" n ON n.id = uc.numberid  WHERE n."userId" = $1)       AS espontaneos,
         (SELECT count(*) FROM crm.contacts c
            JOIN crm.lines l ON l.id = c.line_id               WHERE l.user_id  = $1)       AS contactos_crm`,
      [id]
    )

    // ---------------------------------------------------------------------
    // Tráfico REAL del carril Meta este mes. Es la cifra que demuestra lo que
    // el contador de arriba NO cuenta.
    //
    // El JOIN entra por el CONTACTO y no por conversations.line_id a propósito:
    // los mensajes del bot se guardan con line_id NULL (documentado en
    // db/schema.sql, crm.conversations). Filtrar por c.line_id perdería
    // exactamente las respuestas de la IA, que es la mitad del tráfico.
    // ---------------------------------------------------------------------
    const { rows: metaMesRows } = await query<{ mensajes_meta_mes: number }>(
      `SELECT count(*) AS mensajes_meta_mes
         FROM crm.conversations c
         JOIN crm.contacts ct ON ct.id = c.contact_id
         JOIN crm.lines    l  ON l.id  = ct.line_id
        WHERE l.user_id = $1
          AND c."timestamp" >= date_trunc('month', now())`,
      [id]
    )

    // ---------------------------------------------------------------------
    // Consumo de IA del mes.
    //
    // La tabla app.ai_usage se creó con este trabajo y empieza vacía: ANTES DE
    // HOY NO SE MEDÍA NADA. Por eso la respuesta lleva `midiendo_desde`: si no
    // hay ninguna fila, la UI tiene que decir "empezó a medirse ahora", no
    // "gastaste 0". No es lo mismo.
    //
    // El costo se valora con la tarifa VIGENTE en la fecha de cada llamada
    // (JOIN LATERAL a ai_model_price). Los tokens cacheados son un SUBCONJUNTO
    // de prompt_tokens —así los devuelve Gemini—, así que se restan antes de
    // valorarlos aparte; sumarlos por separado los cobraría dos veces.
    // `modelos_sin_tarifa` es lo que hace que esto no mienta: si algún modelo no
    // tiene precio cargado, la UI enseña los tokens y dice que el costo no está
    // disponible, en vez de enseñar un costo parcial que parece total.
    // ---------------------------------------------------------------------
    const { rows: iaRows } = await query<{
      llamadas: number
      fallidas: number
      tokens_entrada: number
      tokens_salida: number
      tokens_cache: number
      costo_usd: string | null
      modelos_sin_tarifa: string[] | null
      midiendo_desde: string | null
    }>(
      `WITH uso AS (
         SELECT a.*
           FROM app.ai_usage a
          WHERE a.user_id = $1
            AND a.occurred_at >= date_trunc('month', now())
       ),
       valorado AS (
         SELECT u.model,
                p.input_usd_per_1m,
                p.output_usd_per_1m,
                p.cached_usd_per_1m,
                u.prompt_tokens, u.output_tokens, u.cached_tokens
           FROM uso u
           LEFT JOIN LATERAL (
             SELECT p2.input_usd_per_1m, p2.output_usd_per_1m, p2.cached_usd_per_1m
               FROM app.ai_model_price p2
              WHERE p2.model = u.model
                AND p2.valid_from <= u.occurred_at::date
              ORDER BY p2.valid_from DESC
              LIMIT 1
           ) p ON true
       )
       SELECT (SELECT count(*) FROM uso)                                  AS llamadas,
              (SELECT count(*) FROM uso WHERE NOT ok)                     AS fallidas,
              (SELECT COALESCE(SUM(prompt_tokens), 0) FROM uso)           AS tokens_entrada,
              (SELECT COALESCE(SUM(output_tokens), 0) FROM uso)           AS tokens_salida,
              (SELECT COALESCE(SUM(cached_tokens), 0) FROM uso)           AS tokens_cache,
              (SELECT CASE WHEN bool_and(input_usd_per_1m IS NOT NULL)
                           THEN SUM(
                                  (prompt_tokens - cached_tokens) / 1e6 * input_usd_per_1m
                                + cached_tokens / 1e6 * COALESCE(cached_usd_per_1m, input_usd_per_1m)
                                + output_tokens  / 1e6 * output_usd_per_1m)
                      END
                 FROM valorado)                                           AS costo_usd,
              (SELECT array_agg(DISTINCT model)
                 FROM valorado WHERE input_usd_per_1m IS NULL)            AS modelos_sin_tarifa,
              (SELECT min(occurred_at) FROM app.ai_usage WHERE user_id = $1) AS midiendo_desde`,
      [id]
    )
    const ia = iaRows[0]

    res.json({
      plan: {
        nombre: mensual?.plan ?? cuenta.subscription,
        // El tope que se aplica DE VERDAD sale de app."PlanLimit", que es lo que
        // lee app.increment_message_usage. Ojo: los textos de marketing no
        // coinciden con esta tabla (el correo de límite promete 10.000 mensajes
        // para INDUSTRIAL y la tabla cobra 50.000; la página de planes del front
        // dice 50 para FREE y 2000 para BASIC, y la tabla dice 100 y 1000).
        // Aquí se enseña SIEMPRE el número que manda, que es este.
        tope: Number(mensual?.tope ?? 0),
        tope_configurado: Number(mensual?.tope ?? 0) > 0
      },
      mensajes: {
        usados: Number(mensual?.usados ?? 0),
        pct: mensual?.pct === null ? null : Number(mensual?.pct),
        ultimo_movimiento: mensual?.ultimo_movimiento ?? null,
        // Este texto NO es decorativo: sin él la tarjeta miente. Va desde el
        // servidor para que no se pueda quitar de la UI por descuido.
        que_cuenta:
          'Cuenta mensajes entrantes, envíos manuales y respuestas de la IA. Hoy NO incluye el tráfico de WhatsApp Business (Meta).'
      },
      ritmo: {
        es_calculo: true,
        dia_del_mes: Number(mensual?.dia_del_mes ?? 0),
        dias_del_mes: Number(mensual?.dias_del_mes ?? 0),
        proyeccion_fin_mes: Number(mensual?.proyeccion_fin_mes ?? 0),
        metodo:
          'Extrapolación lineal: usados / días transcurridos × días del mes. No es una predicción.'
      },
      capacidad: capacidadRows[0] ?? null,
      meta: {
        mensajes_mes: Number(metaMesRows[0]?.mensajes_meta_mes ?? 0),
        nota:
          'Tráfico real de WhatsApp Business contado en crm.conversations. NO descuenta del tope: el carril de Meta no incrementa el contador de mensajes.'
      },
      ia: {
        // `medido` distingue "no gastaste" de "no se medía". Antes de este
        // trabajo el consumo de IA no se guardaba en ninguna tabla.
        medido: ia?.midiendo_desde != null,
        midiendo_desde: ia?.midiendo_desde ?? null,
        llamadas: Number(ia?.llamadas ?? 0),
        fallidas: Number(ia?.fallidas ?? 0),
        tokens_entrada: Number(ia?.tokens_entrada ?? 0),
        tokens_salida: Number(ia?.tokens_salida ?? 0),
        tokens_cache: Number(ia?.tokens_cache ?? 0),
        costo_usd: ia?.costo_usd == null ? null : Number(ia.costo_usd),
        modelos_sin_tarifa: ia?.modelos_sin_tarifa ?? [],
        falta:
          ia?.costo_usd == null
            ? 'Falta cargar la tarifa del modelo en app.ai_model_price (nace vacía a propósito: un precio inventado convertiría el margen en ficción).'
            : null
      }
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo el resumen de consumo')
  }
}

/**
 * GET /api/usage/series
 *
 * Lo que necesita el tiempo: histórico de 12 meses, tráfico Meta diario de 30
 * días, eventos por tipo y el feed de actividad reciente.
 */
export async function getSeriesConsumo(req: CustomRequest, res: Response) {
  try {
    const cuenta = await cuentaDelToken(req)
    if (!cuenta) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const id = cuenta.id

    // ---------------------------------------------------------------------
    // Serie histórica de 12 meses.
    //
    // La respuesta NO trae un tope por mes, y es deliberado: el plan que tenía
    // la cuenta hace seis meses NO SE GUARDA EN NINGUNA PARTE. app."User" solo
    // tiene `subscription` (el actual) y `subscription_updated_at` (un único
    // timestamp del último cambio). Dibujar la línea del tope actual sobre los
    // meses pasados sería inventar historia; la UI la pinta solo sobre el mes en
    // curso y la rotula "tope del plan actual".
    // ---------------------------------------------------------------------
    const { rows: historico } = await query<{ mes: string; usados: number }>(
      `SELECT make_date(m.year, m.month, 1) AS mes,
              m.usedmessages                AS usados
         FROM app."UserMessageUsage" m
        WHERE m.userid = $1
          AND make_date(m.year, m.month, 1) >= date_trunc('month', now()) - interval '11 months'
        ORDER BY 1`,
      [id]
    )

    // Tráfico Meta diario, apilado por quién habló. Mismo JOIN por contacto que
    // en el resumen, y por el mismo motivo (los mensajes del bot van con
    // line_id NULL).
    const { rows: metaDiario } = await query<{
      dia: string
      sender: string
      mensajes: number
    }>(
      `SELECT date_trunc('day', c."timestamp") AS dia,
              c.sender,
              count(*)                         AS mensajes
         FROM crm.conversations c
         JOIN crm.contacts ct ON ct.id = c.contact_id
         JOIN crm.lines    l  ON l.id  = ct.line_id
        WHERE l.user_id = $1
          AND c."timestamp" >= now() - interval '30 days'
        GROUP BY 1, 2
        ORDER BY 1`,
      [id]
    )

    // Qué pasó, por tipo, en 30 días. Los eventos tienen 90 días de retención
    // (events.purgar_retencion), así que esta ventana siempre está completa.
    const { rows: eventosPorTipo } = await query<{ type: string; n: number }>(
      `SELECT e.type, count(*) AS n
         FROM events.event e
        WHERE e.account_id = $1
          AND e.occurred_at >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY 2 DESC`,
      [id]
    )

    // Feed de actividad. Aquí SÍ puede ir el nombre del contacto: es el panel
    // del propio cliente y ese contacto es suyo. En la consola de admin no —
    // ver la vista app.admin_actividad, que directamente no tiene la columna.
    const { rows: feed } = await query<{
      occurred_at: string
      type: string
      linea: string | null
      contacto: string | null
      etapa_anterior: string | null
      etapa_nueva: string | null
    }>(
      `SELECT e.occurred_at,
              e.type,
              e.payload->'line'->>'label'    AS linea,
              e.payload->'contact'->>'name'  AS contacto,
              e.payload->>'from_stage'       AS etapa_anterior,
              e.payload->>'to_stage'         AS etapa_nueva
         FROM events.event e
        WHERE e.account_id = $1
        ORDER BY e.occurred_at DESC
        LIMIT 50`,
      [id]
    )

    res.json({
      historico: historico.map((h) => ({
        mes: h.mes,
        usados: Number(h.usados)
      })),
      historico_nota:
        'El tope de meses anteriores no se puede saber: solo se guarda el plan actual y la fecha del último cambio.',
      meta_diario: metaDiario.map((m) => ({
        dia: m.dia,
        sender: m.sender,
        mensajes: Number(m.mensajes)
      })),
      eventos_por_tipo: eventosPorTipo.map((e) => ({
        tipo: e.type,
        titulo: TITULOS[e.type] ?? e.type,
        n: Number(e.n)
      })),
      feed: feed.map((f) => ({ ...f, titulo: TITULOS[f.type] ?? f.type }))
    })
  } catch (error) {
    fallo(res, error, 'Error obteniendo las series de consumo')
  }
}
