import { SCENARIOS, scenarioById, defaultExperimentFor, configureExperiment } from './scenarios.js';
import { calculateState, microscopicSummary, regionExplanation } from './chemistry.js';
import { renderSpeciesBars } from './views/species-bars.js';
import { MolecularFlaskView } from './views/molecular-flask.js';
import { TitrationCurveView } from './views/titration-curve.js';
import { ReactionCloseupView } from './views/reaction-closeup.js';

const els = {
  scenarioRow: document.querySelector('#scenario-row'), scenarioTitle: document.querySelector('#scenario-title'),
  titrantLabel: document.querySelector('#titrant-label'), analyteLabel: document.querySelector('#analyte-label'),
  phReadout: document.querySelector('#ph-readout'), volumeReadout: document.querySelector('#volume-readout'),
  microSummary: document.querySelector('#micro-summary'), reactionLine: document.querySelector('#reaction-line'),
  regionLabel: document.querySelector('#region-label'), eqBadge: document.querySelector('#equilibrium-badge'),
  equivalenceReadout: document.querySelector('#equivalence-readout'), bars: document.querySelector('#species-bars'),
  speciesTitle: document.querySelector('#species-monitor-title'), barsNote: document.querySelector('#bars-note'),
  curveSpeciesPopover: document.querySelector('#curve-species-popover'), curveSpeciesPh: document.querySelector('#curve-species-ph'), curveSpeciesVolume: document.querySelector('#curve-species-volume'),
  flask: document.querySelector('#flask-view'), curve: document.querySelector('#curve-view'), reaction: document.querySelector('#reaction-closeup'),
  increment: document.querySelector('#increment'), add: document.querySelector('#add-button'), auto: document.querySelector('#auto-button'),
  reset: document.querySelector('#reset-button'), changeSetup: document.querySelector('#change-setup'), drop: document.querySelector('#falling-drop'),
  curveInstruction: document.querySelector('#curve-instruction'), returnLive: document.querySelector('#return-live'), controlHelp: document.querySelector('#control-help'),
  amountUnitBlock: document.querySelector('#amount-unit-block'),
  setupOverlay: document.querySelector('#setup-overlay'), setupForm: document.querySelector('#setup-form'), setupScenario: document.querySelector('#setup-scenario'),
  stockM: document.querySelector('#stock-m'), stockMl: document.querySelector('#stock-ml'), waterMl: document.querySelector('#water-ml'), titrantM: document.querySelector('#titrant-m'),
  indicator: document.querySelector('#indicator'), derivedVolume: document.querySelector('#derived-volume'), derivedConcentration: document.querySelector('#derived-concentration'),
  derivedEquivalence: document.querySelector('#derived-equivalence'), derivedEndpoint: document.querySelector('#derived-endpoint'), setupError: document.querySelector('#setup-error'),
  cancelSetup: document.querySelector('#cancel-setup'), setupScenarioSelect: document.querySelector('#setup-scenario-select')
};

const state = {
  scenarioId: SCENARIOS[0].id,
  experiment: defaultExperimentFor(SCENARIOS[0]),
  volume: 0,
  measured: [],
  autoTimer: null,
  completed: false,
  selectedMl: null,
  probeMl: null,
  hasStarted: false,
  monitorMode: 'concentration',
  amountUnit: 'moles',
  chartType: 'bar',
  setupScenarioId: SCENARIOS[0].id
};

const flaskView = new MolecularFlaskView(els.flask);
const curveView = new TitrationCurveView(els.curve, { onScrub: scrubTo, onProbe: probeTo, onProbeEnd: clearProbe });
const reactionView = new ReactionCloseupView(els.reaction);

function baseScenario() { return scenarioById(state.scenarioId); }
function scenario() { return state.experiment; }

function renderScenarioButtons() {
  els.scenarioRow.innerHTML = SCENARIOS.map((s, i) => `<button class="scenario-card ${s.id === state.scenarioId ? 'active' : ''}" data-scenario="${s.id}">
    <span class="scenario-index">${String(i + 1).padStart(2, '0')}</span><span><strong>${s.short}</strong><small>${s.analyte} titrated with ${s.titrant}</small></span></button>`).join('');
  els.scenarioRow.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => selectScenario(button.dataset.scenario)));
}

function selectScenario(id) {
  if (id === state.scenarioId && !state.hasStarted) return openSetup(false);
  stopAuto();
  state.scenarioId = id;
  state.experiment = defaultExperimentFor(baseScenario());
  state.hasStarted = false;
  resetMeasurements();
  openSetup(false);
}

function resetMeasurements() {
  stopAuto();
  state.volume = 0;
  state.measured = [calculateState(scenario(), 0)];
  state.completed = false;
  state.selectedMl = null;
  state.probeMl = null;
  els.increment.disabled = false;
  els.add.disabled = false;
  els.auto.disabled = false;
  els.auto.textContent = 'Auto titrate';
  renderScenarioButtons();
  render();
}

function animateDrop() {
  els.drop.classList.remove('drop-animate');
  void els.drop.offsetWidth;
  els.drop.classList.add('drop-animate');
}

function addTitrant(amount = Number(els.increment.value)) {
  if (state.completed) return;
  const max = scenario().runMaxMl;
  const next = Math.min(max, Number((state.volume + amount).toFixed(4)));
  if (next === state.volume) return;
  state.volume = next;
  state.measured.push(calculateState(scenario(), state.volume));
  animateDrop();
  reactionView.trigger();
  if (state.volume >= max - 1e-8) complete();
  render();
}

function smartAutoStep(v) {
  const eq = scenario().equivalenceMl;
  const f = eq > 0 ? v / eq : 0;
  let step;
  if (f < .72) step = eq * .04;
  else if (f < .92) step = eq * .02;
  else if (f < 1.08) step = eq * .01;
  else if (f < 1.30) step = eq * .02;
  else step = eq * .04;
  return Math.max(.05, Math.min(2.5, step));
}

function toggleAuto() {
  if (state.autoTimer) return stopAuto();
  if (state.completed) return;
  els.auto.textContent = 'Pause';
  state.autoTimer = setInterval(() => {
    addTitrant(smartAutoStep(state.volume));
    if (state.completed) stopAuto();
  }, 240);
}

function stopAuto() {
  if (state.autoTimer) clearInterval(state.autoTimer);
  state.autoTimer = null;
  if (els.auto) els.auto.textContent = 'Auto titrate';
}

function complete() {
  state.completed = true;
  stopAuto();
  els.increment.disabled = true;
  els.add.disabled = true;
  els.auto.disabled = true;
}

function scrubTo(ml) {
  if (!state.completed) return;
  state.selectedMl = ml;
  render();
}

function positionProbeTooltip(probeChemistry) {
  const xFraction = scenario().runMaxMl > 0 ? probeChemistry.titrantMl / scenario().runMaxMl : 0;
  const placeRight = xFraction < .52;
  const placeUpper = probeChemistry.pH <= 7;
  els.curveSpeciesPopover.classList.toggle('tooltip-right', placeRight);
  els.curveSpeciesPopover.classList.toggle('tooltip-left', !placeRight);
  els.curveSpeciesPopover.classList.toggle('tooltip-upper', placeUpper);
  els.curveSpeciesPopover.classList.toggle('tooltip-lower', !placeUpper);
}

function renderProbePanel() {
  const s = scenario();
  const probeChemistry = currentProbeState();
  if (!probeChemistry) {
    els.curveSpeciesPopover.hidden = true;
    curveView.setProbe(null, null);
    return;
  }
  renderSpeciesBars(els.bars, s, probeChemistry, { mode: state.monitorMode, unit: state.amountUnit, chart: state.chartType });
  els.curveSpeciesPh.textContent = `pH ${probeChemistry.pH.toFixed(2)}`;
  els.curveSpeciesVolume.textContent = `${probeChemistry.titrantMl.toFixed(2)} mL titrant added`;
  els.speciesTitle.textContent = monitorTitle();
  els.barsNote.textContent = monitorNote();
  positionProbeTooltip(probeChemistry);
  els.curveSpeciesPopover.hidden = false;
  curveView.setProbe(probeChemistry.titrantMl, probeChemistry.pH);
}

function renderFlaskPreview() {
  const s = scenario();
  const chemistry = currentProbeState() ?? currentDisplayState();
  els.phReadout.textContent = chemistry.pH.toFixed(2);
  els.volumeReadout.textContent = `${chemistry.titrantMl.toFixed(2)} mL`;
  flaskView.setState(s, chemistry);
}

function probeTo(ml) {
  state.probeMl = ml;
  renderProbePanel();
  // Curve hover is a temporary microscopic preview. The actual titration
  // state (and any locked post-run review point) is left untouched.
  renderFlaskPreview();
}

function clearProbe() {
  state.probeMl = null;
  renderProbePanel();
  // Restore the real live state, or the locked review state after a
  // completed titration, as soon as the pointer leaves the plotted point.
  renderFlaskPreview();
}

function returnToLive() {
  state.selectedMl = null;
  render();
}

function currentDisplayState() {
  return calculateState(scenario(), state.selectedMl == null ? state.volume : state.selectedMl);
}

function currentProbeState() {
  return state.probeMl == null ? null : calculateState(scenario(), state.probeMl);
}

function monitorTitle() {
  return state.monitorMode === 'concentration'
    ? 'Concentration in flask'
    : state.amountUnit === 'moles'
      ? 'Amount in flask (moles)'
      : 'Number of molecules / ions';
}

function monitorNote() {
  return state.monitorMode === 'concentration'
    ? 'H₂O produced (Δ) is the cumulative additional water formed by the titration reaction, expressed per total solution volume. The bulk solvent water is not included.'
    : state.amountUnit === 'moles'
      ? 'Amounts are calculated from the equilibrium composition and total flask volume. H₂O produced (Δ) tracks only new water formed by neutralization.'
      : 'Molecule/ion counts use Avogadro’s number and scientific notation. The animated flask intentionally shows a representative subset so individual species remain visible.';
}

function render() {
  const s = scenario();
  const chemistry = currentDisplayState();
  const probeChemistry = currentProbeState();
  const flaskChemistry = probeChemistry ?? chemistry;
  const reviewing = state.selectedMl != null;

  els.scenarioTitle.textContent = s.short;
  els.titrantLabel.textContent = `${s.titrantM.toFixed(3)} M ${s.titrant}`;
  els.analyteLabel.textContent = `${s.analyteMl.toFixed(2)} mL of ${s.analyteM.toFixed(3)} M ${s.analyte} (from ${s.stockM.toFixed(3)} M stock)`;
  // While inspecting a plotted curve point, the Live Flask and its two
  // readouts preview that historical chemistry. Other experiment state stays
  // where it actually is, so hovering never advances or rewinds the titration.
  els.phReadout.textContent = flaskChemistry.pH.toFixed(2);
  els.volumeReadout.textContent = `${flaskChemistry.titrantMl.toFixed(2)} mL`;
  els.microSummary.textContent = microscopicSummary(s, chemistry);
  els.reactionLine.textContent = s.reaction;
  els.regionLabel.textContent = regionExplanation(s, chemistry);
  els.equivalenceReadout.textContent = `${s.equivalenceMl.toFixed(2)} mL`;
  els.eqBadge.hidden = s.kind === 'strong-acid';
  if (!els.eqBadge.hidden) els.eqBadge.textContent = s.kind === 'weak-acid' ? 'Dynamic HF equilibrium' : 'Dynamic NH₃/NH₄⁺ equilibrium';

  flaskView.setState(s, flaskChemistry);
  reactionView.setState(s, chemistry);
  curveView.setSelectedPh(chemistry.pH);
  curveView.setProbePh(probeChemistry?.pH ?? null);
  curveView.set(state.measured, { completed: state.completed, selectedMl: state.selectedMl, probeMl: state.probeMl, xMax: s.runMaxMl });

  els.speciesTitle.textContent = monitorTitle();
  els.amountUnitBlock.hidden = state.monitorMode !== 'amount';
  els.barsNote.textContent = monitorNote();

  if (probeChemistry) {
    renderSpeciesBars(els.bars, s, probeChemistry, { mode: state.monitorMode, unit: state.amountUnit, chart: state.chartType });
    els.curveSpeciesPh.textContent = `pH ${probeChemistry.pH.toFixed(2)}`;
    els.curveSpeciesVolume.textContent = `${probeChemistry.titrantMl.toFixed(2)} mL titrant added`;
    positionProbeTooltip(probeChemistry);
    els.curveSpeciesPopover.hidden = false;
    curveView.setProbe(probeChemistry.titrantMl, probeChemistry.pH);
  } else {
    els.curveSpeciesPopover.hidden = true;
    curveView.setProbe(null, null);
  }

  updateToggleClasses();
  if (state.completed) {
    els.curveInstruction.textContent = reviewing
      ? `Reviewing ${chemistry.titrantMl.toFixed(2)} mL. Hover over a plotted point to inspect its species chart, or drag across plotted points to lock a review point.`
      : 'Titration complete. Hover over any plotted point to inspect its species, or drag across plotted points to lock a review point.';
    els.returnLive.hidden = !reviewing;
    els.controlHelp.textContent = reviewing
      ? 'Review mode keeps the selected point locked when you are not hovering. Hovering another plotted point temporarily previews that point in both the species tooltip and Live Flask.'
      : 'Hover over a plotted point at any time to preview its species chart, Live Flask composition, pH, and titrant volume. Unmeasured portions of the curve do not expose values.';
  } else {
    els.curveInstruction.textContent = 'The curve is created point-by-point as titrant is added. Hover directly over a plotted point to inspect its species chart and microscopic flask state.';
    els.returnLive.hidden = true;
    els.controlHelp.textContent = `Expected equivalence: ${s.equivalenceMl.toFixed(2)} mL. Smaller additions near equivalence reveal the steep part of the curve. Species and flask previews are shown only for points you have actually plotted.`;
  }
}

function updateToggleClasses() {
  document.querySelectorAll('[data-monitor-mode]').forEach((b) => b.classList.toggle('active', b.dataset.monitorMode === state.monitorMode));
  document.querySelectorAll('[data-amount-unit]').forEach((b) => b.classList.toggle('active', b.dataset.amountUnit === state.amountUnit));
  document.querySelectorAll('[data-chart-type]').forEach((b) => b.classList.toggle('active', b.dataset.chartType === state.chartType));
}

function readSetupValues() {
  return {
    stockM: Number(els.stockM.value),
    stockMl: Number(els.stockMl.value),
    waterMl: Number(els.waterMl.value),
    titrantM: Number(els.titrantM.value),
    indicator: els.indicator.value
  };
}

function updateSetupPreview() {
  const values = readSetupValues();
  const setupBase = scenarioById(state.setupScenarioId);
  const validBasics = values.stockM > 0 && values.stockMl > 0 && values.waterMl >= 0 && values.titrantM > 0;
  if (!validBasics) {
    els.setupError.hidden = false;
    els.setupError.textContent = 'Enter positive concentrations and stock volume, and a non-negative water volume.';
    return null;
  }
  const configured = configureExperiment(setupBase, values);
  els.derivedVolume.textContent = `${configured.analyteMl.toFixed(2)} mL`;
  els.derivedConcentration.textContent = `${configured.analyteM.toFixed(4)} M`;
  els.derivedEquivalence.textContent = `${configured.equivalenceMl.toFixed(2)} mL`;
  els.derivedEndpoint.textContent = `${configured.runMaxMl.toFixed(2)} mL titrant`;
  if (configured.equivalenceMl * 2 > 150) {
    els.setupError.hidden = false;
    els.setupError.textContent = 'This setup needs more than 150 mL of titrant to show the full post-equivalence region. Increase titrant concentration or reduce the amount of analyte stock.';
    return null;
  }
  if (configured.analyteMl > 350) {
    els.setupError.hidden = false;
    els.setupError.textContent = 'Keep the prepared analyte volume at or below 350 mL for this simulated flask.';
    return null;
  }
  els.setupError.hidden = true;
  return configured;
}

function openSetup(canCancel = true) {
  const s = scenario();
  state.setupScenarioId = state.scenarioId;
  els.setupScenarioSelect.value = state.setupScenarioId;
  els.setupScenario.textContent = `${baseScenario().analyte} titrated with ${baseScenario().titrant}`;
  els.stockM.value = s.stockM.toFixed(3);
  els.stockMl.value = s.stockMl.toFixed(2);
  els.waterMl.value = s.waterMl.toFixed(2);
  els.titrantM.value = s.titrantM.toFixed(3);
  els.indicator.value = s.indicator;
  els.cancelSetup.hidden = !canCancel;
  els.setupOverlay.hidden = false;
  document.body.classList.add('modal-open');
  updateSetupPreview();
}

function closeSetup() {
  els.setupOverlay.hidden = true;
  document.body.classList.remove('modal-open');
}

els.setupScenarioSelect.addEventListener('change', () => {
  state.setupScenarioId = els.setupScenarioSelect.value;
  const b = scenarioById(state.setupScenarioId);
  els.setupScenario.textContent = `${b.analyte} titrated with ${b.titrant}`;
  els.indicator.value = b.defaultIndicator;
  updateSetupPreview();
});

els.setupForm.addEventListener('input', updateSetupPreview);
els.setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const configured = updateSetupPreview();
  if (!configured) return;
  stopAuto();
  state.scenarioId = state.setupScenarioId;
  state.experiment = configured;
  state.hasStarted = true;
  resetMeasurements();
  closeSetup();
});
els.cancelSetup.addEventListener('click', closeSetup);
els.changeSetup.addEventListener('click', () => openSetup(true));
els.add.addEventListener('click', () => addTitrant());
els.auto.addEventListener('click', toggleAuto);
els.reset.addEventListener('click', resetMeasurements);
els.returnLive.addEventListener('click', returnToLive);
document.querySelectorAll('[data-monitor-mode]').forEach((b) => b.addEventListener('click', () => {
  state.monitorMode = b.dataset.monitorMode;
  render();
}));
document.querySelectorAll('[data-amount-unit]').forEach((b) => b.addEventListener('click', () => {
  state.amountUnit = b.dataset.amountUnit;
  render();
}));
document.querySelectorAll('[data-chart-type]').forEach((b) => b.addEventListener('click', () => {
  state.chartType = b.dataset.chartType;
  render();
}));

resetMeasurements();
openSetup(false);
