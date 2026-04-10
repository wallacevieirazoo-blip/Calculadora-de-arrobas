import 'dotenv/config';
import express from 'express';
import { conectarBanco } from './database.js';
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
    const db = await conectarBanco();
    const { data, error } = await db
      .from('simulacoes_confinamento')
      .select('id, nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, data_simulacao, params_json')
      .order('data_simulacao', { ascending: false });

    if (error) throw error;

    const rows = (data ?? []).map((row) => ({
      id: row.id,
      nome_lote: row.nome_lote,
      dias_confinamento: row.dias_confinamento,
      peso_entrada_kg: row.peso_entrada_kg,
      gmd_projetado: row.gmd_projetado,
      cms_projetado: row.cms_projetado,
      custo_diaria: row.custo_diaria,
      data_simulacao: row.data_simulacao,
      tem_params: row.params_json != null ? 1 : 0,
    }));

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.get('/api/simulacoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const db = await conectarBanco();
    const { data, error } = await db
      .from('simulacoes_confinamento')
      .select('id, nome_lote, dias_confinamento, peso_entrada_kg, gmd_projetado, cms_projetado, custo_diaria, data_simulacao, params_json')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Não encontrado' });

    res.json(data);
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

    const payload = {
      nome_lote: nome,
      dias_confinamento: Math.round(Number(b.dias_confinamento)),
      peso_entrada_kg: Number(b.peso_entrada_kg),
      gmd_projetado: Number(b.gmd_projetado),
      cms_projetado: Number(b.cms_projetado),
      custo_diaria: Number(b.custo_diaria),
      params_json: b.params_json != null ? String(b.params_json) : null,
    };

    const db = await conectarBanco();
    const { data, error } = await db
      .from('simulacoes_confinamento')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    res.status(201).json({ id: data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.delete('/api/simulacoes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const db = await conectarBanco();
    const { error } = await db
      .from('simulacoes_confinamento')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT} (GET /api/health)`);
});
