'use strict';

/* ============================================================
   mapa.js — generación procedural de barrios (con semilla),
   niebla de guerra, visión y pathfinding.
   ============================================================ */

// ---------- Generación procedural ----------
// Un barrio: rejilla de calles que separan manzanas; cada manzana se rellena
// con edificios, parque o explanada; encima se riegan coberturas, bancas y cajas.
function generarMapa(semillaMapa, dificultad) {
  sembrar(semillaMapa);
  for (let intento = 0; intento < 30; intento++) {
    const m = _generarCandidato(dificultad);
    if (_conectado(m)) { m.semilla = semillaMapa; return m; }
  }
  // sin suerte con la semilla: mapa plano de emergencia (siempre conectado)
  const filas = 12, cols = 16;
  const celdas = Array.from({ length: filas }, () => Array(cols).fill('.'));
  return _armarMapa(celdas, filas, cols);
}

function _generarCandidato(dificultad) {
  const cols = 15 + Math.min(4, dificultad), filas = 11 + Math.min(3, Math.floor(dificultad / 2));
  const celdas = Array.from({ length: filas }, () => Array(cols).fill('B'));

  // 1) calles: 2-3 verticales y 2 horizontales que cruzan todo el barrio
  const callesV = [], callesH = [];
  let x = rndInt(2, 4);
  while (x < cols - 2) { callesV.push(x); x += rndInt(4, 6); }
  let y = rndInt(2, 4);
  while (y < filas - 2) { callesH.push(y); y += rndInt(3, 5); }
  for (const cx of callesV) for (let fy = 0; fy < filas; fy++) celdas[fy][cx] = '.';
  for (const cy of callesH) for (let fx = 0; fx < cols; fx++) celdas[cy][fx] = '.';

  // 2) aceras pegadas a las calles
  for (let fy = 0; fy < filas; fy++)
    for (let fx = 0; fx < cols; fx++) {
      if (celdas[fy][fx] !== 'B') continue;
      const vecinoCalle = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = fx + dx, ny = fy + dy;
        return nx >= 0 && ny >= 0 && nx < cols && ny < filas && celdas[ny][nx] === '.';
      });
      if (vecinoCalle && rnd() < 0.8) celdas[fy][fx] = ',';
    }

  // 3) borde oeste despejado (zona de entrada de la patrulla)
  for (let fy = 0; fy < filas; fy++)
    for (let fx = 0; fx < 2; fx++)
      if (celdas[fy][fx] === 'B') celdas[fy][fx] = ',';

  // 4) una o dos manzanas se vuelven parque (con árboles y bancas)
  const parques = rndInt(1, 2);
  for (let p = 0; p < parques; p++) {
    const px = rndInt(2, cols - 5), py = rndInt(1, filas - 4);
    for (let fy = py; fy < Math.min(filas, py + 3); fy++)
      for (let fx = px; fx < Math.min(cols, px + 4); fx++)
        if (celdas[fy][fx] === 'B') celdas[fy][fx] = 'G';
  }

  // 5) detalle sobre suelo transitable: árboles en parque, bancas, coberturas y cajas
  const cajas = rndInt(3, 4 + Math.min(2, dificultad));
  let cajasPuestas = 0;
  for (let fy = 0; fy < filas; fy++)
    for (let fx = 2; fx < cols; fx++) {
      const c = celdas[fy][fx];
      if (c === 'G' && rnd() < 0.12) celdas[fy][fx] = 'T';
      else if (c === 'G' && rnd() < 0.10) celdas[fy][fx] = 'N';
      else if (c === ',' && rnd() < 0.05) celdas[fy][fx] = 'N';
      else if ((c === '.' || c === ',') && rnd() < 0.06) celdas[fy][fx] = 'C';
    }
  // cajas: en celdas transitables lejos del spawn
  let intentos = 200;
  while (cajasPuestas < cajas && intentos-- > 0) {
    const fx = rndInt(Math.floor(cols * 0.3), cols - 1), fy = rndInt(0, filas - 1);
    if ('.,G'.includes(celdas[fy][fx])) { celdas[fy][fx] = 'J'; cajasPuestas++; }
  }

  return _armarMapa(celdas, filas, cols);
}

function _armarMapa(celdas, filas, cols) {
  return {
    celdas, filas, cols,
    // niebla: 0 oculto · 1 explorado (recuerdo, sin unidades) · 2 visible
    niebla: Array.from({ length: filas }, () => Array(cols).fill(0)),
    cajasAbiertas: new Set(),      // claves 'x,y' de cajas ya saqueadas
    bancasRotas: new Set(),        // bancas convertidas en palo
    fuego: new Map(),              // clave -> rondas restantes de incendio
  };
}

const terrenoEn = (x, y) => {
  const c = mapa.celdas[y][x];
  if (c === 'N' && mapa.bancasRotas.has(clave(x, y))) return TERRENOS[','];
  return TERRENOS[c];
};
const charEn = (x, y) => {
  const c = mapa.celdas[y][x];
  return (c === 'N' && mapa.bancasRotas.has(clave(x, y))) ? ',' : c;
};

// ---------- Conectividad (validación del generador) ----------
function _conectado(m) {
  // BFS desde la primera celda transitable del oeste: debe alcanzar >70% del suelo
  let inicio = null, transitables = 0;
  for (let fy = 0; fy < m.filas && !inicio; fy++)
    if (!TERRENOS[m.celdas[fy][0]].bloquea) inicio = [0, fy];
  if (!inicio) return false;
  for (let fy = 0; fy < m.filas; fy++)
    for (let fx = 0; fx < m.cols; fx++)
      if (!TERRENOS[m.celdas[fy][fx]].bloquea) transitables++;
  const visto = new Set([inicio.join(',')]);
  const cola = [inicio];
  while (cola.length) {
    const [cx, cy] = cola.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.filas) continue;
      if (TERRENOS[m.celdas[ny][nx]].bloquea) continue;
      const key = nx + ',' + ny;
      if (!visto.has(key)) { visto.add(key); cola.push([nx, ny]); }
    }
  }
  return visto.size / transitables > 0.7;
}

// ---------- Niebla de guerra ----------
function actualizarVision() {
  // lo visible pasa a explorado; recalcular visible desde cada unidad del jugador
  for (let fy = 0; fy < mapa.filas; fy++)
    for (let fx = 0; fx < mapa.cols; fx++)
      if (mapa.niebla[fy][fx] === 2) mapa.niebla[fy][fx] = 1;
  for (const u of vivos('jugador')) {
    const alcanceV = u.vision;
    for (let fy = Math.max(0, u.y - alcanceV); fy <= Math.min(mapa.filas - 1, u.y + alcanceV); fy++)
      for (let fx = Math.max(0, u.x - alcanceV); fx <= Math.min(mapa.cols - 1, u.x + alcanceV); fx++)
        if (mdist(u.x, u.y, fx, fy) <= alcanceV) mapa.niebla[fy][fx] = 2;
  }
}
const visible = (x, y) => mapa.niebla[y][x] === 2;
const explorado = (x, y) => mapa.niebla[y][x] >= 1;

// ---------- Pathfinding ----------
// Dijkstra limitado por movimiento. El dron vuela: ignora bloqueos (pero no
// puede terminar sobre edificio/árbol/banca).
function alcanceDe(u) {
  const dist = new Map([[clave(u.x, u.y), { c: 0, prev: null }]]);
  const abierta = [{ x: u.x, y: u.y, c: 0 }];
  while (abierta.length) {
    abierta.sort((a, b) => a.c - b.c);
    const cur = abierta.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!enMapa(nx, ny)) continue;
      const t = terrenoEn(nx, ny);
      if (t.bloquea && !u.vuela) continue;
      const ocupante = unidadEn(nx, ny);
      if (ocupante && ocupante.equipo !== u.equipo) continue;   // enemigos bloquean el paso
      const nc = cur.c + (u.vuela ? 1 : t.costo);
      if (nc > u.mov) continue;
      const key = clave(nx, ny);
      if (!dist.has(key) || dist.get(key).c > nc) {
        dist.set(key, { c: nc, prev: clave(cur.x, cur.y) });
        abierta.push({ x: nx, y: ny, c: nc });
      }
    }
  }
  return dist;
}

const puedeParar = (u, x, y) => {
  if (terrenoEn(x, y).bloquea) return false;   // el dron sobrevuela pero no aterriza ahí
  const o = unidadEn(x, y);
  return !o || o === u;
};

function paradasDe(u, alcance) {
  return [...alcance.keys()].filter(key => { const [x, y] = desClave(key); return puedeParar(u, x, y); });
}

function rutaHacia(alcance, destinoClave) {
  const ruta = [];
  let cur = destinoClave;
  while (cur) { ruta.unshift(desClave(cur)); cur = alcance.get(cur).prev; }
  return ruta;
}

// Campo de distancias hacia (tx,ty) ignorando unidades (para que la IA rodee manzanas)
function campoHacia(tx, ty) {
  const dist = new Map([[clave(tx, ty), 0]]);
  const abierta = [{ x: tx, y: ty, c: 0 }];
  while (abierta.length) {
    abierta.sort((a, b) => a.c - b.c);
    const cur = abierta.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!enMapa(nx, ny) || terrenoEn(nx, ny).bloquea) continue;
      const nc = cur.c + terrenoEn(nx, ny).costo;
      const key = clave(nx, ny);
      if (!dist.has(key) || dist.get(key) > nc) { dist.set(key, nc); abierta.push({ x: nx, y: ny, c: nc }); }
    }
  }
  return dist;
}

// Celda transitable libre más cercana a (x,y) — para spawns y reclutas
function celdaLibreCerca(x, y) {
  const cola = [[x, y]], visto = new Set([clave(x, y)]);
  while (cola.length) {
    const [cx, cy] = cola.shift();
    if (enMapa(cx, cy) && !terrenoEn(cx, cy).bloquea && !unidadEn(cx, cy) && charEn(cx, cy) !== 'J') return [cx, cy];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const key = clave(cx + dx, cy + dy);
      if (!visto.has(key)) { visto.add(key); cola.push([cx + dx, cy + dy]); }
    }
  }
  return [x, y];
}

// ---------- Origen del render según tamaño del mapa ----------
function centrarCamara() {
  OX = (mapa.filas - 1) * TW / 2 + TW / 2 + (W - (mapa.cols + mapa.filas) * TW / 2) / 2;
  OY = Math.max(70, (H - (mapa.cols + mapa.filas) * TH / 2) / 2 + 30);
}
