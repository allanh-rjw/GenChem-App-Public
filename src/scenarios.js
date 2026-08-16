export const DEFAULT_STOCK_M = 0.1;
export const DEFAULT_STOCK_ML = 25;
export const DEFAULT_WATER_ML = 0;
export const DEFAULT_TITRANT_M = 0.1;

export const SCENARIOS = [
  {
    id: 'strong-acid-strong-base',
    short: 'Strong acid + strong base',
    title: 'Titration of strong acid (HCl) with strong base (NaOH)',
    analyte: 'HCl',
    titrant: 'NaOH',
    reaction: 'H₃O⁺ + OH⁻ → 2 H₂O',
    kind: 'strong-acid',
    defaultIndicator: 'phenolphthalein'
  },
  {
    id: 'weak-acid-strong-base',
    short: 'Weak acid + strong base',
    title: 'Titration of weak acid (HF) with strong base (NaOH)',
    analyte: 'HF',
    titrant: 'NaOH',
    Ka: 6.8e-4,
    reaction: 'HF + OH⁻ → F⁻ + H₂O',
    equilibrium: 'HF + H₂O ⇌ H₃O⁺ + F⁻',
    kind: 'weak-acid',
    defaultIndicator: 'phenolphthalein'
  },
  {
    id: 'weak-base-strong-acid',
    short: 'Weak base + strong acid',
    title: 'Titration of weak base (NH₃) with strong acid (HCl)',
    analyte: 'NH₃',
    titrant: 'HCl',
    Kb: 1.8e-5,
    reaction: 'NH₃ + H₃O⁺ → NH₄⁺ + H₂O',
    equilibrium: 'NH₃ + H₂O ⇌ NH₄⁺ + OH⁻',
    kind: 'weak-base',
    defaultIndicator: 'methyl-red'
  }
];

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

export function defaultExperimentFor(baseScenario) {
  return configureExperiment(baseScenario, {
    stockM: DEFAULT_STOCK_M,
    stockMl: DEFAULT_STOCK_ML,
    waterMl: DEFAULT_WATER_ML,
    titrantM: DEFAULT_TITRANT_M,
    indicator: baseScenario.defaultIndicator
  });
}

export function configureExperiment(baseScenario, settings) {
  const stockM = Number(settings.stockM);
  const stockMl = Number(settings.stockMl);
  const waterMl = Number(settings.waterMl);
  const titrantM = Number(settings.titrantM);
  const analyteMl = stockMl + waterMl;
  const analyteM = analyteMl > 0 ? (stockM * stockMl) / analyteMl : 0;
  const analyteMol = stockM * stockMl / 1000;
  const equivalenceMl = titrantM > 0 ? (analyteMol / titrantM) * 1000 : 0;
  const runMaxMl = Math.max(2, Math.min(150, equivalenceMl * 2));

  return {
    ...baseScenario,
    stockM,
    stockMl,
    waterMl,
    analyteMl,
    analyteM,
    titrantM,
    indicator: settings.indicator || baseScenario.defaultIndicator,
    equivalenceMl,
    runMaxMl
  };
}
