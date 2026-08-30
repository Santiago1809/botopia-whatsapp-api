-- =============================================================================
--  005 · Reparar las marcas de tiempo que se guardaron 5 horas atrasadas
-- =============================================================================
--
--  QUÉ PASÓ: contactService.ts tenía un getColombiaTime() que hacía
--
--      new Date(now.getTime() - 5*60*60*1000).toISOString()
--
--  Eso NO convierte a hora de Colombia: le resta 5 horas al instante y después lo
--  sella con la Z de UTC. El resultado es un timestamptz que dice ser UTC pero va
--  5 horas atrasado. Se usó para escribir:
--      crm.contacts.last_activity          (updateContactStatus, disableContactAI)
--      crm.conversations.timestamp
--      crm.conversations.created_at
--      crm.contacts.updated_at             (al llegar cada mensaje)
--
--  Mientras tanto, los DEFAULT now() del DDL, createContact y las ventanas de 7 y
--  30 días de la analítica usaban UTC de verdad. O sea: en las mismas columnas
--  convivían dos relojes con 5 horas de diferencia, y por eso las métricas dejaban
--  fuera (o metían de más) las filas escritas por el camino equivocado.
--
--  EL CÓDIGO YA ESTÁ CORREGIDO en esta entrega: getColombiaTime desapareció y todo
--  escribe UTC real. Esto de aquí es lo otro: las filas VIEJAS siguen corridas.
--
--  =========================  LEER ANTES DE CORRER  ===========================
--  Esta migración es la ÚNICA del conjunto que reescribe datos de negocio y NO se
--  puede deshacer sola. Y es imposible distinguir con certeza una fila escrita con
--  el reloj malo de una escrita con el bueno: solo se puede acotar por FECHA.
--
--  Por eso:
--    1. HACER BACKUP ANTES.  pg_dump -t crm.contacts -t crm.conversations ...
--    2. Poner en :fecha_corte la fecha/hora del despliegue que trae esta entrega.
--       Todo lo ANTERIOR a ese instante se corrige; lo posterior ya nace bien.
--    3. Correr primero el bloque de VERIFICACIÓN y mirar si los números tienen
--       sentido (¿hay mensajes con timestamp en el futuro? ¿huecos de 5 h?).
--    4. Si no hay forma de saber la fecha de corte, o si la analítica histórica no
--       le importa a nadie: NO CORRER ESTO. Dejar el pasado como está y quedarse
--       con que de aquí en adelante todo es UTC. Es una opción perfectamente sana.
--  ============================================================================
-- =============================================================================

\set fecha_corte '2026-08-30 00:00:00+00'

-- -----------------------------------------------------------------------------
--  VERIFICACIÓN (solo lectura). Correr esto solo y leer la salida.
--
--  La señal de que el reloj malo estuvo en juego: filas donde created_at (escrito
--  con getColombiaTime) va casi exactamente 5 horas por detrás del DEFAULT now()
--  de alguna fila hermana, o mensajes cuyo timestamp es anterior a la creación de
--  su propio contacto.
-- -----------------------------------------------------------------------------
\echo '--- mensajes cuyo timestamp es anterior al alta de su contacto (síntoma del -5h) ---'
SELECT count(*) AS sospechosos
  FROM crm.conversations v
  JOIN crm.contacts c ON c.id = v.contact_id
 WHERE v."timestamp" < c.created_at
   AND v.created_at < :'fecha_corte';

\echo '--- diferencia entre timestamp y created_at dentro de la misma fila ---'
-- conversationService.ts:150 escribía created_at con toUTCString() (UTC real) y
-- contactService.ts:610-616 escribía los dos con el reloj malo. Si aparece un
-- grupo agrupado en ~5 horas, ese es el daño.
SELECT round(EXTRACT(EPOCH FROM (created_at - "timestamp")) / 3600)::int AS horas_de_diferencia,
       count(*)
  FROM crm.conversations
 WHERE created_at < :'fecha_corte'
 GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

\echo '--- rango de fechas afectado ---'
SELECT min(created_at), max(created_at) FROM crm.conversations WHERE created_at < :'fecha_corte';


-- =============================================================================
--  CORRECCIÓN — descomentar SOLO después de hacer el backup y de mirar lo de arriba
-- =============================================================================
--
-- BEGIN;
--
-- -- Mensajes: se suman las 5 horas que se habían restado de más.
-- UPDATE crm.conversations
--    SET "timestamp" = "timestamp" + interval '5 hours',
--        created_at  = created_at  + interval '5 hours'
--  WHERE created_at < :'fecha_corte';
--
-- -- Contactos: last_activity y updated_at venían del mismo reloj.
-- -- created_at NO se toca: lo escribía createContact con toISOString() real.
-- UPDATE crm.contacts
--    SET last_activity = last_activity + interval '5 hours'
--  WHERE last_activity IS NOT NULL
--    AND last_activity < :'fecha_corte';
--
-- UPDATE crm.contacts
--    SET updated_at = updated_at + interval '5 hours'
--  WHERE updated_at < :'fecha_corte';
--
-- -- Comprobar que nada quedó en el futuro antes de confirmar.
-- DO $$
-- DECLARE v_futuro bigint;
-- BEGIN
--   SELECT count(*) INTO v_futuro FROM crm.conversations WHERE "timestamp" > now();
--   IF v_futuro > 0 THEN
--     RAISE EXCEPTION '% mensajes quedaron con fecha futura: la corrección se pasó. ROLLBACK.', v_futuro;
--   END IF;
-- END
-- $$;
--
-- COMMIT;
--
-- =============================================================================
--  ultima_actividad se arregla sola: es una columna GENERATED de last_activity
--  (schema.sql), así que Postgres la recalcula con el UPDATE de arriba.
--
--  PENDIENTE APARTE (no es de esta migración): last_activity casi siempre está en
--  NULL, porque solo la escriben updateContactStatus y disableContactAI. El flujo
--  normal de mensajes actualiza updated_at, no last_activity. Y el índice
--  contacts_ultima_actividad_idx sostiene el ORDER BY de searchContacts, que por
--  eso ordena de forma prácticamente aleatoria. Se arregla en el código haciendo
--  que createConversation escriba también last_activity — ya viene hecho en esta
--  entrega (contactService.createConversation).
-- =============================================================================
