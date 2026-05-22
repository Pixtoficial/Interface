const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const uid = req.user.uid;
  const isAdmin = req.user.role === 'admin';

  const { data: agents, error } = await supabase.from('agents').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });

  const { data: userAgents } = await supabase
    .from('user_agents')
    .select('agent_id, is_on')
    .eq('user_id', uid);

  const uaMap = {};
  for (const ua of (userAgents || [])) uaMap[ua.agent_id] = ua.is_on;

  let result;
  if (isAdmin) {
    result = agents.map(a => ({ ...a, is_on: uaMap[a.id] !== undefined ? (uaMap[a.id] ? 1 : 0) : 1 }));
  } else {
    result = agents
      .filter(a => uaMap[a.id] === true)
      .map(a => ({ ...a, is_on: 1 }));
  }

  res.json({ agents: result });
});

router.patch('/:slug/toggle', authRequired, async (req, res) => {
  const { slug } = req.params;
  const { is_on } = req.body || {};

  const { data: rows } = await supabase.from('agents').select('id').eq('slug', slug).limit(1);
  const agent = rows && rows[0];
  if (!agent) return res.status(404).json({ error: 'Agente não existe' });

  await supabase.from('user_agents').upsert(
    { user_id: req.user.uid, agent_id: agent.id, is_on: !!is_on },
    { onConflict: 'user_id,agent_id' }
  );

  res.json({ ok: true, slug, is_on: !!is_on });
});

module.exports = router;
