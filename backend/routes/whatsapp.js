const express = require('express');
const supabase = require('../supabase');
const { chat, classifyStage } = require('../services/ai');
const { sendText, fetchInstances, createInstance, getQRCode, getConnectionState, deleteInstance, setWebhook } = require('../services/evolution');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_FUNNEL_STAGES = [
  { slug: 'novo',       name: 'Novo',                description: 'Primeiro contato, sem qualificação ainda' },
  { slug: 'qualificado',name: 'Qualificado',          description: 'Lead demonstrou interesse real e tem orçamento' },
  { slug: 'proposta',   name: 'Proposta',             description: 'Lead pediu proposta, cotação ou preço' },
  { slug: 'fechando',   name: 'Fechando',             description: 'Lead quer fechar ou está em negociação final' },
  { slug: 'humano',     name: 'Atendimento Humano',   description: 'Lead pediu para falar com uma pessoa, atendente ou humano real' },
  { slug: 'ganho',      name: 'Ganho',                description: 'Negócio fechado com sucesso' },
  { slug: 'perdido',    name: 'Perdido',              description: 'Lead desistiu ou não tem interesse' },
];

const TONE_MAP = {
  formal:  'Use linguagem formal e profissional.',
  casual:  'Use linguagem casual e amigável, como numa conversa.',
  tecnico: 'Use linguagem técnica e precisa, com termos da área.',
  vendas:  'Use linguagem persuasiva focada em conversão, crie urgência quando adequado.',
};

router.post('/webhook', async (req, res) => {
  try {
    const { event, instance, data } = req.body || {};
    if (event !== 'messages.upsert' || !data || data.key?.fromMe) {
      return res.json({ ok: true });
    }

    const text = (
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption || ''
    ).trim();
    if (!text) return;

    const jid = data.key?.remoteJid || '';
    if (jid.endsWith('@g.us')) return;
    const phone = jid.replace(/@.*/, '').replace(/\D/g, '');
    const contactName = data.pushName || phone;

    const { data: channel } = await supabase
      .from('whatsapp_channels')
      .select('user_id, agent_slug')
      .eq('evolution_instance', instance)
      .eq('active', true)
      .limit(1).single();

    if (!channel) {
      console.warn(`[WhatsApp] Instância "${instance}" não configurada.`);
      return;
    }

    const { user_id, agent_slug } = channel;

    // Verifica se agente está ligado
    const { data: agentRow } = await supabase.from('agents').select('id').eq('slug', agent_slug).single();
    if (agentRow) {
      const { data: ua } = await supabase.from('user_agents').select('is_on')
        .eq('user_id', user_id).eq('agent_id', agentRow.id).single();
      if (ua && !ua.is_on) return;
    }

    // Carrega configurações
    const { data: settingRows } = await supabase.from('settings').select('key, value')
      .eq('user_id', user_id).eq('agent_slug', agent_slug);

    const cfg = {};
    for (const r of (settingRows || [])) cfg[r.key] = r.value;

    const script       = cfg.script        || `Você é um assistente de IA do agente ${agent_slug}. Seja cordial e objetivo.`;
    const maxLines     = parseInt(cfg.max_lines     || '3', 10);
    const responseTime = parseInt(cfg.response_time || '0', 10);
    const languageType = cfg.language_type  || 'casual';

    // Estágios do funil configuráveis
    let funnelStages = DEFAULT_FUNNEL_STAGES;
    if (cfg.funnel_stages_config) {
      try { const parsed = JSON.parse(cfg.funnel_stages_config); if (Array.isArray(parsed) && parsed.length) funnelStages = parsed; } catch {}
    }

    // RAG
    const { data: docs } = await supabase.from('rag_documents').select('filename, content')
      .eq('user_id', user_id).eq('agent_slug', agent_slug).not('content', 'is', null);
    const ragContext = (docs || []).filter(d => d.content?.trim())
      .map(d => `### ${d.filename}\n${d.content.trim()}`).join('\n\n---\n\n');

    // Conversa
    let convId;
    const { data: existing } = await supabase.from('conversations').select('id, unread')
      .eq('user_id', user_id).eq('agent_slug', agent_slug).eq('contact_name', contactName).limit(1).single();

    if (existing) {
      convId = existing.id;
      await supabase.from('conversations').update({
        last_message: text, unread: (existing.unread || 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', convId);
    } else {
      const { data: newConv } = await supabase.from('conversations')
        .insert({ user_id, agent_slug, contact_name: contactName, contact_phone: phone, channel: 'whatsapp', last_message: text, unread: 1 })
        .select('id').single();
      convId = newConv?.id;
    }
    if (!convId) return;

    await supabase.from('messages').insert({ conversation_id: convId, role: 'user', body: text });

    const { data: history } = await supabase.from('messages').select('role, body')
      .eq('conversation_id', convId).order('id', { ascending: false }).limit(21);

    const turns = (history || []).reverse().slice(0, -1);
    const claudeMessages = [
      ...turns.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.body })),
      { role: 'user', content: text },
    ];

    let systemPrompt = script;
    if (ragContext) systemPrompt += `\n\n## Base de Conhecimento:\n${ragContext}`;
    systemPrompt += `\n\n${TONE_MAP[languageType] || TONE_MAP.casual}`;
    systemPrompt += `\n\nResponda de forma concisa, no máximo ${maxLines} linhas. Adapte o tom para WhatsApp.`;

    const reply = await chat({ system: systemPrompt, messages: claudeMessages });

    await supabase.from('messages').insert({ conversation_id: convId, role: 'ai', body: reply });
    await supabase.from('conversations').update({
      last_message: reply, unread: 0, updated_at: new Date().toISOString(),
    }).eq('id', convId);

    // Classificação automática de estágio do funil
    const allTurns = [
      ...claudeMessages,
      { role: 'assistant', content: reply },
    ];
    const newStage = await classifyStage({ messages: allTurns, stages: funnelStages });

    // Cria/atualiza lead com novo estágio
    const { data: lead } = await supabase.from('leads').select('id, stage')
      .eq('user_id', user_id).eq('agent_slug', agent_slug).eq('name', contactName).limit(1).single();

    if (lead) {
      if (lead.stage !== newStage) {
        await supabase.from('leads').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', lead.id);
      }
    } else {
      await supabase.from('leads').insert({
        user_id, agent_slug, name: contactName,
        stage: newStage, score: 0, amount: 0, color_type: 'default', position: 0,
      });
    }

    if (responseTime > 0) await new Promise(r => setTimeout(r, responseTime * 1000));
    await sendText(instance, phone, reply);
    console.log(`[WhatsApp] ${agent_slug} → ${contactName} [${newStage}]: enviado`);

  } catch (err) {
    console.error('[WhatsApp] Erro:', err.message);
  }
  res.json({ ok: true });
});

router.get('/instances', authRequired, async (req, res) => {
  try { res.json({ instances: await fetchInstances() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ----------------------------------------------------------
   Criar nova instância WhatsApp + configurar webhook
---------------------------------------------------------- */
router.post('/create-instance', authRequired, async (req, res) => {
  const { name, agent_slug } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name obrigatório' });

  try {
    const result = await createInstance(name);

    // Configura webhook para apontar para este backend
    const webhookUrl = `${process.env.APP_URL || 'http://localhost:3001'}/api/whatsapp/webhook`;
    try { await setWebhook(name, webhookUrl); } catch (we) {
      console.warn('[WhatsApp] Webhook set falhou (configurável depois):', we.message);
    }

    // Salva canal como pendente no Supabase
    await supabase.from('whatsapp_channels').upsert({
      user_id: req.user.uid,
      agent_slug: agent_slug || 'vendas',
      number: '',
      evolution_instance: name,
      active: false,
    }, { onConflict: 'user_id,agent_slug,evolution_instance' });

    // Retorna QR code se já disponível na resposta de criação
    const qr = result?.qrcode || null;
    res.json({ ok: true, instance: name, qr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------------------------------------------
   Buscar QR Code de uma instância (para atualização)
---------------------------------------------------------- */
router.get('/instance-qr/:name', authRequired, async (req, res) => {
  try {
    const data = await getQRCode(req.params.name);
    res.json({ qr: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------------------------------------------
   Status de conexão da instância
---------------------------------------------------------- */
router.get('/instance-status/:name', authRequired, async (req, res) => {
  try {
    const data = await getConnectionState(req.params.name);
    // Evolution API retorna { instance: { instanceName, state } } ou { state }
    const state = data?.instance?.state || data?.state || 'unknown';

    // Se conectou, ativa o canal no banco
    if (state === 'open') {
      await supabase.from('whatsapp_channels')
        .update({ active: true })
        .eq('user_id', req.user.uid)
        .eq('evolution_instance', req.params.name);
    }

    res.json({ state });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------------------------------------------
   Deletar instância
---------------------------------------------------------- */
router.delete('/instance/:name', authRequired, async (req, res) => {
  const { name } = req.params;
  try { await deleteInstance(name); } catch (e) {
    console.warn('[WhatsApp] deleteInstance Evolution:', e.message);
  }
  await supabase.from('whatsapp_channels').delete()
    .eq('user_id', req.user.uid).eq('evolution_instance', name);
  res.json({ ok: true });
});

/* ----------------------------------------------------------
   Reconfigurar webhook de todas as instâncias do usuário
   Útil após troca de domínio/APP_URL em produção
---------------------------------------------------------- */
router.post('/reconfigure-webhooks', authRequired, async (req, res) => {
  const webhookUrl = `${process.env.APP_URL || 'http://localhost:3001'}/api/whatsapp/webhook`;

  const { data: channels } = await supabase
    .from('whatsapp_channels')
    .select('evolution_instance')
    .eq('user_id', req.user.uid);

  const results = [];
  for (const ch of (channels || [])) {
    try {
      await setWebhook(ch.evolution_instance, webhookUrl);
      results.push({ instance: ch.evolution_instance, ok: true });
    } catch (e) {
      results.push({ instance: ch.evolution_instance, ok: false, error: e.message });
    }
  }

  res.json({ webhookUrl, results });
});

module.exports = router;
