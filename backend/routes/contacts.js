const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { q, tag, stage } = req.query;
  let query = supabase.from('contacts').select('*').eq('user_id', req.user.uid).order('name');
  if (q) query = query.ilike('name', `%${q}%`);
  if (stage) query = query.eq('stage', stage);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contacts: data || [] });
});

router.get('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [{ data: contact }, { data: interactions }] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', id).eq('user_id', req.user.uid).single(),
    supabase.from('contact_interactions').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
  res.json({ contact, interactions: interactions || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { name, email, phone, company, position, stage, tags, notes, health_score } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const { data, error } = await supabase.from('contacts').insert({
    user_id: req.user.uid, name, email: email || null, phone: phone || null,
    company: company || null, position: position || null, stage: stage || 'lead',
    tags: tags || [], notes: notes || null, health_score: health_score || 0,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ contact: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { data: existing } = await supabase.from('contacts').select('id').eq('id', id).eq('user_id', req.user.uid).single();
  if (!existing) return res.status(404).json({ error: 'Contato não encontrado' });
  const allowed = ['name', 'email', 'phone', 'company', 'position', 'stage', 'tags', 'notes', 'health_score', 'nps', 'ltv', 'contract_start', 'contract_end'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contact: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('contacts').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Contato não encontrado' });
  res.json({ ok: true });
});

router.post('/:id/interactions', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { type, description } = req.body || {};
  if (!type || !description) return res.status(400).json({ error: 'type e description são obrigatórios' });
  const { data: contact } = await supabase.from('contacts').select('id').eq('id', id).eq('user_id', req.user.uid).single();
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
  const { data, error } = await supabase.from('contact_interactions').insert({ contact_id: id, user_id: req.user.uid, type, description }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ interaction: data });
});

module.exports = router;
