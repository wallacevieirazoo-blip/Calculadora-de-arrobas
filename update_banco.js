import { conectarBanco } from './database.js';

async function atualizarTabela() {
    try {
        const pool = await conectarBanco();
        console.log('⏳ Adicionando coluna params_json...');

        await pool.request().query(`
            ALTER TABLE SimulacoesConfinamento 
            ADD params_json NVARCHAR(MAX);
        `);

        console.log('✅ Coluna adicionada com sucesso!');
        process.exit(0);
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
        process.exit(1);
    }
}

atualizarTabela();