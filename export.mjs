#!/usr/bin/env node
// Render a cue list to a transparent PNG sequence (or a single still).
//
//   node export.mjs cues/demo.json                 -> out/demo/frame_00000.png ...
//   node export.mjs cues/demo.json --still 3.5     -> out/demo/still_3.50.png
//   node export.mjs cues/demo.json --preview       -> also out/demo/preview.mp4 (on grey)
//   node export.mjs cues/intro.json --stills 1,6.5  -> several stills in one pass
//   (a cue file with "background" is opaque: --preview then writes <name>.mp4 with its "audio" track)
//   node export.mjs cues/demo.json --out some/dir
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const cueFile = args.find((a, i) => !a.startsWith('--') && !['--still', '--stills', '--out', '--bg'].includes(args[i - 1]));
if (!cueFile) {
  console.error('usage: node export.mjs <cues.json> [--out dir] [--still seconds] [--preview] [--bg #808890]');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(cueFile, 'utf8'));
const fps = spec.fps ?? 30;
const outDir = flag('--out') ?? path.join(here, 'out', path.basename(cueFile, '.json'));
const still = flag('--still');
const stills = flag('--stills');
fs.mkdirSync(outDir, { recursive: true });

// Use Playwright's own browser if it matches this version; otherwise fall back
// to any Chromium already in the Playwright cache.
async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
    const candidates = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium/.test(d)).sort().reverse() : [];
    for (const d of candidates) {
      for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const exe = path.join(cache, d, rel);
        if (fs.existsSync(exe)) return chromium.launch({ executablePath: exe });
      }
    }
    throw err;
  }
}

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(path.join(here, 'render.html')).href);
const total = await page.evaluate((s) => window.setup(s), spec);

const save = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

if (stills != null) {
  const want = new Map(stills.split(',').map((t) => [Math.round(Number(t) * fps), Number(t)]));
  const last = Math.max(...want.keys());
  for (let i = 0; i <= last; i++) {
    const url = await page.evaluate((n) => window.renderFrame(n), i);
    if (want.has(i)) { const f = path.join(outDir, `still_${want.get(i).toFixed(2)}.png`); save(f, url); console.log(f); }
  }
} else if (still != null) {
  const target = Math.round(Number(still) * fps);
  let url;
  for (let i = 0; i <= target; i++) url = await page.evaluate((n) => window.renderFrame(n), i);
  const file = path.join(outDir, `still_${Number(still).toFixed(2)}.png`);
  save(file, url);
  console.log(file);
} else {
  for (let i = 0; i < total; i++) {
    save(path.join(outDir, `frame_${String(i).padStart(5, '0')}.png`), await page.evaluate((n) => window.renderFrame(n), i));
    if (i % fps === 0) process.stdout.write(`\r${i}/${total}`);
  }
  console.log(`\r${total} frames -> ${outDir}`);
  if (args.includes('--preview')) {
    const frames = ['-framerate', String(fps), '-i', path.join(outDir, 'frame_%05d.png')];
    if (spec.background) {
      // Opaque frames: no grey to composite on; add the audio track if there is one.
      const mp4 = path.join(outDir, path.basename(cueFile, '.json') + '.mp4');
      const audio = spec.audio && fs.existsSync(path.join(here, spec.audio)) ? path.join(here, spec.audio) : null;
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', ...frames, ...(audio ? ['-i', audio] : []),
        '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '16', ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), mp4,
      ], { stdio: 'inherit' });
      console.log(mp4);
    } else {
      const bg = (flag('--bg') ?? '#808890').replace('#', '0x');
      const mp4 = path.join(outDir, 'preview.mp4');
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', ...frames,
        '-f', 'lavfi', '-i', `color=c=${bg}:s=${spec.width}x${spec.height}:r=${fps}`,
        '-filter_complex', '[1][0]overlay=shortest=1,format=yuv420p', '-c:v', 'libx264', '-crf', '18', mp4,
      ], { stdio: 'inherit' });
      console.log(mp4);
    }
  }
}
await browser.close();
