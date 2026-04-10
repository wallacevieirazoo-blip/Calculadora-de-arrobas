import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

let supabaseAdmin;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}

async function conectarBanco() {
  const client = getSupabaseAdmin();

  const { error } = await client
    .from('simulacoes_confinamento')
    .select('id', { head: true, count: 'exact' });

  if (error) {
    console.error('❌ Erro ao conectar no Supabase:', error.message);
    throw error;
  }

  console.log('✅ Conectado ao Supabase com sucesso!');
  return client;
}

export { conectarBanco, getSupabaseAdmin };
