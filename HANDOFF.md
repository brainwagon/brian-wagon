# Brian Wagon — Handoff

Handoff date: 2026-09-29 (updated after adding Bluemark). Work is on branch `bluemark`, which also carries the
`brush` merge and the character refactor; `main` does not have the second character yet.

## Current state
- **Two characters now**: Brian Wagon and **Bluemark** (a stooped blue zombie, `characters/bluemark.js`), on a shared
  core with a character registry and a `Scene` host. Adding a third is one file plus one manifest line: see
  `docs/adding-a-character.md`. Brian's output was verified byte-identical through the whole refactor
  (`tools/regress.mjs`).
- The rig, spec (revision 2), preview page and cue files all match each other.
- `out/demo/` (from `cues/demo.json`) and `out/emotions/` (from `cues/emotions.json`, all 20
  emotions, plus `preview.mp4` on grey) were rendered from the current code. `out/` is ignored,
  so regenerate it after any rig change.
- A `python3 -m http.server 8123` may still be running from this session. If not, restart it
  (see "Running it").
- **Deliverable in progress: the "brainwagon" title animation.** `out/intro/intro.mp4` is 1920×1080
  (16:9), 30 fps, 37 s, with chiptune music and sound effects, rendered from the current code.
  Mark's feedback so far has been visual (letter gaps, boil, fade opacity, set dressing, tassels), all
  addressed and committed. He has not yet given feedback on the audio, so **the score and effects are
  the least-checked part**: they were only verified for level and clipping, never listened to.
- Nothing is half-done in the code.

## What this is
Brian Wagon is an animated avatar for explainer videos: a disembodied brain in a
fluid-filled bell jar, riding in a chunky red wagon on big wheels. He never speaks; he
reacts to what's around him. His handle is a telescoping arm ending in a pincer, which
he uses to gesture, reach and carry props.
- The rig is a single-file p5.js module.
- The style is paper cut: flat shapes, no outlines, edges that wobble slightly ("boil").
- Output is PNGs with a transparent background.

## Files
| File | Purpose |
|---|---|
| `character-spec.md` | Spec, **revision 2**. Matches the code |
| `character-spec.v0.md` | Original one-page spec, kept for reference |
| `core/rig-core.js` | Shared infrastructure: maths, seeded randomness, palette, geometry, glyphs; `PaintState`, `Painter` (boil + fills + brush hook) and `CutPaperRig` (the character base class) |
| `core/stage.js` | The backdrop (floor, bunting, curtains) and the cut-paper letters (`Stage`) |
| `core/registry.js` | `RigRegistry`: characters register themselves with a static `META` |
| `core/scene.js` | `Scene`: hosts several characters (`rigs`, `who` cues, look-at-each-other), one shared brush style, one paper-grain pass |
| `characters/brian.js` | Brian Wagon (`class BrianWagon extends CutPaperRig`): wagon, jar, arm, props, letter carrying |
| `characters/bluemark.js` | Bluemark, the zombie puppet (`class Bluemark extends CutPaperRig`) |
| `characters/_template.js` | A working, annotated starting point for a new character (not loaded by the manifest) |
| `manifest.js` | The ordered script list; pages load this one file. The only place a new character is named |
| `brian-wagon.js` | 3-line compatibility shim that re-exports `characters/brian.js` (for node tools and old scripts) |
| `character-spec-bluemark.md` | Bluemark's spec, following `docs/character-spec.template.md` |
| `docs/adding-a-character.md` | How to add a character; the contract, conventions and tools |
| `index.html` | Interactive preview. Loads p5 from the jsDelivr CDN (`p5@1`), global mode. Defaults to 50% size on a grey background |
| `render.html` | Headless render target used by the exporter. Loads `manifest.js`, builds a `Scene` from the cue file's `rigs` (or the old single `rig`) |
| `export.mjs` | Renders a cue list to PNGs using Playwright in headless Chromium, plus an optional ffmpeg preview |
| `cues/demo.json` | 24 s demo at 1920×1080, 30 fps, covering the first 9 emotions and moves in both directions. Rig at 20% of frame height |
| `cues/emotions.json` | 50 s, all 20 emotions at 2.5 s each. Rig at scale 40, centred |
| `cues/intro.json` | The "brainwagon → brain wagon → brian wagon" title animation (37 s, opaque dark background, with `sfx`, `marks` and an `audio` path). **Generated** by `tools/make-intro.mjs`; don't hand-edit |
| `tools/make-intro.mjs` | Director script: simulates the rig headlessly and writes `cues/intro.json`, placing cues and sound effects on what actually happens |
| `tools/make-audio.py` | Chiptune score + sound effects (numpy/scipy, 8-bit quantised), driven by the cue file's `marks`, `sfx` and `fade` |
| `cues/pincer.json` | 16 s demo of reach, grab, carry and release with all four props. Rig at scale 40 |
| `sketches/brian_wagon_sketch.png`, `sketches/bluemark.jpg` | Mark's concept sketches |
| `cues/bluemark-demo.json`, `cues/bluemark-emotions.json`, `cues/duo.json` | Bluemark walking, waving, pointing and reacting; all 20 of his emotions (generated by `tools/make-demo.mjs`); Brian and Bluemark together on the stage |
| `tools/regress.mjs`, `tools/baseline.json` | Regression harness (below) |
| `tools/check-characters.mjs` | Conformance check for every registered character (no browser) |
| `tools/contact-sheet.mjs` | Every emotion of a character in a grid, at any size |
| `tools/make-demo.mjs` | Writes `cues/<id>-emotions.json` for a character |
| `out/` | Rendered frames. **Ignored and untracked**; regenerate with `node export.mjs cues/demo.json` or `cues/emotions.json` (add `--preview` for an MP4) |

## Running it
- **Preview:** `python3 -m http.server 8123` in this directory, then open
  `http://localhost:8123/index.html` in a Windows browser. Needs internet for p5.
  - Click the stage to drive him there, and the eyes follow the mouse.
  - Keys: 1–9 the first nine emotions (the panel buttons cover all 20), ←/→ facing, space pause, B blink, H hop, C confetti,
    P cycle props, R release, S save a 1080p transparent PNG.
  - The Pincer panel has prop buttons, Release, "Reach mouse" and a jaw slider.
- **Export:**
  - `node export.mjs cues/demo.json` writes `out/demo/frame_NNNNN.png` (about 12 s for
    720 frames).
  - `--preview` also makes an MP4 composited on grey.
  - `--still 3.5` renders a single frame at 3.5 s.
  - `--out dir` sets the output directory.
- **Cue format:** see `cues/*.json` and `applyCue()` in `render.html`. Each cue has a
  time `t` plus one or more of: `emotion` (+`intensity`, `blend`), `lookAt: [x,y] | null`,
  `moveTo: {x, seconds, ease}`, `setX`, `face`, `trigger`, `reach: [x,y] | null`,
  `jaw: 0..1 | null`, `grab: "ball" | {prop, at: [x,y]}`, `release: true`.

## Hand-drawn "brush" style (branch `brush`, work in progress)
An optional look that draws the rig through p5.brush (standalone build, no p5 needed) instead of flat cut paper.
It needs tuning by eye; the first full render is `out/intro-brush/intro-brush.mp4`.
- **Switches:** `node export.mjs cues/intro.json --style brush --preview` (flat is the default); `"style"` in a
  cue file, either top-level or as a timed cue; the "Hand-drawn (p5.brush)" checkbox in `index.html`;
  `rig.setStyle('brush' | 'flat' | { mode, layers: {stage, letters, brian, props}, fill: {...}, ink: {...}, paper: {...} })`.
  Output goes to `out/<name>-brush/`.
- **Files:** `brush-style.js` (the backend, options in `DEFAULTS`), `vendor/brush.js` (p5.brush 2.2.3 standalone,
  MIT, licence alongside). The rig sends every fill through `_fill`, which hands polygons to the backend.
- **How it works:** p5.brush assumes white paper and writes opaque pixels with the white mixed in, so each fill
  and outline is painted in black as a density map and that density becomes the alpha of the real colour, then
  is composited on the 2D context. This is why clips, alpha and the letter scratch canvases work unchanged.
  Holes are joined to their outer ring by a zero-width bridge for the fill; outlines are drawn per ring.
  Stroke randomness is re-seeded per shape and per boil step, so it boils at 15 fps like the geometry.
- **Rendering:** WebGL2 on the GPU via ANGLE and Mesa D3D12 (`MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA`); about 3 s a
  frame, so roughly an hour for the intro. `--gl software` works but is far slower. Each shape needs a GPU
  readback. Chromium `chromium_headless_shell-1234` force-loses the GL context after ~130 readbacks in a frame,
  so the exporter prefers revision 1208 for brush renders (`--browser` overrides).
- **Speed tips:** stills mode (`--stills 6.5,13,25`) only draws the requested frames, about 10 s for three.
- **Known issues / tuning ideas:** faint haze above the bunting cord (brush texture scales with bounding box, not
  thickness); ink outlines are subtle on the dark stage; jar glass reads grey and dulls the brain; letters have
  no outline because their overlapping parts left seams; the boil on moving frames hasn't been judged; the preview
  runs at about 1 fps in headless Chromium; the preview has no per-layer switches.

## Shared core, registry and Scene
- `CutPaperRig` (in `core/rig-core.js`) is the character contract: emotion blending, gaze/blink/dart, movement and facing,
  the `update(dt)` skeleton (spring substeps at 240 Hz), `setStyle`, the emotion overlays, a base `cue()` and `draw()`.
  A character supplies `NEUTRAL`/`PRESETS`, `_drawRig`, `_physics`, `META`, and optional hooks (`_onMove`, `_eyeAnchor`,
  `_lift`, `headWorld`, `_cueExtra`, ...). Details and conventions: `docs/adding-a-character.md`.
- `Scene.fromSpec(spec)` builds the characters from `rigs: [{id, type, x, y, scale, facing, emotion, seed, z}]`; a cue's
  `who` (id, list, or `"all"`) picks its target and defaults to the first rig; `lookAt: {who: "id"}` follows another
  character's `headWorld()`. Scene-level cue keys (`letters`, `fadeLetters`, `style`) always go to the scene. Position
  overrides in `draw()` apply to the first rig; the others keep their offset and scale relative to it.
- Draw order: stage back, letters, characters by `(z, index)`, stage front, paper grain **once**.
- `idPrefix` (`''` for Brian, `bm.` for Bluemark) is prepended to shape ids so two characters' identically named
  parts don't share edge-wobble or brush seeds. Keep Brian's empty: changing it changes his output.
- Letters, the stage and Brian's carry logic still belong to Brian: `carry`/`grab`/`jaw` cues only work on him
  (others warn once). Only the first rig's `_gripped()` letters are drawn between jaws.

## Bluemark
A puppet of separate cut-paper pieces (head, torso, two arms, two legs) on joints; see `character-spec-bluemark.md`
for geometry, palette, emotions and API. Non-obvious bits:
- **Walk:** the gait phase advances with distance walked, and the foot's horizontal position is driven directly
  (linear while planted, an arc while swinging); the hip angle is then solved by Newton iteration. That is what stops
  foot slide (about 0.005 units/frame measured). Change `G.reach` (half a stride) and stride follows.
- **Arms:** `_solveArm` is an analytic two-bone solve (lower elbow). It aims the near arm for `point`/`reach` and for
  the hand-to-face emotions (`handChin`, `handHead`). Its elbow flex must be wrapped to (-pi, pi]: an unwrapped value
  once folded the forearm the wrong way.
- **Limbs are drawn bone by bone** with a circle at each joint: a single ribbon round a bend self-overlaps and the
  even-odd fill punches holes in it.
- The face (heavy lids, teeth, blood drip) and the cap (brain emblem) are drawn in head-local coordinates, rotated by
  the head pitch, with the cap on an extra wobble spring.

## Regression harness
`node tools/regress.mjs` renders `demo`, `emotions`, `pincer` and `intro` and compares **every flat frame** by md5
against `tools/baseline.json` (also the output of `tools/make-intro.mjs`). Brush stills are compared by PSNR (>= 70 dB)
against local baseline PNGs in `tools/baseline-brush/` (git-ignored, because GPU output varies by a few pixels; run
`--write` to create them, and the brush check is skipped if they are missing). Options: `--flat-only`, `--brush-only`,
`--only <cue>`, `--write`. Re-capture only when a change is *meant* to alter Brian's output. The baselines were
captured at commit `182fe8b`, before the refactor, and all checks passed after it, brush included.

## Making the intro animation
```
node tools/make-intro.mjs                                   # writes cues/intro.json
python3 tools/make-audio.py cues/intro.json out/intro/audio.wav
node export.mjs cues/intro.json --preview                   # frames + out/intro/intro.mp4 (with audio)
node export.mjs cues/intro.json --stills 6.5,13,25 --out dir   # several stills in one pass
```
- Cut-paper letters are a scene layer in the rig, drawn behind Brian. The pincer fetches a letter
  (`carry`), carries it (`carryTo`) and puts it down (`putDown`); a `group` of letters can be dragged
  with it. The letter rides the jaws, so the arm must be able to reach it (the arm extends up to 6.5).
- Brian's scale (42) and the text row (y = 525, em = 150 px) were chosen together so that the pivot
  can reach the text from just below it. Change one and check the other.
- The timeline is measured, not guessed: `make-intro.mjs` steps the rig frame by frame with the same
  code path as `render.html` (`rig.cue()`), so it knows when the jaws really close.
- The set (`spec.stage` → `rig.setStage()`): floorboards and bunting behind Brian, curtains in front of
  him (he enters from behind the left one). It is drawn only when `draw()` has no position overrides,
  so the preview page and its PNG export are unaffected. Keep him clear of the curtains (about the
  outer 200 px each side).
- Letters fade as whole layers (one scratch canvas per letter), so overlapping strokes stay uniform.
- Music sections come from the `marks` in the cue file; sound effects come from `sfx`. The audio
  fades with the video's final `fade` cue.
- The score is a synthesised chiptune. It hasn't been listened to by me, only checked for level
  and clipping, so give it a listen and tune `tools/make-audio.py` by ear.

## API (characters/brian.js)
```js
const b = new BrianWagon({ seed, x, y, scale, facing, emotion, drift: 0.3, boil: 0.03,
                           boilStep: 1/15, shadows: false, shadowSize: 0.06, stickers: true });
b.setEmotion(name, { intensity = 1, blend = 0.3 });  // BrianWagon.EMOTIONS (20, incl. neutral)
b.lookAt(px, py) / b.lookAt(null);                   // scene pixels; null = idle drift
b.moveTo(px, seconds, { ease: 'inOut', face: true }); b.setX(px); b.face('left'|'right');
b.trigger('blink' | 'hop' | 'confetti' | 'bubbles'); // entering 'celebrating' fires confetti+hop+bubbles
b.reach(px, py) / b.reach(null);                     // arm extends toward a scene point; null relaxes
b.jaw(0..1) / b.jaw(null);                           // override pincer opening; null = emotion default
b.grab('ball'|'star'|'flag'|'bulb', { at: [px, py] });  // no `at`: prop pops into the jaws
b.release();                                         // prop falls, bounces once, fades
b.wave(true|false); b.lookAt('viewer');              // wave; look straight at the audience
b.setLetters(text, {x,y,size}); b.fadeLetters(a, s); // cut-paper letters (scene px)
b.carry(i, {group}); b.carryTo(x,y,s); b.putDown(); // pincer moves letters
b.cue({...});                                        // apply one cue object
b.update(dt);                                        // seconds; time-based, deterministic per seed + dt sequence
b.draw(target?, { x, y, scale });                    // target: none (p5 global), p5 instance, p5.Graphics, canvas, or 2D ctx
```
- **Coordinates:**
  - `b.x`, `b.y`, `b.scale` are in pixels. `(x, y)` is where the wheels touch the
    ground, and `scale` is pixels per rig unit.
  - The rig is drawn facing right with +y up. Facing left mirrors x; the turn animates
    as a quick paper-flip.
  - The rig is nominally 10×10 units, but the taller dome, the emotion icons and the
    extended arm go outside that box. The jar crown is at y ≈ 9.2 and the icons reach
    about y = 11, so leave headroom above him in the frame.
- **Drawing:** it uses the Canvas 2D context directly (`target.drawingContext`), not p5
  drawing calls. That's why it works identically in p5 and in the headless exporter.

## Design decisions (this session's interview)
Mark's answers to the sketch questions and later changes, all implemented:
- **Jar:** wide but not as wide as the wagon (about 85% of the bed width), with a small
  gap of red on each side. Squat half-ellipse dome, 2.76 tall (20% taller than first
  built) with a pocket of air above the waterline. No knob. Glass wall 0.18 thick.
- **Wagon:** bed is about twice as thick as the original. Wheels are radius 1.2 at the
  ends (x = ±2.7).
- **Brain:** big and crinkly (scalloped silhouette), no stem or cerebellum. The face is
  scaled 1.5× with it. Eyes keep the original look: small circles, evenly spaced.
- **Suspension:** the body rides on cartoony springs (bounce and pitch), with the wheels
  planted. **The springs are not drawn.**
- **Jar mount:** the jar is on its own spring mount, pivoting at the bed top. It lags and
  tilts back (about 8°, with overshoot) when the wagon accelerates or brakes, and hops
  and landings shake it.
- **Arm:** thick, telescoping (extends about 3.2 units), ending in a two-jaw pincer with
  thick, rounded jaws. Each emotion sets a default jaw, arm angle and extension.
- **Props:** ball, star, flag and lightbulb, drawn by the rig. The held prop stays
  upright and swings a little with the arm.
- **Emotions:** 20 states. Added angry, surprised, curious, suspicious, bored, embarrassed,
  proud, smug, worried, disgusted and love. They needed two new parameters (`mouthTilt`
  for a smirk or a one-sided frown, `tilt` for a static head tilt) and three new overlays
  (anger mark, blush, hearts).
- **Icons:** the emotion overlays are about twice the original size. The white sticker
  backing is the glyph itself stroked with a round join, sharing the glyph's boil, so
  the border is even. The sparkle shape is fatter to keep spikes from aliasing.

Decisions confirmed earlier: 30 fps; drop shadows as a toggle (off by default); wagon
and arm in red; drift 0.3; no lettering on the wagon; he doesn't speak; usually under
20% of frame height, with close-ups possible.

## How it's built (non-obvious bits)
- **Boil.** Each shape is a dense point list. On each boil step (`floor(t/boilStep)`),
  every point is displaced along its normal by the sum of 3 sinusoids with seeded
  phases, plus a tiny jitter of the whole shape.
  - Shapes are identified by string ids, so each one boils consistently.
  - The inner and outer jar outlines share one id, so the glass rim stays an even
    thickness.
- **Draw order and groups.**
  - Outer group: shake, jiggle, facing flip.
  - Body group (arm, jar, bed) sits inside the suspension transform (heave and pitch).
  - Inside the body group, the jar contents get the jar-mount tilt.
  - Wheels are drawn outside the body group, so they stay planted.
  - Overlays, world props and confetti are drawn after.
- **Emotions** are flat numeric parameter vectors (`NEUTRAL` + `PRESETS`).
  - `setEmotion` works out a target vector (`lerp(NEUTRAL, preset, intensity)`) and
    smoothsteps to it over `blend` seconds.
  - Overlay visibility is also a parameter (`ov*`).
  - The pincer and arm parameters are `jaw`, `jawFlap`, `jawRate`, `armLift`, `armExt`.
- **Eyes have no lid shapes.** The eye white is cut to its open shape, and an ink "lash"
  ribbon follows the upper lid edge. A closed eye is just the lash.
- **Physics** runs as spring substeps at 240 Hz inside `update()`: the brain, face,
  waterline slope and wave, arm angle, arm extension, jaw, body heave and pitch, jar
  sway and tilt, hop, and pupil darts.
  - The acceleration the jar feels is soft-limited: `6*tanh(a/6)` units/s².
  - Arm targets (angle, extension, jaw) are worked out in `_updateArm()`, which also
    closes the jaws on a prop being fetched.
- **Grab with `at`.** The prop lies in the world at that scene point. The arm reaches for
  it, and once the tip is within 0.4 units and the jaws are open, it closes. There is a
  3.5 s timeout after which it grabs anyway.
- **Wheel rotation** is distance ÷ radius, so the wheels never slide.
- **Overlays** are drawn in an unmirrored frame so the glyphs don't flip when he faces
  left. They are hand-built vector glyphs (`GLYPH`) with the sticker backing. The tear
  is drawn in the face frame instead.
- **Confetti and dropped props** are anchored to the world, so they stay put when the
  wagon drives off.

## Gotchas
- **Brush and Bluemark (found when brush was first tried on the shared scene; not yet tuned).** It works: Bluemark
  draws on his own `bluemark` layer, the stage, both characters and one paper-grain pass compose correctly, the preview's
  brush checkbox works with both characters, and Brian's brush output is unchanged. The look has problems:
  - On the dark stage his **white shirt goes translucent grey** and his **black trousers almost vanish**: the
    density-to-alpha model makes very light colours faint and very dark ones blend into the background. A likely fix is
    an opaque underpaint (a solid fill at ~90% under the textured watercolour) or a per-colour gain.
  - **Eye lash and lid lines** overlap into dark smudges at small sizes; the ink outline on every bone shows the
    joints as separate segments.
  - The bunting-cord **haze** from before is still there.
- **Chromium 1234 loses the WebGL context** in brush renders; the exporter prefers revision 1208.
- **Playwright version mismatch.** `npm install` pulled playwright-core 1.63.0, which
  wants a Chromium revision that isn't downloaded. `export.mjs` falls back to the newest
  Chromium it finds in `~/.cache/ms-playwright`, so it works. Running
  `npx playwright install chromium-headless-shell` would fix the mismatch properly.
- **`out/` is untracked but the first commit's history still holds the old PNGs**
  (about 45 MB). History was not rewritten.
- **Contact sheets.** To review looks, render a contact sheet: one rig per emotion on a
  single canvas, driven through `render.html` with Playwright. The script used lived in
  the session scratchpad and is gone. Recreating it takes about 30 lines (loop over
  `BrianWagon.EMOTIONS`, `update(1/30)` × 75, `draw(ctx)`).
- **Checking sizes.** Check both small (scale ≈ 21.6 px/unit, which is 20% of 1080p) and
  close-up (40–60 px/unit). The face details are near the limit of legibility at the
  small size.
- **Preview reseed.** The Seed "Apply" button rebuilds the rig, which drops any held prop
  and pending reach.
- **Ignored inputs.** Reach targets ignore the body's pitch and the jar tilt, so the jaws
  can miss a target by a small amount while the body is moving hard.
- **No Windows paths.** Nothing depends on Windows-side paths.

## Suggested next steps
0. Get Mark's reaction to the intro (audio especially), then tune. Likely knobs:
   - **Audio:** tempo, melody and mix in `tools/make-audio.py` (levels in the "master" block).
   - **Length (37 s):** the three letter moves take the longest. Shorten pauses and `secs` values in
     `tools/make-intro.mjs`, then regenerate the cue file and audio.
   - **Set:** the floor reads a little like bricks (short staggered boards). Long planks or a lighter
     colour is a small change in `_drawStageBack`.
   - **Pincer:** the letters ride in the jaws rather than being visibly gripped, because a letter's
     centre is a thin stroke.
   After any change: `node tools/make-intro.mjs && python3 tools/make-audio.py cues/intro.json
   out/intro/audio.wav && node export.mjs cues/intro.json --preview`.
1. Look at the preview in a browser and tune by eye: jar tilt (`K` constants in
   `_physics`), suspension stiffness, the icon sizes and the pincer.
2. Check the sparkle border at 20% frame height on the real background. If it still
   shimmers, widen the border slightly or calm the twinkle.
3. Possibly later:
   - a zoom/scale cue for close-ups;
   - picking a video editor, then an alpha video format (ProRes 4444 or WebM VP9;
     ffmpeg supports both);
   - tuning drift and bob once it's seen in context.
