import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Copy, 
  TrendingUp, 
  DollarSign, 
  Beef, 
  Calendar, 
  ChevronRight,
  SlidersHorizontal,
  BarChart3,
  ArrowRightLeft,
  Info,
  Star,
  RefreshCw,
  LogOut,
  Printer,
  Shield,
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { 
  ScenarioParameters, 
  calculateScenario, 
  defaultParameters,
  migrateScenario,
  effectivePermanenceDays,
  fixedCostsPerAnimal,
  computeCumulativeNutritionSeries,
  computeCumulativeArrobasSeries,
  type CumulativeNutritionDayPoint,
  type DietSlotArray,
} from './types';
import {
  mercadoIndicesFromParams,
  consumptionTotalsFromSeries,
  mergeCompareNutritionByDay,
  metricasPesoResumo,
  type CompareRowItem,
} from './compareUtils';
import { formatCurrency, formatNumber, cn } from './lib/utils';
import { AzureSimulacoesPanel } from './components/AzureSimulacoesPanel';
import { useAuth } from './contexts/AuthContext';

const COMPARE_COLORS = ['#2563eb', '#ea580c', '#7c3aed', '#059669'] as const;
const COMPARE_STORAGE_KEY = 'feedlot_compare_slots';

interface AppProps {
  onOpenAdmin?: () => void;
}

export default function App({ onOpenAdmin }: AppProps) {
  const { user, signOut } = useAuth();

  const [scenarios, setScenarios] = useState<ScenarioParameters[]>(() => {
    const saved = localStorage.getItem('feedlot_scenarios');
    if (!saved) return [{ ...defaultParameters, id: crypto.randomUUID() }];
    try {
      const parsed = JSON.parse(saved) as unknown[];
      return Array.isArray(parsed)
        ? parsed.map((row) => migrateScenario(row))
        : [{ ...defaultParameters, id: crypto.randomUUID() }];
    } catch {
      return [{ ...defaultParameters, id: crypto.randomUUID() }];
    }
  });
  
  const [activeScenarioId, setActiveScenarioId] = useState<string>(scenarios[0]?.id || '');

  const [appTab, setAppTab] = useState<'criar' | 'comparar'>('criar');

  const [compareSlotScenarioIds, setCompareSlotScenarioIds] = useState<
    [string | null, string | null, string | null, string | null]
  >(() => {
    try {
      const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as unknown;
        if (Array.isArray(p) && p.length === 4) {
          return [
            typeof p[0] === 'string' ? p[0] : null,
            typeof p[1] === 'string' ? p[1] : null,
            typeof p[2] === 'string' ? p[2] : null,
            typeof p[3] === 'string' ? p[3] : null,
          ];
        }
      }
    } catch {
      /* ignore */
    }
    return [null, null, null, null];
  });
  
  // Sensitivity state
  const [minPrice, setMinPrice] = useState(250);
  const [maxPrice, setMaxPrice] = useState(350);
  const [priceStep, setPriceStep] = useState(10);

  useEffect(() => {
    localStorage.setItem('feedlot_scenarios', JSON.stringify(scenarios));
  }, [scenarios]);

  useEffect(() => {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(compareSlotScenarioIds));
  }, [compareSlotScenarioIds]);

  useEffect(() => {
    const clearPrintMode = () => document.body.classList.remove('print-compare-mode');
    window.addEventListener('afterprint', clearPrintMode);
    return () => window.removeEventListener('afterprint', clearPrintMode);
  }, []);

  const handlePrintCompare = () => {
    document.body.classList.add('print-compare-mode');
    requestAnimationFrame(() => window.print());
  };

  useEffect(() => {
    const valid = new Set(scenarios.map((s) => s.id));
    setCompareSlotScenarioIds((prev) => {
      const next: [string | null, string | null, string | null, string | null] = [
        prev[0] && valid.has(prev[0]) ? prev[0] : null,
        prev[1] && valid.has(prev[1]) ? prev[1] : null,
        prev[2] && valid.has(prev[2]) ? prev[2] : null,
        prev[3] && valid.has(prev[3]) ? prev[3] : null,
      ];
      if (next[0] === prev[0] && next[1] === prev[1] && next[2] === prev[2] && next[3] === prev[3]) {
        return prev;
      }
      return next;
    });
  }, [scenarios]);

  const activeScenario = useMemo(() => 
    scenarios.find(s => s.id === activeScenarioId) || scenarios[0],
  [scenarios, activeScenarioId]);

  const results = useMemo(() => 
    scenarios.map(s => ({
      params: s,
      results: calculateScenario(s)
    })),
  [scenarios]);

  const activeResults = useMemo(() => 
    calculateScenario(activeScenario),
  [activeScenario]);

  const custoPermanenciaPorDia = useMemo(() => {
    const dias = effectivePermanenceDays(activeScenario);
    const somaFixosNutricao =
      fixedCostsPerAnimal(activeScenario) + activeResults.nutritionCost;
    if (dias <= 0) return 0;
    return (somaFixosNutricao - activeScenario.acquisitionCost) / dias;
  }, [activeScenario, activeResults.nutritionCost]);

  const cumulativeNutritionData = useMemo(
    () => computeCumulativeNutritionSeries(activeScenario),
    [activeScenario]
  );

  const cumulativeArrobasData = useMemo(
    () => computeCumulativeArrobasSeries(activeScenario),
    [activeScenario]
  );

  /** @ vendidas a preço do cenário necessárias para cobrir nutrição + demais custos (sem aquisição). */
  const arrobasParaCustosSemAquisicao = useMemo(() => {
    const preco = activeScenario.arrobaPrice;
    if (preco <= 0) return null;
    return activeResults.productionCost / preco;
  }, [activeScenario.arrobaPrice, activeResults.productionCost]);

  const cumulativeArrobasChartData = useMemo(() => {
    if (cumulativeArrobasData.length === 0) return [];
    const dias = cumulativeArrobasData.length;
    const totalGanhoArrobas =
      cumulativeArrobasData[cumulativeArrobasData.length - 1].arrobasAcumuladas;
    const mediaArrobasPorDia = dias > 0 ? totalGanhoArrobas / dias : 0;
    const meta = arrobasParaCustosSemAquisicao;
    return cumulativeArrobasData.map((row) => ({
      day: row.day,
      pesoVivoDia: row.pesoVivoDia,
      mediaArrobasPorDia,
      arrobasAcumuladasAcumuloMedia: mediaArrobasPorDia * row.day,
      ...(meta != null ? { arrobasMetaCustosSemAquisicao: meta } : {}),
    }));
  }, [cumulativeArrobasData, arrobasParaCustosSemAquisicao]);

  const costBreakdownPie = useMemo(() => {
    const aquisicao = activeScenario.acquisitionCost;
    const nutricao = activeResults.nutritionCost;
    const outros = activeResults.productionCost - activeResults.nutritionCost;
    const total = activeResults.totalCostPerAnimal;
    const rows = [
      { name: 'Aquisição', value: aquisicao, fill: '#2563eb' },
      { name: 'Nutrição', value: nutricao, fill: '#ea580c' },
      { name: 'Outros Custos', value: Math.max(0, outros), fill: '#94a3b8' },
    ];
    const data = rows.filter((r) => r.value > 0);
    return { rows, data, total };
  }, [
    activeScenario.acquisitionCost,
    activeResults.nutritionCost,
    activeResults.productionCost,
    activeResults.totalCostPerAnimal,
  ]);

  const mercadoIndices = useMemo(() => {
    const aq = activeScenario.acquisitionCost;
    const pvEntrada = activeScenario.entryWeight;
    const precoArroba = activeScenario.arrobaPrice;
    const carcassaEntradaKg = pvEntrada * 0.5;
    const arrobasEquivalentesEntrada = carcassaEntradaKg / 15;
    const custoArrobaAquisicao =
      arrobasEquivalentesEntrada > 0 ? aq / arrobasEquivalentesEntrada : 0;
    return {
      custoArrobaAquisicao,
      precoKgArrobaVenda: precoArroba / 15,
      precoKgAquisicaoDiv15: custoArrobaAquisicao / 15,
    };
  }, [
    activeScenario.acquisitionCost,
    activeScenario.entryWeight,
    activeScenario.arrobaPrice,
  ]);

  const metricasProducaoCarcaca = useMemo(() => {
    const pe = activeScenario.entryWeight;
    const pa = activeScenario.exitWeight;
    const rend = activeScenario.carcassYield / 100;
    const kgCarcAbate = pa * rend;
    const kgCarcEntrada50 = pe * 0.5;
    const deltaKgCarc = kgCarcAbate - kgCarcEntrada50;
    const dias = effectivePermanenceDays(activeScenario);
    const arrobasProduzidas = deltaKgCarc / 15;
    const gmdCarcaca = dias > 0 ? deltaKgCarc / dias : 0;
    const ganhoPv = pa - pe;
    const rendimentoGanho = ganhoPv !== 0 ? (deltaKgCarc / ganhoPv) * 100 : 0;

    const arrobaInicial = (pe * 0.5) / 15;
    const arrobaFinal = (pa * rend) / 15;
    const diasPorArroba = gmdCarcaca > 0 ? 15 / gmdCarcaca : 0;

    const totalMs = activeResults.totalMsConsumption;
    const msMediaDiaria = dias > 0 ? totalMs / dias : 0;
    const gmdPv = activeScenario.gmd > 0 ? activeScenario.gmd : 0;
    const conversaoAlimentar =
      gmdPv > 0 && dias > 0 ? (totalMs / dias) / gmdPv : 0;
    const eficienciaAlimentar =
      msMediaDiaria > 0 && gmdPv > 0 ? gmdPv / msMediaDiaria : 0;
    const eficienciaBiologica =
      arrobasProduzidas !== 0 ? totalMs / arrobasProduzidas : 0;

    return {
      arrobasProduzidas,
      gmdCarcaca,
      rendimentoGanho,
      arrobaInicial,
      arrobaFinal,
      diasPorArroba,
      totalMs,
      conversaoAlimentar,
      eficienciaAlimentar,
      eficienciaBiologica,
    };
  }, [activeScenario, activeResults.totalMsConsumption]);

  const bestProfitScenarioId = useMemo(() => {
    if (results.length === 0) return '';
    return [...results].sort((a, b) => b.results.totalLotProfit - a.results.totalLotProfit)[0].params.id;
  }, [results]);

  const bestMarginScenarioId = useMemo(() => {
    if (results.length === 0) return '';
    return [...results].sort((a, b) => b.results.profitMargin - a.results.profitMargin)[0].params.id;
  }, [results]);

  const sensitivityData = useMemo(() => {
    const data = [];
    for (let price = minPrice; price <= maxPrice; price += priceStep) {
      const tempParams = { ...activeScenario, arrobaPrice: price };
      const tempResults = calculateScenario(tempParams);
      data.push({
        price: price,
        lucro: tempResults.profitPerAnimal,
        receita: tempResults.revenuePerAnimal
      });
    }
    return data;
  }, [activeScenario, minPrice, maxPrice, priceStep]);

  const addScenario = () => {
    const newScenario = {
      ...activeScenario,
      id: crypto.randomUUID(),
      name: `Cenário ${scenarios.length + 1}`
    };
    setScenarios([...scenarios, newScenario]);
    setActiveScenarioId(newScenario.id);
  };

  const duplicateScenario = (id: string) => {
    const scenarioToCopy = scenarios.find(s => s.id === id);
    if (scenarioToCopy) {
      const newScenario = {
        ...scenarioToCopy,
        id: crypto.randomUUID(),
        name: `${scenarioToCopy.name} (Cópia)`
      };
      setScenarios([...scenarios, newScenario]);
      setActiveScenarioId(newScenario.id);
    }
  };

  const deleteScenario = (id: string) => {
    if (scenarios.length <= 1) return;
    const newScenarios = scenarios.filter(s => s.id !== id);
    setScenarios(newScenarios);
    if (activeScenarioId === id) {
      setActiveScenarioId(newScenarios[0].id);
    }
  };

  const updateParam = (id: string, key: keyof ScenarioParameters, value: string | number) => {
    setScenarios(scenarios.map(s => {
      if (s.id === id) {
        return { ...s, [key]: value };
      }
      return s;
    }));
  };

  const updateDietSlot = (
    id: string,
    index: number,
    key: 'dietDays' | 'dietCostPerKg' | 'dietConsumptionPct' | 'dietMsPct',
    value: number
  ) => {
    setScenarios(
      scenarios.map((s) => {
        if (s.id !== id) return s;
        const next = [...s[key]] as DietSlotArray;
        next[index] = value;
        return { ...s, [key]: next };
      })
    );
  };

  const setCompareSlot = (index: 0 | 1 | 2 | 3, id: string | null) => {
    setCompareSlotScenarioIds((prev) => {
      const next: [string | null, string | null, string | null, string | null] = [
        prev[0],
        prev[1],
        prev[2],
        prev[3],
      ];
      if (id) {
        for (let j = 0; j < 4; j++) {
          if (j !== index && next[j] === id) next[j] = null;
        }
      }
      next[index] = id;
      return next;
    });
  };

  const compareItems = useMemo((): CompareRowItem[] => {
    const out: CompareRowItem[] = [];
    compareSlotScenarioIds.forEach((id, slotIdx) => {
      if (!id) return;
      const params = scenarios.find((s) => s.id === id);
      if (!params) return;
      out.push({
        slot: slotIdx,
        key: `c${slotIdx}`,
        color: COMPARE_COLORS[slotIdx],
        params,
        results: calculateScenario(params),
        series: computeCumulativeNutritionSeries(params),
      });
    });
    return out;
  }, [compareSlotScenarioIds, scenarios]);

  const compareChartMs = useMemo(
    () =>
      compareItems.length === 0
        ? []
        : mergeCompareNutritionByDay(
            compareItems.map((it) => ({ key: it.key, series: it.series })),
            'kgMsAcumulado'
          ),
    [compareItems]
  );
  const compareChartMn = useMemo(
    () =>
      compareItems.length === 0
        ? []
        : mergeCompareNutritionByDay(
            compareItems.map((it) => ({ key: it.key, series: it.series })),
            'kgMnAcumulado'
          ),
    [compareItems]
  );
  const compareChartCusto = useMemo(
    () =>
      compareItems.length === 0
        ? []
        : mergeCompareNutritionByDay(
            compareItems.map((it) => ({ key: it.key, series: it.series })),
            'acumulado'
          ),
    [compareItems]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 pt-6 pb-0">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Beef className="text-orange-600" />
                Simulador de Confinamento de Bovinos
              </h1>
              <p className="text-slate-500 mt-1">
                Simule custos, receitas e lucro do confinamento e compare cenários de mercado em tempo real.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {user?.email && (
                <span className="text-xs text-slate-500 max-w-[160px] truncate hidden sm:inline" title={user.email}>
                  {user.email}
                </span>
              )}
              {onOpenAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="flex items-center gap-2 border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Shield size={16} />
                  Admin
                </button>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <LogOut size={18} />
                Sair
              </button>
              {appTab === 'criar' && (
                <button
                  onClick={addScenario}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                  <Plus size={20} />
                  Adicionar Cenário
                </button>
              )}
            </div>
          </div>
          <nav
            className="flex gap-1 p-1 bg-slate-100 rounded-t-xl -mb-px"
            aria-label="Navegação principal"
          >
            <button
              type="button"
              onClick={() => setAppTab('criar')}
              className={cn(
                'flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all',
                appTab === 'criar'
                  ? 'bg-white text-orange-800 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <SlidersHorizontal size={18} className="opacity-70" />
              Criar e ajustar cenários
            </button>
            <button
              type="button"
              onClick={() => setAppTab('comparar')}
              className={cn(
                'flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all',
                appTab === 'comparar'
                  ? 'bg-white text-orange-800 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <ArrowRightLeft size={18} className="opacity-70" />
              Ver e comparar
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Parameters */}
        <div className="lg:col-span-8 space-y-8 compare-print-main-col">
          
          {/* Scenario Tabs */}
          <div className="flex flex-wrap gap-2 mb-4 compare-print-hide">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveScenarioId(s.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 border",
                  activeScenarioId === s.id 
                    ? "bg-orange-100 border-orange-200 text-orange-800 shadow-sm" 
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                )}
              >
                {s.name}
                {scenarios.length > 1 && (
                  <Trash2 
                    size={14} 
                    className="hover:text-red-500 transition-colors" 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteScenario(s.id);
                    }}
                  />
                )}
              </button>
            ))}
          </div>

          {appTab === 'criar' && (
            <>
          {/* Parameters Form */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Info size={20} className="text-slate-400" />
                Parâmetros do Cenário: <span className="text-orange-600">{activeScenario.name}</span>
              </h2>
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  value={activeScenario.name}
                  onChange={(e) => updateParam(activeScenario.id, 'name', e.target.value)}
                  className="px-3 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Nome do cenário"
                />
                <button 
                  onClick={() => {
                    setScenarios(scenarios.map(s => s.id === activeScenario.id ? { ...defaultParameters, id: s.id, name: s.name } : s));
                  }}
                  className="p-1.5 text-slate-400 hover:text-orange-600 transition-colors"
                  title="Restaurar padrões"
                >
                  <RefreshCw size={18} />
                </button>
                <button 
                  onClick={() => duplicateScenario(activeScenario.id)}
                  className="p-1.5 text-slate-400 hover:text-orange-600 transition-colors"
                  title="Duplicar cenário"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
                {/* Lote & Permanência */}
                <div className="space-y-4 max-lg:border-b max-lg:border-slate-200 max-lg:pb-8">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Calendar size={14} /> Lote & Permanência
                  </h3>
                  <div className="space-y-3">
                    <InputGroup 
                      label="Número de animais"
                      value={activeScenario.numAnimals}
                      onChange={(v) => updateParam(activeScenario.id, 'numAnimals', v)}
                      suffix="cabeças"
                      integer
                    />
                    <InputGroup 
                      label="Permanência" 
                      value={effectivePermanenceDays(activeScenario)} 
                      onChange={() => {}}
                      suffix="dias"
                      readOnly
                      hint="Arredondado: (Peso abate − Peso entrada) ÷ GMD"
                    />
                    <InputGroup 
                      label="GMD" 
                      value={activeScenario.gmd} 
                      onChange={(v) => updateParam(activeScenario.id, 'gmd', v)}
                      suffix="kg/dia"
                      fractionDigits={3}
                    />
                  </div>
                </div>

                {/* Pesos */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Beef size={14} /> Pesos
                  </h3>
                  <div className="space-y-3">
                    <InputGroup 
                      label="Peso Entrada" 
                      value={activeScenario.entryWeight} 
                      onChange={(v) => updateParam(activeScenario.id, 'entryWeight', v)}
                      suffix="kg"
                      fractionDigits={2}
                    />
                    <InputGroup 
                      label="Peso Abate" 
                      value={activeScenario.exitWeight} 
                      onChange={(v) => updateParam(activeScenario.id, 'exitWeight', v)}
                      suffix="kg"
                      fractionDigits={2}
                    />
                    <InputGroup 
                      label="Rendimento" 
                      value={activeScenario.carcassYield} 
                      onChange={(v) => updateParam(activeScenario.id, 'carcassYield', v)}
                      suffix="%"
                    />
                  </div>
                </div>
              </div>

              {/* Dietas por período */}
              <div className="pt-2 border-t border-slate-200 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dietas (custo de nutrição por período)
                </h3>
                <p className="text-xs text-slate-500 max-w-3xl">
                  Consumo base (% PV/dia, MS%, preço/kg) entra no mesmo cálculo dia a dia do gráfico{' '}
                  <strong>Consumo de matéria seca e matéria natural</strong> (abaixo): lá você define o{' '}
                  <strong>pico do consumo</strong> e o <strong>ajuste fino</strong> — isso atualiza custo de
                  nutrição, curva de custo acumulado, totais de MS e indicadores que dependem de consumo.
                </p>
                <div className="space-y-2 max-w-xs">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Quantas dietas para uso?
                  </label>
                  <select
                    value={activeScenario.numDiets}
                    onChange={(e) =>
                      updateParam(activeScenario.id, 'numDiets', parseInt(e.target.value, 10))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 shadow-sm"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: activeScenario.numDiets }, (_, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Dieta {i + 1}
                      </p>
                      <InputGroup
                        label="Dias nesta dieta"
                        value={activeScenario.dietDays[i]}
                        onChange={(v) => updateDietSlot(activeScenario.id, i, 'dietDays', v)}
                        suffix="dias"
                      />
                      <InputGroup
                        label="Custo kg da dieta (MN)"
                        value={activeScenario.dietCostPerKg[i]}
                        onChange={(v) => updateDietSlot(activeScenario.id, i, 'dietCostPerKg', v)}
                        prefix="R$"
                      />
                      <InputGroup
                        label="Matéria seca da dieta (MS%)"
                        value={activeScenario.dietMsPct[i]}
                        onChange={(v) => updateDietSlot(activeScenario.id, i, 'dietMsPct', v)}
                        suffix="%"
                      />
                      <InputGroup
                        label="Consumo (% PV médio/dia)"
                        value={activeScenario.dietConsumptionPct[i]}
                        onChange={(v) =>
                          updateDietSlot(activeScenario.id, i, 'dietConsumptionPct', v)
                        }
                        suffix="%"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Custo / Animal */}
              <div className="pt-4 border-t border-slate-100 space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                    Custo / Animal
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <InputGroup
                      label="Aquisição"
                      value={activeScenario.acquisitionCost}
                      onChange={(v) => updateParam(activeScenario.id, 'acquisitionCost', v)}
                      prefix="R$"
                      className="bg-orange-50/30"
                    />
                    <InputGroup
                      label="Custo Protocolo sanitário"
                      value={activeScenario.sanitaryCost}
                      onChange={(v) => updateParam(activeScenario.id, 'sanitaryCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Rastreabilidade"
                      value={activeScenario.traceabilityCost}
                      onChange={(v) => updateParam(activeScenario.id, 'traceabilityCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Custo ADM"
                      value={activeScenario.adminCost}
                      onChange={(v) => updateParam(activeScenario.id, 'adminCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Custo mão de obra"
                      value={activeScenario.laborCost}
                      onChange={(v) => updateParam(activeScenario.id, 'laborCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Maquinários"
                      value={activeScenario.machineryCost}
                      onChange={(v) => updateParam(activeScenario.id, 'machineryCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Medicamentos"
                      value={activeScenario.medicationsCost}
                      onChange={(v) => updateParam(activeScenario.id, 'medicationsCost', v)}
                      prefix="R$"
                    />
                    <InputGroup
                      label="Outros custos"
                      value={activeScenario.otherCosts}
                      onChange={(v) => updateParam(activeScenario.id, 'otherCosts', v)}
                      prefix="R$"
                    />
                  </div>
                  <div className="col-span-full mt-2 pt-4 border-t border-slate-200 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <ReadOnlyCurrencyField
                        label="Custo nutrição (dietas)"
                        value={activeResults.nutritionCost}
                        hint="Soma dia a dia (igual ao gráfico de custo e ao de consumo): PV médio × (% PV/dia) → MS; MN = MS ÷ MS%; custo = MN × R$/kg. Após o pico do consumo, aplica o ajuste fino (mesma seção do gráfico de consumo)."
                      />
                      <ReadOnlyCurrencyField
                        label="Custo nutrição + custos fixos (sem aquisição)"
                        value={activeResults.productionCost}
                        hint="Nutrição + custos digitados acima exceto aquisição (protocolo sanitário, ADM, rastreabilidade, mão de obra, maquinários, medicamentos, outros). Equivale ao custo de produção no confinamento."
                      />
                      <ReadOnlyCurrencyField
                        label="Soma custos fixos + nutrição"
                        value={fixedCostsPerAnimal(activeScenario) + activeResults.nutritionCost}
                        hint="Aquisição + demais custos fixos digitados + nutrição (= custo total por animal, mesma base dos gráficos de consumo e custo acumulado)."
                      />
                      <ReadOnlyCurrencyField
                        label="Custo da permanência (R$/dia)"
                        value={custoPermanenciaPorDia}
                        hint="(Soma custos fixos + nutrição − aquisição) ÷ dias de permanência. Representa o custo diário no confinamento sem a aquisição do animal."
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Custo total
                      </p>
                      <p className="text-xs text-slate-500 -mt-2">
                        Visão consolidada dos mesmos valores acima (referência rápida).
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ReadOnlyCurrencyField
                          label="Aquisição"
                          value={activeScenario.acquisitionCost}
                          hint="Valor digitado em Aquisição (custo do animal)."
                        />
                        <ReadOnlyCurrencyField
                          label="Custo nutrição (dietas)"
                          value={activeResults.nutritionCost}
                          hint="Mesmo total de nutrição do bloco anterior."
                        />
                        <ReadOnlyCurrencyField
                          label="Custo nutrição + custos fixos (sem aquisição)"
                          value={activeResults.productionCost}
                          hint="Produção no confinamento sem compra do animal."
                        />
                        <ReadOnlyCurrencyField
                          label="Soma custos fixos + nutrição"
                          value={fixedCostsPerAnimal(activeScenario) + activeResults.nutritionCost}
                          hint="Custo total por animal (inclui aquisição)."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mercado e nutrição (após Custo / Animal) */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <TrendingUp size={14} /> Mercado e nutrição
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl">
                  <InputGroup 
                    label="Preço da Arroba" 
                    value={activeScenario.arrobaPrice} 
                    onChange={(v) => updateParam(activeScenario.id, 'arrobaPrice', v)}
                    prefix="R$"
                    suffix="/@"
                  />
                  <ReadOnlyCurrencyField
                    label="Custo @ aquisição (PV entrada × 50% carcaça)"
                    value={mercadoIndices.custoArrobaAquisicao}
                    hint="Aquisição ÷ ((Peso entrada × 50%) ÷ 15). Custo por arroba equivalente à entrada."
                  />
                  <ReadOnlyCurrencyField
                    label="R$/kg — venda (Preço da @ ÷ 15)"
                    value={mercadoIndices.precoKgArrobaVenda}
                    hint="Preço da arroba de venda convertido em real por quilograma de carcaça."
                  />
                  <ReadOnlyCurrencyField
                    label="R$/kg — aquisição (Custo @ aquisição ÷ 15)"
                    value={mercadoIndices.precoKgAquisicaoDiv15}
                    hint="Custo da arroba na aquisição (PV entrada × 50% carcaça) dividido por 15 kg, em R$/kg."
                  />
                </div>
                <div className="col-span-full mt-6 pt-4 border-t border-slate-200 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Produção e carcaça
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ReadOnlyTextMetricField
                      label="Quantidade arrobas produzidas (@)"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.arrobasProduzidas, 3)} @`}
                      hint="((Peso abate × Rendimento%) − (Peso entrada × 50%)) ÷ 15. Rendimento em % do cenário."
                    />
                    <ReadOnlyTextMetricField
                      label="GMD carcaça"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.gmdCarcaca, 3)} kg/dia`}
                      hint="((Peso abate × Rendimento%) − (Peso entrada × 50%)) ÷ Permanência (dias)."
                    />
                    <ReadOnlyTextMetricField
                      label="Rendimento do ganho"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.rendimentoGanho, 2)} %`}
                      hint="((Peso abate × Rendimento%) − (Peso entrada × 50%)) ÷ (Peso abate − Peso entrada) × 100."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                    <ReadOnlyTextMetricField
                      label="Arroba inicial (@)"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.arrobaInicial, 3)} @`}
                      hint="(Peso entrada × 50%) ÷ 15."
                    />
                    <ReadOnlyTextMetricField
                      label="Arroba final (@)"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.arrobaFinal, 3)} @`}
                      hint="(Peso abate × Rendimento%) ÷ 15."
                    />
                    <ReadOnlyTextMetricField
                      label="Dias para produzir 1 @"
                      displayValue={`${formatNumber(metricasProducaoCarcaca.diasPorArroba, 2)} dias`}
                      hint="15 ÷ GMD carcaça (kg carcaça/dia)."
                    />
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <BarChart3 size={14} className="text-slate-400" />
                          Média de @ por dia (acumulado)
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                          Calcula-se a <strong>média de @ ganhas por dia</strong> no período (total de @ de ganho de
                          carcaça ÷ dias de permanência — mesma base das métricas: PV, GMD, rendimento% e 50% do PV na
                          entrada; último dia com peso de abate). O gráfico mostra o <strong>acumulado dessa média</strong>: dia 1 = 1× média, dia 2 = 2× média, e assim por diante (linha reta que fecha no total de @ ganhas no último dia).
                          {arrobasParaCustosSemAquisicao != null && (
                            <>
                              {' '}
                              Linha tracejada: quantas @ a <strong>{formatCurrency(activeScenario.arrobaPrice)}</strong>{' '}
                              seriam necessárias para cobrir{' '}
                              <strong>todos os custos exceto aquisição</strong> ({formatCurrency(activeResults.productionCost)} = nutrição +
                              demais).
                            </>
                          )}
                          {arrobasParaCustosSemAquisicao == null && activeScenario.arrobaPrice <= 0 && (
                            <> Defina preço da @ para ver a meta de @ que cobre custos sem aquisição.</>
                          )}
                          {metricasProducaoCarcaca.diasPorArroba > 0 && (
                            <>
                              {' '}
                              Referência: ~{' '}
                              <strong>{formatNumber(metricasProducaoCarcaca.diasPorArroba, 2)} dias</strong> para
                              produzir 1 @ de ganho (15 ÷ GMD carcaça).
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {cumulativeArrobasChartData.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">
                        Defina GMD e pesos para ver o acúmulo de @ por dia.
                      </p>
                    ) : (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={cumulativeArrobasChartData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="day"
                              stroke="#94a3b8"
                              fontSize={12}
                              label={{
                                value: 'Dia de permanência',
                                position: 'insideBottom',
                                offset: -4,
                                fill: '#94a3b8',
                                fontSize: 11,
                              }}
                            />
                            <YAxis
                              stroke="#94a3b8"
                              fontSize={12}
                              tickFormatter={(v) => formatNumber(v, 2)}
                              label={{
                                value: 'Acúmulo (média @/dia × dia)',
                                angle: -90,
                                position: 'insideLeft',
                                fill: '#94a3b8',
                                fontSize: 11,
                              }}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const row = payload[0].payload as {
                                  day: number;
                                  pesoVivoDia: number;
                                  mediaArrobasPorDia: number;
                                  arrobasAcumuladasAcumuloMedia: number;
                                  arrobasMetaCustosSemAquisicao?: number;
                                };
                                const meta = row.arrobasMetaCustosSemAquisicao;
                                return (
                                  <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md">
                                    <p className="font-medium text-slate-700">Dia {label}</p>
                                    <p className="text-amber-800 font-semibold">
                                      Acumulado: {formatNumber(row.arrobasAcumuladasAcumuloMedia, 4)} @
                                    </p>
                                    <p className="text-slate-600 text-xs">
                                      Média aplicada: {formatNumber(row.mediaArrobasPorDia, 4)} @/dia × {row.day}{' '}
                                      dias
                                    </p>
                                    {meta != null && (
                                      <p className="text-slate-700 text-xs mt-1 pt-1 border-t border-slate-100">
                                        Meta custos (sem aquisição):{' '}
                                        <span className="font-semibold text-slate-800">
                                          {formatNumber(meta, 3)} @
                                        </span>{' '}
                                        a {formatCurrency(activeScenario.arrobaPrice)}
                                      </p>
                                    )}
                                    <p className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-100">
                                      PV (fim do dia): {formatNumber(row.pesoVivoDia, 2)} kg
                                    </p>
                                  </div>
                                );
                              }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                              formatter={(value) => <span className="text-slate-600">{value}</span>}
                            />
                            <Line
                              type="monotone"
                              dataKey="arrobasAcumuladasAcumuloMedia"
                              name="Acúmulo (média @/dia)"
                              stroke="#d97706"
                              strokeWidth={3}
                              dot={
                                cumulativeArrobasChartData.length <= 120
                                  ? { r: 3, fill: '#d97706' }
                                  : false
                              }
                              activeDot={{ r: 5 }}
                            />
                            {arrobasParaCustosSemAquisicao != null && (
                              <Line
                                type="monotone"
                                dataKey="arrobasMetaCustosSemAquisicao"
                                name="@ para custos (sem aquisição)"
                                stroke="#475569"
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={false}
                                activeDot={false}
                                legendType="line"
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Consumo de matéria seca
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <ReadOnlyTextMetricField
                        label="Total MS (permanência)"
                        displayValue={`${formatNumber(metricasProducaoCarcaca.totalMs, 2)} kg`}
                        hint="Soma dia a dia da MS (dietas + GMD), já com pico do consumo e ajuste fino se estiverem ativos — o mesmo valor que fecha o gráfico de consumo."
                      />
                      <ReadOnlyTextMetricField
                        label="Conversão alimentar"
                        displayValue={formatNumber(metricasProducaoCarcaca.conversaoAlimentar, 3)}
                        hint="(Consumo total MS ÷ permanência) ÷ GMD (PV). kg MS/dia por kg PV ganho/dia."
                      />
                      <ReadOnlyTextMetricField
                        label="Eficiência alimentar"
                        displayValue={formatNumber(metricasProducaoCarcaca.eficienciaAlimentar, 3)}
                        hint="GMD (PV) ÷ (consumo total MS ÷ permanência)."
                      />
                      <ReadOnlyTextMetricField
                        label="Eficiência biológica"
                        displayValue={`${formatNumber(metricasProducaoCarcaca.eficienciaBiologica, 2)} kg MS/@`}
                        hint="Consumo total MS ÷ produção de arrobas ((PV abate×Rend%) − (PV entrada×50%)) ÷ 15."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sensitivity Analysis */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 size={20} className="text-slate-400" />
                Análise de Sensibilidade (Preço da @)
              </h2>
              <p className="text-sm text-slate-500 mt-1">Como o lucro varia conforme o preço de venda da arroba.</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <InputGroup label="Preço Mínimo" value={minPrice} onChange={setMinPrice} prefix="R$" />
                <InputGroup label="Preço Máximo" value={maxPrice} onChange={setMaxPrice} prefix="R$" />
                <InputGroup label="Passo" value={priceStep} onChange={setPriceStep} prefix="R$" />
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensitivityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="price" 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickFormatter={(v) => `R$ ${v}`}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickFormatter={(v) => `R$ ${v}`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), ""]}
                      labelFormatter={(label) => `Preço @: R$ ${label}`}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="lucro" 
                      name="Lucro/Animal" 
                      stroke="#ea580c" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#ea580c' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Custo acumulativo de nutrição por dia */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 size={20} className="text-slate-400" />
                Custo acumulativo de nutrição (por dia)
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Mesma simulação do gráfico de consumo: cada dia soma o custo da dieta ativa (GMD, % PV/dia,
                MS%); se houver <strong>pico do consumo</strong> e <strong>ajuste fino</strong>, a queda de
                MS/MN no período final reduz também este acumulado de custo.
              </p>
            </div>
            <div className="p-6">
              {cumulativeNutritionData.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">
                  Ajuste permanência (GMD e pesos) para ver a curva de custo diário.
                </p>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativeNutritionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="day"
                        stroke="#94a3b8"
                        fontSize={12}
                        tickFormatter={(v) => `${v}`}
                        label={{ value: 'Dia', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 11 }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickFormatter={(v) => `R$ ${v}`}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as CumulativeNutritionDayPoint;
                          return (
                            <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md">
                              <p className="font-medium text-slate-700">Dia {label}</p>
                              <p className="text-slate-600">
                                Custo no dia: {formatCurrency(row.custoDia)}
                              </p>
                              <p className="font-semibold text-orange-600">
                                Acumulado: {formatCurrency(row.acumulado)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-100">
                                MS no dia: {formatNumber(row.kgMsDia, 2)} kg · MN no dia:{' '}
                                {formatNumber(row.kgMnDia, 2)} kg
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="acumulado"
                        name="Custo acumulativo (nutrição)"
                        stroke="#ea580c"
                        strokeWidth={3}
                        dot={
                          cumulativeNutritionData.length <= 120
                            ? { r: 4, fill: '#ea580c' }
                            : false
                        }
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          {/* Consumo MS e MN acumulado */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 size={20} className="text-slate-400" />
                Consumo de matéria seca e matéria natural
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Curvas acumuladas (kg): MS conforme % PV/dia da dieta; MN = MS ÷ (MS% da dieta). Após o{' '}
                <strong>pico do consumo</strong>, o consumo diário cai em linha reta até o fim da permanência
                (<strong>ajuste fino</strong> em %). Esses parâmetros alimentam também o{' '}
                <strong>custo de nutrição</strong>, o <strong>gráfico de custo acumulado</strong> e o{' '}
                <strong>total de MS</strong> nas métricas — tudo no mesmo cálculo dia a dia.
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
                <InputGroup
                  label="Pico do consumo"
                  value={activeScenario.consumptionPeakDay}
                  onChange={(v) =>
                    updateParam(activeScenario.id, 'consumptionPeakDay', Math.max(0, Math.round(v)))
                  }
                  suffix="dias"
                  integer
                  hint="Dia em que o consumo está no máximo; a partir do dia seguinte começa a cair. Use 0 para desligar."
                />
                <InputGroup
                  label="Ajuste fino"
                  value={activeScenario.consumptionFineAdjustPct}
                  onChange={(v) =>
                    updateParam(
                      activeScenario.id,
                      'consumptionFineAdjustPct',
                      Math.min(100, Math.max(0, v))
                    )
                  }
                  suffix="%"
                  hint="Redução máxima no último dia: consumo vai de 100% até (100% − este valor), em linha reta após o pico."
                />
              </div>
              {cumulativeNutritionData.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">
                  Ajuste permanência (GMD e pesos) para ver o consumo acumulado.
                </p>
              ) : (
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativeNutritionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="day"
                        stroke="#94a3b8"
                        fontSize={12}
                        label={{ value: 'Dia', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 11 }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickFormatter={(v) => `${formatNumber(v, 0)}`}
                        label={{
                          value: 'kg (acumulado)',
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#94a3b8',
                          fontSize: 11,
                        }}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as CumulativeNutritionDayPoint;
                          return (
                            <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md">
                              <p className="font-medium text-slate-700">Dia {label}</p>
                              <p className="text-blue-600">
                                MS acumulada: {formatNumber(row.kgMsAcumulado, 2)} kg
                              </p>
                              <p className="text-teal-700">
                                MN acumulada: {formatNumber(row.kgMnAcumulado, 2)} kg
                              </p>
                              <p className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-100">
                                No dia: MS {formatNumber(row.kgMsDia, 2)} kg · MN{' '}
                                {formatNumber(row.kgMnDia, 2)} kg
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      {activeScenario.consumptionPeakDay > 0 &&
                        activeScenario.consumptionPeakDay <
                          effectivePermanenceDays(activeScenario) && (
                          <ReferenceLine
                            x={activeScenario.consumptionPeakDay}
                            stroke="#a78bfa"
                            strokeDasharray="5 5"
                            label={{
                              value: 'Pico consumo',
                              position: 'top',
                              fill: '#7c3aed',
                              fontSize: 10,
                            }}
                          />
                        )}
                      <Line
                        type="monotone"
                        dataKey="kgMsAcumulado"
                        name="MS acumulada (kg)"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={
                          cumulativeNutritionData.length <= 120
                            ? { r: 4, fill: '#2563eb' }
                            : false
                        }
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="kgMnAcumulado"
                        name="MN acumulada (kg)"
                        stroke="#0d9488"
                        strokeWidth={3}
                        dot={
                          cumulativeNutritionData.length <= 120
                            ? { r: 4, fill: '#0d9488' }
                            : false
                        }
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
          </>
          )}

          {appTab === 'comparar' && (
            <>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-slate-700 mb-2 compare-print-hide">
            <p className="font-medium text-orange-900">Cenário em foco</p>
            <p className="text-slate-600 mt-1">
              As pílulas acima definem o cenário do <strong>resumo</strong> à direita. Abaixo, compare até quatro
              cenários (detalhado + visão rápida de todos).
            </p>
          </div>
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden compare-print-avoid-break">
            <div className="p-6 border-b border-slate-100">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ArrowRightLeft size={20} className="text-slate-400" />
                    Comparativo (até 4 cenários)
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Selecione até quatro cenários para comparar peso, consumo, mercado e financeiro na mesma vista,
                    com gráficos de MS, MN e custo de nutrição acumulados por dia.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrintCompare}
                  disabled={compareItems.length === 0}
                  title={compareItems.length === 0 ? 'Selecione ao menos um cenário para imprimir' : undefined}
                  className="compare-print-hide shrink-0 inline-flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Printer size={18} className="text-slate-500" />
                  Imprimir
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 compare-print-hide">
                {([0, 1, 2, 3] as const).map((idx) => (
                  <div key={idx}>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                      Cenário {idx + 1}
                    </label>
                    <select
                      value={compareSlotScenarioIds[idx] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCompareSlot(idx, v === '' ? null : v);
                      }}
                      className="w-full border border-slate-200 rounded-lg py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      <option value="">— Nenhum —</option>
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            {compareItems.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10 px-6">
                Escolha pelo menos um cenário nos menus acima para ver a tabela e os gráficos.
              </p>
            ) : (
              <div className="p-6 space-y-10">
                <div className="overflow-x-auto rounded-xl border border-slate-100 compare-print-avoid-break">
                  <table className="w-full text-left text-sm border-collapse min-w-[720px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="px-4 py-3 w-44">Métrica</th>
                        {compareItems.map((it) => (
                          <th key={it.key} className="px-4 py-3 min-w-[120px]">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: it.color }}
                              />
                              <span className="font-semibold text-slate-700 normal-case tracking-normal line-clamp-2">
                                {it.params.name}
                              </span>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-slate-100/80">
                        <td
                          colSpan={1 + compareItems.length}
                          className="px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider"
                        >
                          Peso e permanência
                        </td>
                      </tr>
                      {(
                        [
                          {
                            label: 'Peso entrada (kg)',
                            cell: (it: CompareRowItem) => formatNumber(it.params.entryWeight, 2),
                          },
                          {
                            label: 'Peso abate (kg)',
                            cell: (it: CompareRowItem) => formatNumber(it.params.exitWeight, 2),
                          },
                          {
                            label: 'Rendimento carcaça (%)',
                            cell: (it: CompareRowItem) => formatNumber(it.params.carcassYield, 2),
                          },
                          {
                            label: 'GMD PV (kg/dia)',
                            cell: (it: CompareRowItem) => formatNumber(it.params.gmd, 3),
                          },
                          {
                            label: 'Dias permanência',
                            cell: (it: CompareRowItem) =>
                              formatNumber(effectivePermanenceDays(it.params), 0),
                          },
                          {
                            label: 'Cabeças (lote)',
                            cell: (it: CompareRowItem) => formatNumber(it.params.numAnimals, 0),
                          },
                          {
                            label: '@ final (animal)',
                            cell: (it: CompareRowItem) =>
                              formatNumber(
                                metricasPesoResumo(it.params, it.results.totalMsConsumption).arrobaFinal,
                                3
                              ),
                          },
                        ]
                      ).map((row) => (
                        <tr key={row.label} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                          {compareItems.map((it) => (
                            <td key={it.key} className="px-4 py-2.5 font-medium text-slate-800 tabular-nums">
                              {row.cell(it)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-slate-100/80">
                        <td
                          colSpan={1 + compareItems.length}
                          className="px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider"
                        >
                          Consumo
                        </td>
                      </tr>
                      {(
                        [
                          {
                            label: 'Total MS (kg)',
                            cell: (it: CompareRowItem) =>
                              formatNumber(consumptionTotalsFromSeries(it.series).totalMsKg, 2),
                          },
                          {
                            label: 'Total MN (kg)',
                            cell: (it: CompareRowItem) =>
                              formatNumber(consumptionTotalsFromSeries(it.series).totalMnKg, 2),
                          },
                          {
                            label: 'Pico consumo (dia)',
                            cell: (it: CompareRowItem) =>
                              it.params.consumptionPeakDay > 0
                                ? formatNumber(it.params.consumptionPeakDay, 0)
                                : '—',
                          },
                          {
                            label: 'Ajuste fino (%)',
                            cell: (it: CompareRowItem) =>
                              it.params.consumptionFineAdjustPct > 0
                                ? `${formatNumber(it.params.consumptionFineAdjustPct, 2)}%`
                                : '—',
                          },
                          {
                            label: '% PV/dia (dieta 1)',
                            cell: (it: CompareRowItem) =>
                              `${formatNumber(it.params.dietConsumptionPct[0], 2)}%`,
                          },
                          {
                            label: 'Conversão alimentar',
                            cell: (it: CompareRowItem) =>
                              formatNumber(
                                metricasPesoResumo(it.params, it.results.totalMsConsumption)
                                  .conversaoAlimentar,
                                3
                              ),
                          },
                          {
                            label: 'Eficiência alimentar',
                            cell: (it: CompareRowItem) =>
                              formatNumber(
                                metricasPesoResumo(it.params, it.results.totalMsConsumption)
                                  .eficienciaAlimentar,
                                3
                              ),
                          },
                        ]
                      ).map((row) => (
                        <tr key={row.label} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                          {compareItems.map((it) => (
                            <td key={it.key} className="px-4 py-2.5 font-medium text-slate-800 tabular-nums">
                              {row.cell(it)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-slate-100/80">
                        <td
                          colSpan={1 + compareItems.length}
                          className="px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider"
                        >
                          Mercado
                        </td>
                      </tr>
                      {(
                        [
                          {
                            label: 'Preço @ venda',
                            cell: (it: CompareRowItem) => formatCurrency(it.params.arrobaPrice),
                          },
                          {
                            label: 'Custo @ aquisição',
                            cell: (it: CompareRowItem) =>
                              formatCurrency(mercadoIndicesFromParams(it.params).custoArrobaAquisicao),
                          },
                          {
                            label: 'R$/kg venda (÷15)',
                            cell: (it: CompareRowItem) =>
                              formatCurrency(mercadoIndicesFromParams(it.params).precoKgArrobaVenda),
                          },
                        ]
                      ).map((row) => (
                        <tr key={row.label} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                          {compareItems.map((it) => (
                            <td key={it.key} className="px-4 py-2.5 font-medium text-slate-800 tabular-nums">
                              {row.cell(it)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-slate-100/80">
                        <td
                          colSpan={1 + compareItems.length}
                          className="px-4 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider"
                        >
                          Financeiro
                        </td>
                      </tr>
                      {(
                        [
                          {
                            label: 'Custo nutrição',
                            cell: (it: CompareRowItem) => formatCurrency(it.results.nutritionCost),
                          },
                          {
                            label: 'Custo total / animal',
                            cell: (it: CompareRowItem) => formatCurrency(it.results.totalCostPerAnimal),
                          },
                          {
                            label: 'Receita / animal',
                            cell: (it: CompareRowItem) => formatCurrency(it.results.revenuePerAnimal),
                          },
                          {
                            label: 'Lucro / animal',
                            cell: (it: CompareRowItem) => (
                              <span
                                className={cn(
                                  it.results.profitPerAnimal >= 0 ? 'text-green-600' : 'text-red-600'
                                )}
                              >
                                {formatCurrency(it.results.profitPerAnimal)}
                              </span>
                            ),
                          },
                          {
                            label: 'Margem %',
                            cell: (it: CompareRowItem) => `${formatNumber(it.results.profitMargin, 2)}%`,
                          },
                          {
                            label: 'Lucro lote',
                            cell: (it: CompareRowItem) => (
                              <span
                                className={cn(
                                  it.results.totalLotProfit >= 0 ? 'text-green-600' : 'text-red-600'
                                )}
                              >
                                {formatCurrency(it.results.totalLotProfit)}
                              </span>
                            ),
                          },
                          {
                            label: 'Ponto equilíbrio /@',
                            cell: (it: CompareRowItem) => formatCurrency(it.results.breakEvenPerArroba),
                          },
                        ]
                      ).map((row) => (
                        <tr key={row.label} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                          {compareItems.map((it) => (
                            <td key={it.key} className="px-4 py-2.5 font-medium text-slate-800 tabular-nums">
                              {row.cell(it)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-8">
                  <div className="compare-print-avoid-break">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                      MS acumulada (kg) — por dia
                    </h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareChartMs} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tickFormatter={(v) => formatNumber(v, 0)}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md max-w-xs">
                                  <p className="font-medium text-slate-700 mb-1">Dia {label}</p>
                                  {payload
                                    .filter((p) => p.value != null && p.name)
                                    .map((p) => (
                                      <p key={String(p.dataKey)} className="text-xs" style={{ color: p.color }}>
                                        {p.name}: {formatNumber(Number(p.value), 2)} kg
                                      </p>
                                    ))}
                                </div>
                              );
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {compareItems.map((it) => (
                            <Line
                              key={it.key}
                              type="monotone"
                              dataKey={it.key}
                              name={it.params.name.length > 22 ? `${it.params.name.slice(0, 22)}…` : it.params.name}
                              stroke={it.color}
                              strokeWidth={2}
                              dot={compareChartMs.length <= 100 ? { r: 2 } : false}
                              connectNulls={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="compare-print-avoid-break">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                      MN acumulada (kg) — por dia
                    </h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareChartMn} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tickFormatter={(v) => formatNumber(v, 0)}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md max-w-xs">
                                  <p className="font-medium text-slate-700 mb-1">Dia {label}</p>
                                  {payload
                                    .filter((p) => p.value != null && p.name)
                                    .map((p) => (
                                      <p key={String(p.dataKey)} className="text-xs" style={{ color: p.color }}>
                                        {p.name}: {formatNumber(Number(p.value), 2)} kg
                                      </p>
                                    ))}
                                </div>
                              );
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {compareItems.map((it) => (
                            <Line
                              key={it.key}
                              type="monotone"
                              dataKey={it.key}
                              name={it.params.name.length > 22 ? `${it.params.name.slice(0, 22)}…` : it.params.name}
                              stroke={it.color}
                              strokeWidth={2}
                              dot={compareChartMn.length <= 100 ? { r: 2 } : false}
                              connectNulls={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="compare-print-avoid-break">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                      Custo nutrição acumulado (R$) — por dia
                    </h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareChartCusto} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tickFormatter={(v) => `R$ ${formatNumber(v, 0)}`}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md max-w-xs">
                                  <p className="font-medium text-slate-700 mb-1">Dia {label}</p>
                                  {payload
                                    .filter((p) => p.value != null && p.name)
                                    .map((p) => (
                                      <p key={String(p.dataKey)} className="text-xs" style={{ color: p.color }}>
                                        {p.name}: {formatCurrency(Number(p.value))}
                                      </p>
                                    ))}
                                </div>
                              );
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {compareItems.map((it) => (
                            <Line
                              key={it.key}
                              type="monotone"
                              dataKey={it.key}
                              name={it.params.name.length > 22 ? `${it.params.name.slice(0, 22)}…` : it.params.name}
                              stroke={it.color}
                              strokeWidth={2}
                              dot={compareChartCusto.length <= 100 ? { r: 2 } : false}
                              connectNulls={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
          {/* Comparison Table */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden compare-print-avoid-break">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ArrowRightLeft size={20} className="text-slate-400" />
                Comparação de Cenários
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Cenário</th>
                    <th className="px-6 py-4">Preço @</th>
                    <th className="px-6 py-4">Dias</th>
                    <th className="px-6 py-4">Custo/Animal</th>
                    <th className="px-6 py-4">Lucro/Animal</th>
                    <th className="px-6 py-4">Margem %</th>
                    <th className="px-6 py-4">Lucro Lote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map(({ params, results: res }) => (
                    <tr 
                      key={params.id} 
                      className={cn(
                        "hover:bg-slate-50 transition-colors cursor-pointer",
                        activeScenarioId === params.id && "bg-orange-50/30"
                      )}
                      onClick={() => setActiveScenarioId(params.id)}
                    >
                      <td className="px-6 py-4 font-medium flex items-center gap-2">
                        {params.name}
                        <div className="flex gap-1">
                          {params.id === bestProfitScenarioId && (
                            <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shadow-sm border border-green-200">
                              <Star size={10} fill="currentColor" /> Lucro
                            </span>
                          )}
                          {params.id === bestMarginScenarioId && (
                            <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shadow-sm border border-blue-200">
                              <Star size={10} fill="currentColor" /> Margem
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">{formatCurrency(params.arrobaPrice)}</td>
                      <td className="px-6 py-4">
                        {formatNumber(effectivePermanenceDays(params), 0)}
                      </td>
                      <td className="px-6 py-4">{formatCurrency(res.totalCostPerAnimal)}</td>
                      <td className={cn(
                        "px-6 py-4 font-semibold",
                        res.profitPerAnimal >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(res.profitPerAnimal)}
                      </td>
                      <td className="px-6 py-4">{formatNumber(res.profitMargin)}%</td>
                      <td className={cn(
                        "px-6 py-4 font-bold",
                        res.totalLotProfit >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(res.totalLotProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </>
          )}
        </div>

        {/* Right Column: Summary Panel */}
        <div className="lg:col-span-4 space-y-6 compare-print-sidebar">
          <div className="sticky top-32 space-y-6">
            <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl shadow-slate-200 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <TrendingUp size={120} />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Resumo do Cenário</span>
                  <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                    {appTab === 'comparar' ? 'Em foco' : 'Ativo'}
                  </span>
                </div>
                
                <h3 className="text-2xl font-bold mb-8">{activeScenario.name}</h3>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-slate-400 text-sm mb-1">Lucro por Animal</p>
                    <p className={cn(
                      "text-3xl font-bold",
                      activeResults.profitPerAnimal >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {formatCurrency(activeResults.profitPerAnimal)}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-slate-400 text-xs mb-1">Lucro Total Lote</p>
                      <p className={cn(
                        "text-lg font-bold",
                        activeResults.totalLotProfit >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {formatCurrency(activeResults.totalLotProfit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs mb-1">Margem de Lucro</p>
                      <p className="text-lg font-bold">{formatNumber(activeResults.profitMargin)}%</p>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400 text-sm">Custo Médio por @</span>
                      <span
                        className="font-bold"
                        title="(Custo total no confinamento − aquisição) ÷ @ produzidas = custos operacionais + nutrição ÷ arrobas no abate."
                      >
                        {formatCurrency(activeResults.avgCostPerArroba)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400 text-sm">Receita por Animal</span>
                      <span className="font-bold">{formatCurrency(activeResults.revenuePerAnimal)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400 text-sm">Custo Total Animal</span>
                      <span className="font-bold">{formatCurrency(activeResults.totalCostPerAnimal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Ponto de equilíbrio</span>
                      <span className="font-bold" title="(Aquisição + nutrição + outros custos) ÷ @ final">
                        {formatCurrency(activeResults.breakEvenPerArroba)}
                        <span className="text-slate-500 font-normal text-xs ml-1">/@</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={18} className="text-slate-400" />
                Detalhamento de Custos
              </h3>
              {costBreakdownPie.total <= 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Sem custo total para exibir.</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <div className="h-[220px] w-full sm:w-[220px] sm:shrink-0 mx-auto sm:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={costBreakdownPie.data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={88}
                          paddingAngle={1}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {costBreakdownPie.data.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-3 min-w-0">
                    {costBreakdownPie.rows.map((row) => {
                      const pct =
                        costBreakdownPie.total > 0
                          ? (row.value / costBreakdownPie.total) * 100
                          : 0;
                      return (
                        <li key={row.name} className="flex items-center gap-3 text-sm">
                          <span
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: row.fill }}
                            aria-hidden
                          />
                          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-slate-600">{row.name}</span>
                            <span className="font-medium text-slate-800 tabular-nums">
                              {formatCurrency(row.value)}{' '}
                              <span className="text-slate-500 font-normal">
                                ({formatNumber(pct, 1)}%)
                              </span>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>

            <AzureSimulacoesPanel
              activeScenario={activeScenario}
              activeResults={activeResults}
              onImported={(scenario) => {
                setScenarios((prev) => [...prev, scenario]);
                setActiveScenarioId(scenario.id);
              }}
            />
          </div>
        </div>
      </main>

      {/* Floating Summary for Mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 flex items-center justify-between z-40 border-t border-slate-800 compare-print-mobile-summary">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Lucro Lote</p>
          <p className={cn(
            "text-lg font-bold",
            activeResults.totalLotProfit >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {formatCurrency(activeResults.totalLotProfit)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Margem</p>
          <p className="text-lg font-bold">{formatNumber(activeResults.profitMargin)}%</p>
        </div>
      </div>
    </div>
  );
}

function roundToDecimals(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Exibição em pt-BR sem separador de milhar (campos editáveis). */
function formatDecimalField(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
}

function parseDecimalFieldInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function ReadOnlyCurrencyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
        {label}
      </span>
      <div className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-semibold text-slate-800 shadow-sm">
        {formatCurrency(value)}
      </div>
      {hint && <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  );
}

function ReadOnlyTextMetricField({
  label,
  displayValue,
  hint,
}: {
  label: string;
  displayValue: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
        {label}
      </span>
      <div className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-semibold text-slate-800 shadow-sm">
        {displayValue}
      </div>
      {hint && <p className="text-[10px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  );
}

function InputGroup({ 
  label, 
  value, 
  onChange, 
  prefix, 
  suffix,
  className,
  readOnly,
  hint,
  integer,
  fractionDigits,
}: { 
  label: string; 
  value: number; 
  onChange: (val: number) => void;
  prefix?: string;
  suffix?: string;
  className?: string;
  readOnly?: boolean;
  hint?: string;
  integer?: boolean;
  fractionDigits?: number;
}) {
  const step =
    integer ? 1 : fractionDigits !== undefined ? 10 ** -fractionDigits : 'any';
  const useDecimalText = fractionDigits !== undefined && !integer;
  const [decimalDraft, setDecimalDraft] = useState<string | null>(null);
  const decimalFocused = useRef(false);

  useEffect(() => {
    if (!useDecimalText || decimalFocused.current) return;
    setDecimalDraft(null);
  }, [value, useDecimalText]);

  const displayNumber =
    !Number.isFinite(value) ? '' : integer ? Math.round(value) : value;

  const handleChange = (raw: string) => {
    if (raw === '' || raw === '-') {
      onChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    if (integer) {
      onChange(Math.max(0, Math.round(parsed)));
      return;
    }
    if (fractionDigits !== undefined) {
      onChange(roundToDecimals(parsed, fractionDigits));
      return;
    }
    onChange(parsed);
  };

  const decimalInputValue =
    decimalDraft !== null
      ? decimalDraft
      : formatDecimalField(value, fractionDigits ?? 0);

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block text-center w-full">
        {label}
      </label>
      <div className="relative flex items-center group">
        {prefix && (
          <span className="absolute left-3 text-slate-400 text-sm font-medium group-focus-within:text-orange-500 transition-colors z-10">
            {prefix}
          </span>
        )}
        {useDecimalText ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={readOnly ? formatDecimalField(value, fractionDigits!) : decimalInputValue}
            readOnly={readOnly}
            onFocus={() => {
              if (readOnly) return;
              decimalFocused.current = true;
              setDecimalDraft(formatDecimalField(value, fractionDigits!));
            }}
            onChange={(e) => {
              if (readOnly) return;
              setDecimalDraft(e.target.value);
            }}
            onBlur={() => {
              if (readOnly) return;
              decimalFocused.current = false;
              const n = parseDecimalFieldInput(decimalDraft ?? '');
              if (n === null) onChange(0);
              else onChange(roundToDecimals(n, fractionDigits!));
              setDecimalDraft(null);
            }}
            className={cn(
              'w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-medium text-center focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all shadow-sm',
              prefix && 'pl-9',
              suffix && 'pr-12',
              readOnly && 'bg-slate-50 text-slate-700 cursor-default focus:ring-0'
            )}
          />
        ) : (
          <input
            type="number"
            step={step}
            value={displayNumber === '' ? '' : displayNumber}
            readOnly={readOnly}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              'w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-sm font-medium text-center focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              prefix && 'pl-9',
              suffix && 'pr-12',
              readOnly && 'bg-slate-50 text-slate-700 cursor-default focus:ring-0'
            )}
          />
        )}
        {suffix && (
          <span className="absolute right-3 text-slate-400 text-xs font-medium group-focus-within:text-orange-500 transition-colors pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-slate-400 leading-tight text-center px-1">{hint}</p>
      )}
    </div>
  );
}

