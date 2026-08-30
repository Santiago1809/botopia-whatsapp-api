-- =============================================================================
--  ESQUEMA CANÓNICO — Postgres de Railway (reemplaza los 2 proyectos Supabase)
-- =============================================================================
--
--  Este archivo es la ÚNICA fuente del esquema para los dos backends:
--    · botopia-whatsapp-api  -> esquema "app"  (ex proyecto Supabase ohltscdomqlwdnaxakpn)
--    · CRM-ms                -> esquema "crm"  (ex proyecto Supabase llkvzrwldmtxndxrugma)
--
--  Por qué DOS esquemas en UNA sola base:
--    En Supabase eran dos proyectos separados, así que los identificadores podían
--    repetirse sin chocar. Al unificar en una instancia de Railway conservamos ese
--    aislamiento con esquemas en lugar de pagar dos bases. Además, LISTEN/NOTIFY es
--    a nivel de BASE (no de esquema), así que tener todo junto es lo que permite que
--    el CRM escuche cambios de las tablas del API — algo que en Supabase estaba roto
--    porque los listeners de Unsyncedcontact/SyncedContactOrGroup apuntaban a tablas
--    que no viven en el proyecto del CRM.
--
--  Es idempotente: CREATE ... IF NOT EXISTS en todo. Se puede correr N veces.
--
--  ADVERTENCIA: este DDL está DERIVADO DEL CÓDIGO, no de un pg_dump de producción.
--  Antes de migrar datos reales, sacar el esquema real de ambos proyectos
--    pg_dump --schema-only "$SUPABASE_API_URL" > app_schema.sql
--    pg_dump --schema-only "$SUPABASE_CRM_URL" > crm_schema.sql
--  y usar este archivo como checklist de "¿está todo lo que el código toca?".
--
--  Uso:
--    psql "$DATABASE_URL" -f db/schema.sql
--  o, sin psql instalado:
--    node db/apply-schema.mjs
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS crm;

-- gen_random_uuid() para las PK uuid del CRM.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
--  ESQUEMA app — backend botopia-whatsapp-api
--  Identificadores en CamelCase entrecomillado: herencia de Prisma. El código los
--  escribe así literalmente (supabase.from('User').eq('userId', ...)), por lo que
--  cambiarlos a snake_case obligaría a tocar los 105 call sites.
-- =============================================================================

-- Rol del usuario. Enum porque el código solo usa 'user' | 'admin'
-- (src/types/global.ts:1-4) y así la base rechaza cualquier tercer valor.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'role' AND n.nspname = 'app') THEN
    CREATE TYPE app.role AS ENUM ('user', 'admin');
  END IF;
END
$$;

-- Cuenta de la plataforma: login (bcrypt), plan de suscripción y tope de tokens.
CREATE TABLE IF NOT EXISTS app."User" (
  id                      serial PRIMARY KEY,
  username                text NOT NULL UNIQUE,
  password                text NOT NULL,               -- hash bcrypt, nunca plano
  email                   text NOT NULL UNIQUE,
  "phoneNumber"           text UNIQUE,
  "countryCode"           text,
  role                    app.role NOT NULL DEFAULT 'user',
  active                  boolean NOT NULL DEFAULT true,
  "tokensPerResponse"     integer NOT NULL DEFAULT 0,
  -- Se compara contra app."PlanLimit".plan_name para resolver el tope mensual.
  subscription            text NOT NULL DEFAULT 'FREE'
                          CHECK (subscription IN ('FREE','BASIC','PRO','INDUSTRIAL','EXPIRED')),
  subscription_updated_at timestamptz,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

-- Número de WhatsApp conectado por un usuario, con su configuración de IA.
CREATE TABLE IF NOT EXISTS app."WhatsAppNumber" (
  id                 serial PRIMARY KEY,
  number             text NOT NULL UNIQUE,
  name               text,
  "userId"           integer NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  "aiEnabled"        boolean NOT NULL DEFAULT false,
  "responseGroups"   boolean NOT NULL DEFAULT false,
  "aiUnknownEnabled" boolean NOT NULL DEFAULT false,
  "aiPrompt"         text,
  "aiModel"          text
);
-- auth.controller.ts:204 y user.controller.ts:124 listan números por usuario.
CREATE INDEX IF NOT EXISTS whatsappnumber_userid_idx ON app."WhatsAppNumber" ("userId");

-- Agente de IA (prompt + escalamiento a asesor humano). isGlobal = lo ve todo el mundo.
CREATE TABLE IF NOT EXISTS app."Agent" (
  id             serial PRIMARY KEY,
  title          text NOT NULL,
  prompt         text,
  "ownerId"      integer REFERENCES app."User"(id) ON DELETE CASCADE,
  "isGlobal"     boolean NOT NULL DEFAULT false,
  "allowAdvisor" boolean NOT NULL DEFAULT false,
  "advisorEmail" text
);
-- user.controller.ts:226 filtra por (isGlobal OR ownerId); messages.controller.ts:880
-- busca el último agente propio no global.
CREATE INDEX IF NOT EXISTS agent_owner_global_idx ON app."Agent" ("ownerId", "isGlobal");

-- Contacto/grupo de WhatsApp que el usuario sincronizó explícitamente.
CREATE TABLE IF NOT EXISTS app."SyncedContactOrGroup" (
  id                 serial PRIMARY KEY,
  "numberId"         integer NOT NULL REFERENCES app."WhatsAppNumber"(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('contact','group')),
  wa_id              text NOT NULL,
  name               text,
  "agenteHabilitado" boolean NOT NULL DEFAULT true
);
-- messages.controller.ts:558-564 lee por (numberId, wa_id, type) con .single():
-- el índice único es lo que hace que ese .single() sea correcto y no solo rápido.
CREATE UNIQUE INDEX IF NOT EXISTS synced_number_waid_type_key
  ON app."SyncedContactOrGroup" ("numberId", wa_id, type);

-- Contacto que escribió sin estar sincronizado. Columnas en minúscula (sin comillas
-- en el original) — se conserva tal cual porque el código las escribe así.
CREATE TABLE IF NOT EXISTS app."Unsyncedcontact" (
  id                   serial PRIMARY KEY,
  numberid             integer NOT NULL REFERENCES app."WhatsAppNumber"(id) ON DELETE CASCADE,
  wa_id                text NOT NULL,
  number               text,
  name                 text,
  agentehabilitado     boolean NOT NULL DEFAULT true,
  -- bigint y NO timestamptz: messages.controller.ts:613 inserta Date.now() (epoch ms).
  lastmessagetimestamp bigint,
  lastmessagepreview   text,
  -- Requerido por el .upsert(onConflict:'numberid,wa_id') de messages.controller.ts:618.
  -- Sin esta constraint el ON CONFLICT revienta en runtime.
  CONSTRAINT unsynced_numberid_waid_key UNIQUE (numberid, wa_id)
);

-- Medición de consumo por request (CPU/RAM/egress) para calcular el costo de infra.
CREATE TABLE IF NOT EXISTS app."Telemetry" (
  id                bigserial PRIMARY KEY,
  city              text,
  country           text,
  ip                text,
  "cpuUsageMs"      double precision,
  "networkEgressKB" double precision,
  "ramUsageMB"      double precision,
  -- DEFAULT now() obligatorio: session.controller.ts:308-315 inserta sin timeStamp.
  "timeStamp"       timestamptz NOT NULL DEFAULT now()
);
-- stats.controller.ts:39-40 filtra por rango de timeStamp.
CREATE INDEX IF NOT EXISTS telemetry_timestamp_idx ON app."Telemetry" ("timeStamp");

-- Tope mensual de mensajes por plan. plan_name se cruza con app."User".subscription.
CREATE TABLE IF NOT EXISTS app."PlanLimit" (
  plan_name             text PRIMARY KEY,
  monthly_message_limit integer NOT NULL
);

-- Contador de mensajes consumidos por usuario y mes. Es la base del cobro/límite.
CREATE TABLE IF NOT EXISTS app."UserMessageUsage" (
  id           bigserial PRIMARY KEY,
  userid       integer NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  year         integer NOT NULL,
  month        integer NOT NULL,
  usedmessages integer NOT NULL DEFAULT 0,
  updatedat    timestamptz NOT NULL DEFAULT now(),
  -- messages.controller.ts:61-67 lee (userid, year, month) con .single().
  CONSTRAINT usermessageusage_user_year_month_key UNIQUE (userid, year, month)
);

-- Suscripciones/pagos de DLocal Go. Única tabla del esquema app en snake_case
-- (se creó después, fuera del molde Prisma) — se respeta para no tocar el código.
CREATE TABLE IF NOT EXISTS app.subscriptions (
  id                      bigserial PRIMARY KEY,
  user_id                 integer REFERENCES app."User"(id) ON DELETE SET NULL,
  email                   text,
  plan_token              text,
  external_id             text,
  amount                  numeric,
  plan_name               text,
  status                  text,
  invoice_id              text,
  dlo_subscription_id     text,
  mid                     text,
  amount_paid             numeric,
  amount_received         numeric,
  currency                text,
  checkout_currency       text,
  balance_currency        text,
  payment_method          text,
  client_name             text,
  client_document         text,
  client_document_type    text,
  external_transaction_id text,
  subscription_token      text,
  dlo_status              text,
  -- text y no date: DLO la devuelve como string y el código la reenvía sin parsear.
  scheduled_date          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz
);
-- subscription.controller.ts:154-161 (webhook: pendiente más reciente por plan+email).
CREATE INDEX IF NOT EXISTS subscriptions_token_email_status_idx
  ON app.subscriptions (plan_token, email, status, created_at DESC);
-- subscription.controller.ts:344-351 (última pagada del usuario).
CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx
  ON app.subscriptions (user_id, status, created_at DESC);


-- =============================================================================
--  ESQUEMA crm — backend CRM-ms
--  snake_case, PK uuid. Las columnas de credenciales de Meta van en MAYÚSCULAS
--  porque así las lee el código (databaseService.ts:395-398).
-- =============================================================================

-- Línea de WhatsApp Business (Meta). Guarda las credenciales de la API de Meta:
-- es el dato más crítico del CRM, no se puede regenerar sin rehacer la vinculación.
CREATE TABLE IF NOT EXISTS crm.lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number                text,
  provider              text DEFAULT 'META',
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  user_id               integer,
  -- jsonb: utils.ts:57-78 (processTags) acepta array o string JSON; jsonb cubre ambos.
  tags                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "JWT"                 text,
  "NUMBER_ID"           text,
  "WABA_ID"             text,
  "NOMBRE_LINEA"        text,
  "FOTO_LINEA"          text,
  -- linesController.ts:338-347 detecta EN RUNTIME cuáles de estas columnas existen
  -- leyendo la fila entera. Aquí se congela UNA sola variante (la de mayúscula
  -- inicial); la variante en minúscula NO se crea a propósito, para que no haya dos.
  "Telefono_contacto_1" text,
  "Telefono_contacto_2" text,
  "Telefono_contacto_3" text,
  "Telefono_contacto_4" text
);
CREATE INDEX IF NOT EXISTS lines_is_active_idx ON crm.lines (is_active);

-- Contacto del CRM (lead). funnel_stage es la etapa del embudo que mueve el kanban.
CREATE TABLE IF NOT EXISTS crm.contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identificacion text,
  phone          text,
  name           text,
  funnel_stage   text NOT NULL DEFAULT 'nuevo',
  priority       text DEFAULT 'media',
  is_ai_enabled  boolean NOT NULL DEFAULT true,
  tags           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- FK REAL, no lógica: el join embebido lines!inner(...) de PostgREST solo funcionaba
  -- porque la constraint existía. Al pasar a SQL el JOIN es explícito, pero la FK se
  -- conserva porque es la que garantiza que no queden contactos huérfanos de línea.
  line_id        uuid REFERENCES crm.lines(id) ON DELETE SET NULL,
  provider       text DEFAULT 'META',
  last_activity  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  user_id        integer DEFAULT 2,

  -- ---------------------------------------------------------------------------
  -- Columnas en español que el código LEE hoy y NUNCA escribe:
  --   contactService.ts:439  -> SELECT funnel_stage, esta_al_habilitado
  --   contactService.ts:366  -> ORDER BY ultima_actividad
  --   lineService.ts:106,156 -> contact.esta_al_habilitado === true
  --   lineService.ts:162-165 -> contact.ultima_actividad
  -- Se definen como GENERATED de sus equivalentes en inglés: así las lecturas
  -- funcionan, no hay que sincronizar nada a mano y es imposible que las dos
  -- versiones se desfasen. Si en producción resultan ser columnas independientes
  -- con datos propios, cambiarlas a columnas normales y migrar los valores.
  -- ---------------------------------------------------------------------------
  esta_al_habilitado boolean GENERATED ALWAYS AS (is_ai_enabled) STORED,
  ultima_actividad   timestamptz GENERATED ALWAYS AS (last_activity) STORED
);
CREATE INDEX IF NOT EXISTS contacts_line_id_idx      ON crm.contacts (line_id);
CREATE INDEX IF NOT EXISTS contacts_funnel_stage_idx ON crm.contacts (funnel_stage);
CREATE INDEX IF NOT EXISTS contacts_phone_idx        ON crm.contacts (phone);
-- searchContacts ordena por ultima_actividad descendente.
CREATE INDEX IF NOT EXISTS contacts_ultima_actividad_idx ON crm.contacts (ultima_actividad DESC);

-- Mensaje individual de una conversación (usuario, bot o agente humano).
CREATE TABLE IF NOT EXISTS crm.conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid NOT NULL REFERENCES crm.contacts(id) ON DELETE CASCADE,
  -- NULLABLE a propósito: los mensajes del bot se guardan con line_id NULL y el
  -- código los busca así (databaseService.ts:127,148,283,304 -> .is('line_id', null)).
  line_id     uuid REFERENCES crm.lines(id) ON DELETE SET NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  sender      text NOT NULL CHECK (sender IN ('user','bot','agent')),
  message     text,
  flow        text DEFAULT 'unknown',
  intent      text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     integer DEFAULT 2
);
-- conversationService.ts:16-19 (último mensaje de un contacto).
CREATE INDEX IF NOT EXISTS conversations_contact_ts_idx
  ON crm.conversations (contact_id, "timestamp" DESC);
-- databaseService.ts:115-117 (métricas por línea en ventana de 30 días).
CREATE INDEX IF NOT EXISTS conversations_line_created_idx
  ON crm.conversations (line_id, created_at DESC);
-- databaseService.ts:123-129 (mensajes del bot, que van con line_id NULL).
CREATE INDEX IF NOT EXISTS conversations_bot_null_line_idx
  ON crm.conversations (sender, created_at DESC) WHERE line_id IS NULL;

-- Bitácora de eventos por contacto. Columnas 100% en español (una sola lectura en
-- todo el código: eventService.ts:12-31), se respeta el nombrado original.
CREATE TABLE IF NOT EXISTS crm.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_de_contacto  uuid NOT NULL REFERENCES crm.contacts(id) ON DELETE CASCADE,
  tipo            text,
  datos           jsonb,
  marca_de_tiempo timestamptz NOT NULL DEFAULT now(),
  id_de_usuario   integer
);
CREATE INDEX IF NOT EXISTS events_contacto_tiempo_idx
  ON crm.events (id_de_contacto, marca_de_tiempo DESC);


-- =============================================================================
--  FUNCIONES RPC
--  Las 3 se conservan como funciones SQL para que supabase.rpc(...) siga
--  funcionando SIN tocar ningún call site. Ninguna necesita estar en el servidor
--  (no hay transacción multi-tabla crítica, no hay SECURITY DEFINER aprovechado,
--  no hay RLS que evadir); se quedan aquí solo porque es el corte más barato.
--  Bajarlas a consultas en el código es un paso opcional POSTERIOR al corte.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1) delete_contacts_by_numberid
--  Único llamador: contacts.controller.ts:66, dentro de syncContactsToDB cuando
--  clearAll === true, justo antes del INSERT masivo en SyncedContactOrGroup.
--  El retorno se ignora por completo.
--
--  ⚠️ NO SE PUDO INSPECCIONAR LA ORIGINAL. Aquí borra SOLO SyncedContactOrGroup,
--  que es la lectura coherente con el código: en ese mismo flujo, los contactos de
--  Unsyncedcontact se borran UNO POR UNO y solo los que se acaban de sincronizar
--  (contacts.controller.ts:99-105). Cuando el código sí quiere borrar las dos
--  tablas, las escribe las dos explícitamente (user.controller.ts:160-169).
--  Verificar contra el proyecto viejo antes de migrar datos:
--     psql "$SUPABASE_API_URL" -c '\sf delete_contacts_by_numberid'
--  Si resulta que también borraba Unsyncedcontact, descomentar el segundo DELETE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_contacts_by_numberid(p_numberid integer)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM app."SyncedContactOrGroup" WHERE "numberId" = p_numberid;
  -- DELETE FROM app."Unsyncedcontact" WHERE numberid = p_numberid;
$$;

-- -----------------------------------------------------------------------------
--  2) telemetry_summary
--  Único llamador: stats.controller.ts:128-136, que lee
--    result._sum.ramUsageMB / _sum.cpuUsageMs / _sum.networkEgressKB / _count._all
--  Esa forma es un fósil de Prisma (prisma.telemetry.aggregate()). Se reproduce
--  literal como jsonb para no tocar esas 4 líneas. Cuando se quiera limpiar, es un
--  SELECT SUM(...), COUNT(*) plano y 4 líneas de adaptación en el controlador.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.telemetry_summary(start_date timestamptz, end_date timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    '_sum', jsonb_build_object(
      'ramUsageMB',      COALESCE(SUM(t."ramUsageMB"), 0),
      'cpuUsageMs',      COALESCE(SUM(t."cpuUsageMs"), 0),
      'networkEgressKB', COALESCE(SUM(t."networkEgressKB"), 0)
    ),
    '_count', jsonb_build_object('_all', COUNT(*))
  )
  FROM app."Telemetry" t
  WHERE t."timeStamp" >= start_date
    AND t."timeStamp" <= end_date;
$$;

-- -----------------------------------------------------------------------------
--  3) get_user_message_usage
--  3 llamadores, y AQUÍ ESTÁ EL BUG que la migración destapa:
--    messages.controller.ts:169   lee { current_usage, message_limit }
--    messages.controller.ts:303   lee { current_usage, message_limit }   <-- envío
--    messages.controller.ts:1170  lee { current_usage, msg_limit, plan } <-- endpoint
--  Si la función vieja devolvía solo msg_limit, entonces en :303 `limit` era
--  undefined y `currentUsage >= undefined` es SIEMPRE false: el tope mensual de
--  mensajes NO se estaba aplicando al enviar. Si devolvía solo message_limit,
--  entonces el endpoint /usage mostraba NaN.
--
--  Esta versión devuelve LAS CUATRO columnas (message_limit y msg_limit con el
--  mismo valor), así los 3 call sites funcionan sin tocarse y el límite queda
--  aplicado. Normalizar los nombres en el código es tarea posterior al corte.
--
--  Reglas de negocio: si el usuario no tiene fila en PlanLimit para su plan, el
--  tope cae a 0 -> se bloquea el envío. Si no tiene fila de uso este mes, va 0.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.get_user_message_usage(p_user_id integer)
RETURNS TABLE (
  current_usage integer,
  message_limit integer,
  msg_limit     integer,
  plan          text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(umu.usedmessages, 0)          AS current_usage,
    COALESCE(pl.monthly_message_limit, 0)  AS message_limit,
    COALESCE(pl.monthly_message_limit, 0)  AS msg_limit,
    u.subscription                         AS plan
  FROM app."User" u
  LEFT JOIN app."PlanLimit" pl
         ON pl.plan_name = u.subscription
  LEFT JOIN app."UserMessageUsage" umu
         ON umu.userid = u.id
        AND umu.year   = EXTRACT(YEAR  FROM now())::int
        AND umu.month  = EXTRACT(MONTH FROM now())::int
  WHERE u.id = p_user_id;
$$;


-- =============================================================================
--  REALTIME — reemplazo de Supabase Realtime con triggers + LISTEN/NOTIFY
--
--  Por qué hace falta: CRM-ms/src/services/websocketManager.ts:211-256 suscribía
--  4 canales postgres_changes. De ellos cuelgan 6 de los 13 eventos WebSocket que
--  consume el front (contact-updated, contact-deleted, unsynced-contacts-updated,
--  unsynced-contact-deleted, synced-contact-updated, synced-contact-deleted) Y la
--  alerta por correo + plantilla de WhatsApp cuando un contacto pasa a
--  'atencion_cliente' (websocketManager.ts:288-397), que necesita el valor VIEJO
--  de funnel_stage — dato que solo da el WAL/el trigger, no el endpoint.
--
--  Diseño de la carga útil: pg_notify tiene un tope duro de 8000 bytes y
--  conversations.message o Unsyncedcontact.lastmessagepreview pueden pasarse.
--  Por eso el trigger NO manda la fila entera: manda solo
--    { eventType, table, id, old:{campos mínimos} }
--  y el listener de Node vuelve a leer la fila por id para armar `new`. Así la
--  carga es siempre pequeña y acotada, y el handler recibe exactamente la misma
--  forma { eventType, new, old } que le daba Supabase.
--  Para DELETE no se puede releer: ahí sí van los pocos campos que el handler usa.
--
--  Limitación conocida (no es regresión): NOTIFY se emite al COMMIT; si el proceso
--  del CRM está caído en ese momento, el evento se pierde. Con Supabase Realtime
--  pasaba exactamente lo mismo.
-- =============================================================================

-- Trigger genérico. Recibe por TG_ARGV[0] el nombre del canal y por TG_ARGV[1..]
-- la lista de columnas del OLD que hay que incluir.
CREATE OR REPLACE FUNCTION app.notify_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_channel  text := TG_ARGV[0];
  v_old_cols text[] := CASE WHEN array_length(TG_ARGV, 1) > 1
                            THEN TG_ARGV[1:array_length(TG_ARGV, 1)]
                            ELSE ARRAY[]::text[] END;
  v_row      jsonb;
  v_old      jsonb := '{}'::jsonb;
  v_id       jsonb;
  v_col      text;
BEGIN
  -- La fila de referencia: NEW en INSERT/UPDATE, OLD en DELETE.
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  -- `->` y no `->>`: conserva el tipo JSON nativo del id. Las tablas de `crm`
  -- tienen PK uuid (string) pero las de `app` la tienen serial (número), y con
  -- `->>` todo salía como texto: el handler emitía "5" en vez de 5 hacia el
  -- front, cambiando el tipo respecto de lo que entregaba Supabase Realtime.
  v_id := v_row -> 'id';

  -- Solo los campos del OLD que el handler realmente necesita (funnel_stage
  -- anterior, line_id/numberid para saber a qué sala emitir un DELETE).
  IF TG_OP <> 'INSERT' THEN
    FOREACH v_col IN ARRAY v_old_cols LOOP
      v_old := v_old || jsonb_build_object(v_col, to_jsonb(OLD) -> v_col);
    END LOOP;
  END IF;

  PERFORM pg_notify(
    v_channel,
    jsonb_build_object(
      'eventType', TG_OP,
      'table',     TG_TABLE_NAME,
      'id',        v_id,
      'old',       v_old
    )::text
  );

  RETURN NULL;  -- AFTER trigger: el valor de retorno se ignora.
END;
$$;

-- Los CREATE TRIGGER no aceptan IF NOT EXISTS en Postgres < 14, y aunque lo
-- aceptaran queremos que un cambio en los argumentos se aplique al re-correr
-- el archivo. DROP + CREATE es lo idempotente aquí.

DROP TRIGGER IF EXISTS contacts_notify ON crm.contacts;
CREATE TRIGGER contacts_notify
  AFTER INSERT OR UPDATE OR DELETE ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION app.notify_row_change('crm_contacts_changes', 'funnel_stage', 'line_id');

DROP TRIGGER IF EXISTS conversations_notify ON crm.conversations;
CREATE TRIGGER conversations_notify
  AFTER INSERT OR UPDATE OR DELETE ON crm.conversations
  FOR EACH ROW EXECUTE FUNCTION app.notify_row_change('crm_conversations_changes', 'contact_id', 'line_id');

-- Estas dos tablas viven en el esquema del API. En Supabase eran otro PROYECTO,
-- así que estos dos listeners del CRM nunca recibieron nada. Al unificar la base
-- vuelven a estar vivos (LISTEN/NOTIFY es a nivel de base, no de esquema).
DROP TRIGGER IF EXISTS unsynced_notify ON app."Unsyncedcontact";
CREATE TRIGGER unsynced_notify
  AFTER INSERT OR UPDATE OR DELETE ON app."Unsyncedcontact"
  FOR EACH ROW EXECUTE FUNCTION app.notify_row_change('app_unsynced_changes', 'numberid');

DROP TRIGGER IF EXISTS synced_notify ON app."SyncedContactOrGroup";
CREATE TRIGGER synced_notify
  AFTER INSERT OR UPDATE OR DELETE ON app."SyncedContactOrGroup"
  FOR EACH ROW EXECUTE FUNCTION app.notify_row_change('app_synced_changes', 'numberId');


-- =============================================================================
--  SEMILLA MÍNIMA
--  PlanLimit son 5 filas y sin ellas el envío de mensajes se bloquea siempre
--  (get_user_message_usage devuelve tope 0). Valores tomados de getPlanLimits()
--  en subscription.controller.ts:419-447.
-- =============================================================================
INSERT INTO app."PlanLimit" (plan_name, monthly_message_limit) VALUES
  ('FREE',         100),
  ('BASIC',       1000),
  ('PRO',         5000),
  ('INDUSTRIAL', 50000),
  ('EXPIRED',        0)
ON CONFLICT (plan_name) DO NOTHING;
