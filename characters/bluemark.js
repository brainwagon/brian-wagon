/*
 * Bluemark — a stooped, blue-skinned zombie in a white trucker cap with a pink brain on it.
 * See character-spec-bluemark.md and sketches/bluemark.jpg.
 *
 * A puppet: head, torso, two arms and two legs as separate cut-paper pieces on joints (forward kinematics, with
 * an analytic two-bone solve for pointing).  Rig geometry is in units: origin between the feet at ground contact
 * (a little behind his centre of mass, so mirroring him looks steady), +y up, drawn facing right, about 10 units
 * tall.  Same conventions, API and emotion names as BrianWagon; see core/rig-core.js (CutPaperRig).
 */
(function (root) {
  'use strict';

  const RigCore = root.RigCore || require('../core/rig-core.js');
  const RigRegistry = root.RigRegistry || require('../core/registry.js');
  const {
    TAU, DEG, clamp, lerp, smooth, backOut, noise1, col, circle, ellipse, arcPts, densify, ribbon, CutPaperRig,
  } = RigCore;

  const PAL = Object.assign({}, RigCore.PAL, {
    skin: col('#5AA0D8'), skinShade: col('#3F7FB8'), skinHi: col('#86BDE8'),
    shirt: col('#F4F1EA'), shirtShade: col('#D3CEC1'),
    pants: col('#1E1E27'), pantsShade: col('#14141B'), shoe: col('#0E0E13'),
    cap: col('#F4F2EC'), capShade: col('#CFC9BE'), capPanel: col('#FBFAF6'), brim: col('#E3DFD4'),
    emblem: col('#EE8FA8'), emblemDeep: col('#B8456F'), emblemHi: col('#F7CDB8'),
    blood: col('#A8252B'), hair: col('#20222B'),
    lid: col('#F4F1EA'), lash: col('#1B2B3A'), nostril: col('#1B2033'), teeth: col('#F1E8C8'), mouthIn: col('#3A1518'),
  });

  const G = {
    thigh: 2.1, shin: 2.05, ankle: 0.28,
    torso: 2.7, hump: 0.55, neck: 0.5,
    upperArm: 2.0, foreArm: 2.0, handR: 0.62,
    headRx: 1.5, headRy: 1.58,   // (nominal; the head is the HEAD outline)
    pelvisX: -1.0,
    baseLean: 47 * DEG,        // forward stoop of the torso from vertical
    kneeFlex: 0.2, swingFlex: 0.75,
    reach: 1.75,               // half a stride: how far the foot travels forward/back of the hip when walking
  };
  const LEG_LEN = G.thigh + G.shin;

  // Face features in head-local units (head centre at the origin, facing +x).
  const EYE = [{ x: 0.25, y: 0.25, rx: 0.4 }, { x: 0.98, y: 0.18, rx: 0.48 }];   // far, near
  const MOUTH = { x: 0.72, y: -0.8, w: 0.58 };

  const SHOE_CORNERS = [[-0.42, 0.14], [-0.44, -0.26], [0.8, -0.26], [1.12, -0.14], [1.14, 0.06], [0.55, 0.2]];
  const SHOE = densify(SHOE_CORNERS, 0.1);

  // Closed Catmull-Rom curve through pts, `n` samples per segment.
  function spline(pts, n = 6) {
    const out = [], m = pts.length;
    for (let i = 0; i < m; i++) {
      const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - 3 * p2[d] + p3[d] - p0[d]) * t3)));
      }
    }
    return out;
  }
  // The sketch's head: broad across the brow, hollow at the cheek, tapering to a long jaw and a heavy chin.
  const HEAD = spline([
    [1.12, 1.15], [1.42, 0.62], [1.5, 0.22], [1.6, -0.12], [1.44, -0.4], [1.36, -0.66], [1.3, -0.92],
    [1.22, -1.32], [0.85, -1.66], [0.2, -1.55], [-0.5, -1.3], [-1.02, -0.9], [-1.42, -0.2], [-1.56, 0.5], [-1.0, 1.3], [0.1, 1.55],
  ]);
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const bone = (a, b, w0, w1) => ribbon(densify([a, b], 0.1, false), (u) => lerp(w0, w1, u));

  // The pink brain on the cap: a scalloped oval with two darker folds.
  const EMBLEM = (() => {
    const p = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, r = 1 + 0.13 * Math.sin(6 * a + 0.5) + 0.05 * Math.sin(11 * a);
      p.push([0.5 * Math.cos(a) * r, 0.4 * Math.sin(a) * r]);
    }
    return p;
  })();
  const EMBLEM_FOLDS = [
    ribbon(arcPts(-0.1, -0.02, 0.26, 200 * DEG, 340 * DEG, 0.04), 0.05),
    ribbon(arcPts(0.12, 0.06, 0.2, 20 * DEG, 160 * DEG, 0.04), 0.05),
    ribbon([[0.02, -0.34], [0.0, 0.34]], 0.04),
  ];

  const NEUTRAL = {
    // eyes / face (the keys the base class reads are the same as Brian's)
    lidUp: 0, lidAsym: 0, lidTilt: 0, eyeScale: 1, pupil: 1,
    gazeFollow: 1, gazeX: 0, gazeY: 0, diverge: 0,
    dartRate: 0.25, dartAmp: 0.2, tremble: 0,
    autoBlink: 0.7, blinkDur: 0.32,
    mouthW: 1, curve: 0.05, open: 0.35, wave: 0, zig: 0, skew: 0, mouthTilt: 0, tilt: 0,
    // body
    bob: 0.5, bobSpeed: 0.2, sway: 0, swaySpeed: 0.3, bounce: 0, bounceSpeed: 1.6, jiggle: 0, shudder: 0,
    slump: 0, headDrop: 0, headTilt: 0, armHang: 1, armRaiseN: 0, armRaiseF: 0, handChin: 0, handHead: 0, gait: 1, twitch: 0, chompRate: 0,
    // overlays
    ovSparkle: 0, ovTear: 0, ovQuestion: 0, ovExclaim: 0, ovThought: 0, ovSweat: 0, ovZzz: 0, ovAnger: 0, ovBlush: 0, ovHeart: 0,
  };

  // The same 20 emotion names as Brian, expressed as a stoop, head and arm posture plus the face.
  const PRESETS = {
    neutral: {},
    happy: { lidUp: -0.25, curve: 0.9, open: 0.55, bob: 0.8, bounce: 0.05, bounceSpeed: 1.8, slump: -0.4, headDrop: -0.35, armRaiseN: 0.15, ovSparkle: 1 },
    sad: { lidUp: 0.3, lidTilt: 0.3, gazeY: -0.55, gazeFollow: 0.5, blinkDur: 0.5, curve: -0.8, open: 0.15, bob: 0.3, slump: 0.9, headDrop: 1, armHang: 0.6, gait: 0.7, ovTear: 1 },
    confused: { lidAsym: 0.25, tilt: 0.15, headTilt: 0.6, diverge: 1, dartRate: 1.4, dartAmp: 0.35, curve: -0.15, open: 0.4, wave: 1, sway: 0.12, handHead: 1, ovQuestion: 1 },
    excited: { lidUp: -0.3, dartRate: 2.5, curve: 1, open: 0.75, bob: 1, bobSpeed: 1.1, bounce: 0.08, bounceSpeed: 3, jiggle: 1, slump: -0.5, armRaiseN: 0.5, armRaiseF: 0.5, ovExclaim: 1 },
    thinking: { lidAsym: 0.15, gazeFollow: 0.15, gazeX: 0.55, gazeY: 0.6, dartRate: 0.1, dartAmp: 0.08, curve: -0.1, open: 0.15, skew: 1, headTilt: 0.6, handChin: 1, sway: 0.05, ovThought: 1 },
    celebrating: { lidUp: -0.4, autoBlink: 0, curve: 1, open: 1, bounce: 0.12, bounceSpeed: 2.2, bob: 1, slump: -0.7, headDrop: -0.5, armRaiseN: 1, armRaiseF: 1, ovSparkle: 1 },
    fearful: { lidUp: -0.4, eyeScale: 1.2, pupil: 0.6, tremble: 0.12, dartRate: 2.2, curve: -0.3, open: 0.6, zig: 1, shudder: 0.03, slump: -0.8, headDrop: -0.3, armRaiseN: 0.5, armRaiseF: 0.45, ovSweat: 1 },
    sleepy: { lidUp: 0.5, gazeY: -0.4, gazeFollow: 0.3, dartRate: 0.05, autoBlink: 0.4, blinkDur: 0.8, open: 0.55, bob: 0.3, bobSpeed: 0.08, slump: 0.5, headDrop: 0.8, armHang: 0.7, gait: 0.6, ovZzz: 1 },
    angry: { lidUp: 0.1, lidTilt: -0.5, gazeFollow: 0.9, dartRate: 0.05, autoBlink: 0.4, curve: -0.6, open: 0.3, zig: 0.4, jiggle: 0.4, shudder: 0.012, slump: 0.25, headDrop: 0.2, armHang: 0.25, ovAnger: 1 },
    surprised: { lidUp: -0.45, eyeScale: 1.2, dartRate: 0.4, autoBlink: 0.3, open: 1, mouthW: 0.7, slump: -0.75, headDrop: -0.4, armRaiseN: 0.3, armRaiseF: 0.3, ovExclaim: 1 },
    curious: { lidUp: -0.15, eyeScale: 1.08, gazeFollow: 0.4, gazeX: 0.45, gazeY: 0.3, dartRate: 0.5, curve: 0.2, open: 0.4, tilt: 0.12, headTilt: 0.5, sway: 0.05, armRaiseN: 0.2 },
    suspicious: { lidUp: 0.25, lidAsym: 0.1, lidTilt: -0.15, gazeFollow: 0.1, gazeX: 0.7, dartRate: 0.1, autoBlink: 0.4, curve: -0.05, skew: 0.6, slump: 0.1, headDrop: 0.3, armHang: 0.7 },
    bored: { lidUp: 0.3, gazeFollow: 0.7, gazeX: 0.2, gazeY: -0.1, dartRate: 0.1, autoBlink: 0.5, blinkDur: 0.45, curve: -0.1, open: 0.3, bob: 0.35, bobSpeed: 0.1, slump: 0.6, headDrop: 0.5, armHang: 0.6, gait: 0.7 },
    embarrassed: { lidUp: 0.05, gazeFollow: 0.2, gazeX: -0.45, gazeY: -0.5, dartRate: 0.5, curve: 0.3, open: 0.2, wave: 0.6, headDrop: 0.8, slump: 0.3, handHead: 0.7, sway: 0.05, ovBlush: 1 },
    proud: { lidUp: 0.1, gazeFollow: 0.6, gazeY: 0.1, dartRate: 0.1, curve: 0.6, open: 0.2, slump: -0.95, headDrop: -0.55, bob: 0.6, armHang: 1.2 },
    smug: { lidUp: 0.25, gazeFollow: 0.5, gazeX: 0.2, dartRate: 0.08, curve: 0.35, open: 0.2, mouthTilt: 0.5, headDrop: -0.2, headTilt: -0.3, slump: -0.3, sway: 0.03 },
    worried: { lidTilt: 0.35, gazeFollow: 0.5, gazeY: 0.1, dartRate: 1.4, dartAmp: 0.3, tremble: 0.05, curve: -0.2, open: 0.3, wave: 1, shudder: 0.008, slump: 0.4, headDrop: 0.5, armRaiseN: 0.22, ovSweat: 1 },
    disgusted: { lidUp: 0.15, lidAsym: 0.1, lidTilt: -0.1, gazeFollow: 0.3, gazeX: 0.5, gazeY: -0.1, curve: -0.7, open: 0.25, mouthTilt: -0.6, wave: 0.4, tilt: -0.14, headTilt: -0.6, slump: -0.2, armRaiseN: 0.15 },
    love: { lidUp: -0.05, eyeScale: 1.1, gazeFollow: 0.5, dartRate: 0.2, curve: 0.6, open: 0.25, bob: 0.9, bobSpeed: 0.35, bounce: 0.05, bounceSpeed: 1.4, sway: 0.08, headTilt: 0.4, headDrop: -0.1, ovHeart: 1 },
  };

  class Bluemark extends CutPaperRig {
    get layerName() { return 'bluemark'; }

    constructor(opts = {}) {
      super(opts);
      this._phi = 0;                          // gait phase (cycles), advanced by distance walked
      this._gaitAmt = 0;                      // 0 standing .. 1 walking, smoothed
      this._stepN = 0;                        // heel-strike counter
      this._T = { r: 0, v: 0 };               // torso pitch offset (spring)
      this._Hd = { r: 0, v: 0 };              // head pitch offset relative to the torso (spring)
      this._Cp = { r: 0, v: 0 };              // cap wobble on the head (spring)
      this._Ar = [{ a: 0.22, v: 0, e: 0.3, ev: 0 }, { a: 0.22, v: 0, e: 0.3, ev: 0 }];   // far, near arm: angle from hanging, elbow flex
      this._armT = [{ a: 0.22, e: 0.3 }, { a: 0.22, e: 0.3 }];
      this._hopY = 0; this._hopV = 0;
      this._bobPh = 0; this._swayPh = 0; this._bouncePh = 0;
      this._waveT = 0; this._waveAmt = 0;
      this._aim = null;                       // scene point the near arm points at
      this._chompT = -1;
      this._lookPitch = 0;
      this.setEmotion(this.opts.emotion, { blend: 0 });   // last: it may act on the state above
    }

    // ------------------------------------------------------------- control

    wave(on = true) { this._waveT = on ? 1 : 0; return this; }

    // Point the near arm at a scene point; null relaxes it.
    point(x, y) {
      if (Array.isArray(x)) [x, y] = x;
      this._aim = x == null ? null : [x, y];
      return this;
    }
    reach(x, y) { return this.point(x, y); }

    trigger(name) {
      const A = this._Ar;
      if (name === 'blink') this._blinkT = 0;
      else if (name === 'hop') {
        if (this._hopY <= 0 && this._hopV <= 0) { this._hopV = 6; this._T.v += 0.8; this._Hd.v -= 1.2; A.forEach((a) => { a.v -= 2; }); }
      } else if (name === 'chomp') this._chompT = 0;
      else if (name === 'stagger') { this._T.v -= 2.2; this._Hd.v += 2.5; this._Cp.v += 3; A.forEach((a) => { a.v -= 3; }); }
      else throw new Error(`Bluemark: unknown trigger "${name}"`);
      return this;
    }

    _cueExtra(c) {
      if ('point' in c) c.point ? this.point(c.point[0], c.point[1]) : this.point(null);
      if ('reach' in c) c.reach ? this.reach(c.reach[0], c.reach[1]) : this.reach(null);
    }

    // The head, in scene pixels.
    headWorld() {
      const p = this._pose(), fs = this._face < 0 ? -1 : 1, l = this._lift();
      return [this.x + p.hc[0] * fs * this.scale, this.y - (p.hc[1] + l) * this.scale];
    }

    // ------------------------------------------------------------- hooks

    _lift() { return this._hopY + this.p.bounce * Math.abs(Math.sin(Math.PI * this._bouncePh)); }

    // Distance walked drives the gait, so the stance foot doesn't slide.
    _onMove(du) {
      const stride = 4 * Math.max(0.3, G.reach * this._gaitAmt);   // distance per gait cycle (two steps)
      this._phi += (du * (this._face < 0 ? -1 : 1)) / stride;
    }

    _eyeAnchor(i) {
      const p = this._pose(), e = EYE[i], r = rot(e.x, e.y, p.psi);
      return [p.hc[0] + r[0], p.hc[1] + r[1]];
    }

    _updateBody(dt) {
      const P = this.p, t = this.t, fs = this._face < 0 ? -1 : 1;
      // Gait amount follows walking speed.
      const gt = clamp(Math.abs(this._v) / 1.2, 0, 1) * P.gait;
      this._gaitAmt += (gt - this._gaitAmt) * Math.min(1, dt * 8);
      const g = this._gaitAmt;
      // Heel strikes kick the torso and head.
      const st = Math.floor(this._phi * 2 - 0.5);   // a foot lands at phi = 0.25 and 0.75
      if (st !== this._stepN) { this._stepN = st; this._T.v += 0.5 * g; this._Hd.v -= 0.8 * g; }
      // Head pitch follows the gaze a little (looking up lifts the chin).
      this._lookPitch += ((this._pupilT[1][1] || 0) * 0.22 - this._lookPitch) * Math.min(1, dt * 4);
      this._waveAmt += (this._waveT - this._waveAmt) * Math.min(1, dt * 6);
      if (this._chompT >= 0 && (this._chompT += dt) > 0.9) this._chompT = -1;

      // Arm targets: hang and swing, raise, wave, or aim.
      const p = this._pose();
      for (let i = 0; i < 2; i++) {
        const raise = i ? P.armRaiseN : P.armRaiseF;
        const swing = -0.55 * g * Math.sin(TAU * (this._phi + 0.5 * i)) * P.armHang;
        // raised arms go up and a little back, so they clear the face (the shoulder sits behind the head)
        let a = lerp(0.22 * P.armHang + swing, 3.25, clamp(raise, 0, 1));
        let e = lerp(0.3 + 0.25 * Math.abs(swing), 0.3, clamp(raise, 0, 1));
        if (i === 1 && this._waveAmt > 0.01) {
          const w = this._waveAmt;
          a = lerp(a, 2.95 + 0.2 * Math.sin(TAU * 1.8 * t), w);
          e = lerp(e, 0.5 + 0.5 * Math.sin(TAU * 1.8 * t + 1), w);
        }
        if (i === 1) {
          // Hand to the chin / scratching the head / pointing at a scene point: solve the arm for a target.
          const face = (lx, ly) => { const r = rot(lx, ly, p.psi); return [p.hc[0] + r[0], p.hc[1] + r[1]]; };
          const goals = [];
          if (this._aim) goals.push([1, this._toLocal(this._aim[0], this._aim[1])]);
          if (P.handChin > 0.01) goals.push([P.handChin, face(0.95, -1.0)]);
          if (P.handHead > 0.01) goals.push([P.handHead, face(-1.0, 0.35)]);   // the back of the head
          for (const [wgt, tgt] of goals) {
            const q = this._solveArm(p.arms[1].sh, tgt);
            a = lerp(a, q.a, clamp(wgt, 0, 1)); e = lerp(e, q.e, clamp(wgt, 0, 1));
          }
        }
        this._armT[i] = { a, e };
      }
    }

    // Analytic two-bone solve: arm angle (from hanging) and elbow flex that put the wrist at tgt (rig units).
    _solveArm(sh, tgt) {
      const L1 = G.upperArm, L2 = G.foreArm;
      const vx = tgt[0] - sh[0], vy = tgt[1] - sh[1], m = Math.hypot(vx, vy) || 1e-3, d = Math.min(m, L1 + L2 - 0.02);
      const phi = Math.atan2(vy, vx), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const cand = [phi + al, phi - al].map((th) => [sh[0] + L1 * Math.cos(th), sh[1] + L1 * Math.sin(th)]);
      const el = cand[0][1] < cand[1][1] ? cand[0] : cand[1];     // the lower elbow is the natural one
      const wr = [sh[0] + (vx / m) * d, sh[1] + (vy / m) * d];
      const a1 = Math.atan2(el[0] - sh[0], -(el[1] - sh[1])), a2 = Math.atan2(wr[0] - el[0], -(wr[1] - el[1]));
      return { a: a1, e: Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)) };   // wrapped to (-pi, pi]
    }

    _physics(h) {
      const P = this.p, T = this._T, Hd = this._Hd, Cp = this._Cp, fs = this._face < 0 ? -1 : 1;
      const aL = 6 * Math.tanh((this._a * fs) / 6);      // forward acceleration, soft-limited
      this._bobPh += h * P.bobSpeed; this._swayPh += h * P.swaySpeed; this._bouncePh += h * P.bounceSpeed;

      // Torso pitch: springs to upright-stoop, lags acceleration, wobbles on footfalls.
      T.v += h * (-60 * T.r - 5 * T.v - aL * 0.012);
      T.r = clamp(T.r + h * T.v, -0.35, 0.35);
      // Head: hangs off the torso, lagging its rotation.
      Hd.v += h * (-45 * Hd.r - 4 * Hd.v - T.v * 0.9 - aL * 0.01);
      Hd.r = clamp(Hd.r + h * Hd.v, -0.5, 0.5);
      // Cap: an extra wobble on the head.
      Cp.v += h * (-90 * Cp.r - 5 * Cp.v - Hd.v * 0.6);
      Cp.r = clamp(Cp.r + h * Cp.v, -0.25, 0.25);
      // Arms: pendulums that follow their targets and swing with the body.
      for (let i = 0; i < 2; i++) {
        const A = this._Ar[i], AT = this._armT[i];
        A.v += h * (-32 * (A.a - AT.a) - 3 * A.v - T.v * 1.5 - aL * 0.03);
        A.a = clamp(A.a + h * A.v, -1.2, 3.3);
        A.ev += h * (-45 * (A.e - AT.e) - 4 * A.ev);
        A.e = clamp(A.e + h * A.ev, -0.2, 2.4);
      }
      // Hop.
      if (this._hopY > 0 || this._hopV > 0) {
        this._hopV -= 36 * h;
        this._hopY += this._hopV * h;
        if (this._hopY <= 0) { this._hopY = 0; this._hopV = 0; T.v -= 1.0; Hd.v += 1.4; Cp.v += 1.5; this._Ar.forEach((a) => { a.v += 2; }); }
      }
      this._stepPupils(h);
    }

    // ------------------------------------------------------------- pose (forward kinematics)

    _pose() {
      const P = this.p, t = this.t, g = this._gaitAmt, phi = this._phi;
      const lean = G.baseLean + P.slump * 0.32 + this._T.r + 0.012 * Math.sin(TAU * 0.25 * t) + 0.5 * P.sway * Math.sin(TAU * this._swayPh);

      // Legs, relative to the hip, then the pelvis is dropped so the lower foot just touches the ground.
      // The foot's horizontal position is driven directly: it moves back at exactly the body's speed while planted
      // (so it doesn't slide) and swings forward in an arc, then the hip angle is solved to put the ankle there.
      const legs = [0, 1].map((i) => {
        const u = (((phi + 0.5 * i) % 1) + 1) % 1, swing = Math.cos(TAU * u);
        const hx = G.reach * g;
        const fx = (u >= 0.25 && u < 0.75 ? hx * (1 - 4 * (u - 0.25)) : -hx * Math.cos(Math.PI * (((u - 0.75 + 1) % 1) / 0.5)))
          + (i ? 0.35 : -0.35) * (1 - g) + 0.2;
        const kb = G.kneeFlex + G.swingFlex * g * Math.max(0, swing);
        const fa = 0.4 * g * Math.max(0, swing);              // toe lifts while the leg swings through
        let t1 = Math.asin(clamp(fx / LEG_LEN, -0.9, 0.9));
        for (let n = 0; n < 4; n++) {
          const f = G.thigh * Math.sin(t1) + G.shin * Math.sin(t1 - kb) - fx, d = G.thigh * Math.cos(t1) + G.shin * Math.cos(t1 - kb);
          t1 -= f / (d || 1);
        }
        const k = [G.thigh * Math.sin(t1), -G.thigh * Math.cos(t1)], t2 = t1 - kb;
        const a = [k[0] + G.shin * Math.sin(t2), k[1] - G.shin * Math.cos(t2)];
        let low = Infinity;
        for (const [px, py] of SHOE_CORNERS) low = Math.min(low, a[1] + px * Math.sin(fa) + py * Math.cos(fa));
        return { k, a, fa, low };
      });
      const hip = [G.pelvisX, -Math.min(legs[0].low, legs[1].low)];
      const L = legs.map((l) => ({ hip, knee: [hip[0] + l.k[0], hip[1] + l.k[1]], ankle: [hip[0] + l.a[0], hip[1] + l.a[1]], fa: l.fa }));

      // Torso: a stooped spine with a hump on the back.
      const d = [Math.sin(lean), Math.cos(lean)], n = [-Math.cos(lean), Math.sin(lean)];
      const spineAt = (u) => [hip[0] + G.torso * u * d[0] + G.hump * Math.sin(Math.PI * u) * n[0], hip[1] + G.torso * u * d[1] + G.hump * Math.sin(Math.PI * u) * n[1]];
      const spine = []; for (let k = 0; k <= 12; k++) spine.push(spineAt(k / 12));
      const S = spine[12], shoulder = spineAt(0.92);

      // Neck and head: the head hangs forward and drops with the mood.
      const nl = lean * 0.7 + 0.25, N = [S[0] + G.neck * Math.sin(nl), S[1] + G.neck * Math.cos(nl)];
      const bob = 0.5 * this.opts.drift * P.bob * Math.sin(TAU * this._bobPh);
      const psi = -0.2 - P.headDrop * 0.45 + this._Hd.r - P.headTilt * 0.3 - P.tilt + this._lookPitch * 0.5;
      const hoff = rot(0.2, 1.05 + bob * 0.2, psi), hc = [N[0] + hoff[0], N[1] + hoff[1] + bob * 0.2];

      // Arms.
      const arms = [0, 1].map((i) => {
        const A = this._Ar[i], sh = [shoulder[0] + (i ? 0.08 : -0.12), shoulder[1] + (i ? -0.05 : 0.05)];
        const u1 = [Math.sin(A.a), -Math.cos(A.a)], el = [sh[0] + G.upperArm * u1[0], sh[1] + G.upperArm * u1[1]];
        const a2 = A.a + A.e, u2 = [Math.sin(a2), -Math.cos(a2)];
        const wr = [el[0] + G.foreArm * u2[0], el[1] + G.foreArm * u2[1]];
        return { sh, el, wr, hand: [wr[0] + 0.34 * u2[0], wr[1] + 0.34 * u2[1]], a2 };
      });
      return { lean, legs: L, hip, spine, S, shoulder, N, hc, psi, arms };
    }

    // ------------------------------------------------------------- drawing

    _drawRig(ctx, x, y, s) {
      const P = this.p, t = this.t, pose = this._pose();
      const lift = this._lift();
      const shud = P.shudder * noise1(this.seed + 61, t * 30);
      const jig = P.jiggle * 0.035 * Math.sin(TAU * 6 * t);
      const fx = Math.sin((this._face * Math.PI) / 2);
      const fxs = Math.abs(fx) < 0.03 ? (fx < 0 ? -0.03 : 0.03) : fx;
      this._layer = this.layerName;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, -s);
      ctx.save();
      ctx.translate(shud, lift);
      ctx.rotate(jig);
      ctx.scale(fxs, 1);

      this._drawArm(ctx, pose, 0);
      this._drawLeg(ctx, pose, 0);
      this._drawHairBack(ctx, pose);
      this._drawLeg(ctx, pose, 1);   // the near leg goes under the torso, so the shirt hangs over the top of the thigh
      this._drawTorso(ctx, pose);
      this._drawNeck(ctx, pose);
      this._drawHead(ctx, pose);
      this._drawArm(ctx, pose, 1);
      ctx.restore();

      ctx.save();
      ctx.translate(shud, lift);
      this._drawOverlaysAt(ctx, fx, pose.hc[0] - 3.2, pose.hc[1] - 6.9);
      ctx.restore();
      ctx.restore();
    }

    _drawLeg(ctx, pose, i) {
      const l = pose.legs[i], far = i === 0;
      const pants = far ? PAL.pantsShade : PAL.pants;
      this._shape(ctx, bone(l.hip, l.knee, 1.05, 0.9), `thigh${i}`, pants);
      this._shape(ctx, circle(l.knee[0], l.knee[1], 0.42, 20), `knee${i}`, pants, false);
      this._shape(ctx, bone(l.knee, l.ankle, 0.82, 0.64), `shin${i}`, pants);
      ctx.save();
      ctx.translate(l.ankle[0], l.ankle[1]);
      ctx.rotate(l.fa);
      this._shape(ctx, SHOE, `shoe${i}`, PAL.shoe);
      ctx.restore();
    }

    _drawTorso(ctx, pose) {
      const sp = pose.spine, seg = G.torso / 12;
      const shirtW = (u) => 1.5 + 0.85 * Math.sin(Math.PI * clamp(u * 0.8 + 0.1, 0, 1));   // u along the whole spine, 0..1

      // 1. Trousers: a hips block and a black section up the lower torso (drawn first, the shirt hangs over it).
      //    It starts a little below the spine and its lower end is rounded (a quarter ellipse over the extension),
      //    so the seat has no square corner.
      this._shape(ctx, circle(pose.hip[0], pose.hip[1], 0.72, 28), 'hips', PAL.pants, false);
      const waist = 2, ext = 0.95, L = waist * seg + ext, r = ext / L;
      const d0 = [sp[1][0] - sp[0][0], sp[1][1] - sp[0][1]], dl = Math.hypot(d0[0], d0[1]) || 1;
      const start = [sp[0][0] - (d0[0] / dl) * ext, sp[0][1] - (d0[1] / dl) * ext];
      const pw = (u) => shirtW(Math.max(0, (u * L - ext) / seg) / 12);   // exactly the shirt's width, so no rim shows past it
      this._shape(ctx, ribbon(densify([start, ...sp.slice(0, waist + 1)], 0.07, false),
        (u) => pw(u) * (u < r ? Math.sqrt(Math.max(0, 1 - Math.pow((r - u) / r, 2))) * 0.94 + 0.06 : 1), false), 'waist', PAL.pants);

      // 2. The shirt goes over the trousers and hangs right down over the hips: the hem is a little below the bottom of
      //    the spine, so only the seat and legs show as black.  Flat hem; round shoulders from a circle at the top.
      const hemExt = 0.3;
      const hs = [sp[0][0] - (d0[0] / dl) * hemExt, sp[0][1] - (d0[1] / dl) * hemExt];
      const SL = 12 * seg + hemExt;
      this._shape(ctx, ribbon(densify([hs, ...sp], 0.1, false), (u) => shirtW(Math.max(0, u * SL - hemExt) / seg / 12), false), 'torso', PAL.shirt);
      const top = sp[12];
      this._shape(ctx, circle(top[0], top[1], shirtW(1) / 2, 32), 'shoulders', PAL.shirt, false);

      // 3. A fold of shade down the back of the shirt to give the hump some depth.
      const back = sp.map((p, k) => [p[0] - 0.42 * Math.sin(Math.PI * Math.min(1, k / 12 * 0.9 + 0.05)), p[1]]);
      this._shape(ctx, ribbon(back.slice(1, 11), (u) => 0.32 * Math.sin(Math.PI * u) + 0.04), 'torsoShade', PAL.shirtShade, false);
    }

    _drawNeck(ctx, pose) {
      this._shape(ctx, bone(pose.S, pose.N, 0.86, 0.7), 'neck', PAL.skinShade);
    }

    _drawArm(ctx, pose, i) {
      const a = pose.arms[i], far = i === 0;
      const sleeve = far ? PAL.shirtShade : PAL.shirt, skin = far ? PAL.skinShade : PAL.skin;
      if (!far) {
        const o = (p) => [p[0] - 0.09, p[1] - 0.09];
        this._shape(ctx, bone(o(a.sh), o(a.el), 0.95, 0.8), 'upperS', PAL.shirtShade, false);
        this._shape(ctx, bone(o(a.el), o(a.wr), 0.78, 0.68), 'foreS', PAL.shirtShade, false);
      }
      this._shape(ctx, bone(a.sh, a.el, 0.95, 0.8), `upper${i}`, sleeve);
      this._shape(ctx, circle(a.el[0], a.el[1], 0.42, 18), `elbow${i}`, sleeve, false);
      this._shape(ctx, bone(a.el, a.wr, 0.78, 0.68), `fore${i}`, sleeve);
      const ang = a.a2 - Math.PI / 2;   // the hand lies along the forearm
      this._shape(ctx, ellipse(0, 0, G.handR * 0.95, G.handR * 0.75, 24).map((p) => {
        const r = rot(p[0], p[1], ang);
        return [a.hand[0] + r[0], a.hand[1] + r[1]];
      }), `hand${i}`, skin);
    }

    _drawHairBack(ctx, pose) {
      ctx.save();
      ctx.translate(pose.hc[0], pose.hc[1]);
      ctx.rotate(pose.psi);
      const sway = 0.05 * Math.sin(TAU * 0.4 * this.t);
      for (let k = 0; k < 6; k++) {
        const y0 = 0.6 - k * 0.34, ex = -2.15 - 0.1 * (k % 2) + sway * k, ey = y0 - 0.6 - 0.12 * k;
        this._shape(ctx, ribbon([[-1.05, y0], [(-1.05 + ex) / 2, y0 - 0.15], [ex, ey]], (u) => 0.2 * (1 - 0.8 * u)), `hair${k}`, PAL.hair, false);
      }
      ctx.restore();
    }

    _drawHead(ctx, pose) {
      const P = this.p, hc = pose.hc;
      ctx.save();
      ctx.translate(hc[0], hc[1]);
      ctx.rotate(pose.psi);
      // skull and jaw, with a darker hollow under the cheekbone running down toward the jaw (no ear is drawn)
      this._shape(ctx, HEAD, 'head', PAL.skin);
      this._shape(ctx, ribbon(densify([[0.12, 0.05], [-0.18, -0.3], [-0.36, -0.72], [-0.32, -1.12]], 0.06, false), (u) => 0.46 * Math.sin(Math.PI * (0.1 + 0.8 * u)) + 0.03), 'cheek', PAL.skinShade, false);
      // dark bangs hanging from under the brim, and strands at the temple
      for (let k = 0; k < 6; k++) {
        const bx = -0.6 + 0.4 * k, len = 0.2 + 0.07 * ((k * 5) % 3), sw = 0.03 * Math.sin(TAU * 0.4 * this.t + k);
        this._shape(ctx, ribbon([[bx, 0.55], [bx + 0.02, 0.45 - len * 0.4], [bx + 0.04 + sw, 0.5 - len]], (u) => 0.13 * (1 - 0.75 * u)), `bang${k}`, PAL.hair, false);
      }
      // sideburn strands hanging beside the eye area, thicker than the bangs and curling slightly forward
      for (let k = 0; k < 4; k++) {
        const x0 = -0.95 + 0.17 * k, len = 0.8 - 0.1 * k, sw = 0.03 * Math.sin(TAU * 0.4 * this.t + 2 * k);
        this._shape(ctx, ribbon([[x0, 0.55], [x0 - 0.06 + sw, 0.55 - len * 0.55], [x0 + 0.05 + sw, 0.55 - len]], (u) => 0.16 * (1 - 0.7 * u)), `temple${k}`, PAL.hair, false);
      }
      this._drawEyes(ctx);
      // two small dark nostrils under the tip of the nose (a slanted pair, as in the sketch)
      for (let k = 0; k < 2; k++) {
        this._shape(ctx, ellipse(1.4 - 0.2 * k, -0.34 - 0.02 * k, 0.05, 0.095, 14).map(([x, y]) => { const r = rot(x - (1.4 - 0.2 * k), y - (-0.34 - 0.02 * k), -0.45); return [1.4 - 0.2 * k + r[0], -0.34 - 0.02 * k + r[1]]; }), `nostril${k}`, PAL.nostril, false);
      }
      this._drawMouth(ctx);
      // cap (wobbles a little on the head)
      ctx.save();
      ctx.translate(0, 0.45);
      ctx.rotate(this._Cp.r);
      ctx.translate(0, -0.45);
      this._drawCap(ctx);
      ctx.restore();
      ctx.restore();
    }

    // The cap from the sketch: a tall, slightly squared crown, a whiter front panel with a shaded back, and a thin
    // off-white brim at the front that runs only a little way past the face.
    _drawCap(ctx) {
      const cx = 0.05, base = 0.5, rx = 1.68, ry = 1.9, ex = 2.5;    // superellipse: exponent 2.5 squares the shoulders
      const dome = [];
      for (let k = 0; k <= 48; k++) {
        const a = Math.PI * (k / 48), c = Math.cos(a), sn = Math.sin(a);
        dome.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / ex), base + ry * Math.pow(sn, 2 / ex)]);
      }
      this._shape(ctx, densify(dome, 0.1), 'dome', PAL.cap);
      // whiter front panel (the emblem sits on it) and a shaded crescent down the back of the crown
      const panel = dome.filter((p) => p[0] > -0.3).map((p) => [p[0] * 0.97, base + (p[1] - base) * 0.96]);
      panel.push([cx + rx * 0.97, base + 0.02], [-0.3, base + 0.02]);
      this._shape(ctx, densify(panel, 0.1), 'panel', PAL.capPanel, false);
      this._shape(ctx, ribbon(dome.filter((p) => p[0] < -0.6).map((p) => [p[0] + 0.28, p[1] - 0.12]), (u) => 0.5 * Math.sin(Math.PI * (0.1 + 0.8 * u))), 'capBack', PAL.capShade, false);
      // brim
      // brim: thickest where it meets the crown, tapering to a near point at the front (no rounded end cap)
      this._shape(ctx, ribbon(densify([[0.45, base + 0.03], [1.3, base - 0.04], [2.3, base - 0.17]], 0.08, false), (u) => 0.03 + 0.31 * Math.pow(1 - u, 0.85), false), 'brim', PAL.brim);
      // the brain: a small pink lump with a cream highlight, folds and a drip, left of centre on the front panel
      ctx.save();
      ctx.translate(0.62, 1.32);
      ctx.rotate(-0.1);
      ctx.scale(0.95, 0.95);
      this._shape(ctx, EMBLEM, 'emblem', PAL.emblem, false);
      this._shape(ctx, ellipse(-0.1, 0.1, 0.24, 0.15, 18), 'emblemHi', PAL.emblemHi, false);
      EMBLEM_FOLDS.forEach((f, k) => this._shape(ctx, f, `fold${k}`, PAL.emblemDeep, false));
      this._shape(ctx, ribbon([[0.3, -0.3], [0.32, -0.55]], (u) => 0.12 * (1 - 0.3 * u)), 'brainDrip', PAL.emblem, false);
      this._shape(ctx, circle(0.32, -0.58, 0.07, 12), 'brainDrop', PAL.emblem, false);
      ctx.restore();
    }

    _drawEyes(ctx) {
      const P = this.p;
      const blink = this._blinkT >= 0 ? Math.sin(Math.PI * clamp(this._blinkT / P.blinkDur, 0, 1)) : 0;
      for (const i of [1, 0]) {   // near eye first, far eye drawn over it
        const side = i ? 1 : -1, e = EYE[i];
        const c0 = clamp(0.55 + P.lidUp - side * P.lidAsym, 0, 1), c = c0 + (1 - c0) * blink;
        const hh = lerp(0.25, 0.04, c) * P.eyeScale, rx = e.rx * P.eyeScale;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(-P.lidTilt * side * 0.3);
        // plain white eyes: no pupils and no dark outline (the sketch draws them as blank white slits)
        this._shape(ctx, ellipse(0, 0, rx, hh, 32), 'eye' + i, PAL.lid, false);
        ctx.restore();
      }
    }

    _drawMouth(ctx) {
      const P = this.p, t = this.t;
      let open = P.open;
      if (this._chompT >= 0) open *= 0.5 + 0.5 * Math.cos(TAU * 3.3 * (this._chompT / 0.9));
      const w = MOUTH.w * P.mouthW, top = [], bot = [], n = 24;
      for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n, x = u * w, e = Math.sqrt(Math.max(0, 1 - Math.pow(u, 6)));
        let yc = P.curve * w * 0.55 * (u * u - 0.4);
        yc += P.mouthTilt * w * 0.5 * u;
        yc += P.wave * 0.05 * Math.sin(u * 2.5 * Math.PI);
        yc += P.zig * 0.06 * (2 / Math.PI) * Math.asin(Math.sin(u * 3 * Math.PI));
        const th = e * (0.07 + open * 0.42 * (1 - u * u));
        top.push([x, yc * (1 - 0.4 * open) + e * 0.02]);
        bot.push([x, yc - th]);
      }
      ctx.save();
      ctx.translate(MOUTH.x, MOUTH.y);
      this._shape(ctx, top.concat(bot.slice().reverse()), 'mouth', PAL.mouthIn, false);
      if (open > 0.1) {
        // teeth: upper row hangs from the top lip, a shorter lower row rises from the bottom lip
        const gap = (k) => top[k][1] - bot[k][1];
        for (let m = 0; m < 5; m++) {
          const k = Math.round(n * (0.22 + 0.14 * m)), h = Math.min(0.2, gap(k) * 0.55), hw = w * 0.085;
          this._shape(ctx, densify([[top[k][0] - hw, top[k][1]], [top[k][0] + hw, top[k][1]], [top[k][0] + hw * 0.9, top[k][1] - h], [top[k][0] - hw * 0.9, top[k][1] - h]], 0.05), 'tu' + m, PAL.teeth, false);
        }
        for (let m = 0; m < 4; m++) {
          const k = Math.round(n * (0.29 + 0.14 * m)), h = Math.min(0.16, gap(k) * 0.45), hw = w * 0.08;
          this._shape(ctx, densify([[bot[k][0] - hw, bot[k][1]], [bot[k][0] + hw, bot[k][1]], [bot[k][0] + hw * 0.9, bot[k][1] + h], [bot[k][0] - hw * 0.9, bot[k][1] + h]], 0.05), 'tl' + m, PAL.teeth, false);
        }
      }
      // a smear of blood at the corner of the mouth, dripping
      const k = Math.round(n * 0.86), dx = bot[k][0], dy = bot[k][1], len = 0.3 + 0.35 * open + 0.03 * Math.sin(TAU * 0.5 * t);
      this._shape(ctx, ribbon([[dx, dy + 0.02], [dx + 0.02, dy - len]], (u) => 0.13 * (1 - 0.5 * u)), 'blood', PAL.blood, false);
      this._shape(ctx, circle(dx + 0.02, dy - len - 0.02, 0.085, 14), 'drop', PAL.blood, false);
      ctx.restore();
    }
  }

  Bluemark.prototype.idPrefix = 'bm.';
  Bluemark.NEUTRAL = NEUTRAL;
  Bluemark.PRESETS = PRESETS;
  Bluemark.EMOTIONS = Object.keys(PRESETS);
  Bluemark.TRIGGERS = ['blink', 'hop', 'chomp', 'stagger'];
  Bluemark.CUE_KEYS = ['point', 'reach'];
  Bluemark.DEFAULTS = Object.assign({}, CutPaperRig.DEFAULTS, { drift: 0.3 });
  Bluemark.META = {
    id: 'bluemark',
    label: 'Bluemark',
    layer: 'bluemark',
    emotions: Bluemark.EMOTIONS,
    triggers: Bluemark.TRIGGERS,
    gestures: [],
    defaults: { x: 0.65, y: 0.85, scale: 0.03, facing: 'left' },   // 3% of frame height per unit: 50% larger than Brian's 2%
    panels: [{
      title: 'Gestures',
      controls: [
        { type: 'buttons', items: [{ label: 'Wave on', cue: { wave: true } }, { label: 'Wave off', cue: { wave: false } }] },
        { type: 'toggle', label: 'Point at mouse', title: 'The near arm points at the mouse', method: 'point' },
      ],
    }],
    keys: { b: { trigger: 'blink' }, h: { trigger: 'hop' }, c: { trigger: 'chomp' }, t: { trigger: 'stagger' } },
  };
  RigRegistry.register(Bluemark);

  if (typeof module === 'object' && module.exports) module.exports = Bluemark;
  root.Bluemark = Bluemark;
})(typeof globalThis !== 'undefined' ? globalThis : this);
