/**
 * seed-demo.js — Popula dados fictícios realistas para conta demo
 * Uso: node seed-demo.js <email-do-cliente>
 * Ex:  node seed-demo.js cliente@pixt.com.br
 *
 * O script limpa dados existentes do usuário antes de inserir.
 * Use --no-clear para apenas adicionar sem limpar.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const EMAIL   = process.argv[2] || 'demo@pixt.com.br';
const NO_CLEAR = process.argv.includes('--no-clear');

/* ── helpers ────────────────────────────────────────────────── */
const daysAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };
const monthAgo = (m, day = 15) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  d.setDate(day);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};
const rnd = (min, max) => Math.round(Math.random() * (max - min) + min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function run() {
  console.log(`\n🌱 Pixt Demo Seed — usuário: ${EMAIL}\n`);

  /* ── 1. buscar user_id ────────────────────────────────────── */
  const { data: userRows, error: listErr } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('email', EMAIL)
    .limit(1);

  if (listErr) { console.error('Erro ao buscar usuário:', listErr.message); process.exit(1); }

  const user = userRows && userRows[0];
  if (!user) {
    console.error(`Usuário "${EMAIL}" não encontrado na tabela public.users.`);
    process.exit(1);
  }
  const UID = user.id; // integer
  console.log(`✓ user_id: ${UID} (${user.role})`);

  /* ── 2. limpar dados existentes ───────────────────────────── */
  if (!NO_CLEAR) {
    console.log('🗑  Limpando dados anteriores...');
    const tables = [
      'leads','invoices','contracts','tasks','squads','task_tags',
      'goals','conversations','messages','contacts','events'
    ];
    for (const t of tables) {
      await supabase.from(t).delete().eq('user_id', UID);
    }
    console.log('✓ Dados anteriores removidos');
  }

  /* ══════════════════════════════════════════════════════════ */
  /*  SQUADS                                                    */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n📦 Inserindo squads...');
  const squadsData = [
    { name: 'Conteúdo & Social',  leader_name: 'Carla Souza',   color_hex: '#8b5cf6' },
    { name: 'Design & Criação',   leader_name: 'Rafael Torres', color_hex: '#ec4899' },
    { name: 'Tráfego Pago',       leader_name: 'Ana Lima',      color_hex: '#f59e0b' },
    { name: 'Comercial',          leader_name: 'Lucas Mendes',  color_hex: '#10b981' },
  ];
  const { data: squads, error: sqErr } = await supabase.from('squads')
    .insert(squadsData.map(s => ({ ...s, user_id: UID })))
    .select();
  if (sqErr) { console.error('squads error:', sqErr.message, sqErr.details); process.exit(1); }
  console.log(`✓ ${squads.length} squads`);

  const sqMap = {}; // name → id
  squads.forEach(s => { sqMap[s.name] = s.id; });

  /* ══════════════════════════════════════════════════════════ */
  /*  TASK TAGS                                                 */
  /* ══════════════════════════════════════════════════════════ */
  console.log('🏷  Inserindo tags...');
  const tagsData = [
    { name: 'Instagram',  color_hex: '#e1306c' },
    { name: 'Facebook',   color_hex: '#1877f2' },
    { name: 'Google Ads', color_hex: '#fbbc04' },
    { name: 'TikTok',     color_hex: '#000000' },
    { name: 'YouTube',    color_hex: '#ff0000' },
    { name: 'SEO',        color_hex: '#34d399' },
    { name: 'Email Mkt',  color_hex: '#6366f1' },
    { name: 'LinkedIn',   color_hex: '#0a66c2' },
  ];
  const { data: tags } = await supabase.from('task_tags')
    .insert(tagsData.map(t => ({ ...t, user_id: UID })))
    .select();
  console.log(`✓ ${tags.length} tags`);

  const tagMap = {}; // name → id
  tags.forEach(t => { tagMap[t.name] = t.id; });

  /* ══════════════════════════════════════════════════════════ */
  /*  CONTRACTS (base para MRR ~R$103.500)                     */
  /* ══════════════════════════════════════════════════════════ */
  console.log('📝 Inserindo contratos...');
  const contractsData = [
    { contact_name: 'Construtora Horizonte',  title: 'Social Media + Tráfego Full', monthly_value: 18000, status: 'active',   start_date: monthAgo(8,1).slice(0,10),  signed_at: monthAgo(8,3)  },
    { contact_name: 'Grupo Médico Saúde+',    title: 'Inbound + Conteúdo Premium',  monthly_value: 16000, status: 'active',   start_date: monthAgo(6,1).slice(0,10),  signed_at: monthAgo(6,2)  },
    { contact_name: 'FinTech Credoo',         title: 'Performance Digital',          monthly_value: 15000, status: 'active',   start_date: monthAgo(5,1).slice(0,10),  signed_at: monthAgo(5,3)  },
    { contact_name: 'Restaurante Fazenda Bela', title: 'Instagram + Delivery Ads',  monthly_value: 14000, status: 'active',   start_date: monthAgo(7,1).slice(0,10),  signed_at: monthAgo(7,4)  },
    { contact_name: 'E-commerce ModaVibe',    title: 'Tráfego Pago & CRO',           monthly_value: 12000, status: 'active',   start_date: monthAgo(4,1).slice(0,10),  signed_at: monthAgo(4,2)  },
    { contact_name: 'Academia FitCore',       title: 'Geração de Leads & Social',    monthly_value: 11000, status: 'active',   start_date: monthAgo(3,1).slice(0,10),  signed_at: monthAgo(3,5)  },
    { contact_name: 'Clínica DentStar',       title: 'SEO + Social Media',           monthly_value:  9500, status: 'active',   start_date: monthAgo(9,1).slice(0,10),  signed_at: monthAgo(9,2)  },
    { contact_name: 'RealEstate Prime',       title: 'Leads Qualificados Imóveis',   monthly_value:  8000, status: 'active',   start_date: monthAgo(2,1).slice(0,10),  signed_at: monthAgo(2,3)  },
    { contact_name: 'TechStart Soluções',     title: 'Growth Marketing',             monthly_value:  7000, status: 'churned',  start_date: monthAgo(10,1).slice(0,10), signed_at: monthAgo(10,5) },
    { contact_name: 'Supermercado FrescorMax',title: 'Social Media Local',           monthly_value:  5500, status: 'churned',  start_date: monthAgo(11,1).slice(0,10), signed_at: monthAgo(11,2) },
  ];
  await supabase.from('contracts').insert(
    contractsData.map(c => ({ ...c, user_id: UID, notes: null }))
  );
  console.log(`✓ ${contractsData.length} contratos (MRR ativo: R$103.500)`);

  /* ══════════════════════════════════════════════════════════ */
  /*  LEADS — agente vendas                                     */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n🎯 Inserindo leads (vendas)...');
  const leadsVendas = [
    // new
    { name: 'Dr. Marcos Ribeiro',      company: 'ClínicaVida',         stage: 'new',         score: 62, amount: 8500,  tag: 'Primeiro contato',  color_type: 'default', created_at: daysAgo(2) },
    { name: 'Juliana Fonseca',         company: 'Studio Beleza Pro',   stage: 'new',         score: 45, amount: 5200,  tag: 'Aguardando',        color_type: 'default', created_at: daysAgo(1) },
    { name: 'Grupo Invicta',           company: 'Invicta Construtora', stage: 'new',         score: 78, amount: 22000, tag: 'Quente',            color_type: 'hot',     created_at: daysAgo(3) },
    // in_progress
    { name: 'Thiago Carvalho',         company: 'TechBuild LTDA',      stage: 'in_progress', score: 85, amount: 14500, tag: 'Proposta enviada',  color_type: 'hot',     created_at: daysAgo(8) },
    { name: 'Marina Oliveira',         company: 'ModaFit E-commerce',  stage: 'in_progress', score: 71, amount: 9800,  tag: 'Negociando',        color_type: 'default', created_at: daysAgo(12) },
    { name: 'Fernando Augusto',        company: 'Grupo Alimentar Sul',  stage: 'in_progress', score: 68, amount: 18000, tag: 'Reunião marcada',   color_type: 'hot',     created_at: daysAgo(6) },
    { name: 'Beatriz Santos',          company: 'Salão Glam',          stage: 'in_progress', score: 52, amount: 4500,  tag: 'Follow-up',         color_type: 'default', created_at: daysAgo(15) },
    // no_response
    { name: 'Ricardo Nunes',           company: 'Auto Peças Norte',    stage: 'no_response', score: 40, amount: 3800,  tag: 'Sem retorno',       color_type: 'cold',    created_at: daysAgo(20) },
    { name: 'Patrícia Gomes',          company: 'Pet Shop Mundo Animal',stage: 'no_response', score: 33, amount: 5000, tag: 'Ghost',             color_type: 'cold',    created_at: daysAgo(25) },
    // human
    { name: 'Eduardo Lacerda',         company: 'Imobiliária Certo',   stage: 'human',       score: 90, amount: 16000, tag: 'CEO na linha',      color_type: 'hot',     created_at: daysAgo(4) },
    { name: 'Cláudia Medeiros',        company: 'EduTech Brasil',      stage: 'human',       score: 88, amount: 12000, tag: 'Decisor envolvido', color_type: 'hot',     created_at: daysAgo(7) },
    // closed
    { name: 'Felipe Drummond',         company: 'Construtora Horizonte',stage: 'closed',     score: 95, amount: 18000, tag: 'Fechado',           color_type: 'default', created_at: daysAgo(45) },
    { name: 'Ana Paula Viegas',        company: 'Grupo Médico Saúde+', stage: 'closed',      score: 92, amount: 16000, tag: 'Fechado',           color_type: 'default', created_at: daysAgo(60) },
    { name: 'Roberto Meirelles',       company: 'FinTech Credoo',      stage: 'closed',      score: 89, amount: 15000, tag: 'Fechado',           color_type: 'default', created_at: daysAgo(80) },
    { name: 'Sandra Lima',             company: 'Fazenda Bela',        stage: 'closed',      score: 91, amount: 14000, tag: 'Fechado',           color_type: 'default', created_at: daysAgo(95) },
    { name: 'Carlos Henrique Costa',   company: 'ModaVibe',            stage: 'closed',      score: 87, amount: 12000, tag: 'Fechado',           color_type: 'default', created_at: daysAgo(110) },
  ];
  let pos = {};
  const vendasInsert = leadsVendas.map(l => {
    pos[l.stage] = (pos[l.stage] || 0);
    const p = pos[l.stage]++;
    return { ...l, user_id: UID, agent_slug: 'vendas', position: p };
  });
  await supabase.from('leads').insert(vendasInsert);
  console.log(`✓ ${vendasInsert.length} leads (vendas)`);

  /* LEADS — agente leadflow */
  console.log('🎯 Inserindo leads (leadflow)...');
  const leadsLF = [
    { name: 'Start Digital Agency',   company: 'Start Digital',      stage: 'new',         score: 55, amount: 7200,  tag: 'Lead frio',     color_type: 'cold',    created_at: daysAgo(1) },
    { name: 'Pizzaria Do Chef',       company: 'Chef Pizzas',        stage: 'new',         score: 48, amount: 4800,  tag: 'Primeiro contato', color_type: 'default', created_at: daysAgo(2) },
    { name: 'Dr. Henrique Bastos',    company: 'Odonto Premium',     stage: 'in_progress', score: 76, amount: 9000,  tag: 'Proposta',      color_type: 'default', created_at: daysAgo(9) },
    { name: 'Mariana Braga',          company: 'Coach Fitness',      stage: 'in_progress', score: 64, amount: 6500,  tag: 'Negociando',    color_type: 'default', created_at: daysAgo(14) },
    { name: 'Logística FastMove',     company: 'FastMove Log',       stage: 'human',       score: 82, amount: 13000, tag: 'Decisor',       color_type: 'hot',     created_at: daysAgo(5) },
    { name: 'Bruna Tavares',          company: 'Escola de Idiomas JL',stage: 'no_response',score: 38, amount: 5500,  tag: 'Ghost',         color_type: 'cold',    created_at: daysAgo(30) },
    { name: 'Construtora Pedreira',   company: 'Pedreira Obras',     stage: 'closed',      score: 90, amount: 11000, tag: 'Fechado',       color_type: 'default', created_at: daysAgo(55) },
    { name: 'Farma Saúde Total',      company: 'Saúde Total',        stage: 'closed',      score: 86, amount: 9500,  tag: 'Fechado',       color_type: 'default', created_at: daysAgo(70) },
  ];
  pos = {};
  await supabase.from('leads').insert(leadsLF.map(l => {
    pos[l.stage] = (pos[l.stage] || 0);
    return { ...l, user_id: UID, agent_slug: 'leadflow', position: pos[l.stage]++ };
  }));
  console.log(`✓ ${leadsLF.length} leads (leadflow)`);

  /* LEADS — agente booker */
  console.log('🎯 Inserindo leads (booker)...');
  const leadsBooker = [
    { name: 'Conferência Growth 2025', company: 'Growth Events',      stage: 'new',         score: 70, amount: 5000,  tag: 'Reunião sol.',  color_type: 'default', created_at: daysAgo(1) },
    { name: 'CEO Inovação Tech',       company: 'Inovação Tech SA',   stage: 'in_progress', score: 88, amount: 20000, tag: 'Demo agendada', color_type: 'hot',     created_at: daysAgo(3) },
    { name: 'Fundadora BioCosméticos', company: 'BioCosméticos Natu', stage: 'in_progress', score: 75, amount: 10000, tag: 'Call marcada',  color_type: 'default', created_at: daysAgo(6) },
    { name: 'Diretor Financeiro Grupo',company: 'Grupo Varejo Sul',   stage: 'human',       score: 93, amount: 25000, tag: 'Proposta Final',color_type: 'hot',     created_at: daysAgo(2) },
    { name: 'Marcus Aurelius Neto',    company: 'Consultoria MAP',    stage: 'closed',      score: 88, amount: 8000,  tag: 'Fechado',       color_type: 'default', created_at: daysAgo(40) },
  ];
  pos = {};
  await supabase.from('leads').insert(leadsBooker.map(l => {
    pos[l.stage] = (pos[l.stage] || 0);
    return { ...l, user_id: UID, agent_slug: 'booker', position: pos[l.stage]++ };
  }));
  console.log(`✓ ${leadsBooker.length} leads (booker)`);

  /* LEADS — pixt-bdr */
  console.log('🎯 Inserindo leads (pixt-bdr)...');
  const leadsBDR = [
    { name: 'Supermercados WillMart', company: 'WillMart',           stage: 'new',         score: 60, amount: 12000, tag: 'Cold outreach',  color_type: 'cold',    created_at: daysAgo(2) },
    { name: 'Clínica Bem Estar',      company: 'Bem Estar Saúde',    stage: 'new',         score: 55, amount: 8500,  tag: 'Prospectado',    color_type: 'default', created_at: daysAgo(1) },
    { name: 'Marcelo Invest',         company: 'Marcelo Invest',     stage: 'in_progress', score: 72, amount: 15000, tag: 'Interesse alto', color_type: 'hot',     created_at: daysAgo(7) },
    { name: 'Buffet & Eventos Gold',  company: 'Gold Eventos',       stage: 'in_progress', score: 65, amount: 9000,  tag: 'Negociando',     color_type: 'default', created_at: daysAgo(10) },
    { name: 'Rede de Franquias Plus', company: 'Franquias Plus',     stage: 'human',       score: 91, amount: 28000, tag: 'VP envolvido',   color_type: 'hot',     created_at: daysAgo(4) },
    { name: 'Dr. Paulo Mendonça',     company: 'HospitalClin',       stage: 'closed',      score: 85, amount: 16000, tag: 'Fechado',        color_type: 'default', created_at: daysAgo(35) },
  ];
  pos = {};
  await supabase.from('leads').insert(leadsBDR.map(l => {
    pos[l.stage] = (pos[l.stage] || 0);
    return { ...l, user_id: UID, agent_slug: 'pixt-bdr', position: pos[l.stage]++ };
  }));
  console.log(`✓ ${leadsBDR.length} leads (pixt-bdr)`);

  /* ══════════════════════════════════════════════════════════ */
  /*  INVOICES — últimos 6 meses                               */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n💰 Inserindo faturas...');
  const clients = [
    'Construtora Horizonte','Grupo Médico Saúde+','FinTech Credoo',
    'Restaurante Fazenda Bela','E-commerce ModaVibe','Academia FitCore',
    'Clínica DentStar','RealEstate Prime',
  ];
  const values  = [18000, 16000, 15000, 14000, 12000, 11000, 9500, 8000];
  const gateway = ['Stripe', 'Pix', 'Boleto', 'Pix', 'Stripe', 'Boleto', 'Pix', 'Pix'];
  const agents  = ['vendas','vendas','vendas','leadflow','leadflow','booker','pixt-bdr','vendas'];

  const invoices = [];
  for (let m = 6; m >= 1; m--) {
    clients.forEach((client, idx) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() - m);
      dueDate.setDate(5);
      invoices.push({
        user_id: UID,
        agent_slug: agents[idx],
        lead_name: client,
        amount: values[idx],
        gateway: gateway[idx],
        status: m >= 2 ? 'Pago' : (idx < 5 ? 'Pago' : 'Pendente'),
        due_date: dueDate.toISOString().slice(0, 10),
      });
    });
  }
  // mês corrente parcial (3 já pagas)
  ['Construtora Horizonte','Grupo Médico Saúde+','FinTech Credoo'].forEach((client, idx) => {
    const dueDate = new Date();
    dueDate.setDate(5);
    invoices.push({
      user_id: UID, agent_slug: agents[idx], lead_name: client,
      amount: values[idx], gateway: gateway[idx], status: 'Pago',
      due_date: dueDate.toISOString().slice(0, 10),
    });
  });
  await supabase.from('invoices').insert(invoices);
  console.log(`✓ ${invoices.length} faturas`);

  /* ══════════════════════════════════════════════════════════ */
  /*  TASKS — Gestão de Produção                               */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n📋 Inserindo tarefas...');

  const STAGES_T = ['briefing','redacao','design','revisao','aprovacao','concluido'];
  const executors = ['Lucas Mendes','Carla Souza','Rafael Torres','Ana Lima','Pedro Alves','Júlia Ramos'];
  const taskClients = clients;

  const tasksData = [
    /* ── briefing ── */
    { title: 'Calendário de conteúdo Jun/25 — Construtora Horizonte', client_name: 'Construtora Horizonte', squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza',   priority: 'alta',   current_stage: 'briefing',  due_date: daysFrom(5).slice(0,10),  tag_ids: [tagMap['Instagram'],tagMap['Facebook']],  estimated_minutes: 120, created_at: daysAgo(1) },
    { title: 'Briefing campanha Dia dos Namorados — ModaVibe',        client_name: 'E-commerce ModaVibe',   squad_id: sqMap['Tráfego Pago'],      executor_name: 'Ana Lima',       priority: 'urgente',current_stage: 'briefing',  due_date: daysFrom(3).slice(0,10),  tag_ids: [tagMap['Google Ads'],tagMap['Facebook']],  estimated_minutes: 90,  created_at: daysAgo(0) },
    { title: 'Levantamento de persona — RealEstate Prime',             client_name: 'RealEstate Prime',      squad_id: sqMap['Comercial'],         executor_name: 'Lucas Mendes',   priority: 'media',  current_stage: 'briefing',  due_date: daysFrom(7).slice(0,10),  tag_ids: [tagMap['Instagram']],                      estimated_minutes: 60,  created_at: daysAgo(0) },

    /* ── redação ── */
    { title: 'Copy 10 posts feed — Academia FitCore',                  client_name: 'Academia FitCore',      squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza',   priority: 'alta',   current_stage: 'redacao',   due_date: daysFrom(4).slice(0,10),  tag_ids: [tagMap['Instagram']],                      estimated_minutes: 180, created_at: daysAgo(3) },
    { title: 'Roteiro vídeo institucional — Clínica DentStar',         client_name: 'Clínica DentStar',      squad_id: sqMap['Conteúdo & Social'], executor_name: 'Júlia Ramos',   priority: 'media',  current_stage: 'redacao',   due_date: daysFrom(6).slice(0,10),  tag_ids: [tagMap['YouTube'],tagMap['Instagram']],    estimated_minutes: 240, created_at: daysAgo(2) },
    { title: 'Email mkt campanha retenção — Grupo Médico',             client_name: 'Grupo Médico Saúde+',   squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza',   priority: 'alta',   current_stage: 'redacao',   due_date: daysFrom(3).slice(0,10),  tag_ids: [tagMap['Email Mkt']],                      estimated_minutes: 150, created_at: daysAgo(4) },

    /* ── design ── */
    { title: 'Pack 15 stories + 5 reels — Fazenda Bela',               client_name: 'Restaurante Fazenda Bela', squad_id: sqMap['Design & Criação'], executor_name: 'Rafael Torres', priority: 'alta',   current_stage: 'design',    due_date: daysFrom(2).slice(0,10),  tag_ids: [tagMap['Instagram'],tagMap['TikTok']],     estimated_minutes: 360, created_at: daysAgo(5) },
    { title: 'Criativo estático tráfego Jun — ModaVibe',               client_name: 'E-commerce ModaVibe',   squad_id: sqMap['Design & Criação'], executor_name: 'Rafael Torres', priority: 'urgente',current_stage: 'design',    due_date: daysFrom(1).slice(0,10),  tag_ids: [tagMap['Facebook'],tagMap['Google Ads']], estimated_minutes: 200, created_at: daysAgo(6) },
    { title: 'Banner Google Display — FinTech Credoo',                 client_name: 'FinTech Credoo',        squad_id: sqMap['Design & Criação'], executor_name: 'Pedro Alves',   priority: 'media',  current_stage: 'design',    due_date: daysFrom(5).slice(0,10),  tag_ids: [tagMap['Google Ads']],                     estimated_minutes: 180, created_at: daysAgo(4) },

    /* ── revisão ── */
    { title: 'Revisão copy landing page — Construtora Horizonte',      client_name: 'Construtora Horizonte', squad_id: sqMap['Conteúdo & Social'], executor_name: 'Lucas Mendes',  priority: 'alta',   current_stage: 'revisao',   due_date: daysFrom(1).slice(0,10),  tag_ids: [tagMap['SEO'],tagMap['Google Ads']],       estimated_minutes: 90,  created_at: daysAgo(7) },
    { title: 'QA campanha tráfego — Academia FitCore',                 client_name: 'Academia FitCore',      squad_id: sqMap['Tráfego Pago'],     executor_name: 'Ana Lima',       priority: 'urgente',current_stage: 'revisao',   due_date: daysFrom(0).slice(0,10),  tag_ids: [tagMap['Google Ads'],tagMap['Facebook']],  estimated_minutes: 60,  created_at: daysAgo(8) },

    /* ── aprovação ── */
    { title: 'Aprovação cliente — Calendário Mai/25 — DentStar',       client_name: 'Clínica DentStar',      squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza',   priority: 'alta',   current_stage: 'aprovacao', due_date: daysFrom(1).slice(0,10),  tag_ids: [tagMap['Instagram']],                      estimated_minutes: 30,  created_at: daysAgo(10) },
    { title: 'Aprovação peças gráficas — Grupo Médico',                client_name: 'Grupo Médico Saúde+',   squad_id: sqMap['Design & Criação'], executor_name: 'Rafael Torres', priority: 'media',  current_stage: 'aprovacao', due_date: daysFrom(2).slice(0,10),  tag_ids: [tagMap['Instagram'],tagMap['LinkedIn']],   estimated_minutes: 30,  created_at: daysAgo(9) },

    /* ── concluído (últimas semanas) ── */
    { title: 'Pack conteúdo Abr/25 — Fazenda Bela',                   client_name: 'Restaurante Fazenda Bela', squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza', priority: 'alta',   current_stage: 'concluido', due_date: daysAgo(15).slice(0,10), tag_ids: [tagMap['Instagram']],                      estimated_minutes: 300, created_at: daysAgo(30) },
    { title: 'Campanha Black Week — ModaVibe',                         client_name: 'E-commerce ModaVibe',   squad_id: sqMap['Tráfego Pago'],     executor_name: 'Ana Lima',       priority: 'urgente',current_stage: 'concluido', due_date: daysAgo(10).slice(0,10), tag_ids: [tagMap['Facebook'],tagMap['Google Ads']],  estimated_minutes: 480, created_at: daysAgo(35) },
    { title: 'Relatório mensal Mai/25 — Construtora',                  client_name: 'Construtora Horizonte', squad_id: sqMap['Comercial'],         executor_name: 'Lucas Mendes', priority: 'media',  current_stage: 'concluido', due_date: daysAgo(5).slice(0,10),  tag_ids: [],                                         estimated_minutes: 120, created_at: daysAgo(20) },
    { title: 'Setup pixel + conversões — FinTech Credoo',              client_name: 'FinTech Credoo',        squad_id: sqMap['Tráfego Pago'],     executor_name: 'Ana Lima',       priority: 'alta',   current_stage: 'concluido', due_date: daysAgo(12).slice(0,10), tag_ids: [tagMap['Google Ads'],tagMap['Facebook']],  estimated_minutes: 240, created_at: daysAgo(25) },
    { title: 'Identidade visual feed — Academia FitCore',              client_name: 'Academia FitCore',      squad_id: sqMap['Design & Criação'], executor_name: 'Rafael Torres', priority: 'media',  current_stage: 'concluido', due_date: daysAgo(8).slice(0,10),  tag_ids: [tagMap['Instagram']],                      estimated_minutes: 360, created_at: daysAgo(22) },
    { title: 'SEO onpage — DentStar (Q1)',                             client_name: 'Clínica DentStar',      squad_id: sqMap['Conteúdo & Social'], executor_name: 'Júlia Ramos',  priority: 'media',  current_stage: 'concluido', due_date: daysAgo(20).slice(0,10), tag_ids: [tagMap['SEO']],                            estimated_minutes: 600, created_at: daysAgo(45) },
    { title: 'Linha editorial LinkedIn — RealEstate Prime',            client_name: 'RealEstate Prime',      squad_id: sqMap['Conteúdo & Social'], executor_name: 'Carla Souza',  priority: 'baixa',  current_stage: 'concluido', due_date: daysAgo(6).slice(0,10),  tag_ids: [tagMap['LinkedIn']],                       estimated_minutes: 90,  created_at: daysAgo(14) },
  ];

  const tasksInsert = tasksData.map(t => {
    const stIdx = STAGES_T.indexOf(t.current_stage);
    const history = [];
    for (let i = 0; i <= stIdx; i++) {
      const startedAt = new Date(t.created_at);
      startedAt.setDate(startedAt.getDate() + i * 2);
      const entry = { stage: STAGES_T[i], executor_name: t.executor_name, started_at: startedAt.toISOString() };
      if (i < stIdx) {
        const endedAt = new Date(startedAt);
        endedAt.setDate(endedAt.getDate() + rnd(1, 3));
        entry.ended_at = endedAt.toISOString();
        entry.duration_minutes = rnd(30, 300);
      }
      history.push(entry);
    }
    const { created_at, ...rest } = t;
    return {
      ...rest,
      user_id: UID,
      participants: [t.executor_name],
      blocked_by: [],
      is_blocking: [],
      status: t.current_stage === 'concluido' ? 'done' : 'todo',
      stage_history: history,
      created_at,
    };
  });

  await supabase.from('tasks').insert(tasksInsert);
  console.log(`✓ ${tasksInsert.length} tarefas`);

  /* ══════════════════════════════════════════════════════════ */
  /*  GOALS                                                     */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n🎯 Inserindo metas...');
  const goalsData = [
    { title: 'MRR Mensal',                target: 120000, current: 103500, unit: 'R$',  category: 'Receita',    deadline: daysFrom(60).slice(0,10),  assignee: 'Lucas Mendes' },
    { title: 'Novos contratos (trim)',     target: 5,      current: 3,      unit: 'cx',  category: 'Vendas',     deadline: daysFrom(45).slice(0,10),  assignee: 'Lucas Mendes' },
    { title: 'Taxa de conversão pipeline', target: 35,     current: 28,     unit: '%',   category: 'Vendas',     deadline: daysFrom(30).slice(0,10),  assignee: 'Lucas Mendes' },
    { title: 'Churn rate ≤ 5%',           target: 5,      current: 8.3,    unit: '%',   category: 'Retenção',   deadline: daysFrom(90).slice(0,10),  assignee: 'Lucas Mendes' },
    { title: 'NPS Clientes',              target: 80,     current: 72,     unit: 'pts', category: 'Qualidade',  deadline: daysFrom(30).slice(0,10),  assignee: 'Carla Souza'  },
    { title: 'Entregas no prazo',         target: 95,     current: 88,     unit: '%',   category: 'Operação',   deadline: daysFrom(30).slice(0,10),  assignee: 'Rafael Torres' },
    { title: 'Horas produtivas/semana',   target: 160,    current: 148,    unit: 'h',   category: 'Operação',   deadline: daysFrom(7).slice(0,10),   assignee: 'Ana Lima'     },
  ];
  await supabase.from('goals').insert(goalsData.map(g => ({ ...g, user_id: UID })));
  console.log(`✓ ${goalsData.length} metas`);

  /* ══════════════════════════════════════════════════════════ */
  /*  CONTACTS                                                  */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n👤 Inserindo contatos...');
  const contactsData = [
    { name: 'Carla Mendonça',    phone: '+5511991234567', email: 'carla@horizonte.com.br',   company: 'Construtora Horizonte',  position: 'CMO',             stage: 'customer', tags: ['cliente-ativo'],  health_score: 90, notes: 'Prefere WhatsApp. Reunião mensal toda 1ª segunda.' },
    { name: 'Rodrigo Saúde',     phone: '+5521987654321', email: 'rodrigo@saudepluis.com.br', company: 'Grupo Médico Saúde+',   position: 'Sócio-Fundador',  stage: 'customer', tags: ['cliente-ativo'],  health_score: 85, notes: 'Decisor principal. Gosta de relatórios detalhados.' },
    { name: 'Fernanda Credoo',   phone: '+5531945678901', email: 'fe@credoo.com.br',          company: 'FinTech Credoo',        position: 'Growth Lead',     stage: 'customer', tags: ['cliente-ativo'],  health_score: 92, notes: 'Muito data-driven. Sempre pede dashboards.' },
    { name: 'José Fazenda',      phone: '+5541956789012', email: 'jose@fazendabela.com.br',   company: 'Restaurante Fazenda',  position: 'Proprietário',    stage: 'customer', tags: ['cliente-ativo'],  health_score: 78, notes: 'Responde só de manhã. Foco em Instagram e delivery.' },
    { name: 'Tatiane ModaVibe',  phone: '+5551967890123', email: 'tati@modavibe.com.br',      company: 'E-commerce ModaVibe',  position: 'E-commerce Mgr', stage: 'customer', tags: ['cliente-ativo'],  health_score: 88, notes: 'Alta demanda em datas comemorativas.' },
    { name: 'Dr. Marcos Ribeiro',phone: '+5561978901234', email: 'marcos@clinicavida.com.br', company: 'ClínicaVida',          position: 'CEO',             stage: 'hot',      tags: ['lead-quente'],    health_score: 65, notes: 'Quer proposta até sexta. Orçamento R$8.500.' },
    { name: 'Grupo Invicta',     phone: '+5571989012345', email: 'contato@invicta.com.br',    company: 'Invicta Construtora',  position: 'Diretoria',       stage: 'hot',      tags: ['lead-quente'],    health_score: 70, notes: 'Orçamento R$22k. Concorrendo com outra agência.' },
    { name: 'Thiago Carvalho',   phone: '+5581990123456', email: 'thiago@techbuild.com.br',   company: 'TechBuild LTDA',       position: 'CEO',             stage: 'negotiation',tags: ['negociacao'],   health_score: 60, notes: 'Proposta enviada. Follow-up agendado para quinta.' },
    { name: 'Eduardo Lacerda',   phone: '+5531911111111', email: 'edu@imobcerto.com.br',      company: 'Imobiliária Certo',    position: 'CEO',             stage: 'hot',      tags: ['fechamento'],     health_score: 95, notes: 'Quer fechar. Aguardando minuta do contrato.' },
    { name: 'Ana Lima',          phone: '+5511900000001', email: 'ana@pixt.com.br',           company: 'Pixt Agency',          position: 'Gestora Tráfego', stage: 'lead',     tags: ['equipe'],         health_score: 100,notes: 'Executora interna — squad tráfego.' },
  ];
  const { error: contErr } = await supabase.from('contacts').insert(
    contactsData.map(c => ({ ...c, user_id: UID }))
  );
  if (contErr) console.warn('  ⚠ contacts:', contErr.message);
  else console.log(`✓ ${contactsData.length} contatos`);

  /* ══════════════════════════════════════════════════════════ */
  /*  CONVERSATIONS + MESSAGES (simulação inbox)               */
  /* ══════════════════════════════════════════════════════════ */
  console.log('\n💬 Inserindo conversas...');
  const convsData = [
    { agent_slug: 'vendas',   contact_name: 'Dr. Marcos Ribeiro',    last_message: 'Pode me enviar a proposta até sexta?',         intent: 'proposta'  },
    { agent_slug: 'vendas',   contact_name: 'Grupo Invicta',         last_message: 'Quanto fica o pacote completo?',               intent: 'orcamento' },
    { agent_slug: 'vendas',   contact_name: 'Eduardo Lacerda',       last_message: 'Vou assinar, pode preparar o contrato.',       intent: 'fechamento'},
    { agent_slug: 'leadflow', contact_name: 'Dr. Henrique Bastos',   last_message: 'Tenho interesse. Qual o próximo passo?',       intent: 'qualificacao'},
    { agent_slug: 'leadflow', contact_name: 'Logística FastMove',    last_message: 'Quero falar com um especialista.',             intent: 'suporte'   },
    { agent_slug: 'booker',   contact_name: 'CEO Inovação Tech',     last_message: 'Confirmado para amanhã às 14h.',               intent: 'agendamento'},
    { agent_slug: 'pixt-bdr', contact_name: 'Rede de Franquias Plus',last_message: 'Nosso VP quer uma apresentação formal.',       intent: 'enterprise'},
  ];

  for (const conv of convsData) {
    const { data: convRow } = await supabase.from('conversations').insert({
      user_id: UID,
      agent_slug: conv.agent_slug,
      contact_name: conv.contact_name,
      channel: 'whatsapp',
      intent: conv.intent,
      last_message: conv.last_message,
      unread: rnd(0, 3),
    }).select().single();

    if (!convRow) continue;

    const exchanges = [
      { role: 'user', body: 'Olá! Vi o trabalho de vocês e fiquei muito interessado.' },
      { role: 'ai',   body: 'Olá! Obrigado pelo contato. Posso te ajudar com marketing digital. Me conta mais sobre o seu negócio?' },
      { role: 'user', body: 'Tenho uma empresa e preciso aumentar minhas vendas online.' },
      { role: 'ai',   body: 'Perfeito! Trabalhamos com tráfego pago, social media e conteúdo. Temos cases incríveis. Posso te enviar nosso portfólio?' },
      { role: 'user', body: conv.last_message },
    ];

    await supabase.from('messages').insert(
      exchanges.map(m => ({ conversation_id: convRow.id, ...m }))
    );
  }
  console.log(`✓ ${convsData.length} conversas com mensagens`);

  /* ══════════════════════════════════════════════════════════ */
  /*  SUMMARY                                                   */
  /* ══════════════════════════════════════════════════════════ */
  const totalMRR = contractsData.filter(c=>c.status==='active').reduce((s,c)=>s+c.monthly_value,0);
  const totalInvoicesPaid = invoices.filter(i=>i.status==='Pago').reduce((s,i)=>s+i.amount,0);

  console.log(`
╔══════════════════════════════════════════════════╗
║             ✅  SEED CONCLUÍDO                   ║
╠══════════════════════════════════════════════════╣
║  MRR ativo:       R$ ${totalMRR.toLocaleString('pt-BR').padEnd(25)}║
║  Receita paga 6m: R$ ${totalInvoicesPaid.toLocaleString('pt-BR').padEnd(25)}║
║  Contratos:       ${contractsData.length} (${contractsData.filter(c=>c.status==='active').length} ativos, 2 churned)      ║
║  Leads:           ${vendasInsert.length+leadsLF.length+leadsBooker.length+leadsBDR.length} (4 agentes)                  ║
║  Tarefas:         ${tasksInsert.length} (6 etapas)                  ║
║  Faturas:         ${invoices.length}                               ║
║  Squads:          ${squads.length} | Tags: ${tags.length} | Metas: ${goalsData.length}           ║
╚══════════════════════════════════════════════════╝
  `);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
