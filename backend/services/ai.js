const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function chat({ system, messages, maxTokens = 1024 }) {
  const model = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const response = await client().messages.create({ model, max_tokens: maxTokens, system, messages });
  return response.content[0]?.text || '';
}

async function classifyStage({ messages, stages }) {
  const stageList = stages.map(s => `${s.slug}: ${s.name} — ${s.description}`).join('\n');
  const history = messages.slice(-8)
    .map(m => `${m.role === 'assistant' ? 'Assistente' : 'Lead'}: ${m.content}`)
    .join('\n');

  const response = await client().messages.create({
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    system: `Você é um classificador de estágio de funil de vendas.\nAnalise a conversa e responda APENAS com o slug do estágio atual do lead — sem mais nada.\n\nEstágios disponíveis:\n${stageList}`,
    messages: [{ role: 'user', content: `Conversa:\n${history}` }],
  });

  const slug = (response.content[0]?.text || '').trim().toLowerCase().split(/[\s\n]/)[0];
  return stages.find(s => s.slug === slug)?.slug || stages[0]?.slug || 'novo';
}

module.exports = { chat, classifyStage };
