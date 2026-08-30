import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../config/db.js';

const router = Router();

// Tope por defecto del listado. Sin él, un GET sin `numberid` hacía un
// `select('*')` sobre la tabla ENTERA: teléfono, nombre y el texto del último
// WhatsApp de todos los números de todos los clientes, en una sola respuesta.
// El tope no arregla el problema de fondo (esta ruta sigue sin autenticación,
// ver el resumen de la entrega), pero sí que un descuido devuelva la base entera.
const TOPE_POR_DEFECTO = Number(process.env.UNSYNCED_PAGE_SIZE || 500);
const TOPE_MAXIMO = 2000;

router.get('/', async (req: Request, res: Response) => {
  const { numberid, limit } = req.query;

  const pedido = Number(limit);
  const tope = Number.isFinite(pedido) && pedido > 0
    ? Math.min(Math.floor(pedido), TOPE_MAXIMO)
    : TOPE_POR_DEFECTO;

  let query = supabase
    .from('Unsyncedcontact')
    .select('*')
    // Orden estable: sin ORDER BY, Postgres puede devolver las filas en cualquier
    // orden y con LIMIT eso hace que "la primera página" cambie entre llamadas.
    // Por el mensaje más reciente, que es lo que la pantalla quiere ver arriba.
    .order('lastmessagetimestamp', { ascending: false })
    .limit(tope);

  if (numberid) query = query.eq('numberid', numberid);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Se responde el array pelado, como siempre: el front lo consume así.
  res.json(data);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { agentehabilitado } = req.body;
  if (typeof agentehabilitado !== 'boolean') {
    res.status(400).json({ error: 'agentehabilitado debe ser boolean' });
    return;
  }
  const { error } = await supabase
    .from('Unsyncedcontact')
    .update({ agentehabilitado })
    .eq('id', id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  // EMITIR EVENTO SOCKET para refrescar lista en frontend
  const io = req.app.get('io');
  if (io && typeof io.to === 'function') {
    // Busca el contacto actualizado para obtener el numberid
    const { data: updated } = await supabase
      .from('Unsyncedcontact')
      .select('numberid')
      .eq('id', id)
      .single();
    if (updated && updated.numberid) {
      io.to(updated.numberid.toString()).emit('unsynced-contacts-updated', { numberid: updated.numberid });
    }
  }
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  // Obtener el numberid antes de borrar
  const { data: toDelete } = await supabase
    .from('Unsyncedcontact')
    .select('numberid')
    .eq('id', id)
    .single();
  const { error } = await supabase
    .from('Unsyncedcontact')
    .delete()
    .eq('id', id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  // EMITIR EVENTO SOCKET para refrescar lista en frontend
  const io = req.app.get('io');
  if (io && typeof io.to === 'function' && toDelete && toDelete.numberid) {
    io.to(toDelete.numberid.toString()).emit('unsynced-contacts-updated', { numberid: toDelete.numberid });
  }
  res.json({ success: true });
});

router.delete('/by-number/:numberid', async (req: Request, res: Response) => {
  const { numberid } = req.params;
  const { error } = await supabase
    .from('Unsyncedcontact')
    .delete()
    .eq('numberid', numberid);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

export default router; 