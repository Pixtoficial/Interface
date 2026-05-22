const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('task_tags').select('*').eq('user_id', req.user.uid).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tags: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { name, color_hex, icon } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const { data, error } = await supabase.from('task_tags').insert({
    user_id: req.user.uid, name,
    color_hex: color_hex || '#6366f1',
    icon: icon || 'tag',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ tag: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error } = await supabase.from('task_tags').delete().eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
