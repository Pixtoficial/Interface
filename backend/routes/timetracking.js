const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { contact_id, agent_slug } = req.query;
  let query = supabase.from('time_entries').select('*').eq('user_id', req.user.uid).order('started_at', { ascending: false });
  if (contact_id) query = query.eq('contact_id', parseInt(contact_id, 10));
  if (agent_slug) query = query.eq('agent_slug', agent_slug);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ entries: data || [] });
});

router.get('/summary', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('time_entries').select('duration_min, hourly_rate').eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  const totalMin = (data || []).reduce((s, e) => s + (Number(e.duration_min) || 0), 0);
  const totalRevenue = (data || []).reduce((s, e) => s + ((Number(e.duration_min) || 0) / 60) * (Number(e.hourly_rate) || 0), 0);
  res.json({ total_hours: (totalMin / 60).toFixed(1), total_revenue: Math.round(totalRevenue) });
});

router.post('/', authRequired, async (req, res) => {
  const { description, contact_id, agent_slug, duration_min, hourly_rate, started_at } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description é obrigatório' });
  const { data, error } = await supabase.from('time_entries').insert({
    user_id: req.user.uid, description,
    contact_id: contact_id || null, agent_slug: agent_slug || null,
    duration_min: duration_min || 0, hourly_rate: hourly_rate || 0,
    started_at: started_at || new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ entry: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('time_entries').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Entrada não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
