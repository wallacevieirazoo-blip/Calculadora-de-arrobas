// No Supabase, alterações de schema devem ser feitas por migration SQL no projeto.
// Este script apenas valida conectividade com o banco.
import { conectarBanco } from './database.js';

async function atualizarTabela() {
  try {
    await conectarBanco();
    console.log('✅ Conexão com Supabase OK.');
    console.log('ℹ️ Para alterar colunas/tabelas, aplique migration SQL no Supabase Studio ou CLI.');
    process.exit(0);
  } catch (erro) {
    console.error('❌ Erro:', erro.message);
    process.exit(1);
  }
}

atualizarTabela();
