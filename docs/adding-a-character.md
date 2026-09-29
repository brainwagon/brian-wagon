# Adding a character

The rig is built so that a new character is **one file plus one manifest line**. Everything else — the scene
that hosts several characters, the exporter, the preview page, the contact-sheet and demo tools, the conformance
check — is generic and finds your character through a registry.

## What exists

```
core/rig-core.js    shared maths, seeded randomness, palette, geometry, glyphs, and the base classes
                    Painter (boil + fills, incl. the hand-drawn brush style) and CutPaperRig (the character contract)
core/stage.js       the backdrop (floor, bunting, curtains) and cut-paper letters
core/registry.js    RigRegistry: register(Class), get(id), list(), ids()
core/scene.js       Scene: hosts many characters in one frame
characters/*.js     one file per character (brian.js, bluemark.js, _template.js)
manifest.js         the ordered script list; the only place a new file is named
```

## Steps

1. **Copy the template.** `cp characters/_template.js characters/<id>.js`. It is a working, plain character, so a
   copy passes the checks before you change anything.
2. **Rename** the class, the `id` in `META`, `layerName`, the `Registry` call and `idPrefix` (see below).
3. **Register the file** by adding `'characters/<id>.js'` to `RIG_SCRIPTS` in `manifest.js`, before `core/scene.js`.
4. **Draw it** in `_drawRig` (see "Drawing"), give it emotions (see "Emotions"), and animate it in `_physics`.
5. **Check it.**
   - `node tools/check-characters.mjs <id>` — construction, every emotion and trigger, walking, unknown cue keys,
     determinism, overrides, and drawing inside a Scene (no browser needed).
   - `node tools/contact-sheet.mjs <id> --scale 21.6` and `--scale 40 --cols 3` — every emotion at small and
     close-up sizes. Look at both: the small size is what a video mostly uses.
   - `node tools/make-demo.mjs <id>` — writes `cues/<id>-emotions.json`; render it with
     `node export.mjs cues/<id>-emotions.json --preview`.
   - Open `index.html`: the character appears in the selector and gets its emotion, trigger and gesture buttons.
6. **Write the spec.** Copy `docs/character-spec.template.md` to `character-spec-<id>.md`.

No change is needed in `core/`, `render.html`, `export.mjs`, `index.html` or the tools.

## Conventions

- **Rig units, +y up, origin at ground contact** (between the feet or wheels), drawn **facing right**. The base
  class mirrors it for `facing: 'left'`, including an animated turn (`this._face` runs -1 … 1).
- **Placement is in pixels:** `x, y` = ground contact, `scale` = pixels per rig unit. Design for a character about
  10 units tall so `scale ≈ 21.6` is 20% of a 1080p frame.
- **Deterministic:** all motion is time based and seeded. The same seed and the same `update(dt)` sequence must give
  identical frames. Use `this.rng()` (seeded) and `noise1(this.seed + k, t)`, never `Math.random()`.
- **Paper-cut style:** flat filled shapes, no outlines. Draw with `this._shape(ctx, points, id, colour, shadow = true)`,
  which boils the edge on a stepped clock and fills it (flat paper, optional drop shadow, or the hand-drawn brush
  style). Build shapes from the helpers in `RigCore`: `circle`, `ellipse`, `arcPts`, `densify`, `ribbon`.
- **Draw limbs as separate bones.** A `ribbon` round a sharp bend overlaps itself and the even-odd fill punches
  holes in it. Use one ribbon per bone and a circle at each joint.
- **Ids must be unique within a character.** Shape ids seed the edge wobble and the brush strokes. Set
  `Class.prototype.idPrefix = 'xx.'` (unique per character) so identically named parts in two characters ('head',
  'eye0') don't wobble in lockstep.
- **Palette:** `const PAL = Object.assign({}, RigCore.PAL, {...})`. Never modify `RigCore.PAL`.
- **Layers:** `layerName` is the brush layer your character paints in; the style can switch layers off
  (`style: {mode: 'brush', layers: {bluemark: false}}`), and a layer with no entry is on.

## The contract (what `CutPaperRig` gives you, and what you supply)

**Provided:** options and seeded `rng`; position and facing (`face`, `setX`, `moveTo`, `moving`, `facing`); emotion
blending (`setEmotion`); gaze, blink and dart state (`lookAt`, `_updateEyes`, `_pupil[i]`, `_blinkT`); the
`update(dt)` loop (dt clamped to 0.1 s, spring substeps at 240 Hz); `setStyle` (hand-drawn brush style);
`cue(c)` for the common keys; a standalone `draw(target, {x, y, scale})`; the emotion overlays
(`_drawOverlaysAt`: ?, !, sparkles, tears, thought dots, sweat, Z's, anger mark, blush, hearts).

**You supply:**

| Member | Purpose |
|---|---|
| `static NEUTRAL`, `static PRESETS` | emotion parameter vectors |
| `static EMOTIONS`, `TRIGGERS`, `DEFAULTS`, `CUE_KEYS`, `META` | see below |
| `get layerName()` | brush layer name |
| `constructor(opts)` | `super(opts)`, your state, then **last** `this.setEmotion(this.opts.emotion, {blend: 0})` |
| `_drawRig(ctx, x, y, s)` | draw the character only: `ctx.translate(x, y); ctx.scale(s, -s)` puts you in rig units |
| `_physics(h)` | one spring substep of `h` seconds; call `this._stepPupils(h)` to animate the eyes |
| `trigger(name)` | one-shot effects; throw on unknown names |

**Optional hooks:** `_onEmotion(name, blend)` (side effects when an emotion starts), `_onMove(du)` (distance moved this
frame, in rig units — drive wheels or legs from it so feet don't slide), `_eyeAnchor(i)` (where eye `i` is, so
gaze can aim at look-at targets), `_updateBody(dt)` (per-frame, non-spring updates), `_updateParticles(dt)`,
`_lift()` (height above the ground, for hops), `headWorld()` (scene pixels; other characters look at it),
`_cueExtra(c)` (character-specific cue keys; list them in `CUE_KEYS`).

### META

```js
Class.META = {
  id: 'zed',            // used in cue files: {"type": "zed"}
  label: 'Zed',         // the preview's selector
  layer: 'zed',         // brush layer, same as layerName
  emotions: [...],      // names; buttons, keys 1-9, contact sheets, demo cues
  triggers: [...],      // buttons in the preview
  gestures: [{ id, label, cue: { wave: true } }],   // extra buttons that send a cue
  defaults: { x: 0.65, y: 0.85, scale: 0.02, facing: 'left' },   // fractions of frame width / height / height
  panels: [...],        // optional extra preview controls (see characters/brian.js)
  keys: {...},          // optional key bindings (see characters/bluemark.js)
};
```

## Drawing

Inside `_drawRig`: set `this._layer = this.layerName`, `ctx.save(); ctx.translate(x, y); ctx.scale(s, -s);`, then the
facing flip `ctx.scale(fxs, 1)` where `fx = Math.sin(this._face * Math.PI / 2)` (avoid exactly 0), draw back to
front, and `ctx.restore()`. Call `this._drawOverlaysAt(ctx, fx, ax, ay)` for the emotion glyphs, with `(ax, ay)`
shifting them to sit above your character's head (Brian's are laid out around a head at about (0, 8)).
For a clip, `ctx.save(); this._clip(ctx, shapePoints); …; ctx.restore()`.

## Emotions

`NEUTRAL` lists every parameter; a preset lists only what differs; the base class blends between them. Eye keys the
base reads: `autoBlink, blinkDur, dartRate, dartAmp, diverge, gazeFollow, gazeX, gazeY, tremble`. The overlay keys
are `ovSparkle, ovTear, ovQuestion, ovExclaim, ovThought, ovSweat, ovZzz, ovAnger, ovBlush, ovHeart`. Everything
else is yours. Using the same emotion names as Brian (see `BrianWagon.EMOTIONS`) means an emotion cue works on any
character; that is a convention, not a requirement.

## Using the character in a cue file

```json
{ "width": 1920, "height": 1080, "fps": 30, "duration": 10, "seed": 5,
  "rigs": [ { "id": "a", "type": "brian",   "x": 500,  "y": 1000, "scale": 34 },
            { "id": "b", "type": "bluemark", "x": 1400, "y": 1000, "scale": 36, "facing": "left" } ],
  "cues": [ { "t": 1, "who": "b", "emotion": "surprised" },
            { "t": 2, "who": "a", "lookAt": { "who": "b" } } ] }
```

A cue without `who` goes to the first rig. `who` can be an id, a list of ids, or `"all"`. `letters`, `fadeLetters` and
`style` are scene-level. `stage`, `style` and `shadows` go at the top of the file. Old files with a single `rig` still work.

## Regression safety

`node tools/regress.mjs` renders the four reference cue files and compares every flat frame against
`tools/baseline.json` byte for byte (brush stills by PSNR against local baselines). Run it after touching `core/`.
Re-capture the baseline (`--write`) only when a change is *meant* to alter Brian's output.
