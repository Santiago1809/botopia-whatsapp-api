import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../config/db.js';
import type { CustomRequest } from '../interfaces/global.js';
import {
  exigirNumeroPropio,
  exigirUsuario,
  noSincronizadoPropio,
  numerosDelUsuario
} from '../lib/propiedad.js';

const router = Router();

// Tope por defecto del listado. Sin él, un GET sin `numberid` hacía un
// `select('*')` sobre la tabla ENTERA: teléfono, nombre y el texto del último
// WhatsApp de todos los números de todos los clientes, en una sola respuesta.
// El tope se conserva como red de seguridad, pero el problema de fondo ya no
// existe: la ruta va detrás de sesión (index.ts) y, desde esta entrega, cada
// operación comprueba además que el contacto cuelgue de un número del usuario.
const TOPE_POR_DEFECTO = Number(process.env.UNSYNCED_PAGE_SIZE || 500);
const TOPE_MAXIMO = 2000;

router.get('/', async (req: CustomRequest, res: Response) => {
  const { numberid, limit } = req.query;

  // Un GET sin `numberid` devolvía la tabla ENTERA: teléfono, nombre y el texto
  // del último WhatsApp de todos los números de todos los clientes. Ahora, sin
  // filtro explícito, se acota a los números del usuario; y con filtro, el
  // número tiene que ser suyo.
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;

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

  if (numberid) {
    if (!(await exigirNumeroPropio(req, res, { id: numberid as string }))) return;
    query = query.eq('numberid', numberid);
  } else {
    const mios = await numerosDelUsuario(usuario.id);
    if (mios.length === 0) {
      // Sin números no hay contactos que mostrar. Se responde la lista vacía y
      // no un `in` con array vacío, que en SQL no filtra nada.
      res.json([]);
      return;
    }
    query = query.in('numberid', mios);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Se responde el array pelado, como siempre: el front lo consume así.
  res.json(data);
});

router.patch('/:id', async (req: CustomRequest, res: Response) => {
  const { id } = req.params;
  const { agentehabilitado } = req.body;
  if (typeof agentehabilitado !== 'boolean') {
    res.status(400).json({ error: 'agentehabilitado debe ser boolean' });
    return;
  }

  // Este interruptor es el que apaga la IA para un contacto concreto. Con el id
  // de otro cliente, se le encendía o apagaba a él.
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const propio = await noSincronizadoPropio(usuario.id, id as string);
  if (!propio) {
    res.status(404).json({ error: 'Contacto no encontrado' });
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
  // EMITIR EVENTO SOCKET para refrescar lista en frontend.
  // El numberid ya lo trajo la comprobación de propiedad, así que se ahorra la
  // segunda consulta que había aquí para volver a leerlo.
  const io = req.app.get('io');
  if (io && typeof io.to === 'function') {
    io.to(propio.numberid.toString()).emit('unsynced-contacts-updated', { numberid: propio.numberid });
  }
  res.json({ success: true });
});

router.delete('/:id', async (req: CustomRequest, res: Response) => {
  const { id } = req.params;

  // La comprobación de propiedad hace de paso lo que hacía la lectura previa:
  // devuelve el numberid, que se necesita después para el evento de socket.
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const toDelete = await noSincronizadoPropio(usuario.id, id as string);
  if (!toDelete) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

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

router.delete('/by-number/:numberid', async (req: CustomRequest, res: Response) => {
  const { numberid } = req.params;

  // Borrado masivo: vacía la lista de no sincronizados de un número entero.
  if (!(await exigirNumeroPropio(req, res, { id: numberid as string }))) return;

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