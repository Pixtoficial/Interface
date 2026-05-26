-- ============================================================
-- PIXT IA — Schema Supabase (rodar no SQL Editor do dashboard)
-- ============================================================

-- Usuários (auth própria, sem depender do GoTrue)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'client',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agentes (global)
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  price TEXT,
  icon TEXT
);

-- Vínculo usuário ↔ agente
CREATE TABLE IF NOT EXISTS user_agents (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  is_on BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, agent_id)
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  score INTEGER DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  tag TEXT,
  color_type TEXT DEFAULT 'default',
  stage TEXT NOT NULL DEFAULT 'new',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_user_agent ON leads(user_id, agent_slug);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- Conversas
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  intent TEXT,
  last_message TEXT,
  unread INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','ai','human')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Faturas
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  lead_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  gateway TEXT,
  status TEXT NOT NULL DEFAULT 'Pendente',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eventos de agenda
CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  day TEXT NOT NULL,
  time TEXT,
  source TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documentos RAG
CREATE TABLE IF NOT EXISTS rag_documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_kb INTEGER DEFAULT 0,
  status TEXT DEFAULT 'indexed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  steps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Execuções de workflow
CREATE TABLE IF NOT EXISTS executions (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  log TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configurações por agente
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, agent_slug, key)
);

-- Canais WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  number TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Agentes padrão
-- ============================================================
INSERT INTO agents (slug, name, role, description, price, icon) VALUES
  ('vendas',   'Vendas+',           'Agente Vendedor IA', 'Automação do atendimento até a conversão final.',                 'R$1.500,00 / mês', 'DollarSign'),
  ('leadflow', 'Lead Flow',         'Triagem e CRM',      'Qualificação técnica de leads, gestão de CRM e follow-up ativo.', 'R$2.000,00 / mês', 'Users'),
  ('booker',   'Booker',            'Gestão de Agenda',   'Consulta disponibilidade em tempo real e marca reuniões.',        'R$1.500,00 / mês', 'Calendar'),
  ('expertai', 'ExpertAI',          'Suporte Técnico',    'Reduz 90% dos chamados com documentação RAG.',                   'R$2.000,00 / mês', 'Bot'),
  ('custom',   'Automações Custom', 'Core da PIXT',       'Desenvolvimento de arquiteturas de IA do zero.',                  'Sob Consulta',     'Cpu')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- MIGRATION: Suporte ao agente codado (RAG + WhatsApp)
-- Execute no SQL Editor do Supabase se ainda não tiver rodado
-- ============================================================

-- Conteúdo de texto dos documentos RAG
ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS content TEXT;

-- Nome da instância Evolution API para cada canal WhatsApp
ALTER TABLE whatsapp_channels ADD COLUMN IF NOT EXISTS evolution_instance TEXT;

-- Telefone do contato para envio humano pelo inbox
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Recarrega cache do PostgREST para enxergar as novas tabelas
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: PIXT BDR agent
-- ============================================================

-- Runs de scraping (uma busca = um run)
CREATE TABLE IF NOT EXISTS scrapper_runs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL DEFAULT 'pixt-bdr',
  apify_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  filters JSONB DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  analyzed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scrapper_runs_user ON scrapper_runs(user_id);

-- Leads extraídos e analisados por IA
CREATE TABLE IF NOT EXISTS scrapper_leads (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES scrapper_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  category TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  rating NUMERIC,
  review_count INTEGER DEFAULT 0,
  website TEXT,
  score INTEGER DEFAULT 50,
  revenue_estimate TEXT,
  company_size TEXT DEFAULT 'micro',
  insight TEXT,
  imported BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scrapper_leads_run ON scrapper_leads(run_id);
CREATE INDEX IF NOT EXISTS idx_scrapper_leads_phone ON scrapper_leads(user_id, phone);

-- Remover agente expertai e adicionar pixt-bdr
DELETE FROM agents WHERE slug = 'expertai';
INSERT INTO agents (slug, name, role, description, price, icon)
  VALUES ('pixt-bdr', 'PIXT BDR', 'Prospecção Inteligente', 'Extrai leads do Google Maps, analisa com IA e dispara prospecção via WhatsApp.', 'R$2.500,00 / mês', 'MapPin')
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: Gestão de Tarefas Avançada (Ekyte+Notion Hybrid)
-- ============================================================

-- Squads (equipes de trabalho)
CREATE TABLE IF NOT EXISTS squads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  leader_name TEXT,
  color_hex TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_squads_user ON squads(user_id);

-- Tags de plataformas/canais (Meta, Google, Redação, etc.)
CREATE TABLE IF NOT EXISTS task_tags (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'tag',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_tags_user ON task_tags(user_id);

-- Tabela tasks completa (para instalações novas)
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  squad_id INTEGER REFERENCES squads(id) ON DELETE SET NULL,
  current_stage TEXT DEFAULT 'briefing',
  executor_name TEXT,
  participants JSONB DEFAULT '[]',
  priority TEXT DEFAULT 'media',
  estimated_minutes INTEGER DEFAULT 60,
  due_date DATE,
  tag_ids JSONB DEFAULT '[]',
  blocked_by JSONB DEFAULT '[]',
  is_blocking JSONB DEFAULT '[]',
  stage_history JSONB DEFAULT '[]',
  status TEXT DEFAULT 'todo',
  assignee TEXT,
  contact_id INTEGER,
  agent_slug TEXT,
  subtasks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(user_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(user_id, client_name);

-- Para instalações existentes: adicionar colunas novas sem quebrar dados
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS squad_id INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'briefing';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 60;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tag_ids JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_blocking JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Executores das tarefas (membros da equipe)
CREATE TABLE IF NOT EXISTS task_executors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  color_hex TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_executors_user ON task_executors(user_id);

-- Clientes das tarefas (portfólio de clientes da agência)
CREATE TABLE IF NOT EXISTS task_clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#3b82f6',
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_clients_user ON task_clients(user_id);

-- Tags padrão de agências de marketing digital
INSERT INTO task_tags (user_id, name, color_hex, icon)
SELECT u.id, t.name, t.color, t.icon
FROM users u
CROSS JOIN (VALUES
  ('Meta Ads',       '#1877f2', 'meta'),
  ('Google Ads',     '#34a853', 'google'),
  ('Instagram',      '#e1306c', 'instagram'),
  ('Google Display', '#ea4335', 'display'),
  ('Redação',        '#8b5cf6', 'edit'),
  ('Design',         '#f59e0b', 'design'),
  ('Site/SEO',       '#14b8a6', 'globe'),
  ('E-mail Mkt',     '#6366f1', 'mail')
) AS t(name, color, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM task_tags tt WHERE tt.user_id = u.id AND tt.name = t.name
);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: foto/logo para executores e clientes
-- ============================================================
ALTER TABLE task_executors ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE task_clients   ADD COLUMN IF NOT EXISTS photo_url TEXT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: Contatos e resumo nos leads
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_summary TEXT;

NOTIFY pgrst, 'reload schema';
