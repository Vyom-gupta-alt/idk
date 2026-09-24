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
    if (v >= 1e3) return `${s}€${Math.round(v / 1e3)}K`;
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
  const LEAGUE_MONEY = { ENG: 1.6, ESP: 1.15, ITA: 1.1, GER: 1.15, FRA: 0.9, POR: 0.5, NED: 0.5 };

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
      W.leagues[L.id] = { id: L.id, name: L.name, country: L.country, pool: L.pool, clubIds: [] };
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
  function finalizeWorld(W) {
    for (const p of Object.values(W.players)) ensureFields(p);
    for (const club of Object.values(W.clubs)) {
      if (club.id === 'FA') continue;
      club.level = club.pids.length >= 6 ? computeLevel(W, club) : (club.level || 66);
      fillSquad(W, club);
      if (!club.budget) club.budget = initialBudget(W, club);
    }
  }

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
  const available = (p) => p && p.inj <= 0 && p.sus <= 0;
  const eff = (p, slot) => Math.round(p.ovr + fit(p.pos, slot) + clamp(p.form || 0, -2, 2));

  /* ------------------------------------------------------------------ *
   * Team selection
   * ------------------------------------------------------------------ */
  function bestXI(pids, formation, opts = {}) {
    const slots = FORMATIONS[formation];
    const players = pids.map((id) => S.players[id]).filter((p) => p && (opts.ignoreAvail || available(p)));
    const pairs = [];
    slots.forEach(([pos], si) => players.forEach((p) => pairs.push([eff(p, pos), si, p.id])));
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
    const xi = bestXI(club.pids, f, { ignoreAvail: true });
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
    injuryNoSub: ['{p} is injured and {t} have nobody left to bring on — down to {n}.'],
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
  const T = (key, v) => fill(pick(COMM[key]), v);

  function buildSide(clubId, userSide) {
    const club = S.clubs[clubId];
    let formation, ids, mentality;
    if (userSide) {
      formation = C().formation; ids = matchLineup().ids; mentality = C().mentality;
    } else {
      if (!club.formation) club.formation = pickFormation(club);
      formation = club.formation; ids = bestXI(club.pids, formation); mentality = 'balanced';
    }
    const slots = FORMATIONS[formation];
    const xi = [];
    ids.forEach((id, i) => { if (id) xi.push({ pid: id, slot: slots[i][0] }); });
    const bench = club.pids.filter((id) => !ids.includes(id) && available(S.players[id]))
      .sort((a, b) => S.players[b].ovr - S.players[a].ovr).slice(0, 9);
    return { clubId, name: club.name, short: club.short, formation, mentality, xi, bench };
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
    const ha = home ? 1.5 : 0;
    return {
      attack: 0.65 * att + 0.35 * mid + m.att - down * 4 + ha,
      defense: 0.7 * def + 0.3 * mid + m.def - down * 3 + ha * 0.7,
      control: mid - down * 4 + ha,
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
    const say = (type, side, msg) => { if (text) text.push({ lbl, type, side, text: msg, score: score.slice() }); };
    const effOf = (pid) => eff(S.players[pid], pm[pid].slot);
    const gkOf = (t) => sides[t].xi.find((x) => x.slot === 'GK')?.pid;
    const onLine = (t, line) => sides[t].xi.filter((x) => LINE[x.slot] === line).map((x) => x.pid);
    const anyOf = (t, line) => { const l = onLine(t, line); return l.length ? pick(l) : pick(sides[t].xi)?.pid; };
    const pickW = (t, W, pow, excl) => {
      const c = sides[t].xi.filter((x) => x.pid !== excl);
      const x = weighted(c, (x) => (W[x.slot] || 0.3) * Math.pow(Math.max(30, eff(S.players[x.pid], x.slot)) / 70, pow));
      return x ? x.pid : null;
    };

    function goal(t, pid, apid, kind) {
      score[t]++;
      pm[pid].g++;
      if (apid) pm[apid].a++;
      goals.push({ lbl, side: t, pid, apid: apid || null, pen: kind === 'pen' });
      const v = { p: nm(pid), a: nm(apid), t: sides[t].name, gk: nm(gkOf(1 - t)) };
      let msg = kind === 'pen' ? T('penGoal', v) : kind === 'header' ? T('header', v) : T('goal', v);
      if (apid && kind !== 'pen') msg += T('assist', v);
      say('goal', t, `${msg} ${H.short} ${score[0]}-${score[1]} ${A.short}`);
    }
    function corner(t) {
      st.corners[t]++;
      if (rand() < 0.25) say('info', t, T('corner', { t: sides[t].name, side: pick(['left', 'right']) }));
      const r = rand();
      if (r < 0.045) {
        const pid = pickW(t, HEAD_W, 3);
        const apid = pickW(t, ASSIST_W, 2, pid);
        if (pid) { st.shots[t]++; st.sot[t]++; goal(t, pid, apid, 'header'); }
      } else if (r < 0.15) {
        const pid = pickW(t, HEAD_W, 3);
        if (!pid) return;
        st.shots[t]++;
        if (rand() < 0.4) {
          st.sot[t]++;
          const g = gkOf(1 - t); if (g) pm[g].saves++;
          say('chance', t, T('save', { p: nm(pid), gk: nm(g) }));
        } else say('chance', t, T('miss', { p: nm(pid) }));
      }
    }
    function penalty(t) {
      const o = 1 - t;
      const fouled = pickW(t, SHOOT_W, 3);
      const d = anyOf(o, 'DEF');
      say('chance', t, T('penAward', { t: sides[t].name, p: nm(fouled), d: nm(d) }));
      const taker = sides[t].xi.filter((x) => x.slot !== 'GK').sort((a, b) => effOf(b.pid) - effOf(a.pid))[0]?.pid;
      if (!taker) return;
      st.shots[t]++;
      const gk = gkOf(o);
      if (rand() < clamp(0.76 + (effOf(taker) - str[o].gk) / 120, 0.6, 0.9)) { st.sot[t]++; goal(t, taker, null, 'pen'); }
      else { if (gk && rand() < 0.6) { st.sot[t]++; pm[gk].saves++; } say('chance', t, T('penMiss', { p: nm(taker), gk: nm(gk) })); }
    }
    function attack(t) {
      const o = 1 - t;
      const diff = str[t].attack - str[o].defense;
      if (rand() > clamp(0.56 + diff / 110, 0.36, 0.76)) {
        const r = rand();
        if (r < 0.14) {
          const p = pickW(t, SHOOT_W, 3); const d = anyOf(o, 'DEF');
          if (p && d) say('info', t, T('blocked', { p: nm(p), d: nm(d) }));
        } else if (r < 0.22) {
          const p = pickW(t, ASSIST_W, 2); const a = pickW(t, ASSIST_W, 2, p);
          if (p) say('info', t, T('buildup', { p: nm(p), a: nm(a), t: sides[t].name }));
        }
        if (rand() < 0.12) corner(t);
        return;
      }
      if (rand() < 0.012) { penalty(t); return; }
      const sh = pickW(t, SHOOT_W, 3);
      if (!sh) return;
      const se = effOf(sh);
      st.shots[t]++;
      if (rand() > clamp(0.38 + (se - 75) / 90, 0.25, 0.55)) {
        if (rand() < 0.07) say('chance', t, T('woodwork', { p: nm(sh), gk: nm(gkOf(o)) }));
        else if (rand() < 0.5) say('chance', t, T('miss', { p: nm(sh) }));
        if (rand() < 0.15) corner(t);
        return;
      }
      st.sot[t]++;
      if (rand() < clamp(0.32 + (se - str[o].gk) / 120 + diff / 400, 0.14, 0.5)) {
        goal(t, sh, rand() < 0.72 ? pickW(t, ASSIST_W, 3, sh) : null, 'open');
      } else {
        const g = gkOf(o); if (g) pm[g].saves++;
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
          say('info', t, `${side.name} bring on ${nm(sub)} in goal, ${nm(victim.pid)} makes way.`);
        } else victim.slot = 'GK';
      }
      recalc();
    }
    function card(t) {
      const cands = sides[t].xi.filter((x) => x.slot !== 'GK');
      const x = weighted(cands, (x) => ({ DEF: 3, MID: 2.5, ATT: 1.2 }[LINE[x.slot]] || 1));
      if (!x) return;
      const r = pm[x.pid];
      if (rand() < 0.02) {
        say('red', t, T('red', { p: nm(x.pid), t: sides[t].name, n: sides[t].xi.length - 1 }));
        sendOff(t, x.pid);
      } else if (r.yc) {
        r.yc++; st.yc[t]++;
        say('red', t, T('second', { p: nm(x.pid), t: sides[t].name, n: sides[t].xi.length - 1 }));
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
        say('injury', t, T('injury', { p: nm(off), s: nm(best), t: side.name }));
      } else {
        side.xi = side.xi.filter((y) => y !== x);
        say('injury', t, T('injuryNoSub', { p: nm(x.pid), t: side.name, n: side.xi.length }));
      }
      recalc();
    }

    const agg = opts.agg || [0, 0];
    const tot = (i) => score[i] + agg[i];
    function minute(m) {
      const c0 = Math.pow(Math.max(1, str[0].control), 3), c1 = Math.pow(Math.max(1, str[1].control), 3);
      let pH = c0 / (c0 + c1) + str[0].possBias - str[1].possBias;
      if (m >= 65) { if (tot(0) < tot(1)) pH += 0.07; else if (tot(0) > tot(1)) pH -= 0.07; }
      pH = clamp(pH, 0.22, 0.78);
      const t = rand() < pH ? 0 : 1;
      st.poss[t]++;
      if (rand() < 0.3) attack(t);
      if (rand() < 0.034) card(rand() < 0.5 ? 0 : 1);
      if (rand() < 0.0024) injury(rand() < 0.5 ? 0 : 1);
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
    return { score, goals, text, st, pm, motm, et, pens, w };
  }

  /* ------------------------------------------------------------------ *
   * Competitions, calendar & seasons
   * ------------------------------------------------------------------ */
  let S = null;       // active state (world + career)
  let W = null;       // base world for new careers
  const C = () => S.career;

  const CUP_NAMES = { ENG: 'FA Cup', ESP: 'Copa del Rey', ITA: 'Coppa Italia', GER: 'DFB-Pokal', FRA: 'Coupe de France', POR: 'Taça de Portugal', NED: 'KNVB Cup' };
  const LEAGUE_SHORT = { ENG: 'PL', ESP: 'LaLiga', ITA: 'Serie A', GER: 'BL', FRA: 'Ligue 1', POR: 'LPT', NED: 'ERE' };
  const LEAGUE_PRESTIGE = { ENG: 3, ESP: 2, ITA: 1.5, GER: 1.5, FRA: 0.5, POR: -1.5, NED: -2 };
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
    const out = [];
    while (out.length < n) {
      const m = d.getUTCMonth(), day = d.getUTCDate();
      if (!breaks.some(([bm, a, b]) => bm === m && day >= a && day <= b)) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
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
    const teams = L.clubIds.filter((id) => S.clubs[id]).sort((a, b) => clubRating(b) - clubRating(a));
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
      const cup = makeCup(lid, Y);
      if (cup) c.comps[cup.id] = cup;
    }
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
    const ids = ['L-' + c.leagueId, 'C-' + c.leagueId];
    for (const id of EURO_ORDER) if (c.comps[id]?.teams.includes(c.clubId)) ids.push(id);
    return ids.filter((id) => c.comps[id]);
  }
  const euroOf = (id) => EURO_ORDER.map((k) => C().comps[k]).find((comp) => comp && comp.teams.includes(id));

  function startCareer(clubId, manager) {
    S = deepClone(W);
    finalizeWorld(S);
    invalidate();
    for (const cl of Object.values(S.clubs)) if (cl.id !== 'FA' && cl.pids.length) cl.formation = pickFormation(cl);
    invalidate();
    const club = S.clubs[clubId];
    S.career = {
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
    S.career.wageBudget = niceRound(wageBill() * 1.12);
    news(`${S.career.manager} is appointed manager of ${club.name}. Transfer budget ${money(club.budget)}, wage budget ${money(S.career.wageBudget)} per week.`, 'info');
    const eu = euroOf(clubId);
    if (eu) news(`${club.name} will play in the ${eu.name} this season.`, 'good');
    save();
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
    if (g > 0) {
      const room = p.pot - p.ovr;
      g *= room <= 0 ? 0.1 : room <= 2 ? 0.5 : 1;
      g *= clamp((93 - p.ovr) / 16, 0.15, 1); // the better a player already is, the harder each point gets
    }
    p.xp = (p.xp || 0) + g;
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

  /* --- Playing matches --- */
  function playMatch(comp, rd, ri, m, mi, withText, pend) {
    const c = C(), uid = c.clubId;
    const isUser = m.h === uid || m.a === uid;
    const H = buildSide(m.h, m.h === uid), A = buildSide(m.a, m.a === uid);
    const lineups = [H.xi.map((x) => [x.pid, x.slot]), A.xi.map((x) => [x.pid, x.slot])];
    const opts = { neutral: !!rd.final, ko: !!(rd.single || rd.leg === 2 || rd.final), final: !!rd.final };
    if (rd.leg === 2) {
      const l1 = comp.rounds.find((r) => r.stage === rd.stage && r.leg === 1);
      const m1 = l1 && l1.matches[mi];
      if (m1 && m1.played) opts.agg = [m1.ag, m1.hg];
    }
    const r = simulateMatch(H, A, isUser && withText, opts);
    m.played = true; m.hg = r.score[0]; m.ag = r.score[1];
    if (r.et) m.et = 1;
    if (r.pens) m.pens = r.pens;
    if (opts.ko) m.w = r.w === 0 ? m.h : m.a;
    if (opts.agg) m.agg = [m.hg + opts.agg[0], m.ag + opts.agg[1]];
    m.goals = r.goals.map((g) => [g.lbl, g.side, g.pid, g.apid, g.pen ? 1 : 0]);
    m.motm = r.motm;
    if (comp.type !== 'league' || comp.leagueId === c.leagueId) m.st = r.st;
    for (const [pid, x] of Object.entries(r.pm)) {
      const p = S.players[pid];
      if (!p) continue;
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
    const res = {
      compId: comp.id, ri, mi, dayIdx: c.dayIdx, date: c.days[c.dayIdx].date, h: m.h, a: m.a, score: r.score, text: r.text,
      goals: m.goals, st: r.st, motm: r.motm, lineups, et: m.et, pens: m.pens, agg: m.agg, w: m.w, gate,
      ratings: Object.entries(r.pm).map(([pid, x]) => ({ pid, side: x.side, slot: x.slot, r: x.rating, g: x.g, a: x.a, on: x.on, yc: x.yc, rc: x.rc, inj: x.inj })),
    };
    c.last = res;
    return res;
  }

  function afterRound(comp, ri) {
    const rd = comp.rounds[ri];
    if (rd.pending || !rd.matches.every((m) => m.played)) return;
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
    if (windowInfo().open) { aiTransfers(randInt(1, 3)); maybeIncomingOffer(); }
    c.offers = c.offers.filter((o) => o.until > c.dayIdx && S.players[o.pid]?.clubId === c.clubId);
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
    c.nextQual = qualify(orders, cupWinners);
    s.nextEuro = EURO_ORDER.find((k) => c.nextQual[k].includes(uid)) || null;
    for (const t of s.trophies) c.trophies.push({ season: c.season, name: t });
    c.summary = s;
    c.history.push({ season: c.season, club: clubName(uid), pos: s.pos, pts: table[s.pos - 1]?.pts ?? 0, champion: clubName(table[0].id), trophies: s.trophies.slice(), topScorer: s.topScorer ? `${s.topScorer.name} (${s.topScorer.goals})` : '-' });
    news(`Season ${seasonLabel(c.season)} complete: you finished ${ordinal(s.pos)}${s.trophies.length ? ` and won ${s.trophies.join(', ')}` : ''}.`, s.trophies.length ? 'good' : 'info');
  }

  function startNextSeason() {
    const c = C();
    if (!c.seasonOver) return;
    const retired = [];
    for (const p of Object.values(S.players)) {
      if (p.clubId === 'FA') continue;
      const a = p.age;
      // Most development now happens match by match; this is the summer's age effect.
      const [lo, hi] = a <= 20 ? [0, 2] : a <= 23 ? [0, 1] : a <= 27 ? [-1, 1] : a <= 30 ? [-1, 0] : a <= 33 ? [-3, 0] : [-4, -1];
      let delta = randInt(lo, hi);
      if (delta > 0 && p.ovr >= p.pot) delta = 0;
      p.ovr = clamp(p.ovr + delta, 40, 95);
      if (p.pot < p.ovr) p.pot = p.ovr;
      p.age++;
      p.ovr0 = p.ovr; p.xp = (p.xp || 0) * 0.5;
      p.form = 0; p.inj = 0; p.sus = 0; p.st = newStats(); p.cg = {};
      p.wage = wageFor(p);
      if (p.age >= 35 && rand() < 0.25 + (p.age - 35) * 0.2) retired.push(p);
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
    for (let i = 0; i < 2 && mine.pids.length < MAX_SQUAD; i++) {
      const p = addPlayer(S, { name: genName(pool, taken), pos: pick(['CB', 'CM', 'ST', 'LW', 'RB', 'CAM']), ovr: randInt(58, 67), age: randInt(16, 18), clubId: c.clubId, gen: true });
      p.pot = clamp(p.ovr + randInt(10, 22), p.ovr, 92);
      news(`Academy graduate ${p.name} (${p.pos}, ${p.ovr} OVR) joins the first team.`, 'good');
    }
    for (const club of Object.values(S.clubs)) {
      if (club.id === 'FA') continue;
      if (club.id !== c.clubId) fillSquad(S, club, 20);
      else if (club.pids.length < MIN_SQUAD) fillSquad(S, club, MIN_SQUAD);
    }
    genFreeAgents(S);
    invalidate();
    c.seasonOver = false; // lets the summer transfer logic run with the new season's calendar
    aiTransfers(45);
    for (const club of Object.values(S.clubs)) if (club.id !== 'FA' && club.id !== c.clubId) club.formation = club.pids.length ? pickFormation(club) : null;
    invalidate();
    c.wageBudget = niceRound(Math.max(c.wageBudget || 0, wageBill() * 1.08) * 1.04);
    c.talks = {};
    setupSeason(c.season + 1, c.nextQual || { UCL: [], UEL: [], UECL: [] });
    cleanLineup();
    news(`Welcome to the ${seasonLabel(c.season)} season! Wage budget: ${money(c.wageBudget)} per week.`, 'info');
    const eu = euroOf(c.clubId);
    if (eu) news(`${S.clubs[c.clubId].name} are in the ${eu.name} this season.`, 'good');
    save();
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
  function wageBill() { const c = C(); return S.clubs[c.clubId].pids.reduce((s, id) => s + (S.players[id].wage || 0), 0); }

  function movePlayer(p, toClubId) {
    const from = S.clubs[p.clubId];
    if (from) from.pids = from.pids.filter((id) => id !== p.id);
    p.clubId = toClubId;
    S.clubs[toClubId].pids.push(p.id);
    if (from && from.id !== 'FA' && from.id !== C().clubId && from.pids.length < 18) fillSquad(S, from, 18);
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
    const it = interest(p, c.clubId);
    const wage = wageDemand(p, it);
    if (wageBill() + wage > c.wageBudget) return toast(`His wage demand (${money(wage)}/wk) doesn't fit your wage budget. Sell players to free up wages.`, 'bad');
    const from = S.clubs[p.clubId];
    const fromName = from ? from.name : 'Free agency';
    me.budget -= fee;
    if (from && from.id !== 'FA') from.budget += fee;
    movePlayer(p, c.clubId);
    p.wage = wage; p.inj = 0; p.sus = 0;
    delete c.talks[pid];
    c.transfers.unshift({ season: c.season, date: curDate(), pid, name: p.name, dir: 'in', club: fromName, fee });
    news(`✍️ Signed ${p.name} (${p.pos}, ${p.ovr}) from ${fromName} for ${money(fee)} on ${money(wage)} a week.`, 'good');
    save();
    toast(`${p.name} has joined ${me.name}!`, 'good');
    return true;
  }
  function aiBuyers(p) {
    const c = C();
    const clubs = Object.values(S.clubs).filter((cl) => cl.id !== 'FA' && cl.id !== c.clubId && cl.pids.length < 32);
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
    if (clubId !== 'FA') p.wage = wageFor(p);
    c.offers = c.offers.filter((o) => o.pid !== pid);
    cleanLineup();
    c.transfers.unshift({ season: c.season, date: curDate(), pid, name: p.name, dir: 'out', club: buyer.name, fee: amount });
    news(amount ? `Sold ${p.name} to ${buyer.name} for ${money(amount)}.` : `Released ${p.name}.`, 'info');
    save();
    toast(amount ? `${p.name} sold to ${buyer.name} for ${money(amount)}.` : `${p.name} released.`, 'good');
  }
  function maybeIncomingOffer() {
    const c = C();
    if (rand() > 0.1) return;
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
  // AI clubs strengthen their weakest position by buying from clubs of similar or lower stature.
  function aiTransfers(n) {
    const c = C();
    const clubs = Object.values(S.clubs).filter((cl) => cl.id !== 'FA' && cl.id !== c.clubId && cl.budget > 3e6 && cl.pids.length);
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
        if (!p || !S.players[p.id] || p.clubId === buyer.id || p.clubId === c.clubId) continue;
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
      // Keep squads a sensible size: the weakest surplus player is released.
      if (buyer.pids.length > 28) {
        const cut = buyer.pids.map((id) => S.players[id]).sort((a, b) => a.ovr - b.ovr)[0];
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
    const clubs = Object.values(state.clubs).filter((c) => c.id !== 'FA');
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
  function save() {
    if (!S || !S.career) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { toast('Could not save the game (browser storage unavailable or full).', 'bad'); }
  }
  function loadCareer() {
    try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
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
    const hue = [...club.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
    return `<span class="crest ${size}" style="--h:${hue}">${esc((club.short || club.name).slice(0, 4))}</span>`;
  };
  const statusIcons = (p) => (p.inj > 0 ? `<span class="tag bad" title="Injured for ${p.inj} match(es)">INJ ${p.inj}</span>` : '') + (p.sus > 0 ? '<span class="tag warn" title="Suspended">SUS</span>' : '');
  const formDots = (f) => f.slice(-5).map((r) => `<span class="fd fd-${r}">${r}</span>`).join('');
  const playerLink = (p) => `<button class="link" data-act="player" data-id="${p.id}">${esc(p.name)}</button>`;
  const genTag = (p) => (p.gen ? '<span class="tag gen" title="Generated academy/reserve player">Academy</span>' : '');
  const compTag = (comp) => (comp ? `<span class="ctag ct-${comp.type} ct-${comp.id}">${esc(comp.type === 'cup' ? comp.name : comp.short)}</span>` : '');
  const delta = (p) => { const d = p.ovr - (p.ovr0 ?? p.ovr); return d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''; };
  const potRange = (p) => { const lo = Math.max(p.ovr, p.pot - 2), hi = Math.min(95, p.pot + 2); return lo >= hi ? `${hi}` : `${lo}–${hi}`; };
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
  function renderStart() {
    clearTimers();
    const saved = loadCareer();
    const leagues = W.leagueOrder.map((id) => W.leagues[id]);
    const selL = ui.startLeague && W.leagues[ui.startLeague];
    let clubsHtml = '';
    S = W;
    invalidate();
    if (selL) {
      const clubs = selL.clubIds.map((id) => W.clubs[id]).map((c) => ({ c, r: clubRating(c.id) })).sort((a, b) => b.r - a.r);
      clubsHtml = `<h2 class="step"><span>3</span> Choose your club</h2>
        <div class="club-grid">${clubs.map(({ c, r }) => `
          <button class="club-card ${ui.startClub === c.id ? 'sel' : ''}" data-act="start-club" data-id="${c.id}">
            ${crest(c, 'lg')}
            <span class="cc-name">${esc(c.name)}</span>
            <span class="cc-meta">${ovrBadge(r)} <span class="muted">Budget</span> ${money(c.budget)}</span>
            <span class="cc-stars">${stars(r)}</span>
          </button>`).join('')}</div>`;
    }
    const sc = saved && saved.career;
    app().innerHTML = `
      <div class="start">
        <header class="hero">
          <div class="hero-ball">⚽</div>
          <h1>Soccer Manager <span>26</span></h1>
          <p>Pick a club from across Europe and build a squad of real ${esc(D.seasonLabel)} players. Chase the league, the cup and Europe, one matchday at a time.</p>
        </header>
        ${sc ? `
          <div class="card continue">
            <div>
              <div class="muted small">Saved career</div>
              <strong>${esc(saved.clubs[sc.clubId]?.name)}</strong> · ${esc(saved.leagues[sc.leagueId]?.name)} · ${seasonLabel(sc.season)} · ${sc.seasonOver ? 'Season complete' : fmtDate(sc.days[sc.dayIdx]?.date, true)}
            </div>
            <div class="row gap">
              <button class="btn primary" data-act="continue">Continue career</button>
              <button class="btn ghost danger" data-act="delete-save">Delete</button>
            </div>
          </div>` : ''}
        <div class="card">
          <h2 class="step"><span>1</span> Manager name</h2>
          <input class="input" id="mgr-name" maxlength="30" placeholder="Your name" value="${esc(ui.managerName)}">
          <h2 class="step"><span>2</span> Choose a league</h2>
          <div class="league-grid">${leagues.map((l) => `
            <button class="league-card ${ui.startLeague === l.id ? 'sel' : ''}" data-act="start-league" data-id="${l.id}">
              <span class="lc-name">${esc(l.name)}</span><span class="muted small">${esc(l.country || 'Custom')} · ${l.clubIds.length} clubs</span>
            </button>`).join('')}</div>
          ${clubsHtml}
          <div class="start-actions">
            <button class="btn ghost" data-act="open-import">Import FC 26 ratings…</button>
            <button class="btn primary big" data-act="start-career" ${ui.startClub ? '' : 'disabled'}>Start career${ui.startClub ? ` with ${esc(W.clubs[ui.startClub].name)}` : ''} →</button>
          </div>
        </div>
        <p class="muted small center">Every season has 7 leagues, 7 domestic cups and the Champions League, Europa League and Conference League. Ratings are FC 26-style estimates. Import an FC 26 file to use exact values.</p>
      </div>`;
  }

  /* ------------------------------------------------------------------ *
   * Game shell
   * ------------------------------------------------------------------ */
  const TABS = [['home', 'Home'], ['match', 'Match'], ['squad', 'Squad & Tactics'], ['transfers', 'Transfers'], ['fixtures', 'Fixtures'], ['comps', 'Competitions'], ['stats', 'Stats'], ['data', 'Data']];
  function render() {
    if (!S || !S.career) return renderStart();
    if (view !== 'match' || !ui.playback) clearTimers();
    const c = C(), club = S.clubs[c.clubId];
    const win = windowInfo();
    const date = c.seasonOver ? 'Season complete' : fmtDate(curDate(), true);
    app().innerHTML = `
      <header class="topbar">
        <div class="tb-club">${crest(club)}<div><div class="tb-name">${esc(club.name)}</div><div class="muted small">${esc(S.leagues[c.leagueId].name)} · ${esc(c.manager)}</div></div></div>
        <div class="tb-info">
          <div><span class="muted small">Season</span><strong>${seasonLabel(c.season)}</strong></div>
          <div><span class="muted small">Date</span><strong>${date}</strong></div>
          <div><span class="muted small">Budget</span><strong class="money">${money(club.budget)}</strong></div>
          <div><span class="muted small">Transfers</span><strong class="win ${win.open ? 'open' : 'closed'}">${win.open ? 'Window open' : 'Window closed'}</strong></div>
        </div>
      </header>
      <nav class="tabs">${TABS.map(([id, label]) => `<button class="tab ${view === id ? 'active' : ''}" data-act="tab" data-id="${id}">${label}${id === 'home' && c.offers.length ? `<span class="dot">${c.offers.length}</span>` : ''}</button>`).join('')}</nav>
      <main id="view" class="view">${renderView()}</main>`;
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
      default: return viewHome();
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
          return `<div class="offer"><div>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> bid <strong class="money">${money(o.amount)}</strong> for ${playerLink(p)} ${posBadge(p.pos)} ${ovrBadge(p.ovr)} <span class="muted small">(value ${money(playerValue(p))})</span></div>
          <div class="row gap"><button class="btn primary sm" data-act="accept-offer" data-id="${o.id}">Accept</button><button class="btn ghost sm" data-act="reject-offer" data-id="${o.id}">Reject</button></div></div>`;
        }).join('')}</section>` : ''}
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
        <p class="muted">The summer transfer window is open, so you can buy and sell before the new season. Starting the next season ages every player by a year and applies summer development. Some veterans retire, two academy graduates join, and European places go to this season's top finishers and cup winners.</p>
        <div class="row gap wrap"><button class="btn primary big" data-act="next-season">Start ${seasonLabel(c.season + 1)} season →</button><button class="btn" data-act="tab" data-id="transfers">Transfer market</button></div>
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
    const { covers } = matchLineup();
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
          <div class="nm-team">${crest(S.clubs[H.clubId], 'lg')}<strong>${esc(H.name)}</strong><span class="muted small">${H.formation} · ${MENTALITY[H.mentality].label}</span></div>
          <div class="nm-vs"><span class="vs">VS</span></div>
          <div class="nm-team">${crest(S.clubs[A.clubId], 'lg')}<strong>${esc(A.name)}</strong><span class="muted small">${A.formation} · ${MENTALITY[A.mentality].label}</span></div>
        </div>
        ${legInfo}
        ${strengthBars(sH, sA)}
        <div class="odds"><div style="flex:${pw[0] || 1}" class="o-w">Win ${pw[0]}%</div><div style="flex:${pw[1] || 1}" class="o-d">Draw ${pw[1]}%</div><div style="flex:${pw[2] || 1}" class="o-l">Loss ${pw[2]}%</div></div>
        ${opts.ko ? `<p class="center small">Knockout: a level ${opts.agg ? 'aggregate' : 'score'} goes to extra time and penalties. Chance to go through: <strong>${advance}%</strong></p>` : ''}
        ${between ? `<div class="notice info">${between} other match day${between > 1 ? 's' : ''} before this fixture will be simulated first.</div>` : ''}
        ${covers.length ? `<div class="notice">${covers.map((cv) => `${esc(S.players[cv.out]?.name || '?')} is ${S.players[cv.out]?.inj > 0 ? 'injured' : 'suspended'}${cv.in ? `, so ${esc(S.players[cv.in].name)} covers at ${cv.pos}` : ''}`).join('. ')}. Your chosen XI comes back automatically when players are available.</div>` : ''}
        <div class="row gap wrap center">
          <label class="inline">Mentality
            <select class="input sm" id="sel-mentality" data-change="mentality">${Object.entries(MENTALITY).map(([k, m]) => `<option value="${k}" ${c.mentality === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
          </label>
          <label class="inline">Commentary speed
            <select class="input sm" id="sel-speed" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
          <button class="btn ghost" data-act="tab" data-id="squad">Edit lineup</button>
        </div>
        <div class="center"><button class="btn primary huge" data-act="simulate">▶ Simulate Match</button></div>
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
    ui.playback = { res, shown: 0, done: false };
    if (C().speed === 'instant') ui.playback.shown = (res.text || []).length;
    render();
    stepPlayback();
  }
  const SPEEDS = { slow: 1300, normal: 650, fast: 220, instant: 0 };
  function stepPlayback() {
    const pb = ui.playback;
    if (!pb) return;
    const events = pb.res.text || [];
    if (pb.shown >= events.length) { pb.done = true; updatePlayback(); return; }
    pb.shown++;
    updatePlayback();
    const e = events[pb.shown - 1];
    const base = SPEEDS[C().speed] ?? 650;
    const delay = e.type === 'goal' ? base * 2.2 : e.type === 'ht' ? base * 2 : base;
    timers.push(setTimeout(stepPlayback, delay));
  }
  function updatePlayback() { const el = $('#playback'); if (el) el.outerHTML = playbackHtml(); }
  function playbackHtml() {
    const pb = ui.playback, r = pb.res, c = C();
    const comp = c.comps[r.compId], rd = comp.rounds[r.ri];
    const events = (r.text || []).slice(0, pb.shown);
    const cur = events[events.length - 1];
    const sc = pb.done ? r.score : cur ? cur.score : [0, 0];
    const H = S.clubs[r.h], A = S.clubs[r.a];
    const minute = pb.done ? 'FT' : cur ? cur.lbl : '0';
    const mnum = minute === 'FT' ? 90 : minute === 'HT' ? 45 : clamp(parseInt(minute, 10) || 0, 0, 90);
    const feed = events.slice().reverse().map((e) => `<li class="ev ev-${e.type} ${e.side === 0 ? 'side-h' : e.side === 1 ? 'side-a' : ''}"><span class="ev-min">${esc(e.lbl)}${/\d/.test(e.lbl) ? "'" : ''}</span><span class="ev-txt">${esc(e.text)}</span></li>`).join('');
    let after = '';
    if (pb.done) {
      const rat = (side) => r.ratings.filter((x) => x.side === side).sort((a, b) => a.on - b.on || POS_ORDER[a.slot] - POS_ORDER[b.slot]).map((x) => {
        const p = S.players[x.pid];
        return `<li><span class="slot">${x.slot}</span> ${p ? playerLink(p) : '—'} ${x.g ? `<span class="tag good">⚽${x.g > 1 ? '×' + x.g : ''}</span>` : ''}${x.a ? `<span class="tag">A${x.a > 1 ? '×' + x.a : ''}</span>` : ''}${x.yc ? '<span class="card-y"></span>' : ''}${x.rc ? '<span class="card-r"></span>' : ''}${x.inj ? '<span class="tag bad">INJ</span>' : ''}${x.on ? '<span class="tag">SUB</span>' : ''}<span class="ml-auto rating r-${x.r >= 8 ? 'hi' : x.r >= 6.5 ? 'mid' : 'lo'}">${x.r.toFixed(1)}</span></li>`;
      }).join('');
      const stat = (label, a, b, suf = '') => `<tr><td>${a}${suf}</td><td class="muted">${label}</td><td>${b}${suf}</td></tr>`;
      after = `
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
    const scorers = (side) => r.goals.filter((g) => g[1] === side && (pb.done || events.some((e) => e.type === 'goal' && e.lbl === g[0] && e.side === side))).map((g) => `${esc(S.players[g[2]]?.name.split(' ').slice(-1)[0] ?? '')} ${esc(g[0])}'${g[4] ? ' (P)' : ''}`).join(', ');
    const extraLine = pb.done ? [r.agg ? `Aggregate ${r.agg[0]}-${r.agg[1]}` : '', r.pens ? `Penalties ${r.pens[0]}-${r.pens[1]}` : r.et ? 'After extra time' : '', r.w ? `${clubName(r.w)} ${rd.final ? 'win the final' : 'go through'}` : ''].filter(Boolean).join(' · ') : '';
    return `
      <section class="card playback" id="playback">
        <div class="mp-head"><span>${compTag(comp)} ${esc(comp.name)} · ${esc(rd.name)}</span><span>${fmtDate(r.date, true)}</span></div>
        <div class="scoreboard">
          <div class="sbt">${crest(H, 'lg')}<strong>${esc(H.name)}</strong><small>${scorers(0)}</small></div>
          <div class="sbs"><div class="score">${sc[0]} <span>-</span> ${sc[1]}</div><div class="clock ${pb.done ? '' : 'live'}">${esc(minute)}${/\d/.test(minute) ? "'" : ''}</div></div>
          <div class="sbt">${crest(A, 'lg')}<strong>${esc(A.name)}</strong><small>${scorers(1)}</small></div>
        </div>
        ${extraLine ? `<p class="center extra-line">${esc(extraLine)}</p>` : ''}
        <div class="progress"><i style="width:${(mnum / 90) * 100}%"></i></div>
        ${pb.done ? '' : `<div class="row gap center"><select class="input sm" id="sel-speed2" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="skip-playback">Skip to full-time ⏭</button></div>`}
        <ul class="feed">${feed}</ul>
        ${after}
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
    const side = { xi: slots.map((s, i) => ({ pid: matchLineup().ids[i], slot: s[0] })).filter((x) => x.pid), mentality: c.mentality };
    const st = sideStrength(side, false);
    const chips = slots.map(([pos, x, y], i) => {
      const p = S.players[c.lineup[i]];
      if (!p) return `<button class="chip empty ${ui.squadSel === i ? 'sel' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}"><span class="chip-r">?</span><span class="chip-n">${pos}</span></button>`;
      const e = eff(p, pos);
      const cv = coverBy[i];
      return `<button class="chip ${ui.squadSel === i ? 'sel' : ''} ${fit(p.pos, pos) < 0 ? 'oop' : ''} ${cv ? 'out' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}" title="${esc(p.name)} (${p.pos}) playing ${pos}">
        <span class="chip-r ${ovrClass(e)}">${e}</span><span class="chip-n">${esc(p.name.split(' ').slice(-1)[0])}</span><span class="chip-p">${cv ? (p.inj > 0 ? 'INJURED' : 'SUSPENDED') : pos}</span>
        ${cv && cv.in ? `<span class="chip-cover">↳ ${esc(S.players[cv.in].name.split(' ').slice(-1)[0])}</span>` : ''}</button>`;
    }).join('');
    const sorters = {
      pos: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr, age: (a, b) => a.age - b.age, value: (a, b) => playerValue(b) - playerValue(a),
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
            <button class="btn sm" data-act="auto-pick">Auto-pick best XI</button>
          </div>
          <div class="pitch">${chips}<div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="half"></i><i class="circle"></i></div></div>
          <p class="muted small">${ui.squadSel !== null ? `Selected <strong>${selPos}</strong>. Click a player in the list, or another shirt on the pitch to swap. <button class="link" data-act="slot-cancel">Cancel</button>` : 'Your XI is locked in: it only changes when you change it. Injured or suspended players get a stand-in (↳) for the next match and come back automatically when fit. Orange shirts are out of position.'}</p>
          ${changes.length ? `<div class="notice">Updated because players left: ${esc(changes.join('; '))}.</div>` : ''}
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
            ${th('pos', 'Pos')}<th class="left">Name</th>${th('age', 'Age')}${th('ovr', 'OVR')}${selPos ? `<th title="Rating in ${selPos}">@${selPos}</th>` : ''}<th>Form</th><th>Apps</th>${th('goals', 'G')}<th>A</th>${th('rating', 'Avg')}${th('value', 'Value')}${th('wage', 'Wage')}<th></th>
          </tr></thead><tbody>
          ${players.map((p) => `<tr class="${lineupSet.has(p.id) ? 'starter' : ''} ${selPos ? 'pickable' : ''} ${!available(p) ? 'unavail' : ''}" ${selPos ? `data-act="assign" data-id="${p.id}"` : ''}>
            <td>${posBadge(p.pos)}</td>
            <td class="left name-cell">${lineupSet.has(p.id) ? '<span class="xi-dot" title="In your XI"></span>' : ''}${selPos ? esc(p.name) : playerLink(p)} ${statusIcons(p)} ${genTag(p)}</td>
            <td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td>
            ${selPos ? `<td><strong class="${fit(p.pos, selPos) < 0 ? 'warn-t' : ''}">${eff(p, selPos)}</strong></td>` : ''}
            <td>${formArrow(p.form)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td>
            <td class="money">${money(playerValue(p))}</td><td class="money muted">${money(p.wage)}</td>
            <td><button class="btn xs ghost" data-act="sell" data-id="${p.id}">Sell</button></td>
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
    if (!available(p)) toast(`${p.name} is ${p.inj > 0 ? 'injured' : 'suspended'}. A stand-in will cover until he is available.`, 'info');
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
    let list = Object.values(S.players).filter((p) => p.clubId !== c.clubId && S.clubs[p.clubId]);
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
            <td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)} ${genTag(p)} ${statusIcons(p)}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}${delta(p)}</td><td class="muted small">${potRange(p)}</td>
            <td class="left small">${esc(S.clubs[p.clubId].name)}</td><td class="money muted">${money(playerValue(p))}</td><td class="money"><strong>${money(fee)}</strong></td><td>${interestTag(it)}</td>
            <td><button class="btn xs ${can ? 'primary' : 'ghost'}" data-act="buy" data-id="${p.id}">${p.clubId === 'FA' ? 'Sign' : 'Negotiate'}</button></td>
          </tr>`; }).join('')}
        </tbody></table></div>
        ${total > rows.length ? `<div class="center"><button class="btn" data-act="m-more">Show more (${total - rows.length} remaining)</button></div>` : ''}
      </section>
      <div class="grid g2">
        <section class="card"><h3>Transfer news</h3>${c.tnews.length ? `<ul class="plist">${c.tnews.slice(0, 25).map((t) => `<li><span class="muted small">${fmtDate(t.date)}</span> <span>${esc(t.name)} <span class="muted small">${t.pos} · ${t.ovr}</span><br><span class="small">${esc(t.from)} → <strong>${esc(t.to)}</strong></span></span><span class="ml-auto money">${t.fee ? money(t.fee) : 'Free'}</span></li>`).join('')}</ul>` : '<p class="muted">No deals yet. Clubs trade during the summer and January windows.</p>'}</section>
        <section class="card"><h3>Your transfer history</h3>${c.transfers.length ? `<ul class="plist">${c.transfers.slice(0, 25).map((t) => `<li><span class="tag ${t.dir === 'in' ? 'good' : 'warn'}">${t.dir === 'in' ? 'IN' : 'OUT'}</span> ${esc(t.name)} <span class="muted small">${t.dir === 'in' ? 'from' : 'to'} ${esc(t.club)} · ${seasonLabel(t.season)}</span><span class="ml-auto money">${money(t.fee)}</span></li>`).join('')}</ul>` : '<p class="muted">You have not made any transfers yet.</p>'}</section>
      </div>`;
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
        ${!blocker && agreed ? `<div class="row gap wrap mt"><button class="btn primary big" data-act="neg-sign" data-id="${pid}">Sign for ${money(t.agreed || val)} · ${money(wage)}/wk</button></div>` : ''}
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
    const goals = (m.goals || []).map((g) => `<li class="${g[1] ? 'right' : ''}"><strong>${esc(g[0])}'</strong> ⚽ ${esc(S.players[g[2]]?.name ?? 'Unknown')}${g[4] ? ' (pen)' : ''}${g[3] ? ` <span class="muted small">assist ${esc(S.players[g[3]]?.name ?? '')}</span>` : ''}</li>`).join('');
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
    const zone = (i) => (i < q1 ? 'z-cl' : i < q2 ? 'z-el' : i < q3 ? 'z-ecl' : '');
    const played = c.comps['L-' + lid].rounds.filter((r) => r.matches.every((m) => m.played)).length;
    return `
      <p class="muted small">${played} of ${c.comps['L-' + lid].rounds.length} matchdays played.</p>
      <div class="tbl-wrap"><table class="tbl league"><thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th class="hide-sm">GF</th><th class="hide-sm">GA</th><th>GD</th><th>Pts</th><th class="hide-sm">Form</th><th class="hide-sm">OVR</th></tr></thead><tbody>
        ${t.map((r, i) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td class="${zone(i)}">${i + 1}</td><td class="left">${crest(S.clubs[r.id], 'sm')} ${esc(clubName(r.id))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td class="hide-sm">${r.gf}</td><td class="hide-sm">${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td><td class="hide-sm">${formDots(r.form)}</td><td class="hide-sm">${ovrBadge(clubRating(r.id))}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="legend"><span><i class="z-cl"></i> Champions League</span><span><i class="z-el"></i> Europa League</span><span><i class="z-ecl"></i> Conference League</span><span class="muted">The ${esc(CUP_NAMES[lid] || 'cup')} winner also gets a Europa League place.</span></div>
      <p class="muted small">${n} clubs. There is no promotion or relegation because lower divisions are not simulated.</p>`;
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
    else if (comp.type === 'cup') {
      body = `${comp.winner ? `<div class="notice good">🏆 ${esc(clubName(comp.winner))} won the ${esc(comp.name)}.</div>` : ''}
        <p class="muted small">Single-match knockout for all ${comp.teams.length} ${esc(S.leagues[comp.leagueId].name)} clubs. Draws go to extra time and penalties. ${comp.prelim.length ? `The ${comp.prelim.length} lowest-rated clubs play a first round.` : ''}</p>
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
      </section>
      <section class="card"><h3>${compTag(comp)} ${esc(comp.name)} ${seasonLabel(c.season)}</h3>${body}</section>`;
  }

  /* ------------------------------------------------------------------ *
   * Stats
   * ------------------------------------------------------------------ */
  function viewStats() {
    const c = C();
    const compId = ui.statsComp && c.comps[ui.statsComp] ? ui.statsComp : 'L-' + c.leagueId;
    const comp = c.comps[compId];
    const pool = Object.values(S.players).filter((p) => p.cg[compId]);
    const tabs = [['scorers', 'Top scorers'], ['assists', 'Assists'], ['ratings', 'Best ratings'], ['cs', 'Clean sheets'], ['mine', 'My squad'], ['history', 'History & trophies']];
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
    const it = inCareer && !mine ? interest(p, C().clubId) : null;
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
        <h4>Rating by position</h4>
        <div class="pos-grid">${POSITIONS.map((pos) => { const e = eff(p, pos); return `<span class="pg ${ovrClass(e)}" title="${pos}"><b>${pos}</b>${e}</span>`; }).join('')}</div>
        <h4>Edit rating</h4>
        <div class="row gap wrap"><label class="inline">OVR <input class="input xs" type="number" id="edit-ovr" min="30" max="99" value="${p.ovr}"></label>
          <label class="inline">Position <select class="input sm" id="edit-pos">${POSITIONS.map((x) => `<option ${x === p.pos ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <button class="btn sm" data-act="save-player" data-id="${p.id}">Save</button></div>
        <div class="row gap mt">
          ${inCareer && mine ? `<button class="btn" data-act="sell" data-id="${p.id}">Sell / release</button>` : ''}
          ${inCareer && !mine ? `<button class="btn primary" data-act="buy" data-id="${p.id}">${p.clubId === 'FA' ? 'Sign' : 'Make an offer'}</button>` : ''}
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
      <p class="muted">${posBadge(p.pos)} ${ovrBadge(p.ovr)} · Age ${p.age} · Market value <strong class="money">${money(playerValue(p))}</strong> · Wage ${money(p.wage)}/wk</p>
      ${!win.open ? `<div class="notice">${esc(win.label)}. You can only release players until the window opens.</div>` : offers.length ? `<ul class="offer-list">${offers.map((o, i) => `<li>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> <span class="muted small">${esc(S.leagues[S.clubs[o.clubId].leagueId]?.name || '')}</span><span class="ml-auto money"><strong>${money(o.amount)}</strong></span><button class="btn primary sm" data-act="accept-sale" data-id="${i}">Accept</button></li>`).join('')}</ul>` : '<p>No club can afford him right now.</p>'}
      <div class="row gap mt">${win.open ? `<button class="btn ghost sm" data-act="refresh-offers" data-id="${pid}">Ask around again</button>` : ''}<button class="btn ghost danger sm" data-act="release" data-id="${pid}">Release for free</button></div>`);
  }

  /* ------------------------------------------------------------------ *
   * Event handling
   * ------------------------------------------------------------------ */
  const ACTIONS = {
    'start-league': (id) => { ui.startLeague = id; ui.startClub = null; ui.managerName = $('#mgr-name')?.value || ui.managerName; renderStart(); },
    'start-club': (id) => { ui.startClub = id; ui.managerName = $('#mgr-name')?.value || ui.managerName; renderStart(); },
    'start-career': () => {
      if (!ui.startClub) return;
      const saved = loadCareer();
      const name = ($('#mgr-name')?.value || '').trim() || 'The Gaffer';
      const begin = () => { startCareer(ui.startClub, name); view = 'home'; render(); };
      if (saved && saved.career) askConfirm('Starting a new career will overwrite your saved career.', begin, 'Start new career');
      else begin();
    },
    continue: () => { const s = loadCareer(); if (!s) return; S = s; for (const p of Object.values(S.players)) ensureFields(p); invalidate(); view = 'home'; render(); },
    'delete-save': () => askConfirm('Delete your saved career?', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } renderStart(); }, 'Delete'),
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
    'skip-playback': () => { clearTimers(); if (ui.playback) { ui.playback.shown = (ui.playback.res.text || []).length; ui.playback.done = true; updatePlayback(); } },
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
    'export-save': () => download(`soccer-manager-${seasonLabel(C().season).replace('/', '-')}.json`, JSON.stringify(S), 'application/json'),
    'to-menu': () => { save(); S = W; ui.startLeague = null; ui.startClub = null; renderStart(); },
    abandon: () => askConfirm('Abandon this career? Your save will be deleted.', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } S = W; renderStart(); }, 'Abandon'),
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
    speed: (v) => { C().speed = v; save(); if (!ui.playback) render(); },
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
          S = data; for (const p of Object.values(S.players)) ensureFields(p); invalidate(); save(); view = 'home'; render(); toast('Save loaded.', 'good');
        } catch (err) { toast('That file is not a valid save from this version.', 'bad'); }
      };
      r.readAsText(el.files[0]);
      return;
    }
    if (el.dataset.change && !el.dataset.live && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el.value);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  W = loadWorld() || buildWorld();
  for (const p of Object.values(W.players)) ensureFields(p);
  S = W;
  renderStart();

  // Exposed for debugging / tests.
  window.SM = { get state() { return S; }, get world() { return W; }, simulateMatch, buildSide, playDay, advanceToUserMatch, nextUserMatch, simUntilDay, startCareer, startNextSeason, importRecords, rowsToRecords, playerValue, leagueTable, phaseTable, submitBid, interest, clubValuation, windowInfo, matchLineup, go, render };
})();
