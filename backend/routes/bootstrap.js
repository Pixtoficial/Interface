// Endpoint one-shot para inicializar o admin em produção.
// Protegido por BOOTSTRAP_TOKEN. Idempotente: pode rodar várias vezes sem problema.
// Uso: GET /api/bootstrap?token=SEU_BOOTSTRAP_TOKEN

const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');

const router = express.Router();

router.get('/', async (req, res) => {
  const token = req.query.token || req.headers['x-bootstrap-token'];
  const expected = process.env.BOOTSTRAP_TOKEN;

  if (!expected) {
    return res.status(500).json({
      error: 'BOOTSTRAP_TOKEN não configurado nas env vars. Adicione na Vercel antes de chamar este endpoint.',
    });
  }
  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pixt.ia';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin Pixt';

  try {
    const log = [];

    // 1) Verifica agentes
    const { data: agents, error: agentsErr } = await supabase.from('agents').select('id, slug');
    if (agentsErr) {
      return res.status(500).json({
        error: 'Erro ao consultar agentes: ' + agentsErr.message,
        hint: 'Você rodou o supabase_schema.sql no SQL Editor do Supabase?',
      });
    }
    log.push(`${agents.length} agente(s) encontrado(s)`);

    // 2) Cria ou promove admin
    const { data: existing } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', ADMIN_EMAIL)
      .limit(1);

    let userId;
    let created = false;

    if (existing && existing.length) {
      userId = existing[0].id;
      await supabase.from('users').update({ role: 'admin', is_active: true }).eq('id', userId);
      log.push(`Usuário existente (id=${userId}) promovido a admin`);
    } else {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({
          email: ADMIN_EMAIL,
          password_hash: hash,
          name: ADMIN_NAME,
          role: 'admin',
          is_active: true,
        })
        .select('id')
        .single();

      if (insertErr) {
        return res.status(500).json({ error: 'Erro ao criar admin: ' + insertErr.message });
      }
      userId = newUser.id;
      created = true;
      log.push(`Admin criado: ${ADMIN_EMAIL}`);
    }

    // 3) Vincula todos os agentes ao admin
    if (agents.length) {
      for (const a of agents) {
        await supabase
          .from('user_agents')
          .upsert({ user_id: userId, agent_id: a.id, is_on: true }, { onConflict: 'user_id,agent_id' });
      }
      log.push(`Admin vinculado a ${agents.length} agente(s)`);
    }

    res.json({
      ok: true,
      created,
      admin_email: ADMIN_EMAIL,
      admin_password_set: created ? '(definida via ADMIN_PASSWORD)' : '(inalterada)',
      log,
      next_step: 'Faça login em /index.html com o e-mail e senha do admin',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
