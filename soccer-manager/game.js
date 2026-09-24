/* Soccer Manager 26 — game engine + UI (vanilla JS, no build step). */
(() => {
  'use strict';

  const D = window.SM_DATA;
  const SAVE_KEY = 'sm26_career_v1';
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

  function addPlayer(W, { name, pos, ovr, age, clubId, gen }) {
    const id = 'p' + (W.nextId++);
    const p = { id, name, pos, ovr: clamp(Math.round(ovr), 30, 99), age: clamp(Math.round(age) || 25, 15, 45), clubId, gen: !!gen, form: 0, inj: 0, sus: 0, st: newStats() };
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
      ensureUserLineup();
      formation = C().formation; ids = C().lineup.slice(); mentality = C().mentality;
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

  function simulateMatch(H, A, withText) {
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
    const recalc = () => { str = [withDay(sideStrength(H, true), day[0]), withDay(sideStrength(A, false), day[1])]; };
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

    say('info', -1, T('kickoff', { home: H.name, away: A.name }));
    const extra = [randInt(1, 3), randInt(2, 6)];
    for (let half = 0; half < 2; half++) {
      const base = half ? 45 : 0;
      const len = 45 + extra[half];
      for (let k = 1; k <= len; k++) {
        lbl = k > 45 ? `${base + 45}+${k - 45}` : String(base + k);
        const m = base + k;
        const c0 = Math.pow(Math.max(1, str[0].control), 3), c1 = Math.pow(Math.max(1, str[1].control), 3);
        let pH = c0 / (c0 + c1) + str[0].possBias - str[1].possBias;
        if (m >= 65) { if (score[0] < score[1]) pH += 0.07; else if (score[0] > score[1]) pH -= 0.07; }
        pH = clamp(pH, 0.22, 0.78);
        const t = rand() < pH ? 0 : 1;
        st.poss[t]++;
        if (rand() < 0.3) attack(t);
        if (rand() < 0.034) card(rand() < 0.5 ? 0 : 1);
        if (rand() < 0.0024) injury(rand() < 0.5 ? 0 : 1);
      }
      if (!half) { lbl = 'HT'; say('ht', -1, `Half-time: ${H.name} ${score[0]}-${score[1]} ${A.name}`); }
    }
    lbl = 'FT';
    say('ft', -1, `Full-time: ${H.name} ${score[0]}-${score[1]} ${A.name}`);

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
    return { score, goals, text, st, pm, motm };
  }

  /* ------------------------------------------------------------------ *
   * Career / season management
   * ------------------------------------------------------------------ */
  let S = null;       // active state (world + career)
  let W = null;       // base world for new careers
  const C = () => S.career;

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
        round.push({ h, a, played: false });
      }
      rounds.push(round);
      arr.splice(1, 0, arr.pop());
    }
    const second = rounds.map((rd) => rd.map((m) => ({ h: m.a, a: m.h, played: false })));
    return rounds.concat(second);
  }
  function makeDates(n, year) {
    const d = new Date(Date.UTC(year, 7, 14));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    const breaks = [[8, 4, 10], [9, 9, 15], [10, 12, 18], [2, 23, 29]]; // [month, fromDay, toDay]
    const out = [];
    while (out.length < n) {
      const m = d.getUTCMonth(), day = d.getUTCDate();
      const isBreak = breaks.some(([bm, a, b]) => bm === m && day >= a && day <= b);
      if (!isBreak) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }

  function startCareer(clubId, manager) {
    S = deepClone(W);
    const club = S.clubs[clubId];
    finalizeWorld(S);
    const league = S.leagues[club.leagueId];
    for (const id of league.clubIds) { const c = S.clubs[id]; if (c.pids.length) c.formation = pickFormation(c); }
    const rounds = makeFixtures(league.clubIds);
    S.career = {
      manager: manager || 'Manager', clubId, leagueId: league.id, season: 2025, md: 0,
      rounds, dates: makeDates(rounds.length, 2025),
      formation: club.formation || '4-3-3', lineup: [], mentality: 'balanced',
      news: [], history: [], offers: [], transfers: [], last: null, seasonOver: false, speed: 'normal',
    };
    S.career.lineup = bestXI(club.pids, S.career.formation);
    invalidate();
    news(`${S.career.manager} is appointed manager of ${club.name}. Transfer budget: ${money(club.budget)}.`, 'info');
    save();
  }

  function news(text, type = 'info') {
    const c = C();
    c.news.unshift({ date: c.dates[Math.min(c.md, c.dates.length - 1)] || '', text, type });
    c.news.length = Math.min(c.news.length, 60);
  }

  // Make sure the user's XI contains 11 available players; returns list of changes.
  function ensureUserLineup() {
    const c = C();
    const club = S.clubs[c.clubId];
    const slots = FORMATIONS[c.formation];
    const changes = [];
    if (!Array.isArray(c.lineup) || c.lineup.length !== slots.length) c.lineup = Array(slots.length).fill(null);
    c.lineup = c.lineup.map((id, i) => {
      if (!id) return null;
      const p = S.players[id];
      if (!p || p.clubId !== c.clubId || c.lineup.indexOf(id) !== i) return null;
      if (!available(p)) { changes.push(`${p.name} is ${p.inj > 0 ? 'injured' : 'suspended'}`); return null; }
      return id;
    });
    slots.forEach(([pos], i) => {
      if (c.lineup[i]) return;
      const used = new Set(c.lineup.filter(Boolean));
      let best = null, be = -99;
      for (const id of club.pids) {
        const p = S.players[id];
        if (used.has(id) || !available(p)) continue;
        const e = eff(p, pos);
        if (e > be) { be = e; best = id; }
      }
      c.lineup[i] = best;
      if (best) changes.push(`${S.players[best].name} starts at ${pos}`);
    });
    return changes;
  }

  function leagueFactor() { return LEAGUE_MONEY[C().leagueId] ?? 0.8; }

  // Play the next matchday. Returns the user's match result (or null).
  function playRound(withText) {
    const c = C();
    if (c.seasonOver) return null;
    const round = c.rounds[c.md];
    const pendingInj = [], pendingSus = [];
    let userRes = null;
    for (const m of round) {
      const isUser = m.h === c.clubId || m.a === c.clubId;
      const H = buildSide(m.h, m.h === c.clubId);
      const A = buildSide(m.a, m.a === c.clubId);
      const lineupH = H.xi.map((x) => [x.pid, x.slot]), lineupA = A.xi.map((x) => [x.pid, x.slot]);
      const r = simulateMatch(H, A, isUser && withText);
      m.played = true; m.hg = r.score[0]; m.ag = r.score[1];
      m.goals = r.goals.map((g) => [g.lbl, g.side, g.pid, g.apid, g.pen ? 1 : 0]);
      m.st = r.st; m.motm = r.motm;
      for (const [pid, x] of Object.entries(r.pm)) {
        const p = S.players[pid];
        p.st.apps++; p.st.goals += x.g; p.st.assists += x.a; p.st.yc += x.yc ? 1 : 0; p.st.rc += x.rc;
        p.st.rsum += x.rating;
        if (pid === r.motm) p.st.motm++;
        if (x.slot === 'GK' && r.score[1 - x.side] === 0) p.st.cs++;
        p.form = clamp((p.form || 0) * 0.6 + (x.rating - 6.6) * 0.7, -2, 2);
        if (x.inj) pendingInj.push([pid, x.inj]);
        if (x.rc) pendingSus.push([pid, 1]);
        else if (x.yc && p.st.yc % 5 === 0) pendingSus.push([pid, 1]);
      }
      if (isUser) {
        userRes = {
          md: c.md, h: m.h, a: m.a, score: r.score, text: r.text, goals: m.goals, st: r.st, motm: r.motm,
          lineups: [lineupH, lineupA],
          ratings: Object.entries(r.pm).map(([pid, x]) => ({ pid, side: x.side, slot: x.slot, r: x.rating, g: x.g, a: x.a, on: x.on, yc: x.yc, rc: x.rc, inj: x.inj })),
        };
        c.last = userRes;
      }
    }
    // Injuries & suspensions tick down for everyone in the league, then new ones apply.
    for (const id of S.leagues[c.leagueId].clubIds) {
      for (const pid of S.clubs[id].pids) {
        const p = S.players[pid];
        if (p.inj > 0) p.inj--;
        if (p.sus > 0) p.sus--;
      }
    }
    const mine = (pid) => S.players[pid].clubId === c.clubId;
    for (const [pid, n] of pendingInj) {
      S.players[pid].inj = Math.max(S.players[pid].inj, n);
      if (mine(pid)) news(`${S.players[pid].name} picked up an injury and will miss ${n} match${n > 1 ? 'es' : ''}.`, 'bad');
    }
    for (const [pid, n] of pendingSus) {
      S.players[pid].sus = Math.max(S.players[pid].sus, n);
      if (mine(pid)) news(`${S.players[pid].name} is suspended for the next match.`, 'bad');
    }
    if (userRes) {
      const home = userRes.h === c.clubId;
      const club = S.clubs[c.clubId];
      const [gf, ga] = home ? userRes.score : userRes.score.slice().reverse();
      const opp = S.clubs[home ? userRes.a : userRes.h].name;
      const res = gf > ga ? 'good' : gf < ga ? 'bad' : 'info';
      news(`${gf > ga ? 'Win' : gf < ga ? 'Defeat' : 'Draw'} ${home ? 'vs' : 'at'} ${opp}: ${gf}-${ga}.`, res);
      if (home) {
        const gate = niceRound((0.6e6 + Math.max(0, clubRating(c.clubId) - 65) * 0.12e6) * leagueFactor());
        club.budget += gate;
        userRes.gate = gate;
      }
    }
    maybeIncomingOffer();
    c.offers = c.offers.filter((o) => o.until >= c.md + 1 && S.players[o.pid]?.clubId === c.clubId);
    c.md++;
    if (c.md >= c.rounds.length) finishSeason();
    invalidate();
    return userRes;
  }

  function maybeIncomingOffer() {
    const c = C();
    if (rand() > 0.12) return;
    const mine = S.clubs[c.clubId].pids.map((id) => S.players[id]).filter((p) => !p.gen || p.ovr >= 70);
    const p = weighted(mine, (p) => Math.pow(p.ovr / 70, 8) * (p.form > 0 ? 1.5 : 1));
    if (!p) return;
    const buyer = aiBuyers(p)[0];
    if (!buyer) return;
    const amount = niceRound(playerValue(p) * (0.95 + rand() * 0.35));
    if (buyer.budget < amount) return;
    c.offers.push({ id: 'o' + Date.now() + randInt(0, 999), pid: p.id, clubId: buyer.id, amount, until: c.md + 3 });
    news(`${buyer.name} have made a ${money(amount)} offer for ${p.name}. Check your Home screen to respond.`, 'offer');
  }

  function standings(leagueId) {
    const c = C();
    const T = {};
    for (const id of S.leagues[leagueId].clubIds) T[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
    for (const round of c.rounds) for (const m of round) {
      if (!m.played || !T[m.h] || !T[m.a]) continue;
      const h = T[m.h], a = T[m.a];
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }
    return Object.values(T).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || S.clubs[x.id].name.localeCompare(S.clubs[y.id].name));
  }

  function finishSeason() {
    const c = C();
    c.seasonOver = true;
    const table = standings(c.leagueId);
    const pos = table.findIndex((r) => r.id === c.clubId) + 1;
    const n = table.length;
    const prize = niceRound(((n - pos + 1) * 1.6e6 + (pos === 1 ? 25e6 : pos <= 4 ? 10e6 : 0)) * leagueFactor());
    S.clubs[c.clubId].budget += prize;
    const leaguePlayers = S.leagues[c.leagueId].clubIds.flatMap((id) => S.clubs[id].pids.map((pid) => S.players[pid]));
    const top = leaguePlayers.slice().sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists)[0];
    const bestP = leaguePlayers.filter((p) => p.st.apps >= Math.max(5, c.rounds.length * 0.4)).sort((a, b) => avgRating(b) - avgRating(a))[0];
    c.summary = {
      pos, prize, champion: table[0].id, table: table.map((r) => ({ id: r.id, pts: r.pts, gd: r.gf - r.ga })),
      topScorer: top ? { pid: top.id, name: top.name, club: S.clubs[top.clubId]?.name, goals: top.st.goals } : null,
      bestPlayer: bestP ? { pid: bestP.id, name: bestP.name, club: S.clubs[bestP.clubId]?.name, avg: avgRating(bestP).toFixed(2) } : null,
    };
    c.history.push({ season: c.season, club: S.clubs[c.clubId].name, pos, champion: S.clubs[table[0].id].name, pts: table[pos - 1].pts, topScorer: top ? `${top.name} (${top.st.goals})` : '-' });
    news(`Season ${seasonLabel(c.season)} complete: you finished ${ordinal(pos)}. Prize money: ${money(prize)}.`, pos <= 4 ? 'good' : 'info');
  }
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function startNextSeason() {
    const c = C();
    const retired = [];
    for (const p of Object.values(S.players)) {
      if (p.clubId === 'FA') continue;
      const apps = p.st.apps, avgR = apps ? p.st.rsum / apps : 6.4;
      const playF = Math.min(1, apps / Math.max(1, c.rounds.length * 0.6));
      const a = p.age;
      const [lo, hi] = a <= 20 ? [1, 5] : a <= 23 ? [0, 3] : a <= 27 ? [-1, 2] : a <= 30 ? [-2, 1] : a <= 33 ? [-4, 0] : [-6, -1];
      let delta = randInt(lo, hi) + (apps ? (avgR - 6.6) * 2 * playF : 0) + (a <= 23 ? playF : 0);
      p.ovr = clamp(Math.round(p.ovr + delta), 40, 95);
      p.age++;
      p.form = 0; p.inj = 0; p.sus = 0; p.st = newStats();
      if (p.age >= 35 && rand() < 0.25 + (p.age - 35) * 0.2) retired.push(p);
    }
    for (const p of retired) {
      const club = S.clubs[p.clubId];
      if (club) club.pids = club.pids.filter((id) => id !== p.id);
      if (p.clubId === c.clubId) news(`${p.name} (${p.age}) has retired from professional football.`, 'info');
      delete S.players[p.id];
    }
    for (const club of Object.values(S.clubs)) {
      if (club.id === 'FA') continue;
      if (club.id !== c.clubId) fillSquad(S, club, 20);
      else if (club.pids.length < MIN_SQUAD) fillSquad(S, club, MIN_SQUAD);
      club.formation = club.pids.length ? pickFormation(club) : null;
    }
    // Academy graduates for the user
    const mine = S.clubs[c.clubId];
    const pool = S.leagues[c.leagueId].pool;
    const taken = new Set(mine.pids.map((id) => S.players[id].name));
    for (let i = 0; i < 2 && mine.pids.length < MAX_SQUAD; i++) {
      const p = addPlayer(S, { name: genName(pool, taken), pos: pick(['CB', 'CM', 'ST', 'LW', 'RB', 'CAM']), ovr: randInt(58, 68), age: randInt(16, 18), clubId: c.clubId, gen: true });
      news(`Academy graduate ${p.name} (${p.pos}, ${p.ovr} OVR) has been promoted to the first team.`, 'good');
    }
    genFreeAgents(S);
    c.season++;
    c.md = 0;
    c.rounds = makeFixtures(S.leagues[c.leagueId].clubIds);
    c.dates = makeDates(c.rounds.length, c.season);
    c.seasonOver = false; c.summary = null; c.last = null; c.offers = [];
    c.lineup = bestXI(mine.pids, c.formation);
    invalidate();
    news(`Welcome to the ${seasonLabel(c.season)} season!`, 'info');
    save();
  }

  /* ------------------------------------------------------------------ *
   * Transfers
   * ------------------------------------------------------------------ */
  function askingPrice(p) {
    const v = playerValue(p);
    if (p.clubId === 'FA') return niceRound(v * 0.5);
    const club = S.clubs[p.clubId];
    const rank = club.pids.map((id) => S.players[id].ovr).sort((a, b) => b - a).indexOf(p.ovr);
    return niceRound(v * (rank >= 0 && rank < 3 ? 1.5 : 1.2));
  }
  function movePlayer(p, toClubId) {
    const from = S.clubs[p.clubId];
    if (from) from.pids = from.pids.filter((id) => id !== p.id);
    p.clubId = toClubId;
    S.clubs[toClubId].pids.push(p.id);
    if (from && from.id !== 'FA' && from.id !== C().clubId && from.pids.length < 18) fillSquad(S, from, 18);
    invalidate();
  }
  function buyPlayer(pid) {
    const c = C(), p = S.players[pid], me = S.clubs[c.clubId];
    const price = askingPrice(p);
    if (me.pids.length >= MAX_SQUAD) return toast(`Squad is full (${MAX_SQUAD} players). Sell someone first.`, 'bad');
    if (me.budget < price) return toast('Not enough budget for this transfer.', 'bad');
    const from = S.clubs[p.clubId];
    me.budget -= price;
    if (from && from.id !== 'FA') from.budget += price;
    const fromName = from ? from.name : 'Free agency';
    movePlayer(p, c.clubId);
    p.inj = 0; p.sus = 0;
    c.transfers.unshift({ season: c.season, md: c.md, pid, name: p.name, dir: 'in', club: fromName, fee: price });
    news(`Signed ${p.name} (${p.pos}, ${p.ovr}) from ${fromName} for ${money(price)}.`, 'good');
    save();
    toast(`${p.name} has joined ${me.name}!`, 'good');
    return true;
  }
  function aiBuyers(p) {
    const c = C();
    const clubs = Object.values(S.clubs).filter((cl) => cl.id !== 'FA' && cl.id !== c.clubId && cl.pids.length < 34);
    const fits = clubs.filter((cl) => { const r = clubRating(cl.id); return r >= p.ovr - 9 && r <= p.ovr + 5; });
    return shuffle(fits.length ? fits : clubs);
  }
  function sellOffers(p) {
    const v = playerValue(p);
    const offers = [];
    for (const cl of aiBuyers(p)) {
      const amount = niceRound(v * (0.78 + rand() * 0.4));
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
    c.lineup = c.lineup.map((id) => (id === pid ? null : id));
    c.offers = c.offers.filter((o) => o.pid !== pid);
    c.transfers.unshift({ season: c.season, md: c.md, pid, name: p.name, dir: 'out', club: buyer.name, fee: amount });
    news(amount ? `Sold ${p.name} to ${buyer.name} for ${money(amount)}.` : `Released ${p.name}.`, 'info');
    save();
    toast(amount ? `${p.name} sold to ${buyer.name} for ${money(amount)}.` : `${p.name} released.`, 'good');
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
  let ui = {
    startLeague: null, startClub: null, managerName: '',
    squadSel: null, squadSort: 'pos',
    market: { q: '', league: 'ALL', pos: 'ALL', min: 70, max: 99, price: 0, age: 0, sort: 'ovr', page: 1 },
    fixMd: null, statsTab: 'scorers', playback: null,
  };
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function toast(msg, type = 'info') {
    const el = $('#toast');
    const t = document.createElement('div');
    t.className = `toast-item ${type}`;
    t.textContent = msg;
    el.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
    return false;
  }
  function openModal(html, wide) {
    $('#modal-body').innerHTML = html;
    $('#modal .modal-box').classList.toggle('wide', !!wide);
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }

  const ovrClass = (o) => (o >= 85 ? 'o-elite' : o >= 80 ? 'o-gold' : o >= 75 ? 'o-silver' : o >= 68 ? 'o-bronze' : 'o-low');
  const ovrBadge = (o) => `<span class="ovr ${ovrClass(o)}">${o}</span>`;
  const posBadge = (p) => `<span class="pos pos-${LINE[p] || 'MID'}">${p}</span>`;
  const crest = (club, size = '') => {
    const hue = [...club.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
    return `<span class="crest ${size}" style="--h:${hue}">${esc((club.short || club.name).slice(0, 4))}</span>`;
  };
  const statusIcons = (p) => (p.inj > 0 ? `<span class="tag bad" title="Injured">INJ ${p.inj}</span>` : '') + (p.sus > 0 ? '<span class="tag warn" title="Suspended">SUS</span>' : '');
  const formDots = (f) => f.slice(-5).map((r) => `<span class="fd fd-${r}">${r}</span>`).join('');
  const clubName = (id) => S.clubs[id]?.name ?? '—';
  const playerLink = (p) => `<button class="link" data-act="player" data-id="${p.id}">${esc(p.name)}</button>`;
  const genTag = (p) => (p.gen ? '<span class="tag gen" title="Generated academy/reserve player">Academy</span>' : '');

  /* ------------------------------------------------------------------ *
   * Start screen
   * ------------------------------------------------------------------ */
  function renderStart() {
    clearTimers();
    const saved = loadCareer();
    const leagues = W.leagueOrder.map((id) => W.leagues[id]);
    const selL = ui.startLeague && W.leagues[ui.startLeague];
    let clubsHtml = '';
    if (selL) {
      S = W; // for rating helpers
      invalidate();
      const clubs = selL.clubIds.map((id) => W.clubs[id]).map((c) => ({ c, r: clubRating(c.id) })).sort((a, b) => b.r - a.r);
      clubsHtml = `<h2 class="step"><span>3</span> Choose your club</h2>
        <div class="club-grid">${clubs.map(({ c, r }) => `
          <button class="club-card ${ui.startClub === c.id ? 'sel' : ''}" data-act="start-club" data-id="${c.id}">
            ${crest(c, 'lg')}
            <span class="cc-name">${esc(c.name)}</span>
            <span class="cc-meta">${ovrBadge(r)} <span class="muted">Budget</span> ${money(c.budget)}</span>
            <span class="cc-stars">${stars(r)}</span>
          </button>`).join('')}</div>`;
      invalidate();
    }
    app().innerHTML = `
      <div class="start">
        <header class="hero">
          <div class="hero-ball">⚽</div>
          <h1>Soccer Manager <span>26</span></h1>
          <p>Pick a club from across Europe, build a squad from real ${esc(D.seasonLabel)} players, set your tactics and simulate the season match by match.</p>
        </header>
        ${saved && saved.career ? `
          <div class="card continue">
            <div>
              <div class="muted small">Saved career</div>
              <strong>${esc(saved.clubs[saved.career.clubId]?.name)}</strong> · ${esc(saved.leagues[saved.career.leagueId]?.name)} · ${seasonLabel(saved.career.season)} · Matchday ${Math.min(saved.career.md + 1, saved.career.rounds.length)}/${saved.career.rounds.length}
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
        <p class="muted small center">Ratings are FC 26-style estimates. Import an FC 26 ratings file (CSV/JSON) to use exact values.</p>
      </div>`;
  }
  const stars = (r) => { const n = clamp(Math.round((r - 64) / 5), 1, 5); return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>'; };

  /* ------------------------------------------------------------------ *
   * Game shell
   * ------------------------------------------------------------------ */
  const TABS = [['home', 'Home'], ['match', 'Match'], ['squad', 'Squad & Tactics'], ['transfers', 'Transfers'], ['fixtures', 'Fixtures'], ['table', 'Table'], ['stats', 'Stats'], ['data', 'Data']];
  function nextMatch() {
    const c = C();
    if (c.seasonOver) return null;
    const m = c.rounds[c.md].find((x) => x.h === c.clubId || x.a === c.clubId);
    return m ? { ...m, md: c.md, date: c.dates[c.md] } : null;
  }
  function render() {
    if (!S || !S.career) return renderStart();
    if (view !== 'match' || !ui.playback) clearTimers();
    const c = C(), club = S.clubs[c.clubId];
    const date = c.seasonOver ? 'Season complete' : fmtDate(c.dates[c.md], true);
    app().innerHTML = `
      <header class="topbar">
        <div class="tb-club">${crest(club)}<div><div class="tb-name">${esc(club.name)}</div><div class="muted small">${esc(S.leagues[c.leagueId].name)} · ${esc(c.manager)}</div></div></div>
        <div class="tb-info">
          <div><span class="muted small">Season</span><strong>${seasonLabel(c.season)}</strong></div>
          <div><span class="muted small">Date</span><strong>${date}</strong></div>
          <div><span class="muted small">Budget</span><strong class="money">${money(club.budget)}</strong></div>
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
      case 'table': return viewTable();
      case 'stats': return viewStats();
      case 'data': return viewData();
      default: return viewHome();
    }
  }
  function go(v) { view = v; ui.playback = view === 'match' ? ui.playback : null; render(); window.scrollTo(0, 0); }

  /* ------------------------------------------------------------------ *
   * Home
   * ------------------------------------------------------------------ */
  function viewHome() {
    const c = C(), club = S.clubs[c.clubId];
    if (c.seasonOver) return seasonSummaryHtml();
    const nm = nextMatch();
    const table = standings(c.leagueId);
    const pos = table.findIndex((r) => r.id === c.clubId);
    const around = table.slice(Math.max(0, Math.min(pos - 2, table.length - 5)), Math.max(0, Math.min(pos - 2, table.length - 5)) + 5);
    const myMatches = c.rounds.map((r, i) => ({ m: r.find((x) => x.h === c.clubId || x.a === c.clubId), i })).filter((x) => x.m && x.m.played).slice(-5).reverse();
    const squad = club.pids.map((id) => S.players[id]);
    const topForm = squad.filter((p) => p.st.apps).sort((a, b) => avgRating(b) - avgRating(a)).slice(0, 5);
    const injured = squad.filter((p) => !available(p));
    let nmHtml = '<p class="muted">No match scheduled.</p>';
    if (nm) {
      const home = nm.h === c.clubId, opp = S.clubs[home ? nm.a : nm.h];
      nmHtml = `
        <div class="nm">
          <div class="nm-team">${crest(club, 'lg')}<strong>${esc(club.name)}</strong>${ovrBadge(clubRating(club.id))}</div>
          <div class="nm-vs"><span class="muted small">Matchday ${nm.md + 1}</span><span class="vs">${home ? 'HOME' : 'AWAY'}</span><span class="small">${fmtDate(nm.date, true)}</span></div>
          <div class="nm-team">${crest(opp, 'lg')}<strong>${esc(opp.name)}</strong>${ovrBadge(clubRating(opp.id))}</div>
        </div>
        <div class="row gap wrap center">
          <button class="btn primary big" data-act="tab" data-id="match">Go to match →</button>
          <button class="btn" data-act="quick-next">Quick sim matchday</button>
          <button class="btn ghost" data-act="tab" data-id="fixtures">Jump ahead in the calendar…</button>
        </div>`;
    }
    return `
      <div class="grid g-home">
        <section class="card span2">
          <h3>Next match</h3>
          ${nmHtml}
        </section>
        ${c.offers.length ? `<section class="card span2 offers"><h3>Transfer offers</h3>${c.offers.map((o) => {
          const p = S.players[o.pid];
          return `<div class="offer"><div>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> offer <strong class="money">${money(o.amount)}</strong> for ${playerLink(p)} ${posBadge(p.pos)} ${ovrBadge(p.ovr)} <span class="muted small">(value ${money(playerValue(p))})</span></div>
          <div class="row gap"><button class="btn primary sm" data-act="accept-offer" data-id="${o.id}">Accept</button><button class="btn ghost sm" data-act="reject-offer" data-id="${o.id}">Reject</button></div></div>`;
        }).join('')}</section>` : ''}
        <section class="card">
          <h3>League position <button class="link small" data-act="tab" data-id="table">Full table →</button></h3>
          <table class="tbl compact"><thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>
          ${around.map((r) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td>${table.indexOf(r) + 1}</td><td class="left">${esc(clubName(r.id))}</td><td>${r.p}</td><td>${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}
          </tbody></table>
        </section>
        <section class="card">
          <h3>Recent results</h3>
          ${myMatches.length ? `<ul class="results">${myMatches.map(({ m, i }) => {
            const home = m.h === c.clubId; const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
            const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
            return `<li><span class="fd fd-${r}">${r}</span> <span class="muted small">MD${i + 1}</span> ${home ? 'vs' : '@'} ${esc(clubName(home ? m.a : m.h))} <strong class="ml-auto">${gf}-${ga}</strong></li>`;
          }).join('')}</ul>` : '<p class="muted">No matches played yet.</p>'}
        </section>
        <section class="card">
          <h3>In form</h3>
          ${topForm.length ? `<ul class="plist">${topForm.map((p) => `<li>${posBadge(p.pos)} ${playerLink(p)} <span class="ml-auto rating">${avgRating(p).toFixed(2)}</span></li>`).join('')}</ul>` : '<p class="muted">Play some matches to see form.</p>'}
          ${injured.length ? `<h4>Unavailable</h4><ul class="plist">${injured.map((p) => `<li>${posBadge(p.pos)} ${playerLink(p)} <span class="ml-auto">${statusIcons(p)}</span></li>`).join('')}</ul>` : ''}
        </section>
        <section class="card">
          <h3>News</h3>
          <ul class="news">${c.news.slice(0, 12).map((n) => `<li class="n-${n.type}"><span class="muted small">${fmtDate(n.date)}</span> ${esc(n.text)}</li>`).join('')}</ul>
        </section>
      </div>`;
  }

  function seasonSummaryHtml() {
    const c = C(), s = c.summary;
    if (!s) return '';
    return `
      <section class="card season-end">
        <h2>🏆 Season ${seasonLabel(c.season)} complete</h2>
        <div class="stats-row">
          <div class="big-stat"><span>Champions</span><strong>${esc(clubName(s.champion))}</strong></div>
          <div class="big-stat"><span>Your finish</span><strong>${ordinal(s.pos)}</strong></div>
          <div class="big-stat"><span>Prize money</span><strong class="money">${money(s.prize)}</strong></div>
          ${s.topScorer ? `<div class="big-stat"><span>Golden Boot</span><strong>${esc(s.topScorer.name)}</strong><small>${esc(s.topScorer.club || '')} · ${s.topScorer.goals} goals</small></div>` : ''}
          ${s.bestPlayer ? `<div class="big-stat"><span>Player of the season</span><strong>${esc(s.bestPlayer.name)}</strong><small>${esc(s.bestPlayer.club || '')} · ${s.bestPlayer.avg} avg</small></div>` : ''}
        </div>
        <table class="tbl compact"><thead><tr><th>#</th><th class="left">Club</th><th>GD</th><th>Pts</th></tr></thead><tbody>
          ${s.table.map((r, i) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="left">${esc(clubName(r.id))}</td><td>${r.gd}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}
        </tbody></table>
        <p class="muted">Starting the next season ages every player by a year. Young players who played well improve and veterans decline. Some older players retire, and two academy graduates join your squad.</p>
        <button class="btn primary big" data-act="next-season">Start ${seasonLabel(c.season + 1)} season →</button>
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Match
   * ------------------------------------------------------------------ */
  function predict(H, A, n = 150) {
    const saved = rng; rng = mulberry32(12345);
    let w = 0, d = 0, l = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch({ ...H, xi: H.xi.map((x) => ({ ...x })), bench: H.bench.slice() }, { ...A, xi: A.xi.map((x) => ({ ...x })), bench: A.bench.slice() }, false);
      if (r.score[0] > r.score[1]) w++; else if (r.score[0] < r.score[1]) l++; else d++;
    }
    rng = saved;
    return [w, d, l].map((x) => Math.round((x / n) * 100));
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
    const c = C();
    if (ui.playback) return playbackHtml();
    if (c.seasonOver) return seasonSummaryHtml();
    const nm = nextMatch();
    if (!nm) {
      return `<section class="card"><h3>Matchday ${c.md + 1}</h3><p>Your club has no match this round.</p><button class="btn primary" data-act="quick-next">Simulate matchday</button></section>`;
    }
    const changes = ensureUserLineup();
    const H = buildSide(nm.h, nm.h === c.clubId), A = buildSide(nm.a, nm.a === c.clubId);
    const sH = sideStrength(H, true), sA = sideStrength(A, false);
    const [w, d, l] = predict(H, A);
    const home = nm.h === c.clubId;
    const pw = home ? [w, d, l] : [l, d, w];
    return `
      <section class="card match-pre">
        <div class="mp-head"><span class="muted">${esc(S.leagues[c.leagueId].name)} · Matchday ${c.md + 1} of ${c.rounds.length}</span><span>${fmtDate(nm.date, true)}</span></div>
        <div class="nm">
          <div class="nm-team">${crest(S.clubs[H.clubId], 'lg')}<strong>${esc(H.name)}</strong><span class="muted small">${H.formation} · ${MENTALITY[H.mentality].label}</span></div>
          <div class="nm-vs"><span class="vs">VS</span></div>
          <div class="nm-team">${crest(S.clubs[A.clubId], 'lg')}<strong>${esc(A.name)}</strong><span class="muted small">${A.formation} · ${MENTALITY[A.mentality].label}</span></div>
        </div>
        ${strengthBars(sH, sA)}
        <div class="odds"><div style="flex:${pw[0] || 1}" class="o-w">Win ${pw[0]}%</div><div style="flex:${pw[1] || 1}" class="o-d">Draw ${pw[1]}%</div><div style="flex:${pw[2] || 1}" class="o-l">Loss ${pw[2]}%</div></div>
        ${changes.length ? `<div class="notice">Lineup auto-adjusted: ${esc(changes.join('; '))}.</div>` : ''}
        <div class="row gap wrap center">
          <label class="inline">Mentality
            <select class="input sm" data-change="mentality">${Object.entries(MENTALITY).map(([k, m]) => `<option value="${k}" ${c.mentality === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
          </label>
          <label class="inline">Commentary speed
            <select class="input sm" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
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
    const res = playRound(true);
    save();
    if (!res) return render();
    ui.playback = { res, shown: 0, done: false };
    if (C().speed === 'instant') ui.playback.shown = res.text.length;
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
  function updatePlayback() {
    const el = $('#playback');
    if (!el) return;
    el.outerHTML = playbackHtml();
  }
  function playbackHtml() {
    const pb = ui.playback, r = pb.res, c = C();
    const events = (r.text || []).slice(0, pb.shown);
    const cur = events[events.length - 1];
    const sc = pb.done ? r.score : cur ? cur.score : [0, 0];
    const H = S.clubs[r.h], A = S.clubs[r.a];
    const minute = pb.done ? 'FT' : cur ? cur.lbl : '0';
    const mnum = minute === 'FT' ? 90 : minute === 'HT' ? 45 : parseInt(minute, 10) || 0;
    const feed = events.slice().reverse().map((e) => `<li class="ev ev-${e.type} ${e.side === 0 ? 'side-h' : e.side === 1 ? 'side-a' : ''}"><span class="ev-min">${esc(e.lbl)}'</span><span class="ev-txt">${esc(e.text)}</span></li>`).join('');
    let after = '';
    if (pb.done) {
      const rat = (side) => r.ratings.filter((x) => x.side === side).sort((a, b) => a.on - b.on || POS_ORDER[a.slot] - POS_ORDER[b.slot]).map((x) => {
        const p = S.players[x.pid];
        return `<li><span class="slot">${x.slot}</span> ${p ? playerLink(p) : '—'} ${x.g ? `<span class="tag good">⚽${x.g > 1 ? '×' + x.g : ''}</span>` : ''}${x.a ? `<span class="tag">A${x.a > 1 ? '×' + x.a : ''}</span>` : ''}${x.yc ? '<span class="card-y"></span>' : ''}${x.rc ? '<span class="card-r"></span>' : ''}${x.inj ? '<span class="tag bad">INJ</span>' : ''}${x.on ? '<span class="tag">SUB</span>' : ''}<span class="ml-auto rating r-${x.r >= 8 ? 'hi' : x.r >= 6.5 ? 'mid' : 'lo'}">${x.r.toFixed(1)}</span></li>`;
      }).join('');
      const stat = (label, a, b, suf = '') => `<tr><td>${a}${suf}</td><td class="muted">${label}</td><td>${b}${suf}</td></tr>`;
      const round = c.rounds[r.md];
      after = `
        <div class="grid g2 mt">
          <div class="card inner"><h4>Match stats</h4>
            <table class="tbl stat-tbl"><tbody>
              ${stat('Possession', r.st.poss[0], r.st.poss[1], '%')}${stat('Shots', r.st.shots[0], r.st.shots[1])}${stat('On target', r.st.sot[0], r.st.sot[1])}${stat('Corners', r.st.corners[0], r.st.corners[1])}${stat('Yellow cards', r.st.yc[0], r.st.yc[1])}${stat('Red cards', r.st.rc[0], r.st.rc[1])}
            </tbody></table>
            ${r.motm ? `<p class="motm">⭐ Player of the match: <strong>${esc(S.players[r.motm]?.name)}</strong></p>` : ''}
            ${r.gate ? `<p class="muted small">Matchday revenue: <span class="money">${money(r.gate)}</span></p>` : ''}
          </div>
          <div class="card inner"><h4>Other results — Matchday ${r.md + 1}</h4>
            <ul class="results">${round.map((m) => `<li class="${m.h === c.clubId || m.a === c.clubId ? 'me' : ''}"><span class="rs-t right">${esc(clubName(m.h))}</span><strong class="rs-s">${m.hg} - ${m.ag}</strong><span class="rs-t">${esc(clubName(m.a))}</span></li>`).join('')}</ul>
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
    return `
      <section class="card playback" id="playback">
        <div class="scoreboard">
          <div class="sbt">${crest(H, 'lg')}<strong>${esc(H.name)}</strong><small>${scorers(0)}</small></div>
          <div class="sbs"><div class="score">${sc[0]} <span>-</span> ${sc[1]}</div><div class="clock ${pb.done ? '' : 'live'}">${esc(minute)}${/\d/.test(minute) ? "'" : ''}</div></div>
          <div class="sbt">${crest(A, 'lg')}<strong>${esc(A.name)}</strong><small>${scorers(1)}</small></div>
        </div>
        <div class="progress"><i style="width:${clamp(mnum / 90, 0, 1) * 100}%"></i></div>
        ${pb.done ? '' : `<div class="row gap center"><select class="input sm" data-change="speed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(([k, l]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="skip-playback">Skip to full-time ⏭</button></div>`}
        <ul class="feed">${feed}</ul>
        ${after}
      </section>`;
  }

  /* ------------------------------------------------------------------ *
   * Squad & tactics
   * ------------------------------------------------------------------ */
  function viewSquad() {
    const c = C(), club = S.clubs[c.clubId];
    const changes = ensureUserLineup();
    const slots = FORMATIONS[c.formation];
    const lineupSet = new Set(c.lineup);
    const side = { xi: slots.map((s, i) => ({ pid: c.lineup[i], slot: s[0] })).filter((x) => x.pid), mentality: c.mentality };
    const st = sideStrength(side, false);
    const chips = slots.map(([pos, x, y], i) => {
      const p = S.players[c.lineup[i]];
      if (!p) return `<button class="chip empty ${ui.squadSel === i ? 'sel' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}"><span class="chip-r">?</span><span class="chip-n">${pos}</span></button>`;
      const e = eff(p, pos);
      const bad = fit(p.pos, pos) < 0;
      return `<button class="chip ${ui.squadSel === i ? 'sel' : ''} ${bad ? 'oop' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-id="${i}" title="${esc(p.name)} (${p.pos}) playing ${pos}">
        <span class="chip-r ${ovrClass(e)}">${e}</span><span class="chip-n">${esc(p.name.split(' ').slice(-1)[0])}</span><span class="chip-p">${pos}</span></button>`;
    }).join('');
    const sorters = {
      pos: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr, age: (a, b) => a.age - b.age, value: (a, b) => playerValue(b) - playerValue(a),
      goals: (a, b) => b.st.goals - a.st.goals, rating: (a, b) => avgRating(b) - avgRating(a),
    };
    const players = club.pids.map((id) => S.players[id]).sort(sorters[ui.squadSort] || sorters.pos);
    const selPos = ui.squadSel !== null && slots[ui.squadSel] ? slots[ui.squadSel][0] : null;
    const th = (k, l, cls = '') => `<th class="${cls} sortable ${ui.squadSort === k ? 'on' : ''}" data-act="squad-sort" data-id="${k}">${l}</th>`;
    return `
      <div class="grid g-squad">
        <section class="card">
          <div class="row gap wrap">
            <label class="inline">Formation <select class="input sm" data-change="formation">${FORMATION_NAMES.map((f) => `<option ${f === c.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
            <label class="inline">Mentality <select class="input sm" data-change="mentality">${Object.entries(MENTALITY).map(([k, m]) => `<option value="${k}" ${c.mentality === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
            <button class="btn sm" data-act="auto-pick">Auto-pick best XI</button>
          </div>
          <div class="pitch">${chips}<div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="half"></i><i class="circle"></i></div></div>
          <p class="muted small">${ui.squadSel !== null ? `Selected <strong>${selPos}</strong> — click a player in the list or another shirt on the pitch to swap. <button class="link" data-act="slot-cancel">Cancel</button>` : 'Click a shirt on the pitch, then click a player in the squad list to put them in that position. Orange shirts are playing out of position (lower rating).'}</p>
          ${changes.length ? `<div class="notice">Auto-adjusted: ${esc(changes.join('; '))}.</div>` : ''}
          <div class="team-ratings">
            <div><span>Attack</span><strong>${st.attack.toFixed(0)}</strong></div>
            <div><span>Midfield</span><strong>${st.control.toFixed(0)}</strong></div>
            <div><span>Defence</span><strong>${st.defense.toFixed(0)}</strong></div>
            <div><span>Team OVR</span><strong>${st.ovr.toFixed(0)}</strong></div>
          </div>
        </section>
        <section class="card">
          <h3>Squad <span class="muted small">${club.pids.length}/${MAX_SQUAD} players · wage bill not tracked</span></h3>
          <div class="tbl-wrap"><table class="tbl squad-tbl"><thead><tr>
            ${th('pos', 'Pos')}<th class="left">Name</th>${th('age', 'Age')}${th('ovr', 'OVR')}${selPos ? `<th title="Rating in ${selPos}">@${selPos}</th>` : ''}<th>Form</th><th>Apps</th>${th('goals', 'G')}<th>A</th>${th('rating', 'Avg')}${th('value', 'Value')}<th></th>
          </tr></thead><tbody>
          ${players.map((p) => `<tr class="${lineupSet.has(p.id) ? 'starter' : ''} ${selPos ? 'pickable' : ''} ${!available(p) ? 'unavail' : ''}" ${selPos ? `data-act="assign" data-id="${p.id}"` : ''}>
            <td>${posBadge(p.pos)}</td>
            <td class="left name-cell">${lineupSet.has(p.id) ? '<span class="xi-dot" title="In starting XI"></span>' : ''}${selPos ? esc(p.name) : playerLink(p)} ${statusIcons(p)} ${genTag(p)}</td>
            <td>${p.age}</td><td>${ovrBadge(p.ovr)}</td>
            ${selPos ? `<td><strong class="${fit(p.pos, selPos) < 0 ? 'warn-t' : ''}">${eff(p, selPos)}</strong></td>` : ''}
            <td>${formArrow(p.form)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td>
            <td class="money">${money(playerValue(p))}</td>
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
    save();
    render();
  }

  /* ------------------------------------------------------------------ *
   * Transfers
   * ------------------------------------------------------------------ */
  function viewTransfers() {
    const c = C(), me = S.clubs[c.clubId], f = ui.market;
    const q = norm(f.q);
    let list = Object.values(S.players).filter((p) => p.clubId !== c.clubId && S.clubs[p.clubId]);
    if (f.league === 'FA') list = list.filter((p) => p.clubId === 'FA');
    else if (f.league !== 'ALL') list = list.filter((p) => S.clubs[p.clubId].leagueId === f.league);
    if (f.pos !== 'ALL') list = list.filter((p) => (['DEF', 'MID', 'ATT'].includes(f.pos) ? LINE[p.pos] === f.pos : p.pos === f.pos));
    list = list.filter((p) => p.ovr >= f.min && p.ovr <= f.max);
    if (f.age) list = list.filter((p) => p.age <= f.age);
    if (q) list = list.filter((p) => norm(p.name).includes(q) || norm(S.clubs[p.clubId].name).includes(q));
    const withPrice = list.map((p) => ({ p, price: askingPrice(p) }));
    const maxPrice = f.price === -1 ? me.budget : f.price;
    let rows = maxPrice ? withPrice.filter((x) => x.price <= maxPrice) : withPrice;
    const sorts = { ovr: (a, b) => b.p.ovr - a.p.ovr || a.price - b.price, price: (a, b) => a.price - b.price, priceDesc: (a, b) => b.price - a.price, age: (a, b) => a.p.age - b.p.age || b.p.ovr - a.p.ovr, value: (a, b) => (b.p.ovr / Math.log10(b.price + 10)) - (a.p.ovr / Math.log10(a.price + 10)) };
    rows.sort(sorts[f.sort] || sorts.ovr);
    const total = rows.length;
    const per = 40;
    rows = rows.slice(0, per * f.page);
    const hist = c.transfers.slice(0, 12);
    return `
      <section class="card">
        <div class="row between wrap gap">
          <h3>Transfer market</h3>
          <div><span class="muted">Budget</span> <strong class="money big-money">${money(me.budget)}</strong> <span class="muted small">· Squad ${me.pids.length}/${MAX_SQUAD}</span></div>
        </div>
        <div class="filters">
          <input class="input" placeholder="Search player or club…" value="${esc(f.q)}" data-change="m-q" data-live="1">
          <select class="input" data-change="m-league"><option value="ALL">All leagues</option>${S.leagueOrder.map((id) => `<option value="${id}" ${f.league === id ? 'selected' : ''}>${esc(S.leagues[id].name)}</option>`).join('')}<option value="FA" ${f.league === 'FA' ? 'selected' : ''}>Free agents & youth</option></select>
          <select class="input" data-change="m-pos"><option value="ALL">All positions</option>${['GK', 'DEF', 'MID', 'ATT'].map((l) => `<option value="${l === 'GK' ? 'GK' : l}" ${f.pos === l ? 'selected' : ''}>${{ GK: 'Goalkeepers', DEF: 'All defenders', MID: 'All midfielders', ATT: 'All attackers' }[l]}</option>`).join('')}${POSITIONS.filter((p) => p !== 'GK').map((p) => `<option ${f.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <label class="inline">OVR <input class="input xs" type="number" min="40" max="99" value="${f.min}" data-change="m-min"> – <input class="input xs" type="number" min="40" max="99" value="${f.max}" data-change="m-max"></label>
          <select class="input" data-change="m-age"><option value="0">Any age</option>${[21, 23, 25, 28, 30].map((a) => `<option value="${a}" ${f.age === a ? 'selected' : ''}>≤ ${a}</option>`).join('')}</select>
          <select class="input" data-change="m-price"><option value="0">Any price</option>${[1e6, 5e6, 10e6, 20e6, 40e6, 70e6, 100e6, 150e6].map((v) => `<option value="${v}" ${f.price === v ? 'selected' : ''}>≤ ${money(v)}</option>`).join('')}<option value="-1" ${f.price === -1 ? 'selected' : ''}>Affordable</option></select>
          <select class="input" data-change="m-sort">${[['ovr', 'Best OVR'], ['price', 'Cheapest'], ['priceDesc', 'Most expensive'], ['age', 'Youngest'], ['value', 'Best value']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <p class="muted small">${total} players found. Price depends on OVR, age, position, form and match ratings. Clubs charge extra for their 3 best players. Free agents & youth players cost a small signing fee.</p>
        <div class="tbl-wrap"><table class="tbl market"><thead><tr><th>Pos</th><th class="left">Name</th><th>Age</th><th>OVR</th><th class="left">Club</th><th>Value</th><th>Price</th><th></th></tr></thead><tbody>
          ${rows.map(({ p, price }) => `<tr>
            <td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)} ${genTag(p)} ${statusIcons(p)}</td><td>${p.age}</td><td>${ovrBadge(p.ovr)}</td>
            <td class="left small">${esc(S.clubs[p.clubId].name)}</td><td class="money muted">${money(playerValue(p))}</td><td class="money"><strong>${money(price)}</strong></td>
            <td><button class="btn xs ${price <= me.budget ? 'primary' : 'ghost'}" data-act="buy" data-id="${p.id}" ${price > me.budget ? 'disabled title="Not enough budget"' : ''}>Buy</button></td>
          </tr>`).join('')}
        </tbody></table></div>
        ${total > rows.length ? `<div class="center"><button class="btn" data-act="m-more">Show more (${total - rows.length} remaining)</button></div>` : ''}
      </section>
      ${hist.length ? `<section class="card"><h3>Your transfer history</h3><ul class="plist">${hist.map((t) => `<li><span class="tag ${t.dir === 'in' ? 'good' : 'warn'}">${t.dir === 'in' ? 'IN' : 'OUT'}</span> ${esc(t.name)} <span class="muted small">${t.dir === 'in' ? 'from' : 'to'} ${esc(t.club)} · ${seasonLabel(t.season)}</span><span class="ml-auto money">${money(t.fee)}</span></li>`).join('')}</ul></section>` : ''}`;
  }

  /* ------------------------------------------------------------------ *
   * Fixtures (calendar)
   * ------------------------------------------------------------------ */
  function viewFixtures() {
    const c = C();
    const n = c.rounds.length;
    if (ui.fixMd === null || ui.fixMd >= n) ui.fixMd = Math.min(c.md, n - 1);
    const md = ui.fixMd;
    const round = c.rounds[md];
    const mine = c.rounds.map((r, i) => ({ m: r.find((x) => x.h === c.clubId || x.a === c.clubId), i }));
    return `
      <div class="grid g-fix">
        <section class="card">
          <div class="md-nav">
            <button class="btn sm" data-act="md-prev" ${md <= 0 ? 'disabled' : ''}>◀</button>
            <div class="md-title">
              <select class="input sm" data-change="md">${c.rounds.map((_, i) => `<option value="${i}" ${i === md ? 'selected' : ''}>Matchday ${i + 1} — ${fmtDate(c.dates[i])}</option>`).join('')}</select>
              <div class="muted small">${fmtDate(c.dates[md], true)} ${md === c.md && !c.seasonOver ? '<span class="tag good">NEXT</span>' : md < c.md ? '<span class="tag">PLAYED</span>' : ''}</div>
            </div>
            <button class="btn sm" data-act="md-next" ${md >= n - 1 ? 'disabled' : ''}>▶</button>
          </div>
          <ul class="fixtures">${round.map((m, i) => `
            <li class="${m.h === c.clubId || m.a === c.clubId ? 'me' : ''} ${m.played ? 'played' : ''}" ${m.played ? `data-act="report" data-id="${md}:${i}"` : ''}>
              <span class="fx-t right">${esc(clubName(m.h))} ${crest(S.clubs[m.h], 'sm')}</span>
              <span class="fx-s">${m.played ? `${m.hg} - ${m.ag}` : '<span class="muted">vs</span>'}</span>
              <span class="fx-t">${crest(S.clubs[m.a], 'sm')} ${esc(clubName(m.a))}</span>
            </li>`).join('')}</ul>
          ${!c.seasonOver ? `<div class="row gap wrap center mt">
            ${md > c.md ? `<button class="btn primary" data-act="sim-to" data-id="${md}">⏩ Simulate up to Matchday ${md + 1}</button>` : ''}
            ${md === c.md ? '<button class="btn primary" data-act="tab" data-id="match">Play this matchday →</button>' : ''}
            <button class="btn" data-act="quick-next">Quick sim next matchday</button>
            <button class="btn ghost" data-act="sim-end">Simulate rest of season</button>
          </div>` : ''}
          <p class="muted small center">Played matches can be clicked to open the match report.</p>
        </section>
        <section class="card">
          <h3>Your season calendar</h3>
          <ul class="calendar">${mine.map(({ m, i }) => {
            if (!m) return `<li class="${i === md ? 'cur' : ''}" data-act="md-go" data-id="${i}"><span class="muted small">${fmtDate(c.dates[i])}</span><span class="muted">No match</span></li>`;
            const home = m.h === c.clubId; const opp = clubName(home ? m.a : m.h);
            let res = '';
            if (m.played) { const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg; const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; res = `<span class="fd fd-${r}">${r}</span> <strong>${gf}-${ga}</strong>`; }
            else if (i === c.md) res = '<span class="tag good">NEXT</span>';
            return `<li class="${i === md ? 'cur' : ''} ${m.played ? '' : 'future'}" data-act="md-go" data-id="${i}"><span class="muted small cal-d">${fmtDate(c.dates[i])}</span><span class="cal-ha">${home ? 'H' : 'A'}</span><span class="cal-o">${esc(opp)}</span><span class="ml-auto">${res}</span></li>`;
          }).join('')}</ul>
        </section>
      </div>`;
  }
  function simUntil(targetMd) {
    const c = C();
    let n = 0;
    while (!c.seasonOver && c.md < targetMd) { playRound(false); n++; }
    save();
    return n;
  }
  function matchReport(md, i) {
    const m = C().rounds[md][i];
    const H = S.clubs[m.h], A = S.clubs[m.a];
    const goals = (m.goals || []).map((g) => `<li class="${g[1] ? 'right' : ''}"><strong>${esc(g[0])}'</strong> ⚽ ${esc(S.players[g[2]]?.name ?? 'Unknown')}${g[4] ? ' (pen)' : ''}${g[3] ? ` <span class="muted small">assist ${esc(S.players[g[3]]?.name ?? '')}</span>` : ''}</li>`).join('');
    const s = m.st;
    const stat = (label, a, b, suf = '') => `<tr><td>${a}${suf}</td><td class="muted">${label}</td><td>${b}${suf}</td></tr>`;
    openModal(`
      <div class="report">
        <div class="muted center small">Matchday ${md + 1} · ${fmtDate(C().dates[md], true)}</div>
        <div class="scoreboard sm">
          <div class="sbt">${crest(H, 'lg')}<strong>${esc(H.name)}</strong></div>
          <div class="sbs"><div class="score">${m.hg} <span>-</span> ${m.ag}</div></div>
          <div class="sbt">${crest(A, 'lg')}<strong>${esc(A.name)}</strong></div>
        </div>
        <ul class="goals-list">${goals || '<li class="muted center">No goals</li>'}</ul>
        ${s ? `<table class="tbl stat-tbl"><tbody>${stat('Possession', s.poss[0], s.poss[1], '%')}${stat('Shots', s.shots[0], s.shots[1])}${stat('On target', s.sot[0], s.sot[1])}${stat('Corners', s.corners[0], s.corners[1])}${stat('Cards', `${s.yc[0]}🟨 ${s.rc[0] ? s.rc[0] + '🟥' : ''}`, `${s.yc[1]}🟨 ${s.rc[1] ? s.rc[1] + '🟥' : ''}`)}</tbody></table>` : ''}
        ${m.motm ? `<p class="motm center">⭐ Player of the match: <strong>${esc(S.players[m.motm]?.name ?? '')}</strong></p>` : ''}
      </div>`);
  }

  /* ------------------------------------------------------------------ *
   * Table & stats
   * ------------------------------------------------------------------ */
  function viewTable() {
    const c = C();
    const t = standings(c.leagueId);
    const n = t.length;
    const zone = (i) => (i < 4 ? 'z-cl' : i < 6 ? 'z-el' : i >= n - 3 ? 'z-rel' : '');
    return `
      <section class="card">
        <h3>${esc(S.leagues[c.leagueId].name)} ${seasonLabel(c.season)} <span class="muted small">after ${c.md} of ${c.rounds.length} matchdays</span></h3>
        <div class="tbl-wrap"><table class="tbl league"><thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th class="hide-sm">GF</th><th class="hide-sm">GA</th><th>GD</th><th>Pts</th><th class="hide-sm">Form</th><th class="hide-sm">OVR</th></tr></thead><tbody>
          ${t.map((r, i) => `<tr class="${r.id === c.clubId ? 'me' : ''}"><td class="${zone(i)}">${i + 1}</td><td class="left">${crest(S.clubs[r.id], 'sm')} ${esc(clubName(r.id))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td class="hide-sm">${r.gf}</td><td class="hide-sm">${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><strong>${r.pts}</strong></td><td class="hide-sm">${formDots(r.form)}</td><td class="hide-sm">${ovrBadge(clubRating(r.id))}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="legend"><span><i class="z-cl"></i> Champions League</span><span><i class="z-el"></i> Europa League</span><span><i class="z-rel"></i> Relegation</span></div>
      </section>`;
  }
  function viewStats() {
    const c = C();
    const players = S.leagues[c.leagueId].clubIds.flatMap((id) => S.clubs[id].pids.map((pid) => S.players[pid]));
    const tabs = [['scorers', 'Top scorers'], ['assists', 'Assists'], ['ratings', 'Best ratings'], ['cs', 'Clean sheets'], ['mine', 'My squad'], ['history', 'History']];
    let body = '';
    const tableOf = (rows, col, fmt) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="left">Player</th><th class="left">Club</th><th>Apps</th><th>${col}</th></tr></thead><tbody>${rows.map((p, i) => `<tr class="${p.clubId === c.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="left">${posBadge(p.pos)} ${playerLink(p)}</td><td class="left small">${esc(clubName(p.clubId))}</td><td>${p.st.apps}</td><td><strong>${fmt(p)}</strong></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No data yet — play some matches.</td></tr>'}</tbody></table></div>`;
    const minApps = Math.max(1, Math.floor(c.md * 0.4));
    switch (ui.statsTab) {
      case 'assists': body = tableOf(players.filter((p) => p.st.assists).sort((a, b) => b.st.assists - a.st.assists || b.st.goals - a.st.goals).slice(0, 25), 'Assists', (p) => p.st.assists); break;
      case 'ratings': body = tableOf(players.filter((p) => p.st.apps >= minApps).sort((a, b) => avgRating(b) - avgRating(a)).slice(0, 25), 'Avg', (p) => avgRating(p).toFixed(2)); break;
      case 'cs': body = tableOf(players.filter((p) => p.st.cs).sort((a, b) => b.st.cs - a.st.cs).slice(0, 20), 'Clean sheets', (p) => p.st.cs); break;
      case 'mine': {
        const mine = S.clubs[c.clubId].pids.map((id) => S.players[id]).sort((a, b) => b.st.apps - a.st.apps || b.ovr - a.ovr);
        body = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pos</th><th class="left">Player</th><th>Apps</th><th>G</th><th>A</th><th>🟨</th><th>🟥</th><th>MOTM</th><th>Avg</th></tr></thead><tbody>${mine.map((p) => `<tr><td>${posBadge(p.pos)}</td><td class="left">${playerLink(p)}</td><td>${p.st.apps}</td><td>${p.st.goals}</td><td>${p.st.assists}</td><td>${p.st.yc}</td><td>${p.st.rc}</td><td>${p.st.motm}</td><td>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</td></tr>`).join('')}</tbody></table></div>`;
        break;
      }
      case 'history': body = c.history.length ? `<table class="tbl"><thead><tr><th>Season</th><th class="left">Club</th><th>Finish</th><th>Pts</th><th class="left">Champion</th><th class="left">Top scorer</th></tr></thead><tbody>${c.history.map((h) => `<tr><td>${seasonLabel(h.season)}</td><td class="left">${esc(h.club)}</td><td>${ordinal(h.pos)}</td><td>${h.pts}</td><td class="left">${esc(h.champion)}</td><td class="left">${esc(h.topScorer)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Complete a season to build your managerial history.</p>'; break;
      default: body = tableOf(players.filter((p) => p.st.goals).sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists).slice(0, 25), 'Goals', (p) => p.st.goals);
    }
    return `<section class="card"><div class="subtabs">${tabs.map(([k, l]) => `<button class="subtab ${ui.statsTab === k ? 'active' : ''}" data-act="stats-tab" data-id="${k}">${l}</button>`).join('')}</div>${body}</section>`;
  }

  /* ------------------------------------------------------------------ *
   * Data (import / export / saves)
   * ------------------------------------------------------------------ */
  function importPanelHtml(inCareer) {
    return `
      <p>Load real <strong>EA SPORTS FC 26</strong> ratings from a <strong>CSV</strong> or <strong>JSON</strong> file, e.g. a FC 26 player database export, a spreadsheet, or the template below.
      Recognised columns: <code>Name</code> (or <code>short_name</code>/<code>long_name</code>), <code>Club</code>, <code>Position</code> (or <code>player_positions</code>), <code>OVR</code> (or <code>overall</code>), <code>Age</code>, <code>League</code>.</p>
      <p class="muted small">Players are matched by name (and club). Matched players get the new OVR, position and age. A higher OVR means they play better in the match engine and cost more. ${inCareer ? 'This applies to your current career. Your own squad is only re-rated, never moved.' : 'Imported ratings apply to every new career you start in this browser.'}</p>
      <div class="row gap wrap">
        <input type="file" id="imp-file" accept=".csv,.json,.txt,.tsv" class="input">
        <button class="btn ghost sm" data-act="dl-template">Download template</button>
        <button class="btn ghost sm" data-act="dl-export">Export current database (CSV)</button>
      </div>
      <textarea id="imp-text" class="input textarea" rows="7" placeholder="…or paste CSV / JSON here&#10;Name,Club,Position,OVR,Age,League&#10;Kylian Mbappé,Real Madrid,ST,91,26,LaLiga"></textarea>
      <div class="row gap wrap">
        <label class="check"><input type="checkbox" id="imp-move" checked> Move players to the club named in the file (real transfers)</label>
        <label class="check"><input type="checkbox" id="imp-add" checked> Add unknown players to their club</label>
        <label class="check"><input type="checkbox" id="imp-create"> Create missing clubs/leagues${inCareer ? ' (not your current league)' : ''}</label>
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
            <button class="btn" data-act="export-save">Download save file</button>
            <label class="btn ghost file-btn">Load save file<input type="file" id="save-file" accept=".json" hidden></label>
          </div>
          <h3 class="mt">Career</h3>
          <div class="row gap wrap">
            <button class="btn ghost" data-act="to-menu">Main menu</button>
            <button class="btn ghost danger" data-act="abandon">Abandon career</button>
          </div>
          <h3 class="mt">How ratings work</h3>
          <ul class="help">
            <li><strong>OVR</strong> drives everything. A player's rating in a position = OVR − out-of-position penalty ± form.</li>
            <li><strong>Team strength</strong>: attack, midfield (possession), defence and goalkeeper come from your XI and formation. Mentality trades defence for attack.</li>
            <li><strong>Match engine</strong>: minute-by-minute simulation. Possession decides who attacks, attack vs defence decides shot quality, and the shooter's rating vs the keeper decides goals.</li>
            <li><strong>Price</strong> = f(OVR, age, position, form, average match rating). Players who perform well get more expensive.</li>
            <li><strong>Progression</strong>: at season end young players who played well improve, and players over 30 decline.</li>
          </ul>
        </section>
      </div>`;
  }
  function runImport(target, inCareer) {
    const text = $('#imp-text').value;
    if (!text.trim()) return toast('Choose a file or paste some data first.', 'bad');
    let records;
    try { records = rowsToRecords(text); } catch (e) { return toast('Could not parse the data: ' + e.message, 'bad'); }
    if (!records.length) return toast('No rows found.', 'bad');
    const opts = { move: $('#imp-move').checked, add: $('#imp-add').checked, create: $('#imp-create').checked };
    const prevS = S;
    S = target;
    const rep = importRecords(target, records, opts);
    finalizeWorld(target);
    invalidate();
    S = prevS;
    if (inCareer) { ensureUserLineup(); save(); } else saveWorld();
    const html = `<div class="report-box"><strong>Import complete</strong> — ${records.length} rows read.<br>
      ✔ ${rep.updated} players re-rated · ➕ ${rep.added} added · 🔁 ${rep.moved} moved clubs · 🏟 ${rep.clubsCreated} clubs created · ${rep.leaguesCreated} leagues created · ✖ ${rep.skipped} skipped
      ${rep.errors.length ? `<ul class="small muted">${rep.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>`;
    toast(`Imported: ${rep.updated} updated, ${rep.added} added.`, 'good');
    return html;
  }

  /* ------------------------------------------------------------------ *
   * Player modal
   * ------------------------------------------------------------------ */
  function playerModal(pid) {
    const p = S.players[pid];
    if (!p) return;
    const inCareer = !!(S.career);
    const mine = inCareer && p.clubId === C().clubId;
    const club = S.clubs[p.clubId];
    const price = inCareer && !mine ? askingPrice(p) : 0;
    openModal(`
      <div class="pmodal">
        <div class="pm-head">
          <div class="pm-ovr ${ovrClass(p.ovr)}">${p.ovr}<small>${p.pos}</small></div>
          <div><h2>${esc(p.name)}</h2><div class="muted">${club ? esc(club.name) : 'Free agent'} · Age ${p.age} ${genTag(p)} ${statusIcons(p)}</div></div>
        </div>
        <div class="stats-row">
          <div class="big-stat"><span>Value</span><strong class="money">${money(playerValue(p))}</strong></div>
          ${!mine && inCareer ? `<div class="big-stat"><span>Asking price</span><strong class="money">${money(price)}</strong></div>` : ''}
          <div class="big-stat"><span>Form</span><strong>${formArrow(p.form)}</strong></div>
          <div class="big-stat"><span>Apps</span><strong>${p.st.apps}</strong></div>
          <div class="big-stat"><span>Goals / Assists</span><strong>${p.st.goals} / ${p.st.assists}</strong></div>
          <div class="big-stat"><span>Avg rating</span><strong>${p.st.apps ? avgRating(p).toFixed(2) : '-'}</strong></div>
        </div>
        <h4>Rating by position</h4>
        <div class="pos-grid">${POSITIONS.map((pos) => { const e = eff(p, pos); return `<span class="pg ${ovrClass(e)}" title="${pos}"><b>${pos}</b>${e}</span>`; }).join('')}</div>
        <h4>Edit rating</h4>
        <div class="row gap wrap"><label class="inline">OVR <input class="input xs" type="number" id="edit-ovr" min="30" max="99" value="${p.ovr}"></label>
          <label class="inline">Position <select class="input sm" id="edit-pos">${POSITIONS.map((x) => `<option ${x === p.pos ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <button class="btn sm" data-act="save-player" data-id="${p.id}">Save</button></div>
        <div class="row gap mt">
          ${inCareer && mine ? `<button class="btn" data-act="sell" data-id="${p.id}">Sell / release</button>` : ''}
          ${inCareer && !mine ? `<button class="btn primary" data-act="buy" data-id="${p.id}" ${price > S.clubs[C().clubId].budget ? 'disabled' : ''}>Buy for ${money(price)}</button>` : ''}
        </div>
      </div>`);
  }
  function sellModal(pid) {
    const p = S.players[pid];
    const err = canSell(p);
    if (err) return toast(err, 'bad');
    const offers = sellOffers(p);
    ui.sellOffers = { pid, offers };
    openModal(`
      <h2>Sell ${esc(p.name)}</h2>
      <p class="muted">${posBadge(p.pos)} ${ovrBadge(p.ovr)} · Age ${p.age} · Market value <strong class="money">${money(playerValue(p))}</strong></p>
      ${offers.length ? `<ul class="offer-list">${offers.map((o, i) => `<li>${crest(S.clubs[o.clubId])} <strong>${esc(clubName(o.clubId))}</strong> <span class="muted small">${esc(S.leagues[S.clubs[o.clubId].leagueId]?.name || '')}</span><span class="ml-auto money"><strong>${money(o.amount)}</strong></span><button class="btn primary sm" data-act="accept-sale" data-id="${i}">Accept</button></li>`).join('')}</ul>` : '<p>No club can afford him right now.</p>'}
      <div class="row gap mt"><button class="btn ghost sm" data-act="refresh-offers" data-id="${pid}">Ask around again</button><button class="btn ghost danger sm" data-act="release" data-id="${pid}">Release for free</button></div>`);
  }
  function buyModal(pid) {
    const p = S.players[pid], me = S.clubs[C().clubId];
    const price = askingPrice(p);
    openModal(`
      <h2>Sign ${esc(p.name)}?</h2>
      <p>${posBadge(p.pos)} ${ovrBadge(p.ovr)} · Age ${p.age} · ${esc(S.clubs[p.clubId]?.name)}</p>
      <table class="tbl stat-tbl"><tbody>
        <tr><td class="left">Transfer fee</td><td class="money"><strong>${money(price)}</strong></td></tr>
        <tr><td class="left">Your budget</td><td class="money">${money(me.budget)}</td></tr>
        <tr><td class="left">Budget after</td><td class="money ${me.budget - price < 0 ? 'warn-t' : ''}">${money(me.budget - price)}</td></tr>
      </tbody></table>
      <div class="row gap mt"><button class="btn primary" data-act="confirm-buy" data-id="${pid}" ${price > me.budget ? 'disabled' : ''}>Confirm signing</button><button class="btn ghost" data-act="close">Cancel</button></div>`);
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
      const go2 = () => { startCareer(ui.startClub, name); view = 'home'; render(); };
      if (saved && saved.career) askConfirm('Starting a new career will overwrite your saved career.', go2, 'Start new career');
      else go2();
    },
    continue: () => { S = loadCareer(); invalidate(); view = 'home'; render(); },
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
    tab: (id) => { if (id !== 'match') ui.playback = null; go(id); },
    'quick-next': () => { const r = playRound(false); save(); if (r) { const c = C(); const home = r.h === c.clubId; toast(`MD${r.md + 1}: ${clubName(r.h)} ${r.score[0]}-${r.score[1]} ${clubName(r.a)}`, (home ? r.score[0] - r.score[1] : r.score[1] - r.score[0]) > 0 ? 'good' : 'info'); } render(); },
    simulate: () => doSimulate(),
    'skip-playback': () => { clearTimers(); if (ui.playback) { ui.playback.shown = (ui.playback.res.text || []).length; ui.playback.done = true; updatePlayback(); } },
    'end-playback': () => { clearTimers(); ui.playback = null; go('home'); },
    'end-playback-next': () => { clearTimers(); ui.playback = null; go('match'); },
    'next-season': () => { startNextSeason(); go('home'); },
    slot: (id) => {
      const i = +id;
      if (ui.squadSel === null) ui.squadSel = i;
      else if (ui.squadSel === i) ui.squadSel = null;
      else { const c = C(); [c.lineup[i], c.lineup[ui.squadSel]] = [c.lineup[ui.squadSel], c.lineup[i]]; ui.squadSel = null; save(); }
      render();
    },
    'slot-cancel': () => { ui.squadSel = null; render(); },
    assign: (id) => { if (ui.squadSel !== null) { if (!available(S.players[id])) return toast(`${S.players[id].name} is unavailable.`, 'bad'); assignToSlot(ui.squadSel, id); } },
    'auto-pick': () => { const c = C(); c.lineup = bestXI(S.clubs[c.clubId].pids, c.formation); ui.squadSel = null; save(); render(); toast('Best available XI selected.', 'good'); },
    'squad-sort': (id) => { ui.squadSort = id; render(); },
    sell: (id) => sellModal(id),
    'refresh-offers': (id) => sellModal(id),
    'accept-sale': (i) => { const so = ui.sellOffers; const o = so && so.offers[+i]; if (!o) return; sellPlayer(so.pid, o.clubId, o.amount); closeModal(); render(); },
    release: (id) => askConfirm(`Release ${S.players[id].name} for free?`, () => { sellPlayer(id, 'FA', 0); render(); }, 'Release'),
    buy: (id) => buyModal(id),
    'confirm-buy': (id) => { if (buyPlayer(id)) { closeModal(); render(); } },
    'accept-offer': (id) => { const c = C(); const o = c.offers.find((x) => x.id === id); if (!o) return; if (S.clubs[o.clubId].budget < o.amount) { c.offers = c.offers.filter((x) => x !== o); toast('The buyer can no longer afford the deal.', 'bad'); return render(); } sellPlayer(o.pid, o.clubId, o.amount); render(); },
    'reject-offer': (id) => { const c = C(); c.offers = c.offers.filter((x) => x.id !== id); save(); render(); },
    'm-more': () => { ui.market.page++; render(); },
    'md-prev': () => { ui.fixMd = Math.max(0, ui.fixMd - 1); render(); },
    'md-next': () => { ui.fixMd = Math.min(C().rounds.length - 1, ui.fixMd + 1); render(); },
    'md-go': (id) => { ui.fixMd = +id; render(); },
    'sim-to': (id) => { const n = simUntil(+id); toast(`Simulated ${n} matchday${n === 1 ? '' : 's'}.`, 'good'); ui.fixMd = C().md; render(); },
    'sim-end': () => askConfirm('Simulate every remaining match of the season?', () => { simUntil(C().rounds.length); render(); }, 'Simulate'),
    report: (id) => { const [md, i] = id.split(':').map(Number); matchReport(md, i); },
    'stats-tab': (id) => { ui.statsTab = id; render(); },
    player: (id) => playerModal(id),
    'save-player': (id) => {
      const p = S.players[id];
      const o = parseInt($('#edit-ovr').value, 10);
      if (!(o >= 30 && o <= 99)) return toast('OVR must be between 30 and 99.', 'bad');
      p.ovr = o; p.pos = $('#edit-pos').value;
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
    formation: (v) => { const c = C(); c.formation = v; c.lineup = bestXI(S.clubs[c.clubId].pids, v); ui.squadSel = null; save(); render(); },
    mentality: (v) => { C().mentality = v; save(); render(); },
    speed: (v) => { C().speed = v; save(); if (!ui.playback) render(); },
    md: (v) => { ui.fixMd = +v; render(); },
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
        const again = document.querySelector(`[data-change="${el.dataset.change}"]`);
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
      }, 250);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'imp-file' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => { $('#imp-text').value = r.result; toast(`Loaded ${el.files[0].name} — press "Import ratings".`, 'info'); };
      r.readAsText(el.files[0]);
      return;
    }
    if (el.id === 'save-file' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data.career || !data.players) throw new Error('not a save file');
          S = data; invalidate(); save(); view = 'home'; render(); toast('Save loaded.', 'good');
        } catch (err) { toast('That file is not a valid save.', 'bad'); }
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
  S = W;
  renderStart();

  // Exposed for debugging / tests.
  window.SM = { get state() { return S; }, get world() { return W; }, simulateMatch, buildSide, playRound, startCareer, importRecords, rowsToRecords, playerValue, standings, go, render, startNextSeason };
})();
