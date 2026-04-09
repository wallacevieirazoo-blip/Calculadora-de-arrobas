import dotenv from 'dotenv';
import sql from 'mssql';

dotenv.config();

/** Azure Portal mostra "{servidor (Region)}" — só o nome do servidor entra no DNS. */
function normalizeAzureSqlServer(server) {
    if (!server || typeof server !== 'string') return server;
    let s = server.trim().replace(/[{}]/g, '');
    s = s.replace(/\s+\([^)]*\)\s*(?=\.database\.windows\.net)/i, '');
    return s.trim();
}

function stripBraces(v) {
    if (v == null || typeof v !== 'string') return v;
    return v.trim().replace(/^\{|\}$/g, '').trim();
}

const connectTimeout = Math.min(
    120000,
    Math.max(5000, Number(process.env.DB_CONNECT_TIMEOUT_MS) || 30000)
);

// Configuração baseada nas variáveis de ambiente
const sqlConfig = {
    user: stripBraces(process.env.DB_USER),
    password: stripBraces(process.env.DB_PASSWORD),
    database: stripBraces(process.env.DB_NAME),
    server: normalizeAzureSqlServer(process.env.DB_SERVER),
    connectionTimeout: connectTimeout,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
    }
};

let appPool;

async function conectarBanco() {
    try {
        if (appPool) return appPool;

        appPool = await sql.connect(sqlConfig);
        console.log('✅ Conectado ao Azure SQL com sucesso!');
        return appPool;
    } catch (err) {
        const code = err?.code ?? err?.originalError?.code;
        console.error('❌ Erro de conexão com o banco:', err);
        if (code === 'ETIMEOUT' || code === 'ESOCKET') {
            console.error(`
→ ETIMEOUT costuma ser firewall do Azure SQL ou rede bloqueando a porta 1433.
  1) Portal Azure → SQL servers → seu servidor → Networking / Rede
  2) Em "Firewall rules", adicione o IP público desta máquina (ou "Allow Azure services" se for app na Azure).
  3) Salve e espere ~1 min. Teste de fora de VPN corporativa se a empresa bloquear 1433.
`);
        }
        throw err;
    }
}

// NOVO: Padrão moderno de exportação
export { conectarBanco, sql };