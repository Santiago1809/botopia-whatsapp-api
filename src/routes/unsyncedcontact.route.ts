import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../config/db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { numberid } = req.query;
  let query = supabase.from('Unsyncedcontact').select('*');
  if (numberid) query = query.eq('numberid', numberid);
  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
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
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('Unsyncedcontact')
    .delete()
    .eq('id', id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
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