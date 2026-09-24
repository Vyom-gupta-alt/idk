/* Soccer Manager 26 — playable 3D match (three.js).
 * window.SM3D.start(cfg) opens a full-screen match. cfg:
 *   teams: [home, away], each { name, short, hue, players: [{ pid, name, num, slot, fx, fz, ovr, pac, sho, pas, dri, def, phy, gk }] }
 *   userSide: 0 | 1 (the side you control; it always attacks to the right)
 *   controlPid: null to control the whole team (switching players), or one pid (player career)
 *   minutes: real-time length of the match, ko: knockout (penalties if level), agg: [home, away] first-leg goals or null
 *   onDone(result): result = { score, goals: [{ min, side, pid, apid, og }], pens, st, text }
 */
(function () {
  'use strict';
  const PL = 52.5, PW = 34, GW = 3.66, GH = 2.44, BR = 0.16, G = 9.8;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = Math.random;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const hyp = Math.hypot;

  function loadThree(cb) {
    if (window.THREE) return cb(null);
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = () => cb(window.THREE ? null : new Error('three.js did not load'));
    s.onerror = () => cb(new Error('Could not load three.js'));
    document.head.appendChild(s);
  }

  function start(cfg) {
    const root = document.createElement('div');
    root.id = 'm3d';
    root.innerHTML = `
      <div class="m3d-stage"></div>
      <div class="m3d-top">
        <div class="m3d-score"><span class="m3d-t m3d-t0"></span><b class="m3d-sc">0 - 0</b><span class="m3d-t m3d-t1"></span><span class="m3d-clock">0'</span></div>
      </div>
      <div class="m3d-msg"></div>
      <div class="m3d-power"><i></i></div>
      <div class="m3d-pcard"><div class="m3d-pname"></div><div class="m3d-ps"></div><div class="m3d-sta"><i></i></div></div>
      <canvas class="m3d-radar" width="210" height="136"></canvas>
      <div class="m3d-keys"></div>
      <div class="m3d-menu hidden"></div>
      <div class="m3d-loading">Loading 3D engine…</div>`;
    document.body.appendChild(root);
    document.body.classList.add('m3d-open');
    loadThree((err) => {
      root.querySelector('.m3d-loading').remove();
      if (err) {
        root.querySelector('.m3d-menu').classList.remove('hidden');
        root.querySelector('.m3d-menu').innerHTML = `<h2>3D match unavailable</h2><p>${err.message}. Check your connection and try again.</p><button class="btn primary" data-m3d="abort">Back</button>`;
        root.addEventListener('click', (e) => { if (e.target.dataset.m3d === 'abort') { root.remove(); document.body.classList.remove('m3d-open'); cfg.onAbort && cfg.onAbort(); } });
        return;
      }
      new Match(cfg, root);
    });
  }

  const PS_NAME = { rapid: 'Rapid', quickstep: 'Quick Step', technical: 'Technical', pressproven: 'Press Proven', finesse: 'Finesse Shot', powershot: 'Power Shot', incisive: 'Incisive Pass', tikitaka: 'Tiki Taka', longball: 'Long Ball', intercept: 'Intercept', anticipate: 'Anticipate', slidetackle: 'Slide Tackle', bruiser: 'Bruiser', relentless: 'Relentless', farreach: 'Far Reach', footwork: 'Footwork' };
  const CAMS = [
    { name: 'Broadcast', h: 17, d: 26, ly: 0, fx: 0.9, fz: 0.45, zc: 12, edge: 8 },
    { name: 'Close', h: 7.5, d: 13, ly: 0.8, fx: 1, fz: 0.8, zc: 26, edge: 2, follow: true },
    { name: 'Wide', h: 34, d: 44, ly: 0, fx: 0.8, fz: 0.3, zc: 8, edge: 14 },
  ];
  const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68a62, 0xa86b45, 0x7d4a2c, 0x5a3420];
  const HAIR = [0x1b120c, 0x2e1d12, 0x4a2f1b, 0x7a5230, 0xc49a5c, 0x0d0d0d];
  const BOOTS = [0x111111, 0xf5f5f5, 0x22d3ee, 0xf97316, 0xa3e635, 0xef4444];
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function ballTexture(T) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#111827';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = i * 44 + (j % 2) * 22 + 10, y = j * 44 + 20; g.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); } g.fill(); }
    return new T.CanvasTexture(c);
  }
  // Builds jointed, kit-coloured human figures. Forward is +X, up is +Y.
  class HumanKit {
    constructor(T, cols) {
      this.T = T; this.cols = cols;
      const limb = (len, r1, r2, seg = 10) => { const g = new T.CylinderGeometry(r1, r2, len, seg); g.translate(0, -len / 2, 0); return g; };
      const torsoPts = [[0.13, 0], [0.145, 0.08], [0.16, 0.2], [0.185, 0.34], [0.19, 0.42], [0.15, 0.49], [0.06, 0.53]].map(([x, y]) => new T.Vector2(x, y));
      const hair = new T.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const hairLong = new T.SphereGeometry(0.122, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
      this.g = {
        torso: new T.LatheGeometry(torsoPts, 18), pelvis: new T.CylinderGeometry(0.165, 0.17, 0.2, 16),
        neck: new T.CylinderGeometry(0.055, 0.062, 0.1, 10), shoulder: new T.SphereGeometry(0.066, 12, 10), head: new T.SphereGeometry(0.105, 20, 16),
        hair, hairLong, afro: new T.SphereGeometry(0.15, 16, 12),
        ear: new T.SphereGeometry(0.022, 8, 6), eye: new T.SphereGeometry(0.012, 6, 5), nose: new T.ConeGeometry(0.018, 0.045, 6),
        sleeve: limb(0.15, 0.058, 0.052), upper: limb(0.28, 0.046, 0.04), fore: limb(0.25, 0.038, 0.03), hand: new T.SphereGeometry(0.042, 10, 8),
        shortLeg: limb(0.2, 0.09, 0.083), thigh: limb(0.43, 0.075, 0.056), shin: limb(0.42, 0.056, 0.04), knee: new T.SphereGeometry(0.058, 10, 8),
        boot: new T.BoxGeometry(0.24, 0.07, 0.09), num: new T.PlaneGeometry(0.24, 0.24),
      };
      this.g.boot.translate(0.05, 0, 0);
      this.mats = {};
    }
    mat(key, color, rough = 0.75, extra) {
      if (!this.mats[key]) this.mats[key] = new this.T.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...(extra || {}) });
      return this.mats[key];
    }
    numberMat(side, num, kitColor) {
      const key = `n${side}-${num}`;
      if (this.mats[key]) return this.mats[key];
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const light = kitColor.r * 0.3 + kitColor.g * 0.59 + kitColor.b * 0.11 > 0.55;
      g.font = '800 92px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = light ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'; g.strokeText(String(num), 64, 68);
      g.fillStyle = light ? '#111827' : '#ffffff'; g.fillText(String(num), 64, 68);
      return (this.mats[key] = new this.T.MeshStandardMaterial({ map: new this.T.CanvasTexture(c), transparent: true, roughness: 0.8 }));
    }
    build(p) {
      const T = this.T, g = this.g, c = this.cols[p.side], h = hash(p.pid || p.name);
      const shirtC = p.isGK ? c.gk : c.kit;
      const shirt = this.mat(`shirt${p.side}${p.isGK ? 'gk' : ''}`, shirtC, 0.8);
      const shorts = this.mat(`shorts${p.side}${p.isGK ? 'gk' : ''}`, p.isGK ? new T.Color(0x1f2937) : c.shorts, 0.8);
      const socks = this.mat(`socks${p.side}${p.isGK ? 'gk' : ''}`, p.isGK ? shirtC : c.socks, 0.85);
      const skin = this.mat(`skin${h % SKIN.length}`, SKIN[h % SKIN.length], 0.6);
      const hairM = this.mat(`hair${(h >> 3) % HAIR.length}`, HAIR[(h >> 3) % HAIR.length], 0.9);
      const boot = this.mat(`boot${(h >> 6) % BOOTS.length}`, BOOTS[(h >> 6) % BOOTS.length], 0.4);
      const glove = this.mat('glove', 0xf8fafc, 0.6);
      const dark = this.mat('eye', 0x111111, 0.4);
      const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
      const root = new T.Group();
      const scale = (p.isGK ? 1.04 : 0.95) + ((h >> 9) % 100) / 1000;
      root.scale.setScalar(scale);
      const body = new T.Group(); root.add(body);
      // Hips, shorts and torso
      const pelvis = mesh(g.pelvis, shorts, body, 0, 0.93, 0); pelvis.scale.set(0.8, 1, 1.12);
      const torso = mesh(g.torso, shirt, body, 0, 1.0, 0); torso.scale.set(0.66, 1, 1.05);
      const num = new T.Mesh(g.num, this.numberMat(p.side, p.num || 0, shirtC)); num.position.set(-0.128, 1.3, 0); num.rotation.y = -Math.PI / 2; body.add(num);
      mesh(g.neck, skin, body, 0, 1.55, 0);
      // Head with face and hair
      const head = new T.Group(); head.position.set(0.012, 1.675, 0); body.add(head);
      const skull = mesh(g.head, skin, head); skull.scale.set(0.95, 1.12, 0.88);
      mesh(g.ear, skin, head, -0.005, 0, 0.093); mesh(g.ear, skin, head, -0.005, 0, -0.093);
      mesh(g.eye, dark, head, 0.088, 0.022, 0.034); mesh(g.eye, dark, head, 0.088, 0.022, -0.034);
      const nose = mesh(g.nose, skin, head, 0.1, -0.005, 0); nose.rotation.z = -Math.PI / 2;
      const style = (h >> 12) % 6;
      if (style === 1) { const hr = mesh(g.hairLong, hairM, head, -0.01, 0.0, 0); hr.scale.set(1.02, 1.12, 0.95); }
      else if (style === 2) { const hr = mesh(g.afro, hairM, head, -0.02, 0.05, 0); hr.scale.set(0.95, 0.8, 0.9); }
      else if (style !== 3) { const hr = mesh(g.hair, hairM, head, -0.012, 0.018, 0); hr.scale.set(1.0, 0.95, 0.93); } // style 3: shaved
      // Arms: shoulder -> elbow -> hand
      const arms = [];
      for (const s of [1, -1]) {
        const sh = new T.Group(); sh.position.set(0, 1.45, s * 0.205); body.add(sh);
        mesh(g.shoulder, shirt, sh, 0, -0.01, 0).scale.set(1, 1, 0.9);
        mesh(g.sleeve, shirt, sh);
        mesh(g.upper, skin, sh);
        const el = new T.Group(); el.position.y = -0.28; sh.add(el);
        mesh(g.fore, skin, el);
        mesh(g.hand, p.isGK ? glove : skin, el, 0, -0.27, 0).scale.set(p.isGK ? 1.3 : 1, 1, p.isGK ? 1.3 : 1);
        arms.push({ sh, el, s });
      }
      // Legs: hip -> knee -> boot
      const legs = [];
      for (const s of [1, -1]) {
        const hip = new T.Group(); hip.position.set(0, 0.9, s * 0.092); body.add(hip);
        mesh(g.shortLeg, shorts, hip);
        mesh(g.thigh, skin, hip);
        const kn = new T.Group(); kn.position.y = -0.43; hip.add(kn);
        mesh(g.knee, skin, kn).scale.set(1, 0.8, 1);
        mesh(g.shin, socks, kn, 0, -0.03, 0);
        mesh(g.boot, boot, kn, 0, -0.44, 0);
        legs.push({ hip, kn, s });
      }
      const blob = new T.Mesh(new T.CircleGeometry(0.34, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; root.add(blob);
      return { root, body, head, arms, legs };
    }
  }
  // Run cycle, kicks and idle breathing.
  function animateRig(p, dt) {
    const r = p.rig, sp = hyp(p.vx, p.vz);
    const run = Math.min(1, sp / 6.5), walk = Math.min(1, sp / 1.5);
    const ph = p.run * 1.15;
    r.body.rotation.z = -(0.04 + 0.2 * run);
    r.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * run - 0.02 * run;
    r.head.rotation.z = 0.12 * run;
    r.legs.forEach((L, i) => {
      const o = ph + (i ? Math.PI : 0), amp = 0.25 * walk + 0.55 * run;
      L.hip.rotation.z = Math.sin(o) * amp;
      L.kn.rotation.z = -(0.08 + (0.25 * walk + 0.95 * run) * Math.max(0, Math.sin(o + 1.9)));
    });
    r.arms.forEach((A, i) => {
      const o = ph + (i ? 0 : Math.PI), amp = 0.25 * walk + 0.5 * run;
      A.sh.rotation.z = Math.sin(o) * amp;
      A.sh.rotation.x = A.s * (0.1 + 0.05 * run);
      A.el.rotation.z = 0.25 + 1.1 * run;
    });
    if (!sp || sp < 0.2) { const br = Math.sin(performance.now() / 600 + (p.num || 0)) * 0.02; r.body.position.y = br * 0.3; r.arms.forEach((A) => { A.sh.rotation.z = br; A.el.rotation.z = 0.2; }); }
    if (p.kickT > 0) {
      // Right leg: wind up, then strike through the ball.
      const t = 1 - p.kickT / 0.32, L = r.legs[0];
      L.hip.rotation.z = t < 0.35 ? -0.9 * (t / 0.35) : -0.9 + 2.1 * Math.min(1, (t - 0.35) / 0.45);
      L.kn.rotation.z = t < 0.35 ? -1.3 * (t / 0.35) : -1.3 * Math.max(0, 1 - (t - 0.35) / 0.3);
      r.arms[1].sh.rotation.x = -0.6; r.arms[0].sh.rotation.x = 0.5;
      r.body.rotation.z = 0.08;
    }
  }

  class Match {
    constructor(cfg, root) {
      this.cfg = cfg; this.root = root;
      this.T = window.THREE;
      this.total = (cfg.minutes || 5) * 60;
      this.t = 0; this.half = 1;
      this.score = [0, 0];
      this.goals = []; this.text = []; this.cards = []; this.sentOff = [];
      this.st = { poss: [0, 0], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], rc: [0, 0] };
      this.keys = {}; this.prev = {};
      this.paused = true; this.over = false;
      this.phase = 'dead'; this.deadT = 0; this.after = null;
      this.charge = -1;
      this.dir = [cfg.userSide === 0 ? 1 : -1, cfg.userSide === 1 ? 1 : -1];
      this.teamMode = !cfg.controlPid && !cfg.aiOnly;
      this.buildPlayers();
      this.initScene();
      this.initHud();
      this.bind();
      this.kickoff(cfg.userSide, true);
      this.say('info', -1, `Kick-off: ${cfg.teams[0].name} v ${cfg.teams[1].name}.`);
      this.showMenu('start');
      this.last = performance.now();
      window.SM3D.cur = this;
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    /* ---------------- setup ---------------- */
    buildPlayers() {
      this.players = [];
      this.cfg.teams.forEach((tm, side) => {
        for (const p of tm.players) {
          const spd = 5.6 + (p.pac - 50) * 0.05;
          const ps = p.ps || {};
          this.players.push({
            ...p, ps, side, isGK: p.slot === 'GK',
            x: 0, z: 0, vx: 0, vz: 0, face: side === this.cfg.userSide ? 0 : Math.PI,
            spd: clamp(spd, 5, 8.4), cd: 0, stun: 0, tcd: 0, run: rnd() * 6, hold: 0,
            acc: clamp(4.5 + (p.pac - 60) * 0.07 + (ps.quickstep || 0) * 1.4, 3, 10),
            sta: 100, spr: false, skillT: 0, slideT: 0, yc: 0,
          });
        }
      });
      this.ball = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, pass: null, shot: null, checked: false, lastSide: 0 };
      this.ctrl = this.teamMode ? this.players.find((p) => p.side === this.cfg.userSide && !p.isGK && p.slot === 'ST') || this.players.find((p) => p.side === this.cfg.userSide && !p.isGK)
        : this.players.find((p) => p.pid === this.cfg.controlPid);
      if (this.cfg.aiOnly) this.ctrl = null; // testing: both sides AI
    }
    aOf(p, x) { return this.dir[p.side] * x; } // "attacking" coordinate for p's team
    // Offside line for attackers of `side`: the second-last opponent (usually the last defender), never behind halfway.
    offLine(side) {
      const a = this.players.filter((q) => q.side !== side).map((q) => this.dir[side] * q.x).sort((x, y) => y - x);
      return Math.max(0, a[1] ?? 0);
    }
    isOffside(m) {
      const am = this.aOf(m, m.x);
      return am > 0 && am > this.aOf(m, this.ball.x) + 0.3 && am > this.offLine(m.side) + 0.3;
    }
    inBox(side, x, z) { const gx = -this.dir[side] * PL; return Math.abs(x - gx) <= 16.5 && Math.abs(z) <= 20.16; } // side's own box
    goalX(side) { return this.dir[side] * PL; }  // goal that `side` attacks

    initScene() {
      const T = this.T;
      const stage = this.root.querySelector('.m3d-stage');
      const r = this.renderer = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      stage.appendChild(r.domElement);
      const scene = this.scene = new T.Scene();
      scene.background = new T.Color(0x0a1410);
      scene.fog = new T.Fog(0x0a1410, 90, 190);
      this.cam = new T.PerspectiveCamera(42, 1, 0.5, 400);
      this.cam.position.set(0, 30, 50);
      scene.add(new T.HemisphereLight(0xe8f1ff, 0x284a2e, 0.7));
      scene.add(new T.AmbientLight(0xffffff, 0.15));
      const sun = new T.DirectionalLight(0xfff6e8, 1.0); sun.position.set(-25, 60, 35);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 42, bottom: -42, near: 10, far: 150 });
      sun.shadow.bias = -0.0005; sun.shadow.radius = 3;
      scene.add(sun);

      // Pitch drawn on a canvas texture.
      const cv = document.createElement('canvas'); cv.width = 1260; cv.height = 840;
      const g = cv.getContext('2d'); const S = 10, ox = 105, oy = 80; // 10px per metre, margins
      g.fillStyle = '#1d5c32'; g.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#206638' : '#1b5a31'; g.fillRect(ox + (i * 105 * S) / 14, oy, (105 * S) / 14 + 1, 68 * S); }
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
      const X = (x) => ox + (x + PL) * S, Y = (z) => oy + (z + PW) * S;
      g.strokeRect(X(-PL), Y(-PW), 105 * S, 68 * S);
      g.beginPath(); g.moveTo(X(0), Y(-PW)); g.lineTo(X(0), Y(PW)); g.stroke();
      g.beginPath(); g.arc(X(0), Y(0), 9.15 * S, 0, Math.PI * 2); g.stroke();
      for (const s of [-1, 1]) {
        g.strokeRect(s < 0 ? X(-PL) : X(PL - 16.5), Y(-20.16), 16.5 * S, 40.32 * S);
        g.strokeRect(s < 0 ? X(-PL) : X(PL - 5.5), Y(-9.16), 5.5 * S, 18.32 * S);
        g.beginPath(); g.arc(X(s * (PL - 11)), Y(0), 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
        g.beginPath(); g.arc(X(s * (PL - 11)), Y(0), 9.15 * S, s < 0 ? -0.93 : Math.PI - 0.93 + 0.0, s < 0 ? 0.93 : Math.PI + 0.93); g.stroke();
      }
      const tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
      const pitch = new T.Mesh(new T.PlaneGeometry(126, 84), new T.MeshLambertMaterial({ map: tex }));
      pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
      const outer = new T.Mesh(new T.PlaneGeometry(260, 200), new T.MeshLambertMaterial({ color: 0x14361f }));
      outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);
      // Stands
      const standMat = new T.MeshLambertMaterial({ color: 0x1e2a33 });
      const crowdMat = new T.MeshLambertMaterial({ color: 0x3a3f58 });
      for (const [w, d, x, z, ry] of [[140, 14, 0, -52, 0], [140, 14, 0, 52, 0], [100, 14, -75, 0, Math.PI / 2], [100, 14, 75, 0, Math.PI / 2]]) {
        const s = new T.Mesh(new T.BoxGeometry(w, 10, d), standMat); s.position.set(x, 5, z); s.rotation.y = ry; scene.add(s);
        const c = new T.Mesh(new T.BoxGeometry(w - 4, 2, d - 4), crowdMat); c.position.set(x, 10.5, z); c.rotation.y = ry; scene.add(c);
      }
      // Goals
      const post = new T.MeshLambertMaterial({ color: 0xffffff });
      const net = new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 });
      for (const s of [-1, 1]) {
        const gx = s * PL;
        for (const z of [-GW, GW]) { const m = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, GH, 8), post); m.position.set(gx, GH / 2, z); scene.add(m); }
        const bar = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, GW * 2, 8), post); bar.rotation.x = Math.PI / 2; bar.position.set(gx, GH, 0); scene.add(bar);
        const n = new T.Mesh(new T.BoxGeometry(2, GH, GW * 2, 3, 4, 10), net); n.position.set(gx + s * 1, GH / 2, 0); scene.add(n);
      }
      // Players: procedural footballers with jointed limbs.
      const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
      const cols = this.teamColors();
      const kit = new HumanKit(T, cols);
      for (const p of this.players) {
        const h = kit.build(p);
        scene.add(h.root);
        Object.assign(p, { mesh: h.root, rig: h });
      }
      const ball = new T.Mesh(new T.SphereGeometry(BR, 20, 14), new T.MeshStandardMaterial({ map: ballTexture(T), roughness: 0.45 }));
      ball.castShadow = true;
      scene.add(ball); this.ballMesh = ball;
      const bs = new T.Mesh(new T.CircleGeometry(0.3, 12), shadowMat); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.021; scene.add(bs); this.ballShadow = bs;
      const ring = new T.Mesh(new T.RingGeometry(0.6, 0.85, 24), new T.MeshBasicMaterial({ color: 0xfacc15, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring); this.ring = ring;
      // Mouse aim marker and the team-mate a click would pass to.
      const aimM = new T.Mesh(new T.RingGeometry(0.35, 0.55, 28), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
      aimM.rotation.x = -Math.PI / 2; aimM.position.y = 0.035; aimM.visible = false; scene.add(aimM); this.aimMark = aimM;
      const tgt = new T.Mesh(new T.RingGeometry(0.62, 0.8, 28), new T.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      tgt.rotation.x = -Math.PI / 2; tgt.position.y = 0.032; tgt.visible = false; scene.add(tgt); this.tgtMark = tgt;
      this.ray = new T.Raycaster(); this.ground = new T.Plane(new T.Vector3(0, 1, 0), 0); this.aimV = new T.Vector3();
      const arrow = new T.Mesh(new T.ConeGeometry(0.22, 0.45, 8), new T.MeshBasicMaterial({ color: 0xfacc15 }));
      arrow.rotation.x = Math.PI; scene.add(arrow); this.arrow = arrow;
      this.nameTag = this.makeLabel();
      scene.add(this.nameTag);
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.resize();
    }
    teamColors() {
      const T = this.T;
      const hues = this.cfg.teams.map((t) => ((t.hue ?? 210) % 360) / 360);
      const d = Math.abs(hues[0] - hues[1]); const close = Math.min(d, 1 - d) < 0.12;
      return hues.map((h, i) => {
        const away = i === 1 && close;
        return {
          kit: away ? new T.Color(0xf1f5f9) : new T.Color().setHSL(h, 0.7, 0.45),
          shorts: away ? new T.Color(0x1f2937) : new T.Color().setHSL(h, 0.5, i ? 0.85 : 0.18),
          socks: away ? new T.Color(0xf1f5f9) : new T.Color().setHSL(h, 0.7, i ? 0.85 : 0.4),
          gk: new T.Color(i ? 0xf472b6 : 0xfacc15),
          css: away ? '#f1f5f9' : `hsl(${Math.round(h * 360)} 70% 45%)`,
        };
      });
    }
    makeLabel() {
      const T = this.T;
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const tex = new T.CanvasTexture(c);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(4.5, 1.12, 1);
      sp.userData = { c, tex, text: '' };
      return sp;
    }
    setLabel(text) {
      const u = this.nameTag.userData;
      if (u.text === text) return;
      u.text = text;
      const g = u.c.getContext('2d');
      g.clearRect(0, 0, 256, 64);
      g.font = '700 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 32);
      g.fillStyle = '#fde68a'; g.fillText(text, 128, 32);
      u.tex.needsUpdate = true;
    }
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }

    initHud() {
      const t = this.cfg.teams, cols = this.teamColors();
      const q = (s) => this.root.querySelector(s);
      q('.m3d-t0').innerHTML = `<i style="background:${cols[0].css}"></i>${esc(t[0].short || t[0].name)}`;
      q('.m3d-t1').innerHTML = `${esc(t[1].short || t[1].name)}<i style="background:${cols[1].css}"></i>`;
      q('.m3d-keys').innerHTML = '🖱️ <b>hold L</b> dribble · <b>click L</b> ' + (this.teamMode ? 'pass / switch' : 'pass / call') + ' · <b>hold R</b>/<b>Shift</b> sprint · <b>WASD</b> move · <b>Space</b> shoot / tackle · <b>F</b> finesse · <b>X</b> skill / slide · <b>E Q R</b> pass / through / lob · <b>C</b> cam · <b>Esc</b>';
      this.hud = { pname: q('.m3d-pname'), ps: q('.m3d-ps'), sta: q('.m3d-sta i'), sc: q('.m3d-sc'), clock: q('.m3d-clock'), msg: q('.m3d-msg'), power: q('.m3d-power'), bar: q('.m3d-power i'), radar: q('.m3d-radar'), menu: q('.m3d-menu') };
      this.cols = cols;
    }
    bind() {
      this.kd = (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift'].includes(k) || 'wasdeqrfx'.includes(k)) e.preventDefault();
        if (k === 'c' && !e.repeat) { this.camMode = ((this.camMode || 0) + 1) % CAMS.length; this.flash(`Camera: ${CAMS[this.camMode].name}`, 0.8); return; }
        if (k === 'Escape' || k === 'p') { if (!this.over) this.paused ? this.resume() : this.showMenu('pause'); return; }
        this.keys[k] = true;
      };
      this.ku = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys[k] = false; };
      this.blur = () => { this.keys = {}; if (this.mouse) { this.mouse.left = this.mouse.right = false; } if (!this.paused && !this.over) this.showMenu('pause'); };
      window.addEventListener('keydown', this.kd);
      window.addEventListener('keyup', this.ku);
      window.addEventListener('blur', this.blur);
      this.click = (e) => {
        const a = e.target.closest('[data-m3d]')?.dataset.m3d;
        if (!a) return;
        if (a === 'resume') this.resume();
        else if (a === 'finish') { this.hud.menu.classList.add('hidden'); this.endMatch(); }
        else if (a === 'done') this.finish();
      };
      this.root.addEventListener('click', this.click);
      // Mouse: the cursor aims; hold left to run/dribble towards it, click left to pass, hold right to sprint.
      this.mouse = { nx: 0, ny: 0, on: false, left: false, right: false, hold: 0, clicks: 0 };
      const cv = this.renderer.domElement;
      cv.style.cursor = 'crosshair';
      const pos = (e) => { const r = cv.getBoundingClientRect(); this.mouse.nx = ((e.clientX - r.left) / r.width) * 2 - 1; this.mouse.ny = -((e.clientY - r.top) / r.height) * 2 + 1; this.mouse.on = true; };
      this.mm = (e) => pos(e);
      this.md = (e) => { if (this.paused || e.target !== cv) return; pos(e); if (e.button === 0) { this.mouse.left = true; this.mouse.hold = 0; } if (e.button === 2) this.mouse.right = true; e.preventDefault(); };
      this.mu = (e) => {
        if (e.button === 0 && this.mouse.left) { this.mouse.left = false; if (this.mouse.hold < 0.2 && !this.paused) this.mouse.clicks++; }
        if (e.button === 2) this.mouse.right = false;
      };
      this.cm = (e) => e.preventDefault();
      cv.addEventListener('mousemove', this.mm); cv.addEventListener('mousedown', this.md);
      window.addEventListener('mouseup', this.mu); this.root.addEventListener('contextmenu', this.cm);
      cv.addEventListener('mouseleave', () => { this.mouse.on = false; });
    }
    showMenu(kind) {
      this.paused = true;
      const m = this.hud.menu;
      m.classList.remove('hidden');
      const help = `<ul class="m3d-help">${this.teamMode
        ? '<li>🖱️ <b>Mouse:</b> the cursor aims. <b>Hold left</b> to run / dribble towards it, <b>click left</b> to pass to the team-mate nearest the cursor (or into space there), <b>hold right</b> to sprint. Space shoots at the part of the goal you point at.</li><li><b>W A S D</b> or arrows: move · <b>Shift</b>: sprint (uses stamina, and you knock the ball further ahead)</li><li><b>Space</b>: hold for a power shot, release to shoot (W/S aims) · <b>F</b>: curled finesse shot · without the ball <b>Space</b> is a standing tackle</li><li><b>X</b>: skill move with the ball (side-step a defender) · slide tackle without it (fouls and cards!)</li><li><b>E</b>: pass · <b>Q</b>: through ball, or switch player when defending · <b>R</b>: lofted pass / cross</li><li>Offside is called when a pass reaches a team-mate who was beyond the last defender.</li>'
        : '<li>🖱️ <b>Mouse:</b> <b>hold left</b> to run / dribble towards the cursor, <b>click left</b> to pass there (or call for the ball), <b>hold right</b> to sprint. Space shoots where you point.</li><li><b>W A S D</b> or arrows: move · <b>Shift</b>: sprint (uses stamina). You only control yourself.</li><li><b>Space</b>: hold for a power shot · <b>F</b>: finesse shot · without the ball <b>Space</b> tackles</li><li><b>X</b>: skill move with the ball, slide tackle without it</li><li><b>E</b>: pass, or call for the ball · <b>Q</b>: through ball · <b>R</b>: lofted pass / cross</li><li>Stay onside: time your runs with the last defender.</li>'}</ul>`;
      if (kind === 'start') m.innerHTML = `<h2>${esc(this.cfg.teams[0].name)} v ${esc(this.cfg.teams[1].name)}</h2><p class="muted">${esc(this.cfg.compName || '')} · ${this.cfg.minutes} minute match · you attack to the right →</p>${help}<button class="btn primary big" data-m3d="resume">Kick off</button>`;
      else m.innerHTML = `<h2>Paused</h2><p>${this.score[0]} - ${this.score[1]} · ${this.minute()}'</p>${help}<div class="row gap"><button class="btn primary" data-m3d="resume">Resume</button><button class="btn ghost" data-m3d="finish">End match now (keep this score)</button></div>`;
    }
    resume() { this.hud.menu.classList.add('hidden'); this.paused = false; this.last = performance.now(); }
    minute() { return Math.min(90, Math.floor((this.t / this.total) * 90) + 1); }
    say(type, side, msg) { this.text.push({ lbl: String(this.over ? 'FT' : this.phase === 'ht' ? 'HT' : this.minute()), type, side, text: msg, score: this.score.slice(), i: 0 }); }
    flash(msg, sec = 1.6) { this.hud.msg.textContent = msg; this.hud.msg.classList.add('on'); clearTimeout(this.msgT); this.msgT = setTimeout(() => this.hud.msg.classList.remove('on'), sec * 1000); }

    /* ---------------- set pieces ---------------- */
    formationPos(p, attacking, kickoff) {
      const d = this.dir[p.side];
      if (p.isGK) return { x: -d * (PL - 1.5), z: 0 };
      const ba = kickoff ? 0 : d * this.ball.x;
      let a = attacking ? -36 + p.fx * 76 + (ba + 5) * 0.32 : -46 + p.fx * 54 + ba * 0.38;
      if (kickoff) a = Math.min(-1.5, -44 + p.fx * 44);
      a = clamp(a, -47, 46);
      if (attacking && !kickoff) a = Math.min(a, this.offLine(p.side) - 0.6);
      let z = p.fz * (attacking ? 29 : 21) + (kickoff ? 0 : this.ball.z * 0.28);
      return { x: d * a, z: clamp(z, -32, 32) };
    }
    placeAll(kickoffSide) {
      for (const p of this.players) {
        const f = this.formationPos(p, p.side === kickoffSide, true);
        p.x = f.x; p.z = f.z; p.vx = p.vz = 0; p.stun = 0; p.cd = 0;
      }
    }
    kickoff(side, first) {
      this.placeAll(side);
      const b = this.ball;
      Object.assign(b, { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: null, pass: null, shot: null, checked: false });
      const taker = this.players.filter((p) => p.side === side && !p.isGK).sort((a, c) => c.fx - a.fx)[0];
      taker.x = -this.dir[side] * 0.6; taker.z = 0;
      this.giveBall(taker);
      taker.hold = 0.6;
      if (this.teamMode && side === this.cfg.userSide) this.ctrl = taker;
      this.phase = first ? 'play' : 'dead';
      this.deadT = first ? 0 : 1.2;
      this.after = null;
    }
    restart(kind, side, x, z) {
      // Throw-in, corner or goal kick: the nearest player of `side` takes it.
      const b = this.ball;
      Object.assign(b, { vx: 0, vy: 0, vz: 0, y: BR, owner: null, pass: null, shot: null, checked: false, spin: 0 });
      let taker;
      if (kind === 'goalkick') {
        taker = this.players.find((p) => p.side === side && p.isGK);
        x = -this.dir[side] * (PL - 5); z = 0;
      } else {
        taker = this.players.filter((p) => p.side === side && !p.isGK).sort((a, c) => hyp(a.x - x, a.z - z) - hyp(c.x - x, c.z - z))[0];
      }
      b.x = x; b.z = z;
      taker.x = x - this.dir[side] * 0.5 * (kind === 'goalkick' ? -1 : 1); taker.z = z;
      if (kind === 'freekick' || kind === 'offside') {
        // Opponents back off 9.15 m; everyone waits for the kick.
        for (const q of this.players) {
          if (q.side === side || q.isGK) continue;
          const dx = q.x - x, dz = q.z - z, dd = hyp(dx, dz);
          if (dd < 9.2) { const k = 9.3 / (dd || 1); q.x = x + (dd ? dx : -this.dir[side]) * k; q.z = z + (dd ? dz : 0) * k; }
        }
        this.setPiece = taker;
      }
      this.giveBall(taker);
      taker.hold = kind === 'goalkick' ? 1.0 : kind === 'freekick' ? 1.2 : 0.5;
      if (this.teamMode && side === this.cfg.userSide && !taker.isGK) this.ctrl = taker;
      this.phase = 'dead'; this.deadT = 0.9;
      const label = { throw: 'Throw-in', corner: 'Corner', goalkick: 'Goal kick', freekick: 'Free kick', offside: 'Free kick' }[kind];
      if (kind !== 'offside') this.flash(`${label} · ${this.cfg.teams[side].short || this.cfg.teams[side].name}`, 1.0);
      if (kind === 'corner') { this.st.corners[side]++; this.say('info', side, `Corner to ${this.cfg.teams[side].name}.`); }
    }
    giveBall(p) {
      const b = this.ball;
      if (b.pass && b.pass.off === p && this.phase === 'play') {
        // Offside: free kick to the defending side where he received it.
        const side = 1 - p.side;
        this.say('info', p.side, `Offside! ${p.name} was beyond the last defender when the pass was played.`);
        this.flash(`🚩 Offside · ${p.name}`, 1.4);
        this.st.off = this.st.off || [0, 0]; this.st.off[p.side]++;
        b.owner = null; b.vx = b.vz = 0; b.pass = null;
        const x = clamp(p.x, -PL + 1, PL - 1), z = clamp(p.z, -PW + 1, PW - 1);
        this.phase = 'dead'; this.deadT = 1.1; this.after = () => this.restart('offside', side, x, z);
        return;
      }
      if (b.pass && b.pass.side === p.side && b.pass.pid !== p.pid) b.assist = { pid: b.pass.pid, side: p.side, t: this.t };
      else if (!b.pass || b.pass.side !== p.side) b.assist = null;
      b.owner = p; b.pass = null; b.shot = null; b.checked = false; b.lastSide = p.side; b.last = p;
      p.hold = 0;
      if (this.teamMode && p.side === this.cfg.userSide && !p.isGK) this.ctrl = p;
      else if (this.teamMode && p.side !== this.cfg.userSide && this.ctrl) {
        const near = this.players.filter((q) => q.side === this.cfg.userSide && !q.isGK).sort((a, c) => hyp(a.x - p.x, a.z - p.z) - hyp(c.x - p.x, c.z - p.z))[0];
        if (near && hyp(this.ctrl.x - p.x, this.ctrl.z - p.z) > 10) this.ctrl = near;
      }
    }

    /* ---------------- kicking ---------------- */
    release(p) { const b = this.ball; b.owner = null; p.cd = 0.35; b.last = p; b.lastSide = p.side; p.kickT = 0.32; }
    kickTo(p, tx, tz, speed, loft, errSd) {
      const b = this.ball;
      this.release(p);
      const dx = tx - b.x, dz = tz - b.z, d = hyp(dx, dz) || 1;
      const ang = Math.atan2(dz, dx) + gauss() * errSd;
      let vh = speed, vy = 0;
      if (loft) { vy = clamp(5 + d * 0.16, 6, 14); const t = (2 * vy) / G; vh = Math.min(speed, (d / t) * 0.92); }
      b.vx = Math.cos(ang) * vh; b.vz = Math.sin(ang) * vh; b.vy = vy; b.y = BR + 0.05;
    }
    // Best team-mate to pass to in direction (dx, dz); null if none.
    passTarget(p, dx, dz, through) {
      const n = hyp(dx, dz);
      const ux = n ? dx / n : this.dir[p.side], uz = n ? dz / n : 0;
      let best = null, bs = -1e9;
      for (const m of this.players) {
        if (m.side !== p.side || m === p || m.isGK && !n) continue;
        const rx = m.x - p.x, rz = m.z - p.z, d = hyp(rx, rz);
        if (d < 3 || d > 50) continue;
        const cos = (rx * ux + rz * uz) / d;
        if (cos < 0.45) continue;
        const open = this.nearestOpp(m).d;
        const sc = cos * 12 - d * 0.18 + Math.min(open, 8) * 0.6 + (through ? this.aOf(p, rx) * 0.1 : 0) - (this.isOffside(m) ? 9 : 0);
        if (sc > bs) { bs = sc; best = m; }
      }
      return best;
    }
    mateNear(side, pt, maxD, excl) {
      let best = null, bd = maxD;
      for (const q of this.players) { if (q.side !== side || q === excl || q.isGK) continue; const d = hyp(q.x - pt.x, q.z - pt.z); if (d < bd) { bd = d; best = q; } }
      return best;
    }
    mousePass(p, aim) {
      const m = this.mateNear(p.side, aim, 7, p);
      const b = this.ball;
      if (m) return this.doPass(p, m, hyp(m.x - p.x, m.z - p.z) > 32 ? 'lob' : 'ground');
      // Into space: whoever is closest to the spot runs onto it.
      const d = hyp(aim.x - b.x, aim.z - b.z), runner = this.mateNear(p.side, aim, 25, p);
      const psk = d > 32 ? p.ps.longball : p.ps.incisive;
      this.kickTo(p, aim.x, aim.z, d > 32 ? 30 : clamp(9 + d * 0.55, 10, 26), d > 32, ((1 - p.pas / 100) * (d > 32 ? 0.12 : 0.08) + 0.01) * (1 - (psk || 0) * 0.22));
      b.pass = { pid: p.pid, side: p.side, to: runner, t: this.t, off: runner && this.isOffside(runner) ? runner : null };
    }
    doPass(p, m, kind) {
      const b = this.ball;
      const psk = kind === 'lob' ? p.ps.longball : kind === 'through' ? p.ps.incisive : p.ps.tikitaka;
      const err = ((1 - p.pas / 100) * (kind === 'lob' ? 0.12 : 0.07) + 0.01) * (1 - (psk || 0) * 0.22);
      let tx = m.x + m.vx * 0.5, tz = m.z + m.vz * 0.5;
      if (kind === 'through') { tx = m.x + this.dir[p.side] * 7; tz = m.z + clamp(-m.z * 0.15, -3, 3); }
      const d = hyp(tx - b.x, tz - b.z);
      this.kickTo(p, tx, tz, kind === 'lob' ? 30 : clamp(9 + d * 0.55, 10, 26) * (kind === 'ground' && p.ps.tikitaka ? 1.1 : 1), kind === 'lob', err);
      b.pass = { pid: p.pid, side: p.side, to: m, t: this.t, off: this.isOffside(m) ? m : null };
    }
    cross(p) {
      // Lofted ball into the box when there is no clear team-mate.
      const d = this.dir[p.side];
      this.kickTo(p, d * (PL - 9), clamp(-p.z * 0.2, -6, 6), 30, true, (1 - p.pas / 100) * 0.14);
      this.ball.pass = { pid: p.pid, side: p.side, to: null, t: this.t };
    }
    shoot(p, power, aimZ) {
      const b = this.ball, gx = this.goalX(p.side);
      const gk = this.players.find((q) => q.side !== p.side && q.isGK);
      let tz = aimZ != null ? aimZ : (gk && gk.z > 0 ? -1 : 1) * (1.4 + rnd() * 1.6);
      const dist = hyp(gx - b.x, tz - b.z);
      const ty = 0.3 + power * power * 1.9 + (dist > 25 ? 0.4 : 0);
      const speed = 17 + power * 15 + (p.sho - 60) * 0.06 + (p.ps.powershot || 0) * 1.6;
      const err = (1 - p.sho / 100) * 0.2 + 0.018 + power ** 3 * 0.04 + (dist > 16 ? (dist - 16) * 0.003 : 0) + (p.spr ? 0.035 : 0);
      this.release(p);
      const t = dist / speed;
      const ang = Math.atan2(tz - b.z, gx - b.x) + gauss() * err;
      b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed;
      b.vy = clamp((ty - BR) / t + 0.5 * G * t + gauss() * err * 12, 0, 16);
      b.y = BR + 0.02;
      b.shot = { pid: p.pid, side: p.side, t: this.t, dist, kind: 'power' }; b.checked = false; b.pass = null; b.spin = 0;
      this.st.shots[p.side]++;
    }
    finesse(p, iz) {
      // Curled shot towards the far post (or the side you aim with W/S): slower, but placed.
      const b = this.ball, gx = this.goalX(p.side);
      const side = iz ? Math.sign(iz) : Math.abs(p.z) < 3 ? (rnd() < 0.5 ? 1 : -1) : -Math.sign(p.z);
      const tz = side * 2.9, bend = side * -1.8; // start outside the post, curl back in
      const dist = hyp(gx - b.x, tz - b.z), speed = 19 + (p.sho - 60) * 0.05;
      const t = dist / speed;
      const err = ((1 - p.sho / 100) * 0.16 + 0.012 + (dist > 18 ? (dist - 18) * 0.004 : 0)) * (1 - (p.ps.finesse || 0) * 0.28);
      this.release(p);
      const ang = Math.atan2(tz - bend - b.z, gx - b.x) + gauss() * err;
      b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed;
      b.vy = clamp((1.1 - BR) / t + 0.5 * G * t, 0, 12);
      b.y = BR + 0.02;
      b.spin = (2 * bend) / (t * t);
      b.shot = { pid: p.pid, side: p.side, t: this.t, dist, kind: 'finesse' }; b.checked = false; b.pass = null;
      this.st.shots[p.side]++;
    }

    /* ---------------- AI ---------------- */
    nearestOpp(p) {
      let best = null, bd = 1e9;
      for (const q of this.players) { if (q.side === p.side) continue; const d = hyp(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
      return { p: best, d: bd };
    }
    aiCarrier(p, dt) {
      const b = this.ball;
      p.think = (p.think || 0) - dt;
      const gx = this.goalX(p.side), dist = hyp(gx - p.x, p.z);
      const pr = this.nearestOpp(p);
      if (p.isGK) {
        if (p.hold > 0) return this.moveTo(p, p.x, p.z, dt, 0);
        const m = this.passTarget(p, this.dir[p.side], 0, false) || this.players.find((q) => q.side === p.side && !q.isGK);
        return this.doPass(p, m, hyp(m.x - p.x, m.z - p.z) > 28 ? 'lob' : 'ground');
      }
      if (p.think <= 0 && p.hold <= 0) {
        p.think = 0.22 + rnd() * 0.2;
        const called = this.called && this.called.side === p.side && this.called !== p && this.t - this.calledT < 1.5 ? this.called : null;
        if (called) { this.called = null; return this.doPass(p, called, hyp(called.x - p.x, called.z - p.z) > 30 ? 'lob' : 'ground'); }
        const angOk = Math.abs(p.z) < 20 || dist < 14;
        if (dist < 24 && angOk && (dist < 13 || rnd() < 0.14)) return this.shoot(p, clamp(0.35 + dist / 40 + gauss() * 0.1, 0.2, 0.85), null);
        const wide = Math.abs(p.z) > 20 && this.aOf(p, p.x) > PL - 22;
        if (wide && rnd() < 0.35) return this.cross(p);
        if ((pr.d < 3.2 && rnd() < 0.55) || rnd() < 0.07) {
          const m = this.passTarget(p, this.dir[p.side] * (0.6 + rnd()), gauss() * 0.8, rnd() < 0.3);
          if (m) return this.doPass(p, m, hyp(m.x - p.x, m.z - p.z) > 30 ? 'lob' : rnd() < 0.2 ? 'through' : 'ground');
        }
        // Dribble towards goal, veering away from the nearest defender; skill moves to beat him.
        let tz = p.z * 0.75;
        if (pr.d < 6) tz += (p.z > pr.p.z ? 1 : -1) * 6;
        p.aim = { x: gx, z: clamp(tz, -30, 30) };
        if (pr.d < 2.6 && p.skillT <= 0 && rnd() < (p.dri - 60) / 120) this.skillMove(p, 0, p.z > pr.p.z ? 1 : -1);
        p.aiSpr = pr.d > 7 && this.aOf(p, pr.p.x) < this.aOf(p, p.x) && p.sta > 45 && dist > 22; // space ahead: go
      }
      const a = p.aim || { x: gx, z: p.z };
      this.moveTo(p, a.x, a.z, dt, p.aiSpr ? 1.25 : 0.92);
    }
    aiOffBall(p, dt, chasers) {
      const b = this.ball, poss = b.owner ? b.owner.side : b.pass ? b.pass.side : -1;
      if (p.isGK) return this.aiKeeper(p, dt);
      if (b.pass && b.pass.to === p) { const t = 0.3; return this.moveTo(p, b.x + b.vx * t, b.z + b.vz * t, dt, 1); }
      if (chasers.has(p)) {
        const o = b.owner;
        const tx = o ? o.x - this.dir[o.side] * 0.8 : b.x + b.vx * 0.25, tz = o ? o.z : b.z + b.vz * 0.25;
        this.moveTo(p, tx, tz, dt, p.sta > 35 && hyp(tx - p.x, tz - p.z) > 4 ? 1.25 : 1.05);
        const od = o ? hyp(o.x - p.x, o.z - p.z) : 99;
        if (o && o.side !== p.side && p.tcd <= 0 && od < 1.4) this.tackle(p, o, false);
        else if (o && o.side !== p.side && p.tcd <= 0 && od < 2.8 && od > 1.8 && p.def > 68 && rnd() < 0.006) this.slide(p);
        return;
      }
      const f = this.formationPos(p, poss === p.side, false);
      // Attackers run in behind now and then.
      if (poss === p.side && p.fx > 0.7 && rnd() < 0.004) p.runT = 1.4;
      if (p.runT > 0) { p.runT -= dt; f.x += this.dir[p.side] * 8; }
      this.moveTo(p, f.x, f.z, dt, 0.8);
    }
    aiKeeper(p, dt) {
      const b = this.ball, d = this.dir[p.side], gx = -d * PL;
      const near = hyp(b.x - gx, b.z) < 16 && !b.owner && !b.shot && hyp(b.vx, b.vz) < 10;
      if (near && d * b.x < -(PL - 18)) return this.moveTo(p, b.x, b.z, dt, 1.1);
      const tz = clamp(b.z * 0.33, -2.6, 2.6);
      const tx = gx + d * (1.2 + clamp((PL - Math.abs(b.x - gx)) * 0.03, 0, 2.5));
      this.moveTo(p, tx, tz, dt, 1.1);
    }
    skillMove(p, ix, iz) {
      // A quick side-step with the ball: defenders struggle to tackle for a moment.
      let sx = -Math.sin(p.face), sz = Math.cos(p.face);
      if (iz || ix) { const dot = sx * ix + sz * iz; if (dot < 0) { sx = -sx; sz = -sz; } }
      else if (rnd() < 0.5) { sx = -sx; sz = -sz; }
      const pow = 3.5 + (p.dri - 60) * 0.06 + (p.ps.technical || 0) * 0.8;
      p.vx += sx * pow; p.vz += sz * pow;
      p.skillT = 0.5 + (p.ps.technical || 0) * 0.1;
    }
    slide(p) {
      p.slideT = 0.55; p.tcd = 1.2; p.slid = false;
      const o = this.ball.owner;
      if (o && (p !== this.ctrl)) p.face = Math.atan2(o.z - p.z, o.x - p.x);
      const sp = Math.max(6.5, hyp(p.vx, p.vz) + 1.5);
      p.vx = Math.cos(p.face) * sp; p.vz = Math.sin(p.face) * sp;
    }
    tackle(p, o, slide) {
      p.tcd = slide ? 1.2 : 0.9;
      const ps = p.ps, ops = o.ps;
      // Coming from behind? (tackler is behind the direction the dribbler faces)
      const bx = p.x - o.x, bz = p.z - o.z, bd = hyp(bx, bz) || 1;
      const behind = (Math.cos(o.face) * bx + Math.sin(o.face) * bz) / bd < -0.35;
      let foulP = (slide ? 0.2 : 0.07) + (behind ? 0.3 : 0) + (p.def < 60 ? 0.05 : 0)
        - (slide ? (ps.slidetackle || 0) * 0.07 : (ps.anticipate || 0) * 0.025);
      let pr = 0.4 + (p.def - o.dri) / 70 + (slide ? 0.12 : 0) + (ps.anticipate || 0) * 0.07 + (ps.bruiser || 0) * 0.05
        - (ops.pressproven || 0) * 0.07 - (o.skillT > 0 ? 0.28 : 0) + (o.spr && !ops.technical ? 0.12 : 0) - (ops.bruiser ? 0.04 : 0);
      pr = clamp(pr, 0.06, 0.9);
      const won = rnd() < pr;
      if (!won) foulP *= 1.6;
      if (rnd() < clamp(foulP, 0.02, 0.7)) return this.foul(p, o, slide, behind);
      if (won) {
        const b = this.ball; this.release(o); o.stun = 0.45; o.cd = 0.6;
        b.vx = (p.x - o.x) * 2 + this.dir[p.side] * 3 + gauss() * 2; b.vz = (p.z - o.z) * 2 + gauss() * 2;
        if (rnd() < (slide ? 0.2 : 0.5)) this.giveBall(p);
      } else { p.stun = slide ? 0.9 : 0.55; }
    }
    foul(f, v, slide, behind) {
      const b = this.ball, cfg = this.cfg;
      const vd = this.dir[v.side];
      // Denying an obvious goal-scoring opportunity: no outfield defender between the victim and goal.
      const va = vd * v.x;
      const cover = this.players.filter((q) => q.side === f.side && q !== f && !q.isGK && vd * q.x > va).length;
      const dogso = cover === 0 && va > 28 && Math.abs(v.z) < 18;
      let card = null;
      if (dogso && rnd() < 0.5) card = 'r';
      else if (rnd() < (slide ? 0.3 : 0.12) + (behind ? 0.3 : 0)) card = f.yc && rnd() < 0.7 ? 'r2' : f.yc ? null : 'y';
      const min = this.minute(), fname = f.name, tname = cfg.teams[f.side].name;
      this.st.fouls = this.st.fouls || [0, 0]; this.st.fouls[f.side]++;
      this.say('info', f.side, `Foul by ${fname} on ${v.name}${slide ? ' (sliding tackle)' : behind ? ' (from behind)' : ''}.`);
      let msg = 'Foul!';
      if (card === 'y') { f.yc = 1; this.hudFor = null; this.cards.push({ min, side: f.side, pid: f.pid, type: 'y' }); this.st.yc[f.side]++; msg = `🟨 Yellow card · ${fname}`; this.say('info', f.side, `🟨 Yellow card for ${fname} (${tname}).`); }
      else if (card) {
        this.cards.push({ min, side: f.side, pid: f.pid, type: 'r' }); this.st.rc[f.side]++;
        msg = `🟥 ${card === 'r2' ? 'Second yellow! ' : ''}Red card · ${fname}`;
        this.say('info', f.side, `🟥 ${card === 'r2' ? 'Second yellow card: ' : 'Red card! '}${fname} is sent off${dogso && card === 'r' ? ' for denying a clear goal-scoring chance' : ''}.`);
      }
      this.flash(msg, card ? 2.2 : 1.1);
      const pen = this.inBox(f.side, v.x, v.z);
      b.owner = null; b.vx = b.vz = 0; b.pass = null; b.shot = null;
      for (const q of this.players) q.slideT = 0;
      this.phase = 'dead'; this.deadT = card ? 2 : 1.1;
      this.after = () => {
        if (card && card !== 'y') this.sendOff(f);
        if (pen) this.penalty(v.side);
        else this.restart('freekick', v.side, clamp(v.x, -PL + 1, PL - 1), clamp(v.z, -PW + 1, PW - 1));
      };
    }
    sendOff(p) {
      this.players = this.players.filter((q) => q !== p);
      this.sentOff.push(p);
      p.mesh.visible = false;
      if (this.ctrl === p) this.ctrl = this.teamMode ? this.players.find((q) => q.side === p.side && !q.isGK) : null;
      if (p.isGK) {
        // An outfielder goes in goal.
        const g = this.players.filter((q) => q.side === p.side).sort((a, c) => this.aOf(a, a.x) - this.aOf(c, c.x))[0];
        if (g) { g.isGK = true; g.gk = 38; g.slot = 'GK'; if (this.ctrl === g) this.ctrl = this.players.find((q) => q.side === p.side && !q.isGK); }
      }
    }
    penalty(side) {
      const b = this.ball, d = this.dir[side], gx = d * PL;
      Object.assign(b, { x: d * (PL - 11), z: 0, y: BR, vx: 0, vy: 0, vz: 0, owner: null, pass: null, shot: null, checked: false, spin: 0 });
      const taker = this.players.filter((q) => q.side === side && !q.isGK).sort((a, c) => (c.sho + (c.ps.finesse || 0) * 3) - (a.sho + (a.ps.finesse || 0) * 3))[0];
      for (const q of this.players) {
        if (q === taker) continue;
        if (q.isGK && q.side !== side) { q.x = gx - d * 0.3; q.z = 0; continue; }
        if (Math.abs(q.x - gx) < 18.5) q.x = gx - d * (18.5 + rnd() * 3);
      }
      taker.x = b.x - d * 0.9; taker.z = 0; taker.face = d > 0 ? 0 : Math.PI;
      this.giveBall(taker); taker.hold = 1.2;
      if (this.teamMode && side === this.cfg.userSide) this.ctrl = taker;
      this.setPiece = taker;
      this.phase = 'dead'; this.deadT = 1.0;
      this.flash(`Penalty! · ${this.cfg.teams[side].short || this.cfg.teams[side].name}`, 1.5);
      this.say('chance', side, `Penalty to ${this.cfg.teams[side].name}! ${taker.name} steps up.`);
    }
    sprintMul(p) {
      const tired = p.sta < 25 ? 0.35 : 1;
      return 1 + (0.3 + (p.ps.rapid || 0) * 0.03) * tired;
    }
    moveTo(p, tx, tz, dt, pace) {
      const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
      p.spr = pace > 1 && d > 3;
      if (p.spr) pace = this.sprintMul(p) * (pace / 1.25);
      const max = p.spd * pace * (p.stun > 0 ? 0.25 : 1);
      const want = d < 0.4 ? 0 : Math.min(max, d * 2.2);
      const ux = d ? dx / d : 0, uz = d ? dz / d : 0;
      this.accel(p, ux * want, uz * want, dt);
    }
    accel(p, vx, vz, dt) {
      if (p.slideT > 0) return; // sliding: momentum only
      const k = Math.min(1, dt * p.acc);
      p.vx += (vx - p.vx) * k; p.vz += (vz - p.vz) * k;
    }

    /* ---------------- user ---------------- */
    input() {
      const k = this.keys;
      let ix = (k.d || k.ArrowRight ? 1 : 0) - (k.a || k.ArrowLeft ? 1 : 0);
      let iz = (k.s || k.ArrowDown ? 1 : 0) - (k.w || k.ArrowUp ? 1 : 0);
      const n = hyp(ix, iz); if (n) { ix /= n; iz /= n; }
      return { ix, iz };
    }
    pressed(k) { return this.keys[k] && !this.prev[k]; }
    user(dt) {
      const p = this.ctrl, b = this.ball;
      if (!p || p.isGK) { this.prev = { ...this.keys }; return; }
      let { ix, iz } = this.input();
      const ms = this.mouse, aim = this.aim;
      if (ms.left) ms.hold += dt;
      // Hold the left button: run / dribble towards the cursor (keys take priority).
      if (!ix && !iz && ms.left && ms.hold >= 0.2 && aim) {
        const dx = aim.x - p.x, dz = aim.z - p.z, dd = hyp(dx, dz);
        if (dd > 0.7) { ix = dx / dd; iz = dz / dd; }
      }
      const sprint = (!!this.keys.Shift || ms.right) && !!(ix || iz);
      const has = b.owner === p;
      // Left click: pass to the team-mate nearest the cursor (or into space there); without the ball, switch player / call for it.
      while (ms.clicks > 0) {
        ms.clicks--;
        if (!aim) break;
        if (has) { this.mousePass(p, aim); this.prev = { ...this.keys }; return; }
        if (this.teamMode) { const m = this.mateNear(p.side, aim, 12, null); if (m) this.ctrl = m; }
        else if (b.owner && b.owner.side === p.side) { this.called = p; this.calledT = this.t; this.flash('Calling for the ball!', 0.8); }
      }
      p.spr = sprint;
      const sp = p.spd * (sprint ? this.sprintMul(p) : 1) * (has ? 0.93 : 1) * (p.stun > 0 ? 0.25 : 1);
      this.accel(p, ix * sp, iz * sp, dt);
      // X: skill move with the ball, slide tackle without it.
      if (this.pressed('x')) {
        if (has && p.skillT <= 0) this.skillMove(p, ix, iz);
        else if (!has && p.slideT <= 0 && p.stun <= 0) this.slide(p);
      }
      const aimShot = () => (this.input().iz ? null : aim && Math.abs(aim.x - this.goalX(p.side)) < 30 ? clamp(aim.z, -2.9, 2.9) : null);
      if (has && this.pressed('f')) { const az = aimShot(); this.finesse(p, this.input().iz || (az != null ? Math.sign(az) || 1 : 0)); this.charge = -1; this.prev = { ...this.keys }; return; }
      if (ix || iz) p.face = Math.atan2(iz, ix);
      const fdx = ix || Math.cos(p.face), fdz = iz || Math.sin(p.face);
      // Shooting: hold space to charge.
      if (has && this.keys[' ']) { this.charge = this.charge < 0 ? 0 : Math.min(1.15, this.charge + dt * 1.1); }
      else if (has && this.charge >= 0 && !this.keys[' ']) {
        const aimK = this.input().iz, az = aimShot();
        const aim = aimK ? aimK * 2.9 : az;
        this.shoot(p, Math.min(1, this.charge), aim); this.charge = -1;
      } else if (!has) {
        this.charge = -1;
        if (this.pressed(' ')) {
          const o = b.owner;
          if (o && o.side !== p.side && hyp(o.x - p.x, o.z - p.z) < 2.2 && p.tcd <= 0) this.tackle(p, o, false);
          else { p.tcd = 0.5; }
        }
      }
      if (has && this.pressed('e')) { const m = this.passTarget(p, fdx, fdz, false); if (m) this.doPass(p, m, 'ground'); else this.kickTo(p, p.x + fdx * 12, p.z + fdz * 12, 14, false, 0.05); }
      if (has && this.pressed('q')) { const m = this.passTarget(p, fdx, fdz, true); if (m) this.doPass(p, m, 'through'); else this.kickTo(p, p.x + fdx * 18, p.z + fdz * 18, 17, false, 0.06); }
      if (has && this.pressed('r')) { const m = this.passTarget(p, fdx, fdz, false); if (m && hyp(m.x - p.x, m.z - p.z) > 10) this.doPass(p, m, 'lob'); else this.cross(p); }
      if (!has && this.pressed('e') && !this.teamMode && b.owner && b.owner.side === p.side) { this.called = p; this.calledT = this.t; this.flash('Calling for the ball!', 0.8); }
      if (!has && this.pressed('q') && this.teamMode) {
        const cand = this.players.filter((q) => q.side === p.side && !q.isGK && q !== p).sort((a, c) => hyp(a.x - b.x, a.z - b.z) - hyp(c.x - b.x, c.z - b.z))[0];
        if (cand) this.ctrl = cand;
      }
      this.prev = { ...this.keys };
    }

    /* ---------------- simulation step ---------------- */
    step(dt) {
      const b = this.ball, cfg = this.cfg;
      for (const p of this.players) { p.cd -= dt; p.stun -= dt; p.tcd -= dt; p.hold -= dt; p.skillT -= dt; }
      if (this.phase === 'dead') {
        this.deadT -= dt;
        for (const p of this.players) { p.sta = Math.min(100, p.sta + 2 * dt); p.slideT = 0; }
        if (this.mouse) this.mouse.clicks = 0;
        for (const p of this.players) { p.vx *= 0.8; p.vz *= 0.8; }
        if (this.deadT <= 0) { if (this.after) { const f = this.after; this.after = null; f(); } else this.phase = 'play'; }
        this.stepBall(dt, true);
        return;
      }
      this.t += dt;
      if (this.half === 1 && this.t >= this.total / 2) {
        this.half = 2; for (const p of this.players) p.sta = Math.min(100, p.sta + 35); this.say('ht', -1, `Half-time: ${cfg.teams[0].name} ${this.score[0]}-${this.score[1]} ${cfg.teams[1].name}`);
        this.flash('Half-time', 2); this.phase = 'dead'; this.deadT = 2; this.after = () => this.kickoff(1 - cfg.userSide, false);
        return;
      }
      if (this.t >= this.total) return this.endMatch();
      if (b.owner) this.st.poss[b.owner.side] += dt;

      // Who chases the ball: per side, the nearest outfielder (two when defending deep).
      const chasers = new Set();
      for (const side of [0, 1]) {
        const mine = this.players.filter((p) => p.side === side && !p.isGK && p !== b.owner);
        const byD = mine.sort((a, c) => hyp(a.x - b.x, a.z - b.z) - hyp(c.x - b.x, c.z - b.z));
        const defending = b.owner && b.owner.side !== side;
        const loose = !b.owner && !(b.pass && b.pass.side === side);
        if (!defending && !loose) continue;
        let n = defending && this.dir[side] * b.x < -20 ? 2 : 1;
        for (const p of byD) {
          if (n <= 0) break;
          if (p === this.ctrl) { n--; continue; }
          chasers.add(p); n--;
        }
      }
      if (this.setPiece && b.owner !== this.setPiece) this.setPiece = null;
      for (const p of this.players) {
        if (p === this.ctrl && !p.isGK) continue;
        if (this.setPiece && p !== this.setPiece && !p.isGK) { p.spr = false; this.accel(p, 0, 0, dt); continue; } // wait for the kick
        if (b.owner === p) this.aiCarrier(p, dt); else this.aiOffBall(p, dt, chasers);
      }
      this.user(dt);
      if (this.phase !== 'play') return;
      // Slide tackles in progress
      for (const p of this.players) {
        if (p.slideT <= 0) continue;
        p.slideT -= dt; p.vx *= Math.exp(-2.2 * dt); p.vz *= Math.exp(-2.2 * dt);
        const o = b.owner;
        if (o && o.side !== p.side && !p.slid && hyp(o.x - p.x, o.z - p.z) < 1.5) { p.slid = true; this.tackle(p, o, true); if (this.phase !== 'play') return; }
        if (!o && !p.slid && hyp(b.x - p.x, b.z - p.z) < 1.4 && b.y < 0.6) { p.slid = true; b.vx = p.vx * 1.3 + gauss(); b.vz = p.vz * 1.3 + gauss(); b.last = p; b.lastSide = p.side; }
        if (p.slideT <= 0) { p.stun = Math.max(p.stun, 0.6); p.slid = false; }
      }
      // Stamina: sprinting drains it, jogging recovers it.
      for (const p of this.players) {
        const drain = 9 * (1 - (p.ps.rapid || 0) * 0.12) * (1 - (p.ps.relentless || 0) * 0.2);
        p.sta = clamp(p.sta + (p.spr && hyp(p.vx, p.vz) > p.spd * 0.9 ? -drain : 3.5) * dt, 0, 100);
      }
      for (const p of this.players) {
        p.x = clamp(p.x + p.vx * dt, -PL - 2, PL + 2); p.z = clamp(p.z + p.vz * dt, -PW - 2, PW + 2);
        const sp = hyp(p.vx, p.vz);
        if (sp > 0.3 && p !== this.ctrl) p.face = Math.atan2(p.vz, p.vx);
        p.run += sp * dt * 2.2;
      }
      this.stepBall(dt, false);
      if (b.owner && (Math.abs(b.x) > PL + 0.2 || Math.abs(b.z) > PW + 0.2)) { b.owner = null; this.lines(); }
    }
    stepBall(dt, dead) {
      const b = this.ball;
      if (b.owner) {
        const o = b.owner;
        const reach = o.spr ? (o.ps.technical ? 0.85 : 1.25) : 0.6; // close control vs knock-on
        const tx = o.x + Math.cos(o.face) * reach, tz = o.z + Math.sin(o.face) * reach;
        const k = Math.min(1, dt * 12);
        b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = BR; b.vx = o.vx; b.vz = o.vz; b.vy = 0;
        return;
      }
      b.vy -= G * dt;
      if (b.spin && b.y > BR + 0.005) b.vz += b.spin * dt; else b.spin = 0;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= BR) { b.y = BR; if (b.vy < -1.2) b.vy = -b.vy * 0.45; else b.vy = 0; }
      const fr = b.y <= BR + 0.01 ? Math.exp(-0.95 * dt) : Math.exp(-0.06 * dt);
      b.vx *= fr; b.vz *= fr;
      if (dead) return;
      this.keepers();
      if (!b.owner) this.pickup();
      if (!b.owner) this.lines();
    }
    keepers() {
      const b = this.ball;
      for (const gk of this.players) {
        if (!gk.isGK) continue;
        const d = this.dir[gk.side];
        // Ball heading at his goal and arriving at his position?
        const toward = -d * b.vx;
        if (b.checked || toward < 6 || Math.abs(b.x - gk.x) > 1.3 || b.last === gk) continue;
        b.checked = true;
        const reach = 1.6 + (gk.gk - 60) * 0.03 + (gk.ps.farreach || 0) * 0.3;
        const dz = Math.abs(b.z - gk.z), hi = b.y > 2.3;
        if (dz > reach + 0.6 || hi) continue;
        const sp = hyp(b.vx, b.vz);
        const pr = clamp(0.66 + (gk.ps.footwork || 0) * 0.04 + (gk.gk - 72) / 45 + (reach - dz) / reach * 0.3 - (sp - 22) / 50, 0.12, 0.97);
        if (rnd() < pr) {
          const shooter = b.shot;
          if (shooter) this.st.sot[shooter.side]++;
          if (sp < 22 && rnd() < 0.6) { this.giveBall(gk); gk.hold = 1.0; }
          else if (rnd() < 0.4) { b.vx = -d * (2 + rnd() * 2); b.vz = (b.z >= 0 ? 1 : -1) * (5 + rnd() * 4); b.vy = 3; b.last = gk; b.lastSide = gk.side; b.shot = null; } // tipped behind
          else { b.vx = d * (3 + rnd() * 4); b.vz = (rnd() - 0.5) * 12; b.vy = 2 + rnd() * 2; b.last = gk; b.lastSide = gk.side; b.shot = null; }
          if (shooter) { this.flash('Save!', 0.9); this.say('chance', shooter.side, `Great save by ${gk.name} to deny ${this.nameOf(shooter.pid)}!`); }
        }
      }
    }
    pickup() {
      const b = this.ball;
      if (b.y > 1.7) return;
      const sp = hyp(b.vx, b.vz);
      let best = null, bd = 1.05;
      for (const p of this.players) {
        if (p.cd > 0 || p.stun > 0) continue;
        const d = hyp(p.x - b.x, p.z - b.z);
        const reach = b.pass && b.pass.side !== p.side ? 1.05 + (p.ps.intercept || 0) * 0.3 : 1.05;
        if (d >= reach || (best && d >= bd)) continue;
        // Fast shots are hard to stop for outfield players.
        if (b.shot && b.shot.side !== p.side && sp > 16 && rnd() < 0.8) continue;
        best = p; bd = d;
      }
      if (best) this.giveBall(best);
    }
    lines() {
      const b = this.ball, cfg = this.cfg;
      if (Math.abs(b.x) > PL) {
        const s = b.x > 0 ? 1 : -1;
        const attSide = this.dir[0] === s ? 0 : 1; // side attacking this goal
        if (Math.abs(b.z) < GW && b.y < GH) return this.goal(attSide);
        const shot = b.shot;
        if (shot) this.say('chance', shot.side, `${this.nameOf(shot.pid)} ${b.y >= GH ? 'blazes it over the bar' : 'drags it wide'}.`);
        if (b.lastSide === attSide) this.deadThen(() => this.restart('goalkick', 1 - attSide));
        else this.deadThen(() => this.restart('corner', attSide, s * (PL - 0.5), b.z > 0 ? PW - 0.5 : -PW + 0.5));
        return;
      }
      if (Math.abs(b.z) > PW) {
        const side = 1 - b.lastSide;
        const x = clamp(b.x, -PL + 1, PL - 1), z = (b.z > 0 ? 1 : -1) * (PW - 0.3);
        this.deadThen(() => this.restart('throw', side, x, z));
      }
    }
    deadThen(f) { const b = this.ball; b.vx *= 0.2; b.vz *= 0.2; this.phase = 'dead'; this.deadT = 0.7; this.after = f; }
    nameOf(pid) { return (this.players.find((p) => p.pid === pid) || this.sentOff.find((p) => p.pid === pid))?.name || '—'; }
    goal(side) {
      const b = this.ball, cfg = this.cfg;
      this.score[side]++;
      let pid = null, apid = null, og = false;
      if (b.shot && b.shot.side === side) pid = b.shot.pid;
      else if (b.last && b.last.side === side) pid = b.last.pid;
      else og = true;
      if (!og && b.assist && b.assist.side === side && b.assist.pid !== pid && this.t - b.assist.t < 12) apid = b.assist.pid;
      if (!og && b.shot) this.st.sot[side]++;
      const min = this.minute();
      const sh = b.shot && b.shot.side === side ? b.shot : null;
      this.goals.push({ min, side, pid, apid, og, dist: sh ? +sh.dist.toFixed(1) : 0, kind: sh ? sh.kind : '' });
      const who = og ? `an own goal by ${b.last ? b.last.name : 'a defender'}` : this.nameOf(pid);
      this.say('goal', side, `GOAL! ${og ? `It's ${who}!` : `${who} scores${apid ? ` (assist: ${this.nameOf(apid)})` : ''}!`} ${cfg.teams[0].short} ${this.score[0]}-${this.score[1]} ${cfg.teams[1].short}`);
      this.flash(`GOAL! ${og ? 'Own goal' : this.nameOf(pid)}`, 2.2);
      b.vx *= 0.1; b.vz *= 0.1; b.owner = null; b.shot = null;
      this.phase = 'dead'; this.deadT = 2.2; this.after = () => this.kickoff(1 - side, false);
    }
    endMatch() {
      if (this.over) return;
      this.over = true; this.paused = true;
      const cfg = this.cfg, tot = [this.score[0] + (cfg.agg ? cfg.agg[0] : 0), this.score[1] + (cfg.agg ? cfg.agg[1] : 0)];
      let pens = null;
      if (cfg.ko && tot[0] === tot[1]) pens = this.shootout();
      const pt = this.st.poss[0] + this.st.poss[1] || 1;
      this.st.poss = [Math.round((this.st.poss[0] / pt) * 100), 100 - Math.round((this.st.poss[0] / pt) * 100)];
      let ft = `Full-time: ${cfg.teams[0].name} ${this.score[0]}-${this.score[1]} ${cfg.teams[1].name}`;
      if (cfg.agg) ft += `. Aggregate ${tot[0]}-${tot[1]}`;
      if (pens) ft += `. ${cfg.teams[pens[0] > pens[1] ? 0 : 1].name} win ${Math.max(...pens)}-${Math.min(...pens)} on penalties`;
      this.say('ft', -1, ft);
      this.pens = pens;
      const m = this.hud.menu; m.classList.remove('hidden');
      const us = cfg.userSide, won = pens ? pens[us] > pens[1 - us] : this.score[us] > this.score[1 - us], drew = !pens && this.score[0] === this.score[1];
      m.innerHTML = `<h2>${won ? '🎉 Victory!' : drew ? 'Full-time' : 'Defeat'}</h2>
        <p class="m3d-final">${esc(cfg.teams[0].name)} <b>${this.score[0]} - ${this.score[1]}</b> ${esc(cfg.teams[1].name)}${pens ? `<br><span class="muted">Penalties ${pens[0]}-${pens[1]}</span>` : ''}</p>
        <ul class="m3d-goals">${this.goals.map((g) => `<li>${g.min}' ${g.og ? 'Own goal' : esc(this.nameOf(g.pid))}${g.apid ? ` <span class="muted">(${esc(this.nameOf(g.apid))})</span>` : ''} · ${esc(cfg.teams[g.side].short || cfg.teams[g.side].name)}</li>`).join('') || '<li class="muted">No goals</li>'}</ul>
        ${this.cards.length ? `<p class="small">${this.cards.map((c) => `${c.type === 'r' ? '🟥' : '🟨'} ${esc(this.nameOf(c.pid))} ${c.min}'`).join(' · ')}</p>` : ''}
        <p class="muted small">Shots ${this.st.shots[0]}-${this.st.shots[1]} · On target ${this.st.sot[0]}-${this.st.sot[1]} · Possession ${this.st.poss[0]}%-${this.st.poss[1]}% · Fouls ${(this.st.fouls || [0, 0]).join('-')} · Offsides ${(this.st.off || [0, 0]).join('-')}</p>
        <button class="btn primary big" data-m3d="done">Continue</button>`;
    }
    shootout() {
      const cfg = this.cfg, s = [0, 0];
      const takers = [0, 1].map((side) => this.players.filter((p) => p.side === side && !p.isGK).sort((a, b) => b.sho - a.sho));
      const gks = [0, 1].map((side) => this.players.find((p) => p.side === side && p.isGK));
      const kick = (side, i) => { const t = takers[side][i % takers[side].length]; const g = gks[1 - side]; const ok = rnd() < clamp(0.76 + (t.sho - (g ? g.gk : 50)) / 120, 0.6, 0.9); if (ok) s[side]++; return ok; };
      for (let i = 0; i < 5; i++) { kick(0, i); kick(1, i); }
      let i = 5;
      while (s[0] === s[1] && i < 30) { kick(0, i); kick(1, i); i++; }
      this.say('ft', -1, `Penalty shoot-out: ${cfg.teams[0].name} ${s[0]}-${s[1]} ${cfg.teams[1].name}`);
      return s;
    }
    finish() {
      this.destroy();
      this.cfg.onDone({ score: this.score.slice(), goals: this.goals, cards: this.cards, pens: this.pens || null, st: this.st, text: this.text });
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
      window.removeEventListener('blur', this.blur); window.removeEventListener('resize', this.resize);
      window.removeEventListener('mouseup', this.mu);
      clearTimeout(this.msgT);
      this.renderer.dispose();
      this.root.remove();
      document.body.classList.remove('m3d-open');
    }

    /* ---------------- render ---------------- */
    loop(now) {
      this.raf = requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        // Fixed sub-steps keep fast balls from skipping through players.
        const n = Math.ceil(dt / 0.017);
        for (let r = 0; r < (this.cfg.speed || 1) && !this.over; r++) for (let i = 0; i < n; i++) this.step(dt / n);
      }
      this.draw(dt);
    }
    draw(dt) {
      const b = this.ball, T = this.T;
      for (const p of this.players) {
        p.mesh.position.set(p.x, 0, p.z);
        // Turn smoothly towards the facing direction.
        let dr = -p.face - (p.rotY ?? -p.face); dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        p.rotY = (p.rotY ?? -p.face) + dr * Math.min(1, dt * 12);
        p.mesh.rotation.y = p.rotY;
        if (p.kickT > 0) p.kickT -= dt;
        animateRig(p, dt);
      }
      this.ballMesh.position.set(b.x, b.y, b.z);
      this.ballMesh.rotation.z -= hyp(b.vx, b.vz) * dt * 3;
      this.ballShadow.position.set(b.x, 0.021, b.z);
      const c = this.ctrl;
      if (c) {
        this.ring.position.set(c.x, 0.03, c.z);
        this.arrow.position.set(c.x, 2.55 + Math.sin(performance.now() / 200) * 0.08, c.z);
        this.nameTag.position.set(c.x, 3.15, c.z);
        this.setLabel(c.name.split(' ').slice(-1)[0]);
        if (this.hudFor !== c) {
          this.hudFor = c;
          this.hud.pname.innerHTML = `<b>${esc(c.name)}</b> <span>${esc(c.slot)} · ${c.ovr}</span>${c.yc ? ' 🟨' : ''}`;
          this.hud.ps.innerHTML = Object.entries(c.ps || {}).map(([k, v]) => `<span class="${v > 1 ? 'plus' : ''}">${v > 1 ? '◆' : '◇'} ${PS_NAME[k] || k}${v > 1 ? '+' : ''}</span>`).join('');
        }
        this.hud.sta.style.width = `${Math.round(c.sta)}%`;
        this.hud.sta.className = c.sta < 25 ? 'low' : '';
      }
      // Broadcast camera: follows the ball from the near touchline.
      const mode = CAMS[this.camMode || 0];
      const focus = mode.follow && this.ctrl ? { x: (this.ctrl.x * 2 + b.x) / 3, z: (this.ctrl.z * 2 + b.z) / 3 } : b;
      const tx = clamp(focus.x * mode.fx, -PL + mode.edge, PL - mode.edge), tz = clamp(focus.z * mode.fz, -mode.zc, mode.zc);
      const cam = this.cam, k = Math.min(1, dt * 3);
      this.cx = (this.cx ?? tx) + (tx - (this.cx ?? tx)) * k;
      this.cz = (this.cz ?? tz) + (tz - (this.cz ?? tz)) * k;
      cam.position.set(this.cx, mode.h, this.cz + mode.d);
      cam.lookAt(this.cx, mode.ly, this.cz - 2);
      // Mouse aim on the pitch.
      if (this.mouse && this.mouse.on && !this.over) {
        this.ray.setFromCamera({ x: this.mouse.nx, y: this.mouse.ny }, cam);
        const hit = this.ray.ray.intersectPlane(this.ground, this.aimV);
        this.aim = hit ? { x: clamp(hit.x, -PL - 1, PL + 1), z: clamp(hit.z, -PW - 1, PW + 1) } : null;
      } else this.aim = null;
      const a = this.aim;
      this.aimMark.visible = !!a;
      if (a) this.aimMark.position.set(a.x, 0.035, a.z);
      const has = this.ctrl && this.ball.owner === this.ctrl;
      const tm = a && this.ctrl ? (has ? this.mateNear(this.ctrl.side, a, 7, this.ctrl) : this.teamMode ? this.mateNear(this.ctrl.side, a, 12, this.ctrl) : null) : null;
      this.tgtMark.visible = !!tm;
      if (tm) this.tgtMark.position.set(tm.x, 0.032, tm.z);
      this.renderer.render(this.scene, cam);
      // HUD
      this.hud.sc.textContent = `${this.score[0]} - ${this.score[1]}`;
      this.hud.clock.textContent = this.over ? 'FT' : `${this.minute()}'`;
      const ch = this.charge >= 0;
      this.hud.power.classList.toggle('on', ch);
      if (ch) { this.hud.bar.style.width = `${Math.min(100, this.charge * 100)}%`; this.hud.bar.classList.toggle('over', this.charge > 0.9); }
      this.radar();
    }
    radar() {
      const cv = this.hud.radar, g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(12,40,24,.8)'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
      g.strokeRect(4, 4, W - 8, H - 8); g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 4); g.stroke();
      const X = (x) => 4 + ((x + PL) / (2 * PL)) * (W - 8), Y = (z) => 4 + ((z + PW) / (2 * PW)) * (H - 8);
      for (const p of this.players) {
        g.fillStyle = p === this.ctrl ? '#facc15' : this.cols[p.side].css;
        g.beginPath(); g.arc(X(p.x), Y(p.z), p === this.ctrl ? 4 : 3, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(X(this.ball.x), Y(this.ball.z), 2.5, 0, Math.PI * 2); g.fill();
    }
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ================= Trophy celebrations (cutscenes) ================= */
  function kitColors(T, hue) {
    const h = ((hue ?? 210) % 360) / 360;
    return { kit: new T.Color().setHSL(h, 0.7, 0.45), shorts: new T.Color().setHSL(h, 0.5, 0.18), socks: new T.Color().setHSL(h, 0.7, 0.4), gk: new T.Color(0xfacc15), css: `hsl(${Math.round(h * 360)} 70% 45%)` };
  }
  function celebrate(cfg) {
    const root = document.createElement('div');
    root.id = 'm3d'; root.className = 'celebr';
    root.innerHTML = `
      <div class="m3d-stage"></div>
      <div class="cel-text"><div class="cel-kicker"></div><h1 class="cel-title"></h1><div class="cel-sub"></div></div>
      <div class="cel-btns"><button class="btn ghost" data-cel="skip">Skip all</button><button class="btn primary" data-cel="next">Continue</button></div>
      <div class="m3d-loading">Loading…</div>`;
    document.body.appendChild(root);
    document.body.classList.add('m3d-open');
    const q = (x) => root.querySelector(x);
    q('.cel-kicker').textContent = cfg.kicker || '';
    q('.cel-title').textContent = cfg.title || '';
    q('.cel-sub').textContent = cfg.sub || '';
    let scene = null;
    const close = (all) => {
      if (scene) scene.destroy();
      window.removeEventListener('keydown', onKey);
      root.remove(); document.body.classList.remove('m3d-open');
      if (all && cfg.onSkipAll) cfg.onSkipAll(); else cfg.onDone && cfg.onDone();
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(e.key === 'Escape'); } };
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => { const a = e.target.closest('[data-cel]')?.dataset.cel; if (a) close(a === 'skip'); });
    setTimeout(() => root.classList.add('show'), 60);
    loadThree((err) => {
      q('.m3d-loading').remove();
      if (err) { root.classList.add('flat'); return; }
      scene = new Celebration(cfg, root);
    });
  }
  class Celebration {
    constructor(cfg, root) {
      const T = (this.T = window.THREE);
      this.cfg = cfg; this.root = root; this.t = 0;
      const r = (this.renderer = new T.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      root.querySelector('.m3d-stage').appendChild(r.domElement);
      const scene = (this.scene = new T.Scene());
      const award = cfg.kind === 'ballon' || cfg.kind === 'boot';
      scene.background = new T.Color(award ? 0x04040a : 0x050b16);
      scene.fog = new T.Fog(scene.background, 30, 90);
      this.cam = new T.PerspectiveCamera(45, 1, 0.1, 300);
      scene.add(new T.HemisphereLight(0xbcd3ff, 0x0b1a10, award ? 0.25 : 0.55));
      const key = new T.SpotLight(0xfff3d6, award ? 2.2 : 1.4, 60, award ? 0.38 : 0.7, 0.45);
      key.position.set(4, 18, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      scene.add(key); scene.add(key.target);
      const rim = new T.DirectionalLight(0x93c5fd, 0.5); rim.position.set(-10, 8, -12); scene.add(rim);
      // Floor: pitch for team trophies, dark stage for individual awards.
      if (award) {
        const floor = new T.Mesh(new T.CircleGeometry(40, 48), new T.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.4, metalness: 0.3 }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const beam = new T.Mesh(new T.ConeGeometry(3.2, 18, 32, 1, true), new T.MeshBasicMaterial({ color: 0xfff1c1, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false }));
        beam.position.set(0, 9, 0); scene.add(beam);
      } else {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1f6b3a' : '#1a5f33'; g.fillRect(i * 64, 0, 64, 512); }
        const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(4, 4);
        const floor = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const standMat = new T.MeshStandardMaterial({ color: 0x151b28, roughness: 0.9 });
        for (let i = 0; i < 4; i++) { const st = new T.Mesh(new T.BoxGeometry(80, 16, 8), standMat); const a = (i / 4) * Math.PI * 2; st.position.set(Math.cos(a) * 40, 8, Math.sin(a) * 40); st.rotation.y = -a + Math.PI / 2; scene.add(st); }
        // Crowd camera flashes
        const n = 900, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, rr = 35 + rnd() * 3; pos.set([Math.cos(a) * rr, 3 + rnd() * 13, Math.sin(a) * rr], i * 3); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        this.flashes = new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
        scene.add(this.flashes);
      }
      // Podium
      const pod = new T.Mesh(new T.CylinderGeometry(award ? 1.6 : 2.2, award ? 1.8 : 2.4, 0.45, 40), new T.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.4 }));
      pod.position.y = 0.225; pod.castShadow = pod.receiveShadow = true; scene.add(pod);
      const ringM = new T.Mesh(new T.TorusGeometry(award ? 1.62 : 2.22, 0.03, 8, 64), new T.MeshBasicMaterial({ color: 0xfacc15 }));
      ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.45; scene.add(ringM);
      // People
      const cols = [kitColors(T, cfg.hue)];
      const kit = new HumanKit(T, cols);
      this.people = [];
      const list = award ? [cfg.star] : (cfg.players || []).slice(0, 11);
      list.forEach((pl, i) => {
        const p = { pid: pl.pid || pl.name, name: pl.name, num: pl.num || i + 1, side: 0, isGK: !!pl.isGK };
        const h = kit.build(p);
        let x = 0, z = 0, y = 0.45;
        if (i > 0) { const k = i - 1, row = k < 6 ? 0 : 1, idx = row ? k - 6 : k, cnt = row ? 4 : 6; const a = Math.PI * (0.15 + (0.7 * (idx + 0.5)) / cnt); const rr = row ? 5.2 : 3.6; x = -Math.sin(a) * rr * 0.4 - (row ? 1.2 : 0.4); z = Math.cos(a) * rr * 1.25; y = 0; }
        h.root.position.set(x, y, z);
        h.root.rotation.y = Math.atan2(z - 30, x - 0) * 0; // face the camera side (+X)
        scene.add(h.root);
        this.people.push({ h, ph: rnd() * 6, cap: i === 0 });
      });
      // Trophy
      this.trophy = makeTrophy(T, cfg.kind);
      this.trophy.position.set(award ? 0.35 : 0.9, award ? 1.25 : 0.45, 0);
      scene.add(this.trophy);
      // Confetti
      const N = 700;
      this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.09, 0.05), new T.MeshBasicMaterial({ side: T.DoubleSide }), N);
      const palette = award ? [0xfacc15, 0xfde68a, 0xffffff, 0xeab308] : [cols[0].kit.getHex(), 0xffffff, 0xfacc15, cols[0].shorts.getHex(), 0xfde68a];
      this.cp = [];
      for (let i = 0; i < N; i++) {
        this.cp.push({ x: (rnd() - 0.5) * 22, y: 3 + rnd() * 16, z: (rnd() - 0.5) * 22, vy: 0.8 + rnd() * 1.2, r: rnd() * 6, s: 0.5 + rnd() * 2, ph: rnd() * 6 });
        this.conf.setColorAt(i, new T.Color(palette[i % palette.length]));
      }
      scene.add(this.conf);
      this.dummy = new T.Object3D();
      this.fw = [];
      this.resize = () => { const w = window.innerWidth, hh = window.innerHeight; r.setSize(w, hh); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); };
      window.addEventListener('resize', this.resize); this.resize();
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
      window.SM3D.cel = this;
    }
    firework() {
      const T = this.T, n = 140, pos = new Float32Array(n * 3), vel = [];
      const cx = (rnd() - 0.5) * 50, cy = 14 + rnd() * 10, cz = -18 - rnd() * 14;
      for (let i = 0; i < n; i++) { pos.set([cx, cy, cz], i * 3); const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), sp = 5 + rnd() * 5; vel.push([Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp]); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      const col = [0xfacc15, 0xf472b6, 0x60a5fa, 0x4ade80, 0xffffff, 0xf97316][Math.floor(rnd() * 6)];
      const pts = new T.Points(geo, new T.PointsMaterial({ color: col, size: 0.45, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false }));
      this.scene.add(pts); this.fw.push({ pts, vel, t: 0 });
    }
    loop(now) {
      this.raf = requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
      const t = this.t, award = this.cfg.kind === 'ballon' || this.cfg.kind === 'boot';
      // Players: jump and cheer; the captain / winner lifts the trophy.
      const lift = clamp((t - 2.2) / 1.2, 0, 1);
      for (const pp of this.people) {
        const r = pp.h, j = pp.cap && award ? 0 : Math.max(0, Math.sin(t * 5.5 + pp.ph)) * (pp.cap ? 0.18 : 0.35);
        r.root.position.y = (pp.cap ? 0.45 : 0) + j;
        r.body.rotation.z = -0.05;
        r.arms.forEach((A) => { const up = pp.cap ? lift : 1; A.sh.rotation.z = 0.2 + up * (2.75 + Math.sin(t * 6 + pp.ph) * (pp.cap ? 0.05 : 0.25)); A.sh.rotation.x = A.s * (0.2 + 0.15 * up); A.el.rotation.z = 0.15; });
        r.legs.forEach((L, i) => { L.hip.rotation.z = j > 0.05 ? (i ? -0.25 : 0.3) : 0; L.kn.rotation.z = j > 0.05 ? -0.5 : -0.05; });
        r.head.rotation.z = -0.25 * (pp.cap ? lift : 1);
        // Turn towards the camera.
        const want = Math.atan2(-(this.cam.position.z - r.root.position.z), this.cam.position.x - r.root.position.x) + (pp.cap ? 0 : Math.sin(pp.ph) * 0.4);
        let d = want - r.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        r.root.rotation.y += d * Math.min(1, dt * 3);
        if (pp.cap) {
          // Held up in both hands, just in front of the head.
          const sc = r.root.scale.y, th = r.root.rotation.y;
          const hx = r.root.position.x + Math.cos(th) * 0.12, hz = r.root.position.z - Math.sin(th) * 0.12;
          const top = r.root.position.y + 1.98 * sc + Math.sin(t * 3) * 0.04 - (this.cfg.kind === 'ucl' ? 0.1 : 0);
          const x0 = award ? 0.35 : 0.9, y0 = award ? 1.25 : 0.45;
          this.trophy.position.set(x0 + (hx - x0) * lift, y0 + (top - y0) * lift, hz * lift);
          this.trophy.rotation.y = t * (award ? 0.8 : 0.3);
        }
      }
      if (!this.people.some((p) => p.cap)) this.trophy.rotation.y = t * 0.6;
      // Confetti
      for (let i = 0; i < this.cp.length; i++) {
        const c = this.cp[i];
        c.y -= c.vy * dt; c.r += c.s * dt; c.x += Math.sin(t * 1.5 + c.ph) * 0.4 * dt;
        if (c.y < 0.05) { c.y = 0.03; if (rnd() < 0.004) { c.y = 14 + rnd() * 6; } }
        this.dummy.position.set(c.x, c.y, c.z); this.dummy.rotation.set(c.r, c.r * 0.7, c.r * 0.3); this.dummy.updateMatrix();
        this.conf.setMatrixAt(i, this.dummy.matrix);
      }
      this.conf.instanceMatrix.needsUpdate = true;
      // Fireworks and flashes
      if (!award && (this.fwT = (this.fwT || 0) - dt) <= 0) { this.firework(); this.fwT = 0.35 + rnd() * 0.6; }
      if (award && t > 1 && (this.fwT = (this.fwT || 0) - dt) <= 0) { this.firework(); this.fwT = 1.1 + rnd(); }
      for (const f of this.fw) {
        f.t += dt; const a = f.pts.geometry.attributes.position;
        for (let i = 0; i < f.vel.length; i++) { const v = f.vel[i]; v[1] -= 3 * dt; a.array[i * 3] += v[0] * dt; a.array[i * 3 + 1] += v[1] * dt; a.array[i * 3 + 2] += v[2] * dt; }
        a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 1 - f.t / 1.8);
      }
      this.fw = this.fw.filter((f) => { if (f.t > 1.9) { this.scene.remove(f.pts); f.pts.geometry.dispose(); return false; } return true; });
      if (this.flashes) this.flashes.material.opacity = 0.3 + Math.abs(Math.sin(t * 17)) * 0.7;
      // Camera: slow orbit, pushing in.
      const R = award ? 6.5 - Math.min(1.5, t * 0.15) : 12 - Math.min(3, t * 0.25);
      const ang = 0.35 + t * 0.12;
      this.cam.position.set(Math.cos(ang) * R, (award ? 2.2 : 4) + Math.sin(t * 0.3) * 0.4, Math.sin(ang) * R);
      this.cam.lookAt(0, award ? 2.3 : 2.4, 0);
      this.renderer.render(this.scene, this.cam);
    }
    destroy() { cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.resize); this.renderer.dispose(); }
  }
  function makeTrophy(T, kind) {
    const g = new T.Group();
    const gold = new T.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.45, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.55 });
    const silver = new T.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.4, roughness: 0.2, emissive: 0x6b7280, emissiveIntensity: 0.45 });
    const add = (geo, m, y = 0, x = 0, z = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (kind === 'ballon') {
      add(new T.CylinderGeometry(0.12, 0.16, 0.18, 24), gold, 0.09);
      add(new T.SphereGeometry(0.2, 32, 24), gold, 0.38);
    } else if (kind === 'boot') {
      add(new T.CylinderGeometry(0.14, 0.17, 0.12, 24), new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), 0.06);
      const sole = add(new T.BoxGeometry(0.34, 0.08, 0.13), gold, 0.17, 0.05); sole.rotation.z = 0.05;
      add(new T.BoxGeometry(0.24, 0.12, 0.12), gold, 0.26, 0.02);
      add(new T.CylinderGeometry(0.065, 0.07, 0.22, 16), gold, 0.4, -0.07);
    } else {
      const ucl = kind === 'ucl';
      const pts = (ucl ? [[0.14, 0], [0.16, 0.05], [0.07, 0.12], [0.06, 0.3], [0.1, 0.42], [0.22, 0.62], [0.25, 0.78], [0.24, 0.8]] : [[0.16, 0], [0.18, 0.08], [0.06, 0.16], [0.05, 0.3], [0.16, 0.42], [0.21, 0.58], [0.2, 0.64]]).map(([x, y]) => new T.Vector2(x, y));
      add(new T.LatheGeometry(pts, 40), ucl ? silver : gold, 0);
      add(new T.CylinderGeometry(ucl ? 0.17 : 0.2, ucl ? 0.19 : 0.22, 0.1, 32), new T.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 }), -0.04);
      for (const s of [1, -1]) {
        const h = add(new T.TorusGeometry(ucl ? 0.2 : 0.09, ucl ? 0.018 : 0.015, 10, 32, ucl ? Math.PI * 1.25 : Math.PI), ucl ? silver : gold, ucl ? 0.52 : 0.46, 0, s * (ucl ? 0.3 : 0.22));
        h.rotation.set(0, 0, 0); h.rotation.x = s > 0 ? 0 : Math.PI; h.rotation.z = ucl ? -Math.PI * 0.12 : Math.PI / 2 * 0 ; h.rotation.y = Math.PI / 2;
      }
    }
    return g;
  }

  /* ================= Awards gala (Ballon d'Or night) ================= */
  function gala(cfg) {
    const root = document.createElement('div');
    root.id = 'm3d'; root.className = 'celebr gala';
    root.innerHTML = `
      <div class="m3d-stage"></div>
      <div class="gala-top"><div class="cel-kicker"></div><h2 class="gala-title"></h2><div class="gala-desc"></div></div>
      <div class="gala-noms"></div>
      <div class="gala-reveal"><div class="gr-lead"></div><div class="gr-name"></div><div class="gr-sub"></div></div>
      <div class="cel-btns"><button class="btn ghost" data-g="skip">Leave the gala</button><button class="btn primary" data-g="next">Next ▸</button></div>
      <div class="m3d-loading">Loading…</div>`;
    document.body.appendChild(root);
    document.body.classList.add('m3d-open');
    setTimeout(() => root.classList.add('show'), 60);
    loadThree((err) => {
      root.querySelector('.m3d-loading').remove();
      new Gala(cfg, root, err ? null : window.THREE);
    });
  }
  class Gala {
    constructor(cfg, root, T) {
      this.cfg = cfg; this.root = root; this.T = T; this.i = -1; this.sub = 0; this.t = 0; this.figs = [];
      const q = (x) => root.querySelector(x);
      this.el = { kicker: q('.cel-kicker'), title: q('.gala-title'), desc: q('.gala-desc'), noms: q('.gala-noms'), rev: q('.gala-reveal'), lead: q('.gr-lead'), name: q('.gr-name'), sub: q('.gr-sub'), next: q('[data-g="next"]') };
      this.onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.next(); } if (e.key === 'Escape') this.close(); };
      window.addEventListener('keydown', this.onKey);
      root.addEventListener('click', (e) => { const a = e.target.closest('[data-g]')?.dataset.g; if (a === 'next') this.next(); else if (a === 'skip') this.close(); });
      if (T) this.build();
      this.intro();
    }
    build() {
      const T = this.T;
      const r = (this.renderer = new T.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      this.root.querySelector('.m3d-stage').appendChild(r.domElement);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color(0x07040c); scene.fog = new T.Fog(0x07040c, 25, 70);
      this.cam = new T.PerspectiveCamera(42, 1, 0.1, 200);
      scene.add(new T.HemisphereLight(0x9aa5ff, 0x1a0b10, 0.35));
      const key = new T.SpotLight(0xfff1d0, 2.4, 50, 0.32, 0.5); key.position.set(0, 16, 6); key.target.position.set(0, 1, -3); key.castShadow = true;
      scene.add(key); scene.add(key.target); this.key = key;
      // Hall: floor, carpet, stage, back wall with screen, golden arch
      const floor = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color: 0x120a10, roughness: 0.8 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      const carpet = new T.Mesh(new T.PlaneGeometry(3, 26), new T.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.9 }));
      carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.01, 8); scene.add(carpet);
      const stage = new T.Mesh(new T.BoxGeometry(18, 1, 7), new T.MeshStandardMaterial({ color: 0x1c1117, roughness: 0.3, metalness: 0.3 }));
      stage.position.set(0, 0.5, -4); stage.receiveShadow = true; scene.add(stage);
      const edge = new T.Mesh(new T.BoxGeometry(18.2, 0.08, 0.1), new T.MeshBasicMaterial({ color: 0xfacc15 })); edge.position.set(0, 1.0, -0.5); scene.add(edge);
      const wall = new T.Mesh(new T.PlaneGeometry(30, 16), new T.MeshStandardMaterial({ color: 0x0e0a14, roughness: 0.9 })); wall.position.set(0, 8, -7.6); scene.add(wall);
      const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512; this.screenCtx = sc.getContext('2d');
      this.screenTex = new T.CanvasTexture(sc);
      const screen = new T.Mesh(new T.PlaneGeometry(12, 6), new T.MeshBasicMaterial({ map: this.screenTex })); screen.position.set(0, 6.2, -7.5); scene.add(screen);
      const gold = new T.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.5, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.5 });
      const arch = new T.Mesh(new T.TorusGeometry(8.2, 0.12, 10, 80, Math.PI), gold); arch.position.set(0, 1, -7.3); scene.add(arch);
      const big = new T.Mesh(new T.SphereGeometry(1.1, 40, 30), gold); big.position.set(-6.6, 2.6, -5.2); big.castShadow = true; scene.add(big); this.bigBall = big;
      const ped = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, 1, 32), new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })); ped.position.set(-6.6, 1.5, -5.2); scene.add(ped);
      // Audience: rows of seated guests
      const rows = 9, per = 22, n = rows * per;
      const body = new T.InstancedMesh(new T.CylinderGeometry(0.22, 0.26, 0.7, 8), new T.MeshStandardMaterial({ roughness: 0.8 }), n);
      const head = new T.InstancedMesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshStandardMaterial({ roughness: 0.6 }), n);
      const d = new T.Object3D(); let k = 0;
      const suits = [0x111827, 0x1f2937, 0x3f1d38, 0x0f172a, 0x7f1d1d, 0x1e3a8a, 0x111111];
      const skins = [0xf1c9a5, 0xe0ac86, 0xc68a62, 0xa86b45, 0x7d4a2c];
      for (let rr = 0; rr < rows; rr++) for (let i = 0; i < per; i++) {
        const x = (i - per / 2 + 0.5) * 1.05 + (Math.abs(i - per / 2 + 0.5) < 1.6 ? Math.sign(i - per / 2 + 0.5) * 1.2 : 0);
        const z = 3 + rr * 1.4, y = 0.35 + rr * 0.35;
        d.position.set(x, y + 0.45, z); d.rotation.set(0, 0, 0); d.updateMatrix(); body.setMatrixAt(k, d.matrix); body.setColorAt(k, new T.Color(suits[(rr * 7 + i * 3) % suits.length]));
        d.position.set(x, y + 0.95, z); d.updateMatrix(); head.setMatrixAt(k, d.matrix); head.setColorAt(k, new T.Color(skins[(rr * 5 + i * 11) % skins.length]));
        k++;
      }
      scene.add(body); scene.add(head); this.audience = head;
      const tiers = new T.Mesh(new T.BoxGeometry(26, 3, 14), new T.MeshStandardMaterial({ color: 0x160d14 })); tiers.position.set(0, -1.2 + 0.0, 9.5); tiers.rotation.x = -0.24; scene.add(tiers);
      // Sweeping beams
      this.beams = [];
      for (let i = 0; i < 4; i++) {
        const b = new T.Mesh(new T.ConeGeometry(1.4, 16, 24, 1, true), new T.MeshBasicMaterial({ color: [0xfde68a, 0x93c5fd, 0xf0abfc, 0xfde68a][i], transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        b.position.set(-9 + i * 6, 8, -6); scene.add(b); this.beams.push(b);
      }
      // Confetti
      const N = 500; this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.09, 0.05), new T.MeshBasicMaterial({ side: T.DoubleSide }), N); this.cp = [];
      for (let i = 0; i < N; i++) { this.cp.push({ x: (rnd() - 0.5) * 16, y: -5, z: -4 + (rnd() - 0.5) * 6, vy: 0.8 + rnd(), r: rnd() * 6, s: 1 + rnd() * 2, ph: rnd() * 6 }); this.conf.setColorAt(i, new T.Color([0xfacc15, 0xfde68a, 0xffffff][i % 3])); }
      scene.add(this.conf); this.dummy = new T.Object3D();
      this.resize = () => { const w = window.innerWidth, h = window.innerHeight; r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); };
      window.addEventListener('resize', this.resize); this.resize();
      this.last = performance.now(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
      window.SM3D.galaCur = this;
    }
    screen(l1, l2, l3) {
      if (!this.screenCtx) return;
      const g = this.screenCtx; g.fillStyle = '#0b0710'; g.fillRect(0, 0, 1024, 512);
      const grd = g.createRadialGradient(512, 256, 20, 512, 256, 560); grd.addColorStop(0, 'rgba(202,138,4,.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
      // Backdrop only (the on-screen captions carry the text): award name and emblem.
      g.textAlign = 'center';
      g.strokeStyle = 'rgba(250,204,21,.5)'; g.lineWidth = 4; g.beginPath(); g.arc(512, 230, 120, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(250,204,21,.22)'; g.beginPath(); g.arc(512, 230, 100, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(253,230,138,.8)'; g.font = '800 44px Inter, Arial'; g.fillText(l1 || '', 512, 430, 960);
      this.screenTex.needsUpdate = true;
    }
    figure(w, x) {
      if (!this.T) return null;
      const T = this.T, cols = [kitColors(T, w.hue)];
      if (w.suit) { cols[0].kit = new T.Color(0x1f2937); cols[0].shorts = new T.Color(0x111827); cols[0].socks = new T.Color(0x111827); }
      const h = new HumanKit(T, cols).build({ pid: w.pid, name: w.name, num: w.isGK ? 1 : 10, side: 0, isGK: w.isGK });
      h.root.position.set(x, 1.0, -3.2); h.root.rotation.y = -Math.PI / 2 + 0.0; // face the audience (+Z)
      this.scene.add(h.root);
      const f = { h, x0: x < 0 ? -9.5 : 9.5, x, t0: this.t, trophy: null, lift: false };
      h.root.position.x = f.x0;
      this.figs.push(f);
      return f;
    }
    clearFigs() { for (const f of this.figs) { this.scene.remove(f.h.root); if (f.trophy) this.scene.remove(f.trophy); } this.figs = []; }
    burst() { for (const c of this.cp) { c.y = 7 + rnd() * 6; c.x = (rnd() - 0.5) * 16; } }
    intro() {
      const c = this.cfg;
      this.el.kicker.textContent = `Ballon d'Or ${c.year} · Paris`;
      this.el.title.textContent = 'Welcome to the gala';
      this.el.desc.textContent = `${c.steps.length} awards tonight. The Ballon d'Or is presented last.`;
      this.el.noms.innerHTML = ''; this.el.rev.classList.remove('on');
      this.el.next.textContent = 'Begin ▸';
      this.screen(`BALLON D'OR ${c.year}`, 'The Gala', 'Théâtre du Châtelet · Paris');
    }
    next() {
      const st = this.cfg.steps[this.i];
      if (st && this.sub < this.maxSub(st)) { this.sub++; return this.reveal(st); }
      this.i++; this.sub = 0;
      if (this.i >= this.cfg.steps.length) return this.close();
      this.showNominees(this.cfg.steps[this.i]);
    }
    maxSub(st) { return st.podium ? 3 : 1; }
    showNominees(st) {
      this.clearFigs(); this.el.rev.classList.remove('on');
      this.el.kicker.textContent = `Ballon d'Or ${this.cfg.year} · Award ${this.i + 1} of ${this.cfg.steps.length}`;
      this.el.title.textContent = st.title; this.el.desc.textContent = st.desc;
      const list = st.podium ? st.podium.slice().sort(() => rnd() - 0.5) : st.nominees;
      this.el.noms.innerHTML = `<div class="gn-h">The nominees</div>${list.map((n) => `<div class="gn ${n.you ? 'you' : n.mine ? 'mine' : ''}"><strong>${esc(n.name)}</strong><span>${esc(n.club || '')}</span></div>`).join('')}`;
      this.el.next.textContent = st.podium ? 'Reveal 3rd place ▸' : 'Open the envelope ▸';
      this.screen(st.title.toUpperCase(), 'The nominees are…', list.map((n) => n.name.split(' ').slice(-1)[0]).join(' · '));
      this.camT = 0;
    }
    reveal(st) {
      const podium = !!st.podium;
      const place = podium ? 3 - this.sub + 1 : 1; // 3, 2, 1
      const w = podium ? st.podium[place - 1] : st.winner;
      this.el.noms.innerHTML = '';
      this.el.rev.classList.remove('on'); void this.el.rev.offsetWidth; this.el.rev.classList.add('on');
      this.el.lead.textContent = podium ? (place === 1 ? `And the ${this.cfg.year} Ballon d'Or goes to…` : `In ${place === 3 ? 'third' : 'second'} place…`) : 'And the winner is…';
      this.el.name.textContent = w.name;
      this.el.sub.textContent = `${w.club || ''}${st.detail && place === 1 ? ` · ${st.detail}` : ''}${w.you ? ' · 🎉 THAT\'S YOU!' : w.mine ? ' · ⭐ Your player' : ''}`;
      this.screen(podium ? (place === 1 ? "BALLON D'OR" : `${place === 2 ? '2ND' : '3RD'} PLACE`) : st.title.toUpperCase(), w.name, w.club || '');
      const x = podium ? (place === 1 ? 0 : place === 2 ? -2.6 : 2.6) : 0;
      const f = this.figure(w, x);
      if (f && place === 1) { f.trophy = makeTrophy(this.T, st.trophy === 'kopa' || st.trophy === 'yashin' || st.trophy === 'puskas' ? 'ballon' : st.trophy); if (st.trophy === 'yashin' || st.trophy === 'puskas') f.trophy.traverse((o) => { if (o.material && o.material.color) { o.material = o.material.clone(); o.material.color.set(0xe5e7eb); o.material.emissive && o.material.emissive.set(0x555555); } }); this.scene.add(f.trophy); f.lift = true; this.burst(); }
      this.el.next.textContent = podium && place > 1 ? `Reveal ${place === 3 ? '2nd place' : 'the winner'} ▸` : this.i + 1 >= this.cfg.steps.length ? 'Finish ▸' : 'Next award ▸';
      this.revT = this.t;
    }
    loop(now) {
      this.raf = requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt; const t = this.t;
      for (const f of this.figs) {
        const k = clamp((t - f.t0) / 1.6, 0, 1), e = k * k * (3 - 2 * k), r = f.h;
        r.root.position.x = f.x0 + (f.x - f.x0) * e;
        const walking = k < 1;
        r.root.rotation.y = walking ? (f.x > f.x0 ? 0 : Math.PI) : r.root.rotation.y + (-Math.PI / 2 - r.root.rotation.y) * Math.min(1, dt * 5);
        const ph = t * 8;
        r.legs.forEach((L, i) => { L.hip.rotation.z = walking ? Math.sin(ph + i * Math.PI) * 0.4 : 0; L.kn.rotation.z = walking ? -Math.max(0, Math.sin(ph + i * Math.PI + 1.9)) * 0.6 : -0.05; });
        const up = f.lift && !walking ? clamp((t - f.t0 - 1.6) / 0.8, 0, 1) : 0;
        r.arms.forEach((A, i) => { A.sh.rotation.z = walking ? Math.sin(ph + (i ? 0 : Math.PI)) * 0.35 : 0.1 + up * 2.8 + (f.lift ? 0 : Math.sin(t * 2 + i) * 0.05 + (i ? 0 : 0.3)); A.sh.rotation.x = A.s * (0.12 + up * 0.15); A.el.rotation.z = up ? 0.1 : 0.3; });
        if (f.trophy) {
          const th = r.root.rotation.y, sc = r.root.scale.y;
          const hx = r.root.position.x + Math.cos(th) * 0.3 * (1 - up) + Math.cos(th) * 0.12 * up, hz = r.root.position.z - Math.sin(th) * (0.3 * (1 - up) + 0.12 * up);
          f.trophy.position.set(hx, 1.0 + (1.15 + up * 0.85) * sc, hz); f.trophy.rotation.y = t * 0.6;
        }
      }
      for (let i = 0; i < this.beams.length; i++) { const b = this.beams[i]; b.rotation.z = Math.sin(t * 0.6 + i * 1.7) * 0.5; b.rotation.x = Math.cos(t * 0.5 + i) * 0.25; }
      this.bigBall.rotation.y = t * 0.3;
      for (let i = 0; i < this.cp.length; i++) { const c = this.cp[i]; if (c.y > -1) { c.y -= c.vy * dt; c.r += c.s * dt; c.x += Math.sin(t + c.ph) * 0.3 * dt; } this.dummy.position.set(c.x, c.y, c.z); this.dummy.rotation.set(c.r, c.r * 0.6, 0); this.dummy.updateMatrix(); this.conf.setMatrixAt(i, this.dummy.matrix); }
      this.conf.instanceMatrix.needsUpdate = true;
      // Camera: wide shot of the stage; pushes in on the winner.
      const focus = this.figs.length && this.revT != null && t - this.revT < 6;
      const tx = focus ? this.figs[this.figs.length - 1].x * 0.5 : Math.sin(t * 0.15) * 2, tz = focus ? 5.5 : 11 + Math.sin(t * 0.2);
      const ty = focus ? 2.6 : 4.2;
      this.cx = (this.cx ?? tx) + (tx - (this.cx ?? tx)) * Math.min(1, dt * 1.5); this.cz = (this.cz ?? tz) + (tz - (this.cz ?? tz)) * Math.min(1, dt * 1.5); this.cy = (this.cy ?? ty) + (ty - (this.cy ?? ty)) * Math.min(1, dt * 1.5);
      this.cam.position.set(this.cx, this.cy, this.cz); this.cam.lookAt(this.cx * 0.6, focus ? 2.2 : 3, -4);
      this.renderer.render(this.scene, this.cam);
    }
    close() {
      if (this.closed) return; this.closed = true;
      cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.onKey);
      if (this.resize) window.removeEventListener('resize', this.resize);
      if (this.renderer) this.renderer.dispose();
      this.root.remove(); document.body.classList.remove('m3d-open');
      this.cfg.onDone && this.cfg.onDone();
    }
  }

  window.SM3D = { start, celebrate, gala };
})();
