// Pixt IA - Express app builder (sem listen e sem static)
// Usado por server.js (dev local) e por /api/index.js (Vercel serverless)

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));

// Rotas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/events', require('./routes/events'));
app.use('/api/rag', require('./routes/rag'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/scrapper', require('./routes/scrapper'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/squads', require('./routes/squads'));
app.use('/api/task-tags', require('./routes/task-tags'));
app.use('/api/task-executors', require('./routes/task-executors'));
app.use('/api/task-clients', require('./routes/task-clients'));
app.use('/api/revenue', require('./routes/revenue'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/timetracking', require('./routes/timetracking'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/bootstrap', require('./routes/bootstrap'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 404 das APIs
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint inexistente' }));

// Tratamento de erro genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

module.exports = app;
