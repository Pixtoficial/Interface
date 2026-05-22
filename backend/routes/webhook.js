const express = require('express');
const supabase = require('../supabase');

const router = express.Router();

const STAGES = ['new', 'in_progress', 'no_response', 'human', 'closed'];

function validateSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Webhook secret inválido' });
  }
  next();
}

// POST /api/webhook/message
// Chamado pelo n8n para espelhar mensagens na plataforma
// Body: { user_id, agent_slug, contact_name, contact_phone?, channel?, role, message, intent?, stage? }
router.post('/message', validateSecret, async (req, res) => {
  const { user_id, agent_slug, contact_name, contact_phone, channel, role, message, intent, stage } = req.body || {};

  if (!user_id || !agent_slug || !contact_name || !message || !role) {
    return res.status(400).json({ error: 'user_id, agent_slug, contact_name, message e role são obrigatórios' });
  }
  if (!['user', 'ai', 'human'].includes(role)) {
    return res.status(400).json({ error: 'role deve ser: user, ai ou human' });
  }

  // Verificar se o usuário existe
  const { data: userRow } = await supabase.from('users').select('id').eq('id', user_id).single();
  if (!userRow) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Buscar conversa existente pelo contato + agente + usuário
  const query = supabase
    .from('conversations')
    .select('id, unread')
    .eq('user_id', user_id)
    .eq('agent_slug', agent_slug)
    .eq('contact_name', contact_name)
    .limit(1);

  const { data: existing } = await query;
  let conv_id;

  if (existing && existing.length > 0) {
    conv_id = existing[0].id;
    const unread = role === 'user' ? (existing[0].unread || 0) + 1 : 0;
    await supabase.from('conversations').update({
      last_message: message,
      unread,
      ...(intent ? { intent } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', conv_id);
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        user_id,
        agent_slug,
        contact_name,
        channel: channel || 'whatsapp',
        intent: intent || null,
        last_message: message,
        unread: role === 'user' ? 1 : 0,
      })
      .select('id')
      .single();

    if (convErr) return res.status(500).json({ error: convErr.message });
    conv_id = newConv.id;
  }

  // Inserir mensagem
  const { error: msgErr } = await supabase
    .from('messages')
    .insert({ conversation_id: conv_id, role, body: message });

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  // Criar lead automaticamente se ainda não existir
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', user_id)
    .eq('agent_slug', agent_slug)
    .eq('name', contact_name)
    .limit(1);

  if (!existingLead || existingLead.length === 0) {
    const validStage = STAGES.includes(stage) ? stage : 'new';
    await supabase.from('leads').insert({
      user_id,
      agent_slug,
      name: contact_name,
      company: null,
      score: 0,
      amount: 0,
      tag: null,
      color_type: 'default',
      stage: validStage,
      position: 0,
    });
  }

  res.json({ ok: true, conversation_id: conv_id });
});

// POST /api/webhook/lead
// Atualizar ou criar lead (mover de estágio, atualizar score, etc.)
router.post('/lead', validateSecret, async (req, res) => {
  const { user_id, agent_slug, contact_name, stage, score, amount, tag, company } = req.body || {};

  if (!user_id || !agent_slug || !contact_name) {
    return res.status(400).json({ error: 'user_id, agent_slug e contact_name são obrigatórios' });
  }

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', user_id)
    .eq('agent_slug', agent_slug)
    .eq('name', contact_name)
    .limit(1);

  const updates = { updated_at: new Date().toISOString() };
  if (stage && STAGES.includes(stage)) updates.stage = stage;
  if (score !== undefined) updates.score = score;
  if (amount !== undefined) updates.amount = amount;
  if (tag !== undefined) updates.tag = tag;
  if (company !== undefined) updates.company = company;

  if (existing && existing.length > 0) {
    await supabase.from('leads').update(updates).eq('id', existing[0].id);
    res.json({ ok: true, lead_id: existing[0].id, action: 'updated' });
  } else {
    const { data: newLead, error } = await supabase.from('leads').insert({
      user_id, agent_slug, name: contact_name,
      stage: (stage && STAGES.includes(stage)) ? stage : 'new',
      score: score || 0,
      amount: amount || 0,
      tag: tag || null,
      company: company || null,
      color_type: 'default',
      position: 0,
    }).select('id').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, lead_id: newLead.id, action: 'created' });
  }
});

// GET /api/webhook/status?user_id=1&agent_slug=vendas
// n8n chama ANTES de responder para saber se a automação está ativa
router.get('/status', validateSecret, async (req, res) => {
  const { user_id, agent_slug } = req.query;
  if (!user_id || !agent_slug) {
    return res.status(400).json({ error: 'user_id e agent_slug são obrigatórios' });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('slug', agent_slug)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

  const { data: ua } = await supabase
    .from('user_agents')
    .select('is_on')
    .eq('user_id', user_id)
    .eq('agent_id', agent.id)
    .single();

  const is_on = ua ? ua.is_on : false;
  res.json({ is_on, user_id: parseInt(user_id), agent_slug });
});

module.exports = router;
