// ============ App: profile, menus, matchmaking, battle controller ============

const SAVE_KEY = 'crownclash.save.v1';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Math.round(n).toLocaleString();

// ---------- Profile ----------
function newProfile() {
  const cards = {};
  Object.keys(CARDS).forEach((id) => { cards[id] = { level: LEVELS.START, copies: 0, stars: 0 }; });
  return {
    name: 'You', gold: 25000, starPoints: 0, trophies: 0,
    cards, deck: DEFAULT_DECK.slice(), practice: [],
    record: { wins: 0, losses: 0, draws: 0 },
  };
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const fresh = newProfile();
      Object.keys(fresh.cards).forEach((id) => { if (!saved.cards[id]) saved.cards[id] = fresh.cards[id]; });
      return Object.assign(fresh, saved);
    }
  } catch (err) { /* storage unavailable — play with a fresh profile */ }
  return newProfile();
}

function saveProfile() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (err) { /* ignore */ }
}

let profile = loadProfile();

function levelsOf(prof) {
  const out = {};
  Object.keys(prof.cards).forEach((id) => { out[id] = prof.cards[id].level; });
  return out;
}
function starsOf(prof) {
  const out = {};
  Object.keys(prof.cards).forEach((id) => { out[id] = prof.cards[id].stars; });
  return out;
}
function avgDeckLevel(deck, levels) {
  return deck.reduce((s, id) => s + (levels[id] || LEVELS.START), 0) / deck.length;
}
function arenaName(trophies) {
  if (trophies < 1000) return 'Training Grounds';
  if (trophies < 2500) return 'Goblin Gulch';
  if (trophies < 4000) return 'Frozen Peak';
  return 'Royal Keep';
}
// Low-population queue window: late night local time.
function offPeak() {
  const h = new Date().getHours();
  return h >= 1 && h < 7;
}

// ---------- Screen routing ----------
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function cardChip(id, opts = {}) {
  const c = CARDS[id];
  const lv = opts.level != null ? opts.level : null;
  const badges = [];
  if (opts.evo) badges.push('<span class="badge evo">EVO</span>');
  if (c.hero) badges.push('<span class="badge hero">HERO</span>');
  return `<div class="chip rarity-${c.rarity}${opts.cls ? ' ' + opts.cls : ''}" data-id="${id}" title="${c.name}">
    <span class="chip-cost">${c.cost}</span>
    <span class="chip-icon">${c.icon}</span>
    <span class="chip-name">${c.name}</span>
    ${lv != null ? `<span class="chip-level">Lv ${lv}</span>` : ''}
    <span class="chip-badges">${badges.join('')}</span>
  </div>`;
}

// ---------- Home ----------
function renderHome() {
  $('#homeTrophies').textContent = fmt(profile.trophies);
  $('#homeGold').textContent = fmt(profile.gold);
  $('#homeStars').textContent = fmt(profile.starPoints);
  $('#homeArena').textContent = arenaName(profile.trophies);
  $('#homeRecord').textContent = `${profile.record.wins}W · ${profile.record.losses}L · ${profile.record.draws}D`;
  $('#homeQueue').textContent = offPeak() ? 'Low (off-peak)' : 'Normal';
  const err = validateDeck(profile.deck);
  $('#homeDeck').innerHTML = profile.deck.map((id, i) => (CARDS[id] ? cardChip(id, { level: profile.cards[id].level, evo: isEvolvedSlot(profile.deck, i), cls: 'small' }) : '<div class="chip empty small"></div>')).join('');
  $('#homeDeckWarn').textContent = err || '';
  $('#practiceCount').textContent = profile.practice.length;
  show('screen-home');
}

// ---------- Deck builder ----------
let deckSel = null; // { from: 'slot'|'pool', id, slot }

function renderDeck() {
  const deck = profile.deck;
  $('#deckSlots').innerHTML = deck.map((id, i) => {
    const label = SLOT_LABELS[i] ? `<span class="slot-label slot-${SLOT_LABELS[i].toLowerCase()}">${SLOT_LABELS[i]}</span>` : '';
    const inner = id && CARDS[id] ? cardChip(id, { level: profile.cards[id].level, evo: isEvolvedSlot(deck, i) }) : '<div class="chip empty">Empty</div>';
    const sel = deckSel && deckSel.from === 'slot' && deckSel.slot === i ? ' selected' : '';
    return `<div class="slot${sel}" data-slot="${i}">${label}${inner}</div>`;
  }).join('');

  const filter = $('#deckFilter').value;
  const ids = Object.keys(CARDS).filter((id) => filter === 'all' || CARDS[id].role === filter || (filter === 'hero' && CARDS[id].hero) || (filter === 'evo' && CARDS[id].evo));
  $('#deckPool').innerHTML = ids.map((id) => {
    const inDeck = deck.includes(id);
    const sel = deckSel && deckSel.from === 'pool' && deckSel.id === id ? ' selected' : '';
    return cardChip(id, { level: profile.cards[id].level, cls: (inDeck ? 'in-deck' : '') + sel });
  }).join('');

  const err = validateDeck(deck);
  const valid = deck.filter((id) => CARDS[id]);
  const avg = valid.length ? valid.reduce((s, id) => s + CARDS[id].cost, 0) / valid.length : 0;
  $('#deckAvg').textContent = avg.toFixed(1);
  $('#deckStatus').textContent = err || 'Deck is ready for battle.';
  $('#deckStatus').className = err ? 'warn' : 'ok';
  $('#deckInfo').innerHTML = deckSel && deckSel.id ? cardInfoHtml(deckSel.id) : '<p class="dim">Select a card to see its details. Pick a card, then a slot, to place it. Evolution-capable cards in the Evolution or Wild slot play evolved; Heroes may only use the Hero or Wild slot.</p>';
}

function cardInfoHtml(id) {
  const c = CARDS[id];
  const pc = profile.cards[id];
  const lines = [`<h4>${c.icon} ${c.name} <span class="rar" style="color:${RARITIES[c.rarity].color}">${RARITIES[c.rarity].name}</span></h4>`, `<p>${c.desc}</p>`];
  if (c.type !== 'spell') lines.push(`<p class="dim">HP ${fmt(statAt(c.hp, pc.level))} · DMG ${fmt(statAt(c.dmg, pc.level))} · Range ${c.range} · Targets ${c.targets}${c.flying ? ' · Flying' : ''}</p>`);
  else if (c.spell.dmg) lines.push(`<p class="dim">Damage ${fmt(statAt(c.spell.dmg, pc.level))} (towers ${Math.round(c.spell.crownPct * 100)}%) · Radius ${c.spell.radius || c.spell.width}</p>`);
  if (c.evo) lines.push(`<p><span class="badge evo">EVO</span> ${c.evo.desc}</p>`);
  if (c.ability) lines.push(`<p><span class="badge hero">HERO</span> <b>${c.ability.name}</b> (${c.ability.cost} elixir, ${c.ability.cooldown}s): ${c.ability.desc}</p>`);
  return lines.join('');
}

function deckClick(e) {
  const slotEl = e.target.closest('.slot');
  const chip = e.target.closest('.chip');
  const deck = profile.deck;
  if (slotEl) {
    const i = Number(slotEl.dataset.slot);
    if (deckSel && deckSel.from === 'pool') {
      const id = deckSel.id;
      const existing = deck.indexOf(id);
      if (existing >= 0) deck[existing] = deck[i];
      deck[i] = id;
      deckSel = null;
    } else if (deckSel && deckSel.from === 'slot' && deckSel.slot !== i) {
      [deck[i], deck[deckSel.slot]] = [deck[deckSel.slot], deck[i]];
      deckSel = null;
    } else {
      deckSel = deck[i] ? { from: 'slot', slot: i, id: deck[i] } : null;
    }
  } else if (chip && chip.dataset.id) {
    deckSel = { from: 'pool', id: chip.dataset.id };
  }
  saveProfile();
  renderDeck();
}

// ---------- Collection ----------
function renderCollection() {
  $('#colGold').textContent = fmt(profile.gold);
  $('#colStars').textContent = fmt(profile.starPoints);
  $('#colGrid').innerHTML = Object.keys(CARDS).map((id) => {
    const c = CARDS[id], pc = profile.cards[id];
    const need = copiesToUpgrade(c.rarity, pc.level);
    const pct = need ? Math.min(100, (pc.copies / need) * 100) : 100;
    const ready = need && pc.copies >= need;
    return `<div class="col-card rarity-${c.rarity}${ready ? ' ready' : ''}" data-id="${id}">
      <div class="col-icon">${c.icon}</div>
      <div class="col-name">${c.name}</div>
      <div class="col-level">${pc.level >= LEVELS.MAX ? 'MAX' : 'Level ' + pc.level}${pc.stars ? ' ' + '⭐'.repeat(pc.stars) : ''}</div>
      <div class="col-bar"><span style="width:${pct}%"></span></div>
      <div class="col-copies">${need ? `${fmt(pc.copies)} / ${fmt(need)}` : 'Star levels'}</div>
    </div>`;
  }).join('');
  $('#rarityTable').innerHTML = Object.keys(RARITIES).map((r) => `<tr><td style="color:${RARITIES[r].color}">${RARITIES[r].name}</td><td>${fmt(RARITIES[r].totalCopies)}</td><td>${fmt(COPIES_TABLE[r][LEVELS.START - 1])}</td></tr>`).join('');
  $('#goldTotal').textContent = fmt(LEVELS.TOTAL_GOLD);
}

function openCardModal(id) {
  const c = CARDS[id], pc = profile.cards[id];
  const need = copiesToUpgrade(c.rarity, pc.level);
  const gold = goldToUpgrade(pc.level);
  const canUp = need && pc.copies >= need && profile.gold >= gold;
  const stat = (base) => base == null ? '—' : fmt(statAt(base, pc.level));
  const next = (base) => base == null || pc.level >= LEVELS.MAX ? '' : ` → <b>${fmt(statAt(base, pc.level + 1))}</b>`;
  let body = cardInfoHtml(id);
  if (c.type !== 'spell') {
    body += `<table class="stats"><tr><td>Hitpoints</td><td>${stat(c.hp)}${next(c.hp)}</td></tr>
      <tr><td>Damage</td><td>${stat(c.dmg)}${next(c.dmg)}</td></tr>
      <tr><td>Damage / sec</td><td>${fmt(statAt(c.dmg, pc.level) / c.hitSpeed)}</td></tr>
      <tr><td>Elixir</td><td>${c.cost}</td></tr></table>`;
  } else if (c.spell.dmg) {
    body += `<table class="stats"><tr><td>Damage</td><td>${stat(c.spell.dmg)}${next(c.spell.dmg)}</td></tr><tr><td>Elixir</td><td>${c.cost}</td></tr></table>`;
  }
  if (pc.level < LEVELS.MAX) {
    body += `<div class="upgrade-box">
      <p>Level ${pc.level} → ${pc.level + 1}: <b>${fmt(need)}</b> copies (you have ${fmt(pc.copies)}) + <b>${fmt(gold)}</b> gold</p>
      <button class="btn primary" id="btnUpgrade" ${canUp ? '' : 'disabled'}>Upgrade (+10% HP &amp; damage)</button>
    </div>`;
  } else {
    body += `<div class="upgrade-box"><p><b>Max level.</b> Spend Star Points on cosmetics — they never change stats.</p>
      ${STAR_LEVELS.map((s, i) => `<button class="btn ${pc.stars > i ? 'ghost' : 'primary'}" data-star="${i}" ${pc.stars !== i || profile.starPoints < s.cost ? 'disabled' : ''}>${'⭐'.repeat(i + 1)} ${s.name} — ${pc.stars > i ? 'Unlocked' : fmt(s.cost) + ' SP'}</button>`).join('')}
    </div>`;
  }
  $('#modalBody').innerHTML = body;
  $('#modal').classList.add('open');
  const up = $('#btnUpgrade');
  if (up) up.onclick = () => {
    pc.copies -= need;
    profile.gold -= gold;
    pc.level++;
    saveProfile();
    renderCollection();
    openCardModal(id);
    toast(`${c.name} upgraded to level ${pc.level}!`);
  };
  $$('[data-star]', $('#modalBody')).forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.star);
      profile.starPoints -= STAR_LEVELS[i].cost;
      pc.stars = i + 1;
      saveProfile();
      renderCollection();
      openCardModal(id);
    };
  });
}

// ---------- Training & practice lists ----------
function renderTraining() {
  $('#trainingList').innerHTML = TRAINING_BOTS.map((b, i) => `<div class="list-row">
    <div><b>${b.name}</b> <span class="dim">· ${BOT_DECKS[b.deckIndex].name} · Level ${b.level}</span>
      <div class="mini-deck">${BOT_DECKS[b.deckIndex].cards.map((id) => CARDS[id].icon).join(' ')}</div></div>
    <button class="btn primary" data-train="${i}">Battle</button></div>`).join('');
}

function renderPractice() {
  if (!profile.practice.length) {
    $('#practiceList').innerHTML = '<p class="dim">No practice matches yet. When a ladder opponent beats you, their exact deck and card levels are saved here so you can lab a counter-strategy safely.</p>';
    return;
  }
  $('#practiceList').innerHTML = profile.practice.map((pr, i) => `<div class="list-row">
    <div><b>${pr.name}</b> <span class="dim">· beat you ${pr.crowns[1]}-${pr.crowns[0]} · ${new Date(pr.date).toLocaleString()}</span>
      <div class="mini-deck">${pr.deck.map((id) => `${CARDS[id].icon}<sub>${pr.levels[id]}</sub>`).join(' ')}</div></div>
    <div class="row-btns"><button class="btn primary" data-practice="${i}">Replay</button><button class="btn ghost" data-practice-del="${i}">✕</button></div></div>`).join('');
}

// ---------- Matchmaking ----------
function botLevels(deck, level) {
  const out = {};
  deck.forEach((id) => { out[id] = clamp(Math.round(level + (Math.random() - 0.5)), 1, LEVELS.MAX); });
  return out;
}

function findLadderMatch() {
  const err = validateDeck(profile.deck);
  if (err) { toast(err); return; }
  const lowTier = profile.trophies < MATCHMAKING.LOW_TROPHY_BOT_ZONE;
  const chance = lowTier ? MATCHMAKING.LOW_TROPHY_BOT_CHANCE : offPeak() ? MATCHMAKING.OFF_PEAK_BOT_CHANCE : MATCHMAKING.NORMAL_BOT_CHANCE;
  const isFallbackBot = Math.random() < chance;
  const myLevel = avgDeckLevel(profile.deck, levelsOf(profile));
  const deckDef = pick(BOT_DECKS);
  const oppLevel = isFallbackBot ? myLevel : myLevel + (Math.random() * 2 - 1);
  const opp = {
    name: pick(BOT_NAMES) + (isFallbackBot ? '' : randInt(1, 99)),
    deck: deckDef.cards.slice(), levels: botLevels(deckDef.cards, oppLevel),
    aiProfile: isFallbackBot ? 'scripted' : 'human',
    trophies: Math.max(0, profile.trophies + randInt(-80, 80)),
  };
  // Fallback bots fill the queue fast; "real" searches take longer.
  const wait = isFallbackBot ? 900 + Math.random() * 900 : 2200 + Math.random() * 2500;
  queueThen(wait, `${opp.name} · 🏆 ${fmt(opp.trophies)}`, () => startBattle({
    mode: 'ladder', opponents: [opp], matchmaking: isFallbackBot ? (lowTier ? 'Low-trophy fallback bot' : 'Low-population fallback bot') : 'Standard queue',
  }));
}

function find2v2Match() {
  const err = validateDeck(profile.deck);
  if (err) { toast(err); return; }
  const myLevel = avgDeckLevel(profile.deck, levelsOf(profile));
  const decks = shuffle(BOT_DECKS);
  const mk = (d, profileName) => ({ name: pick(BOT_NAMES) + randInt(1, 99), deck: d.cards.slice(), levels: botLevels(d.cards, myLevel), aiProfile: profileName });
  const ally = mk(decks[0], 'ally');
  const opps = [mk(decks[1], 'human'), mk(decks[2], 'human')];
  queueThen(1800 + Math.random() * 1500, `${opps[0].name} & ${opps[1].name}`, () => startBattle({ mode: '2v2', ally, opponents: opps, matchmaking: '2v2 queue' }));
}

let queueTimer = null;
function queueThen(ms, foundText, go) {
  show('screen-queue');
  $('#queueStatus').textContent = 'Searching for an opponent…';
  $('#queueFound').textContent = '';
  const start = performance.now();
  clearInterval(queueTimer);
  queueTimer = setInterval(() => {
    $('#queueTime').textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
  }, 100);
  setTimeout(() => {
    if (!$('#screen-queue').classList.contains('active')) return;
    clearInterval(queueTimer);
    $('#queueStatus').textContent = 'Opponent found!';
    $('#queueFound').textContent = foundText;
    setTimeout(() => { if ($('#screen-queue').classList.contains('active')) go(); }, 900);
  }, ms);
}

// ---------- Battle controller ----------
const battle = {
  match: null, brains: [], renderer: null, view: null, meta: null, raf: 0, last: 0, acc: 0,
};

function startBattle(meta) {
  const me = {
    name: profile.name, deck: profile.deck.slice(), levels: levelsOf(profile), stars: starsOf(profile), isHuman: true,
  };
  const side0 = [me];
  if (meta.ally) side0.push(meta.ally);
  const match = new Match({ mode: meta.mode, sides: [side0, meta.opponents] });
  battle.match = match;
  battle.meta = meta;
  // Match players are created in the same order as these configs.
  const cfgs = [...side0, ...meta.opponents];
  battle.brains = match.players.filter((p) => !p.isHuman).map((p) => new BotBrain(match, p.idx, cfgs[p.idx].aiProfile));
  battle.view = { playerIdx: 0, selectedCard: null, selectedHand: -1, hover: null };
  battle.renderer = battle.renderer || new Renderer($('#arena'));

  $('#oppName').textContent = meta.opponents.map((o) => o.name).join(' & ');
  $('#meName').textContent = meta.ally ? `${profile.name} & ${meta.ally.name}` : profile.name;
  $('#modeLabel').textContent = { ladder: 'Ladder', '2v2': '2v2', training: 'Training Camp', practice: 'Practice' }[meta.mode];
  show('screen-battle');
  layoutBattle();
  battle.last = performance.now();
  battle.acc = 0;
  cancelAnimationFrame(battle.raf);
  battle.raf = requestAnimationFrame(tick);
}

function layoutBattle() {
  if (!battle.renderer) return;
  const top = $('.battle-top').offsetHeight;
  const hud = $('.battle-hud').offsetHeight;
  const maxH = window.innerHeight - top - hud - 16;
  const maxW = Math.min(window.innerWidth - 16, 560);
  battle.renderer.resize(maxW, maxH);
}

const STEP = 1 / 30;
function tick(now) {
  const m = battle.match;
  if (!m) return;
  const dt = Math.min(0.25, (now - battle.last) / 1000);
  battle.last = now;
  battle.acc += dt;
  while (battle.acc >= STEP) {
    battle.acc -= STEP;
    for (const b of battle.brains) b.update(STEP);
    m.update(STEP);
    if (m.result) break;
  }
  battle.renderer.draw(m, battle.view);
  updateHud();
  if (m.result) {
    battle.raf = 0;
    setTimeout(() => endBattle(), 900);
    return;
  }
  battle.raf = requestAnimationFrame(tick);
}

function updateHud() {
  const m = battle.match, v = battle.view;
  const me = m.players[v.playerIdx];
  const t = Math.max(0, Math.ceil(m.time));
  $('#clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const mult = m.elixirMultiplier;
  $('#phase').textContent = m.phase === 'overtime' ? 'Overtime · Sudden Death · 3x Elixir' : mult === 2 ? '2x Elixir' : 'Regular time';
  $('#phase').className = 'phase' + (mult > 1 ? ' hot' : '');
  $('#crownsMe').textContent = '👑'.repeat(m.crowns[0]) || '—';
  $('#crownsOpp').textContent = '👑'.repeat(m.crowns[1]) || '—';

  $('#elixirFill').style.width = (me.elixir / ELIXIR.MAX) * 100 + '%';
  $('#elixirNum').textContent = Math.floor(me.elixir);

  const hand = $('#hand');
  if (!hand.children.length) {
    hand.innerHTML = [0, 1, 2, 3].map((i) => `<button class="hand-card" data-hand="${i}"><span class="hc-icon"></span><span class="hc-cost"></span><span class="hc-lv"></span><span class="hc-evo">EVO</span><span class="hc-fill"></span></button>`).join('');
  }
  me.hand.forEach((id, i) => {
    const el = hand.children[i];
    const c = CARDS[id];
    el.dataset.id = id;
    el.querySelector('.hc-icon').textContent = c.icon;
    el.querySelector('.hc-cost').textContent = c.cost;
    el.querySelector('.hc-lv').textContent = 'Lv' + (me.levels[id] || LEVELS.START);
    el.querySelector('.hc-evo').style.display = me.evoCards.has(id) ? '' : 'none';
    el.className = `hand-card rarity-${c.rarity}` + (v.selectedHand === i ? ' selected' : '') + (me.elixir < c.cost ? ' poor' : '') + (c.hero ? ' hero' : '');
    el.title = `${c.name} (${c.cost})`;
    el.querySelector('.hc-fill').style.height = Math.min(100, (me.elixir / c.cost) * 100) + '%';
  });
  if (v.selectedHand >= 0) v.selectedCard = me.hand[v.selectedHand];
  $('#nextCard').textContent = CARDS[me.queue[0]].icon;

  // Hero abilities
  const heroes = m.heroesOf(v.playerIdx);
  const key = heroes.map((h) => h.id).join(',');
  const abil = $('#abilities');
  if (abil.dataset.key !== key) {
    abil.dataset.key = key;
    abil.innerHTML = heroes.map((h) => {
      const ab = CARDS[h.defId].ability;
      return `<button class="ability" data-hero="${h.id}" title="${ab.desc}">${CARDS[h.defId].icon} ${ab.name} <b>${ab.cost}💧</b><span class="cd"></span></button>`;
    }).join('');
  }
  heroes.forEach((h) => {
    const b = abil.querySelector(`[data-hero="${h.id}"]`);
    if (!b) return;
    const ab = CARDS[h.defId].ability;
    const ready = h.deploying <= 0 && h.abilityCd <= 0 && me.elixir >= ab.cost;
    b.disabled = !ready;
    b.querySelector('.cd').textContent = h.abilityCd > 0 ? ` ${Math.ceil(h.abilityCd)}s` : (h.defId === 'bone_king' ? ` souls ${h.souls}` : '');
  });

  const s = m.sideStats[0];
  const net = s.valueDestroyed - s.valueLost;
  $('#trade').textContent = `${net >= 0 ? '+' : ''}${net.toFixed(1)}`;
  $('#trade').className = net >= 0 ? 'good' : 'bad';
}

function deployAt(clientX, clientY) {
  const v = battle.view, m = battle.match;
  if (!m || m.result || v.selectedHand < 0) return;
  const pos = battle.renderer.toTiles(clientX, clientY);
  if (!pos.inside) return;
  const r = m.deploy(v.playerIdx, v.selectedHand, pos.x, pos.y);
  if (r.ok) { v.selectedHand = -1; v.selectedCard = null; } else toast(r.reason);
}

function selectHand(i) {
  const v = battle.view;
  if (!battle.match) return;
  v.selectedHand = v.selectedHand === i ? -1 : i;
  v.selectedCard = v.selectedHand >= 0 ? battle.match.players[v.playerIdx].hand[i] : null;
}

function endBattle() {
  const m = battle.match;
  const meta = battle.meta;
  const res = m.result;
  const mySide = 0;
  const won = res.winnerSide === mySide;
  const draw = res.winnerSide === -1;
  const reasonText = {
    'three-crown': 'Three crowns — King Tower destroyed',
    crowns: 'More crowns at the end of regulation',
    'sudden-death': 'Sudden death — first tower down in overtime',
    tiebreaker: 'Tiebreaker — lowest tower HP loses',
    draw: 'Tiebreaker tied — draw',
    forfeit: 'Forfeit',
  }[res.reason];

  const rewards = { trophies: 0, gold: 0, stars: 0, cards: [] };
  if (meta.mode === 'ladder' || meta.mode === '2v2') {
    if (won) {
      if (meta.mode === 'ladder') rewards.trophies = MATCHMAKING.TROPHIES_WIN;
      rewards.gold = 300 + Math.floor(profile.trophies / 8) + res.crowns[mySide] * 60;
      rewards.stars = 40 + res.crowns[mySide] * 10;
      rewards.cards = rollCardRewards(meta.mode === 'ladder' ? 1 : 0.6);
      profile.record.wins++;
    } else if (draw) {
      profile.record.draws++;
      rewards.gold = 80;
    } else {
      if (meta.mode === 'ladder') rewards.trophies = -Math.min(profile.trophies, MATCHMAKING.TROPHIES_LOSS);
      profile.record.losses++;
    }
  } else if (meta.mode === 'training' && won) {
    rewards.gold = 50;
  }
  profile.trophies += rewards.trophies;
  profile.gold += rewards.gold;
  profile.starPoints += rewards.stars;
  rewards.cards.forEach((r) => { profile.cards[r.id].copies += r.n; });

  // A ladder opponent that beat you becomes a Practice Match with the same deck & levels.
  let practiceSaved = false;
  if (meta.mode === 'ladder' && !won && !draw) {
    const o = meta.opponents[0];
    profile.practice.unshift({ name: o.name, deck: o.deck, levels: o.levels, crowns: res.crowns, date: Date.now() });
    profile.practice = profile.practice.slice(0, 5);
    practiceSaved = true;
  }
  saveProfile();

  $('#resultTitle').textContent = won ? 'Victory!' : draw ? 'Draw' : 'Defeat';
  $('#resultTitle').className = won ? 'win' : draw ? '' : 'lose';
  $('#resultCrowns').innerHTML = `<span class="blue">${'👑'.repeat(res.crowns[0]) || '0'}</span> <span class="vs">vs</span> <span class="red">${'👑'.repeat(res.crowns[1]) || '0'}</span>`;
  $('#resultReason').textContent = reasonText;
  const statRow = (label, f) => `<tr><td>${label}</td><td>${f(m.sideStats[0])}</td><td>${f(m.sideStats[1])}</td></tr>`;
  $('#resultStats').innerHTML = `<tr><th></th><th>You${meta.ally ? ' (team)' : ''}</th><th>Opponent</th></tr>
    ${statRow('Elixir spent', (s) => s.spent.toFixed(0))}
    ${statRow('Elixir leaked at cap', (s) => s.leaked.toFixed(1))}
    ${statRow('Enemy elixir destroyed', (s) => s.valueDestroyed.toFixed(1))}
    ${statRow('Own elixir lost', (s) => s.valueLost.toFixed(1))}
    ${statRow('Net elixir trade', (s) => { const n = s.valueDestroyed - s.valueLost; return `<b class="${n >= 0 ? 'good' : 'bad'}">${n >= 0 ? '+' : ''}${n.toFixed(1)}</b>`; })}
    ${statRow('Tower damage dealt', (s) => fmt(s.towerDamage))}`;
  const rw = [];
  if (rewards.trophies) rw.push(`🏆 ${rewards.trophies > 0 ? '+' : ''}${rewards.trophies}`);
  if (rewards.gold) rw.push(`🪙 +${fmt(rewards.gold)}`);
  if (rewards.stars) rw.push(`✨ +${rewards.stars} Star Points`);
  rewards.cards.forEach((r) => rw.push(`${CARDS[r.id].icon} ${CARDS[r.id].name} ×${r.n}`));
  $('#resultRewards').innerHTML = rw.length ? rw.map((x) => `<span class="reward">${x}</span>`).join('') : '<span class="dim">No rewards in this mode.</span>';
  $('#resultNote').textContent = [
    meta.matchmaking ? `Matchmaker: ${meta.matchmaking}.` : '',
    practiceSaved ? `${meta.opponents[0].name}'s deck was saved to Practice Matches.` : '',
  ].join(' ');
  $('#btnRematch').style.display = meta.mode === 'training' || meta.mode === 'practice' ? '' : 'none';
  battle.match = null;
  show('screen-result');
}

function rollCardRewards(scale) {
  const pools = {};
  Object.keys(CARDS).forEach((id) => { (pools[CARDS[id].rarity] = pools[CARDS[id].rarity] || []).push(id); });
  const out = [];
  const add = (rarity, n) => { if (n > 0) out.push({ id: pick(pools[rarity]), n: Math.max(1, Math.round(n * scale)) }); };
  add('common', randInt(120, 260));
  add('common', randInt(120, 260));
  add('rare', randInt(30, 70));
  add('epic', randInt(3, 8));
  if (Math.random() < 0.15) add('legendary', 1);
  if (Math.random() < 0.08) add('champion', 1);
  return out;
}

// ---------- Wiring ----------
function bind() {
  $('#btnLadder').onclick = findLadderMatch;
  $('#btn2v2').onclick = find2v2Match;
  $('#btnTraining').onclick = () => { renderTraining(); show('screen-training'); };
  $('#btnPractice').onclick = () => { renderPractice(); show('screen-practice'); };
  $('#btnDeck').onclick = () => { deckSel = null; renderDeck(); show('screen-deck'); };
  $('#btnCollection').onclick = () => { renderCollection(); show('screen-collection'); };
  $$('[data-home]').forEach((b) => { b.onclick = () => { clearInterval(queueTimer); renderHome(); }; });

  $('#deckSlots').onclick = deckClick;
  $('#deckPool').onclick = deckClick;
  $('#deckFilter').onchange = renderDeck;
  $('#deckPreset').innerHTML = '<option value="">Load a preset…</option>' + BOT_DECKS.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
  $('#deckPreset').onchange = (e) => {
    if (e.target.value === '') return;
    profile.deck = BOT_DECKS[Number(e.target.value)].cards.slice();
    e.target.value = '';
    deckSel = null;
    saveProfile();
    renderDeck();
  };

  $('#colGrid').onclick = (e) => { const c = e.target.closest('.col-card'); if (c) openCardModal(c.dataset.id); };
  $('#modal').onclick = (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').classList.remove('open'); };
  $('#btnSandbox').onclick = () => {
    profile.gold += 100000;
    profile.starPoints += 2000;
    Object.keys(CARDS).forEach((id) => { profile.cards[id].copies += Math.ceil(RARITIES[CARDS[id].rarity].totalCopies * 0.2); });
    saveProfile();
    renderCollection();
    toast('Sandbox resources granted.');
  };
  $('#btnReset').onclick = () => {
    if (!confirm('Reset all progress?')) return;
    profile = newProfile();
    saveProfile();
    renderCollection();
    toast('Progress reset.');
  };

  $('#trainingList').onclick = (e) => {
    const b = e.target.closest('[data-train]');
    if (!b) return;
    const err = validateDeck(profile.deck);
    if (err) { toast(err); return; }
    const bot = TRAINING_BOTS[Number(b.dataset.train)];
    const deck = BOT_DECKS[bot.deckIndex].cards.slice();
    const levels = {};
    deck.forEach((id) => { levels[id] = bot.level; });
    startBattle({ mode: 'training', trainingIdx: Number(b.dataset.train), opponents: [{ name: bot.name, deck, levels, aiProfile: 'training' }] });
  };
  $('#practiceList').onclick = (e) => {
    const del = e.target.closest('[data-practice-del]');
    if (del) { profile.practice.splice(Number(del.dataset.practiceDel), 1); saveProfile(); renderPractice(); return; }
    const b = e.target.closest('[data-practice]');
    if (!b) return;
    const err = validateDeck(profile.deck);
    if (err) { toast(err); return; }
    const pr = profile.practice[Number(b.dataset.practice)];
    startBattle({ mode: 'practice', opponents: [{ name: pr.name + ' (Practice)', deck: pr.deck.slice(), levels: Object.assign({}, pr.levels), aiProfile: 'practice' }] });
  };

  $('#btnRematch').onclick = () => {
    const meta = battle.meta;
    startBattle(Object.assign({}, meta, { opponents: meta.opponents.map((o) => Object.assign({}, o)) }));
  };
  $('#btnResultHome').onclick = renderHome;

  // Battle input: tap/click a card then the arena, or drag a card onto the arena.
  $('#hand').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.hand-card');
    if (!b) return;
    e.preventDefault();
    selectHand(Number(b.dataset.hand));
    battle.dragging = battle.view.selectedHand >= 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (!battle.match) return;
    battle.view.hover = battle.renderer.toTiles(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => {
    if (!battle.match) return;
    const pos = battle.renderer.toTiles(e.clientX, e.clientY);
    if (pos.inside) deployAt(e.clientX, e.clientY);
    battle.dragging = false;
  });
  $('#abilities').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hero]');
    if (b && battle.match) battle.match.useAbility(battle.view.playerIdx, Number(b.dataset.hero));
  });
  $('#emoteBtn').onclick = () => $('#emotes').classList.toggle('open');
  $('#emotes').innerHTML = EMOTES.map((em) => `<button data-emote="${em}">${em}</button>`).join('');
  $('#emotes').onclick = (e) => {
    const b = e.target.closest('[data-emote]');
    if (b && battle.match) { battle.match.emote(battle.view.playerIdx, b.dataset.emote); $('#emotes').classList.remove('open'); }
  };
  $('#btnForfeit').onclick = () => {
    if (battle.match && confirm('Forfeit this match?')) battle.match.forfeit(0);
  };
  window.addEventListener('keydown', (e) => {
    if (!battle.match) return;
    if (e.key >= '1' && e.key <= '4') selectHand(Number(e.key) - 1);
    if (e.key === 'Escape') { battle.view.selectedHand = -1; battle.view.selectedCard = null; }
    if (e.key === 'a' || e.key === 'A') {
      const h = battle.match.heroesOf(battle.view.playerIdx)[0];
      if (h) battle.match.useAbility(battle.view.playerIdx, h.id);
    }
  });
  window.addEventListener('resize', () => { if (battle.match) layoutBattle(); });
}

bind();
renderHome();
