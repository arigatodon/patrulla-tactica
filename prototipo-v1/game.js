'use strict';

/* ============================================================
   PATRULLA MERCENARIA — Operación Barrio Limpio
   Táctico por turnos isométrico (estilo Advance Wars / Fire Emblem)
   ============================================================ */

// ---------- Configuración de render ----------
const TW = 72, TH = 36;          // tamaño de losa isométrica
const OX = 370, OY = 90;         // origen del mapa en el canvas
const W = 890, H = 545;

// ---------- Mapa ----------
// '.' calle  ',' acera  'G' parque  'C' cobertura (cajas)  'B' edificio  'T' árbol
const MAP = [
  'GGGG,...,BBBBB',
  'GTGG,...,BBBBB',
  'GGGG,...,,,,,,',
  ',,,,,....C....',
  '..............',
  '..............',
  ',,,,....,,,C,,',
  'BBB,....,CGGG,',
  'BBB,....,GGTG,',
  'BBB,....,GGGG,',
];
const ROWS = MAP.length, COLS = MAP[0].length;

const TERRAIN = {
  '.': { name: 'Calle',     cost: 1, def: 0, block: false, color: '#33373d' },
  ',': { name: 'Acera',     cost: 1, def: 0, block: false, color: '#5d626c' },
  'G': { name: 'Parque',    cost: 1, def: 1, block: false, color: '#3f6d38' },
  'C': { name: 'Cobertura', cost: 2, def: 2, block: false, color: '#5d626c' },
  'B': { name: 'Edificio',  cost: 0, def: 0, block: true,  color: '#22252b' },
  'T': { name: 'Árbol',     cost: 0, def: 0, block: true,  color: '#3f6d38' },
};

// ---------- Tipos de unidad ----------
const TYPES = {
  capitan:   { label: 'Capitán',       team: 'player', hp: 24, atk: 8, def: 2, mov: 4, rmin: 1, rmax: 1, sprite: 'merc',   weapon: 'Escopeta' },
  soldado:   { label: 'Soldado',       team: 'player', hp: 20, atk: 7, def: 1, mov: 4, rmin: 1, rmax: 2, sprite: 'merc',   weapon: 'Fusil' },
  sniper:    { label: 'Francotirador', team: 'player', hp: 14, atk: 9, def: 0, mov: 3, rmin: 2, rmax: 3, sprite: 'sniper', weapon: 'Rifle largo' },
  k9:        { label: 'Dron K9',       team: 'player', hp: 14, atk: 6, def: 2, mov: 6, rmin: 1, rmax: 1, sprite: 'dog',    weapon: 'Mandíbula eléctrica' },
  sicario:   { label: 'Sicario',       team: 'enemy',  hp: 16, atk: 6, def: 1, mov: 4, rmin: 1, rmax: 1, sprite: 'thug',   weapon: 'Machete', aggro: 6 },
  pistolero: { label: 'Pistolero',     team: 'enemy',  hp: 13, atk: 6, def: 0, mov: 3, rmin: 1, rmax: 2, sprite: 'gunner', weapon: 'Pistola', aggro: 7 },
  vendedor:  { label: 'Vendedor',      team: 'enemy',  hp: 14, atk: 5, def: 1, mov: 3, rmin: 1, rmax: 1, sprite: 'dealer', weapon: 'Navaja',  aggro: 2, boss: true },
};

const START_UNITS = [
  ['capitan', 'Cap. Vega',    1, 4],
  ['soldado', 'Sdo. Ruiz',    0, 4],
  ['sniper',  '"Ojo" Silva',  0, 5],
  ['k9',      'K9-Alfa',      2, 4],
  ['k9',      'K9-Beta',      2, 5],
  ['vendedor',  '"El Cuervo"', 1, 0],
  ['vendedor',  '"Don Mena"',  12, 2],
  ['vendedor',  '"El Sapo"',   10, 8],
  ['sicario',   'Sicario',     2, 2],
  ['sicario',   'Sicario',     6, 3],
  ['sicario',   'Sicario',     11, 3],
  ['sicario',   'Sicario',     9, 6],
  ['pistolero', 'Pistolero',   7, 5],
  ['pistolero', 'Pistolero',   12, 7],
];

// ---------- Estado ----------
let units = [], effects = [], tweens = [], logHTML = [];
const game = {
  round: 1, phase: 'player',      // 'player' | 'enemy'
  state: 'idle',                  // 'idle' | 'selected' | 'target'
  selected: null, reach: null, targets: null, postTargets: null,
  hover: null, hoverUnit: null,
  busy: false, over: false,
  banner: null, shake: 0,
};

// ---------- DOM ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = window.devicePixelRatio || 1;
canvas.width = W * dpr; canvas.height = H * dpr;
canvas.style.width = W + 'px';
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// ---------- Utilidades ----------
const k = (x, y) => x + ',' + y;
const parseK = s => s.split(',').map(Number);
const lerp = (a, b, t) => a + (b - a) * t;
const mdist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const terrainAt = (x, y) => TERRAIN[MAP[y][x]];
const unitAt = (x, y) => units.find(u => u.hp > 0 && u.x === x && u.y === y);
const alive = team => units.filter(u => u.hp > 0 && u.team === team);
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const isoX = (x, y) => (x - y) * TW / 2 + OX;
const isoY = (x, y) => (x + y) * TH / 2 + OY;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tween(ms, fn) {
  return new Promise(res => tweens.push({ e: 0, ms, fn, res }));
}

// ---------- Sonido (WebAudio mínimo) ----------
let AC = null;
function ensureAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
}
function beep(freq, dur, type = 'square', vol = 0.08, slide = 0) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), AC.currentTime + dur);
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g).connect(AC.destination);
  o.start(); o.stop(AC.currentTime + dur);
}
const SFX = {
  select: () => beep(880, 0.07, 'triangle', 0.06),
  move:   () => { beep(440, 0.05, 'triangle', 0.05); setTimeout(() => beep(520, 0.05, 'triangle', 0.05), 60); },
  shot:   () => beep(170, 0.12, 'square', 0.1, -120),
  hit:    () => beep(110, 0.15, 'sawtooth', 0.1, -60),
  death:  () => beep(300, 0.4, 'sawtooth', 0.09, -260),
  turn:   () => beep(220, 0.2, 'triangle', 0.07, 110),
  win:    () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.09), i * 130)),
  lose:   () => [400, 340, 280, 200].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth', 0.08), i * 160)),
};

// ---------- Unidades ----------
let uid = 0;
function makeUnit(type, name, x, y) {
  const t = TYPES[type];
  return {
    id: ++uid, type, name, team: t.team,
    x, y, gx: x, gy: y, face: t.team === 'player' ? 1 : -1,
    hp: t.hp, maxhp: t.hp, atk: t.atk, def: t.def, mov: t.mov,
    rmin: t.rmin, rmax: t.rmax, boss: !!t.boss, aggro: false, acted: false,
    bob: Math.random() * Math.PI * 2,
  };
}

function initGame() {
  uid = 0;
  units = START_UNITS.map(([t, n, x, y]) => makeUnit(t, n, x, y));
  effects = []; tweens = []; logHTML = [];
  Object.assign(game, {
    round: 1, phase: 'player', state: 'idle',
    selected: null, reach: null, targets: null, postTargets: null,
    hover: null, hoverUnit: null, busy: false, over: false, banner: null, shake: 0,
  });
  log('La patrulla entra al barrio por el oeste.', 'imp');
  showBanner('RONDA 1 — TU TURNO', '#39c5e0');
  refreshPanel();
}

// ---------- Movimiento (Dijkstra con costes) ----------
function bfsReach(u) {
  const dist = new Map([[k(u.x, u.y), { c: 0, prev: null }]]);
  const open = [{ x: u.x, y: u.y, c: 0 }];
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inMap(nx, ny)) continue;
      const t = terrainAt(nx, ny);
      if (t.block) continue;
      const occ = unitAt(nx, ny);
      if (occ && occ.team !== u.team) continue;      // los enemigos bloquean el paso
      const nc = cur.c + t.cost;
      if (nc > u.mov) continue;
      const key = k(nx, ny);
      if (!dist.has(key) || dist.get(key).c > nc) {
        dist.set(key, { c: nc, prev: k(cur.x, cur.y) });
        open.push({ x: nx, y: ny, c: nc });
      }
    }
  }
  return dist;
}

const canStop = (u, x, y) => { const o = unitAt(x, y); return !o || o === u; };

function reachStoppable(u, reach) {
  return [...reach.keys()].filter(key => { const [x, y] = parseK(key); return canStop(u, x, y); });
}

function pathTo(reach, destKey) {
  const path = [];
  let cur = destKey;
  while (cur) { path.unshift(parseK(cur)); cur = reach.get(cur).prev; }
  return path;
}

// Campo de distancias desde (tx,ty) ignorando unidades (para que la IA rodee edificios)
function distField(tx, ty) {
  const dist = new Map([[k(tx, ty), 0]]);
  const open = [{ x: tx, y: ty, c: 0 }];
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inMap(nx, ny) || terrainAt(nx, ny).block) continue;
      const nc = cur.c + terrainAt(nx, ny).cost;
      const key = k(nx, ny);
      if (!dist.has(key) || dist.get(key) > nc) { dist.set(key, nc); open.push({ x: nx, y: ny, c: nc }); }
    }
  }
  return dist;
}

// ---------- Combate ----------
function baseDmg(att, def) {
  return att.atk - def.def - terrainAt(def.x, def.y).def;
}
function forecastStr(att, def) {
  const b = baseDmg(att, def);
  return `${Math.max(1, b)}–${Math.max(1, b + 2)}`;
}
function rollDmg(att, def) {
  return Math.max(1, baseDmg(att, def) + Math.floor(Math.random() * 3));
}
function inAtkRange(u, tx, ty) {
  const d = mdist(u.x, u.y, tx, ty);
  return d >= u.rmin && d <= u.rmax;
}

// Enemigos atacables por u: Map(enemigo -> [claves de casilla desde donde atacar])
function attackOptions(u, reach) {
  const stops = reachStoppable(u, reach);
  const targets = new Map();
  for (const e of alive(u.team === 'player' ? 'enemy' : 'player')) {
    const tiles = stops.filter(key => {
      const [x, y] = parseK(key);
      const d = mdist(x, y, e.x, e.y);
      return d >= u.rmin && d <= u.rmax;
    });
    if (tiles.length) targets.set(e, tiles);
  }
  return targets;
}

function bestAttackTile(u, tiles, enemy) {
  let best = null, bestScore = -1e9;
  for (const key of tiles) {
    const [x, y] = parseK(key);
    const d = mdist(x, y, enemy.x, enemy.y);
    const noCounter = d < enemy.rmin || d > enemy.rmax ? 100 : 0;
    const score = noCounter + d * 2 + TERRAIN[MAP[y][x]].def * 3 - game.reach.get(key).c * 0.1;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}

// ---------- Animaciones de acción ----------
async function animMove(u, path) {
  if (path.length <= 1) return;
  SFX.move();
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const sdx = isoX(bx, by) - isoX(ax, ay);
    if (Math.abs(sdx) > 1) u.face = sdx > 0 ? 1 : -1;
    await tween(110, t => { u.gx = lerp(ax, bx, t); u.gy = lerp(ay, by, t); });
  }
  const [fx, fy] = path[path.length - 1];
  u.x = fx; u.y = fy; u.gx = fx; u.gy = fy;
}

function popup(x, y, text, color) {
  effects.push({
    life: 900, t: 0, sx: isoX(x, y), sy: isoY(x, y) - 46, text, color,
    update(dt) { this.t += dt; return this.t < this.life; },
    draw(c) {
      const p = this.t / this.life;
      c.globalAlpha = 1 - p * p;
      c.font = 'bold 17px "Segoe UI", sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
      c.strokeText(this.text, this.sx, this.sy - p * 26);
      c.fillStyle = this.color;
      c.fillText(this.text, this.sx, this.sy - p * 26);
      c.globalAlpha = 1;
    },
  });
}

function tracer(a, b) {
  const x1 = isoX(a.gx, a.gy), y1 = isoY(a.gx, a.gy) - 20;
  const x2 = isoX(b.gx, b.gy), y2 = isoY(b.gx, b.gy) - 16;
  effects.push({
    t: 0, life: 160,
    update(dt) { this.t += dt; return this.t < this.life; },
    draw(c) {
      c.globalAlpha = 1 - this.t / this.life;
      c.strokeStyle = '#ffd977'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.fillStyle = '#fff2c0';
      c.beginPath(); c.arc(x1 + (x2 - x1) * 0.15, y1 + (y2 - y1) * 0.15, 3.5, 0, 7); c.fill();
      c.globalAlpha = 1;
    },
  });
}

async function strike(att, def) {
  const sdx = isoX(def.x, def.y) - isoX(att.x, att.y);
  if (Math.abs(sdx) > 1) { att.face = sdx > 0 ? 1 : -1; def.face = -att.face; }
  const ranged = mdist(att.x, att.y, def.x, def.y) > 1;
  SFX.shot();
  if (ranged) {
    tracer(att, def);
    await tween(120, t => { att.gx = att.x - att.face * 0.08 * Math.sin(t * Math.PI) * ((att.gy - att.gy) + 1); });
    att.gx = att.x;
  } else {
    const ox = att.x, oy = att.y;
    await tween(150, t => {
      const s = Math.sin(t * Math.PI) * 0.35;
      att.gx = lerp(ox, def.x, s); att.gy = lerp(oy, def.y, s);
    });
    att.gx = ox; att.gy = oy;
  }
  const dmg = rollDmg(att, def);
  def.hp = Math.max(0, def.hp - dmg);
  game.shake = 6;
  SFX.hit();
  popup(def.x, def.y, '-' + dmg, '#ff6b5e');
  // alarma: el dañado y sus aliados cercanos entran en combate
  if (def.team === 'enemy') {
    for (const a of alive('enemy')) if (mdist(a.x, a.y, def.x, def.y) <= 3) a.aggro = true;
  }
  await sleep(300);
  if (def.hp <= 0) await kill(def, att);
}

async function kill(u, by) {
  SFX.death();
  await tween(350, t => { u.deathT = t; });
  u.hp = 0;
  if (u.boss) {
    const left = alive('enemy').filter(e => e.boss).length;
    log(`💀 <b>${u.name}</b> eliminado. Quedan <b>${left}</b> vendedores.`, 'imp');
    popup(u.x, u.y, '¡OBJETIVO!', '#e0b23c');
  } else {
    log(`${u.name} ${u.team === 'enemy' ? 'eliminado' : 'ha caído'}.`, u.team === 'enemy' ? 'good' : 'bad');
  }
  refreshPanel();
  checkEnd();
}

async function combat(att, def) {
  await strike(att, def);
  if (game.over) return;
  // contraataque
  if (def.hp > 0 && inAtkRange(def, att.x, att.y)) {
    await sleep(220);
    await strike(def, att);
  }
}

// ---------- Flujo del jugador ----------
function select(u) {
  game.selected = u;
  game.state = 'selected';
  game.reach = bfsReach(u);
  game.targets = attackOptions(u, game.reach);
  SFX.select();
  refreshPanel();
}

function deselect() {
  game.selected = null; game.reach = null; game.targets = null; game.postTargets = null;
  game.state = 'idle';
  $('waitBtn').style.display = 'none';
  refreshPanel();
}

async function finishAction(u) {
  u.acted = true;
  deselect();
  // si ya actuaron todos, pasar turno automáticamente
  if (!game.over && alive('player').every(p => p.acted)) {
    await sleep(350);
    endPlayerTurn();
  }
}

async function playerMoveTo(u, destKey) {
  game.busy = true;
  const path = pathTo(game.reach, destKey);
  await animMove(u, path);
  // objetivos alcanzables desde la nueva posición (sin volver a mover)
  const post = alive('enemy').filter(e => inAtkRange(u, e.x, e.y));
  if (post.length) {
    game.state = 'target';
    game.postTargets = post;
    $('waitBtn').style.display = 'block';
    game.busy = false;
    refreshPanel();
  } else {
    game.busy = false;
    await finishAction(u);
  }
}

async function playerEngage(u, enemy) {
  game.busy = true;
  const tile = bestAttackTile(u, game.targets.get(enemy), enemy);
  const path = pathTo(game.reach, tile);
  $('waitBtn').style.display = 'none';
  await animMove(u, path);
  await combat(u, enemy);
  game.busy = false;
  if (!game.over) await finishAction(u);
}

async function playerAttackFromHere(u, enemy) {
  game.busy = true;
  $('waitBtn').style.display = 'none';
  await combat(u, enemy);
  game.busy = false;
  if (!game.over) await finishAction(u);
}

function endPlayerTurn() {
  if (game.busy || game.over || game.phase !== 'player') return;
  deselect();
  enemyTurn();
}

// ---------- IA enemiga ----------
async function enemyTurn() {
  game.phase = 'enemy';
  game.busy = true;
  refreshPanel();
  SFX.turn();
  showBanner('TURNO ENEMIGO', '#e05555');
  await sleep(900);

  for (const e of [...alive('enemy')]) {
    if (game.over) break;
    if (e.hp <= 0) continue;
    const players = alive('player');
    if (!players.length) break;

    // activación
    if (!e.aggro) {
      const near = Math.min(...players.map(p => mdist(e.x, e.y, p.x, p.y)));
      if (near <= TYPES[e.type].aggro) e.aggro = true;
      else continue;
    }

    const reach = bfsReach(e);
    game.reach = reach; // para bestAttackTile
    const targets = attackOptions(e, reach);

    if (targets.size) {
      // elegir víctima: la que pueda rematar, si no la de menos HP
      let victim = null, vscore = -1e9;
      for (const [p] of targets) {
        const est = Math.max(1, baseDmg(e, p) + 1);
        const s = (p.hp <= est ? 100 : 0) + (e.maxhp - p.hp) * 2 + est;
        if (s > vscore) { vscore = s; victim = p; }
      }
      const tile = bestAttackTile(e, targets.get(victim), victim);
      await animMove(e, pathTo(reach, tile));
      await sleep(150);
      await combat(e, victim);
    } else if (!e.boss) {
      // acercarse al jugador más próximo rodeando obstáculos
      let target = players[0], bestD = 1e9, field = null;
      for (const p of players) {
        const f = distField(p.x, p.y);
        const d = f.get(k(e.x, e.y)) ?? 1e9;
        if (d < bestD) { bestD = d; target = p; field = f; }
      }
      if (field) {
        let bestKey = null, bestV = 1e9;
        for (const key of reachStoppable(e, reach)) {
          const v = (field.get(key) ?? 1e9) - TERRAIN[MAP[parseK(key)[1]][parseK(key)[0]]].def * 0.4;
          if (v < bestV) { bestV = v; bestKey = key; }
        }
        if (bestKey && bestKey !== k(e.x, e.y)) await animMove(e, pathTo(reach, bestKey));
      }
    }
    game.reach = null;
    if (game.over) break;
    await sleep(220);
  }

  if (game.over) return;
  // nuevo turno del jugador
  game.round++;
  game.phase = 'player';
  for (const u of alive('player')) u.acted = false;
  game.busy = false;
  SFX.turn();
  showBanner(`RONDA ${game.round} — TU TURNO`, '#39c5e0');
  refreshPanel();
}

// ---------- Fin de partida ----------
function checkEnd() {
  if (game.over) return;
  const dealers = alive('enemy').filter(e => e.boss);
  if (!dealers.length) return endGame(true);
  if (!alive('player').length) return endGame(false);
}

function endGame(win) {
  game.over = true; game.busy = true;
  const scr = $('endScreen'), title = $('endTitle');
  title.textContent = win ? '✔ Misión cumplida' : '✖ Patrulla aniquilada';
  title.className = win ? 'win' : 'lose';
  $('endText').textContent = win
    ? `El barrio queda limpio en ${game.round} rondas. Los vecinos vuelven a salir a la calle. Cobro transferido a la cuenta de la patrulla.`
    : 'Los vendedores conservan el control del barrio. El contrato se da por perdido.';
  setTimeout(() => { scr.style.display = 'flex'; }, 900);
  win ? SFX.win() : SFX.lose();
}

// ---------- Entrada ----------
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}
function pickTile(px, py) {
  // primero probar el cuerpo de las unidades (dibujadas por encima de su casilla)
  let best = null, bestD = 24;
  for (const u of units) {
    if (u.hp <= 0) continue;
    const d = Math.hypot(px - isoX(u.gx, u.gy), py - (isoY(u.gx, u.gy) - 16));
    if (d < bestD) { bestD = d; best = u; }
  }
  if (best) return [best.x, best.y, best];
  const rx = (px - OX) / (TW / 2), ry = (py - OY) / (TH / 2);
  const x = Math.floor((rx + ry) / 2), y = Math.floor((ry - rx) / 2);
  return inMap(x, y) ? [x, y, unitAt(x, y)] : [null, null, null];
}

canvas.addEventListener('click', e => {
  ensureAudio();
  if (game.busy || game.over || game.phase !== 'player') return;
  const [x, y, u] = pickTile(...canvasPos(e));
  if (x === null) return;

  if (game.state === 'idle') {
    if (u && u.team === 'player' && !u.acted) select(u);
    else { game.hoverUnit = u; refreshPanel(); }

  } else if (game.state === 'selected') {
    const sel = game.selected;
    if (u === sel) return deselect();
    if (u && u.team === 'player' && !u.acted) return select(u);
    if (u && u.team === 'enemy' && game.targets.has(u)) return void playerEngage(sel, u);
    const key = k(x, y);
    if (game.reach.has(key) && canStop(sel, x, y)) return void playerMoveTo(sel, key);
    deselect();

  } else if (game.state === 'target') {
    const sel = game.selected;
    if (u && u.team === 'enemy' && game.postTargets.includes(u)) return void playerAttackFromHere(sel, u);
    finishAction(sel);
  }
});

canvas.addEventListener('mousemove', e => {
  const [x, y, u] = pickTile(...canvasPos(e));
  game.hover = x === null ? null : [x, y];
  game.hoverUnit = u || null;
  refreshPanel();
});
canvas.addEventListener('mouseleave', () => { game.hover = null; game.hoverUnit = null; refreshPanel(); });

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (game.busy || game.over) return;
  if (game.state === 'target') finishAction(game.selected);
  else deselect();
});

window.addEventListener('keydown', e => {
  if (game.over) return;
  if (e.key === 'Escape') {
    if (game.busy) return;
    if (game.state === 'target') finishAction(game.selected);
    else deselect();
  }
  if (e.key.toLowerCase() === 'e') endPlayerTurn();
});

$('endTurnBtn').addEventListener('click', () => { ensureAudio(); endPlayerTurn(); });
$('waitBtn').addEventListener('click', () => { if (!game.busy && game.state === 'target') finishAction(game.selected); });
$('startBtn').addEventListener('click', () => { ensureAudio(); $('intro').style.display = 'none'; });
$('restartBtn').addEventListener('click', () => { $('endScreen').style.display = 'none'; initGame(); });

// ---------- Panel lateral ----------
function log(html, cls = '') {
  logHTML.unshift(`<div class="${cls}">${html}</div>`);
  logHTML = logHTML.slice(0, 30);
  $('log').innerHTML = logHTML.join('');
}

function unitCardHTML(u) {
  const t = TYPES[u.type];
  const pct = Math.round(100 * u.hp / u.maxhp);
  const tname = TERRAIN[MAP[u.y][u.x]].name;
  const tdef = TERRAIN[MAP[u.y][u.x]].def;
  return `
    <div class="uname ${u.team}">${u.name}${u.boss ? ' <span style="color:var(--gold)">$ OBJETIVO</span>' : ''}</div>
    <div style="color:var(--dim);font-size:11px">${t.label} · ${t.weapon}</div>
    <div class="hpbar"><div style="width:${pct}%"></div></div>
    <div class="stats">
      <span>PV <b>${u.hp}/${u.maxhp}</b></span>
      <span>ATQ <b>${u.atk}</b></span>
      <span>DEF <b>${u.def}</b></span>
      <span>MOV <b>${u.mov}</b></span>
      <span>Rango <b>${u.rmin === u.rmax ? u.rmax : u.rmin + '–' + u.rmax}</b></span>
      <span>Suelo <b>${tname}${tdef ? ' +' + tdef : ''}</b></span>
    </div>
    ${u.acted ? '<div style="color:var(--dim);margin-top:5px">✓ Ya actuó este turno</div>' : ''}`;
}

function refreshPanel() {
  const tl = $('turnLabel');
  if (game.phase === 'player') { tl.textContent = `Ronda ${game.round} — Patrulla`; tl.className = 'player'; }
  else { tl.textContent = `Ronda ${game.round} — Cartel`; tl.className = 'enemy'; }
  $('dealersLeft').textContent = alive('enemy').filter(e => e.boss).length;
  $('endTurnBtn').disabled = game.busy || game.over || game.phase !== 'player';

  const focus = game.hoverUnit || game.selected;
  $('unitInfo').innerHTML = focus
    ? unitCardHTML(focus)
    : (game.hover
        ? `<span style="color:var(--dim)">${TERRAIN[MAP[game.hover[1]][game.hover[0]]].name}${TERRAIN[MAP[game.hover[1]][game.hover[0]]].def ? ' · defensa +' + TERRAIN[MAP[game.hover[1]][game.hover[0]]].def : ''}</span>`
        : '<span style="color:var(--dim)">Pasa el cursor o selecciona una unidad</span>');

  // pronóstico
  const fb = $('forecastBox');
  const sel = game.selected, hov = game.hoverUnit;
  let show = false;
  if (sel && hov && hov.team === 'enemy') {
    let dist = null;
    if (game.state === 'target' && game.postTargets.includes(hov)) dist = mdist(sel.x, sel.y, hov.x, hov.y);
    else if (game.state === 'selected' && game.targets.has(hov)) {
      const tile = bestAttackTile(sel, game.targets.get(hov), hov);
      if (tile) dist = mdist(...parseK(tile), hov.x, hov.y);
    }
    if (dist !== null) {
      const counter = hov.hp > 0 && dist >= hov.rmin && dist <= hov.rmax;
      $('forecast').innerHTML = `
        <div class="frow"><span>Tu daño</span><b>${forecastStr(sel, hov)}</b></div>
        <div class="frow"><span>Contraataque</span><b>${counter ? forecastStr(hov, sel) : '—'}</b></div>`;
      show = true;
    }
  }
  fb.style.display = show ? 'block' : 'none';
}

function showBanner(text, color) {
  game.banner = { text, color, t: 0, life: 1600 };
}

// ============================================================
//                        RENDER
// ============================================================
function diamond(c, cx, cy, w = TW, h = TH) {
  c.beginPath();
  c.moveTo(cx, cy - h / 2);
  c.lineTo(cx + w / 2, cy);
  c.lineTo(cx, cy + h / 2);
  c.lineTo(cx - w / 2, cy);
  c.closePath();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawFloor() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = MAP[y][x], t = TERRAIN[ch];
      const cx = isoX(x, y), cy = isoY(x, y);
      const v = 0.94 + (hash(x, y) % 100) / 900;  // textura sutil
      diamond(ctx, cx, cy);
      ctx.fillStyle = shade(t.color, v);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // marcas viales en las calles principales
      if (ch === '.' && ((y === 4 && x % 2 === 0) || (x === 6 && y % 2 === 0))) {
        ctx.fillStyle = 'rgba(230,220,140,.5)';
        ctx.fillRect(cx - 5, cy - 1.5, 10, 3);
      }
    }
  }
}

function drawHighlights() {
  if (game.phase !== 'player' || game.busy) return;
  // alcance de movimiento
  if (game.state === 'selected' && game.reach) {
    const sel = game.selected;
    for (const key of game.reach.keys()) {
      const [x, y] = parseK(key);
      if (!canStop(sel, x, y)) continue;
      diamond(ctx, isoX(x, y), isoY(x, y), TW - 8, TH - 4);
      ctx.fillStyle = 'rgba(70,150,255,.30)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,190,255,.55)';
      ctx.stroke();
    }
    for (const e of game.targets.keys()) markTarget(e);
  }
  if (game.state === 'target') {
    for (const e of game.postTargets) markTarget(e);
  }
  // cursor
  if (game.hover) {
    const [x, y] = game.hover;
    diamond(ctx, isoX(x, y), isoY(x, y), TW - 4, TH - 2);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // marcador de selección
  if (game.selected) {
    const u = game.selected;
    const pulse = 0.6 + 0.4 * Math.sin(perf / 200);
    diamond(ctx, isoX(u.x, u.y), isoY(u.x, u.y), TW - 2, TH - 1);
    ctx.strokeStyle = `rgba(57,197,224,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function markTarget(e) {
  diamond(ctx, isoX(e.x, e.y), isoY(e.x, e.y), TW - 6, TH - 3);
  ctx.fillStyle = 'rgba(230,70,60,.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,110,95,.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;
}

// --- objetos altos y unidades, ordenados por profundidad ---
function drawTalls() {
  const items = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const ch = MAP[y][x];
      if (ch === 'B' || ch === 'T' || ch === 'C') items.push({ d: x + y, kind: ch, x, y });
    }
  for (const u of units)
    if (u.hp > 0 || u.deathT !== undefined)
      items.push({ d: u.gx + u.gy + 0.01, kind: 'unit', u });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.kind === 'B') drawBuilding(it.x, it.y);
    else if (it.kind === 'T') drawTree(it.x, it.y);
    else if (it.kind === 'C') drawCrates(it.x, it.y);
    else drawUnit(it.u);
  }
}

function drawBuilding(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const hgt = 46 + (hash(x, y) % 3) * 7;
  const base = ['#4a4f58', '#514b44', '#45505a'][hash(x, y) % 3];
  // cara izquierda
  ctx.fillStyle = shade(base, 0.55);
  ctx.beginPath();
  ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy + TH / 2);
  ctx.lineTo(cx, cy + TH / 2 - hgt); ctx.lineTo(cx - TW / 2, cy - hgt);
  ctx.closePath(); ctx.fill();
  // cara derecha
  ctx.fillStyle = shade(base, 0.75);
  ctx.beginPath();
  ctx.moveTo(cx + TW / 2, cy); ctx.lineTo(cx, cy + TH / 2);
  ctx.lineTo(cx, cy + TH / 2 - hgt); ctx.lineTo(cx + TW / 2, cy - hgt);
  ctx.closePath(); ctx.fill();
  // techo
  diamond(ctx, cx, cy - hgt);
  ctx.fillStyle = shade(base, 1.05);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  // ventanas
  for (let f = 0; f < 2; f++)
    for (let wnd = 0; wnd < 2; wnd++) {
      const lit = (hash(x * 3 + wnd, y * 5 + f) % 5) < 2;
      ctx.fillStyle = lit ? 'rgba(255,214,120,.85)' : 'rgba(20,24,30,.9)';
      ctx.fillRect(cx - 26 + wnd * 13, cy - hgt + 12 + f * 14, 7, 8);   // izq
      ctx.fillRect(cx + 8 + wnd * 13, cy - hgt + 12 + f * 14, 7, 8);    // der
    }
}

function drawTree(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 14, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#5d4433';
  ctx.fillRect(cx - 2.5, cy - 18, 5, 20);
  for (const [ox, oy, r, f] of [[-7, -22, 10, 0.85], [7, -24, 10, 0.95], [0, -32, 12, 1.1]]) {
    ctx.fillStyle = shade('#3e7a35', f);
    ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, 7); ctx.fill();
  }
}

function drawCrates(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const cube = (ox, oy, s, col) => {
    ctx.fillStyle = shade(col, 0.55);
    ctx.beginPath(); ctx.moveTo(cx + ox - s, cy + oy); ctx.lineTo(cx + ox, cy + oy + s / 2);
    ctx.lineTo(cx + ox, cy + oy + s / 2 - s); ctx.lineTo(cx + ox - s, cy + oy - s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(col, 0.78);
    ctx.beginPath(); ctx.moveTo(cx + ox + s, cy + oy); ctx.lineTo(cx + ox, cy + oy + s / 2);
    ctx.lineTo(cx + ox, cy + oy + s / 2 - s); ctx.lineTo(cx + ox + s, cy + oy - s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(col, 1.05);
    diamond(ctx, cx + ox, cy + oy - s, s * 2, s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
  };
  cube(-8, 2, 9, '#8a6a42');
  cube(9, 4, 9, '#8a6a42');
  cube(0, -6, 8, '#a07d4e');
}

// --- sprites de unidades ---
function drawUnit(u) {
  const cx = isoX(u.gx, u.gy), cy = isoY(u.gx, u.gy);
  ctx.save();
  ctx.translate(cx, cy);
  if (u.deathT !== undefined) {
    ctx.globalAlpha = 1 - u.deathT;
    ctx.translate(0, u.deathT * 6);
  }
  if (u.team === 'player' && u.acted && game.phase === 'player') ctx.filter = 'saturate(.15) brightness(.65)';

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, 2, 13, 5.5, 0, 0, 7); ctx.fill();

  const bob = Math.sin(perf / 400 + u.bob) * 1.2;
  ctx.translate(0, bob * (u.hp > 0 ? 1 : 0));
  ctx.scale(u.face, 1);

  const s = TYPES[u.type].sprite;
  if (s === 'dog') drawDog(u);
  else drawHumanoid(u, s);

  ctx.restore();
  ctx.filter = 'none';

  if (u.hp > 0) {
    // barra de vida
    const pct = u.hp / u.maxhp;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(cx - 16, cy - 44 + bob, 32, 5);
    ctx.fillStyle = pct > 0.5 ? '#5fbf60' : pct > 0.25 ? '#e0b23c' : '#e05555';
    ctx.fillRect(cx - 15, cy - 43 + bob, 30 * pct, 3);
    // marcador de objetivo
    if (u.boss) {
      const fl = Math.sin(perf / 250) * 3;
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
      ctx.strokeText('$', cx, cy - 50 + fl);
      ctx.fillStyle = '#e0b23c';
      ctx.fillText('$', cx, cy - 50 + fl);
      ctx.lineWidth = 1;
    }
  }
}

function drawHumanoid(u, kind) {
  const C = {
    merc:   { pants: '#26303a', torso: '#31485c', head: '#c9a17e', gear: 'helmet', gearCol: '#1d232b', gun: 12 },
    sniper: { pants: '#26303a', torso: '#3a4a3a', head: '#c9a17e', gear: 'hood',   gearCol: '#2c3a2c', gun: 19 },
    thug:   { pants: '#2c2c34', torso: '#7a2525', head: '#b98a63', gear: 'bandana',gearCol: '#c03030', gun: 0  },
    gunner: { pants: '#33303c', torso: '#54408a', head: '#b98a63', gear: 'hood',   gearCol: '#453472', gun: 8  },
    dealer: { pants: '#1c1c22', torso: '#25252d', head: '#b98a63', gear: 'cap',    gearCol: '#c8a028', gun: 0  },
  }[kind];

  // piernas
  ctx.fillStyle = C.pants;
  ctx.fillRect(-6, -10, 4.5, 10);
  ctx.fillRect(1.5, -10, 4.5, 10);
  // torso
  ctx.fillStyle = C.torso;
  rrect(-7.5, -25, 15, 16, 3);
  // detalle chaleco / cadena
  if (kind === 'merc' || kind === 'sniper') {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-5.5, -23, 11, 7);
    ctx.fillStyle = '#39c5e0';
    ctx.fillRect(-5.5, -16.5, 11, 1.8);       // franja de equipo
  }
  if (kind === 'dealer') {
    ctx.strokeStyle = '#e0b23c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -21, 5, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.lineWidth = 1;
  }
  // cabeza
  ctx.fillStyle = C.head;
  ctx.beginPath(); ctx.arc(0, -30, 6, 0, 7); ctx.fill();
  // tocado
  ctx.fillStyle = C.gearCol;
  if (C.gear === 'helmet') { ctx.beginPath(); ctx.arc(0, -31, 6.4, Math.PI, 0); ctx.fill(); ctx.fillRect(-6.4, -31, 12.8, 2.5); }
  if (C.gear === 'hood')   { ctx.beginPath(); ctx.arc(0, -30, 6.8, Math.PI * 0.85, Math.PI * 0.15); ctx.fill(); }
  if (C.gear === 'bandana'){ ctx.fillRect(-6, -33, 12, 3.5); }
  if (C.gear === 'cap')    { ctx.beginPath(); ctx.arc(0, -32, 6, Math.PI, 0); ctx.fill(); ctx.fillRect(0, -33, 9, 2.2); }
  // arma
  if (C.gun) {
    ctx.fillStyle = '#15161a';
    ctx.fillRect(2, -21, C.gun, 2.8);
    ctx.fillRect(2, -21, 3, 5);
  } else {
    ctx.fillStyle = '#c9ccd4';   // machete / navaja
    ctx.fillRect(5, -19, 8, 1.8);
  }
}

function drawDog(u) {
  // patas
  ctx.fillStyle = '#4a515b';
  for (const px of [-9, -4, 4, 9]) ctx.fillRect(px - 1.5, -8, 3, 8);
  // cuerpo
  ctx.fillStyle = '#9aa3ad';
  rrect(-12, -17, 24, 10, 4);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(-12, -13, 24, 1.5);            // línea de panel
  ctx.fillStyle = '#39c5e0';
  ctx.fillRect(-10, -16, 5, 2);               // distintivo de equipo
  // cabeza
  ctx.fillStyle = '#aab3bd';
  rrect(9, -22, 10, 8, 3);
  // ojo LED
  ctx.save();
  ctx.shadowColor = '#39e0ff'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#39e0ff';
  ctx.beginPath(); ctx.arc(16.5, -18, 2, 0, 7); ctx.fill();
  ctx.restore();
  // antena
  ctx.strokeStyle = '#6a727d';
  ctx.beginPath(); ctx.moveTo(-10, -17); ctx.lineTo(-14, -25); ctx.stroke();
  ctx.fillStyle = '#e05555';
  ctx.beginPath(); ctx.arc(-14, -25, 1.6, 0, 7); ctx.fill();
}

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

// ---------- Bucle principal ----------
let perf = 0, lastT = 0;
function frame(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t; perf = t;

  // avanzar tweens
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.e += dt;
    const p = Math.min(1, tw.e / tw.ms);
    tw.fn(p);
    if (p >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  // efectos
  for (let i = effects.length - 1; i >= 0; i--)
    if (!effects[i].update(dt)) effects.splice(i, 1);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 0.03);

  // dibujar
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (game.shake > 0.2)
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);

  drawFloor();
  drawHighlights();
  drawTalls();
  for (const fx of effects) fx.draw(ctx);

  // banner de turno
  if (game.banner) {
    const b = game.banner;
    b.t += dt;
    if (b.t > b.life) game.banner = null;
    else {
      const p = b.t / b.life;
      const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = 'rgba(8,10,14,.85)';
      ctx.fillRect(0, H / 2 - 34, W, 68);
      ctx.globalAlpha = a;
      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color; ctx.shadowBlur = 18;
      ctx.fillText(b.text, W / 2, H / 2 + 10);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  requestAnimationFrame(frame);
}

// ---------- Arranque ----------
if (location.search.includes('nointro')) $('intro').style.display = 'none';
initGame();
requestAnimationFrame(frame);
