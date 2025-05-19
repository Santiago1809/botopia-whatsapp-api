import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

console.log("URL:", SUPABASE_URL);
console.log("KEY OK?:", !!SUPABASE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testInsertUnsyncedContact() {
  try {
    const { data, error } = await supabase
      .from('Unsyncedcontact')
      .insert([
        {
          numberid: 999,
          wa_id: '573001234567@c.us',
          number: '573001234567',
          name: 'Prueba Script',
          lastmessagetimestamp: Date.now(),
          lastmessagepreview: '¡Hola! Esto es una prueba.',
          agentehabilitado: false
        }
      ]);

    if (error) {
      console.error('❌ Error al insertar:', error);
    } else {
      console.log('✅ Inserción exitosa:', data);
    }
  } catch (e) {
    console.error('❗ ERROR en el try/catch:', e);
  }
}

testInsertUnsyncedContact();
