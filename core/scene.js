/*
 * scene.js — hosts one or more characters in a shared frame.
 *
 * A Scene owns the paint state (so one hand-drawn/brush style and one paper-grain pass cover everything), the
 * stage and letters, and a list of rigs built from the character registry.  It routes cues to characters, keeps
 * "look at that character" targets fresh, and draws in a fixed order: stage back, letters, characters
 * (back to front), stage front, paper grain.
 *
 * Cue files use `rigs: [{id, type, x, y, scale, facing, emotion, seed, z, options}]`, or the older single `rig`
 * (one Brian).  A cue's `who` (id, list of ids, or "all") picks its target; the default is the first rig.
 * `lookAt: {who: "id", dx, dy}` follows another character's head (dx, dy in scene pixels).
 */
(function (root) {
  'use strict';

  const RigCore = root.RigCore || require('./rig-core.js');
  const { Stage } = root.RigStage || require('./stage.js');
  const RigRegistry = root.RigRegistry || require('./registry.js');
  const { PaintState, resolveCtx, mix, sid } = RigCore;

  class Scene {
    // entries: [{id, type, rig}] already constructed; use Scene.fromSpec for cue-file specs.
    constructor(entries) {
      if (!entries.length) throw new Error('Scene: needs at least one rig');
      this.ps = new PaintState();
      this.entries = entries.map((e, i) => ({ z: 0, ...e, i }));
      this.primary = this.entries[0].rig;
      this.env = new Stage(this.ps, this.primary);
      for (const e of this.entries) { e.rig.ps = this.ps; e.rig.env = this.env; }
      this._looks = new Map();   // rig id -> {who, dx, dy}
    }

    // Build from a cue-file spec: {width, height, seed, shadows, rig | rigs, options, stage, style}.
    static fromSpec(spec) {
      const W = spec.width, H = spec.height;
      const list = spec.rigs || [{ id: 'brian', type: 'brian', ...(spec.rig || {}) }];
      const entries = list.map((r, n) => {
        const Class = RigRegistry.get(r.type || 'brian');
        const d = Class.META.defaults || { x: 0.5, y: 0.85, scale: 0.02, facing: 'right' };
        const id = r.id || Class.META.id;
        const seed = r.seed ?? (n === 0 ? (spec.seed ?? 1) : (mix((spec.seed ?? 1) | 0, sid(id)) & 0x7fffffff));
        const rig = new Class({
          seed, shadows: !!spec.shadows,
          x: r.x ?? (n === 0 && !spec.rigs ? W / 2 : d.x * W), y: r.y ?? H * (n === 0 && !spec.rigs ? 0.85 : d.y),
          scale: r.scale ?? H * (n === 0 && !spec.rigs ? 0.02 : d.scale),
          facing: r.facing ?? d.facing ?? 'right', emotion: r.emotion ?? 'neutral',
          ...(spec.options || {}), ...(r.options || {}),
        });
        return { id, type: r.type || 'brian', rig, z: r.z ?? 0 };
      });
      const scene = new Scene(entries);
      if (spec.stage) scene.setStage(spec.stage);
      if (spec.style) scene.setStyle(spec.style);
      return scene;
    }

    get rigs() { return this.entries.map((e) => e.rig); }
    get(id) { const e = this.entries.find((x) => x.id === id); if (!e) throw new Error(`Scene: no rig "${id}"`); return e.rig; }
    get t() { return this.primary.t; }

    setStage(o) { this.env.setStage(o); return this; }
    setStyle(o) { this.primary.setStyle(o); return this; }

    // Route one cue.  Without `who` the whole cue goes to the first rig (so old cue files behave as before).
    // With `who`, scene-level keys (letters, fadeLetters, style) still go to the scene; the rest to the target(s).
    cue(c) {
      if (c.who == null) {
        this._trackLook(this.entries[0], c);
        return this.primary.cue(this._plainLook(c));
      }
      const scene = {}, rest = {};
      for (const k in c) (k === 'letters' || k === 'fadeLetters' || k === 'style' ? scene : rest)[k] = c[k];
      if (Object.keys(scene).length) this.primary.cue(scene);
      const ids = c.who === 'all' ? this.entries.map((e) => e.id) : [].concat(c.who);
      for (const id of ids) {
        const e = this.entries.find((x) => x.id === id);
        if (!e) throw new Error(`Scene: cue targets unknown rig "${id}"`);
        this._trackLook(e, rest);
        e.rig.cue(this._plainLook(rest));
      }
      return this;
    }

    // `lookAt: {who}` is handled here (it needs the other rig's position); everything else goes to the rig.
    _trackLook(e, c) {
      if (!('lookAt' in c)) return;
      const la = c.lookAt;
      if (la && typeof la === 'object' && !Array.isArray(la) && la.who) this._looks.set(e.id, { who: la.who, dx: la.dx || 0, dy: la.dy || 0 });
      else this._looks.delete(e.id);
    }
    _plainLook(c) {
      const la = c.lookAt;
      if (la && typeof la === 'object' && !Array.isArray(la) && la.who) { const o = { ...c }; delete o.lookAt; return o; }
      return c;
    }

    update(dt) {
      for (const [id, l] of this._looks) {
        const p = this.get(l.who).headWorld();
        this.get(id).lookAt(p[0] + l.dx, p[1] + l.dy);
      }
      for (const e of this.entries) e.rig.update(dt);
      this.env.tick(this.primary.t);
      return this;
    }

    // draw(target, {x, y, scale}): the overrides place the FIRST rig (as for a single rig); the others keep
    // their offset and scale relative to it.  Stage and grain are drawn only when there are no overrides.
    draw(target, o = {}) {
      const ctx = resolveCtx(target);
      const P = this.primary, ps = this.ps;
      const x = o.x != null ? o.x : P.x, y = o.y != null ? o.y : P.y, s = o.scale != null ? o.scale : P.scale;
      const k = s / P.scale;
      for (const e of this.entries) e.rig._step = Math.floor(e.rig.t / e.rig.opts.boilStep + 1e-6);

      const staged = this.env._stage && o.x == null && o.y == null && o.scale == null;
      ps.fillN = 0;
      ps.layer = 'stage';
      if (staged) this.env._drawStageBack(ctx);
      const M = ctx.getTransform();
      P._sceneM = M; P._sceneR = [x, y, k];
      ps.layer = 'letters';
      this.env._drawLetters(ctx, x, y, k, P._gripped ? P._gripped() : []);

      for (const e of [...this.entries].sort((a, b) => a.z - b.z || a.i - b.i)) {
        const r = e.rig;
        const rx = e.rig === P ? x : x + (r.x - P.x) * k, ry = e.rig === P ? y : y + (r.y - P.y) * k, rs = r.scale * k;
        r._sceneM = M; r._sceneR = [rx, ry, rs / r.scale];
        ps.fillN = 0;
        r._drawRig(ctx, rx, ry, rs);
      }

      ps.layer = 'stage';
      if (staged) this.env._drawStageFront(ctx);
      if (ps.bs && staged) ps.bs.paper(ctx);
      return this;
    }
  }

  const RigScene = { Scene };
  if (typeof module === 'object' && module.exports) module.exports = RigScene;
  root.RigScene = RigScene;
})(typeof globalThis !== 'undefined' ? globalThis : this);
