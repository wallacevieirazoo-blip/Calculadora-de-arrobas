// Cria/atualiza tabela e colunas. Rode: node setup_banco.js
import { conectarBanco } from './database.js';

async function inicializarBanco() {
  try {
    const pool = await conectarBanco();
    console.log('⏳ Garantindo tabela SimulacoesConfinamento...');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SimulacoesConfinamento' AND xtype='U')
      CREATE TABLE SimulacoesConfinamento (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome_lote VARCHAR(100) NOT NULL,
        dias_confinamento INT NOT NULL,
        peso_entrada_kg DECIMAL(10,2) NOT NULL,
        gmd_projetado DECIMAL(5,3) NOT NULL,
        cms_projetado DECIMAL(5,2) NOT NULL,
        custo_diaria DECIMAL(10,2) NOT NULL,
        data_simulacao DATETIME DEFAULT GETDATE()
      );
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.SimulacoesConfinamento') AND name = N'params_json'
      )
      ALTER TABLE dbo.SimulacoesConfinamento ADD params_json NVARCHAR(MAX) NULL;
    `);

    console.log('✅ Tabela e coluna params_json prontas.');

    const count = await pool.request().query(`SELECT COUNT(*) AS n FROM SimulacoesConfinamento`);
    const n = count.recordset[0]?.n ?? 0;
    if (n === 0) {
      console.log('⏳ Inserindo registro de teste (tabela vazia)...');
      await pool.request().query(`
        INSERT INTO SimulacoesConfinamento
        (nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, params_json)
        VALUES
        ('Lote Teste Cruzamento Industrial', 100, 350.00, 1.550, 10.50, 18.40, NULL)
      `);
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
