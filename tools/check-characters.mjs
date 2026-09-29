#!/usr/bin/env node
// Conformance check for registered characters (no browser needed: drawing goes to a recording canvas stub).
//
//   node tools/check-characters.mjs              every registered character
//   node tools/check-characters.mjs bluemark     just one
//
// For each character: META is complete and consistent with the class statics; every emotion constructs, steps
// and draws; every trigger runs; the character walks when told to; unknown cue keys warn but do not throw; a
// second identical run draws exactly the same thing (determinism); it draws with position overrides and inside
// a Scene next to another character.  Exit status is 1 if anything fails.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { RIG_SCRIPTS } = require(path.join(root, 'manifest.js'));
for (const f of RIG_SCRIPTS) if (/^(core\/|characters\/)/.test(f) && !f.includes('_template')) require(path.join(root, f));
const Registry = require(path.join(root, 'core/registry.js'));
const { Scene } = require(path.join(root, 'core/scene.js'));

// A canvas that records every call, so a run can be hashed and inspected without a browser.
function stubCtx() {
  const log = []; let fills = 0;
  const ident = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
  const state = {};
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k === 'getTransform') return () => ident;
      if (k === 'canvas') return { width: 1920, height: 1080 };
      if (k in t) return t[k];
      return (...a) => { if (k === 'fill') fills++; log.push(k + '(' + a.map((v) => (typeof v === 'number' ? v.toFixed(3) : typeof v === 'string' ? v : typeof v)).join(',') + ')'); };
    },
    set(t, k, v) { t[k] = v; log.push(`${String(k)}=${v}`); return true; },
  });
  return { ctx, hash: () => crypto.createHash('md5').update(log.join('\n')).digest('hex').slice(0, 10), fills: () => fills };
}

const only = process.argv[2];
const classes = Registry.list().filter((C) => !only || C.META.id === only);
if (!classes.length) { console.error(`no such character: ${only}`); process.exit(1); }

let failures = 0;
const fail = (id, msg) => { console.log(`  FAIL ${msg}`); failures++; };
const pass = (msg) => console.log(`  ok   ${msg}`);
const step = (rig, n, dt = 1 / 30) => { for (let i = 0; i < n; i++) rig.update(dt); };

for (const Class of classes) {
  const M = Class.META, id = M.id;
  console.log(`${id} (${M.label})`);
  try {
    // 1. META and statics
    const keys = Object.keys(Class.PRESETS || {}), neutral = Class.NEUTRAL || {};
    const missing = ['id', 'label', 'layer', 'emotions', 'triggers', 'defaults'].filter((k) => M[k] == null);
    if (missing.length) fail(id, `META missing ${missing.join(', ')}`);
    else if (!M.emotions.includes('neutral')) fail(id, 'META.emotions has no "neutral"');
    else if (M.emotions.join() !== keys.join()) fail(id, 'META.emotions differs from Object.keys(PRESETS)');
    else pass(`META complete, ${M.emotions.length} emotions, ${M.triggers.length} triggers`);
    const typo = keys.flatMap((e) => Object.keys(Class.PRESETS[e]).filter((k) => !(k in neutral)).map((k) => `${e}.${k}`));
    typo.length ? fail(id, `preset keys not in NEUTRAL: ${typo.join(', ')}`) : pass('every preset key exists in NEUTRAL');
    if (typeof Class.prototype._drawRig !== 'function' || typeof Class.prototype._physics !== 'function' && Class.prototype._physics === undefined) fail(id, 'needs _drawRig and _physics');

    // 2. every emotion: construct, step, draw
    let bad = [];
    const hashes = {};
    for (const e of M.emotions) {
      const run = () => { const r = new Class({ seed: 5, x: 500, y: 900, scale: 30, emotion: e }); step(r, 45); const s = stubCtx(); r.draw({ drawingContext: s.ctx }); return { h: s.hash(), fills: s.fills() }; };
      try { const a = run(); hashes[e] = a; if (a.fills < 8) bad.push(`${e}: only ${a.fills} fills`); const b = run(); if (a.h !== b.h) bad.push(`${e}: not deterministic`); }
      catch (err) { bad.push(`${e}: ${err.message}`); }
    }
    bad.length ? fail(id, `emotions: ${bad.join('; ')}`) : pass('every emotion steps, draws and is deterministic');
    const distinct = new Set(Object.values(hashes).map((h) => h.h)).size;
    distinct < Math.min(M.emotions.length, 3) ? fail(id, 'emotions all look the same') : pass(`${distinct} distinct looks across ${M.emotions.length} emotions`);

    // 3. triggers
    bad = [];
    for (const t of M.triggers) {
      try { const r = new Class({ seed: 5, x: 500, y: 900, scale: 30 }); r.trigger(t); step(r, 30); r.draw({ drawingContext: stubCtx().ctx }); }
      catch (err) { bad.push(`${t}: ${err.message}`); }
    }
    bad.length ? fail(id, `triggers: ${bad.join('; ')}`) : pass('every trigger runs');

    // 4. walking, look-at, head position
    const w = new Class({ seed: 5, x: 500, y: 900, scale: 30 });
    w.moveTo(900, 1); step(w, 15);
    const mid = w.moving; step(w, 25);
    Math.abs(w.x - 900) < 1 && mid ? pass('moveTo walks and arrives') : fail(id, `moveTo: x=${w.x.toFixed(1)}, moving=${mid}`);
    w.lookAt(100, 100); step(w, 10);
    const hw = w.headWorld();
    hw.every(Number.isFinite) ? pass('headWorld is finite') : fail(id, `headWorld = ${hw}`);

    // 5. unknown cue keys warn, never throw
    const warns = []; const oldWarn = console.warn; console.warn = (m) => warns.push(m);
    try { const r = new Class({ seed: 1 }); r.cue({ notARealCueKey: 1 }); r.cue({ emotion: 'neutral', trigger: [] }); }
    catch (err) { fail(id, `cue threw: ${err.message}`); }
    console.warn = oldWarn;
    warns.length ? pass('unknown cue keys warn') : fail(id, 'unknown cue key did not warn');

    // 6. overrides, and inside a Scene beside another character
    const o = new Class({ seed: 3, x: 500, y: 900, scale: 30 }); step(o, 10);
    try { o.draw({ drawingContext: stubCtx().ctx }, { x: 100, y: 500, scale: 60 }); pass('draw with x/y/scale overrides'); } catch (err) { fail(id, `overrides: ${err.message}`); }
    try {
      const others = Registry.ids().filter((x) => x !== id), partner = others[0] || id;
      const sc = Scene.fromSpec({ width: 1920, height: 1080, seed: 3, rigs: [{ id: 'a', type: id }, { id: 'b', type: partner }] });
      sc.cue({ who: 'a', lookAt: { who: 'b' } }); sc.update(1 / 30); sc.draw({ drawingContext: stubCtx().ctx });
      pass(`draws in a Scene next to ${partner}`);
    } catch (err) { fail(id, `scene: ${err.message}`); }
    if (!Class.prototype.idPrefix && classes.length > 1 && id !== Registry.ids()[0]) console.log('  note: idPrefix is empty; give this character one so its parts get their own boil/brush seeds');
  } catch (err) { fail(id, `unexpected: ${err.stack}`); }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall characters conform');
process.exit(failures ? 1 : 0);
