// ============ Bot brains ============
// Profiles:
//  training  – Training Camp: slow, predictable, makes plenty of mistakes.
//  human     – Ladder opponents/allies meant to feel like real players.
//  practice  – Replays a deck that beat you; plays sharply.
//  scripted  – Matchmaking fallback bot: rigid patterns, flawless timing, canned emotes.

const AI_PROFILES = {
  training: { reaction: [1.8, 3.0], mistake: 0.3, attackAt: 8, spellSense: 0.4, emotes: 'none' },
  human:    { reaction: [0.7, 1.6], mistake: 0.1, attackAt: 7, spellSense: 0.8, emotes: 'random' },
  practice: { reaction: [0.5, 1.1], mistake: 0.05, attackAt: 7, spellSense: 0.9, emotes: 'none' },
  scripted: { reaction: [0.1, 0.1], mistake: 0, attackAt: 10, spellSense: 1, emotes: 'scripted', rigid: true },
  ally:     { reaction: [0.8, 1.5], mistake: 0.08, attackAt: 8, spellSense: 0.8, emotes: 'none' },
};

// Canned emote script the fallback bot runs regardless of what happens.
const SCRIPTED_EMOTES = [
  { at: 2, emoji: '👍' }, { at: 4, emoji: '😀' }, { at: 60, emoji: '😂' },
  { at: 61.2, emoji: '😂' }, { at: 120, emoji: '👍' }, { at: 175, emoji: '😀' },
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

class BotBrain {
  constructor(match, pIdx, profileName) {
    this.m = match;
    this.p = match.players[pIdx];
    this.profile = AI_PROFILES[profileName] || AI_PROFILES.human;
    this.timer = rand(1, 2);
    this.pendingSupport = null;
    this.emoteIdx = 0;
    this.lastCrowns = [0, 0];
  }

  // Local depth: distance from this bot's own back edge.
  d(y) { return this.p.side === 0 ? ARENA.H - y : y; }
  y(d) { return sideY(this.p.side, d); }

  update(dt) {
    if (this.m.result) return;
    this.runEmotes();
    this.timer -= dt;
    if (this.timer > 0) return;
    const [a, b] = this.profile.reaction;
    this.timer = rand(a, b);
    this.think();
  }

  runEmotes() {
    const mode = this.profile.emotes;
    if (mode === 'scripted') {
      const next = SCRIPTED_EMOTES[this.emoteIdx];
      if (next && this.m.elapsed >= next.at) {
        this.m.emote(this.p.idx, next.emoji);
        this.emoteIdx++;
      }
    } else if (mode === 'random') {
      const mine = this.m.crowns[this.p.side], theirs = this.m.crowns[1 - this.p.side];
      if (mine > this.lastCrowns[0]) this.m.emote(this.p.idx, Math.random() < 0.5 ? '😂' : '👍');
      else if (theirs > this.lastCrowns[1]) this.m.emote(this.p.idx, Math.random() < 0.5 ? '😢' : '😡');
      this.lastCrowns = [mine, theirs];
    }
  }

  affordable(filter) {
    return this.p.hand
      .map((id, i) => ({ id, i, def: CARDS[id] }))
      .filter((c) => c.def.cost <= this.p.elixir && (!filter || filter(c.def, c.id)));
  }

  play(handIdx, x, y) {
    const r = this.m.deploy(this.p.idx, handIdx, x, y);
    return r.ok;
  }

  // Try a few nudged positions until one is legal.
  playNear(handIdx, x, y) {
    const id = this.p.hand[handIdx];
    const tries = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [1.5, 1.5], [-1.5, 1.5], [0, -2]];
    for (const [dx, dy] of tries) {
      const px = clamp(x + dx, 0.6, ARENA.W - 0.6);
      const py = clamp(y + dy * (this.p.side === 0 ? 1 : -1), 0.6, ARENA.H - 0.6);
      if (this.m.canDeployAt(this.p.idx, id, px, py)) return this.play(handIdx, px, py);
    }
    return false;
  }

  think() {
    const m = this.m, p = this.p;
    this.useAbilities();

    if (Math.random() < this.profile.mistake && p.elixir >= 6) {
      const c = this.affordable((d) => d.type !== 'spell')[0];
      if (c) { this.playNear(c.i, rand(2, 16), this.y(rand(3, 13))); return; }
    }

    const threats = m.entities.filter((e) => !e.dead && e.side !== p.side && e.kind === 'troop' && e.deploying <= 0 && this.d(e.y) < 19);
    if (threats.length && this.defend(threats)) return;
    if (this.finishTower()) return;
    if (Math.random() < this.profile.spellSense && this.valueSpell(false)) return;
    if (this.followUp()) return;
    this.attack();
  }

  useAbilities() {
    for (const h of this.m.heroesOf(this.p.idx)) {
      const ab = CARDS[h.defId].ability;
      if (h.deploying > 0 || h.abilityCd > 0 || this.p.elixir < ab.cost) continue;
      const near = this.m.enemiesOf(this.p.side).filter((o) => o.kind !== 'tower' && dist(o.x, o.y, h.x, h.y) < 4.5);
      const want = h.defId === 'bone_king' ? (near.length >= 2 || h.souls >= 4) : near.length >= (h.defId === 'gilded_knight' ? 2 : 1);
      if (want) this.m.useAbility(this.p.idx, h.id);
    }
  }

  clusterValue(x, y, r) {
    let v = 0;
    for (const e of this.m.enemiesOf(this.p.side)) {
      if (e.deploying > 0 || e.cloak > 0) continue;
      if (dist(e.x, e.y, x, y) > r + e.radius * 0.5) continue;
      v += e.kind === 'tower' ? 1 : e.value;
    }
    return v;
  }

  // Cast a spell where it hits at least its cost in enemy value.
  valueSpell(defensive) {
    const spells = this.affordable((d, id) => d.type === 'spell' && id !== 'goblin_barrel');
    let best = null;
    for (const c of spells) {
      const s = c.def.spell;
      const r = s.radius || s.width / 2;
      for (const e of this.m.enemiesOf(this.p.side)) {
        if (e.kind === 'tower' || e.deploying > 0 || e.cloak > 0) continue;
        if (s.kind === 'roll' && e.flying) continue;
        const v = this.clusterValue(e.x, e.y, r);
        const need = c.def.cost + (defensive ? 0 : 1);
        if (v >= need && (!best || v - c.def.cost > best.gain)) best = { c, x: e.x, y: e.y, gain: v - c.def.cost };
      }
    }
    if (!best) return false;
    let { x, y } = best;
    if (best.c.def.spell.kind === 'roll') y = this.p.side === 0 ? y + 2 : y - 2; // roll it into them
    if (best.c.def.spell.kind === 'projectile') {
      // Lead moving targets a little toward our side.
      y += this.p.side === 0 ? 0.6 : -0.6;
    }
    return this.play(best.c.i, x, y);
  }

  defend(threats) {
    const p = this.p;
    threats.sort((a, b) => this.d(a.y) - this.d(b.y));
    const lead = threats[0];
    const value = threats.reduce((s, e) => s + e.value, 0);
    // Rigid bots only react once the push actually crosses the bridge, then answer instantly.
    if (this.profile.rigid && this.d(lead.y) > ARENA.RIVER_TOP + 0.5) return false;

    // Don't defend trivia with a big card, wait until the threat is really close.
    const ours = this.m.entities.filter((e) => !e.dead && e.side === p.side && e.kind !== 'tower' && dist(e.x, e.y, lead.x, lead.y) < 6);
    const ourValue = ours.reduce((s, e) => s + e.value, 0);
    if (ourValue >= value * 1.2) return false;

    if (Math.random() < this.profile.spellSense && this.valueSpell(true)) return true;

    const hasAir = threats.some((e) => e.flying);
    const allAir = threats.every((e) => e.flying);
    const tank = threats.find((e) => e.maxHp > 1500);
    const buildingHunter = threats.find((e) => e.targets === 'buildings' && !e.flying);
    const swarm = threats.filter((e) => e.maxHp < 400).length >= 3;

    let best = null;
    for (const c of this.affordable((d) => d.type !== 'spell')) {
      const d = c.def;
      if (d.role === 'win' && d.type !== 'building') continue;
      if (allAir && d.targets !== 'all') continue;
      let score = 0;
      if (hasAir && d.targets === 'all') score += 3;
      if (buildingHunter && d.type === 'building') score += 5;
      if (tank && d.dmg / d.hitSpeed > 250) score += 3;
      if (swarm && (d.splash || d.chain)) score += 3;
      if (d.role === 'swarm' && tank && !tank.flying) score += 2;
      score -= d.cost * 0.6;
      if (d.cost > value + 2) score -= 2; // avoid negative elixir trades
      if (!best || score > best.score) best = { c, score };
    }
    if (!best) return false;
    // Hold elixir if the push is small and we're low; towers can soak a little.
    if (value < 2 && p.elixir < 6 && !buildingHunter) return false;

    const d = best.c.def;
    let x = lead.x, depth;
    if (d.type === 'building') {
      x = ARENA.W / 2;
      depth = 9.5; // center pull spot between the Princess Towers
    } else if (d.range >= 4) {
      depth = Math.max(3, Math.min(this.d(lead.y) - 4, 12));
      x = clamp(lead.x + (lead.x < 9 ? 1.5 : -1.5), 1, 17);
    } else {
      depth = Math.max(3, Math.min(this.d(lead.y) - 2, 13.5));
    }
    return this.playNear(best.c.i, x, this.y(depth));
  }

  finishTower() {
    for (const t of this.m.towers(1 - this.p.side)) {
      for (const c of this.affordable((d) => d.type === 'spell' && d.spell.dmg > 0)) {
        const s = c.def.spell;
        const lv = this.p.levels[c.id] || LEVELS.START;
        const towerDmg = s.kind === 'area' ? statAt(s.dmg, lv) * s.crownPct : statAt(s.dmg, lv) * s.crownPct;
        if (t.hp <= towerDmg) return this.play(c.i, t.x, t.y);
      }
    }
    return false;
  }

  targetLane() {
    const enemy = 1 - this.p.side;
    const lanes = [0, 1].filter((l) => this.m.princessAlive(enemy, l));
    if (!lanes.length) return Math.random() < 0.5 ? 0 : 1;
    const hp = (l) => this.m.entities.find((e) => e.kind === 'tower' && e.side === enemy && e.lane === l).hp;
    if (lanes.length === 1) return lanes[0];
    if (this.profile.rigid) return hp(0) <= hp(1) ? 0 : 1;
    return Math.abs(hp(0) - hp(1)) < 200 ? (Math.random() < 0.5 ? 0 : 1) : (hp(0) < hp(1) ? 0 : 1);
  }

  // Support a friendly win condition that's already rolling.
  followUp() {
    const p = this.p;
    const push = this.m.entities.find((e) => !e.dead && e.owner === p.idx && cardDef(e.defId).role === 'win' && e.kind === 'troop' && this.d(e.y) < 16);
    if (!push || p.elixir < 3) return false;
    const support = this.affordable((d) => d.type === 'troop' && d.role !== 'win' && !d.hero)
      .sort((a, b) => (b.def.targets === 'all') - (a.def.targets === 'all'))[0]
      || this.affordable((d) => d.hero)[0];
    if (!support) return false;
    if (push.supported) return false;
    push.supported = true;
    return this.playNear(support.i, push.x, this.y(Math.max(1.5, this.d(push.y) - 2.5)));
  }

  attack() {
    const p = this.p;
    const m = this.m;
    const threshold = m.elixirMultiplier > 1 ? Math.min(this.profile.attackAt, 6) : this.profile.attackAt;
    if (p.elixir < threshold) return;

    const lane = this.targetLane();
    const bx = ARENA.BRIDGES[lane];
    const wins = this.affordable((d) => d.role === 'win');
    for (const c of wins) {
      const d = c.def;
      if (c.id === 'goblin_barrel') {
        const t = m.entities.find((e) => e.kind === 'tower' && e.side !== p.side && !e.dead && (e.lane === lane || e.isKing));
        if (t) return this.play(c.i, t.x, t.y);
        continue;
      }
      if (c.id === 'stone_golem' || c.id === 'magma_hound') {
        if (p.elixir < Math.min(10, d.cost + 2)) continue;
        return this.playNear(c.i, bx < 9 ? 6 : 12, this.y(1.5)); // drop the tank in the back
      }
      if (c.id === 'arbalest') return this.playNear(c.i, bx < 9 ? 5 : 13, this.y(13));
      return this.playNear(c.i, bx, this.y(14));
    }

    // No win condition in hand: cycle the cheapest card at the back to avoid leaking.
    if (p.elixir >= 9.3) {
      const cheap = this.affordable((d) => d.type !== 'spell').sort((a, b) => a.def.cost - b.def.cost)[0];
      if (cheap) this.playNear(cheap.i, bx, this.y(cheap.def.type === 'building' ? 9.5 : 2));
    }
  }
}
