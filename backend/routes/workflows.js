const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', req.user.uid)
    .order('id');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ workflows: (workflows || []).map(normalizeWorkflow) });
});

router.post('/', authRequired, async (req, res) => {
  const { name, description, enabled, steps } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const { data: workflow, error } = await supabase
    .from('workflows')
    .insert({
      user_id: req.user.uid,
      name,
      description: description || null,
      enabled: enabled !== false,
      steps: steps || [],
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ workflow: normalizeWorkflow(workflow) });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: existing } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!existing) return res.status(404).json({ error: 'Workflow não encontrado' });

  const allowed = ['name', 'description', 'enabled', 'steps'];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  if (!Object.keys(updates).length) return res.json({ workflow: normalizeWorkflow(existing) });

  const { data: workflow, error } = await supabase
    .from('workflows')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ workflow: normalizeWorkflow(workflow) });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase
    .from('workflows')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', req.user.uid);

  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Workflow não encontrado' });
  res.json({ ok: true });
});

router.post('/:id/run', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!workflow) return res.status(404).json({ error: 'Workflow não encontrado' });

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const ok = Math.random() > 0.2;
  const duration = 500 + Math.floor(Math.random() * 3000);
  const log = ok
    ? `Workflow "${workflow.name}" executado: ${steps.length} etapa(s) concluída(s) em ${duration}ms.`
    : `Falha na etapa "${(steps[1] || steps[0] || {}).name || 'desconhecida'}" após ${duration}ms.`;

  const { data: execution, error } = await supabase
    .from('executions')
    .insert({ workflow_id: id, status: ok ? 'success' : 'error', duration_ms: duration, log })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ execution });
});

router.get('/:id/executions', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const { data: wf } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', id)
    .eq('user_id', req.user.uid)
    .single();
  if (!wf) return res.status(404).json({ error: 'Workflow não encontrado' });

  const { data: executions, error } = await supabase
    .from('executions')
    .select('*')
    .eq('workflow_id', id)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ executions: executions || [] });
});

router.get('/all/executions', authRequired, async (req, res) => {
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, name')
    .eq('user_id', req.user.uid);

  const wfIds = (workflows || []).map(w => w.id);
  const wfNameMap = {};
  for (const w of (workflows || [])) wfNameMap[w.id] = w.name;

  if (!wfIds.length) return res.json({ executions: [] });

  const { data: executions, error } = await supabase
    .from('executions')
    .select('*')
    .in('workflow_id', wfIds)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    executions: (executions || []).map(e => ({ ...e, workflow_name: wfNameMap[e.workflow_id] || '' })),
  });
});

function normalizeWorkflow(w) {
  return { ...w, steps: Array.isArray(w.steps) ? w.steps : [], enabled: !!w.enabled };
}

module.exports = router;
