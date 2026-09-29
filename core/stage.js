/*
 * stage.js — the backdrop and the cut-paper letters, shared by every character drawn in the same frame.
 *
 * A Stage is a Painter (so it boils and fills like the characters do) that reads its clock, seed, options and
 * scale from `ref`, the primary rig.  A character constructs its own Stage for standalone use; a Scene makes one
 * and points every rig at it.
 */
(function (root) {
  'use strict';

  const RigCore = root.RigCore || require('./rig-core.js');
  const {
    TAU, DEG, clamp, lerp, smooth, EASE, mix, hash01, noise1, sid, col, SU, LETTER_COLORS,
    circle, ellipse, arcPts, arcPtsE, densify, ribbon, teardrop, sparkle, Painter,
  } = RigCore;

  // ------------------------------------------------------------ cut-paper letters

  // Lowercase letters built from strokes, in em units (grip = where the pincer holds it, on the
  // stroke near the baseline): baseline 0, x-height 0.62,
  // ascender 1.0.  Each part is a list of polygons filled together (even-odd), so
  // a ring is [outer, inner].  Parts fill separately, so overlaps don't cancel.
  const LETTERS = (() => {
    const SW = 0.17, H = SW / 2, XT = 0.62 - H, B0 = H;
    const st = (pts, w = SW) => [ribbon(densify(pts, 0.05, false), w)];
    const ring = (cx, cy, r) => [circle(cx, cy, r + H, 44), circle(cx, cy, r - H, 36)];
    const bowl = (cx) => ring(cx, 0.31, 0.31 - H);
    const stem = (x, y0, y1) => st([[x, y0], [x, y1]]);
    return {
      b: { adv: 0.72, grip: [0.39, 0.085], parts: [stem(0.09, B0, 1 - H), bowl(0.39)] },
      r: { adv: 0.5, grip: [0.09, 0.17], parts: [stem(0.09, B0, XT), st([[0.09, 0.3], ...arcPts(0.33, 0.3, 0.24, Math.PI, Math.PI / 2, 0.05), [0.44, XT]])] },
      a: { adv: 0.72, grip: [0.3, 0.085], parts: [bowl(0.3), stem(0.53, B0, XT)] },
      i: { adv: 0.3, grip: [0.09, 0.17], parts: [stem(0.09, B0, XT), [circle(0.09, 0.86, 0.115, 24)]] },
      n: { adv: 0.68, grip: [0.09, 0.17], parts: [stem(0.09, B0, XT), st([[0.09, 0.31], ...arcPts(0.31, 0.31, 0.22, Math.PI, 0, 0.05), [0.53, B0]])] },
      // Four separate strokes: one ribbon round sharp corners overlaps itself, and even-odd
      // filling then punches holes in it.
      w: { adv: 0.82, grip: [0.25, 0.13], parts: [[[0.09, XT], [0.25, B0]], [[0.25, B0], [0.41, 0.42]], [[0.41, 0.42], [0.57, B0]], [[0.57, B0], [0.73, XT]]].map((seg) => st(seg, 0.15)) },
      g: { adv: 0.72, grip: [0.3, 0.085], parts: [bowl(0.3), st([[0.53, XT], [0.53, -0.05], ...arcPts(0.33, -0.05, 0.2, 0, -0.85 * Math.PI, 0.05)])] },
      o: { adv: 0.72, grip: [0.36, 0.085], parts: [bowl(0.36)] },
    };
  })();

  class Stage extends Painter {
    constructor(ps, ref) {
      super();
      this.ps = ps;
      this.ref = ref;                                        // the rig whose clock, seed, options and x/scale apply
      this._stage = null;                                    // backdrop settings (setStage)
      this._letters = []; this._lAlpha = 1; this._lFade = null;   // cut-paper letters (scene pixels)
    }

    get opts() { return this.ref.opts; }
    get seed() { return this.ref.seed; }
    get t() { return this.ref.t; }
    get _step() { return this.ref._step; }

    // Advance the letter fade to time t.
    tick(t) {
      if (this._lFade) {
        const f = this._lFade, k = clamp((t - f.t0) / f.dur, 0, 1);
        this._lAlpha = lerp(f.from, f.to, smooth(k));
        if (k >= 1) this._lFade = null;
      }
    }

    // ----- cut-paper letters.  Scene pixels; (x, y) is the centre of the row of
    // letters' x-height band, and size is the em (ascender height) in pixels.
    setLetters(text, { x = 0, y = 0, size = 150, tracking = 0.08, space = 0.45, alpha = 1, colors = LETTER_COLORS } = {}) {
      let w = 0, n = 0;
      const items = [];
      for (const ch of text) {
        if (ch === ' ') { w += space; continue; }
        const g = LETTERS[ch];
        if (!g) throw new Error(`Stage: no cut-paper letter "${ch}"`);
        items.push({ ch, adv: g.adv, off: w, col: colors[n % colors.length] });
        w += g.adv + tracking; n++;
      }
      w -= tracking;
      this._letters = items.map((it) => ({ ch: it.ch, adv: it.adv, k: size, col: it.col, x: x + (it.off + it.adv / 2 - w / 2) * size, y }));
      this._lAlpha = alpha; this._lFade = null;
      return this;
    }

    // A backdrop in scene pixels (1920x1080 by default): floorboards and bunting behind
    // Brian, curtains in front of him at the sides.
    setStage(o = {}) {
      this._stage = Object.assign({ w: 1920, h: 1080, floorTop: 930, floor: true, bunting: true, curtains: true }, o);
      return this;
    }

    letterPos(i) { const L = this._letters[i]; return [L.x, L.y]; }

    fadeLetters(to, seconds = 1) {
      this._lFade = { from: this._lAlpha, to, t0: this.t, dur: Math.max(seconds, 1e-3) };
      return this;
    }

    // Cut-paper letters, in scene pixels, behind everything else.  (x, y, r) place
    // the rig when draw() is given overrides, so letters scale with it.  A gripped
    // letter is left out here: it is drawn between the two jaws.
    _drawLetters(ctx, x, y, r, held = []) {
      this._letters.forEach((_, i) => { if (!held.includes(i)) this._paintLetter(ctx, i, x, y, r); });
    }

    _paintLetter(ctx, i, x, y, r) {
      const prev = this._layer;
      this._layer = 'letters';   // also when painted from inside the arm (brush style keys on the layer)
      try { this._paintLetterIn(ctx, i, x, y, r); } finally { this._layer = prev; }
    }

    _paintLetterIn(ctx, i, x, y, r) {
      const a = clamp(this._lAlpha, 0, 1);
      if (a <= 0.001) return;
      const amp = (this.opts.boil * this.ref.scale * 0.6);
      // One letter's strokes overlap each other, so fading them one by one would
      // double the opacity where they cross.  Below full opacity each letter is
      // drawn once at full strength on a scratch canvas and faded as a whole.
      const M = ctx.getTransform(), d = Math.hypot(M.a, M.b) || 1;
      const L = this._letters[i];
      const g = LETTERS[L.ch], k = L.k * r, cx = x + (L.x - this.ref.x) * r, cy = y + (L.y - this.ref.y) * r;
      const paint = (c) => {
        c.scale(k, -k);
        c.translate(-g.adv / 2, -0.31);
        g.parts.forEach((part, pi) => {
          this._fill(c, part.map((p, j) => this._boil(p, `L${i}p${pi}_${j}`, amp / L.k)), col(L.col), true, 0, `L${i}p${pi}`);
        });
      };
      if (a >= 0.999) {
        ctx.save(); ctx.translate(cx, cy); paint(ctx); ctx.restore();
        return;
      }
      const w = (g.adv + 0.6) * k, h = 1.7 * k;
      const t = this._scratch(Math.ceil(w * d), Math.ceil(h * d));
      const c = t.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, t.width, t.height);
      c.setTransform(d, 0, 0, d, 0, 0);
      c.translate(w / 2, h / 2);
      paint(c);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(t, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    }

    _scratch(w, h) {
      if (!this._scr) this._scr = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      if (this._scr.width !== w) this._scr.width = w;
      if (this._scr.height !== h) this._scr.height = h;
      return this._scr;
    }

    // ---- stage set.  Drawn in y-down scene pixels, in units of SU pixels so the boil
    // has the same feel as everywhere else.
    _stageShape(ctx, pts, id, hex) {
      this._fill(ctx, this._boil(pts, id, this.opts.boil * 0.8), col(hex), false, 0, id);
    }

    _drawStageBack(ctx) {
      const S = this._stage, W = S.w / SU, Ht = S.h / SU, t = this.t, sd = this.seed;
      ctx.save();
      ctx.scale(SU, SU);
      if (S.floor) {
        const ys = [0, 20, 48, 85, 132, 190].map((v) => (S.floorTop + v) / SU);
        const len = [6.5, 7.5, 9, 10.5, 12];
        const tones = ['#2f2740', '#352c47', '#2a2338', '#3a3050'];
        this._stageShape(ctx, densify([[-1, ys[0]], [W + 1, ys[0]], [W + 1, Ht + 2], [-1, Ht + 2]], 0.3), 'floor', '#15121e');
        for (let r = 0; r < 5; r++) {
          let x = -hash01(sd, r, 1) * len[r];
          for (let i = 0; x < W + 1; i++) {
            const l = len[r] * (0.7 + 0.6 * hash01(sd, r, i + 10)), g = 0.09;
            this._stageShape(ctx, densify([[x + g, ys[r] + g], [x + l - g, ys[r] + g], [x + l - g, ys[r + 1] - g], [x + g, ys[r + 1] - g]], 0.25),
              `fb${r}_${i}`, tones[Math.floor(hash01(sd, r, i + 50) * tones.length)]);
            x += l;
          }
        }
        this._stageShape(ctx, densify([[-1, ys[0] - 0.05], [W + 1, ys[0] - 0.05], [W + 1, ys[0] + 0.1], [-1, ys[0] + 0.1]], 0.3), 'floorEdge', '#5a4d72');
      }
      if (S.bunting) {
        const x0 = 4.6, x1 = W - 4.6, y0 = 1.6, sag = 3.2, N = 15;
        const at = (u) => { const x = lerp(x0, x1, u), q = 2 * u - 1; return [x, y0 + sag * (1 - q * q)]; };
        const rope = [];
        for (let i = 0; i <= 60; i++) rope.push(at(i / 60));
        this._stageShape(ctx, ribbon(rope, 0.1), 'rope', '#c9b98e');
        const cols = [...LETTER_COLORS, '#F4EEDD'];
        for (let i = 0; i < N; i++) {
          const u = 0.04 + (0.92 * i) / (N - 1), p = at(u), q = at(u + 0.01), p0 = at(u - 0.01);
          const ang = Math.atan2(q[1] - p0[1], q[0] - p0[0]) * 0.8 + 0.07 * Math.sin(t * 1.1 + i * 0.9);
          const c = Math.cos(ang), sn = Math.sin(ang);
          const tri = densify([[-0.9, 0], [0.9, 0], [0, 2.2]], 0.15).map(([x, y]) => [p[0] + x * c - y * sn, p[1] + x * sn + y * c]);
          this._stageShape(ctx, tri, 'flag' + i, cols[i % cols.length]);
        }
      }
      ctx.restore();
    }

    _drawStageFront(ctx) {
      const S = this._stage;
      if (!S.curtains) return;
      const W = S.w / SU, Ht = S.h / SU;
      ctx.save();
      ctx.scale(SU, SU);
      const e = (y) => 3.6 + 1.4 * Math.pow((y - 15) / 15, 2) + 0.15 * Math.sin(y * 2.2);   // inner edge, pinched at the tie
      const tones = ['#8f1d2f', '#b3283c', '#7a1828', '#a12336', '#8f1d2f', '#c13045'];
      const K = 6;
      const b = (k, y) => (k === 0 ? -1 : k === K ? e(y) : (e(y) * k) / K + 0.14 * Math.sin(y * 1.7 + k * 1.3));
      for (const side of [-1, 1]) {
        const X = (x) => (side < 0 ? x : W - x), tag = side < 0 ? 'L' : 'R';
        for (let k = 0; k < K; k++) {
          const pts = [];
          for (let y = -0.5; y <= Ht + 0.5; y += 0.4) pts.push([X(b(k, y)), y]);
          for (let y = Ht + 0.5; y >= -0.5; y -= 0.4) pts.push([X(b(k + 1, y)), y]);
          this._stageShape(ctx, pts, `cur${tag}${k}`, tones[k]);
        }
        const ex = e(15);
        // The tie-back cord runs in from off screen and ends in a tassel: a ball over a
        // triangular skirt with a jagged fringe.
        const tx = X(ex + 0.3);
        this._stageShape(ctx, ribbon([[X(-1), 13.9], [tx, 15.4]], 0.4), `tie${tag}`, '#e0b040');
        const fringe = [];
        for (let i = 0; i <= 6; i++) fringe.push([tx + 0.7 - (1.4 * i) / 6, i % 2 ? 17.3 : 17.65]);
        this._stageShape(ctx, densify([[tx - 0.22, 15.95], [tx + 0.22, 15.95], ...fringe], 0.15), `tassel${tag}`, '#e0b040');
        this._stageShape(ctx, ribbon([[tx - 0.3, 16.15], [tx + 0.3, 16.15]], 0.13), `neck${tag}`, '#b98a2a');
        this._stageShape(ctx, circle(tx, 15.75, 0.33, 24), `ball${tag}`, '#f0c85a');
      }
      ctx.restore();
    }
  }
  Stage.LETTERS = LETTERS;

  const RigStage = { Stage, LETTERS };
  if (typeof module === 'object' && module.exports) module.exports = RigStage;
  root.RigStage = RigStage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
