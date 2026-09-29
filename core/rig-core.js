/*
 * rig-core.js — shared infrastructure for the cut-paper character rigs (Brian Wagon, Bluemark, ...).
 *
 * Plain script: defines the global RigCore in a browser and module.exports under Node.  Holds the maths and
 * easing helpers, the seeded randomness and string-id hashing that drive the edge "boil", colour helpers and
 * the shared palette, the polygon geometry helpers, the overlay glyphs, and (below) the classes every
 * character builds on.  See docs/adding-a-character.md.
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
    metal: col('#8A9199'),
    white: col('#FFFFFF'), pupil: col('#000000'), mouth: col('#1B2B3A'), ink: col('#1B2B3A'),
    bubble: col('#FFFFFF', 0.6), drop: col('#8EC9F0'), gold: col('#F2C230'),
    shadow: col('#000000', 0.22),
    red: col('#D93B30'), pink: col('#EF6F9C'), blush: col('#EF6F9C', 0.7),
    teal: col('#2BB3A3'), orange: col('#F28C28'), bulb: col('#FFE680'),
  };
  const SU = 40;   // stage unit, px
  const LETTER_COLORS = ['#2BB3A3', '#EF6F9C', '#F2C230', '#F28C28', '#5B8DEF'];
  const CONFETTI = ['#F2C230', '#2BB3A3', '#EF6F9C', '#F28C28', '#5B8DEF', '#FFFFFF'].map((h) => col(h).css);

  // ------------------------------------------------------------------ geometry

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

  function arcPtsE(cx, cy, rx, ry, a0, a1, step = 0.07) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / step));
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
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
      const r = s * (0.2 + 0.8 * Math.pow(Math.abs(Math.cos(2 * a)), 3));
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }

  // The question-mark hook: the one glyph part that is shared with the geometry helpers above.
  const QHOOK = [...arcPts(0, 0.28, 0.24, 160 * DEG, -75 * DEG, 0.04), [0.04, -0.12]];

  // Hand-drawn overlay glyphs, about one unit tall.  g grows the glyph (for the
  // white sticker backing).
  const GLYPH = {
    question: (g) => [ribbon(QHOOK, 0.16 + 2 * g), circle(0.04, -0.36, 0.095 + g)],
    exclaim: (g) => [densify([[-0.1 - g, 0.55 + g], [0.1 + g, 0.55 + g], [0.045 + g, -0.13 - g], [-0.045 - g, -0.13 - g]], 0.08), circle(0, -0.35, 0.1 + g)],
    zed: (g) => [
      ribbon(densify([[-0.28, 0.28], [0.28, 0.28]], 0.08, false), 0.12 + 2 * g),
      ribbon(densify([[0.28, 0.28], [-0.28, -0.28]], 0.08, false), 0.12 + 2 * g),
      ribbon(densify([[-0.28, -0.28], [0.28, -0.28]], 0.08, false), 0.12 + 2 * g),
    ],
    sparkle: (g) => [sparkle(0, 0, 0.5 + g * 1.4)],
    drop: (g) => [teardrop(0, 0, 0.5 + g * 1.3)],
    dot: (g) => [circle(0, 0, 0.5 + g)],
    heart: () => {
      const p = [];
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * TAU;
        p.push([(16 * Math.pow(Math.sin(t), 3)) / 34,
          (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) / 34]);
      }
      return [p];
    },
    // Manga anger mark: four curved brackets around a gap.
    anger: () => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => {
      const a0 = Math.atan2(-sy, -sx) - Math.PI / 4;
      return ribbon(arcPts(sx * 0.3, sy * 0.3, 0.26, a0, a0 + Math.PI / 2, 0.05), 0.14);
    }),
  };

  function resolveCtx(t) {
    if (!t) t = root;
    if (typeof CanvasRenderingContext2D !== 'undefined' && t instanceof CanvasRenderingContext2D) return t;
    if (t.drawingContext) return t.drawingContext;
    if (typeof t.getContext === 'function') return t.getContext('2d');
    throw new Error('draw: no 2D drawing context found');
  }

  const RigCore = {
    TAU, DEG, clamp, lerp, smooth, backOut, angDiff, EASE,
    mix, hash01, noise1, mulberry32, sid, col, PAL, SU, LETTER_COLORS, CONFETTI,
    circle, ellipse, arcPts, arcPtsE, densify, ribbon, teardrop, sparkle, QHOOK, GLYPH, resolveCtx,
  };

  if (typeof module === 'object' && module.exports) module.exports = RigCore;
  root.RigCore = RigCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
