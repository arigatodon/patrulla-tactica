'use strict';

/* ============================================================
   render.js — dibujo isométrico: suelo con niebla, resaltados,
   edificios/props, loot con aura de rareza, unidades y efectos.
   ============================================================ */

let reloj = 0;   // ms de animación (lo avanza principal.js)

function rombo(c, cx, cy, w = TW, h = TH) {
  c.beginPath();
  c.moveTo(cx, cy - h / 2); c.lineTo(cx + w / 2, cy);
  c.lineTo(cx, cy + h / 2); c.lineTo(cx - w / 2, cy);
  c.closePath();
}
function sombrear(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}
const hashCelda = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

// ---------- Suelo + niebla ----------
function dibujarSuelo() {
  for (let y = 0; y < mapa.filas; y++)
    for (let x = 0; x < mapa.cols; x++) {
      const nb = mapa.niebla[y][x];
      const cx = isoX(x, y), cy = isoY(x, y);
      if (nb === 0) {   // oculto: rombo negro apenas insinuado
        rombo(ctx, cx, cy);
        ctx.fillStyle = '#0b0d11';
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,45,55,.25)';
        ctx.stroke();
        continue;
      }
      const ch = charEn(x, y), t = TERRENOS[ch];
      const v = 0.94 + (hashCelda(x, y) % 100) / 900;
      rombo(ctx, cx, cy);
      ctx.fillStyle = sombrear(t.color, v * (nb === 1 ? 0.45 : 1));   // explorado: penumbra
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.stroke();
      if (nb === 2 && ch === '.' && (x + y) % 3 === 0) {
        ctx.fillStyle = 'rgba(230,220,140,.4)';
        ctx.fillRect(cx - 5, cy - 1.5, 10, 3);
      }
      // fuego en celda visible
      if (nb === 2 && mapa.fuego.has(clave(x, y))) {
        const ll = 0.6 + 0.4 * Math.sin(reloj / 90 + x * 7);
        ctx.fillStyle = `rgba(255,${110 + 60 * ll | 0},30,${0.45 * ll + 0.25})`;
        rombo(ctx, cx, cy, TW - 14, TH - 7);
        ctx.fill();
      }
    }
}

// ---------- Resaltados de juego ----------
function dibujarResaltados() {
  if (partida.fase !== 'jugador' || partida.ocupado) return;
  if (partida.estado === 'seleccion' && partida.alcance) {
    const sel = partida.seleccion;
    for (const key of partida.alcance.keys()) {
      const [x, y] = desClave(key);
      if (!puedeParar(sel, x, y)) continue;
      rombo(ctx, isoX(x, y), isoY(x, y), TW - 8, TH - 4);
      ctx.fillStyle = 'rgba(70,150,255,.30)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,190,255,.55)';
      ctx.stroke();
    }
    for (const e of partida.blancos.keys()) marcarBlanco(e);
  }
  if (partida.estado === 'objetivo')
    for (const e of partida.postBlancos) marcarBlanco(e);

  if (partida.hover) {
    const [x, y] = partida.hover;
    rombo(ctx, isoX(x, y), isoY(x, y), TW - 4, TH - 2);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  }
  if (partida.seleccion && partida.estado !== 'telefono') {
    const u = partida.seleccion;
    const pulso = 0.6 + 0.4 * Math.sin(reloj / 200);
    rombo(ctx, isoX(u.x, u.y), isoY(u.x, u.y), TW - 2, TH - 1);
    ctx.strokeStyle = `rgba(57,197,224,${pulso})`;
    ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 1;
  }
}
function marcarBlanco(e) {
  rombo(ctx, isoX(e.x, e.y), isoY(e.x, e.y), TW - 6, TH - 3);
  ctx.fillStyle = 'rgba(230,70,60,.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,110,95,.9)';
  ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
}

// ---------- Objetos altos, loot y unidades (orden por profundidad) ----------
function dibujarAltos() {
  const items = [];
  for (let y = 0; y < mapa.filas; y++)
    for (let x = 0; x < mapa.cols; x++) {
      if (!explorado(x, y)) continue;
      const ch = mapa.celdas[y][x];
      if (ch === 'B' || ch === 'T') items.push({ d: x + y, tipo: ch, x, y });
      else if (ch === 'C') items.push({ d: x + y, tipo: 'C', x, y });
      else if (ch === 'N' && !mapa.bancasRotas.has(clave(x, y))) items.push({ d: x + y, tipo: 'N', x, y });
      else if (ch === 'J' && !mapa.cajasAbiertas.has(clave(x, y))) items.push({ d: x + y, tipo: 'J', x, y });
    }
  for (const s of sueltos)
    if (visible(s.x, s.y)) items.push({ d: s.x + s.y, tipo: 'suelto', s });
  for (const u of unidades) {
    if (u.pv <= 0 && u.animMuerte === undefined) continue;
    const vis = u.equipo === 'jugador' || visible(Math.round(u.gx), Math.round(u.gy));
    if (vis) items.push({ d: u.gx + u.gy + 0.01, tipo: 'unidad', u });
  }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.tipo === 'B') dibujarEdificio(it.x, it.y);
    else if (it.tipo === 'T') dibujarArbol(it.x, it.y);
    else if (it.tipo === 'C') dibujarCobertura(it.x, it.y);
    else if (it.tipo === 'N') dibujarBanca(it.x, it.y);
    else if (it.tipo === 'J') dibujarCaja(it.x, it.y);
    else if (it.tipo === 'suelto') dibujarSuelto(it.s);
    else dibujarUnidad(it.u);
  }
}

function dibujarEdificio(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const oscuro = mapa.niebla[y][x] === 1 ? 0.5 : 1;
  const alto = 46 + (hashCelda(x, y) % 3) * 7;
  const base = ['#4a4f58', '#514b44', '#45505a'][hashCelda(x, y) % 3];
  ctx.fillStyle = sombrear(base, 0.55 * oscuro);
  ctx.beginPath();
  ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy + TH / 2);
  ctx.lineTo(cx, cy + TH / 2 - alto); ctx.lineTo(cx - TW / 2, cy - alto);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = sombrear(base, 0.75 * oscuro);
  ctx.beginPath();
  ctx.moveTo(cx + TW / 2, cy); ctx.lineTo(cx, cy + TH / 2);
  ctx.lineTo(cx, cy + TH / 2 - alto); ctx.lineTo(cx + TW / 2, cy - alto);
  ctx.closePath(); ctx.fill();
  rombo(ctx, cx, cy - alto);
  ctx.fillStyle = sombrear(base, 1.05 * oscuro);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  for (let f = 0; f < 2; f++)
    for (let w = 0; w < 2; w++) {
      const luz = (hashCelda(x * 3 + w, y * 5 + f) % 5) < 2 && oscuro === 1;
      ctx.fillStyle = luz ? 'rgba(255,214,120,.85)' : 'rgba(20,24,30,.9)';
      ctx.fillRect(cx - 26 + w * 13, cy - alto + 12 + f * 14, 7, 8);
      ctx.fillRect(cx + 8 + w * 13, cy - alto + 12 + f * 14, 7, 8);
    }
}

function dibujarArbol(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const oscuro = mapa.niebla[y][x] === 1 ? 0.5 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 14, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = sombrear('#5d4433', oscuro);
  ctx.fillRect(cx - 2.5, cy - 18, 5, 20);
  for (const [ox, oy, r, f] of [[-7, -22, 10, 0.85], [7, -24, 10, 0.95], [0, -32, 12, 1.1]]) {
    ctx.fillStyle = sombrear('#3e7a35', f * oscuro);
    ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, 7); ctx.fill();
  }
}

function dibujarCobertura(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const oscuro = mapa.niebla[y][x] === 1 ? 0.5 : 1;
  _cubo(cx - 8, cy + 2, 9, '#8a6a42', oscuro);
  _cubo(cx + 9, cy + 4, 9, '#8a6a42', oscuro);
  _cubo(cx, cy - 6, 8, '#a07d4e', oscuro);
}
function _cubo(cx, cy, s, col, f = 1) {
  ctx.fillStyle = sombrear(col, 0.55 * f);
  ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx, cy + s / 2);
  ctx.lineTo(cx, cy + s / 2 - s); ctx.lineTo(cx - s, cy - s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = sombrear(col, 0.78 * f);
  ctx.beginPath(); ctx.moveTo(cx + s, cy); ctx.lineTo(cx, cy + s / 2);
  ctx.lineTo(cx, cy + s / 2 - s); ctx.lineTo(cx + s, cy - s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = sombrear(col, 1.05 * f);
  rombo(ctx, cx, cy - s, s * 2, s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke();
}

function dibujarBanca(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  const oscuro = mapa.niebla[y][x] === 1 ? 0.5 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 16, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = sombrear('#7b5a38', oscuro);   // patas
  ctx.fillRect(cx - 13, cy - 8, 3, 9); ctx.fillRect(cx + 10, cy - 8, 3, 9);
  ctx.fillStyle = sombrear('#9a7448', oscuro);   // asiento
  ctx.fillRect(cx - 16, cy - 12, 32, 5);
  ctx.fillStyle = sombrear('#8a6540', oscuro);   // respaldo
  ctx.fillRect(cx - 16, cy - 22, 32, 4);
}

function dibujarCaja(x, y) {
  const cx = isoX(x, y), cy = isoY(x, y);
  if (visible(x, y)) {   // aura pulsante: aquí hay botín
    const p = 0.5 + 0.5 * Math.sin(reloj / 300 + x);
    ctx.fillStyle = `rgba(240,192,64,${0.10 + 0.12 * p})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, 26 + p * 4, 13 + p * 2, 0, 0, 7); ctx.fill();
  }
  _cubo(cx, cy - 2, 10, '#b08030', mapa.niebla[y][x] === 1 ? 0.5 : 1);
  ctx.strokeStyle = 'rgba(60,40,10,.8)';
  ctx.strokeRect(cx - 4, cy - 16, 8, 8);
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#3a2a10';
  ctx.fillText('?', cx, cy - 9);
}

// loot tirado en el piso con su aura de rareza
function dibujarSuelto(s) {
  const cx = isoX(s.x, s.y), cy = isoY(s.x, s.y);
  const rz = rarezaDe(s.item);
  if (rz.aura) {
    const p = 0.5 + 0.5 * Math.sin(reloj / 250 + s.x * 3);
    const g = ctx.createRadialGradient(cx, cy - 6, 2, cx, cy - 6, 22 + p * 5);
    g.addColorStop(0, rz.aura + 'aa');
    g.addColorStop(1, rz.aura + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy - 4, 24 + p * 5, 14 + p * 3, 0, 0, 7); ctx.fill();
  }
  const flote = Math.sin(reloj / 350 + s.y) * 2;
  ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(defDe(s.item).icono, cx, cy - 6 + flote);
}

// ---------- Unidades ----------
function dibujarUnidad(u) {
  const cx = isoX(u.gx, u.gy), cy = isoY(u.gx, u.gy);
  ctx.save();
  ctx.translate(cx, cy);
  if (u.animMuerte !== undefined) {
    ctx.globalAlpha = 1 - u.animMuerte;
    ctx.translate(0, u.animMuerte * 6);
  }
  if (u.equipo === 'jugador' && u.actuo && partida.fase === 'jugador')
    ctx.filter = 'saturate(.15) brightness(.65)';

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  const altura = u.vuela ? -18 : 0;   // el dron flota
  ctx.beginPath(); ctx.ellipse(0, 2, u.vuela ? 9 : 13, u.vuela ? 4 : 5.5, 0, 0, 7); ctx.fill();

  const bob = Math.sin(reloj / 400 + u.balanceo) * (u.vuela ? 3 : 1.2);
  ctx.translate(0, (u.pv > 0 ? bob : 0) + altura);
  ctx.scale(u.cara, 1);

  const S = {
    lider: dibHumano, tecnico: dibHumano, flaco: dibHumano, vecino: dibHumano,
    soldado: dibHumano, pistolero: dibHumano, sapo: dibHumano, vendedor: dibHumano,
    dron: dibDron,
  }[u.sprite] || dibHumano;
  S(u);

  ctx.restore();
  ctx.filter = 'none';

  if (u.pv > 0) {
    const pct = u.pv / u.pvMax;
    const yBar = cy - 44 + bob + altura;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(cx - 16, yBar, 32, 5);
    ctx.fillStyle = pct > 0.5 ? '#5fbf60' : pct > 0.25 ? '#e0b23c' : '#e05555';
    ctx.fillRect(cx - 15, yBar + 1, 30 * pct, 3);
    if (u.jefe) _insignia(cx, yBar - 6, '$', '#f0c040');
    else if (u.sapo) _insignia(cx, yBar - 6, u.marcado ? '📸' : '?', '#ff9040');
    else if (u.marcado) _insignia(cx, yBar - 6, '📸', '#57c8e8');
    if (u.aturdido > 0) _insignia(cx + 14, yBar - 2, '⚡', '#57c8e8');
  }
}

function _insignia(x, y, txt, color) {
  const fl = Math.sin(reloj / 250) * 2.5;
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
  ctx.strokeText(txt, x, y + fl);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y + fl);
  ctx.lineWidth = 1;
}

// humano genérico parametrizado por sprite
function dibHumano(u) {
  const P = {
    lider:     { pant: '#4a3a4a', torso: '#8a4a6a', cab: '#8a5c3a', toca: 'moño',   tocaCol: '#3a3a44', arma: true },
    tecnico:   { pant: '#26303a', torso: '#2a6a5a', cab: '#c9a17e', toca: 'gorra',  tocaCol: '#39c5e0', arma: true },
    flaco:     { pant: '#33424e', torso: '#c8b060', cab: '#8a5c3a', toca: 'gorro',  tocaCol: '#d8d0c0', arma: true },
    vecino:    { pant: '#3a3a44', torso: '#5a7a4a', cab: '#b98a63', toca: 'gorra',  tocaCol: '#5a7a4a', arma: true },
    soldado:   { pant: '#2c2c34', torso: '#7a2525', cab: '#b98a63', toca: 'bandana',tocaCol: '#c03030', arma: true },
    pistolero: { pant: '#33303c', torso: '#54408a', cab: '#b98a63', toca: 'capucha',tocaCol: '#453472', arma: true },
    sapo:      { pant: '#4a4a3a', torso: '#8a8a6a', cab: '#c9a17e', toca: 'gorra',  tocaCol: '#6a6a5a', arma: false },
    vendedor:  { pant: '#1c1c22', torso: '#25252d', cab: '#b98a63', toca: 'gorra',  tocaCol: '#c8a028', arma: true },
  }[u.sprite];

  ctx.fillStyle = P.pant;
  ctx.fillRect(-6, -10, 4.5, 10); ctx.fillRect(1.5, -10, 4.5, 10);
  ctx.fillStyle = P.torso;
  rrect(-7.5, -25, 15, 16, 3);
  if (u.equipo === 'jugador') {   // brazalete de la patrulla
    ctx.fillStyle = '#39c5e0';
    ctx.fillRect(-7.5, -17, 15, 2);
  }
  if (u.sprite === 'vendedor') {
    ctx.strokeStyle = '#e0b23c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -21, 5, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.fillStyle = P.cab;
  ctx.beginPath(); ctx.arc(0, -30, 6, 0, 7); ctx.fill();
  ctx.fillStyle = P.tocaCol;
  if (P.toca === 'gorra')   { ctx.beginPath(); ctx.arc(0, -32, 6, Math.PI, 0); ctx.fill(); ctx.fillRect(0, -33, 9, 2.2); }
  if (P.toca === 'capucha') { ctx.beginPath(); ctx.arc(0, -30, 6.8, Math.PI * 0.85, Math.PI * 0.15); ctx.fill(); }
  if (P.toca === 'bandana') { ctx.fillRect(-6, -33, 12, 3.5); }
  if (P.toca === 'gorro')   { ctx.beginPath(); ctx.arc(0, -32, 6, Math.PI, 0); ctx.fill(); }
  if (P.toca === 'moño')    { ctx.beginPath(); ctx.arc(0, -37, 3.5, 0, 7); ctx.fill(); }

  // arma equipada (icono simplificado en línea)
  if (P.arma && u.arma) {
    const a = ARMAS[u.arma.id];
    ctx.fillStyle = '#15161a';
    if (a.tipo === 'distancia') { ctx.fillRect(2, -21, 11, 2.8); ctx.fillRect(2, -21, 3, 5); }
    else if (u.arma.id !== 'punos') {
      ctx.fillStyle = u.arma.id === 'katana' ? '#d8dce4' : '#8a7050';
      ctx.save(); ctx.translate(6, -18); ctx.rotate(-0.5);
      ctx.fillRect(0, 0, u.arma.id === 'katana' ? 16 : 11, 2.2);
      ctx.restore();
    }
  }
}

function dibDron(u) {
  // rotores
  const giro = reloj / 30;
  ctx.strokeStyle = 'rgba(200,210,220,.5)';
  for (const px of [-11, 11]) {
    ctx.beginPath();
    ctx.ellipse(px, -18, 7 * Math.abs(Math.sin(giro)), 2.5, 0, 0, 7);
    ctx.stroke();
    ctx.fillStyle = '#6a727d';
    ctx.fillRect(px - 1, -17, 2, 4);
  }
  // cuerpo
  ctx.fillStyle = '#9aa3ad';
  rrect(-9, -15, 18, 8, 3);
  ctx.fillStyle = '#39c5e0';
  ctx.fillRect(-7, -14, 4, 2);
  // cámara (ojo)
  ctx.save();
  ctx.shadowColor = '#39e0ff'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#39e0ff';
  ctx.beginPath(); ctx.arc(5, -9, 2.2, 0, 7); ctx.fill();
  ctx.restore();
  // tren de aterrizaje
  ctx.strokeStyle = '#6a727d';
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-6, -3); ctx.moveTo(6, -7); ctx.lineTo(6, -3); ctx.stroke();
}

// ---------- Efectos ----------
function flotante(x, y, texto, color) {
  efectos.push({
    vida: 950, t: 0, sx: isoX(x, y), sy: isoY(x, y) - 46, texto, color,
    update(dt) { this.t += dt; return this.t < this.vida; },
    draw(c) {
      const p = this.t / this.vida;
      c.globalAlpha = 1 - p * p;
      c.font = 'bold 16px "Segoe UI", sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
      c.strokeText(this.texto, this.sx, this.sy - p * 26);
      c.fillStyle = this.color;
      c.fillText(this.texto, this.sx, this.sy - p * 26);
      c.globalAlpha = 1;
    },
  });
}

function trazadora(a, b) { trazadoraXY(a, b.gx, b.gy); }
function trazadoraXY(a, tx, ty) {
  const x1 = isoX(a.gx, a.gy), y1 = isoY(a.gx, a.gy) - 20;
  const x2 = isoX(tx, ty), y2 = isoY(tx, ty) - 10;
  efectos.push({
    t: 0, vida: 170,
    update(dt) { this.t += dt; return this.t < this.vida; },
    draw(c) {
      c.globalAlpha = 1 - this.t / this.vida;
      c.strokeStyle = '#ffd977'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.globalAlpha = 1;
    },
  });
}

function explosion(x, y) {
  const sx = isoX(x, y), sy = isoY(x, y);
  efectos.push({
    t: 0, vida: 450,
    update(dt) { this.t += dt; return this.t < this.vida; },
    draw(c) {
      const p = this.t / this.vida;
      c.globalAlpha = 1 - p;
      c.fillStyle = p < 0.4 ? '#ffd977' : '#ff7030';
      c.beginPath(); c.ellipse(sx, sy - 6, 20 + p * 40, 12 + p * 22, 0, 0, 7); c.fill();
      c.globalAlpha = 1;
    },
  });
}

function destelloFoto(x, y) {
  const sx = isoX(x, y), sy = isoY(x, y);
  efectos.push({
    t: 0, vida: 350,
    update(dt) { this.t += dt; return this.t < this.vida; },
    draw(c) {
      const p = this.t / this.vida;
      c.globalAlpha = (1 - p) * 0.9;
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.5;
      c.strokeRect(sx - 24, sy - 44, 48, 48);
      c.globalAlpha = 1; c.lineWidth = 1;
    },
  });
}

// ---------- Movimiento animado ----------
async function animMover(u, ruta) {
  if (ruta.length <= 1) return;
  SFX.mover();
  for (let i = 1; i < ruta.length; i++) {
    const [ax, ay] = ruta[i - 1], [bx, by] = ruta[i];
    const sdx = isoX(bx, by) - isoX(ax, ay);
    if (Math.abs(sdx) > 1) u.cara = sdx > 0 ? 1 : -1;
    await interpolar(u.vuela ? 80 : 110, t => { u.gx = lerp(ax, bx, t); u.gy = lerp(ay, by, t); });
  }
  const [fx, fy] = ruta[ruta.length - 1];
  u.x = fx; u.y = fy; u.gx = fx; u.gy = fy;
  if (u.equipo === 'jugador') actualizarVision();
}

// ---------- Banner ----------
function mostrarBanner(texto, color) {
  partida.banner = { texto, color, t: 0, vida: 1600 };
}
function dibujarBanner(dt) {
  if (!partida.banner) return;
  const b = partida.banner;
  b.t += dt;
  if (b.t > b.vida) { partida.banner = null; return; }
  const p = b.t / b.vida;
  const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = 'rgba(8,10,14,.85)';
  ctx.fillRect(0, H / 2 - 34, W, 68);
  ctx.globalAlpha = a;
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = b.color;
  ctx.shadowColor = b.color; ctx.shadowBlur = 18;
  ctx.fillText(b.texto, W / 2, H / 2 + 10);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
