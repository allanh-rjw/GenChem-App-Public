const KW = 1e-14;
export const AVOGADRO = 6.02214076e23;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function solveHydrogenByBisection(fn) {
  let lo = -14;
  let hi = 0;
  let flo = fn(10 ** lo);
  let fhi = fn(10 ** hi);

  if (Math.sign(flo) === Math.sign(fhi)) {
    lo = -16;
    hi = 1;
    flo = fn(10 ** lo);
    fhi = fn(10 ** hi);
  }

  for (let i = 0; i < 120; i += 1) {
    const mid = (lo + hi) / 2;
    const h = 10 ** mid;
    const fmid = fn(h);
    if (Math.abs(fmid) < 1e-14) return h;
    if (Math.sign(fmid) === Math.sign(flo)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
      fhi = fmid;
    }
  }
  return 10 ** ((lo + hi) / 2);
}

export function calculateState(scenario, titrantMl) {
  const maxMl = scenario.runMaxMl || 50;
  const vT = clamp(Number(titrantMl) || 0, 0, maxMl) / 1000;
  const vA = scenario.analyteMl / 1000;
  const totalV = vA + vT;
  const nAnalyte = scenario.analyteM * vA;
  const nTitrant = scenario.titrantM * vT;
  const waterProducedMol = Math.min(nAnalyte, nTitrant);

  if (scenario.kind === 'strong-acid') {
    const cl = nAnalyte / totalV;
    const na = nTitrant / totalV;
    const d = cl - na;
    const h = (d + Math.sqrt(d * d + 4 * KW)) / 2;
    return finalize(scenario, titrantMl, totalV, waterProducedMol, {
      H3O: h,
      OH: KW / h,
      Na: na,
      Cl: cl
    });
  }

  if (scenario.kind === 'weak-acid') {
    const ct = nAnalyte / totalV;
    const na = nTitrant / totalV;
    const ka = scenario.Ka;
    const h = solveHydrogenByBisection((x) => {
      const f = ct * ka / (ka + x);
      return x + na - KW / x - f;
    });
    const f = ct * ka / (ka + h);
    const hf = ct - f;
    return finalize(scenario, titrantMl, totalV, waterProducedMol, {
      H3O: h,
      OH: KW / h,
      HF: hf,
      F: f,
      Na: na
    });
  }

  if (scenario.kind === 'weak-base') {
    const ct = nAnalyte / totalV;
    const cl = nTitrant / totalV;
    const ka = KW / scenario.Kb;
    const h = solveHydrogenByBisection((x) => {
      const nh4 = ct * x / (ka + x);
      return x + nh4 - KW / x - cl;
    });
    const nh4 = ct * h / (ka + h);
    const nh3 = ct - nh4;
    return finalize(scenario, titrantMl, totalV, waterProducedMol, {
      H3O: h,
      OH: KW / h,
      NH3: nh3,
      NH4: nh4,
      Cl: cl
    });
  }

  throw new Error(`Unknown scenario kind: ${scenario.kind}`);
}

function finalize(scenario, titrantMl, totalVolumeL, waterProducedMol, species) {
  const h = Math.max(species.H3O || 1e-14, 1e-14);
  const pH = clamp(-Math.log10(h), 0, 14);
  const eqMl = scenario.equivalenceMl || (scenario.analyteM * scenario.analyteMl) / scenario.titrantM;
  const H2OProduced = totalVolumeL > 0 ? waterProducedMol / totalVolumeL : 0;
  return {
    titrantMl: clamp(Number(titrantMl) || 0, 0, scenario.runMaxMl || 50),
    pH,
    equivalenceMl: eqMl,
    region: classifyRegion(scenario, titrantMl, eqMl),
    totalVolumeL,
    waterProducedMol,
    species: { ...species, H2OProduced }
  };
}

export function classifyRegion(scenario, titrantMl, equivalenceMl) {
  const x = Number(titrantMl) || 0;
  const fraction = equivalenceMl > 0 ? x / equivalenceMl : 0;
  const tolerance = Math.max(0.02, equivalenceMl * 0.0032);
  if (x === 0) return 'initial';
  if (Math.abs(x - equivalenceMl) < tolerance) return 'equivalence';
  if (fraction < 0.98) return fraction > 0.15 ? 'pre-equivalence' : 'early';
  if (fraction > 1.02) return 'post-equivalence';
  return 'equivalence-region';
}

export function regionExplanation(scenario, state) {
  const r = state.region;
  if (scenario.kind === 'strong-acid') {
    if (r === 'initial' || r === 'early' || r === 'pre-equivalence') return 'Excess strong acid controls the pH';
    if (r === 'equivalence' || r === 'equivalence-region') return 'Near equivalence: H₃O⁺ and OH⁻ have nearly neutralized each other';
    return 'Excess strong base controls the pH';
  }
  if (scenario.kind === 'weak-acid') {
    if (r === 'initial') return 'Weak-acid ionization establishes the initial pH';
    if (r === 'early' || r === 'pre-equivalence') return 'HF/F⁻ buffer controls the pH';
    if (r === 'equivalence' || r === 'equivalence-region') return 'F⁻ hydrolysis makes the equivalence solution basic';
    return 'Excess strong base controls the pH';
  }
  if (r === 'initial') return 'NH₃ ionization establishes the initial basic pH';
  if (r === 'early' || r === 'pre-equivalence') return 'NH₃/NH₄⁺ buffer controls the pH';
  if (r === 'equivalence' || r === 'equivalence-region') return 'NH₄⁺ acidity makes the equivalence solution acidic';
  return 'Excess strong acid controls the pH';
}

export function microscopicSummary(scenario, state) {
  const s = state.species;
  const tol = Math.max(0.02, state.equivalenceMl * 0.0032);
  if (scenario.kind === 'strong-acid') {
    if (state.titrantMl < state.equivalenceMl - tol) return 'H₃O⁺ remains in excess; Na⁺ and Cl⁻ are spectators';
    if (Math.abs(state.titrantMl - state.equivalenceMl) <= tol) return 'Mostly solvent water with Na⁺ and Cl⁻ spectator ions';
    return 'OH⁻ is in excess; Na⁺ and Cl⁻ remain in solution';
  }
  if (scenario.kind === 'weak-acid') {
    const dominant = s.HF > s.F ? 'HF' : 'F⁻';
    if (state.titrantMl > state.equivalenceMl + tol) return 'F⁻ remains, while added OH⁻ is now in excess';
    if (Math.abs(state.titrantMl - state.equivalenceMl) <= tol) return 'F⁻ dominates and weakly hydrolyzes water';
    return `${dominant} is more abundant; HF ionization and recombination remain dynamic`;
  }
  if (state.titrantMl > state.equivalenceMl + tol) return 'NH₄⁺ remains, while H₃O⁺ from HCl is in excess';
  if (Math.abs(state.titrantMl - state.equivalenceMl) <= tol) return 'NH₄⁺ dominates and weakly acidifies the solution';
  return `${s.NH3 > s.NH4 ? 'NH₃' : 'NH₄⁺'} is more abundant in the NH₃/NH₄⁺ buffer`;
}

const SPECIES_DEFS = {
  H3O: { key: 'H3O', label: 'H₃O⁺', color: '#ff3348' },
  OH: { key: 'OH', label: 'OH⁻', color: '#ff4a58' },
  Na: { key: 'Na', label: 'Na⁺', color: '#9b68ff' },
  Cl: { key: 'Cl', label: 'Cl⁻', color: '#28cf63' },
  HF: { key: 'HF', label: 'HF', color: '#43df48' },
  F: { key: 'F', label: 'F⁻', color: '#42e74a' },
  NH3: { key: 'NH3', label: 'NH₃', color: '#376dff' },
  NH4: { key: 'NH4', label: 'NH₄⁺', color: '#2f55e8' },
  H2OProduced: { key: 'H2OProduced', label: 'H₂O produced (Δ)', color: '#38a7d9' }
};

export function speciesForMonitor(scenario, state) {
  const s = state.species;
  const keys = scenario.kind === 'strong-acid'
    ? ['H3O', 'OH', 'Na', 'Cl', 'H2OProduced']
    : scenario.kind === 'weak-acid'
      ? ['HF', 'F', 'H3O', 'OH', 'Na', 'H2OProduced']
      : ['NH3', 'NH4', 'H3O', 'OH', 'Cl', 'H2OProduced'];

  return keys.map((key) => {
    const concentration = s[key] || 0;
    const moles = key === 'H2OProduced' ? state.waterProducedMol : concentration * state.totalVolumeL;
    return {
      ...SPECIES_DEFS[key],
      concentration,
      moles,
      particles: moles * AVOGADRO
    };
  });
}

export function curveSamples(scenario, endMl = scenario.runMaxMl || 50, step = null) {
  const actualStep = step || Math.max(0.02, endMl / 600);
  const out = [];
  for (let v = 0; v <= endMl + 1e-9; v += actualStep) out.push(calculateState(scenario, Math.min(endMl, v)));
  return out;
}

export function indicatorState(indicator, pH) {
  if (indicator === 'none') return { name: 'No indicator', top: 'rgba(166,216,235,.23)', bottom: 'rgba(77,158,193,.33)', description: 'colorless' };
  if (indicator === 'methyl-red') {
    const t = clamp((pH - 4.4) / (6.2 - 4.4), 0, 1);
    return {
      name: 'Methyl red',
      top: mixRgba([226, 50, 44, .38], [246, 208, 45, .30], t),
      bottom: mixRgba([183, 31, 34, .48], [221, 169, 22, .40], t),
      description: t < .12 ? 'red' : t > .88 ? 'yellow' : 'orange transition'
    };
  }
  const t = clamp((pH - 8.2) / (10.0 - 8.2), 0, 1);
  return {
    name: 'Phenolphthalein',
    top: mixRgba([176, 220, 237, .20], [255, 118, 177, .40], t),
    bottom: mixRgba([92, 169, 201, .29], [224, 64, 133, .48], t),
    description: t < .1 ? 'colorless' : t > .9 ? 'pink' : 'faint pink transition'
  };
}

function mixRgba(a, b, t) {
  const v = a.map((x, i) => x + (b[i] - x) * t);
  return `rgba(${Math.round(v[0])}, ${Math.round(v[1])}, ${Math.round(v[2])}, ${v[3].toFixed(3)})`;
}
