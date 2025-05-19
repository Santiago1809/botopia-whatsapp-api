import { handleIncomingMessage } from '../controllers/whatsapp/messages.controller';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

client.on('message', async (msg) => {
  const chat = await msg.getChat();
  await handleIncomingMessage(msg, chat, numberId, io);
});

export async function syncContactsToDB(req: Request, res: Response) {
  const { numberId, contacts, groups, clearAll } = req.body
  if (!numberId) {
    res.status(400).json({ message: 'Missing numberId' })
    return
  }

  if (clearAll) {
    await supabase.from('SyncedContactOrGroup').delete().eq('numberId', numberId)
  }

  const toInsert = [
    ...(contacts || []).map((c: Contact) => ({
      numberId: Number(numberId),
      type: 'contact',
      wa_id: c.id?._serialized || c.id,
      name: c.name,
      agenteHabilitado: true
    })),
    ...(groups || []).map((g: Group) => ({
      numberId: Number(numberId),
      type: 'group',
      wa_id: g.id,
      name: g.name,
      agenteHabilitado: true
    }))
  ]

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('SyncedContactOrGroup')
      .insert(toInsert)
    if (error) {
      console.error('SUPABASE INSERT ERROR:', error)
      res
        .status(500)
        .json({ message: 'Error insertando en la base de datos', error })
      return
    }
  }

  res.status(200).json({ message: 'Sincronización guardada en base de datos' })
  return
} 