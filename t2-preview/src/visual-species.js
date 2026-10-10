// Convert the quantitative species monitor state into a finite particulate
// representation for the Live Flask. The key rule is linear proportionality:
// visible counts follow the same relative concentrations shown in the species
// tooltip, apart from trace-species omission and a few dim solvent-context H2O.

export const VISUAL_BASE_TARGET = 42;
export const VISUAL_MAX_TARGET = 72;
export const SOLVENT_CONTEXT_COUNT = 4;

function largestRemainderAllocation(items, target) {
  if (!items.length || target <= 0) return [];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return [];

  const working = items.map((item, index) => {
    const exact = (item.value / total) * target;
    const count = Math.floor(exact);
    return { ...item, index, exact, count, remainder: exact - count };
  });

  let assigned = working.reduce((sum, item) => sum + item.count, 0);
  const byRemainder = [...working].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.value !== a.value) return b.value - a.value;
    return a.index - b.index;
  });

  for (let i = 0; assigned < target && i < byRemainder.length; i = (i + 1) % byRemainder.length) {
    byRemainder[i].count += 1;
    assigned += 1;
  }

  return working.map((item) => {
    const updated = byRemainder.find((d) => d.index === item.index);
    return { key: item.key, count: updated.count, value: item.value };
  });
}

export function visualParticleTarget(state) {
  const eqMl = state?.equivalenceMl || 0;
  if (!(eqMl > 0)) return VISUAL_BASE_TARGET;
  const postFraction = Math.max(0, (state.titrantMl - eqMl) / eqMl);
  const extra = Math.round(Math.min(1.5, postFraction) * 19);
  return Math.min(VISUAL_MAX_TARGET, VISUAL_BASE_TARGET + extra);
}

export function proportionalVisualCounts(speciesData, state, target = visualParticleTarget(state)) {
  const positive = speciesData
    .map((d) => ({ key: d.key, value: Math.max(0, Number(d.concentration) || 0) }))
    .filter((d) => d.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0) || target <= 0) return [];

  // Preserve linear abundance for the quantitative population. A species that
  // contributes at least ~1% of the tracked population may receive a one-particle
  // visibility floor when its mathematically expected count is below one. This
  // is mainly needed for the small initial NH4+/OH- populations in aqueous NH3.
  // Truly trace species remain absent rather than being wildly exaggerated.
  const active = positive
    .map((item) => ({ ...item, fraction: item.value / total, expected: (item.value / total) * target }))
    .filter((item) => item.fraction >= 0.01 || item.expected >= 0.5);

  if (!active.length) {
    const dominant = positive.reduce((a, b) => (a.value >= b.value ? a : b));
    return [{ key: dominant.key, count: target, value: dominant.value }];
  }

  const floored = active.filter((item) => item.expected < 1 && item.fraction >= 0.01);
  const floorKeys = new Set(floored.map((item) => item.key));
  const remainingTarget = Math.max(0, target - floored.length);
  const scalable = active.filter((item) => !floorKeys.has(item.key));
  const allocated = largestRemainderAllocation(scalable, remainingTarget);
  const counts = new Map(allocated.map((item) => [item.key, item.count]));
  for (const item of floored) counts.set(item.key, 1);

  return active
    .map((item) => ({ key: item.key, count: counts.get(item.key) || 0, value: item.value }))
    .filter((item) => item.count > 0);
}
