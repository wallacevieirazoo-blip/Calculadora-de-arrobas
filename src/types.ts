const DIET_SLOTS = 6 as const;

export type DietSlotArray = [number, number, number, number, number, number];

export interface ScenarioParameters {
  id: string;
  name: string;
  numAnimals: number;
  /** Mantido para compatibilidade; permanência efetiva vem de GMD quando gmd > 0 */
  days: number;
  /** Ganho médio diário (kg/dia) */
  gmd: number;
  entryWeight: number;
  exitWeight: number;
  carcassYield: number;
  msConsumptionPerDay: number;
  arrobaPrice: number;
  msPrice: number;
  /** Quantidade de dietas em uso (1–6) */
  numDiets: number;
  dietDays: DietSlotArray;
  dietCostPerKg: DietSlotArray;
  /** % do peso vivo médio por dia (consumo de MS) */
  dietConsumptionPct: DietSlotArray;
  /** Matéria seca da dieta (% MN); custo/kg refere-se à ração natural */
  dietMsPct: DietSlotArray;
  acquisitionCost: number;
  /** Custo protocolo sanitário */
  sanitaryCost: number;
  adminCost: number;
  traceabilityCost: number;
  laborCost: number;
  machineryCost: number;
  medicationsCost: number;
  otherCosts: number;
  /** Dia em que o consumo está no pico; após esse dia reduz. 0 = desligado */
  consumptionPeakDay: number;
  /** % de redução máxima no último dia da permanência (linear após o pico) */
  consumptionFineAdjustPct: number;
}

/** Dias de permanência (inteiro): arredonda o resultado de (Peso abate − Peso entrada) ÷ GMD */
export function effectivePermanenceDays(params: ScenarioParameters): number {
  let raw = 0;
  if (params.gmd > 0) {
    raw = Math.max(0, (params.exitWeight - params.entryWeight) / params.gmd);
  } else {
    raw = Math.max(0, params.days);
  }
  return Math.round(raw);
}

function emptyDietSlots(): DietSlotArray {
  return [0, 0, 0, 0, 0, 0];
}

export interface ScenarioResults {
  arrobasProduced: number;
  totalMsConsumption: number;
  nutritionCost: number;
  productionCost: number;
  totalCostPerAnimal: number;
  /** Custo do confinamento (sem aquisição) ÷ @ produzidas no abate */
  avgCostPerArroba: number;
  /** (Aquisição + nutrição + demais custos de produção) ÷ arrobas finais do animal */
  breakEvenPerArroba: number;
  revenuePerAnimal: number;
  profitPerAnimal: number;
  profitMargin: number;
  totalLotCost: number;
  totalLotRevenue: number;
  totalLotProfit: number;
}

/**
 * Multiplicador do consumo diário após o pico: do dia seguinte ao pico até o último dia,
 * cai linearmente de 1 até (1 − fineAdjustPct/100).
 */
export function peakConsumptionMultiplier(
  day1: number,
  perm: number,
  peakDay: number,
  fineAdjustPct: number
): number {
  if (fineAdjustPct <= 0 || peakDay <= 0) return 1;
  if (perm <= peakDay) return 1;
  if (day1 <= peakDay) return 1;
  const postSpan = perm - peakDay;
  const daysAfter = day1 - peakDay;
  const t = Math.min(Math.max(daysAfter / postSpan, 0), 1);
  const mult = 1 - (fineAdjustPct / 100) * t;
  return Math.max(mult, 0.01);
}

/**
 * Totais de nutrição = soma dia a dia (igual ao gráfico), incluindo pico/ajuste fino.
 */
export function calculateNutritionFromDiets(params: ScenarioParameters): {
  totalMsConsumption: number;
  nutritionCost: number;
} {
  const series = computeCumulativeNutritionSeries(params);
  if (series.length === 0) return { totalMsConsumption: 0, nutritionCost: 0 };
  const last = series[series.length - 1];
  return {
    totalMsConsumption: last.kgMsAcumulado,
    nutritionCost: last.acumulado,
  };
}

export interface CumulativeNutritionDayPoint {
  day: number;
  /** Custo de nutrição apenas neste dia */
  custoDia: number;
  /** Soma de custoDia do dia 1 até este dia */
  acumulado: number;
  /** kg MS consumidos no dia */
  kgMsDia: number;
  /** kg matéria natural (ração) no dia */
  kgMnDia: number;
  /** MS acumulada desde o dia 1 (kg) */
  kgMsAcumulado: number;
  /** MN acumulada desde o dia 1 (kg) */
  kgMnAcumulado: number;
}

/** Acúmulo de @ de carcaça ganhas dia a dia (referência = 50% do PV de entrada, igual às métricas de produção). */
export interface CumulativeArrobasDayPoint {
  day: number;
  pesoVivoDia: number;
  /** @ ganhas acumuladas desde a referência de entrada */
  arrobasAcumuladas: number;
  /** Incremento de @ neste dia */
  arrobasNoDia: number;
}

/**
 * Para cada dia: PV projetado (GMD) × rendimento% − carcaça ref. (50% PV entrada) → @ acumuladas.
 * No último dia usa o peso de abate do cenário para fechar com as mesmas @ produzidas exibidas.
 */
export function computeCumulativeArrobasSeries(
  params: ScenarioParameters
): CumulativeArrobasDayPoint[] {
  const perm = effectivePermanenceDays(params);
  const pe = params.entryWeight;
  const pa = params.exitWeight;
  const rend = params.carcassYield / 100;
  const kgCarcRef = pe * 0.5;

  const arrobasFromPv = (pv: number) => Math.max(0, (pv * rend - kgCarcRef) / 15);

  const out: CumulativeArrobasDayPoint[] = [];
  if (perm <= 0) return out;

  const gmd = params.gmd > 0 ? params.gmd : 0;

  if (gmd <= 0) {
    const total = arrobasFromPv(pa);
    let prevAcum = 0;
    for (let d = 1; d <= perm; d++) {
      const frac = perm > 0 ? d / perm : 1;
      const pv = pe + (pa - pe) * frac;
      const acum = total * frac;
      out.push({
        day: d,
        pesoVivoDia: pv,
        arrobasAcumuladas: acum,
        arrobasNoDia: acum - prevAcum,
      });
      prevAcum = acum;
    }
    return out;
  }

  let prevAcum = 0;
  for (let d = 1; d <= perm; d++) {
    const pv = d === perm ? pa : pe + gmd * d;
    const acum = arrobasFromPv(pv);
    out.push({
      day: d,
      pesoVivoDia: pv,
      arrobasAcumuladas: acum,
      arrobasNoDia: acum - prevAcum,
    });
    prevAcum = acum;
  }
  return out;
}

function dietIndexForDay(dayIndex0: number, params: ScenarioParameters, nDiets: number): number {
  let boundary = 0;
  for (let i = 0; i < nDiets - 1; i++) {
    boundary += params.dietDays[i] ?? 0;
    if (dayIndex0 < boundary) return i;
  }
  return nDiets - 1;
}

/**
 * Dia a dia: PV médio × (% PV/dia da dieta) → kg MS base; após o dia de pico aplica
 * peakConsumptionMultiplier (redução linear até o fim da permanência).
 */
export function computeCumulativeNutritionSeries(
  params: ScenarioParameters
): CumulativeNutritionDayPoint[] {
  const perm = effectivePermanenceDays(params);
  const gmd = params.gmd > 0 ? params.gmd : 0;
  const nDiets = Math.min(DIET_SLOTS, Math.max(1, Math.floor(params.numDiets) || 1));
  const peakDay = params.consumptionPeakDay ?? 0;
  const finePct = params.consumptionFineAdjustPct ?? 0;
  const series: CumulativeNutritionDayPoint[] = [];
  let acumulado = 0;
  let kgMsAcumulado = 0;
  let kgMnAcumulado = 0;

  for (let d = 1; d <= perm; d++) {
    const dayIdx0 = d - 1;
    const i = dietIndexForDay(dayIdx0, params, nDiets);
    const pctPvDia = (params.dietConsumptionPct[i] ?? 0) / 100;
    const msFrac = Math.max(0.0001, (params.dietMsPct[i] ?? 100) / 100);
    const wStart = params.entryWeight + gmd * dayIdx0;
    const wEnd = params.entryWeight + gmd * (dayIdx0 + 1);
    const pesoMedioDia = (wStart + wEnd) / 2;
    const baseKgMs = pesoMedioDia * pctPvDia;
    const mult = peakConsumptionMultiplier(d, perm, peakDay, finePct);
    const kgMsDia = baseKgMs * mult;
    const kgMnDia = kgMsDia / msFrac;
    const custoDia = kgMnDia * (params.dietCostPerKg[i] ?? 0);
    acumulado += custoDia;
    kgMsAcumulado += kgMsDia;
    kgMnAcumulado += kgMnDia;
    series.push({
      day: d,
      custoDia,
      acumulado,
      kgMsDia,
      kgMnDia,
      kgMsAcumulado,
      kgMnAcumulado,
    });
  }

  return series;
}

/** Custos fixos operacionais por animal (sem aquisição e sem nutrição). */
export function fixedOperationalCostsPerAnimal(params: ScenarioParameters): number {
  return (
    params.sanitaryCost +
    params.adminCost +
    params.traceabilityCost +
    params.laborCost +
    params.machineryCost +
    params.medicationsCost +
    params.otherCosts
  );
}

/** Soma dos custos fixos por animal (sem nutrição). */
export function fixedCostsPerAnimal(params: ScenarioParameters): number {
  return (
    params.acquisitionCost +
    params.sanitaryCost +
    params.traceabilityCost +
    params.adminCost +
    params.laborCost +
    params.machineryCost +
    params.medicationsCost +
    params.otherCosts
  );
}

export const calculateScenario = (params: ScenarioParameters): ScenarioResults => {
  const arrobasProduced = (params.exitWeight * params.carcassYield / 100) / 15;

  const { totalMsConsumption, nutritionCost } = calculateNutritionFromDiets(params);

  const productionCost =
    nutritionCost +
    params.sanitaryCost +
    params.adminCost +
    params.traceabilityCost +
    params.laborCost +
    params.machineryCost +
    params.medicationsCost +
    params.otherCosts;
    
  const totalCostPerAnimal = params.acquisitionCost + productionCost;
  const avgCostPerArroba =
    arrobasProduced > 0 ? productionCost / arrobasProduced : 0;
  const outrosCustosProducao = productionCost - nutritionCost;
  const custoTotalEquilibrio =
    params.acquisitionCost + nutritionCost + outrosCustosProducao;
  const breakEvenPerArroba =
    arrobasProduced > 0 ? custoTotalEquilibrio / arrobasProduced : 0;

  const revenuePerAnimal = arrobasProduced * params.arrobaPrice;
  const profitPerAnimal = revenuePerAnimal - totalCostPerAnimal;
  const profitMargin = (profitPerAnimal / revenuePerAnimal) * 100;
  
  return {
    arrobasProduced,
    totalMsConsumption,
    nutritionCost,
    productionCost,
    totalCostPerAnimal,
    avgCostPerArroba,
    breakEvenPerArroba,
    revenuePerAnimal,
    profitPerAnimal,
    profitMargin,
    totalLotCost: totalCostPerAnimal * params.numAnimals,
    totalLotRevenue: revenuePerAnimal * params.numAnimals,
    totalLotProfit: profitPerAnimal * params.numAnimals,
  };
};

export const defaultParameters: ScenarioParameters = {
  id: 'default',
  name: 'Cenário Padrão',
  numAnimals: 100,
  days: 90,
  gmd: (550 - 400) / 90,
  entryWeight: 400,
  exitWeight: 550,
  carcassYield: 54,
  msConsumptionPerDay: 12,
  arrobaPrice: 280,
  msPrice: 1.2,
  numDiets: 1,
  dietDays: [90, 0, 0, 0, 0, 0],
  dietCostPerKg: [1.2, 0, 0, 0, 0, 0],
  /** ~2,53% PV/dia equivale ao antigo 12 kg MS/dia com PV médio ~475 kg em 90 dias */
  dietConsumptionPct: [2.53, 0, 0, 0, 0, 0],
  dietMsPct: [100, 0, 0, 0, 0, 0],
  acquisitionCost: 3200,
  sanitaryCost: 50,
  adminCost: 30,
  traceabilityCost: 10,
  laborCost: 0,
  machineryCost: 0,
  medicationsCost: 0,
  /** Ex.: antigos custo financeiro + perdas (100 + 20) */
  otherCosts: 120,
  consumptionPeakDay: 0,
  consumptionFineAdjustPct: 0,
};

/** Normaliza cenários antigos do localStorage */
export function migrateScenario(raw: unknown): ScenarioParameters {
  const d = defaultParameters;
  if (!raw || typeof raw !== 'object') return { ...d, id: crypto.randomUUID() };
  const s = raw as Record<string, unknown>;
  const days = typeof s.days === 'number' ? s.days : d.days;
  const entryWeight = typeof s.entryWeight === 'number' ? s.entryWeight : d.entryWeight;
  const exitWeight = typeof s.exitWeight === 'number' ? s.exitWeight : d.exitWeight;
  const msPrice = typeof s.msPrice === 'number' ? s.msPrice : d.msPrice;
  let gmd = typeof s.gmd === 'number' ? s.gmd : d.gmd;
  if (typeof s.gmd !== 'number' && days > 0) {
    gmd = Math.max(0.01, (exitWeight - entryWeight) / days);
  }
  const numDiets =
    typeof s.numDiets === 'number' && s.numDiets >= 1 && s.numDiets <= DIET_SLOTS
      ? s.numDiets
      : 1;
  const parseSlot = (v: unknown, i: number, fallback: DietSlotArray): number => {
    if (Array.isArray(v) && typeof v[i] === 'number') return v[i] as number;
    return fallback[i];
  };
  const baseDays: DietSlotArray = [days, 0, 0, 0, 0, 0];
  const baseCost: DietSlotArray = [msPrice, 0, 0, 0, 0, 0];
  const basePct: DietSlotArray = [100, 0, 0, 0, 0, 0];
  const dietDays = emptyDietSlots();
  const dietCostPerKg = emptyDietSlots();
  const dietConsumptionPct = emptyDietSlots();
  const baseMsPct: DietSlotArray = [100, 0, 0, 0, 0, 0];
  const dietMsPct = emptyDietSlots();
  for (let i = 0; i < DIET_SLOTS; i++) {
    dietDays[i] = parseSlot(s.dietDays, i, baseDays);
    dietCostPerKg[i] = parseSlot(s.dietCostPerKg, i, baseCost);
    dietConsumptionPct[i] = parseSlot(s.dietConsumptionPct, i, basePct);
    dietMsPct[i] = parseSlot(s.dietMsPct, i, baseMsPct);
  }
  const msCons =
    typeof s.msConsumptionPerDay === 'number' ? s.msConsumptionPerDay : d.msConsumptionPerDay;
  if (!('dietMsPct' in s) && numDiets === 1 && dietConsumptionPct[0] >= 99) {
    const d0 = dietDays[0] > 0 ? dietDays[0] : days;
    const gForPm = gmd > 0 ? gmd : d0 > 0 ? Math.max(0.01, (exitWeight - entryWeight) / d0) : 0.01;
    const pm = (entryWeight + entryWeight + gForPm * d0) / 2;
    if (pm > 0) {
      dietConsumptionPct[0] = (msCons / pm) * 100;
    }
  }
  return {
    id: typeof s.id === 'string' ? s.id : crypto.randomUUID(),
    name: typeof s.name === 'string' ? s.name : d.name,
    numAnimals: typeof s.numAnimals === 'number' ? s.numAnimals : d.numAnimals,
    days,
    gmd,
    entryWeight,
    exitWeight,
    carcassYield: typeof s.carcassYield === 'number' ? s.carcassYield : d.carcassYield,
    msConsumptionPerDay:
      typeof s.msConsumptionPerDay === 'number' ? s.msConsumptionPerDay : d.msConsumptionPerDay,
    arrobaPrice: typeof s.arrobaPrice === 'number' ? s.arrobaPrice : d.arrobaPrice,
    msPrice,
    numDiets,
    dietDays,
    dietCostPerKg,
    dietConsumptionPct,
    dietMsPct,
    acquisitionCost: typeof s.acquisitionCost === 'number' ? s.acquisitionCost : d.acquisitionCost,
    sanitaryCost: typeof s.sanitaryCost === 'number' ? s.sanitaryCost : d.sanitaryCost,
    adminCost: typeof s.adminCost === 'number' ? s.adminCost : d.adminCost,
    traceabilityCost: typeof s.traceabilityCost === 'number' ? s.traceabilityCost : d.traceabilityCost,
    laborCost: typeof s.laborCost === 'number' ? s.laborCost : d.laborCost,
    machineryCost: typeof s.machineryCost === 'number' ? s.machineryCost : d.machineryCost,
    medicationsCost: typeof s.medicationsCost === 'number' ? s.medicationsCost : d.medicationsCost,
    otherCosts: (() => {
      if (typeof s.otherCosts === 'number') return s.otherCosts;
      if ('financialCost' in s || 'lossCost' in s) {
        const fin = typeof s.financialCost === 'number' ? s.financialCost : 0;
        const loss = typeof s.lossCost === 'number' ? s.lossCost : 0;
        return fin + loss;
      }
      return d.otherCosts;
    })(),
    consumptionPeakDay:
      typeof s.consumptionPeakDay === 'number' ? s.consumptionPeakDay : d.consumptionPeakDay,
    consumptionFineAdjustPct:
      typeof s.consumptionFineAdjustPct === 'number'
        ? s.consumptionFineAdjustPct
        : d.consumptionFineAdjustPct,
  };
}
