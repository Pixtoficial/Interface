const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('task_executors').select('*').eq('user_id', req.user.uid).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ executors: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { name, role, color_hex, photo_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const { data, error } = await supabase.from('task_executors').insert({
    user_id: req.user.uid, name,
    role: role || null,
    color_hex: color_hex || '#6366f1',
    photo_url: photo_url || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ executor: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updates = {};
  if ('name' in req.body) updates.name = req.body.name;
  if ('role' in req.body) updates.role = req.body.role;
  if ('color_hex' in req.body) updates.color_hex = req.body.color_hex;
  if ('photo_url' in req.body) updates.photo_url = req.body.photo_url;
  const { data, error } = await supabase.from('task_executors').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ executor: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error } = await supabase.from('task_executors').delete().eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
