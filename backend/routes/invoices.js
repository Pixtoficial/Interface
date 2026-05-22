const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const agent = req.query.agent;
  if (!agent) return res.status(400).json({ error: 'agent é obrigatório' });

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ invoices: invoices || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { agent_slug, lead_name, amount, gateway, status, due_date } = req.body || {};
  if (!agent_slug || !lead_name || amount == null) return res.status(400).json({ error: 'agent_slug, lead_name, amount obrigatórios' });

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      user_id: req.user.uid,
      agent_slug,
      lead_name,
      amount,
      gateway: gateway || null,
      status: status || 'Pendente',
      due_date: due_date || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ invoice });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!existing) return res.status(404).json({ error: 'Fatura não encontrada' });

  const allowed = ['lead_name', 'amount', 'gateway', 'status', 'due_date'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  if (!Object.keys(updates).length) {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single();
    return res.json({ invoice: inv });
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ invoice });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('invoices')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Fatura não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
