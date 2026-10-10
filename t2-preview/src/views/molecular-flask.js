import { indicatorState } from '../chemistry.js';
import { particleDescriptors, stageForState } from '../instructional-model.js';
import { drawMolecule3D } from './molecule-3d.js';

export const PARTICLE_SCALE_MULTIPLIER = 1.5;

function seeded(index, salt = 0) {
  const x = Math.sin(index * 977 + salt * 41.17) * 43758.5453;
  return x - Math.floor(x);
}
function fractional(value) { return value - Math.floor(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

const RELATIVE_MASS = {
  Hplus: 1.008, H2O: 18.015, H3O: 19.023, OH: 17.007, HF: 20.006,
  F: 18.998, Na: 22.990, Cl: 35.45, NH3: 17.031, NH4: 18.039
};
function speedFactorFor(kind) {
  const mass = RELATIVE_MASS[kind] || 18;
  return Math.max(.72, Math.min(1.48, Math.sqrt(18 / mass)));
}

export function distributedPosition(index, total) {
  const n = Math.max(1, total);
  const phase = (index + .5) / n;
  const rawY = fractional(index * 0.75487766625 + phase * .37 + .11);
  return {
    x: (fractional(index * 0.61803398875 + .17) - .5) * 1.94,
    y: .035 + Math.pow(rawY, .56) * .91,
    z: (fractional(index * 0.56984029099 + .43) - .5) * 1.80
  };
}

const MOLECULE_EXTENT_FACTOR = {
  Hplus:.52, H2O:1.22, H3O:1.24, OH:1.24, HF:1.40,
  F:.48, Na:.50, Cl:.54, NH3:1.24, NH4:1.42
};

export class MolecularFlaskView {
  constructor(root) {
    this.root = root;
    this.particles = [];
    this.scenario = null;
    this.state = null;
    this.lastTime = performance.now();
    this.frozen = false;
    this.showSpectators = true;
    this.liquidSurfaceSvg = 260;
    this.nextMotionId = 1;
    this.renderShell();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  renderShell() {
    this.root.innerHTML = `<div class="flask-scene">
      <svg class="flask-bg" viewBox="0 0 700 620" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="flaskShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="13" flood-color="#1b3949" flood-opacity=".19"/></filter>
          <linearGradient id="glassBody" x1="0" x2="1"><stop offset="0" stop-color="#95c5d8" stop-opacity=".19"/><stop offset=".14" stop-color="#ffffff" stop-opacity=".50"/><stop offset=".28" stop-color="#dff5fc" stop-opacity=".13"/><stop offset=".70" stop-color="#ffffff" stop-opacity=".08"/><stop offset=".90" stop-color="#9fc8d8" stop-opacity=".23"/><stop offset="1" stop-color="#6f9caf" stop-opacity=".32"/></linearGradient>
          <linearGradient id="rimGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".98"/><stop offset=".45" stop-color="#c9e6f1" stop-opacity=".72"/><stop offset="1" stop-color="#648b9c" stop-opacity=".55"/></linearGradient>
          <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1"><stop id="liquid-top-stop" offset="0" stop-color="#b6e1f0" stop-opacity=".30"/><stop id="liquid-bottom-stop" offset="1" stop-color="#5598b4" stop-opacity=".38"/></linearGradient>
          <radialGradient id="liquidShine" cx="38%" cy="18%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".72"/><stop offset=".30" stop-color="#ffffff" stop-opacity=".20"/><stop offset="1" stop-color="#8ac4da" stop-opacity="0"/></radialGradient>
          <clipPath id="flaskInterior"><path d="M279 42 L421 42 L421 171 L642 477 Q665 507 665 535 C665 568 590 590 350 592 C110 590 35 568 35 535 Q35 507 58 477 L279 171 Z"/></clipPath>
        </defs>
        <ellipse cx="350" cy="574" rx="248" ry="24" fill="#24485a" opacity=".13" filter="url(#flaskShadow)"/>
        <g filter="url(#flaskShadow)"><path d="M279 42 L421 42 L421 171 L642 477 Q665 507 665 535 C665 568 590 590 350 592 C110 590 35 568 35 535 Q35 507 58 477 L279 171 Z" fill="url(#glassBody)" stroke="#769aaa" stroke-width="5"/><g clip-path="url(#flaskInterior)"><rect id="liquid-body" x="18" y="260" width="664" height="332" fill="url(#liquidGrad)"/><ellipse id="liquid-surface" cx="350" cy="260" rx="205" ry="17" fill="#c9ecf7" fill-opacity=".55" stroke="#75a9bd" stroke-opacity=".74" stroke-width="2.5"/><ellipse id="liquid-shine" cx="350" cy="344" rx="292" ry="198" fill="url(#liquidShine)" opacity=".75"/><ellipse cx="350" cy="548" rx="310" ry="40" fill="#d9f2fb" fill-opacity=".08" stroke="#9cc9da" stroke-opacity=".40" stroke-width="3"/><path d="M48 530 C112 573 225 578 350 578 C475 578 588 573 652 530" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="18"/></g></g>
        <ellipse cx="350" cy="43" rx="74" ry="16" fill="url(#rimGrad)" stroke="#779cac" stroke-width="5"/><ellipse cx="350" cy="44" rx="59" ry="10" fill="#f8fdff" fill-opacity=".82" stroke="#9dc0ce" stroke-width="2"/>
      </svg>
      <canvas class="molecule-canvas" aria-label="Countable instructional particulate view"></canvas>
      <svg class="flask-glass-overlay" viewBox="0 0 700 620" preserveAspectRatio="none" aria-hidden="true"><path d="M270 65 L270 168 L94 455" fill="none" stroke="#ffffff" stroke-opacity=".76" stroke-width="15" stroke-linecap="round"/><path d="M294 77 L294 168 L141 428" fill="none" stroke="#ffffff" stroke-opacity=".27" stroke-width="5" stroke-linecap="round"/><path d="M430 82 L430 168 L606 455" fill="none" stroke="#dff7ff" stroke-opacity=".30" stroke-width="8" stroke-linecap="round"/><path d="M41 532 C93 579 208 590 350 590 C492 590 607 579 659 532" fill="none" stroke="#ffffff" stroke-opacity=".52" stroke-width="9" stroke-linecap="round"/><path d="M75 540 C160 574 248 579 350 579 C452 579 540 574 625 540" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/></svg>
      <div class="flask-indicator" id="flask-indicator"></div><div class="flask-equilibrium" id="flask-equilibrium" hidden></div>
    </div>`;
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.liquidBody = this.root.querySelector('#liquid-body');
    this.liquidSurface = this.root.querySelector('#liquid-surface');
    this.liquidShine = this.root.querySelector('#liquid-shine');
    this.topStop = this.root.querySelector('#liquid-top-stop');
    this.bottomStop = this.root.querySelector('#liquid-bottom-stop');
    this.indicatorLabel = this.root.querySelector('#flask-indicator');
    this.eqLabel = this.root.querySelector('#flask-equilibrium');
  }

  resize() {
    const w = Math.max(1, this.root.clientWidth);
    const h = Math.max(1, this.root.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.dpr = dpr;
  }

  setFrozen(frozen) { this.frozen = Boolean(frozen); this.lastTime = performance.now(); }
  setShowSpectators(show) {
    const next = Boolean(show);
    if (next === this.showSpectators) return;
    this.showSpectators = next;
    if (this.scenario && this.state) this.setState(this.scenario, this.state);
  }

  setState(scenario, state) {
    const oldBySpecies = new Map();
    for (const p of this.particles) {
      const key = p.speciesKey || p.kind;
      if (!oldBySpecies.has(key)) oldBySpecies.set(key, []);
      oldBySpecies.get(key).push(p);
    }
    this.scenario = scenario;
    this.state = state;
    this.updateLiquid();
    const descriptors = particleDescriptors(scenario, state, { showSpectators: this.showSpectators });
    this.particles = descriptors.map((descriptor, i) => {
      const reuse = oldBySpecies.get(descriptor.speciesKey)?.shift();
      if (reuse) {
        reuse.kind = descriptor.kind;
        reuse.speciesKey = descriptor.speciesKey;
        reuse.alpha = descriptor.alpha;
        reuse.spectator = descriptor.spectator;
        reuse.contextScale = descriptor.contextScale || 1;
        return reuse;
      }
      const motionId = this.nextMotionId++;
      const pos = distributedPosition(i, descriptors.length);
      const speed = speedFactorFor(descriptor.kind);
      return {
        ...descriptor, ...pos, motionId,
        u: seeded(motionId, 21),
        vx: (seeded(motionId, 4) - .5) * .30 * speed,
        vu: (seeded(motionId, 5) - .5) * .22 * speed,
        vz: (seeded(motionId, 6) - .5) * .24 * speed,
        speedFactor: speed,
        rx: seeded(motionId, 7) * Math.PI * 2,
        ry: seeded(motionId, 8) * Math.PI * 2,
        rz: seeded(motionId, 9) * Math.PI * 2,
        avx: (seeded(motionId,10)-.5)*.92,
        avy: (seeded(motionId,11)-.5)*.92,
        avz: (seeded(motionId,12)-.5)*.72,
        scale: (.84 + seeded(motionId,13)*.33) * (descriptor.contextScale || 1),
        seed: seeded(motionId,14)*Math.PI*2
      };
    });
    const g = this.liquidGeometry();
    for (const p of this.particles) {
      if (!Number.isFinite(p.motionId)) p.motionId = this.nextMotionId++;
      if (!Number.isFinite(p.seed)) p.seed = seeded(p.motionId,14)*Math.PI*2;
      if (!Number.isFinite(p.speedFactor)) p.speedFactor = speedFactorFor(p.kind);
      if (!Number.isFinite(p.u)) p.u = seeded(p.motionId, 21);
      if (!Number.isFinite(p.vu)) p.vu = (seeded(p.motionId, 5)-.5)*.22*p.speedFactor;
      p.u = clamp(p.u, 0, 1);
      p.y = this.volumeFractionToY(p.u, g, p);
      this.constrainParticle(p, g, false);
    }
  }

  updateLiquid() {
    if (!this.scenario || !this.state) return;
    const maxTotal = this.scenario.analyteMl + (this.scenario.runMaxMl || 50);
    const volumeFrac = Math.min(1, (this.state.totalVolumeL * 1000) / maxTotal);
    this.liquidSurfaceSvg = 300 - volumeFrac * 70;
    this.liquidBody.setAttribute('y', this.liquidSurfaceSvg.toFixed(1));
    this.liquidBody.setAttribute('height', (590 - this.liquidSurfaceSvg).toFixed(1));
    this.liquidSurface.setAttribute('cy', this.liquidSurfaceSvg.toFixed(1));
    this.liquidShine.setAttribute('cy', (this.liquidSurfaceSvg + 90).toFixed(1));
    const ind = indicatorState(this.scenario.indicator, this.state.pH);
    this.topStop.setAttribute('stop-color', ind.top);
    this.bottomStop.setAttribute('stop-color', ind.bottom);
    this.liquidSurface.setAttribute('fill', ind.top);
    this.indicatorLabel.textContent = `${ind.name}: ${ind.description}`;
    const atEq = stageForState(this.scenario, this.state) === 'equivalence';
    this.eqLabel.hidden = this.scenario.kind === 'strong-acid' || !atEq;
    if (!this.eqLabel.hidden) {
      this.eqLabel.textContent = this.scenario.kind === 'weak-acid'
        ? 'At equivalence: F⁻ + H₂O ⇌ HF + OH⁻'
        : 'At equivalence: NH₄⁺ + H₂O ⇌ NH₃ + H₃O⁺';
    }
  }

  liquidGeometry() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    return { w, h, surface: h * (this.liquidSurfaceSvg / 620), bottom: h * (584 / 620), cx: w / 2 };
  }

  wallHalfWidthAt(y, g) {
    const ySvg = (y / g.h) * 620;
    if (ySvg <= 477) {
      const t = clamp((ySvg - 171) / 306, 0, 1);
      return ((71 + 221 * t) / 700) * g.w;
    }
    if (ySvg <= 535) {
      const t = clamp((ySvg - 477) / 58, 0, 1);
      return ((292 + 23 * t) / 700) * g.w;
    }
    const u = clamp((ySvg - 535) / 57, 0, 1);
    return (315 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 4))) / 700) * g.w;
  }

  wallVisualInset(g) { return Math.max(10, Math.min(18, g.w * .022)); }
  liquidInteriorHalfWidthAt(y, g) { return Math.max(2, this.wallHalfWidthAt(y, g) - this.wallVisualInset(g)); }

  particleExtent(p, g) {
    const perspective = 1 / (1 + (p.z || 0) * .10);
    const drawScale = Math.max(30, g.w * .048) * (p.scale || 1) * perspective * PARTICLE_SCALE_MULTIPLIER;
    return Math.max(10, drawScale * (MOLECULE_EXTENT_FACTOR[p.kind] || 1.12) * 1.12 + 3);
  }

  verticalBounds(p, g) {
    const spanY = Math.max(1, g.bottom - g.surface);
    const extent = this.particleExtent(p, g);
    const glassClearance = Math.max(8, Math.min(15, g.w * .018));
    const minY = Math.min(.44, Math.max(.02, (extent + glassClearance) / spanY));
    const safeFloor = g.h * (578 / 620);
    const maxY = Math.max(minY + .06, Math.min(.955, (safeFloor - g.surface - extent - glassClearance) / spanY));
    return { minY, maxY, extent };
  }

  volumeWeightAt(yNorm, g, p) {
    const { extent } = this.verticalBounds(p, g);
    const y = g.surface + yNorm * (g.bottom - g.surface);
    const radius = Math.max(2, this.liquidInteriorHalfWidthAt(y, g) - extent);
    return radius * radius;
  }

  volumeFractionToY(q, g, p) {
    const { minY, maxY } = this.verticalBounds(p, g);
    const samples = 48;
    const cumulative = [0];
    let total = 0;
    let prevY = minY;
    let prevW = this.volumeWeightAt(prevY, g, p);
    for (let i = 1; i <= samples; i += 1) {
      const y = minY + (maxY - minY) * (i / samples);
      const w = this.volumeWeightAt(y, g, p);
      total += (prevW + w) * .5 * (y - prevY);
      cumulative.push(total);
      prevY = y;
      prevW = w;
    }
    if (total <= 0) return minY + (maxY - minY) * q;
    const target = clamp(q, 0, 1) * total;
    let i = 1;
    while (i < cumulative.length && cumulative[i] < target) i += 1;
    if (i >= cumulative.length) return maxY;
    const a = cumulative[i - 1], b = cumulative[i];
    const local = b > a ? (target - a) / (b - a) : 0;
    const y0 = minY + (maxY - minY) * ((i - 1) / samples);
    const y1 = minY + (maxY - minY) * (i / samples);
    return y0 + (y1 - y0) * local;
  }

  constrainParticle(p, g, bounce = false) {
    p.u = clamp(p.u, 0, 1);
    p.y = this.volumeFractionToY(p.u, g, p);
    const y = g.surface + p.y * (g.bottom - g.surface);
    const extent = this.particleExtent(p, g);
    const wallHalf = this.wallHalfWidthAt(y, g);
    const interiorHalf = this.liquidInteriorHalfWidthAt(y, g);
    const perspective = 1 / (1 + p.z * .10);
    const originHalf = Math.max(1, wallHalf * .90 * perspective);
    const usableHalf = Math.max(3, interiorHalf - extent - 3);
    const maxX = Math.max(.02, Math.min(.985, usableHalf / originHalf));
    if (p.x < -maxX || p.x > maxX) {
      if (bounce) p.vx *= -1;
      p.x = clamp(p.x, -maxX, maxX);
    }
    if (p.z < -.90 || p.z > .90) {
      if (bounce) p.vz *= -1;
      p.z = clamp(p.z, -.90, .90);
    }
  }

  animate(time) {
    const dt = Math.min(.035, Math.max(.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (!this.frozen) this.updateParticles(dt, time);
    this.draw(time);
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  updateParticles(dt, time) {
    const g = this.liquidGeometry();
    const t = time * .001;
    for (const p of this.particles) {
      const speed = p.speedFactor || 1;
      p.vx += (Math.sin(t*.73 + p.seed) * .020 + Math.cos(t*.29 + p.seed*1.3) * .012) * dt * speed;
      p.vu += (Math.cos(t*.61 + p.seed*1.7) * .016 + Math.sin(t*.37 + p.seed*.8) * .010) * dt * speed;
      p.vz += (Math.sin(t*.49 + p.seed*2.2) * .018 + Math.cos(t*.33 + p.seed*.6) * .010) * dt * speed;
      p.vx *= .9995;
      p.vu *= .9995;
      p.vz *= .9995;
      p.x += p.vx * dt;
      p.u += p.vu * dt;
      p.z += p.vz * dt;
      if (p.u < 0 || p.u > 1) {
        p.vu *= -1;
        p.u = clamp(p.u, 0, 1);
      }
      p.rx += p.avx * dt * speed;
      p.ry += p.avy * dt * speed;
      p.rz += p.avz * dt * speed;
      this.constrainParticle(p, g, true);
    }

    const postEq = this.state && this.state.equivalenceMl > 0
      ? Math.max(0, this.state.titrantMl / this.state.equivalenceMl - 1)
      : 0;
    const separationStrength = Math.max(.15, 1 - postEq * .85);
    for (let i = 0; i < this.particles.length; i += 1) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = (a.u - b.u) * 1.35;
        const dz = (a.z - b.z) * .70;
        const d2 = dx*dx + dy*dy + dz*dz;
        if (d2 <= 0 || d2 > .035) continue;
        const d = Math.sqrt(d2);
        const impulse = (.187 - d) * .30 * separationStrength;
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        a.vx += nx * impulse; b.vx -= nx * impulse;
        a.vu += ny * impulse * .55; b.vu -= ny * impulse * .55;
        a.vz += nz * impulse * .45; b.vz -= nz * impulse * .45;
      }
    }
  }

  traceLiquidClip(ctx, g) {
    const inset = this.wallVisualInset(g);
    const top = Math.min(g.bottom - 24, g.surface + Math.max(5, inset * .34));
    const floor = Math.min(g.bottom - Math.max(8, inset * .55), g.h * (578 / 620));
    const steps = 72;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const y = top + (floor - top) * (i / steps);
      const half = this.liquidInteriorHalfWidthAt(y, g);
      const x = g.cx + half;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const y = top + (floor - top) * (i / steps);
      const half = this.liquidInteriorHalfWidthAt(y, g);
      ctx.lineTo(g.cx - half, y);
    }
    ctx.closePath();
  }

  particleOrigin(p, g) {
    const y = g.surface + p.y * (g.bottom - g.surface);
    const wallHalf = this.wallHalfWidthAt(y, g);
    const perspective = 1 / (1 + p.z * .10);
    return { x: g.cx + p.x * wallHalf * .90 * perspective, y, perspective };
  }

  draw(time) {
    if (!this.ctx || !this.dpr) return;
    const ctx = this.ctx, g = this.liquidGeometry();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.save();
    this.traceLiquidClip(ctx, g);
    ctx.clip();
    const sorted = [...this.particles].sort((a, b) => b.z - a.z);
    for (const p of sorted) {
      const o = this.particleOrigin(p, g);
      const scale = Math.max(30, g.w * .048) * (p.scale || 1) * o.perspective * PARTICLE_SCALE_MULTIPLIER;
      drawMolecule3D(ctx, p.kind, { x: o.x, y: o.y }, scale, [p.rx, p.ry, p.rz], p.z, p.alpha ?? .96);
    }
    ctx.restore();
  }
}
