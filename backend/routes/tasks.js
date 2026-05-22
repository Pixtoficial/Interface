const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

const STAGES = ['briefing', 'redacao', 'design', 'revisao', 'aprovacao', 'concluido'];

router.get('/', authRequired, async (req, res) => {
  const { stage, squad_id, client_name, executor_name, priority } = req.query;
  let q = supabase.from('tasks').select('*').eq('user_id', req.user.uid).order('due_date', { nullsFirst: false }).order('id');
  if (stage)         q = q.eq('current_stage', stage);
  if (squad_id)      q = q.eq('squad_id', parseInt(squad_id));
  if (client_name)   q = q.ilike('client_name', `%${client_name}%`);
  if (executor_name) q = q.ilike('executor_name', `%${executor_name}%`);
  if (priority)      q = q.eq('priority', priority);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tasks: data || [] });
});

router.post('/', authRequired, async (req, res) => {
  const {
    title, description, client_name, squad_id, priority,
    current_stage, executor_name, participants, estimated_minutes,
    due_date, tag_ids, blocked_by, is_blocking,
    // legacy fields
    status, assignee, contact_id, agent_slug, subtasks,
  } = req.body || {};

  if (!title) return res.status(400).json({ error: 'title é obrigatório' });

  const stage = current_stage || 'briefing';
  const historyEntry = { stage, executor_name: executor_name || null, started_at: new Date().toISOString() };

  const { data, error } = await supabase.from('tasks').insert({
    user_id: req.user.uid, title,
    description: description || null,
    client_name: client_name || null,
    squad_id: squad_id || null,
    priority: priority || 'media',
    current_stage: stage,
    executor_name: executor_name || null,
    participants: participants || [],
    estimated_minutes: estimated_minutes || 60,
    due_date: due_date || null,
    tag_ids: tag_ids || [],
    blocked_by: blocked_by || [],
    is_blocking: is_blocking || [],
    stage_history: [historyEntry],
    status: status || 'todo',
    assignee: assignee || null,
    contact_id: contact_id || null,
    agent_slug: agent_slug || null,
    subtasks: subtasks || [],
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ task: data });
});

router.patch('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { data: existing } = await supabase.from('tasks').select('id').eq('id', id).eq('user_id', req.user.uid).single();
  if (!existing) return res.status(404).json({ error: 'Task não encontrada' });

  const allowed = [
    'title', 'description', 'client_name', 'squad_id', 'priority', 'current_stage',
    'executor_name', 'participants', 'estimated_minutes', 'due_date', 'tag_ids',
    'blocked_by', 'is_blocking', 'stage_history',
    'status', 'assignee', 'contact_id', 'agent_slug', 'subtasks',
  ];
  const updates = {};
  for (const k of allowed) if (req.body && k in req.body) updates[k] = req.body[k];
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).eq('user_id', req.user.uid).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ task: data });
});

// Avança a tarefa para a próxima etapa e registra histórico
router.post('/:id/advance', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { next_executor_name } = req.body || {};

  const { data: task, error: fetchErr } = await supabase.from('tasks').select('*').eq('id', id).eq('user_id', req.user.uid).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Task não encontrada' });

  const curIdx = STAGES.indexOf(task.current_stage);
  if (curIdx === -1 || curIdx >= STAGES.length - 1)
    return res.status(400).json({ error: 'Tarefa já está na etapa final' });

  const nextStage = STAGES[curIdx + 1];
  const now = new Date().toISOString();

  const history = Array.isArray(task.stage_history) ? [...task.stage_history] : [];
  if (history.length > 0) {
    const last = history[history.length - 1];
    if (!last.ended_at) {
      last.ended_at = now;
      last.duration_minutes = Math.round((new Date(now) - new Date(last.started_at)) / 60000);
    }
  }
  history.push({ stage: nextStage, executor_name: next_executor_name || null, started_at: now });

  const { data, error } = await supabase.from('tasks').update({
    current_stage: nextStage,
    executor_name: next_executor_name || null,
    stage_history: history,
    updated_at: now,
  }).eq('id', id).eq('user_id', req.user.uid).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ task: data });
});

router.delete('/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', id).eq('user_id', req.user.uid);
  if (error) return res.status(500).json({ error: error.message });
  if (count === 0) return res.status(404).json({ error: 'Task não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
