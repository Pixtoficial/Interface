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
app.use('/api/executor-users', require('./routes/executor-users'));
app.use('/api/traffic', require('./routes/traffic'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Página de exclusão de dados (Meta / LGPD)
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exclusão de Dados – Pixt</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 60px auto; padding: 0 24px; color: #222; }
    h1 { font-size: 1.6rem; margin-bottom: 8px; }
    p { line-height: 1.7; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Exclusão de Dados</h1>
  <p>Para solicitar a exclusão dos seus dados da plataforma Pixt, envie um e-mail para:</p>
  <p><strong><a href="mailto:contato.pixt@gmail.com">contato.pixt@gmail.com</a></strong></p>
  <p>Informe o seu nome e e-mail cadastrado. Processaremos sua solicitação em até 15 dias úteis e removeremos todos os seus dados, incluindo tokens de acesso de contas vinculadas (Meta Ads, Google Ads).</p>
  <p style="margin-top:40px;font-size:0.85rem;color:#666;">Pixt – plataforma.pixt.com.br</p>
</body>
</html>`);
});

// 404 das APIs
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint inexistente' }));

// Tratamento de erro genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

module.exports = app;
