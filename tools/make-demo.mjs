#!/usr/bin/env node
// Generate an "all emotions" cue file for any registered character, like cues/emotions.json for Brian:
// the character stands centred at 40 px/unit and cycles through META.emotions, 2.5 s each.
//
//   node tools/make-demo.mjs bluemark                  -> cues/bluemark-emotions.json
//   node tools/make-demo.mjs bluemark --seconds 3 --out somewhere.json
//   then: node export.mjs cues/bluemark-emotions.json --preview
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const id = args.find((a, i) => !a.startsWith('--') && !String(args[i - 1] ?? '').startsWith('--'));
if (!id) { console.error('usage: node tools/make-demo.mjs <character id> [--seconds 2.5] [--out file.json]'); process.exit(1); }

const { RIG_SCRIPTS } = require(path.join(root, 'manifest.js'));
for (const f of RIG_SCRIPTS) if (/^(core\/(rig-core|stage|registry)|characters\/)/.test(f) && !f.includes('_template')) require(path.join(root, f));
const META = require(path.join(root, 'core/registry.js')).get(id).META;

const each = parseFloat(flag('--seconds', '2.5'));
const spec = {
  width: 1920, height: 1080, fps: 30, duration: META.emotions.length * each, seed: 7, shadows: false,
  rigs: [{ id, type: id, x: 960, y: 940, scale: 40, facing: 'right', emotion: 'neutral' }],
  cues: META.emotions.map((e, i) => ({ t: i * each, emotion: e })),
};
const out = flag('--out', path.join(root, 'cues', `${id}-emotions.json`));
fs.writeFileSync(out, JSON.stringify(spec, null, 1) + '\n');
console.log(`${out}: ${META.emotions.length} emotions, ${spec.duration} s`);
