#!/usr/bin/env node
// Writes cues/intro.json: the "brainwagon" -> "brain wagon" -> "brian wagon" title
// animation.  It runs the rig headlessly, frame by frame, exactly as render.html
// will, so follow-up cues and sound effects land on what actually happens (e.g.
// when the pincer really closes on a letter).
//
//   node tools/make-intro.mjs         then       python3 tools/make-audio.py cues/intro.json out/intro/audio.wav
//                                                node export.mjs cues/intro.json --preview
import fs from 'node:fs';
import { createRequire } from 'node:module';
const BrianWagon = createRequire(import.meta.url)('../brian-wagon.js');

const W = 1920, H = 1080, FPS = 30, S = 42, GROUND = 1020, EM = 150, ROW = 525;
const PIVOT_DX = 3.4 * S;                       // arm pivot ahead of the wagon centre
const BG = '#161822';

// ---- letter layout (positions come from the rig so they match what is drawn)
function layout(text, left) {
  const r = new BrianWagon();
  r.setLetters(text, { x: 0, y: ROW, size: EM });
  const l0 = r._letters[0].x - (r._letters[0].adv / 2) * EM;
  const x = left - l0;
  r.setLetters(text, { x, y: ROW, size: EM });
  return { x, pos: r._letters.map((l) => [l.x, l.y]) };
}
const probe = new BrianWagon();
probe.setLetters('brian wagon', { x: 960, y: ROW, size: EM });
const LEFT = probe._letters[0].x - (probe._letters[0].adv / 2) * EM;
const ini = layout('brainwagon', LEFT), fin0 = layout('brian wagon', LEFT);
// 'brain' -> 'brian': the letters keep their identity, so letter 2 (a) takes the
// slot at index 3 of the final layout and letter 3 (i) takes index 2.
const fin = { x: fin0.x, pos: fin0.pos.map((_, k) => fin0.pos[k === 2 ? 3 : k === 3 ? 2 : k]) };
// letter indices in 'brainwagon': 0 b 1 r 2 a 3 i 4 n 5 w 6 a 7 g 8 o 9 n
const A = 2, I = 3, WORD = [5, 6, 7, 8, 9];

// ---- simulation
const rig = new BrianWagon({ seed: 7, shadows: false, x: -300, y: GROUND, scale: S, facing: 'right', emotion: 'neutral' });
let frame = 0;
const cues = [], sfx = [], marks = [];
const q = (t) => Math.ceil(t * FPS - 1e-9);
const now = () => frame / FPS;
function stepTo(t) { const f = q(t); while (frame < f) { frame++; rig.update(1 / FPS); } }
function cue(t, c) { stepTo(t); const o = { t: now(), ...c }; cues.push(o); rig.cue(c); return now(); }
function fx(t, name, extra = {}) { sfx.push({ t: q(t) / FPS, name, ...extra }); }
function mark(t, name) { marks.push({ t: q(t) / FPS, name }); }
function until(cond, limit = 6) {
  const f0 = frame;
  while (!cond() && frame - f0 < limit * FPS) { frame++; rig.update(1 / FPS); }
  return now();
}
const held = () => rig._carry && rig._carry.stage === 'held';
const stance = (x, face) => (face === 'left' ? x + PIVOT_DX : x - PIVOT_DX);   // wagon x for an arm pivot at x
let warn = 0;

function move(t, x, secs, extra = {}) {
  const at = cue(t, { moveTo: { x, seconds: secs }, ...extra });
  fx(at, 'roll', { dur: secs });
  return at + secs;
}

// Fetch letter i, carry it to `to`, put it down.  Returns the time it is put down.
function relocate(t, i, to, secs, opts = {}) {
  cue(t, { carry: opts.group ? { i, group: opts.group } : i, carryTo: [to[0], to[1], secs] });
  const th = until(held);
  if (rig._carry.stage !== 'held') warn++;
  fx(th, 'snap');
  fx(th + 0.1, 'slide', { dur: secs });
  mark(th, opts.mark || 'carry');
  const tp = th + secs + 0.35;
  cue(tp, { putDown: true });
  fx(tp + 0.05, 'put');
  return tp;
}

// ---- 0: dark, then the title fades in
cue(0, { letters: { text: 'brainwagon', x: ini.x, y: ROW, size: EM, alpha: 0 } });
mark(0, 'title');
cue(0.6, { fadeLetters: [1, 1.0] });
fx(0.6, 'shimmer');

// ---- 1: Brian rolls in from the left and reads
mark(3.2, 'walk');
let t = move(3.2, 600, 2.7);
cue(5.0, { emotion: 'curious', blend: 0.4, lookAt: ini.pos[0] });
for (let i = 0; i < 10; i++) {
  cue(5.9 + i * 0.18, { lookAt: ini.pos[i] });
  fx(5.9 + i * 0.18, 'blip', { i });
}

// ---- 2: thinks, then gets the idea (lightbulb)
mark(7.9, 'think');
cue(7.9, { emotion: 'thinking', blend: 0.5, lookAt: [960, ROW - 160] });
fx(7.9, 'think');
mark(9.9, 'aha');
cue(9.9, { emotion: 'excited', blend: 0.2, grab: 'bulb', trigger: 'hop', lookAt: [960, ROW] });
fx(9.9, 'ding'); fx(9.9, 'boing'); fx(10.26, 'thud');
cue(11.1, { release: true, emotion: 'proud', blend: 0.4 });

// ---- 3: pushes "wagon" right to make the space
mark(11.1, 'work');
const bxPush = stance(ini.pos[5][0] - 50, 'right');
move(11.2, bxPush, 0.8);
let tp = relocate(12.1, 5, fin.pos[5], 1.3, { group: [6, 7, 8, 9], mark: 'push' });   // the others follow the first letter

// ---- 4: pauses and thinks some more
mark(tp + 0.3, 'ponder');
cue(tp + 0.3, { emotion: 'thinking', blend: 0.5, lookAt: [960, ROW - 160] });
fx(tp + 0.3, 'think');
const bxSwap = stance((ini.pos[A][0] + ini.pos[I][0]) / 2, 'left');
const tArr = move(tp + 0.7, bxSwap, 1.5);
cue(tArr, { face: 'left' });
cue(tp + 2.2, { emotion: 'curious', blend: 0.3, lookAt: ini.pos[A] });   // a
cue(tp + 2.9, { lookAt: ini.pos[I] });                                        // i
cue(tp + 3.5, { lookAt: ini.pos[A] });
mark(tp + 3.9, 'swap');
cue(tp + 3.9, { emotion: 'proud', blend: 0.3, lookAt: null });

// ---- 5: swaps the "a" and the "i"
const park = [ini.pos[A][0], ROW + 110];
let ts = relocate(tp + 4.0, A, park, 0.8);
fx(ts, 'swoosh');
ts = relocate(ts + 0.15, I, fin.pos[I], 0.7);
fx(ts, 'swoosh');
ts = relocate(ts + 0.15, A, fin.pos[A], 0.8);
fx(ts, 'swoosh');

// ---- 6: reads it again, realises, celebrates
mark(ts + 0.4, 'read');
cue(ts + 0.4, { emotion: 'curious', blend: 0.3 });
for (let i = 0; i < 10; i++) {
  const p = fin.pos[i];
  cue(ts + 0.5 + i * 0.16, { lookAt: p });
  fx(ts + 0.5 + i * 0.16, 'blip', { i });
}
const tSurp = ts + 0.5 + 10 * 0.16 + 0.2;
mark(tSurp, 'gasp');
cue(tSurp, { emotion: 'surprised', blend: 0.1, lookAt: [960, ROW] });
fx(tSurp, 'gasp');
const tCel = tSurp + 0.9;
mark(tCel, 'celebrate');
cue(tCel, { emotion: 'celebrating', blend: 0.2, lookAt: 'viewer' });
fx(tCel, 'fanfare'); fx(tCel, 'boing'); fx(tCel + 0.36, 'thud');

// ---- 7: rolls to the side, faces the audience and waves, then fades out
const tRoll = tCel + 3.6;
mark(tRoll, 'wave');
cue(tRoll, { emotion: 'happy', blend: 0.4, lookAt: 'viewer' });
const tEnd = move(tRoll, 420, 1.7);
cue(tEnd, { face: 'right' });
cue(tEnd + 0.3, { wave: true });
for (let k = 0; k < 6; k++) fx(tEnd + 0.4 + k * 0.56, 'bloop', { k });
const tFade = tEnd + 2.6;
mark(tFade, 'end');
cue(tFade, { fade: [1, 1.6] });
const duration = Math.ceil((tFade + 1.6 + 0.4) * 2) / 2;

const spec = {
  width: W, height: H, fps: FPS, duration, seed: 7, shadows: false, background: BG, stage: {}, audio: 'out/intro/audio.wav',
  rig: { x: -300, y: GROUND, scale: S, facing: 'right', emotion: 'neutral' },
  cues, sfx, marks,
};
fs.writeFileSync(new URL('../cues/intro.json', import.meta.url), JSON.stringify(spec, null, 1));
console.log(`intro: ${duration}s, ${cues.length} cues, ${sfx.length} sfx${warn ? `, WARNING ${warn} carry timeouts` : ''}`);
for (const m of marks) console.log(m.t.toFixed(2).padStart(6), m.name);
