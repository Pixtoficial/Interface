const path = require('path');
const fs = require('fs');
const { Database: WasmDB } = require('node-sqlite3-wasm');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'pixt.db');

// Shim that gives node-sqlite3-wasm the same API as better-sqlite3
class Statement {
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }

  _params(args) {
    if (args.length === 0) return undefined;
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  run(...args) {
    this._db.run(this._sql, this._params(args));
    const r = this._db.get('SELECT last_insert_rowid() as lid, changes() as ch');
    return { lastInsertRowid: r.lid, changes: r.ch };
  }

  get(...args) {
    return this._db.get(this._sql, this._params(args));
  }

  all(...args) {
    return this._db.all(this._sql, this._params(args));
  }
}

class Database {
  constructor(filePath) {
    this._db = new WasmDB(filePath);
  }

  prepare(sql) {
    return new Statement(this._db, sql);
  }

  exec(sql) {
    this._db.exec(sql);
  }

  pragma(str) {
    this._db.run('PRAGMA ' + str);
  }
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ----- SCHEMA -----
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  price TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS user_agents (
  user_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  is_on INTEGER DEFAULT 1,
  PRIMARY KEY (user_id, agent_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  score INTEGER DEFAULT 0,
  amount REAL DEFAULT 0,
  tag TEXT,
  color_type TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_leads_user_agent ON leads(user_id, agent_slug);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  intent TEXT,
  last_message TEXT,
  unread INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','ai','human')),
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  lead_name TEXT NOT NULL,
  amount REAL NOT NULL,
  gateway TEXT,
  status TEXT NOT NULL DEFAULT 'Pendente',
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  day TEXT NOT NULL,
  time TEXT,
  source TEXT DEFAULT 'ai',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_kb INTEGER DEFAULT 0,
  status TEXT DEFAULT 'indexed',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  steps TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  log TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (user_id, agent_slug, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_slug TEXT NOT NULL,
  number TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migrations
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch {}

// New tables — Supabase is authoritative; these exist for local/offline fallback
db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  position TEXT,
  stage TEXT DEFAULT 'lead',
  tags TEXT DEFAULT '[]',
  notes TEXT,
  health_score INTEGER DEFAULT 0,
  nps INTEGER,
  ltv REAL DEFAULT 0,
  contract_start TEXT,
  contract_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assignee TEXT,
  due_date TEXT,
  contact_id INTEGER,
  agent_slug TEXT,
  subtasks TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  title TEXT NOT NULL,
  monthly_value REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  signed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'Geral',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  contact_id INTEGER,
  agent_slug TEXT,
  duration_min INTEGER DEFAULT 0,
  hourly_rate REAL DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  target REAL NOT NULL,
  current REAL DEFAULT 0,
  unit TEXT DEFAULT '%',
  category TEXT DEFAULT 'Vendas',
  deadline TEXT,
  assignee TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

module.exports = db;
