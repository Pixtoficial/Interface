const express = require('express');
const supabase = require('../supabase');
const { sendText } = require('../services/evolution');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const agent = req.query.agent;
  if (!agent) return res.status(400).json({ error: 'agent é obrigatório' });

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ conversations: conversations || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { agent_slug, contact_name, channel, intent, last_message } = req.body || {};
  if (!agent_slug || !contact_name) return res.status(400).json({ error: 'agent_slug e contact_name são obrigatórios' });

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      user_id: req.user.uid,
      agent_slug,
      contact_name,
      channel: channel || 'whatsapp',
      intent: intent || null,
      last_message: last_message || null,
      unread: 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ conversation });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ ok: true });
});

router.get('/:id/messages', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('id');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ messages: messages || [] });
});

router.post('/:id/messages', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role, body } = req.body || {};
  if (!body || !['user', 'ai', 'human'].includes(role)) return res.status(400).json({ error: 'role e body são obrigatórios' });

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ conversation_id: id, role, body })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase
    .from('conversations')
    .update({ last_message: body, updated_at: new Date().toISOString() })
    .eq('id', id);

  res.status(201).json({ message });
});

/* Envia mensagem humana e entrega no WhatsApp do lead */
router.post('/:id/send', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'body é obrigatório' });

  const { data: conv } = await supabase.from('conversations').select('*')
    .eq('id', id).eq('user_id', req.user.uid).single();
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const { data: message, error } = await supabase.from('messages')
    .insert({ conversation_id: id, role: 'human', body: body.trim() })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('conversations')
    .update({ last_message: body.trim(), updated_at: new Date().toISOString() }).eq('id', id);

  let sent_to_whatsapp = false;
  if (conv.contact_phone) {
    try {
      const { data: ch } = await supabase.from('whatsapp_channels').select('evolution_instance')
        .eq('user_id', req.user.uid).eq('agent_slug', conv.agent_slug).eq('active', true).limit(1).single();
      if (ch?.evolution_instance) {
        await sendText(ch.evolution_instance, conv.contact_phone, body.trim());
        sent_to_whatsapp = true;
      }
    } catch (e) {
      console.warn('[Inbox] Falha ao enviar WhatsApp:', e.message);
    }
  }

  res.status(201).json({ message, sent_to_whatsapp });
});

module.exports = router;
