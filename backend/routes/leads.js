const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const STAGES = ['new', 'in_progress', 'no_response', 'human', 'closed']; // kept for webhook.js compatibility

router.get('/', authRequired, async (req, res) => {
  const agent = req.query.agent;
  if (!agent) return res.status(400).json({ error: 'agent é obrigatório' });

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent)
    .order('stage')
    .order('position')
    .order('id');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ leads: leads || [] });
});

router.post('/', authRequired, async (req, res) => {
  const { agent_slug, name, company, score, amount, tag, color_type, stage, phone, email, notes } = req.body || {};
  if (!agent_slug || !name) return res.status(400).json({ error: 'agent_slug e name são obrigatórios' });

  const st = (stage && typeof stage === 'string') ? stage : 'new';

  const { data: maxRow } = await supabase
    .from('leads')
    .select('position')
    .eq('user_id', req.user.uid)
    .eq('agent_slug', agent_slug)
    .eq('stage', st)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = maxRow ? maxRow.position + 1 : 0;

  const basePayload = {
    user_id: req.user.uid,
    agent_slug,
    name,
    company: company || null,
    score: score || 0,
    amount: amount || 0,
    tag: tag || null,
    color_type: color_type || 'default',
    stage: st,
    position,
  };

  // Tenta inserir com as colunas extras (phone / email / notes)
  // Se o Supabase reclamar que a coluna não existe (migration pendente),
  // cai no fallback com apenas os campos base.
  let { data: lead, error } = await supabase
    .from('leads')
    .insert({ ...basePayload, phone: phone || null, email: email || null, notes: notes || null })
    .select()
    .single();

  if (error && error.message && error.message.includes('coluna')) {
    // Migration ainda não foi rodada — salva sem os campos extras
    ({ data: lead, error } = await supabase
      .from('leads')
      .insert(basePayload)
      .select()
      .single());
  }

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ lead });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!existing) return res.status(404).json({ error: 'Lead não encontrado' });

  const allowed = ['name', 'company', 'score', 'amount', 'tag', 'color_type', 'stage', 'position', 'phone', 'email', 'notes', 'conversation_summary'];
  const updates = {};
  for (const k of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
      updates[k] = req.body[k];
    }
  }
  if (!Object.keys(updates).length) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single();
    return res.json({ lead });
  }

  updates.updated_at = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ lead });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('leads')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json({ ok: true });
});

router.get('/stats/:agent', authRequired, async (req, res) => {
  const agent = req.params.agent;
  const uid = req.user.uid;

  const { data: leads } = await supabase
    .from('leads')
    .select('stage, amount')
    .eq('user_id', uid)
    .eq('agent_slug', agent);

  const totalsMap = {};
  let closedCount = 0;
  let closedTotal = 0;
  for (const l of (leads || [])) {
    totalsMap[l.stage] = (totalsMap[l.stage] || 0) + 1;
    if (l.stage === 'closed') { closedCount++; closedTotal += Number(l.amount) || 0; }
  }

  const totals = Object.entries(totalsMap).map(([stage, count]) => ({ stage, count }));
  res.json({ totals, closed_amount: closedTotal });
});

module.exports = router;
