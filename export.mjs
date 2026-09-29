#!/usr/bin/env node
// Render a cue list to a transparent PNG sequence (or a single still).
//
//   node export.mjs cues/demo.json                 -> out/demo/frame_00000.png ...
//   node export.mjs cues/demo.json --still 3.5     -> out/demo/still_3.50.png
//   node export.mjs cues/demo.json --preview       -> also out/demo/preview.mp4 (on grey)
//   node export.mjs cues/intro.json --stills 1,6.5  -> several stills in one pass
//   (a cue file with "background" is opaque: --preview then writes <name>.mp4 with its "audio" track)
//   node export.mjs cues/intro.json --style brush   -> hand-drawn p5.brush look, out/intro-brush/ (--style flat forces flat paper)
//   node export.mjs cues/demo.json --out some/dir
//   MP4s are encoded to YouTube's upload guidelines by default (--youtube; --no-youtube for a quick, plain encode):
//   H.264 High yuv420p, CRF 15, Rec. 709 tagged, keyframe every 0.5 s, 2 B-frames, faststart; audio AAC 320k at
//   48 kHz, normalised to -14 LUFS / -1 dBTP.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const cueFile = args.find((a, i) => !a.startsWith('--') && !['--still', '--stills', '--out', '--bg', '--style', '--gl', '--browser'].includes(args[i - 1]));
if (!cueFile) {
  console.error('usage: node export.mjs <cues.json> [--out dir] [--still seconds] [--preview] [--bg #808890] [--style brush|flat] [--gl software] [--no-youtube]');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(cueFile, 'utf8'));
// --style overrides the cue file's "style"; a bare mode name or a JSON object of options.
const styleArg = flag('--style');
if (styleArg) spec.style = styleArg.trim().startsWith('{') ? JSON.parse(styleArg) : styleArg;
const styleMode = typeof spec.style === 'string' ? spec.style : spec.style?.mode;
const tag = styleMode && styleMode !== 'flat' ? `-${styleMode}` : '';
const fps = spec.fps ?? 30;
const outDir = flag('--out') ?? path.join(here, 'out', path.basename(cueFile, '.json') + tag);
const still = flag('--still');
const stills = flag('--stills');
fs.mkdirSync(outDir, { recursive: true });

// The brush style needs WebGL2.  Default: the GPU, via ANGLE -> Mesa D3D12 (works in WSL2 through /dev/dxg;
// MESA_D3D12_DEFAULT_ADAPTER_NAME picks the NVIDIA card over the CPU adapter).  `--gl software` uses
// SwiftShader instead, which works anywhere but is roughly 100x slower for brush.
const GL_ARGS = flag('--gl') === 'software'
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'];
process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME ??= 'NVIDIA';

// Browser choice.  Playwright's own build is used when it is installed; otherwise any Chromium in the
// Playwright cache.  For the brush style, chromium_headless_shell-1234 is skipped when 1208 is present:
// 1234 force-loses the WebGL context after roughly 130 readbacks in a frame, 1208 does not.
// `--browser /path/to/chrome-headless-shell` overrides all of this.
async function launch() {
  const opts = { args: GL_ARGS };
  const explicit = flag('--browser');
  if (explicit) return chromium.launch({ ...opts, executablePath: explicit });
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache) : [];
  const exeIn = (d) => ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']
    .map((rel) => path.join(cache, d, rel)).find((e) => fs.existsSync(e));
  if (tag && dirs.includes('chromium_headless_shell-1208')) {
    const exe = exeIn('chromium_headless_shell-1208');
    if (exe) return chromium.launch({ ...opts, executablePath: exe });
  }
  try {
    return await chromium.launch(opts);
  } catch (err) {
    for (const d of dirs.filter((d) => /^chromium/.test(d)).sort().reverse()) {
      const exe = exeIn(d);
      if (exe) return chromium.launch({ ...opts, executablePath: exe });
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
    const url = await page.evaluate(([n, d]) => window.renderFrame(n, d), [i, want.has(i)]);
    if (want.has(i)) { const f = path.join(outDir, `still_${want.get(i).toFixed(2)}.png`); save(f, url); console.log(f); }
  }
} else if (still != null) {
  const target = Math.round(Number(still) * fps);
  let url;
  for (let i = 0; i <= target; i++) url = await page.evaluate(([n, d]) => window.renderFrame(n, d), [i, i === target]);
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
    const youtube = !args.includes('--no-youtube');
    // Video: YouTube's recommended H.264 settings; the RGB frames are converted with the Rec. 709 matrix
    // and the file is tagged to match, so colours are not guessed at on their side.
    const yuv = youtube ? 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p' : 'format=yuv420p';
    const venc = youtube
      ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-g', String(Math.round(fps / 2)), '-bf', '2',
         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart']
      : ['-c:v', 'libx264', '-crf', '16'];
    // Audio: two-pass loudness normalisation (-14 LUFS, -1 dBTP), 48 kHz, 320k AAC.
    const audioArgs = (file) => {
      if (!youtube) return ['-c:a', 'aac', '-b:a', '192k'];
      const ln = 'loudnorm=I=-14:TP=-1:LRA=11';
      const pass1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `${ln}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
      const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(pass1.stderr);
      const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';   // the score's WAV has no channel layout tag
      let af = `${ln},${fmt}`;
      if (m) {
        const j = JSON.parse(m[0]);
        af = `${ln}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,${fmt}`;
        console.log(`audio: ${j.input_i} LUFS, ${j.input_tp} dBTP in -> -14 LUFS, -1 dBTP`);
      }
      return ['-af', af, '-c:a', 'aac', '-b:a', '320k'];
    };
    const frames = ['-framerate', String(fps), '-i', path.join(outDir, 'frame_%05d.png')];
    if (spec.background) {
      // Opaque frames: no grey to composite on; add the audio track if there is one.
      const mp4 = path.join(outDir, path.basename(cueFile, '.json') + tag + '.mp4');
      const audio = spec.audio && fs.existsSync(path.join(here, spec.audio)) ? path.join(here, spec.audio) : null;
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', ...frames, ...(audio ? ['-i', audio] : []),
        '-vf', yuv, ...venc, ...(audio ? [...audioArgs(audio), '-shortest'] : []), mp4,
      ], { stdio: 'inherit' });
      console.log(mp4);
    } else {
      const bg = (flag('--bg') ?? '#808890').replace('#', '0x');
      const mp4 = path.join(outDir, 'preview.mp4');
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', ...frames,
        '-f', 'lavfi', '-i', `color=c=${bg}:s=${spec.width}x${spec.height}:r=${fps}`,
        '-filter_complex', `[1][0]overlay=shortest=1,${yuv}`, ...venc, mp4,
      ], { stdio: 'inherit' });
      console.log(mp4);
    }
  }
}
await browser.close();
