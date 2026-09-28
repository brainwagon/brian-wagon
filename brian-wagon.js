/*
 * Brian Wagon — character rig for p5.js.  See character-spec.md.
 *
 * Single file, no dependencies.  Draws through the Canvas 2D context of whatever
 * it is handed: the global-mode sketch (default), a p5 instance, a p5.Graphics,
 * a bare <canvas>, or a CanvasRenderingContext2D.
 *
 * Rig geometry is in units: a 10 x 10 box, origin at ground contact, +y up,
 * drawn facing right.  Placement (x, y = ground contact, scale = px per unit)
 * is in pixels.  All animation is time based and seeded, so the same seed and
 * the same calls with the same dt values give identical frames.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const backOut = (k) => { const m = k - 1; return 1 + 2.70158 * m * m * m + 1.70158 * m * m; };
  const angDiff = (a, b) => ((((a - b + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

  const EASE = {
    linear: (k) => k,
    in: (k) => k * k * k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  };

  // ---------------------------------------------------------------- randomness

  function mix(h, v) {
    h = Math.imul(h ^ (v | 0), 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    h ^= h >>> 13;
    return h >>> 0;
  }

  function hash01(a, b = 0, c = 0, d = 0) {
    let h = mix(mix(mix(mix(0x2545f491, a), b), c), d);
    h = Math.imul(h ^ (h >>> 16), 0x27d4eb2d);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // Smooth value noise in [-1, 1].
  function noise1(seed, x) {
    const i = Math.floor(x), f = x - i;
    return lerp(hash01(seed, i), hash01(seed, i + 1), smooth(f)) * 2 - 1;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const idCache = new Map();
  function sid(s) {
    if (typeof s === 'number') return s;
    let h = idCache.get(s);
    if (h === undefined) {
      h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h >>>= 0;
      idCache.set(s, h);
    }
    return h;
  }

  // -------------------------------------------------------------------- colour

  const col = (hex, a = 1) => {
    const n = parseInt(hex.slice(1), 16);
    return { css: `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`, a };
  };

  const PAL = {
    brain: col('#336699'), brainHi: col('#4D80B3'), brainDeep: col('#2A5580'),
    fluid: col('#A9C4DE', 0.55), sheen: col('#FFFFFF', 0.5),
    glass: col('#FFFFFF', 0.15), glassRim: col('#FFFFFF', 0.45), glint: col('#FFFFFF', 0.65),
    knob: col('#C9D6E2'), plate: col('#8A9199'),
    wagon: col('#C8322B'), wagonShade: col('#9E2620'), tyre: col('#2B2B2B'),
    white: col('#FFFFFF'), pupil: col('#000000'), mouth: col('#1B2B3A'), ink: col('#1B2B3A'),
    bubble: col('#FFFFFF', 0.6), drop: col('#8EC9F0'), gold: col('#F2C230'),
    shadow: col('#000000', 0.22),
  };
  const CONFETTI = ['#F2C230', '#2BB3A3', '#EF6F9C', '#F28C28', '#5B8DEF', '#FFFFFF'].map((h) => col(h).css);

  // ------------------------------------------------------------------ geometry

  const G = {
    wheelR: 0.8, wheelX: 2.2,
    bed: [[-3.0, 1.2], [3.0, 1.2], [3.2, 2.3], [-3.2, 2.3]],
    pivot: [3.0, 1.45], handleLen: 2.4, handleRest: 25 * DEG, handleMove: 45 * DEG,
    plate: [-2.35, 1.3, 2.35, 1.6],
    jarW: 2.1, glassT: 0.08, jarY0: 1.6, shoulder: 6.6, water: 8.0,
    brain: [0, 5.0], face: [0.3, 0.15], eyeDX: 0.5, eyeR: 0.375, mouthY: -0.62,
    brainX: 0.55, brainYLo: -1.1, brainYHi: 1.3,
  };

  function circle(cx, cy, r, n) {
    n = n || clamp(Math.ceil((TAU * r) / 0.06), 10, 90);
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }

  function ellipse(cx, cy, rx, ry, n = 48) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return p;
  }

  // Inclusive arc from a0 to a1 (either direction).
  function arcPts(cx, cy, r, a0, a1, step = 0.07) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }

  // Subdivide straight edges so boil can bend them.
  function densify(poly, step = 0.1, closed = true) {
    const out = [], n = poly.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    if (!closed) out.push(poly[n - 1].slice());
    return out;
  }

  // Open polyline -> closed outline of a stroke.  width is a number or fn(u).
  function ribbon(line, width, caps = true) {
    const n = line.length, s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const L = s[n - 1] || 1;
    const left = [], right = [], nrm = [], ws = [];
    for (let i = 0; i < n; i++) {
      const p = line[Math.max(0, i - 1)], q = line[Math.min(n - 1, i + 1)];
      const tx = q[0] - p[0], ty = q[1] - p[1], len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len;
      const w = (typeof width === 'function' ? width(s[i] / L) : width) / 2;
      nrm.push(Math.atan2(ny, nx));
      ws.push(w);
      left.push([line[i][0] + nx * w, line[i][1] + ny * w]);
      right.push([line[i][0] - nx * w, line[i][1] - ny * w]);
    }
    const out = left;
    const cap = (p, a0, w) => {
      for (let k = 1; k < 6; k++) {
        const a = a0 - (Math.PI * k) / 6;
        out.push([p[0] + w * Math.cos(a), p[1] + w * Math.sin(a)]);
      }
    };
    if (caps) cap(line[n - 1], nrm[n - 1], ws[n - 1]);
    for (let i = n - 1; i >= 0; i--) out.push(right[i]);
    if (caps) cap(line[0], nrm[0] - Math.PI, ws[0]);
    return out;
  }

  function teardrop(cx, cy, s, n = 32) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      p.push([cx + s * 0.8 * Math.sin(t) * Math.sin(t / 2), cy + s * Math.cos(t)]);
    }
    return p;
  }

  function sparkle(cx, cy, s, n = 64) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = s * (0.14 + 0.86 * Math.pow(Math.abs(Math.cos(2 * a)), 6));
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }

  // Lobed side-view silhouette, facing +x.  No internal folds.
  function brainShape() {
    const p = [], n = 140;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
      const top = smooth(clamp((s + 0.35) / 0.4, 0, 1));
      let k = 1 + lerp(0.015 * Math.cos(7 * a), 0.032 * Math.cos(15 * a), top);
      k *= 1 + 0.05 * c;
      const d = angDiff(a, 1.8 * Math.PI);
      k *= 1 - 0.11 * Math.exp(-(d * d) / 0.0144);
      p.push([1.5 * c * k, (s < 0 ? 0.95 : 1.12) * s * k]);
    }
    return p;
  }

  function jarShape(w, y0) {
    return densify([[-w, y0], [w, y0], ...arcPts(0, G.shoulder, w, 0, Math.PI)], 0.12, true);
  }

  const SHAPES = (() => {
    const brain = brainShape();
    const hi = brain.map(([x, y]) => [x * 0.62 - 0.2, y * 0.5 + 0.42]);
    const glintPath = [...densify([[-1.72, 2.6], [-1.72, G.shoulder]], 0.1, false), ...arcPts(0, G.shoulder, 1.72, Math.PI, 0.62 * Math.PI).slice(1)];
    const qhook = [...arcPts(0, 0.28, 0.24, 160 * DEG, -75 * DEG, 0.04), [0.04, -0.12]];
    return {
      brain, hi,
      cerebellum: ellipse(-0.75, -0.72, 0.55, 0.36),
      stem: densify([[-0.35, -0.7], [0.0, -0.72], [-0.05, -1.35], [-0.22, -1.38]], 0.1),
      jarOuter: jarShape(G.jarW, G.jarY0),
      jarInner: jarShape(G.jarW - G.glassT, G.jarY0 + 0.04),
      plate: densify([[G.plate[0], G.plate[1]], [G.plate[2], G.plate[1]], [G.plate[2], G.plate[3]], [G.plate[0], G.plate[3]]], 0.12),
      bed: densify(G.bed, 0.12),
      lip: densify([[-3.25, 2.12], [3.25, 2.12], [3.25, 2.34], [-3.25, 2.34]], 0.12),
      tyre: circle(0, 0, G.wheelR),
      rim: circle(0, 0, 0.58),
      hub: circle(0, 0, 0.17),
      spoke: ribbon(densify([[0, 0], [0.56, 0]], 0.1, false), 0.12),
      knob: [...densify([[-0.13, 8.62], [0.13, 8.62], [0.13, 8.85], [-0.13, 8.85]], 0.08)],
      knobBall: circle(0, 9.0, 0.22),
      glintL: ribbon(glintPath, (u) => 0.02 + 0.13 * Math.sqrt(Math.sin(Math.PI * u)), false),
      glintR: ribbon(arcPts(0, G.shoulder, 1.75, 0.32 * Math.PI, 0.18 * Math.PI), (u) => 0.01 + 0.08 * Math.sin(Math.PI * u), false),
      glintLow: ribbon(densify([[1.76, 2.55], [1.76, 3.4]], 0.1, false), (u) => 0.01 + 0.07 * Math.sin(Math.PI * u), false),
      qhook,
    };
  })();

  // Hand-drawn overlay glyphs, about one unit tall.  g grows the glyph (for the
  // white sticker backing).
  const GLYPH = {
    question: (g) => [ribbon(SHAPES.qhook, 0.16 + 2 * g), circle(0.04, -0.36, 0.095 + g)],
    exclaim: (g) => [densify([[-0.1 - g, 0.55 + g], [0.1 + g, 0.55 + g], [0.045 + g, -0.13 - g], [-0.045 - g, -0.13 - g]], 0.08), circle(0, -0.35, 0.1 + g)],
    zed: (g) => [
      ribbon(densify([[-0.28, 0.28], [0.28, 0.28]], 0.08, false), 0.12 + 2 * g),
      ribbon(densify([[0.28, 0.28], [-0.28, -0.28]], 0.08, false), 0.12 + 2 * g),
      ribbon(densify([[-0.28, -0.28], [0.28, -0.28]], 0.08, false), 0.12 + 2 * g),
    ],
    sparkle: (g) => [sparkle(0, 0, 0.5 + g * 1.4)],
    drop: (g) => [teardrop(0, 0, 0.5 + g * 1.3)],
    dot: (g) => [circle(0, 0, 0.5 + g)],
  };

  // ------------------------------------------------------------------ emotions

  const NEUTRAL = {
    lidUp: 0.06, lidAsym: 0, lidTilt: 0, lidLo: 0, lidLoAsym: 0, lidDroop: 0,
    eyeScale: 1, pupil: 0.42, pupilVis: 1,
    gazeFollow: 1, gazeX: 0, gazeY: 0, diverge: 0,
    dartRate: 0.35, dartAmp: 0.25, tremble: 0,
    autoBlink: 1, blinkDur: 0.16,
    mouthVis: 0, mouthW: 1, curve: 0, open: 0, wave: 0, zig: 0, skew: 0,
    bob: 0.6, bobSpeed: 0.22, sinkY: 0, backX: 0, sway: 0, swaySpeed: 0.3, brainTremble: 0,
    bubbleRate: 0.4,
    bounce: 0, bounceSpeed: 1.6, jiggle: 0, shudder: 0,
    ovSparkle: 0, ovTear: 0, ovQuestion: 0, ovExclaim: 0, ovThought: 0, ovSweat: 0, ovZzz: 0,
  };

  const PRESETS = {
    neutral: {},
    happy: {
      lidUp: 0.05, lidLo: 0.42, pupil: 0.46, mouthVis: 1, curve: 0.9, open: 0.2,
      bob: 0.9, bobSpeed: 0.45, bounce: 0.07, bounceSpeed: 1.8, bubbleRate: 1, ovSparkle: 1,
    },
    sad: {
      lidUp: 0.42, lidTilt: 0.3, pupil: 0.46, gazeY: -0.55, gazeFollow: 0.5, dartRate: 0.08, dartAmp: 0.1,
      blinkDur: 0.3, mouthVis: 1, mouthW: 0.8, curve: -0.8,
      bob: 0.4, bobSpeed: 0.12, sinkY: -0.6, bubbleRate: 0.12, ovTear: 1,
    },
    confused: {
      lidUp: 0.22, lidAsym: 0.26, lidLo: 0.08, lidLoAsym: 0.1, diverge: 1, dartRate: 1.6, dartAmp: 0.4,
      mouthVis: 1, mouthW: 0.9, curve: -0.15, wave: 1, sway: 0.12, swaySpeed: 0.35, ovQuestion: 1,
    },
    excited: {
      lidUp: 0, eyeScale: 1.15, pupil: 0.3, dartRate: 3, dartAmp: 0.35,
      mouthVis: 1, curve: 1, open: 0.75, bob: 1, bobSpeed: 1.1, bubbleRate: 7, jiggle: 1, ovExclaim: 1,
    },
    thinking: {
      lidUp: 0.25, lidAsym: 0.15, gazeFollow: 0.15, gazeX: 0.55, gazeY: 0.6, dartRate: 0.12, dartAmp: 0.08,
      mouthVis: 0.85, mouthW: 0.6, curve: -0.1, skew: 1,
      bob: 0.5, bobSpeed: 0.15, sway: 0.06, swaySpeed: 0.1, bubbleRate: 0.3, ovThought: 1,
    },
    celebrating: {
      lidUp: 0, lidLo: 0.78, pupilVis: 0, autoBlink: 0, mouthVis: 1, curve: 1, open: 1,
      bob: 1, bobSpeed: 0.9, bounce: 0.1, bounceSpeed: 2.2, bubbleRate: 5, ovSparkle: 1,
    },
    fearful: {
      lidUp: 0, eyeScale: 1.2, pupil: 0.2, tremble: 0.12, dartRate: 2.2, dartAmp: 0.2,
      mouthVis: 1, mouthW: 0.8, curve: -0.3, open: 0.3, zig: 1,
      bob: 0.3, bobSpeed: 0.3, sinkY: -0.4, backX: -0.4, brainTremble: 0.03, shudder: 0.025,
      bubbleRate: 0.8, ovSweat: 1,
    },
    sleepy: {
      lidUp: 0.68, lidDroop: 0.32, gazeY: -0.4, gazeFollow: 0.3, dartRate: 0.05, dartAmp: 0.1,
      autoBlink: 0.4, blinkDur: 0.7, mouthVis: 0.6, mouthW: 0.3, open: 0.55,
      bob: 0.35, bobSpeed: 0.08, sinkY: -0.8, bubbleRate: 0.15, ovZzz: 1,
    },
  };

  function resolveCtx(t) {
    if (!t) t = root;
    if (typeof CanvasRenderingContext2D !== 'undefined' && t instanceof CanvasRenderingContext2D) return t;
    if (t.drawingContext) return t.drawingContext;
    if (typeof t.getContext === 'function') return t.getContext('2d');
    throw new Error('BrianWagon.draw: no 2D drawing context found');
  }

  // --------------------------------------------------------------------- rig

  class BrianWagon {
    constructor(opts = {}) {
      this.opts = Object.assign({
        seed: 1, x: 0, y: 0, scale: 20, facing: 'right', emotion: 'neutral',
        drift: 0.3,          // brain bob envelope, units
        boil: 0.03,          // edge wobble amplitude, units
        boilStep: 1 / 15,    // seconds per boil pose (on twos at 30 fps)
        shadows: false,      // paper-cut drop shadows
        shadowSize: 0.06,    // units
        stickers: true,      // white backing behind overlay glyphs
      }, opts);
      this.seed = this.opts.seed | 0;
      this.rng = mulberry32(this.seed ^ 0x5eed);
      this.x = this.opts.x; this.y = this.opts.y; this.scale = this.opts.scale;
      this.t = 0;

      const f = this.opts.facing === 'left' ? -1 : 1;
      this._faceT = f; this._face = f;
      this.move = null; this._v = 0; this._a = 0; this._wheelA = 0;
      this._hopY = 0; this._hopV = 0;
      this._B = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 };   // brain offset from rest
      this._F = { x: 0, y: 0, vx: 0, vy: 0 };                 // face offset from rest
      this._S = { s: 0, v: 0, w: 0 };                         // waterline slope + wave
      this._H = { a: G.handleRest, v: 0 };                    // handle angle
      this._bobPh = 0; this._swayPh = 0; this._bouncePh = 0;
      this._pupil = [[0, 0, 0, 0], [0, 0, 0, 0]];             // x, y, vx, vy (normalised)
      this._pupilT = [[0, 0], [0, 0]];
      this._dart = [[0, 0], [0, 0]]; this._nextDart = 0.5;
      this._blinkT = -1; this._nextBlink = 1.5 + 2 * this.rng();
      this._look = null;
      this._bubbles = []; this._bubAcc = 0;
      this._confetti = [];
      this.p = Object.assign({}, NEUTRAL);
      this._emo = null;
      this.emotion = 'neutral';
      this.setEmotion(this.opts.emotion, { blend: 0 });
    }

    // ------------------------------------------------------------- control

    setEmotion(name, { intensity = 1, blend = 0.3 } = {}) {
      const preset = PRESETS[name];
      if (!preset) throw new Error(`BrianWagon: unknown emotion "${name}"`);
      const to = {};
      for (const k in NEUTRAL) to[k] = lerp(NEUTRAL[k], k in preset ? preset[k] : NEUTRAL[k], intensity);
      if (blend <= 0) { this.p = to; this._emo = null; }
      else this._emo = { from: Object.assign({}, this.p), to, t0: this.t, dur: blend };
      if (name === 'celebrating' && this.emotion !== 'celebrating') {
        this.trigger('confetti'); this.trigger('hop'); this.trigger('bubbles');
      }
      this.emotion = name;
      this.intensity = intensity;
      return this;
    }

    lookAt(x, y) { this._look = x == null ? null : [x, y]; return this; }

    face(dir) { this._faceT = dir === 'left' || dir < 0 ? -1 : 1; return this; }

    setX(x) { this.x = x; this.move = null; this._v = 0; this._a = 0; return this; }

    moveTo(x, seconds = 1.5, { ease = 'inOut', face = true } = {}) {
      this.move = { x0: this.x, x1: x, t0: this.t, dur: Math.max(seconds, 1e-3), ease: EASE[ease] || EASE.inOut };
      if (face && x !== this.x) this._faceT = Math.sign(x - this.x);
      return this;
    }

    trigger(name) {
      const r = this.rng;
      if (name === 'blink') this._blinkT = 0;
      else if (name === 'hop') {
        if (this._hopY <= 0 && this._hopV <= 0) {
          this._hopV = 6.5; this._B.vy -= 1.2; this._H.v += 2;
        }
      } else if (name === 'bubbles') {
        for (let i = 0; i < 18; i++) this._spawnBubble();
      } else if (name === 'confetti') {
        const fs = this._face < 0 ? -1 : 1;
        for (let i = 0; i < 70; i++) {
          this._confetti.push({
            wx: this.x / this.scale + (r() - 0.5) * 1.2 * fs, y: 9.0 + this._lift(),
            vx: (r() - 0.5) * 8, vy: 5 + r() * 6,
            rot: r() * TAU, vr: (r() - 0.5) * 14, flip: 4 + r() * 8,
            w: 0.12 + r() * 0.1, h: 0.07 + r() * 0.05,
            col: CONFETTI[Math.floor(r() * CONFETTI.length)],
            age: 0, life: 2.2 + r(),
          });
        }
      } else throw new Error(`BrianWagon: unknown trigger "${name}"`);
      return this;
    }

    get moving() { return Math.abs(this._v) > 0.05; }
    get facing() { return this._faceT < 0 ? 'left' : 'right'; }

    // -------------------------------------------------------------- update

    update(dt) {
      dt = clamp(dt, 0, 0.1);
      if (dt === 0) return this;
      this.t += dt;
      this._updateEmotion();
      this._updateMove(dt);
      this._updateEyes(dt);
      const n = Math.ceil(dt * 240), h = dt / n;
      for (let i = 0; i < n; i++) this._physics(h);
      this._updateParticles(dt);
      return this;
    }

    _updateEmotion() {
      const e = this._emo;
      if (!e) return;
      const k = smooth(clamp((this.t - e.t0) / e.dur, 0, 1));
      for (const key in e.to) this.p[key] = lerp(e.from[key], e.to[key], k);
      if (k >= 1) this._emo = null;
    }

    _updateMove(dt) {
      const xPrev = this.x, m = this.move;
      if (m) {
        const k = clamp((this.t - m.t0) / m.dur, 0, 1);
        this.x = m.x0 + (m.x1 - m.x0) * m.ease(k);
        if (k >= 1) this.move = null;
      }
      const du = (this.x - xPrev) / this.scale;
      const v = du / dt;
      this._a += ((v - this._v) / dt - this._a) * Math.min(1, dt * 25);
      this._v = v;
      this._wheelA -= (du * (this._face < 0 ? -1 : 1)) / G.wheelR;

      const d = this._faceT - this._face, step = dt / 0.12;
      this._face = Math.abs(d) <= step ? this._faceT : this._face + Math.sign(d) * step;
    }

    _updateEyes(dt) {
      const P = this.p, r = this.rng, t = this.t;

      if (this._blinkT >= 0 && (this._blinkT += dt) > P.blinkDur) this._blinkT = -1;
      if (P.autoBlink > 0.05) {
        if (t >= this._nextBlink) {
          this._blinkT = 0;
          this._nextBlink = t + (2.5 + 3.5 * r()) / P.autoBlink;
        }
      } else this._nextBlink = t + 1;

      if (P.dartRate > 0.01) {
        if (this._nextDart - t > 3 / P.dartRate) this._nextDart = t + r() / P.dartRate;
        if (t >= this._nextDart) {
          const disk = () => { const a = r() * TAU, m = Math.sqrt(r()); return [m * Math.cos(a), m * Math.sin(a)]; };
          this._dart[0] = disk();
          this._dart[1] = P.diverge > 0.5 ? disk() : this._dart[0];
          this._nextDart = t + Math.max(0.12, -Math.log(1 - r()) / P.dartRate);
        }
      }

      const look = this._look ? this._toLocal(this._look[0], this._look[1]) : null;
      const idle = [noise1(this.seed + 21, t * 0.25) * 0.55, noise1(this.seed + 22, t * 0.2) * 0.35];
      const div = [[-0.5, 0.35], [0.5, -0.35]];
      for (let i = 0; i < 2; i++) {
        let g;
        if (look) {
          const ex = G.brain[0] + this._F.x + G.face[0] + (i ? 1 : -1) * G.eyeDX;
          const ey = G.brain[1] + this._F.y + G.face[1];
          const vx = look[0] - ex, vy = look[1] - ey, m = Math.hypot(vx, vy) || 1;
          const k = Math.min(1, m / 2.5) / m;
          g = [vx * k, vy * k];
        } else g = idle.slice();
        g[0] = g[0] * P.gazeFollow + P.gazeX + P.diverge * div[i][0] + this._dart[i][0] * P.dartAmp;
        g[1] = g[1] * P.gazeFollow + P.gazeY + P.diverge * div[i][1] + this._dart[i][1] * P.dartAmp;
        if (P.tremble > 0) {
          g[0] += noise1(this.seed + 31 + i, t * 25) * P.tremble;
          g[1] += noise1(this.seed + 41 + i, t * 25) * P.tremble;
        }
        const m = Math.hypot(g[0], g[1]);
        if (m > 1) { g[0] /= m; g[1] /= m; }
        this._pupilT[i] = g;
      }
    }

    // Pixel scene point -> rig units (mirrored when facing left).
    _toLocal(px, py) {
      const fs = this._face < 0 ? -1 : 1;
      return [((px - this.x) / this.scale) * fs, (this.y - py) / this.scale - this._lift()];
    }

    _lift() { return this._hopY + this.p.bounce * Math.abs(Math.sin(Math.PI * this._bouncePh)); }

    _physics(h) {
      const P = this.p, B = this._B, F = this._F, S = this._S, H = this._H;
      // Acceleration felt inside the jar, soft-limited so brisk moves don't
      // pin the brain, fluid and handle against their stops.
      const aL = 6 * Math.tanh((this._a * (this._face < 0 ? -1 : 1)) / 6);
      this._bobPh += h * P.bobSpeed;
      this._swayPh += h * P.swaySpeed;
      this._bouncePh += h * P.bounceSpeed;

      // Brain: floats toward a bobbing target, lags behind the wagon.
      const bob = this.opts.drift * P.bob;
      let tx = P.backX + bob * 0.45 * Math.sin(TAU * this._bobPh * 0.61 + 1.3);
      let ty = P.sinkY + bob * Math.sin(TAU * this._bobPh);
      if (P.brainTremble > 0) {
        tx += P.brainTremble * noise1(this.seed + 51, this.t * 22);
        ty += P.brainTremble * noise1(this.seed + 52, this.t * 22);
      }
      B.vx += h * (-11.9 * (B.x - tx) - 2.4 * B.vx - aL * 0.5);
      B.vy += h * (-11.9 * (B.y - ty) - 2.4 * B.vy);
      B.x += h * B.vx; B.y += h * B.vy;
      if (Math.abs(B.x) > G.brainX) { B.x = Math.sign(B.x) * G.brainX; B.vx = 0; }
      if (B.y < G.brainYLo || B.y > G.brainYHi) { B.y = clamp(B.y, G.brainYLo, G.brainYHi); B.vy = 0; }
      const tr = P.sway * Math.sin(TAU * this._swayPh) - aL * 0.015;
      B.vr += h * (-9.9 * (B.r - tr) - 2.5 * B.vr);
      B.r = clamp(B.r + h * B.vr, -0.35, 0.35);

      // Face: loosely sprung to the brain.
      F.vx += h * (-47.8 * (F.x - B.x) - 6.2 * F.vx);
      F.vy += h * (-47.8 * (F.y - B.y) - 6.2 * F.vy);
      F.x += h * F.vx; F.y += h * F.vy;

      // Slosh: waterline tilts against acceleration.
      S.v += h * (-52 * S.s - 1.75 * S.v - aL * 2.1);
      S.s = clamp(S.s + h * S.v, -0.35, 0.35);
      S.w *= Math.exp(-h * 1.2);

      // Handle: droops at rest, lifts when pulled, drags on acceleration.
      const ht = this.moving ? G.handleMove : G.handleRest;
      H.v += h * (-66.7 * (H.a - ht) - 5.7 * H.v + aL * 1.5);
      H.a = clamp(H.a + h * H.v, 8 * DEG, 80 * DEG);

      // Hop.
      if (this._hopY > 0 || this._hopV > 0) {
        this._hopV -= 36 * h;
        this._hopY += this._hopV * h;
        if (this._hopY <= 0) {
          this._hopY = 0; this._hopV = 0;
          B.vy -= 1.4; S.w = 0.1; H.v -= 3;
        }
      }

      // Pupils: quick, well-damped saccades.
      for (let i = 0; i < 2; i++) {
        const p = this._pupil[i], g = this._pupilT[i];
        p[2] += h * (-1400 * (p[0] - g[0]) - 67 * p[2]);
        p[3] += h * (-1400 * (p[1] - g[1]) - 67 * p[3]);
        p[0] += h * p[2]; p[1] += h * p[3];
      }
    }

    _waterY(x) { return G.water + this._S.s * x + this._S.w * Math.sin(3.3 * x - 6.5 * this.t); }

    _spawnBubble() {
      const r = this.rng;
      this._bubbles.push({
        x: (r() * 2 - 1) * 1.75, y: 2.4 + r() * 0.6, r: 0.04 + r() * 0.08,
        v: 0.5 + r() * 0.6, ph: r() * TAU, front: r() < 0.5, age: 0, id: Math.floor(r() * 1e9),
      });
    }

    _updateParticles(dt) {
      this._bubAcc += this.p.bubbleRate * dt * (0.5 + this.rng());
      while (this._bubAcc >= 1) { this._bubAcc -= 1; if (this._bubbles.length < 80) this._spawnBubble(); }
      this._bubbles = this._bubbles.filter((b) => {
        b.age += dt;
        b.y += (b.v + b.r * 5) * dt;
        b.x += Math.cos(b.age * 5 + b.ph) * 0.12 * dt;
        return b.y + b.r < this._waterY(b.x) - 0.02;
      });
      this._confetti = this._confetti.filter((c) => {
        c.age += dt;
        c.vy = Math.max(c.vy - 14 * dt, -2.5);
        c.vx *= Math.exp(-1.2 * dt);
        c.wx += c.vx * dt; c.y += c.vy * dt;
        c.rot += c.vr * dt;
        return c.age < c.life;
      });
    }

    // ---------------------------------------------------------------- draw

    // draw(target, {x, y, scale}) — the overrides only move where the rig is
    // drawn (e.g. a 2x still); they don't change its state.
    draw(target, o = {}) {
      const ctx = resolveCtx(target);
      const x = o.x != null ? o.x : this.x, y = o.y != null ? o.y : this.y, s = o.scale != null ? o.scale : this.scale;
      const P = this.p;
      this._step = Math.floor(this.t / this.opts.boilStep + 1e-6);

      const lift = this._lift();
      const shud = P.shudder * noise1(this.seed + 61, this.t * 30);
      const jig = P.jiggle * 0.035 * Math.sin(TAU * 6 * this.t);
      const fx = Math.sin((this._face * Math.PI) / 2);
      const fxs = Math.abs(fx) < 0.03 ? (fx < 0 ? -0.03 : 0.03) : fx;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, -s);

      ctx.save();
      ctx.translate(shud, lift);
      ctx.rotate(jig);
      ctx.scale(fxs, 1);
      this._drawHandle(ctx);
      this._drawJar(ctx);
      this._drawWagon(ctx);
      ctx.restore();

      ctx.save();
      ctx.translate(shud, lift);
      this._drawOverlays(ctx, fx);
      ctx.restore();

      this._drawConfetti(ctx);
      ctx.restore();
      return this;
    }

    _boil(pts, id, amp = this.opts.boil, closed = true) {
      if (amp <= 0) return pts;
      const n = pts.length, h = sid(id), st = this._step;
      const s = new Float64Array(n);
      let L = 0;
      for (let i = 1; i < n; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); s[i] = L; }
      if (closed) L += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
      L = L || 1;
      const lam = [1.4, 0.8, 0.5], wt = [0.55, 0.3, 0.2];
      const cyc = lam.map((l) => (closed ? Math.max(1, Math.round(L / l)) : L / l));
      const ph = lam.map((_, k) => hash01(this.seed, h, k, st) * TAU);
      const jx = (hash01(this.seed, h, 7, st) - 0.5) * amp * 0.6;
      const jy = (hash01(this.seed, h, 8, st) - 0.5) * amp * 0.6;
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const p = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
        const q = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
        const tx = q[0] - p[0], ty = q[1] - p[1], len = Math.hypot(tx, ty) || 1;
        const u = s[i] / L;
        let off = 0;
        for (let k = 0; k < 3; k++) off += wt[k] * Math.sin(TAU * cyc[k] * u + ph[k]);
        off *= amp;
        out[i] = [pts[i][0] - (ty / len) * off + jx, pts[i][1] + (tx / len) * off + jy];
      }
      return out;
    }

    _path(ctx, pts) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }

    // Fill one or more polygons (even-odd, so a second polygon cuts a hole).
    _fill(ctx, polys, c, shadow = true) {
      if (!Array.isArray(polys[0][0])) polys = [polys];
      if (this.opts.shadows && shadow && c.a === 1) {
        const M = ctx.getTransform(), inv = M.inverse();
        const k = this.opts.shadowSize * Math.hypot(M.a, M.b);
        ctx.save();
        ctx.translate(inv.a * k + inv.c * k, inv.b * k + inv.d * k);
        ctx.beginPath();
        for (const p of polys) this._path(ctx, p);
        ctx.fillStyle = PAL.shadow.css;
        ctx.fill('evenodd');
        ctx.restore();
      }
      ctx.beginPath();
      for (const p of polys) this._path(ctx, p);
      ctx.fillStyle = c.css;
      ctx.fill('evenodd');
    }

    _shape(ctx, pts, id, c, shadow = true) {
      const b = this._boil(pts, id);
      this._fill(ctx, b, c, shadow);
      return b;
    }

    _clip(ctx, pts) {
      ctx.beginPath();
      this._path(ctx, pts);
      ctx.clip();
    }

    _drawHandle(ctx) {
      const [px, py] = G.pivot, a = this._H.a, L = G.handleLen;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = px + ca * L, ey = py + sa * L;
      this._shape(ctx, ribbon(densify([[px, py], [ex, ey]], 0.1, false), 0.14), 'handle', PAL.wagon);
      const cx = ex + ca * 0.2, cy = ey + sa * 0.2;
      const ring = [this._boil(ellipse(cx, cy, 0.25, 0.25, 36), 'grip'), this._boil(ellipse(cx, cy, 0.13, 0.13, 24), 'grip')];
      this._fill(ctx, ring, PAL.wagon);
    }

    _drawJar(ctx) {
      const P = this.p, B = this._B, F = this._F;
      this._shape(ctx, SHAPES.plate, 'plate', PAL.plate);
      const outer = this._boil(SHAPES.jarOuter, 'jar');
      const inner = this._boil(SHAPES.jarInner, 'jar');
      this._fill(ctx, inner, PAL.glass, false);

      ctx.save();
      this._clip(ctx, inner);

      const water = [];
      for (let x = 2.3; x >= -2.3 - 1e-9; x -= 0.1) water.push([x, this._waterY(x)]);
      this._shape(ctx, [[-2.3, G.jarY0 - 0.2], [2.3, G.jarY0 - 0.2], ...water], 'fluid', PAL.fluid);
      const sheen = water.map(([x, y]) => [x, y - 0.04]).reverse();
      this._fill(ctx, this._boil(ribbon(sheen, 0.05, false), 'sheen'), PAL.sheen, false);

      for (const b of this._bubbles) if (!b.front) this._drawBubble(ctx, b);

      // Brain.
      ctx.save();
      ctx.translate(G.brain[0] + B.x, G.brain[1] + B.y);
      ctx.rotate(B.r);
      this._shape(ctx, SHAPES.stem, 'stem', PAL.brainDeep);
      this._shape(ctx, SHAPES.cerebellum, 'cerebellum', PAL.brainDeep);
      const brain = this._shape(ctx, SHAPES.brain, 'brain', PAL.brain);
      ctx.save();
      this._clip(ctx, brain);
      this._shape(ctx, SHAPES.hi, 'brainHi', PAL.brainHi, false);
      ctx.restore();
      ctx.restore();

      // Face.
      ctx.save();
      ctx.translate(G.brain[0] + F.x + G.face[0], G.brain[1] + F.y + G.face[1]);
      ctx.rotate(B.r * 0.8);
      this._drawEyes(ctx);
      const mouth = this._mouthPts();
      if (mouth) {
        ctx.save();
        ctx.translate(P.skew * 0.22, G.mouthY);
        this._shape(ctx, mouth, 'mouth', PAL.mouth);
        ctx.restore();
      }
      if (P.ovTear > 0.01) {
        const u = (this.t / 2.2) % 1, r = G.eyeR * P.eyeScale;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - u) / 0.25);
        ctx.translate(-G.eyeDX - r * 0.35, -r * 0.9 - 0.7 * u);
        const sc = 0.28 * backOut(clamp(P.ovTear, 0, 1));
        ctx.scale(sc, sc);
        this._sticker(ctx, GLYPH.drop, 'tear', PAL.drop, sc);
        ctx.restore();
      }
      ctx.restore();

      for (const b of this._bubbles) if (b.front) this._drawBubble(ctx, b);
      ctx.restore();

      // Glass edge, reflections, knob.
      this._fill(ctx, [outer, inner], PAL.glassRim, false);
      this._shape(ctx, SHAPES.glintL, 'glintL', PAL.glint, false);
      this._shape(ctx, SHAPES.glintR, 'glintR', PAL.glint, false);
      this._shape(ctx, SHAPES.glintLow, 'glintLow', PAL.glint, false);
      this._shape(ctx, SHAPES.knob, 'knob', PAL.knob);
      this._shape(ctx, SHAPES.knobBall, 'knobBall', PAL.knob);
    }

    _drawBubble(ctx, b) {
      this._fill(ctx, this._boil(circle(b.x, b.y, b.r, 12), b.id, this.opts.boil * 0.5), PAL.bubble, false);
    }

    // The eye white is cut to its open shape (no lid shapes), so whatever is
    // behind it shows through; an ink lash follows the upper lid edge.  A
    // closed eye is just the lash.
    _drawEyes(ctx) {
      const P = this.p, t = this.t;
      const r = G.eyeR * P.eyeScale;
      const blink = this._blinkT >= 0 ? Math.sin(Math.PI * clamp(this._blinkT / P.blinkDur, 0, 1)) : 0;
      const droop = P.lidDroop * (0.5 + 0.5 * Math.sin(TAU * 0.13 * t));
      const closed = (q) => -0.25 * r - 0.18 * r * (1 - q * q);
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;                // -1 = rear eye, +1 = front eye
        const c0 = clamp(P.lidUp - side * P.lidAsym + droop, 0, 1);
        const c = c0 + (1 - c0) * blink;
        const lo = clamp(P.lidLo - side * P.lidLoAsym, 0, 1);
        const shut = smooth(clamp((c - 0.6) / 0.4, 0, 1));
        const top = [], bot = [], lash = [];
        for (let k = 0, n = 40; k <= n; k++) {
          const x = -r * Math.cos((Math.PI * k) / n), q = x / r;
          const h = Math.sqrt(Math.max(0, r * r - x * x));
          const lid = lerp(r + 0.02, closed(q), c) - P.lidTilt * side * x * Math.min(1, c * 3)
            - 0.12 * r * c * (1 - c) * (1 - q * q);
          const floor = Math.max(-h, lerp(-r - 0.02, closed(q), shut),
            -r - 0.02 + lo * (2 * r + 0.05) * (1 - 0.55 * q * q));
          const yU = Math.min(h, lid), yL = Math.min(floor, yU);
          top.push([x, Math.max(yU, yL)]);
          bot.push([x, yL]);
          if (c > 0.02 && lid <= h && lid >= floor - 1e-6) lash.push([x, lid]);
        }
        ctx.save();
        ctx.translate(side * G.eyeDX, 0);
        const white = this._shape(ctx, top.concat(bot.reverse()), 'eye' + i, PAL.white);
        const pr = r * P.pupil * P.pupilVis;
        if (pr > 0.005 && c < 0.999) {
          ctx.save();
          this._clip(ctx, white);
          const maxOff = r - r * P.pupil - 0.03, p = this._pupil[i];
          this._shape(ctx, circle(p[0] * maxOff, p[1] * maxOff, pr), 'pupil' + i, PAL.pupil);
          ctx.restore();
        }
        if (lash.length > 2) {
          const w = 0.055 * Math.min(1, c * 6);
          this._shape(ctx, ribbon(lash, (u) => w * (0.35 + 0.65 * Math.sin(Math.PI * u))), 'lash' + i, PAL.ink, false);
        }
        ctx.restore();
      }
    }

    _mouthPts() {
      const P = this.p, vis = P.mouthVis;
      if (vis < 0.02) return null;
      const w = 0.34 * P.mouthW * (0.4 + 0.6 * vis);
      const top = [], bot = [], n = 28;
      for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n, x = u * w;
        const e = Math.sqrt(Math.max(0, 1 - Math.pow(u, 6)));
        let yc = P.curve * w * 0.55 * (u * u - 0.4);
        yc += P.wave * 0.05 * Math.sin(u * 2.5 * Math.PI);
        yc += P.zig * 0.06 * (2 / Math.PI) * Math.asin(Math.sin(u * 3 * Math.PI));
        const th = e * (0.065 + P.open * 0.3 * (1 - u * u)) * (0.5 + 0.5 * vis);
        top.push([x, yc * (1 - 0.45 * P.open) + e * 0.02]);
        bot.push([x, yc - th]);
      }
      return top.concat(bot.reverse());
    }

    // Glyph with an optional white sticker backing.  sc = current scale, used
    // to keep boil and backing width constant in rig units.
    _sticker(ctx, build, id, c, sc) {
      const amp = this.opts.boil / Math.max(sc, 0.2);
      if (this.opts.stickers) {
        this._fill(ctx, build(0.06 / Math.max(sc, 0.2)).map((p, j) => this._boil(p, id + 'b' + j, amp)), PAL.white);
      }
      this._fill(ctx, build(0).map((p, j) => this._boil(p, id + j, amp)), c, !this.opts.stickers);
    }

    _drawOverlays(ctx, fx) {
      const P = this.p, t = this.t, B = this._B;
      const fs = fx < 0 ? -1 : 1;
      const ax = B.x * 0.6, ay = B.y * 0.6;
      const put = (id, glyph, c, lx, ly, size, rot, pres, alpha = 1) => {
        if (pres < 0.01 || alpha <= 0) return;
        const sc = size * backOut(clamp(pres, 0, 1));
        if (sc <= 0.005) return;
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.translate((lx + ax) * fx, ly + ay);
        ctx.rotate(rot * fs);
        ctx.scale(sc, sc);
        this._sticker(ctx, glyph, id, c, sc);
        ctx.restore();
      };

      if (P.ovQuestion > 0.01) {
        const q = P.ovQuestion;
        put('q1', GLYPH.question, PAL.ink, 2.7, 8.6, 0.9, 0.15 * Math.sin(TAU * 0.6 * t), q);
        put('q2', GLYPH.question, PAL.ink, 3.35, 9.3, 0.55, -0.2 * Math.sin(TAU * 0.5 * t + 1), clamp(q * 2 - 1, 0, 1));
      }
      if (P.ovExclaim > 0.01) {
        put('ex', GLYPH.exclaim, PAL.ink, 2.7, 8.7 + 0.12 * Math.abs(Math.sin(TAU * 1.6 * t)), 0.95, 0.1, P.ovExclaim);
      }
      if (P.ovSparkle > 0.01) {
        [[2.6, 8.4, 0.55], [-2.6, 7.6, 0.4], [1.5, 9.6, 0.35]].forEach(([x, y, s], i) => {
          const tw = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(TAU * 1.1 * t + i * 2.1));
          put('sp' + i, GLYPH.sparkle, PAL.gold, x, y, s * tw, 0.2 * i, P.ovSparkle);
        });
      }
      if (P.ovThought > 0.01) {
        [[1.8, 9.1, 0.09], [2.25, 9.5, 0.13], [2.8, 9.95, 0.18]].forEach(([x, y, r], i) => {
          const pulse = 1 + 0.15 * Math.sin(TAU * 0.8 * t - i * 0.9);
          put('th' + i, GLYPH.dot, PAL.ink, x, y, 2 * r * pulse, 0, clamp(P.ovThought * 3 - i, 0, 1));
        });
      }
      if (P.ovSweat > 0.01) {
        const u = (t / 1.8) % 1;
        put('sw', GLYPH.drop, PAL.drop, 2.0, 7.5 - 0.4 * u, 0.45, 0, P.ovSweat, Math.min(1, (1 - u) / 0.25));
      }
      if (P.ovZzz > 0.01) {
        for (let i = 0; i < 3; i++) {
          const u = (t * 0.35 + i / 3) % 1;
          const a = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.3);
          put('z' + i, GLYPH.zed, PAL.ink, 1.6 + u * 1.3 + 0.12 * Math.sin(u * TAU), 8.9 + u * 1.5, 0.3 + 0.35 * u, -0.15, P.ovZzz, a);
        }
      }
    }

    _drawConfetti(ctx) {
      const x0 = this.x / this.scale;
      for (const c of this._confetti) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (c.life - c.age) / 0.5);
        ctx.translate(c.wx - x0, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.cos(c.age * c.flip));
        ctx.fillStyle = c.col;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    }

    _drawWagon(ctx) {
      this._shape(ctx, SHAPES.bed, 'bed', PAL.wagon);
      this._shape(ctx, SHAPES.lip, 'lip', PAL.wagonShade);
      this._shape(ctx, circle(G.pivot[0] + 0.05, G.pivot[1] + 0.1, 0.1), 'bolt', PAL.wagonShade);
      [-1, 1].forEach((side, i) => {
        ctx.save();
        ctx.translate(side * G.wheelX, G.wheelR);
        this._shape(ctx, SHAPES.tyre, 'tyre' + i, PAL.tyre);
        this._shape(ctx, SHAPES.rim, 'rim' + i, PAL.wagonShade, false);
        ctx.rotate(this._wheelA);
        for (let k = 0; k < 5; k++) {
          ctx.save();
          ctx.rotate((k * TAU) / 5);
          this._shape(ctx, SHAPES.spoke, 'spoke' + i + k, PAL.wagon, false);
          ctx.restore();
        }
        this._shape(ctx, SHAPES.hub, 'hub' + i, PAL.wagon, false);
        ctx.restore();
      });
    }
  }

  BrianWagon.EMOTIONS = Object.keys(PRESETS);
  BrianWagon.TRIGGERS = ['blink', 'hop', 'confetti', 'bubbles'];
  BrianWagon.PRESETS = PRESETS;
  BrianWagon.NEUTRAL = NEUTRAL;

  if (typeof module === 'object' && module.exports) module.exports = BrianWagon;
  root.BrianWagon = BrianWagon;
})(typeof globalThis !== 'undefined' ? globalThis : this);
