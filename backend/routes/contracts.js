const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('contracts').select('*').eq('user_id', req.user.uid).order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contracts: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { contact_name, title, monthly_value, status, start_date, end_date, notes } = req.body || {};
  if (!contact_name || !title) return res.status(400).json({ error: 'contact_name e title são obrigatórios' });
  const { data, error } = await supabase.from('contracts').insert({
    user_id: req.user.uid, contact_name, title,
    monthly_value: monthly_value || 0, status: status || 'draft',
    start_date: start_date || null, end_date: end_date || null, notes: notes || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ contract: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { data: existing } = await supabase.from('contracts').select('id').eq('id', id).eq('user_id', req.user.uid).single();
  if (!existing) return res.status(404).json({ error: 'Contrato não encontrado' });
  const allowed = ['contact_name', 'title', 'monthly_value', 'status', 'start_date', 'end_date', 'notes', 'signed_at'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('contracts').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contract: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('contracts').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
