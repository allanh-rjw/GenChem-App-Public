import { speciesForMonitor } from '../chemistry.js';

const SUP = { '-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺' };
function superscript(n) { return String(n).split('').map((c) => SUP[c] ?? c).join(''); }

function formatConcentration(value) {
  if (value >= 0.001) return `${value.toFixed(3)} M`;
  if (value >= 1e-6) return `${(value * 1000).toFixed(2)} mM`;
  return value < 1e-13 ? '< 10⁻¹³ M' : `${value.toExponential(2)} M`;
}
function formatMoles(value) {
  if (value >= 0.001) return `${value.toFixed(4)} mol`;
  if (value >= 1e-6) return `${(value * 1000).toFixed(3)} mmol`;
  return `${value.toExponential(2)} mol`;
}
function formatParticles(value) {
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const coefficient = value / 10 ** exponent;
  return `${coefficient.toFixed(3)} × 10${superscript(exponent)}`;
}

function valueFor(d, mode, unit) {
  return mode === 'concentration' ? d.concentration : unit === 'molecules' ? d.particles : d.moles;
}
function labelFor(d, mode, unit) {
  return mode === 'concentration' ? formatConcentration(d.concentration) : unit === 'molecules' ? formatParticles(d.particles) : formatMoles(d.moles);
}

function axisTitle(mode, unit) {
  if (mode === 'concentration') return 'Concentration (M)';
  return unit === 'molecules' ? 'Number of molecules / ions' : 'Amount (mol)';
}

function niceMax(value) {
  if (!(value > 0)) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function axisLabel(value, mode, unit) {
  if (value === 0) return '0';
  if (unit === 'molecules' && mode === 'amount') {
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    const coefficient = value / 10 ** exponent;
    return `${Number(coefficient.toFixed(1))}×10${superscript(exponent)}`;
  }
  if (Math.abs(value) >= 0.01 && Math.abs(value) < 1000) {
    return Number(value.toPrecision(2)).toString();
  }
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const coefficient = value / 10 ** exponent;
  return `${Number(coefficient.toFixed(1))}×10${superscript(exponent)}`;
}

function escapeText(value) {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function horizontalCategoryLines(label) {
  if (label === 'H₂O produced (Δ)') return ['H₂O produced', '(Δ)'];
  return [label];
}

function columnCategoryLines(label) {
  if (label === 'H₂O produced (Δ)') return ['H₂O', 'produced', '(Δ)'];
  return [label];
}

function categoryTextHorizontal(d, x, y) {
  const lines = horizontalCategoryLines(d.label);
  if (lines.length === 1) return `<text x="${x}" y="${y + 6}" class="species-category-label">${escapeText(lines[0])}</text>`;
  return `<text x="${x}" y="${y - 2}" class="species-category-label species-category-label-wrap"><tspan x="${x}" dy="0">${escapeText(lines[0])}</tspan><tspan x="${x}" dy="18">${escapeText(lines[1])}</tspan></text>`;
}

function categoryTextColumn(d, cx, y) {
  const lines = columnCategoryLines(d.label);
  if (lines.length === 1) return `<text x="${cx}" y="${y}" class="species-category-label" text-anchor="middle">${escapeText(lines[0])}</text>`;
  return `<text x="${cx}" y="${y - 12}" class="species-category-label species-category-label-wrap" text-anchor="middle">${lines.map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : 18}">${escapeText(line)}</tspan>`).join('')}</text>`;
}

function renderHorizontal(root, data, mode, unit) {
  const WIDTH = 600;
  const ROW = 43;
  const PAD = { left: 174, right: 86, top: 14, bottom: 52 };
  const HEIGHT = PAD.top + PAD.bottom + data.length * ROW;
  const values = data.map((d) => valueFor(d, mode, unit));
  const maxRaw = Math.max(...values, 0);
  const max = niceMax(maxRaw * 1.08);
  const plotW = WIDTH - PAD.left - PAD.right;
  const ticks = Array.from({ length: 5 }, (_, i) => max * i / 4);
  const tickMarkup = ticks.map((v) => {
    const x = PAD.left + (v / max) * plotW;
    return `<line x1="${x}" x2="${x}" y1="${PAD.top - 8}" y2="${HEIGHT - PAD.bottom}" class="species-grid-line"/>
      <text x="${x}" y="${HEIGHT - PAD.bottom + 21}" class="species-axis-tick" text-anchor="middle">${escapeText(axisLabel(v, mode, unit))}</text>`;
  }).join('');

  const rows = data.map((d, i) => {
    const value = valueFor(d, mode, unit);
    const y = PAD.top + i * ROW + ROW / 2;
    const w = maxRaw === 0 ? 0 : Math.max(value > 0 ? 2 : 0, (value / max) * plotW);
    const endX = PAD.left + w;
    const nearEdge = endX > WIDTH - PAD.right - 92;
    const labelX = nearEdge ? endX - 8 : endX + 9;
    const anchor = nearEdge ? 'end' : 'start';
    return `<circle cx="24" cy="${y}" r="7" fill="${d.color}" class="species-swatch-svg"/>
      ${categoryTextHorizontal(d, 40, y)}
      <rect x="${PAD.left}" y="${y - 10}" width="${plotW}" height="20" rx="7" class="species-bar-track-svg"/>
      <rect x="${PAD.left}" y="${y - 10}" width="${w}" height="20" rx="7" fill="${d.color}" class="species-bar-fill-svg"/>
      <text x="${labelX}" y="${y + 6}" text-anchor="${anchor}" class="species-data-label">${escapeText(labelFor(d, mode, unit))}</text>`;
  }).join('');

  root.className = 'species-bars species-chart';
  root.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Species monitor horizontal bar chart">
    ${tickMarkup}${rows}
    <line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${HEIGHT - PAD.bottom}" y2="${HEIGHT - PAD.bottom}" class="species-axis-line"/>
    <text x="${PAD.left + plotW / 2}" y="${HEIGHT - 8}" class="species-axis-title" text-anchor="middle">${escapeText(axisTitle(mode, unit))}</text>
  </svg>`;
}

function renderColumns(root, data, mode, unit) {
  const WIDTH = 600;
  const HEIGHT = 340;
  const PAD = { left: 92, right: 18, top: 42, bottom: 110 };
  const values = data.map((d) => valueFor(d, mode, unit));
  const maxRaw = Math.max(...values, 0);
  const max = niceMax(maxRaw * 1.08);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const ticks = Array.from({ length: 5 }, (_, i) => max * i / 4);
  const band = plotW / data.length;
  const barW = Math.min(58, band * .62);

  const tickMarkup = ticks.map((v) => {
    const y = HEIGHT - PAD.bottom - (v / max) * plotH;
    return `<line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y}" y2="${y}" class="species-grid-line"/>
      <text x="${PAD.left - 12}" y="${y + 5}" class="species-axis-tick" text-anchor="end">${escapeText(axisLabel(v, mode, unit))}</text>`;
  }).join('');

  const columns = data.map((d, i) => {
    const value = valueFor(d, mode, unit);
    const h = maxRaw === 0 ? 0 : Math.max(value > 0 ? 2 : 0, (value / max) * plotH);
    const cx = PAD.left + band * (i + .5);
    const x = cx - barW / 2;
    const y = HEIGHT - PAD.bottom - h;
    const labelY = Math.max(PAD.top - 11, y - 10);
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="7" fill="${d.color}" class="species-bar-fill-svg"/>
      <text x="${cx}" y="${labelY}" class="species-data-label" text-anchor="middle">${escapeText(labelFor(d, mode, unit))}</text>
      <circle cx="${cx}" cy="${HEIGHT - PAD.bottom + 24}" r="6" fill="${d.color}" class="species-swatch-svg"/>
      ${categoryTextColumn(d, cx, HEIGHT - PAD.bottom + 50)}`;
  }).join('');

  root.className = 'species-bars species-chart';
  root.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Species monitor column chart">
    ${tickMarkup}${columns}
    <line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${HEIGHT - PAD.bottom}" y2="${HEIGHT - PAD.bottom}" class="species-axis-line"/>
    <line x1="${PAD.left}" x2="${PAD.left}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" class="species-axis-line"/>
    <text transform="translate(22 ${PAD.top + plotH / 2}) rotate(-90)" class="species-axis-title" text-anchor="middle">${escapeText(axisTitle(mode, unit))}</text>
    <text x="${PAD.left + plotW / 2}" y="${HEIGHT - 9}" class="species-axis-title" text-anchor="middle">Species</text>
  </svg>`;
}

export function renderSpeciesBars(root, scenario, state, { mode = 'concentration', unit = 'moles', chart = 'bar' } = {}) {
  const data = speciesForMonitor(scenario, state);
  if (chart === 'column') renderColumns(root, data, mode, unit);
  else renderHorizontal(root, data, mode, unit);
}
