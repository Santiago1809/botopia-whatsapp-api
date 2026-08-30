-- =============================================================================
--  004 · CHECK en crm.contacts.funnel_stage y priority
-- =============================================================================
--
--  CUÁNDO CORRER ESTO: cuando la consulta 8 de 001_diagnostico.sql devuelva SOLO
--  valores de las listas de abajo. Si aparece cualquier otro, primero decidir a
--  qué etapa corresponde y migrarlo (hay un UPDATE de ejemplo comentado al final).
--
--  POR QUÉ NO ESTÁ EN schema.sql: crm.conversations.sender sí tiene CHECK y estas
--  dos no, aunque son igual de estructurales. Pero contactService.ts:347-357 hace
--    return statusMap[status] || status;
--  o sea, cualquier cadena que llegue en el request entra tal cual como etapa del
--  embudo. Poner el CHECK convierte eso en un error 500 visible — que es lo que
--  se busca — PERO si el front está mandando hoy algún valor fuera de la lista,
--  ese 500 aparece en producción sin aviso. Sin poder mirar los datos reales, la
--  decisión es tuya, no de un archivo que corre solo en cada arranque.
--
--  Pista de que sí falta algo: contactService.ts:470 cuenta la etapa
--  'pendiente-documentacion', que mapStatusFromDatabase (487-497) nunca produce.
--  O es código muerto, o hay una etapa real que el mapa no conoce.
--
--    psql "$DATABASE_URL" -f db/migrations/004_checks_embudo.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
--  Las 5 etapas salen de mapStatusToDatabase (contactService.ts:348-354), que es
--  el único sitio que traduce lo que manda el front al valor que va a la columna.
--  'nuevo' es además el DEFAULT de la columna.
-- -----------------------------------------------------------------------------
-- DROP antes del ADD: si el archivo se aborta en el VALIDATE y hay que corregir
-- datos y volver a correrlo, el segundo intento no debe fallar por duplicado.
ALTER TABLE crm.contacts DROP CONSTRAINT IF EXISTS contacts_funnel_stage_check;
ALTER TABLE crm.contacts
  ADD CONSTRAINT contacts_funnel_stage_check
  CHECK (funnel_stage IN ('nuevo', 'en_contacto', 'cita_agendada',
                          'atencion_cliente', 'cerrado')) NOT VALID;

-- Las 3 prioridades salen del front (mockData.ts y el tipo Contact de types/index.ts).
ALTER TABLE crm.contacts DROP CONSTRAINT IF EXISTS contacts_priority_check;
ALTER TABLE crm.contacts
  ADD CONSTRAINT contacts_priority_check
  CHECK (priority IS NULL OR priority IN ('alta', 'media', 'baja')) NOT VALID;

-- VALIDATE es lo que revisa las filas que ya están. Si alguno de los dos falla,
-- hacer ROLLBACK, mirar qué valor sobra con la consulta 8 del diagnóstico y
-- decidir: o se añade a la lista de arriba, o se migra con el UPDATE del final.
ALTER TABLE crm.contacts VALIDATE CONSTRAINT contacts_funnel_stage_check;
ALTER TABLE crm.contacts VALIDATE CONSTRAINT contacts_priority_check;

COMMIT;

-- =============================================================================
--  Si el diagnóstico mostró etapas con guion medio ('en-contacto' en vez de
--  'en_contacto'), es que alguna escritura se saltó mapStatusToDatabase. Se
--  normalizan así ANTES de correr el archivo:
--
--    UPDATE crm.contacts SET funnel_stage = replace(funnel_stage, '-', '_')
--     WHERE funnel_stage LIKE '%-%';
--
--  Y si aparece 'pendiente_documentacion' / 'pendiente-documentacion', entonces
--  es una etapa REAL que el código no conoce: hay que añadirla al CHECK de arriba
--  y también a los dos mapas de contactService.ts (mapStatusToDatabase y
--  mapStatusFromDatabase), o el kanban seguirá contándola en cero.
-- =============================================================================
