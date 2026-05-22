const express = require('express');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/:agent', authRequired, async (req, res) => {
  const agent = req.params.agent;
  const uid = req.user.uid;

  const [{ data: rows }, { data: channels }] = await Promise.all([
    supabase.from('settings').select('key, value').eq('user_id', uid).eq('agent_slug', agent),
    supabase.from('whatsapp_channels').select('id, number, active, evolution_instance').eq('user_id', uid).eq('agent_slug', agent).order('id'),
  ]);

  const settings = {};
  for (const r of (rows || [])) settings[r.key] = r.value;

  res.json({
    settings,
    whatsapp_channels: (channels || []).map(c => ({ ...c, active: c.active ? 1 : 0, evolution_instance: c.evolution_instance || '' })),
  });
});

router.put('/:agent', authRequired, async (req, res) => {
  const agent = req.params.agent;
  const uid = req.user.uid;
  const { settings, whatsapp_channels } = req.body || {};

  const ops = [];

  if (settings && typeof settings === 'object') {
    const rows = Object.entries(settings).map(([k, v]) => ({
      user_id: uid,
      agent_slug: agent,
      key: k,
      value: v == null ? null : String(v),
    }));
    if (rows.length) {
      ops.push(
        supabase.from('settings').upsert(rows, { onConflict: 'user_id,agent_slug,key' })
      );
    }
  }

  if (Array.isArray(whatsapp_channels)) {
    ops.push(
      supabase.from('whatsapp_channels').delete().eq('user_id', uid).eq('agent_slug', agent)
    );
  }

  await Promise.all(ops);

  if (Array.isArray(whatsapp_channels) && whatsapp_channels.length) {
    const rows = whatsapp_channels
      .filter(c => c && c.number)
      .map(c => ({ user_id: uid, agent_slug: agent, number: c.number, active: c.active !== false, evolution_instance: c.evolution_instance || null }));
    if (rows.length) await supabase.from('whatsapp_channels').insert(rows);
  }

  res.json({ ok: true });
});

module.exports = router;
