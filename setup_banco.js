// Verifica conectividade com Supabase e opcionalmente cria um registro de teste.
// Rode: node setup_banco.js
import { conectarBanco } from './database.js';

async function inicializarBanco() {
  try {
    const db = await conectarBanco();
    console.log('⏳ Verificando tabela simulacoes_confinamento...');

    const { count, error: countError } = await db
      .from('simulacoes_confinamento')
      .select('id', { head: true, count: 'exact' });

    if (countError) throw countError;

    const n = count ?? 0;
    if (n === 0) {
      console.log('⏳ Inserindo registro de teste (tabela vazia)...');
      const { error: insertError } = await db
        .from('simulacoes_confinamento')
        .insert({
          nome_lote: 'Lote Teste Cruzamento Industrial',
          dias_confinamento: 100,
          peso_entrada_kg: 350,
          gmd_projetado: 1.55,
          cms_projetado: 10.5,
          custo_diaria: 18.4,
          params_json: null,
        });

      if (insertError) throw insertError;
      console.log('✅ Dados de teste inseridos.');
    } else {
      console.log(`ℹ️ Tabela já tem ${n} registro(s); não inserindo teste de novo.`);
    }

    process.exit(0);
  } catch (erro) {
    console.error('❌ Falha na execução:', erro);
    process.exit(1);
  }
}

inicializarBanco();
