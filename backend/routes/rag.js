const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const agent = req.query.agent || 'expertai';
  const { data: documents, error } = await supabase
    .from('rag_documents')
    .select('*')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ documents: documents || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { agent_slug, filename, size_kb, content } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'filename é obrigatório' });

  const { data: document, error } = await supabase
    .from('rag_documents')
    .insert({
      user_id: req.user.uid,
      agent_slug: agent_slug || 'expertai',
      filename,
      size_kb: size_kb || 0,
      status: content ? 'indexed' : 'sem_conteudo',
      content: content || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ document });
});

// Atualiza conteúdo de um documento
router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { content, filename } = req.body || {};

  const { data: existing } = await supabase
    .from('rag_documents').select('id')
    .eq('id', id).eq('user_id', req.user.uid).single();
  if (!existing) return res.status(404).json({ error: 'Documento não encontrado' });

  const updates = { status: content ? 'indexed' : 'sem_conteudo' };
  if (content !== undefined) updates.content = content;
  if (filename !== undefined) updates.filename = filename;

  const { data: document, error } = await supabase
    .from('rag_documents').update(updates)
    .eq('id', id).eq('user_id', req.user.uid)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ document });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('rag_documents').delete({ count: 'exact' })
    .eq('id', id).eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Documento não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
