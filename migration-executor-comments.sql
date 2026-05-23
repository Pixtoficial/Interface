-- ============================================================
-- PIXT IA — Migration: Executores com login + Comentários + Leads
-- Rodar no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fkdrplkdtvhwojtnnkrt/editor
-- ============================================================

-- owner_id: identifica quem criou a conta de executor
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- campos extras do lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_summary TEXT;

-- Comentários de tarefas (persistidos no banco)
CREATE TABLE IF NOT EXISTS task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'owner',  -- 'owner' | 'executor'
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);

NOTIFY pgrst, 'reload schema';
