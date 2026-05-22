const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const agent = req.query.agent || 'booker';

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent)
    .order('day')
    .order('time');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: events || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { agent_slug, title, day, time, source } = req.body || {};
  if (!title || !day) return res.status(400).json({ error: 'title e day são obrigatórios' });

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: req.user.uid,
      agent_slug: agent_slug || 'booker',
      title,
      day,
      time: time || null,
      source: source || 'human',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ event });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('calendar_events')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
