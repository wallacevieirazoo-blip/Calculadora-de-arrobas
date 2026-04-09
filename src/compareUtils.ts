import type {
  ScenarioParameters,
  ScenarioResults,
  CumulativeNutritionDayPoint,
} from './types';
import { effectivePermanenceDays } from './types';

export function mercadoIndicesFromParams(params: ScenarioParameters) {
  const aq = params.acquisitionCost;
  const pvEntrada = params.entryWeight;
  const precoArroba = params.arrobaPrice;
  const carcassaEntradaKg = pvEntrada * 0.5;
  const arrobasEquivalentesEntrada = carcassaEntradaKg / 15;
  const custoArrobaAquisicao =
    arrobasEquivalentesEntrada > 0 ? aq / arrobasEquivalentesEntrada : 0;
  return {
    custoArrobaAquisicao,
    precoKgArrobaVenda: precoArroba / 15,
    precoKgAquisicaoDiv15: custoArrobaAquisicao / 15,
  };
}

export interface CompareConsumptionMetrics {
  totalMsKg: number;
  totalMnKg: number;
}

export function consumptionTotalsFromSeries(
  series: CumulativeNutritionDayPoint[]
): CompareConsumptionMetrics {
  const last = series[series.length - 1];
  return {
    totalMsKg: last?.kgMsAcumulado ?? 0,
    totalMnKg: last?.kgMnAcumulado ?? 0,
  };
}

export function mergeCompareNutritionByDay(
  items: { key: string; series: CumulativeNutritionDayPoint[] }[],
  field: 'kgMsAcumulado' | 'kgMnAcumulado' | 'acumulado'
): Array<{ day: number } & Record<string, number | null>> {
  const maxDay = Math.max(0, ...items.map((i) => i.series.length));
  const data: Array<{ day: number } & Record<string, number | null>> = [];
  for (let d = 1; d <= maxDay; d++) {
    const row: { day: number } & Record<string, number | null> = { day: d };
    for (const it of items) {
      row[it.key] = it.series[d - 1]?.[field] ?? null;
    }
    data.push(row);
  }
  return data;
}

export function metricasPesoResumo(params: ScenarioParameters, totalMs: number) {
  const pe = params.entryWeight;
  const pa = params.exitWeight;
  const rend = params.carcassYield / 100;
  const kgCarcAbate = pa * rend;
  const kgCarcEntrada50 = pe * 0.5;
  const deltaKgCarc = kgCarcAbate - kgCarcEntrada50;
  const dias = effectivePermanenceDays(params);
  const arrobasProduzidas = deltaKgCarc / 15;
  const gmdCarcaca = dias > 0 ? deltaKgCarc / dias : 0;
  const ganhoPv = pa - pe;
  const rendimentoGanho = ganhoPv !== 0 ? (deltaKgCarc / ganhoPv) * 100 : 0;
  const arrobaInicial = (pe * 0.5) / 15;
  const arrobaFinal = (pa * rend) / 15;
  const diasPorArroba = gmdCarcaca > 0 ? 15 / gmdCarcaca : 0;
  const msMediaDiaria = dias > 0 ? totalMs / dias : 0;
  const gmdPv = params.gmd > 0 ? params.gmd : 0;
  const conversaoAlimentar =
    gmdPv > 0 && dias > 0 ? (totalMs / dias) / gmdPv : 0;
  const eficienciaAlimentar =
    msMediaDiaria > 0 && gmdPv > 0 ? gmdPv / msMediaDiaria : 0;
  const eficienciaBiologica =
    arrobasProduzidas !== 0 ? totalMs / arrobasProduzidas : 0;
  return {
    dias,
    arrobaInicial,
    arrobaFinal,
    diasPorArroba,
    conversaoAlimentar,
    eficienciaAlimentar,
    eficienciaBiologica,
    rendimentoGanho,
  };
}

export type CompareRowItem = {
  slot: number;
  key: string;
  color: string;
  params: ScenarioParameters;
  results: ScenarioResults;
  series: CumulativeNutritionDayPoint[];
};
