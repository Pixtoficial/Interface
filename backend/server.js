// Pixt IA - Servidor de desenvolvimento local
// Em produção (Vercel), use /api/index.js como handler serverless.

const express = require('express');
const path = require('path');
const app = require('./app');

const PORT = parseInt(process.env.PORT || '3001', 10);

// Em dev, o backend também serve o frontend (index.html na raiz do repo)
const frontendDir = path.join(__dirname, '..');
app.use(express.static(frontendDir));

app.listen(PORT, () => {
  console.log(`\n[Pixt IA] Backend rodando em http://localhost:${PORT}`);
  console.log(`[Pixt IA] Frontend: http://localhost:${PORT}/index.html`);
  console.log(`[Pixt IA] API:      http://localhost:${PORT}/api/health\n`);
});
