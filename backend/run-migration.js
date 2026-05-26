/**
 * run-migration.js
 * Executa migrations pendentes direto no Postgres do Supabase.
 *
 * Como usar:
 *   1. Adicione DATABASE_URL no .env  (veja instruções abaixo)
 *   2. node run-migration.js
 *
 * Onde achar o DATABASE_URL:
 *   Supabase Dashboard → Settings → Database → Connection string → URI
 *   Formato: postgresql://postgres:[senha]@db.fkdrplkdtvhwojtnnkrt.supabase.co:5432/postgres
 */

require('dotenv').config();
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('\n❌  DATABASE_URL não encontrado no .env');
  console.error('\nPasse assim:');
  console.error('  DATABASE_URL="postgresql://postgres:[senha]@db.fkdrplkdtvhwojtnnkrt.supabase.co:5432/postgres"');
  console.error('\nOu adicione ao .env e rode novamente.\n');
  process.exit(1);
}

const SQL = `
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone               TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_summary TEXT;
NOTIFY pgrst, 'reload schema';
`;

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('✅  Conectado ao banco de dados.');
    await client.query(SQL);
    console.log('✅  Migration concluída com sucesso!');
    console.log('    Colunas adicionadas: phone, email, notes, conversation_summary');
    console.log('    Cache do PostgREST notificado para recarregar.');
  } catch (err) {
    console.error('❌  Erro ao executar migration:', err.message);
  } finally {
    await client.end();
  }
}

run();
