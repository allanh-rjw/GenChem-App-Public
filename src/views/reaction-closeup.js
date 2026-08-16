import { drawMolecule3D, drawProton } from './molecule-3d.js';
import { stageForState } from '../instructional-model.js';

const NET_IONIC = {
  'strong-acid': { reactants: ['Hplus','OH'], products: ['H2O'], equation: 'H⁺ + OH⁻ → H₂O', donor: 0, acceptor: 1 },
  'weak-acid': { reactants: ['HF','OH'], products: ['F','H2O'], equation: 'HF + OH⁻ → F⁻ + H₂O', donor: 0, acceptor: 1 },
  'weak-base': { reactants: ['NH3','Hplus'], products: ['NH4'], equation: 'NH₃ + H⁺ → NH₄⁺', donor: 1, acceptor: 0 }
};

const EQUIVALENCE_EQUILIBRIA = {
  'weak-acid': {
    equation: 'F⁻ + H₂O ⇌ HF + OH⁻',
    forward: { reactants: ['F','H2O'], products: ['HF','OH'], donor: 1, acceptor: 0, name: 'F⁻ hydrolysis' },
    reverse: { reactants: ['HF','OH'], products: ['F','H2O'], donor: 0, acceptor: 1, name: 'reverse proton transfer' }
  },
  'weak-base': {
    equation: 'NH₄⁺ + H₂O ⇌ NH₃ + H₃O⁺',
    forward: { reactants: ['NH4','H2O'], products: ['NH3','H3O'], donor: 0, acceptor: 1, name: 'NH₄⁺ acid reaction' },
    reverse: { reactants: ['NH3','H3O'], products: ['NH4','H2O'], donor: 1, acceptor: 0, name: 'reverse proton transfer' }
  }
};

export class ReactionCloseupView {
  constructor(root) {
    this.root = root;
    this.scenario = null;
    this.state = null;
    this.cycleOrigin = performance.now();
    this.frozen = false;
    this.freezeTime = 0;
    this.renderShell();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="reaction-equation-stack" id="reaction-equation-closeup"></div>
      <div class="reaction-stage-wrap">
        <canvas class="reaction-canvas" aria-label="Magnified three-dimensional acid-base reaction animation"></canvas>
        <div class="reaction-stage-label" id="reaction-stage-label">Net ionic reaction</div>
      </div>`;
    this.stage = this.root.querySelector('.reaction-stage-wrap');
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.equation = this.root.querySelector('#reaction-equation-closeup');
    this.label = this.root.querySelector('#reaction-stage-label');
  }

  resize() {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.dpr = dpr;
  }

  setFrozen(frozen) {
    if (frozen && !this.frozen) this.freezeTime = performance.now();
    if (!frozen && this.frozen) this.cycleOrigin += performance.now() - this.freezeTime;
    this.frozen = Boolean(frozen);
  }

  setState(scenario, state) {
    const changedScenario = this.scenario?.kind !== scenario.kind;
    this.scenario = scenario;
    this.state = state;
    if (changedScenario) this.cycleOrigin = performance.now();
    const net = NET_IONIC[scenario.kind];
    const eq = EQUIVALENCE_EQUILIBRIA[scenario.kind];
    const atEquivalence = stageForState(scenario, state) === 'equivalence';
    const equilibriumRow = eq && atEquivalence
      ? `<div class="reaction-equation-row" data-reaction-row="equilibrium"><span>Dynamic equilibrium at equivalence</span><strong>${eq.equation}</strong></div>`
      : '';
    this.equation.innerHTML = `<div class="reaction-equation-row" data-reaction-row="neutralization"><span>Net ionic titration reaction</span><strong>${net.equation}</strong></div>${equilibriumRow}`;
  }

  trigger() { this.cycleOrigin = performance.now(); }

  animate(time) {
    this.draw(this.frozen ? this.freezeTime : time);
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  setActiveEquation(mode) {
    this.root.querySelectorAll('[data-reaction-row]').forEach((row) => row.classList.toggle('active', row.dataset.reactionRow === mode));
  }

  drawReaction(ctx, reaction, time, progress, { equilibrium = false } = {}) {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const scale = Math.max(42, Math.min(72, w * 0.075));
    const y = h * 0.50;
    const t = Math.max(0, Math.min(1, progress));
    const approach = Math.min(1, t / 0.28);
    const transfer = Math.max(0, Math.min(1, (t - 0.28) / 0.28));
    const separate = Math.max(0, Math.min(1, (t - 0.56) / 0.24));
    const leftRest = w * 0.28, rightRest = w * 0.72, leftMeet = w * 0.435, rightMeet = w * 0.565;
    const leftX = leftRest + (leftMeet - leftRest) * approach;
    const rightX = rightRest + (rightMeet - rightRest) * approach;
    const rotA = [time * 0.00034, time * 0.00049, time * 0.00027];
    const rotB = [time * 0.00041, -time * 0.00037, time * 0.00031];
    const reactantAlpha = Math.max(0, 1 - transfer);
    drawMolecule3D(ctx, reaction.reactants[0], { x: leftX, y }, scale, rotA, -0.1, reactantAlpha);
    drawMolecule3D(ctx, reaction.reactants[1], { x: rightX, y }, scale, rotB, 0.15, reactantAlpha);
    const products = reaction.products.filter(Boolean);
    if (products.length === 1) {
      drawMolecule3D(ctx, products[0], { x: w * 0.5, y }, scale * 1.06, rotA, 0, transfer);
    } else {
      const x1 = w * (0.5 - 0.18 * separate), x2 = w * (0.5 + 0.18 * separate);
      products.forEach((kind, index) => {
        let alpha = transfer;
        if (kind === 'H2O' && t > 0.70) alpha *= Math.max(0.08, 1 - (t - 0.70) / 0.25);
        drawMolecule3D(ctx, kind, { x: index === 0 ? x1 : x2, y }, scale, index === 0 ? rotA : rotB, index === 0 ? -0.08 : 0.10, alpha);
      });
    }
    if (t > 0.28 && t < 0.62) {
      const q = (t - 0.28) / 0.34;
      const donorX = reaction.donor === 0 ? leftMeet : rightMeet;
      const acceptorX = reaction.acceptor === 0 ? leftMeet : rightMeet;
      const direction = reaction.donor === 0 ? 1 : -1;
      const startX = donorX + direction * scale * 0.25;
      const endX = acceptorX - direction * scale * 0.25;
      const arcY = y - Math.sin(q * Math.PI) * scale * 0.50;
      drawProton(ctx, startX + (endX - startX) * q, arcY, Math.max(8, scale * 0.14), Math.sin(q * Math.PI));
    }
    if (equilibrium) {
      if (t < 0.28) this.label.textContent = `${reaction.name}: reactants approach.`;
      else if (t < 0.62) this.label.textContent = `${reaction.name}: proton transfer.`;
      else this.label.textContent = `${reaction.name}: products separate; the reverse reaction also occurs.`;
    } else {
      if (t < 0.28) this.label.textContent = 'Net ionic reaction: reactants approach.';
      else if (t < 0.62) this.label.textContent = 'Net ionic reaction: proton transfer occurs.';
      else this.label.textContent = 'Net ionic reaction: products separate; reaction water fades into the solvent.';
    }
  }

  draw(time) {
    if (!this.ctx || !this.scenario || !this.state || !this.dpr) return;
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const atEquivalence = stageForState(this.scenario, this.state) === 'equivalence';
    const equilibrium = EQUIVALENCE_EQUILIBRIA[this.scenario.kind];
    if (atEquivalence && equilibrium) {
      this.setActiveEquation('equilibrium');
      const cycleMs = 4400;
      const elapsed = Math.max(0, time - this.cycleOrigin);
      const cycle = Math.floor(elapsed / cycleMs);
      const progress = (elapsed % cycleMs) / cycleMs;
      const reaction = cycle % 2 === 0 ? equilibrium.forward : equilibrium.reverse;
      this.drawReaction(ctx, reaction, time, progress, { equilibrium: true });
      return;
    }
    this.setActiveEquation('neutralization');
    const cycleMs = 4000;
    const elapsed = Math.max(0, time - this.cycleOrigin);
    const progress = (elapsed % cycleMs) / cycleMs;
    this.drawReaction(ctx, NET_IONIC[this.scenario.kind], time, progress);
  }
}
