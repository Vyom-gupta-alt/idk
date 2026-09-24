/* Soccer Manager 26 — game engine + UI (vanilla JS, no build step). */
(() => {
  'use strict';

  const D = window.SM_DATA;
  const SAVE_KEY = 'sm26_career_v2';
  const WORLD_KEY = 'sm26_world_v1';
  const MAX_SQUAD = 32;
  const MIN_SQUAD = 16;

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = Math.random;
  const rand = () => rng();
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  function weighted(items, wFn) {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, wFn(it)); total += w; return w; });
    if (total <= 0) return items.length ? pick(items) : null;
    let r = rand() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function money(v) {
    const s = v < 0 ? '-' : '';
    v = Math.abs(v);
    if (v >= 1e9) return `${s}€${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${s}€${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
    if (v >= 1e4) return `${s}€${Math.round(v / 1e3)}K`;
    if (v >= 1e3) return `${s}€${+(v / 1e3).toFixed(1)}K`;
    return `${s}€${Math.round(v)}`;
  }
  function niceRound(v) {
    if (v < 1e5) return Math.round(v / 5e3) * 5e3;
    if (v < 1e6) return Math.round(v / 25e3) * 25e3;
    if (v < 1e7) return Math.round(v / 1e5) * 1e5;
    return Math.round(v / 5e5) * 5e5;
  }
  const ACCENTS = { 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'ł': 'l', 'Ł': 'l', 'đ': 'd', 'Đ': 'd', 'ß': 'ss', 'ı': 'i', 'ð': 'd', 'þ': 'th', 'œ': 'oe' };
  function norm(s) {
    return String(s ?? '')
      .replace(/[øØæÆłŁđĐßıðþœ]/g, (c) => ACCENTS[c])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function fmtDate(iso, long) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('en-GB', long
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  const seasonLabel = (y) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ *
   * Football rules: positions, formations, mentalities
   * ------------------------------------------------------------------ */
  const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
  const LINE = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'ATT', RW: 'ATT', ST: 'ATT' };
  const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i]));
  // Rating penalty when a player (key) plays in another position (inner key).
  const FIT = {
    GK: { GK: 0 },
    CB: { CB: 0, CDM: -6, RB: -7, LB: -7, RWB: -9, LWB: -9 },
    LB: { LB: 0, LWB: -1, RB: -5, RWB: -6, CB: -7, LM: -6, LW: -9 },
    RB: { RB: 0, RWB: -1, LB: -5, LWB: -6, CB: -7, RM: -6, RW: -9 },
    LWB: { LWB: 0, LB: -1, LM: -3, RWB: -5, RB: -6, LW: -6 },
    RWB: { RWB: 0, RB: -1, RM: -3, LWB: -5, LB: -6, RW: -6 },
    CDM: { CDM: 0, CM: -2, CB: -6, CAM: -8 },
    CM: { CM: 0, CDM: -3, CAM: -3, LM: -7, RM: -7 },
    CAM: { CAM: 0, CM: -3, LW: -5, RW: -5, ST: -6, LM: -6, RM: -6, CDM: -9 },
    LM: { LM: 0, LW: -1, RM: -3, RW: -4, LWB: -5, CM: -6, CAM: -6 },
    RM: { RM: 0, RW: -1, LM: -3, LW: -4, RWB: -5, CM: -6, CAM: -6 },
    LW: { LW: 0, LM: -1, RW: -3, RM: -4, ST: -5, CAM: -5, LWB: -10 },
    RW: { RW: 0, RM: -1, LW: -3, LM: -4, ST: -5, CAM: -5, RWB: -10 },
    ST: { ST: 0, LW: -6, RW: -6, CAM: -6 },
  };
  function fit(pos, slot) {
    if (pos === slot) return 0;
    const v = FIT[pos] && FIT[pos][slot];
    if (v !== undefined) return v;
    return pos === 'GK' || slot === 'GK' ? -45 : -16;
  }

  // Slot: [position, x%, y%] (y=0 is the opponent goal)
  const FORMATIONS = {
    '4-3-3': [['GK', 50, 91], ['LB', 13, 70], ['CB', 37, 75], ['CB', 63, 75], ['RB', 87, 70], ['CM', 28, 50], ['CDM', 50, 57], ['CM', 72, 50], ['LW', 16, 22], ['ST', 50, 14], ['RW', 84, 22]],
    '4-4-2': [['GK', 50, 91], ['LB', 13, 70], ['CB', 37, 75], ['CB', 63, 75], ['RB', 87, 70], ['LM', 13, 44], ['CM', 37, 50], ['CM', 63, 50], ['RM', 87, 44], ['ST', 37, 16], ['ST', 63, 16]],
    '4-2-3-1': [['GK', 50, 91], ['LB', 13, 70], ['CB', 37, 75], ['CB', 63, 75], ['RB', 87, 70], ['CDM', 37, 56], ['CDM', 63, 56], ['LW', 16, 33], ['CAM', 50, 36], ['RW', 84, 33], ['ST', 50, 13]],
    '4-1-2-1-2': [['GK', 50, 91], ['LB', 13, 70], ['CB', 37, 75], ['CB', 63, 75], ['RB', 87, 70], ['CDM', 50, 59], ['CM', 27, 47], ['CM', 73, 47], ['CAM', 50, 34], ['ST', 37, 15], ['ST', 63, 15]],
    '4-1-4-1': [['GK', 50, 91], ['LB', 13, 70], ['CB', 37, 75], ['CB', 63, 75], ['RB', 87, 70], ['CDM', 50, 59], ['LM', 13, 40], ['CM', 37, 44], ['CM', 63, 44], ['RM', 87, 40], ['ST', 50, 14]],
    '3-5-2': [['GK', 50, 91], ['CB', 25, 74], ['CB', 50, 77], ['CB', 75, 74], ['LWB', 10, 46], ['CM', 32, 51], ['CDM', 50, 58], ['CM', 68, 51], ['RWB', 90, 46], ['ST', 37, 16], ['ST', 63, 16]],
    '3-4-3': [['GK', 50, 91], ['CB', 25, 74], ['CB', 50, 77], ['CB', 75, 74], ['LM', 12, 46], ['CM', 38, 52], ['CM', 62, 52], ['RM', 88, 46], ['LW', 18, 21], ['ST', 50, 14], ['RW', 82, 21]],
    '5-3-2': [['GK', 50, 91], ['LWB', 9, 62], ['CB', 29, 74], ['CB', 50, 77], ['CB', 71, 74], ['RWB', 91, 62], ['CM', 27, 47], ['CM', 50, 51], ['CM', 73, 47], ['ST', 37, 16], ['ST', 63, 16]],
    '5-4-1': [['GK', 50, 91], ['LWB', 9, 62], ['CB', 29, 74], ['CB', 50, 77], ['CB', 71, 74], ['RWB', 91, 62], ['LM', 14, 40], ['CM', 38, 47], ['CM', 62, 47], ['RM', 86, 40], ['ST', 50, 14]],
  };
  const FORMATION_NAMES = Object.keys(FORMATIONS);
  const MENTALITY = {
    defensive: { label: 'Defensive', att: -2.5, def: 2.5, poss: -0.02 },
    balanced: { label: 'Balanced', att: 0, def: 0, poss: 0 },
    attacking: { label: 'Attacking', att: 2.5, def: -2.5, poss: 0.02 },
    allout: { label: 'All-out attack', att: 4.5, def: -5, poss: 0.03 },
  };
  // Team play styles (on top of mentality). Effects are applied in sideStrength() and the match engine.
  const STYLES = {
    balanced: { label: 'Balanced', desc: 'No special instructions. The team adapts to the game.' },
    tiki: { label: 'Tiki-taka', desc: 'Short passing and patience: much more possession, fewer but better chances. Works best with a strong midfield.', ctrl: 3, def: 0.5, rate: 0.9, shot: 0.08, goal: 0.03 },
    gegen: { label: 'Gegenpress', desc: 'Win the ball back high up the pitch: the opponent attacks less, you attack more, but you pick up more cards and leave space behind.', ctrl: 1.5, att: 1, def: -1.8, rate: 1.05, oppRate: 0.9, cards: 1.4 },
    counter: { label: 'Counter-attack', desc: 'Sit deep and break fast: less possession but dangerous chances when you win it back.', ctrl: -3, def: 2.5, rate: 0.85, shot: 0.12, goal: 0.06 },
    longball: { label: 'Long ball', desc: 'Go direct: lots of attacks of lower quality, and many more headers for tall strikers.', ctrl: -2, rate: 1.15, shot: -0.05, goal: -0.02, cross: 0.12 },
    wing: { label: 'Wing play', desc: 'Stretch the pitch and cross: wingers and full-backs create more, and strikers and centre-backs head goals.', rate: 1.05, cross: 0.1, wide: 1.5 },
    bus: { label: 'Park the bus', desc: 'Everyone behind the ball: very hard to break down, very little going forward.', ctrl: -3, att: -3, def: 5, rate: 0.75, oppShot: -0.12 },
  };
  // Player roles per position group. att/mid/def add to the team's lines; shoot/assist/head scale who takes shots,
  // creates and heads goals; cross adds crossing chances; card changes bookings.
  const ROLE_GROUPS = {
    GK: [['gk', 'Goalkeeper', {}], ['sk', 'Sweeper keeper', { def: 0.3, mid: 0.3 }]],
    CB: [['cd', 'Central defender', {}], ['bpd', 'Ball-playing defender', { mid: 0.5, def: -0.2 }], ['stp', 'Stopper', { def: 0.5, mid: -0.2, card: 1.3 }]],
    FB: [['fb', 'Full-back', {}], ['wb', 'Wing-back', { att: 0.3, assist: 1.5, cross: 0.4, def: -0.3 }], ['ifb', 'Inverted full-back', { mid: 0.5, def: 0.1, assist: 0.9 }], ['dfb', 'Defensive full-back', { def: 0.5, att: -0.2, assist: 0.7 }]],
    DM: [['hm', 'Holding midfielder', { def: 0.6, att: -0.2, shoot: 0.6 }], ['dlp', 'Deep-lying playmaker', { mid: 0.6, assist: 1.4, def: -0.1 }], ['bwm', 'Ball-winning midfielder', { def: 0.5, mid: 0.1, card: 1.4 }], ['anc', 'Anchor', { def: 0.8, att: -0.3, shoot: 0.4 }]],
    CM: [['b2b', 'Box-to-box', { att: 0.25, def: 0.25, shoot: 1.3 }], ['pm', 'Playmaker', { mid: 0.6, assist: 1.5, shoot: 0.8 }], ['mez', 'Mezzala', { att: 0.5, shoot: 1.5, def: -0.3 }], ['bwc', 'Ball-winning midfielder', { def: 0.5, card: 1.4, assist: 0.8 }], ['cm', 'Central midfielder', {}]],
    AM: [['ap', 'Advanced playmaker', { mid: 0.4, assist: 1.6 }], ['ss', 'Shadow striker', { att: 0.6, shoot: 1.7, assist: 0.8 }], ['cam', 'Attacking midfielder', {}]],
    W: [['w', 'Winger', { assist: 1.3, cross: 0.3 }], ['if', 'Inside forward (cuts in)', { att: 0.5, shoot: 1.7, assist: 0.8 }], ['cw', 'Cross specialist', { assist: 1.8, cross: 0.8, shoot: 0.7 }], ['wp', 'Wide playmaker', { mid: 0.4, assist: 1.5, shoot: 0.8 }], ['spd', 'Speedster (in behind)', { att: 0.4, shoot: 1.3 }]],
    ST: [['af', 'Advanced forward', { att: 0.3 }], ['poa', 'Poacher', { att: 0.3, shoot: 1.5, assist: 0.6, def: -0.1 }], ['tm', 'Target man', { head: 2.3, assist: 1.1, mid: -0.1 }], ['f9', 'False 9', { mid: 0.6, assist: 1.6, shoot: 0.8 }], ['pf', 'Pressing forward', { def: 0.3, att: 0.1, card: 1.2 }], ['cf', 'Complete forward', { att: 0.2, mid: 0.2, head: 1.4 }]],
  };
  const ROLE = {};
  for (const [g, list] of Object.entries(ROLE_GROUPS)) for (const [id, label, fx] of list) ROLE[id] = { id, label, fx, group: g };
  const roleGroup = (slot) => ({ GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', LM: 'W', RM: 'W', LW: 'W', RW: 'W', ST: 'ST' }[slot] || 'CM');
  const defaultRole = (slot) => ROLE_GROUPS[roleGroup(slot)][0][0];
  // A player's own preferred type (player career) is used whenever he plays in a matching position.
  const roleFor = (p, slot, chosen) => (p && p.role && ROLE[p.role]?.group === roleGroup(slot) ? p.role : chosen && ROLE[chosen]?.group === roleGroup(slot) ? chosen : defaultRole(slot));
  function clubStyle(club) {
    if (club.style) return club.style;
    const r = clubRating(club.id), h = [...club.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 3) / 997;
    const opts = r >= 80 ? ['tiki', 'gegen', 'balanced', 'wing'] : r >= 72 ? ['balanced', 'counter', 'wing', 'gegen'] : ['counter', 'longball', 'balanced', 'bus'];
    return (club.style = opts[Math.floor(h * opts.length)]);
  }
  const LEAGUE_MONEY = { ENG: 1.6, ESP: 1.15, ITA: 1.1, GER: 1.15, FRA: 0.9, POR: 0.5, NED: 0.5, ENG2: 0.45, ESP2: 0.25, ITA2: 0.25, GER2: 0.3, FRA2: 0.2, POR2: 0.1, NED2: 0.1 };
  const PROMOTED = 3; // clubs promoted and relegated between each pair of divisions

  /* ------------------------------------------------------------------ *
   * World (player database) creation
   * ------------------------------------------------------------------ */
  function newStats() { return { apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, rsum: 0, motm: 0, cs: 0 }; }

  // Hidden ceiling for development: young players have room to grow.
  function genPot(ovr, age) {
    const room = age <= 18 ? randInt(8, 18) : age <= 20 ? randInt(5, 14) : age <= 22 ? randInt(3, 9) : age <= 24 ? randInt(1, 5) : age <= 27 ? randInt(0, 2) : 0;
    return clamp(ovr + room, ovr, 95);
  }
  const niceWage = (w) => (w < 1e4 ? Math.round(w / 500) * 500 : w < 1e5 ? Math.round(w / 1000) * 1000 : Math.round(w / 5000) * 5000);
  // Weekly wage a player expects, based on OVR and age.
  function wageFor(p) {
    let w = 2000 + 2800 * Math.exp(0.155 * (p.ovr - 60));
    if (p.age <= 21) w *= 0.6; else if (p.age >= 30) w *= 1.1;
    return niceWage(w);
  }
  function ensureFields(p) {
    if (!p.st) p.st = newStats();
    for (const k of ['apps', 'goals', 'assists', 'yc', 'rc', 'rsum', 'motm', 'cs']) if (p.st[k] == null) p.st[k] = 0;
    for (const k of ['inj', 'sus', 'form']) if (p[k] == null) p[k] = 0;
    if (p.gen == null) p.gen = false;
    // Contract runs until the end of season `contract` (e.g. 2027 = June 2028).
    if (p.contract == null) p.contract = 2025 + (p.age <= 23 ? randInt(2, 5) : p.age >= 31 ? randInt(0, 2) : randInt(1, 4));
    if (p.pot == null) p.pot = genPot(p.ovr, p.age);
    if (p.xp == null) p.xp = 0;
    if (!p.wage) p.wage = wageFor(p);
    if (!p.cg) p.cg = {};
    if (p.ovr0 == null) p.ovr0 = p.ovr;
  }

  function addPlayer(W, { name, pos, ovr, age, clubId, gen }) {
    const id = 'p' + (W.nextId++);
    const p = { id, name, pos, ovr: clamp(Math.round(ovr), 30, 99), age: clamp(Math.round(age) || 25, 15, 45), clubId, gen: !!gen, form: 0, inj: 0, sus: 0, st: newStats() };
    ensureFields(p);
    W.players[id] = p;
    if (clubId && W.clubs[clubId]) W.clubs[clubId].pids.push(id);
    return p;
  }

  function parsePlayerString(str) {
    return String(str || '').split('|').map((s) => s.trim()).filter(Boolean).map((row) => {
      const [name, pos, ovr, age] = row.split(',').map((x) => x.trim());
      return { name, pos: POSITIONS.includes(pos) ? pos : 'CM', ovr: +ovr, age: +age };
    });
  }

  function genName(pool, taken) {
    const P = D.names[pool] || D.names.world;
    for (let i = 0; i < 20; i++) {
      const src = rand() < 0.72 ? P : D.names.world;
      const n = `${pick(src.first)} ${pick(src.last)}`;
      if (!taken || !taken.has(n)) { if (taken) taken.add(n); return n; }
    }
    return `${pick(P.first)} ${pick(P.last)} ${randInt(2, 99)}`;
  }

  function computeLevel(W, club) {
    const o = club.pids.map((id) => W.players[id].ovr).sort((a, b) => b - a).slice(0, 16);
    return o.length >= 6 ? Math.round(avg(o)) - 3 : (club.level || 66);
  }

  const SQUAD_NEEDS = [['GK', 2], ['CB', 4], ['LB', 1], ['RB', 1], [['CDM', 'CM'], 4], [['CAM', 'CM'], 1], [['LW', 'RW', 'LM', 'RM'], 2], ['ST', 2]];
  function fillSquad(W, club, minSize = 20) {
    const pool = (club.leagueId && W.leagues[club.leagueId]?.pool) || 'world';
    const taken = new Set(club.pids.map((id) => W.players[id].name));
    const empty = club.pids.length < 6;
    const lvl = club.level || 66;
    let stars = empty ? 3 : 0;
    const make = (pos) => {
      const academy = rand() < 0.3;
      let ovr = academy ? lvl - randInt(3, 9) : lvl + randInt(-5, 3);
      let age = academy ? randInt(17, 20) : randInt(21, 33);
      if (stars > 0) { ovr = lvl + randInt(4, 8); age = randInt(23, 30); stars--; }
      addPlayer(W, { name: genName(pool, taken), pos, ovr, age, clubId: club.id, gen: true });
    };
    const count = (ps) => club.pids.filter((id) => (Array.isArray(ps) ? ps : [ps]).includes(W.players[id].pos)).length;
    for (const [ps, n] of SQUAD_NEEDS) {
      let have = count(ps);
      while (have < n) { make(Array.isArray(ps) ? pick(ps) : ps); have++; }
    }
    const outfield = ['CB', 'LB', 'RB', 'CM', 'CDM', 'CAM', 'LW', 'RW', 'ST', 'CB', 'CM', 'ST'];
    while (club.pids.length < minSize) make(pick(outfield));
  }

  function genFreeAgents(W, n = 45) {
    const fa = W.clubs.FA;
    for (const id of fa.pids.slice()) delete W.players[id];
    fa.pids = [];
    const taken = new Set();
    const pools = Object.keys(D.names);
    for (let i = 0; i < n; i++) {
      const pos = pick(['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST']);
      const young = rand() < 0.45;
      const age = young ? randInt(17, 21) : randInt(24, 34);
      const ovr = young ? randInt(55, 72) : randInt(60, 77);
      addPlayer(W, { name: genName(pick(pools), taken), pos, ovr, age, clubId: 'FA', gen: true });
    }
  }

  function clubValue(W, club) {
    const vals = club.pids.map((id) => playerValue(W.players[id])).sort((a, b) => b - a).slice(0, 18);
    return vals.reduce((s, v) => s + v, 0);
  }
  function initialBudget(W, club) {
    const f = LEAGUE_MONEY[club.leagueId] ?? 0.8;
    return niceRound(clamp(clubValue(W, club) * 0.13 * Math.sqrt(f), 3e6, 220e6));
  }

  function buildWorld() {
    const saved = rng;
    rng = mulberry32(20252026);
    const W = { v: 1, nextId: 1, leagues: {}, leagueOrder: [], clubs: {}, players: {} };
    for (const L of D.leagues) {
      W.leagues[L.id] = { id: L.id, name: L.name, country: L.country, pool: L.pool, tier: L.tier || 1, parent: L.parent || null, clubIds: [] };
      W.leagueOrder.push(L.id);
      L.clubs.forEach((c, i) => {
        const id = `${L.id}-${i}`;
        const club = { id, name: c[0], short: c[1], leagueId: L.id, pids: [], level: c[3] || 0, budget: 0, formation: null };
        W.clubs[id] = club;
        W.leagues[L.id].clubIds.push(id);
        parsePlayerString(c[2]).forEach((pp) => addPlayer(W, { ...pp, clubId: id }));
      });
    }
    W.clubs.FA = { id: 'FA', name: 'Free Agents', short: 'FA', leagueId: null, pids: [], level: 66, budget: 0 };
    finalizeWorld(W);
    genFreeAgents(W);
    rng = saved;
    return W;
  }

  // Top up squads, compute levels & budgets. Safe to call repeatedly.
  // Real clubs only: not free agency, national teams or the youth academy.
  const isClub = (cl) => !!cl && cl.id !== 'FA' && !cl.nation && !cl.youth;
  function finalizeWorld(W) {
    for (const p of Object.values(W.players)) ensureFields(p);
    for (const club of Object.values(W.clubs)) {
      if (!isClub(club)) continue;
      club.level = club.pids.length >= 6 ? computeLevel(W, club) : (club.level || 66);
      fillSquad(W, club);
      if (!club.budget) club.budget = initialBudget(W, club);
    }
    ensureNations(W);
    if (!W.clubs.YTH) W.clubs.YTH = { id: 'YTH', name: 'Youth academy', short: 'YTH', leagueId: null, pids: [], level: 50, budget: 0, youth: true };
  }

  /* --- Nations: nationality of every player, national-team reserve pools, world ranking (Elo) --- */
  const NATIONS = Object.fromEntries((D.nations || []).map(([code, name, confed, base, pool]) => [code, { code, name, confed, base, pool }]));
  const natClubId = (code) => 'N-' + code;
  const POOL_NAT = { en: 'ENG', es: 'ESP', it: 'ITA', de: 'GER', fr: 'FRA', pt: 'POR', nl: 'NED' };
  let NAT_INDEX = null;
  function natIndex() {
    if (NAT_INDEX) return NAT_INDEX;
    const byName = new Map(), pinned = new Map();
    for (const [code, list] of Object.entries(D.natPlayers || {})) {
      for (const raw of list.split('|')) {
        const [nm, pin] = raw.split('@');
        if (pin === 'X') continue;
        const k = norm(nm);
        if (pin) pinned.set(k + '@' + pin, code);
        else if (!byName.has(k)) byName.set(k, code);
      }
    }
    return (NAT_INDEX = { byName, pinned });
  }
  function assignNat(W, p) {
    if (p.nat !== undefined) return;
    const idx = natIndex(), club = W.clubs[p.clubId], k = norm(p.name);
    let code = (club && idx.pinned.get(k + '@' + club.short)) || idx.byName.get(k) || null;
    if (!code && p.gen && club) code = POOL_NAT[club.natPool || W.leagues[club.leagueId]?.pool] || null;
    p.nat = code;
  }
  const NAT_SHAPE = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'CDM', 'CDM', 'CM', 'CM', 'CM', 'CM', 'CAM', 'CAM', 'LW', 'LW', 'RW', 'RW', 'ST', 'ST'];
  function ensureNations(W) {
    W.nations = W.nations || {};
    for (const n of Object.values(NATIONS)) {
      if (!W.nations[n.code]) W.nations[n.code] = { code: n.code, elo: Math.round(1500 + (n.base - 70) * 40), form: [] };
      const id = natClubId(n.code);
      if (!W.clubs[id]) W.clubs[id] = { id, name: n.name, short: n.code, leagueId: null, pids: [], level: n.base - 3, budget: 0, nation: n.code, natPool: n.pool };
    }
    for (const p of Object.values(W.players)) assignNat(W, p);
    // Nations without enough players in the database get generated players (from their domestic leagues).
    const counts = {};
    for (const p of Object.values(W.players)) if (p.nat && isClub(W.clubs[p.clubId])) counts[p.nat] = (counts[p.nat] || 0) + 1;
    for (const n of Object.values(NATIONS)) {
      const club = W.clubs[natClubId(n.code)];
      club.pids = club.pids.filter((id) => W.players[id]);
      const need = 23 - (counts[n.code] || 0) - club.pids.length;
      const taken = new Set();
      for (let i = 0; i < need; i++) {
        const pos = NAT_SHAPE[i % NAT_SHAPE.length];
        const p = addPlayer(W, { name: genName(n.pool, taken), pos, ovr: n.base - 3 + randInt(-4, 3), age: randInt(20, 32), clubId: club.id, gen: true });
        p.nat = n.code;
      }
    }
  }
  const eloOf = (clubId) => S.nations?.[S.clubs[clubId]?.nation]?.elo || 1500;

  /* ------------------------------------------------------------------ *
   * Player value & availability
   * ------------------------------------------------------------------ */
  function playerValue(p) {
    let v = 400000 * Math.exp(0.19 * (p.ovr - 60));
    const a = p.age;
    v *= a <= 19 ? 1.5 : a <= 21 ? 1.35 : a <= 24 ? 1.2 : a <= 27 ? 1 : a <= 29 ? 0.85 : a <= 31 ? 0.6 : a <= 33 ? 0.4 : 0.25;
    v *= { ST: 1.15, LW: 1.12, RW: 1.12, CAM: 1.1, CM: 1.05, CDM: 1.02, LM: 1.02, RM: 1.02, CB: 0.95, LB: 0.9, RB: 0.9, LWB: 0.9, RWB: 0.9, GK: 0.72 }[p.pos] || 1;
    // "How they play": current form and season match ratings move the price.
    v *= 1 + clamp(p.form || 0, -2, 2) * 0.05;
    if (p.st && p.st.apps >= 3) v *= clamp(1 + (p.st.rsum / p.st.apps - 6.7) * 0.15, 0.8, 1.25);
    return Math.max(10000, niceRound(v));
  }
  const avgRating = (p) => (p.st.apps ? p.st.rsum / p.st.apps : 0);
  const available = (p) => p && p.inj <= 0 && p.sus <= 0 && !p.away;
  // Fit for a player: learned positions count as natural; positions in training are partly learned.
  function pfit(p, slot) {
    if (p.pos === slot) return 0;
    let f = fit(p.pos, slot);
    if (!p.alt && !p.fam) return f;
    if (p.alt) for (const x of p.alt) { if (x === slot) return 0; f = Math.max(f, fit(x, slot)); }
    const fm = p.fam && p.fam[slot];
    return fm ? Math.round(f * (1 - fm / 100)) : f;
  }
  const eff = (p, slot) => Math.round(p.ovr + pfit(p, slot) + clamp(p.form || 0, -2, 2));

  /* ------------------------------------------------------------------ *
   * Team selection
   * ------------------------------------------------------------------ */
  function bestXI(pids, formation, opts = {}) {
    const slots = FORMATIONS[formation];
    const players = pids.map((id) => S.players[id]).filter((p) => p && (opts.ignoreAvail || available(p) || (opts.nat && p.inj <= 0)));
    const pairs = [];
    const bias = opts.bias || {};
    slots.forEach(([pos], si) => players.forEach((p) => pairs.push([eff(p, pos) + (bias[p.id] || 0), si, p.id])));
    pairs.sort((a, b) => b[0] - a[0]);
    const res = Array(slots.length).fill(null);
    const used = new Set();
    let filled = 0;
    for (const [, si, id] of pairs) {
      if (res[si] || used.has(id)) continue;
      res[si] = id; used.add(id);
      if (++filled === slots.length) break;
    }
    return res;
  }
  function xiScore(xi, formation) {
    const slots = FORMATIONS[formation];
    return avg(xi.map((id, i) => (id ? eff(S.players[id], slots[i][0]) : 30)));
  }
  function pickFormation(club) {
    let best = '4-3-3', bestScore = -1;
    for (const f of FORMATION_NAMES) {
      const sc = xiScore(bestXI(club.pids, f, { ignoreAvail: true }), f) + (f === '4-3-3' || f === '4-2-3-1' || f === '4-4-2' ? 0.4 : 0);
      if (sc > bestScore) { bestScore = sc; best = f; }
    }
    return best;
  }
  const ratingCache = new Map();
  function clubRating(clubId) {
    if (ratingCache.has(clubId)) return ratingCache.get(clubId);
    const club = S.clubs[clubId];
    const f = club.formation || '4-3-3';
    const xi = bestXI(club.nation ? club.squad || club.pids : club.pids, f, { ignoreAvail: true });
    const r = Math.round(avg(xi.filter(Boolean).map((id) => S.players[id].ovr)));
    ratingCache.set(clubId, r);
    return r;
  }
  const invalidate = () => ratingCache.clear();

  /* ------------------------------------------------------------------ *
   * Match engine
   * ------------------------------------------------------------------ */
  const COMM = {
    kickoff: ["We're underway! {home} get the ball rolling against {away}.", 'Kick-off! {home} vs {away} — here we go.', 'The referee blows the whistle and {home} take on {away}.'],
    buildup: ['{p} drives forward through midfield.', '{t} knock it around patiently, {p} probing for an opening.', '{p} switches play out wide.', 'Neat one-two between {p} and {a}.', '{t} press high and win it back through {p}.', '{p} dances past one challenge, then another...'],
    blocked: ["{p}'s effort is blocked by {d}.", '{d} gets across to snuff out the danger from {p}.', 'Last-ditch tackle from {d} denies {p}!', '{p} tries to thread it through, but {d} reads it.', '{d} throws his body in the way of {p}\'s shot.'],
    miss: ['{p} fires over the bar from the edge of the box.', '{p} drags a shot wide of the far post.', "So close! {p}'s curler drifts just past the upright.", '{p} snatches at it and the chance is gone.', '{p} lets fly from 25 yards — well wide.', '{p} gets a head to it but it loops over.'],
    woodwork: ['{p} smashes one against the crossbar!', 'OFF THE POST! {p} was inches away!', '{p} rattles the woodwork — {gk} was beaten!'],
    save: ["Great save! {gk} tips {p}'s drive round the post.", "{gk} gets down well to hold {p}'s low shot.", '{p} forces a sharp stop from {gk}.', '{gk} stands tall to deny {p} one-on-one!', "Fingertip save from {gk} to keep out {p}'s header.", '{p} tests {gk} from range — comfortable save.'],
    goal: ['GOAL! {p} finds the bottom corner!', 'GOAL!! {p} smashes it into the roof of the net!', '{p} slots it home calmly — GOAL for {t}!', 'WHAT A STRIKE! {p} from distance!', 'GOAL! {p} rounds {gk} and walks it in!', 'GOAL! {p} bundles it over the line at the back post!'],
    header: ['GOAL! {p} rises highest from the corner and heads it in!', 'GOAL! {p} flicks the corner into the far corner!'],
    assist: [' Superb ball from {a}.', ' {a} with the assist.', ' Brilliant work from {a} to set it up.', ' {a} picked him out perfectly.'],
    penAward: ['PENALTY to {t}! {d} brings down {p} in the box.', 'The referee points to the spot! {d} clips {p}.'],
    penGoal: ['{p} steps up... and sends {gk} the wrong way! GOAL!', '{p} buries the penalty into the top corner! GOAL!'],
    penMiss: ['{p} steps up... SAVED by {gk}!', '{p} blazes the penalty over the bar!'],
    corner: ['Corner to {t}.', '{t} win a corner on the {side}.'],
    yellow: ['Yellow card for {p} after a cynical foul.', '{p} goes into the book for a late challenge.', '{p} is booked for dissent.', 'Yellow for {p} — that was a clumsy tackle.'],
    second: ['Second yellow for {p}! {t} are down to {n} men!'],
    red: ['RED CARD! {p} is sent off for a reckless lunge! {t} down to {n}.'],
    injury: ['{p} goes down injured and can\'t continue. {s} comes on.', 'Bad news for {t}: {p} is hurt and replaced by {s}.'],
    r_if: ['GOAL! {p} cuts inside onto his stronger foot and curls it into the far corner!', 'GOAL! {p} drifts in off the wing and bends one past {gk}!'],
    r_poa: ['GOAL! {p} is in the right place at the right time: a simple tap-in!', 'GOAL! {p} pounces on the loose ball six yards out!'],
    r_tm: ['GOAL! {p} wins the aerial duel and heads it in!', 'GOAL! {p} holds off his marker and smashes it home!'],
    r_ss: ['GOAL! {p} arrives late in the box, unmarked, and finishes!'],
    r_mez: ['GOAL! {p} bursts forward from midfield and fires in!'],
    r_b2b: ['GOAL! {p} gallops box to box and finishes off the move!'],
    r_f9: ['GOAL! {p} drops deep, plays a one-two and dinks it over {gk}!'],
    r_spd: ['GOAL! {p} runs in behind the defence and slots it past {gk}!'],
    r_wb: ['GOAL! Wing-back {p} gets forward and scores!'],
    injuryNoSub: ['{p} is injured and {t} have nobody left to bring on — down to {n}.'],
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
  const T = (key, v) => fill(pick(COMM[key]), v);

  function buildSide(clubId, userSide) {
    const club = S.clubs[clubId];
    let formation, ids, mentality;
    const car = S.career;
    // In a player career the club is run by the AI, which gives your player a little extra trust.
    const favor = car && car.mode === 'player' && car.clubId === clubId ? car.pid : null;
    let style = 'balanced', roles = [];
    if (userSide && !favor) {
      formation = C().formation; ids = matchLineup().ids; mentality = C().mentality;
      style = C().style || 'balanced'; roles = C().roles || [];
    } else {
      style = clubStyle(club);
      if (!club.formation) club.formation = pickFormation(club);
      formation = club.formation; ids = bestXI(club.nation ? club.squad || [] : club.pids, formation, { bias: favor ? { [favor]: 3 } : null, nat: !!club.nation }); mentality = 'balanced';
    }
    const slots = FORMATIONS[formation];
    const xi = [];
    ids.forEach((id, i) => { if (id) xi.push({ pid: id, slot: slots[i][0], si: i, role: roleFor(S.players[id], slots[i][0], roles[i]) }); });
    const bench = (club.nation ? club.squad || [] : club.pids).filter((id) => !ids.includes(id) && (club.nation ? S.players[id]?.inj <= 0 : available(S.players[id])))
      .sort((a, b) => (S.players[b].ovr + (b === favor ? 20 : 0)) - (S.players[a].ovr + (a === favor ? 20 : 0))).slice(0, 9);
    return { clubId, name: club.name, short: club.short, formation, mentality, style, xi, bench };
  }

  function sideStrength(side, home) {
    const L = { GK: [], DEF: [], MID: [], ATT: [] };
    const all = [];
    for (const x of side.xi) { const e = eff(S.players[x.pid], x.slot); L[LINE[x.slot]].push(e); all.push(e); }
    const down = 11 - side.xi.length;
    const gk = L.GK.length ? L.GK[0] : 35;
    const def = (L.DEF.length ? avg(L.DEF) : 40) + (L.DEF.length - 4) * 1.5;
    const mid = (L.MID.length ? avg(L.MID) : 40) + (L.MID.length - 4) * 1.5;
    const att = L.ATT.length ? avg(L.ATT) + (L.ATT.length - 2) * 1.5 : mid - 5;
    const m = MENTALITY[side.mentality] || MENTALITY.balanced;
    const sty = STYLES[side.style] || STYLES.balanced;
    const ha = home ? 1.5 : 0;
    // Roles shift the team's balance a little.
    const rf = { att: 0, mid: 0, def: 0 };
    for (const x of side.xi) { const fx = ROLE[x.role]?.fx || {}; rf.att += fx.att || 0; rf.mid += fx.mid || 0; rf.def += fx.def || 0; }
    // Tiki-taka needs technicians: its control bonus scales with midfield quality.
    const ctrl = (sty.ctrl || 0) * (side.style === 'tiki' ? clamp((mid - 66) / 14, 0.2, 1.2) : 1);
    return {
      attack: 0.65 * att + 0.35 * mid + m.att + (sty.att || 0) + rf.att * 0.8 - down * 4 + ha,
      defense: 0.7 * def + 0.3 * mid + m.def + (sty.def || 0) + rf.def * 0.8 - down * 3 + ha * 0.7,
      control: mid + ctrl + rf.mid * 0.6 - down * 4 + ha,
      possBias: m.poss,
      gk, ovr: avg(all), att, mid, def,
    };
  }

  const SHOOT_W = { ST: 3.8, LW: 3, RW: 3, CAM: 2.6, LM: 2.2, RM: 2.2, CM: 1.6, CDM: 0.6, LWB: 0.7, RWB: 0.7, LB: 0.5, RB: 0.5, CB: 0.45, GK: 0 };
  const ASSIST_W = { CAM: 4, LW: 3.5, RW: 3.5, LM: 3, RM: 3, CM: 2.5, ST: 2, LWB: 2, RWB: 2, LB: 1.5, RB: 1.5, CDM: 1.2, CB: 0.4, GK: 0.05 };
  const HEAD_W = { CB: 3, ST: 3, CDM: 1, CM: 0.8, LB: 0.4, RB: 0.4, LWB: 0.4, RWB: 0.4, CAM: 0.5, LW: 0.5, RW: 0.5, LM: 0.4, RM: 0.4, GK: 0 };

  function simulateMatch(H, A, withText, opts = {}) {
    const sides = [H, A];
    const text = withText ? [] : null;
    const goals = [];
    const score = [0, 0];
    const st = { poss: [0, 0], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], rc: [0, 0] };
    const pm = {};
    const addPM = (pid, side, slot, on) => { pm[pid] = { side, slot, on, g: 0, a: 0, yc: 0, rc: 0, inj: 0, saves: 0 }; };
    sides.forEach((s, i) => s.xi.forEach((x) => addPM(x.pid, i, x.slot, 0)));
    // Performance on the day: even great teams have off days.
    const day = [(rand() - 0.5) * 7, (rand() - 0.5) * 7];
    const withDay = (s, d) => ({ ...s, attack: s.attack + d, defense: s.defense + d, control: s.control + d * 0.6 });
    let str;
    const recalc = () => { str = [withDay(sideStrength(H, !opts.neutral), day[0]), withDay(sideStrength(A, false), day[1])]; };
    recalc();
    const nm = (id) => S.players[id]?.name ?? '—';
    let lbl = '0';
    // Timeline for the 2D match view: one entry per simulated minute.
    const tl = withText ? [] : null;
    let ticks = 0, tickEv = 0;
    const PRI = { 3: 9, 8: 9, 9: 7, 2: 6, 6: 5, 1: 4, 7: 3, 4: 2, 5: 1 };
    const mark = (code) => { if ((PRI[code] || 0) > (PRI[tickEv] || 0)) tickEv = code; };
    const say = (type, side, msg, extra) => { if (text) text.push({ lbl, type, side, text: msg, score: score.slice(), i: ticks, ...(extra || {}) }); };
    const effOf = (pid) => eff(S.players[pid], pm[pid].slot);
    const gkOf = (t) => sides[t].xi.find((x) => x.slot === 'GK')?.pid;
    // Trained attribute points above a player's natural level (training focus).
    const tbon = (pid, k) => { const tb = S.players[pid]?.tb; return tb && tb[k] ? tb[k] * 0.6 : 0; };
    const onLine = (t, line) => sides[t].xi.filter((x) => LINE[x.slot] === line).map((x) => x.pid);
    const anyOf = (t, line) => { const l = onLine(t, line); return l.length ? pick(l) : pick(sides[t].xi)?.pid; };
    const sty = [STYLES[H.style] || STYLES.balanced, STYLES[A.style] || STYLES.balanced];
    const roleOf = (t, pid) => sides[t].xi.find((x) => x.pid === pid)?.role;
    const pickW = (t, W, pow, excl, key) => {
      const c = sides[t].xi.filter((x) => x.pid !== excl);
      const wide = key === 'assist' && sty[t].wide;
      const x = weighted(c, (x) => (W[x.slot] ?? 0.3) * Math.pow(Math.max(30, eff(S.players[x.pid], x.slot)) / 70, pow)
        * (key ? (ROLE[x.role]?.fx[key] ?? 1) : 1) * (wide && ['LW', 'RW', 'LM', 'RM', 'LB', 'RB', 'LWB', 'RWB'].includes(x.slot) ? sty[t].wide : 1));
      return x ? x.pid : null;
    };
    // Chance that an attack ends with a cross met by a header (wing play, long ball, crossers, target men).
    const crossChance = (t) => clamp((sty[t].cross || 0) + sides[t].xi.reduce((a, x) => a + (ROLE[x.role]?.fx.cross || 0) * 0.08, 0) + 0.05, 0, 0.4);

    function goal(t, pid, apid, kind) {
      mark(kind === 'pen' ? 8 : 3);
      score[t]++;
      pm[pid].g++;
      if (apid) pm[apid].a++;
      goals.push({ lbl, side: t, pid, apid: apid || null, pen: kind === 'pen' });
      const v = { p: nm(pid), a: nm(apid), t: sides[t].name, gk: nm(gkOf(1 - t)) };
      const rl = roleOf(t, pid);
      let msg = kind === 'pen' ? T('penGoal', v) : kind === 'header' ? T('header', v) : kind === 'cross' ? `GOAL! ${v.a} whips in a cross and ${v.p} powers a header home!` : COMM['r_' + rl] && rand() < 0.7 ? T('r_' + rl, v) : T('goal', v);
      if (apid && kind !== 'pen' && kind !== 'cross') msg += T('assist', v);
      say('goal', t, `${msg} ${H.short} ${score[0]}-${score[1]} ${A.short}`);
    }
    function corner(t) {
      st.corners[t]++;
      mark(4);
      if (rand() < 0.25) say('info', t, T('corner', { t: sides[t].name, side: pick(['left', 'right']) }));
      const r = rand();
      if (r < 0.045 * (sty[t].cross ? 1.4 : 1)) {
        const pid = pickW(t, HEAD_W, 3, null, 'head');
        const apid = pickW(t, ASSIST_W, 2, pid, 'assist');
        if (pid) { st.shots[t]++; st.sot[t]++; goal(t, pid, apid, 'header'); }
      } else if (r < 0.15) {
        const pid = pickW(t, HEAD_W, 3, null, 'head');
        if (!pid) return;
        st.shots[t]++;
        if (rand() < 0.4) {
          st.sot[t]++;
          const g = gkOf(1 - t); if (g) pm[g].saves++;
          mark(2);
          say('chance', t, T('save', { p: nm(pid), gk: nm(g) }));
        } else { mark(1); say('chance', t, T('miss', { p: nm(pid) })); }
      }
    }
    function penalty(t) {
      const o = 1 - t;
      const fouled = pickW(t, SHOOT_W, 3, null, 'shoot');
      const d = anyOf(o, 'DEF');
      say('chance', t, T('penAward', { t: sides[t].name, p: nm(fouled), d: nm(d) }));
      const taker = sides[t].xi.filter((x) => x.slot !== 'GK').sort((a, b) => effOf(b.pid) - effOf(a.pid))[0]?.pid;
      if (!taker) return;
      st.shots[t]++;
      const gk = gkOf(o);
      if (rand() < clamp(0.76 + (effOf(taker) - str[o].gk) / 120, 0.6, 0.9)) { st.sot[t]++; goal(t, taker, null, 'pen'); }
      else { mark(9); if (gk && rand() < 0.6) { st.sot[t]++; pm[gk].saves++; } say('chance', t, T('penMiss', { p: nm(taker), gk: nm(gk) })); }
    }
    function attack(t) {
      const o = 1 - t;
      const diff = str[t].attack - str[o].defense;
      if (rand() > clamp(0.56 + diff / 110 + (sty[t].shot || 0) + (sty[o].oppShot || 0), 0.3, 0.8)) {
        const r = rand();
        if (r < 0.14) {
          mark(7);
          const p = pickW(t, SHOOT_W, 3, null, 'shoot'); const d = anyOf(o, 'DEF');
          if (p && d) say('info', t, T('blocked', { p: nm(p), d: nm(d) }));
        } else if (r < 0.22) {
          const p = pickW(t, ASSIST_W, 2, null, 'assist'); const a = pickW(t, ASSIST_W, 2, p, 'assist');
          if (p) say('info', t, T('buildup', { p: nm(p), a: nm(a), t: sides[t].name }));
        }
        if (rand() < 0.12) corner(t);
        return;
      }
      if (rand() < 0.012) { penalty(t); return; }
      // Cross into the box, met with a header.
      if (rand() < crossChance(t)) {
        const hd = pickW(t, HEAD_W, 3, null, 'head');
        const cr = pickW(t, ASSIST_W, 2, hd, 'assist');
        if (hd && cr) {
          st.shots[t]++;
          const he = effOf(hd) - 4 + tbon(hd, 'PHY');
          if (rand() < clamp(0.36 + (he - 75) / 90, 0.2, 0.5)) {
            st.sot[t]++;
            if (rand() < clamp(0.3 + (he - str[o].gk) / 120, 0.12, 0.45)) { goal(t, hd, cr, 'cross'); return; }
            const g = gkOf(o); if (g) pm[g].saves++;
            mark(2);
            say('chance', t, `${nm(cr)} whips in a cross, ${nm(hd)} heads it goalwards... saved by ${nm(g)}!`);
          } else { mark(1); if (rand() < 0.6) say('chance', t, `${nm(cr)} crosses from the ${pick(['left', 'right'])}, but ${nm(hd)} heads over.`); }
          if (rand() < 0.2) corner(t);
          return;
        }
      }
      const sh = pickW(t, SHOOT_W, 3, null, 'shoot');
      if (!sh) return;
      const se = effOf(sh) + tbon(sh, 'SHO');
      st.shots[t]++;
      if (rand() > clamp(0.38 + (se - 75) / 90, 0.25, 0.55)) {
        if (rand() < 0.07) { mark(6); say('chance', t, T('woodwork', { p: nm(sh), gk: nm(gkOf(o)) })); }
        else { mark(1); if (rand() < 0.5) say('chance', t, T('miss', { p: nm(sh) })); }
        if (rand() < 0.15) corner(t);
        return;
      }
      st.sot[t]++;
      if (rand() < clamp(0.32 + (se - str[o].gk) / 120 + diff / 400 + (sty[t].goal || 0), 0.14, 0.52)) {
        goal(t, sh, rand() < 0.72 ? pickW(t, ASSIST_W, 3, sh, 'assist') : null, 'open');
      } else {
        const g = gkOf(o); if (g) pm[g].saves++;
        mark(2);
        say('chance', t, T('save', { p: nm(sh), gk: nm(g) }));
        if (rand() < 0.35) corner(t);
      }
    }
    function sendOff(t, pid) {
      const side = sides[t];
      side.xi = side.xi.filter((x) => x.pid !== pid);
      st.rc[t]++;
      pm[pid].rc = 1;
      // Lost the keeper: an outfielder goes in goal.
      if (!side.xi.some((x) => x.slot === 'GK') && side.xi.length) {
        const sub = side.bench.find((id) => S.players[id].pos === 'GK');
        const victim = side.xi.filter((x) => LINE[x.slot] === 'ATT')[0] || side.xi[side.xi.length - 1];
        if (sub) {
          side.bench = side.bench.filter((id) => id !== sub);
          side.xi = side.xi.filter((x) => x !== victim);
          side.xi.push({ pid: sub, slot: 'GK' });
          addPM(sub, t, 'GK', 1);
          say('info', t, `${side.name} bring on ${nm(sub)} in goal, ${nm(victim.pid)} makes way.`, { pid: victim.pid, gone: 1 });
        } else victim.slot = 'GK';
      }
      recalc();
    }
    function card(t) {
      const cands = sides[t].xi.filter((x) => x.slot !== 'GK');
      const x = weighted(cands, (x) => ({ DEF: 3, MID: 2.5, ATT: 1.2 }[LINE[x.slot]] || 1) * (ROLE[x.role]?.fx.card || 1));
      if (!x) return;
      const r = pm[x.pid];
      mark(5);
      if (rand() < 0.02) {
        say('red', t, T('red', { p: nm(x.pid), t: sides[t].name, n: sides[t].xi.length - 1 }), { pid: x.pid });
        sendOff(t, x.pid);
      } else if (r.yc) {
        r.yc++; st.yc[t]++;
        say('red', t, T('second', { p: nm(x.pid), t: sides[t].name, n: sides[t].xi.length - 1 }), { pid: x.pid });
        sendOff(t, x.pid);
      } else {
        r.yc = 1; st.yc[t]++;
        say('yellow', t, T('yellow', { p: nm(x.pid) }));
      }
    }
    function injury(t) {
      const side = sides[t];
      const x = weighted(side.xi, (x) => (x.slot === 'GK' ? 0.2 : 1));
      if (!x) return;
      pm[x.pid].inj = pick([1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 8, 10]);
      let best = null, be = -99;
      for (const id of side.bench) { const e = eff(S.players[id], x.slot); if (e > be) { be = e; best = id; } }
      if (best && (side.subs || 0) < 5) {
        side.subs = (side.subs || 0) + 1;
        side.bench = side.bench.filter((id) => id !== best);
        const off = x.pid;
        x.pid = best;
        addPM(best, t, x.slot, 1);
        say('injury', t, T('injury', { p: nm(off), s: nm(best), t: side.name }), { pid: best, off });
      } else {
        side.xi = side.xi.filter((y) => y !== x);
        say('injury', t, T('injuryNoSub', { p: nm(x.pid), t: side.name, n: side.xi.length }), { pid: x.pid, gone: 1 });
      }
      recalc();
    }

    const agg = opts.agg || [0, 0];
    const tot = (i) => score[i] + agg[i];
    // Tactical substitutions: the weakest (or most tired) player makes way for a fresher one.
    function tacticalSub(t, m) {
      const side = sides[t];
      if ((side.subs || 0) >= 5 || !side.bench.length) return;
      const cands = side.xi.filter((x) => x.slot !== 'GK');
      if (!cands.length) return;
      let out = null, inn = null;
      const fav = opts.favor;
      if (fav && side.bench.includes(fav) && rand() < 0.6) {
        const fp = S.players[fav];
        let be = -99;
        for (const x of cands) { const g = eff(fp, x.slot) - effOf(x.pid); if (pfit(fp, x.slot) >= -3 && g > be) { be = g; out = x; } }
        if (out) inn = fav;
      }
      if (!out) {
        out = cands.slice().sort((a, b) => (effOf(a.pid) + rand() * 6) - (effOf(b.pid) + rand() * 6))[0];
        let be = -99;
        for (const id of side.bench) { const e = eff(S.players[id], out.slot); if (e > be) { be = e; inn = id; } }
        if (!inn || be < effOf(out.pid) - 4) return;
      }
      side.subs = (side.subs || 0) + 1;
      side.bench = side.bench.filter((id) => id !== inn);
      const off = out.pid;
      out.pid = inn;
      out.role = roleFor(S.players[inn], out.slot, out.role);
      addPM(inn, t, out.slot, m);
      say('sub', t, `🔁 ${side.name}: ${nm(inn)} comes on for ${nm(off)}.`, { pid: inn, off });
      recalc();
    }
    function minute(m) {
      tickEv = 0;
      let attacked = false;
      if (m === 60 || m === 70 || m === 80) for (const t of [0, 1]) if (rand() < 0.75) tacticalSub(t, m);
      const c0 = Math.pow(Math.max(1, str[0].control), 3), c1 = Math.pow(Math.max(1, str[1].control), 3);
      let pH = c0 / (c0 + c1) + str[0].possBias - str[1].possBias;
      if (m >= 65) { if (tot(0) < tot(1)) pH += 0.07; else if (tot(0) > tot(1)) pH -= 0.07; }
      pH = clamp(pH, 0.22, 0.78);
      const t = rand() < pH ? 0 : 1;
      st.poss[t]++;
      if (rand() < 0.3 * (sty[t].rate || 1) * (sty[1 - t].oppRate || 1)) { attacked = true; attack(t); }
      const shotEv = [1, 2, 3, 6, 8, 9].includes(tickEv);
      for (const side of [0, 1]) if (rand() < 0.017 * (sty[side].cards || 1)) card(side);
      if (rand() < 0.0024) injury(rand() < 0.5 ? 0 : 1);
      if (tl) tl.push([t, shotEv ? 3 : attacked ? 2 : rand() < 0.3 ? 0 : rand() < 0.65 ? 1 : 2, tickEv, lbl]);
      ticks++;
    }
    function shootout() {
      lbl = 'PENS';
      say('ht', -1, 'We are going to penalties!');
      const takers = [0, 1].map((t) => sides[t].xi.filter((x) => x.slot !== 'GK').sort((a, b) => effOf(b.pid) - effOf(a.pid)).map((x) => x.pid));
      const sc = [0, 0];
      const kick = (t, k) => {
        const list = takers[t];
        if (!list.length) return;
        const pid = list[k % list.length];
        const ok = rand() < clamp(0.76 + (effOf(pid) - str[1 - t].gk) / 150, 0.6, 0.9);
        if (ok) sc[t]++;
        say(ok ? 'info' : 'chance', t, `${nm(pid)} ${ok ? 'scores' : pick(['misses!', 'is saved by ' + nm(gkOf(1 - t)) + '!', 'hits the post!'])} (${sc[0]}-${sc[1]})`);
      };
      let k = 0;
      for (; k < 5; k++) {
        kick(0, k);
        if (sc[0] > sc[1] + (5 - k) || sc[1] > sc[0] + (5 - k - 1)) break;
        kick(1, k);
        if (sc[0] > sc[1] + (5 - k - 1) || sc[1] > sc[0] + (5 - k - 1)) break;
      }
      while (sc[0] === sc[1] && k < 30) { k++; kick(0, k); kick(1, k); }
      return sc;
    }

    say('info', -1, T('kickoff', { home: H.name, away: A.name }) + (opts.neutral ? ' (neutral venue)' : ''));
    if (opts.agg) say('info', -1, `First leg: ${A.name} ${agg[1]}-${agg[0]} ${H.name}.`);
    const extra = [randInt(1, 3), randInt(2, 6)];
    for (let half = 0; half < 2; half++) {
      const base = half ? 45 : 0;
      const len = 45 + extra[half];
      for (let k = 1; k <= len; k++) {
        lbl = k > 45 ? `${base + 45}+${k - 45}` : String(base + k);
        minute(base + k);
      }
      if (!half) { lbl = 'HT'; say('ht', -1, `Half-time: ${H.name} ${score[0]}-${score[1]} ${A.name}`); }
    }
    let et = false, pens = null, w = null;
    if (opts.ko) {
      if (tot(0) === tot(1)) {
        et = true;
        lbl = '90';
        say('ht', -1, `End of normal time: ${H.name} ${score[0]}-${score[1]} ${A.name}${opts.agg ? ` (aggregate ${tot(0)}-${tot(1)})` : ''}. Extra time!`);
        for (let m = 91; m <= 120; m++) {
          lbl = String(m);
          minute(m);
          if (m === 105) say('ht', -1, `Extra-time half-time: ${H.name} ${score[0]}-${score[1]} ${A.name}`);
        }
        if (tot(0) === tot(1)) pens = shootout();
      }
      w = pens ? (pens[0] > pens[1] ? 0 : 1) : (tot(0) > tot(1) ? 0 : 1);
    }
    lbl = 'FT';
    let ft = `Full-time${et ? ' after extra time' : ''}: ${H.name} ${score[0]}-${score[1]} ${A.name}`;
    if (opts.agg) ft += `. Aggregate ${tot(0)}-${tot(1)}`;
    if (pens) ft += `. ${sides[w].name} win ${Math.max(...pens)}-${Math.min(...pens)} on penalties`;
    if (w !== null) ft += opts.final ? `. ${sides[w].name} lift the trophy! 🏆` : `. ${sides[w].name} go through!`;
    say('ft', -1, ft);

    // Player match ratings
    const res = score[0] > score[1] ? [1, -1] : score[0] < score[1] ? [-1, 1] : [0, 0];
    let motm = null, best = -1;
    for (const [pid, x] of Object.entries(pm)) {
      const p = S.players[pid];
      const conc = score[1 - x.side];
      const line = LINE[x.slot];
      let r = 6.3 + (p.ovr - 75) * 0.035 + (rand() - 0.5) * 0.9 + x.g * 1.0 + x.a * 0.6 + res[x.side] * 0.35;
      if (line === 'GK') r += x.saves * 0.25 + (conc === 0 ? 0.7 : 0) - conc * 0.25;
      else if (line === 'DEF') r += (conc === 0 ? 0.5 : 0) - conc * 0.18;
      else if (line === 'MID') r += (conc === 0 ? 0.2 : 0) - conc * 0.05;
      r -= x.yc * 0.2 + x.rc * 1.5;
      if (x.on) r = 6.2 + (r - 6.3) * 0.6;
      x.rating = clamp(Math.round(r * 10) / 10, 3, 10);
      if (x.rating > best) { best = x.rating; motm = pid; }
    }
    const pt = st.poss[0] + st.poss[1] || 1;
    st.poss = [Math.round((st.poss[0] / pt) * 100), 100 - Math.round((st.poss[0] / pt) * 100)];
    return { score, goals, text, st, pm, motm, et, pens, w, tl };
  }

  /* ------------------------------------------------------------------ *
   * Competitions, calendar & seasons
   * ------------------------------------------------------------------ */
  let S = null;       // active state (world + career)
  let W = null;       // base world for new careers
  const C = () => S.career;

  const CUP_NAMES = { ENG: 'FA Cup', ESP: 'Copa del Rey', ITA: 'Coppa Italia', GER: 'DFB-Pokal', FRA: 'Coupe de France', POR: 'Taça de Portugal', NED: 'KNVB Cup' };
  const LEAGUE_SHORT = { ENG: 'PL', ESP: 'LaLiga', ITA: 'Serie A', GER: 'BL', FRA: 'Ligue 1', POR: 'LPT', NED: 'ERE', ENG2: 'Champ', ESP2: 'LaLiga 2', ITA2: 'Serie B', GER2: '2. BL', FRA2: 'Ligue 2', POR2: 'LPT 2', NED2: 'KKD' };
  const LEAGUE_PRESTIGE = { ENG: 3, ESP: 2, ITA: 1.5, GER: 1.5, FRA: 0.5, POR: -1.5, NED: -2, ENG2: -2, ESP2: -4, ITA2: -4, GER2: -3.5, FRA2: -5, POR2: -7, NED2: -8 };
  // Leagues below a top division (children), and helpers to walk the pyramid.
  const childLeagues = (lid) => Object.values(S.leagues).filter((l) => l.parent === lid).map((l) => l.id);
  const cupIdOf = (lid) => 'C-' + (S.leagues[lid]?.parent || lid);
  const isReserveSide = (id) => /^Jong | B$/.test(S.clubs[id]?.name || '');
  const EURO = {
    UCL: { name: 'Champions League', short: 'UCL', wd: 2, base: 18.6e6, win: 2.1e6, draw: 0.7e6, ko: { R16: 11e6, QF: 12.5e6, SF: 15e6, F: 18.5e6, W: 6.5e6 } },
    UEL: { name: 'Europa League', short: 'UEL', wd: 4, base: 4.3e6, win: 0.45e6, draw: 0.15e6, ko: { R16: 1.75e6, QF: 2.5e6, SF: 3.5e6, F: 5.5e6, W: 4e6 } },
    UECL: { name: 'Conference League', short: 'UECL', wd: 4, base: 3.2e6, win: 0.4e6, draw: 0.13e6, ko: { R16: 0.8e6, QF: 1.3e6, SF: 2.5e6, F: 4e6, W: 3e6 } },
  };
  const EURO_ORDER = ['UCL', 'UEL', 'UECL'];
  // European places per league (league position order; the domestic cup winner takes the first Europa League place).
  const QUOTA = {
    UCL: { ENG: 6, ESP: 6, ITA: 6, GER: 6, FRA: 5, POR: 4, NED: 3 },
    UEL: { ENG: 4, ESP: 4, ITA: 4, GER: 4, FRA: 3, POR: 3, NED: 2 },
    UECL: { ENG: 2, ESP: 2, ITA: 2, GER: 2, FRA: 2, POR: 3, NED: 3 },
  };
  // Real 2024/25 finishing order (top of each table) and cup winners, used for the first season's European places.
  const FINAL_2425 = {
    ENG: ['Liverpool', 'Arsenal', 'Manchester City', 'Chelsea', 'Newcastle United', 'Tottenham Hotspur', 'Aston Villa', 'Nottingham Forest', 'Brighton & Hove Albion', 'AFC Bournemouth', 'Brentford', 'Fulham'],
    ESP: ['FC Barcelona', 'Real Madrid', 'Atlético de Madrid', 'Athletic Club', 'Villarreal CF', 'Real Betis', 'RC Celta', 'Rayo Vallecano', 'CA Osasuna', 'RCD Mallorca', 'Real Sociedad', 'Valencia CF'],
    ITA: ['Napoli', 'Inter', 'Atalanta', 'Juventus', 'AS Roma', 'Fiorentina', 'Lazio', 'AC Milan', 'Bologna', 'Como', 'Torino', 'Udinese'],
    GER: ['FC Bayern München', 'Bayer 04 Leverkusen', 'Eintracht Frankfurt', 'Borussia Dortmund', 'SC Freiburg', '1. FSV Mainz 05', 'RB Leipzig', 'SV Werder Bremen', 'VfB Stuttgart', 'Borussia Mönchengladbach', 'VfL Wolfsburg', 'FC Augsburg'],
    FRA: ['Paris Saint-Germain', 'Olympique de Marseille', 'AS Monaco', 'OGC Nice', 'LOSC Lille', 'Olympique Lyonnais', 'RC Strasbourg', 'RC Lens', 'Stade Brestois 29', 'Toulouse FC'],
    POR: ['Sporting CP', 'SL Benfica', 'FC Porto', 'SC Braga', 'Santa Clara', 'Vitória SC', 'FC Famalicão', 'GD Estoril Praia', 'Casa Pia AC', 'Moreirense'],
    NED: ['PSV', 'Ajax', 'Feyenoord', 'FC Utrecht', 'AZ Alkmaar', 'FC Twente', 'Go Ahead Eagles', 'NEC Nijmegen'],
  };
  const CUP_WINNERS_2425 = { ENG: 'Crystal Palace', ESP: 'FC Barcelona', ITA: 'Bologna', GER: 'VfB Stuttgart', FRA: 'Paris Saint-Germain', POR: 'Sporting CP', NED: 'Go Ahead Eagles' };
  const STAGE_NAME = { PO: 'Knockout play-offs', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final' };

  const isoAdd = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  // The given weekday (0=Sun … 6=Sat) in the Monday-to-Sunday week containing y-m-d.
  function weekday(y, m, d, wd) {
    const dt = new Date(Date.UTC(y, m, d));
    const cur = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() + ((wd + 6) % 7) - cur);
    return dt.toISOString().slice(0, 10);
  }
  const newMatch = (h, a) => ({ h, a, played: false });
  const clubName = (id) => S.clubs[id]?.name ?? '—';
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function makeFixtures(clubIds) {
    const teams = shuffle(clubIds.slice());
    if (teams.length % 2) teams.push(null);
    const n = teams.length;
    const rounds = [];
    const arr = teams.slice();
    const last = {}, homes = Object.fromEntries(teams.filter(Boolean).map((t) => [t, 0]));
    for (let r = 0; r < n - 1; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        let h = arr[i], a = arr[n - 1 - i];
        if (!h || !a) continue;
        // Alternate home/away: avoid giving a team the same venue twice in a row.
        const cost = (x, y) => (last[x] === 'H' ? 2 : 0) + (last[y] === 'A' ? 2 : 0) + (homes[x] - homes[y]) * 0.1;
        if (cost(a, h) < cost(h, a)) [h, a] = [a, h];
        last[h] = 'H'; last[a] = 'A'; homes[h]++;
        round.push(newMatch(h, a));
      }
      rounds.push(round);
      arr.splice(1, 0, arr.pop());
    }
    const second = rounds.map((rd) => rd.map((m) => newMatch(m.a, m.h)));
    return rounds.concat(second);
  }
  function makeDates(n, year) {
    const d = new Date(Date.UTC(year, 7, 14));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    const breaks = [[8, 4, 10], [9, 9, 15], [10, 12, 18], [2, 23, 29]]; // international breaks [month, fromDay, toDay]
    const sats = [];
    const end = `${year + 1}-05-31`;
    while (sats.length < n) {
      const iso = d.toISOString().slice(0, 10);
      if (iso > end) break;
      const m = d.getUTCMonth(), day = d.getUTCDate();
      if (!breaks.some(([bm, a, b]) => bm === m && day >= a && day <= b)) sats.push(iso);
      d.setUTCDate(d.getUTCDate() + 7);
    }
    // Leagues with more rounds than weekends (e.g. the 24-club Championship) add Tuesday rounds.
    const extra = n - sats.length;
    const mids = [];
    for (let k = 0; k < extra; k++) mids.push(isoAdd(sats[Math.min(sats.length - 1, Math.floor(((k + 0.5) * sats.length) / extra))], 3));
    return sats.concat(mids).sort();
  }

  // Money in: updates any club's budget; tracks and announces the user's income.
  function award(id, amount, note) {
    if (!id || !amount || !S.clubs[id]) return;
    S.clubs[id].budget += amount;
    const c = C();
    if (c && id === c.clubId) {
      c.income = (c.income || 0) + amount;
      if (note) news(`💶 ${note}: +${money(amount)}.`, 'good');
    }
  }

  /* --- Domestic cups --- */
  const koRoundName = (n) => (n === 2 ? 'Final' : n === 4 ? 'Semi-finals' : n === 8 ? 'Quarter-finals' : `Round of ${n}`);
  function makeCup(lid, Y) {
    const L = S.leagues[lid];
    const teams = [lid, ...childLeagues(lid)].flatMap((l) => S.leagues[l].clubIds).filter((id) => S.clubs[id]).sort((a, b) => clubRating(b) - clubRating(a));
    const n = teams.length;
    if (n < 4) return null;
    const P = 2 ** Math.floor(Math.log2(n));
    const extra = n - P;
    const stages = [];
    if (extra) stages.push({ name: 'First round', size: extra * 2 });
    for (let s = P; s >= 2; s /= 2) stages.push({ name: koRoundName(s), size: s });
    const base = [[Y, 7, 27], [Y, 8, 24], [Y, 9, 29], [Y + 1, 0, 14], [Y + 1, 1, 11], [Y + 1, 4, 13]].map(([y, m, d]) => weekday(y, m, d, 3));
    while (base.length < stages.length) base.unshift(isoAdd(base[0], -14));
    const dates = base.slice(-stages.length);
    const comp = {
      id: 'C-' + lid, type: 'cup', leagueId: lid, name: CUP_NAMES[lid] || `${L.name} Cup`, short: 'Cup', teams,
      byes: teams.slice(0, n - 2 * extra), prelim: teams.slice(n - 2 * extra), out: {}, winner: null,
      rounds: stages.map((st, i) => ({ name: st.name, date: dates[i], single: true, final: st.size === 2, pending: true, matches: [] })),
    };
    drawCupRound(comp, 0);
    return comp;
  }
  function drawCupRound(comp, ri) {
    const rd = comp.rounds[ri];
    if (!rd) return;
    let teams;
    if (ri === 0) teams = comp.prelim.length ? comp.prelim.slice() : comp.teams.slice();
    else {
      teams = comp.rounds[ri - 1].matches.map((m) => m.w);
      if (ri === 1 && comp.prelim.length) teams = teams.concat(comp.byes);
    }
    shuffle(teams);
    rd.matches = [];
    for (let i = 0; i + 1 < teams.length; i += 2) rd.matches.push(newMatch(teams[i], teams[i + 1]));
    rd.pending = false;
  }

  /* --- European competitions --- */
  // Swiss-style league phase: every team plays `rounds` different opponents, never from its own league.
  function leaguePhase(teams, rounds) {
    const lg = (id) => S.clubs[id].leagueId;
    for (let attempt = 0; attempt < 300; attempt++) {
      const strict = attempt < 200;
      const opp = Object.fromEntries(teams.map((t) => [t, new Set()]));
      const homes = Object.fromEntries(teams.map((t) => [t, 0]));
      const out = [];
      let ok = true;
      for (let r = 0; r < rounds && ok; r++) {
        let pairs = null;
        for (let tries = 0; tries < 60 && !pairs; tries++) {
          const list = shuffle(teams.slice());
          const res = [];
          while (list.length) {
            const a = list.shift();
            const j = list.findIndex((b) => !opp[a].has(b) && (!strict || lg(a) !== lg(b)));
            if (j < 0) break;
            res.push([a, list.splice(j, 1)[0]]);
          }
          if (res.length * 2 === teams.length) pairs = res;
        }
        if (!pairs) { ok = false; break; }
        out.push(pairs.map(([a, b]) => {
          opp[a].add(b); opp[b].add(a);
          let h = a, aw = b;
          if (homes[a] > homes[b] || (homes[a] === homes[b] && rand() < 0.5)) { h = b; aw = a; }
          homes[h]++;
          return newMatch(h, aw);
        }));
      }
      if (ok) return out;
    }
    return null;
  }
  function makeEuro(id, teams, Y, lastLeague) {
    const E = EURO[id];
    teams = teams.filter((t) => S.clubs[t]);
    if (teams.length % 2) teams = teams.slice(0, -1);
    if (teams.length < 16) return null;
    const hasPhase = teams.length >= 24;
    if (!hasPhase) teams = teams.slice().sort((a, b) => clubRating(b) - clubRating(a)).slice(0, 16);
    const d = (arr) => weekday(arr[0], arr[1], arr[2], E.wd);
    const rounds = [];
    if (hasPhase) {
      const phase = leaguePhase(teams, 8);
      if (!phase) return null;
      const pd = [[Y, 8, 16], [Y, 8, 30], [Y, 9, 21], [Y, 10, 4], [Y, 10, 25], [Y, 11, 9], [Y + 1, 0, 20], [Y + 1, 0, 27]];
      phase.forEach((ms, i) => rounds.push({ name: `League phase · MD${i + 1}`, date: d(pd[i]), phase: true, matches: ms }));
    }
    const ko = hasPhase
      ? [['PO', [Y + 1, 1, 17], [Y + 1, 1, 24]], ['R16', [Y + 1, 2, 10], [Y + 1, 2, 17]], ['QF', [Y + 1, 3, 7], [Y + 1, 3, 14]], ['SF', [Y + 1, 3, 28], [Y + 1, 4, 5]]]
      : [['R16', [Y + 1, 1, 17], [Y + 1, 1, 24]], ['QF', [Y + 1, 2, 10], [Y + 1, 2, 17]], ['SF', [Y + 1, 3, 7], [Y + 1, 3, 14]]];
    for (const [stage, l1, l2] of ko) {
      rounds.push({ name: `${STAGE_NAME[stage]} · 1st leg`, date: d(l1), stage, leg: 1, pending: true, matches: [] });
      rounds.push({ name: `${STAGE_NAME[stage]} · 2nd leg`, date: d(l2), stage, leg: 2, pending: true, matches: [] });
    }
    const finalDate = id === 'UCL' ? isoAdd(lastLeague, 7) : id === 'UEL' ? weekday(Y + 1, 4, 20, 3) : weekday(Y + 1, 4, 27, 3);
    rounds.push({ name: 'Final', date: finalDate, stage: 'F', leg: 0, final: true, pending: true, matches: [] });
    const comp = { id, type: 'euro', name: E.name, short: E.short, teams, hasPhase, rounds, ties: {}, out: {}, seeds: [], winner: null };
    if (!hasPhase) drawEuroStage(comp, 'R16');
    return comp;
  }
  const stageOrder = (comp) => (comp.hasPhase ? ['PO', 'R16', 'QF', 'SF', 'F'] : ['R16', 'QF', 'SF', 'F']);
  const stageWinners = (comp, stage) => (comp.ties[stage] || []).map((t) => t.w).filter(Boolean);
  function drawEuroStage(comp, stage) {
    const byRating = (a, b) => clubRating(b) - clubRating(a);
    let pairs = [];
    if (stage === 'PO') {
      const ids = phaseTable(comp).map((r) => r.id);
      comp.seeds = ids.slice(0, 8);
      ids.slice(24).forEach((id, i) => { comp.out[id] = `League phase (${ordinal(25 + i)})`; });
      for (let i = 0; i < 8; i++) if (ids[8 + i] && ids[23 - i]) pairs.push([ids[8 + i], ids[23 - i]]);
    } else if (stage === 'R16' && comp.hasPhase) {
      const w = shuffle(stageWinners(comp, 'PO'));
      pairs = shuffle(comp.seeds.slice()).map((x, i) => [x, w[i]]).filter((p) => p[1]);
    } else if (stage === 'R16') {
      const t = comp.teams.slice().sort(byRating);
      const top = shuffle(t.slice(0, 8)), bot = shuffle(t.slice(8, 16));
      pairs = top.map((x, i) => [x, bot[i]]);
    } else {
      const prev = { QF: 'R16', SF: 'QF', F: 'SF' }[stage];
      const w = shuffle(stageWinners(comp, prev));
      for (let i = 0; i + 1 < w.length; i += 2) pairs.push([w[i], w[i + 1]].sort(byRating));
    }
    comp.ties[stage] = pairs.map(([hi, lo]) => ({ hi, lo, w: null }));
    for (const rd of comp.rounds) {
      if (rd.stage !== stage) continue;
      rd.matches = pairs.map(([hi, lo]) => (rd.leg === 1 ? newMatch(lo, hi) : newMatch(hi, lo)));
      rd.pending = false;
    }
    const uid = C().clubId;
    const mine = pairs.find((p) => p.includes(uid));
    if (mine) news(`${comp.name} draw: ${STAGE_NAME[stage]} against ${clubName(mine[0] === uid ? mine[1] : mine[0])}.`, 'info');
  }
  function resolveStage(comp, stage) {
    const rd = comp.rounds.find((r) => r.stage === stage && (r.leg === 2 || r.final));
    const E = EURO[comp.id];
    const uid = C().clubId;
    comp.ties[stage].forEach((t, i) => {
      const m = rd.matches[i];
      t.w = m.w;
      const loser = m.w === m.h ? m.a : m.h;
      comp.out[loser] = STAGE_NAME[stage];
      if (loser === uid) news(`Knocked out of the ${comp.name} in the ${STAGE_NAME[stage]}.`, 'bad');
    });
    if (stage === 'F') {
      comp.winner = comp.ties.F[0].w;
      award(comp.winner, E.ko.W, `${comp.name} winners`);
      news(`🏆 ${clubName(comp.winner)} win the ${comp.name}!`, comp.winner === uid ? 'good' : 'info');
      return;
    }
    const nx = stageOrder(comp)[stageOrder(comp).indexOf(stage) + 1];
    for (const t of comp.ties[stage]) award(t.w, E.ko[nx] || 0, t.w === uid ? `${comp.name}: through to the ${STAGE_NAME[nx]}` : null);
    drawEuroStage(comp, nx);
  }

  /* --- Tables --- */
  function standings(teamIds, matches) {
    const T = {};
    for (const id of teamIds) T[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
    for (const m of matches) {
      if (!m.played || !T[m.h] || !T[m.a]) continue;
      const h = T[m.h], a = T[m.a];
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }
    return Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || clubName(x.id).localeCompare(clubName(y.id)));
  }
  function leagueTable(lid) {
    const comp = C().comps['L-' + lid];
    return comp ? standings(comp.teams, comp.rounds.flatMap((r) => r.matches)) : [];
  }
  const phaseTable = (comp) => standings(comp.teams, comp.rounds.filter((r) => r.phase).flatMap((r) => r.matches));

  /* --- Season setup --- */
  function qualify(orders, cupWinners = {}) {
    const q = { UCL: [], UEL: [], UECL: [] };
    for (const [lid, order] of Object.entries(orders)) {
      const n1 = QUOTA.UCL[lid] || 0, n2 = QUOTA.UEL[lid] || 0, n3 = QUOTA.UECL[lid] || 0;
      q.UCL.push(...order.slice(0, n1));
      let rest = order.slice(n1);
      const cw = cupWinners[lid];
      if (cw && rest.includes(cw)) rest = [cw, ...rest.filter((x) => x !== cw)];
      else if (cw && !order.includes(cw) && n2) rest = [cw, ...rest]; // cup winner from a lower division
      q.UEL.push(...rest.slice(0, n2));
      q.UECL.push(...rest.slice(n2, n2 + n3));
    }
    return q;
  }
  function setupSeason(Y, qual) {
    const c = C();
    c.season = Y; c.comps = {}; c.income = 0; c.days = []; c.dayIdx = 0;
    let lastLeague = `${Y}-08-01`;
    for (const lid of S.leagueOrder) {
      const L = S.leagues[lid];
      const teams = L.clubIds.filter((id) => S.clubs[id]);
      if (teams.length < 2) continue;
      const fx = makeFixtures(teams);
      const dates = makeDates(fx.length, Y);
      c.comps['L-' + lid] = { id: 'L-' + lid, type: 'league', leagueId: lid, name: L.name, short: LEAGUE_SHORT[lid] || L.name.slice(0, 8), teams, rounds: fx.map((ms, i) => ({ name: `Matchday ${i + 1}`, date: dates[i], matches: ms })) };
      if (dates[dates.length - 1] > lastLeague) lastLeague = dates[dates.length - 1];
      const cup = L.parent ? null : makeCup(lid, Y);
      if (cup) c.comps[cup.id] = cup;
    }
    ensureNations(S);
    const intl = makeIntlBreaks(Y);
    c.comps[intl.id] = intl;
    for (const def of tournamentDefs(Y, isoAdd(lastLeague, 7))) { const t = makeTournament(def); c.comps[t.id] = t; }
    for (const id of EURO_ORDER) {
      const comp = makeEuro(id, qual[id] || [], Y, lastLeague);
      if (!comp) continue;
      c.comps[id] = comp;
      for (const t of comp.teams) award(t, EURO[id].base, t === c.clubId ? `${comp.name} participation fee` : null);
    }
    const map = new Map();
    for (const comp of Object.values(c.comps)) {
      comp.rounds.forEach((rd, ri) => { if (!map.has(rd.date)) map.set(rd.date, []); map.get(rd.date).push([comp.id, ri]); });
    }
    c.days = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, items]) => ({ date, items }));
    c.dayIdx = 0; c.seasonOver = false; c.summary = null; c.last = null; c.offers = [];
    invalidate();
  }
  function userCompIds() {
    const c = C();
    const ids = ['L-' + c.leagueId, cupIdOf(c.leagueId)];
    for (const id of EURO_ORDER) if (c.comps[id]?.teams.includes(c.clubId)) ids.push(id);
    return ids.filter((id) => c.comps[id]);
  }
  const euroOf = (id) => EURO_ORDER.map((k) => C().comps[k]).find((comp) => comp && comp.teams.includes(id));

  function startCareer(clubId, manager, opts = {}) {
    S = deepClone(W);
    finalizeWorld(S);
    invalidate();
    if (opts.custom) clubId = createClub(clubId, opts.custom);
    for (const cl of Object.values(S.clubs)) if (isClub(cl) && cl.pids.length) cl.formation = pickFormation(cl);
    invalidate();
    const club = S.clubs[clubId];
    let pid = null;
    if (opts.mode === 'player') {
      const p = addPlayer(S, { name: manager || 'You', pos: opts.pos || 'ST', ovr: 64, age: 17, clubId });
      p.pot = randInt(86, 92); p.me = 1; p.wage = niceWage(wageFor(p)); p.contract = 2027;
      p.nat = NATIONS[opts.nat] ? opts.nat : 'ENG';
      p.role = ROLE[opts.role]?.group === roleGroup(p.pos) ? opts.role : defaultRole(p.pos);
      pid = p.id;
      invalidate();
    }
    S.career = {
      mode: opts.mode === 'player' ? 'player' : 'manager', pid,
      manager: manager || 'Manager', clubId, leagueId: club.leagueId, season: 2025,
      formation: club.formation || '4-3-3', lineup: [], mentality: 'balanced',
      news: [], history: [], trophies: [], offers: [], transfers: [], tnews: [], talks: {},
      last: null, seasonOver: false, speed: 'normal', days: [], dayIdx: 0, comps: {},
    };
    // First season: European places come from the real 2024/25 final tables and cup winners.
    const byName = (n) => Object.values(S.clubs).find((cl) => cl.name === n)?.id;
    const orders = {}, cupWinners = {};
    for (const lid of S.leagueOrder) {
      const real = (FINAL_2425[lid] || []).map(byName).filter((id) => id && S.clubs[id].leagueId === lid);
      const rest = S.leagues[lid].clubIds.filter((id) => !real.includes(id)).sort((a, b) => clubRating(b) - clubRating(a));
      orders[lid] = real.concat(rest);
      const cw = byName(CUP_WINNERS_2425[lid]);
      if (cw && S.clubs[cw].leagueId === lid) cupWinners[lid] = cw;
    }
    setupSeason(2025, qualify(orders, cupWinners));
    S.career.lineup = bestXI(club.pids, S.career.formation);
    if (!pid) academySetup();
    S.career.wageBudget = niceRound(wageBill() * 1.12);
    if (club.custom) news(`🏗️ ${club.name} are founded! ${club.stadium} is ready and the ${S.leagues[club.leagueId].name} awaits.`, 'good');
    if (pid) news(`✍️ ${S.career.manager} (17, ${opts.pos || 'ST'}) signs a first professional contract with ${club.name}. Play well and your OVR will rise.`, 'good');
    else news(`${S.career.manager} is appointed manager of ${club.name}. Transfer budget ${money(club.budget)}, wage budget ${money(S.career.wageBudget)} per week.`, 'info');
    const eu = euroOf(clubId);
    if (eu) news(`${club.name} will play in the ${eu.name} this season.`, 'good');
    save();
  }

  /* --- Create a club: your own club takes over an existing league place --- */
  const CUSTOM_STRENGTH = { underdog: ['Underdog', -6], mid: ['Mid-table', -2], contender: ['Contender', 2], giant: ['Giant', 6] };
  const CUSTOM_BUDGET = { low: ['Shoestring', 0.4], normal: ['Normal', 1], rich: ['Rich owner', 2.5], mega: ['Oil money', 6] };
  function createClub(replaceId, o) {
    const club = S.clubs[replaceId], L = S.leagues[club.leagueId];
    // The replaced club's players become free agents.
    for (const id of club.pids) { const p = S.players[id]; p.clubId = 'FA'; S.clubs.FA.pids.push(id); }
    const others = L.clubIds.filter((id) => id !== replaceId).map((id) => S.clubs[id].level || 66);
    const lvl = clamp(Math.round(avg(others)) + (CUSTOM_STRENGTH[o.strength] || CUSTOM_STRENGTH.mid)[1], 50, 88);
    Object.assign(club, {
      name: o.name, short: o.short, hue: o.hue || 360, custom: 1, pids: [], level: lvl, budget: 0, formation: null,
      stadium: o.stadium || `${o.name} Park`,
    });
    fillSquad(S, club, 24);
    for (const id of club.pids) { const p = S.players[id]; delete p.nat; assignNat(S, p); }
    club.level = computeLevel(S, club);
    club.budget = niceRound(clamp(initialBudget(S, club) * (CUSTOM_BUDGET[o.budget] || CUSTOM_BUDGET.normal)[1], 2e6, 600e6));
    invalidate();
    return replaceId;
  }

  function news(text, type = 'info') {
    const c = C();
    if (!c) return;
    c.news.unshift({ date: curDate(), text, type });
    c.news.length = Math.min(c.news.length, 80);
  }
  function curDate() {
    const c = C();
    if (!c.days || !c.days.length) return `${c.season}-07-01`;
    if (c.seasonOver || c.dayIdx >= c.days.length) return isoAdd(c.days[c.days.length - 1].date, 1);
    return c.days[c.dayIdx].date;
  }
  const leagueFactor = () => LEAGUE_MONEY[C().leagueId] ?? 0.8;

  /* --- Lineup: the user's XI stays as picked; unavailable players get temporary cover --- */
  function bestFor(pids, pos, used, requireAvail) {
    let best = null, be = -99;
    for (const id of pids) {
      if (used.has(id)) continue;
      const p = S.players[id];
      if (!p || (requireAvail && !available(p))) continue;
      const e = eff(p, pos) - (available(p) ? 0 : 20);
      if (e > be) { be = e; best = id; }
    }
    return best;
  }
  // Removes players who left the club and fills empty slots (permanent change).
  function cleanLineup() {
    const c = C(), club = S.clubs[c.clubId], slots = FORMATIONS[c.formation];
    const changes = [];
    if (!Array.isArray(c.lineup) || c.lineup.length !== slots.length) c.lineup = Array(slots.length).fill(null);
    c.lineup = c.lineup.map((id, i) => { const p = S.players[id]; return p && p.clubId === c.clubId && c.lineup.indexOf(id) === i ? id : null; });
    slots.forEach(([pos], i) => {
      if (c.lineup[i]) return;
      const best = bestFor(club.pids, pos, new Set(c.lineup.filter(Boolean)), false);
      c.lineup[i] = best;
      if (best) changes.push(`${S.players[best].name} now starts at ${pos}`);
    });
    return changes;
  }
  // The XI for the next match: chosen players, with stand-ins for injured/suspended ones.
  function matchLineup() {
    cleanLineup();
    const c = C(), club = S.clubs[c.clubId], slots = FORMATIONS[c.formation];
    const used = new Set(c.lineup.filter(Boolean));
    const ids = c.lineup.slice();
    const covers = [];
    ids.forEach((id, i) => {
      const p = S.players[id];
      if (p && available(p)) return;
      const sub = bestFor(club.pids, slots[i][0], used, true);
      if (sub) used.add(sub);
      ids[i] = sub;
      covers.push({ i, pos: slots[i][0], out: id, in: sub });
    });
    return { ids, covers };
  }

  /* --- Dynamic OVR --- */
  const DEV_BASE = 6.3; // roughly the average match rating
  function develop(p, rating, mine) {
    const a = p.age;
    const ageF = a <= 19 ? 1.9 : a <= 21 ? 1.5 : a <= 23 ? 1.15 : a <= 26 ? 0.75 : a <= 29 ? 0.5 : a <= 31 ? 0.35 : 0.25;
    let g = (rating - DEV_BASE) * ageF;
    if (a <= 21) g += 0.35; else if (a <= 23) g += 0.2; // young players develop just by playing
    if (a >= 31) g -= 0.05 * (a - 30);      // veterans slowly decline
    if (g < 0 && a <= 21) g *= 0.3;         // youngsters learn from bad games more than they suffer from them
    if (g > 0) {
      const room = p.pot - p.ovr;
      g *= room <= 0 ? 0.1 : room <= 2 ? 0.5 : 1;
      g *= clamp((93 - p.ovr) / 16, 0.15, 1); // the better a player already is, the harder each point gets
    }
    p.xp = (p.xp || 0) + g;
    levelUp(p, mine);
  }
  function levelUp(p, mine) {
    const TH = 8;
    while (p.xp >= TH) {
      p.xp -= TH;
      if (p.ovr < 99) { p.ovr++; if (p.ovr > p.pot) p.pot = p.ovr; if (mine) news(`📈 ${p.name} has improved to ${p.ovr} OVR.`, 'good'); }
    }
    while (p.xp <= -TH) {
      p.xp += TH;
      if (p.ovr > 40) { p.ovr--; if (mine) news(`📉 ${p.name} has dropped to ${p.ovr} OVR.`, 'bad'); }
    }
  }

  /* --- Playable 3D match: the result you play replaces the simulated one --- */
  let forced3d = null;
  function applyPlayed(r, f, opts) {
    r.score = f.score.slice();
    r.goals = f.goals.map((g) => ({ lbl: String(g.min), side: g.side, pid: g.pid, apid: g.apid, pen: false, og: g.og }));
    for (const [pid, x] of Object.entries(r.pm)) {
      if (x.on) { delete r.pm[pid]; continue; } // no substitutions in a played match
      x.g = 0; x.a = 0; x.yc = 0; x.rc = 0; x.saves = 0;
    }
    for (const g of r.goals) { if (g.pid && r.pm[g.pid]) r.pm[g.pid].g++; if (g.apid && r.pm[g.apid]) r.pm[g.apid].a++; }
    const res = r.score[0] > r.score[1] ? [1, -1] : r.score[0] < r.score[1] ? [-1, 1] : [0, 0];
    let best = -1;
    for (const [pid, x] of Object.entries(r.pm)) {
      const p = S.players[pid], conc = r.score[1 - x.side], line = LINE[x.slot];
      let rt = 6.3 + (p.ovr - 75) * 0.03 + (rand() - 0.5) * 0.6 + x.g * 1.0 + x.a * 0.6 + res[x.side] * 0.35;
      if (line === 'GK') rt += (conc === 0 ? 0.7 : 0) - conc * 0.25;
      else if (line === 'DEF') rt += (conc === 0 ? 0.5 : 0) - conc * 0.18;
      x.rating = clamp(Math.round(rt * 10) / 10, 3, 10);
      if (x.rating > best) { best = x.rating; r.motm = pid; }
    }
    r.st = f.st; r.text = f.text; r.tl = null; r.et = false; r.pens = f.pens || null;
    if (opts.ko) {
      const tot = [r.score[0] + (opts.agg ? opts.agg[0] : 0), r.score[1] + (opts.agg ? opts.agg[1] : 0)];
      r.w = r.pens ? (r.pens[0] > r.pens[1] ? 0 : 1) : tot[0] > tot[1] ? 0 : 1;
    } else r.w = null;
    r.played3d = true;
  }
  const clubHue = (club) => club.hue ?? [...club.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  function side3d(side) {
    const slots = FORMATIONS[side.formation];
    return {
      name: side.name, short: side.short, hue: clubHue(S.clubs[side.clubId]),
      players: side.xi.map((x, i) => {
        const p = S.players[x.pid], f = slots[x.si] || [x.slot, 50, 50];
        const adj = eff(p, x.slot) - p.ovr - clamp(p.form || 0, -2, 2); // out-of-position penalty
        const a = (k) => clamp(attr(p, k) + adj, 20, 99);
        const gk = p.pos === 'GK';
        return {
          pid: p.id, name: p.name, num: i + 1, slot: x.slot, fx: (100 - f[2]) / 100, fz: (f[1] - 50) / 50, ovr: p.ovr,
          pac: gk ? a('SPD') : a('PAC'), sho: gk ? 35 : a('SHO'), pas: gk ? a('KIC') : a('PAS'), dri: gk ? 40 : a('DRI'), def: gk ? 45 : a('DEF'), phy: gk ? 60 : a('PHY'),
          gk: x.slot === 'GK' ? (gk ? Math.round((attr(p, 'DIV') + attr(p, 'REF') + attr(p, 'HAN') + attr(p, 'POS')) / 4) : 35) : 30,
        };
      }),
    };
  }
  function play3d() {
    if (!window.SM3D) return toast('The 3D match engine is not loaded.', 'bad');
    const key = ui.previewKey;
    const nm = advanceToUserMatch();
    save();
    if (!nm) return render();
    if (nm.key !== key) { toast('A new draw was made. You have a new next fixture.', 'info'); return render(); }
    const c = C(), uid = c.clubId;
    const H = buildSide(nm.m.h, nm.m.h === uid), A = buildSide(nm.m.a, nm.m.a === uid);
    const userSide = nm.m.h === uid ? 0 : 1;
    if (isPlayerMode() && ![H, A][userSide].xi.some((x) => x.pid === c.pid)) { render(); return toast('You are not in the starting XI for this match, so it can only be simulated.', 'bad'); }
    const opts = { ko: !!(nm.rd.single || nm.rd.leg === 2 || nm.rd.final), agg: null };
    if (nm.rd.leg === 2) { const l1 = nm.comp.rounds.find((r) => r.stage === nm.rd.stage && r.leg === 1)?.matches[nm.mi]; if (l1 && l1.played) opts.agg = [l1.ag, l1.hg]; }
    window.SM3D.start({
      teams: [side3d(H), side3d(A)], userSide, controlPid: isPlayerMode() ? c.pid : null,
      minutes: +(c.len3d || 5), ko: opts.ko, agg: opts.agg, compName: `${nm.comp.name} · ${nm.rd.name}`,
      onAbort: () => render(),
      onDone: (result) => {
        forced3d = result;
        let res;
        try { res = playDay(true); } finally { forced3d = null; }
        save();
        if (!res) return render();
        ui.playback = { res, shown: 0, tick: 0, lbl: '0', done: false };
        render();
        finishPlayback();
      },
    });
  }

  /* --- Attributes & training --- */
  const ATTRS = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const GK_ATTRS = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'];
  const ATTR_NAME = { PAC: 'Pace', SHO: 'Shooting', PAS: 'Passing', DRI: 'Dribbling', DEF: 'Defending', PHY: 'Physical', DIV: 'Diving', HAN: 'Handling', KIC: 'Kicking', REF: 'Reflexes', SPD: 'Speed', POS: 'Positioning' };
  // [offset from OVR, weight in OVR] per attribute, by position.
  const APROF = {
    ST: { PAC: [2, 0.2], SHO: [4, 0.4], PAS: [-8, 0.05], DRI: [0, 0.2], DEF: [-45, 0], PHY: [-2, 0.15] },
    W: { PAC: [6, 0.3], SHO: [-1, 0.2], PAS: [-3, 0.2], DRI: [3, 0.3], DEF: [-45, 0], PHY: [-14, 0] },
    WM: { PAC: [5, 0.3], SHO: [-6, 0.15], PAS: [0, 0.3], DRI: [1, 0.25], DEF: [-30, 0], PHY: [-10, 0] },
    CAM: { PAC: [-2, 0.1], SHO: [-1, 0.25], PAS: [2, 0.35], DRI: [3, 0.3], DEF: [-40, 0], PHY: [-15, 0] },
    CM: { PAC: [-6, 0], SHO: [-6, 0.1], PAS: [3, 0.4], DRI: [0, 0.2], DEF: [-10, 0.2], PHY: [-4, 0.1] },
    CDM: { PAC: [-12, 0], SHO: [-18, 0], PAS: [-1, 0.25], DRI: [-6, 0], DEF: [2, 0.45], PHY: [1, 0.3] },
    FB: { PAC: [3, 0.3], SHO: [-30, 0], PAS: [-6, 0.2], DRI: [-5, 0], DEF: [-2, 0.35], PHY: [-6, 0.15] },
    CB: { PAC: [-12, 0.1], SHO: [-40, 0], PAS: [-18, 0], DRI: [-18, 0], DEF: [3, 0.6], PHY: [2, 0.3] },
    GK: { DIV: [1, 0.25], HAN: [-1, 0.2], KIC: [-12, 0.05], REF: [2, 0.3], SPD: [-30, 0], POS: [0, 0.2] },
  };
  const PROF_OF = { ST: 'ST', LW: 'W', RW: 'W', LM: 'WM', RM: 'WM', CAM: 'CAM', CM: 'CM', CDM: 'CDM', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CB: 'CB', GK: 'GK' };
  const attrKeys = (p) => (p.pos === 'GK' ? GK_ATTRS : ATTRS);
  function attr(p, k) {
    const pr = APROF[PROF_OF[p.pos]][k];
    const base = p.ovr + (pr ? pr[0] : -20) + Math.round((hash01(p.id + k) - 0.5) * 8);
    return clamp(base + ((p.tb && p.tb[k]) || 0), 15, 99);
  }
  const TRAIN_INT = { light: ['Light', 0.55, 0], normal: ['Normal', 1, 0.0015], intense: ['Intense', 1.6, 0.006] };
  const trainAgeF = (a) => (a <= 20 ? 1.6 : a <= 23 ? 1.25 : a <= 26 ? 1 : a <= 29 ? 0.7 : a <= 32 ? 0.45 : 0.3);
  // Can this player retrain to `pos`? Keepers and outfielders cannot swap.
  const canLearn = (p, pos) => pos !== p.pos && !(p.alt || []).includes(pos) && (pos === 'GK') === (p.pos === 'GK');
  // Sessions needed to learn a position scale with how different it is.
  const learnDist = (p, pos) => 1 + Math.max(0, -Math.max(fit(p.pos, pos), ...(p.alt || []).map((x) => fit(x, pos)))) / 6;
  // One training session for the players you control (after every matchday your club plays).
  function teamTraining() {
    const c = C();
    const [, mult, injRisk] = TRAIN_INT[c.trainInt || 'normal'];
    const ids = isPlayerMode() ? [c.pid] : S.clubs[c.clubId].pids;
    for (const id of ids) {
      const p = S.players[id];
      if (!p || !p.tf || p.inj > 0 || p.away) continue;
      const mine = !isPlayerMode() || p.id === c.pid;
      const rate = trainAgeF(p.age) * mult * (0.7 + rand() * 0.6);
      if (p.tf === 'POS') {
        const pos = p.tpos;
        if (!pos || !canLearn(p, pos)) { p.tf = null; p.tpos = null; continue; }
        p.fam = p.fam || {};
        p.fam[pos] = Math.min(100, (p.fam[pos] || 0) + (5 * rate) / learnDist(p, pos));
        if (p.fam[pos] >= 100) {
          delete p.fam[pos]; if (!Object.keys(p.fam).length) p.fam = null;
          (p.alt = p.alt || []).push(pos);
          p.tf = null; p.tpos = null;
          if (mine) news(`🔁 ${p.id === c.pid ? 'You have' : `${p.name} has`} learned to play ${pos}. ${p.id === c.pid ? 'You' : 'He'} can now play there without a penalty.`, 'good');
        }
      } else {
        const k = p.tf, pr = APROF[PROF_OF[p.pos]][k];
        if (!pr) { p.tf = null; continue; }
        p.tb = p.tb || {};
        if ((p.tb[k] || 0) >= 15 || attr(p, k) >= 99) continue;
        p.tp = (p.tp || 0) + 0.1 * rate;
        if (p.tp >= 1) {
          p.tp -= 1;
          p.tb[k] = (p.tb[k] || 0) + 1;
          // Key attributes for his position lift his OVR (still limited by potential).
          const room = p.pot - p.ovr;
          p.xp = (p.xp || 0) + pr[1] * 8 * 0.6 * (room <= 0 ? 0 : room <= 2 ? 0.5 : 1);
          levelUp(p, mine);
          if (mine && p.tb[k] % 3 === 0) news(`🏋️ Training: ${p.id === c.pid ? 'your' : `${p.name}'s`} ${ATTR_NAME[k].toLowerCase()} has improved to ${attr(p, k)}.`, 'good');
        }
      }
      if (injRisk && rand() < injRisk) { p.inj = randInt(1, 3); if (mine) news(`🤕 ${p.id === c.pid ? 'You were' : `${p.name} was`} injured in training and will miss ${p.inj} match${p.inj > 1 ? 'es' : ''}.`, 'bad'); }
    }
  }
  // Make a learned position the player's main one.
  function setMainPos(p, pos) {
    if (!(p.alt || []).includes(pos)) return;
    p.alt = p.alt.filter((x) => x !== pos).concat(p.pos);
    // Attribute points trained for the old position don't all carry over.
    if (p.tf && !APROF[PROF_OF[pos]][p.tf]) p.tf = null;
    if (p.tb) for (const k of Object.keys(p.tb)) if (!APROF[PROF_OF[pos]][k]) delete p.tb[k];
    p.pos = pos;
    if (p.role && ROLE[p.role]?.group !== roleGroup(pos)) p.role = defaultRole(pos);
    invalidate();
  }

  /* --- Playing matches --- */
  function playMatch(comp, rd, ri, m, mi, withText, pend) {
    const c = C(), uid = c.clubId;
    const isUser = m.h === uid || m.a === uid;
    const H = buildSide(m.h, m.h === uid), A = buildSide(m.a, m.a === uid);
    const lineups = [H.xi.map((x) => [x.pid, x.slot, x.si]), A.xi.map((x) => [x.pid, x.slot, x.si])];
    const forms = [H.formation, A.formation];
    const opts = { neutral: !!rd.final, ko: !!(rd.single || rd.leg === 2 || rd.final), final: !!rd.final, favor: c.mode === 'player' ? c.pid : null };
    if (rd.leg === 2) {
      const l1 = comp.rounds.find((r) => r.stage === rd.stage && r.leg === 1);
      const m1 = l1 && l1.matches[mi];
      if (m1 && m1.played) opts.agg = [m1.ag, m1.hg];
    }
    const r = simulateMatch(H, A, isUser && withText, opts);
    if (isUser && forced3d) applyPlayed(r, forced3d, opts);
    m.played = true; m.hg = r.score[0]; m.ag = r.score[1];
    if (r.et) m.et = 1;
    if (r.pens) m.pens = r.pens;
    if (opts.ko) m.w = r.w === 0 ? m.h : m.a;
    if (opts.agg) m.agg = [m.hg + opts.agg[0], m.ag + opts.agg[1]];
    const detailed = comp.type !== 'league' || comp.leagueId === c.leagueId || isUser;
    if (detailed) m.goals = r.goals.map((g) => [g.lbl, g.side, g.pid, g.apid, g.pen ? 1 : 0]);
    m.motm = r.motm;
    if (detailed && comp.type !== 'intl') m.st = r.st;
    const intl = comp.type === 'intl' || comp.type === 'tourn';
    if (intl) updateElo(m, comp.type === 'tourn' ? 50 : 30);
    for (const [pid, x] of Object.entries(r.pm)) {
      const p = S.players[pid];
      if (!p) continue;
      if (intl) {
        const it = p.intl || (p.intl = [0, 0]);
        it[0]++; it[1] += x.g;
        if (comp.type === 'tourn') { const cg = p.cg[comp.id] || (p.cg[comp.id] = [0, 0, 0]); cg[0]++; cg[1] += x.g; cg[2] += x.a; }
        p.form = clamp((p.form || 0) * 0.7 + (x.rating - 6.6) * 0.5, -2, 2);
        develop(p, x.rating, p.clubId === uid);
        if (x.inj) pend.inj.push([pid, x.inj]);
        continue;
      }
      p.st.apps++; p.st.goals += x.g; p.st.assists += x.a; p.st.yc += x.yc ? 1 : 0; p.st.rc += x.rc;
      p.st.rsum += x.rating;
      if (pid === r.motm) p.st.motm++;
      if (x.slot === 'GK' && r.score[1 - x.side] === 0) p.st.cs++;
      const cg = p.cg[comp.id] || (p.cg[comp.id] = [0, 0, 0]);
      cg[0]++; cg[1] += x.g; cg[2] += x.a;
      p.form = clamp((p.form || 0) * 0.6 + (x.rating - 6.6) * 0.7, -2, 2);
      develop(p, x.rating, p.clubId === uid);
      if (x.inj) pend.inj.push([pid, x.inj]);
      if (x.rc) pend.sus.push([pid, 1]);
      else if (x.yc && p.st.yc % 5 === 0) pend.sus.push([pid, 1]);
    }
    if (comp.type === 'euro') {
      const E = EURO[comp.id];
      if (m.hg > m.ag) award(m.h, E.win); else if (m.hg < m.ag) award(m.a, E.win); else { award(m.h, E.draw); award(m.a, E.draw); }
    }
    if (intl && c.mode === 'player' && r.pm[c.pid]) {
      const x = r.pm[c.pid], mine = S.clubs[m.h].nation === me().nat;
      news(`🌍 ${comp.name}: ${clubName(m.h)} ${m.hg}-${m.ag} ${clubName(m.a)}${m.pens ? ` (${m.pens[0]}-${m.pens[1]} pens)` : ''}. You: rating ${x.rating.toFixed(1)}${x.g ? `, ${x.g} goal${x.g > 1 ? 's' : ''}` : ''}. Caps: ${me().intl[0]}.`, (mine ? m.hg > m.ag : m.ag > m.hg) ? 'good' : 'info');
    }
    if (!isUser) return null;
    const home = m.h === uid;
    let gate = 0;
    if (home && !rd.final) {
      gate = niceRound((0.6e6 + Math.max(0, clubRating(uid) - 65) * 0.12e6) * leagueFactor() * (comp.type === 'euro' ? 1.5 : comp.type === 'cup' ? 0.6 : 1));
      S.clubs[uid].budget += gate;
      c.income = (c.income || 0) + gate;
    }
    const [gf, ga] = home ? [m.hg, m.ag] : [m.ag, m.hg];
    let txt = `${comp.name}: ${gf > ga ? 'Win' : gf < ga ? 'Defeat' : 'Draw'} ${home ? 'vs' : 'at'} ${clubName(home ? m.a : m.h)} ${gf}-${ga}`;
    if (m.pens) txt += ` (${home ? m.pens[0] : m.pens[1]}-${home ? m.pens[1] : m.pens[0]} on penalties)`;
    else if (m.et) txt += ' after extra time';
    if (m.agg) txt += `, aggregate ${home ? m.agg[0] : m.agg[1]}-${home ? m.agg[1] : m.agg[0]}`;
    news(txt + '.', m.w ? (m.w === uid ? 'good' : 'bad') : gf > ga ? 'good' : gf < ga ? 'bad' : 'info');
    if (c.mode === 'player') {
      const x = r.pm[c.pid];
      if (x) news(`⭐ You: ${x.on ? `came on (${x.on}')` : 'started'}, rating ${x.rating.toFixed(1)}${x.g ? `, ${x.g} goal${x.g > 1 ? 's' : ''}` : ''}${x.a ? `, ${x.a} assist${x.a > 1 ? 's' : ''}` : ''}${r.motm === c.pid ? ' · Player of the match!' : ''}.`, x.rating >= 7 ? 'good' : 'info');
      else news('You did not play.', 'info');
    }
    const res = {
      compId: comp.id, ri, mi, dayIdx: c.dayIdx, date: c.days[c.dayIdx].date, h: m.h, a: m.a, score: r.score, text: r.text,
      goals: m.goals, st: r.st, motm: r.motm, lineups, forms, tl: r.tl, et: m.et, pens: m.pens, agg: m.agg, w: m.w, gate,
      ratings: Object.entries(r.pm).map(([pid, x]) => ({ pid, side: x.side, slot: x.slot, r: x.rating, g: x.g, a: x.a, on: x.on, yc: x.yc, rc: x.rc, inj: x.inj })),
    };
    c.last = res;
    return res;
  }

  function afterRound(comp, ri) {
    const rd = comp.rounds[ri];
    if (rd.pending || !rd.matches.every((m) => m.played)) return;
    if (comp.type === 'tourn') return afterTournRound(comp, ri);
    const uid = C().clubId;
    if (comp.type === 'cup') {
      const f = LEAGUE_MONEY[comp.leagueId] ?? 0.8;
      for (const m of rd.matches) {
        const loser = m.w === m.h ? m.a : m.h;
        comp.out[loser] = rd.name;
        if (loser === uid) news(`Knocked out of the ${comp.name} (${rd.name}).`, 'bad');
      }
      if (rd.final) {
        comp.winner = rd.matches[0].w;
        award(comp.winner, niceRound(4e6 * f), `${comp.name} winners`);
        news(`🏆 ${clubName(comp.winner)} win the ${comp.name}!`, comp.winner === uid ? 'good' : 'info');
      } else {
        for (const m of rd.matches) award(m.w, niceRound(0.4e6 * f * (ri + 1)), m.w === uid ? `${comp.name}: through to the ${comp.rounds[ri + 1].name}` : null);
        drawCupRound(comp, ri + 1);
        const nx = comp.rounds[ri + 1].matches.find((m) => m.h === uid || m.a === uid);
        if (nx) news(`${comp.name} draw: ${comp.rounds[ri + 1].name} ${nx.h === uid ? 'at home to' : 'away at'} ${clubName(nx.h === uid ? nx.a : nx.h)}.`, 'info');
      }
    } else if (comp.type === 'euro') {
      if (rd.phase) {
        if (comp.rounds.every((r) => !r.phase || r.matches.every((m) => m.played))) {
          drawEuroStage(comp, 'PO');
          for (const id of comp.seeds) award(id, EURO[comp.id].ko.R16, id === uid ? `${comp.name}: top-8 finish, straight into the Round of 16` : null);
        }
      } else if (rd.leg === 2 || rd.final) resolveStage(comp, rd.stage);
    }
  }

  // Plays every match on the current calendar day. Returns the user's result, if they played.
  function playDay(withText) {
    const c = C();
    if (c.seasonOver) return null;
    const day = c.days[c.dayIdx];
    const pend = { inj: [], sus: [] };
    const playedClubs = new Set();
    let userRes = null;
    for (const [cid, ri] of day.items) {
      const comp = c.comps[cid], rd = comp.rounds[ri];
      if (comp.type === 'intl' && rd.pending) drawIntlRound(comp, ri);
      if ((comp.type === 'intl' || comp.type === 'tourn') && !rd.called) callUps(comp, rd, ri);
      if (rd.pending) continue;
      rd.matches.forEach((m, mi) => {
        if (m.played) return;
        const r = playMatch(comp, rd, ri, m, mi, withText, pend);
        playedClubs.add(m.h); playedClubs.add(m.a);
        if (r) userRes = r;
      });
      afterRound(comp, ri);
    }
    // Injuries/suspensions count down per match the club plays.
    for (const cid of playedClubs) {
      for (const pid of S.clubs[cid].pids) { const p = S.players[pid]; if (p.inj > 0) p.inj--; if (p.sus > 0) p.sus--; }
    }
    const mine = (pid) => S.players[pid]?.clubId === c.clubId;
    for (const [pid, n] of pend.inj) {
      if (!S.players[pid]) continue;
      S.players[pid].inj = Math.max(S.players[pid].inj, n);
      if (mine(pid)) news(`🚑 ${S.players[pid].name} is injured and will miss ${n} match${n > 1 ? 'es' : ''}.`, 'bad');
    }
    for (const [pid, n] of pend.sus) {
      if (!S.players[pid]) continue;
      S.players[pid].sus = Math.max(S.players[pid].sus, n);
      if (mine(pid)) news(`🟥 ${S.players[pid].name} is suspended for the next match.`, 'bad');
    }
    if (!isPlayerMode() && playedClubs.has(c.clubId)) academyTraining();
    if (playedClubs.has(c.clubId)) teamTraining();
    if (windowInfo().open) { aiTransfers(randInt(1, 3)); maybeIncomingOffer(); }
    c.offers = c.offers.filter((o) => o.until > c.dayIdx && (isPlayerMode() || S.players[o.pid]?.clubId === c.clubId));
    c.dayIdx++;
    if (c.dayIdx >= c.days.length) finishSeason();
    invalidate();
    return userRes;
  }

  function nextUserMatch() {
    const c = C();
    if (c.seasonOver) return null;
    for (let di = c.dayIdx; di < c.days.length; di++) {
      for (const [cid, ri] of c.days[di].items) {
        const comp = c.comps[cid], rd = comp.rounds[ri];
        if (rd.pending) continue;
        const mi = rd.matches.findIndex((m) => !m.played && (m.h === c.clubId || m.a === c.clubId));
        if (mi >= 0) return { dayIdx: di, date: c.days[di].date, comp, rd, ri, mi, m: rd.matches[mi], key: `${cid}|${ri}|${mi}` };
      }
    }
    return null;
  }
  // Plays the days before the user's next match. Returns that match (now due today) or null.
  function advanceToUserMatch() {
    const c = C();
    while (!c.seasonOver) {
      const nm = nextUserMatch();
      if (!nm) return null;
      if (nm.dayIdx === c.dayIdx) return nm;
      playDay(false);
    }
    return null;
  }
  function simUntilDay(target) {
    const c = C();
    let n = 0;
    while (!c.seasonOver && c.dayIdx < target) { playDay(false); n++; }
    save();
    return n;
  }

  function finishSeason() {
    const c = C();
    c.seasonOver = true;
    const uid = c.clubId;
    const orders = {}, cupWinners = {};
    const s = { leagues: [], cups: [], euro: [], trophies: [] };
    for (const lid of S.leagueOrder) {
      const comp = c.comps['L-' + lid];
      if (!comp) continue;
      const t = leagueTable(lid);
      orders[lid] = t.map((r) => r.id);
      const f = LEAGUE_MONEY[lid] ?? 0.8, n = t.length;
      t.forEach((r, i) => {
        const prize = niceRound(((n - i) * 1.6e6 + (i === 0 ? 25e6 : i < 4 ? 10e6 : 0)) * f);
        if (r.id === uid) s.prize = prize;
        award(r.id, prize, r.id === uid ? `League prize money (${ordinal(i + 1)})` : null);
        // Commercial income keeps every club's budget moving.
        award(r.id, niceRound(Math.max(1e6, (clubRating(r.id) - 62) * 1.5e6) * f), r.id === uid ? 'Commercial income' : null);
      });
      s.leagues.push({ lid, champion: t[0].id });
      if (t[0].id === uid) s.trophies.push(S.leagues[lid].name);
      const cup = c.comps['C-' + lid];
      if (cup && cup.winner) {
        cupWinners[lid] = cup.winner;
        s.cups.push({ lid, name: cup.name, winner: cup.winner });
        if (cup.winner === uid) s.trophies.push(cup.name);
      }
    }
    s.tourns = Object.values(c.comps).filter((x) => x.type === 'tourn').map((t) => {
      const top = Object.values(S.players).filter((p) => p.cg[t.id]).sort((a, b) => b.cg[t.id][1] - a.cg[t.id][1])[0];
      return { name: t.name, winner: t.winner, top: top ? `${top.name} (${top.cg[t.id][1]})` : null };
    });
    if (c.mode === 'player') for (const t of Object.values(c.comps)) if (t.type === 'tourn' && t.winner && t.winner === natClubId(me().nat) && t.mySquad) s.trophies.push(t.name);
    for (const id of EURO_ORDER) {
      const comp = c.comps[id];
      if (!comp) continue;
      s.euro.push({ id, name: comp.name, winner: comp.winner });
      if (comp.winner === uid) s.trophies.push(comp.name);
    }
    const table = leagueTable(c.leagueId);
    s.pos = table.findIndex((r) => r.id === uid) + 1;
    s.table = table.map((r) => ({ id: r.id, pts: r.pts, gd: r.gf - r.ga }));
    const lc = 'L-' + c.leagueId;
    const lp = S.leagues[c.leagueId].clubIds.flatMap((id) => S.clubs[id]?.pids || []).map((pid) => S.players[pid]);
    const top = lp.filter((p) => p.cg[lc]).sort((a, b) => b.cg[lc][1] - a.cg[lc][1] || b.cg[lc][2] - a.cg[lc][2])[0];
    const bestP = lp.filter((p) => p.st.apps >= 15).sort((a, b) => avgRating(b) - avgRating(a))[0];
    s.topScorer = top ? { name: top.name, club: clubName(top.clubId), goals: top.cg[lc][1] } : null;
    s.bestPlayer = bestP ? { name: bestP.name, club: clubName(bestP.clubId), avg: avgRating(bestP).toFixed(2) } : null;
    s.income = c.income || 0;
    if (c.mode === 'player') { const p = me(); s.me = { apps: p.st.apps, g: p.st.goals, a: p.st.assists, avg: p.st.apps ? avgRating(p).toFixed(2) : '-', ovr0: p.ovr0, ovr: p.ovr, motm: p.st.motm }; }
    // Promotion & relegation: bottom clubs of each top division swap with the best of the division below.
    s.moves = [];
    for (const lid of S.leagueOrder) {
      const L = S.leagues[lid];
      if (!L.parent || !orders[lid] || !orders[L.parent]) continue;
      const topOrder = orders[L.parent];
      const n = Math.min(PROMOTED, Math.floor(topOrder.length / 4));
      const up = orders[lid].filter((id) => !isReserveSide(id)).slice(0, n);
      const down = topOrder.slice(-up.length);
      s.moves.push({ upper: L.parent, lower: lid, up, down });
      if (up.includes(uid)) { s.promoted = S.leagues[L.parent].name; news(`🎉 Promoted! You will play in the ${S.leagues[L.parent].name} next season.`, 'good'); }
      if (down.includes(uid)) { s.relegated = L.name; news(`⬇️ Relegated. Next season you will play in the ${L.name}.`, 'bad'); }
    }
    c.nextQual = qualify(orders, cupWinners);
    s.nextEuro = EURO_ORDER.find((k) => c.nextQual[k].includes(uid)) || null;
    for (const t of s.trophies) c.trophies.push({ season: c.season, name: t });
    c.summary = s;
    c.history.push({ season: c.season, club: clubName(uid), league: S.leagues[c.leagueId].name, pos: s.pos, pts: table[s.pos - 1]?.pts ?? 0, champion: clubName(table[0].id), trophies: s.trophies.slice(), topScorer: s.topScorer ? `${s.topScorer.name} (${s.topScorer.goals})` : '-', me: s.me || null });
    news(`Season ${seasonLabel(c.season)} complete: you finished ${ordinal(s.pos)}${s.trophies.length ? ` and won ${s.trophies.join(', ')}` : ''}.`, s.trophies.length ? 'good' : 'info');
  }

  function startNextSeason() {
    const c = C();
    if (!c.seasonOver) return;
    // Apply promotion & relegation.
    for (const mv of (c.summary?.moves || [])) {
      const U = S.leagues[mv.upper], Lo = S.leagues[mv.lower];
      U.clubIds = U.clubIds.filter((id) => !mv.down.includes(id)).concat(mv.up);
      Lo.clubIds = Lo.clubIds.filter((id) => !mv.up.includes(id)).concat(mv.down);
      for (const id of mv.up) S.clubs[id].leagueId = mv.upper;
      for (const id of mv.down) S.clubs[id].leagueId = mv.lower;
    }
    c.leagueId = S.clubs[c.clubId].leagueId;
    for (const p of Object.values(S.players)) if (p.away) p.away = null;
    if (!isPlayerMode()) returnLoans();
    if (!isPlayerMode()) academySeasonEnd();
    // Expiring contracts: AI clubs renew or release; your players leave unless you renewed them.
    for (const p of Object.values(S.players)) {
      if (p.clubId === 'FA' || p.contract > c.season || !isClub(S.clubs[p.clubId])) continue;
      if (p.id === c.pid) { p.contract = c.season + 2; p.wage = Math.max(p.wage, wageFor(p)); news(`Your contract has been extended to ${contractLabel(p)} on ${money(p.wage)} a week.`, 'info'); continue; }
      if (p.clubId === c.clubId && !isPlayerMode()) {
        if (S.clubs[c.clubId].pids.length > MIN_SQUAD) { movePlayer(p, 'FA'); news(`👋 ${p.name}'s contract expired and he has left on a free transfer.`, 'bad'); continue; }
        p.contract = c.season + 1; news(`${p.name}'s contract was extended by a year because the squad was too small.`, 'info'); continue;
      }
      if (p.age >= 33 && rand() < 0.5) movePlayer(p, 'FA');
      else { p.contract = c.season + randInt(1, 3); p.wage = wageFor(p); }
    }
    const retired = [];
    for (const p of Object.values(S.players)) {
      if (p.clubId === 'FA') continue;
      // Career history (kept for real players, your club and your own player).
      if (p.st.apps && (!p.gen || p.clubId === c.clubId || p.id === c.pid)) {
        (p.hist || (p.hist = [])).push({ s: c.season, c: p.loanClub ? `${p.loanClub} (loan)` : clubName(p.clubId), a: p.st.apps, g: p.st.goals, as: p.st.assists, r: +avgRating(p).toFixed(2), o: p.ovr });
      }
      const a = p.age;
      // Most development now happens match by match; this is the summer's age effect.
      const [lo, hi] = a <= 20 ? [0, 2] : a <= 23 ? [0, 1] : a <= 27 ? [-1, 1] : a <= 30 ? [-1, 0] : a <= 33 ? [-3, 0] : [-4, -1];
      let delta = randInt(lo, hi);
      if (delta > 0 && p.ovr >= p.pot) delta = 0;
      p.ovr = clamp(p.ovr + delta, 40, 95);
      if (p.pot < p.ovr) p.pot = p.ovr;
      p.age++;
      p.ovr0 = p.ovr; p.xp = (p.xp || 0) * 0.5;
      p.form = 0; p.inj = 0; p.sus = 0; p.st = newStats(); p.cg = {}; p.loanClub = null;
      if (p.clubId !== c.clubId && p.id !== c.pid && !p.loan) p.wage = wageFor(p); // your players keep the wage they signed for
      if (p.age >= 35 && p.id !== c.pid && rand() < 0.25 + (p.age - 35) * 0.2) retired.push(p);
    }
    for (const p of retired) {
      const club = S.clubs[p.clubId];
      if (club) club.pids = club.pids.filter((id) => id !== p.id);
      if (p.clubId === c.clubId) news(`${p.name} (${p.age}) has retired from professional football.`, 'info');
      delete S.players[p.id];
    }
    const mine = S.clubs[c.clubId];
    const pool = S.leagues[c.leagueId].pool;
    const taken = new Set(mine.pids.map((id) => S.players[id].name));
    for (let i = 0; i < 0 && mine.pids.length < MAX_SQUAD; i++) { // graduates now come through the youth academy
      const p = addPlayer(S, { name: genName(pool, taken), pos: pick(['CB', 'CM', 'ST', 'LW', 'RB', 'CAM']), ovr: randInt(58, 67), age: randInt(16, 18), clubId: c.clubId, gen: true });
      p.pot = clamp(p.ovr + randInt(10, 22), p.ovr, 92);
      news(`Academy graduate ${p.name} (${p.pos}, ${p.ovr} OVR) joins the first team.`, 'good');
    }
    for (const club of Object.values(S.clubs)) {
      if (!isClub(club)) continue;
      if (club.id !== c.clubId || isPlayerMode()) fillSquad(S, club, 20);
      else if (club.pids.length < MIN_SQUAD) fillSquad(S, club, MIN_SQUAD);
    }
    genFreeAgents(S);
    invalidate();
    c.seasonOver = false; // lets the summer transfer logic run with the new season's calendar
    aiTransfers(45);
    for (const club of Object.values(S.clubs)) if (isClub(club) && (club.id !== c.clubId || isPlayerMode())) club.formation = club.pids.length ? pickFormation(club) : null;
    invalidate();
    c.wageBudget = niceRound(Math.max(c.wageBudget || 0, wageBill() * 1.08) * 1.04);
    c.talks = {};
    setupSeason(c.season + 1, c.nextQual || { UCL: [], UEL: [], UECL: [] });
    cleanLineup();
    news(isPlayerMode() ? `Welcome to the ${seasonLabel(c.season)} season! You are now ${me().age} and rated ${me().ovr}.` : `Welcome to the ${seasonLabel(c.season)} season! Wage budget: ${money(c.wageBudget)} per week.`, 'info');
    const eu = euroOf(c.clubId);
    if (eu) news(`${S.clubs[c.clubId].name} are in the ${eu.name} this season.`, 'good');
    save();
  }

  /* ------------------------------------------------------------------ *
   * International football: breaks, call-ups, tournaments, ranking
   * ------------------------------------------------------------------ */
  function makeIntlBreaks(Y) {
    const rounds = [];
    const months = [[Y, 8, 4, 10, 'September'], [Y, 9, 9, 15, 'October'], [Y, 10, 12, 18, 'November'], [Y + 1, 2, 23, 29, 'March']];
    for (const [y, m, a, b, label] of months) {
      let sat = null;
      for (let d = a; d <= b && !sat; d++) { const dt = new Date(Date.UTC(y, m, d)); if (dt.getUTCDay() === 6) sat = dt.toISOString().slice(0, 10); }
      if (!sat) continue;
      rounds.push({ name: `${label} internationals · match 1`, date: sat, pending: true, matches: [] });
      rounds.push({ name: `${label} internationals · match 2`, date: isoAdd(sat, 3), pending: true, matches: [] });
    }
    return { id: 'INT', type: 'intl', name: 'International breaks', short: 'INTL', teams: Object.keys(NATIONS).map(natClubId), rounds, out: {} };
  }
  // Friendlies and qualifiers: nations mostly play opponents from their own confederation and of a similar level.
  function drawIntlRound(comp, ri) {
    const rd = comp.rounds[ri];
    const byConf = {};
    for (const n of Object.values(NATIONS)) (byConf[n.confed] = byConf[n.confed] || []).push(natClubId(n.code));
    const left = [];
    rd.matches = [];
    for (const list of Object.values(byConf)) {
      const sorted = list.sort((a, b) => eloOf(b) - eloOf(a) + (rand() - 0.5) * 120);
      while (sorted.length >= 2) { const a = sorted.shift(), i = Math.min(sorted.length - 1, randInt(0, 2)); rd.matches.push(rand() < 0.5 ? newMatch(a, sorted.splice(i, 1)[0]) : newMatch(sorted.splice(i, 1)[0], a)); }
      left.push(...sorted);
    }
    shuffle(left);
    while (left.length >= 2) rd.matches.push(newMatch(left.pop(), left.pop()));
    rd.pending = false;
  }
  function natPools() {
    const m = new Map();
    for (const p of Object.values(S.players)) {
      if (!p.nat || S.clubs[p.clubId]?.youth) continue;
      if (!m.has(p.nat)) m.set(p.nat, []);
      m.get(p.nat).push(p);
    }
    return m;
  }
  // The national coach picks the 23 best available players with a balanced spread of positions.
  function pickSquad(code, pools) {
    const list = (pools.get(code) || []).filter((p) => p.inj <= 0).sort((a, b) => b.ovr - a.ovr);
    const need = { GK: 3, DEF: 8, MID: 7, ATT: 5 };
    const squad = [];
    for (const p of list) { const l = LINE[p.pos]; if (need[l] > 0) { need[l]--; squad.push(p.id); } }
    for (const p of list) { if (squad.length >= 23) break; if (!squad.includes(p.id)) squad.push(p.id); }
    return squad;
  }
  function callUps(comp, rd, ri) {
    const c = C();
    rd.called = true;
    const tournStart = comp.type === 'tourn' && ri === 0;
    if (comp.type === 'tourn' && !tournStart) return;
    const pools = natPools();
    const teams = comp.type === 'tourn' ? comp.teams : [...new Set(rd.matches.flatMap((m) => [m.h, m.a]))];
    const mineAway = [];
    for (const id of teams) {
      const club = S.clubs[id];
      club.squad = pickSquad(club.nation, pools);
      club.formation = pickFormation({ pids: club.squad });
      if (comp.type === 'tourn') {
        for (const pid of club.squad) { const p = S.players[pid]; p.away = comp.id; if (p.clubId === c.clubId && !isPlayerMode()) mineAway.push(`${p.name} (${club.name})`); }
      }
      if (isPlayerMode() && club.nation === me().nat && (comp.type === 'tourn' || / 1$/.test(rd.name))) {
        const inSquad = club.squad.includes(c.pid);
        const first = inSquad && !(me().intl && me().intl[0]);
        if (inSquad) news(first ? `🎉 You have been called up to the ${club.name} squad for the first time!` : `🌍 You are in the ${club.name} squad for the ${comp.type === 'tourn' ? comp.name : rd.name.split(' · ')[0]}.`, 'good');
        else if (comp.type === 'tourn') news(`You were left out of the ${club.name} squad for the ${comp.name}.`, 'bad');
        if (comp.type === 'tourn') comp.mySquad = inSquad;
      }
    }
    invalidate();
    if (mineAway.length) news(`🌍 ${comp.name}: ${mineAway.join(', ')} ${mineAway.length > 1 ? 'are' : 'is'} away until ${mineAway.length > 1 ? 'their nations are' : 'his nation is'} knocked out.`, comp.midSeason ? 'bad' : 'info');
  }
  function updateElo(m, K) {
    const nh = S.nations[S.clubs[m.h].nation], na = S.nations[S.clubs[m.a].nation];
    if (!nh || !na) return;
    const exp = 1 / (1 + Math.pow(10, (na.elo - nh.elo) / 400));
    const res = m.w ? (m.w === m.h ? 1 : 0) : m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
    const gd = Math.abs(m.hg - m.ag), mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : 1.75 + (gd - 3) / 8;
    const d = Math.round(K * mult * (res - exp));
    nh.elo += d; na.elo -= d;
    nh.form = (nh.form || []).concat(res === 1 ? 'W' : res === 0 ? 'L' : 'D').slice(-5);
    na.form = (na.form || []).concat(res === 0 ? 'W' : res === 1 ? 'L' : 'D').slice(-5);
  }
  function topNations(confeds, n, exclude = []) {
    return Object.values(NATIONS).filter((x) => confeds.includes(x.confed) && !exclude.includes(x.code))
      .sort((a, b) => S.nations[b.code].elo - S.nations[a.code].elo).slice(0, n).map((x) => x.code);
  }
  function tournamentDefs(Y, afterClub) {
    const Z = Y + 1, defs = [];
    const summer = (iso) => (iso > afterClub ? iso : isoAdd(afterClub, 3)); // after the club season
    if (Y === 2025) defs.push({ id: 'AFCON', name: 'Africa Cup of Nations 2025', short: 'AFCON', teams: topNations(['CAF'], 16), groupDates: ['2025-12-21', '2025-12-26', '2025-12-30'], koSize: 8, koDates: ['2026-01-03', '2026-01-09', '2026-01-14'], thirds: 0, midSeason: true });
    if (Z % 4 === 3) defs.push({ id: 'ASIAN', name: `AFC Asian Cup ${Z}`, short: 'ASIA', teams: topNations(['AFC'], 16), groupDates: [`${Z}-01-08`, `${Z}-01-12`, `${Z}-01-16`], koSize: 8, koDates: [`${Z}-01-21`, `${Z}-01-25`, `${Z}-01-30`], thirds: 0, midSeason: true });
    if (Z % 4 === 2) {
      const hosts = Z === 2026 ? ['USA', 'MEX', 'CAN'] : [];
      let teams = hosts.slice();
      const add = (conf, n) => { teams.push(...topNations([conf], n, teams)); };
      add('UEFA', 16); add('CONMEBOL', 6); add('CAF', 9); add('AFC', 8); add('CONCACAF', 6 - hosts.length); add('OFC', 1);
      teams.push(...topNations(['UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF'], 48 - teams.length, teams));
      defs.push({ id: 'WC', name: `FIFA World Cup ${Z}`, short: 'WC', teams, groupDates: [summer(`${Z}-06-13`), summer(`${Z}-06-17`), summer(`${Z}-06-21`)], koSize: 32, koDates: [`${Z}-06-28`, `${Z}-07-03`, `${Z}-07-09`, `${Z}-07-14`, `${Z}-07-19`], thirds: 8 });
    }
    if (Z % 4 === 0) {
      defs.push({ id: 'EURO', name: `UEFA Euro ${Z}`, short: 'EURO', teams: topNations(['UEFA'], 24), groupDates: [summer(`${Z}-06-10`), summer(`${Z}-06-14`), summer(`${Z}-06-18`)], koSize: 16, koDates: [`${Z}-06-25`, `${Z}-07-01`, `${Z}-07-05`, `${Z}-07-09`], thirds: 4 });
      defs.push({ id: 'COPA', name: `Copa América ${Z}`, short: 'COPA', teams: topNations(['CONMEBOL'], 10).concat(topNations(['CONCACAF'], 6)), groupDates: [summer(`${Z}-06-13`), summer(`${Z}-06-17`), summer(`${Z}-06-21`)], koSize: 8, koDates: [`${Z}-06-27`, `${Z}-07-01`, `${Z}-07-05`], thirds: 0 });
    }
    if (Z % 2 === 1 && Z >= 2027) {
      defs.push({ id: 'AFCON', name: `Africa Cup of Nations ${Z}`, short: 'AFCON', teams: topNations(['CAF'], 16), groupDates: [summer(`${Z}-06-19`), summer(`${Z}-06-23`), summer(`${Z}-06-27`)], koSize: 8, koDates: [`${Z}-07-02`, `${Z}-07-06`, `${Z}-07-11`], thirds: 0 });
      defs.push({ id: 'UNL', name: `Nations League Finals ${Z}`, short: 'UNL', teams: topNations(['UEFA'], 4), groupDates: [], koSize: 4, koDates: [summer(`${Z}-06-10`), summer(`${Z}-06-14`)], thirds: 0, noGroups: true });
    }
    return defs;
  }
  function makeTournament(def) {
    const teams = def.teams.map(natClubId);
    const comp = { id: def.id, type: 'tourn', name: def.name, short: def.short, teams, groups: [], rounds: [], out: {}, winner: null, midSeason: !!def.midSeason, thirds: def.thirds };
    if (!def.noGroups) {
      const nG = teams.length / 4;
      const sorted = teams.slice().sort((a, b) => eloOf(b) - eloOf(a));
      comp.groups = Array.from({ length: nG }, () => []);
      for (let pot = 0; pot < 4; pot++) shuffle(sorted.slice(pot * nG, pot * nG + nG)).forEach((t, i) => comp.groups[i].push(t));
      [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]].forEach((pairs, md) => comp.rounds.push({
        name: `Group stage · MD${md + 1}`, date: def.groupDates[md], group: true,
        matches: comp.groups.flatMap((g, gi) => pairs.map(([x, y]) => ({ ...newMatch(g[x], g[y]), g: gi }))),
      }));
    }
    let size = def.koSize;
    for (const d of def.koDates) { comp.rounds.push({ name: koRoundName(size), date: d, single: true, final: size === 2, pending: true, matches: [], size, ko: true }); size /= 2; }
    if (def.noGroups) drawTournKO(comp, 0, teams.slice().sort((a, b) => eloOf(b) - eloOf(a)));
    return comp;
  }
  const groupLetter = (i) => String.fromCharCode(65 + i);
  function groupTable(comp, gi) {
    return standings(comp.groups[gi], comp.rounds.filter((r) => r.group).flatMap((r) => r.matches.filter((m) => m.g === gi)));
  }
  function drawTournKO(comp, ri, seeds) {
    const rd = comp.rounds[ri];
    let pairs = [];
    if (seeds) for (let i = 0; i < seeds.length / 2; i++) pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
    else { const w = comp.rounds[ri - 1].matches.map((m) => m.w); for (let i = 0; i + 1 < w.length; i += 2) pairs.push([w[i], w[i + 1]]); }
    rd.matches = pairs.map(([a, b]) => newMatch(a, b));
    rd.pending = false;
  }
  function releaseNation(comp, clubId) {
    for (const pid of S.clubs[clubId]?.squad || []) { const p = S.players[pid]; if (p && p.away === comp.id) p.away = null; }
    invalidate();
  }
  function afterTournRound(comp, ri) {
    const rd = comp.rounds[ri];
    if (rd.group) {
      if (!comp.rounds.filter((r) => r.group).every((r) => r.matches.every((m) => m.played))) return;
      const tables = comp.groups.map((_, gi) => groupTable(comp, gi));
      const rank = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
      const firsts = tables.map((t) => t[0]).sort(rank), seconds = tables.map((t) => t[1]).sort(rank);
      const thirds = tables.map((t) => t[2]).sort(rank).slice(0, comp.thirds || 0);
      const seeds = [...firsts, ...seconds, ...thirds].map((r) => r.id);
      for (const id of comp.teams) if (!seeds.includes(id)) { comp.out[id] = 'Group stage'; releaseNation(comp, id); }
      const koIdx = comp.rounds.findIndex((r) => r.ko);
      drawTournKO(comp, koIdx, seeds);
      return;
    }
    for (const m of rd.matches) { const loser = m.w === m.h ? m.a : m.h; comp.out[loser] = rd.name; releaseNation(comp, loser); }
    if (rd.final) {
      comp.winner = rd.matches[0].w;
      releaseNation(comp, comp.winner);
      news(`🏆 ${clubName(comp.winner)} win the ${comp.name}!`, isPlayerMode() && S.clubs[comp.winner].nation === me().nat && comp.mySquad ? 'good' : 'info');
    } else drawTournKO(comp, ri + 1);
  }

  /* ------------------------------------------------------------------ *
   * Youth academy (manager career)
   * ------------------------------------------------------------------ */
  const ACADEMY_REGIONS = {
    local: { label: 'Local area', desc: 'Cheapest. Players from your own country.' },
    europe: { label: 'Europe', desc: 'Technically strong prospects from across Europe.', pools: ['en', 'es', 'it', 'de', 'fr', 'nl', 'pt'] },
    samerica: { label: 'South America', desc: 'Flair and high potential, but raw.', nats: ['BRA', 'ARG', 'URU', 'COL', 'ECU'], pool: ['pt', 'es'] },
    africa: { label: 'Africa', desc: 'Athletic prospects with a big potential range.', nats: ['MAR', 'SEN', 'NGA', 'CIV', 'GHA', 'CMR', 'MLI'], pool: ['fr', 'world'] },
    asia: { label: 'Asia', desc: 'Disciplined, fast-developing players.', nats: ['JPN', 'KOR', 'UZB', 'AUS'], pool: ['world'] },
  };
  const ACADEMY_COST = [0, 4e6, 10e6, 20e6, 35e6];
  const academy = () => { const c = C(); return c.academy || (c.academy = { level: 1, scouted: 0, season: c.season }); };
  function genProspect(region) {
    const c = C(), lvl = academy().level, R = ACADEMY_REGIONS[region] || ACADEMY_REGIONS.local;
    let pool = S.leagues[c.leagueId].pool, nat = POOL_NAT[pool] || null;
    if (R.pools) { pool = pick(R.pools); nat = POOL_NAT[pool]; }
    if (R.nats) { nat = pick(R.nats); pool = pick(R.pool); if (nat === 'BRA') pool = 'pt'; if (['ARG', 'URU', 'COL', 'ECU'].includes(nat)) pool = 'es'; }
    const age = randInt(15, 17);
    const ovr = randInt(42, 53) + lvl * 2 + (age - 15) * 2;
    const spread = region === 'africa' || region === 'samerica' ? 30 : 24;
    const wonder = rand() < 0.03 + lvl * 0.015;
    const pot = wonder ? randInt(86, 93) : clamp(ovr + randInt(10, spread) + lvl, ovr + 5, 88);
    const p = addPlayer(S, { name: genName(pool, null), pos: pick(['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST']), ovr, age, clubId: 'YTH', gen: true });
    p.pot = pot; p.nat = nat; p.wage = 500; p.contract = c.season + 3; p.region = region;
    if (wonder) news(`⭐ Your scouts are excited about ${p.name} (${p.pos}, ${age}): they think he could become a world-class player.`, 'good');
    return p;
  }
  function academySetup() {
    const a = academy();
    for (let i = 0; i < 5; i++) genProspect(i < 4 ? 'local' : pick(['europe', 'samerica', 'africa']));
    a.season = C().season;
  }
  function academyTraining() {
    const a = academy();
    for (const pid of S.clubs.YTH.pids) {
      const p = S.players[pid];
      if (!p) continue;
      let g = (0.35 + a.level * 0.1) * (p.age <= 16 ? 1.2 : 1) * (0.6 + rand() * 0.8);
      if (p.ovr >= p.pot) g *= 0.1;
      p.xp = (p.xp || 0) + g;
      while (p.xp >= 8) { p.xp -= 8; p.ovr++; if (p.ovr === 65) news(`🎓 Academy: ${p.name} (${p.pos}) has reached 65 OVR and is ready for first-team football.`, 'good'); }
    }
  }
  function academySeasonEnd() {
    const c = C(), a = academy();
    for (const pid of S.clubs.YTH.pids.slice()) {
      const p = S.players[pid];
      if (p && p.age >= 18) { S.clubs.YTH.pids = S.clubs.YTH.pids.filter((x) => x !== pid); delete S.players[pid]; news(`👋 Academy: ${p.name} was too old for the academy and was released.`, 'bad'); }
    }
    a.scouted = 0; a.season = c.season + 1;
    const n = 2 + a.level;
    for (let i = 0; i < n; i++) genProspect('local');
    news(`🎓 Youth intake day: ${n} new prospects have joined your academy.`, 'good');
  }
  function promoteYouth(pid) {
    const c = C(), p = S.players[pid], me2 = S.clubs[c.clubId];
    if (me2.pids.length >= MAX_SQUAD) return toast(`Your squad is full (${MAX_SQUAD}). Sell or release someone first.`, 'bad');
    movePlayer(p, c.clubId);
    p.wage = wageFor(p); p.contract = c.season + 3; p.ovr0 = p.ovr;
    news(`🎓 ${p.name} (${p.pos}, ${p.ovr} OVR) has been promoted from the academy on a 3-year deal.`, 'good');
    save();
    toast(`${p.name} promoted to the first team!`, 'good');
  }

  /* ------------------------------------------------------------------ *
   * Transfers: windows, valuations, player interest, negotiation, AI market
   * ------------------------------------------------------------------ */
  function windowInfo() {
    const c = C();
    const Y = c.season;
    if (c.seasonOver) return { open: true, key: `${Y + 1}-S`, label: 'Summer transfer window open' };
    const d = curDate();
    if (d <= `${Y}-09-01`) return { open: true, key: `${Y}-S`, label: 'Summer window open · closes 1 Sep' };
    if (d >= `${Y + 1}-06-01`) return { open: true, key: `${Y + 1}-S`, label: 'Summer transfer window open' };
    if (d >= `${Y + 1}-01-01` && d <= `${Y + 1}-02-02`) return { open: true, key: `${Y}-J`, label: 'January window open · closes 2 Feb' };
    return { open: false, key: '', label: d < `${Y + 1}-01-01` ? 'Transfer window closed · opens 1 Jan' : 'Transfer window closed · reopens in the summer' };
  }
  function prestige(id) {
    const club = S.clubs[id];
    if (!club || id === 'FA') return 55;
    let p = clubRating(id) + (LEAGUE_PRESTIGE[club.leagueId] ?? -2);
    const comps = C()?.comps;
    if (comps) {
      if (comps.UCL?.teams.includes(id)) p += 3;
      else if (comps.UEL?.teams.includes(id)) p += 1.5;
      else if (comps.UECL?.teams.includes(id)) p += 0.5;
    }
    return p;
  }
  const hash01 = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
  function squadRank(p) {
    const club = S.clubs[p.clubId];
    if (!club) return 99;
    return club.pids.map((id) => S.players[id].ovr).sort((a, b) => b - a).indexOf(p.ovr);
  }
  const isUntouchable = (p) => p.clubId !== 'FA' && squadRank(p) < 3 && p.ovr >= 84 && clubRating(p.clubId) >= 80;
  // What the selling club wants for the player.
  function clubValuation(p, buyerId) {
    const v = playerValue(p);
    if (p.clubId === 'FA') return niceRound(v * 0.3);
    const rank = squadRank(p);
    let m = rank < 3 ? 1.7 : rank < 11 ? 1.3 : 1.05;
    if (p.age <= 21 && p.pot - p.ovr >= 8) m += 0.25;
    if (buyerId && S.clubs[buyerId]?.leagueId === S.clubs[p.clubId]?.leagueId) m += 0.1;
    if (C() && windowInfo().key.endsWith('J')) m += 0.15;
    if (isUntouchable(p)) m = Math.max(m, 2.2);
    return niceRound(v * m);
  }
  function sellingStance(p) {
    if (p.clubId === 'FA') return { label: 'Free agent', cls: 'good' };
    if (isUntouchable(p)) return { label: 'Untouchable: only a huge offer will do', cls: 'bad' };
    const r = squadRank(p);
    if (r < 3) return { label: 'Key player: very expensive', cls: 'warn' };
    if (r < 11) return { label: 'First-team player', cls: '' };
    return { label: 'Squad player: club will listen', cls: 'good' };
  }
  // Would the player move to this club? Depends on club stature, level and his role.
  function interest(p, buyerId) {
    if (p.clubId === 'FA') return { lvl: 2, label: 'Open', wm: 1.05 };
    const bp = prestige(buyerId), cp = prestige(p.clubId), br = clubRating(buyerId);
    let s = (bp - cp) * 0.6 + (br - p.ovr) * 0.35 + (p.age >= 31 ? 3 : 0) + (squadRank(p) > 13 ? 3 : 0) + (hash01(p.id) - 0.5) * 6;
    if (p.ovr - br >= 10 && bp < cp) s -= 5;
    if (s >= 1) return { lvl: 3, label: 'Keen', wm: 1 };
    if (s >= -3) return { lvl: 2, label: 'Open', wm: 1.1 };
    if (s >= -7) return { lvl: 1, label: 'Reluctant', wm: 1.35 };
    return { lvl: 0, label: 'Not interested', wm: 0 };
  }
  const wageDemand = (p, it) => niceWage(Math.max(p.wage || 0, wageFor(p)) * (it.wm || 1));
  function wageBill() {
    const c = C();
    const own = S.clubs[c.clubId].pids.reduce((s, id) => s + (S.players[id].wage || 0), 0);
    return own + (c.loans || []).reduce((s, id) => { const p = S.players[id]; return s + (p && p.loan ? Math.round((p.wage || 0) * p.loan.pct / 100) : 0); }, 0);
  }

  function movePlayer(p, toClubId) {
    const from = S.clubs[p.clubId];
    if (from) from.pids = from.pids.filter((id) => id !== p.id);
    p.clubId = toClubId;
    S.clubs[toClubId].pids.push(p.id);
    if (isClub(from) && (from.id !== C().clubId || isPlayerMode()) && from.pids.length < 18) fillSquad(S, from, 18);
    invalidate();
  }
  function talk(pid) {
    const c = C(), k = windowInfo().key;
    let t = c.talks[pid];
    if (!t || t.key !== k) t = c.talks[pid] = { key: k, bids: 0, blocked: false, agreed: 0, counter: 0 };
    return t;
  }
  // The user's bid for a player. Returns the club's response.
  function submitBid(pid, amount) {
    const c = C(), p = S.players[pid];
    const t = talk(pid);
    if (t.blocked) return { status: 'ended', msg: `${clubName(p.clubId)} have ended talks until the next window.` };
    if (amount > S.clubs[c.clubId].budget) return { status: 'error', msg: 'That is more than your transfer budget.' };
    const val = clubValuation(p, c.clubId);
    t.bids++;
    if (amount >= val) { t.agreed = amount; return { status: 'accepted', msg: `${p.clubId === 'FA' ? 'Signing fee agreed' : `${clubName(p.clubId)} accept your offer`} of ${money(amount)}.` }; }
    if (amount < val * 0.6) { t.blocked = true; return { status: 'ended', msg: `${clubName(p.clubId)} found that offer insulting and ended talks until the next window.` }; }
    if (t.bids >= 3) { t.blocked = true; return { status: 'ended', msg: `After three rejected bids, ${clubName(p.clubId)} have ended talks until the next window.` }; }
    if (amount >= val * 0.85) { t.counter = val; return { status: 'counter', msg: `${clubName(p.clubId)} reject the offer but would accept ${money(val)}.` }; }
    return { status: 'rejected', msg: `${clubName(p.clubId)} reject the offer: it is well below their valuation. (${3 - t.bids} bid${3 - t.bids === 1 ? '' : 's'} left this window)` };
  }
  /* --- Contracts & wage negotiation --- */
  const contractLabel = (p) => (p.contract ? `Jun ${p.contract + 1}` : '—');
  const expiring = (p) => p.contract <= C().season;
  // What a player asks for: signings depend on how keen he is, renewals on his importance and form.
  function wageAsk(p, ctx) {
    let base = Math.max(p.wage || 0, wageFor(p));
    if (ctx === 'sign') base *= interest(p, C().clubId).wm || 1.1;
    else {
      const r = squadRank(p);
      base *= r < 3 ? 1.25 : r < 11 ? 1.12 : 1;
      if (p.form > 0.8) base *= 1.05;
      if (p.age >= 31) base *= 0.95;
    }
    return niceWage(base);
  }
  // Young players prefer shorter deals (to earn more later); older players want security.
  const yearsFactor = (p, years) => 1 + (p.age <= 23 ? 0.03 : p.age >= 30 ? -0.04 : 0) * (years - 3);
  function wageTalk(p, t, offer, years, ctx) {
    const w = t.w || (t.w = { bids: 0, blocked: false, counter: 0 });
    if (w.blocked) return { status: 'ended', msg: `${p.name} is not willing to talk any more.` };
    const demand = niceWage(wageAsk(p, ctx) * yearsFactor(p, years));
    const floor = demand * (0.9 + hash01(p.id + 'w') * 0.07); // how far his agent will quietly come down
    w.bids++;
    if (offer >= floor) { w.agreed = { wage: offer, years }; w.counter = 0; return { status: 'accepted', msg: `Agreed! ${p.name} accepts ${money(offer)} a week for ${years} year${years > 1 ? 's' : ''}.` }; }
    if (w.bids >= 3) { w.blocked = true; return { status: 'ended', msg: `${p.name}'s agent walks away after three offers that were too low.` }; }
    if (offer >= demand * 0.78) { w.counter = demand; w.counterYears = years; return { status: 'counter', msg: `${p.name}'s agent wants ${money(demand)} a week on a ${years}-year deal. (${3 - w.bids} offer${3 - w.bids === 1 ? '' : 's'} left)` }; }
    return { status: 'rejected', msg: `${p.name}'s agent rejects that straight away. He is looking for around ${money(demand)} a week. (${3 - w.bids} offer${3 - w.bids === 1 ? '' : 's'} left)` };
  }
  function renewTalk(pid) {
    const c = C();
    c.renew = c.renew || {};
    let t = c.renew[pid];
    if (!t || t.season !== c.season) t = c.renew[pid] = { season: c.season };
    return t;
  }
  function completeRenewal(pid) {
    const c = C(), p = S.players[pid], a = renewTalk(pid).w?.agreed;
    if (!a) return toast('Agree terms first.', 'bad');
    if (wageBill() - (p.wage || 0) + a.wage > c.wageBudget) return toast('That wage does not fit your wage budget.', 'bad');
    p.wage = a.wage; p.contract = c.season + a.years;
    delete c.renew[pid];
    news(`✍️ ${p.name} signs a new contract until ${contractLabel(p)} on ${money(p.wage)} a week.`, 'good');
    save();
    toast(`${p.name} has renewed his contract.`, 'good');
    return true;
  }
  // Player career: the club has a hidden maximum it will pay you.
  function clubWageTalk(o, ask) {
    o.max = o.max || niceWage(o.wage * (1.12 + hash01(o.id) * 0.25));
    o.bids = (o.bids || 0) + 1;
    if (ask <= o.max) { o.wage = Math.max(o.wage, ask); o.agreed = true; return { status: 'accepted', msg: `${clubName(o.clubId)} agree to ${money(o.wage)} a week.` }; }
    if (o.bids >= 3) { o.withdrawn = true; return { status: 'ended', msg: `${clubName(o.clubId)} lose patience and withdraw the offer.` }; }
    if (ask <= o.max * 1.2) { o.wage = o.max; return { status: 'counter', msg: `${clubName(o.clubId)} come back with their final offer: ${money(o.max)} a week.` }; }
    return { status: 'rejected', msg: `${clubName(o.clubId)} say that is far too much. The offer stays at ${money(o.wage)} a week.` };
  }
  function signingBlocker(p) {
    const c = C(), me = S.clubs[c.clubId];
    if (p.clubId !== 'FA' && !windowInfo().open) return `The transfer window is closed (${windowInfo().label.split('· ')[1] || ''}). Free agents can still be signed.`;
    if (me.pids.length >= MAX_SQUAD) return `Your squad is full (${MAX_SQUAD} players). Sell or release someone first.`;
    const it = interest(p, c.clubId);
    if (it.lvl === 0) return `${p.name} does not want to join ${me.name}. Bigger clubs, European football or a stronger squad would change his mind.`;
    return null;
  }
  function completeSigning(pid) {
    const c = C(), p = S.players[pid], me = S.clubs[c.clubId];
    const t = talk(pid);
    const fee = t.agreed;
    const err = signingBlocker(p);
    if (err) return toast(err, 'bad');
    if (!fee && p.clubId !== 'FA') return toast('Agree a fee first.', 'bad');
    if (me.budget < fee) return toast('Not enough transfer budget.', 'bad');
    const terms = t.w?.agreed;
    if (!terms) return toast('Agree personal terms (wage and contract length) first.', 'bad');
    const wage = terms.wage;
    if (wageBill() + wage > c.wageBudget) return toast(`${money(wage)}/wk doesn't fit your wage budget. Sell players to free up wages.`, 'bad');
    const from = S.clubs[p.clubId];
    const fromName = from ? from.name : 'Free agency';
    me.budget -= fee;
    if (from && from.id !== 'FA') from.budget += fee;
    movePlayer(p, c.clubId);
    p.wage = wage; p.contract = c.season + terms.years; p.inj = 0; p.sus = 0;
    delete c.talks[pid];
    c.transfers.unshift({ season: c.season, date: curDate(), pid, name: p.name, dir: 'in', club: fromName, fee });
    news(`✍️ Signed ${p.name} (${p.pos}, ${p.ovr}) from ${fromName} for ${money(fee)} on ${money(wage)} a week until ${contractLabel(p)}.`, 'good');
    save();
    toast(`${p.name} has joined ${me.name}!`, 'good');
    return true;
  }
  function aiBuyers(p) {
    const c = C();
    const clubs = Object.values(S.clubs).filter((cl) => isClub(cl) && cl.id !== c.clubId && cl.pids.length < 32);
    const fits = clubs.filter((cl) => { const r = clubRating(cl.id); return r >= p.ovr - 9 && r <= p.ovr + 5; });
    return shuffle(fits.length ? fits : clubs);
  }
  function sellOffers(p) {
    const v = playerValue(p);
    const offers = [];
    for (const cl of aiBuyers(p)) {
      const amount = niceRound(v * (0.8 + rand() * 0.4));
      if (cl.budget >= amount) offers.push({ clubId: cl.id, amount });
      if (offers.length >= 3) break;
    }
    return offers.sort((a, b) => b.amount - a.amount);
  }
  function canSell(p) {
    const c = C(), me = S.clubs[c.clubId];
    if (me.pids.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players in your squad.`;
    if (p.pos === 'GK' && me.pids.filter((id) => S.players[id].pos === 'GK').length <= 1) return 'You cannot sell your last goalkeeper.';
    return null;
  }
  function sellPlayer(pid, clubId, amount) {
    const c = C(), p = S.players[pid], me = S.clubs[c.clubId];
    const err = canSell(p);
    if (err) return toast(err, 'bad');
    const buyer = S.clubs[clubId];
    me.budget += amount;
    if (buyer.id !== 'FA') buyer.budget -= amount;
    movePlayer(p, clubId);
    if (clubId !== 'FA') { p.wage = wageFor(p); p.contract = c.season + randInt(2, 5); }
    c.offers = c.offers.filter((o) => o.pid !== pid);
    cleanLineup();
    c.transfers.unshift({ season: c.season, date: curDate(), pid, name: p.name, dir: 'out', club: buyer.name, fee: amount });
    news(amount ? `Sold ${p.name} to ${buyer.name} for ${money(amount)}.` : `Released ${p.name}.`, 'info');
    save();
    toast(amount ? `${p.name} sold to ${buyer.name} for ${money(amount)}.` : `${p.name} released.`, 'good');
  }
  /* --- Loans: send a player out for a season to get games; he returns in the summer --- */
  const MAX_LOANS = 8;
  const loanedOut = () => (C().loans || []).map((id) => S.players[id]).filter((p) => p && p.loan);
  // Loans agreed from June onwards cover next season.
  function loanSeason() { const c = C(); return c.seasonOver || curDate() >= `${c.season + 1}-06-01` ? c.season + 1 : c.season; }
  function canLoan(p) {
    if (!windowInfo().open) return 'Loans can only be agreed while a transfer window is open.';
    if (loanedOut().length >= MAX_LOANS) return `You already have ${MAX_LOANS} players out on loan.`;
    if (p.contract < loanSeason()) return 'His contract ends before the loan would finish. Renew it first.';
    return canSell(p);
  }
  function loanOffers(p) {
    const c = C(), val = playerValue(p);
    const clubs = Object.values(S.clubs).filter((cl) => isClub(cl) && cl.id !== c.clubId && cl.pids.length && cl.pids.length < 30);
    const fits = clubs.filter((cl) => { const r = clubRating(cl.id); return r >= p.ovr - 8 && r <= p.ovr + 3; });
    const young = p.age <= 23;
    return shuffle(fits).slice(0, 12).map((cl) => {
      const role = roleAt(cl.id, p), starter = role.startsWith('Starter');
      const rich = cl.budget > 30e6;
      return {
        clubId: cl.id, role, starter,
        pct: clamp(Math.round((starter ? 20 : 45) + (rich ? -15 : 10) + randInt(-10, 10)) , 0, 90), // your share of his wages
        fee: rand() < 0.4 ? niceRound(val * (0.03 + rand() * 0.07)) : 0,
        buy: !young && rand() < 0.35 && cl.budget > val ? niceRound(val * (1.05 + rand() * 0.25)) : 0,
      };
    }).sort((a, b) => (b.starter - a.starter) || (clubRating(b.clubId) - clubRating(a.clubId))).slice(0, 5);
  }
  function loanPlayer(pid, o) {
    const c = C(), p = S.players[pid], to = S.clubs[o.clubId];
    const err = canLoan(p);
    if (err) return toast(err, 'bad');
    movePlayer(p, to.id);
    p.loan = { from: c.clubId, pct: o.pct, season: loanSeason(), ovr: p.ovr, buy: o.buy || 0 };
    (c.loans = c.loans || []).push(pid);
    if (o.fee) { S.clubs[c.clubId].budget += o.fee; to.budget -= o.fee; }
    c.offers = c.offers.filter((x) => x.pid !== pid);
    cleanLineup();
    c.transfers.unshift({ season: c.season, date: curDate(), pid, name: p.name, dir: 'out', club: to.name + ' (loan)', fee: o.fee || 0 });
    news(`🔄 ${p.name} joins ${to.name} on loan until the end of the ${seasonLabel(p.loan.season)} season. You pay ${o.pct}% of his wages.`, 'transfer');
    save();
    toast(`${p.name} loaned to ${to.name}.`, 'good');
  }
  // Brings a loanee home; `sold` is the fee when the loan club takes up its option to buy.
  function endLoan(p, sold) {
    const c = C(), club = S.clubs[p.clubId], from = S.clubs[c.clubId];
    const line = `${p.st.apps} apps, ${p.st.goals} goals${p.st.apps ? `, avg ${avgRating(p).toFixed(2)}` : ''}, OVR ${p.loan.ovr} → ${p.ovr}`;
    c.loans = (c.loans || []).filter((id) => id !== p.id);
    p.loanClub = club.name;
    if (sold) {
      from.budget += sold; club.budget -= sold;
      p.contract = c.season + randInt(2, 4);
      c.transfers.unshift({ season: c.season, date: curDate(), pid: p.id, name: p.name, dir: 'out', club: club.name, fee: sold });
      news(`💰 ${club.name} take up their option and sign ${p.name} for ${money(sold)} (${line}).`, 'transfer');
    } else {
      movePlayer(p, c.clubId);
      news(`↩️ ${p.name} returns from his loan at ${club.name}: ${line}.`, p.ovr > p.loan.ovr ? 'good' : 'info');
    }
    p.loan = null;
    invalidate();
  }
  function recallLoan(pid) {
    const p = S.players[pid];
    if (!p || !p.loan) return;
    if (!windowInfo().open) return toast('You can only recall a player while a transfer window is open.', 'bad');
    if (S.clubs[C().clubId].pids.length >= MAX_SQUAD) return toast('Your squad is full.', 'bad');
    endLoan(p, 0);
    save();
  }
  function returnLoans() {
    const c = C();
    for (const p of loanedOut()) {
      if (p.loan.season > c.season) continue;
      const buyer = S.clubs[p.clubId];
      const played = p.st.apps >= 10 && avgRating(p) >= 6.8;
      endLoan(p, p.loan.buy && played && buyer.budget >= p.loan.buy && rand() < 0.65 ? p.loan.buy : 0);
    }
  }

  function maybeIncomingOffer() {
    const c = C();
    if (rand() > 0.1) return;
    if (isPlayerMode()) {
      const o = playerOffers(1)[0];
      if (o && !c.offers.some((x) => x.clubId === o.clubId)) { c.offers.push(o); news(`📨 ${clubName(o.clubId)} want to sign you. See the offer on your Home screen.`, 'offer'); }
      return;
    }
    const mine = S.clubs[c.clubId].pids.map((id) => S.players[id]).filter((p) => !p.gen || p.ovr >= 70);
    const p = weighted(mine, (p) => Math.pow(p.ovr / 70, 8) * (p.form > 0 ? 1.5 : 1));
    if (!p || c.offers.some((o) => o.pid === p.id)) return;
    const buyer = aiBuyers(p)[0];
    if (!buyer) return;
    const amount = niceRound(playerValue(p) * (0.95 + rand() * 0.4));
    if (buyer.budget < amount) return;
    c.offers.push({ id: 'o' + c.dayIdx + '-' + randInt(0, 99999), pid: p.id, clubId: buyer.id, amount, until: c.dayIdx + 3 });
    news(`${buyer.name} have bid ${money(amount)} for ${p.name}. Respond on the Home screen.`, 'offer');
  }
  /* --- Player career: clubs that want you, and moving --- */
  const isPlayerMode = () => !!(S && S.career && S.career.mode === 'player');
  const me = () => S.players[C().pid];
  function roleAt(clubId, p) {
    const club = S.clubs[clubId];
    const f = club.formation || pickFormation(club);
    const pids = club.pids.includes(p.id) ? club.pids : club.pids.concat(p.id);
    const ids = bestXI(pids, f, { bias: { [p.id]: 3 }, ignoreAvail: true });
    const si = ids.indexOf(p.id);
    return si >= 0 ? `Starter (${FORMATIONS[f][si][0]})` : 'Squad player';
  }
  function playerOffers(n) {
    const c = C(), p = me();
    const fee = niceRound(playerValue(p) * 1.1);
    const cur = prestige(c.clubId);
    const clubs = Object.values(S.clubs).filter((cl) => isClub(cl) && cl.id !== c.clubId && cl.pids.length && cl.budget >= fee && !c.offers.some((o) => o.clubId === cl.id));
    const fits = clubs.filter((cl) => { const r = clubRating(cl.id); return r >= p.ovr - 7 && r <= p.ovr + 3 && prestige(cl.id) >= cur - 6; });
    fits.sort((a, b) => prestige(b.id) - prestige(a.id));
    return shuffle(fits.slice(0, 8)).slice(0, n).map((cl) => ({
      id: 'o' + c.dayIdx + '-' + randInt(0, 99999), clubId: cl.id, amount: niceRound(fee * (0.95 + rand() * 0.2)),
      wage: niceWage(wageFor(p) * (1.1 + rand() * 0.4)), years: randInt(3, 5), until: c.dayIdx + 4, role: roleAt(cl.id, p),
    }));
  }
  function joinClub(o) {
    const c = C(), p = me(), from = S.clubs[c.clubId], to = S.clubs[o.clubId];
    if (!windowInfo().open) return toast('The transfer window is closed.', 'bad');
    from.budget += o.amount; to.budget -= o.amount;
    movePlayer(p, to.id);
    p.wage = o.wage;
    p.contract = c.season + (o.years || 4);
    c.clubId = to.id; c.leagueId = to.leagueId; c.offers = [];
    if (from.pids.length < 18) fillSquad(S, from, 18);
    c.transfers.unshift({ season: c.season, date: curDate(), pid: p.id, name: p.name, dir: 'in', club: from.name, to: to.name, fee: o.amount });
    news(`✍️ You joined ${to.name} from ${from.name} for ${money(o.amount)}, earning ${money(o.wage)} a week.`, 'good');
    invalidate();
    save();
    toast(`Welcome to ${to.name}!`, 'good');
  }

  // AI clubs strengthen their weakest position by buying from clubs of similar or lower stature.
  function aiTransfers(n) {
    const c = C();
    const clubs = Object.values(S.clubs).filter((cl) => isClub(cl) && (isPlayerMode() || cl.id !== c.clubId) && cl.budget > 3e6 && cl.pids.length);
    const all = Object.values(S.players);
    for (let i = 0; i < n; i++) {
      const buyer = weighted(clubs, (cl) => Math.sqrt(cl.budget));
      if (!buyer) return;
      if (!buyer.formation) buyer.formation = pickFormation(buyer);
      const slots = FORMATIONS[buyer.formation];
      const xi = bestXI(buyer.pids, buyer.formation, { ignoreAvail: true });
      let wi = 0, we = 99;
      xi.forEach((id, k) => { const e = id ? eff(S.players[id], slots[k][0]) : 0; if (e < we) { we = e; wi = k; } });
      const pos = slots[wi][0];
      const bp = prestige(buyer.id);
      let best = null, bs = -1e9, fee = 0;
      for (let t = 0; t < 250; t++) {
        const p = all[Math.floor(rand() * all.length)];
        if (!p || !S.players[p.id] || p.loan || p.clubId === buyer.id || (isPlayerMode() ? p.id === c.pid : p.clubId === c.clubId) || (p.clubId !== 'FA' && !isClub(S.clubs[p.clubId]))) continue;
        if (fit(p.pos, pos) < -1 || p.ovr < we + 2 || p.ovr > we + 12 || p.age > 31) continue;
        if (p.clubId !== 'FA' && (prestige(p.clubId) > bp + 2 || isUntouchable(p))) continue;
        const f = p.clubId === 'FA' ? niceRound(playerValue(p) * 0.3) : niceRound(clubValuation(p, buyer.id) * (0.95 + rand() * 0.15));
        if (f > buyer.budget * 0.75) continue;
        const sc = p.ovr + rand() * 3 - f / 5e7;
        if (sc > bs) { bs = sc; best = p; fee = f; }
      }
      if (!best) continue;
      const from = S.clubs[best.clubId];
      buyer.budget -= fee;
      if (from.id !== 'FA') from.budget += fee;
      movePlayer(best, buyer.id);
      best.wage = wageFor(best);
      best.contract = c.season + randInt(2, 5);
      // Keep squads a sensible size: the weakest surplus player is released.
      if (buyer.pids.length > 28) {
        const cut = buyer.pids.map((id) => S.players[id]).filter((x) => !x.loan).sort((a, b) => a.ovr - b.ovr)[0];
        if (cut && cut.id !== best.id) movePlayer(cut, 'FA');
      }
      const item = { date: curDate(), pid: best.id, name: best.name, pos: best.pos, ovr: best.ovr, from: from.name, to: buyer.name, fee };
      c.tnews.unshift(item);
      c.tnews.length = Math.min(c.tnews.length, 80);
      if (fee >= 40e6 || buyer.leagueId === c.leagueId || from.leagueId === c.leagueId) {
        news(`🔁 ${best.name} joins ${buyer.name} from ${from.name}${fee ? ` for ${money(fee)}` : ' on a free'}.`, 'transfer');
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Import / export (FC 26 ratings)
   * ------------------------------------------------------------------ */
  function parseCSV(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((x) => x.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
  }
  const HEADERS = {
    name: ['name', 'player', 'player name', 'player_name', 'known as', 'known_as', 'common name', 'common_name', 'full name', 'fullname'],
    long: ['long_name', 'long name'],
    short: ['short_name', 'short name'],
    club: ['club', 'club_name', 'club name', 'team', 'team_name', 'team name', 'squad'],
    league: ['league', 'league_name', 'league name', 'competition'],
    pos: ['pos', 'position', 'positions', 'player_positions', 'best position', 'best_position', 'preferred positions', 'preferred_positions'],
    ovr: ['ovr', 'overall', 'rating', 'overall rating', 'overall_rating', 'ovr rating'],
    age: ['age'],
  };
  function rowsToRecords(text) {
    text = text.trim();
    if (!text) return [];
    if (text[0] === '[' || text[0] === '{') {
      let data = JSON.parse(text);
      if (!Array.isArray(data)) data = data.players || data.data || [];
      return data.map((o) => {
        const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().trim(), v]));
        const rec = {};
        for (const [key, alts] of Object.entries(HEADERS)) { const k = alts.find((a) => lower[a] !== undefined); if (k) rec[key] = lower[k]; }
        return rec;
      });
    }
    const rows = parseCSV(text);
    const head = rows[0].map((h) => h.toLowerCase().trim());
    const idx = {};
    for (const [key, alts] of Object.entries(HEADERS)) { const i = head.findIndex((h) => alts.includes(h)); if (i >= 0) idx[key] = i; }
    let body = rows.slice(1);
    if (idx.ovr === undefined || (idx.name === undefined && idx.long === undefined && idx.short === undefined)) {
      // No recognisable header: assume the template order Name,Club,Position,OVR,Age,League
      Object.assign(idx, { name: 0, club: 1, pos: 2, ovr: 3, age: 4, league: 5 });
      if (isNaN(parseInt(rows[0][3], 10)) === false) body = rows;
    }
    return body.map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, (r[i] ?? '').trim()])));
  }
  const POS_ALIASES = { CF: 'ST', LF: 'LW', RF: 'RW', SW: 'CB', LCB: 'CB', RCB: 'CB', LCM: 'CM', RCM: 'CM', LDM: 'CDM', RDM: 'CDM', DM: 'CDM', AM: 'CAM', LS: 'ST', RS: 'ST', G: 'GK', GKP: 'GK' };
  function parsePos(s) {
    const t = String(s || '').toUpperCase().split(/[\s,/|;]+/).filter(Boolean)[0] || '';
    const p = POS_ALIASES[t] || t;
    return POSITIONS.includes(p) ? p : null;
  }
  const CLUB_STOP = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'afc', 'club', 'de', 'calcio', '1', 'sv', 'vfl', 'vfb', 'tsg', 'rc', 'ssc', 'ogc', 'cd', 'ud', 'rcd', 'ca', 'sl', 'cp', 'losc', 'the', 'and', 'hove', 'albion', 'fsv', '04', '05', '29', 'bc', 'us', 'ss', 'acf', 'sad']);
  const CLUB_ALIAS = {
    'man utd': 'manchester united', 'manchester utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city', spurs: 'tottenham hotspur', tottenham: 'tottenham hotspur',
    wolves: 'wolverhampton wanderers', 'nott m forest': 'nottingham forest', "nott'm forest": 'nottingham forest', 'paris sg': 'paris saint germain', psg: 'paris saint germain',
    'inter milan': 'inter', internazionale: 'inter', 'fc internazionale milano': 'inter', 'bayern munich': 'fc bayern munchen', 'fc bayern': 'fc bayern munchen',
    'atletico madrid': 'atletico de madrid', 'atl madrid': 'atletico de madrid', 'barcelona': 'fc barcelona', 'milan': 'ac milan', 'olympique lyon': 'olympique lyonnais', lyon: 'olympique lyonnais',
    marseille: 'olympique de marseille', 'mgladbach': 'borussia monchengladbach', "m'gladbach": 'borussia monchengladbach', gladbach: 'borussia monchengladbach', leverkusen: 'bayer 04 leverkusen',
    'bayer leverkusen': 'bayer 04 leverkusen', dortmund: 'borussia dortmund', leipzig: 'rb leipzig', 'athletic bilbao': 'athletic club', 'betis': 'real betis', 'celta vigo': 'rc celta',
    'sporting': 'sporting cp', 'sporting lisbon': 'sporting cp', benfica: 'sl benfica', porto: 'fc porto', 'psv eindhoven': 'psv',
  };
  const clubKey = (s) => norm(s).split(' ').filter((t) => !CLUB_STOP.has(t)).join(' ');
  function findClub(state, name, leagueId) {
    if (!name) return null;
    const n = norm(name);
    const target = CLUB_ALIAS[n] || n;
    const clubs = Object.values(state.clubs).filter((c) => isClub(c));
    let hit = clubs.find((c) => norm(c.name) === target) || clubs.find((c) => clubKey(c.name) === clubKey(target) && clubKey(target));
    if (hit) return hit;
    const toks = clubKey(target).split(' ').filter((t) => t.length >= 4);
    if (!toks.length) return null;
    let best = null, bs = 0, tie = false;
    for (const c of clubs) {
      const ct = new Set(clubKey(c.name).split(' '));
      let s = toks.filter((t) => ct.has(t)).length;
      if (s && leagueId && c.leagueId === leagueId) s += 0.5;
      if (s > bs) { bs = s; best = c; tie = false; } else if (s === bs && s > 0) tie = true;
    }
    return tie ? null : best;
  }
  function findLeague(state, name) {
    const n = norm(name);
    if (!n) return null;
    const rules = [['ENG', /premier/], ['ESP', /la ?liga|primera division/], ['ITA', /serie a|calcio a/], ['GER', /^(1 )?bundesliga|german 1/], ['FRA', /ligue 1|french ligue/], ['POR', /liga portugal|primeira|portugal/], ['NED', /eredivisie|dutch/]];
    for (const [id, re] of rules) if (re.test(n) && state.leagues[id]) return state.leagues[id];
    return Object.values(state.leagues).find((l) => norm(l.name) === n) || null;
  }
  function buildNameIndex(state) {
    const full = new Map(), init = new Map(), last = new Map();
    const add = (m, k, p) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(p); };
    for (const p of Object.values(state.players)) {
      if (p.gen) continue;
      const n = norm(p.name); const t = n.split(' ');
      add(full, n, p);
      if (t.length > 1) { add(init, `${t[0][0]} ${t.slice(1).join(' ')}`, p); add(init, `${t[0][0]} ${t[t.length - 1]}`, p); }
      add(last, t[t.length - 1], p);
    }
    return { full, init, last };
  }
  function matchPlayer(idx, rec, club) {
    const names = [rec.name, rec.long, rec.short].filter(Boolean).map(norm);
    const prefer = (list) => {
      if (!list || !list.length) return null;
      if (club) { const c = list.filter((p) => p.clubId === club.id); if (c.length === 1) return c[0]; if (c.length > 1) return null; }
      return list.length === 1 ? list[0] : null;
    };
    for (const n of names) {
      const t = n.split(' ');
      const tries = [idx.full.get(n), idx.init.get(n)];
      if (t.length > 2) { tries.push(idx.full.get(`${t[0]} ${t[1]}`)); tries.push(idx.full.get(`${t[0]} ${t[t.length - 1]}`)); }
      for (const tr of tries) { const p = prefer(tr); if (p) return p; }
    }
    if (club) {
      for (const n of names) {
        const t = n.split(' ');
        for (const tok of t.slice(t.length > 1 ? 1 : 0)) {
          const c = (idx.last.get(tok) || []).filter((p) => p.clubId === club.id);
          if (c.length === 1) return c[0];
        }
      }
    }
    return null;
  }
  function importRecords(state, records, opts) {
    const rep = { updated: 0, added: 0, moved: 0, clubsCreated: 0, leaguesCreated: 0, skipped: 0, errors: [] };
    const idx = buildNameIndex(state);
    const inCareer = !!state.career;
    const touched = new Set();
    for (const rec of records) {
      const ovr = parseInt(rec.ovr, 10);
      const displayName = rec.name || (rec.long && rec.long.split(' ').length <= 3 ? rec.long : rec.short || rec.long);
      if (!displayName || !(ovr >= 1 && ovr <= 99)) { rep.skipped++; continue; }
      let league = rec.league ? findLeague(state, rec.league) : null;
      let club = findClub(state, rec.club, league?.id);
      const p = matchPlayer(idx, rec, club);
      const pos = parsePos(rec.pos);
      const age = parseInt(rec.age, 10);
      if (p) {
        p.ovr = ovr;
        if (pos) p.pos = pos;
        if (age >= 15 && age <= 45) p.age = age;
        rep.updated++;
        if (opts.move && club && club.id !== p.clubId && !(inCareer && (p.clubId === state.career.clubId || club.id === state.career.clubId))) {
          const from = state.clubs[p.clubId];
          if (from) from.pids = from.pids.filter((id) => id !== p.id);
          p.clubId = club.id; club.pids.push(p.id); rep.moved++;
          touched.add(club.id); if (from) touched.add(from.id);
        }
        continue;
      }
      if (!opts.add) { rep.skipped++; continue; }
      if (!club && rec.club && opts.create) {
        if (!league && rec.league) {
          const id = 'L' + norm(rec.league).replace(/ /g, '').slice(0, 8).toUpperCase() + Object.keys(state.leagues).length;
          league = state.leagues[id] = { id, name: String(rec.league).trim(), country: '', pool: 'world', clubIds: [] };
          state.leagueOrder.push(id); rep.leaguesCreated++;
        }
        if (league && !(inCareer && league.id === state.career.leagueId)) {
          const id = `${league.id}-${league.clubIds.length}-${Object.keys(state.clubs).length}`;
          club = state.clubs[id] = { id, name: String(rec.club).trim(), short: String(rec.club).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), leagueId: league.id, pids: [], level: 0, budget: 0, formation: null };
          league.clubIds.push(id); rep.clubsCreated++;
        }
      }
      if (!club) { rep.skipped++; if (rep.errors.length < 8) rep.errors.push(`${displayName}: club "${rec.club || '?'}" not found`); continue; }
      if (inCareer && club.id === state.career.clubId) { rep.skipped++; continue; }
      const np = addPlayer(state, { name: String(displayName).trim(), pos: pos || 'CM', ovr, age: age || 25, clubId: club.id });
      idx.full.set(norm(np.name), [np]);
      touched.add(club.id);
      rep.added++;
    }
    // Remove surplus generated players from clubs that received real ones.
    for (const id of touched) {
      const club = state.clubs[id];
      if (!club || id === 'FA') continue;
      const gens = club.pids.filter((pid) => state.players[pid].gen);
      while (club.pids.length > 26 && gens.length) {
        const g = gens.pop();
        club.pids = club.pids.filter((x) => x !== g);
        delete state.players[g];
      }
      club.level = club.pids.length >= 6 ? computeLevel(state, club) : club.level;
    }
    return rep;
  }
  function exportCSV(state) {
    const lines = ['Name,Club,Position,OVR,Age,League'];
    const q = (s) => (/[",]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    for (const lid of state.leagueOrder) {
      const L = state.leagues[lid];
      for (const cid of L.clubIds) {
        const club = state.clubs[cid];
        for (const pid of club.pids) {
          const p = state.players[pid];
          if (p.gen) continue;
          lines.push([q(p.name), q(club.name), p.pos, p.ovr, p.age, q(L.name)].join(','));
        }
      }
    }
    return lines.join('\n');
  }
  // Shows the text in a panel with Copy and Download buttons. Downloads are
  // blocked in some embedded viewers, so copying is always available.
  let exportFile = null;
  function download(name, text, type = 'text/csv') {
    exportFile = { name, text, type };
    openModal(`
      <h2>${esc(name)}</h2>
      <p class="muted small">Copy the text below and save it as <code>${esc(name)}</code>, or try the download button.</p>
      <textarea id="export-text" class="input textarea" rows="10" readonly>${esc(text)}</textarea>
      <div class="row gap wrap"><button class="btn primary" data-act="export-copy">Copy to clipboard</button><button class="btn ghost" data-act="export-dl">Download file</button><button class="btn ghost" data-act="close">Close</button></div>`, true);
  }
  function exportCopy() {
    const ta = $('#export-text');
    const done = () => toast('Copied to clipboard.', 'good');
    const fallback = () => { ta.focus(); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Text selected. Press Ctrl+C (Cmd+C) to copy it.', 'info'); } };
    try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (e) { fallback(); }
  }
  function exportDownload() {
    if (!exportFile) return;
    try {
      const blob = new Blob([exportFile.text], { type: exportFile.type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = exportFile.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { /* blocked: the copy button still works */ }
    toast('If nothing downloaded, use "Copy to clipboard" instead.', 'info');
  }

  // In-page confirmation (browser confirm() dialogs are blocked in some viewers).
  let pendingConfirm = null;
  function askConfirm(msg, fn, okLabel = 'Confirm') {
    pendingConfirm = fn;
    openModal(`<h2>Are you sure?</h2><p>${esc(msg)}</p><div class="row gap mt"><button class="btn primary" data-act="confirm-yes">${esc(okLabel)}</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */
  // Compact JSON: long decimals are rounded, which keeps the save well inside browser storage limits.
  // Zero/false player fields are left out and restored by ensureFields() on load.
  const P_ZERO = new Set(['gen', 'inj', 'sus', 'form', 'xp']);
  const ST_ZERO = new Set(['apps', 'goals', 'assists', 'yc', 'rc', 'rsum', 'motm', 'cs']);
  const serialize = (o) => JSON.stringify(o, function (k, v) {
    if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 100) / 100;
    if ((v === 0 || v === false) && ((P_ZERO.has(k) && this.pos && 'clubId' in this) || (ST_ZERO.has(k) && 'rsum' in this))) return undefined;
    if (this && this.pos && 'clubId' in this && ((k === 'ovr0' && v === this.ovr) || (k === 'cg' && !Object.keys(v).length) || v === null)) return undefined;
    return v;
  });
  // Saves are gzip-compressed (built into modern browsers) so long careers fit in browser storage.
  const META_KEY = SAVE_KEY + '_meta';
  async function packSave(text) {
    if (typeof CompressionStream === 'undefined') return 'J' + text;
    const buf = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return 'G' + btoa(bin);
  }
  async function unpackSave(str) {
    if (!str) return null;
    if (str[0] === '{') return JSON.parse(str); // saves from older versions
    if (str[0] === 'J') return JSON.parse(str.slice(1));
    const bytes = Uint8Array.from(atob(str.slice(1)), (ch) => ch.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  function careerMeta(st) {
    const c = st.career;
    return { mode: c.mode || 'manager', pname: c.pid ? st.players[c.pid]?.name : null, club: st.clubs[c.clubId]?.name, league: st.leagues[c.leagueId]?.name, season: c.season, seasonOver: c.seasonOver, date: c.days?.[c.dayIdx]?.date || null };
  }
  let saveChain = Promise.resolve();
  function save() {
    if (!S || !S.career) return;
    const text = serialize(S), meta = JSON.stringify(careerMeta(S));
    saveChain = saveChain.then(() => packSave(text)).then((packed) => {
      localStorage.setItem(SAVE_KEY, packed);
      localStorage.setItem(META_KEY, meta);
    }).catch(() => toast('Could not save the game (browser storage unavailable or full).', 'bad'));
  }
  function loadMeta() {
    try {
      const m = localStorage.getItem(META_KEY);
      if (m) return JSON.parse(m);
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw && raw[0] === '{') { const st = JSON.parse(raw); return st.career ? careerMeta(st) : null; }
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  async function loadCareer() {
    try { await saveChain; return await unpackSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }
  function saveWorld() {
    try { localStorage.setItem(WORLD_KEY, JSON.stringify(W)); } catch (e) { toast('Could not store the imported database in the browser.', 'bad'); }
  }
  function loadWorld() {
    try { const t = localStorage.getItem(WORLD_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * UI helpers
   * ------------------------------------------------------------------ */
  const $ = (s, el = document) => el.querySelector(s);
  const app = () => $('#app');
  let view = 'home';
  const ui = {
    startLeague: null, startClub: null, managerName: '',
    squadSel: null, squadSort: 'pos',
    market: { q: '', league: 'ALL', pos: 'ALL', min: 70, max: 99, price: 0, age: 0, sort: 'ovr', page: 1 },
    fixFilter: 'mine', fixDay: null, compSel: null, statsTab: 'scorers', statsComp: null,
    playback: null, previewKey: null, neg: null, sellOffers: null,
  };
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function toast(msg, type = 'info') {
    const el = $('#toast');
    const t = document.createElement('div');
    t.className = `toast-item ${type}`;
    t.textContent = msg;
    el.appendChild(t);
    while (el.children.length > 3) el.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
    return false;
  }
  function openModal(html, wide) {
    $('#modal-body').innerHTML = html;
    $('#modal .modal-box').classList.toggle('wide', !!wide);
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; ui.neg = null; }

  const ovrClass = (o) => (o >= 85 ? 'o-elite' : o >= 80 ? 'o-gold' : o >= 75 ? 'o-silver' : o >= 68 ? 'o-bronze' : 'o-low');
  const ovrBadge = (o) => `<span class="ovr ${ovrClass(o)}">${o}</span>`;
  const posBadge = (p) => `<span class="pos pos-${LINE[p] || 'MID'}">${p}</span>`;
  const crest = (club, size = '') => {
    if (!club) return '';
    const hue = club.hue ?? [...club.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
    return `<span class="crest ${size}" style="--h:${hue}">${esc((club.short || club.name).slice(0, 4))}</span>`;
  };
  const statusIcons = (p) => (p.inj > 0 ? `<span class="tag bad" title="Injured for ${p.inj} match(es)">INJ ${p.inj}</span>` : '') + (p.sus > 0 ? '<span class="tag warn" title="Suspended">SUS</span>' : '') + (p.away ? '<span class="tag intl" title="Away on international duty">INTL</span>' : '');
  const unavailWhy = (p) => (!p ? 'unavailable' : p.inj > 0 ? 'injured' : p.away ? 'away on international duty' : 'suspended');
  const natTag = (code) => (code && NATIONS[code] ? `<span class="nat" title="${esc(NATIONS[code].name)}">${code}</span>` : '');
  const formDots = (f) => f.slice(-5).map((r) => `<span class="fd fd-${r}">${r}</span>`).join('');
  const playerLink = (p) => `<button class="link" data-act="player" data-id="${p.id}">${esc(p.name)}</button>`;
  const genTag = (p) => (p.gen && p.age <= 21 ? '<span class="tag gen" title="Generated youth player">Academy</span>' : '');
  const compTag = (comp) => (comp ? `<span class="ctag ct-${comp.type} ct-${comp.id}">${esc(comp.type === 'cup' ? comp.name : comp.short)}</span>` : '');
  const delta = (p) => { const d = p.ovr - (p.ovr0 ?? p.ovr); return d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''; };
  // Potential is shown exactly for every player.
  const potBadge = (p) => `<span class="ovr pot ${ovrClass(p.pot)}" title="Potential: the highest OVR he can reach">${p.pot}</span>`;
  const potRange = potBadge;
  const stripLeg = (s) => s.replace(/ · (1st|2nd) leg/, '');
  function scoreText(m) {
    if (!m.played) return '<span class="muted">vs</span>';
    let s = `${m.hg} - ${m.ag}`;
    if (m.pens) s += `<small>${m.pens[0]}-${m.pens[1]} pens</small>`;
    else if (m.et) s += '<small>aet</small>';
    if (m.agg) s += `<small>agg ${m.agg[0]}-${m.agg[1]}</small>`;
    return s;
  }
  const stars = (r) => { const n = clamp(Math.round((r - 64) / 5), 1, 5); return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>'; };

  /* ------------------------------------------------------------------ *
   * Start screen
   * ------------------------------------------------------------------ */
  function customDefaults(L) {
    const cu = (ui.custom = ui.custom || { name: '', short: '', stadium: '', hue: 210, strength: 'mid', budget: 'normal', replace: null });
    if (L && !L.clubIds.includes(cu.replace)) cu.replace = L.clubIds.slice().sort((a, b) => clubRating(a) - clubRating(b))[0];
    return cu;
  }
  function readCustom() {
    const cu = ui.custom;
    if (!cu || !$('#cc-name')) return;
    cu.name = $('#cc-name').value.trim();
    cu.short = $('#cc-short').value.trim().toUpperCase();
    cu.stadium = $('#cc-stadium').value.trim();
    cu.hue = +$('#cc-hue').value;
    cu.strength = $('#cc-strength').value;
    cu.budget = $('#cc-budget')?.value || cu.budget;
    cu.replace = $('#cc-replace').value;
  }
  function renderStart() {
    clearTimers();
    const sc = loadMeta();
    const selL = ui.startLeague && W.leagues[ui.startLeague];
    const pm = ui.startMode === 'player';
    let clubsHtml = '';
    S = W;
    invalidate();
    if (selL) {
      const clubs = selL.clubIds.map((id) => W.clubs[id]).map((c) => ({ c, r: clubRating(c.id) })).sort((a, b) => b.r - a.r);
      const cu = customDefaults(selL);
      clubsHtml = `<h2 class="step"><span>4</span> Choose your club</h2>
        <div class="club-grid">
          <button class="club-card create-card ${ui.startClub === 'NEW' ? 'sel' : ''}" data-act="start-club" data-id="NEW">
            <span class="crest lg create-plus">＋</span>
            <span class="cc-name">Create a club</span>
            <span class="cc-meta muted small">Your name, colours and squad</span>
          </button>${clubs.map(({ c, r }) => `
          <button class="club-card ${ui.startClub === c.id ? 'sel' : ''}" data-act="start-club" data-id="${c.id}">
            ${crest(c, 'lg')}
            <span class="cc-name">${esc(c.name)}</span>
            <span class="cc-meta">${ovrBadge(r)} ${pm ? '' : `<span class="muted">Budget</span> ${money(c.budget)}`}</span>
            <span class="cc-stars">${stars(r)}</span>
          </button>`).join('')}</div>
        ${ui.startClub === 'NEW' ? `
          <div class="create-club">
            <h3>🏗️ Create your club</h3>
            <div class="cc-form">
              <label>Club name<input class="input" id="cc-name" maxlength="28" placeholder="e.g. Riverside United" value="${esc(cu.name)}"></label>
              <label>Short name<input class="input" id="cc-short" maxlength="4" placeholder="RIV" value="${esc(cu.short)}"></label>
              <label>Stadium<input class="input" id="cc-stadium" maxlength="32" placeholder="${esc((cu.name || 'Club') + ' Park')}" value="${esc(cu.stadium)}"></label>
              <label>Badge colour<span class="row gap"><input type="range" id="cc-hue" min="0" max="359" value="${cu.hue}"><span id="cc-preview">${crest({ id: 'NEW', hue: cu.hue, short: cu.short || 'NEW' }, 'lg')}</span></span></label>
              <label>Squad strength<select class="input" id="cc-strength">${Object.entries(CUSTOM_STRENGTH).map(([k, [lab, d]]) => `<option value="${k}" ${cu.strength === k ? 'selected' : ''}>${lab} (${d > 0 ? "+" : ""}${d} OVR)</option>`).join('')}</select></label>
              ${pm ? '' : `<label>Finances<select class="input" id="cc-budget">${Object.entries(CUSTOM_BUDGET).map(([k, [lab, m]]) => `<option value="${k}" ${cu.budget === k ? 'selected' : ''}>${lab} (×${m} budget)</option>`).join('')}</select></label>`}
              <label>Takes the place of<select class="input" id="cc-replace">${clubs.slice().reverse().map(({ c }) => `<option value="${c.id}" ${cu.replace === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            </div>
            <p class="muted small">Your club gets a generated squad built around the strength you pick. The club it replaces leaves the league, and its players become free agents you can try to sign.</p>
          </div>` : ''}`;
    }
    const leagueCards = (tier) => W.leagueOrder.map((id) => W.leagues[id]).filter((l) => (l.tier || 1) === tier).map((l) => `
      <button class="league-card ${ui.startLeague === l.id ? 'sel' : ''}" data-act="start-league" data-id="${l.id}">
        <span class="lc-name">${esc(l.name)}</span><span class="muted small">${esc(l.country || 'Custom')} · ${l.clubIds.length} clubs</span>
      </button>`).join('');
    app().innerHTML = `
      <div class="start">
        <header class="hero">
          <div class="hero-ball">⚽</div>
          <h1>Soccer Manager <span>26</span></h1>
          <p>Manage a club or build your own player's career across 14 European divisions, with domestic cups, European competitions, promotion and relegation.</p>
        </header>
        ${sc ? `
          <div class="card continue">
            <div>
              <div class="muted small">Saved ${sc.mode === 'player' ? 'player' : 'manager'} career</div>
              <strong>${sc.pname ? `${esc(sc.pname)} · ` : ''}${esc(sc.club)}</strong> · ${esc(sc.league)} · ${seasonLabel(sc.season)} · ${sc.seasonOver || !sc.date ? 'Season complete' : fmtDate(sc.date, true)}
            </div>
            <div class="row gap">
              <button class="btn primary" data-act="continue">Continue career</button>
              <button class="btn ghost danger" data-act="delete-save">Delete</button>
            </div>
          </div>` : ''}
        <div class="card">
          <h2 class="step"><span>1</span> Career type</h2>
          <div class="mode-grid">
            <button class="mode-card ${!pm ? 'sel' : ''}" data-act="start-mode" data-id="manager"><strong>🧑‍💼 Manager career</strong><span class="muted small">Pick the XI and tactics, buy and sell players, and manage the budget.</span></button>
            <button class="mode-card ${pm ? 'sel' : ''}" data-act="start-mode" data-id="player"><strong>🏃 Player career</strong><span class="muted small">Create a 17-year-old prospect and earn your place. Grow your OVR and pick which clubs to move to.</span></button>
          </div>
          <h2 class="step"><span>2</span> ${pm ? 'Your player' : 'Manager name'}</h2>
          <div class="row gap wrap">
            <input class="input" id="mgr-name" maxlength="30" placeholder="${pm ? 'Player name' : 'Your name'}" value="${esc(ui.managerName)}">
            ${pm ? `<label class="inline">Position <select class="input" id="start-pos" data-change="start-pos">${POSITIONS.map((x) => `<option ${x === (ui.startPos || 'ST') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
              <label class="inline">Player type <select class="input" id="start-role" data-change="start-role">${ROLE_GROUPS[roleGroup(ui.startPos || 'ST')].map(([id, label]) => `<option value="${id}" ${ui.startRole === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
              <label class="inline">Nationality <select class="input" id="start-nat" data-change="start-nat">${Object.values(NATIONS).sort((a, b) => a.name.localeCompare(b.name)).map((n) => `<option value="${n.code}" ${(ui.startNat || 'ENG') === n.code ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></label>
              <span class="muted small">Starts at 64 OVR, age 17, with high potential.</span>` : ''}
          </div>
          <h2 class="step"><span>3</span> Choose a league</h2>
          <h4>Top divisions</h4><div class="league-grid">${leagueCards(1)}</div>
          <h4>Second divisions</h4><div class="league-grid">${leagueCards(2)}</div>
          ${clubsHtml}
          <div class="start-actions">
            <button class="btn ghost" data-act="open-import">Import FC 26 ratings…</button>
            <button class="btn primary big" data-act="start-career" ${ui.startClub ? '' : 'disabled'}>${pm ? 'Start player career' : 'Start manager career'}${ui.startClub && ui.startClub !== 'NEW' ? ` ${pm ? 'at' : 'with'} ${esc(W.clubs[ui.startClub].name)}` : ui.startClub ? ' with your new club' : ''} →</button>
          </div>
        </div>
        <p class="muted small center">14 leagues (top flights and second divisions), 7 domestic cups, the Champions League, Europa League and Conference League, with 3 clubs promoted and relegated each season. Top-flight ratings are FC 26-style estimates. Second-division squads are generated.</p>
      </div>`;
  }

  /* ------------------------------------------------------------------ *
   * Game shell
   * ------------------------------------------------------------------ */
  const TABS = [['home', 'Home'], ['match', 'Match'], ['squad', 'Squad & Tactics'], ['training', 'Training'], ['transfers', 'Transfers'], ['academy', 'Academy'], ['fixtures', 'Fixtures'], ['comps', 'Competitions'], ['intl', 'International'], ['stats', 'Stats'], ['data', 'Data']];
  const TABS_PLAYER = [['home', 'Home'], ['match', 'Match'], ['career', 'My Career'], ['club', 'Club'], ['fixtures', 'Fixtures'], ['comps', 'Competitions'], ['intl', 'International'], ['stats', 'Stats'], ['data', 'Data']];
  function render() {
    if (!S || !S.career) return renderStart();
    if (view !== 'match' || !ui.playback) clearTimers();
    const c = C(), club = S.clubs[c.clubId];
    const win = windowInfo();
    const date = c.seasonOver ? 'Season complete' : fmtDate(curDate(), true);
    const pm = isPlayerMode(), p = pm ? me() : null;
    if (pm && ['squad', 'transfers', 'academy'].includes(view)) view = 'home';
    if (!pm && ['career', 'club'].includes(view)) view = 'home';
    app().innerHTML = `
      <header class="topbar">
        <div class="tb-club">${crest(club)}<div><div class="tb-name">${esc(pm ? p.name : club.name)}</div><div class="muted small">${pm ? `${p.pos} · ${esc(club.name)}` : esc(S.leagues[c.leagueId].name) + ' · ' + esc(c.manager)}</div></div></div>
        <div class="tb-info">
          <div><span class="muted small">Season</span><strong>${seasonLabel(c.season)}</strong></div>
          <div><span class="muted small">Date</span><strong>${date}</strong></div>
          ${pm ? `<div><span class="muted small">OVR</span><strong>${p.ovr}${delta(p)}</strong></div><div><span class="muted small">Value</span><strong class="money">${money(playerValue(p))}</strong></div>`
               : `<div><span class="muted small">Budget</span><strong class="money">${money(club.budget)}</strong></div>`}
          <div><span class="muted small">Transfers</span><strong class="win ${win.open ? 'open' : 'closed'}">${win.open ? 'Window open' : 'Window closed'}</strong></div>
        </div>
      </header>
      <nav class="tabs">${(pm ? TABS_PLAYER : TABS).map(([id, label]) => `<button class="tab ${view === id ? 'active' : ''}" data-act="tab" data-id="${id}">${label}${id === 'home' && c.offers.length ? `<span class="dot">${c.offers.length}</span>` : ''}</button>`).join('')}</nav>
      <main id="view" class="view">${renderView()}</main>`;
    if (view === 'match' && ui.playback) mountPlayback();
  }
  function renderView() {
    switch (view) {
      case 'match': return viewMatch();
      case 'squad': return viewSquad();
      case 'transfers': return viewTransfers();
      case 'fixtures': return viewFixtures();
      case 'comps': return viewComps();
      case 'stats': return viewStats();
      case 'data': return viewData();
      case 'career': return viewCareer();
      case 'club': return viewClub();
      case 'academy': return viewAcademy();
      case 'training': return viewTraining();
      case 'intl': return viewIntl();
      default: return isPlayerMode() ? viewHomePlayer() : viewHome();
    }
  }
  function go(v) { view = v; if (v !== 'match') ui.playback = null; render(); window.scrollTo(0, 0); }

  function compStatus(comp, id) {
    if (comp.type === 'league') {
      const t = leagueTable(comp.leagueId); const i = t.findIndex((r) => r.id === id);
      return i < 0 ? '—' : `${ordinal(i + 1)} · ${t[i].pts} pts`;
    }
    if (comp.winner === id) return '🏆 Winners';
    if (comp.out[id]) return `Out · ${comp.out[id]}`;
    if (comp.type === 'euro' && comp.hasPhase && comp.rounds.some((r) => r.phase && r.matches.some((m) => !m.played))) {
      const t = phaseTable(comp); const i = t.findIndex((r) => r.id === id);
      return `League phase · ${ordinal(i + 1)} of ${t.length}`;
    }
    const rd = comp.rounds.find((r) => !r.pending && r.matches.some((m) => !m.played && (m.h === id || m.a === id)));
    if (rd) return stripLeg(rd.name);
    const next = comp.rounds.find((r) => r.pending || r.matches.some((m) => !m.played));
    return next ? `Through · next: ${stripLeg(next.name)}` : '—';
  }
  const isAlive = (comp, id) => comp.teams.includes(id) && !comp.out[id] && !comp.winner;
  // Every fixture the user has (or may have, once a draw is made) this season.
  function userFixtures() {
    const c = C(), uid = c.clubId, out = [];
    c.days.forEach((day, di) => day.items.forEach(([cid, ri]) => {
      const comp = c.comps[cid], rd = comp.rounds[ri];
      if (rd.pending) {
        const legSecond = rd.leg === 2;
        if (!legSecond && comp.type !== 'league' && isAlive(comp, uid) && !(rd.stage === 'PO' && comp.seeds?.includes(uid))) out.push({ di, date: day.date, comp, rd, ri, m: null });
        return;
      }
      const mi = rd.matches.findIndex((m) => m.h === uid || m.a === uid);
      if (mi >= 0) out.push({ di, date: day.date, comp, rd, ri, mi, m: rd.matches[mi] });
    }));
    return out;
  }
  function resultChip(m, uid) {
    const home = m.h === uid; const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
    const r = m.w ? (m.w === uid ? 'W' : 'L') : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    return `<span class="fd fd-${r}">${r}</span> <strong>${gf}-${ga}</strong>${m.pens ? '<small class="muted"> p</small>' : m.et ? '<small class="muted"> aet</small>' : ''}`;
  }

  /* ------------------------------------------------------------------ *
   * Home
   * ------------------------------------------------------------------ */
  function viewHome() {
    const c = C(), club = S.clubs[c.clubId], uid = c.clubId;
    if (c.seasonOver) return seasonSummaryHtml();
    const nm = nextUserMatch();
    const squad = club.pids.map((id) => S.players[id]);
    const risers = squad.filter((p) => p.ovr !== p.ovr0).sort((a, b) => (b.ovr - b.ovr0) - (a.ovr - a.ovr0)).slice(0, 5);
    const topForm = squad.filter((p) => p.st.apps).sort((a, b) => avgRating(b) - avgRating(a)).slice(0, 5);
    const { covers } = matchLineup();
    const recent = userFixtures().filter((x) => x.m && x.m.played).slice(-6).reverse();
    let nmHtml = '<p class="muted">No more matches for your club this season.</p><div class="center"><button class="btn primary" data-act="sim-end">Simulate to the end of the season</button></div>';
    if (nm) {
      const home = nm.m.h === uid, opp = S.clubs[home ? nm.m.a : nm.m.h];
      nmHtml = `
        <div class="nm-comp">${compTag(nm.comp)} <span>${esc(nm.rd.name)}</span></div>
        <div class="nm">
          <div class="nm-team">${crest(club, 'lg')}<strong>${esc(club.name)}</strong>${ovrBadge(clubRating(uid))}</div>
          <div class="nm-vs"><span class="vs">${nm.rd.final ? 'FINAL' : home ? 'HOME' : 'AWAY'}</span><span class="small">${fmtDate(nm.date, true)}</span></div>
          <div class="nm-team">${crest(opp, 'lg')}<strong>${esc(opp.name)}</strong>${ovrBadge(clubRating(opp.id))}</div>
        </div>
        <div class="row gap wrap center">
          <button class="btn primary big" data-act="tab" data-id="match">Go to match →</button>
          <button class="btn" data-act="quick-next">Quick sim this match</button>
          <button class="btn ghost" data-act="tab" data-id="fixtures">Calendar</button>
        </div>`;
    }
    return `
      <div class="grid g-home">
        <section class="card span2"><h3>Next match</h3>${nmHtml}</section>
        ${c.offers.length ? `<section class="card span2 offers"><h3>Transfer offers</h3>${c.offers.map((o) => {
          const p = S.players[o.pid];
          return `<div class="offer"><div>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> bid <strong class="money">${money(o.amount)}</strong> for ${playerLink(p)} ${posBadge(p.pos)} ${ovrBadge(p.ovr)} ${potBadge(p)} <span class="muted small">(value ${money(playerValue(p))})</span></div>
          <div class="row gap"><button class="btn primary sm" data-act="accept-offer" data-id="${o.id}">Accept</button><button class="btn ghost sm" data-act="reject-offer" data-id="${o.id}">Reject</button></div></div>`;
        }).join('')}</section>` : ''}
        ${(() => { const ex = squad.filter((p) => expiring(p)).sort((a, b) => b.ovr - a.ovr); return ex.length ? `<section class="card span2 offers"><h3>Contracts expiring this season</h3><p class="muted small">These players leave on a free transfer at the end of the season unless you agree new deals.</p><ul class="plist">${ex.map((p) => `<li>${posBadge(p.pos)} ${playerLink(p)} ${ovrBadge(p.ovr)} <span class="muted small">age ${p.age} · ${money(p.wage)}/wk</span><button class="btn xs primary ml-auto" data-act="renew" data-id="${p.id}">Negotiate</button></li>`).join('')}</ul></section>` : ''; })()}
        <section class="card">
          <h3>Your competitions <button class="link small" data-act="tab" data-id="comps">All competitions →</button></h3>
          <ul class="plist">${userCompIds().map((id) => { const comp = c.comps[id]; return `<li><button class="link" data-act="comp-go" data-id="${id}">${compTag(comp)} ${esc(comp.name)}</button><span class="ml-auto small">${esc(compStatus(comp, uid))}</span></li>`; }).join('')}</ul>
        </section>
        <section class="card">
          <h3>Recent results</h3>
          ${recent.length ? `<ul class="results">${recent.map(({ m, comp }) => { const home = m.h === uid; return `<li>${compTag(comp)} ${home ? 'vs' : '@'} ${esc(clubName(home ? m.a : m.h))} <span class="ml-auto">${resultChip(m, uid)}</span></li>`; }).join('')}</ul>` : '<p class="muted">No matches played yet.</p>'}
        </section>
        <section class="card">
          <h3>Squad watch</h3>
          ${risers.length ? `<h4>OVR changes this season</h4><ul class="plist">${risers.map((p) => `<li>${posBadge(p.pos)} ${playerLink(p)} <span class="ml-auto">${ovrBadge(p.ovr)} ${delta(p)}</span></li>`).join('')}</ul>` : ''}
          ${topForm.length ? `<h4>In form</h4><ul class="plist">${topForm.map((p) => `<li>${posBadge(p.pos)} ${playerLink(p)} <span class="ml-auto rating">${avgRating(p).toFixed(2)}</span></li>`).join('')}</ul>` : '<p class="muted">Play some matches to see form.</p>'}
          ${covers.length ? `<h4>Unavailable</h4><ul class="plist">${covers.map((cv) => { const p = S.players[cv.out]; return p ? `<li>${posBadge(p.pos)} ${playerLink(p)} ${statusIcons(p)} <span class="ml-auto small muted">${cv.in ? `cover: ${esc(S.players[cv.in].name)}` : 'no cover'}</span></li>` : ''; }).join('')}</ul>` : ''}
        </section>
        <section class="card">
          <h3>News</h3>
          <ul class="news">${c.news.slice(0, 14).map((n) => `<li class="n-${n.type}"><span class="muted small">${fmtDate(n.date)}</span> ${esc(n.text)}</li>`).join('')}</ul>
        </section>
      </div>`;
  }

  function seasonSummaryHtml() {
    const c = C(), s = c.summary;
    if (!s) return '';
    const win = (label, id, comp) => `<div class="big-stat"><span>${esc(label)}</span><strong>${id ? esc(clubName(id)) : '—'}</strong>${comp ? `<small>${esc(comp)}</small>` : ''}</div>`;
    return `
      <section class="card season-end">
        <h2>🏆 Season ${seasonLabel(c.season)} complete</h2>
        <div class="stats-row">
          <div class="big-stat"><span>Your league finish</span><strong>${ordinal(s.pos)}</strong></div>
          <div class="big-stat"><span>Trophies</span><strong>${s.trophies.length ? esc(s.trophies.join(', ')) : 'None'}</strong></div>
          <div class="big-stat"><span>Season income</span><strong class="money">${money(s.income)}</strong></div>
          <div class="big-stat"><span>Next season</span><strong>${s.nextEuro ? esc(EURO[s.nextEuro].name) : 'No European football'}</strong></div>
        </div>
        ${s.promoted ? `<div class="notice good">🎉 Promoted to the ${esc(s.promoted)}!</div>` : ''}${s.relegated ? `<div class="notice">⬇️ Relegated to the ${esc(s.relegated)}.</div>` : ''}
        ${s.me ? `<h4>Your season</h4><div class="stats-row"><div class="big-stat"><span>Apps</span><strong>${s.me.apps}</strong></div><div class="big-stat"><span>Goals · Assists</span><strong>${s.me.g} · ${s.me.a}</strong></div><div class="big-stat"><span>Avg rating</span><strong>${s.me.avg}</strong></div><div class="big-stat"><span>OVR</span><strong>${s.me.ovr0} → ${s.me.ovr}</strong></div></div>` : ''}
        ${(s.moves || []).length ? `<h4>Promotion & relegation</h4><ul class="plist">${s.moves.map((mv) => `<li><span>⬆️ ${mv.up.map((id) => esc(clubName(id))).join(', ')}<br>⬇️ ${mv.down.map((id) => esc(clubName(id))).join(', ')}</span><span class="ml-auto muted small">${esc(S.leagues[mv.upper].name)} ↔ ${esc(S.leagues[mv.lower].name)}</span></li>`).join('')}</ul>` : ''}
        ${(s.tourns || []).length ? `<h4>International tournaments</h4><div class="stats-row">${s.tourns.map((t) => `<div class="big-stat"><span>${esc(t.name)}</span><strong>${t.winner ? '🏆 ' + esc(clubName(t.winner)) : '—'}</strong>${t.top ? `<small>Top scorer: ${esc(t.top)}</small>` : ''}</div>`).join('')}</div>` : ''}
        <h4>European winners</h4>
        <div class="stats-row">${s.euro.map((e) => win(e.name, e.winner)).join('')}</div>
        <h4>League champions & cup winners</h4>
        <div class="stats-row">${s.leagues.map((l) => win(S.leagues[l.lid].name, l.champion, (s.cups.find((x) => x.lid === l.lid) ? `${s.cups.find((x) => x.lid === l.lid).name}: ${clubName(s.cups.find((x) => x.lid === l.lid).winner)}` : ''))).join('')}</div>
        <div class="stats-row">
          ${s.topScorer ? `<div class="big-stat"><span>Golden Boot</span><strong>${esc(s.topScorer.name)}</strong><small>${esc(s.topScorer.club)} · ${s.topScorer.goals} league goals</small></div>` : ''}
          ${s.bestPlayer ? `<div class="big-stat"><span>Player of the season</span><strong>${esc(s.bestPlayer.name)}</strong><small>${esc(s.bestPlayer.club)} · ${s.bestPlayer.avg} avg</small></div>` : ''}
        </div>
        <h4>Final table · ${esc(S.leagues[c.leagueId].name)}</h4>
        <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>#</th><th class="left">Club</th><th>GD</th><th>Pts</th></tr></thead><tbody>
          ${s.table.map((r, i) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="left">${esc(clubName(r.id))}</td><td>${r.gd}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted">The summer transfer window is open, so you can ${isPlayerMode() ? 'look for a new club' : 'buy and sell'} before the new season. Starting the next season ages every player by a year and applies summer development. Some veterans retire, two academy graduates join, and European places go to this season's top finishers and cup winners.</p>
        <div class="row gap wrap"><button class="btn primary big" data-act="next-season">Start ${seasonLabel(c.season + 1)} season →</button><button class="btn" data-act="tab" data-id="${isPlayerMode() ? 'career' : 'transfers'}">${isPlayerMode() ? 'My career & transfers' : 'Transfer market'}</button></div>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Match
   * ------------------------------------------------------------------ */
  function predict(H, A, opts, n = 120) {
    const saved = rng; rng = mulberry32(12345);
    let w = 0, d = 0, l = 0, adv = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch({ ...H, xi: H.xi.map((x) => ({ ...x })), bench: H.bench.slice() }, { ...A, xi: A.xi.map((x) => ({ ...x })), bench: A.bench.slice() }, false, opts);
      if (r.score[0] > r.score[1]) w++; else if (r.score[0] < r.score[1]) l++; else d++;
      if (r.w === 0) adv++;
    }
    rng = saved;
    return { w: Math.round((w / n) * 100), d: Math.round((d / n) * 100), l: Math.round((l / n) * 100), adv: Math.round((adv / n) * 100) };
  }
  function strengthBars(sH, sA) {
    const row = (label, a, b) => {
      const pa = clamp((a - 55) / 40, 0.03, 1) * 100, pb = clamp((b - 55) / 40, 0.03, 1) * 100;
      return `<div class="sb-row"><span class="sb-v">${a.toFixed(0)}</span><div class="sb-bar l"><i style="width:${pa}%"></i></div><span class="sb-l">${label}</span><div class="sb-bar r"><i style="width:${pb}%"></i></div><span class="sb-v">${b.toFixed(0)}</span></div>`;
    };
    return `<div class="sbars">${row('Attack', sH.attack, sA.attack)}${row('Midfield', sH.control, sA.control)}${row('Defence', sH.defense, sA.defense)}${row('Keeper', sH.gk, sA.gk)}</div>`;
  }
  function lineupList(side) {
    return `<ul class="lineup">${side.xi.map((x) => { const p = S.players[x.pid]; const e = eff(p, x.slot); return `<li><span class="slot">${x.slot}</span> ${playerLink(p)} ${e < p.ovr - 1 ? `<span class="tag warn" title="Out of position">${e}</span>` : ''}<span class="ml-auto">${ovrBadge(p.ovr)}</span></li>`; }).join('')}</ul>`;
  }
  function viewMatch() {
    const c = C(), uid = c.clubId;
    if (ui.playback) return playbackHtml();
    if (c.seasonOver) return seasonSummaryHtml();
    const nm = nextUserMatch();
    if (!nm) return `<section class="card"><h3>No more matches</h3><p>Your club has no more fixtures this season. The remaining cup and European games can be simulated.</p><button class="btn primary" data-act="sim-end">Simulate to the end of the season</button></section>`;
    ui.previewKey = nm.key;
    const pm = isPlayerMode();
    const { covers } = pm ? { covers: [] } : matchLineup();
    const H = buildSide(nm.m.h, nm.m.h === uid), A = buildSide(nm.m.a, nm.m.a === uid);
    const opts = { neutral: !!nm.rd.final, ko: !!(nm.rd.single || nm.rd.leg === 2 || nm.rd.final) };
    let legInfo = '';
    if (nm.rd.leg === 2) {
      const l1 = nm.comp.rounds.find((r) => r.stage === nm.rd.stage && r.leg === 1).matches[nm.mi];
      opts.agg = [l1.ag, l1.hg];
      legInfo = `<div class="notice info">Second leg. First leg: ${esc(clubName(l1.h))} ${l1.hg}-${l1.ag} ${esc(clubName(l1.a))}.</div>`;
    }
    const sH = sideStrength(H, !opts.neutral), sA = sideStrength(A, false);
    const pr = predict(H, A, opts);
    const mine = nm.m.h === uid ? 0 : 1;
    const pw = mine === 0 ? [pr.w, pr.d, pr.l] : [pr.l, pr.d, pr.w];
    const advance = mine === 0 ? pr.adv : 100 - pr.adv;
    const between = nm.dayIdx > c.dayIdx ? c.days.slice(c.dayIdx, nm.dayIdx).length : 0;
    return `
      <section class="card match-pre">
        <div class="mp-head"><span>${compTag(nm.comp)} ${esc(nm.comp.name)} · ${esc(nm.rd.name)}${opts.neutral ? ' · Neutral venue' : ''}</span><span>${fmtDate(nm.date, true)}</span></div>
        <div class="nm">
          <div class="nm-team">${crest(S.clubs[H.clubId], 'lg')}<strong>${esc(H.name)}</strong><span class="muted small">${H.formation} · ${STYLES[H.style]?.label || ''} · ${MENTALITY[H.mentality].label}</span></div>
          <div class="nm-vs"><span class="vs">VS</span></div>
          <div class="nm-team">${crest(S.clubs[A.clubId], 'lg')}<strong>${esc(A.name)}</strong><span class="muted small">${A.formation} · ${STYLES[A.style]?.label || ''} · ${MENTALITY[A.mentality].label}</span></div>
        </div>
        ${legInfo}
        ${strengthBars(sH, sA)}
        <div class="odds"><div style="flex:${pw[0] || 1}" class="o-w">Win ${pw[0]}%</div><div style="flex:${pw[1] || 1}" class="o-d">Draw ${pw[1]}%</div><div style="flex:${pw[2] || 1}" class="o-l">Loss ${pw[2]}%</div></div>
        ${opts.ko ? `<p class="center small">Knockout: a level ${opts.agg ? 'aggregate' : 'score'} goes to extra time and penalties. Chance to go through: <strong>${advance}%</strong></p>` : ''}
        ${between ? `<div class="notice info">${between} other match day${between > 1 ? 's' : ''} before this fixture will be simulated first.</div>` : ''}
        ${covers.length ? `<div class="notice">${covers.map((cv) => `${esc(S.players[cv.out]?.name || '?')} is ${unavailWhy(S.players[cv.out])}${cv.in ? `, so ${esc(S.players[cv.in].name)} covers at ${cv.pos}` : ''}`).join('. ')}. Your chosen XI comes back automatically when players are available.</div>` : ''}
        ${pm ? (() => { const mySide = nm.m.h === uid ? H : A; const inXi = mySide.xi.find((x) => x.pid === c.pid); const p = me(); return `<div class="notice ${inXi ? 'good' : 'info'}">${!available(p) ? `You are ${p.inj > 0 ? `injured (${p.inj} match${p.inj > 1 ? 'es' : ''})` : 'suspended'} and will miss this match.` : inXi ? `You are in the starting XI at <strong>${inXi.slot}</strong>.` : 'You start on the bench. Impress in training and you may come on in the second half.'}</div>`; })() : ''}
        <div class="row gap wrap center">
          ${pm ? '' : `<label class="inline">Play style
            <select class="input sm" id="sel-style2" data-change="style">${Object.entries(STYLES).map(([k, st]) => `<option value="${k}" ${(c.style || 'balanced') === k ? 'selected' : ''}>${st.label}</option>`).join('')}</select>
          </label>`}
          ${pm ? '' : `<label class="inline">Mentality
            <select class="input sm" id="sel-mentality" data-change="mentality">${Object.entries(MENTALITY).map(([k, m]) => `<option value="${k}" ${c.mentality === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
          </label>`}
          <label class="inline">Commentary speed
            <select class="input sm" id="sel-speed" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
          ${pm ? '' : '<button class="btn ghost" data-act="tab" data-id="squad">Edit lineup</button>'}
        </div>
        <div class="center play-row"><button class="btn primary huge" data-act="simulate">▶ Simulate Match</button>
          <button class="btn huge play3d" data-act="play3d" title="Play the match yourself in 3D (keyboard)">🎮 Play Match (3D)</button>
          <label class="inline small">Match length <select class="input sm" id="len3d" data-change="len3d">${[3, 5, 8, 12].map((n) => `<option value="${n}" ${+(c.len3d || 5) === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></label></div>
        <p class="center muted small">Play Match puts you on the pitch: <b>WASD</b> move, <b>Shift</b> sprint, <b>Space</b> shoot / tackle, <b>E</b> pass, <b>Q</b> through ball${pm ? '' : ' / switch player'}, <b>R</b> lob / cross. The score you play counts. Needs a keyboard.</p>
        <div class="grid g2">
          <div><h4>${esc(H.name)} XI</h4>${lineupList(H)}</div>
          <div><h4>${esc(A.name)} XI</h4>${lineupList(A)}</div>
        </div>
      </section>`;
  }

  function doSimulate() {
    const key = ui.previewKey;
    const nm = advanceToUserMatch();
    if (!nm) { save(); return render(); }
    if (nm.key !== key) { save(); toast('A new draw was made. You have a new next fixture.', 'info'); return render(); }
    const res = playDay(true);
    save();
    if (!res) return render();
    ui.playback = { res, shown: 0, tick: 0, lbl: '0', done: false };
    render();
    if (C().speed === 'instant') finishPlayback(); else stepPlayback();
  }

  /* --- 2D match view: 22 dots and a ball, driven by the engine's minute-by-minute timeline --- */
  function createViz(canvas, res) {
    const ctx = canvas.getContext('2d');
    const myPid = C().pid;
    const dots = [];
    [0, 1].forEach((side) => {
      const form = FORMATIONS[res.forms?.[side]] || FORMATIONS['4-3-3'];
      (res.lineups?.[side] || []).forEach(([pid, slot, si], k) => {
        const f = form[si ?? k] || form[k] || ['CM', 50, 50];
        let x = 0.05 + (1 - f[2] / 100) * 0.45, y = f[1] / 100;
        if (side === 1) { x = 1 - x; y = 1 - y; }
        dots.push({ side, pid, gk: slot === 'GK', bx: x, by: y, x, y, ph: Math.random() * 6.3, gone: false });
      });
    });
    const ball = { x: 0.5, y: 0.5, path: [], kick: false };
    let poss = 0, flash = null, W = 0, H = 0;
    function size() {
      if (!canvas.isConnected && W) return;
      const w = canvas.parentElement.clientWidth || 600;
      const h = Math.round(w * 0.62);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
    }
    size();
    window.addEventListener('resize', size);
    const zoneX = (side, z) => { const r = [[0.18, 0.38], [0.38, 0.62], [0.62, 0.8], [0.8, 0.9]][z] || [0.4, 0.6]; const v = r[0] + Math.random() * (r[1] - r[0]); return side === 0 ? v : 1 - v; };
    const ry = () => 0.18 + Math.random() * 0.64;
    function play(entry, dur) {
      const [side, z, ev] = entry;
      poss = side;
      const now = performance.now();
      if (ball.kick) { ball.x = 0.5; ball.y = 0.5; ball.kick = false; }
      const gx = side === 0 ? 1 : 0, dir = side === 0 ? 1 : -1;
      const pts = [];
      if ([1, 2, 3, 6, 8, 9].includes(ev)) {
        const sx = side === 0 ? 0.8 + Math.random() * 0.09 : 0.2 - Math.random() * 0.09, sy = 0.35 + Math.random() * 0.3;
        if (ev === 8 || ev === 9) pts.push([side === 0 ? 0.885 : 0.115, 0.5, 0.45]);
        else pts.push([(ball.x + sx) / 2, ry(), 0.3], [sx, sy, 0.25]);
        if (ev === 3 || ev === 8) { pts.push([gx + dir * 0.012, 0.46 + Math.random() * 0.08, 0.15]); flash = { text: 'GOAL!', side, until: now + dur * 3 }; ball.kick = true; }
        else if (ev === 2 || ev === 9) pts.push([gx - dir * 0.035, 0.46 + Math.random() * 0.08, 0.2]);
        else if (ev === 6) pts.push([gx, Math.random() < 0.5 ? 0.45 : 0.55, 0.1], [gx - dir * 0.12, 0.5, 0.15]);
        else pts.push([gx + dir * 0.02, Math.random() < 0.5 ? 0.3 : 0.7, 0.2]);
      } else if (ev === 4) { pts.push([gx, Math.random() < 0.5 ? 0.015 : 0.985, 0.45], [gx - dir * 0.07, 0.5, 0.45]); }
      else if (ev === 7) { const sx = zoneX(side, 3); pts.push([sx, ry(), 0.5], [sx - dir * 0.12, ry(), 0.4]); }
      else pts.push([zoneX(side, z), ry(), 0.5], [zoneX(side, z), ry(), 0.5]);
      if (ev === 5) flash = { text: '🟨', side, until: now + dur * 1.5, small: true };
      let t = now, sx = ball.x, sy = ball.y;
      ball.path = pts.map(([x, y, f]) => { const seg = { sx, sy, x, y, t0: t, t1: t + f * dur }; t += f * dur; sx = x; sy = y; return seg; });
    }
    function applyEvent(e) {
      if ((e.type === 'red' || e.gone) && e.pid) { const d = dots.find((d) => d.pid === e.pid && !d.gone); if (d) d.gone = true; }
      if ((e.type === 'sub' || e.type === 'injury') && e.off && e.pid && !e.gone) { const d = dots.find((d) => d.pid === e.off && !d.gone); if (d) d.pid = e.pid; }
    }
    function finish() { ball.path = []; ball.x = 0.5; ball.y = 0.5; flash = null; }
    function update(now) {
      let seg = ball.path[0];
      while (seg && now >= seg.t1) { ball.x = seg.x; ball.y = seg.y; ball.path.shift(); seg = ball.path[0]; }
      if (seg && now >= seg.t0) {
        const k = clamp((now - seg.t0) / (seg.t1 - seg.t0), 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        ball.x = seg.sx + (seg.x - seg.sx) * e; ball.y = seg.sy + (seg.y - seg.sy) * e;
      }
      let carrier = null, cd = 9;
      for (const d of dots) if (d.side === poss && !d.gk && !d.gone) { const dd = (d.x - ball.x) ** 2 + (d.y - ball.y) ** 2; if (dd < cd) { cd = dd; carrier = d; } }
      for (const d of dots) {
        if (d.gone) continue;
        const dir = d.side === 0 ? 1 : -1;
        let tx, ty, k = 0.05;
        if (d.gk) { tx = d.bx + (ball.x - 0.5) * 0.05; ty = 0.5 + (ball.y - 0.5) * 0.3; }
        else {
          tx = d.bx + (ball.x - 0.5) * 0.55 + (d.side === poss ? 0.07 : -0.03) * dir + Math.sin(now / 900 + d.ph) * 0.008;
          ty = d.by + (ball.y - 0.5) * 0.3 + Math.cos(now / 1100 + d.ph) * 0.012;
        }
        if (d === carrier) { tx = ball.x - dir * 0.012; ty = ball.y; k = 0.12; }
        d.x += (clamp(tx, 0.02, 0.98) - d.x) * k;
        d.y += (clamp(ty, 0.03, 0.97) - d.y) * k;
      }
    }
    function draw(now) {
      const m = 8, pw = W - 2 * m, ph = H - 2 * m;
      const X = (x) => m + x * pw, Y = (y) => m + y * ph;
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#1c6a39' : '#19602f'; ctx.fillRect((i * W) / 12, 0, W / 12 + 1, H); }
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(X(0), Y(0), pw, ph);
      ctx.beginPath(); ctx.moveTo(X(0.5), Y(0)); ctx.lineTo(X(0.5), Y(1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(0.5), Y(0.5), ph * 0.15, 0, Math.PI * 2); ctx.stroke();
      for (const s of [0, 1]) {
        const x0 = s ? X(1 - 0.16) : X(0), x1 = s ? X(1 - 0.055) : X(0);
        ctx.strokeRect(x0, Y(0.2), pw * 0.16, ph * 0.6);
        ctx.strokeRect(x1, Y(0.36), pw * 0.055, ph * 0.28);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillRect(s ? X(1) : X(0) - 5, Y(0.44), 5, ph * 0.12);
      }
      const r = Math.max(4.5, W * 0.011);
      for (const d of dots) {
        if (d.gone) continue;
        ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), r, 0, Math.PI * 2);
        ctx.fillStyle = d.gk ? (d.side ? '#f472b6' : '#facc15') : d.side ? '#60a5fa' : '#e5e7eb';
        ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = d.side ? '#1e3a8a' : '#14532d'; ctx.stroke();
        if (myPid && d.pid === myPid) {
          ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = '#fde68a'; ctx.font = `700 ${Math.max(10, r * 1.6)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('YOU', X(d.x), Y(d.y) - r - 7);
        }
      }
      ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), r * 0.55, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur = 0;
      if (flash && now < flash.until) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = flash.small ? '#fde68a' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `800 ${flash.small ? W * 0.05 : W * 0.09}px Inter, sans-serif`;
        ctx.fillText(flash.text, W / 2, H / 2); ctx.textBaseline = 'alphabetic';
      }
    }
    function loop(now) {
      if (!canvas.isConnected) { window.removeEventListener('resize', size); return; }
      update(now); draw(now);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return { play, applyEvent, finish };
  }

  const TICK_MS = { slow: 900, normal: 420, fast: 140, instant: 0 };
  function stepPlayback() {
    const pb = ui.playback;
    if (!pb || pb.done) return;
    const tl = pb.res.tl || [], events = pb.res.text || [];
    const sp = TICK_MS[C().speed] ?? 420;
    if (!sp || pb.tick >= tl.length) return finishPlayback();
    const entry = tl[pb.tick];
    let slow = 1;
    while (pb.shown < events.length && events[pb.shown].i <= pb.tick) {
      const e = events[pb.shown];
      if (e.type === 'goal') slow = 3; else if (e.type === 'ht' && slow < 2.5) slow = 2.5;
      if (ui.viz) ui.viz.applyEvent(e);
      pb.shown++;
    }
    if (ui.viz) ui.viz.play(entry, sp * Math.max(1, slow * 0.8));
    pb.lbl = entry[3];
    pb.tick++;
    updatePlayback();
    timers.push(setTimeout(stepPlayback, sp * slow));
  }
  function finishPlayback() {
    clearTimers();
    const pb = ui.playback;
    if (!pb) return;
    const events = pb.res.text || [];
    while (pb.shown < events.length) { if (ui.viz) ui.viz.applyEvent(events[pb.shown]); pb.shown++; }
    pb.tick = (pb.res.tl || []).length;
    pb.done = true;
    if (ui.viz) ui.viz.finish();
    updatePlayback();
  }
  function mountPlayback() {
    const canvas = $('#pb-canvas');
    ui.viz = canvas && ui.playback.res.tl ? createViz(canvas, ui.playback.res) : null;
    if (ui.viz && ui.playback.done) ui.viz.finish();
    updatePlayback();
  }
  function updatePlayback() {
    const pb = ui.playback;
    if (!pb || !$('#playback')) return;
    const r = pb.res, c = C();
    const events = (r.text || []).slice(0, pb.shown);
    const cur = events[events.length - 1];
    const sc = pb.done ? r.score : cur ? cur.score : [0, 0];
    const minute = pb.done ? 'FT' : pb.lbl || '0';
    const total = (r.tl || []).length || 1;
    const myName = c.pid ? S.players[c.pid]?.name : null;
    const scorers = (side) => r.goals.filter((g) => g[1] === side && (pb.done || events.some((e) => e.type === 'goal' && e.lbl === g[0] && e.side === side))).map((g) => `${esc(S.players[g[2]]?.name.split(' ').slice(-1)[0] ?? 'OG')} ${esc(g[0])}'${g[4] ? ' (P)' : ''}`).join(', ');
    $('#pb-score').textContent = `${sc[0]} - ${sc[1]}`;
    $('#pb-clock').textContent = /\d/.test(minute) ? `${minute}'` : minute;
    $('#pb-clock').classList.toggle('live', !pb.done);
    $('#pb-s0').innerHTML = scorers(0);
    $('#pb-s1').innerHTML = scorers(1);
    $('#pb-prog').style.width = `${Math.min(100, (pb.tick / total) * 100)}%`;
    $('#pb-feed').innerHTML = events.slice().reverse().map((e) => `<li class="ev ev-${e.type} ${e.side === 0 ? 'side-h' : e.side === 1 ? 'side-a' : ''} ${myName && (e.pid === c.pid || e.text.includes(myName)) ? 'me-ev' : ''}"><span class="ev-min">${esc(e.lbl)}${/\d/.test(e.lbl) ? "'" : ''}</span><span class="ev-txt">${esc(e.text)}</span></li>`).join('');
    $('#pb-controls').hidden = pb.done;
    if (pb.done && !$('#pb-after').innerHTML) $('#pb-after').innerHTML = playbackAfterHtml();
  }
  function playbackAfterHtml() {
    const r = ui.playback.res, c = C();
    const comp = c.comps[r.compId], rd = comp.rounds[r.ri];
    const H = S.clubs[r.h], A = S.clubs[r.a];
    const rat = (side) => r.ratings.filter((x) => x.side === side).sort((a, b) => a.on - b.on || POS_ORDER[a.slot] - POS_ORDER[b.slot]).map((x) => {
      const p = S.players[x.pid];
      return `<li class="${x.pid === c.pid ? 'me-row' : ''}"><span class="slot">${x.slot}</span> ${p ? playerLink(p) : '—'} ${x.g ? `<span class="tag good">⚽${x.g > 1 ? '×' + x.g : ''}</span>` : ''}${x.a ? `<span class="tag">A${x.a > 1 ? '×' + x.a : ''}</span>` : ''}${x.yc ? '<span class="card-y"></span>' : ''}${x.rc ? '<span class="card-r"></span>' : ''}${x.inj ? '<span class="tag bad">INJ</span>' : ''}${x.on ? `<span class="tag">ON ${x.on}'</span>` : ''}<span class="ml-auto rating r-${x.r >= 8 ? 'hi' : x.r >= 6.5 ? 'mid' : 'lo'}">${x.r.toFixed(1)}</span></li>`;
    }).join('');
    const stat = (label, a, b, suf = '') => `<tr><td>${a}${suf}</td><td class="muted">${label}</td><td>${b}${suf}</td></tr>`;
    const extraLine = [r.agg ? `Aggregate ${r.agg[0]}-${r.agg[1]}` : '', r.pens ? `Penalties ${r.pens[0]}-${r.pens[1]}` : r.et ? 'After extra time' : '', r.w ? `${clubName(r.w)} ${rd.final ? 'win the final' : 'go through'}` : ''].filter(Boolean).join(' · ');
    return `
      ${extraLine ? `<p class="center extra-line">${esc(extraLine)}</p>` : ''}
      <div class="grid g2 mt">
        <div class="card inner"><h4>Match stats</h4>
          <table class="tbl stat-tbl"><tbody>
            ${stat('Possession', r.st.poss[0], r.st.poss[1], '%')}${stat('Shots', r.st.shots[0], r.st.shots[1])}${stat('On target', r.st.sot[0], r.st.sot[1])}${stat('Corners', r.st.corners[0], r.st.corners[1])}${stat('Yellow cards', r.st.yc[0], r.st.yc[1])}${stat('Red cards', r.st.rc[0], r.st.rc[1])}
          </tbody></table>
          ${r.motm ? `<p class="motm">⭐ Player of the match: <strong>${esc(S.players[r.motm]?.name)}</strong></p>` : ''}
          ${r.gate ? `<p class="muted small">Matchday revenue: <span class="money">${money(r.gate)}</span></p>` : ''}
        </div>
        <div class="card inner"><h4>${esc(comp.name)} · ${esc(rd.name)}</h4>
          <ul class="results">${rd.matches.map((m) => `<li class="${m.h === c.clubId || m.a === c.clubId ? 'me' : ''}"><span class="rs-t right">${esc(clubName(m.h))}</span><strong class="rs-s">${scoreText(m)}</strong><span class="rs-t">${esc(clubName(m.a))}</span></li>`).join('')}</ul>
        </div>
      </div>
      <div class="grid g2">
        <div class="card inner"><h4>${esc(H.name)} ratings</h4><ul class="lineup">${rat(0)}</ul></div>
        <div class="card inner"><h4>${esc(A.name)} ratings</h4><ul class="lineup">${rat(1)}</ul></div>
      </div>
      <div class="center row gap wrap">
        ${c.seasonOver ? '<button class="btn primary big" data-act="end-playback">See season summary →</button>' : '<button class="btn primary big" data-act="end-playback">Continue →</button> <button class="btn" data-act="end-playback-next">Next match →</button>'}
      </div>`;
  }
  function playbackHtml() {
    const r = ui.playback.res, c = C();
    const comp = c.comps[r.compId], rd = comp.rounds[r.ri];
    const H = S.clubs[r.h], A = S.clubs[r.a];
    return `
      <section class="card playback" id="playback">
        <div class="mp-head"><span>${compTag(comp)} ${esc(comp.name)} · ${esc(rd.name)}</span><span>${fmtDate(r.date, true)}</span></div>
        <div class="scoreboard">
          <div class="sbt">${crest(H, 'lg')}<strong>${esc(H.name)}</strong><small id="pb-s0"></small></div>
          <div class="sbs"><div class="score" id="pb-score">0 - 0</div><div class="clock" id="pb-clock">0'</div></div>
          <div class="sbt">${crest(A, 'lg')}<strong>${esc(A.name)}</strong><small id="pb-s1"></small></div>
        </div>
        ${r.tl ? `<div class="viz-wrap"><canvas id="pb-canvas" aria-label="Live 2D view of the match"></canvas>
          <div class="viz-legend"><span><i class="lg-h"></i>${esc(H.short || H.name)}</span><span><i class="lg-a"></i>${esc(A.short || A.name)}</span><span class="muted">Yellow/pink dots are the goalkeepers.${c.pid ? ' The ringed dot is you.' : ''}</span></div></div>` : ''}
        <div class="progress"><i id="pb-prog"></i></div>
        <div class="row gap center" id="pb-controls"><select class="input sm" id="sel-speed2" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="skip-playback">Skip to full-time ⏭</button></div>
        <ul class="feed" id="pb-feed"></ul>
        <div id="pb-after"></div>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Player career views
   * ------------------------------------------------------------------ */
  function playerRole() {
    const c = C(), p = me();
    if (p.inj > 0) return `Injured (${p.inj})`;
    if (p.sus > 0) return 'Suspended';
    return roleAt(c.clubId, p);
  }
  function playerCardHtml() {
    const p = me(), club = S.clubs[p.clubId];
    const xp = p.xp || 0;
    return `
      <div class="pcard">
        <div class="pm-ovr big ${ovrClass(p.ovr)}">${p.ovr}<small>${p.pos}</small></div>
        <div class="pcard-main">
          <h2>${esc(p.name)} ${delta(p)}</h2>
          <div class="muted">${esc(club.name)} · ${esc(S.leagues[club.leagueId].name)} · Age ${p.age}</div>
          <div class="stats-row">
            <div class="big-stat"><span>Role</span><strong>${esc(playerRole())}</strong></div>
            <div class="big-stat"><span>Player type</span><strong>${esc(ROLE[p.role]?.label || '—')}</strong></div>
            <div class="big-stat"><span>Contract</span><strong>${contractLabel(p)}</strong></div>
            <div class="big-stat"><span>${esc(NATIONS[p.nat]?.name || 'International')}</span><strong>${(p.intl || [0, 0])[0]} caps · ${(p.intl || [0, 0])[1]} goals</strong></div>
            <div class="big-stat"><span>Potential</span><strong>${potRange(p)}</strong></div>
            <div class="big-stat"><span>Value</span><strong class="money">${money(playerValue(p))}</strong></div>
            <div class="big-stat"><span>Wage</span><strong class="money">${money(p.wage)}/wk</strong></div>
            <div class="big-stat"><span>Form</span><strong>${formArrow(p.form)}</strong></div>
          </div>
          <div class="xp"><span class="muted small">${xp >= 0 ? 'Progress to your next OVR point' : 'Poor form is costing you: risk of losing a point'}</span><div class="xpbar"><i class="${xp < 0 ? 'neg' : ''}" style="width:${clamp(Math.abs(xp) / 8, 0, 1) * 100}%"></i></div></div>
        </div>
      </div>`;
  }
  function seasonLineHtml(p) {
    return `<div class="stats-row">
      <div class="big-stat"><span>Apps</span><strong>${p.st.apps}</strong></div>
      <div class="big-stat"><span>Goals</span><strong>${p.st.goals}</strong></div>
      <div class="big-stat"><span>Assists</span><strong>${p.st.assists}</strong></div>
      <div class="big-stat"><span>Avg rating</span><strong>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</strong></div>
      <div class="big-stat"><span>Player of the match</span><strong>${p.st.motm}</strong></div>
    </div>`;
  }
  function offersHtml() {
    const c = C();
    if (!c.offers.length) return '';
    return `<section class="card span2 offers"><h3>Clubs want to sign you</h3>${c.offers.map((o) => playerOfferHtml(o)).join('')}</section>`;
  }
  function playerOfferHtml(o) {
    return `<div class="offer p-offer"><div>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> <span class="muted small">${esc(S.leagues[S.clubs[o.clubId].leagueId]?.name || '')} · rated ${clubRating(o.clubId)}</span><br>
        <span class="small">Fee <span class="money">${money(o.amount)}</span> · wage <span class="money">${money(o.wage)}/wk</span> · ${o.years || 4}-year deal · expected role: <strong>${esc(o.role)}</strong></span>
        ${o.msg ? `<div class="notice ${o.status === 'accepted' ? 'good' : 'info'} small">${esc(o.msg)}</div>` : ''}</div>
        <div class="row gap wrap">${o.agreed ? '' : `<input class="input xs" id="ask-${o.id}" type="number" min="1" title="Wage to ask for (€K per week)" value="${Math.round(o.wage * 1.25 / 1000)}"><button class="btn sm" data-act="p-offer-ask" data-id="${o.id}">Ask €K/wk</button>`}<button class="btn primary sm" data-act="join-offer" data-id="${o.id}">Join</button><button class="btn ghost sm" data-act="reject-offer" data-id="${o.id}">Decline</button></div></div>`;
  }
  function viewHomePlayer() {
    const c = C(), uid = c.clubId, club = S.clubs[uid], p = me();
    if (c.seasonOver) return seasonSummaryHtml();
    const nm = nextUserMatch();
    const recent = userFixtures().filter((x) => x.m && x.m.played).slice(-6).reverse();
    let nmHtml = '<p class="muted">No more matches for your club this season.</p><div class="center"><button class="btn primary" data-act="sim-end">Simulate to the end of the season</button></div>';
    if (nm) {
      const home = nm.m.h === uid, opp = S.clubs[home ? nm.m.a : nm.m.h];
      nmHtml = `<div class="nm-comp">${compTag(nm.comp)} <span>${esc(nm.rd.name)}</span> · ${fmtDate(nm.date, true)}</div>
        <div class="nm"><div class="nm-team">${crest(club, 'lg')}<strong>${esc(club.name)}</strong></div><div class="nm-vs"><span class="vs">${nm.rd.final ? 'FINAL' : home ? 'HOME' : 'AWAY'}</span></div><div class="nm-team">${crest(opp, 'lg')}<strong>${esc(opp.name)}</strong></div></div>
        <div class="row gap wrap center"><button class="btn primary big" data-act="tab" data-id="match">Go to match →</button><button class="btn" data-act="quick-next">Quick sim this match</button></div>`;
    }
    return `
      <div class="grid g-home">
        <section class="card span2">${playerCardHtml()}${seasonLineHtml(p)}</section>
        ${offersHtml()}
        <section class="card span2"><h3>Next match</h3>${nmHtml}</section>
        <section class="card">
          <h3>Competitions</h3>
          <ul class="plist">${userCompIds().map((id) => { const comp = c.comps[id]; return `<li><button class="link" data-act="comp-go" data-id="${id}">${compTag(comp)} ${esc(comp.name)}</button><span class="ml-auto small">${esc(compStatus(comp, uid))}</span></li>`; }).join('')}</ul>
          <h4>Recent results</h4>
          ${recent.length ? `<ul class="results">${recent.map(({ m, comp }) => { const home = m.h === uid; return `<li>${compTag(comp)} ${home ? 'vs' : '@'} ${esc(clubName(home ? m.a : m.h))} <span class="ml-auto">${resultChip(m, uid)}</span></li>`; }).join('')}</ul>` : '<p class="muted">No matches played yet.</p>'}
        </section>
        <section class="card"><h3>News</h3><ul class="news">${c.news.slice(0, 14).map((n) => `<li class="n-${n.type}"><span class="muted small">${fmtDate(n.date)}</span> ${esc(n.text)}</li>`).join('')}</ul></section>
      </div>`;
  }
  function careerTableHtml(p, live) {
    const rows = (p.hist || []).slice();
    if (live) rows.push({ s: C().season, c: clubName(p.clubId), a: p.st.apps, g: p.st.goals, as: p.st.assists, r: p.st.apps ? +avgRating(p).toFixed(2) : 0, o: p.ovr, now: 1 });
    if (!rows.length) return '<p class="muted">No senior appearances recorded yet.</p>';
    const tot = rows.reduce((t, r) => ({ a: t.a + r.a, g: t.g + r.g, as: t.as + r.as }), { a: 0, g: 0, as: 0 });
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Season</th><th class="left">Club</th><th>OVR</th><th>Apps</th><th>Goals</th><th>Assists</th><th>Avg</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.now ? 'me' : ''}"><td>${seasonLabel(r.s)}${r.now ? ' *' : ''}</td><td class="left">${esc(r.c)}</td><td>${r.o}</td><td>${r.a}</td><td>${r.g}</td><td>${r.as}</td><td>${r.r ? r.r.toFixed(2) : '-'}</td></tr>`).join('')}
      <tr class="total"><td colspan="3" class="left"><strong>Career total</strong></td><td><strong>${tot.a}</strong></td><td><strong>${tot.g}</strong></td><td><strong>${tot.as}</strong></td><td></td></tr>
      </tbody></table></div>`;
  }
  function viewCareer() {
    const c = C(), p = me(), win = windowInfo();
    const moves = c.transfers.filter((t) => t.pid === p.id);
    return `
      <div class="grid g2">
        <section class="card span2">${playerCardHtml()}</section>
        <section class="card">
          <h3>Career history</h3>
          ${careerTableHtml(p, true)}
          <h4>Trophy cabinet</h4>
          ${c.trophies.length ? `<div class="stats-row">${c.trophies.map((t) => `<div class="big-stat"><span>${seasonLabel(t.season)}</span><strong>🏆 ${esc(t.name)}</strong></div>`).join('')}</div>` : '<p class="muted">No trophies yet.</p>'}
          ${c.history.length ? `<h4>Seasons</h4><ul class="plist">${c.history.map((h) => `<li>${seasonLabel(h.season)} · ${esc(h.club)} <span class="muted small">${esc(h.league || '')}, ${ordinal(h.pos)}</span><span class="ml-auto small">${h.me ? `${h.me.apps} apps, ${h.me.g} goals, OVR ${h.me.ovr0}→${h.me.ovr}` : ''}</span></li>`).join('')}</ul>` : ''}
        </section>
        <section class="card">
          <h3>🏋️ Training</h3>
          <p class="muted small">Pick what you work on after every match. Key attributes (★) for your position also raise your OVR. You can also learn a new position to become more versatile.</p>
          <div class="row gap wrap">${posTags(p)} ${mainPosButtons(p)}</div>
          ${attrChips(p)}
          <div class="row gap wrap mt">${trainControls(p)}</div>
          <div class="mt">${trainProgress(p)}</div>
          <label class="inline mt">Intensity <select class="input sm" id="train-int" data-change="train-int">${Object.entries(TRAIN_INT).map(([k, [l]]) => `<option value="${k}" ${(c.trainInt || 'normal') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </section>
        <section class="card">
          <h3>Playing style</h3>
          <p class="muted small">How you play when you are on the pitch. It changes how often you shoot, create or head crosses, and the commentary.</p>
          <label class="inline">Player type <select class="input sm" id="my-role" data-change="my-role">${ROLE_GROUPS[roleGroup(p.pos)].map(([id, label]) => `<option value="${id}" ${p.role === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <h3 class="mt">Contract</h3>
          <p class="small">You earn <strong class="money">${money(p.wage)}</strong> a week until <strong>${contractLabel(p)}</strong>.</p>
          ${(() => { const r = c.pRenew && c.pRenew.season === c.season ? c.pRenew : null; if (!r) return '<button class="btn" data-act="p-renew-ask">Ask the club for a new contract</button>';
            if (r.withdrawn) return '<p class="muted small">The club has ended contract talks for this season.</p>';
            if (r.done) return '<p class="muted small">You signed a new contract this season.</p>';
            return `<div class="offer"><div><strong>${esc(clubName(c.clubId))}</strong> offer <span class="money">${money(r.wage)}/wk</span> for ${r.years} years</div><div class="row gap"><button class="btn primary sm" data-act="p-renew-sign">Sign</button></div></div>
              <div class="row gap wrap"><label class="inline">Ask for (€K/week) <input class="input sm" id="p-ask-renew" type="number" min="1" value="${Math.round(r.wage * 1.2 / 1000)}"></label><button class="btn sm" data-act="p-renew-counter">Negotiate</button></div>${r.msg ? `<div class="notice info">${esc(r.msg)}</div>` : ''}`; })()}
        </section>
        <section class="card">
          <h3>Transfers</h3>
          <div class="notice ${win.open ? 'good' : ''}"><strong>${esc(win.label)}.</strong> ${win.open ? 'You can ask your agent to find you a new club.' : 'Clubs can only sign you during a transfer window.'}</div>
          <p class="muted small">Clubs look for players who would fit their level. Keep your OVR rising and bigger clubs will come for you.</p>
          <button class="btn primary" data-act="request-transfer" ${win.open ? '' : 'disabled'}>Ask agent to find a new club</button>
          ${c.offers.length ? `<div class="mt">${c.offers.map((o) => playerOfferHtml(o)).join('')}</div>` : ''}
          ${moves.length ? `<h4>Your moves</h4><ul class="plist">${moves.map((t) => `<li>${seasonLabel(t.season)} · ${esc(t.club)} → <strong>${esc(t.to || '')}</strong><span class="ml-auto money">${money(t.fee)}</span></li>`).join('')}</ul>` : ''}
        </section>
      </div>`;
  }
  function viewClub() {
    const c = C(), club = S.clubs[c.clubId];
    if (!club.formation) club.formation = pickFormation(club);
    const xi = bestXI(club.pids, club.formation, { bias: { [c.pid]: 3 } });
    const inXi = new Set(xi);
    const players = club.pids.map((id) => S.players[id]).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
    const t = leagueTable(c.leagueId), pos = t.findIndex((r) => r.id === c.clubId) + 1;
    return `
      <section class="card">
        <div class="row between wrap gap"><h3>${crest(club)} ${esc(club.name)}</h3><span class="muted">${esc(S.leagues[club.leagueId].name)} · ${ordinal(pos)} · Team OVR ${clubRating(club.id)} · ${club.formation}</span></div>
        <p class="muted small">The manager picks the team. Players marked ● are in his current best XI.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="left">Name</th><th>Age</th><th>OVR</th><th>POT</th><th>Form</th><th>Apps</th><th>G</th><th>A</th><th>Avg</th></tr></thead><tbody>
        ${players.map((p) => `<tr class="${p.id === c.pid ? 'me' : ''} ${!available(p) ? 'unavail' : ''}"><td>${posBadge(p.pos)}</td><td class="left">${inXi.has(p.id) ? '<span class="xi-dot"></span>' : ''}${playerLink(p)} ${statusIcons(p)} ${p.id === c.pid ? '<span class="tag good">YOU</span>' : ''}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${potBadge(p)}</td><td>${formArrow(p.form)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Squad & tactics
   * ------------------------------------------------------------------ */
  function viewSquad() {
    const c = C(), club = S.clubs[c.clubId];
    const changes = cleanLineup();
    const { covers } = matchLineup();
    const coverBy = Object.fromEntries(covers.map((cv) => [cv.i, cv]));
    const slots = FORMATIONS[c.formation];
    const lineupSet = new Set(c.lineup);
    c.roles = slots.map(([pos], i) => (ROLE[c.roles?.[i]]?.group === roleGroup(pos) ? c.roles[i] : defaultRole(pos)));
    const side = { xi: slots.map((s, i) => ({ pid: matchLineup().ids[i], slot: s[0], role: c.roles[i] })).filter((x) => x.pid), mentality: c.mentality, style: c.style };
    const st = sideStrength(side, false);
    const chips = slots.map(([pos, x, y], i) => {
      const p = S.players[c.lineup[i]];
      if (!p) return `<button class="chip empty ${ui.squadSel === i ? 'sel' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}"><span class="chip-r">?</span><span class="chip-n">${pos}</span></button>`;
      const e = eff(p, pos);
      const cv = coverBy[i];
      return `<button class="chip ${ui.squadSel === i ? 'sel' : ''} ${pfit(p, pos) < 0 ? 'oop' : ''} ${cv ? 'out' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}" title="${esc(p.name)} (${p.pos}) playing ${pos}">
        <span class="chip-r ${ovrClass(e)}">${e}</span><span class="chip-n">${esc(p.name.split(' ').slice(-1)[0])}</span><span class="chip-p">${cv ? unavailWhy(p).split(' ')[0].toUpperCase() : `${pos} · ${c.roles[i].toUpperCase()}`}</span>
        ${cv && cv.in ? `<span class="chip-cover">↳ ${esc(S.players[cv.in].name.split(' ').slice(-1)[0])}</span>` : ''}</button>`;
    }).join('');
    const sorters = {
      pos: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr, pot: (a, b) => b.pot - a.pot || a.age - b.age, age: (a, b) => a.age - b.age, value: (a, b) => playerValue(b) - playerValue(a),
      goals: (a, b) => b.st.goals - a.st.goals, rating: (a, b) => avgRating(b) - avgRating(a), wage: (a, b) => b.wage - a.wage,
    };
    const players = club.pids.map((id) => S.players[id]).sort(sorters[ui.squadSort] || sorters.pos);
    const selPos = ui.squadSel !== null && slots[ui.squadSel] ? slots[ui.squadSel][0] : null;
    const th = (k, l, cls = '') => `<th class="${cls} sortable ${ui.squadSort === k ? 'on' : ''}" data-act="squad-sort" data-id="${k}">${l}</th>`;
    const bill = wageBill();
    return `
      <div class="grid g-squad">
        <section class="card">
          <div class="row gap wrap">
            <label class="inline">Formation <select class="input sm" id="sel-formation" data-change="formation">${FORMATION_NAMES.map((f) => `<option ${f === c.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
            <label class="inline">Mentality <select class="input sm" id="sel-mentality2" data-change="mentality">${Object.entries(MENTALITY).map(([k, m]) => `<option value="${k}" ${c.mentality === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
            <label class="inline">Play style <select class="input sm" id="sel-style" data-change="style">${Object.entries(STYLES).map(([k, st]) => `<option value="${k}" ${(c.style || 'balanced') === k ? 'selected' : ''}>${st.label}</option>`).join('')}</select></label>
            <button class="btn sm" data-act="auto-pick">Auto-pick best XI</button>
          </div>
          <p class="muted small style-desc">${esc(STYLES[c.style || 'balanced'].desc)}</p>
          <div class="pitch">${chips}<div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="half"></i><i class="circle"></i></div></div>
          <p class="muted small">${ui.squadSel !== null ? `Selected <strong>${selPos}</strong>. Click a player in the list, or another shirt on the pitch to swap. <button class="link" data-act="slot-cancel">Cancel</button>` : 'Your XI is locked in: it only changes when you change it. Injured or suspended players get a stand-in (↳) for the next match and come back automatically when fit. Orange shirts are out of position.'}</p>
          ${changes.length ? `<div class="notice">Updated because players left: ${esc(changes.join('; '))}.</div>` : ''}
          <h4>Player roles</h4>
          <div class="roles">${slots.map(([pos], i) => { const p = S.players[c.lineup[i]]; const own = p && p.role && ROLE[p.role]?.group === roleGroup(pos); return `<div class="role-row"><span class="slot">${pos}</span><span class="role-name">${p ? esc(p.name.split(' ').slice(-1)[0]) : '—'}</span>${own ? `<span class="small muted">${esc(ROLE[p.role].label)} (his own style)</span>` : `<select class="input sm" id="role-${i}" data-slot="${i}" data-change="role">${ROLE_GROUPS[roleGroup(pos)].map(([id, label]) => `<option value="${id}" ${c.roles[i] === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`}</div>`; }).join('')}</div>
          <p class="muted small">Roles change who shoots, who creates, who heads crosses in, and how much each player adds to attack, midfield or defence.</p>
          <div class="team-ratings">
            <div><span>Attack</span><strong>${st.attack.toFixed(0)}</strong></div>
            <div><span>Midfield</span><strong>${st.control.toFixed(0)}</strong></div>
            <div><span>Defence</span><strong>${st.defense.toFixed(0)}</strong></div>
            <div><span>Team OVR</span><strong>${st.ovr.toFixed(0)}</strong></div>
          </div>
        </section>
        <section class="card">
          <h3>Squad <span class="muted small">${club.pids.length}/${MAX_SQUAD} players · wages ${money(bill)}/wk of ${money(c.wageBudget)}</span></h3>
          <div class="tbl-wrap"><table class="tbl squad-tbl"><thead><tr>
            ${th('pos', 'Pos')}<th class="left">Name</th>${th('age', 'Age')}${th('ovr', 'OVR')}${th('pot', 'POT')}${selPos ? `<th title="Rating in ${selPos}">@${selPos}</th>` : ''}<th>Form</th><th>Apps</th>${th('goals', 'G')}<th>A</th>${th('rating', 'Avg')}${th('value', 'Value')}${th('wage', 'Wage')}<th>Contract</th><th></th>
          </tr></thead><tbody>
          ${players.map((p) => `<tr class="${lineupSet.has(p.id) ? 'starter' : ''} ${selPos ? 'pickable' : ''} ${!available(p) ? 'unavail' : ''}" ${selPos ? `data-act="assign" data-id="${p.id}"` : ''}>
            <td>${posBadge(p.pos)}</td>
            <td class="left name-cell">${lineupSet.has(p.id) ? '<span class="xi-dot" title="In your XI"></span>' : ''}${selPos ? esc(p.name) : playerLink(p)} ${statusIcons(p)} ${genTag(p)}</td>
            <td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${potBadge(p)}</td>
            ${selPos ? `<td><strong class="${pfit(p, selPos) < 0 ? 'warn-t' : ''}">${eff(p, selPos)}</strong></td>` : ''}
            <td>${formArrow(p.form)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td>
            <td class="money">${money(playerValue(p))}</td><td class="money muted">${money(p.wage)}</td>
            <td class="${expiring(p) ? 'warn-t' : 'muted'} small">${contractLabel(p)}</td>
            <td class="nowrap"><button class="btn xs ghost" data-act="renew" data-id="${p.id}">Contract</button> <button class="btn xs ghost" data-act="loan" data-id="${p.id}">Loan</button> <button class="btn xs ghost" data-act="sell" data-id="${p.id}">Sell</button></td>
          </tr>`).join('')}
          </tbody></table></div>
        </section>
      </div>`;
  }
  const formArrow = (f) => (f > 0.8 ? '<span class="form up" title="Great form">▲▲</span>' : f > 0.25 ? '<span class="form up" title="Good form">▲</span>' : f < -0.8 ? '<span class="form down" title="Poor form">▼▼</span>' : f < -0.25 ? '<span class="form down" title="Below par">▼</span>' : '<span class="form" title="Average form">●</span>');

  function assignToSlot(slotIdx, pid) {
    const c = C();
    const cur = c.lineup.indexOf(pid);
    const prev = c.lineup[slotIdx];
    if (cur >= 0) c.lineup[cur] = prev;
    c.lineup[slotIdx] = pid;
    ui.squadSel = null;
    const p = S.players[pid];
    if (!available(p)) toast(`${p.name} is ${unavailWhy(p)}. A stand-in will cover until he is available.`, 'info');
    save();
    render();
  }

  /* ------------------------------------------------------------------ *
   * Transfers
   * ------------------------------------------------------------------ */
  const interestTag = (it) => `<span class="tag int-${it.lvl}">${it.label}</span>`;
  function viewTransfers() {
    const c = C(), me = S.clubs[c.clubId], f = ui.market, win = windowInfo();
    const q = norm(f.q);
    let list = Object.values(S.players).filter((p) => p.clubId !== c.clubId && !p.loan && (p.clubId === 'FA' || isClub(S.clubs[p.clubId])));
    if (f.league === 'FA') list = list.filter((p) => p.clubId === 'FA');
    else if (f.league !== 'ALL') list = list.filter((p) => S.clubs[p.clubId].leagueId === f.league);
    if (f.pos !== 'ALL') list = list.filter((p) => (['DEF', 'MID', 'ATT'].includes(f.pos) ? LINE[p.pos] === f.pos : p.pos === f.pos));
    list = list.filter((p) => p.ovr >= f.min && p.ovr <= f.max);
    if (f.age) list = list.filter((p) => p.age <= f.age);
    if (q) list = list.filter((p) => norm(p.name).includes(q) || norm(S.clubs[p.clubId].name).includes(q));
    let rows = list.map((p) => ({ p, fee: clubValuation(p, c.clubId) }));
    const maxPrice = f.price === -1 ? me.budget : f.price;
    if (maxPrice) rows = rows.filter((x) => x.fee <= maxPrice);
    const sorts = { ovr: (a, b) => b.p.ovr - a.p.ovr || a.fee - b.fee, price: (a, b) => a.fee - b.fee, priceDesc: (a, b) => b.fee - a.fee, age: (a, b) => a.p.age - b.p.age || b.p.ovr - a.p.ovr, pot: (a, b) => b.p.pot - a.p.pot || a.p.age - b.p.age };
    rows.sort(sorts[f.sort] || sorts.ovr);
    const total = rows.length;
    rows = rows.slice(0, 40 * f.page);
    const bill = wageBill();
    return `
      <section class="card">
        <div class="row between wrap gap">
          <h3>Transfer market</h3>
          <div class="budgets"><span><span class="muted">Budget</span> <strong class="money">${money(me.budget)}</strong></span><span><span class="muted">Wages</span> <strong class="money">${money(bill)}</strong><span class="muted"> / ${money(c.wageBudget)} a week</span></span><span class="muted small">Squad ${me.pids.length}/${MAX_SQUAD}</span></div>
        </div>
        <div class="notice ${win.open ? 'good' : ''}"><strong>${esc(win.label)}.</strong> ${win.open ? 'You can buy and sell players, and AI clubs are doing deals too.' : 'You can only sign free agents until the window opens. Use the Fixtures tab to move forward in time.'}</div>
        <div class="filters">
          <input class="input" id="m-q" placeholder="Search player or club…" value="${esc(f.q)}" data-change="m-q" data-live="1">
          <select class="input" id="m-league" data-change="m-league"><option value="ALL">All leagues</option>${S.leagueOrder.map((id) => `<option value="${id}" ${f.league === id ? 'selected' : ''}>${esc(S.leagues[id].name)}</option>`).join('')}<option value="FA" ${f.league === 'FA' ? 'selected' : ''}>Free agents & youth</option></select>
          <select class="input" id="m-pos" data-change="m-pos"><option value="ALL">All positions</option>${[['GK', 'Goalkeepers'], ['DEF', 'All defenders'], ['MID', 'All midfielders'], ['ATT', 'All attackers']].map(([v, l]) => `<option value="${v}" ${f.pos === v ? 'selected' : ''}>${l}</option>`).join('')}${POSITIONS.filter((p) => p !== 'GK').map((p) => `<option ${f.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <label class="inline">OVR <input class="input xs" id="m-min" type="number" min="40" max="99" value="${f.min}" data-change="m-min"> – <input class="input xs" id="m-max" type="number" min="40" max="99" value="${f.max}" data-change="m-max"></label>
          <select class="input" id="m-age" data-change="m-age"><option value="0">Any age</option>${[19, 21, 23, 25, 28, 30].map((a) => `<option value="${a}" ${f.age === a ? 'selected' : ''}>≤ ${a}</option>`).join('')}</select>
          <select class="input" id="m-price" data-change="m-price"><option value="0">Any fee</option>${[1e6, 5e6, 10e6, 20e6, 40e6, 70e6, 100e6, 150e6].map((v) => `<option value="${v}" ${f.price === v ? 'selected' : ''}>≤ ${money(v)}</option>`).join('')}<option value="-1" ${f.price === -1 ? 'selected' : ''}>Affordable</option></select>
          <select class="input" id="m-sort" data-change="m-sort">${[['ovr', 'Best OVR'], ['pot', 'Best potential'], ['price', 'Cheapest'], ['priceDesc', 'Most expensive'], ['age', 'Youngest']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <p class="muted small">${total} players. <strong>Est. fee</strong> is what the selling club wants: key players and young talents cost more, and so does buying from a league rival or in January. <strong>Interest</strong> shows whether the player would move to your club, which depends on its size, league, European football and his role.</p>
        <div class="tbl-wrap"><table class="tbl market"><thead><tr><th>Pos</th><th class="left">Name</th><th>Age</th><th>OVR</th><th>POT</th><th class="left">Club</th><th>Value</th><th>Est. fee</th><th>Interest</th><th></th></tr></thead><tbody>
          ${rows.map(({ p, fee }) => { const it = interest(p, c.clubId); const can = (win.open || p.clubId === 'FA') && it.lvl > 0; return `<tr>
            <td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)} ${genTag(p)} ${statusIcons(p)}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${potBadge(p)}</td>
            <td class="left small">${esc(S.clubs[p.clubId].name)}</td><td class="money muted">${money(playerValue(p))}</td><td class="money"><strong>${money(fee)}</strong></td><td>${interestTag(it)}</td>
            <td><button class="btn xs ${can ? 'primary' : 'ghost'}" data-act="buy" data-id="${p.id}">${p.clubId === 'FA' ? 'Sign' : 'Negotiate'}</button></td>
          </tr>`; }).join('')}
        </tbody></table></div>
        ${total > rows.length ? `<div class="center"><button class="btn" data-act="m-more">Show more (${total - rows.length} remaining)</button></div>` : ''}
      </section>
      ${loansHtml()}
      <div class="grid g2">
        <section class="card"><h3>Transfer news</h3>${c.tnews.length ? `<ul class="plist">${c.tnews.slice(0, 25).map((t) => `<li><span class="muted small">${fmtDate(t.date)}</span> <span>${esc(t.name)} <span class="muted small">${t.pos} · ${t.ovr}</span><br><span class="small">${esc(t.from)} → <strong>${esc(t.to)}</strong></span></span><span class="ml-auto money">${t.fee ? money(t.fee) : 'Free'}</span></li>`).join('')}</ul>` : '<p class="muted">No deals yet. Clubs trade during the summer and January windows.</p>'}</section>
        <section class="card"><h3>Your transfer history</h3>${c.transfers.length ? `<ul class="plist">${c.transfers.slice(0, 25).map((t) => `<li><span class="tag ${t.dir === 'in' ? 'good' : 'warn'}">${t.dir === 'in' ? 'IN' : 'OUT'}</span> ${esc(t.name)} <span class="muted small">${t.dir === 'in' ? 'from' : 'to'} ${esc(t.club)} · ${seasonLabel(t.season)}</span><span class="ml-auto money">${money(t.fee)}</span></li>`).join('')}</ul>` : '<p class="muted">You have not made any transfers yet.</p>'}</section>
      </div>`;
  }

  // Personal terms: wage and contract length, shared by signings and renewals.
  function termsHtml(p, t, ctx, intro, prefix) {
    const w = t.w || {};
    const ask = wageAsk(p, ctx);
    const def = ((w.lastOffer || ask * 0.9) / 1000).toFixed(0);
    const years = w.lastYears || 3;
    const room = C().wageBudget - wageBill() + (ctx === 'renew' ? (p.wage || 0) : 0);
    return `<div class="terms">
      <h4>Personal terms</h4>
      <p class="small">${esc(intro)}</p>
      <table class="tbl kv"><tbody>
        <tr><td>${ctx === 'renew' ? 'Current wage' : 'Wage now'}</td><td class="money">${money(p.wage || 0)} / week</td></tr>
        <tr><td>His agent's opening demand</td><td class="money">~${money(ask)} / week (3 years)</td></tr>
        <tr><td>Wage room</td><td class="money ${room < ask ? 'warn-t' : ''}">${money(room)} / week</td></tr>
      </tbody></table>
      ${w.msg ? `<div class="notice ${w.status === 'accepted' ? 'good' : w.status === 'counter' ? 'info' : ''}">${esc(w.msg)}</div>` : ''}
      ${w.agreed ? `<div class="row gap wrap mt"><button class="btn primary big" data-act="${prefix}-complete" data-id="${p.id}">${ctx === 'renew' ? 'Sign new contract' : 'Complete signing'}: ${money(w.agreed.wage)}/wk for ${w.agreed.years} yr${w.agreed.years > 1 ? 's' : ''}</button></div>`
        : w.blocked ? '' : `<div class="row gap wrap mt">
          <label class="inline">Wage (€K per week) <input class="input sm" id="wage-offer" type="number" min="1" step="1" value="${def}"></label>
          <label class="inline">Years <select class="input sm" id="wage-years">${[1, 2, 3, 4, 5].map((y) => `<option ${y === years ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <button class="btn primary" data-act="${prefix}-wage" data-id="${p.id}">Offer contract</button>
          ${w.counter ? `<button class="btn" data-act="${prefix}-wage-accept" data-id="${p.id}">Accept ${money(w.counter)}/wk</button>` : ''}
        </div>
        <p class="muted small">Agents quietly accept a bit less than they ask for. Younger players want more for longer deals, and older players take less for security. After 3 failed offers the talks end.</p>`}
    </div>`;
  }
  function renewModal(pid) {
    const c = C(), p = S.players[pid];
    const t = renewTalk(pid);
    const r = squadRank(p);
    openModal(`
      <div class="neg">
        <div class="pm-head"><div class="pm-ovr ${ovrClass(p.ovr)}">${p.ovr}<small>${p.pos}</small></div>
          <div><h2>${esc(p.name)}</h2><div class="muted">Age ${p.age} · contract until <strong class="${expiring(p) ? 'warn-t' : ''}">${contractLabel(p)}</strong> · ${r < 3 ? 'Key player' : r < 11 ? 'First-team player' : 'Squad player'}</div></div></div>
        ${termsHtml(p, t, 'renew', expiring(p) ? 'His contract ends this season. If you do not agree a new one, he leaves for free in the summer.' : 'You can extend his contract now to secure his future.', 'ren')}
      </div>`);
  }
  function wageOfferFromForm() {
    const wage = Math.round((parseFloat($('#wage-offer').value) || 0) * 1000);
    const years = parseInt($('#wage-years').value, 10) || 3;
    return { wage, years };
  }

  // Negotiation modal
  function negModal(pid) {
    const c = C(), p = S.players[pid], me = S.clubs[c.clubId];
    if (!p) return;
    if (!ui.neg || ui.neg.pid !== pid) ui.neg = { pid, msg: null, status: null };
    const it = interest(p, c.clubId);
    const stance = sellingStance(p);
    const t = talk(pid);
    const val = clubValuation(p, c.clubId);
    const wage = wageDemand(p, it);
    const blocker = signingBlocker(p);
    const room = c.wageBudget - wageBill();
    const fa = p.clubId === 'FA';
    const agreed = t.agreed > 0 || (fa && ui.neg.status === 'accepted');
    const guess = fa ? val : niceRound(val * (0.9 + hash01(p.id + c.season) * 0.2));
    const defOffer = ((ui.neg.last || (fa ? val : niceRound(playerValue(p)))) / 1e6).toFixed(1);
    openModal(`
      <div class="neg">
        <div class="pm-head">
          <div class="pm-ovr ${ovrClass(p.ovr)}">${p.ovr}<small>${p.pos}</small></div>
          <div><h2>${esc(p.name)}</h2><div class="muted">${esc(clubName(p.clubId))} · Age ${p.age} · Potential ${potRange(p)}</div></div>
        </div>
        <table class="tbl kv"><tbody>
          <tr><td>Market value</td><td class="money">${money(playerValue(p))}</td></tr>
          <tr><td>Club's stance</td><td><span class="tag ${stance.cls}">${esc(stance.label)}</span></td></tr>
          <tr><td>${fa ? 'Signing fee' : 'Club valuation (estimate)'}</td><td class="money">${fa ? money(val) : `~${money(guess)}`}</td></tr>
          <tr><td>Player interest</td><td>${interestTag(it)}</td></tr>
          <tr><td>Wage demand</td><td class="money">${it.lvl ? `${money(wage)} / week` : '—'}</td></tr>
          <tr><td>Your budget</td><td class="money">${money(me.budget)}</td></tr>
          <tr><td>Wage room</td><td class="money ${room < wage ? 'warn-t' : ''}">${money(room)} / week</td></tr>
        </tbody></table>
        ${blocker ? `<div class="notice">${esc(blocker)}</div>` : ''}
        ${ui.neg.msg ? `<div class="notice ${ui.neg.status === 'accepted' ? 'good' : ui.neg.status === 'counter' ? 'info' : ''}">${esc(ui.neg.msg)}</div>` : ''}
        ${!blocker && !agreed && !t.blocked ? `
          <div class="row gap wrap mt">
            <label class="inline">Your offer (€ millions) <input class="input sm" id="neg-offer" type="number" min="0" step="0.5" value="${defOffer}"></label>
            <button class="btn primary" data-act="neg-bid" data-id="${pid}">Submit offer</button>
            ${t.counter ? `<button class="btn" data-act="neg-counter" data-id="${pid}">Accept ${money(t.counter)}</button>` : ''}
          </div>
          <p class="muted small">Clubs accept offers at or above their valuation and counter offers that are close. Bids far below it end talks. You get 3 bids per player per window.</p>` : ''}
        ${!blocker && agreed ? termsHtml(p, t, 'sign', `Fee agreed: ${fa ? `signing fee ${money(val)}` : money(t.agreed)}. Now agree personal terms.`, 'neg') : ''}
      </div>`);
  }

  /* ------------------------------------------------------------------ *
   * Fixtures (calendar across all competitions)
   * ------------------------------------------------------------------ */
  function compOptions(selected, includeMine) {
    const c = C();
    const groups = [
      ['Leagues', Object.values(c.comps).filter((x) => x.type === 'league')],
      ['Domestic cups', Object.values(c.comps).filter((x) => x.type === 'cup')],
      ['Europe', EURO_ORDER.map((k) => c.comps[k]).filter(Boolean)],
      ['International', Object.values(c.comps).filter((x) => x.type === 'intl' || x.type === 'tourn')],
    ];
    return (includeMine ? `<option value="mine" ${selected === 'mine' ? 'selected' : ''}>Your competitions</option><option value="all" ${selected === 'all' ? 'selected' : ''}>Everything</option>` : '')
      + groups.map(([g, list]) => `<optgroup label="${g}">${list.map((x) => `<option value="${x.id}" ${selected === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  }
  function viewFixtures() {
    const c = C(), uid = c.clubId;
    const filt = ui.fixFilter;
    const ids = new Set(filt === 'mine' ? userCompIds() : filt === 'all' ? Object.keys(c.comps) : [filt]);
    const dayIdxs = c.days.map((_, i) => i).filter((i) => c.days[i].items.some(([cid]) => ids.has(cid)));
    if (!dayIdxs.length) return '<section class="card"><p>No fixtures.</p></section>';
    if (ui.fixDay == null || !dayIdxs.includes(ui.fixDay)) ui.fixDay = dayIdxs.find((i) => i >= c.dayIdx) ?? dayIdxs[dayIdxs.length - 1];
    const di = ui.fixDay, pos = dayIdxs.indexOf(di), day = c.days[di];
    const groups = day.items.filter(([cid]) => ids.has(cid)).map(([cid, ri]) => {
      const comp = c.comps[cid], rd = comp.rounds[ri];
      const list = rd.pending
        ? '<li class="muted center">Draw not made yet: it happens when the previous round finishes.</li>'
        : rd.matches.map((m, mi) => `
          <li class="${m.h === uid || m.a === uid ? 'me' : ''} ${m.played ? 'played' : ''}" ${m.played ? `data-act="report" data-id="${cid}|${ri}|${mi}"` : ''}>
            <span class="fx-t right">${esc(clubName(m.h))} ${crest(S.clubs[m.h], 'sm')}</span>
            <span class="fx-s">${scoreText(m)}</span>
            <span class="fx-t">${crest(S.clubs[m.a], 'sm')} ${esc(clubName(m.a))}</span>
          </li>`).join('');
      return `<div class="fx-group"><h4>${compTag(comp)} ${esc(comp.name)} · ${esc(rd.name)}</h4><ul class="fixtures">${list}</ul></div>`;
    }).join('');
    const cal = userFixtures();
    const status = di === c.dayIdx && !c.seasonOver ? '<span class="tag good">NEXT</span>' : di < c.dayIdx ? '<span class="tag">PLAYED</span>' : '';
    return `
      <div class="grid g-fix">
        <section class="card">
          <div class="row gap wrap"><label class="inline">Show <select class="input sm" id="fix-filter" data-change="fix-filter">${compOptions(filt, true)}</select></label></div>
          <div class="md-nav">
            <button class="btn sm" data-act="day-go" data-id="${dayIdxs[pos - 1] ?? ''}" ${pos <= 0 ? 'disabled' : ''}>◀</button>
            <div class="md-title">
              <select class="input sm" id="fix-day" data-change="fix-day">${dayIdxs.map((i) => `<option value="${i}" ${i === di ? 'selected' : ''}>${fmtDate(c.days[i].date, true)}</option>`).join('')}</select>
              <div class="muted small">${status}</div>
            </div>
            <button class="btn sm" data-act="day-go" data-id="${dayIdxs[pos + 1] ?? ''}" ${pos >= dayIdxs.length - 1 ? 'disabled' : ''}>▶</button>
          </div>
          ${groups}
          ${!c.seasonOver ? `<div class="row gap wrap center mt">
            ${di > c.dayIdx ? `<button class="btn primary" data-act="sim-to" data-id="${di}">⏩ Simulate up to ${fmtDate(day.date)}</button>` : ''}
            <button class="btn" data-act="tab" data-id="match">Next match →</button>
            <button class="btn ghost" data-act="sim-end">Simulate rest of season</button>
          </div>` : ''}
          <p class="muted small center">Click a played match to open its report. Use ◀ ▶ or the date picker to move through the season.</p>
        </section>
        <section class="card">
          <h3>Your season calendar</h3>
          <ul class="calendar">${cal.map((x) => {
            let res = '', opp = '';
            if (!x.m) { opp = `<span class="muted">${esc(stripLeg(x.rd.name))} · draw pending</span>`; }
            else {
              const home = x.m.h === uid; opp = `${home ? 'vs' : '@'} ${esc(clubName(home ? x.m.a : x.m.h))}`;
              if (x.m.played) res = resultChip(x.m, uid);
              else if (x.di === c.dayIdx || x.m === nextUserMatch()?.m) res = '<span class="tag good">NEXT</span>';
            }
            return `<li class="${x.di === di ? 'cur' : ''} ${x.m && x.m.played ? '' : 'future'}" data-act="cal-go" data-id="${x.di}"><span class="muted small cal-d">${fmtDate(x.date)}</span>${compTag(x.comp)}<span class="cal-o">${opp}</span><span class="ml-auto">${res}</span></li>`;
          }).join('')}</ul>
        </section>
      </div>`;
  }
  function matchReport(cid, ri, mi) {
    const comp = C().comps[cid], rd = comp.rounds[ri], m = rd.matches[mi];
    const H = S.clubs[m.h], A = S.clubs[m.a];
    const goals = (m.goals || []).map((g) => `<li class="${g[1] ? 'right' : ''}"><strong>${esc(g[0])}'</strong> ⚽ ${esc(S.players[g[2]]?.name ?? 'Own goal')}${g[4] ? ' (pen)' : ''}${g[3] ? ` <span class="muted small">assist ${esc(S.players[g[3]]?.name ?? '')}</span>` : ''}</li>`).join('');
    const s = m.st;
    const stat = (label, a, b, suf = '') => `<tr><td>${a}${suf}</td><td class="muted">${label}</td><td>${b}${suf}</td></tr>`;
    openModal(`
      <div class="report">
        <div class="muted center small">${esc(comp.name)} · ${esc(rd.name)} · ${fmtDate(rd.date, true)}</div>
        <div class="scoreboard sm">
          <div class="sbt">${crest(H, 'lg')}<strong>${esc(H.name)}</strong></div>
          <div class="sbs"><div class="score">${m.hg} <span>-</span> ${m.ag}</div></div>
          <div class="sbt">${crest(A, 'lg')}<strong>${esc(A.name)}</strong></div>
        </div>
        ${m.agg || m.pens || m.et ? `<p class="center extra-line">${[m.agg ? `Aggregate ${m.agg[0]}-${m.agg[1]}` : '', m.pens ? `Penalties ${m.pens[0]}-${m.pens[1]}` : m.et ? 'After extra time' : '', m.w ? `${esc(clubName(m.w))} go through` : ''].filter(Boolean).join(' · ')}</p>` : ''}
        <ul class="goals-list">${goals || '<li class="muted center">No goals</li>'}</ul>
        ${s ? `<table class="tbl stat-tbl"><tbody>${stat('Possession', s.poss[0], s.poss[1], '%')}${stat('Shots', s.shots[0], s.shots[1])}${stat('On target', s.sot[0], s.sot[1])}${stat('Corners', s.corners[0], s.corners[1])}${stat('Cards', `${s.yc[0]}🟨 ${s.rc[0] ? s.rc[0] + '🟥' : ''}`, `${s.yc[1]}🟨 ${s.rc[1] ? s.rc[1] + '🟥' : ''}`)}</tbody></table>` : ''}
        ${m.motm ? `<p class="motm center">⭐ Player of the match: <strong>${esc(S.players[m.motm]?.name ?? '')}</strong></p>` : ''}
      </div>`);
  }

  /* ------------------------------------------------------------------ *
   * Competitions (league tables, cup brackets, European competitions)
   * ------------------------------------------------------------------ */
  function leagueTableHtml(lid) {
    const c = C(), t = leagueTable(lid), n = t.length;
    const q1 = QUOTA.UCL[lid] || 0, q2 = q1 + (QUOTA.UEL[lid] || 0), q3 = q2 + (QUOTA.UECL[lid] || 0);
    const L = S.leagues[lid];
    const hasLower = childLeagues(lid).length > 0;
    const nPro = Math.min(PROMOTED, Math.floor(n / 4));
    const zone = (i) => (L.parent ? (i < nPro ? 'z-promo' : '') : i < q1 ? 'z-cl' : i < q2 ? 'z-el' : i < q3 ? 'z-ecl' : hasLower && i >= n - nPro ? 'z-rel' : '');
    const played = c.comps['L-' + lid].rounds.filter((r) => r.matches.every((m) => m.played)).length;
    return `
      <p class="muted small">${played} of ${c.comps['L-' + lid].rounds.length} matchdays played.</p>
      <div class="tbl-wrap"><table class="tbl league"><thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th class="hide-sm">GF</th><th class="hide-sm">GA</th><th>GD</th><th>Pts</th><th class="hide-sm">Form</th><th class="hide-sm">OVR</th></tr></thead><tbody>
        ${t.map((r, i) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td class="${zone(i)}">${i + 1}</td><td class="left">${crest(S.clubs[r.id], 'sm')} ${esc(clubName(r.id))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td class="hide-sm">${r.gf}</td><td class="hide-sm">${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td><td class="hide-sm">${formDots(r.form)}</td><td class="hide-sm">${ovrBadge(clubRating(r.id))}</td></tr>`).join('')}
      </tbody></table></div>
      ${L.parent
        ? `<div class="legend"><span><i class="z-promo"></i> Promoted to the ${esc(S.leagues[L.parent].name)}</span><span class="muted">Reserve sides (B / Jong) cannot be promoted.</span></div>`
        : `<div class="legend"><span><i class="z-cl"></i> Champions League</span><span><i class="z-el"></i> Europa League</span><span><i class="z-ecl"></i> Conference League</span>${hasLower ? `<span><i class="z-rel"></i> Relegated to the ${esc(S.leagues[childLeagues(lid)[0]].name)}</span>` : ''}<span class="muted">The ${esc(CUP_NAMES[lid] || 'cup')} winner also gets a Europa League place.</span></div>`}
      <p class="muted small">${n} clubs.</p>`;
  }
  function roundListHtml(comp, rd, ri) {
    const uid = C().clubId;
    return `<div class="fx-group"><h4>${esc(rd.name)} <span class="muted small">${fmtDate(rd.date)}</span></h4><ul class="fixtures">${rd.pending ? '<li class="muted center">Draw not made yet</li>' : rd.matches.map((m, mi) => `
      <li class="${m.h === uid || m.a === uid ? 'me' : ''} ${m.played ? 'played' : ''}" ${m.played ? `data-act="report" data-id="${comp.id}|${ri}|${mi}"` : ''}>
        <span class="fx-t right ${m.w === m.h ? 'win' : ''}">${esc(clubName(m.h))}</span><span class="fx-s">${scoreText(m)}</span><span class="fx-t ${m.w === m.a ? 'win' : ''}">${esc(clubName(m.a))}</span>
      </li>`).join('')}</ul></div>`;
  }
  function viewComps() {
    const c = C();
    const sel = ui.compSel && c.comps[ui.compSel] ? ui.compSel : 'L-' + c.leagueId;
    const comp = c.comps[sel];
    let body = '';
    if (comp.type === 'league') body = leagueTableHtml(comp.leagueId);
    else if (comp.type === 'intl' || comp.type === 'tourn') body = intlCompHtml(comp);
    else if (comp.type === 'cup') {
      body = `${comp.winner ? `<div class="notice good">🏆 ${esc(clubName(comp.winner))} won the ${esc(comp.name)}.</div>` : ''}
        <p class="muted small">Single-match knockout for all ${comp.teams.length} clubs from the ${[comp.leagueId, ...childLeagues(comp.leagueId)].map((l) => esc(S.leagues[l].name)).join(' and ')}. Draws go to extra time and penalties. ${comp.prelim.length ? `The ${comp.prelim.length} lowest-rated clubs play a first round.` : ''}</p>
        ${comp.rounds.map((rd, ri) => roundListHtml(comp, rd, ri)).reverse().join('')}`;
    } else {
      const uid = c.clubId;
      let phase = '';
      if (comp.hasPhase) {
        const t = phaseTable(comp);
        const zone = (i) => (i < 8 ? 'z-cl' : i < 24 ? 'z-el' : 'z-rel');
        phase = `<h4>League phase</h4><div class="tbl-wrap"><table class="tbl league"><thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>
          ${t.map((r, i) => `<tr class="${r.id === uid ? 'me' : ''}"><td class="${zone(i)}">${i + 1}</td><td class="left">${crest(S.clubs[r.id], 'sm')} ${esc(clubName(r.id))} <span class="muted small">${esc(LEAGUE_SHORT[S.clubs[r.id].leagueId] || '')}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}
          </tbody></table></div>
          <div class="legend"><span><i class="z-cl"></i> 1–8: Round of 16</span><span><i class="z-el"></i> 9–24: Knockout play-offs</span><span><i class="z-rel"></i> 25+: Eliminated</span></div>`;
      }
      const ko = stageOrder(comp).map((stage) => {
        const rds = comp.rounds.map((rd, ri) => [rd, ri]).filter(([rd]) => rd.stage === stage);
        if (!rds.length) return '';
        const ties = comp.ties[stage];
        if (!ties) return `<div class="fx-group"><h4>${STAGE_NAME[stage]} <span class="muted small">${fmtDate(rds[0][0].date)}</span></h4><p class="muted small">Draw not made yet.</p></div>`;
        return `<div class="fx-group"><h4>${STAGE_NAME[stage]} <span class="muted small">${rds.map(([rd]) => fmtDate(rd.date)).join(' & ')}</span></h4><ul class="ties">${ties.map((t, i) => {
          const legs = rds.map(([rd, ri]) => { const m = rd.matches[i]; return m && m.played ? `<button class="link small" data-act="report" data-id="${comp.id}|${ri}|${i}">${m.hg}-${m.ag}${m.pens ? ` (${m.pens[0]}-${m.pens[1]}p)` : m.et ? ' aet' : ''}</button>` : '<span class="muted small">–</span>'; }).join(' · ');
          return `<li class="${t.hi === uid || t.lo === uid ? 'me' : ''}"><span class="${t.w === t.lo ? 'win' : ''}">${esc(clubName(stage === 'F' ? t.hi : t.lo))}</span> <span class="muted">v</span> <span class="${t.w === (stage === 'F' ? t.lo : t.hi) ? 'win' : ''}">${esc(clubName(stage === 'F' ? t.lo : t.hi))}</span><span class="ml-auto">${legs}</span></li>`;
        }).join('')}</ul></div>`;
      }).join('');
      body = `${comp.winner ? `<div class="notice good">🏆 ${esc(clubName(comp.winner))} won the ${esc(comp.name)}.</div>` : ''}
        <p class="muted small">${comp.teams.length} clubs. ${comp.hasPhase ? 'Each club plays 8 league-phase matches against different opponents, never from its own league.' : 'Straight knockout from the Round of 16.'} Knockout ties are two legs. The final is one match at a neutral venue.</p>
        ${phase}<h4>Knockout rounds</h4>${ko}`;
    }
    const chips = (list) => list.map((x) => `<button class="subtab ${x.id === sel ? 'active' : ''}" data-act="comp-go" data-id="${x.id}">${esc(x.type === 'league' ? S.leagues[x.leagueId].name : x.name)}</button>`).join('');
    const all = Object.values(c.comps);
    return `
      <section class="card">
        <div class="comp-pick"><span class="muted small">Leagues</span><div class="subtabs">${chips(all.filter((x) => x.type === 'league'))}</div></div>
        <div class="comp-pick"><span class="muted small">Cups</span><div class="subtabs">${chips(all.filter((x) => x.type === 'cup'))}</div></div>
        <div class="comp-pick"><span class="muted small">Europe</span><div class="subtabs">${chips(EURO_ORDER.map((k) => c.comps[k]).filter(Boolean))}</div></div>
        <div class="comp-pick"><span class="muted small">Nations</span><div class="subtabs">${chips(all.filter((x) => x.type === 'intl' || x.type === 'tourn'))}</div></div>
      </section>
      <section class="card"><h3>${compTag(comp)} ${esc(comp.name)} ${seasonLabel(c.season)}</h3>${body}</section>`;
  }

  /* ------------------------------------------------------------------ *
   * International & youth academy views
   * ------------------------------------------------------------------ */
  function intlCompHtml(comp) {
    const c = C();
    const myNat = isPlayerMode() ? natClubId(me().nat) : null;
    if (comp.type === 'intl') {
      const played = comp.rounds.map((rd, ri) => [rd, ri]).filter(([rd]) => !rd.pending);
      const upcoming = comp.rounds.filter((rd) => rd.pending).map((rd) => `<li>${fmtDate(rd.date, true)} · ${esc(rd.name)}</li>`).join('');
      return `<p class="muted small">During each international break every nation plays two matches, mostly against opponents from its own confederation. Results move the world ranking, which decides who qualifies for tournaments.</p>
        ${upcoming ? `<h4>Coming up</h4><ul class="plist">${upcoming}</ul>` : ''}
        ${played.reverse().map(([rd, ri]) => roundListHtml(comp, rd, ri)).join('') || '<p class="muted">No international matches played yet this season.</p>'}`;
    }
    const groups = comp.groups.map((g, gi) => {
      const t = groupTable(comp, gi);
      return `<div class="grp"><h4>Group ${groupLetter(gi)}</h4><table class="tbl compact"><tbody>${t.map((r, i) => `<tr class="${r.id === myNat ? 'me' : ''}"><td>${i + 1}</td><td class="left">${esc(clubName(r.id))}</td><td>${r.p}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}</tbody></table></div>`;
    }).join('');
    const ko = comp.rounds.map((rd, ri) => [rd, ri]).filter(([rd]) => rd.ko).map(([rd, ri]) => roundListHtml(comp, rd, ri)).reverse().join('');
    const first = comp.rounds[0]?.date, last = comp.rounds[comp.rounds.length - 1]?.date;
    const top = Object.values(S.players).filter((p) => p.cg[comp.id] && p.cg[comp.id][1]).sort((a, b) => b.cg[comp.id][1] - a.cg[comp.id][1]).slice(0, 5);
    return `${comp.winner ? `<div class="notice good">🏆 ${esc(clubName(comp.winner))} won the ${esc(comp.name)}.</div>` : ''}
      <p class="muted small">${fmtDate(first, true)} – ${fmtDate(last, true)} · ${comp.teams.length} nations${comp.midSeason ? '. <strong>Played during the club season:</strong> called-up players miss their clubs\' matches until their nation is knocked out.' : '.'}</p>
      ${top.length ? `<p class="small">Top scorers: ${top.map((p) => `${esc(p.name)} ${natTag(p.nat)} <strong>${p.cg[comp.id][1]}</strong>`).join(' · ')}</p>` : ''}
      ${groups ? `<div class="groups">${groups}</div>` : ''}
      <h4>Knockout rounds</h4>${ko}`;
  }
  function viewIntl() {
    const c = C();
    const tourns = Object.values(c.comps).filter((x) => x.type === 'tourn');
    const intl = c.comps.INT;
    const sel = ui.intlSel && c.comps[ui.intlSel] ? c.comps[ui.intlSel] : tourns.find((t) => !t.winner) || intl;
    const ranking = Object.values(NATIONS).map((n) => ({ n, e: S.nations[n.code].elo, f: S.nations[n.code].form || [] })).sort((a, b) => b.e - a.e);
    const pools = natPools();
    let mine = '';
    if (isPlayerMode()) {
      const p = me(), club = S.clubs[natClubId(p.nat)];
      const squad = club.squad || [];
      const rank = ranking.findIndex((r) => r.n.code === p.nat) + 1;
      const pool = (pools.get(p.nat) || []).sort((a, b) => b.ovr - a.ovr);
      const place = pool.findIndex((x) => x.id === p.id) + 1;
      mine = `<section class="card"><h3>${natTag(p.nat)} ${esc(NATIONS[p.nat].name)} <span class="muted small">world ranking ${ordinal(rank)}</span></h3>
        <div class="stats-row"><div class="big-stat"><span>Your caps</span><strong>${(p.intl || [0, 0])[0]}</strong></div><div class="big-stat"><span>International goals</span><strong>${(p.intl || [0, 0])[1]}</strong></div><div class="big-stat"><span>Squad status</span><strong>${squad.includes(p.id) ? 'In the current squad' : `Not selected · ${ordinal(place)} best ${p.pos} option`}</strong></div></div>
        <p class="muted small">The coach picks the 23 best available players with a balance of positions. Raise your OVR to force your way in.</p></section>`;
    } else {
      const club = S.clubs[c.clubId];
      const internationals = club.pids.map((id) => S.players[id]).filter((p) => p.nat && NATIONS[p.nat]).sort((a, b) => (b.intl?.[0] || 0) - (a.intl?.[0] || 0) || b.ovr - a.ovr);
      mine = `<section class="card"><h3>Your internationals</h3><p class="muted small">Players picked by their national team play during international breaks and can come back injured. At tournaments in the club season (e.g. AFCON or the Asian Cup) they miss club matches until their nation is knocked out.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="left">Player</th><th>Nation</th><th>OVR</th><th>Caps</th><th>Goals</th><th>Status</th></tr></thead><tbody>
        ${internationals.map((p) => `<tr><td class="left">${posBadge(p.pos)} ${playerLink(p)}</td><td>${natTag(p.nat)}</td><td>${ovrBadge(p.ovr)}</td><td>${p.intl?.[0] || 0}</td><td>${p.intl?.[1] || 0}</td><td>${p.away ? `<span class="tag intl">Away · ${esc(c.comps[p.away]?.short || 'INTL')}</span>` : (S.clubs[natClubId(p.nat)].squad || []).includes(p.id) ? '<span class="tag">In squad</span>' : '<span class="muted small">—</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">None of your players has a registered nationality.</td></tr>'}
        </tbody></table></div></section>`;
    }
    return `
      <section class="card">
        <h3>🌍 International football ${seasonLabel(c.season)}</h3>
        <div class="tourn-cards">
          ${tourns.map((t) => `<button class="tourn-card ${sel === t ? 'sel' : ''}" data-act="intl-sel" data-id="${t.id}"><strong>${esc(t.name)}</strong><span class="muted small">${fmtDate(t.rounds[0].date)} – ${fmtDate(t.rounds[t.rounds.length - 1].date)}</span><span class="small">${t.winner ? `🏆 ${esc(clubName(t.winner))}` : t.rounds.some((r) => r.matches.some((m) => m.played)) ? 'In progress' : 'Upcoming'}</span></button>`).join('')}
          ${intl ? `<button class="tourn-card ${sel === intl ? 'sel' : ''}" data-act="intl-sel" data-id="INT"><strong>International breaks</strong><span class="muted small">Sep · Oct · Nov · Mar</span><span class="small">${intl.rounds.filter((r) => r.matches.some((m) => m.played)).length}/${intl.rounds.length} match days played</span></button>` : ''}
        </div>
        ${!tourns.length ? '<p class="muted small">No major tournament this season. The World Cup is played every 4 years (2026, 2030…), the Euros and Copa América in 2028, and AFCON and the Nations League Finals in odd years.</p>' : ''}
      </section>
      ${sel ? `<section class="card"><h3>${esc(sel.name)}</h3>${intlCompHtml(sel)}</section>` : ''}
      <div class="grid g2">
        ${mine}
        <section class="card"><h3>World ranking</h3><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>#</th><th class="left">Nation</th><th>Conf.</th><th>Points</th><th>Form</th></tr></thead><tbody>
          ${ranking.slice(0, 40).map((r, i) => `<tr class="${isPlayerMode() && r.n.code === me().nat ? 'me' : ''}"><td>${i + 1}</td><td class="left">${natTag(r.n.code)} ${esc(r.n.name)}</td><td class="small muted">${r.n.confed}</td><td>${r.e}</td><td>${formDots(r.f)}</td></tr>`).join('')}
        </tbody></table></div></section>
      </div>`;
  }
  /* --- Training UI --- */
  function attrChips(p) {
    const prof = APROF[PROF_OF[p.pos]];
    return `<div class="attrs">${attrKeys(p).map((k) => { const v = attr(p, k), tb = (p.tb && p.tb[k]) || 0; return `<span class="at ${prof[k][1] >= 0.25 ? 'key' : ''} ${p.tf === k ? 'focus' : ''}" title="${ATTR_NAME[k]}${prof[k][1] >= 0.25 ? ' (key attribute for his position)' : ''}${tb ? ` · +${tb} from training` : ''}"><i>${k}</i><b class="${ovrClass(v)}">${v}</b>${tb ? `<sup>+${tb}</sup>` : ''}</span>`; }).join('')}</div>`;
  }
  const posTags = (p) => `${posBadge(p.pos)}${(p.alt || []).map((x) => `<span class="pos alt pos-${LINE[x] || 'MID'}" title="Learned position">${x}</span>`).join('')}`;
  function trainControls(p) {
    const prof = APROF[PROF_OF[p.pos]];
    const learnable = POSITIONS.filter((x) => canLearn(p, x)).sort((a, b) => learnDist(p, a) - learnDist(p, b));
    const focus = `<select class="input sm" id="tf-${p.id}" data-change="train-focus" data-pid="${p.id}">
      <option value="">No focus (rest)</option>
      <optgroup label="Improve an attribute">${attrKeys(p).map((k) => `<option value="${k}" ${p.tf === k ? 'selected' : ''}>${ATTR_NAME[k]}${prof[k][1] >= 0.25 ? ' ★' : ''}</option>`).join('')}</optgroup>
      ${learnable.length ? `<option value="POS" ${p.tf === 'POS' ? 'selected' : ''}>Learn a new position…</option>` : ''}
    </select>`;
    const posSel = p.tf === 'POS' ? ` <select class="input sm" id="tpos-${p.id}" data-change="train-pos" data-pid="${p.id}">${learnable.map((x) => `<option ${p.tpos === x ? 'selected' : ''}>${x}</option>`).join('')}</select>` : '';
    return focus + posSel;
  }
  function trainProgress(p) {
    if (p.tf === 'POS' && p.tpos) {
      const f = (p.fam && p.fam[p.tpos]) || 0;
      return `<div class="small muted">Learning ${p.tpos}: ${Math.floor(f)}% · ~${Math.ceil((100 - f) / (5 * trainAgeF(p.age) / learnDist(p, p.tpos)))} sessions</div><div class="small-bar"><i style="width:${f}%"></i></div>`;
    }
    if (p.tf) {
      const maxed = ((p.tb && p.tb[p.tf]) || 0) >= 15 || attr(p, p.tf) >= 99;
      return maxed ? '<div class="small muted">Maxed out: pick another focus</div>' : `<div class="small muted">Next ${ATTR_NAME[p.tf].toLowerCase()} point</div><div class="small-bar"><i style="width:${clamp(p.tp || 0, 0, 1) * 100}%"></i></div>`;
    }
    return '<span class="muted small">Resting</span>';
  }
  const mainPosButtons = (p) => (p.alt || []).map((x) => `<button class="btn xs ghost" data-act="main-pos" data-id="${p.id}|${x}" title="Make ${x} his main position">Main: ${x}</button>`).join(' ');
  // Re-render whatever view the training controls live in.
  function rerenderTraining(p) {
    if ($('.pmodal')) playerModal(p.id); else render();
  }
  function viewTraining() {
    const c = C(), club = S.clubs[c.clubId];
    const players = club.pids.map((id) => S.players[id]).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr);
    const n = players.filter((p) => p.tf).length;
    return `
      <section class="card">
        <div class="row between wrap gap">
          <h3>🏋️ Training</h3>
          <label class="inline">Intensity <select class="input sm" id="train-int" data-change="train-int">${Object.entries(TRAIN_INT).map(([k, [l]]) => `<option value="${k}" ${(c.trainInt || 'normal') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">Give each player a training focus. After every match your club plays, players with a focus train it: young players improve fastest. Improving a key attribute (★) for his position also raises his OVR, up to his potential. Trained shooting, heading (physical) and keeping directly help in matches. <strong>Learn a new position</strong> to play him there without the out-of-position penalty: he gets better there as he learns it, and similar positions take less time. Intense training is faster but players can get injured. ${n} of ${players.length} players have a focus.</p>
        <div class="tbl-wrap"><table class="tbl train-tbl"><thead><tr><th>Pos</th><th class="left">Name</th><th>Age</th><th>OVR</th><th>POT</th><th class="left">Attributes</th><th class="left">Focus</th><th class="left">Progress</th></tr></thead><tbody>
        ${players.map((p) => `<tr class="${!available(p) ? 'unavail' : ''}"><td class="nowrap">${posTags(p)}</td><td class="left">${playerLink(p)} ${statusIcons(p)}${p.alt && p.alt.length ? `<div>${mainPosButtons(p)}</div>` : ''}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${potBadge(p)}</td>
          <td class="left">${attrChips(p)}</td><td class="left nowrap">${trainControls(p)}</td><td class="left train-prog">${trainProgress(p)}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  function viewAcademy() {
    const c = C(), a = academy();
    const youth = S.clubs.YTH.pids.map((id) => S.players[id]).filter(Boolean).sort((x, y) => y.pot - x.pot);
    const upCost = a.level < 5 ? niceRound(ACADEMY_COST[a.level] * leagueFactor()) : 0;
    const scoutCost = niceRound(0.4e6 * leagueFactor());
    return `
      <div class="grid g2">
        <section class="card">
          <h3>🎓 Youth academy</h3>
          <div class="stats-row">
            <div class="big-stat"><span>Facilities</span><strong>${'★'.repeat(a.level)}<span class="dim">${'★'.repeat(5 - a.level)}</span></strong><small>Level ${a.level} of 5</small></div>
            <div class="big-stat"><span>Prospects</span><strong>${youth.length}</strong></div>
            <div class="big-stat"><span>Scouting this season</span><strong>${a.scouted}/3 missions</strong></div>
          </div>
          <p class="muted small">Better facilities mean more prospects at every youth intake, higher starting ratings and potential, and faster development. Prospects train and improve every time your first team plays.</p>
          ${a.level < 5 ? `<button class="btn primary" data-act="academy-upgrade" ${S.clubs[c.clubId].budget < upCost ? 'disabled' : ''}>Upgrade to level ${a.level + 1} · ${money(upCost)}</button>` : '<p class="small">Your academy is world class.</p>'}
        </section>
        <section class="card">
          <h3>Scouting</h3>
          <p class="muted small">Send scouts to find prospects (${money(scoutCost)} per mission, 3 missions per season). Each mission finds 1–2 players${a.level >= 4 ? ' (plus one extra with your top facilities)' : ''}.</p>
          <div class="scout-grid">${Object.entries(ACADEMY_REGIONS).map(([k, r]) => `<button class="scout-card" data-act="scout" data-id="${k}" ${a.scouted >= 3 || S.clubs[c.clubId].budget < scoutCost ? 'disabled' : ''}><strong>${esc(r.label)}</strong><span class="muted small">${esc(r.desc)}</span></button>`).join('')}</div>
        </section>
      </div>
      <section class="card">
        <h3>Prospects <span class="muted small">Promote players to your first team before they turn 19, or they leave the academy.</span></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="left">Name</th><th>Nat</th><th>Age</th><th>OVR</th><th>POT</th><th>Progress</th><th></th></tr></thead><tbody>
          ${youth.map((p) => `<tr class="${p.age >= 18 ? 'warn-row' : ''}"><td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)} ${p.pot >= 86 ? '<span class="tag good">Wonderkid</span>' : ''}</td><td>${natTag(p.nat)}</td><td>${p.age}${p.age >= 18 ? ' <span class="tag warn">last season</span>' : ''}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${potBadge(p)}</td>
            <td><div class="xpbar small-bar"><i style="width:${clamp((p.xp || 0) / 8, 0, 1) * 100}%"></i></div></td>
            <td class="nowrap"><button class="btn xs primary" data-act="youth-promote" data-id="${p.id}">Promote</button> <button class="btn xs ghost" data-act="youth-release" data-id="${p.id}">Release</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No prospects. Send your scouts out or wait for the next youth intake.</td></tr>'}
        </tbody></table></div>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Stats
   * ------------------------------------------------------------------ */
  function viewStats() {
    const c = C();
    const compId = ui.statsComp && c.comps[ui.statsComp] ? ui.statsComp : 'L-' + c.leagueId;
    const comp = c.comps[compId];
    const pool = Object.values(S.players).filter((p) => p.cg[compId]);
    const tabs = [['scorers', 'Top scorers'], ['assists', 'Assists'], ['ratings', 'Best ratings'], ['cs', 'Clean sheets'], ['mine', isPlayerMode() ? 'My club' : 'My squad'], ['history', 'History & trophies']];
    let body = '';
    const tableOf = (rows, col, fmt, appsFn = (p) => p.st.apps) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="left">Player</th><th class="left">Club</th><th>Apps</th><th>${col}</th></tr></thead><tbody>${rows.map((p, i) => `<tr class="${p.clubId === c.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="left">${posBadge(p.pos)} ${playerLink(p)}</td><td class="left small">${esc(clubName(p.clubId))}</td><td>${appsFn(p)}</td><td><strong>${fmt(p)}</strong></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No data yet. Play some matches.</td></tr>'}</tbody></table></div>`;
    const compSelect = `<label class="inline">Competition <select class="input sm" id="stats-comp" data-change="stats-comp">${compOptions(compId, false)}</select></label>`;
    const leaguePlayers = S.leagues[c.leagueId].clubIds.flatMap((id) => S.clubs[id]?.pids || []).map((pid) => S.players[pid]);
    switch (ui.statsTab) {
      case 'assists': body = compSelect + tableOf(pool.filter((p) => p.cg[compId][2]).sort((a, b) => b.cg[compId][2] - a.cg[compId][2] || b.cg[compId][1] - a.cg[compId][1]).slice(0, 25), 'Assists', (p) => p.cg[compId][2], (p) => p.cg[compId][0]); break;
      case 'ratings': body = `<p class="muted small">All competitions, ${esc(S.leagues[c.leagueId].name)} players with at least 5 appearances.</p>` + tableOf(leaguePlayers.filter((p) => p.st.apps >= 5).sort((a, b) => avgRating(b) - avgRating(a)).slice(0, 25), 'Avg', (p) => avgRating(p).toFixed(2)); break;
      case 'cs': body = `<p class="muted small">All competitions.</p>` + tableOf(leaguePlayers.filter((p) => p.st.cs).sort((a, b) => b.st.cs - a.st.cs).slice(0, 20), 'Clean sheets', (p) => p.st.cs); break;
      case 'mine': {
        const mine = S.clubs[c.clubId].pids.map((id) => S.players[id]).sort((a, b) => b.st.apps - a.st.apps || b.ovr - a.ovr);
        body = `<p class="muted small">All competitions this season.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="left">Player</th><th>OVR</th><th>Apps</th><th>G</th><th>A</th><th>🟨</th><th>🟥</th><th>MOTM</th><th>Avg</th></tr></thead><tbody>${mine.map((p) => `<tr><td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.yc}</td><td>${p.st.rc}</td><td>${p.st.motm}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td></tr>`).join('')}</tbody></table></div>`;
        break;
      }
      case 'history':
        body = `${c.trophies.length ? `<h4>Trophy cabinet</h4><div class="stats-row">${c.trophies.map((t) => `<div class="big-stat"><span>${seasonLabel(t.season)}</span><strong>🏆 ${esc(t.name)}</strong></div>`).join('')}</div>` : ''}
          ${c.history.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Season</th><th class="left">Club</th><th>Finish</th><th>Pts</th><th class="left">Trophies</th><th class="left">Champion</th><th class="left">Top scorer</th></tr></thead><tbody>${c.history.map((h) => `<tr><td>${seasonLabel(h.season)}</td><td class="left">${esc(h.club)}</td><td>${ordinal(h.pos)}</td><td>${h.pts}</td><td class="left">${esc((h.trophies || []).join(', ') || '—')}</td><td class="left">${esc(h.champion)}</td><td class="left">${esc(h.topScorer)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Complete a season to build your managerial history.</p>'}`;
        break;
      default: body = compSelect + tableOf(pool.filter((p) => p.cg[compId][1]).sort((a, b) => b.cg[compId][1] - a.cg[compId][1] || b.cg[compId][2] - a.cg[compId][2]).slice(0, 25), 'Goals', (p) => p.cg[compId][1], (p) => p.cg[compId][0]);
    }
    return `<section class="card"><div class="subtabs">${tabs.map(([k, l]) => `<button class="subtab ${ui.statsTab === k ? 'active' : ''}" data-act="stats-tab" data-id="${k}">${l}</button>`).join('')}</div>${body}</section>${comp ? '' : ''}`;
  }

  /* ------------------------------------------------------------------ *
   * Data (import / export / saves)
   * ------------------------------------------------------------------ */
  function importPanelHtml(inCareer) {
    return `
      <p>Load real <strong>EA SPORTS FC 26</strong> ratings from a <strong>CSV</strong> or <strong>JSON</strong> file, e.g. an FC 26 player database export, a spreadsheet, or the template below.
      Recognised columns: <code>Name</code> (or <code>short_name</code>/<code>long_name</code>), <code>Club</code>, <code>Position</code> (or <code>player_positions</code>), <code>OVR</code> (or <code>overall</code>), <code>Age</code>, <code>League</code>.</p>
      <p class="muted small">Players are matched by name (and club). Matched players get the new OVR, position and age. A higher OVR means they play better in the match engine and cost more. ${inCareer ? 'This applies to your current career. Your own squad is only re-rated, never moved.' : 'Imported ratings apply to every new career you start in this browser.'}</p>
      <div class="row gap wrap">
        <input type="file" id="imp-file" accept=".csv,.json,.txt,.tsv" class="input">
        <button class="btn ghost sm" data-act="dl-template">Template</button>
        <button class="btn ghost sm" data-act="dl-export">Export current database (CSV)</button>
      </div>
      <textarea id="imp-text" class="input textarea" rows="7" placeholder="…or paste CSV / JSON here&#10;Name,Club,Position,OVR,Age,League&#10;Kylian Mbappé,Real Madrid,ST,91,26,LaLiga"></textarea>
      <div class="row gap wrap">
        <label class="check"><input type="checkbox" id="imp-move" checked> Move players to the club named in the file (real transfers)</label>
        <label class="check"><input type="checkbox" id="imp-add" checked> Add unknown players to their club</label>
        <label class="check"><input type="checkbox" id="imp-create"> Create missing clubs/leagues${inCareer ? ' (they join from next season)' : ''}</label>
      </div>
      <div class="row gap"><button class="btn primary" data-act="do-import">Import ratings</button>${!inCareer ? '<button class="btn ghost danger" data-act="reset-world">Reset to built-in database</button>' : ''}</div>
      <div id="imp-report"></div>`;
  }
  function viewData() {
    return `
      <div class="grid g2">
        <section class="card"><h3>Import FC 26 ratings</h3>${importPanelHtml(true)}</section>
        <section class="card">
          <h3>Save game</h3>
          <p class="muted">Your career auto-saves in this browser after every action.</p>
          <div class="row gap wrap">
            <button class="btn" data-act="export-save">Export save file</button>
            <label class="btn ghost file-btn">Load save file<input type="file" id="save-file" accept=".json" hidden></label>
          </div>
          <h3 class="mt">Career</h3>
          <div class="row gap wrap">
            <button class="btn ghost" data-act="to-menu">Main menu</button>
            <button class="btn ghost danger" data-act="abandon">Abandon career</button>
          </div>
          <h3 class="mt">How it works</h3>
          <ul class="help">
            <li><strong>OVR</strong> drives everything. A player's rating in a position is his OVR, minus a penalty if he's out of position, plus or minus his form.</li>
            <li><strong>Dynamic OVR</strong>: after every match a player earns or loses progress based on his match rating. Young players (especially 21 and under) grow much faster, up to their potential (POT). Players over 30 slowly decline.</li>
            <li><strong>Your lineup</strong> stays exactly as you set it. Injured or suspended players get a temporary stand-in and return to the XI once they're available.</li>
            <li><strong>Competitions</strong>: all 7 leagues are played in full, plus a domestic cup for each and the Champions, Europa and Conference Leagues. European places come from league position and cup wins (season 1 uses squad strength).</li>
            <li><strong>Transfers</strong> happen in the summer window (until 1 Sep) and the January window. Clubs value key and young players higher. Players may refuse smaller clubs. Every signing needs room in your wage budget.</li>
          </ul>
        </section>
      </div>`;
  }
  function runImport(target, inCareer) {
    const text = $('#imp-text').value;
    if (!text.trim()) return toast('Choose a file or paste some data first.', 'bad');
    let records;
    try { records = rowsToRecords(text); } catch (e) { return toast('Could not read the data: ' + e.message, 'bad'); }
    if (!records.length) return toast('No rows found.', 'bad');
    const opts = { move: $('#imp-move').checked, add: $('#imp-add').checked, create: $('#imp-create').checked };
    const prevS = S;
    S = target;
    const rep = importRecords(target, records, opts);
    finalizeWorld(target);
    invalidate();
    S = prevS;
    if (inCareer) { cleanLineup(); save(); } else saveWorld();
    toast(`Imported: ${rep.updated} updated, ${rep.added} added.`, 'good');
    return `<div class="report-box"><strong>Import complete</strong>: ${records.length} rows read.<br>
      ✔ ${rep.updated} players re-rated · ➕ ${rep.added} added · 🔁 ${rep.moved} moved clubs · 🏟 ${rep.clubsCreated} clubs created · ${rep.leaguesCreated} leagues created · ✖ ${rep.skipped} skipped
      ${rep.errors.length ? `<ul class="small muted">${rep.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`;
  }

  /* ------------------------------------------------------------------ *
   * Player modal & selling
   * ------------------------------------------------------------------ */
  function playerModal(pid) {
    const p = S.players[pid];
    if (!p) return;
    const inCareer = !!S.career;
    const mine = inCareer && p.clubId === C().clubId;
    const club = S.clubs[p.clubId];
    const it = inCareer && !mine && !isPlayerMode() ? interest(p, C().clubId) : null;
    openModal(`
      <div class="pmodal">
        <div class="pm-head">
          <div class="pm-ovr ${ovrClass(p.ovr)}">${p.ovr}<small>${p.pos}</small></div>
          <div><h2>${esc(p.name)}</h2><div class="muted">${club ? esc(club.name) : 'Free agent'} · Age ${p.age} ${genTag(p)} ${statusIcons(p)}</div></div>
        </div>
        <div class="stats-row">
          <div class="big-stat"><span>Potential</span><strong>${potRange(p)}</strong></div>
          <div class="big-stat"><span>This season</span><strong>${p.ovr0 ?? p.ovr} → ${p.ovr} ${delta(p)}</strong></div>
          <div class="big-stat"><span>Value</span><strong class="money">${money(playerValue(p))}</strong></div>
          <div class="big-stat"><span>Wage</span><strong class="money">${money(p.wage)}/wk</strong></div>
          ${it ? `<div class="big-stat"><span>Would join you?</span><strong>${interestTag(it)}</strong></div>` : ''}
          <div class="big-stat"><span>Form</span><strong>${formArrow(p.form)}</strong></div>
          <div class="big-stat"><span>Apps · G · A</span><strong>${p.st.apps} · ${p.st.goals} · ${p.st.assists}</strong></div>
          <div class="big-stat"><span>Avg rating</span><strong>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</strong></div>
        </div>
        ${inCareer ? `<div class="xp"><span class="muted small">Progress to next OVR change</span><div class="xpbar"><i class="${(p.xp || 0) < 0 ? 'neg' : ''}" style="width:${clamp(Math.abs(p.xp || 0) / 8, 0, 1) * 100}%"></i></div></div>` : ''}
        <h4>Attributes</h4>
        ${attrChips(p)}
        ${p.alt && p.alt.length ? `<p class="small">Also plays: ${p.alt.map((x) => posBadge(x)).join(' ')}</p>` : ''}
        ${inCareer && (mine && !isPlayerMode() || p.id === C().pid) ? `<div class="row gap wrap mt"><span class="muted small">Training</span> ${trainControls(p)}</div><div class="mt">${trainProgress(p)}</div>` : ''}
        <h4>Career</h4>
        ${careerTableHtml(p, inCareer)}
        <h4>Rating by position</h4>
        <div class="pos-grid">${POSITIONS.map((pos) => { const e = eff(p, pos); return `<span class="pg ${ovrClass(e)}" title="${pos}"><b>${pos}</b>${e}</span>`; }).join('')}</div>
        <h4>Edit rating</h4>
        <div class="row gap wrap"><label class="inline">OVR <input class="input xs" type="number" id="edit-ovr" min="30" max="99" value="${p.ovr}"></label>
          <label class="inline">Position <select class="input sm" id="edit-pos">${POSITIONS.map((x) => `<option ${x === p.pos ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <button class="btn sm" data-act="save-player" data-id="${p.id}">Save</button></div>
        <div class="row gap mt">
          ${inCareer && mine && !isPlayerMode() ? `<button class="btn" data-act="loan" data-id="${p.id}">Loan out</button> <button class="btn" data-act="sell" data-id="${p.id}">Sell / release</button>` : ''}
          ${inCareer && p.loan && p.loan.from === C().clubId ? `<button class="btn" data-act="recall" data-id="${p.id}">Recall from loan</button>` : ''}
          ${inCareer && !mine && !isPlayerMode() ? `<button class="btn primary" data-act="buy" data-id="${p.id}">${p.clubId === 'FA' ? 'Sign' : 'Make an offer'}</button>` : ''}
        </div>
      </div>`);
  }
  function sellModal(pid) {
    const p = S.players[pid];
    const err = canSell(p);
    if (err) return toast(err, 'bad');
    const win = windowInfo();
    const offers = win.open ? sellOffers(p) : [];
    ui.sellOffers = { pid, offers };
    openModal(`
      <h2>Sell ${esc(p.name)}</h2>
      <p class="muted">${posBadge(p.pos)} ${ovrBadge(p.ovr)} POT ${potBadge(p)} · Age ${p.age} · Market value <strong class="money">${money(playerValue(p))}</strong> · Wage ${money(p.wage)}/wk</p>
      ${!win.open ? `<div class="notice">${esc(win.label)}. You can only release players until the window opens.</div>` : offers.length ? `<ul class="offer-list">${offers.map((o, i) => `<li>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> <span class="muted small">${esc(S.leagues[S.clubs[o.clubId].leagueId]?.name || '')}</span><span class="ml-auto money"><strong>${money(o.amount)}</strong></span><button class="btn primary sm" data-act="accept-sale" data-id="${i}">Accept</button></li>`).join('')}</ul>` : '<p>No club can afford him right now.</p>'}
      <div class="row gap mt">${win.open ? `<button class="btn ghost sm" data-act="refresh-offers" data-id="${pid}">Ask around again</button>` : ''}<button class="btn ghost danger sm" data-act="release" data-id="${pid}">Release for free</button></div>`);
  }

  function loanModal(pid) {
    const p = S.players[pid];
    const err = canLoan(p);
    if (err) return toast(err, 'bad');
    const offers = loanOffers(p);
    ui.loanOffers = { pid, offers };
    openModal(`
      <h2>Loan out ${esc(p.name)}</h2>
      <p class="muted">${posBadge(p.pos)} ${ovrBadge(p.ovr)} POT ${potBadge(p)} · Age ${p.age} · Wage ${money(p.wage)}/wk · Loan until the end of ${seasonLabel(loanSeason())}</p>
      <p class="small muted">Regular football helps players develop faster. You can recall him while a window is open, and he comes back in the summer.</p>
      ${offers.length ? `<ul class="offer-list loan-list">${offers.map((o, i) => { const cl = S.clubs[o.clubId]; return `<li>
        ${crest(cl)} <div class="grow"><strong>${esc(cl.name)}</strong> ${ovrBadge(clubRating(cl.id))} <span class="muted small">${esc(S.leagues[cl.leagueId]?.name || '')}</span><br>
        <span class="small"><span class="tag ${o.starter ? 'good' : ''}">${esc(o.role)}</span> You pay <strong>${o.pct}%</strong> of wages (${money(Math.round(p.wage * o.pct / 100))}/wk)${o.fee ? ` · Loan fee <strong class="money">${money(o.fee)}</strong>` : ''}${o.buy ? ` · Option to buy <strong class="money">${money(o.buy)}</strong>` : ''}</span></div>
        <button class="btn primary sm" data-act="accept-loan" data-id="${i}">Agree</button></li>`; }).join('')}</ul>` : '<p>No club wants him on loan right now.</p>'}
      <div class="row gap mt"><button class="btn ghost sm" data-act="loan" data-id="${pid}">Ask around again</button></div>`);
  }
  function loansHtml() {
    const list = loanedOut();
    if (!list.length) return '';
    return `
      <section class="card">
        <h3>Out on loan <span class="muted small">${list.length}/${MAX_LOANS}</span></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="left">Name</th><th>Age</th><th>OVR</th><th>POT</th><th class="left">Club</th><th>Apps</th><th>G</th><th>A</th><th>Avg</th><th>Wages</th><th>Until</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr><td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)} ${statusIcons(p)}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}${p.ovr !== p.loan.ovr ? `<span class="form ${p.ovr > p.loan.ovr ? 'up' : 'down'} small"> ${p.ovr > p.loan.ovr ? '+' : ''}${p.ovr - p.loan.ovr}</span>` : ''}</td><td>${potBadge(p)}</td>
          <td class="left">${crest(S.clubs[p.clubId], 'sm')} ${esc(clubName(p.clubId))}${p.loan.buy ? ` <span class="muted small" title="Option to buy">opt. ${money(p.loan.buy)}</span>` : ''}</td>
          <td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td>
          <td class="money muted small">${p.loan.pct}% · ${money(Math.round(p.wage * p.loan.pct / 100))}</td><td class="muted small">${seasonLabel(p.loan.season)}</td>
          <td><button class="btn xs ghost" data-act="recall" data-id="${p.id}">Recall</button></td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Event handling
   * ------------------------------------------------------------------ */
  const ACTIONS = {
    'start-league': (id) => { readCustom(); ui.startLeague = id; ui.startClub = null; ui.managerName = $('#mgr-name')?.value || ui.managerName; ui.startPos = $('#start-pos')?.value || ui.startPos; renderStart(); },
    'start-club': (id) => { readCustom(); ui.startClub = id; ui.managerName = $('#mgr-name')?.value || ui.managerName; ui.startPos = $('#start-pos')?.value || ui.startPos; renderStart(); },
    'start-mode': (id) => { readCustom(); ui.startMode = id; ui.managerName = $('#mgr-name')?.value || ui.managerName; renderStart(); },
    'start-career': () => {
      if (!ui.startClub) return;
      let custom = null, clubId = ui.startClub;
      if (clubId === 'NEW') {
        readCustom();
        const cu = ui.custom;
        if (!cu.name) { toast('Give your club a name.', 'bad'); $('#cc-name')?.focus(); return; }
        if (Object.values(W.clubs).some((cl) => isClub(cl) && cl.id !== cu.replace && norm(cl.name) === norm(cu.name))) return toast('A club with that name already exists.', 'bad');
        const short = (cu.short || cu.name.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'NEW').toUpperCase().slice(0, 4);
        custom = { name: cu.name, short, stadium: cu.stadium, hue: cu.hue, strength: cu.strength, budget: cu.budget };
        clubId = cu.replace;
      }
      const saved = loadMeta();
      const pm = ui.startMode === 'player';
      const name = ($('#mgr-name')?.value || '').trim() || (pm ? 'Alex Hunter' : 'The Gaffer');
      const pos = $('#start-pos')?.value || 'ST';
      const role = $('#start-role')?.value || defaultRole(pos);
      const nat = $('#start-nat')?.value || 'ENG';
      const begin = () => { startCareer(clubId, name, { mode: pm ? 'player' : 'manager', pos, role, nat, custom }); view = 'home'; render(); };
      if (saved) askConfirm('Starting a new career will overwrite your saved career.', begin, 'Start new career');
      else begin();
    },
    continue: async () => { const s = await loadCareer(); if (!s || !s.career) return toast('Could not load the saved career.', 'bad'); S = s; upgradeState(S); invalidate(); view = 'home'; render(); },
    'delete-save': () => askConfirm('Delete your saved career?', () => { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch (e) { /* ignore */ } renderStart(); }, 'Delete'),
    'open-import': () => { openModal(`<h2>Import FC 26 ratings</h2>${importPanelHtml(false)}`, true); },
    'do-import': () => {
      const inCareer = !!(S && S.career);
      const html = runImport(inCareer ? S : W, inCareer);
      if (html) { $('#imp-report').innerHTML = html; if (!inCareer) { S = W; invalidate(); } }
    },
    'reset-world': () => askConfirm('Discard imported ratings and restore the built-in database?', () => { try { localStorage.removeItem(WORLD_KEY); } catch (e) { /* ignore */ } W = buildWorld(); S = W; renderStart(); toast('Database reset.', 'good'); }, 'Reset'),
    'dl-template': () => download('fc26-ratings-template.csv', 'Name,Club,Position,OVR,Age,League\nKylian Mbappé,Real Madrid,ST,91,26,LaLiga\nErling Haaland,Manchester City,ST,90,25,Premier League\nNew Player,Arsenal,CM,74,20,Premier League\n'),
    'dl-export': () => download('soccer-manager-database.csv', exportCSV(S && S.career ? S : W)),
    tab: (id) => go(id),
    'quick-next': () => {
      const nm = advanceToUserMatch();
      const r = nm ? playDay(false) : null;
      save();
      if (r) { const uid = C().clubId; const home = r.h === uid; const gf = home ? r.score[0] : r.score[1], ga = home ? r.score[1] : r.score[0]; toast(`${C().comps[r.compId].name}: ${clubName(r.h)} ${r.score[0]}-${r.score[1]} ${clubName(r.a)}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} pens)` : ''}`, (r.w ? r.w === uid : gf > ga) ? 'good' : 'info'); }
      render();
    },
    simulate: () => doSimulate(),
    play3d: () => play3d(),
    'skip-playback': () => finishPlayback(),
    'end-playback': () => { clearTimers(); ui.playback = null; go('home'); },
    'end-playback-next': () => { clearTimers(); ui.playback = null; go('match'); },
    'next-season': () => { startNextSeason(); ui.fixDay = null; go('home'); },
    slot: (id) => {
      const i = +id;
      if (ui.squadSel === null) ui.squadSel = i;
      else if (ui.squadSel === i) ui.squadSel = null;
      else { const c = C(); [c.lineup[i], c.lineup[ui.squadSel]] = [c.lineup[ui.squadSel], c.lineup[i]]; ui.squadSel = null; save(); }
      render();
    },
    'slot-cancel': () => { ui.squadSel = null; render(); },
    assign: (id) => { if (ui.squadSel !== null) assignToSlot(ui.squadSel, id); },
    'auto-pick': () => { const c = C(); c.lineup = bestXI(S.clubs[c.clubId].pids, c.formation); cleanLineup(); ui.squadSel = null; save(); render(); toast('Best available XI selected. It stays until you change it.', 'good'); },
    'squad-sort': (id) => { ui.squadSort = id; render(); },
    sell: (id) => sellModal(id),
    'refresh-offers': (id) => sellModal(id),
    loan: (id) => loanModal(id),
    'main-pos': (id) => {
      const [pid, pos] = id.split('|'); const p = S.players[pid];
      askConfirm(`Make ${pos} ${p.id === C().pid ? 'your' : `${p.name}'s`} main position? ${p.pos} stays as a learned position. Attribute training that doesn't apply to ${pos} is lost.`, () => { setMainPos(p, pos); save(); closeModal(); render(); }, 'Switch');
    },
    'accept-loan': (i) => { const lo = ui.loanOffers; const o = lo && lo.offers[+i]; if (!o) return; loanPlayer(lo.pid, o); closeModal(); render(); },
    recall: (id) => askConfirm(`Recall ${S.players[id].name} from his loan at ${clubName(S.players[id].clubId)}?`, () => { recallLoan(id); closeModal(); render(); }, 'Recall'),
    'accept-sale': (i) => { const so = ui.sellOffers; const o = so && so.offers[+i]; if (!o) return; sellPlayer(so.pid, o.clubId, o.amount); closeModal(); render(); },
    release: (id) => askConfirm(`Release ${S.players[id].name} for free?`, () => { sellPlayer(id, 'FA', 0); render(); }, 'Release'),
    buy: (id) => { ui.neg = null; negModal(id); },
    'neg-bid': (id) => {
      const amount = Math.round((parseFloat($('#neg-offer').value) || 0) * 1e6);
      if (amount <= 0) return toast('Enter an offer in € millions.', 'bad');
      const r = submitBid(id, amount);
      ui.neg = { pid: id, msg: r.msg, status: r.status, last: amount };
      negModal(id);
    },
    'neg-counter': (id) => { const t = talk(id); if (t.counter > S.clubs[C().clubId].budget) return toast('Not enough transfer budget.', 'bad'); t.agreed = t.counter; ui.neg = { pid: id, msg: `Fee agreed: ${money(t.agreed)}. Now agree personal terms.`, status: 'accepted' }; negModal(id); },
    'neg-sign': (id) => {
      const p = S.players[id];
      if (p.clubId === 'FA') talk(id).agreed = clubValuation(p, C().clubId);
      if (completeSigning(id)) { closeModal(); render(); }
    },
    'accept-offer': (id) => { const c = C(); const o = c.offers.find((x) => x.id === id); if (!o) return; if (S.clubs[o.clubId].budget < o.amount) { c.offers = c.offers.filter((x) => x !== o); toast('The buyer can no longer afford the deal.', 'bad'); return render(); } sellPlayer(o.pid, o.clubId, o.amount); render(); },
    'reject-offer': (id) => { const c = C(); c.offers = c.offers.filter((x) => x.id !== id); save(); render(); },
    renew: (id) => renewModal(id),
    'intl-sel': (id) => { ui.intlSel = id; render(); },
    'academy-upgrade': () => {
      const c = C(), a = academy(), cost = niceRound(ACADEMY_COST[a.level] * leagueFactor());
      if (a.level >= 5) return;
      if (S.clubs[c.clubId].budget < cost) return toast('Not enough budget.', 'bad');
      askConfirm(`Upgrade the academy to level ${a.level + 1} for ${money(cost)}?`, () => { S.clubs[c.clubId].budget -= cost; a.level++; news(`🎓 Academy facilities upgraded to level ${a.level}.`, 'good'); save(); render(); }, 'Upgrade');
    },
    scout: (id) => {
      const c = C(), a = academy(), cost = niceRound(0.4e6 * leagueFactor());
      if (a.scouted >= 3) return toast('You have used all scouting missions this season.', 'bad');
      if (S.clubs[c.clubId].budget < cost) return toast('Not enough budget.', 'bad');
      S.clubs[c.clubId].budget -= cost; a.scouted++;
      const n = randInt(1, 2) + (a.level >= 4 ? 1 : 0);
      const found = Array.from({ length: n }, () => genProspect(id));
      news(`🔎 Scouts in ${ACADEMY_REGIONS[id].label} found ${found.map((p) => `${p.name} (${p.pos}, ${p.age})`).join(', ')}.`, 'good');
      save(); render();
      toast(`${n} new prospect${n > 1 ? 's' : ''} joined the academy.`, 'good');
    },
    'youth-promote': (id) => { promoteYouth(id); render(); },
    'youth-release': (id) => askConfirm(`Release ${S.players[id].name} from the academy?`, () => { S.clubs.YTH.pids = S.clubs.YTH.pids.filter((x) => x !== id); delete S.players[id]; save(); render(); }, 'Release'),
    'ren-wage': (id) => { const { wage, years } = wageOfferFromForm(); const t = renewTalk(id); const r = wageTalk(S.players[id], t, wage, years, 'renew'); Object.assign(t.w, { msg: r.msg, status: r.status, lastOffer: wage, lastYears: years }); renewModal(id); },
    'ren-wage-accept': (id) => { const t = renewTalk(id); t.w.agreed = { wage: t.w.counter, years: t.w.counterYears || 3 }; t.w.msg = 'Terms agreed.'; t.w.status = 'accepted'; renewModal(id); },
    'ren-complete': (id) => { if (completeRenewal(id)) { closeModal(); render(); } },
    'neg-wage': (id) => { const { wage, years } = wageOfferFromForm(); const t = talk(id); const r = wageTalk(S.players[id], t, wage, years, 'sign'); Object.assign(t.w, { msg: r.msg, status: r.status, lastOffer: wage, lastYears: years }); negModal(id); },
    'neg-wage-accept': (id) => { const t = talk(id); t.w.agreed = { wage: t.w.counter, years: t.w.counterYears || 3 }; t.w.msg = 'Terms agreed.'; t.w.status = 'accepted'; negModal(id); },
    'neg-complete': (id) => { const p = S.players[id]; if (p.clubId === 'FA') talk(id).agreed = clubValuation(p, C().clubId); if (completeSigning(id)) { closeModal(); render(); } },
    'p-offer-ask': (id) => {
      const c = C(), o = c.offers.find((x) => x.id === id); if (!o) return;
      const ask = Math.round((parseFloat($('#ask-' + id).value) || 0) * 1000);
      if (ask <= 0) return toast('Enter a wage in €K per week.', 'bad');
      const r = clubWageTalk(o, ask);
      o.msg = r.msg; o.status = r.status;
      if (o.withdrawn) { c.offers = c.offers.filter((x) => x !== o); toast(r.msg, 'bad'); }
      save(); render();
    },
    'p-renew-ask': () => {
      const c = C(), p = me();
      const starter = roleAt(c.clubId, p).startsWith('Starter');
      c.pRenew = { season: c.season, id: 'r' + c.season + p.id, wage: niceWage(Math.max(p.wage, wageFor(p) * (starter ? 1.1 : 0.95))), years: p.age <= 23 ? 5 : 3, clubId: c.clubId };
      news(`${clubName(c.clubId)} offer you a new ${c.pRenew.years}-year deal worth ${money(c.pRenew.wage)} a week.`, 'offer');
      save(); render();
    },
    'p-renew-counter': () => {
      const c = C(), r = c.pRenew; if (!r) return;
      const ask = Math.round((parseFloat($('#p-ask-renew').value) || 0) * 1000);
      const res = clubWageTalk(r, ask);
      r.msg = res.msg;
      if (res.status === 'ended') r.withdrawn = true;
      save(); render();
    },
    'p-renew-sign': () => { const c = C(), r = c.pRenew, p = me(); if (!r) return; p.wage = r.wage; p.contract = c.season + r.years; r.done = true; news(`✍️ You signed a new contract until ${contractLabel(p)} on ${money(p.wage)} a week.`, 'good'); save(); render(); toast('New contract signed!', 'good'); },
    'join-offer': (id) => { const o = C().offers.find((x) => x.id === id); if (!o) return; askConfirm(`Join ${clubName(o.clubId)} for ${money(o.amount)} on ${money(o.wage)} a week?`, () => { joinClub(o); go('home'); }, 'Join club'); },
    'request-transfer': () => {
      const c = C();
      if (!windowInfo().open) return toast('The transfer window is closed.', 'bad');
      const offers = playerOffers(3);
      if (!offers.length) return toast('Your agent found no interested clubs right now. Try again later or improve your OVR.', 'info');
      c.offers.push(...offers); save(); render();
      toast(`${offers.length} club${offers.length > 1 ? 's' : ''} made an offer.`, 'good');
    },
    'm-more': () => { ui.market.page++; render(); },
    'day-go': (id) => { if (id === '') return; ui.fixDay = +id; render(); },
    'cal-go': (id) => { ui.fixFilter = 'mine'; ui.fixDay = +id; render(); },
    'sim-to': (id) => { const n = simUntilDay(+id); toast(`Simulated ${n} match day${n === 1 ? '' : 's'}.`, 'good'); render(); },
    'sim-end': () => askConfirm('Simulate every remaining match of the season, including yours?', () => { simUntilDay(C().days.length); render(); }, 'Simulate'),
    report: (id) => { const [cid, ri, mi] = id.split('|'); matchReport(cid, +ri, +mi); },
    'comp-go': (id) => { ui.compSel = id; go('comps'); },
    'stats-tab': (id) => { ui.statsTab = id; render(); },
    player: (id) => playerModal(id),
    'save-player': (id) => {
      const p = S.players[id];
      const o = parseInt($('#edit-ovr').value, 10);
      if (!(o >= 30 && o <= 99)) return toast('OVR must be between 30 and 99.', 'bad');
      p.ovr = o; p.pos = $('#edit-pos').value;
      if (p.pot < o) p.pot = o;
      invalidate();
      if (S.career) save(); else saveWorld();
      toast(`${p.name} updated.`, 'good');
      closeModal(); render();
    },
    'export-save': () => download(`soccer-manager-${seasonLabel(C().season).replace('/', '-')}.json`, serialize(S), 'application/json'),
    'to-menu': () => { save(); S = W; ui.startLeague = null; ui.startClub = null; renderStart(); },
    abandon: () => askConfirm('Abandon this career? Your save will be deleted.', () => { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch (e) { /* ignore */ } S = W; renderStart(); }, 'Abandon'),
    close: () => closeModal(),
    'confirm-yes': () => { const f = pendingConfirm; pendingConfirm = null; closeModal(); if (f) f(); },
    'export-copy': () => exportCopy(),
    'export-dl': () => exportDownload(),
  };

  const CHANGES = {
    formation: (v) => {
      const c = C();
      const current = c.lineup.filter(Boolean);
      c.formation = v;
      c.lineup = bestXI(current, v, { ignoreAvail: true }); // same players, re-arranged for the new shape
      cleanLineup();
      ui.squadSel = null; save(); render();
    },
    mentality: (v) => { C().mentality = v; save(); render(); },
    style: (v) => { C().style = v; save(); render(); },
    role: (v, el) => { const c = C(); c.roles = c.roles || []; c.roles[+el.dataset.slot] = v; save(); render(); },
    'my-role': (v) => { me().role = v; save(); render(); toast(`You now play as a ${ROLE[v].label.toLowerCase()}.`, 'good'); },
    'start-role': (v) => { ui.startRole = v; },
    'start-nat': (v) => { ui.startNat = v; },
    len3d: (v) => { C().len3d = +v; save(); },
    'train-int': (v) => { C().trainInt = v; save(); render(); },
    'train-focus': (v, el) => {
      const p = S.players[el.dataset.pid];
      p.tf = v || null; p.tp = 0;
      if (v === 'POS') { p.tpos = POSITIONS.filter((x) => canLearn(p, x)).sort((a, b) => learnDist(p, a) - learnDist(p, b))[0] || null; if (!p.tpos) p.tf = null; } else p.tpos = null;
      save(); rerenderTraining(p);
    },
    'train-pos': (v, el) => { const p = S.players[el.dataset.pid]; p.tpos = v; save(); rerenderTraining(p); },
    'start-pos': (v) => { ui.startPos = v; ui.startRole = null; ui.managerName = $('#mgr-name')?.value || ui.managerName; renderStart(); },
    speed: (v) => { C().speed = v; save(); if (!ui.playback) render(); else if (v === 'instant') finishPlayback(); },
    'fix-filter': (v) => { ui.fixFilter = v; ui.fixDay = null; render(); },
    'fix-day': (v) => { ui.fixDay = +v; render(); },
    'stats-comp': (v) => { ui.statsComp = v; render(); },
    'm-q': (v) => { ui.market.q = v; ui.market.page = 1; },
    'm-league': (v) => { ui.market.league = v; ui.market.page = 1; render(); },
    'm-pos': (v) => { ui.market.pos = v; ui.market.page = 1; render(); },
    'm-min': (v) => { ui.market.min = clamp(+v || 40, 30, 99); ui.market.page = 1; render(); },
    'm-max': (v) => { ui.market.max = clamp(+v || 99, 30, 99); ui.market.page = 1; render(); },
    'm-age': (v) => { ui.market.age = +v; ui.market.page = 1; render(); },
    'm-price': (v) => { ui.market.price = +v; ui.market.page = 1; render(); },
    'm-sort': (v) => { ui.market.sort = v; render(); },
  };

  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal') return closeModal();
    if (e.target.closest('.modal-close')) return closeModal();
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset.id, el); }
  });
  let qTimer = null;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'cc-hue' || el.id === 'cc-short') {
      const box = $('#cc-preview');
      if (box) box.innerHTML = crest({ id: 'NEW', hue: +$('#cc-hue').value, short: $('#cc-short').value.toUpperCase() || 'NEW' }, 'lg');
      return;
    }
    if (el.dataset.change && el.dataset.live) {
      CHANGES[el.dataset.change](el.value);
      clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        const pos = el.selectionStart;
        render();
        const again = document.getElementById(el.id);
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
      }, 250);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'imp-file' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => { $('#imp-text').value = r.result; toast(`Loaded ${el.files[0].name}. Press "Import ratings".`, 'info'); };
      r.readAsText(el.files[0]);
      return;
    }
    if (el.id === 'save-file' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data.career || !data.players || !data.career.days) throw new Error('not a save file');
          S = data; upgradeState(S); invalidate(); save(); view = 'home'; render(); toast('Save loaded.', 'good');
        } catch (err) { toast('That file is not a valid save from this version.', 'bad'); }
      };
      r.readAsText(el.files[0]);
      return;
    }
    if (el.dataset.change && !el.dataset.live && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el.value, el);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  // Brings saves and databases from older versions up to date.
  function upgradeState(st) {
    for (const p of Object.values(st.players)) ensureFields(p);
    const prev = S; S = st;
    ensureNations(st);
    if (!st.clubs.YTH) st.clubs.YTH = { id: 'YTH', name: 'Youth academy', short: 'YTH', leagueId: null, pids: [], level: 50, budget: 0, youth: true };
    if (st.career && st.career.mode !== 'player' && !st.career.academy) academySetup();
    if (st.career && !st.career.loans) st.career.loans = [];
    S = prev === st ? st : prev;
    if (st.career) S = st;
  }
  W = loadWorld() || buildWorld();
  if (!W.nations) { S = W; upgradeState(W); }
  for (const p of Object.values(W.players)) ensureFields(p);
  S = W;
  renderStart();

  // Exposed for debugging / tests.
  window.SM = { serialize, get state() { return S; }, get world() { return W; }, simulateMatch, buildSide, playDay, advanceToUserMatch, nextUserMatch, simUntilDay, startCareer, startNextSeason, importRecords, rowsToRecords, playerValue, leagueTable, phaseTable, submitBid, interest, clubValuation, windowInfo, matchLineup, go, render };
})();
