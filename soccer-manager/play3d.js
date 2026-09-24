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

  class Match {
    constructor(cfg, root) {
      this.cfg = cfg; this.root = root;
      this.T = window.THREE;
      this.total = (cfg.minutes || 5) * 60;
      this.t = 0; this.half = 1;
      this.score = [0, 0];
      this.goals = []; this.text = [];
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
          this.players.push({
            ...p, side, isGK: p.slot === 'GK',
            x: 0, z: 0, vx: 0, vz: 0, face: side === this.cfg.userSide ? 0 : Math.PI,
            spd: clamp(spd, 5, 8.4), cd: 0, stun: 0, tcd: 0, run: rnd() * 6, hold: 0,
          });
        }
      });
      this.ball = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, pass: null, shot: null, checked: false, lastSide: 0 };
      this.ctrl = this.teamMode ? this.players.find((p) => p.side === this.cfg.userSide && !p.isGK && p.slot === 'ST') || this.players.find((p) => p.side === this.cfg.userSide && !p.isGK)
        : this.players.find((p) => p.pid === this.cfg.controlPid);
      if (this.cfg.aiOnly) this.ctrl = null; // testing: both sides AI
    }
    aOf(p, x) { return this.dir[p.side] * x; } // "attacking" coordinate for p's team
    goalX(side) { return this.dir[side] * PL; }  // goal that `side` attacks

    initScene() {
      const T = this.T;
      const stage = this.root.querySelector('.m3d-stage');
      const r = this.renderer = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      stage.appendChild(r.domElement);
      const scene = this.scene = new T.Scene();
      scene.background = new T.Color(0x0a1410);
      scene.fog = new T.Fog(0x0a1410, 90, 190);
      this.cam = new T.PerspectiveCamera(42, 1, 0.5, 400);
      this.cam.position.set(0, 30, 50);
      scene.add(new T.HemisphereLight(0xdfefff, 0x1b3a22, 0.75));
      const sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(-30, 60, 40); scene.add(sun);

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
      pitch.rotation.x = -Math.PI / 2; scene.add(pitch);
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
      // Players
      const skin = new T.MeshLambertMaterial({ color: 0xd9a47a });
      const dark = new T.MeshLambertMaterial({ color: 0x111418 });
      const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
      const cols = this.teamColors();
      for (const p of this.players) {
        const grp = new T.Group();
        const kit = new T.MeshLambertMaterial({ color: p.isGK ? cols[p.side].gk : cols[p.side].kit });
        const shorts = new T.MeshLambertMaterial({ color: cols[p.side].shorts });
        const body = new T.Mesh(new T.CylinderGeometry(0.3, 0.26, 0.75, 10), kit); body.position.y = 1.2; grp.add(body);
        const sh = new T.Mesh(new T.CylinderGeometry(0.27, 0.27, 0.28, 10), shorts); sh.position.y = 0.72; grp.add(sh);
        const head = new T.Mesh(new T.SphereGeometry(0.19, 12, 10), skin); head.position.y = 1.78; grp.add(head);
        const legs = [];
        for (const lz of [-0.12, 0.12]) {
          const leg = new T.Group(); leg.position.set(0, 0.6, lz);
          const l = new T.Mesh(new T.CylinderGeometry(0.08, 0.07, 0.6, 6), skin); l.position.y = -0.3; leg.add(l);
          const boot = new T.Mesh(new T.BoxGeometry(0.22, 0.08, 0.1), dark); boot.position.set(0.04, -0.6, 0); leg.add(boot);
          grp.add(leg); legs.push(leg);
        }
        const shadow = new T.Mesh(new T.CircleGeometry(0.45, 14), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
        scene.add(shadow);
        scene.add(grp);
        p.mesh = grp; p.legs = legs; p.shadow = shadow;
      }
      const ball = new T.Mesh(new T.SphereGeometry(BR * 1.6, 16, 12), new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
      scene.add(ball); this.ballMesh = ball;
      const bs = new T.Mesh(new T.CircleGeometry(0.3, 12), shadowMat); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.021; scene.add(bs); this.ballShadow = bs;
      const ring = new T.Mesh(new T.RingGeometry(0.6, 0.85, 24), new T.MeshBasicMaterial({ color: 0xfacc15, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring); this.ring = ring;
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
      q('.m3d-keys').innerHTML = this.teamMode
        ? '<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> shoot (hold) / tackle · <b>E</b> pass · <b>Q</b> through ball / switch player · <b>R</b> lob / cross · <b>Esc</b> pause'
        : '<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> shoot (hold) / tackle · <b>E</b> pass / call for the ball · <b>Q</b> through ball · <b>R</b> lob / cross · <b>Esc</b> pause';
      this.hud = { sc: q('.m3d-sc'), clock: q('.m3d-clock'), msg: q('.m3d-msg'), power: q('.m3d-power'), bar: q('.m3d-power i'), radar: q('.m3d-radar'), menu: q('.m3d-menu') };
      this.cols = cols;
    }
    bind() {
      this.kd = (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k) || 'wasdeqr'.includes(k)) e.preventDefault();
        if (k === 'Escape' || k === 'p') { if (!this.over) this.paused ? this.resume() : this.showMenu('pause'); return; }
        this.keys[k] = true;
      };
      this.ku = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys[k] = false; };
      this.blur = () => { this.keys = {}; if (!this.paused && !this.over) this.showMenu('pause'); };
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
    }
    showMenu(kind) {
      this.paused = true;
      const m = this.hud.menu;
      m.classList.remove('hidden');
      const help = `<ul class="m3d-help">${this.teamMode
        ? '<li><b>W A S D</b> or arrows: move · <b>Shift</b>: sprint</li><li><b>Space</b>: hold to charge a shot, release to shoot. W/S while shooting aims at the far/near post. Without the ball: tackle.</li><li><b>E</b>: pass to the team-mate you are facing · <b>Q</b>: through ball (with the ball) or switch to the player nearest the ball</li><li><b>R</b>: lofted pass or cross</li>'
        : '<li><b>W A S D</b> or arrows: move · <b>Shift</b>: sprint. You only control yourself; your team-mates play on their own.</li><li><b>Space</b>: hold to charge a shot, release to shoot. Without the ball: tackle.</li><li><b>E</b>: pass, or call for the ball when a team-mate has it · <b>Q</b>: through ball · <b>R</b>: lofted pass / cross</li>'}</ul>`;
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
      Object.assign(b, { vx: 0, vy: 0, vz: 0, y: BR, owner: null, pass: null, shot: null, checked: false });
      let taker;
      if (kind === 'goalkick') {
        taker = this.players.find((p) => p.side === side && p.isGK);
        x = -this.dir[side] * (PL - 5); z = 0;
      } else {
        taker = this.players.filter((p) => p.side === side && !p.isGK).sort((a, c) => hyp(a.x - x, a.z - z) - hyp(c.x - x, c.z - z))[0];
      }
      b.x = x; b.z = z;
      taker.x = x - this.dir[side] * 0.5 * (kind === 'goalkick' ? -1 : 1); taker.z = z;
      this.giveBall(taker);
      taker.hold = kind === 'goalkick' ? 1.0 : 0.5;
      if (this.teamMode && side === this.cfg.userSide && !taker.isGK) this.ctrl = taker;
      this.phase = 'dead'; this.deadT = 0.9;
      const label = { throw: 'Throw-in', corner: 'Corner', goalkick: 'Goal kick' }[kind];
      this.flash(`${label} · ${this.cfg.teams[side].short || this.cfg.teams[side].name}`, 1.0);
      if (kind === 'corner') { this.st.corners[side]++; this.say('info', side, `Corner to ${this.cfg.teams[side].name}.`); }
    }
    giveBall(p) {
      const b = this.ball;
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
    release(p) { const b = this.ball; b.owner = null; p.cd = 0.35; b.last = p; b.lastSide = p.side; }
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
        const sc = cos * 12 - d * 0.18 + Math.min(open, 8) * 0.6 + (through ? this.aOf(p, rx) * 0.1 : 0);
        if (sc > bs) { bs = sc; best = m; }
      }
      return best;
    }
    doPass(p, m, kind) {
      const b = this.ball;
      const err = (1 - p.pas / 100) * (kind === 'lob' ? 0.12 : 0.07) + 0.01;
      let tx = m.x + m.vx * 0.5, tz = m.z + m.vz * 0.5;
      if (kind === 'through') { tx = m.x + this.dir[p.side] * 7; tz = m.z + clamp(-m.z * 0.15, -3, 3); }
      const d = hyp(tx - b.x, tz - b.z);
      this.kickTo(p, tx, tz, kind === 'lob' ? 30 : clamp(9 + d * 0.55, 10, 26), kind === 'lob', err);
      b.pass = { pid: p.pid, side: p.side, to: m, t: this.t };
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
      const speed = 17 + power * 15 + (p.sho - 60) * 0.06;
      const err = (1 - p.sho / 100) * 0.2 + 0.015 + power ** 3 * 0.04 + (dist > 16 ? (dist - 16) * 0.003 : 0);
      this.release(p);
      const t = dist / speed;
      const ang = Math.atan2(tz - b.z, gx - b.x) + gauss() * err;
      b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed;
      b.vy = clamp((ty - BR) / t + 0.5 * G * t + gauss() * err * 12, 0, 16);
      b.y = BR + 0.02;
      b.shot = { pid: p.pid, side: p.side, t: this.t }; b.checked = false; b.pass = null;
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
        // Dribble towards goal, veering away from the nearest defender.
        let tz = p.z * 0.75;
        if (pr.d < 6) tz += (p.z > pr.p.z ? 1 : -1) * 6;
        p.aim = { x: gx, z: clamp(tz, -30, 30) };
      }
      const a = p.aim || { x: gx, z: p.z };
      this.moveTo(p, a.x, a.z, dt, 0.92);
    }
    aiOffBall(p, dt, chasers) {
      const b = this.ball, poss = b.owner ? b.owner.side : b.pass ? b.pass.side : -1;
      if (p.isGK) return this.aiKeeper(p, dt);
      if (b.pass && b.pass.to === p) { const t = 0.3; return this.moveTo(p, b.x + b.vx * t, b.z + b.vz * t, dt, 1); }
      if (chasers.has(p)) {
        const o = b.owner;
        const tx = o ? o.x - this.dir[o.side] * 0.8 : b.x + b.vx * 0.25, tz = o ? o.z : b.z + b.vz * 0.25;
        this.moveTo(p, tx, tz, dt, 1.05);
        if (o && o.side !== p.side && p.tcd <= 0 && hyp(o.x - p.x, o.z - p.z) < 1.4) this.tackle(p, o);
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
    tackle(p, o) {
      p.tcd = 0.9;
      const pr = clamp(0.4 + (p.def - o.dri) / 70, 0.12, 0.85);
      if (rnd() < pr) {
        const b = this.ball; this.release(o); o.stun = 0.45; o.cd = 0.6;
        b.vx = (p.x - o.x) * 2 + this.dir[p.side] * 3 + gauss() * 2; b.vz = (p.z - o.z) * 2 + gauss() * 2;
        if (rnd() < 0.5) this.giveBall(p);
      } else { p.stun = 0.55; }
    }
    moveTo(p, tx, tz, dt, pace) {
      const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
      const max = p.spd * pace * (p.stun > 0 ? 0.25 : 1);
      const want = d < 0.4 ? 0 : Math.min(max, d * 2.2);
      const ux = d ? dx / d : 0, uz = d ? dz / d : 0;
      this.accel(p, ux * want, uz * want, dt);
    }
    accel(p, vx, vz, dt) {
      const k = Math.min(1, dt * 7);
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
      const { ix, iz } = this.input();
      const sprint = this.keys.Shift;
      const has = b.owner === p;
      const sp = p.spd * (sprint ? 1.3 : 1) * (has ? 0.92 : 1) * (p.stun > 0 ? 0.25 : 1);
      this.accel(p, ix * sp, iz * sp, dt);
      if (ix || iz) p.face = Math.atan2(iz, ix);
      const fdx = ix || Math.cos(p.face), fdz = iz || Math.sin(p.face);
      // Shooting: hold space to charge.
      if (has && this.keys[' ']) { this.charge = this.charge < 0 ? 0 : Math.min(1.15, this.charge + dt * 1.1); }
      else if (has && this.charge >= 0 && !this.keys[' ']) {
        const aim = iz ? iz * 2.9 : null;
        this.shoot(p, Math.min(1, this.charge), aim); this.charge = -1;
      } else if (!has) {
        this.charge = -1;
        if (this.pressed(' ')) {
          const o = b.owner;
          if (o && o.side !== p.side && hyp(o.x - p.x, o.z - p.z) < 2.2 && p.tcd <= 0) this.tackle(p, o);
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
      for (const p of this.players) { p.cd -= dt; p.stun -= dt; p.tcd -= dt; p.hold -= dt; }
      if (this.phase === 'dead') {
        this.deadT -= dt;
        for (const p of this.players) { p.vx *= 0.8; p.vz *= 0.8; }
        if (this.deadT <= 0) { if (this.after) { const f = this.after; this.after = null; f(); } else this.phase = 'play'; }
        this.stepBall(dt, true);
        return;
      }
      this.t += dt;
      if (this.half === 1 && this.t >= this.total / 2) {
        this.half = 2; this.say('ht', -1, `Half-time: ${cfg.teams[0].name} ${this.score[0]}-${this.score[1]} ${cfg.teams[1].name}`);
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
      for (const p of this.players) {
        if (p === this.ctrl && !p.isGK) continue;
        if (b.owner === p) this.aiCarrier(p, dt); else this.aiOffBall(p, dt, chasers);
      }
      this.user(dt);
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
        const tx = o.x + Math.cos(o.face) * 0.7, tz = o.z + Math.sin(o.face) * 0.7;
        const k = Math.min(1, dt * 12);
        b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = BR; b.vx = o.vx; b.vz = o.vz; b.vy = 0;
        return;
      }
      b.vy -= G * dt;
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
        const reach = 1.6 + (gk.gk - 60) * 0.03;
        const dz = Math.abs(b.z - gk.z), hi = b.y > 2.3;
        if (dz > reach + 0.6 || hi) continue;
        const sp = hyp(b.vx, b.vz);
        const pr = clamp(0.62 + (gk.gk - 72) / 45 + (reach - dz) / reach * 0.3 - (sp - 22) / 50, 0.12, 0.97);
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
        if (d >= bd) continue;
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
    nameOf(pid) { return this.players.find((p) => p.pid === pid)?.name || '—'; }
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
      this.goals.push({ min, side, pid, apid, og });
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
        <p class="muted small">Shots ${this.st.shots[0]}-${this.st.shots[1]} · On target ${this.st.sot[0]}-${this.st.sot[1]} · Possession ${this.st.poss[0]}%-${this.st.poss[1]}%</p>
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
      this.cfg.onDone({ score: this.score.slice(), goals: this.goals, pens: this.pens || null, st: this.st, text: this.text });
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
      window.removeEventListener('blur', this.blur); window.removeEventListener('resize', this.resize);
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
        p.mesh.rotation.y = -p.face;
        const sp = hyp(p.vx, p.vz), sw = Math.sin(p.run * 2.4) * Math.min(0.8, sp / 7);
        p.legs[0].rotation.z = sw; p.legs[1].rotation.z = -sw;
        p.shadow.position.set(p.x, 0.02, p.z);
      }
      this.ballMesh.position.set(b.x, b.y + BR * 0.6, b.z);
      this.ballMesh.rotation.z -= hyp(b.vx, b.vz) * dt * 3;
      this.ballShadow.position.set(b.x, 0.021, b.z);
      const c = this.ctrl;
      if (c) {
        this.ring.position.set(c.x, 0.03, c.z);
        this.arrow.position.set(c.x, 2.55 + Math.sin(performance.now() / 200) * 0.08, c.z);
        this.nameTag.position.set(c.x, 3.15, c.z);
        this.setLabel(c.name.split(' ').slice(-1)[0]);
      }
      // Broadcast camera: follows the ball from the near touchline.
      const tx = clamp(b.x * 0.9, -PL + 10, PL - 10), tz = clamp(b.z * 0.45, -12, 12);
      const cam = this.cam, k = Math.min(1, dt * 3);
      this.cx = (this.cx ?? tx) + (tx - (this.cx ?? tx)) * k;
      this.cz = (this.cz ?? tz) + (tz - (this.cz ?? tz)) * k;
      cam.position.set(this.cx, 21, this.cz + 31);
      cam.lookAt(this.cx, 0, this.cz - 2);
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

  window.SM3D = { start };
})();
