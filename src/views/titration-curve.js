const WIDTH = 920;
const HEIGHT = 650;
const PAD = { left: 78, right: 24, top: 20, bottom: 66 };

function niceTicks(max, count = 5) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + step * .2; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max * .95) ticks.push(max);
  return ticks;
}

export class TitrationCurveView {
  constructor(root, { onScrub, onProbe, onProbeEnd }) {
    this.root = root;
    this.onScrub = onScrub;
    this.onProbe = onProbe;
    this.onProbeEnd = onProbeEnd;
    this.points = [];
    this.completed = false;
    this.selectedMl = null;
    this.probeMl = null;
    this.xMax = 50;
    this.render();
  }

  set(points, { completed = false, selectedMl = null, probeMl = null, xMax = 50 } = {}) {
    this.points = points;
    this.completed = completed;
    this.selectedMl = selectedMl;
    this.probeMl = probeMl;
    this.xMax = Math.max(.1, xMax);
    this.render();
  }

  xScale(v) { return PAD.left + (v / this.xMax) * (WIDTH - PAD.left - PAD.right); }
  yScale(pH) { return PAD.top + ((14 - pH) / 14) * (HEIGHT - PAD.top - PAD.bottom); }

  render() {
    const xs = niceTicks(this.xMax, 5);
    const ys = [0, 2, 4, 6, 7, 8, 10, 12, 14];
    const gridX = xs.map((v) => `<line x1="${this.xScale(v)}" x2="${this.xScale(v)}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" class="grid-line"/><text x="${this.xScale(v)}" y="${HEIGHT - 28}" class="axis-tick" text-anchor="middle">${v < 10 ? Number(v.toFixed(1)) : Number(v.toFixed(0))}</text>`).join('');
    const gridY = ys.map((v) => `<line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${this.yScale(v)}" y2="${this.yScale(v)}" class="grid-line ${v === 7 ? 'neutral-line' : ''}"/><text x="${PAD.left - 16}" y="${this.yScale(v) + 5}" class="axis-tick" text-anchor="end">${v}</text>`).join('');
    const path = this.points.length ? this.points.map((p, i) => `${i ? 'L' : 'M'} ${this.xScale(p.titrantMl).toFixed(2)} ${this.yScale(p.pH).toFixed(2)}`).join(' ') : '';
    const dots = this.points.map((p, index) => `<circle cx="${this.xScale(p.titrantMl)}" cy="${this.yScale(p.pH)}" r="5.5" class="measured-point"><title>${p.titrantMl.toFixed(2)} mL, pH ${p.pH.toFixed(2)}</title></circle>
      <circle cx="${this.xScale(p.titrantMl)}" cy="${this.yScale(p.pH)}" r="22" class="point-hit" data-point-index="${index}" aria-label="${p.titrantMl.toFixed(2)} mL, pH ${p.pH.toFixed(2)}"></circle>`).join('');
    const selected = this.selectedMl == null ? '' : `<line x1="${this.xScale(this.selectedMl)}" x2="${this.xScale(this.selectedMl)}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" class="selection-line"/><circle cx="${this.xScale(this.selectedMl)}" cy="${this.yScale(this.selectedPh ?? 7)}" r="7.5" class="selected-point"/>`;
    const probeX = this.probeMl == null ? PAD.left : this.xScale(this.probeMl);
    const probeY = this.probePh == null ? this.yScale(7) : this.yScale(this.probePh);
    const probe = `<g data-probe-group style="display:${this.probeMl == null ? 'none' : 'block'}"><line data-probe-line x1="${probeX}" x2="${probeX}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" class="probe-line"/><circle data-probe-point cx="${probeX}" cy="${probeY}" r="7" class="probe-point"/></g>`;

    this.root.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Titration curve">
      <rect x="${PAD.left}" y="${PAD.top}" width="${WIDTH - PAD.left - PAD.right}" height="${HEIGHT - PAD.top - PAD.bottom}" rx="10" class="plot-bg"/>
      ${gridX}${gridY}
      <line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${HEIGHT - PAD.bottom}" y2="${HEIGHT - PAD.bottom}" class="axis-line"/>
      <line x1="${PAD.left}" x2="${PAD.left}" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" class="axis-line"/>
      <path d="${path}" class="curve-line"/>${dots}${selected}${probe}
      <text x="${(PAD.left + WIDTH - PAD.right) / 2}" y="${HEIGHT - 8}" class="axis-label" text-anchor="middle">Volume of titrant added (mL)</text>
      <text transform="translate(22 ${(PAD.top + HEIGHT - PAD.bottom) / 2}) rotate(-90)" class="axis-label" text-anchor="middle">pH</text>
    </svg>`;

    this.root.querySelectorAll('[data-point-index]').forEach((hit) => {
      const index = Number(hit.dataset.pointIndex);
      const point = this.points[index];
      if (!point) return;
      const show = () => this.onProbe?.(point.titrantMl);
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', () => this.onProbeEnd?.());
      hit.addEventListener('pointerdown', () => {
        show();
        if (this.completed) this.onScrub?.(point.titrantMl);
      });
    });
  }

  setSelectedPh(pH) { this.selectedPh = pH; }
  setProbePh(pH) { this.probePh = pH; }

  setProbe(ml, pH) {
    this.probeMl = ml;
    this.probePh = pH;
    const group = this.root.querySelector('[data-probe-group]');
    const line = this.root.querySelector('[data-probe-line]');
    const point = this.root.querySelector('[data-probe-point]');
    if (!group || !line || !point) return;
    if (ml == null || pH == null) {
      group.style.display = 'none';
      return;
    }
    const x = this.xScale(ml);
    const y = this.yScale(pH);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    point.setAttribute('cx', x);
    point.setAttribute('cy', y);
    group.style.display = 'block';
  }
}
