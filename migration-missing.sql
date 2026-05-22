-- ============================================================
-- PIXT IA — Tabelas ausentes (rodar no SQL Editor do Supabase)
-- https://supabase.com/dashboard/project/fkdrplkdtvhwojtnnkrt/editor
-- ============================================================

-- Squads
CREATE TABLE IF NOT EXISTS squads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  leader_name TEXT,
  color_hex TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_squads_user ON squads(user_id);

-- Tags de plataformas/canais
CREATE TABLE IF NOT EXISTS task_tags (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'tag',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_tags_user ON task_tags(user_id);

-- Tarefas
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

-- Executores de tarefas
CREATE TABLE IF NOT EXISTS task_executors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  color_hex TEXT DEFAULT '#6366f1',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_executors_user ON task_executors(user_id);

-- Clientes de tarefas
CREATE TABLE IF NOT EXISTS task_clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#3b82f6',
  status TEXT DEFAULT 'ativo',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_clients_user ON task_clients(user_id);

-- Contratos
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  title TEXT NOT NULL,
  monthly_value NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id);

-- Contatos (CRM)
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  position TEXT,
  stage TEXT DEFAULT 'lead',
  tags JSONB DEFAULT '[]',
  notes TEXT,
  health_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

-- Metas / OKRs
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target NUMERIC NOT NULL,
  current NUMERIC DEFAULT 0,
  unit TEXT DEFAULT '%',
  category TEXT DEFAULT 'Vendas',
  deadline DATE,
  assignee TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- Recarrega schema PostgREST
NOTIFY pgrst, 'reload schema';
