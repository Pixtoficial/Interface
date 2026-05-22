// Cria o primeiro usuário admin no banco de dados
// Uso: node setup.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pixt.ia';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin Pixt';

async function main() {
  console.log('[setup] Verificando agentes...');
  const { data: agents, error: agentsErr } = await supabase.from('agents').select('id, slug');
  if (agentsErr) {
    console.error('[setup] Erro ao buscar agentes:', agentsErr.message);
    console.error('[setup] Certifique-se de ter rodado o supabase_schema.sql no dashboard.');
    process.exit(1);
  }
  console.log(`[setup] ${agents.length} agente(s) encontrado(s).`);

  console.log('[setup] Verificando usuário admin:', ADMIN_EMAIL);
  const { data: exists } = await supabase.from('users').select('id, role').eq('email', ADMIN_EMAIL).limit(1);

  let userId;
  if (exists && exists.length) {
    userId = exists[0].id;
    await supabase.from('users').update({ role: 'admin' }).eq('id', userId);
    console.log(`[setup] Usuário já existe (id=${userId}), role atualizado para admin.`);
  } else {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    const { data: created, error } = await supabase
      .from('users')
      .insert({ email: ADMIN_EMAIL, password_hash: hash, name: ADMIN_NAME, role: 'admin' })
      .select('id')
      .single();

    if (error) {
      console.error('[setup] Erro ao criar admin:', error.message);
      process.exit(1);
    }
    userId = created.id;
    console.log(`[setup] Admin criado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }

  // Vincular todos os agentes ao admin
  for (const a of agents) {
    await supabase.from('user_agents').upsert(
      { user_id: userId, agent_id: a.id, is_on: true },
      { onConflict: 'user_id,agent_id' }
    );
  }
  console.log(`[setup] Admin vinculado a ${agents.length} agente(s).`);
  console.log('[setup] Concluído! Login: ' + ADMIN_EMAIL + ' / ' + ADMIN_PASSWORD);
}

main().catch(e => { console.error(e.message); process.exit(1); });
