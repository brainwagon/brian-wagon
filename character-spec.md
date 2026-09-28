# Brian Wagon — Character Spec (p5.js)

Revision 1. The original spec is kept in `character-spec.v0.md`.

## Identity
Brian Wagon is a disembodied brain floating in a fluid-filled bell jar, riding in a
shallow red wagon. He has no body. He is an animated avatar for technical and
explainer videos. He never speaks; he **reacts** to what happens around him with his
eyes, eyelids, an occasional mouth, the fluid, the wagon, and hand-drawn overlays.

## Style
- **Paper cut.** Flat, filled shapes with no stroked outlines. Depth comes from
  layering: one shape laid over another.
- **Boil.** Every shape's edge wobbles slightly, re-drawn on a stepped clock (see Rig).
  Amplitude is about 0.03 units, so it reads as hand-cut at a small size without
  shimmering in close-ups.
- **No internal detail on the brain.** There are no fold lines. The brain reads as a
  brain from its lobed silhouette, plus one lighter paper layer for volume.
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
| Base plate | `#8A9199` | Flat grey plate |
| Wagon | `#C8322B` | Body, handle, and wheel spokes |
| Wagon shade | `#9E2620` | Inner bed wall, wheel hubs |
| Tyres | `#2B2B2B` | |
| Eye whites | `#FFFFFF` | |
| Pupils | `#000000` | |
| Eyelids | `#336699` | Brain colour, so lids read as brain "skin" |
| Mouth | `#1B2B3A` | Filled shape, not a line |
| Overlays | `#1B2B3A` ink, with accents per symbol | Hand-drawn look |

The background is **transparent**. Nothing in the rig paints the canvas.

## Geometry (rig units)
- The rig lives in a **10 × 10 unit** box.
- **Origin** is ground contact, centre-bottom. In this spec **+y is up**; the rig
  converts to p5's y-down coordinates internally.
- Everything below is drawn facing **right**. Facing left is a mirror of x.

| Part | Placement |
|---|---|
| Wheels | Radius 0.8, centres at x = ±2.2, y = 0.8. Five spokes, so rotation is readable |
| Wagon bed | Shallow tray from x = −3.2 to 3.2, y = 1.2 to 2.3. Slight outward taper |
| Handle | Pivots at the leading bed edge (3.2, 1.8). Bar 2.2 long at rest ~45° up, ending in a T-grip. Solid wagon red, flat silhouette. Always on the **leading side** |
| Base plate | Sits inside the bed, top at y ≈ 1.6 (the bed wall hides its lower part) |
| Jar walls | x = ±2.1, from the plate up to y = 6.6 |
| Jar dome | Semicircle, radius 2.1, crown at y ≈ 8.7. Small knob on top to y ≈ 9.2 |
| Waterline | y ≈ 8.0, inside the dome, leaving a sliver of air at the crown |
| Brain | Rest centre at (0, 4.8), about 3.0 wide × 2.3 tall. Lobed silhouette. Bobs within ±0.3 |
| Eyes | Two whites, ~0.75 diameter, 1.0 apart, on the brain's front face. Biased ~0.25 toward the facing direction |
| Mouth | Below the eyes, about 0.8 lower. Hidden in Neutral |

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
- **Handle.** Points in the direction of travel. When the wagon stops, the handle
  stays on the side he faces and drops lower, to about 25°.
- **Facing.** Moving left or right sets the facing automatically. The rig can also
  be told to face a direction explicitly.

## Eyes
- **Pupils** are independent left and right. Gaze targets are either
  `lookAt(x, y)` in scene coordinates or an idle drift when there is no target.
  The pupils are clamped inside the whites.
- **Jitter.** Small, quick eye darts that land on a new spot and hold there, not
  continuous noise. Their rate and size are set per emotion.
- **Upper and lower lids.** Each covers a fraction of the eye from 0 to 1, and each
  has a tilt so the lids can angle inward or outward. There are separate values for
  the left and right eye.
- **Blink.** Automatic every 3–6 s in most states, and it can also be triggered.

## Emotions
There are 9 states. Changing state blends every parameter over a configurable time
(default 0.3 s). Each state has an intensity from 0 to 1.

| State | Lids | Pupils / gaze | Mouth | Brain / fluid | Wagon | Overlay |
|---|---|---|---|---|---|---|
| **Neutral** | Upper at 15% | Slow idle drift, rare darts | Hidden | Gentle bob, a bubble every few seconds | Still | None |
| **Happy** | Lower lids pushed up into crescents | Soft, toward the target | Small upturned arc | Bouncier bob | Small bounce | 2–3 sparkle ticks |
| **Sad** | Upper lids droop, angled down toward the inner corners | Down | Small frown | Sinks about 0.6, slow bob, few bubbles | Still | Tear drop from one eye |
| **Confused** | Asymmetric: one squints, one wide | Diverge, independent darts | Wavy squiggle | Brain tilts side to side | Still | One or two wobbly "?" |
| **Excited** | Retracted, eyes wide | Small, fast darts | Open grin | Quick bounce, stream of bubbles | Jiggle | "!" |
| **Thinking** | One upper lid lowered | Up and to the side, steady | Small flat line pushed to one side | Slow rotation, sparse bubbles | Still | Thought dots "∘ ◦ ·" |
| **Celebrating** | Closed happy crescents | (Hidden) | Big open grin | Surge of bubbles, big slosh | Hop (both wheels leave the ground) | **Confetti burst** (event), sparkles |
| **Fearful** | Retracted, eyes wide | Tiny, trembling | Zigzag | Pulls back and down in the jar, trembles | Shudder | Sweat drop |
| **Sleepy** | Heavy (70%+), slow blinks, drift to closed | Down | Hidden, or a small "o" when fully asleep | Sinks, very slow bob, one slow bubble per breath | Still | Drifting "Z z z" |

- **Sustained states vs events.**
  - Excited is a sustained state.
  - Celebrating fires a one-shot confetti burst and hop on entry, then holds a happy,
    lightly bubbling loop.
  - Confetti and hop can also be triggered on their own.
- **Overlays** are hand-drawn vector shapes, not Unicode emoji. They follow the
  brain's position, not the face's. They boil like everything else. Each overlay
  animates in (pop or drift) and animates out when the state ends.

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
b.trigger('blink' | 'confetti' | 'hop');

b.update(dt);            // seconds; all animation is time-based
b.draw(g, { x, y, scale });   // x,y = ground-contact point in pixels; scale = px per unit
```

- **Time-based.** Frame rate only affects sampling.
- **Boil on a stepped clock.** Edges change pose every 1/12 s by default (animation
  "on twos" at 24 fps). The step is configurable and independent of the render
  frame rate.
- **Deterministic.** The same seed and the same sequence of calls with the same `dt`
  values produce identical frames.

## Output pipeline
- `index.html` is the preview and playground. It has a controls panel for the
  emotion, gaze, move, triggers and seed, and **Save PNG** saves the current frame
  with transparency.
- `export.mjs` renders a scripted cue list in headless Chromium using Playwright.
  - It steps a fixed `dt` per frame and writes a transparent PNG sequence, so the
    output never depends on real-time playback.
- ffmpeg then converts the sequence to one of:
  - **ProRes 4444** `.mov` (alpha) for video editors
  - **WebM VP9** (alpha) for the web
  - **GIF or APNG** for quick sharing
- The default is **24 fps**; this is configurable.

## Still open
- Target video editor. This decides whether ProRes 4444 or a PNG sequence is the
  primary deliverable.
- Whether paper-cut layers get a faint drop shadow, for a "stacked card" depth look.
- Whether 24 fps is right, versus 30 fps.
