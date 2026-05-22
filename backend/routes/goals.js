const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('goals').select('*').eq('user_id', req.user.uid).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ goals: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { title, target, current, unit, category, deadline, assignee } = req.body || {};
  if (!title || target == null) return res.status(400).json({ error: 'title e target são obrigatórios' });
  const { data, error } = await supabase.from('goals').insert({
    user_id: req.user.uid, title, target, current: current || 0,
    unit: unit || '%', category: category || 'Vendas',
    deadline: deadline || null, assignee: assignee || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ goal: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed = ['title', 'target', 'current', 'unit', 'category', 'deadline', 'assignee'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  const { data, error } = await supabase.from('goals').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ goal: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('goals').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Meta não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
