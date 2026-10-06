// ============ Canvas renderer ============

const COLORS = {
  grassA: '#5fae4e', grassB: '#58a548',
  ownTint: 'rgba(60,130,255,0.06)', enemyTint: 'rgba(255,70,70,0.06)',
  river: '#3a8fd6', riverDeep: '#2f78b8', bridge: '#9b6b3d', bridgeEdge: '#6e4a28',
  side: ['#3b82f6', '#ef4444'], sideDark: ['#1e40af', '#991b1b'],
  hp: ['#60a5fa', '#f87171'],
  invalid: 'rgba(220,38,38,0.28)',
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tile = 20;
  }

  resize(maxW, maxH) {
    const dpr = window.devicePixelRatio || 1;
    this.tile = Math.max(8, Math.floor(Math.min(maxW / ARENA.W, maxH / ARENA.H)));
    const w = this.tile * ARENA.W, h = this.tile * ARENA.H;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toTiles(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.tile, y: (clientY - r.top) / this.tile, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
  }

  draw(m, view) {
    const { ctx, tile: T } = this;
    ctx.clearRect(0, 0, ARENA.W * T, ARENA.H * T);
    this.drawGround(m.elapsed);
    if (view.selectedCard) this.drawDeployZone(m, view);

    for (const a of m.areas) this.drawArea(a, m.elapsed);
    for (const r of m.rolls) this.drawRoll(r);

    const ents = m.entities.slice().sort((a, b) => (a.flying - b.flying) || (a.y - b.y));
    for (const e of ents) {
      if (e.kind === 'tower') this.drawTower(e);
      else this.drawUnit(e, view);
    }
    for (const p of m.projectiles) this.drawProjectile(p);
    for (const f of m.fx) this.drawFx(f);
    this.drawEmotes(m, view);
    if (view.selectedCard && view.hover && view.hover.inside) this.drawGhost(m, view);
  }

  drawGround(time) {
    const { ctx, tile: T } = this;
    for (let y = 0; y < ARENA.H; y++) {
      for (let x = 0; x < ARENA.W; x++) {
        ctx.fillStyle = (x + y) % 2 ? COLORS.grassA : COLORS.grassB;
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
    ctx.fillStyle = COLORS.enemyTint;
    ctx.fillRect(0, 0, ARENA.W * T, ARENA.RIVER_TOP * T);
    ctx.fillStyle = COLORS.ownTint;
    ctx.fillRect(0, ARENA.RIVER_BOTTOM * T, ARENA.W * T, (ARENA.H - ARENA.RIVER_BOTTOM) * T);

    // Lane paths
    ctx.fillStyle = 'rgba(214,190,120,0.22)';
    for (const bx of ARENA.BRIDGES) ctx.fillRect((bx - 0.9) * T, 2 * T, 1.8 * T, (ARENA.H - 4) * T);

    // River with drifting ripples
    const ry = ARENA.RIVER_TOP * T, rh = (ARENA.RIVER_BOTTOM - ARENA.RIVER_TOP) * T;
    const g = ctx.createLinearGradient(0, ry, 0, ry + rh);
    g.addColorStop(0, COLORS.river);
    g.addColorStop(0.5, COLORS.riverDeep);
    g.addColorStop(1, COLORS.river);
    ctx.fillStyle = g;
    ctx.fillRect(0, ry, ARENA.W * T, rh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 2.3 + time * 0.6) % ARENA.W) * T;
      const y = ry + ((i * 7) % 3 + 0.5) * (rh / 3.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + T * 0.4, y - 3, x + T * 0.8, y);
      ctx.stroke();
    }

    // Bridges
    for (const bx of ARENA.BRIDGES) {
      const x0 = (bx - ARENA.BRIDGE_HALF - 0.1) * T, w = (ARENA.BRIDGE_HALF * 2 + 0.2) * T;
      ctx.fillStyle = COLORS.bridge;
      ctx.fillRect(x0, ry - T * 0.25, w, rh + T * 0.5);
      ctx.strokeStyle = COLORS.bridgeEdge;
      ctx.lineWidth = 2;
      for (let k = 0; k <= 4; k++) {
        const yy = ry - T * 0.25 + (k * (rh + T * 0.5)) / 4;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke();
      }
      ctx.strokeRect(x0, ry - T * 0.25, w, rh + T * 0.5);
    }
  }

  drawDeployZone(m, view) {
    const { ctx, tile: T } = this;
    ctx.fillStyle = COLORS.invalid;
    for (let y = 0; y < ARENA.H; y++) {
      for (let x = 0; x < ARENA.W; x++) {
        if (!m.canDeployAt(view.playerIdx, view.selectedCard, x + 0.5, y + 0.5)) ctx.fillRect(x * T, y * T, T, T);
      }
    }
  }

  drawTower(e) {
    const { ctx, tile: T } = this;
    const x = e.x * T, y = e.y * T, s = e.radius * T;
    if (e.dead) {
      ctx.fillStyle = 'rgba(70,60,50,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${s}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🪨', x, y);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - s + 3, y - s + 4, s * 2, s * 2);
    ctx.fillStyle = '#b8b2a4';
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = COLORS.side[e.side];
    ctx.fillRect(x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44);
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }
    ctx.font = `${Math.round(s * (e.isKing ? 1.05 : 0.95))}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.isKing ? '👑' : '🏰', x, y + 1);
    if (e.isKing && !e.active) {
      ctx.font = `${Math.round(T * 0.8)}px serif`;
      ctx.fillText('💤', x + s * 0.8, y - s * 0.8);
    }
    // HP bar + number
    const bw = s * 2.1, bh = Math.max(5, T * 0.32);
    const by = e.side === 0 ? y + s + 3 : y - s - bh - 3;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, by, bw, bh);
    ctx.fillStyle = COLORS.hp[e.side];
    ctx.fillRect(x - bw / 2, by, bw * (e.hp / e.maxHp), bh);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, Math.round(T * 0.42))}px Inter, sans-serif`;
    ctx.fillText(Math.ceil(e.hp), x, by + bh / 2 + 0.5);
  }

  drawUnit(e, view) {
    const { ctx, tile: T } = this;
    const def = cardDef(e.defId);
    const scale = def.scale || 1;
    const lift = e.flying ? T * 0.7 : 0;
    const bob = e.moving ? Math.sin(e.anim * 10) * T * 0.04 : 0;
    const x = e.x * T, y = e.y * T - lift + bob;
    const r = Math.max(5, e.radius * T * (e.kind === 'building' ? 1 : 1.1));
    const enemyCloaked = e.cloak > 0 && e.side !== 0;
    ctx.save();
    ctx.globalAlpha = e.deploying > 0 ? 0.5 : e.cloak > 0 ? (enemyCloaked ? 0.12 : 0.4) : 1;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, e.y * T + r * 0.55, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cosmetic star levels (zero gameplay effect)
    if (e.star >= 2) {
      const pulse = 0.5 + Math.sin(e.anim * 4) * 0.25;
      ctx.fillStyle = `rgba(255,210,63,${0.25 * pulse + 0.1})`;
      ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    if (e.star >= 3 && e.deploying > 0) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = e.anim * 3 + (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
        ctx.lineTo(x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 2);
        ctx.stroke();
      }
    }
    if (e.evo) {
      ctx.strokeStyle = 'rgba(200,120,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    }

    // Body
    if (e.kind === 'building') {
      ctx.fillStyle = COLORS.sideDark[e.side];
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = COLORS.side[e.side];
      ctx.fillRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    } else {
      ctx.fillStyle = COLORS.side[e.side];
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = e.hero ? 3 : 2;
      ctx.strokeStyle = e.hero ? '#ffd23f' : e.star >= 1 ? '#f5c542' : COLORS.sideDark[e.side];
      ctx.stroke();
    }
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const lunge = e.hitFx > 0 ? 1.15 : 1;
    ctx.font = `${Math.round(r * 1.3 * scale * lunge)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, x, y + 1);

    if (e.star >= 1 && e.kind === 'troop') {
      ctx.font = `${Math.round(r * 0.7)}px serif`;
      ctx.fillText('⭐', x + r * 0.8, y - r * 0.8);
    }
    if (e.stun > 0) {
      ctx.font = `${Math.round(r * 0.8)}px serif`;
      ctx.fillText('💫', x, y - r - 4);
    }

    // Deploy timer ring
    if (e.deploying > 0) {
      const total = def.deployTime || DEFAULT_DEPLOY_TIME;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - e.deploying / total));
      ctx.stroke();
    }

    // HP bar
    if (e.hp < e.maxHp || e.hero || e.kind === 'building') {
      const bw = Math.max(r * 2, T * 0.9), bh = Math.max(3, T * 0.16);
      const by = y - r - bh - 4;
      ctx.globalAlpha = enemyCloaked ? 0.12 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - bw / 2, by, bw, bh);
      ctx.fillStyle = COLORS.hp[e.side];
      ctx.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      if (e.level && (e.hero || e.kind === 'building' || r > T * 0.6)) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, Math.round(T * 0.32))}px Inter, sans-serif`;
        ctx.fillText(e.level, x - bw / 2 - 6, by + bh / 2);
      }
    }
    // Ability readiness pip for the local player's heroes
    if (e.hero && e.owner === view.playerIdx && e.abilityCd <= 0 && e.deploying <= 0) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x + r, y + r * 0.6, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawProjectile(p) {
    const { ctx, tile: T } = this;
    if (p.spellHit) {
      const remaining = dist(p.x, p.y, p.tx, p.ty);
      const prog = p.total ? 1 - remaining / p.total : 1;
      const lift = Math.sin(prog * Math.PI) * T * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(p.x * T, p.y * T, T * 0.35, T * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(T * 0.9)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, p.x * T, p.y * T - lift);
      return;
    }
    ctx.fillStyle = p.boomerang ? '#e5e7eb' : p.color;
    ctx.beginPath();
    ctx.arc(p.x * T, p.y * T, p.boomerang ? T * 0.22 : T * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  drawArea(a, time) {
    const { ctx, tile: T } = this;
    const r = a.spell.radius * T;
    if (a.cardId === 'poison') {
      ctx.fillStyle = 'rgba(132,204,22,0.28)';
      ctx.strokeStyle = 'rgba(77,124,15,0.8)';
    } else {
      ctx.fillStyle = 'rgba(203,213,225,0.22)';
      ctx.strokeStyle = 'rgba(241,245,249,0.8)';
    }
    ctx.beginPath(); ctx.arc(a.x * T, a.y * T, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
    if (a.cardId === 'tornado') {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(a.x * T, a.y * T, r * (0.3 + i * 0.22), time * 6 + i, time * 6 + i + 3.5);
        ctx.stroke();
      }
    } else {
      ctx.font = `${Math.round(T * 0.6)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 5; i++) {
        const ang = time * 0.8 + i * 1.256;
        ctx.fillText('☠️', a.x * T + Math.cos(ang) * r * 0.55, a.y * T + Math.sin(ang) * r * 0.55);
      }
    }
  }

  drawRoll(r) {
    const { ctx, tile: T } = this;
    const w = r.spell.width * T;
    ctx.fillStyle = '#8b5a2b';
    ctx.strokeStyle = '#5b3a1a';
    ctx.lineWidth = 2;
    ctx.fillRect(r.x * T - w / 2, r.y * T - T * 0.4, w, T * 0.8);
    ctx.strokeRect(r.x * T - w / 2, r.y * T - T * 0.4, w, T * 0.8);
  }

  drawFx(f) {
    const { ctx, tile: T } = this;
    const k = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    switch (f.type) {
      case 'deploy':
        ctx.strokeStyle = COLORS.side[f.side];
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.radius * T * (0.4 + k), 0, Math.PI * 2); ctx.stroke();
        break;
      case 'blast': {
        const g = ctx.createRadialGradient(f.x * T, f.y * T, 0, f.x * T, f.y * T, f.radius * T);
        g.addColorStop(0, f.cardId === 'zap' ? 'rgba(147,197,253,0.9)' : 'rgba(255,200,80,0.9)');
        g.addColorStop(1, f.cardId === 'zap' ? 'rgba(59,130,246,0)' : 'rgba(239,68,68,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.radius * T * (0.6 + k * 0.5), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'death':
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.arc(f.x * T + Math.cos(a) * k * T, f.y * T + Math.sin(a) * k * T, T * 0.15 * (1 - k), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'bolt':
        ctx.strokeStyle = '#bfdbfe'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(f.x * T, f.y * T);
        ctx.lineTo((f.x + f.x2) / 2 * T + (Math.random() - 0.5) * T * 0.5, (f.y + f.y2) / 2 * T + (Math.random() - 0.5) * T * 0.5);
        ctx.lineTo(f.x2 * T, f.y2 * T);
        ctx.stroke();
        break;
      case 'dash':
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(f.x * T, f.y * T); ctx.lineTo(f.x2 * T, f.y2 * T); ctx.stroke();
        break;
      case 'swirl':
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.radius * T * (1 - k), 0, Math.PI * 1.5); ctx.stroke();
        break;
      case 'ability':
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, T * (0.5 + k * 2), 0, Math.PI * 2); ctx.stroke();
        break;
      case 'kingWake':
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(T * 0.6)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('KING ACTIVATED!', f.x * T, f.y * T - T * (2.4 + k));
        break;
      case 'banner':
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, (ARENA.H / 2 - 1.5) * T, ARENA.W * T, 3 * T);
        ctx.fillStyle = '#ffd23f';
        ctx.font = `bold ${Math.round(T * 0.9)}px "Space Grotesk", Inter, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.text, (ARENA.W / 2) * T, (ARENA.H / 2) * T);
        break;
      default:
    }
    ctx.restore();
  }

  drawEmotes(m) {
    const { ctx, tile: T } = this;
    for (const p of m.players) {
      if (!p.emote) continue;
      const k = m.kingTower(p.side);
      const mates = m.playersOn(p.side);
      const offset = mates.length > 1 ? (mates.indexOf(p) === 0 ? -3 : 3) : 0;
      const x = (k.x + offset) * T;
      const y = (p.side === 0 ? k.y - 3.4 : k.y + 3.4) * T;
      const pop = Math.min(1, (2.5 - p.emote.t) * 6);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(x, y, T * 0.95 * pop, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(T * 1.1 * pop)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.emote.emoji, x, y + 1);
      ctx.restore();
    }
  }

  drawGhost(m, view) {
    const { ctx, tile: T } = this;
    const def = CARDS[view.selectedCard];
    const { x, y } = view.hover;
    const ok = m.canDeployAt(view.playerIdx, view.selectedCard, x, y);
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (def.type === 'spell') {
      const r = (def.spell.radius || def.spell.width / 2 || 1.2) * T;
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      if (def.spell.kind === 'roll') {
        const len = def.spell.length * T;
        ctx.strokeRect(x * T - r, y * T - len, r * 2, len);
      } else {
        ctx.beginPath(); ctx.arc(x * T, y * T, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.fillStyle = ok ? 'rgba(255,255,255,0.6)' : 'rgba(239,68,68,0.6)';
    ctx.beginPath(); ctx.arc(x * T, y * T, T * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(T * 0.9)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, x * T, y * T + 1);
    ctx.restore();
  }
}
