import { indicatorState, speciesForMonitor } from '../chemistry.js';
import { proportionalVisualCounts, SOLVENT_CONTEXT_COUNT } from '../visual-species.js';
import { drawMolecule3D, drawProton, moleculeLabel } from './molecule-3d.js';

function seeded(index, salt = 0) {
  const x = Math.sin(index * 977 + salt * 41.17) * 43758.5453;
  return x - Math.floor(x);
}

function concentrationPool(scenario, state) {
  const monitorData = speciesForMonitor(scenario, state);
  const counts = proportionalVisualCounts(monitorData, state);
  const pool = [];

  for (const item of counts) {
    const kind = item.key === 'H2OProduced' ? 'H2O' : item.key;
    for (let i = 0; i < item.count; i += 1) {
      pool.push({
        kind,
        speciesKey: item.key,
        alpha: 0.93,
        contextScale: 1
      });
    }
  }

  // A few faint water molecules provide solvent context without pretending to
  // be proportional to 55 M bulk water. They are deliberately dim and smaller
  // so the full-opacity population continues to match the quantitative tooltip.
  for (let i = 0; i < SOLVENT_CONTEXT_COUNT; i += 1) {
    pool.push({
      kind: 'H2O',
      speciesKey: `SolventH2O-${i}`,
      alpha: 0.24,
      contextScale: 0.72,
      solventContext: true
    });
  }

  return pool;
}

function fractional(value) {
  return value - Math.floor(value);
}


const RELATIVE_MASS = {
  H2O: 18.015,
  H3O: 19.023,
  OH: 17.007,
  HF: 20.006,
  F: 18.998,
  Na: 22.990,
  Cl: 35.45,
  NH3: 17.031,
  NH4: 18.039
};

function speedFactorFor(kind) {
  const mass = RELATIVE_MASS[kind] || 18;
  return Math.max(.72, Math.min(1.48, Math.sqrt(18 / mass)));
}

const LIVE_EQUILIBRIA = {
  'weak-acid': {
    forward: { reactants: ['HF','H2O'], products: ['F','H3O'], donor: 0, acceptor: 1 },
    reverse: { reactants: ['F','H3O'], products: ['HF','H2O'], donor: 1, acceptor: 0 }
  },
  'weak-base': {
    forward: { reactants: ['NH3','H2O'], products: ['NH4','OH'], donor: 1, acceptor: 0 },
    reverse: { reactants: ['NH4','OH'], products: ['NH3','H2O'], donor: 0, acceptor: 1 }
  }
};

export function distributedPosition(index, total) {
  // The flask gets dramatically wider toward the bottom. A uniform y sample
  // therefore looks top-heavy because the same number of particles are placed
  // in narrow and broad horizontal slices. Bias y toward the lower, wider
  // region so the *screen-space density* is much more even across the liquid.
  // Golden-ratio-like sequences keep species intermingled rather than creating
  // visible rows or species-specific bands.
  const n = Math.max(1, total);
  const phase = (index + .5) / n;
  const rawY = fractional(index * 0.75487766625 + phase * .37 + 0.11);
  return {
    x: (fractional(index * 0.61803398875 + 0.17) - .5) * 1.94,
    y: 0.035 + Math.pow(rawY, 0.56) * 0.91,
    z: (fractional(index * 0.56984029099 + 0.43) - .5) * 1.80
  };
}

const MOLECULE_EXTENT_FACTOR = {
  // Conservative projected radii, including the outer atom and a little room
  // for its soft shadow. These are intentionally slightly larger than the
  // mathematical atom-center extents so a rotating model never appears to cut
  // through the glass before the hard clip catches it.
  H2O: 1.22,
  H3O: 1.24,
  OH: 1.24,
  HF: 1.40,
  F: .48,
  Na: .50,
  Cl: .54,
  NH3: 1.24,
  NH4: 1.42
};

export class MolecularFlaskView {
  constructor(root) {
    this.root = root;
    this.particles = [];
    this.scenario = null;
    this.state = null;
    this.lastTime = performance.now();
    this.liquidSurfaceSvg = 260;
    this.renderShell();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="flask-scene">
        <svg class="flask-bg" viewBox="0 0 700 620" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="flaskShadow" x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="14" stdDeviation="13" flood-color="#1b3949" flood-opacity=".19"/>
            </filter>
            <linearGradient id="glassBody" x1="0" x2="1">
              <stop offset="0" stop-color="#95c5d8" stop-opacity=".19"/>
              <stop offset=".14" stop-color="#ffffff" stop-opacity=".50"/>
              <stop offset=".28" stop-color="#dff5fc" stop-opacity=".13"/>
              <stop offset=".70" stop-color="#ffffff" stop-opacity=".08"/>
              <stop offset=".90" stop-color="#9fc8d8" stop-opacity=".23"/>
              <stop offset="1" stop-color="#6f9caf" stop-opacity=".32"/>
            </linearGradient>
            <linearGradient id="rimGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffffff" stop-opacity=".98"/>
              <stop offset=".45" stop-color="#c9e6f1" stop-opacity=".72"/>
              <stop offset="1" stop-color="#648b9c" stop-opacity=".55"/>
            </linearGradient>
            <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop id="liquid-top-stop" offset="0" stop-color="#b6e1f0" stop-opacity=".30"/>
              <stop id="liquid-bottom-stop" offset="1" stop-color="#5598b4" stop-opacity=".38"/>
            </linearGradient>
            <radialGradient id="liquidShine" cx="38%" cy="18%" r="75%">
              <stop offset="0" stop-color="#ffffff" stop-opacity=".72"/>
              <stop offset=".30" stop-color="#ffffff" stop-opacity=".20"/>
              <stop offset="1" stop-color="#8ac4da" stop-opacity="0"/>
            </radialGradient>
            <clipPath id="flaskInterior">
              <path d="M279 42 L421 42 L421 171 L642 477 Q665 507 665 535 C665 568 590 590 350 592 C110 590 35 568 35 535 Q35 507 58 477 L279 171 Z"/>
            </clipPath>
          </defs>
          <ellipse cx="350" cy="574" rx="248" ry="24" fill="#24485a" opacity=".13" filter="url(#flaskShadow)"/>
          <g filter="url(#flaskShadow)">
            <path d="M279 42 L421 42 L421 171 L642 477 Q665 507 665 535 C665 568 590 590 350 592 C110 590 35 568 35 535 Q35 507 58 477 L279 171 Z" fill="url(#glassBody)" stroke="#769aaa" stroke-width="5"/>
            <g clip-path="url(#flaskInterior)">
              <rect id="liquid-body" x="18" y="260" width="664" height="332" fill="url(#liquidGrad)"/>
              <ellipse id="liquid-surface" cx="350" cy="260" rx="205" ry="17" fill="#c9ecf7" fill-opacity=".55" stroke="#75a9bd" stroke-opacity=".74" stroke-width="2.5"/>
              <ellipse id="liquid-shine" cx="350" cy="344" rx="292" ry="198" fill="url(#liquidShine)" opacity=".75"/>
              <ellipse cx="350" cy="548" rx="310" ry="40" fill="#d9f2fb" fill-opacity=".08" stroke="#9cc9da" stroke-opacity=".40" stroke-width="3"/>
              <path d="M48 530 C112 573 225 578 350 578 C475 578 588 573 652 530" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="18"/>
            </g>
          </g>
          <ellipse cx="350" cy="43" rx="74" ry="16" fill="url(#rimGrad)" stroke="#779cac" stroke-width="5"/>
          <ellipse cx="350" cy="44" rx="59" ry="10" fill="#f8fdff" fill-opacity=".82" stroke="#9dc0ce" stroke-width="2"/>
        </svg>
        <canvas class="molecule-canvas" aria-label="Animated three-dimensional ball-and-stick molecular view"></canvas>
        <svg class="flask-glass-overlay" viewBox="0 0 700 620" preserveAspectRatio="none" aria-hidden="true">
          <path d="M270 65 L270 168 L94 455" fill="none" stroke="#ffffff" stroke-opacity=".76" stroke-width="15" stroke-linecap="round"/>
          <path d="M294 77 L294 168 L141 428" fill="none" stroke="#ffffff" stroke-opacity=".27" stroke-width="5" stroke-linecap="round"/>
          <path d="M430 82 L430 168 L606 455" fill="none" stroke="#dff7ff" stroke-opacity=".30" stroke-width="8" stroke-linecap="round"/>
          <path d="M41 532 C93 579 208 590 350 590 C492 590 607 579 659 532" fill="none" stroke="#ffffff" stroke-opacity=".52" stroke-width="9" stroke-linecap="round"/>
          <path d="M75 540 C160 574 248 579 350 579 C452 579 540 574 625 540" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/>
        </svg>
        <div class="flask-indicator" id="flask-indicator"></div>
        <div class="flask-equilibrium" id="flask-equilibrium" hidden>Dynamic equilibrium occurring</div>
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
    // IMPORTANT: use the element's layout dimensions, not getBoundingClientRect().
    // The desktop UI is intentionally rendered with CSS `zoom: .82`. A bounding
    // client rect therefore reports the already-zoomed visual size. Writing that
    // smaller number back as the canvas CSS width/height caused the canvas to be
    // zoomed a *second* time, so the molecular layer covered only ~82% of the SVG
    // flask. That was the root cause of both symptoms: particles appeared to cross
    // the glass outline and the population failed to fill the full liquid region.
    // clientWidth/clientHeight stay in the same pre-zoom coordinate system used
    // by the SVG, so the canvas and flask now share one geometry exactly.
    const layoutWidth = Math.max(1, this.root.clientWidth);
    const layoutHeight = Math.max(1, this.root.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(layoutWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(layoutHeight * dpr));
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.dpr = dpr;
  }

  setState(scenario, state) {
    const oldSignature = this.particles.map((p) => p.speciesKey || p.kind).join(',');
    this.scenario = scenario;
    this.state = state;
    const descriptors = concentrationPool(scenario, state);
    const newSignature = descriptors.map((d) => d.speciesKey).join(',');
    if (oldSignature !== newSignature) {
      const oldBySpecies = new Map();
      this.particles.forEach((p) => {
        const key = p.speciesKey || p.kind;
        if (!oldBySpecies.has(key)) oldBySpecies.set(key, []);
        oldBySpecies.get(key).push(p);
      });
      this.particles = descriptors.map((descriptor, i) => {
        const { kind, speciesKey, alpha = .93, contextScale = 1, solventContext = false } = descriptor;
        const reuse = oldBySpecies.get(speciesKey)?.shift();
        if (reuse) {
          reuse.kind = kind;
          reuse.speciesKey = speciesKey;
          reuse.alpha = alpha;
          reuse.solventContext = solventContext;
          return reuse;
        }
        const pos = distributedPosition(i, descriptors.length);
        return {
          kind,
          speciesKey,
          alpha,
          solventContext,
          ...pos,
          vx: (seeded(i, 4) - .5) * .30 * speedFactorFor(kind),
          vy: (seeded(i, 5) - .5) * .22 * speedFactorFor(kind),
          vz: (seeded(i, 6) - .5) * .24 * speedFactorFor(kind),
          speedFactor: speedFactorFor(kind),
          rx: seeded(i, 7) * Math.PI * 2,
          ry: seeded(i, 8) * Math.PI * 2,
          rz: seeded(i, 9) * Math.PI * 2,
          avx: (seeded(i,10)-.5)*.92,
          avy: (seeded(i,11)-.5)*.92,
          avz: (seeded(i,12)-.5)*.72,
          scale: (.84 + seeded(i,13)*.33) * contextScale,
          seed: seeded(i,14)*Math.PI*2
        };
      });
    }
    this.updateLiquid();
    // Clamp immediately after a composition/volume change. This prevents a
    // newly created or reused model from spending even one frame on top of the
    // glass wall before the animation loop has a chance to bounce it inward.
    const g = this.liquidGeometry();
    this.particles.forEach((p) => this.constrainParticle(p, g, false));
  }

  updateLiquid() {
    if (!this.scenario || !this.state) return;
    const initialMl = this.scenario.analyteMl;
    const maxTotal = initialMl + (this.scenario.runMaxMl || 50);
    const frac = maxTotal > initialMl ? this.state.titrantMl / (maxTotal - initialMl + initialMl) : 0;
    const volumeFrac = Math.min(1, (this.state.totalVolumeL * 1000) / maxTotal);
    this.liquidSurfaceSvg = 300 - volumeFrac * 70;
    this.liquidBody.setAttribute('y', this.liquidSurfaceSvg.toFixed(1));
    this.liquidBody.setAttribute('height', (590 - this.liquidSurfaceSvg).toFixed(1));
    this.liquidSurface.setAttribute('cy', this.liquidSurfaceSvg.toFixed(1));
    this.liquidShine.setAttribute('cy', (this.liquidSurfaceSvg + 90).toFixed(1));
    const ind = indicatorState(this.scenario.indicator, this.state.pH);
    this.topStop.setAttribute('stop-color', ind.top);
    this.topStop.setAttribute('stop-opacity', '1');
    this.bottomStop.setAttribute('stop-color', ind.bottom);
    this.bottomStop.setAttribute('stop-opacity', '1');
    this.liquidSurface.setAttribute('fill', ind.top);
    this.indicatorLabel.textContent = `${ind.name}: ${ind.description}`;
    this.eqLabel.hidden = this.scenario.kind === 'strong-acid';
  }

  liquidGeometry() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const surface = h * (this.liquidSurfaceSvg / 620);
    const bottom = h * (584 / 620);
    return { w, h, surface, bottom, cx: w/2 };
  }

  wallHalfWidthAt(y, g) {
    const ySvg = (y / g.h) * 620;
    if (ySvg <= 477) {
      const t = Math.max(0, Math.min(1, (ySvg - 171) / (477 - 171)));
      // Straight Erlenmeyer sidewall from the neck to the broad base shoulder.
      return ((71 + (292 - 71) * t) / 700) * g.w;
    }
    if (ySvg <= 535) {
      const t = Math.max(0, Math.min(1, (ySvg - 477) / (535 - 477)));
      return ((292 + (315 - 292) * t) / 700) * g.w;
    }
    // Rounded cylindrical-looking base. A fourth-power falloff keeps the usable
    // lower volume broad before curling inward near the very bottom edge.
    const u = Math.max(0, Math.min(1, (ySvg - 535) / 57));
    const half = 315 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 4)));
    return (half / 700) * g.w;
  }

  wallVisualInset(g) {
    // Keep the rendered atoms visibly inside the inner face of the glass. The
    // flask outline itself has thickness, so clipping at the mathematical outer
    // path still makes atoms look as though they are sitting in or through the
    // wall. This inset is deliberately defined in screen pixels so it remains
    // visually stable as the responsive layout changes size.
    return Math.max(10, Math.min(18, g.w * .022));
  }

  liquidInteriorHalfWidthAt(y, g) {
    return Math.max(2, this.wallHalfWidthAt(y, g) - this.wallVisualInset(g));
  }

  particleExtent(p, g) {
    const perspective = 1 / (1 + p.z * .10);
    const drawScale = Math.max(30, g.w * .048) * p.scale * perspective;
    // Use a species-specific projected bounding radius instead of one generic
    // value. The previous estimate was slightly too small for some rotating
    // polyatomic species, allowing atoms to visibly overlap the glass wall.
    const factor = MOLECULE_EXTENT_FACTOR[p.kind] || 1.12;
    return Math.max(10, drawScale * factor * 1.12 + 3);
  }

  constrainParticle(p, g, bounce = false) {
    const spanY = Math.max(1, g.bottom - g.surface);
    const extent = this.particleExtent(p, g);
    const glassClearance = Math.max(8, Math.min(15, g.w * .018));
    const minY = Math.min(.44, Math.max(.02, (extent + glassClearance) / spanY));
    const safeFloor = g.h * (578 / 620);
    const maxY = Math.max(minY + .06, Math.min(.955, (safeFloor - g.surface - extent - glassClearance) / spanY));

    if (p.y < minY || p.y > maxY) {
      if (bounce) p.vy *= -1;
      p.y = Math.max(minY, Math.min(maxY, p.y));
    }

    const y = g.surface + p.y * spanY;
    const wallHalf = this.wallHalfWidthAt(y, g);
    const interiorHalf = this.liquidInteriorHalfWidthAt(y, g);
    const perspective = 1 / (1 + p.z * .10);
    const originHalf = Math.max(1, wallHalf * .90 * perspective);
    // The molecular bounding radius must fit inside the *inner* visual face of
    // the glass, not merely inside the flask's outer SVG path.
    const usableHalf = Math.max(3, interiorHalf - extent - Math.max(2, glassClearance * .25));
    const maxX = Math.max(.02, Math.min(.985, usableHalf / originHalf));
    if (p.x < -maxX || p.x > maxX) {
      if (bounce) p.vx *= -1;
      p.x = Math.max(-maxX, Math.min(maxX, p.x));
    }

    if (p.z < -.90 || p.z > .90) {
      if (bounce) p.vz *= -1;
      p.z = Math.max(-.90, Math.min(.90, p.z));
    }
  }

  animate(time) {
    const dt = Math.min(.035, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.updateParticles(dt, time);
    this.draw(time);
    this.frame = requestAnimationFrame((t) => this.animate(t));
  }

  updateParticles(dt, time) {
    const g = this.liquidGeometry();
    for (const p of this.particles) {
      const t = time * .001;
      // Smooth Brownian-like drift plus a weak circulation field. Lighter
      // molecules and ions move proportionally faster than heavier ones.
      const speed = p.speedFactor || 1;
      p.vx += (Math.sin(t*.73 + p.seed) * .020 + Math.cos(t*.29 + p.seed*1.3) * .012) * dt * speed;
      p.vy += (Math.cos(t*.61 + p.seed*1.7) * .016 + Math.sin(t*.37 + p.seed*.8) * .010) * dt * speed;
      p.vz += (Math.sin(t*.49 + p.seed*2.2) * .018 + Math.cos(t*.33 + p.seed*.6) * .010) * dt * speed;
      p.vx *= .9995; p.vy *= .9995; p.vz *= .9995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.avx * dt * speed;
      p.ry += p.avy * dt * speed;
      p.rz += p.avz * dt * speed;

      this.constrainParticle(p, g, true);
    }

    // Gentle separation prevents the pre-equivalence population from collapsing
    // into one apparent clump. Past equivalence this is intentionally weakened so
    // continued titrant additions are free to make the flask visibly crowded.
    const postEq = this.state && this.state.equivalenceMl > 0
      ? Math.max(0, this.state.titrantMl / this.state.equivalenceMl - 1)
      : 0;
    const separationStrength = Math.max(.15, 1 - postEq * .85);
    for (let i = 0; i < this.particles.length; i += 1) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = (a.y - b.y) * 1.35;
        const dz = (a.z - b.z) * .70;
        const d2 = dx*dx + dy*dy + dz*dz;
        if (d2 <= 0 || d2 > .035) continue;
        const d = Math.sqrt(d2);
        const impulse = (.187 - d) * .30 * separationStrength;
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        a.vx += nx * impulse; b.vx -= nx * impulse;
        a.vy += ny * impulse * .55; b.vy -= ny * impulse * .55;
        a.vz += nz * impulse * .45; b.vz -= nz * impulse * .45;
      }
    }
  }

  traceLiquidClip(ctx, g) {
    // Hard-clip the canvas to an inset liquid-volume silhouette. Previous
    // versions clipped to the flask's outer SVG path. That prevented pixels from
    // leaving the mathematical flask, but atoms could still overlap the visible
    // glass stroke and therefore look as though they crossed the wall. Sampling
    // the same wall geometry used by the particle physics keeps the clip and the
    // bounce boundary in lockstep.
    const inset = this.wallVisualInset(g);
    const top = Math.min(g.bottom - 24, g.surface + Math.max(5, inset * .34));
    const floor = Math.min(g.bottom - Math.max(8, inset * .55), g.h * (578 / 620));
    const steps = 72;

    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const y = top + (floor - top) * (i / steps);
      const half = this.liquidInteriorHalfWidthAt(y, g);
      const x = g.cx + half;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
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
    const perspective = 1 / (1 + p.z*.10);
    return { x: g.cx + p.x * wallHalf * .90 * perspective, y, perspective };
  }

  drawEquilibriumPair(ctx, g, reaction, time, phase, centerX, centerY, span = .13) {
    const baseScale = Math.max(22, g.w * .032);
    const y = g.surface + (g.bottom - g.surface) * centerY;
    const wallHalf = this.wallHalfWidthAt(y, g);
    const center = g.cx + wallHalf * centerX;
    const restGap = Math.max(42, wallHalf * span);
    const meetGap = Math.max(17, restGap * .35);
    const t = Math.max(0, Math.min(1, phase));
    const approach = Math.min(1, t / .30);
    const transfer = Math.max(0, Math.min(1, (t - .30) / .34));
    const separate = Math.max(0, Math.min(1, (t - .64) / .36));
    const leftRest = center - restGap;
    const rightRest = center + restGap;
    const leftMeet = center - meetGap;
    const rightMeet = center + meetGap;
    const leftX = leftRest + (leftMeet - leftRest) * approach;
    const rightX = rightRest + (rightMeet - rightRest) * approach;
    const productLeftX = leftMeet + (leftRest - leftMeet) * separate;
    const productRightX = rightMeet + (rightRest - rightMeet) * separate;
    const rotA = [time * .00033, time * .00041, time * .00022];
    const rotB = [-time * .00028, time * .00036, -time * .00019];
    const reactantAlpha = 1 - transfer;
    const productAlpha = transfer;

    drawMolecule3D(ctx, reaction.reactants[0], { x: leftX, y }, baseScale, rotA, -.15, reactantAlpha * .68);
    drawMolecule3D(ctx, reaction.reactants[1], { x: rightX, y }, baseScale, rotB, .12, reactantAlpha * .68);
    drawMolecule3D(ctx, reaction.products[0], { x: productLeftX, y }, baseScale, rotA, -.15, productAlpha * .68);
    drawMolecule3D(ctx, reaction.products[1], { x: productRightX, y }, baseScale, rotB, .12, productAlpha * .68);

    if (t > .30 && t < .68) {
      const q = (t - .30) / .38;
      const donorX = reaction.donor === 0 ? leftMeet : rightMeet;
      const acceptorX = reaction.acceptor === 0 ? leftMeet : rightMeet;
      const offset = reaction.donor === 0 ? baseScale * .25 : -baseScale * .25;
      const startX = donorX + offset;
      const endX = acceptorX - offset;
      const arcY = y - Math.sin(q * Math.PI) * baseScale * .40;
      drawProton(ctx, startX + (endX - startX) * q, arcY, Math.max(5, baseScale * .11), Math.sin(q * Math.PI) * .72);
    }
  }

  drawDynamicEquilibrium(ctx, g, time) {
    if (!this.scenario || !this.state) return;
    const eq = LIVE_EQUILIBRIA[this.scenario.kind];
    if (!eq) return;

    // Two simultaneous, opposite proton-transfer events preserve the represented
    // net composition while making dynamic equilibrium visible. These transient
    // event models are intentionally smaller and more translucent than the
    // quantitative particle population so they do not masquerade as extra
    // equilibrium abundance.
    const cycleMs = 4300;
    const phase = (time % cycleMs) / cycleMs;
    this.drawEquilibriumPair(ctx, g, eq.forward, time, phase, -.36, .38, .18);
    this.drawEquilibriumPair(ctx, g, eq.reverse, time, phase, .34, .69, .18);
  }

  draw(time) {
    if (!this.ctx || !this.dpr) return;
    const ctx = this.ctx;
    const g = this.liquidGeometry();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.clearRect(0,0,g.w,g.h);
    ctx.save();
    this.traceLiquidClip(ctx,g);
    ctx.clip();

    const sorted = [...this.particles].sort((a,b) => b.z-a.z);
    for (const p of sorted) {
      const o = this.particleOrigin(p,g);
      const scale = Math.max(30, g.w*.048) * p.scale * o.perspective;
      drawMolecule3D(ctx,p.kind,{x:o.x,y:o.y},scale,[p.rx,p.ry,p.rz],p.z,p.alpha ?? .93);
    }

    this.drawDynamicEquilibrium(ctx, g, time);
    ctx.restore();
  }

}

export { moleculeLabel };
