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

-- pg_trgm es lo único que hace indexable un `ILIKE '%texto%'` (comodín al INICIO:
-- ningún btree sirve). Lo pide searchContacts (contactService.ts:376-377) y el
-- `phone LIKE '%digits'` de getContactByPhone (contactService.ts:516), que corre en
-- CADA mensaje entrante. Va dentro de un bloque con EXCEPTION porque:
--   · es contrib, viene con Postgres, no se instala nada nuevo;
--   · pero si el rol no puede crear extensiones, un CREATE EXTENSION pelado
--     abortaría TODO el archivo (apply-schema.mjs lo manda como una sola
--     transacción implícita). Aquí solo se pierde el índice de búsqueda.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm no disponible (%). La búsqueda de contactos seguirá siendo seq scan.', SQLERRM;
END
$$;


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
-- Sello de "este correo existe de verdad", que pone /api/auth/activate al abrir el
-- enlace del correo de bienvenida. Va en un ALTER aparte para que las bases que ya
-- tienen la tabla creada también lo reciban. NO bloquea el login: `active` sigue
-- siendo true por defecto y nadie queda encerrado si el SMTP no está configurado.
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

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

-- -----------------------------------------------------------------------------
--  Nombre y foto PERSONALIZADOS de un contacto, puestos por el usuario en el
--  panel. Van en ALTER aparte (patrón email_verified_at) para que las bases que
--  ya tienen las tablas también los reciban.
--
--  Son del usuario, no de WhatsApp: la sincronización NUNCA los escribe. Los
--  upserts de contacts.controller.ts (SyncedContactOrGroup) y de
--  messages.controller.ts (Unsyncedcontact) no llevan estas columnas en el
--  objeto a propósito —el mismo mecanismo que protege agenteHabilitado—, así
--  que un DO UPDATE SET jamás las pisa: en fila nueva quedan NULL y en fila
--  existente no se tocan. Solo las escriben los endpoints de edición.
--
--  custom_photo guarda una dataURL comprimida (o una URL); el tope de ~200KB lo
--  valida la API (src/lib/contactoCustom.ts), no la base, para poder responder
--  400 con un mensaje claro en vez de un error de constraint.
-- -----------------------------------------------------------------------------
ALTER TABLE app."SyncedContactOrGroup" ADD COLUMN IF NOT EXISTS custom_name  text;
ALTER TABLE app."SyncedContactOrGroup" ADD COLUMN IF NOT EXISTS custom_photo text;
ALTER TABLE app."Unsyncedcontact"      ADD COLUMN IF NOT EXISTS custom_name  text;
ALTER TABLE app."Unsyncedcontact"      ADD COLUMN IF NOT EXISTS custom_photo text;

-- -----------------------------------------------------------------------------
--  Acuse por reacción: cuando está encendido, el bot reacciona 👍 a cada mensaje
--  entrante de un chat con agente activo (messages.controller.ts). Va en ALTER
--  aparte (patrón email_verified_at) para que las bases existentes lo reciban.
--  DEFAULT false: nace apagado y cada número lo enciende a propósito.
-- -----------------------------------------------------------------------------
ALTER TABLE app."WhatsAppNumber" ADD COLUMN IF NOT EXISTS ack_reaction boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
--  Vista previa de los ADJUNTOS de un chat (imagen, audio, documento).
--
--  Por qué existe: el historial se lee EN VIVO del WhatsApp del navegador
--  (fetchMessages) y ahí un adjunto es solo `hasMedia=true` sin contenido; el
--  panel no tenía nada que pintar. Aquí se guarda lo justo para la burbuja:
--    · data_base64 SOLO si el archivo pesa ≤200KB — una vista previa, no un
--      almacén de archivos; los grandes quedan como tarjeta con metadatos.
--    · msg_timestamp en epoch ms (msg.timestamp*1000): es la llave con la que
--      el front cruza el adjunto contra el mensaje del historial, porque los
--      items del historial no viajan con su id de WhatsApp.
--  chat_wa_id guarda el id CLÁSICO resuelto (idCanonico), no el @lid crudo,
--  por la misma razón que el resto del sistema: la agenda vive en @c.us.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app."ChatMedia" (
  id            bigserial PRIMARY KEY,
  numberid      integer NOT NULL REFERENCES app."WhatsAppNumber"(id) ON DELETE CASCADE,
  chat_wa_id    text NOT NULL,
  wa_msg_id     text,
  from_me       boolean NOT NULL DEFAULT false,
  mimetype      text NOT NULL,
  filename      text,
  filesize      integer,
  data_base64   text,
  msg_timestamp bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- La consulta del panel: los adjuntos de UN chat, del más nuevo al más viejo.
CREATE INDEX IF NOT EXISTS chatmedia_chat_idx
  ON app."ChatMedia" (numberid, chat_wa_id, msg_timestamp DESC);
-- Un adjunto por mensaje: el reintento de un downloadMedia no duplica filas.
-- Parcial porque wa_msg_id puede faltar (ids @lid vacíos, ver messages.controller).
CREATE UNIQUE INDEX IF NOT EXISTS chatmedia_msg_key
  ON app."ChatMedia" (numberid, wa_msg_id) WHERE wa_msg_id IS NOT NULL;

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
-- payment.controller.ts:191-197 (última suscripción del usuario, SIN filtrar status:
-- por eso el índice de arriba, que arranca por status en la 2ª posición, no puede
-- servir el ORDER BY y termina ordenando en memoria).
CREATE INDEX IF NOT EXISTS subscriptions_user_created_idx
  ON app.subscriptions (user_id, created_at DESC);

-- Código de un solo uso para recuperar contraseña. Vive en la base y no en memoria
-- del proceso porque un redespliegue de Railway (o una segunda instancia) borraba
-- el otpStore y dejaba al usuario con un código que el servidor ya no reconocía.
CREATE TABLE IF NOT EXISTS app."PasswordReset" (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  -- hash bcrypt del OTP: si alguien lee la tabla no puede usar el código.
  otp_hash    text NOT NULL,
  expires_at  timestamptz NOT NULL,
  -- se marca al acertar el OTP; change-password exige que esté marcada.
  verified_at timestamptz,
  -- se marca al cambiar la contraseña; impide reutilizar el mismo código.
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- auth.controller.ts busca siempre el código vivo más reciente de un email.
CREATE INDEX IF NOT EXISTS passwordreset_email_created_idx
  ON app."PasswordReset" (email, created_at DESC);


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

  -- ---------------------------------------------------------------------------
  -- user_id NO DICE DE QUIÉN ES ESTE CONTACTO. Es una columna heredada que nadie
  -- escribe a conciencia y que nada consulta para decidir permisos.
  --
  -- El dueño de un contacto se deriva SIEMPRE de su línea:
  --     crm.contacts.line_id -> crm.lines.user_id -> app."User".id
  -- que es la cadena que aplican lib/propiedad.ts (en los dos servicios) y
  -- events.tenant_de_contacto() más abajo en este archivo.
  --
  -- Aquí decía `integer DEFAULT 2`. Ese 2 es un id de usuario real escrito a
  -- fuego: cada contacto que se creaba sin indicar user_id —o sea, todos—
  -- quedaba marcado como si fuera de ESE usuario. Hoy no hace daño porque nadie
  -- lee la columna para autorizar; el daño es futuro y silencioso: el primero
  -- que la lea como "el dueño" —una consulta de soporte, un informe, un endpoint
  -- nuevo escrito con prisa— va a concluir que toda la base pertenece al usuario
  -- 2, y no se va a ver hasta que alguien reciba datos ajenos. Se quita el
  -- DEFAULT para que la columna quede en NULL: sin dato es honesto, con el dato
  -- equivocado no.
  -- ---------------------------------------------------------------------------
  user_id        integer,

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

-- El CREATE de arriba es IF NOT EXISTS: en una base que ya existe no cambia nada,
-- y ahí es precisamente donde sigue puesto el DEFAULT 2. Esto lo quita. Es
-- idempotente (DROP DEFAULT sobre una columna que ya no lo tiene no hace nada) y
-- no toca ni una fila: las que ya están marcadas con el 2 se quedan como están,
-- porque no hay forma de saber cuáles se escribieron a propósito. Lo que se corta
-- es que sigan naciendo contactos con un dueño falso.
ALTER TABLE crm.contacts ALTER COLUMN user_id DROP DEFAULT;
-- analyticsService/databaseService.ts:263-268 cuenta contactos nuevos por día y por
-- línea (7 consultas en cada carga del dashboard): necesita line_id Y el rango.
CREATE INDEX IF NOT EXISTS contacts_line_created_idx ON crm.contacts (line_id, created_at);
-- contactService.ts:409 filtra por funnel_stage y getStats:445-447 añade la línea.
CREATE INDEX IF NOT EXISTS contacts_stage_line_idx   ON crm.contacts (funnel_stage, line_id);
CREATE INDEX IF NOT EXISTS contacts_phone_idx        ON crm.contacts (phone);
-- searchContacts ordena por ultima_actividad descendente.
CREATE INDEX IF NOT EXISTS contacts_ultima_actividad_idx ON crm.contacts (ultima_actividad DESC);

-- Los dos de una sola columna que había antes quedan CONTENIDOS en los compuestos
-- de arriba (un índice (a,b) sirve igual de bien para `WHERE a = ?`). Mantener los
-- cuatro solo costaría escrituras más lentas y más espacio, sin ganar ninguna
-- consulta. Se borran aquí, no en una migración aparte, porque DROP INDEX de un
-- índice redundante no puede dejar ninguna consulta sin plan.
DROP INDEX IF EXISTS crm.contacts_line_id_idx;
DROP INDEX IF EXISTS crm.contacts_funnel_stage_idx;

-- contactService.ts:376-377 -> `c.name ILIKE '%q%' OR c.phone ILIKE '%q%'`, y
-- contactService.ts:516 -> `c.phone LIKE '%digits'` en cada mensaje entrante.
-- Ambos llevan comodín al inicio: solo un GIN de trigramas los indexa.
-- (Un btree con text_pattern_ops NO sirve para esto: acelera 'abc%', no '%abc'.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx
      ON crm.contacts USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS contacts_phone_trgm_idx
      ON crm.contacts USING gin (phone gin_trgm_ops);
  ELSE
    RAISE NOTICE 'Sin pg_trgm: la búsqueda de contactos por nombre/teléfono queda sin índice.';
  END IF;
END
$$;

-- contactService.ts:378 -> `c.tags @> $2::jsonb`. jsonb_path_ops indexa solo el
-- operador de contención, que es el único que usa el código: índice más chico y
-- más rápido que el jsonb_ops por defecto.
CREATE INDEX IF NOT EXISTS contacts_tags_gin_idx
  ON crm.contacts USING gin (tags jsonb_path_ops);

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
-- databaseService.ts:145-150 y :307-312 ("Strategy 2"): filtra line_id IS NULL por
-- rango de fecha SIN tocar sender, así que el índice parcial de arriba —que arranca
-- por sender— no puede resolverlo.
CREATE INDEX IF NOT EXISTS conversations_null_line_created_idx
  ON crm.conversations (created_at DESC) WHERE line_id IS NULL;
-- databaseService.ts:162-166 ("Strategy 3"): 30 días SIN ningún filtro de línea.
-- Hoy es un seq scan de la tabla entera de mensajes.
CREATE INDEX IF NOT EXISTS conversations_created_idx
  ON crm.conversations (created_at DESC);

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
--  ESQUEMA events — bus de eventos, webhooks salientes y avisos por correo
--
--  Por qué un esquema nuevo y no tablas sueltas en `app`: esto no es una tabla
--  más del backend de WhatsApp, es un subsistema con su propio ciclo de vida
--  (productor, cola, worker, retención). Tenerlo aparte hace que un `\dt events.*`
--  responda "qué compone el bus" sin ruido, y que la purga por retención pueda
--  escribirse contra un esquema entero en vez de contra una lista de nombres.
--
--  POR QUÉ OUTBOX Y NO "emitir desde el listener":
--    pgListener.ts:30-32 y el bloque REALTIME de arriba documentan la limitación
--    conocida: NOTIFY se emite al COMMIT y si el proceso está caído en ese
--    instante el aviso SE PIERDE. Eso es tolerable para refrescar una pantalla.
--    No lo es para un webhook que el cliente factura. Aquí el trigger ESCRIBE la
--    fila de `events.event` dentro de la MISMA transacción que el cambio de
--    negocio: o commitean los dos o ninguno, y un redespliegue en el peor
--    momento no puede perder un evento. El NOTIFY queda solo como despertador
--    del worker; si se pierde, el poll de la cola recoge la entrega igual.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS events;

-- -----------------------------------------------------------------------------
--  events.event — la bitácora inmutable de hechos (el outbox)
--
--  PK bigint identity y NO uuid: el orden de inserción es el orden natural de los
--  hechos y un índice sobre un entero de 8 bytes ocupa la mitad de página que uno
--  sobre uuid v4, que además fragmenta el árbol por ser aleatorio. El uuid existe
--  aparte (public_id) porque es lo que se EXPONE: un entero secuencial le diría al
--  cliente cuántos eventos genera toda la plataforma.
--
--  account_id es FK REAL a app."User" con ON DELETE CASCADE. Las tablas viejas
--  usan referencia lógica sin FK (crm.contacts.user_id); las nuevas no tienen por
--  qué heredar esa deuda. Es NULLABLE a propósito: si la cadena de resolución del
--  tenant no llega a un usuario, el evento se guarda igual con account_id nulo y
--  queda visible en events.evento_sin_dueno — NUNCA se descarta en silencio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.event (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  account_id  integer REFERENCES app."User"(id) ON DELETE CASCADE,
  type        text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb NOT NULL,
  -- Clave de idempotencia del PRODUCTOR. Los eventos que nacen de un trigger
  -- FOR EACH ROW no la necesitan (dispara una vez) y van NULL; los que nacen de
  -- código sí (un reinicio a medias puede repetir la llamada).
  dedupe_key  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- COALESCE(account_id,0) y no account_id pelado: en un índice único dos NULL NO
-- chocan, así que sin esto los eventos huérfanos de tenant se podrían duplicar,
-- que es justo el caso donde más cuesta darse cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS event_dedupe_key
  ON events.event (COALESCE(account_id, 0), type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
-- Purga por retención.
CREATE INDEX IF NOT EXISTS event_created_at_idx ON events.event (created_at);
-- Resumen diario: "todo lo que le pasó a esta cuenta entre estas dos horas".
CREATE INDEX IF NOT EXISTS event_account_occurred_idx
  ON events.event (account_id, occurred_at DESC);

-- Los eventos cuyo tenant no se pudo resolver. Que existan es un fallo de datos
-- (una línea sin user_id, un número sin dueño), y esta vista es dónde se ve.
CREATE OR REPLACE VIEW events.evento_sin_dueno AS
  SELECT id, public_id, type, occurred_at, payload
  FROM events.event
  WHERE account_id IS NULL;

-- -----------------------------------------------------------------------------
--  events.webhook_endpoint — un destino registrado por el cliente
--
--  El secreto se guarda CIFRADO y no hasheado. Un hash sería más seguro pero
--  imposible: para firmar hay que tener el secreto en claro en el momento del
--  envío. AES-256-GCM con clave de entorno hace que un volcado de la base no
--  baste para falsificar webhooks.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.webhook_endpoint (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             integer NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  url                    text NOT NULL,
  label                  text,
  secret_ciphertext      bytea NOT NULL,
  -- "whsec_A7f2…" para que la pantalla pueda decir CUÁL secreto es sin tenerlo.
  secret_prefix          text NOT NULL,
  secret_rotated_at      timestamptz,
  -- Durante la ventana de rotación se firma con los dos y el receptor acepta si
  -- alguna cuadra. Sin esto, rotar un secreto es una caída coordinada.
  prev_secret_ciphertext bytea,
  prev_secret_expires_at timestamptz,
  -- El cuerpo del mensaje sale de nuestra frontera solo si el cliente lo pide.
  include_message_body   boolean NOT NULL DEFAULT false,
  is_active              boolean NOT NULL DEFAULT true,
  disabled_at            timestamptz,
  disabled_reason        text,
  -- Cuenta ENTREGAS agotadas seguidas, no intentos. Cualquier 2xx lo pone a 0.
  failure_streak         integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Registrar dos veces el mismo destino y recibirlo todo duplicado es el
  -- reporte de bug más frecuente en sistemas de webhooks. Se hace imposible.
  CONSTRAINT webhook_endpoint_account_url_key UNIQUE (account_id, url)
);
-- Parcial: la pantalla de /connections lista los vivos, y los deshabilitados no
-- ensucian el índice.
CREATE INDEX IF NOT EXISTS webhook_endpoint_account_active_idx
  ON events.webhook_endpoint (account_id) WHERE is_active;

-- -----------------------------------------------------------------------------
--  events.webhook_endpoint_event — a qué se suscribe cada destino
--
--  Fila por evento y no un array en el endpoint. Motivo: el fan-out pregunta
--  "¿qué endpoints quieren message.received?"; con un array eso es un scan o un
--  GIN, con esta tabla es un index scan directo. La PK compuesta además hace
--  imposible suscribir dos veces al mismo evento.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.webhook_endpoint_event (
  endpoint_id uuid NOT NULL REFERENCES events.webhook_endpoint(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  PRIMARY KEY (endpoint_id, event_type)
);
CREATE INDEX IF NOT EXISTS webhook_endpoint_event_type_idx
  ON events.webhook_endpoint_event (event_type, endpoint_id);

-- -----------------------------------------------------------------------------
--  events.origen_clave() — la forma canónica del identificador de un chat
--
--  Existe porque el MISMO chat tiene tres escrituras según quién lo mire:
--  la vía QR guarda "573001234567@c.us" (o "...@lid"), la vía Meta guarda el
--  teléfono pelado ("+573001234567"), y el front compara con el criterio de
--  waIdDeChat (botopia-whatsapp/src/lib/waId.ts). Si cada lado normalizara por
--  su cuenta, el filtro por origen fallaría justo en el cruce de vías. Una sola
--  función, en la base, y TODOS (fan-out, API de /connections) pasan por aquí.
--
--  La regla, calcada de waIdDeChat:
--    · @c.us / @s.whatsapp.net → el teléfono en dígitos (así casa con Meta)
--    · @g.us / @lid / @broadcast / @newsletter → el id ENTERO en minúsculas
--      (un @lid NO es un teléfono: reducirlo a dígitos inventaría un número)
--    · sin sufijo (teléfono de la vía Meta) → solo dígitos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events.origen_clave(p_bruto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR v = '' THEN NULL
    WHEN v ~ '@(c\.us|s\.whatsapp\.net)$'
      THEN COALESCE(NULLIF(regexp_replace(split_part(v, '@', 1), '[^0-9]', '', 'g'), ''), v)
    WHEN v ~ '@(g\.us|lid|broadcast|newsletter)$' THEN v
    ELSE COALESCE(NULLIF(regexp_replace(v, '[^0-9]', '', 'g'), ''), v)
  END
  FROM (SELECT lower(btrim(p_bruto))) AS t(v);
$$;

-- -----------------------------------------------------------------------------
--  events.webhook_endpoint_origin — de qué chats quiere recibir cada destino
--
--  SIN FILAS = TODOS los orígenes. Esa ausencia es el contrato de compatibilidad:
--  los webhooks creados antes de que existiera esta tabla no tienen filas aquí y
--  siguen recibiendo todo, sin migración de datos ni columna que rellenar.
--
--  Se guarda la CLAVE canónica (events.origen_clave), no el wa_id crudo: el
--  fan-out compara con un `=` simple y el mismo contacto elegido desde la vía QR
--  filtra también sus eventos de la vía Meta. Fila por origen y no un array, por
--  el mismo motivo que webhook_endpoint_event: el fan-out pregunta por igualdad
--  y la PK compuesta hace imposible duplicar un origen.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.webhook_endpoint_origin (
  endpoint_id uuid NOT NULL REFERENCES events.webhook_endpoint(id) ON DELETE CASCADE,
  origin_key  text NOT NULL,
  PRIMARY KEY (endpoint_id, origin_key)
);

-- -----------------------------------------------------------------------------
--  events.email_preference — los interruptores de aviso por correo
--
--  timezone es COLUMNA y no constante porque hoy 'America/Bogota' está escrito a
--  fuego en tres sitios distintos (websocketManager.ts:164-178, emailService.ts:63,
--  messages.controller.ts:899-901) y un resumen diario que llegue a las 3 de la
--  mañana no lo lee nadie.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.email_preference (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id integer NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  to_email   text NOT NULL,
  event_type text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  timezone   text NOT NULL DEFAULT 'America/Bogota',
  -- Solo la usa daily.summary: a qué hora local se manda el resumen.
  send_at    time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_preference_unique UNIQUE (account_id, to_email, event_type)
);
CREATE INDEX IF NOT EXISTS email_preference_type_account_idx
  ON events.email_preference (event_type, account_id) WHERE is_active;

-- -----------------------------------------------------------------------------
--  events.delivery — UNA entrega por (evento, destino)
--
--  Un solo carril para webhook y correo. Podrían ser dos tablas, pero entonces
--  habría dos colas, dos calendarios de reintento y dos registros de intentos
--  que envejecen distinto; el destino es lo único que cambia, así que el destino
--  es una columna.
--
--  Los estados, con precisión, porque de aquí depende qué recoge el worker:
--    pending    · nunca se intentó
--    delivering · reclamada por un worker; next_attempt_at es el VENCIMIENTO del
--                 arriendo, no la próxima espera. Si el worker muere, la fila
--                 vuelve a ser elegible sola al vencer, sin proceso reaper.
--    failed     · el intento falló y HAY reintento (next_attempt_at en futuro)
--    exhausted  · no hay más intentos: o se acabaron, o el error no es
--                 reintentable (un 4xx devuelve lo mismo en cada intento porque
--                 el cuerpo es idéntico). Cuenta para failure_streak.
--    succeeded  · 2xx
--    blocked    · la URL fue rechazada por la validación anti-SSRF, o no hay SMTP.
--                 CERO intentos y no se reintenta: el arreglo es del cliente o de
--                 la configuración, no nuestro, y en la pantalla se ve distinto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.delivery (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Viaja en la cabecera X-Lumintik-Delivery y es ESTABLE entre reintentos: es
  -- la clave con la que el receptor deduplica.
  public_id           uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  event_id            bigint NOT NULL REFERENCES events.event(id) ON DELETE CASCADE,
  channel             text NOT NULL CHECK (channel IN ('webhook','email')),
  endpoint_id         uuid REFERENCES events.webhook_endpoint(id) ON DELETE CASCADE,
  email_preference_id uuid REFERENCES events.email_preference(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','delivering','succeeded','failed','exhausted','blocked')),
  attempt_count       integer NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_status_code    integer,
  last_error_kind     text,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  -- El destino tiene que ser exactamente uno y coherente con el canal.
  CONSTRAINT delivery_destino_coherente CHECK (
    (channel = 'webhook' AND endpoint_id IS NOT NULL AND email_preference_id IS NULL) OR
    (channel = 'email'   AND email_preference_id IS NOT NULL AND endpoint_id IS NULL)
  )
);
-- EL SEGURO DEL FAN-OUT. Si el productor corre dos veces sobre el mismo evento
-- (un reinicio a medias), el segundo INSERT ... ON CONFLICT DO NOTHING no crea
-- una entrega duplicada. Sin estos dos índices, un fallo del worker se traduce
-- en webhooks y correos DOBLES para el cliente.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_event_endpoint_key
  ON events.delivery (event_id, endpoint_id) WHERE endpoint_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_event_email_key
  ON events.delivery (event_id, email_preference_id) WHERE email_preference_id IS NOT NULL;
-- EL ÍNDICE QUE SOSTIENE TODO. Es PARCIAL a propósito: la tabla va a tener
-- millones de filas 'succeeded' y el índice solo contiene la cola VIVA, que son
-- decenas. Un índice total sobre next_attempt_at crecería para siempre y la
-- consulta del worker se degradaría mes a mes aunque la cola estuviera vacía.
CREATE INDEX IF NOT EXISTS delivery_cola_idx
  ON events.delivery (next_attempt_at)
  WHERE status IN ('pending','failed','delivering');
-- "Últimas 50 entregas de este endpoint" en /connections. Sin esto, esa vista
-- hace un scan de la tabla entera.
CREATE INDEX IF NOT EXISTS delivery_endpoint_created_idx
  ON events.delivery (endpoint_id, created_at DESC);
-- Lo pide la FK: sin él, borrar un evento hace scan de delivery.
CREATE INDEX IF NOT EXISTS delivery_event_idx ON events.delivery (event_id);

-- -----------------------------------------------------------------------------
--  events.delivery_attempt — qué pasó exactamente en cada intento
--
--  UNIQUE (delivery_id, attempt_number) en vez de un índice suelto: además de
--  servir la vista de detalle, impide registrar dos veces el intento 3 si el
--  worker se reinicia entre el envío y el UPDATE.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.delivery_attempt (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id      bigint NOT NULL REFERENCES events.delivery(id) ON DELETE CASCADE,
  attempt_number   integer NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  duration_ms      integer,
  -- Convierte un "no funciona" en un diagnóstico: si el cliente ve que
  -- resolvimos a una IP que no es la suya, sabe que su DNS está mal.
  resolved_ip      inet,
  request_headers  jsonb,          -- con la firma, SIN el secreto
  response_status  integer,
  response_headers jsonb,
  -- Truncado a 2 KB EN EL CÓDIGO, no confiando en el receptor: guardar la
  -- respuesta entera de un tercero es cómo se llena un disco.
  response_excerpt text,
  error_kind       text,           -- dns|tls|timeout|conn_reset|http_4xx|http_5xx|redirect|ssrf_blocked|smtp_*
  error_message    text,
  CONSTRAINT delivery_attempt_numero_key UNIQUE (delivery_id, attempt_number)
);

-- -----------------------------------------------------------------------------
--  events.emitir() — el productor. UNA sola implementación.
--
--  Vive en la base y no en TypeScript por dos razones que no son de gusto:
--    1) Los triggers la necesitan, y from_stage SOLO existe en el OLD del
--       trigger: ningún controlador puede saber la etapa anterior.
--    2) Los tres procesos (API, CRM y cualquier cron) emiten exactamente lo
--       mismo llamando a la misma función, sin duplicar el fan-out en cada repo.
--
--  Devuelve el id del evento, o NULL si dedupe_key ya existía (no se hace nada).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events.emitir(
  p_type        text,
  p_account_id  integer,
  p_payload     jsonb,
  p_dedupe_key  text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id    bigint;
  v_deliveries  integer := 0;
  v_n           integer;
  v_origen      text;
BEGIN
  INSERT INTO events.event (account_id, type, occurred_at, payload, dedupe_key)
  VALUES (p_account_id, p_type, p_occurred_at, p_payload, p_dedupe_key)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_event_id;

  -- dedupe_key repetida: el evento ya se emitió. No es un error.
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sin tenant no hay a quién entregarle: el evento queda guardado y visible en
  -- events.evento_sin_dueno, pero no se reparte a ciegas.
  IF p_account_id IS NULL THEN
    RETURN v_event_id;
  END IF;

  -- Origen del evento: el chat de WhatsApp del que nace la notificación. SOLO
  -- los eventos de mensajes se filtran por origen; el resto (escalamiento, tope
  -- de plan, líneas caídas) llega SIEMPRE a todos los destinos suscritos — un
  -- cliente que filtra por tres chats sigue necesitando enterarse de que su
  -- línea se cayó o de que se le acabó el cupo del mes.
  --
  -- El origen se saca del payload y no de un parámetro nuevo: los triggers y el
  -- código emiten por esta MISMA función con la firma de siempre, y un parámetro
  -- extra crearía una segunda sobrecarga de events.emitir a la que los llamadores
  -- viejos no llegarían. group_id manda sobre wa_id (en un grupo el contacto ES
  -- el grupo); phone es la forma de la vía Meta, que no tiene wa_id.
  IF p_type IN ('message.received', 'message.sent', 'contact.replied') THEN
    v_origen := events.origen_clave(COALESCE(
      p_payload->'contact'->>'group_id',
      p_payload->'contact'->>'wa_id',
      p_payload->'contact'->>'phone'
    ));
  END IF;

  INSERT INTO events.delivery (event_id, channel, endpoint_id)
  SELECT v_event_id, 'webhook', e.id
  FROM events.webhook_endpoint e
  JOIN events.webhook_endpoint_event s ON s.endpoint_id = e.id
  WHERE e.account_id = p_account_id
    AND e.is_active
    AND s.event_type = p_type
    -- Filtro por origen. Un endpoint sin filas en webhook_endpoint_origin
    -- recibe todo (compatibilidad hacia atrás); con filas, solo los eventos
    -- cuyo chat de origen esté en su lista. Un evento sin origen no se filtra.
    AND (
      v_origen IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM events.webhook_endpoint_origin o WHERE o.endpoint_id = e.id
      )
      OR EXISTS (
        SELECT 1 FROM events.webhook_endpoint_origin o
        WHERE o.endpoint_id = e.id AND o.origin_key = v_origen
      )
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deliveries := v_deliveries + v_n;

  INSERT INTO events.delivery (event_id, channel, email_preference_id)
  SELECT v_event_id, 'email', p.id
  FROM events.email_preference p
  WHERE p.account_id = p_account_id
    AND p.is_active
    AND p.event_type = p_type
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deliveries := v_deliveries + v_n;

  -- Despertador del worker, no el transporte. Si este NOTIFY se pierde porque el
  -- worker está caído, el poll de la cola recoge las entregas igual — que es
  -- precisamente la garantía que el carril de Realtime no tiene.
  IF v_deliveries > 0 THEN
    PERFORM pg_notify('events_delivery_ready', v_event_id::text);
  END IF;

  RETURN v_event_id;
END;
$$;

-- -----------------------------------------------------------------------------
--  Resolución del tenant. Es la decisión que más se puede torcer, y hay una
--  trampa concreta en el código:
--
--    crm.conversations.user_id NO SIRVE. Está declarada integer DEFAULT 2 y
--    conversationService.ts:151 escribe literalmente user_id: 2 en cada
--    inserción. Es SIEMPRE 2. Lo mismo crm.contacts.user_id DEFAULT 2.
--
--  La cadena correcta para la vía Meta es line_id -> crm.lines.user_id, con el
--  rodeo por el contacto porque conversations.line_id es NULL A PROPÓSITO para
--  los mensajes del bot (ver el comentario de la tabla).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events.tenant_de_linea(p_line_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT user_id FROM crm.lines WHERE id = p_line_id;
$$;

CREATE OR REPLACE FUNCTION events.tenant_de_contacto(p_contact_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT l.user_id
  FROM crm.contacts c
  JOIN crm.lines l ON l.id = c.line_id
  WHERE c.id = p_contact_id;
$$;

CREATE OR REPLACE FUNCTION events.tenant_de_numero(p_number_id integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT "userId" FROM app."WhatsAppNumber" WHERE id = p_number_id;
$$;

-- Ficha pública de una línea Meta. NUNCA incluye JWT, NUMBER_ID, WABA_ID ni los
-- Telefono_contacto_*: son las credenciales de Meta del cliente y los celulares
-- de su equipo interno, y esto sale de nuestra frontera.
CREATE OR REPLACE FUNCTION events.ficha_linea(p_line_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id',      l.id,
    'label',   COALESCE(NULLIF(l."NOMBRE_LINEA", ''), l.number),
    'channel', 'meta'
  )
  FROM crm.lines l
  WHERE l.id = p_line_id;
$$;

-- Ficha pública de un contacto del CRM. El teléfono viaja COMPLETO (el cliente
-- lo necesita para actuar); lo que no viaja es el cuerpo de la conversación.
CREATE OR REPLACE FUNCTION events.ficha_contacto(p_contact_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id',           c.id,
    'phone',        c.phone,
    'name',         c.name,
    'funnel_stage', c.funnel_stage,
    'priority',     c.priority,
    'tags',         c.tags
  )
  FROM crm.contacts c
  WHERE c.id = p_contact_id;
$$;

-- -----------------------------------------------------------------------------
--  PRODUCTORES POR TRIGGER (vía Meta)
--
--  Son triggers APARTE de los *_notify de arriba, no una extensión de
--  app.notify_row_change(). Motivo: si el productor de eventos tuviera un fallo,
--  con una función compartida se llevaría por delante el WebSocket del CRM, que
--  hoy funciona. Separados, cada carril falla solo.
--
--  Y cada uno envuelve su cuerpo en EXCEPTION WHEN OTHERS: un evento que no se
--  puede producir NO puede impedir que se guarde el mensaje del lead. Esa es la
--  regla dura — el camino principal manda. Se paga con un WARNING en los logs.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION events.capturar_conversacion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_account   integer;
  v_contacto  jsonb;
  v_linea     jsonb;
  v_prev_ts   timestamptz;
  v_prev_send text;
  v_base      jsonb;
BEGIN
  BEGIN
    v_account := COALESCE(
      events.tenant_de_linea(NEW.line_id),
      events.tenant_de_contacto(NEW.contact_id)
    );
    v_contacto := events.ficha_contacto(NEW.contact_id);
    v_linea := events.ficha_linea(
      COALESCE(NEW.line_id, (SELECT line_id FROM crm.contacts WHERE id = NEW.contact_id))
    );

    v_base := jsonb_build_object(
      'message_id', NEW.id,
      'channel',    'meta',
      'line',       v_linea,
      'contact',    v_contacto,
      -- preview truncado a 140; el cuerpo completo viaja aparte y solo si la
      -- suscripción marca include_message_body.
      'preview',    left(COALESCE(NEW.message, ''), 140),
      'body',       NEW.message,
      'flow',       NEW.flow,
      'intent',     NEW.intent,
      'sent_at',    NEW."timestamp"
    );

    IF NEW.sender = 'user' THEN
      PERFORM events.emitir(
        'message.received',
        v_account,
        v_base || jsonb_build_object('direction', 'inbound', 'has_media', false),
        NEW.id::text,
        NEW."timestamp"
      );

      -- contact.replied: "el lead CONTESTÓ", que no es lo mismo que "escribió".
      -- Definición: hay un mensaje nuestro ANTERIOR a este. La subconsulta cae en
      -- conversations_contact_ts_idx (contact_id, timestamp DESC), es barata.
      SELECT c."timestamp", c.sender INTO v_prev_ts, v_prev_send
      FROM crm.conversations c
      WHERE c.contact_id = NEW.contact_id
        AND c.sender IN ('bot','agent')
        AND c."timestamp" < NEW."timestamp"
      ORDER BY c."timestamp" DESC
      LIMIT 1;

      IF v_prev_ts IS NOT NULL THEN
        PERFORM events.emitir(
          'contact.replied',
          v_account,
          jsonb_build_object(
            'contact', v_contacto,
            'line',    v_linea,
            'message', jsonb_build_object(
              'id',      NEW.id,
              'preview', left(COALESCE(NEW.message, ''), 140),
              'body',    NEW.message,
              'sent_at', NEW."timestamp"
            ),
            'replied_to', jsonb_build_object('sent_at', v_prev_ts, 'sender', v_prev_send),
            -- Lo que hace útil el aviso: "contestó a los 3 días" no es lo mismo
            -- que "contestó a los 40 segundos".
            'silence_seconds', GREATEST(0, EXTRACT(EPOCH FROM (NEW."timestamp" - v_prev_ts))::int)
          ),
          NEW.id::text,
          NEW."timestamp"
        );
      END IF;
    ELSE
      PERFORM events.emitir(
        'message.sent',
        v_account,
        v_base || jsonb_build_object(
          'direction', 'outbound',
          'sender',    CASE WHEN NEW.sender = 'agent' THEN 'agent' ELSE 'bot' END
        ),
        NEW.id::text,
        NEW."timestamp"
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'events: no se pudo producir el evento de la conversación %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION events.capturar_contacto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_account integer;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      -- Solo ids: la fila ya no existe y no hay nada más que se pueda releer.
      PERFORM events.emitir(
        'contact.deleted',
        events.tenant_de_linea(OLD.line_id),
        jsonb_build_object('contact_id', OLD.id, 'line_id', OLD.line_id, 'deleted_at', now()),
        NULL
      );
      RETURN NULL;
    END IF;

    v_account := events.tenant_de_linea(NEW.line_id);

    IF TG_OP = 'INSERT' THEN
      PERFORM events.emitir(
        'contact.created',
        v_account,
        jsonb_build_object(
          'contact', events.ficha_contacto(NEW.id),
          'line',    events.ficha_linea(NEW.line_id),
          'source',  'inbound_message',
          'created_at', NEW.created_at
        ),
        NEW.id::text,
        NEW.created_at
      );
      RETURN NULL;
    END IF;

    -- UPDATE. from_stage SOLO puede venir del OLD del trigger: esta es la razón
    -- por la que el productor vive en la base y no en el controlador del kanban.
    IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
      PERFORM events.emitir(
        'contact.stage_changed',
        v_account,
        jsonb_build_object(
          'contact',    events.ficha_contacto(NEW.id),
          'line',       events.ficha_linea(NEW.line_id),
          'from_stage', OLD.funnel_stage,
          'to_stage',   NEW.funnel_stage,
          'changed_at', now()
        ),
        NULL
      );
    END IF;

    IF OLD.is_ai_enabled AND NOT NEW.is_ai_enabled THEN
      PERFORM events.emitir(
        'contact.ai_disabled',
        v_account,
        jsonb_build_object(
          'contact',     events.ficha_contacto(NEW.id),
          'line',        events.ficha_linea(NEW.line_id),
          'reason',      'manual',
          'disabled_at', now()
        ),
        NULL
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'events: no se pudo producir el evento del contacto: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Vía whatsapp-web.js. Aquí el INSERT es "contacto nuevo" y el UPDATE es "un
-- mensaje de alguien ya conocido" (messages.controller.ts:618 hace upsert con
-- onConflict numberid,wa_id). El trigger produce SOLO el alta: message.received
-- lo emite el código, que es el único sitio donde se sabe la dirección del
-- mensaje y existe la clave de idempotencia natural (msg.id._serialized).
CREATE OR REPLACE FUNCTION events.capturar_unsynced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_account integer;
  v_linea   jsonb;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;

    v_account := events.tenant_de_numero(NEW.numberid);
    SELECT jsonb_build_object(
             'id', n.id,
             'label', COALESCE(NULLIF(n.name, ''), n.number),
             'channel', 'whatsapp_web'
           )
      INTO v_linea
      FROM app."WhatsAppNumber" n WHERE n.id = NEW.numberid;

    IF TG_OP = 'INSERT' THEN
      PERFORM events.emitir(
        'contact.created',
        v_account,
        jsonb_build_object(
          'contact', jsonb_build_object(
            'id',    NEW.id,
            'phone', NEW.number,
            'name',  NEW.name,
            'wa_id', NEW.wa_id
          ),
          'line',   v_linea,
          'source', 'inbound_message',
          'created_at', now()
        ),
        'unsynced:' || NEW.id::text
      );
    ELSIF OLD.agentehabilitado AND NOT NEW.agentehabilitado THEN
      PERFORM events.emitir(
        'contact.ai_disabled',
        v_account,
        jsonb_build_object(
          'contact', jsonb_build_object(
            'id',    NEW.id,
            'phone', NEW.number,
            'name',  NEW.name,
            'wa_id', NEW.wa_id
          ),
          'line',        v_linea,
          'reason',      'handoff_requested',
          'disabled_at', now()
        ),
        NULL
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'events: no se pudo producir el evento de Unsyncedcontact: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION events.capturar_synced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_linea jsonb;
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD."agenteHabilitado" AND NOT NEW."agenteHabilitado" THEN
      SELECT jsonb_build_object(
               'id', n.id,
               'label', COALESCE(NULLIF(n.name, ''), n.number),
               'channel', 'whatsapp_web'
             )
        INTO v_linea
        FROM app."WhatsAppNumber" n WHERE n.id = NEW."numberId";

      PERFORM events.emitir(
        'contact.ai_disabled',
        events.tenant_de_numero(NEW."numberId"),
        jsonb_build_object(
          'contact', jsonb_build_object(
            'id',    NEW.id,
            'name',  NEW.name,
            'wa_id', NEW.wa_id
          ),
          'line',        v_linea,
          'reason',      'handoff_requested',
          'disabled_at', now()
        ),
        NULL
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'events: no se pudo producir el evento de SyncedContactOrGroup: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- DROP + CREATE, igual que los *_notify: es lo idempotente aquí y hace que un
-- cambio en la función se aplique al re-correr el archivo.
DROP TRIGGER IF EXISTS conversations_capture_event ON crm.conversations;
CREATE TRIGGER conversations_capture_event
  AFTER INSERT ON crm.conversations
  FOR EACH ROW EXECUTE FUNCTION events.capturar_conversacion();

DROP TRIGGER IF EXISTS contacts_capture_event ON crm.contacts;
CREATE TRIGGER contacts_capture_event
  AFTER INSERT OR UPDATE OR DELETE ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION events.capturar_contacto();

DROP TRIGGER IF EXISTS unsynced_capture_event ON app."Unsyncedcontact";
CREATE TRIGGER unsynced_capture_event
  AFTER INSERT OR UPDATE ON app."Unsyncedcontact"
  FOR EACH ROW EXECUTE FUNCTION events.capturar_unsynced();

DROP TRIGGER IF EXISTS synced_capture_event ON app."SyncedContactOrGroup";
CREATE TRIGGER synced_capture_event
  AFTER UPDATE ON app."SyncedContactOrGroup"
  FOR EACH ROW EXECUTE FUNCTION events.capturar_synced();

-- -----------------------------------------------------------------------------
--  Retención. event, delivery y delivery_attempt crecen sin techo; el worker
--  llama a esto una vez al día. Los intentos son lo que más pesa (traen
--  cabeceras y un trozo de respuesta por intento) y son lo que menos se mira
--  pasada la semana, por eso duran 30 días y los eventos 90.
--
--  Si algún día el volumen lo pide: particionar delivery_attempt por mes y
--  cambiar este DELETE por DROP PARTITION, que es instantáneo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events.purgar_retencion(
  p_dias_intentos integer DEFAULT 30,
  p_dias_eventos  integer DEFAULT 90
)
RETURNS TABLE (intentos_borrados bigint, eventos_borrados bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_intentos bigint;
  v_eventos  bigint;
BEGIN
  DELETE FROM events.delivery_attempt
  WHERE requested_at < now() - make_interval(days => p_dias_intentos);
  GET DIAGNOSTICS v_intentos = ROW_COUNT;

  -- delivery cuelga de event por FK ON DELETE CASCADE: borrar el evento se lleva
  -- sus entregas y sus intentos, así que una sola sentencia basta.
  DELETE FROM events.event
  WHERE created_at < now() - make_interval(days => p_dias_eventos);
  GET DIAGNOSTICS v_eventos = ROW_COUNT;

  RETURN QUERY SELECT v_intentos, v_eventos;
END;
$$;


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


-- =============================================================================
--  ENDURECIMIENTO — restricciones que el código NECESITA pero el DDL no tenía
--
--  Va TODO al final del archivo a propósito: varias cosas de aquí dependen de que
--  las tablas y la semilla de PlanLimit ya existan.
--
--  Regla de esta sección: como este archivo se corre en cada arranque CONTRA UNA
--  BASE VIVA y entero dentro de una sola transacción implícita, ninguna sentencia
--  puede fallar — un error aborta el despliegue completo. Por eso todo lo que
--  depende de los datos existentes (una FK que puede encontrar huérfanos, un
--  UNIQUE que puede encontrar duplicados) pasa por los dos ayudantes de abajo,
--  que MIRAN PRIMERO y, si no pueden, dejan un NOTICE en el log en vez de reventar.
--  Lo que queda sin aplicar está documentado en db/migrations/ como paso manual.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Ayudante 1: añadir una FK solo si es seguro.
--  Se salta el trabajo si la constraint ya existe (así el escaneo de huérfanos se
--  paga UNA vez, no en cada arranque), no toca tablas más grandes que p_max_rows
--  (el escaneo costaría más que el arranque) y no intenta nada si encuentra filas
--  huérfanas: en ese caso avisa y sigue.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_fk(
  p_table      text,     -- 'crm.contacts'
  p_constraint text,     -- 'contacts_user_id_fkey'
  p_column     text,     -- 'user_id'
  p_ref_table  text,     -- 'app."User"'
  p_ref_column text,     -- 'id'
  p_on_delete  text,     -- 'SET NULL' | 'RESTRICT' | 'CASCADE' | 'NO ACTION'
  p_max_rows   bigint DEFAULT 2000000
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows     bigint;
  v_orphans  boolean;
BEGIN
  IF p_on_delete NOT IN ('SET NULL', 'RESTRICT', 'CASCADE', 'NO ACTION') THEN
    RAISE EXCEPTION 'ON DELETE no permitido: %', p_on_delete;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = p_constraint
       AND conrelid = p_table::regclass
  ) THEN
    RETURN;  -- ya está
  END IF;

  SELECT GREATEST(reltuples, 0)::bigint INTO v_rows
    FROM pg_class WHERE oid = p_table::regclass;

  IF v_rows > p_max_rows THEN
    RAISE NOTICE 'FK % omitida: % tiene ~% filas (> %). Aplicarla a mano con db/migrations/002_fks_user_id.sql en una ventana de mantenimiento.',
      p_constraint, p_table, v_rows, p_max_rows;
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %s t LEFT JOIN %s r ON r.%I = t.%I
                     WHERE t.%I IS NOT NULL AND r.%I IS NULL)',
    p_table, p_ref_table, p_ref_column, p_column, p_column, p_ref_column
  ) INTO v_orphans;

  IF v_orphans THEN
    RAISE NOTICE 'FK % omitida: % tiene valores de %.% que no existen en %. Ver db/migrations/002_fks_user_id.sql.',
      p_constraint, p_table, p_table, p_column, p_ref_table;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s',
      p_table, p_constraint, p_column, p_ref_table, p_ref_column, p_on_delete
    );
    RAISE NOTICE 'FK % creada sobre %.', p_constraint, p_table;
  EXCEPTION WHEN OTHERS THEN
    -- El bloque EXCEPTION abre una subtransacción: si el ALTER falla (una carrera
    -- con otra instancia arrancando a la vez, por ejemplo) se deshace SOLO esto y
    -- el resto del archivo sigue aplicándose.
    RAISE NOTICE 'No se pudo crear la FK %: %', p_constraint, SQLERRM;
  END;
END
$$;

-- -----------------------------------------------------------------------------
--  Ayudante 2: crear un índice ÚNICO solo si los datos ya lo cumplen.
--  Si hay duplicados crea el índice NO único (que igual sirve para las búsquedas)
--  y avisa qué hay que limpiar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_unique_index(
  p_index  text,          -- 'lines_number_key'
  p_table  text,          -- 'crm.lines'
  p_column text,          -- 'number'
  p_where  text DEFAULT NULL   -- 'number IS NOT NULL'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema  text := split_part(p_table, '.', 1);
  v_dupes   boolean;
  v_clause  text := CASE WHEN p_where IS NULL THEN '' ELSE ' WHERE ' || p_where END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = p_index AND n.nspname = v_schema AND c.relkind = 'i'
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %s%s GROUP BY %I HAVING count(*) > 1)',
    p_table, v_clause, p_column
  ) INTO v_dupes;

  BEGIN
    IF v_dupes THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)%s',
                     p_index || '_nonuniq', p_table, p_column, v_clause);
      -- Ojo: aquí NO se puede usar %I ni %s. RAISE usa `%` como marcador propio y
      -- se comería la I o la s, dejando en el log una consulta que no se puede
      -- copiar y pegar (era "SELECT numberI ... FROM crm.liness").
      RAISE NOTICE 'UNIQUE % NO creado: % tiene valores repetidos en %. Se dejó un índice normal. Para limpiarlo: SELECT %, count(*) FROM % GROUP BY 1 HAVING count(*) > 1;',
        p_index, p_table, p_column, p_column, p_table;
    ELSE
      EXECUTE format('CREATE UNIQUE INDEX %I ON %s (%I)%s',
                     p_index, p_table, p_column, v_clause);
      RAISE NOTICE 'Índice único % creado sobre %(%).', p_index, p_table, p_column;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo crear el índice %: %', p_index, SQLERRM;
  END;
END
$$;


-- -----------------------------------------------------------------------------
--  1) app."User".subscription -> app."PlanLimit".plan_name
--
--  Por qué: get_user_message_usage hace LEFT JOIN + COALESCE(...,0). Si falta la
--  fila del plan, el tope mensual es 0 y NADIE puede enviar un mensaje, sin ningún
--  error visible. Hoy lo único que sostiene esas 5 filas es la semilla de arriba.
--  Con la FK, borrar un plan en uso falla en vez de apagar los envíos en silencio.
--
--  Es 100% seguro aplicarla: el CHECK de la columna ya limita los valores a esos
--  mismos 5 nombres, y la semilla que los inserta corre justo antes.
-- -----------------------------------------------------------------------------
SELECT app.ensure_fk('app."User"', 'user_subscription_fkey', 'subscription',
                     'app."PlanLimit"', 'plan_name', 'RESTRICT');

-- -----------------------------------------------------------------------------
--  2) app.subscriptions.user_id: SET NULL -> RESTRICT
--
--  Es la tabla del dinero. Con SET NULL, borrar un usuario dejaba sus pagos sin
--  dueño y, peor, activateUserPlan(null, ...) ejecuta `WHERE id = NULL`: no
--  actualiza nada y NO falla. RESTRICT convierte eso en un error visible.
--
--  Riesgo de romper algo: ninguno hoy. En los tres repos no existe un solo
--  `DELETE FROM app."User"` — admin.controller.ts:102 desactiva con
--  `update({active:false})`, que es un borrado lógico y la FK no lo toca.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'app.subscriptions'::regclass
     AND contype = 'f'
     AND confdeltype = 'n'                                  -- 'n' = SET NULL
     AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'app.subscriptions'::regclass
                            AND attname = 'user_id')];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.subscriptions DROP CONSTRAINT %I', v_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo reemplazar la FK de subscriptions.user_id: %', SQLERRM;
END
$$;
SELECT app.ensure_fk('app.subscriptions', 'subscriptions_user_id_fkey', 'user_id',
                     'app."User"', 'id', 'RESTRICT');

-- -----------------------------------------------------------------------------
--  3) app."Agent"."ownerId": CASCADE -> SET NULL + trigger
--
--  El problema real: admin.controller.ts:38-43 crea los agentes GLOBALES con el
--  ownerId de la cuenta de admin. Con ON DELETE CASCADE, borrar esa única cuenta
--  borraba los agentes globales de TODOS los clientes.
--
--  SET NULL a secas no alcanza, porque entonces los agentes privados de un usuario
--  borrado sobrevivirían como filas invisibles (user.controller.ts:226 filtra por
--  `isGlobal OR ownerId = X`). Por eso además va un BEFORE DELETE en User que borra
--  SUS agentes privados: el resultado neto es idéntico al de hoy para los privados
--  y deja de ser catastrófico para los globales.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'app."Agent"'::regclass
     AND contype = 'f'
     AND confdeltype = 'c'                                  -- 'c' = CASCADE
     AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'app."Agent"'::regclass
                            AND attname = 'ownerId')];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app."Agent" DROP CONSTRAINT %I', v_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo reemplazar la FK de Agent.ownerId: %', SQLERRM;
END
$$;
SELECT app.ensure_fk('app."Agent"', 'agent_owner_fkey', 'ownerId',
                     'app."User"', 'id', 'SET NULL');

CREATE OR REPLACE FUNCTION app.delete_private_agents_of_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM app."Agent"
   WHERE "ownerId" = OLD.id
     AND "isGlobal" = false;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS user_delete_private_agents ON app."User";
CREATE TRIGGER user_delete_private_agents
  BEFORE DELETE ON app."User"
  FOR EACH ROW EXECUTE FUNCTION app.delete_private_agents_of_user();

-- -----------------------------------------------------------------------------
--  4) UNIQUE en crm.lines(number)
--
--  dashboardService.ts:53 hace `.eq('number', ...).single()`. Con dos líneas del
--  mismo número, `.single()` devuelve PGRST116 y el dashboard cae al bloque de
--  respaldo con id:'unknown'. El índice único es lo que hace que ese `.single()`
--  sea correcto, y de paso es el índice que esa consulta necesitaba.
--  Parcial (number IS NOT NULL) porque la columna es nullable y varios NULL son
--  legítimos: en un UNIQUE de Postgres los NULL no chocan entre sí de todos modos,
--  pero el índice parcial además no los guarda.
-- -----------------------------------------------------------------------------
SELECT app.ensure_unique_index('lines_number_key', 'crm.lines', 'number', 'number IS NOT NULL');

-- -----------------------------------------------------------------------------
--  5) UNIQUE en app.subscriptions(invoice_id) — idempotencia del webhook de pagos
--
--  DLocal REINTENTA las notificaciones. handleNotification busca "la pendiente más
--  reciente" y la marca PAID, así que un reintento podía marcar pagada una segunda
--  fila y ejecutar activateUserPlan dos veces. Con este único, el segundo intento
--  de escribir el mismo invoice_id falla de forma visible en vez de duplicar.
--  Parcial: invoice_id es NULL mientras la fila está pendiente y eso no es un choque.
-- -----------------------------------------------------------------------------
SELECT app.ensure_unique_index('subscriptions_invoice_id_key', 'app.subscriptions',
                               'invoice_id', 'invoice_id IS NOT NULL');

-- -----------------------------------------------------------------------------
--  6) Los ids de usuario que cruzan de esquema sin FK
--
--  app."User".id es serial y crm.* lo apunta como integer suelto. Están en LA MISMA
--  BASE, así que la FK es posible; lo único que faltaba era declararla.
--
--  Van con ensure_fk y NO con un ALTER pelado porque crm.contacts.user_id y
--  crm.conversations.user_id tienen DEFAULT 2: si el usuario 2 no existe en esta
--  base, declarar la FK haría fallar TODO INSERT de contacto y de mensaje. El
--  ayudante lo detecta antes (busca huérfanos) y en ese caso solo deja un NOTICE.
--  ON DELETE SET NULL y no RESTRICT: un contacto o un mensaje sin dueño sigue
--  siendo un dato válido; una suscripción sin dueño no.
-- -----------------------------------------------------------------------------
SELECT app.ensure_fk('crm.lines',         'lines_user_id_fkey',         'user_id',
                     'app."User"', 'id', 'SET NULL');
SELECT app.ensure_fk('crm.events',        'events_user_id_fkey',        'id_de_usuario',
                     'app."User"', 'id', 'SET NULL');
SELECT app.ensure_fk('crm.contacts',      'contacts_user_id_fkey',      'user_id',
                     'app."User"', 'id', 'SET NULL');
SELECT app.ensure_fk('crm.conversations', 'conversations_user_id_fkey', 'user_id',
                     'app."User"', 'id', 'SET NULL');


-- =============================================================================
--  RETENCIÓN
--
--  app."Telemetry" crece sin freno: un INSERT por CADA request HTTP
--  (telemetry.middleware.ts:69) y otro por CADA evento de socket
--  (session.controller.ts:319, dentro de socket.onAny). Nada la borra nunca.
--
--  Qué se purga y qué NO:
--    · Telemetry  -> SÍ. Es medición de infra para calcular el costo del mes;
--                    stats.controller.ts nunca mira más atrás de 12 meses.
--    · crm.events -> opcional (apagado por defecto). Bitácora por contacto.
--    · crm.conversations -> opcional y APAGADO. Es el historial de conversación con
--                    el cliente: dato de negocio, no basura. Solo se borra si
--                    alguien lo pide explícitamente con un número de días.
--
--  Sin extensiones: no hay pg_cron. El disparo lo hace el backend al arrancar
--  (src/lib/retention.ts) y también hay un endpoint de admin — ver el resumen.
-- =============================================================================

-- Marca de "cuándo corrió por última vez". Existe para que N instancias del
-- servicio arrancando a la vez no repitan el borrado, y para poder responder
-- "¿esto se está limpiando?" sin adivinar.
CREATE TABLE IF NOT EXISTS app.maintenance_log (
  job          text PRIMARY KEY,
  last_run_at  timestamptz NOT NULL DEFAULT now(),
  rows_deleted bigint NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
--  Borrado por antigüedad, EN LOTES.
--  En lotes y no en un solo DELETE porque la primera corrida sobre una tabla que
--  lleva meses creciendo puede tocar millones de filas: un DELETE único mantendría
--  la transacción (y sus locks) abierta durante minutos y haría explotar el WAL.
--  Con lotes de p_batch cada vuelta es corta y el trabajo se puede interrumpir sin
--  dejar nada a medias — lo ya borrado, borrado está.
--  p_max_batches es el freno de mano: si hay más para borrar, lo hará la próxima
--  corrida. Así el arranque del servicio nunca se cuelga por esto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_by_age(
  p_table       text,
  p_ts_column   text,
  p_days        integer,
  p_batch       integer DEFAULT 10000,
  p_max_batches integer DEFAULT 100
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   bigint := 0;
  v_deleted bigint;
  v_cutoff  timestamptz := now() - make_interval(days => p_days);
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RETURN 0;   -- retención desactivada para esta tabla
  END IF;

  FOR i IN 1..p_max_batches LOOP
    EXECUTE format(
      'DELETE FROM %s WHERE ctid = ANY (ARRAY(
         SELECT ctid FROM %s WHERE %I < $1 LIMIT %s))',
      p_table, p_table, p_ts_column, p_batch
    ) USING v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    EXIT WHEN v_deleted = 0;
  END LOOP;

  RETURN v_total;
END
$$;

-- -----------------------------------------------------------------------------
--  Punto de entrada único. Devuelve jsonb con lo que hizo, para poder loguearlo.
--
--  pg_try_advisory_xact_lock y no pg_advisory_lock: si otra instancia ya está
--  purgando, esta se va sin esperar (devuelve skipped:'lock'), y el lock se suelta
--  solo al terminar la transacción aunque el proceso muera a mitad.
--
--  p_min_interval evita que un servicio que se reinicia en bucle (deploy fallido,
--  OOM) purgue veinte veces en una hora.
-- -----------------------------------------------------------------------------
--  app.ai_usage entra en la purga como CUARTA tabla (ver más abajo, en la
--  sección de multi-inquilino, por qué nace apagada y cada cuánto conviene
--  correr todo esto).
--
--  EL DROP DE ABAJO ES OBLIGATORIO, NO COSMÉTICO. Añadir un parámetro a una
--  función de Postgres NO la reemplaza: crea una SEGUNDA función con otra firma.
--  Con las dos vivas, la llamada por argumentos nombrados de src/lib/retention.ts
--  sería ambigua ("function app.run_retention(...) is not unique") y la purga
--  dejaría de correr en silencio. Se borra la firma vieja de 5 parámetros y se
--  crea la de 6. Es idempotente: en una base nueva el DROP no encuentra nada.
DROP FUNCTION IF EXISTS app.run_retention(integer, integer, integer, interval, boolean);

CREATE OR REPLACE FUNCTION app.run_retention(
  p_telemetry_days     integer  DEFAULT 90,
  p_events_days        integer  DEFAULT NULL,
  p_conversations_days integer  DEFAULT NULL,
  p_min_interval       interval DEFAULT '20 hours',
  p_force              boolean  DEFAULT false,
  p_ai_usage_days      integer  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_last  timestamptz;
  v_tel   bigint := 0;
  v_ev    bigint := 0;
  v_conv  bigint := 0;
  v_ia    bigint := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('app.run_retention')) THEN
    RETURN jsonb_build_object('skipped', 'lock');
  END IF;

  SELECT last_run_at INTO v_last FROM app.maintenance_log WHERE job = 'retention';

  IF NOT p_force AND v_last IS NOT NULL AND v_last > now() - p_min_interval THEN
    RETURN jsonb_build_object('skipped', 'reciente', 'last_run_at', v_last);
  END IF;

  v_tel  := app.purge_by_age('app."Telemetry"',    'timeStamp',       p_telemetry_days);
  v_ev   := app.purge_by_age('crm.events',         'marca_de_tiempo', p_events_days);
  v_conv := app.purge_by_age('crm.conversations',  'created_at',      p_conversations_days);
  v_ia   := app.purge_by_age('app.ai_usage',       'occurred_at',     p_ai_usage_days);

  INSERT INTO app.maintenance_log (job, last_run_at, rows_deleted)
  VALUES ('retention', now(), v_tel + v_ev + v_conv + v_ia)
  ON CONFLICT (job) DO UPDATE
    SET last_run_at  = EXCLUDED.last_run_at,
        rows_deleted = EXCLUDED.rows_deleted;

  RETURN jsonb_build_object(
    'telemetry',     v_tel,
    'events',        v_ev,
    'conversations', v_conv,
    'ai_usage',      v_ia,
    'ran_at',        now()
  );
END
$$;

-- -----------------------------------------------------------------------------
--  Contador de mensajes ATÓMICO.
--
--  El bucle leer-decidir-escribir de messages.controller.ts:61-115 pierde mensajes
--  cuando llegan dos a la vez (los dos leen 10, los dos escriben 11) y revienta con
--  23505 en el primer mensaje del mes si dos hilos intentan crear la misma fila.
--  Esto es lo que cobra el sistema: no puede depender de la suerte.
--
--  Un solo INSERT ... ON CONFLICT DO UPDATE resuelve las dos cosas: el conflicto lo
--  arbitra el índice único (userid, year, month) y el `+ 1` lo hace Postgres sobre
--  la fila ya bloqueada.
--
--  Devuelve el uso DESPUÉS de incrementar y el tope del plan; el llamador decide.
--  Si ya estaba en el tope no incrementa y devuelve allowed=false, así el chequeo y
--  el incremento son la MISMA operación y no hay ventana entre uno y otro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.increment_message_usage(p_user_id integer)
RETURNS TABLE (
  allowed       boolean,
  current_usage integer,
  message_limit integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_year  integer := EXTRACT(YEAR  FROM now())::int;
  v_month integer := EXTRACT(MONTH FROM now())::int;
  v_limit integer;
  v_used  integer;
BEGIN
  SELECT COALESCE(pl.monthly_message_limit, 0) INTO v_limit
    FROM app."User" u
    LEFT JOIN app."PlanLimit" pl ON pl.plan_name = u.subscription
   WHERE u.id = p_user_id;

  IF v_limit IS NULL THEN
    -- El usuario no existe: ni allowed ni contador.
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  -- Bloquea la fila del mes (o la crea) antes de decidir. FOR UPDATE es lo que
  -- serializa a dos mensajes simultáneos del mismo usuario.
  INSERT INTO app."UserMessageUsage" (userid, year, month, usedmessages, updatedat)
  VALUES (p_user_id, v_year, v_month, 0, now())
  ON CONFLICT (userid, year, month) DO NOTHING;

  SELECT usedmessages INTO v_used
    FROM app."UserMessageUsage"
   WHERE userid = p_user_id AND year = v_year AND month = v_month
     FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  UPDATE app."UserMessageUsage"
     SET usedmessages = usedmessages + 1,
         updatedat    = now()
   WHERE userid = p_user_id AND year = v_year AND month = v_month
  RETURNING usedmessages INTO v_used;

  RETURN QUERY SELECT true, v_used, v_limit;
END
$$;

-- -----------------------------------------------------------------------------
--  Devolución de un mensaje reservado que no se llegó a enviar.
--
--  El controlador pasó a RESERVAR el cupo antes de mandar el WhatsApp: es la
--  única forma de que dos envíos simultáneos en el límite no pasen los dos
--  (comprobar y cobrar tienen que ser la misma operación, y lo son en
--  increment_message_usage). El precio de reservar antes es que hay que saber
--  deshacerlo cuando el envío falla.
--
--  GREATEST(usedmessages - 1, 0): el contador no puede quedar negativo aunque
--  llegue una devolución de más — un mes con -1 mensajes daría un tope efectivo
--  mayor que el del plan.
--
--  No crea la fila si no existe: no haber reservado nunca y "devolver" no puede
--  inventar un consumo de -1.
-- -----------------------------------------------------------------------------
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


-- =============================================================================
--  MEDICIÓN DE CONSUMO Y CONSOLA DE ADMIN
--
--  Todo lo de esta sección nace de una auditoría con una conclusión incómoda: la
--  plataforma cobra por "mensajes" y gasta en tokens de IA, y de las dos cosas
--  solo mide la primera —y a medias—. Aquí se añade lo que falta para que un
--  panel de consumo pueda decir números REALES en vez de estimaciones.
--
--  Va al final del archivo porque referencia tablas de los dos esquemas
--  (app."User", app."WhatsAppNumber", app."Agent", crm.lines, events.event) y
--  todas tienen que existir ya.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  app.ai_usage — consumo de la IA, por llamada
--
--  QUÉ AGUJERO TAPA: hoy el dato existe y se tira a la basura.
--  services/ai.service.ts recibe `response.usageMetadata` de Gemini en cada
--  respuesta y devolvía solo `candidatesTokenCount`; los dos únicos llamadores
--  (whatsapp/messages.controller.ts, la rama de contacto no sincronizado y la de
--  handleIncomingMessageSynced) descartaban ese segundo elemento del array. O sea:
--  el número que dice cuánto cuesta cada respuesta vivía un instante en memoria y
--  se perdía. No había tabla, ni columna, ni log. Sin esto es IMPOSIBLE calcular
--  el costo por cliente, y por tanto el margen.
--
--  Se guardan los tokens de ENTRADA además de los de salida: con `history` de 30
--  mensajes + `systemInstruction` (el prompt del agente), el prompt es la parte
--  cara de la factura y era justo la que no se miraba.
--
--  Se registra TAMBIÉN cuando la llamada falla (ok=false): una cuenta que quema
--  cuota a base de errores es exactamente la que hay que poder ver.
--
--  Sin FK a app."User" NO: aquí sí conviene la FK con CASCADE, porque una fila de
--  consumo de un usuario borrado no le sirve a nadie y no hay volumen de escritura
--  extremo (una fila por respuesta de IA, no una por request HTTP).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.ai_usage (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES app."User"(id)          ON DELETE CASCADE,
  -- De qué número QR salió. NULL si la llamada no vino de un número concreto.
  number_id      integer          REFERENCES app."WhatsAppNumber"(id) ON DELETE SET NULL,
  -- Reservado para el carril Meta (CRM-ms). Hoy nadie lo escribe: ese carril no
  -- pasa por ai.service.ts. Se deja la columna para no migrar la tabla después.
  line_id        uuid             REFERENCES crm.lines(id)            ON DELETE SET NULL,
  agent_id       integer          REFERENCES app."Agent"(id)          ON DELETE SET NULL,
  model          text    NOT NULL,
  -- promptTokenCount tal cual lo devuelve Gemini: es el prompt EFECTIVO COMPLETO
  -- e INCLUYE los cacheados. No restarlos aquí; ver cached_tokens.
  prompt_tokens  integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  -- cachedContentTokenCount: SUBCONJUNTO de prompt_tokens, no un sumando aparte.
  -- Google los cobra más baratos. Al valorar hay que hacer
  --   (prompt_tokens - cached_tokens) * tarifa_entrada + cached_tokens * tarifa_cache
  -- Sumar los tres campos por separado cuenta los cacheados dos veces.
  cached_tokens  integer NOT NULL DEFAULT 0,
  latency_ms     integer,
  ok             boolean NOT NULL DEFAULT true,
  error_kind     text,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
-- El panel del cliente: "mi consumo de IA de este mes", siempre acotado a user_id
-- y a una ventana de tiempo. Es la consulta que más se va a repetir.
CREATE INDEX IF NOT EXISTS ai_usage_user_time_idx ON app.ai_usage (user_id, occurred_at DESC);
-- La consola de admin agrega por mes SIN filtrar usuario, y la purga por
-- retención borra por antigüedad: las dos necesitan el tiempo como primera columna.
CREATE INDEX IF NOT EXISTS ai_usage_time_idx      ON app.ai_usage (occurred_at);

-- -----------------------------------------------------------------------------
--  app.ai_model_price — tarifa por modelo, CON VIGENCIA
--
--  valid_from forma parte de la PK a propósito. Si la tarifa fuera una sola fila
--  por modelo, el día que Google cambie el precio se reescribiría la historia:
--  los meses ya cerrados pasarían a costar lo que cuesta hoy. Con vigencia, cada
--  fila de ai_usage se valora con la tarifa que regía EN SU FECHA.
--
--  NACE VACÍA A PROPÓSITO. No se siembra ningún precio porque no hay ninguna
--  factura de Google en este repositorio de la que sacarlo, y un precio inventado
--  convierte el número más importante del negocio (el margen) en ficción. Hasta
--  que alguien cargue la tarifa real, las consultas de costo devuelven filas sin
--  valorar y la UI dice "no disponible: falta cargar la tarifa del modelo X".
--
--  Para cargarla, con los precios de la factura real:
--    INSERT INTO app.ai_model_price (model, valid_from, input_usd_per_1m, output_usd_per_1m)
--    VALUES ('gemini-2.0-flash', '2026-01-01', <entrada>, <salida>);
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.ai_model_price (
  model             text    NOT NULL,
  valid_from        date    NOT NULL,
  input_usd_per_1m  numeric NOT NULL,
  output_usd_per_1m numeric NOT NULL,
  -- Gemini factura el token cacheado más barato que el de entrada. NULL = "no se
  -- sabe", y entonces el cacheado se valora como entrada normal (conservador).
  cached_usd_per_1m numeric,
  PRIMARY KEY (model, valid_from)
);

-- -----------------------------------------------------------------------------
--  app.admin_actividad — el límite de privacidad, escrito como SQL
--
--  DECISIÓN DE PRODUCTO, no de implementación: un admin de la PLATAFORMA ve
--  METADATOS (cuántos, cuándo, de qué tipo, si falló y por qué) y NUNCA CONTENIDO
--  (qué se dijo, a quién, con qué prompt). Los mensajes que un cliente intercambia
--  con SUS leads son del cliente.
--
--  Por qué hace falta una vista y no basta con "acordarse de no seleccionar el
--  payload": events.capturar_conversacion() mete el mensaje ENTERO en el payload
--  del evento —'body' y 'preview'— porque el carril de webhooks lo necesita (y
--  solo lo entrega si el cliente marca include_message_body). Consecuencia: un
--  `SELECT payload FROM events.event` en una consola de admin es leer las
--  conversaciones de todos los clientes. Aquí las columnas prohibidas simplemente
--  NO EXISTEN, así que ningún SELECT posterior puede sacarlas por descuido.
--
--  Qué se deja fuera y por qué:
--    · payload->>'body' / 'preview'      -> el texto del mensaje
--    · payload->'contact'->>'name'/'phone' -> la cartera de clientes del cliente
--  Qué sí se deja y por qué:
--    · largo_mensaje = length(body). Resuelve el caso de soporte real ("al lead le
--      llegó un mensaje vacío") sin enseñar una sola palabra.
--    · contacto_id — un uuid opaco. Permite correlacionar dos eventos del mismo
--      hilo sin decir de quién es.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.admin_actividad AS
SELECT e.id,
       e.occurred_at,
       e.account_id,
       u.username,
       e.type,
       e.payload->'line'->>'label'              AS linea,
       e.payload->'contact'->>'id'              AS contacto_id,
       e.payload->>'from_stage'                 AS etapa_anterior,
       e.payload->>'to_stage'                   AS etapa_nueva,
       length(COALESCE(e.payload->>'body', '')) AS largo_mensaje
FROM events.event e
LEFT JOIN app."User" u ON u.id = e.account_id;

COMMENT ON VIEW app.admin_actividad IS
  'Actividad para la consola de admin: SOLO metadatos. Sin texto de mensajes, sin nombre ni teléfono de contactos. La consola consulta esta vista y nunca events.event directamente.';


-- -----------------------------------------------------------------------------
--  ÍNDICES QUE PIDEN EL PANEL DE CONSUMO Y LA CONSOLA
--
--  Cada uno responde a una consulta concreta de usage.controller.ts o de
--  adminConsole.controller.ts. Ninguno es "por si acaso".
-- -----------------------------------------------------------------------------

-- Resolver la cuenta a partir del username del token. Lo hace CADA request de
-- /api/usage y /api/admin/console, y también el isAdmin endurecido (que relee el
-- rol de la base en vez de creerle al token). Ya existe como UNIQUE de la columna
-- username, así que no hace falta índice nuevo: se deja anotado para que nadie lo
-- añada dos veces.

-- La consola suma el consumo del MES EN CURSO de TODOS los usuarios (resumen de
-- plataforma, distribución por plan, tabla maestra, lista de "al borde del tope").
-- Sin esto es un scan completo de UserMessageUsage, que crece una fila por usuario
-- y mes: a 12 meses son 12x el padrón. El índice único existente arranca por
-- userid y no puede servir un filtro que solo conoce (year, month).
-- El INCLUDE evita ir a la tabla: las dos columnas que se leen viajan en el índice.
CREATE INDEX IF NOT EXISTS usermessageusage_periodo_idx
  ON app."UserMessageUsage" (year, month) INCLUDE (userid, usedmessages);

-- Todo el carril Meta del panel cuelga de "las líneas de este usuario":
-- capacidad instalada, contactos del CRM y el gráfico de tráfico diario (que
-- entra por contacts -> lines). crm.lines NO tenía ningún índice por user_id
-- —solo por is_active—, así que cada tarjeta hacía un scan de la tabla.
-- Sirve además a la consulta de datos rotos (WHERE user_id IS NULL): en un btree
-- los NULL se indexan.
CREATE INDEX IF NOT EXISTS lines_user_id_idx ON crm.lines (user_id);

-- El resumen de plataforma cuenta los mensajes Meta del mes SIN filtrar por línea
-- ni por contacto: count(*) FROM crm.conversations WHERE "timestamp" >= mes.
-- Los índices que ya había arrancan por contact_id, por line_id o por created_at;
-- ninguno puede resolver un rango sobre "timestamp", que es la columna que usa el
-- carril Meta como hora del hecho. Hoy esa cifra es un scan de la tabla de
-- mensajes entera, que es la más grande del sistema.
CREATE INDEX IF NOT EXISTS conversations_timestamp_idx
  ON crm.conversations ("timestamp" DESC);

-- Pantalla de errores: entregas fallidas de los últimos 7 días. El índice de la
-- cola (delivery_cola_idx) es parcial sobre pending/failed/delivering y ordena por
-- next_attempt_at, así que no sirve para 'exhausted'/'blocked' ni para un rango de
-- created_at. Este también es parcial —y por eso diminuto—: la inmensa mayoría de
-- las filas de delivery acaban en 'succeeded' y no entran aquí.
CREATE INDEX IF NOT EXISTS delivery_fallidas_idx
  ON events.delivery (created_at DESC)
  WHERE status IN ('failed', 'exhausted', 'blocked');

-- Historial de pagos de la ficha de un usuario y "último pago" de la tabla
-- maestra: ya lo sirve subscriptions_user_created_idx (user_id, created_at DESC),
-- definido más arriba. Anotado para que no se duplique.


-- =============================================================================
--  MULTI-INQUILINO: LO QUE LA BASE APORTA A LA COMPROBACIÓN DE PROPIEDAD
--
--  El código ya no se fía del id que llega en la petición: cada endpoint
--  comprueba que el recurso es del usuario del token (src/lib/propiedad.ts en los
--  dos backends). Esta sección es lo que esa comprobación necesita de la base:
--  los índices que la hacen barata y el diagnóstico de los datos que todavía no
--  permiten aplicarla al 100%.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Índice para el listado de no sincronizados, que ahora SIEMPRE va filtrado.
--
--  GET /api/unsyncedcontacts pasó de "toda la tabla" a "los números de este
--  usuario", y ordena por el mensaje más reciente con LIMIT. Los índices que
--  había —el único (numberid, wa_id)— resuelven el filtro pero no el orden, así
--  que Postgres tenía que ordenar en memoria todas las filas del usuario para
--  quedarse con 500. Con el timestamp como segunda columna, el LIMIT se sirve
--  leyendo el índice hacia atrás y parando.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS unsynced_numberid_ultimo_idx
  ON app."Unsyncedcontact" (numberid, lastmessagetimestamp DESC);

-- -----------------------------------------------------------------------------
--  LO QUE FALTA EN LOS DATOS: crm.lines.user_id
--
--  `user_id` es nullable y hay filas antiguas creadas antes de que existiera el
--  concepto de dueño. Mientras queden, el CRM no puede saber de quién es esa
--  línea, así que la deja pasar y avisa en el log (lib/propiedad.ts). La regla
--  dura —"si TIENE dueño y no eres tú, 404"— se aplica siempre; lo único que
--  queda abierto son las líneas sin dueño.
--
--  Para cerrarlo del todo:
--
--    1) Ver cuáles son:
--         SELECT id, number, "NOMBRE_LINEA", created_at
--           FROM crm.lines WHERE user_id IS NULL;
--
--    2) Asignarles su dueño real (una por una, mirando de qué cliente es cada
--       número — NO hay forma automática de deducirlo y adivinar sería peor que
--       dejarlo como está):
--         UPDATE crm.lines SET user_id = <id de app."User"> WHERE id = '<uuid>';
--
--    3) Cuando la consulta del paso 1 no devuelva nada, poner
--       CRM_STRICT_OWNERSHIP=true en el servicio del CRM. A partir de ahí, una
--       línea sin dueño responde 404 en vez de pasar.
--
--    4) Con el paso 3 hecho y estable, se puede fijar en la base:
--         ALTER TABLE crm.lines ALTER COLUMN user_id SET NOT NULL;
--       No se hace aquí: este archivo corre en cada arranque contra la base viva
--       y un NOT NULL con filas nulas aborta el despliegue entero.
--
--  El índice que necesita el filtro (lines_user_id_idx) ya está definido más
--  arriba, en la sección del panel de consumo.
-- -----------------------------------------------------------------------------


-- =============================================================================
--  RETENCIÓN DE app.ai_usage
--
--  ai_usage crece una fila por respuesta de IA y no la borraba nadie: es la
--  cuarta tabla de la base que crece sin techo, después de Telemetry, crm.events
--  y events.event/delivery (esas tres ya tienen purga).
--
--  NACE APAGADA, por la misma razón que crm.conversations: esta tabla es la
--  prueba de cuánto costó cada mes. Borrarla es perder la contabilidad, así que
--  tiene que ser una decisión explícita (AI_USAGE_RETENTION_DAYS), no un valor
--  por defecto. Si algún día se activa, 400 días es un mínimo razonable: deja
--  cerrar un ejercicio completo y comparar con el mismo mes del año anterior.
--
--  CADA CUÁNTO CORRER LA PURGA (vale para las cuatro tablas de app.run_retention):
--    · Una vez al día es de sobra. El disparo está en el arranque del API
--      (src/lib/retention.ts, 30 s después de levantar), así que cualquier
--      despliegue ya la cubre, y app.maintenance_log impide que se repita antes
--      de 20 horas aunque el servicio se reinicie en bucle.
--    · Si el servicio pasara semanas sin reiniciarse: POST /api/stats/retention
--      (endpoint de admin) la fuerza.
--    · events.event / delivery / delivery_attempt van por su lado, en el worker
--      de webhooks (events.purgar_retencion, una vez al día).
--
--  Los detalles de la firma y el porqué del DROP están junto a la propia
--  función, más arriba en este archivo.
-- =============================================================================


-- =============================================================================
--  VOTOS DE ENCUESTAS (app.poll_votes)
--
--  whatsapp-web.js emite 'vote_update' cada vez que alguien selecciona o
--  deselecciona opciones en una encuesta enviada desde una línea. Ese evento es
--  EFÍMERO: si nadie lo guarda, el resultado de la encuesta solo existe en el
--  teléfono. Esta tabla es el registro; el listener vive en
--  src/controllers/whatsapp/session.controller.ts.
--
--  IDEMPOTENTE POR DISEÑO: WhatsApp re-emite el estado COMPLETO del votante en
--  cada interacción (no un delta), así que la fila es "el último estado de este
--  votante en esta encuesta" y la clave única (numberid, poll_id, votante) hace
--  que un re-voto o un evento duplicado sea un UPDATE y no una fila más.
--
--  · votante guarda el TELÉFONO ya resuelto (el @lid se traduce con
--    getContactLidAndPhone antes de escribir, mismo mecanismo que
--    messages.controller.ts usa para los remitentes).
--  · opcion es jsonb (array de nombres) porque una encuesta con
--    allowMultipleAnswers permite varias a la vez, y un array vacío significa
--    "retiró su voto" — que también es información.
--  · voted_at es epoch ms (bigint), el senderTimestampMs que reporta WhatsApp,
--    mismo criterio que lastmessagetimestamp en Unsyncedcontact.
-- =============================================================================
CREATE TABLE IF NOT EXISTS app.poll_votes (
  id        serial PRIMARY KEY,
  numberid  integer NOT NULL REFERENCES app."WhatsAppNumber"(id) ON DELETE CASCADE,
  chat      text NOT NULL,
  poll_id   text NOT NULL,
  pregunta  text,
  votante   text NOT NULL,
  opcion    jsonb NOT NULL DEFAULT '[]'::jsonb,
  voted_at  bigint NOT NULL,
  CONSTRAINT poll_votes_unico UNIQUE (numberid, poll_id, votante)
);

-- La consulta del panel es siempre "los votos de las encuestas de ESTE chat".
CREATE INDEX IF NOT EXISTS poll_votes_chat_idx ON app.poll_votes (numberid, chat);
