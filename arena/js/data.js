// ============ Static game data: arena, economy, rarities, cards, bot decks ============
// All distances are in tiles (arena is 18 x 32). Speeds are tiles/second, times are seconds.
// Card stats are tuned at the level-11 baseline and scale ~10% per level (see statAt).

const ARENA = {
  W: 18,
  H: 32,
  RIVER_TOP: 15,
  RIVER_BOTTOM: 17,
  BRIDGES: [3.5, 14.5],
  BRIDGE_HALF: 1.1,
};

const CLOCK = {
  REGULATION: 180,
  DOUBLE_ELIXIR_AT: 60, // seconds of regulation left when double elixir starts
  OVERTIME: 120,
};

const ELIXIR = {
  MAX: 10,
  START: 5,
  SECONDS_PER_ELIXIR: 2.8,
};

const LEVELS = {
  MAX: 16,
  BASE: 11, // stats in CARDS are quoted at this level
  STEP: 1.10, // +10% hitpoints & damage per level
  TOTAL_GOLD: 365000, // gold to take one card from level 1 to 16
  START: 9,
};

const RARITIES = {
  common:    { name: 'Common',    color: '#9fb4c7', totalCopies: 23000 },
  rare:      { name: 'Rare',      color: '#f3a03d', totalCopies: 4800 },
  epic:      { name: 'Epic',      color: '#b05cf0', totalCopies: 600 },
  legendary: { name: 'Legendary', color: '#4fe0d0', totalCopies: 70 },
  champion:  { name: 'Champion',  color: '#ffd23f', totalCopies: 42 },
};

// Split a total across the 15 upgrades (1→2 … 15→16) with geometric growth so
// later levels cost more; the last step absorbs rounding so the sum is exact.
function buildUpgradeTable(total, growth) {
  const steps = LEVELS.MAX - 1;
  const weights = [];
  for (let i = 0; i < steps; i++) weights.push(Math.pow(growth, i));
  const sum = weights.reduce((a, b) => a + b, 0);
  const table = weights.map((w) => Math.max(1, Math.round((total * w) / sum)));
  const drift = total - table.reduce((a, b) => a + b, 0);
  table[steps - 1] += drift;
  return table; // table[L-1] = cost to go from level L to L+1
}

const COPIES_TABLE = {};
Object.keys(RARITIES).forEach((r) => {
  COPIES_TABLE[r] = buildUpgradeTable(RARITIES[r].totalCopies, 1.32);
});
const GOLD_TABLE = buildUpgradeTable(LEVELS.TOTAL_GOLD, 1.38);

function copiesToUpgrade(rarity, level) {
  return level >= LEVELS.MAX ? 0 : COPIES_TABLE[rarity][level - 1];
}
function goldToUpgrade(level) {
  return level >= LEVELS.MAX ? 0 : GOLD_TABLE[level - 1];
}
function statAt(base, level) {
  return Math.round(base * Math.pow(LEVELS.STEP, level - LEVELS.BASE));
}

// Star levels: cosmetic only, unlocked on max-level cards with Star Points.
const STAR_LEVELS = [
  { name: 'Gold Weapon', cost: 500 },
  { name: 'Radiant Aura', cost: 1500 },
  { name: 'Royal Spawn', cost: 3000 },
];

const TOWERS = {
  princess: { hp: 3052, dmg: 109, hitSpeed: 0.8, range: 7.5, radius: 1.5 },
  king:     { hp: 4824, dmg: 109, hitSpeed: 1.0, range: 7.0, radius: 2.0 },
};

// Movement speeds
const SPD = { slow: 0.75, medium: 1.0, fast: 1.5, veryFast: 2.0 };
// Mass decides knockback / pull resistance
const MASS = { light: 1, medium: 4, heavy: 18 };

const CARDS = {
  // ---------- Commons ----------
  knight: {
    name: 'Knight', icon: '🛡️', rarity: 'common', cost: 3, type: 'troop', role: 'support',
    hp: 1766, dmg: 202, hitSpeed: 1.2, range: 1.2, speed: SPD.medium, targets: 'ground',
    radius: 0.5, mass: MASS.medium,
    desc: 'Sturdy melee fighter. Cheap mini-tank.',
    evo: { desc: 'Takes 60% less damage while moving.' },
  },
  archers: {
    name: 'Archers', icon: '🏹', rarity: 'common', cost: 3, type: 'troop', role: 'support',
    hp: 304, dmg: 107, hitSpeed: 0.9, range: 5, speed: SPD.medium, targets: 'all', count: 2,
    radius: 0.4, mass: MASS.light,
    desc: 'A pair of ranged attackers that hit air and ground.',
    evo: { desc: '+1.5 range and +50% damage to targets farther than 4 tiles.' },
  },
  skeletons: {
    name: 'Skeletons', icon: '💀', rarity: 'common', cost: 1, type: 'troop', role: 'swarm',
    hp: 81, dmg: 81, hitSpeed: 1.0, range: 0.8, speed: SPD.fast, targets: 'ground', count: 3,
    radius: 0.3, mass: MASS.light,
    desc: 'Three fragile, fast melee units. Great for cycling and distracting.',
    evo: { desc: 'Spawns 4 skeletons. Each hit summons a new skeleton (up to 8 alive).' },
  },
  minions: {
    name: 'Minions', icon: '🦇', rarity: 'common', cost: 3, type: 'troop', role: 'support',
    hp: 230, dmg: 107, hitSpeed: 1.0, range: 2, speed: SPD.fast, targets: 'all', count: 3,
    flying: true, radius: 0.4, mass: MASS.light,
    desc: 'Three flying attackers.',
  },
  cannon: {
    name: 'Cannon', icon: '💣', rarity: 'common', cost: 3, type: 'building', role: 'defense',
    hp: 824, dmg: 212, hitSpeed: 0.9, range: 5.5, targets: 'ground', lifetime: 30,
    radius: 0.9, mass: MASS.heavy,
    desc: 'Defensive building. Pulls building-targeting win conditions.',
  },
  zap: {
    name: 'Zap', icon: '⚡', rarity: 'common', cost: 2, type: 'spell', role: 'spell',
    spell: { kind: 'instant', radius: 2.5, dmg: 192, crownPct: 0.3, stun: 0.5 },
    desc: 'Instant damage and a brief stun in a small area.',
  },
  siege_giant: {
    name: 'Siege Giant', icon: '🗿', rarity: 'common', cost: 6, type: 'troop', role: 'win',
    hp: 3164, dmg: 307, hitSpeed: 1.7, range: 5, speed: SPD.slow, targets: 'buildings',
    radius: 0.75, mass: MASS.heavy,
    desc: 'Slow tank that shells buildings from range.',
    evo: { desc: 'Each shot sends out a recoil blast that damages and knocks back nearby troops.' },
  },

  // ---------- Rares ----------
  boar_rider: {
    name: 'Boar Rider', icon: '🐗', rarity: 'rare', cost: 4, type: 'troop', role: 'win',
    hp: 1697, dmg: 317, hitSpeed: 1.6, range: 0.8, speed: SPD.veryFast, targets: 'buildings',
    jumpsRiver: true, radius: 0.6, mass: MASS.medium,
    desc: 'Very fast win condition that leaps the river and rushes buildings.',
  },
  musketeer: {
    name: 'Musketeer', icon: '🔫', rarity: 'rare', cost: 4, type: 'troop', role: 'support',
    hp: 720, dmg: 217, hitSpeed: 1.0, range: 6, speed: SPD.medium, targets: 'all',
    radius: 0.5, mass: MASS.medium,
    desc: 'Long-range anti-air support.',
  },
  valkyrie: {
    name: 'Valkyrie', icon: '🪓', rarity: 'rare', cost: 4, type: 'troop', role: 'support',
    hp: 1908, dmg: 267, hitSpeed: 1.5, range: 1.2, speed: SPD.medium, targets: 'ground',
    splash: 1.6, splashAroundSelf: true, radius: 0.5, mass: MASS.medium,
    desc: 'Spins her axe, hitting every ground unit around her.',
    evo: { desc: 'Each spin creates a whirlwind that pulls nearby ground troops in.' },
  },
  mini_pekka: {
    name: 'Mini Mech', icon: '🤖', rarity: 'rare', cost: 4, type: 'troop', role: 'defense',
    hp: 1361, dmg: 720, hitSpeed: 1.6, range: 0.8, speed: SPD.fast, targets: 'ground',
    radius: 0.5, mass: MASS.medium,
    desc: 'Huge single-target damage. Melts tanks.',
  },
  fireball: {
    name: 'Fireball', icon: '🔥', rarity: 'rare', cost: 4, type: 'spell', role: 'spell',
    spell: { kind: 'projectile', radius: 2.5, dmg: 689, crownPct: 0.3, travelSpeed: 14, knockback: 1.2 },
    desc: 'Medium-damage area spell that knocks back light troops.',
  },
  rocket: {
    name: 'Rocket', icon: '🚀', rarity: 'rare', cost: 6, type: 'spell', role: 'spell',
    spell: { kind: 'projectile', radius: 2, dmg: 1484, crownPct: 0.25, travelSpeed: 8, knockback: 1.6 },
    desc: 'Massive damage in a small radius. Slow to land.',
  },

  // ---------- Epics ----------
  stone_golem: {
    name: 'Stone Golem', icon: '🪨', rarity: 'epic', cost: 8, type: 'troop', role: 'win',
    hp: 5120, dmg: 312, hitSpeed: 2.5, range: 0.9, speed: SPD.slow, targets: 'buildings',
    radius: 0.9, mass: MASS.heavy,
    deathSpawn: { id: 'golemite', count: 2 }, deathDamage: { dmg: 312, radius: 2 },
    desc: 'Enormous tank. Splits into two Golemites on death.',
  },
  goblin_barrel: {
    name: 'Goblin Barrel', icon: '🛢️', rarity: 'epic', cost: 3, type: 'spell', role: 'win',
    spell: { kind: 'projectile', radius: 0, dmg: 0, crownPct: 1, travelSpeed: 9, spawn: { id: 'goblin', count: 3 } },
    desc: 'Lob three Goblins anywhere in the arena.',
  },
  arbalest: {
    name: 'Arbalest', icon: '🎯', rarity: 'epic', cost: 6, type: 'building', role: 'win',
    hp: 1600, dmg: 30, hitSpeed: 0.3, range: 11.5, targets: 'ground', lifetime: 30, deployTime: 3.5,
    radius: 0.9, mass: MASS.heavy,
    desc: 'Siege crossbow that can hit towers from your side of the river.',
  },
  poison: {
    name: 'Poison', icon: '☠️', rarity: 'epic', cost: 4, type: 'spell', role: 'spell',
    spell: { kind: 'area', radius: 3.5, dmg: 600, crownPct: 0.3, duration: 8, slow: 0.15 },
    desc: 'Damage over time in a large area. Slows enemies inside.',
  },
  tornado: {
    name: 'Tornado', icon: '🌪️', rarity: 'epic', cost: 3, type: 'spell', role: 'spell',
    spell: { kind: 'area', radius: 5.5, dmg: 169, crownPct: 0.3, duration: 1.05, pull: 5.5 },
    desc: 'Drags enemy troops to its center. Combo enabler.',
  },
  executioner: {
    name: 'Executioner', icon: '⚔️', rarity: 'epic', cost: 5, type: 'troop', role: 'support',
    hp: 1280, dmg: 168, hitSpeed: 2.4, range: 4.5, speed: SPD.medium, targets: 'all',
    splash: 1.0, boomerang: true, radius: 0.55, mass: MASS.medium,
    desc: 'Throws a boomerang axe that hits on the way out and back.',
  },
  storm_drake: {
    name: 'Storm Drake', icon: '🐉', rarity: 'epic', cost: 5, type: 'troop', role: 'support',
    hp: 950, dmg: 192, hitSpeed: 2.1, range: 3.5, speed: SPD.medium, targets: 'all',
    flying: true, chain: 3, stun: 0.5, radius: 0.6, mass: MASS.medium,
    desc: 'Flying dragon whose lightning chains to three targets and stuns.',
  },

  // ---------- Legendaries ----------
  magma_hound: {
    name: 'Magma Hound', icon: '🌋', rarity: 'legendary', cost: 7, type: 'troop', role: 'win',
    hp: 3150, dmg: 53, hitSpeed: 1.3, range: 2, speed: SPD.slow, targets: 'buildings',
    flying: true, radius: 0.9, mass: MASS.heavy,
    deathSpawn: { id: 'magma_pup', count: 6 },
    desc: 'Flying tank that bursts into six Magma Pups.',
  },
  the_timber: {
    name: 'The Timber', icon: '🪵', rarity: 'legendary', cost: 2, type: 'spell', role: 'spell',
    spell: { kind: 'roll', width: 3.9, length: 10.1, dmg: 290, crownPct: 0.2, rollSpeed: 7, knockback: 1 },
    desc: 'A rolling log that flattens ground troops in a lane.',
  },

  // ---------- Champions (Heroes) ----------
  gilded_knight: {
    name: 'Gilded Knight', icon: '🤺', rarity: 'champion', cost: 4, type: 'troop', role: 'support', hero: true,
    hp: 1800, dmg: 160, hitSpeed: 0.9, range: 1.2, speed: SPD.medium, targets: 'ground',
    radius: 0.55, mass: MASS.medium,
    ability: { name: 'Dashing Dash', cost: 1, cooldown: 13, desc: 'Chain-dash through up to 10 nearby enemies for heavy damage.' },
    desc: 'Champion duelist with a chaining dash.',
  },
  huntress_queen: {
    name: 'Huntress Queen', icon: '👑', rarity: 'champion', cost: 5, type: 'troop', role: 'support', hero: true,
    hp: 1000, dmg: 225, hitSpeed: 1.2, range: 5, speed: SPD.medium, targets: 'all',
    radius: 0.5, mass: MASS.medium,
    ability: { name: 'Cloaking Cape', cost: 1, cooldown: 17, desc: 'Turns invisible for 3.5s and attacks much faster.' },
    desc: 'Champion crossbow ace who can vanish mid-fight.',
  },
  bone_king: {
    name: 'Bone King', icon: '☠', rarity: 'champion', cost: 4, type: 'troop', role: 'support', hero: true,
    hp: 2300, dmg: 205, hitSpeed: 1.6, range: 1.3, speed: SPD.medium, targets: 'ground',
    splash: 1.3, radius: 0.7, mass: MASS.medium,
    ability: { name: 'Soul Summoning', cost: 2, cooldown: 20, desc: 'Raises 6 skeletons plus one per soul collected from fallen troops.' },
    desc: 'Champion who harvests souls from fallen troops.',
  },
};

// Non-deckable units spawned by other cards. Cost here is their share of elixir value.
const TOKENS = {
  golemite: {
    name: 'Golemite', icon: '🪨', rarity: 'epic', cost: 1, type: 'troop',
    hp: 1037, dmg: 66, hitSpeed: 2.5, range: 0.9, speed: SPD.slow, targets: 'buildings',
    radius: 0.6, mass: MASS.medium, deathDamage: { dmg: 66, radius: 1.5 }, scale: 0.7,
  },
  magma_pup: {
    name: 'Magma Pup', icon: '🔥', rarity: 'legendary', cost: 0.5, type: 'troop',
    hp: 179, dmg: 75, hitSpeed: 1.7, range: 1.6, speed: SPD.fast, targets: 'all',
    flying: true, radius: 0.35, mass: MASS.light, scale: 0.6,
  },
  goblin: {
    name: 'Goblin', icon: '👺', rarity: 'common', cost: 1, type: 'troop',
    hp: 202, dmg: 120, hitSpeed: 1.1, range: 0.8, speed: SPD.veryFast, targets: 'ground',
    radius: 0.4, mass: MASS.light,
  },
  skeleton: {
    name: 'Skeleton', icon: '💀', rarity: 'common', cost: 0.33, type: 'troop',
    hp: 81, dmg: 81, hitSpeed: 1.0, range: 0.8, speed: SPD.fast, targets: 'ground',
    radius: 0.3, mass: MASS.light,
  },
};

function cardDef(id) {
  return CARDS[id] || TOKENS[id];
}

// Deck layout: index 0 = Evolution slot, 1 = Hero slot, 2 = Wild slot, 3..7 = standard.
const SLOT_LABELS = ['Evolution', 'Hero', 'Wild', '', '', '', '', ''];
const DECK_SIZE = 8;

function isEvolvedSlot(deck, i) {
  return (i === 0 || i === 2) && !!(CARDS[deck[i]] && CARDS[deck[i]].evo);
}

// Returns null when valid, otherwise a human-readable reason.
function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return 'A deck needs exactly 8 cards.';
  const seen = new Set();
  for (let i = 0; i < DECK_SIZE; i++) {
    const id = deck[i];
    if (!id || !CARDS[id]) return 'Fill every slot.';
    if (seen.has(id)) return `${CARDS[id].name} is in the deck twice.`;
    seen.add(id);
    if (CARDS[id].hero && i !== 1 && i !== 2) return `${CARDS[id].name} is a Hero — place it in the Hero or Wild slot.`;
  }
  return null;
}

// Preset decks used by bots: [evo, hero, wild, ...5 standard]
const BOT_DECKS = [
  { name: 'Boar Cycle',     cards: ['knight', 'gilded_knight', 'skeletons', 'boar_rider', 'musketeer', 'cannon', 'the_timber', 'fireball'] },
  { name: 'Golem Beatdown', cards: ['valkyrie', 'bone_king', 'archers', 'stone_golem', 'storm_drake', 'tornado', 'zap', 'mini_pekka'] },
  { name: 'Hound Air',      cards: ['archers', 'huntress_queen', 'minions', 'magma_hound', 'musketeer', 'fireball', 'zap', 'valkyrie'] },
  { name: 'Arbalest Siege', cards: ['knight', 'huntress_queen', 'archers', 'arbalest', 'cannon', 'the_timber', 'rocket', 'skeletons'] },
  { name: 'Siege Giant',    cards: ['siege_giant', 'gilded_knight', 'skeletons', 'mini_pekka', 'executioner', 'fireball', 'zap', 'minions'] },
  { name: 'Barrel Bait',    cards: ['skeletons', 'bone_king', 'knight', 'goblin_barrel', 'minions', 'rocket', 'the_timber', 'poison'] },
];

// Training Camp opponents are fixed and predictable.
const TRAINING_BOTS = [
  { name: 'Trainer Pip',   deckIndex: 0, level: 8 },
  { name: 'Trainer Bramble', deckIndex: 1, level: 9 },
  { name: 'Trainer Ash',   deckIndex: 2, level: 10 },
];

const DEFAULT_DECK = ['knight', 'gilded_knight', 'archers', 'boar_rider', 'musketeer', 'cannon', 'fireball', 'zap'];

const BOT_NAMES = [
  'xX_Slayer_Xx', 'ElixirGoblin', 'BridgeSpammer', 'NoobMaster', 'KingKiller', 'LogBait99',
  'RiverRat', 'CrownChaser', 'TowerTitan', 'SpellSlinger', 'DoubleTrouble', 'CycleLord',
];

const EMOTES = ['😀', '😂', '😢', '😡', '👍', '🙏'];

// Trophy thresholds where the matchmaker leans on scripted fallback bots
const MATCHMAKING = {
  LOW_TROPHY_BOT_ZONE: 1000,
  LOW_TROPHY_BOT_CHANCE: 0.75,
  OFF_PEAK_BOT_CHANCE: 0.45, // queue windows with low population
  NORMAL_BOT_CHANCE: 0.1,
  TROPHIES_WIN: 30,
  TROPHIES_LOSS: 28,
};
