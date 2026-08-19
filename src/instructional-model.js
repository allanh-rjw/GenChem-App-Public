export const INSTRUCTIONAL_MAX_NON_SPECTATOR = 10;
export const INSTRUCTIONAL_MAX_PARTICLES = INSTRUCTIONAL_MAX_NON_SPECTATOR;

const LEGEND = {
  Hplus: { key: 'Hplus', kind: 'Hplus', label: 'H⁺', color: '#f8fbff', charge: '+', spectator: false },
  OH: { key: 'OH', kind: 'OH', label: 'OH⁻', color: '#ff4a58', charge: '−', spectator: false },
  Na: { key: 'Na', kind: 'Na', label: 'Na⁺', color: '#9b68ff', charge: '+', spectator: true },
  Cl: { key: 'Cl', kind: 'Cl', label: 'Cl⁻', color: '#28cf63', charge: '−', spectator: true },
  HF: { key: 'HF', kind: 'HF', label: 'HF', color: '#43df48', charge: '', spectator: false },
  F: { key: 'F', kind: 'F', label: 'F⁻', color: '#42e74a', charge: '−', spectator: false },
  NH3: { key: 'NH3', kind: 'NH3', label: 'NH₃', color: '#376dff', charge: '', spectator: false },
  NH4: { key: 'NH4', kind: 'NH4', label: 'NH₄⁺', color: '#2f55e8', charge: '+', spectator: false },
  H3O: { key: 'H3O', kind: 'H3O', label: 'H₃O⁺', color: '#ff3348', charge: '+', spectator: false }
};

const SPECTATORS = {
  'strong-acid': new Set(['Na', 'Cl']),
  'weak-acid': new Set(['Na']),
  'weak-base': new Set(['Cl'])
};

function fractionAt(scenario, state) {
  const eq = Number(state?.equivalenceMl || scenario?.equivalenceMl || 0);
  return eq > 0 ? Math.max(0, Number(state?.titrantMl || 0) / eq) : 0;
}

export function stageForState(scenario, state) {
  const f = fractionAt(scenario, state);
  if ((state?.titrantMl || 0) <= 1e-9) return 'initial';
  if (scenario.kind !== 'strong-acid' && Math.abs(f - 0.5) <= 0.025) return 'half-equivalence';
  if (Math.abs(f - 1) <= 0.025) return 'equivalence';
  if (f < 1) return 'pre-equivalence';
  return 'post-equivalence';
}

export function isSpectator(scenario, key) {
  return SPECTATORS[scenario.kind]?.has(key) || false;
}

function descriptor(key, count, spectator = false) {
  const def = LEGEND[key];
  const rounded = Math.max(0, Math.round(Number(count) || 0));
  return rounded > 0 ? { ...def, count: rounded, spectator } : null;
}

function visible(items, showSpectators) {
  return items.filter(Boolean).filter((item) => showSpectators || !item.spectator);
}

export function instructionalVisualCounts(scenario, state, { showSpectators = true } = {}) {
  const f = Math.max(0, fractionAt(scenario, state));
  const items = [];

  if (scenario.kind === 'strong-acid') {
    if (f < 1) {
      const h = Math.max(0, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR * (1 - f)));
      const na = INSTRUCTIONAL_MAX_NON_SPECTATOR - h;
      items.push(descriptor('Hplus', h));
      if (showSpectators) {
        items.push(descriptor('Na', na, true));
        items.push(descriptor('Cl', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
      }
    } else if (Math.abs(f - 1) <= 0.025) {
      if (showSpectators) {
        items.push(descriptor('Na', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
        items.push(descriptor('Cl', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
      }
    } else {
      const cl = Math.max(1, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR / f));
      const oh = INSTRUCTIONAL_MAX_NON_SPECTATOR - cl;
      items.push(descriptor('OH', oh));
      if (showSpectators) {
        items.push(descriptor('Na', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
        items.push(descriptor('Cl', cl, true));
      }
    }
  } else if (scenario.kind === 'weak-acid') {
    if (f <= 1) {
      const fluoride = Math.max(0, Math.min(INSTRUCTIONAL_MAX_NON_SPECTATOR, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR * f)));
      const hf = INSTRUCTIONAL_MAX_NON_SPECTATOR - fluoride;
      items.push(descriptor('HF', hf), descriptor('F', fluoride));
      if (showSpectators) items.push(descriptor('Na', fluoride, true));
    } else {
      const fluoride = Math.max(1, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR / f));
      const oh = INSTRUCTIONAL_MAX_NON_SPECTATOR - fluoride;
      items.push(descriptor('F', fluoride), descriptor('OH', oh));
      if (showSpectators) items.push(descriptor('Na', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
    }
  } else {
    if (f <= 1) {
      const ammonium = Math.max(0, Math.min(INSTRUCTIONAL_MAX_NON_SPECTATOR, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR * f)));
      const ammonia = INSTRUCTIONAL_MAX_NON_SPECTATOR - ammonium;
      items.push(descriptor('NH3', ammonia), descriptor('NH4', ammonium));
      if (showSpectators) items.push(descriptor('Cl', ammonium, true));
    } else {
      const ammonium = Math.max(1, Math.round(INSTRUCTIONAL_MAX_NON_SPECTATOR / f));
      const h = INSTRUCTIONAL_MAX_NON_SPECTATOR - ammonium;
      items.push(descriptor('NH4', ammonium), descriptor('Hplus', h));
      if (showSpectators) items.push(descriptor('Cl', INSTRUCTIONAL_MAX_NON_SPECTATOR, true));
    }
  }

  return visible(items, showSpectators);
}

export function particleDescriptors(scenario, state, options = {}) {
  const counts = instructionalVisualCounts(scenario, state, options);
  const out = [];
  for (const item of counts) {
    for (let i = 0; i < item.count; i += 1) {
      out.push({
        kind: item.kind,
        speciesKey: item.key,
        alpha: item.spectator ? 0.82 : 0.97,
        contextScale: item.spectator ? 0.88 : 1.0,
        spectator: item.spectator
      });
    }
  }
  return out;
}

export function legendForScenario(scenario) {
  const keys = scenario.kind === 'strong-acid'
    ? ['Hplus', 'OH', 'Na', 'Cl']
    : scenario.kind === 'weak-acid'
      ? ['HF', 'F', 'OH', 'Na']
      : ['NH3', 'NH4', 'Hplus', 'Cl'];
  return keys.map((key) => ({ ...LEGEND[key], spectator: isSpectator(scenario, key) }));
}

export function checkpointDefinitions(scenario) {
  const eq = scenario.equivalenceMl || 0;
  const common = [{ id: 'initial', label: 'Start', ml: 0 }, { id: 'pre-equivalence', label: 'Before equivalence', ml: eq * 0.75 }];
  if (scenario.kind !== 'strong-acid') common.push({ id: 'half-equivalence', label: 'Half-equivalence', ml: eq * 0.5 });
  common.push(
    { id: 'equivalence', label: 'Equivalence', ml: eq },
    { id: 'post-equivalence', label: 'After equivalence', ml: Math.min(scenario.runMaxMl || eq * 2, eq * 1.4) }
  );
  return common;
}

export function stageLabel(stage) {
  return ({ initial: 'Start of titration', 'pre-equivalence': 'Before equivalence', 'half-equivalence': 'Half-equivalence', equivalence: 'Equivalence point', 'post-equivalence': 'After equivalence' })[stage] || stage;
}

export function coachingPrompt(scenario, state) {
  const stage = stageForState(scenario, state);
  if (stage === 'initial') {
    if (scenario.kind === 'strong-acid') return 'What particles are in the flask before any NaOH is added, and which one controls the pH?';
    if (scenario.kind === 'weak-acid') return 'What is in the flask before titration begins? Explain why HF is shown mainly as molecules rather than separated ions.';
    return 'What is in the flask before HCl is added? Which species is responsible for the basic pH?';
  }
  if (stage === 'half-equivalence') return scenario.kind === 'weak-acid' ? 'The particulate view shows equal HF and F⁻. What does that tell you about the buffer at half-equivalence?' : 'The particulate view shows equal NH₃ and NH₄⁺. What does that tell you about the buffer at half-equivalence?';
  if (stage === 'pre-equivalence') {
    if (scenario.kind === 'strong-acid') return 'As NaOH is added before equivalence, what is disappearing from the flask, what is appearing, and why?';
    if (scenario.kind === 'weak-acid') return 'Before equivalence, what happens each time OH⁻ encounters HF? Connect the changing HF/F⁻ counts to the reaction.';
    return 'Before equivalence, what happens when H⁺ from HCl encounters NH₃? Connect the changing NH₃/NH₄⁺ counts to the reaction.';
  }
  if (stage === 'equivalence') {
    if (scenario.kind === 'strong-acid') return 'At equivalence, why is there no excess H⁺ or OH⁻, and why does the pH change so sharply near this point?';
    if (scenario.kind === 'weak-acid') return 'At equivalence, HF has been converted mostly to F⁻. Why is the solution basic rather than neutral?';
    return 'At equivalence, NH₃ has been converted mostly to NH₄⁺. Why is the solution acidic rather than neutral?';
  }
  return 'After equivalence, which reactive species is in excess? How can you identify it in the particulate view?';
}

function has(text, terms) { return terms.some((term) => text.includes(term)); }

export function coachResponse(scenario, state, rawResponse) {
  const text = String(rawResponse || '').trim().toLowerCase();
  const stage = stageForState(scenario, state);
  if (!text) return 'Write what you think is happening chemically. Naming the particles is useful, but explain their roles too.';
  if (has(text, ['purple', 'green', 'red', 'blue']) && !has(text, ['sodium', 'na', 'chloride', 'cl', 'hydrogen', 'h+', 'hydroxide', 'oh', 'fluoride', 'f-', 'ammonia', 'nh3', 'ammonium', 'nh4'])) return 'You are using the visual cue correctly. Now translate the color into chemistry: what species does that particle represent, and what role does it play in the reaction?';

  if (stage === 'initial') {
    if (scenario.kind === 'strong-acid') {
      if (has(text, ['h+', 'hydrogen', 'proton']) && has(text, ['cl', 'chloride'])) return 'Good. H⁺ is the species that sets the acidic pH, while Cl⁻ is present but does not drive the neutralization. What will happen to the H⁺ count when OH⁻ is added?';
      return 'You have identified part of the starting mixture. Check both ions produced by HCl, then decide which one is actually consumed when NaOH is added.';
    }
    if (scenario.kind === 'weak-acid') {
      if (has(text, ['hf']) && has(text, ['weak', 'partial', 'mostly'])) return 'That is the key idea: HF is weak, so the instructional view keeps most acid as HF molecules. During titration, which incoming species removes H⁺ from HF?';
      return 'Focus on the fact that HF is a weak acid. Is it represented mainly as intact HF or as completely separated ions, and why?';
    }
    if (has(text, ['nh3', 'ammonia']) && has(text, ['base', 'basic', 'proton', 'h+'])) return 'Right direction. NH₃ is the weak base in the flask. When H⁺ arrives from HCl, what product forms?';
    return 'Start with NH₃ as the weak base. Explain what makes it responsible for the initial basic pH rather than the chloride ion that will be added later.';
  }

  if (stage === 'half-equivalence') {
    if (scenario.kind === 'weak-acid' && has(text, ['equal', 'same', '1:1', 'hf']) && has(text, ['f-', 'fluoride', 'conjugate'])) return 'Exactly. Equal HF and F⁻ is the characteristic half-equivalence buffer condition. That is why pH is approximately pKa here.';
    if (scenario.kind === 'weak-base' && has(text, ['equal', 'same', '1:1', 'nh3']) && has(text, ['nh4', 'ammonium'])) return 'Exactly. Equal NH₃ and NH₄⁺ marks half-equivalence, so the buffer has equal base and conjugate acid and pH is approximately pKa of NH₄⁺.';
    return 'Use the countable particles. Compare the weak species and its conjugate partner. What special relationship do you see between their amounts at this point?';
  }

  if (stage === 'pre-equivalence') {
    if (scenario.kind === 'strong-acid' && has(text, ['h+', 'hydrogen', 'proton']) && has(text, ['oh', 'hydroxide']) && has(text, ['water', 'h2o', 'neutral'])) return 'Yes. OH⁻ consumes H⁺ to form water, so H⁺ falls while the spectator ions remain. That shrinking excess of H⁺ is why the pH rises.';
    if (scenario.kind === 'weak-acid' && has(text, ['hf']) && has(text, ['oh', 'hydroxide']) && has(text, ['f-', 'fluoride'])) return 'Yes. OH⁻ removes H⁺ from HF, producing F⁻ and water. The changing HF/F⁻ count is therefore a reaction-progress model, not a literal concentration scale.';
    if (scenario.kind === 'weak-base' && has(text, ['nh3', 'ammonia']) && has(text, ['h+', 'hydrogen', 'proton']) && has(text, ['nh4', 'ammonium'])) return 'Yes. H⁺ protonates NH₃ to make NH₄⁺, so the particulate view shifts from NH₃ toward NH₄⁺ as equivalence approaches.';
    return 'You are close to the important step. Name the incoming reactive species, the species it reacts with, and the product that replaces it in the flask.';
  }

  if (stage === 'equivalence') {
    if (scenario.kind === 'strong-acid') {
      if (has(text, ['no excess', 'equal', 'equivalent', 'stoichi']) && has(text, ['h+', 'oh', 'hydrogen', 'hydroxide'])) return 'Correct. Stoichiometric amounts of H⁺ and OH⁻ have neutralized each other. Near that balance, a very small added amount changes which strong species is in excess, producing the steep pH jump.';
      return 'Think stoichiometrically first: at equivalence, how do the moles of added OH⁻ compare with the original acid? Then ask what happens when just a little more base is added.';
    }
    if (scenario.kind === 'weak-acid') {
      if (has(text, ['f-', 'fluoride']) && has(text, ['water', 'h2o']) && has(text, ['oh', 'hydroxide', 'basic'])) return 'Exactly. F⁻ is not a spectator here. At equivalence it reacts weakly with water, F⁻ + H₂O ⇌ HF + OH⁻, which makes the solution basic.';
      return 'Focus on F⁻. It is the conjugate base produced during the titration, not a spectator ion. What does F⁻ do when HF is essentially gone and water is the available proton donor?';
    }
    if (has(text, ['nh4', 'ammonium']) && has(text, ['water', 'h2o']) && has(text, ['h3o', 'hydronium', 'acid'])) return 'Exactly. NH₄⁺ acts as a weak acid at equivalence: NH₄⁺ + H₂O ⇌ NH₃ + H₃O⁺. The H₃O⁺ formed makes the equivalence solution acidic.';
    return 'Focus on NH₄⁺ at equivalence. It is not a spectator. What acid-base reaction can NH₄⁺ undergo with water, and what species produced by that equilibrium lowers the pH?';
  }

  if (scenario.kind === 'weak-base') {
    if (has(text, ['h+', 'hydrogen', 'proton', 'acid']) && has(text, ['excess'])) return 'Correct. Once all NH₃ has been protonated, additional HCl leaves H⁺ in excess. Cl⁻ remains a spectator.';
    return 'Look for the reactive particle that appears only after more HCl has been added than the NH₃ can consume. Which species from the titrant is now left over?';
  }
  if (has(text, ['oh', 'hydroxide']) && has(text, ['excess'])) return scenario.kind === 'weak-acid' ? 'Correct. After equivalence, added OH⁻ is in excess. F⁻ remains chemically meaningful, while Na⁺ is the spectator ion.' : 'Correct. After equivalence, OH⁻ is the excess reactive species. Na⁺ and Cl⁻ remain spectators.';
  return 'Identify the species from the titrant that can no longer be completely consumed after equivalence. That leftover reactive species controls the pH.';
}
