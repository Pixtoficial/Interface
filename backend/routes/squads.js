const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('squads').select('*').eq('user_id', req.user.uid).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ squads: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { name, leader_name, color_hex } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const { data, error } = await supabase.from('squads').insert({
    user_id: req.user.uid, name,
    leader_name: leader_name || null,
    color_hex: color_hex || '#6366f1',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ squad: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updates = {};
  if ('name' in req.body) updates.name = req.body.name;
  if ('leader_name' in req.body) updates.leader_name = req.body.leader_name;
  if ('color_hex' in req.body) updates.color_hex = req.body.color_hex;
  const { data, error } = await supabase.from('squads').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ squad: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error } = await supabase.from('squads').delete().eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
