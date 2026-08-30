-- =============================================================================
--  003 · app.subscriptions — NOT NULL y la fecha del próximo cobro
-- =============================================================================
--
--  CUÁNDO CORRER ESTO: cuando 001_diagnostico.sql (consultas 6 y 7) muestre
--    · consulta 6: ceros en sin_usuario / sin_estado / sin_monto / sin_plan
--    · consulta 7: TODO en 'parseable (ISO)' o 'vacío', nada en 'OTRO FORMATO'
--
--  POR QUÉ NO ESTÁ EN schema.sql: es la tabla del dinero y ninguna de las dos
--  cosas se puede deshacer sola. Un ALTER ... SET NOT NULL sobre una columna con
--  NULLs falla y tumba el arranque; un ALTER ... TYPE date sobre un texto con un
--  formato inesperado falla igual, y si NO falla porque el formato era ambiguo
--  (03/04/2026: ¿marzo o abril?) el daño es peor, porque es silencioso.
--
--  ORDEN: correr 002 antes (esto asume que subscriptions.user_id ya no tiene
--  huérfanos y que la FK a app."User" con RESTRICT ya está puesta).
--
--    psql "$DATABASE_URL" -f db/migrations/003_dinero_y_fechas.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
--  PARTE A — NOT NULL en las columnas que definen "esto es un cobro"
--
--  Hoy TODAS las columnas de app.subscriptions son nullable, incluidas status,
--  amount, plan_name y user_id. Una fila sin status ni monto no es un pago: es
--  ruido que el webhook puede llegar a elegir como "la pendiente más reciente".
--
--  Cada bloque aborta con un mensaje claro si encuentra NULLs, en vez de fallar
--  con "column contains null values" a secas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_col  text;
  v_null bigint;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['user_id', 'status', 'amount', 'plan_name'] LOOP
    EXECUTE format('SELECT count(*) FROM app.subscriptions WHERE %I IS NULL', v_col)
      INTO v_null;
    IF v_null > 0 THEN
      RAISE EXCEPTION
        'app.subscriptions.% tiene % fila(s) en NULL. Decidir qué hacer con ellas antes de seguir: SELECT * FROM app.subscriptions WHERE % IS NULL;',
        v_col, v_null, v_col;
    END IF;
    EXECUTE format('ALTER TABLE app.subscriptions ALTER COLUMN %I SET NOT NULL', v_col);
    RAISE NOTICE 'app.subscriptions.% ahora es NOT NULL.', v_col;
  END LOOP;
END
$$;

-- El estado tampoco puede ser cualquier cosa. Los valores salen de
-- subscription.controller.ts: la fila nace en 'pending' (minúscula) y el webhook
-- la mueve a 'PAID' o 'PENDING' (mayúscula), de ahí que estén los dos.
-- NOT VALID: no revisa las filas viejas (ya las revisó el bloque de arriba con la
-- consulta 6), solo obliga a partir de ahora. Se valida al final.
-- DROP antes del ADD para que volver a correr el archivo (por ejemplo tras
-- arreglar los NULL que lo abortaron) no falle con "constraint already exists".
ALTER TABLE app.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE app.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'PENDING', 'PAID', 'REJECTED', 'CANCELLED')) NOT VALID;

-- Si esto falla, hay estados en la base que la lista de arriba no contempla:
--   SELECT status, count(*) FROM app.subscriptions GROUP BY 1;
-- Añadirlos a la lista y volver a correr.
ALTER TABLE app.subscriptions VALIDATE CONSTRAINT subscriptions_status_check;

-- -----------------------------------------------------------------------------
--  PARTE B — scheduled_date: text -> date
--
--  Es la fecha del próximo cobro y hoy es texto. Como texto no se puede ordenar,
--  ni filtrar por rango, ni indexar: no hay forma de responder "¿qué suscripciones
--  vencen mañana?" sin traerlas todas y parsearlas en JS.
--
--  La conversión SOLO es segura si la consulta 7 del diagnóstico dio todo ISO.
--  El USING recorta a los 10 primeros caracteres porque DLocal puede mandar la
--  fecha con hora pegada ('2026-09-01T00:00:00Z').
--
--  Compatibilidad con el código: subscription.controller.ts:392 devuelve el valor
--  como `nextPaymentDate` en el JSON. node-postgres serializa un `date` como
--  'YYYY-MM-DD', que es exactamente el prefijo que ya viajaba. Si DLocal mandaba
--  la hora pegada, el front deja de recibirla — revisar si la usaba.
-- -----------------------------------------------------------------------------
-- Un solo bloque: comprobar el formato Y convertir. Los dos pasos tienen que ir
-- juntos y detrás de la MISMA condición "la columna todavía es texto", porque en
-- cuanto es `date` un btrim(scheduled_date) ya no compila (btrim no acepta date)
-- y volver a correr el archivo fallaría por eso, no por los datos.
DO $$
DECLARE v_malas bigint;
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'subscriptions'
         AND column_name = 'scheduled_date') <> 'text' THEN
    RAISE NOTICE 'scheduled_date ya no es texto: la conversión ya se hizo.';
    RETURN;
  END IF;

  EXECUTE $chk$
    SELECT count(*) FROM app.subscriptions
     WHERE scheduled_date IS NOT NULL
       AND btrim(scheduled_date) <> ''
       AND left(btrim(scheduled_date), 10) !~ '^\d{4}-\d{2}-\d{2}$'
  $chk$ INTO v_malas;

  IF v_malas > 0 THEN
    RAISE EXCEPTION
      'scheduled_date tiene % valor(es) que no son ISO. Convertirlos a mano antes: SELECT DISTINCT scheduled_date FROM app.subscriptions WHERE left(btrim(scheduled_date),10) !~ ''^\d{4}-\d{2}-\d{2}$'';',
      v_malas;
  END IF;

  EXECUTE $sql$
    ALTER TABLE app.subscriptions
      ALTER COLUMN scheduled_date TYPE date
      USING NULLIF(left(btrim(scheduled_date), 10), '')::date
  $sql$;
  RAISE NOTICE 'scheduled_date convertida a date.';
END
$$;

-- Ahora sí se puede preguntar qué vence pronto.
CREATE INDEX IF NOT EXISTS subscriptions_scheduled_date_idx
  ON app.subscriptions (scheduled_date)
  WHERE scheduled_date IS NOT NULL;

COMMIT;

-- =============================================================================
--  NOTA SOBRE LOS MONTOS — esto NO se arregla en la base
--
--  amount, amount_paid y amount_received ya son `numeric` en el DDL, que es lo
--  correcto. Lo que los rompía era el driver:
--
--    src/lib/db.ts        -> types.setTypeParser(1700, Number)
--    CRM-ms/src/lib/db.ts -> types.setTypeParser(1700, Number)
--
--  1700 es el OID de `numeric`. Con ese parser, un monto exacto guardado como
--  149900.10 vuelve a JS como un double y deja de ser exacto. La columna estaba
--  bien; la conversión de salida la degradaba.
--
--  Ya está corregido en el código de esta entrega (el parser se quitó y la
--  comparación de subscription.controller.ts pasó a hacerse con centavos enteros).
--  Aquí solo queda anotado para que nadie vuelva a poner el parser.
-- =============================================================================
