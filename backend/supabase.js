require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Aceita múltiplos nomes para compatibilidade com a integração oficial Supabase+Vercel
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'SUPABASE_URL e uma chave (SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY) são obrigatórios'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;
