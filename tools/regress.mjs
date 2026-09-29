#!/usr/bin/env node
// Regression check for refactors: renders fixed cue files and compares every PNG against a committed baseline.
//
//   node tools/regress.mjs --write            capture tools/baseline.json (do this BEFORE changing code)
//   node tools/regress.mjs                    check against the baseline (same as --check)
//   node tools/regress.mjs --only intro       just one cue file
//   node tools/regress.mjs --flat-only        full flat frame sequences only (fast, ~1-2 min)
//   node tools/regress.mjs --brush-only       brush-style stills only (GPU, slower)
//
// Flat: every frame of each cue file is hashed (8 hex chars of md5 each) and must match exactly.  Brush: a handful
// of stills per cue (letter grips, confetti, jar, ...), since a brush frame costs ~3 s.  GPU floating point makes
// brush output differ by a few pixels between runs (~100 dB PSNR), so brush stills are compared by PSNR against
// baseline PNGs kept locally in tools/baseline-brush/ (git-ignored; --write creates them, and the brush check is
// skipped with a warning if they are missing).  A real change (e.g. shifted brush seeds) lands around 30-40 dB;
// the threshold is 70 dB.  The timing script's output (tools/make-intro.mjs -> cues/intro.json) is hashed too.
// Exit status is 1 on any difference.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePath = path.join(root, 'tools', 'baseline.json');
const brushDir = path.join(root, 'tools', 'baseline-brush');
const PSNR_MIN = 70;
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const write = args.includes('--write');
const only = flag('--only');
const doFlat = !args.includes('--brush-only');
const doBrush = !args.includes('--flat-only');

// Brush stills per cue: times chosen to cover letter grips (intro), confetti, the jar and props.
const CUES = {
  demo: [3, 9, 15, 21],
  emotions: [1, 12, 30, 47],
  pincer: [2.5, 6.5, 9, 12],
  intro: [6.5, 13.2, 19.3, 25, 28.6, 32],
};

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const run = (cmd, a) => execFileSync(cmd, a, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });

const baseline = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : {};
const result = {};
const brushRuns = {};   // cue -> dir of freshly rendered brush stills

// Cue timing (tools/make-intro.mjs simulates the rig headlessly and writes cues/intro.json).
if (!only || only === 'intro') {
  run('node', ['tools/make-intro.mjs']);
  result['cues/intro.json'] = md5(fs.readFileSync(path.join(root, 'cues', 'intro.json'))).slice(0, 8);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'regress-'));
const hashDir = (dir, prefix) => fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
  .map((f) => md5(fs.readFileSync(path.join(dir, f))).slice(0, 8));

for (const [name, times] of Object.entries(CUES)) {
  if (only && only !== name) continue;
  const cue = `cues/${name}.json`;
  if (doFlat) {
    const out = path.join(tmp, `${name}-flat`);
    process.stdout.write(`flat  ${name} ... `);
    run('node', ['export.mjs', cue, '--out', out]);
    result[`${name}:flat`] = hashDir(out);
    console.log(`${result[`${name}:flat`].length} frames`);
  }
  if (doBrush) {
    const out = path.join(tmp, `${name}-brush`);
    process.stdout.write(`brush ${name} ... `);
    run('node', ['export.mjs', cue, '--style', 'brush', '--stills', times.join(','), '--out', out]);
    brushRuns[name] = out;
    console.log(`${fs.readdirSync(out).filter((f) => f.endsWith('.png')).length} stills`);
  }
}
const psnr = (a, b) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /average:(inf|[\d.]+)/.exec(r.stderr);
  return m ? (m[1] === 'inf' ? Infinity : parseFloat(m[1])) : NaN;
};
const stills = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();

let bad = 0;
if (write) {
  for (const [name, dir] of Object.entries(brushRuns)) {
    fs.rmSync(path.join(brushDir, name), { recursive: true, force: true });
    fs.mkdirSync(path.join(brushDir, name), { recursive: true });
    for (const f of stills(dir)) fs.copyFileSync(path.join(dir, f), path.join(brushDir, name, f));
  }
} else {
  for (const [name, dir] of Object.entries(brushRuns)) {
    const ref = path.join(brushDir, name);
    if (!fs.existsSync(ref)) { console.log(`--   ${name}:brush skipped (no local baseline in tools/baseline-brush; run --write)`); continue; }
    const want = stills(ref), got = stills(dir);
    if (want.length !== got.length) { console.log(`FAIL ${name}:brush: ${want.length} -> ${got.length} stills`); bad++; continue; }
    const low = got.map((f, i) => [f, psnr(path.join(dir, f), path.join(ref, want[i]))]).filter(([, d]) => !(d >= PSNR_MIN));
    if (low.length) { console.log(`FAIL ${name}:brush: ${low.map(([f, d]) => `${f} ${d.toFixed(1)} dB`).join(', ')}`); bad++; }
    else console.log(`ok   ${name}:brush (${got.length} stills, PSNR >= ${PSNR_MIN} dB)`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

if (write) {
  const merged = { ...baseline, ...result };
  fs.writeFileSync(basePath, JSON.stringify(merged) + '\n');
  console.log(`baseline written: ${Object.keys(merged).length} entries -> tools/baseline.json`);
  process.exit(0);
}

for (const [k, v] of Object.entries(result)) {
  const b = baseline[k];
  if (b == null) { console.log(`?? ${k}: not in baseline (run with --write)`); bad++; continue; }
  if (typeof v === 'string') { if (v !== b) { console.log(`FAIL ${k}: ${b} -> ${v}`); bad++; } continue; }
  const diffs = v.map((h, i) => (h !== b[i] ? i : -1)).filter((i) => i >= 0);
  if (v.length !== b.length) { console.log(`FAIL ${k}: ${b.length} -> ${v.length} images`); bad++; }
  else if (diffs.length) { console.log(`FAIL ${k}: ${diffs.length} of ${v.length} differ (first: index ${diffs[0]})`); bad++; }
  else console.log(`ok   ${k}`);
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed');
process.exit(bad ? 1 : 0);
