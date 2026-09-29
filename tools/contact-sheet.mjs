#!/usr/bin/env node
// Contact sheet of a registered character: one instance per emotion in a grid, rendered through the normal
// exporter (so it shows exactly what a cue file would).  Works for any character in the registry.
//
//   node tools/contact-sheet.mjs bluemark                   all emotions at 21.6 px/unit (1080p at 20%), 5 columns
//   node tools/contact-sheet.mjs bluemark --scale 40 --cols 3 --page 1     close-up, page 1 of the emotions
//   node tools/contact-sheet.mjs brian --emotions happy,sad --scale 30
//   options: --t seconds (default 2.5, lets the emotion blend settle)  --out file.png  --style brush|flat
//            --facing left|right  --bg '#7b8794'
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const id = args.find((a, i) => !a.startsWith('--') && !String(args[i - 1] ?? '').startsWith('--'));
if (!id) { console.error('usage: node tools/contact-sheet.mjs <character id> [--scale 21.6] [--cols 5] [--page n] [--emotions a,b] [--t 2.5] [--out file.png]'); process.exit(1); }

// Load the registry the same way the pages do (manifest order), skipping browser-only files.
const { RIG_SCRIPTS } = require(path.join(root, 'manifest.js'));
for (const f of RIG_SCRIPTS) if (/^(core\/(rig-core|stage|registry)|characters\/)/.test(f) && !f.includes('_template')) require(path.join(root, f));
const Class = require(path.join(root, 'core/registry.js')).get(id);
const META = Class.META;

const W = 1920, H = 1080, scale = parseFloat(flag('--scale', '21.6'));
const cols = parseInt(flag('--cols', String(Math.max(1, Math.round(W / (scale * 18)))) ), 10);
let emotions = (flag('--emotions') ? flag('--emotions').split(',') : META.emotions);
const cellW = W / cols, cellH = scale * 12.5;                    // a rig is ~10 units tall plus headroom for overlays
const rows = Math.max(1, Math.floor(H / cellH)), perPage = cols * rows;
const page = parseInt(flag('--page', '1'), 10);
emotions = emotions.slice((page - 1) * perPage, page * perPage);
if (!emotions.length) { console.error('no emotions on that page'); process.exit(1); }

const t = parseFloat(flag('--t', '2.5'));
const rigs = emotions.map((e, i) => {
  const c = i % cols, r = Math.floor(i / cols);
  return { id: `e${i}`, type: id, x: cellW * (c + 0.5), y: cellH * (r + 1) - scale * 1.2, scale, emotion: e, facing: flag('--facing', 'right') };
});
const spec = { width: W, height: H, fps: 30, duration: t + 0.5, seed: 7, background: flag('--bg', '#7b8794'), rigs, cues: [] };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
const cue = path.join(tmp, 'sheet.json');
fs.writeFileSync(cue, JSON.stringify(spec));
const style = flag('--style');
execFileSync('node', ['export.mjs', cue, '--still', String(t), '--out', tmp, ...(style ? ['--style', style] : [])], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
const still = path.join(tmp, `still_${t.toFixed(2)}.png`);

// Label each cell with its emotion name.
const out = flag('--out', path.join(root, 'out', 'sheets', `${id}-${scale}${page > 1 ? '-p' + page : ''}.png`));
fs.mkdirSync(path.dirname(out), { recursive: true });
const labels = emotions.map((e, i) => `drawtext=text='${e}':x=${Math.round(cellW * (i % cols) + 8)}:y=${Math.round(cellH * Math.floor(i / cols) + 6)}:fontsize=20:fontcolor=white:box=1:boxcolor=0x00000066`).join(',');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', still, '-vf', labels, out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(out);
