-- =============================================================================
--  001 · DIAGNÓSTICO — SOLO LECTURA, no modifica nada
-- =============================================================================
--
--  Correr esto PRIMERO, contra la base de producción, y guardar la salida.
--  Cada consulta responde a una pregunta concreta: "¿esta restricción se puede
--  poner sin romper nada?". db/schema.sql ya hace estas mismas comprobaciones en
--  cada arranque y deja avisos en el log; esto es lo mismo pero pudiendo leer los
--  valores exactos que están estorbando.
--
--    psql "$DATABASE_URL" -f db/migrations/001_diagnostico.sql
--
--  Nada de aquí escribe. Se puede correr en cualquier momento, con la app viva.
-- =============================================================================

\echo '=== 1) ¿Qué restricciones dejó pendientes el arranque? ==='
-- Si la fila NO aparece, esa restricción ya está puesta y no hay nada que hacer.
SELECT 'FALTA: ' || nombre AS pendiente
FROM (VALUES
  ('user_subscription_fkey       (User.subscription -> PlanLimit)'),
  ('subscriptions_user_id_fkey   (subscriptions.user_id -> User, RESTRICT)'),
  ('agent_owner_fkey             (Agent.ownerId -> User, SET NULL)'),
  ('lines_user_id_fkey           (crm.lines.user_id -> User)'),
  ('events_user_id_fkey          (crm.events.id_de_usuario -> User)'),
  ('contacts_user_id_fkey        (crm.contacts.user_id -> User)'),
  ('conversations_user_id_fkey   (crm.conversations.user_id -> User)')
) AS t(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = split_part(nombre, ' ', 1)
);

\echo '=== 2) ids de usuario huérfanos (lo que bloquea las FK de arriba) ==='
-- Un id que aparece en crm.* pero que no existe en app."User".
-- OJO con el DEFAULT 2 de crm.contacts y crm.conversations: si el usuario 2 no
-- existe, TODAS las filas nuevas son huérfanas y la FK no se puede poner.
SELECT 'crm.lines'         AS tabla, l.user_id       AS id_huerfano, count(*) AS filas
  FROM crm.lines l LEFT JOIN app."User" u ON u.id = l.user_id
 WHERE l.user_id IS NOT NULL AND u.id IS NULL GROUP BY 2
UNION ALL
SELECT 'crm.events',        e.id_de_usuario, count(*)
  FROM crm.events e LEFT JOIN app."User" u ON u.id = e.id_de_usuario
 WHERE e.id_de_usuario IS NOT NULL AND u.id IS NULL GROUP BY 2
UNION ALL
SELECT 'crm.contacts',      c.user_id, count(*)
  FROM crm.contacts c LEFT JOIN app."User" u ON u.id = c.user_id
 WHERE c.user_id IS NOT NULL AND u.id IS NULL GROUP BY 2
UNION ALL
SELECT 'crm.conversations', v.user_id, count(*)
  FROM crm.conversations v LEFT JOIN app."User" u ON u.id = v.user_id
 WHERE v.user_id IS NOT NULL AND u.id IS NULL GROUP BY 2
ORDER BY 1, 3 DESC;

\echo '=== 3) ¿existe el usuario 2, que es el DEFAULT de contacts y conversations? ==='
SELECT EXISTS (SELECT 1 FROM app."User" WHERE id = 2) AS usuario_2_existe;

\echo '=== 4) Líneas con el mismo número (bloquea el UNIQUE que pide .single()) ==='
SELECT number, count(*) AS veces, array_agg(id) AS ids
  FROM crm.lines WHERE number IS NOT NULL
 GROUP BY number HAVING count(*) > 1;

\echo '=== 5) invoice_id repetidos (bloquea la idempotencia del webhook de pagos) ==='
SELECT invoice_id, count(*) AS veces, array_agg(id) AS ids, array_agg(status) AS estados
  FROM app.subscriptions WHERE invoice_id IS NOT NULL
 GROUP BY invoice_id HAVING count(*) > 1;

\echo '=== 6) Suscripciones con columnas críticas en NULL (migración 003) ==='
SELECT count(*) FILTER (WHERE user_id   IS NULL) AS sin_usuario,
       count(*) FILTER (WHERE status    IS NULL) AS sin_estado,
       count(*) FILTER (WHERE amount    IS NULL) AS sin_monto,
       count(*) FILTER (WHERE plan_name IS NULL) AS sin_plan,
       count(*)                                  AS total
  FROM app.subscriptions;

\echo '=== 7) Formato real de scheduled_date (migración 003) ==='
-- Si TODO cae en "parseable", la conversión a date es segura.
SELECT CASE
         WHEN scheduled_date IS NULL OR btrim(scheduled_date) = '' THEN 'vacío'
         WHEN scheduled_date ~ '^\d{4}-\d{2}-\d{2}' THEN 'parseable (ISO)'
         ELSE 'OTRO FORMATO'
       END AS forma,
       count(*), min(scheduled_date) AS ejemplo
  FROM app.subscriptions GROUP BY 1;

\echo '=== 8) Valores reales de funnel_stage y priority (migración 004) ==='
-- Si aparece algo fuera de la lista que espera el código, el CHECK rompería
-- escrituras que hoy funcionan. Por eso 004 no está aplicado por defecto.
SELECT funnel_stage, count(*) FROM crm.contacts GROUP BY 1 ORDER BY 2 DESC;
SELECT priority,     count(*) FROM crm.contacts GROUP BY 1 ORDER BY 2 DESC;

\echo '=== 9) Contactos que el CRM NO ve por tener line_id NULL ==='
-- El JOIN interno de CONTACT_WITH_LINE los excluía. Con el LEFT JOIN de esta
-- entrega vuelven a aparecer: este número dice cuántos van a "reaparecer".
SELECT count(*) AS contactos_sin_linea FROM crm.contacts WHERE line_id IS NULL;

\echo '=== 10) Tamaño de lo que crece sin freno (retención) ==='
SELECT 'app.Telemetry'      AS tabla, count(*) AS filas,
       min("timeStamp")     AS mas_vieja, pg_size_pretty(pg_total_relation_size('app."Telemetry"')) AS peso
  FROM app."Telemetry"
UNION ALL
SELECT 'crm.conversations', count(*), min(created_at),
       pg_size_pretty(pg_total_relation_size('crm.conversations')) FROM crm.conversations
UNION ALL
SELECT 'crm.events',        count(*), min(marca_de_tiempo),
       pg_size_pretty(pg_total_relation_size('crm.events'))        FROM crm.events
UNION ALL
SELECT 'crm.contacts',      count(*), min(created_at),
       pg_size_pretty(pg_total_relation_size('crm.contacts'))      FROM crm.contacts;

\echo '=== 11) ¿Las credenciales de Meta están en claro o cifradas? ==='
-- 'claro' = cualquiera que lea la fila se lleva el token permanente de WhatsApp.
SELECT id, number,
       CASE WHEN "JWT" IS NULL THEN 'sin JWT'
            WHEN "JWT" LIKE 'enc:v1:%' THEN 'cifrado'
            ELSE 'EN CLARO' END AS estado_jwt
  FROM crm.lines ORDER BY 3;

\echo '=== 12) Última corrida de la limpieza automática ==='
SELECT * FROM app.maintenance_log;
