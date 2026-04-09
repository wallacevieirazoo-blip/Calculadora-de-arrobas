import 'dotenv/config';
import express from 'express';
import { conectarBanco, sql } from './database.js';
import { initFirebaseAdmin, requireFirebaseAuth } from './server/firebaseAuth.js';

initFirebaseAdmin();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (req.path === '/api/health') return next();
  return requireFirebaseAuth(req, res, next);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'simulador-confinamento-api' });
});

app.get('/api/simulacoes', async (_req, res) => {
  try {
    const pool = await conectarBanco();
    const r = await pool.request().query(`
      SELECT id, nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, data_simulacao,
        CASE WHEN params_json IS NOT NULL THEN 1 ELSE 0 END AS tem_params
      FROM SimulacoesConfinamento
      ORDER BY data_simulacao DESC
    `);
    res.json(r.recordset);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.get('/api/simulacoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const pool = await conectarBanco();
    const r = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT id, nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, data_simulacao, params_json
        FROM SimulacoesConfinamento WHERE id = @id
      `);
    const row = r.recordset[0];
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.post('/api/simulacoes', async (req, res) => {
  try {
    const b = req.body ?? {};
    const nome = String(b.nome_lote ?? '').trim().slice(0, 100);
    if (!nome) return res.status(400).json({ error: 'nome_lote é obrigatório' });

    const dias = Number(b.dias_confinamento);
    const peso = Number(b.peso_entrada_kg);
    const gmd = Number(b.gmd_projetado);
    const cms = Number(b.cms_projetado);
    const custo = Number(b.custo_diaria);
    const paramsJson = b.params_json != null ? String(b.params_json) : null;

    const pool = await conectarBanco();
    const request = pool.request();
    request.input('nome_lote', sql.NVarChar(100), nome);
    request.input('dias_confinamento', sql.Int, Math.round(dias));
    request.input('peso_entrada_kg', sql.Decimal(10, 2), peso);
    request.input('gmd_projetado', sql.Decimal(5, 3), gmd);
    request.input('cms_projetado', sql.Decimal(5, 2), cms);
    request.input('custo_diaria', sql.Decimal(10, 2), custo);
    request.input('params_json', sql.NVarChar(sql.MAX), paramsJson);

    const ins = await request.query(`
      INSERT INTO SimulacoesConfinamento
        (nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, params_json)
      OUTPUT INSERTED.id
      VALUES (@nome_lote, @dias_confinamento, @peso_entrada_kg, @gmd_projetado, @cms_projetado, @custo_diaria, @params_json)
    `);
    const id = ins.recordset[0]?.id;
    res.status(201).json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.delete('/api/simulacoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const pool = await conectarBanco();
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM SimulacoesConfinamento WHERE id = @id`);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT} (GET /api/health)`);
});
