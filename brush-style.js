// Hand-drawn style backend for BrianWagon, built on p5.brush (standalone build, vendor/brush.js).
//
// The rig hands it boiled polygons plus a colour and it paints each with a brush watercolour fill and an
// ink outline, compositing straight onto the 2D context (so clips, alpha and scratch canvases just work).
//
// Needs the global `brush` (vendor/brush.js) and WebGL2.
(function (root) {
  'use strict';

  const DEFAULTS = {
    fill: { bleed: 0.12, texture: 0.3, border: 0.3, scatter: false, wash: false, gain: 2.2 },   // brush.fillBleed / fillTexture; gain scales the density (paleness); wash = flat fast fill
    ink: { mix: 0.72, alpha: 0.9, weight: 0.0025, min: 1.2, minSize: 0.012, brush: 'pen' }, // outline: fill darkened towards ink; weight is a fraction of frame height
    brushScale: 1,          // extra multiplier on brush.scaleBrushes (auto-scaled by frame height)
    paper: { amount: 0.22, scale: 1 },   // grain laid over the finished frame; amount 0 disables it
    seed: 1,
  };

  const merge = (a, b) => {
    const o = Object.assign({}, a);
    for (const k in b || {}) o[k] = a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], b[k]) : b[k];
    return o;
  };

  const rgbOf = (c) => {
    const m = /rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/.exec(c.css);
    return [+m[1], +m[2], +m[3]];
  };
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  function area(p) {
    let a = 0;
    for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    return a / 2;
  }
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // Even-odd polygons -> [{ outer, holes }].  Nesting depth decides which ring is which.
  function rings(polys) {
    const info = polys.map((p, i) => ({ p, i, depth: polys.reduce((d, q, j) => d + (j !== i && inside(p[0], q) ? 1 : 0), 0) }));
    const outers = info.filter((r) => r.depth % 2 === 0).map((r) => ({ outer: r.p, holes: [], depth: r.depth }));
    for (const h of info.filter((r) => r.depth % 2 === 1)) {
      let best = null;
      for (const o of outers) if (o.depth < h.depth && inside(h.p[0], o.outer) && (!best || o.depth > best.depth)) best = o;
      if (best) best.holes.push(h.p);
    }
    return outers;
  }

  // One simple polygon that covers outer minus holes: each hole is joined to the outer ring by a
  // zero-width bridge between their nearest vertices.  (Used for the fill only; outlines are drawn per ring.)
  function keyhole(outer, holes) {
    let ring = outer.slice();
    if (area(ring) < 0) ring.reverse();
    for (const h0 of holes) {
      const h = h0.slice();
      if (area(h) > 0) h.reverse();
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < ring.length; i++) for (let j = 0; j < h.length; j++) {
        const d = (ring[i][0] - h[j][0]) ** 2 + (ring[i][1] - h[j][1]) ** 2;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      const hs = h.slice(bj).concat(h.slice(0, bj));
      ring = ring.slice(0, bi + 1).concat(hs, [hs[0]], ring.slice(bi));
    }
    return ring;
  }

  // Push a closed polygon outward by d (along averaged vertex normals): stands in for a round-join stroke.
  function offset(p, d) {
    const n = p.length, sgn = area(p) > 0 ? 1 : -1;
    return p.map((q, i) => {
      const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [q[0] + sgn * (ty / l) * d, q[1] - sgn * (tx / l) * d];
    });
  }

  // Tiling paper grain: fine speckle + a few soft fibres, mid-grey so it can be overlaid.
  function makePaper(size, seed) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 60;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < size * 0.9; i++) {
      const x = rnd() * size, y = rnd() * size, a = rnd() * 6.283, l = 4 + rnd() * 14;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
      g.lineWidth = 0.6 + rnd() * 0.8;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
      }
    }
    return c;
  }

  class BrushStyle {
    constructor(opts = {}) {
      if (typeof root.brush === 'undefined') throw new Error('BrushStyle: vendor/brush.js is not loaded');
      this.o = merge(DEFAULTS, opts);
      this._gl = null; this._w = 0; this._h = 0;
      this._paper = null;
      this._b = null;   // 2D scratch canvas for the density -> alpha conversion
    }

    // p5.brush paints on white paper: on a transparent target it writes opaque pixels with the white
    // already mixed in, so opacity comes out as paleness and alpha is all-or-nothing.  So everything
    // is painted in black, which makes each pixel a density (1 - value), and that density is applied
    // as the alpha of the real colour when compositing.
    _ensure(w, h) {
      if (this._gl && this._w === w && this._h === h) return;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      root.brush.load(c);
      root.brush.scaleBrushes((h / 1080) * 3.2 * this.o.brushScale);
      this._gl = c; this._w = w; this._h = h;
      this._clear();
    }

    // Re-target the GL canvas (e.g. for a larger still); it is otherwise sized by the first canvas drawn to.
    resize(w, h) { this._gl = null; this._ensure(w, h); }

    // brush.clear() leaves transparent *white*; follow it with a true transparent clear.
    _clear() {
      root.brush.clear();
      const gl = this._gl.getContext('webgl2');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Fresh randomness for every shape and boil step, stable in between.
    seed(id, step) { root.brush.seed((id * 2654435761 + step * 40503 + this.o.seed * 9973) >>> 0); }

    // Composite the density painted in the GL canvas (region x,y,w,h) onto ctx as colour rgb.
    _composite(ctx, rgb, alpha, x, y, w, h, gain) {
      x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
      w = Math.min(this._w - x, Math.ceil(w)); h = Math.min(this._h - y, Math.ceil(h));
      if (w <= 0 || h <= 0) return;
      if (!this._b) { this._b = document.createElement('canvas'); this._bctx = this._b.getContext('2d'); }
      const B = this._b;
      if (B.width < w || B.height < h) { B.width = Math.max(B.width, w); B.height = Math.max(B.height, h); }
      // One readback straight from GL (rows come bottom-up), converted in place into an ImageData.
      const gl = this._gl.getContext('webgl2');
      if (gl.isContextLost()) throw new Error('BrushStyle: WebGL context lost');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const raw = new Uint8Array(w * h * 4);
      gl.readPixels(x, this._h - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const img = this._bctx.createImageData(w, h), d = img.data;
      const [r, g, b] = rgb, k = alpha * gain;
      for (let row = 0; row < h; row++) {
        let si = (h - 1 - row) * w * 4, di = row * w * 4;
        for (let col = 0; col < w; col++, si += 4, di += 4) {
          // alpha 0 = never painted; otherwise value = paper white minus pigment density
          const t = raw[si + 3] === 0 ? 0 : Math.min(1, ((255 - raw[si]) / 255) * k);
          d[di] = r; d[di + 1] = g; d[di + 2] = b; d[di + 3] = t * 255;
        }
      }
      this._bctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(B, 0, 0, w, h, x, y, w, h);
      ctx.restore();
      this._clear();
    }

    // Paint one even-odd shape: watercolour fill plus (optionally) an ink outline.
    fill(ctx, polys, c, { id = 0, step = 0, outline = true, alpha = 1, grow = 0, gain = 1 } = {}) {
      const cv = ctx.canvas;
      this._ensure(this._w || cv.width, this._h || cv.height);
      const W = this._w, H = this._h;
      const M = ctx.getTransform();
      const T = (p) => p.map(([x, y]) => [M.a * x + M.c * y + M.e - W / 2, M.b * x + M.d * y + M.f - H / 2]);
      const groups = rings((grow > 0 ? polys.map((p) => offset(p, grow)) : polys).map(T));
      const b = root.brush, o = this.o, ink = o.ink;
      const rgb = rgbOf(c), a = alpha * c.a;
      if (a <= 0.003) return;
      const inkRgb = rgb.map((v, i) => v * (1 - ink.mix) + [27, 43, 58][i] * ink.mix);
      groups.forEach((grp, gi) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of grp.outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const size = Math.max(x1 - x0, y1 - y0);
        // Average thickness (2 x area / perimeter): a curved ribbon has a big bounding box but is thin.
        let per = 0;
        for (let i = 0, n = grp.outer.length; i < n; i++) per += Math.hypot(grp.outer[(i + 1) % n][0] - grp.outer[i][0], grp.outer[(i + 1) % n][1] - grp.outer[i][1]);
        const thin = per > 0 ? (2 * Math.abs(area(grp.outer))) / per : size;
        if (size < 1.5) return;
        const m = 8 + 0.12 * size, rx = x0 + W / 2 - m, ry = y0 + H / 2 - m, rw = x1 - x0 + 2 * m, rh = y1 - y0 + 2 * m;
        // Bleed spreads a fixed fraction of the shape's size, so thin shapes get less of it.
        const f = Math.min(1, thin / (0.03 * H)), bleed = o.fill.bleed * f;
        this.seed(id + gi * 7919, step);
        b.noStroke(); b.noHatch(); b.noWash();
        if (o.fill.wash) { b.noFill(); b.wash('#000000', 255); }
        else { b.fill('#000000', 255); b.fillBleed(bleed); b.fillTexture(o.fill.texture * (0.3 + 0.7 * f), o.fill.border * f, o.fill.scatter); }
        b.polygon(grp.holes.length ? keyhole(grp.outer, grp.holes) : grp.outer);
        b.render();
        this._composite(ctx, rgb, a, rx, ry, rw, rh, o.fill.gain * gain);
        if (outline && size > ink.minSize * H) {
          b.noFill(); b.noWash();
          b.set(ink.brush, '#000000', Math.max(ink.min, ink.weight * H * Math.min(1, size / (0.15 * H))));
          b.polygon(grp.outer);
          for (const h of grp.holes) b.polygon(h);
          b.render();
          this._composite(ctx, inkRgb, a * ink.alpha, rx, ry, rw, rh, 1);
        }
      });
    }

    // Paper grain over the finished frame.
    paper(ctx) {
      const p = this.o.paper;
      if (!p || p.amount <= 0) return;
      const cv = ctx.canvas;
      if (!this._paper) this._paper = makePaper(512, this.o.seed);
      const pat = ctx.createPattern(this._paper, 'repeat');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = Math.min(1, p.amount * 2.5);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    }
  }

  BrushStyle.DEFAULTS = DEFAULTS;
  root.BrushStyle = BrushStyle;
  if (typeof module === 'object' && module.exports) module.exports = BrushStyle;
})(typeof globalThis !== 'undefined' ? globalThis : this);
