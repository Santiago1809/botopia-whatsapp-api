import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Asegurar que las variables de entorno estén cargadas
config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_KEY deben estar configuradas en las variables de entorno')
  throw new Error('Variables de entorno de Supabase no configuradas')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
