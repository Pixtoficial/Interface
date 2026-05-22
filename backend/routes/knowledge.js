const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { q, category } = req.query;
  let query = supabase.from('knowledge_articles').select('*').eq('user_id', req.user.uid).order('created_at', { ascending: false });
  if (q) query = query.ilike('title', `%${q}%`);
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ articles: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { title, content, category, tags } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title e content são obrigatórios' });
  const { data, error } = await supabase.from('knowledge_articles').insert({
    user_id: req.user.uid, title, content, category: category || 'Geral', tags: tags || [],
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ article: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { data: existing } = await supabase.from('knowledge_articles').select('id').eq('id', id).eq('user_id', req.user.uid).single();
  if (!existing) return res.status(404).json({ error: 'Artigo não encontrado' });
  const allowed = ['title', 'content', 'category', 'tags'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('knowledge_articles').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ article: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('knowledge_articles').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Artigo não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
