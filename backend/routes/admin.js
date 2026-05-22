const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const { adminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(adminRequired);

router.get('/users', async (req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name, role, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const ids = (users || []).map(u => u.id);
  const { data: uaData } = ids.length
    ? await supabase.from('user_agents').select('user_id, agents(slug)').eq('is_on', true).in('user_id', ids)
    : { data: [] };

  const agentMap = {};
  for (const ua of (uaData || [])) {
    if (!agentMap[ua.user_id]) agentMap[ua.user_id] = [];
    if (ua.agents?.slug) agentMap[ua.user_id].push(ua.agents.slug);
  }

  res.json({
    users: (users || []).map(u => ({ ...u, agents: agentMap[u.id] || [] })),
  });
});

router.post('/users', async (req, res) => {
  const { email, password, name, role, agents } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha precisa de pelo menos 6 caracteres' });

  const { data: exists } = await supabase.from('users').select('id').eq('email', email).limit(1);
  if (exists && exists.length) return res.status(409).json({ error: 'E-mail já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'admin' ? 'admin' : 'client';

  const { data: created, error } = await supabase
    .from('users')
    .insert({ email, password_hash: hash, name: name || null, role: userRole })
    .select('id, email, name, role, is_active')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { data: allAgents } = await supabase.from('agents').select('id, slug');
  const toLink = Array.isArray(agents) && agents.length
    ? (allAgents || []).filter(a => agents.includes(a.slug))
    : (allAgents || []);

  if (toLink.length) {
    await supabase.from('user_agents').insert(
      toLink.map(a => ({ user_id: created.id, agent_id: a.id, is_on: true }))
    );
  }

  res.json({ user: created });
});

router.patch('/users/:id/toggle', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { data: rows } = await supabase.from('users').select('is_active').eq('id', id).limit(1);
  const u = rows && rows[0];
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

  const next = !u.is_active;
  await supabase.from('users').update({ is_active: next }).eq('id', id);
  res.json({ is_active: next });
});

router.put('/users/:id/agents', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { agents } = req.body || {};
  if (!Array.isArray(agents)) return res.status(400).json({ error: 'agents deve ser um array de slugs' });

  await supabase.from('user_agents').update({ is_on: false }).eq('user_id', id);

  if (agents.length) {
    const { data: agentRows } = await supabase.from('agents').select('id, slug').in('slug', agents);
    for (const a of (agentRows || [])) {
      await supabase.from('user_agents').upsert(
        { user_id: id, agent_id: a.id, is_on: true },
        { onConflict: 'user_id,agent_id' }
      );
    }
  }

  res.json({ ok: true });
});

router.patch('/users/:id/password', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Senha precisa de pelo menos 6 caracteres' });

  const hash = bcrypt.hashSync(password, 10);
  const { error } = await supabase.from('users').update({ password_hash: hash }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.uid) return res.status(400).json({ error: 'Não pode excluir a própria conta' });

  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get('/agents', async (req, res) => {
  const { data: agents, error } = await supabase.from('agents').select('id, slug, name, icon').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ agents: agents || [] });
});

/* ----------------------------------------------------------
   Configurações de agente por cliente (admin configura para cliente)
---------------------------------------------------------- */
router.get('/users/:userId/settings/:agent', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const agent = req.params.agent;

  const [{ data: rows }, { data: channels }] = await Promise.all([
    supabase.from('settings').select('key, value').eq('user_id', userId).eq('agent_slug', agent),
    supabase.from('whatsapp_channels').select('id, number, active, evolution_instance').eq('user_id', userId).eq('agent_slug', agent).order('id'),
  ]);

  const settings = {};
  for (const r of (rows || [])) settings[r.key] = r.value;

  res.json({
    settings,
    whatsapp_channels: (channels || []).map(c => ({ ...c, active: c.active ? 1 : 0, evolution_instance: c.evolution_instance || '' })),
  });
});

router.put('/users/:userId/settings/:agent', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const agent = req.params.agent;
  const { settings, whatsapp_channels } = req.body || {};

  const ops = [];

  if (settings && typeof settings === 'object') {
    const rows = Object.entries(settings).map(([k, v]) => ({
      user_id: userId, agent_slug: agent, key: k,
      value: v == null ? null : String(v),
    }));
    if (rows.length) ops.push(supabase.from('settings').upsert(rows, { onConflict: 'user_id,agent_slug,key' }));
  }

  if (Array.isArray(whatsapp_channels)) {
    ops.push(supabase.from('whatsapp_channels').delete().eq('user_id', userId).eq('agent_slug', agent));
  }

  await Promise.all(ops);

  if (Array.isArray(whatsapp_channels) && whatsapp_channels.length) {
    const rows = whatsapp_channels
      .filter(c => c && c.number)
      .map(c => ({ user_id: userId, agent_slug: agent, number: c.number, active: c.active !== false, evolution_instance: c.evolution_instance || null }));
    if (rows.length) await supabase.from('whatsapp_channels').insert(rows);
  }

  res.json({ ok: true });
});

/* ----------------------------------------------------------
   RAG por cliente (admin gerencia para cliente)
---------------------------------------------------------- */
router.get('/users/:userId/rag/:agent', async (req, res) => {
  const { data: docs, error } = await supabase
    .from('rag_documents').select('id, filename, size_kb, status, content, created_at')
    .eq('user_id', parseInt(req.params.userId, 10))
    .eq('agent_slug', req.params.agent)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ documents: docs || [] });
});

router.post('/users/:userId/rag/:agent', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { filename, content } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'filename obrigatório' });

  const { data: doc, error } = await supabase
    .from('rag_documents').insert({
      user_id: userId, agent_slug: req.params.agent, filename,
      size_kb: Math.ceil((content || '').length / 1024),
      status: content ? 'indexed' : 'sem_conteudo',
      content: content || null,
    }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ document: doc });
});

router.patch('/users/:userId/rag/:agent/:docId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const docId = parseInt(req.params.docId, 10);
  const { filename, content } = req.body || {};

  const updates = { status: content ? 'indexed' : 'sem_conteudo' };
  if (content !== undefined) updates.content = content;
  if (filename !== undefined) updates.filename = filename;

  const { data: doc, error } = await supabase
    .from('rag_documents').update(updates)
    .eq('id', docId).eq('user_id', userId).eq('agent_slug', req.params.agent)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ document: doc });
});

router.delete('/users/:userId/rag/:agent/:docId', async (req, res) => {
  const { error } = await supabase
    .from('rag_documents').delete()
    .eq('id', parseInt(req.params.docId, 10))
    .eq('user_id', parseInt(req.params.userId, 10))
    .eq('agent_slug', req.params.agent);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

/* ----------------------------------------------------------
   Métricas agregadas de toda a empresa
---------------------------------------------------------- */
router.get('/stats', async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: clientCount },
    { data: leads },
    { data: invoices },
    { count: convCount },
    { data: scRuns },
    { data: scLeads },
    { count: newClientsCount },
    { count: msgCount },
    { count: humanMsgCount },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'client').eq('is_active', true),
    supabase.from('leads').select('stage, amount, agent_slug, created_at'),
    supabase.from('invoices').select('amount, status, agent_slug, created_at'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase.from('scrapper_runs').select('id, status, results_count'),
    supabase.from('scrapper_leads').select('id, imported', { count: 'exact' }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'client').gte('created_at', monthStart),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'ai'),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'human'),
  ]);

  const allLeads = leads || [];
  const totalLeads = allLeads.length;
  const closedLeads = allLeads.filter(l => l.stage === 'closed' || l.stage === 'ganho');
  const lostLeads   = allLeads.filter(l => l.stage === 'perdido' || l.stage === 'lost');
  const activeLeads = allLeads.filter(l => !['closed','ganho','perdido','lost'].includes(l.stage));
  const newLeadsThisMonth = allLeads.filter(l => l.created_at >= monthStart).length;

  const convRate = totalLeads ? ((closedLeads.length / totalLeads) * 100).toFixed(1) : '0.0';
  const lossRate = totalLeads ? ((lostLeads.length  / totalLeads) * 100).toFixed(1) : '0.0';
  const closedRevenue  = closedLeads.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const pipelineValue  = activeLeads.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const avgTicket      = closedLeads.length ? (closedRevenue / closedLeads.length) : 0;

  const leadsPerAgent = {};
  const leadsPerStage = {};
  for (const l of allLeads) {
    leadsPerAgent[l.agent_slug] = (leadsPerAgent[l.agent_slug] || 0) + 1;
    leadsPerStage[l.stage] = (leadsPerStage[l.stage] || 0) + 1;
  }

  const allInvoices = invoices || [];
  const pendingInvoices = allInvoices.filter(i => i.status === 'Pendente');
  const pendingValue    = pendingInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const paidValue       = allInvoices.filter(i => i.status === 'Pago').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalInvoiced   = allInvoices.filter(i => i.status !== 'Cancelada').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const invoicesThisMonth = allInvoices.filter(i => i.created_at >= monthStart).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const invoicesLastMonth = allInvoices.filter(i => i.created_at >= lastMonthStart && i.created_at < monthStart).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const scLeadsAll = scLeads || [];
  const scImported = scLeadsAll.filter(l => l.imported).length;

  res.json({
    // Clientes
    clients: clientCount || 0,
    newClientsThisMonth: newClientsCount || 0,
    // Leads
    totalLeads,
    newLeadsThisMonth,
    closedLeads: closedLeads.length,
    lostLeads: lostLeads.length,
    activeLeads: activeLeads.length,
    convRate: convRate + '%',
    lossRate: lossRate + '%',
    pipelineValue,
    avgTicket,
    leadsPerAgent,
    leadsPerStage,
    // Financeiro
    closedRevenue,
    paidValue,
    pendingInvoices: pendingInvoices.length,
    pendingValue,
    totalInvoiced,
    invoicesThisMonth,
    invoicesLastMonth,
    // Operações
    conversations: convCount || 0,
    aiMessages: msgCount || 0,
    humanInterventions: humanMsgCount || 0,
    // PIXT BDR
    scrapper: {
      runs: scRuns?.length || 0,
      totalLeads: (scRuns || []).reduce((s, r) => s + (r.results_count || 0), 0),
      imported: scImported,
    },
  });
});

/* ----------------------------------------------------------
   Todos os leads para CRM admin (filtrado por agente)
---------------------------------------------------------- */
router.get('/all-leads', async (req, res) => {
  const { agent } = req.query;
  let query = supabase
    .from('leads')
    .select('id, name, company, stage, score, amount, tag, agent_slug, created_at, user_id')
    .order('stage').order('position').order('id')
    .limit(500);
  if (agent) query = query.eq('agent_slug', agent);
  const { data: leads, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // enrich with user email
  const userIds = [...new Set((leads || []).map(l => l.user_id))];
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, name, email').in('id', userIds)
    : { data: [] };
  const userMap = {};
  for (const u of (users || [])) userMap[u.id] = u;

  res.json({ leads: (leads || []).map(l => ({ ...l, client: userMap[l.user_id] || null })) });
});

/* ----------------------------------------------------------
   Métricas de tráfego e mídias sociais (manual)
---------------------------------------------------------- */
router.get('/traffic-metrics', async (req, res) => {
  const uid = req.user.uid;
  const { data: rows } = await supabase.from('settings').select('key, value').eq('user_id', uid).eq('agent_slug', '_admin_traffic');
  const metrics = {};
  for (const r of (rows || [])) metrics[r.key] = r.value;
  res.json({ metrics });
});

router.put('/traffic-metrics', async (req, res) => {
  const uid = req.user.uid;
  const { metrics } = req.body || {};
  if (!metrics || typeof metrics !== 'object') return res.status(400).json({ error: 'metrics obrigatório' });
  const rows = Object.entries(metrics).map(([k, v]) => ({
    user_id: uid, agent_slug: '_admin_traffic', key: k, value: v != null ? String(v) : null,
  }));
  if (rows.length) await supabase.from('settings').upsert(rows, { onConflict: 'user_id,agent_slug,key' });
  res.json({ ok: true });
});

module.exports = router;
