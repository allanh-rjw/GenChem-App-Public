import { drawMolecule3D, drawProton, moleculeLabel } from './molecule-3d.js';

const NEUTRALIZATION = {
  'strong-acid': { reactants: ['H3O','OH'], products: ['H2O','H2O'], equation: 'H₃O⁺ + OH⁻ → 2 H₂O', donor: 0, acceptor: 1 },
  'weak-acid': { reactants: ['HF','OH'], products: ['F','H2O'], equation: 'HF + OH⁻ → F⁻ + H₂O', donor: 0, acceptor: 1 },
  'weak-base': { reactants: ['NH3','H3O'], products: ['NH4','H2O'], equation: 'NH₃ + H₃O⁺ → NH₄⁺ + H₂O', donor: 1, acceptor: 0 }
};

const EQUILIBRIA = {
  'weak-acid': {
    equation: 'HF + H₂O ⇌ H₃O⁺ + F⁻',
    forward: { reactants: ['HF','H2O'], products: ['F','H3O'], donor: 0, acceptor: 1, name: 'HF dissociation' },
    reverse: { reactants: ['F','H3O'], products: ['HF','H2O'], donor: 1, acceptor: 0, name: 'HF reassociation' }
  },
  'weak-base': {
    equation: 'NH₃ + H₂O ⇌ NH₄⁺ + OH⁻',
    forward: { reactants: ['NH3','H2O'], products: ['NH4','OH'], donor: 1, acceptor: 0, name: 'NH₃ protonation by water' },
    reverse: { reactants: ['NH4','OH'], products: ['NH3','H2O'], donor: 0, acceptor: 1, name: 'NH₄⁺ deprotonation' }
  }
};

export class ReactionCloseupView {
  constructor(root) {
    this.root = root;
    this.scenario = null;
    this.state = null;
    this.triggerAt = performance.now() - 9999;
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
        <div class="reaction-stage-label" id="reaction-stage-label">Add titrant to animate a molecular collision and proton transfer.</div>
      </div>`;
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.equation = this.root.querySelector('#reaction-equation-closeup');
    this.label = this.root.querySelector('#reaction-stage-label');
  }

  resize() {
    const rect = this.root.querySelector('.reaction-stage-wrap').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.dpr = dpr;
  }

  setState(scenario, state) {
    this.scenario = scenario;
    this.state = state;
    const n = NEUTRALIZATION[scenario.kind];
    const eq = EQUILIBRIA[scenario.kind];
    this.equation.innerHTML = `<div class="reaction-equation-row" data-reaction-row="neutralization"><span>Titration reaction</span><strong>${n?.equation || scenario.reaction}</strong></div>${eq ? `<div class="reaction-equation-row" data-reaction-row="equilibrium"><span>Dynamic equilibrium</span><strong>${eq.equation}</strong></div>` : ''}`;
  }

  trigger() {
    this.triggerAt = performance.now();
  }

  animate(time) {
    this.draw(time);
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  setActiveEquation(mode) {
    this.root.querySelectorAll('[data-reaction-row]').forEach((row) => row.classList.toggle('active', row.dataset.reactionRow === mode));
  }

  drawReaction(ctx, reaction, time, progress, { equilibrium = false } = {}) {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const scale = Math.max(32, Math.min(55, w * .055));
    const y = h * .50;
    const leftRest = w * .29;
    const rightRest = w * .71;
    const rotA = [time * .00025, time * .00038, time * .00019];
    const rotB = [time * .00031, -time * .00028, time * .00023];
    const t = Math.max(0, Math.min(1, progress));
    const approach = Math.min(1, t / .30);
    const transfer = Math.max(0, Math.min(1, (t - .30) / .34));
    const separate = Math.max(0, Math.min(1, (t - .64) / .36));
    const leftMeet = w * .43;
    const rightMeet = w * .57;
    const leftX = leftRest + (leftMeet - leftRest) * approach;
    const rightX = rightRest + (rightMeet - rightRest) * approach;
    const productLeftX = leftMeet + (w * .24 - leftMeet) * separate;
    const productRightX = rightMeet + (w * .76 - rightMeet) * separate;
    const productAlpha = transfer;
    const reactantAlpha = 1 - transfer;

    drawMolecule3D(ctx, reaction.reactants[0], { x: leftX, y }, scale, rotA, -.1, reactantAlpha);
    drawMolecule3D(ctx, reaction.reactants[1], { x: rightX, y }, scale, rotB, .15, reactantAlpha);
    drawMolecule3D(ctx, reaction.products[0], { x: productLeftX, y }, scale, rotA, -.1, productAlpha);
    drawMolecule3D(ctx, reaction.products[1], { x: productRightX, y }, scale, rotB, .15, productAlpha);

    if (t > .30 && t < .68) {
      const q = (t - .30) / .38;
      const donorX = reaction.donor === 0 ? leftMeet : rightMeet;
      const acceptorX = reaction.acceptor === 0 ? leftMeet : rightMeet;
      const offset = reaction.donor === 0 ? scale * .26 : -scale * .26;
      const startX = donorX + offset;
      const endX = acceptorX - offset;
      const arcY = y - Math.sin(q * Math.PI) * scale * .42;
      drawProton(ctx, startX + (endX - startX) * q, arcY, Math.max(7, scale * .13), Math.sin(q * Math.PI));
    }

    if (equilibrium) {
      if (t < .30) this.label.textContent = `${reaction.name}: the equilibrium partners diffuse together.`;
      else if (t < .68) this.label.textContent = `${reaction.name}: a proton transfers while the forward and reverse processes continue elsewhere in solution.`;
      else this.label.textContent = `${reaction.name}: products separate. The reverse event will follow, maintaining dynamic equilibrium.`;
    } else {
      if (t < .30) this.label.textContent = 'Reactants diffuse together and adopt a favorable orientation.';
      else if (t < .68) this.label.textContent = 'Proton transfer occurs during the acid-base collision.';
      else this.label.textContent = 'Products separate and continue moving through solution.';
    }
  }

  draw(time) {
    if (!this.ctx || !this.scenario || !this.dpr) return;
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const neutral = NEUTRALIZATION[this.scenario.kind];
    const equilibrium = EQUILIBRIA[this.scenario.kind];
    const neutralAge = time - this.triggerAt;

    if (neutralAge >= 0 && neutralAge < 3200) {
      this.setActiveEquation('neutralization');
      this.drawReaction(ctx, neutral, time, Math.min(1, neutralAge / 2800));
      return;
    }

    if (equilibrium) {
      this.setActiveEquation('equilibrium');
      const cycleMs = 3900;
      const cycle = Math.floor(time / cycleMs);
      const progress = (time % cycleMs) / cycleMs;
      const reaction = cycle % 2 === 0 ? equilibrium.forward : equilibrium.reverse;
      this.drawReaction(ctx, reaction, time, progress, { equilibrium: true });
      return;
    }

    this.setActiveEquation('neutralization');
    const scale = Math.max(32, Math.min(55, w * .055));
    const y = h * .50;
    drawMolecule3D(ctx, neutral.reactants[0], { x: w * .29, y }, scale, [time * .00025, time * .00038, time * .00019], -.1, .96);
    drawMolecule3D(ctx, neutral.reactants[1], { x: w * .71, y }, scale, [time * .00031, -time * .00028, time * .00023], .15, .96);
    this.label.textContent = `Magnified reactants: ${moleculeLabel(neutral.reactants[0])} and ${moleculeLabel(neutral.reactants[1])}. Add titrant to replay the proton-transfer event.`;
  }
}
