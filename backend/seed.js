// Popula o banco com dados iniciais (agentes + usuário admin + dados de exemplo)
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const reset = process.argv.includes('--reset');
if (reset) {
  const dbFile = path.join(__dirname, 'data', 'pixt.db');
  ['', '-wal', '-shm'].forEach(suffix => {
    const f = dbFile + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  console.log('[seed] Banco resetado.');
}

const db = require('./db');

const AGENTS = [
  { slug: 'vendas', name: 'Vendas+', role: 'Agente Vendedor IA', description: 'Automação do atendimento até a conversão final.', price: 'R$1.500,00 / mês', icon: 'DollarSign' },
  { slug: 'leadflow', name: 'Lead Flow', role: 'Triagem e CRM', description: 'Qualificação técnica de leads, gestão de CRM e follow-up ativo.', price: 'R$2.000,00 / mês', icon: 'Users' },
  { slug: 'booker', name: 'Booker', role: 'Gestão de Agenda', description: 'Consulta disponibilidade em tempo real e marca reuniões.', price: 'R$1.500,00 / mês', icon: 'Calendar' },
  { slug: 'expertai', name: 'ExpertAI', role: 'Suporte Técnico', description: 'Reduz 90% dos chamados com documentação RAG.', price: 'R$2.000,00 / mês', icon: 'Bot' },
  { slug: 'custom', name: 'Automações Custom', role: 'Core da PIXT', description: 'Desenvolvimento de arquiteturas de IA do zero para desafios complexos.', price: 'Sob Consulta', icon: 'Cpu' },
];

const insertAgent = db.prepare('INSERT OR IGNORE INTO agents (slug,name,role,description,price,icon) VALUES (?,?,?,?,?,?)');
AGENTS.forEach(a => insertAgent.run(a.slug, a.name, a.role, a.description, a.price, a.icon));

// Usuário admin padrão
const adminEmail = 'admin@pixt.ia';
const adminPass = '12345678';
const exists = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
let userId;
if (!exists) {
  const hash = bcrypt.hashSync(adminPass, 10);
  const r = db.prepare("INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)").run(adminEmail, hash, 'Admin Pixt', 'admin');
  userId = r.lastInsertRowid;
  console.log(`[seed] Usuário criado: ${adminEmail} / ${adminPass}`);
} else {
  userId = exists.id;
  // Garantir que o admin tem role=admin
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
  console.log(`[seed] Usuário ${adminEmail} já existe (id=${userId})`);
}

// Vincular usuário a todos os agentes
const linkAgent = db.prepare('INSERT OR IGNORE INTO user_agents (user_id, agent_id, is_on) SELECT ?, id, 1 FROM agents');
linkAgent.run(userId);

// Limpar dados de exemplo deste usuário antes de inserir novamente
db.prepare('DELETE FROM leads WHERE user_id=?').run(userId);
db.prepare('DELETE FROM conversations WHERE user_id=?').run(userId);
db.prepare('DELETE FROM invoices WHERE user_id=?').run(userId);
db.prepare('DELETE FROM calendar_events WHERE user_id=?').run(userId);
db.prepare('DELETE FROM rag_documents WHERE user_id=?').run(userId);
db.prepare('DELETE FROM workflows WHERE user_id=?').run(userId);
db.prepare('DELETE FROM whatsapp_channels WHERE user_id=?').run(userId);

// LEADS de exemplo (Vendas+)
const sampleLeads = [
  { agent: 'vendas', name: 'Carlos Mendes', company: 'TechCorp', score: 45, amount: 0, tag: 'Aguardando', color: 'default', stage: 'new' },
  { agent: 'vendas', name: 'Ana Souza', company: 'StartupX', score: 51, amount: 0, tag: 'Aguardando', color: 'default', stage: 'new' },
  { agent: 'vendas', name: 'Mariana Costa', company: 'InovaSys', score: 82, amount: 0, tag: 'Interesse', color: 'blue', stage: 'in_progress' },
  { agent: 'vendas', name: 'Camila Rocha', company: 'Consultoria', score: 20, amount: 0, tag: 'Frio', color: 'default', stage: 'no_response' },
  { agent: 'vendas', name: 'João Pedro', company: 'Log S/A', score: 95, amount: 0, tag: 'Ajuda', color: 'yellow', stage: 'human' },
  { agent: 'vendas', name: 'Grupo XYZ', company: 'Holding', score: 100, amount: 12000, tag: 'Pago', color: 'green', stage: 'closed' },
];
// Mesmos leads também para LeadFlow (CRM)
const crmLeads = sampleLeads.map(l => ({ ...l, agent: 'leadflow' }));

const insertLead = db.prepare(`
  INSERT INTO leads (user_id, agent_slug, name, company, score, amount, tag, color_type, stage, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
[...sampleLeads, ...crmLeads].forEach((l, i) => {
  insertLead.run(userId, l.agent, l.name, l.company, l.score, l.amount, l.tag, l.color, l.stage, i);
});

// CONVERSAS
const insertConv = db.prepare(`
  INSERT INTO conversations (user_id, agent_slug, contact_name, channel, intent, last_message, unread)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertMsg = db.prepare(`INSERT INTO messages (conversation_id, role, body) VALUES (?, ?, ?)`);

const seedConvs = [
  { agent: 'vendas', contact: 'Marcelo Tech', intent: 'compra', last: 'Manda o link pra pagar!', unread: 1, msgs: [
    ['user', 'Olá! Tenho interesse em saber como a IA pode ajudar minha empresa.'],
    ['ai', 'Olá! No seu caso, o agente Vendas+ consegue automatizar todo o seu fluxo operacional. Quer que eu apresente os planos?'],
    ['user', 'Gostei bastante. Manda o link para eu fechar agora!'],
  ]},
  { agent: 'vendas', contact: 'Juliana Freitas', intent: 'objecao', last: 'Achei meio caro...', unread: 0, msgs: [
    ['user', 'Achei meio caro o plano…'],
    ['ai', 'Entendo! Posso te mostrar o ROI médio dos clientes nesse plano para avaliar?'],
  ]},
  { agent: 'vendas', contact: 'Clínica Vida', intent: 'interesse', last: 'Como funciona o sistema?', unread: 0, msgs: [
    ['user', 'Como funciona o sistema?'],
    ['ai', 'Funcionamos com integrações nativas, IA conversacional e dashboard. Quer um overview?'],
  ]},
  { agent: 'leadflow', contact: 'Roberto Lima', intent: 'interesse', last: 'Quero entender o CRM', unread: 1, msgs: [
    ['user', 'Quero entender melhor como funciona o CRM de vocês.'],
    ['ai', 'Posso te mostrar uma demonstração rápida agora?'],
  ]},
  { agent: 'booker', contact: 'Patricia Alves', intent: 'compra', last: 'Pode marcar terça às 10h', unread: 0, msgs: [
    ['user', 'Quero marcar uma reunião.'],
    ['ai', 'Tenho disponibilidade na terça às 10h ou quinta às 15h. Qual prefere?'],
    ['user', 'Pode marcar terça às 10h'],
  ]},
];
seedConvs.forEach(c => {
  const r = insertConv.run(userId, c.agent, c.contact, 'whatsapp', c.intent, c.last, c.unread);
  c.msgs.forEach(([role, body]) => insertMsg.run(r.lastInsertRowid, role, body));
});

// FATURAS
const insertInv = db.prepare(`INSERT INTO invoices (user_id, agent_slug, lead_name, amount, gateway, status, due_date) VALUES (?,?,?,?,?,?,?)`);
[
  ['vendas', 'Marcelo Tech', 1500, 'Asaas', 'Pendente', '2026-05-10'],
  ['vendas', 'Grupo XYZ', 12000, 'Stripe', 'Pago', '2026-05-06'],
  ['vendas', 'Clínica Vida', 2500, 'Mercado Pago', 'Pendente', '2026-05-12'],
].forEach(([a,n,v,g,s,d]) => insertInv.run(userId, a, n, v, g, s, d));

// EVENTOS DE AGENDA (Booker)
const insertEvt = db.prepare(`INSERT INTO calendar_events (user_id, agent_slug, title, day, time, source) VALUES (?,?,?,?,?,?)`);
const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
days.forEach((d, i) => {
  insertEvt.run(userId, 'booker', 'Reunião Interna', d, '09:00', 'human');
  insertEvt.run(userId, 'booker', `Call ${['LeadFlow','InovaSys','TechCorp','Holding','Logística'][i]}`, d, '10:30', 'ai');
  insertEvt.run(userId, 'booker', 'Demo Comercial', d, '14:00', 'ai');
});

// DOCUMENTOS RAG (ExpertAI)
const insertDoc = db.prepare(`INSERT INTO rag_documents (user_id, agent_slug, filename, size_kb, status) VALUES (?,?,?,?,?)`);
[
  ['expertai', 'Manual_Produto_v3.pdf', 2840, 'indexed'],
  ['expertai', 'FAQ_Tecnico.pdf', 480, 'indexed'],
  ['expertai', 'Politica_Suporte.pdf', 220, 'indexed'],
].forEach(([a,f,s,st]) => insertDoc.run(userId, a, f, s, st));

// WORKFLOWS (Custom)
const insertWf = db.prepare(`INSERT INTO workflows (user_id, name, description, enabled, steps) VALUES (?,?,?,?,?)`);
[
  ['Lead → CRM → WhatsApp', 'Captura lead do site, salva no CRM e dispara primeira mensagem.', 1, JSON.stringify([
    { type: 'webhook', name: 'Recebe lead' },
    { type: 'crm', name: 'Cria card' },
    { type: 'whatsapp', name: 'Envia mensagem inicial' },
  ])],
  ['Cobrança automática', 'Gera fatura no gateway e envia link via WhatsApp.', 1, JSON.stringify([
    { type: 'trigger', name: 'Lead fechado' },
    { type: 'gateway', name: 'Gera boleto/Pix' },
    { type: 'whatsapp', name: 'Envia link' },
  ])],
  ['Follow-up 7 dias', 'Reengaja leads sem resposta após 7 dias.', 0, JSON.stringify([
    { type: 'cron', name: 'Diário 09:00' },
    { type: 'filter', name: 'Sem resposta > 7d' },
    { type: 'whatsapp', name: 'Envia follow-up' },
  ])],
].forEach(([n,d,e,s]) => insertWf.run(userId, n, d, e, s));

// Algumas execuções
const wfIds = db.prepare('SELECT id FROM workflows WHERE user_id=?').all(userId).map(r => r.id);
const insertEx = db.prepare(`INSERT INTO executions (workflow_id, status, duration_ms, log) VALUES (?,?,?,?)`);
wfIds.forEach(id => {
  insertEx.run(id, 'success', 1240, 'Executado com sucesso. 3 etapas concluídas.');
  insertEx.run(id, 'success', 980, 'OK.');
  insertEx.run(id, 'error', 4200, 'Falha no passo 2: timeout no gateway.');
});

// CANAIS WHATSAPP
const insertCh = db.prepare(`INSERT INTO whatsapp_channels (user_id, agent_slug, number, active) VALUES (?,?,?,?)`);
['vendas','leadflow','booker','expertai','custom'].forEach(a => {
  insertCh.run(userId, a, '+55 (11) 98765-4321', 1);
});

console.log('[seed] Concluído.');
