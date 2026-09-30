# Bluemark — Character Spec

Revision 1. Concept sketch: `sketches/bluemark.jpg`. Built on the shared rig (`core/`), see
`docs/adding-a-character.md`. Code: `characters/bluemark.js`. Keep this file in step with the code.

## Identity
Bluemark is a stooped, blue-skinned zombie in a white long-sleeved shirt, black trousers and a white trucker cap
with a stylised pink brain on the front. He shambles, he slumps, his eyes are heavy-lidded, his mouth hangs open
showing teeth with a smear of blood at the corner, and he has stringy dark hair at the nape. He is a second
character for explainer videos, a foil to Brian. Like Brian he **never speaks**; he reacts with posture, head,
arms, lids and mouth, and with the same hand-drawn overlays (?, !, sparkles, tears, ...). The sketch's cart of
brains and its rope are out of scope: he is the zombie only.

## Style
- Same as Brian: **paper cut**, flat shapes with no stroked outlines, edges that **boil** (0.03 units, on twos at
  15 fps), a shared `Painter`, optional drop shadows, optional hand-drawn (p5.brush) style on its own layer
  (`bluemark`).
- A **puppet**: head, torso, two arms and two legs are separate cut-paper pieces on joints. Forward kinematics, no IK
  solver (an analytic two-bone solve aims the near arm).
- Designed to read at about 20% of frame height (about 21.6 px per unit at 1080p) and to hold up in close-ups.

## Colours
| Part | Colour | Notes |
|---|---|---|
| Skin | `#5AA0D8` | far-side limbs and neck `#3F7FB8` |
| Shirt | `#F4F1EA` | shade `#D3CEC1` (far arm, back fold) |
| Trousers | `#1E1E27` | far leg `#14141B`; shoes `#0E0E13` |
| Cap | `#F4F2EC` | front panel `#FBFAF6`, back shade `#CFC9BE`, brim `#E3DFD4` (off-white, a shade darker than the crown) |
| Brain emblem | `#EE8FA8` | highlight `#F7CDB8`, folds `#B8456F` |
| Blood | `#A8252B` | drip at the mouth corner |
| Hair | `#20222B` | six stringy strokes behind the head, six short bangs under the brim, four sideburn strands beside the face |
| Eyes | `#F4F1EA` | white only, no pupil or outline; nostrils `#1B2033`; teeth `#F1E8C8`; mouth inside `#3A1518` |

## Geometry (rig units)
Origin **between the feet at ground contact, a little behind his centre of mass** (`pelvisX = -1.0`) so mirroring him
looks steady; +y up; drawn facing right. About 10 units tall (head top at about 10.5 with the cap).

| Piece | Value |
|---|---|
| Legs | thigh 2.1, shin 2.05, shoe about 1.6 long; the pelvis drops each frame so the lower foot touches y = 0 |
| Torso | 2.7 long, leans forward 47° from vertical, back hump 0.55, width about 1.5-2.35 (a ribbon along a curved spine); the shirt hangs right down over the hips (flat hem 0.3 below the bottom of the spine) like an untucked shirt, so only the seat and legs show as black |
| Neck | 0.5, at the top of the spine |
| Head | a spline outline (`HEAD`): broad across the brow, hollow under the cheekbone, tapering to a long jaw and a heavy chin, about 3 wide × 3.2 tall, hanging forward of the shoulders, pitched down by `headDrop`; a darker cheek hollow curves down from the cheekbone toward the jaw; no ear is drawn |
| Arms | upper 2.0, fore 2.0, hand ellipse 0.62; shoulder joint at 92% up the spine |
| Cap | a tall, slightly squared crown (superellipse, 3.4 wide, 1.9 high on a 0.5 base line) with a whiter front panel and a shaded crescent down the back; an off-white brim at the front only (it does not run round the back of the head) that reaches about 0.75 past the face, thickest at the crown and tapering to a near point; the brain emblem (0.95×) left of centre on the panel, with a cream highlight, folds and a drip |

Draw order, back to front: far arm, far leg, hair, near leg, torso (hips block, the black trouser section, then the shirt over it with its back-fold shade, hanging over the top of the thighs), neck, head
(skull, the cheek hollow, two dark nostrils, mouth, dark bangs and four sideburn strands, eyes with the near eye first and the far eye over it,
then the cap, which wobbles on the head), near arm (with a contact shade so it separates
from the shirt). Every shape has an id prefixed `bm.` so its boil and brush seeds differ from Brian's.

## Secondary motion
- **Walking is driven by distance** (`_onMove`), like Brian's wheels: the gait phase advances by
  `distance / stride`, with `stride = 4 × 1.75 × gait`. The foot's horizontal position is driven directly (linear
  while planted, a smooth arc through the swing) and the hip angle is solved from it, so the planted foot does not
  slide: measured drift is about 0.005 units per frame at 1, 2 and 3.5 units/s. `gait` follows walking speed
  (full at 1.2 units/s), so he starts and stops smoothly. Knees flex and the toe lifts during the swing.
- **Springs** (240 Hz substeps): torso pitch (kicked at each heel strike, lags acceleration), head pitch (lags the
  torso, follows the gaze a little), cap wobble (driven by the head), two arm pendulums plus elbow flex (swing
  against the legs, follow their targets).
- **Idle:** slow breathing (0.25 Hz) on the torso, `bob` on the head, optional `sway`.
- **Hop:** the same jump physics as Brian's; landings jolt the torso, head, cap and arms.

## Gestures and props
- **Wave:** the near arm goes up and back, with a swinging forearm. `wave(true|false)` or the cue key `wave`.
- **Point / reach:** `point(x, y)` (alias `reach`) aims the near arm at a scene point by an analytic two-bone
  solve, taking the lower elbow. `point(null)` relaxes it. Cue keys `point`, `reach`.
- **Hand to the face:** the `thinking` emotion puts a hand under the chin, `confused` and `embarrassed` reach to the
  back of the head, through the same solve (parameters `handChin`, `handHead`).
- Raised arms (`armRaiseN/F`) go up and slightly back so they clear the face.
- No props, no carrying, no letters: `carry`, `grab`, `jaw`, `confetti` and `bubbles` cues are ignored with a
  one-time warning.

## Eyes
Two plain white almond eyes (far and near) under heavy lids, as in the sketch: **no pupils and no dark outline or lash
lines**. `lidUp` shifts the closure (base 0.55), `lidAsym` and `lidTilt` skew the lids, and a blink is slow (0.32 s).
Because there are no pupils, gaze is read from the head: it pitches slightly toward what he is looking at, and
look-at targets still work as for Brian (including `lookAt: {who: "brian"}` in a Scene). The pupil parameters
(`pupil`, `gazeX`, `dartRate`, ...) are still blended by the base class but nothing draws them.

## Emotions
Same 20 names as Brian. Each is a preset over `NEUTRAL`; the body keys are the new ones.

| State | Body | Eyes | Mouth | Overlay |
|---|---|---|---|---|
| neutral | stoop, arms hang, slow bob | half-lidded, drifting | slack, teeth showing | none |
| happy | slightly less stooped, small bounce | more open | wide smile | sparkle |
| sad | maximum slump, head down, arms limp, slower walk | lids down and tilted, gaze down | deep frown | tear |
| confused | head tilted, scratching the back of the head | asymmetric, diverging, darting | wobbly | ? |
| excited | bouncing, both arms out | wide, darting | big open smile | ! |
| thinking | hand under the chin, head tilted | asymmetric, looking up-right | small, skewed | thought dots |
| celebrating | both arms straight up, hop, chest lifted | wide, no blinking | huge open | sparkle |
| fearful | recoil (leans back), shudder, hands up | wide, small pupils, trembling | open, jagged | sweat |
| sleepy | slump, head nods, slow walk | nearly shut, slow blink | slack open | Z's |
| angry | stiff arms, shudder, head down | lids tilted inward | frown, teeth clenched (jagged) | anger mark |
| surprised | jolts upright, head back, arms flared | very wide | fully open | ! |
| curious | head tilted, leaning in | wide, looking aside | open | none |
| suspicious | head down, arms hang | narrowed, looking aside | skewed | none |
| bored | slumped, slow | droopy, slow blink | slack | none |
| embarrassed | head down, hand to the back of the head | looking away and down | small smile, wobbly | blush |
| proud | chest out, head up | half-closed, looking down the nose | small smile | none |
| smug | slight lean back, head tilted | half-lidded | one-sided smirk | none |
| worried | hunched, hand near the head, trembling | tilted up-inward, darting | wobbly | sweat |
| disgusted | head leans away and tilts | narrowed, looking aside | one-sided frown | none |
| love | swaying, bobbing, head tilted | big, soft | smile | hearts |

Parameters beyond the shared eye, mouth and overlay keys: `slump` (torso lean), `headDrop`, `headTilt`, `armHang`
(swing and rest angle), `armRaiseN`/`armRaiseF` (near/far arm raised, 0 to 1), `handChin`, `handHead` (aim the near
arm at the face), `gait` (walk amount scale), `twitch`, `chompRate` (reserved).

## Rig / API
```js
const b = new Bluemark({ seed, x, y, scale, facing, emotion, drift: 0.3, boil: 0.03, boilStep: 1/15, shadows: false });
b.setEmotion(name, { intensity = 1, blend = 0.3 });      // Bluemark.EMOTIONS (20)
b.lookAt(px, py) / b.lookAt(null) / b.lookAt('viewer');   // scene pixels
b.moveTo(px, seconds, { ease, face }); b.setX(px); b.face('left'|'right');
b.trigger('blink' | 'hop' | 'chomp' | 'stagger');         // Bluemark.TRIGGERS
b.wave(true|false); b.point(x, y) / b.point(null);        // reach() is an alias
b.cue({...}); b.update(dt); b.draw(target?, { x, y, scale }); b.headWorld();
```
`chomp` is a quick three-times snap of the jaw; `stagger` is a shove into the torso, head, cap and arm springs.
`Bluemark.META` (registered as `bluemark`) carries the emotion and trigger lists, the defaults (x 65%, y 85%,
3% of frame height per unit, which is 50% larger than Brian's 2%, facing left) and the preview panels and keys (`H` hop, `B` blink, `C` chomp, `T` stagger).

## Output pipeline
Same as Brian's: a cue file with a `rigs` entry of `"type": "bluemark"` (see `cues/bluemark-demo.json`,
`cues/bluemark-emotions.json` (generated by `tools/make-demo.mjs`) and `cues/duo.json` for a shared scene with
Brian), rendered by `export.mjs`. `--style brush` draws him through p5.brush on the `bluemark` layer. Check a change
with `node tools/check-characters.mjs bluemark` and `node tools/contact-sheet.mjs bluemark`.

## Decisions taken
Interview of 2026-09-29:
- Zombie only, no cart or rope. A puppet with limbs (no IK). Shares a scene with Brian, with per-character cues.
- Not part of the title animation. He never speaks. Same 20 emotion names as Brian.
- The code was reorganised around a shared core so more characters are easy to add.

## Still open
- The brush (p5.brush) look of his face and cap has not been tuned.
- The head and cap were reworked against the sketch (2026-09-29); the rest of the body is still first-pass, and the sketch is a three-quarter view that is adapted here to a profile.
- Hands are plain ovals (no fingers). The far arm and leg are flat shade colours.
- No sound effects for him (footsteps, groans) in `tools/make-audio.py`.
- `twitch` and `chompRate` are declared but not yet used by any preset.
- `sleepy`, `bored` and `sad` look similar at small sizes; the lids and overlays carry the difference.
