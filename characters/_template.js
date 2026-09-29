/*
 * TEMPLATE for a new character.  Copy this file to characters/<id>.js, then:
 *   1. rename the class, the `id` (in META and the Registry call) and the idPrefix;
 *   2. replace the drawing in _drawRig and the pose maths with your character;
 *   3. add 'characters/<id>.js' to manifest.js (before core/scene.js);
 *   4. run `node tools/check-characters.mjs <id>` and `node tools/contact-sheet.mjs <id>`.
 * Full walkthrough: docs/adding-a-character.md.  This file is a working (if plain) character: a bean with eyes and
 * a mouth that bobs, blinks, looks at things and walks by sliding, so a copy passes the checks as-is.
 *
 * Conventions (same for every character): rig units, origin at ground contact between the feet/wheels, +y up,
 * drawn FACING RIGHT (the base class mirrors it for facing left).  Placement is in pixels: x, y = ground contact,
 * scale = pixels per unit.  Everything is time based and seeded, so the same seed and dt sequence give the same
 * frames.  Draw with this._shape(ctx, points, id, colour): it boils the edge and fills (flat paper, drop shadow,
 * or the hand-drawn brush style).  Shape ids must be unique within a character (idPrefix keeps them apart from
 * other characters').
 */
(function (root) {
  'use strict';

  const RigCore = root.RigCore || require('../core/rig-core.js');
  const RigRegistry = root.RigRegistry || require('../core/registry.js');
  const { TAU, clamp, lerp, noise1, col, circle, ellipse, ribbon, arcPts, CutPaperRig } = RigCore;

  // Your palette: extend the shared one (never modify RigCore.PAL).
  const PAL = Object.assign({}, RigCore.PAL, { body: col('#7AB87A'), bodyShade: col('#5C9A5C') });

  // ---- emotions ---------------------------------------------------------------------------------------------
  // NEUTRAL lists every parameter an emotion can set; a preset only lists what differs.  The base class blends
  // between them (setEmotion) and reads these eye keys itself: autoBlink, blinkDur, dartRate, dartAmp, diverge,
  // gazeFollow, gazeX, gazeY, tremble.  Everything else here is yours to define and use in _drawRig / _physics.
  const NEUTRAL = {
    autoBlink: 1, blinkDur: 0.16, dartRate: 0.35, dartAmp: 0.25, diverge: 0, gazeFollow: 1, gazeX: 0, gazeY: 0, tremble: 0,
    lidUp: 0, curve: 0.3, open: 0.1, bob: 0.6, bobSpeed: 0.3, squash: 0,
    ovSparkle: 0, ovTear: 0, ovQuestion: 0, ovExclaim: 0, ovThought: 0, ovSweat: 0, ovZzz: 0, ovAnger: 0, ovBlush: 0, ovHeart: 0,
  };
  const PRESETS = {
    neutral: {},
    happy: { curve: 1, open: 0.3, bob: 1, bobSpeed: 0.6, ovSparkle: 1 },
    sad: { lidUp: 0.4, curve: -0.8, bob: 0.3, bobSpeed: 0.12, squash: 0.15, ovTear: 1 },
    surprised: { lidUp: -0.3, curve: 0, open: 1, dartRate: 0.4, squash: -0.15, ovExclaim: 1 },
  };

  class Template extends CutPaperRig {
    get layerName() { return 'template'; }      // the brush layer this character paints in (see setStyle)

    constructor(opts = {}) {
      super(opts);                              // sets up seed/rng, position, facing, eyes/gaze state, emotion state
      this._bobPh = 0;                          // your own state goes here
      this._sq = { s: 0, v: 0 };                // a spring: squash amount
      this.setEmotion(this.opts.emotion, { blend: 0 });   // ALWAYS last: it may act on state set above
    }

    // ---- hooks the base class calls ---------------------------------------------------------------------------

    // Scene-pixel position of the head (others aim their gaze at it).  Optional but recommended.
    headWorld() { return [this.x, this.y - 6 * this.scale]; }

    // Where eye i (0 left, 1 right) is, in rig units, so the base class can aim the gaze at a look-at target.
    _eyeAnchor(i) { return [(i ? 0.5 : -0.5) + 0.2, 6]; }

    // Called with the distance moved this frame (rig units) while walking.  Drive wheels/legs from it.
    _onMove(du) { /* e.g. this._phase += du / stride */ }

    // One spring substep (h seconds); update() runs these at 240 Hz.  Call _stepPupils(h) to animate the eyes.
    _physics(h) {
      const P = this.p;
      this._bobPh += h * P.bobSpeed;
      const S = this._sq;
      S.v += h * (-80 * (S.s - P.squash) - 6 * S.v);
      S.s += h * S.v;
      this._stepPupils(h);
    }

    // ---- triggers and cues -----------------------------------------------------------------------------------

    trigger(name) {
      if (name === 'blink') this._blinkT = 0;
      else if (name === 'boing') this._sq.v -= 4;
      else throw new Error(`Template: unknown trigger "${name}"`);
      return this;
    }

    // Character-specific cue keys (also list them in Template.CUE_KEYS so unknown keys can be reported).
    _cueExtra(c) { if ('squash' in c) this._sq.v += c.squash; }

    // ---- drawing ---------------------------------------------------------------------------------------------

    // Draw only this character, in rig units.  (x, y, s) place it.  Do not draw the stage or letters here.
    _drawRig(ctx, x, y, s) {
      const P = this.p, t = this.t;
      const fx = Math.sin((this._face * Math.PI) / 2);                       // facing flip, -1 .. 1 (animates a turn)
      const fxs = Math.abs(fx) < 0.03 ? (fx < 0 ? -0.03 : 0.03) : fx;
      this._layer = this.layerName;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, -s);                                                        // rig units, +y up
      ctx.save();
      ctx.scale(fxs, 1);

      const bob = 0.3 * this.opts.drift * P.bob * Math.sin(TAU * this._bobPh), sq = 1 + this._sq.s;
      ctx.translate(0, 0.2 + bob);
      this._shape(ctx, ellipse(0, 3, 2 * sq, 3 / sq, 48), 'body', PAL.body);
      // eyes: the base class keeps this._pupil[i] = [x, y, ...] (gaze, normalised) up to date
      const blink = this._blinkT >= 0 ? Math.sin(Math.PI * clamp(this._blinkT / P.blinkDur, 0, 1)) : 0;
      for (let i = 0; i < 2; i++) {
        const ex = (i ? 0.7 : -0.7), ey = 4.2, open = clamp(1 - P.lidUp - blink, 0.05, 1);
        const white = this._shape(ctx, ellipse(ex, ey, 0.5, 0.5 * open, 24), 'eye' + i, PAL.white, false);
        ctx.save();
        this._clip(ctx, white);
        const g = this._pupil[i];
        this._shape(ctx, circle(ex + g[0] * 0.2, ey + g[1] * 0.2, 0.22, 14), 'pupil' + i, PAL.pupil, false);
        ctx.restore();
      }
      // mouth: a curve whose bend and gap follow the emotion
      const m = [];
      for (let k = 0; k <= 12; k++) { const u = -1 + k / 6; m.push([u * 0.9, 2.2 + P.curve * 0.5 * (u * u - 0.5)]); }
      this._shape(ctx, ribbon(m, 0.12 + P.open * 0.6), 'mouth', PAL.mouth, false);
      ctx.restore();

      // emotion overlays (?, !, sparkles, tears, ...): (ax, ay) shifts them; positions are rig units near the head
      ctx.save();
      this._drawOverlaysAt(ctx, fx, -3.5, -3.5);
      ctx.restore();
      ctx.restore();
    }
  }

  // ---- registration -----------------------------------------------------------------------------------------
  Template.prototype.idPrefix = 'tp.';          // unique per character: keeps boil/brush seeds of same-named parts apart
  Template.NEUTRAL = NEUTRAL;
  Template.PRESETS = PRESETS;
  Template.EMOTIONS = Object.keys(PRESETS);
  Template.TRIGGERS = ['blink', 'boing'];
  Template.CUE_KEYS = ['squash'];               // cue keys beyond the common ones (see CutPaperRig.COMMON_CUE_KEYS)
  Template.DEFAULTS = Object.assign({}, CutPaperRig.DEFAULTS, { drift: 0.3 });
  Template.META = {
    id: 'template',                             // used in cue files: {"type": "template"}
    label: 'Template',                          // shown in the preview's selector
    layer: 'template',                          // brush layer name; must match layerName
    emotions: Template.EMOTIONS,                // buttons in the preview, keys 1-9, contact sheets, demo cues
    triggers: Template.TRIGGERS,                // buttons in the preview
    gestures: [],                               // extra buttons: [{id, label, cue: {...cue keys...}}]
    defaults: { x: 0.5, y: 0.85, scale: 0.02, facing: 'right' },   // fractions of frame width / height / height
    // panels: [...]  optional extra preview controls (buttons that send cues, mouse-driven toggles, sliders);
    // keys: {...}    optional key bindings.  See characters/brian.js for examples.
  };
  RigRegistry.register(Template);

  if (typeof module === 'object' && module.exports) module.exports = Template;
  root.Template = Template;
})(typeof globalThis !== 'undefined' ? globalThis : this);
