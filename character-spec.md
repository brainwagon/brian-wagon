# Brian Wagon — Character Spec (p5.js)

Revision 2. The original spec is kept in `character-spec.v0.md`. Revision 2 folds in
the concept sketch (`sketches/brian_wagon_sketch.png`), the interview of 2026-09-29, and the
drift between revision 1 and the code.

## Identity
Brian Wagon is a disembodied brain floating in a fluid-filled bell jar, riding in a
chunky red wagon on big sprung wheels. He has no body, but the wagon's handle is a
telescoping arm ending in a pincer, which he uses to gesture, reach and carry props.
He is an animated avatar for technical and explainer videos. He never speaks; he
**reacts** to what happens around him with his eyes, eyelids, an occasional mouth,
the fluid, the wagon, the pincer, and hand-drawn overlays.

## Style
- **Paper cut.** Flat, filled shapes with no stroked outlines. Depth comes from
  layering: one shape laid over another.
- **Boil.** Every shape's edge wobbles slightly, re-drawn on a stepped clock (see Rig).
  Amplitude is about 0.03 units, so it reads as hand-cut at a small size without
  shimmering in close-ups.
- **No internal detail on the brain.** There are no fold lines. The brain reads as a
  brain from its big, **crinkly** (scalloped, cloud-like) silhouette, plus one lighter
  paper layer for volume.
- **Size.** Design for **small** first: usually under 20% of the frame height
  (about 200 px at 1080p). Close-ups must also hold up, so edges stay smooth and all
  geometry is vector.

## Colours
| Part | Colour | Notes |
|---|---|---|
| Brain | `#336699` | Solid |
| Brain highlight layer | `#4D80B3` | One offset lobe shape, upper side |
| Fluid | `#A9C4DE` @ ~55% alpha | Paler than the brain, so the brain separates without lines |
| Glass air gap / dome | `#FFFFFF` @ ~15% alpha | Above the waterline |
| Glass reflections | `#FFFFFF` @ ~60% alpha | Kept to the jar edges, never over the face |
| Metal | `#8A9199` | Suspension springs |
| Wagon | `#C8322B` | Body, arm sleeve, pincer, and wheel spokes |
| Wagon shade | `#9E2620` | Bed lip, inner arm rod, wrist, wheel rims |
| Tyres | `#2B2B2B` | |
| Eye whites | `#FFFFFF` | |
| Pupils | `#000000` | |
| Eyelids | (none) | The white is cut to its open shape and an ink lash follows the upper lid edge |
| Brain stem / cerebellum | (none) | Removed in revision 2 |
| Props | Ball `#2BB3A3`, star `#F2C230`, flag `#F28C28` on an ink pole, bulb `#FFE680` on a `#8A9199` base | Carried by the pincer |
| Mouth | `#1B2B3A` | Filled shape, not a line |
| Overlays | `#1B2B3A` ink, with accents per symbol | Hand-drawn look |

The background is **transparent**. Nothing in the rig paints the canvas.

## Geometry (rig units)
- The rig lives in a **10 × 10 unit** box (the extended arm and props may reach outside
  it).
- **Origin** is ground contact, centre-bottom. In this spec **+y is up**; the rig
  converts to p5's y-down coordinates internally.
- Everything below is drawn facing **right**. Facing left is a mirror of x.

| Part | Placement |
|---|---|
| Wheels | Radius 1.2, centres at x = ±2.7, y = 1.2. Five spokes, so rotation is readable. They sit at the ends of the wagon and stick out slightly past the bed |
| Suspension | Not drawn. The bounce is felt in the body's motion only. See Secondary motion |
| Wagon bed | Chunky tray from x = −3.3 to 3.3 at the bottom (y = 2.0) and ±3.5 at the top (y = 4.2). About twice as thick as revision 1. A darker lip runs along the top edge |
| Arm | Pivots at the leading bed edge (3.4, 3.2). A sleeve 0.6 wide, with an inner rod 0.4 wide that telescopes out. Rest length to the wrist is 2.0, extendable by up to 6.5 (enough to reach text held well above his head). See Arm and pincer |
| Jar walls | x = ±2.95, from y = 3.9 (hidden inside the bed) up to y = 6.4. The jar is about 85% of the bed's width, leaving a small gap of red on each side |
| Jar dome | Half-ellipse, 2.95 wide and 2.76 tall, crown at y ≈ 9.2. **No knob** |
| Glass | Wall thickness 0.18, grown inward so the outer silhouette is unchanged |
| Waterline | y ≈ 8.2, leaving a pocket of air (about 1 unit deep) at the crown |
| Brain | Rest centre at (0, 6.05), about 4.2 wide × 3.0 tall, filling most of the jar. Crinkly silhouette. Bobs within ±0.3 and never leaves the fluid |
| Face | Same design as revision 1, scaled 1.4× with the brain: two whites (~1.05 diameter, 1.4 apart), and a mouth about 0.9 lower. Offset (0.42, 0.21) from the brain centre, so it is biased toward the facing direction |

## Secondary motion
- **Brain bob.** Slow float, always on. Its amplitude and speed are set per emotion.
  The brain also lags behind wagon acceleration: a spring inside the jar.
- **Face follows the brain loosely.** The eyes and mouth are a separate layer tied to
  the brain by a spring with some lag. When the brain lurches, the face catches up a
  beat later.
- **Slosh.** The waterline tilts against acceleration and then settles as a damped
  wave. It is clipped to the jar.
- **Bubbles.** Circles rise from the lower jar and wobble sideways. They pop at the
  waterline. The spawn rate is set per emotion.
- **Wheels.** Rotation angle = distance travelled ÷ radius. The wheels never slide.
- **Suspension.** The wheels stay on the ground and the body rides on springs, tuned
  **cartoony** (springy, with visible overshoot).
  - The body has a vertical bounce and a pitch. Accelerating tips the nose up and
    braking dips it.
  - A hop stretches the body up on take-off and squashes it on landing.
  - The springs are **not drawn**; only their effect shows. The brain and the fluid
    feel the body's bounce.
- **Jar mount.** The jar is not rigid on the bed. It sits on a spring mount that pivots
  at the bed top, with a sideways sway and a tilt. Cartoony: it leans back about 8° with
  visible overshoot when the wagon accelerates or brakes hard, and hops and landings
  shake it. The brain, fluid, face and bubbles move with the jar.
- **Arm.** Points in the direction of travel. When the wagon stops, the arm stays on the
  side he faces and drops lower, to about 25°.
- **Facing.** Moving left or right sets the facing automatically. The rig can also
  be told to face a direction explicitly.

## Arm and pincer
The handle is Brian's only limb. The wagon body carries it, so it bobs with the
suspension.
- **Telescoping.** A sleeve holds an inner rod that slides out. The extension is
  sprung with some overshoot.
- **Pincer.** At the wrist, two thick, rounded jaws with blunt tips open and close (`jaw` from 0 = clenched to
  1 = wide open).
- **Emotion defaults.** Each emotion sets a resting jaw, arm angle and extension, plus
  an optional flap. An explicit cue overrides them.

| State | Jaw | Arm |
|---|---|---|
| Neutral | Relaxed, a quarter open | Rest, 25° |
| Happy | Half open, a gentle chatter | Slightly raised |
| Sad | Nearly closed | Droops low and shortens |
| Confused | A third open, slow uneven flap | Slightly raised |
| Excited | Wide, fast flap | Raised and extended |
| Thinking | Pinched | Raised and pulled in, as if holding a chin |
| Celebrating | Wide, clapping | High and extended |
| Fearful | Clenched, trembling | Pulled in |
| Sleepy | Limp, a fifth open | Droops low |
| Angry | Clenched, faint grinding | Low, tense |
| Surprised | Wide open | Raised and extended |
| Curious | About 40% open, slow flutter | Raised and extended |
| Suspicious | Nearly closed | Pulled in |
| Bored | Nearly closed | Droops low and shortens |
| Embarrassed | Small fidgeting | Slightly low, pulled in |
| Proud | Half open | Raised and extended |
| Smug | A third open | Slightly raised |
| Worried | Nearly closed, faint tremble | Slightly low, pulled in |
| Disgusted | Pinched | Held out and extended |
| Love | A third open, gentle flutter | Slightly raised |

- **Reach.** `reach(x, y)` points the arm at a scene point and extends it until the
  jaws are there. `reach(null)` relaxes it.
- **Props.** The pincer can carry a **ball**, **star**, **flag** (a sign on a pole) or
  **lightbulb**. The rig draws them.
  - `grab(prop)` makes the prop pop into the jaws, which snap shut on it.
  - `grab(prop, { at: [x, y] })` puts the prop at a scene point. The arm reaches it, the
    jaws close, and it is carried from then on.
  - The held prop rides the arm, stays upright and swings a little with the arm's motion.
  - `release()` opens the jaws. The prop falls under gravity, bounces once, then fades.

## Eyes
- **Pupils** are independent left and right. Gaze targets are either
  `lookAt(x, y)` in scene coordinates or an idle drift when there is no target.
  The pupils are clamped inside the whites.
- **Jitter.** Small, quick eye darts that land on a new spot and hold there, not
  continuous noise. Their rate and size are set per emotion.
- **Upper and lower lids.** Each covers a fraction of the eye from 0 to 1, and each
  has a tilt so the lids can angle inward or outward. There are separate values for
  the left and right eye. There are no lid shapes: the eye white is cut to its open
  shape, and an ink "lash" follows the upper lid edge. A closed eye is just the
  lash. Neutral has the upper lid at 0.06.
- **Blink.** Automatic every 3–6 s in most states, and it can also be triggered.

## Emotions
There are 20 states: the original nine plus eleven added in revision 2. Changing state blends every parameter over a configurable time
(default 0.3 s). Each state has an intensity from 0 to 1.

| State | Lids | Pupils / gaze | Mouth | Brain / fluid | Wagon | Overlay |
|---|---|---|---|---|---|---|
| **Neutral** | Upper at 6% | Slow idle drift, rare darts | Hidden | Gentle bob, a bubble every few seconds | Still | None |
| **Happy** | Lower lids pushed up into crescents | Soft, toward the target | Small upturned arc | Bouncier bob | Small bounce | 2–3 sparkle ticks |
| **Sad** | Upper lids droop, sloping down toward the outer corners | Down | Small frown | Sinks about 0.35, slow bob, few bubbles | Still | Tear drop from one eye |
| **Confused** | Asymmetric: one squints, one wide | Diverge, independent darts | Wavy squiggle | Brain tilts side to side | Still | One or two wobbly "?" |
| **Excited** | Retracted, eyes wide | Small, fast darts | Open grin | Quick bounce, stream of bubbles | Jiggle | "!" |
| **Thinking** | One upper lid lowered | Up and to the side, steady | Small flat line pushed to one side | Slow rotation, sparse bubbles | Still | Thought dots "∘ ◦ ·" |
| **Celebrating** | Closed happy crescents | (Hidden) | Big open grin | Surge of bubbles, big slosh | Hop (both wheels leave the ground) | **Confetti burst** (event), sparkles |
| **Fearful** | Retracted, eyes wide | Tiny, trembling | Zigzag | Pulls back and down in the jar (about 0.3), trembles | Shudder | Sweat drop |
| **Sleepy** | Heavy (70%+), slow blinks, drift to closed | Down | Hidden, or a small "o" when fully asleep | Sinks about 0.45, very slow bob, one slow bubble per breath | Still | Drifting "Z z z" |
| **Angry** | Upper lids slanted down toward the middle, slightly raised lower lids | Small pupils, steady on the target | Gritted frown | Bobs briskly and shakes, simmering bubbles | Trembling jiggle | Red anger mark |
| **Surprised** | Retracted, eyes very wide | Tiny pupils | Open "o" | A jolt on entry, leans back, stream of bubbles | Still | "!" |
| **Curious** | One upper lid raised | Up and to the side, drifting | Small open smile | Head tilts, gentle sway | Still | None |
| **Suspicious** | Half-lidded, slanted in, raised lower lids | Sideways, steady | Flat line pushed to one side | Leans back, very slow bob | Still | None |
| **Bored** | Heavy (about 50%), slow blinks | Drifting, slightly down | Flat, slightly down | Sinks a little, very slow bob | Still | None |
| **Embarrassed** | Slightly lowered | Down and away from the target, restless | Wobbly small smile | Sinks about 0.25, gentle sway | Still | Blush ovals on the cheeks |
| **Proud** | Slightly lowered, raised lower lids | Steady, slightly up | Small smile | Sits high in the jar | Still | None |
| **Smug** | Half-lidded, raised lower lids | Steady, to the side | One-sided smirk | Slow bob, faint sway | Still | None |
| **Worried** | Upper lids sloped up in the middle | Restless darts, trembling | Wavy, slightly down | Sinks a little, faint tremble | Slight shudder | Sweat drop |
| **Disgusted** | Squinting, slanted in | To the side, slightly down | Frown pulled down at one side | Tilts and leans away from the target | Still | None |
| **Love** | Soft, raised lower lids, big pupils | Soft, following the target | Small smile | Bouncy bob and sway | Small bounce | Floating hearts |

- **Sustained states vs events.**
  - Excited is a sustained state.
  - Celebrating fires a one-shot confetti burst and hop on entry, then holds a happy,
    lightly bubbling loop.
  - Confetti and hop can also be triggered on their own.
- **Overlays** (sparkles, tear, "?", "!", thought dots, sweat, Zzz, and the new anger mark, blush and hearts) are hand-drawn vector shapes, drawn large (about twice the revision 1 size) so they read at small sizes, not Unicode emoji. They follow the
  brain's position, not the face's. They boil like everything else. Each overlay
  animates in (pop or drift) and animates out when the state ends. Each glyph has a
  white sticker backing (on by default) so it reads on any background.

## Rig / API
A single file, `brian-wagon.js`. It must work in both p5 global mode and instance
mode, and it draws into any `p5` or `p5.Graphics` object.

```js
const b = new BrianWagon({ seed: 42 });   // seed makes boil, jitter, bubbles and confetti deterministic

b.setEmotion('thinking', { intensity: 1, blend: 0.3 });
b.lookAt(x, y);          // scene coords; b.lookAt(null) = idle drift
b.setX(x);               // teleport, no wheel spin
b.moveTo(x, seconds, { ease: 'inOut' });   // rolls: wheels, handle, facing, slosh follow
b.face('left' | 'right');
b.trigger('blink' | 'confetti' | 'hop' | 'bubbles');
b.reach(x, y);           // scene coords; b.reach(null) relaxes the arm
b.jaw(0..1);             // override the pincer opening; b.jaw(null) = emotion default
b.grab('ball' | 'star' | 'flag' | 'bulb', { at: [x, y] });   // without `at`, the prop pops into the jaws
b.release();             // drop the held prop
b.wave(true);            // raise the arm and wave; b.wave(false) stops
b.lookAt('viewer');      // eyes straight ahead, at the audience
b.setLetters('brain', { x, y, size });   // cut-paper letters in scene pixels (behind Brian)
b.fadeLetters(0..1, seconds);
b.carry(i, { group: [j, k] });           // the pincer fetches letter i and carries it (and the group)
b.carryTo(x, y, seconds);                // move the carried letter; the arm follows
b.putDown();                             // let go; the letter stays where it is
b.cue({ ... });                          // apply one cue object (the same fields as the cue files)

b.update(dt);            // seconds; all animation is time-based
b.draw(g, { x, y, scale });   // x,y = ground-contact point in pixels; scale = px per unit (optional overrides)
```

- **Time-based.** Frame rate only affects sampling.
- **Boil on a stepped clock.** Edges change pose every 1/15 s by default (animation
  "on twos" at 30 fps). The step is configurable and independent of the render
  frame rate.
- **Options.** `drift` (brain bob envelope, default 0.3), `boil` (0.03 units),
  `boilStep`, `shadows` (paper-cut drop shadows, off by default), `shadowSize` and
  `stickers` (white backing behind overlay glyphs, on by default).
- **Deterministic.** The same seed and the same sequence of calls with the same `dt`
  values produce identical frames.

## Output pipeline
- `index.html` is the preview and playground. It has a controls panel for the
  emotion, gaze, move, triggers and seed, and **Save PNG** saves the current frame
  with transparency.
- `export.mjs` renders a scripted cue list (`cues/*.json`; cues can also `reach`, `jaw`, `grab` and `release`) in headless Chromium using Playwright.
  - It steps a fixed `dt` per frame and writes a transparent PNG sequence, so the
    output never depends on real-time playback.
- ffmpeg then converts the sequence to one of:
  - **ProRes 4444** `.mov` (alpha) for video editors
  - **WebM VP9** (alpha) for the web
  - **GIF or APNG** for quick sharing
- The default is **30 fps**; this is configurable.
- A transparent PNG sequence is the primary deliverable. The video editor is not yet chosen.

## Decisions taken
- 30 fps, drop shadows as a toggle (off by default), and no lettering on the wagon.
- Handle and arm are wagon red, on the leading side.
- The wagon flips to face left or right, with a quick paper-flip.
- Drift 0.3, which may be tuned later.
- Eyes stay small circles, evenly spaced (the sketch's unequal ovals were not adopted).
- Usually under 20% of frame height, with close-ups possible.

## Still open
- Target video editor. This decides whether ProRes 4444, WebM VP9 or a PNG sequence is
  the primary deliverable.
- A zoom/scale cue for close-ups.
