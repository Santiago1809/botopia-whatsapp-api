-- =============================================================================
--  002 · FKs de user_id que el arranque no pudo poner
-- =============================================================================
--
--  CUÁNDO CORRER ESTO: solo si `001_diagnostico.sql` (consulta 1) muestra alguna
--  FK como FALTA. Si no aparece ninguna, ya está todo puesto y este archivo sobra.
--
--  POR QUÉ NO ESTÁ EN schema.sql: schema.sql se corre en cada arranque sobre la
--  base viva. Ahí una FK solo se puede declarar si Postgres puede VALIDARLA contra
--  los datos que ya hay; si encuentra un id huérfano, falla, y como todo el archivo
--  va en una sola transacción, tumbaría el despliegue entero. app.ensure_fk mira
--  antes y prefiere avisar. Esto es la otra mitad: limpiar y volver a intentar.
--
--  RIESGO REAL: crm.contacts.user_id y crm.conversations.user_id tienen DEFAULT 2.
--  Si el usuario 2 NO existe en app."User" y aun así se declara la FK, TODO INSERT
--  de contacto y TODO INSERT de mensaje empieza a fallar — o sea, la máquina deja
--  de registrar conversaciones de WhatsApp. Por eso el paso 0 no es opcional.
--
--    psql "$DATABASE_URL" -f db/migrations/002_fks_user_id.sql
--
--  Todo va dentro de una transacción: si algo no cuadra, ROLLBACK y no pasó nada.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
--  PASO 0 — Freno de mano. Si el usuario 2 no existe, aborta antes de tocar nada.
--  Elegir UNA de las dos salidas y ejecutarla ANTES de volver a correr el archivo:
--    (a) crear/identificar el usuario dueño real de esos datos y reasignar, o
--    (b) cambiar el DEFAULT a NULL:
--          ALTER TABLE crm.contacts      ALTER COLUMN user_id DROP DEFAULT;
--          ALTER TABLE crm.conversations ALTER COLUMN user_id DROP DEFAULT;
--        (con la FK en SET NULL, "sin dueño" es un estado válido; "dueño que no
--         existe" no lo es)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app."User" WHERE id = 2) THEN
    RAISE EXCEPTION
      'El usuario 2 no existe, pero es el DEFAULT de crm.contacts.user_id y crm.conversations.user_id. Declarar la FK ahora rompería todos los INSERT. Ver PASO 0.';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
--  PASO 1 — Poner en NULL los ids que apuntan a usuarios que ya no existen.
--
--  Se pone NULL y no se borra la fila: un contacto o un mensaje sin dueño sigue
--  siendo un dato real del negocio; el dueño equivocado es lo que hay que quitar.
--  Revisar antes con la consulta 2 de 001_diagnostico.sql cuántas filas son.
-- -----------------------------------------------------------------------------
UPDATE crm.lines l SET user_id = NULL
 WHERE l.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app."User" u WHERE u.id = l.user_id);

UPDATE crm.events e SET id_de_usuario = NULL
 WHERE e.id_de_usuario IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app."User" u WHERE u.id = e.id_de_usuario);

UPDATE crm.contacts c SET user_id = NULL
 WHERE c.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app."User" u WHERE u.id = c.user_id);

-- La grande. Si crm.conversations tiene millones de filas, este UPDATE puede
-- tardar y genera mucho WAL. Correrlo en una ventana de poco tráfico.
UPDATE crm.conversations v SET user_id = NULL
 WHERE v.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app."User" u WHERE u.id = v.user_id);

-- -----------------------------------------------------------------------------
--  PASO 2 — Declarar las FKs.
--
--  Se usa el mismo ayudante que schema.sql (mismos nombres de constraint, mismo
--  ON DELETE), pero con el tope de filas subido: aquí sí queremos que escanee
--  aunque la tabla sea grande, porque esto se corre a mano y a conciencia.
-- -----------------------------------------------------------------------------
SELECT app.ensure_fk('crm.lines',         'lines_user_id_fkey',         'user_id',
                     'app."User"', 'id', 'SET NULL', 9223372036854775807);
SELECT app.ensure_fk('crm.events',        'events_user_id_fkey',        'id_de_usuario',
                     'app."User"', 'id', 'SET NULL', 9223372036854775807);
SELECT app.ensure_fk('crm.contacts',      'contacts_user_id_fkey',      'user_id',
                     'app."User"', 'id', 'SET NULL', 9223372036854775807);
SELECT app.ensure_fk('crm.conversations', 'conversations_user_id_fkey', 'user_id',
                     'app."User"', 'id', 'SET NULL', 9223372036854775807);

-- -----------------------------------------------------------------------------
--  PASO 3 — Comprobar que quedaron las cuatro antes de confirmar.
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_faltan text;
BEGIN
  SELECT string_agg(nombre, ', ') INTO v_faltan
  FROM (VALUES ('lines_user_id_fkey'), ('events_user_id_fkey'),
               ('contacts_user_id_fkey'), ('conversations_user_id_fkey')) AS t(nombre)
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = nombre);

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Quedaron FKs sin crear: %. Revisar los NOTICE de arriba.', v_faltan;
  END IF;
  RAISE NOTICE 'Las 4 FKs de user_id quedaron declaradas.';
END
$$;

COMMIT;
