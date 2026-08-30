import { config } from 'dotenv'

// Asegurar que las variables de entorno estén cargadas
config()

// El cliente ya no es de Supabase: es un adaptador con la misma forma
// (`from().select().eq().single()`, `.rpc()`) montado sobre un pool de `pg` que
// apunta al Postgres de Railway. Se reexporta con el mismo nombre `supabase`
// para no tocar los 105 call sites que lo importan de aquí.
// Detalles: src/lib/supabase-adapter.ts · conexión y SSL: src/lib/db.ts
export { supabase } from '../lib/supabase-adapter.js'
