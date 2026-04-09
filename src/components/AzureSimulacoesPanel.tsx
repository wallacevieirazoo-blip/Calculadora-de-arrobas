import { useCallback, useEffect, useState } from 'react';
import { Cloud, Loader2, Trash2, Download } from 'lucide-react';
import type { ScenarioParameters, ScenarioResults } from '../types';
import { effectivePermanenceDays, migrateScenario } from '../types';
import {
  deleteSimulacao,
  getSimulacao,
  listSimulacoes,
  saveSimulacao,
  type SimulacaoListRow,
} from '../api/simulacoes';
import { formatCurrency, formatNumber } from '../lib/utils';

type Props = {
  activeScenario: ScenarioParameters;
  activeResults: ScenarioResults;
  onImported: (scenario: ScenarioParameters) => void;
};

export function AzureSimulacoesPanel({ activeScenario, activeResults, onImported }: Props) {
  const [rows, setRows] = useState<SimulacaoListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSimulacoes();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const dias = effectivePermanenceDays(activeScenario);
      const custoDiaria = dias > 0 ? activeResults.productionCost / dias : 0;
      await saveSimulacao({
        nome_lote: activeScenario.name.slice(0, 100),
        dias_confinamento: dias,
        peso_entrada_kg: activeScenario.entryWeight,
        gmd_projetado: activeScenario.gmd,
        cms_projetado: activeScenario.msConsumptionPerDay,
        custo_diaria: custoDiaria,
        params_json: JSON.stringify({ scenario: activeScenario, results: activeResults }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (id: number) => {
    setError(null);
    try {
      const row = await getSimulacao(id);
      if (!row.params_json) {
        setError('Este registro não tem cenário completo (salvo antes da integração).');
        return;
      }
      const parsed = JSON.parse(row.params_json) as { scenario?: unknown };
      if (!parsed.scenario) {
        setError('JSON inválido no banco.');
        return;
      }
      const m = migrateScenario(parsed.scenario);
      const imported: ScenarioParameters = {
        ...m,
        id: crypto.randomUUID(),
        name: m.name.length < 90 ? `${m.name} (nuvem)` : `${m.name.slice(0, 80)}… (nuvem)`,
      };
      onImported(imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir esta simulação?')) return;
    setError(null);
    try {
      await deleteSimulacao(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <h3 className="font-semibold mb-1 flex items-center gap-2">
        <Cloud size={18} className="text-sky-500" />
        Simulações salvas
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Salve o cenário ativo na nuvem ou carregue um cenário salvo anteriormente.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
          Salvar cenário atual
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Atualizar lista
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3 whitespace-pre-wrap break-words">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum registro ainda.</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-slate-100 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{r.nome_lote}</p>
                <p className="text-xs text-slate-500">
                  #{r.id} · {r.dias_confinamento} d · GMD {formatNumber(r.gmd_projetado, 3)} ·{' '}
                  {formatCurrency(r.custo_diaria)}/dia
                  {r.tem_params ? '' : ' · sem JSON completo'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleLoad(r.id)}
                  className="p-2 rounded-lg text-sky-600 hover:bg-sky-50"
                  title="Carregar cenário"
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
