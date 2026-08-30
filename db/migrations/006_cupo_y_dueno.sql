-- =============================================================================
--  006 · Quitar el DEFAULT 2 de crm.contacts.user_id y añadir la devolución de cupo
-- =============================================================================
--
--  CUÁNDO CORRER ESTO: solo si NO se aplica db/schema.sql completo. Las dos cosas
--  ya están dentro de schema.sql (que se corre con `npm run db:schema` y es
--  idempotente), y este archivo existe para la base que se mantiene a base de
--  migraciones sueltas. Correrlo dos veces no hace daño.
--
--    psql "$DATABASE_URL" -f db/migrations/006_cupo_y_dueno.sql
--
--  ---------------------------------------------------------------------------
--  1) crm.contacts.user_id DEFAULT 2
--
--  La columna estaba declarada `integer DEFAULT 2`. Ese 2 es el id de un usuario
--  REAL, así que todo contacto creado sin indicar user_id —o sea, todos— quedaba
--  marcado como suyo.
--
--  Hoy no autoriza nada: el dueño de un contacto se deriva de su línea
--  (contacts.line_id -> lines.user_id), que es lo que aplican lib/propiedad.ts en
--  los dos servicios y events.tenant_de_contacto() en la base. El problema es el
--  de mañana: el primero que lea esta columna como "el dueño" —una consulta de
--  soporte, un informe, un endpoint nuevo— va a concluir que la base entera es del
--  usuario 2. Una columna que miente en silencio es peor que una vacía.
--
--  NO se tocan las filas ya escritas: no hay forma de distinguir un 2 puesto por el
--  DEFAULT de uno puesto a propósito, y adivinar sería exactamente el error que se
--  está quitando. Lo que se corta es que sigan naciendo así.
--
--  ⚠️ crm.conversations.user_id tiene el MISMO DEFAULT 2 y además
--  conversationService.ts escribe literalmente `user_id: 2` en cada inserción.
--  No se toca aquí a propósito: quitar el default sin cambiar ese código no
--  cambiaría nada (el valor llega explícito) y cambiar el código es otra entrega.
--  Queda anotado para que no se pierda.
--
--  2) app.refund_message_usage
--
--  El envío de WhatsApp pasó a RESERVAR el cupo antes de mandar el mensaje: es la
--  única forma de que dos envíos simultáneos en el límite no pasen los dos (antes
--  se comprobaba antes de enviar y se cobraba después, y en ese hueco cabía otra
--  petición: los dos se enviaban y solo uno se cobraba). El precio de reservar
--  antes es poder deshacerlo si el envío falla, y eso es esta función.
--  ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE crm.contacts ALTER COLUMN user_id DROP DEFAULT;

-- GREATEST(... , 0): el contador no puede quedar negativo aunque llegue una
-- devolución de más — un mes en -1 daría un tope efectivo mayor que el del plan.
-- Y no crea la fila si no existe: "devolver" sin haber reservado nunca no puede
-- inventar un consumo negativo.
CREATE OR REPLACE FUNCTION app.refund_message_usage(p_user_id integer)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE app."UserMessageUsage"
     SET usedmessages = GREATEST(usedmessages - 1, 0),
         updatedat    = now()
   WHERE userid = p_user_id
     AND year   = EXTRACT(YEAR  FROM now())::int
     AND month  = EXTRACT(MONTH FROM now())::int
  RETURNING usedmessages;
$$;

COMMIT;

-- Verificación (debe devolver el default en NULL y la función presente):
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema='crm' AND table_name='contacts' AND column_name='user_id';
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='app' AND proname='refund_message_usage';
