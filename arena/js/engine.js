// ============ Battle simulation ============
// Side 0 is the bottom half (the local player's side), side 1 is the top half.
// A side can hold one player (1v1) or two (2v2); players on a side share towers
// but each keeps their own elixir pool, deck and hand.

const RIVER_MID = (ARENA.RIVER_TOP + ARENA.RIVER_BOTTOM) / 2;
const DEFAULT_DEPLOY_TIME = 1;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function inRiverBand(y) {
  return y > ARENA.RIVER_TOP && y < ARENA.RIVER_BOTTOM;
}
function nearestBridge(x) {
  return Math.abs(x - ARENA.BRIDGES[0]) < Math.abs(x - ARENA.BRIDGES[1]) ? ARENA.BRIDGES[0] : ARENA.BRIDGES[1];
}
function onBridge(x) {
  return Math.abs(x - nearestBridge(x)) <= ARENA.BRIDGE_HALF;
}
// y coordinate measured `d` tiles from a side's own back edge
function sideY(side, d) {
  return side === 0 ? ARENA.H - d : d;
}

class Match {
  /**
   * opts.mode: 'ladder' | '2v2' | 'training' | 'practice'
   * opts.sides: [[playerConfig, ...], [playerConfig, ...]]
   * playerConfig: { name, deck: [8 ids], levels: {id: level}, stars: {id: n}, isHuman, aiProfile }
   */
  constructor(opts) {
    this.mode = opts.mode;
    this.time = CLOCK.REGULATION;
    this.phase = 'regular';
    this.elapsed = 0;
    this.nextId = 1;
    this.entities = [];
    this.projectiles = [];
    this.areas = [];
    this.rolls = [];
    this.delayed = [];
    this.fx = [];
    this.crowns = [0, 0];
    this.result = null;
    this.sideStats = [0, 1].map(() => ({ spent: 0, leaked: 0, valueDestroyed: 0, valueLost: 0, towerDamage: 0, plays: 0 }));

    this.players = [];
    opts.sides.forEach((cfgs, side) => {
      cfgs.forEach((cfg) => {
        const order = shuffle(cfg.deck);
        const evoCards = new Set(cfg.deck.filter((id, i) => isEvolvedSlot(cfg.deck, i)));
        this.players.push({
          idx: this.players.length,
          side,
          name: cfg.name,
          deck: cfg.deck.slice(),
          levels: cfg.levels,
          stars: cfg.stars || {},
          isHuman: !!cfg.isHuman,
          aiProfile: cfg.aiProfile || null,
          evoCards,
          elixir: ELIXIR.START,
          hand: order.slice(0, 4),
          queue: order.slice(4),
          emote: null,
        });
      });
    });

    // Tower level follows the average card level of the side's first player.
    [0, 1].forEach((side) => {
      const p = this.players.find((pl) => pl.side === side);
      const lv = Math.round(p.deck.reduce((s, id) => s + (p.levels[id] || LEVELS.START), 0) / p.deck.length);
      this.spawnTower(side, 'princess', 3.5, sideY(side, 6.5), 0, lv);
      this.spawnTower(side, 'princess', 14.5, sideY(side, 6.5), 1, lv);
      this.spawnTower(side, 'king', 9, sideY(side, 3), -1, lv);
    });
  }

  // ---------- Queries ----------
  get elixirMultiplier() {
    if (this.phase === 'overtime') return 3;
    if (this.time <= CLOCK.DOUBLE_ELIXIR_AT) return 2;
    return 1;
  }
  towers(side) {
    return this.entities.filter((e) => e.kind === 'tower' && e.side === side && !e.dead);
  }
  princessAlive(side, lane) {
    return this.entities.some((e) => e.kind === 'tower' && e.side === side && e.lane === lane && !e.dead);
  }
  kingTower(side) {
    return this.entities.find((e) => e.kind === 'tower' && e.side === side && e.isKing);
  }
  enemiesOf(side) {
    return this.entities.filter((e) => e.side !== side && !e.dead);
  }
  playersOn(side) {
    return this.players.filter((p) => p.side === side);
  }

  // ---------- Spawning ----------
  spawnTower(side, type, x, y, lane, level) {
    const t = TOWERS[type];
    const e = this.baseEntity({
      kind: 'tower', defId: type, side, owner: -1, x, y, level,
      hp: statAt(t.hp, level), dmg: statAt(t.dmg, level), hitSpeed: t.hitSpeed, range: t.range,
      targets: 'all', radius: t.radius, mass: Infinity, speed: 0,
    });
    e.isKing = type === 'king';
    e.active = !e.isKing; // King Tower stays dormant until it takes damage
    e.lane = lane;
    this.entities.push(e);
    return e;
  }

  baseEntity(props) {
    return Object.assign({
      id: this.nextId++, cd: 0, target: null, retarget: 0, deploying: 0, stun: 0,
      slowT: 0, slowAmt: 0, flash: 0, dead: false, moving: false, flying: false,
      value: 0, evo: false, star: 0, cloak: 0, dash: null, abilityCd: 0, souls: 0, groupId: 0,
      anim: Math.random() * 10, hitFx: 0,
    }, props, { maxHp: props.hp });
  }

  // Spawns `def` units (card or token) around (x, y).
  spawnUnits(defId, side, owner, x, y, level, opts = {}) {
    const def = cardDef(defId);
    const count = opts.count || def.count || 1;
    const spawned = [];
    const groupId = this.nextId;
    for (let i = 0; i < count; i++) {
      let ox = 0, oy = 0;
      if (count > 1) {
        const a = (i / count) * Math.PI * 2 + (side ? Math.PI : 0);
        const r = opts.spread || (count > 4 ? 1.2 : 0.7);
        ox = Math.cos(a) * r;
        oy = Math.sin(a) * r;
      }
      const isBuilding = def.type === 'building';
      const range = def.range + (opts.evo && defId === 'archers' ? 1.5 : 0);
      const e = this.baseEntity({
        kind: isBuilding ? 'building' : 'troop',
        defId, cardId: opts.cardId || defId, side, owner, level,
        x: clamp(x + ox, 0.5, ARENA.W - 0.5), y: clamp(y + oy, 0.5, ARENA.H - 0.5),
        hp: statAt(def.hp, level), dmg: statAt(def.dmg, level), hitSpeed: def.hitSpeed, range,
        speed: def.speed || 0, targets: def.targets, flying: !!def.flying, radius: def.radius,
        mass: isBuilding ? Infinity : def.mass, sight: Math.max(5.5, range + 1),
        deploying: opts.deployTime != null ? opts.deployTime : (def.deployTime || DEFAULT_DEPLOY_TIME),
        lifetime: def.lifetime || 0, evo: !!opts.evo, value: opts.value != null ? opts.value : 0,
        star: opts.star || 0, groupId: opts.groupId || groupId,
      });
      if (def.hero) e.hero = true;
      this.confine(e);
      this.entities.push(e);
      spawned.push(e);
    }
    return spawned;
  }

  // ---------- Player actions ----------
  canDeployAt(pIdx, cardId, x, y) {
    const p = this.players[pIdx];
    const def = CARDS[cardId];
    if (x < 0.5 || x > ARENA.W - 0.5 || y < 0.5 || y > ARENA.H - 0.5) return false;
    if (def.type === 'spell') return true;
    if (y > ARENA.RIVER_TOP - 0.5 && y < ARENA.RIVER_BOTTOM + 0.5) return false;
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'tower' && dist(x, y, e.x, e.y) < e.radius + 0.4) return false;
      if (def.type === 'building' && e.kind === 'building' && dist(x, y, e.x, e.y) < e.radius + def.radius) return false;
    }
    const own = p.side === 0 ? y >= ARENA.RIVER_BOTTOM : y <= ARENA.RIVER_TOP;
    if (own) return true;
    if (def.type !== 'troop') return false;
    // Pocket: after taking a Princess Tower, troops can be dropped deeper in that lane.
    const lane = x < ARENA.W / 2 ? 0 : 1;
    if (this.princessAlive(1 - p.side, lane)) return false;
    return p.side === 0 ? y >= 11 : y <= ARENA.H - 11;
  }

  deploy(pIdx, handIdx, x, y) {
    if (this.result) return { ok: false, reason: 'Match over' };
    const p = this.players[pIdx];
    const cardId = p.hand[handIdx];
    const def = CARDS[cardId];
    if (!def) return { ok: false, reason: 'No card' };
    if (p.elixir < def.cost) return { ok: false, reason: 'Not enough elixir' };
    if (!this.canDeployAt(pIdx, cardId, x, y)) return { ok: false, reason: 'Can\'t deploy there' };

    p.elixir -= def.cost;
    this.sideStats[p.side].spent += def.cost;
    this.sideStats[p.side].plays++;
    p.hand[handIdx] = p.queue.shift();
    p.queue.push(cardId);

    const level = p.levels[cardId] || LEVELS.START;
    const evo = p.evoCards.has(cardId);
    const star = p.stars[cardId] || 0;

    if (def.type === 'spell') {
      this.castSpell(p, cardId, x, y, level);
    } else {
      let count = def.count || 1;
      if (evo && cardId === 'skeletons') count = 4;
      // Elixir value per unit, excluding value carried by death spawns.
      let value = def.cost;
      if (def.deathSpawn) value -= def.deathSpawn.count * TOKENS[def.deathSpawn.id].cost;
      this.spawnUnits(cardId, p.side, p.idx, x, y, level, { count, evo, star, value: value / count, cardId });
    }
    this.fx.push({ type: 'deploy', x, y, t: 0, life: 0.5, side: p.side, radius: def.spell ? (def.spell.radius || 1.5) : 1 });
    return { ok: true, cardId };
  }

  useAbility(pIdx, entityId) {
    const p = this.players[pIdx];
    const e = this.entities.find((en) => en.id === entityId);
    if (!e || e.dead || e.owner !== pIdx || e.deploying > 0) return false;
    const ab = CARDS[e.defId] && CARDS[e.defId].ability;
    if (!ab || e.abilityCd > 0 || p.elixir < ab.cost) return false;
    p.elixir -= ab.cost;
    this.sideStats[p.side].spent += ab.cost;
    e.abilityCd = ab.cooldown;
    if (e.defId === 'gilded_knight') {
      e.dash = { hops: 0, timer: 0, hit: new Set() };
    } else if (e.defId === 'huntress_queen') {
      e.cloak = 3.5;
      e.target = null;
      this.entities.forEach((o) => { if (o.target === e) o.target = null; });
    } else if (e.defId === 'bone_king') {
      const n = 6 + e.souls;
      e.souls = 0;
      this.spawnUnits('skeleton', e.side, e.owner, e.x, e.y, e.level, { count: n, deployTime: 0.3, value: 0, spread: 1.6 });
    }
    this.fx.push({ type: 'ability', x: e.x, y: e.y, t: 0, life: 0.8, side: e.side });
    return true;
  }

  heroesOf(pIdx) {
    return this.entities.filter((e) => !e.dead && e.owner === pIdx && e.hero);
  }

  emote(pIdx, emoji) {
    this.players[pIdx].emote = { emoji, t: 2.5 };
  }

  forfeit(side) {
    if (this.result) return;
    this.crowns[1 - side] = 3;
    this.finish(1 - side, 'forfeit');
  }

  // ---------- Spells ----------
  castSpell(p, cardId, x, y, level) {
    const s = CARDS[cardId].spell;
    const dmg = statAt(s.dmg, level);
    const base = { side: p.side, owner: p.idx, x, y, dmg, cardId, level, spell: s };
    if (s.kind === 'instant') {
      this.spellImpact(base);
    } else if (s.kind === 'projectile') {
      const king = this.kingTower(p.side);
      const d = dist(king.x, king.y, x, y);
      this.projectiles.push({
        x: king.x, y: king.y, tx: x, ty: y, speed: s.travelSpeed, spellHit: base, icon: CARDS[cardId].icon,
        arc: true, total: d, side: p.side,
      });
    } else if (s.kind === 'area') {
      this.areas.push(Object.assign({ remaining: s.duration, tick: 0 }, base));
    } else if (s.kind === 'roll') {
      const dir = p.side === 0 ? -1 : 1;
      this.rolls.push(Object.assign({ dir, travelled: 0, hit: new Set(), y0: y }, base));
    }
  }

  spellImpact(h) {
    const s = h.spell;
    if (s.radius > 0) {
      for (const e of this.enemiesOf(h.side)) {
        if (e.cloak > 0 && e.kind === 'troop') continue;
        if (dist(e.x, e.y, h.x, h.y) > s.radius + e.radius * 0.5) continue;
        this.damage(e, h.dmg, h.side, { spell: s });
        if (s.stun) this.stunUnit(e, s.stun);
        if (s.knockback && e.kind === 'troop') this.knock(e, h.x, h.y, s.knockback);
      }
    }
    if (s.spawn) {
      this.spawnUnits(s.spawn.id, h.side, h.owner, h.x, h.y, h.level, {
        count: s.spawn.count, deployTime: 0.4, value: CARDS[h.cardId].cost / s.spawn.count, cardId: h.cardId,
      });
    }
    this.fx.push({ type: 'blast', x: h.x, y: h.y, t: 0, life: 0.45, radius: s.radius || 1, cardId: h.cardId });
  }

  stunUnit(e, t) {
    if (e.kind === 'tower' && !e.active) return;
    e.stun = Math.max(e.stun, t);
    e.cd = Math.max(e.cd, e.hitSpeed * 0.5); // stun resets the attack wind-up
  }

  knock(e, fromX, fromY, amount) {
    if (e.mass >= MASS.heavy || e.dash) return;
    const d = dist(e.x, e.y, fromX, fromY) || 0.01;
    const f = amount * (e.mass <= MASS.light ? 1 : 0.5);
    const prevY = e.y;
    e.x += ((e.x - fromX) / d) * f;
    e.y += ((e.y - fromY) / d) * f;
    this.confine(e, prevY);
  }

  // ---------- Damage & death ----------
  damage(t, amount, attackerSide, opts = {}) {
    if (t.dead || t.dash) return;
    if (t.kind === 'tower' && opts.spell) amount *= opts.spell.crownPct;
    if (t.evo && t.defId === 'knight' && t.moving) amount *= 0.4;
    amount = Math.max(1, Math.round(amount));
    t.hp -= amount;
    t.flash = 0.12;
    if (t.kind === 'tower') {
      this.sideStats[attackerSide].towerDamage += Math.min(amount, amount + t.hp);
      if (t.isKing && !t.active) {
        t.active = true;
        this.fx.push({ type: 'kingWake', x: t.x, y: t.y, t: 0, life: 1.2, side: t.side });
      }
    }
    if (t.hp <= 0) this.kill(t, attackerSide);
  }

  kill(t, killerSide) {
    if (t.dead) return;
    t.dead = true;
    t.hp = 0;
    this.fx.push({ type: 'death', x: t.x, y: t.y, t: 0, life: 0.5, radius: t.radius, side: t.side });

    if (t.kind === 'tower') {
      if (t.isKing) {
        this.crowns[1 - t.side] = 3;
        this.finish(1 - t.side, 'three-crown');
      } else {
        this.crowns[1 - t.side] = Math.min(3, this.crowns[1 - t.side] + 1);
        if (this.phase === 'overtime') this.finish(1 - t.side, 'sudden-death');
      }
      return;
    }

    // Buildings that simply expire (no killer) aren't counted as a lost trade.
    if (killerSide != null && killerSide !== t.side) {
      this.sideStats[killerSide].valueDestroyed += t.value;
      this.sideStats[t.side].valueLost += t.value;
    }

    // Bone Kings harvest souls from any troop that falls nearby.
    if (t.kind === 'troop') {
      for (const k of this.entities) {
        if (!k.dead && k.defId === 'bone_king' && k !== t && dist(k.x, k.y, t.x, t.y) < 6) k.souls = Math.min(10, k.souls + 1);
      }
    }

    const def = cardDef(t.defId);
    if (def.deathDamage) {
      const dd = statAt(def.deathDamage.dmg, t.level);
      for (const e of this.enemiesOf(t.side)) {
        if (!e.flying && dist(e.x, e.y, t.x, t.y) <= def.deathDamage.radius + e.radius * 0.5) this.damage(e, dd, t.side);
      }
      this.fx.push({ type: 'blast', x: t.x, y: t.y, t: 0, life: 0.4, radius: def.deathDamage.radius });
    }
    if (def.deathSpawn) {
      this.spawnUnits(def.deathSpawn.id, t.side, t.owner, t.x, t.y, t.level, {
        count: def.deathSpawn.count, deployTime: 0.25, value: TOKENS[def.deathSpawn.id].cost, star: t.star,
      });
    }
  }

  finish(winnerSide, reason) {
    if (this.result) return;
    this.result = { winnerSide, reason, crowns: this.crowns.slice() };
  }

  // ---------- Targeting ----------
  canTarget(e, o) {
    if (o.dead || o.side === e.side || o.deploying > 0) return false;
    if (o.cloak > 0) return false;
    if (e.targets === 'buildings') return o.kind === 'building' || o.kind === 'tower';
    if (e.targets === 'ground' && o.flying) return false;
    if (o.kind === 'tower' && o.isKing && !o.active && e.kind === 'tower') return false;
    return true;
  }

  // Walking distance, detouring over a bridge if the river is in the way.
  pathDist(e, x, y) {
    if (e.flying || cardDef(e.defId).jumpsRiver || (e.y < RIVER_MID) === (y < RIVER_MID)) return dist(e.x, e.y, x, y);
    const bx = this.pickBridge(e.x, x);
    return dist(e.x, e.y, bx, RIVER_MID) + dist(bx, RIVER_MID, x, y);
  }

  pickBridge(fromX, toX) {
    const [a, b] = ARENA.BRIDGES;
    return Math.abs(fromX - a) + Math.abs(toX - a) <= Math.abs(fromX - b) + Math.abs(toX - b) ? a : b;
  }

  inRange(e, o) {
    return dist(e.x, e.y, o.x, o.y) - o.radius - e.radius * 0.5 <= e.range;
  }

  acquire(e) {
    let best = null, bestD = Infinity;
    const fixed = e.kind !== 'troop'; // buildings & towers only shoot what's in range
    for (const o of this.entities) {
      if (!this.canTarget(e, o)) continue;
      if (fixed) {
        if (e.kind === 'tower' && o.kind === 'tower') continue;
        if (!this.inRange(e, o)) continue;
        const d = dist(e.x, e.y, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
        continue;
      }
      const isStructure = o.kind === 'building' || o.kind === 'tower';
      const d = this.pathDist(e, o.x, o.y);
      // Troops lock onto anything within sight; otherwise they march to the nearest structure.
      const within = e.targets === 'buildings' || d - o.radius <= e.sight;
      if (!within && !isStructure) continue;
      const score = within && !isStructure ? d - 100 : d; // prefer nearby troops over distant towers
      if (score < bestD) { bestD = score; best = o; }
    }
    return best;
  }

  // ---------- Simulation ----------
  update(dt) {
    if (this.result) return;
    this.elapsed += dt;
    this.time -= dt;

    if (this.phase === 'regular' && this.time <= 0) {
      if (this.crowns[0] !== this.crowns[1]) {
        this.finish(this.crowns[0] > this.crowns[1] ? 0 : 1, 'crowns');
        return;
      }
      this.phase = 'overtime';
      this.time = CLOCK.OVERTIME;
      this.fx.push({ type: 'banner', text: 'OVERTIME — Sudden Death!', t: 0, life: 2.5 });
    } else if (this.phase === 'overtime' && this.time <= 0) {
      this.time = 0;
      this.tiebreak();
      return;
    }

    const rate = (1 / ELIXIR.SECONDS_PER_ELIXIR) * this.elixirMultiplier;
    for (const p of this.players) {
      const before = p.elixir;
      p.elixir = Math.min(ELIXIR.MAX, p.elixir + rate * dt);
      if (before >= ELIXIR.MAX) this.sideStats[p.side].leaked += rate * dt;
      if (p.emote && (p.emote.t -= dt) <= 0) p.emote = null;
    }

    for (const e of this.entities) if (!e.dead) this.updateEntity(e, dt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateRolls(dt);
    for (const d of this.delayed) d.t -= dt;
    for (const d of this.delayed.filter((x) => x.t <= 0)) d.fn();
    this.delayed = this.delayed.filter((x) => x.t > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    this.entities = this.entities.filter((e) => !e.dead || e.kind === 'tower');
  }

  tiebreak() {
    const lowest = [0, 1].map((side) => {
      const ts = this.towers(side);
      return ts.length ? Math.min(...ts.map((t) => t.hp)) : 0;
    });
    if (lowest[0] === lowest[1]) this.finish(-1, 'draw');
    else this.finish(lowest[0] < lowest[1] ? 1 : 0, 'tiebreaker');
  }

  updateEntity(e, dt) {
    e.anim += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.hitFx > 0) e.hitFx -= dt;
    if (e.deploying > 0) { e.deploying -= dt; return; }
    if (e.abilityCd > 0) e.abilityCd -= dt;
    if (e.cloak > 0) e.cloak -= dt;
    if (e.slowT > 0) e.slowT -= dt; else e.slowAmt = 0;
    if (e.kind === 'building') {
      e.hp -= (e.maxHp / e.lifetime) * dt; // buildings decay over their lifetime
      if (e.hp <= 0) { this.kill(e, null); return; }
    }
    if (e.dash) { this.updateDash(e, dt); return; }
    if (e.stun > 0) { e.stun -= dt; e.moving = false; return; }
    if (e.kind === 'tower' && !e.active) return;
    if (e.cd > 0) e.cd -= dt * (1 - e.slowAmt);

    // Keep a target while it's in range; otherwise re-evaluate a few times a second.
    const t = e.target;
    const locked = t && !t.dead && this.canTarget(e, t) && this.inRange(e, t);
    if (!locked) {
      e.retarget -= dt;
      if (e.retarget <= 0 || !t || t.dead || !this.canTarget(e, t)) {
        const prev = e.target;
        e.target = this.acquire(e);
        e.retarget = 0.25;
        if (e.target !== prev && e.cd < e.hitSpeed * 0.4) e.cd = e.hitSpeed * 0.4; // first-hit wind-up
      }
    }
    const target = e.target;
    if (!target) { e.moving = false; return; }

    if (this.inRange(e, target)) {
      e.moving = false;
      if (e.cd <= 0) {
        this.attack(e, target);
        let hs = e.hitSpeed;
        if (e.cloak > 0) hs *= 0.36;
        e.cd = hs;
      }
    } else if (e.kind === 'troop') {
      this.moveToward(e, target, dt);
    }
  }

  moveToward(e, target, dt) {
    let wx = target.x, wy = target.y;
    const def = cardDef(e.defId);
    if (!e.flying && !def.jumpsRiver) {
      const eNorth = e.y < RIVER_MID;
      const tNorth = target.y < RIVER_MID;
      if (inRiverBand(e.y)) {
        wx = nearestBridge(e.x);
        wy = tNorth ? ARENA.RIVER_TOP - 0.6 : ARENA.RIVER_BOTTOM + 0.6;
      } else if (eNorth !== tNorth) {
        const bx = this.pickBridge(e.x, target.x);
        const nearEdge = eNorth ? ARENA.RIVER_TOP - 0.4 : ARENA.RIVER_BOTTOM + 0.4;
        const farEdge = eNorth ? ARENA.RIVER_BOTTOM + 0.6 : ARENA.RIVER_TOP - 0.6;
        if (Math.abs(e.x - bx) < 0.45 && Math.abs(e.y - nearEdge) < 1.2) { wx = bx; wy = farEdge; }
        else { wx = bx; wy = nearEdge; }
      }
    }
    const d = dist(e.x, e.y, wx, wy);
    if (d < 0.01) return;
    const step = Math.min(d, e.speed * (1 - e.slowAmt) * dt);
    const prevY = e.y;
    e.x += ((wx - e.x) / d) * step;
    e.y += ((wy - e.y) / d) * step;
    e.facing = Math.atan2(wy - prevY, wx - e.x);
    e.moving = true;
    this.confine(e, prevY);
  }

  // Keep units inside the arena and out of the water (except on bridges).
  // `prevY` is where the unit stood before this move; omit it for spawns/teleports.
  confine(e, prevY) {
    e.x = clamp(e.x, 0.4, ARENA.W - 0.4);
    e.y = clamp(e.y, 0.4, ARENA.H - 0.4);
    if (e.flying || cardDef(e.defId).jumpsRiver || !inRiverBand(e.y) || onBridge(e.x)) return;
    if (prevY != null && inRiverBand(prevY)) {
      const bx = nearestBridge(e.x);
      e.x = clamp(e.x, bx - ARENA.BRIDGE_HALF, bx + ARENA.BRIDGE_HALF);
    } else {
      const ref = prevY != null ? prevY : e.y;
      e.y = ref < RIVER_MID ? ARENA.RIVER_TOP : ARENA.RIVER_BOTTOM;
    }
  }

  separate() {
    const list = this.entities.filter((e) => !e.dead && e.deploying <= 0);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (a.flying !== b.flying) continue;
        if (a.mass === Infinity && b.mass === Infinity) continue;
        const r = a.radius + b.radius;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 0.01;
        const overlap = (r - d) * 0.5;
        const ia = a.mass === Infinity ? 0 : 1 / a.mass;
        const ib = b.mass === Infinity ? 0 : 1 / b.mass;
        const sum = ia + ib;
        if (!sum) continue;
        const nx = dx / d, ny = dy / d;
        const ay = a.y, by = b.y;
        a.x -= nx * overlap * 2 * (ia / sum);
        a.y -= ny * overlap * 2 * (ia / sum);
        b.x += nx * overlap * 2 * (ib / sum);
        b.y += ny * overlap * 2 * (ib / sum);
        if (ia) this.confine(a, ay);
        if (ib) this.confine(b, by);
      }
    }
  }

  attack(e, t) {
    const def = e.kind === 'tower' ? null : cardDef(e.defId);
    e.hitFx = 0.15;
    let dmg = e.dmg;
    if (e.evo && e.defId === 'archers' && dist(e.x, e.y, t.x, t.y) > 4) dmg *= 1.5;

    if (e.kind === 'tower' || e.range >= 2 || (def && def.boomerang)) {
      this.projectiles.push({
        x: e.x, y: e.y, target: t, tx: t.x, ty: t.y, speed: e.kind === 'tower' ? 16 : 12,
        dmg, side: e.side, source: e, color: e.side === 0 ? '#7cc4ff' : '#ff8a7c',
        boomerang: def && def.boomerang, chain: def && def.chain,
      });
    } else {
      this.hit(e, t, dmg, t.x, t.y);
    }

    if (e.evo && e.defId === 'siege_giant') {
      for (const o of this.enemiesOf(e.side)) {
        if (o.kind === 'troop' && !o.flying && dist(o.x, o.y, e.x, e.y) < 2.5) {
          this.damage(o, e.dmg * 0.25, e.side);
          this.knock(o, e.x, e.y, 1);
        }
      }
      this.fx.push({ type: 'blast', x: e.x, y: e.y, t: 0, life: 0.3, radius: 2.5 });
    }
  }

  // Resolve a landed attack from `e` (may be dead by now) on target `t` at (x, y).
  hit(e, t, dmg, x, y) {
    const def = e.kind === 'tower' ? null : cardDef(e.defId);
    if (def && def.splash) {
      const cx = def.splashAroundSelf ? e.x : x;
      const cy = def.splashAroundSelf ? e.y : y;
      for (const o of this.enemiesOf(e.side)) {
        if (o.cloak > 0 && o !== t) continue;
        if (e.targets === 'ground' && o.flying) continue;
        if (dist(o.x, o.y, cx, cy) <= def.splash + o.radius * 0.5) this.damage(o, dmg, e.side);
      }
      if (e.evo && e.defId === 'valkyrie') {
        for (const o of this.enemiesOf(e.side)) {
          if (o.kind !== 'troop' || o.flying || o.mass >= MASS.heavy) continue;
          const d = dist(o.x, o.y, e.x, e.y);
          if (d < 3 && d > 0.6) {
            const pull = Math.min(1, d - 0.6) * (o.mass <= MASS.light ? 1 : 0.5);
            const prevY = o.y;
            o.x += ((e.x - o.x) / d) * pull;
            o.y += ((e.y - o.y) / d) * pull;
            this.confine(o, prevY);
          }
        }
        this.fx.push({ type: 'swirl', x: e.x, y: e.y, t: 0, life: 0.5, radius: 3 });
      }
      this.fx.push({ type: 'blast', x: cx, y: cy, t: 0, life: 0.25, radius: def.splash });
    } else if (def && def.chain) {
      const hitSet = new Set();
      let cur = t, px = e.x, py = e.y;
      for (let i = 0; i < def.chain && cur; i++) {
        hitSet.add(cur);
        this.damage(cur, dmg, e.side);
        this.stunUnit(cur, def.stun || 0);
        this.fx.push({ type: 'bolt', x: px, y: py, x2: cur.x, y2: cur.y, t: 0, life: 0.25 });
        px = cur.x; py = cur.y;
        let next = null, nd = 4;
        for (const o of this.enemiesOf(e.side)) {
          if (hitSet.has(o) || o.cloak > 0 || o.deploying > 0) continue;
          const d = dist(o.x, o.y, px, py);
          if (d < nd) { nd = d; next = o; }
        }
        cur = next;
      }
    } else if (!t.dead) {
      this.damage(t, dmg, e.side);
    }

    // Evolved Skeletons multiply on hit.
    if (e.evo && e.defId === 'skeletons' && !e.dead) {
      const alive = this.entities.filter((o) => !o.dead && o.groupId === e.groupId).length;
      if (alive < 8) {
        const [s] = this.spawnUnits('skeleton', e.side, e.owner, e.x + (Math.random() - 0.5), e.y + (Math.random() - 0.5), e.level, {
          count: 1, deployTime: 0, value: 0, groupId: e.groupId, star: e.star,
        });
        s.evo = true;
        s.defId = 'skeletons';
      }
    }
  }

  updateDash(e, dt) {
    const dash = e.dash;
    dash.timer -= dt;
    if (dash.timer > 0) return;
    let best = null, bd = 5.5;
    for (const o of this.enemiesOf(e.side)) {
      if (o.kind === 'tower' || o.cloak > 0 || o.deploying > 0 || dash.hit.has(o)) continue;
      const d = dist(o.x, o.y, e.x, e.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best || dash.hops >= 10) { e.dash = null; e.cd = 0.3; return; }
    dash.hit.add(best);
    dash.hops++;
    dash.timer = 0.18;
    this.fx.push({ type: 'dash', x: e.x, y: e.y, x2: best.x, y2: best.y, t: 0, life: 0.3 });
    const prevY = e.y;
    e.x = best.x - Math.sign(best.x - e.x) * 0.3;
    e.y = best.y - Math.sign(best.y - e.y) * 0.3;
    this.confine(e, prevY);
    this.damage(best, statAt(310, e.level), e.side);
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      if (pr.target && !pr.target.dead) { pr.tx = pr.target.x; pr.ty = pr.target.y; }
      const d = dist(pr.x, pr.y, pr.tx, pr.ty);
      const step = pr.speed * dt;
      if (d <= step) {
        pr.done = true;
        if (pr.spellHit) this.spellImpact(pr.spellHit);
        else this.landProjectile(pr);
      } else {
        pr.x += ((pr.tx - pr.x) / d) * step;
        pr.y += ((pr.ty - pr.y) / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  landProjectile(pr) {
    const src = pr.source;
    const t = pr.target;
    if (src.kind === 'tower') {
      if (!t.dead) this.damage(t, pr.dmg, pr.side);
      return;
    }
    if (t.dead && !cardDef(src.defId).splash) return;
    this.hit(src, t, pr.dmg, pr.tx, pr.ty);
    if (pr.boomerang) {
      // The axe swings back through the same area a moment later.
      const x = pr.tx, y = pr.ty;
      this.delayed.push({ t: 0.5, fn: () => {
        for (const o of this.enemiesOf(pr.side)) {
          if (o.cloak > 0) continue;
          if (dist(o.x, o.y, x, y) <= 1 + o.radius * 0.5) this.damage(o, pr.dmg, pr.side);
        }
        this.fx.push({ type: 'blast', x, y, t: 0, life: 0.25, radius: 1 });
      } });
    }
  }

  updateAreas(dt) {
    for (const a of this.areas) {
      a.remaining -= dt;
      const s = a.spell;
      const frac = dt / s.duration;
      for (const e of this.enemiesOf(a.side)) {
        if (e.deploying > 0) continue;
        const d = dist(e.x, e.y, a.x, a.y);
        if (d > s.radius + e.radius * 0.5) continue;
        this.damage(e, a.dmg * frac, a.side, { spell: s });
        if (s.slow) { e.slowAmt = s.slow; e.slowT = 0.2; }
        if (s.pull && e.kind === 'troop' && d > 0.2) {
          const resist = e.mass >= MASS.heavy ? 0.15 : e.mass >= MASS.medium ? 0.6 : 1;
          const step = Math.min(d, (s.pull / s.duration) * dt * resist);
          const prevY = e.y;
          e.x += ((a.x - e.x) / d) * step;
          e.y += ((a.y - e.y) / d) * step;
          this.confine(e, prevY);
        }
      }
    }
    this.areas = this.areas.filter((a) => a.remaining > 0);
  }

  updateRolls(dt) {
    for (const r of this.rolls) {
      const s = r.spell;
      r.travelled += s.rollSpeed * dt;
      r.y = r.y0 + r.dir * r.travelled;
      for (const e of this.enemiesOf(r.side)) {
        if (e.flying || r.hit.has(e) || e.deploying > 0) continue;
        if (Math.abs(e.x - r.x) > s.width / 2 + e.radius * 0.5) continue;
        if (Math.abs(e.y - r.y) > 0.8 + e.radius) continue;
        r.hit.add(e);
        this.damage(e, r.dmg, r.side, { spell: s });
        if (e.kind === 'troop') this.knock(e, e.x, e.y - r.dir, s.knockback);
      }
      if (r.travelled >= s.length || r.y < 0 || r.y > ARENA.H) r.done = true;
    }
    this.rolls = this.rolls.filter((r) => !r.done);
  }
}
