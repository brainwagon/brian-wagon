#!/usr/bin/env python3
"""Synthesise the chiptune score and sound effects for a cue file.

    python3 tools/make-audio.py cues/intro.json out/intro/audio.wav

Reads "marks" (story sections, which gate the music layers), "sfx" (timed sound
effects) and the final "fade" cue from the cue file, so the sound follows the
picture.  Everything is square / triangle / noise, quantised to 8 bits.
"""
import json, sys
import numpy as np
from scipy.io import wavfile

SR = 44100
rng = np.random.RandomState(1234)
spec = json.load(open(sys.argv[1]))
total = spec["duration"]
N = int(total * SR)
music = np.zeros(N)
fx = np.zeros(N)

def hz(m):  # MIDI note -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)

def osc(kind, freq, n, duty=0.5):
    """freq: scalar or length-n array (Hz)."""
    f = np.full(n, freq, dtype=float) if np.ndim(freq) == 0 else np.asarray(freq, dtype=float)
    ph = np.cumsum(f) / SR
    fr = ph % 1.0
    if kind == "sq":
        return np.where(fr < duty, 1.0, -1.0)
    if kind == "tri":
        return np.round((2 * np.abs(2 * fr - 1) - 1) * 7.5) / 7.5      # 4-bit triangle
    if kind == "noise":
        step = np.maximum(1, (SR / np.maximum(f, 50)).astype(int))
        idx = np.cumsum(np.ones(n, dtype=int)) // np.maximum(step, 1)
        vals = rng.uniform(-1, 1, idx.max() + 2)
        return vals[idx]
    raise ValueError(kind)

def envelope(n, attack=0.004, decay=None, release=0.02, sustain=1.0):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(attack, 1e-4))
    if decay:
        e = e * (sustain + (1 - sustain) * np.exp(-t / decay))
    r = int(release * SR)
    if r > 0 and n > r:
        e[-r:] *= np.linspace(1, 0, r)
    return e

def voice(kind, freq, dur, vol=0.3, duty=0.5, attack=0.004, decay=None, release=0.02, sustain=1.0):
    n = max(1, int(dur * SR))
    f = freq if np.ndim(freq) == 0 else np.interp(np.linspace(0, len(freq) - 1, n), np.arange(len(freq)), freq)
    return osc(kind, f, n, duty) * envelope(n, attack, decay, release, sustain) * vol

def put(buf, t, arr, gain=1.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(arr))
    buf[i:j] += arr[: j - i] * gain

def sweep(a, b, dur, curve=1.0):
    n = max(2, int(dur * SR))
    return a + (b - a) * (np.linspace(0, 1, n) ** curve)

def lowpass(x, k):   # crude one-pole
    out = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc); out[i] = acc
    return out

def bandpass_noise(dur, f0, f1, vol):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    c = np.linspace(f0, f1, n)
    k = np.clip(2 * np.pi * c / SR, 0.01, 0.9)
    lo = np.empty(n); hi = np.empty(n); a = 0.0; b = 0.0
    for i in range(n):
        a += k[i] * (x[i] - a); b += k[i] * (a - b); lo[i] = a - b
    lo = lo / (np.max(np.abs(lo)) + 1e-9)
    return lo * envelope(n, 0.02, None, dur * 0.5) * vol

# ---------------------------------------------------------------- drums
def kick():
    n = int(0.16 * SR)
    f = 130 * np.exp(-np.arange(n) / SR * 22) + 42
    return np.sin(np.cumsum(f) / SR * 2 * np.pi) * np.exp(-np.arange(n) / SR * 20) * 0.9
def snare():
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    return (rng.uniform(-1, 1, n) * 0.6 + np.sign(np.sin(2 * np.pi * 190 * t)) * 0.3) * np.exp(-t * 26) * 0.55
def hat(open_=False):
    n = int((0.09 if open_ else 0.03) * SR)
    x = np.diff(rng.uniform(-1, 1, n + 1))
    return x * np.exp(-np.arange(n) / SR * (30 if open_ else 110)) * 0.5

# ---------------------------------------------------------------- score
BPM = 128
BEAT = 60 / BPM
S16 = BEAT / 4
S8 = BEAT / 2
BAR = BEAT * 4
CHORDS = [  # root (bass MIDI), arp tones
    (36, [60, 64, 67, 72]),   # C
    (43, [55, 59, 62, 67]),   # G
    (45, [57, 60, 64, 69]),   # Am
    (41, [53, 57, 60, 65]),   # F
]
LEAD_A = [
    [(0, 76, 1), (1, 79, 1), (2, 84, 2), (4, 83, 1), (5, 79, 1), (6, 76, 2)],
    [(0, 74, 1), (1, 79, 1), (2, 83, 2), (4, 81, 1), (5, 79, 1), (6, 74, 2)],
    [(0, 72, 1), (1, 76, 1), (2, 81, 2), (4, 79, 1), (5, 76, 1), (6, 72, 2)],
    [(0, 69, 1), (1, 72, 1), (2, 77, 2), (4, 76, 1), (5, 74, 1), (6, 72, 2)],
]
LEAD_B = [   # celebration: bright, bouncing
    [(0, 84, 1), (1, 84, 1), (2, 79, 1), (3, 84, 1), (4, 88, 2), (6, 86, 1), (7, 84, 1)],
    [(0, 83, 1), (1, 83, 1), (2, 79, 1), (3, 83, 1), (4, 86, 2), (6, 88, 1), (7, 86, 1)],
    [(0, 81, 1), (1, 84, 1), (2, 88, 1), (3, 84, 1), (4, 93, 2), (6, 91, 1), (7, 88, 1)],
    [(0, 89, 1), (1, 88, 1), (2, 84, 1), (3, 81, 1), (4, 84, 4)],
]
LEAD_Q = [   # pondering: sparse questions
    [(0, 76, 2), (3, 79, 2)], [(0, 81, 3)], [(0, 79, 2), (3, 76, 2)], [(0, 74, 4)],
]

marks = sorted(spec["marks"], key=lambda m: m["t"])
end_t = next((m["t"] for m in marks if m["name"] == "end"), total)

def section(t):
    name = "title"
    for m in marks:
        if m["t"] <= t + 1e-6:
            name = m["name"]
    return name

# which layers play in each section:  bass, drums(0/1/2), arp(0/1/2 = off/slow/full), lead
LAYERS = {
    "title":     dict(bass=0, drums=0, arp=1, lead=None, vol=0.55),
    "walk":      dict(bass=1, drums=1, arp=2, lead=None, vol=0.8),
    "think":     dict(bass=1, drums=0, arp=1, lead="Q", vol=0.5),
    "aha":       dict(bass=1, drums=2, arp=2, lead="A", vol=1.0),
    "work":      dict(bass=1, drums=2, arp=2, lead="A", vol=0.95),
    "push":      dict(bass=1, drums=2, arp=2, lead="A", vol=0.95),
    "ponder":    dict(bass=1, drums=0, arp=1, lead="Q", vol=0.55),
    "swap":      dict(bass=1, drums=1, arp=2, lead="A", vol=0.85),
    "carry":     dict(bass=1, drums=1, arp=2, lead="A", vol=0.85),
    "read":      dict(bass=1, drums=0, arp=2, lead=None, vol=0.7),
    "gasp":      dict(bass=0, drums=0, arp=0, lead=None, vol=0.0),
    "celebrate": dict(bass=1, drums=3, arp=2, lead="B", vol=1.0),
    "wave":      dict(bass=1, drums=2, arp=2, lead="A", vol=0.95),
    "end":       dict(bass=1, drums=0, arp=1, lead=None, vol=0.6),
}

nbars = int(total / BAR) + 1
for bar in range(nbars):
    b0 = bar * BAR
    root, tones = CHORDS[bar % 4]
    # bass: eighth-note pump
    for s in range(8):
        t = b0 + s * S8
        L = LAYERS[section(t)]
        if t >= total or not L["bass"] or t >= end_t:
            continue
        m = root + (12 if s in (2, 6) else 0)
        if L["drums"] == 0 and s % 2:      # sparse in quiet sections
            continue
        put(music, t, voice("tri", hz(m), S8 * 0.9, 0.42 * L["vol"], attack=0.003, release=0.02))
    # arpeggio, sixteenths
    for s in range(16):
        t = b0 + s * S16
        L = LAYERS[section(t)]
        if t >= total or not L["arp"] or t >= end_t:
            continue
        if L["arp"] == 1 and s % 4:
            continue
        m = tones[(s % 4) if L["arp"] == 2 else (s // 4)]
        put(music, t, voice("sq", hz(m), S16 * 0.85, 0.11 * L["vol"], duty=0.125, decay=0.09, release=0.01))
    # drums
    for s in range(16):
        t = b0 + s * S16
        L = LAYERS[section(t)]
        if t >= total or not L["drums"] or t >= end_t:
            continue
        d = L["drums"]
        if s in (0, 8) or (d >= 2 and s in (6, 14)):
            put(music, t, kick(), 0.55 * L["vol"])
        if d >= 2 and s in (4, 12):
            put(music, t, snare(), 0.5 * L["vol"])
        if (d == 1 and s % 4 == 2) or (d == 2 and s % 2 == 0) or d == 3:
            put(music, t, hat(open_=(s % 8 == 6)), 0.4 * L["vol"])
    # lead
    for sec_key, table in (("A", LEAD_A), ("B", LEAD_B), ("Q", LEAD_Q)):
        for (p, m, ln) in table[bar % 4]:
            t = b0 + p * S8
            L = LAYERS[section(t)]
            if t >= total or L["lead"] != sec_key or t >= end_t:
                continue
            vol = (0.20 if sec_key != "Q" else 0.13) * L["vol"]
            put(music, t, voice("sq", hz(m), ln * S8 * 0.92, vol, duty=0.25, decay=0.35, sustain=0.6, release=0.03))
            if sec_key == "B":     # a shadow an octave down thickens the fanfare
                put(music, t, voice("sq", hz(m - 12), ln * S8 * 0.92, vol * 0.4, duty=0.5, release=0.03))

# aha stinger and closing chord
tA = next((m["t"] for m in marks if m["name"] == "aha"), None)
if tA is not None:
    for k, m in enumerate([67, 72, 76, 79, 84]):
        put(music, tA + k * S16, voice("sq", hz(m), 0.12, 0.1, duty=0.25, decay=0.1))
for k, m in enumerate([48, 60, 64, 67, 72, 76]):
    put(music, end_t + k * 0.09, voice("sq", hz(m), 1.6, 0.11, duty=0.25, decay=0.9, release=0.4))
put(music, end_t, voice("tri", hz(36), 1.8, 0.45, release=0.5))
# riser under the "read again" section
tR = next((m["t"] for m in marks if m["name"] == "read"), None)
tG = next((m["t"] for m in marks if m["name"] == "gasp"), None)
if tR is not None and tG is not None:
    d = tG - tR
    put(music, tR, voice("sq", sweep(hz(60), hz(84), d, 1.6), d, 0.09, duty=0.125, attack=0.05, release=0.05))

# ---------------------------------------------------------------- effects
PENT = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]

def sfx_shimmer(t, **_):
    for k, m in enumerate([84, 88, 91, 96, 100]):
        put(fx, t + k * 0.07, voice("sq", hz(m), 0.5, 0.08, duty=0.5, decay=0.18, release=0.05))
        put(fx, t + k * 0.07, voice("tri", hz(m - 12), 0.4, 0.1, decay=0.2, release=0.05))

def sfx_roll(t, dur=1.0, **_):
    n = int(dur * SR)
    hum = voice("tri", 58 + 4 * np.sin(np.linspace(0, dur * 8, 256)), dur, 0.10, attack=0.15, release=0.2)
    put(fx, t, hum)
    for k in range(int(dur * 15)):
        tick = lowpass(rng.uniform(-1, 1, int(0.014 * SR)), 0.25) * np.exp(-np.arange(int(0.014 * SR)) / SR * 220)
        put(fx, t + k / 15.0 + 0.02, tick, 0.55)

def sfx_blip(t, i=0, **_):
    put(fx, t, voice("sq", hz(PENT[i % len(PENT)]), 0.07, 0.17, duty=0.25, decay=0.05, release=0.02))

def sfx_think(t, **_):
    f = np.concatenate([sweep(hz(62), hz(67), 0.25), sweep(hz(67), hz(64), 0.3)])
    vib = 1 + 0.02 * np.sin(np.arange(len(f)) / SR * 2 * np.pi * 7)
    put(fx, t, voice("tri", f * vib, 0.55, 0.32, attack=0.03, release=0.15))
    put(fx, t + 0.7, voice("tri", hz(69) * (1 + 0.02 * np.sin(np.linspace(0, 30, int(0.4 * SR)))), 0.4, 0.22, attack=0.03, release=0.2))

def sfx_ding(t, **_):
    put(fx, t, voice("sq", hz(88), 0.6, 0.22, duty=0.5, decay=0.22, release=0.1))
    put(fx, t + 0.09, voice("sq", hz(93), 0.7, 0.22, duty=0.5, decay=0.28, release=0.15))
    put(fx, t, voice("tri", hz(100), 0.5, 0.15, decay=0.2, release=0.1))

def sfx_boing(t, **_):
    f = np.concatenate([sweep(180, 650, 0.14), sweep(650, 330, 0.24)])
    f = f * (1 + 0.04 * np.sin(np.arange(len(f)) / SR * 2 * np.pi * 18))
    put(fx, t, voice("tri", f, 0.38, 0.5, decay=0.3, release=0.06))

def sfx_thud(t, **_):
    n = int(0.16 * SR)
    put(fx, t, np.sin(np.cumsum(sweep(120, 38, 0.16)) / SR * 2 * np.pi)[:n] * np.exp(-np.arange(n) / SR * 22) * 0.6)

def sfx_snap(t, **_):
    put(fx, t, np.diff(rng.uniform(-1, 1, int(0.02 * SR) + 1)) * np.exp(-np.arange(int(0.02 * SR)) / SR * 150) * 0.6)
    put(fx, t, voice("sq", sweep(1000, 480, 0.05), 0.05, 0.3, duty=0.25, decay=0.03, release=0.01))

def sfx_slide(t, dur=1.0, **_):
    f = sweep(300, 420, dur) * (1 + 0.03 * np.sin(np.arange(int(dur * SR)) / SR * 2 * np.pi * 9))
    put(fx, t, voice("tri", f, dur, 0.13, attack=0.08, release=0.15))

def sfx_put(t, **_):
    put(fx, t, voice("sq", sweep(520, 330, 0.06), 0.06, 0.28, duty=0.25, decay=0.04, release=0.01))
    put(fx, t + 0.05, voice("sq", hz(72), 0.05, 0.15, duty=0.5, decay=0.03))

def sfx_swoosh(t, **_):
    put(fx, t, bandpass_noise(0.3, 500, 3000, 0.7))

def sfx_gasp(t, **_):
    put(fx, t, voice("sq", sweep(320, 1000, 0.18), 0.18, 0.34, duty=0.25, release=0.03))
    put(fx, t + 0.2, bandpass_noise(0.25, 1800, 900, 0.35))

def sfx_fanfare(t, **_):
    for k, m in enumerate([72, 76, 79, 84]):
        put(fx, t + k * 0.09, voice("sq", hz(m), 0.2, 0.2, duty=0.25, decay=0.12))
    for m in (72, 76, 79, 84):
        put(fx, t + 0.4, voice("sq", hz(m), 1.4, 0.09, duty=0.5, decay=0.8, release=0.3))
    put(fx, t + 0.4, bandpass_noise(0.9, 4000, 2500, 0.6))
    for k in range(14):        # confetti sparkles
        m = 84 + [0, 4, 7, 12][k % 4]
        put(fx, t + 0.5 + k * 0.13 + rng.uniform(0, 0.05), voice("sq", hz(m), 0.06, 0.09, duty=0.125, decay=0.03))

def sfx_bloop(t, k=0, **_):
    m = 79 if k % 2 == 0 else 84
    put(fx, t, voice("sq", sweep(hz(m - 3), hz(m), 0.09), 0.09, 0.26, duty=0.5, decay=0.06, release=0.02))

for e in spec["sfx"]:
    globals()["sfx_" + e["name"]](e["t"], **{k: v for k, v in e.items() if k not in ("t", "name")})

# ---------------------------------------------------------------- master
mix = music * 0.45 + fx * 0.65
fade = next((c for c in spec["cues"] if "fade" in c), None)
if fade:
    t0, d = fade["t"], fade["fade"][1]
    t = np.arange(N) / SR
    mix *= np.clip(1 - (t - t0) / d, 0, 1)
mix = np.clip(np.tanh(mix * 1.2) / np.tanh(1.2), -1, 1)
mix = np.round(mix * 127) / 127                 # 8-bit
out = np.stack([mix, mix], axis=1)
wavfile.write(sys.argv[2], SR, (out * 30000).astype(np.int16))
print(f"{sys.argv[2]}: {total:.1f}s, peak {np.max(np.abs(mix)):.2f}")
