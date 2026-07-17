'use strict';

/* ============================================================
   PATRULLAS — Cartagena se levanta
   nucleo.js — canvas, RNG con semilla, constantes y estado global
   (arquitectura estilo katana_fight: scripts clásicos, scope global)
   ============================================================ */

// ---------- Render isométrico ----------
const TW = 72, TH = 36;              // losa isométrica
const W = 960, H = 600;
let OX = 480, OY = 90;               // origen (se recalcula por mapa)
let zoom = 1;                        // zoom efectivo = zoomFit * zoomExtra
let zoomFit = 1;                     // encuadre automático para mapas grandes
let zoomExtra = 1;                   // zoom manual del jugador (rueda / pellizco)
let panX = 0, panY = 0;              // paneo de cámara en coordenadas de mundo
let rotacion = 0;                    // vista girada en pasos de 90° (0..3)

// Rotación de cámara: convierte coordenadas de rejilla a coordenadas de
// dibujo según la orientación actual. Sirve para ver bloques tapados.
function aRender(x, y) {
  if (!mapa || rotacion === 0) return [x, y];
  const mc = mapa.cols - 1, mf = mapa.filas - 1;
  if (rotacion === 1) return [mf - y, x];
  if (rotacion === 2) return [mc - x, mf - y];
  return [y, mc - x];                // rotacion 3
}
function desRender(rx, ry) {
  if (!mapa || rotacion === 0) return [rx, ry];
  const mc = mapa.cols - 1, mf = mapa.filas - 1;
  if (rotacion === 1) return [ry, mf - rx];
  if (rotacion === 2) return [mc - rx, mf - ry];
  return [mc - ry, rx];              // rotacion 3
}
// dimensiones del mapa tal como se dibuja (giradas en 90°/270°)
const colsRender = () => !mapa ? 1 : (rotacion % 2 ? mapa.filas : mapa.cols);
const filasRender = () => !mapa ? 1 : (rotacion % 2 ? mapa.cols : mapa.filas);
const profundidad = (x, y) => { const [rx, ry] = aRender(x, y); return rx + ry; };

// ---------- Constantes de juego ----------
const VISION_HUMANO = 3;
const VISION_DRON = 5;
const CARTAS_PARA_OPERATIVO = 3;     // cartas municipales → habilidad global
const RONDAS_OPERATIVO = 3;          // rondas que dura la disuasión
const COSTO_CONVOCAR = 25;           // respeto para convocar un vecino
const RESPETO_MAX = 100;

// ---------- RNG con semilla (mulberry32, como katana_fight) ----------
// Todo azar de partida (mapa, drops, daño) pasa por rnd(); lo visual puede usar Math.random.
let _semilla = 1;
function sembrar(s) { _semilla = s >>> 0; }
function rnd() {
  _semilla |= 0; _semilla = (_semilla + 0x6D2B79F5) | 0;
  let t = Math.imul(_semilla ^ (_semilla >>> 15), 1 | _semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rndInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));   // ambos inclusive
const rndDe = arr => arr[Math.floor(rnd() * arr.length)];
function rndPeso(items) {           // items: [{peso, ...}] → uno al azar por peso
  const total = items.reduce((s, i) => s + i.peso, 0);
  let r = rnd() * total;
  for (const i of items) { r -= i.peso; if (r <= 0) return i; }
  return items[items.length - 1];
}

// ---------- Estado global mutable ----------
let mapa = null;          // ver mapa.js: {celdas, filas, cols, niebla, props}
let unidades = [];
let sueltos = [];         // objetos tirados en el piso: {x, y, item}
let efectos = [], tweens = [];
let uid = 0;

const partida = {
  barrio: 1,              // nº de barrio (dificultad)
  nombreBarrio: '',
  ronda: 1,
  fase: 'jugador',        // 'jugador' | 'enemigo'
  estado: 'idle',         // 'idle' | 'seleccion' | 'objetivo' | 'telefono'
  seleccion: null, alcance: null, blancos: null, postBlancos: null,
  hover: null, hoverUnidad: null,
  ocupado: false, terminada: false,
  banner: null, sacudida: 0,
  operativoRondas: 0,     // rondas restantes del operativo municipal
  fotosEsteTurno: 0,
  hazanas: [],            // hechos publicables acumulados del turno
  tipoMision: 'jefe',     // 'molotov' | 'jefe' | 'final'
  apagonRondas: 0,        // habilidad crew: banda medio ciega
  murgaRondas: 0,         // habilidad crew: la banda pierde la ronda
  usosHabilidad: {},      // usos restantes por habilidad esta misión
};

// Progreso persistente entre misiones
const cruzada = {
  version: 1,
  barrio: 1,
  respeto: 10,
  cartas: 0,
  operativoUsado: false,   // se repone al empezar misión si hay cartas
  habilidades: [],         // ids de habilidades de crew ganadas (datos.js)
  plantilla: null,         // roster guardado (se crea en unidades.js)
};

// ---------- Guardado ----------
const CLAVE_SAVE = 'patrullas_save_v1';
function guardar() {
  try {
    cruzada.plantilla = unidades
      .filter(u => u.equipo === 'jugador' && u.pv > 0)
      .map(u => ({
        clase: u.clase, nombre: u.nombre, nivel: u.nivel, exp: u.exp,
        stats: { ...u.stats }, puntos: u.puntos, slots: u.slots, armadura: u.armadura || null,
        maestria: u.maestria || {},
        arma: u.arma ? { id: u.arma.id, usos: u.arma.usos } : null,
      }));
    localStorage.setItem(CLAVE_SAVE, JSON.stringify(cruzada));
  } catch (e) { /* sin localStorage (headless): seguir sin guardar */ }
}
function cargar() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SAVE));
    if (s && s.version === 1) Object.assign(cruzada, s);
  } catch (e) {}
  if (!Array.isArray(cruzada.habilidades)) cruzada.habilidades = [];   // saves viejos
}
function borrarSave() { try { localStorage.removeItem(CLAVE_SAVE); } catch (e) {} }

// ---------- Utilidades ----------
const clave = (x, y) => x + ',' + y;
const desClave = s => s.split(',').map(Number);
const lerp = (a, b, t) => a + (b - a) * t;
const mdist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const enMapa = (x, y) => mapa && x >= 0 && y >= 0 && x < mapa.cols && y < mapa.filas;
const isoX = (x, y) => { const [rx, ry] = aRender(x, y); return (rx - ry) * TW / 2 + OX; };
const isoY = (x, y) => { const [rx, ry] = aRender(x, y); return (rx + ry) * TH / 2 + OY; };
const dormir = ms => new Promise(r => setTimeout(r, ms));
function interpolar(ms, fn) { return new Promise(res => tweens.push({ e: 0, ms, fn, res })); }

const unidadEn = (x, y) => unidades.find(u => u.pv > 0 && u.x === x && u.y === y);
const vivos = equipo => unidades.filter(u => u.pv > 0 && u.equipo === equipo);

// ---------- Canvas ----------
const canvas = document.getElementById('juego');
let ctx = canvas ? canvas.getContext('2d') : null;   // intercambiable: los retratos de diálogo lo apuntan a su propio canvas
const $ = id => document.getElementById(id);
const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
if (canvas) {
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- Sonido mínimo (WebAudio) ----------
let AC = null;
function activarAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
}
function bip(freq, dur, tipo = 'square', vol = 0.08, desliz = 0) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = tipo; o.frequency.value = freq;
  if (desliz) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + desliz), AC.currentTime + dur);
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g).connect(AC.destination);
  o.start(); o.stop(AC.currentTime + dur);
}
const SFX = {
  sel:    () => bip(880, 0.07, 'triangle', 0.06),
  mover:  () => { bip(440, 0.05, 'triangle', 0.05); setTimeout(() => bip(520, 0.05, 'triangle', 0.05), 60); },
  golpe:  () => bip(110, 0.15, 'sawtooth', 0.1, -60),
  tiro:   () => bip(170, 0.12, 'square', 0.1, -120),
  romper: () => bip(90, 0.2, 'sawtooth', 0.11, -40),
  loot:   () => [660, 880].forEach((f, i) => setTimeout(() => bip(f, 0.1, 'triangle', 0.07), i * 80)),
  raro:   () => [523, 659, 880, 1175].forEach((f, i) => setTimeout(() => bip(f, 0.14, 'triangle', 0.08), i * 90)),
  muerte: () => bip(300, 0.4, 'sawtooth', 0.09, -260),
  turno:  () => bip(220, 0.2, 'triangle', 0.07, 110),
  nivel:  () => [440, 554, 659, 880].forEach((f, i) => setTimeout(() => bip(f, 0.16, 'triangle', 0.09), i * 100)),
  foto:   () => bip(1200, 0.05, 'square', 0.05),
  notif:  () => bip(988, 0.09, 'triangle', 0.06),
  sirena: () => [700, 500, 700, 500, 700].forEach((f, i) => setTimeout(() => bip(f, 0.22, 'triangle', 0.08), i * 200)),
  gana:   () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => bip(f, 0.25, 'triangle', 0.09), i * 130)),
  pierde: () => [400, 340, 280, 200].forEach((f, i) => setTimeout(() => bip(f, 0.3, 'sawtooth', 0.08), i * 160)),
  murga:  () => [392, 392, 523, 392, 587, 523].forEach((f, i) => setTimeout(() => bip(f, 0.13, 'triangle', 0.09), i * 110)),
};

// ---------- Ambiente sonoro (noche de barrio) ----------
// Colchón grave continuo + sirenas y perros lejanos de vez en cuando.
let _ambiente = null;
function alternarAmbiente() {
  activarAudio();
  if (!AC) return false;
  if (_ambiente) { pararAmbiente(); return false; }
  const g = AC.createGain();
  g.gain.value = 0.018;
  g.connect(AC.destination);
  const oscs = [55, 55.7, 110.3].map(f => {
    const o = AC.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g); o.start();
    return o;
  });
  const timer = setInterval(() => {
    if (!_ambiente) return;
    const r = Math.random();
    if (r < 0.25) {        // sirena lejana
      const o = AC.createOscillator(), sg = AC.createGain();
      o.type = 'triangle'; o.frequency.value = 620;
      o.frequency.linearRampToValueAtTime(460, AC.currentTime + 1.6);
      sg.gain.value = 0.012;
      sg.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 1.8);
      o.connect(sg).connect(AC.destination);
      o.start(); o.stop(AC.currentTime + 1.8);
    } else if (r < 0.45) { // perro lejano
      [0, 180].forEach(d => setTimeout(() => bip(240 + Math.random() * 60, 0.08, 'square', 0.015, -60), d));
    }
  }, 7000);
  _ambiente = { g, oscs, timer };
  return true;
}
function pararAmbiente() {
  if (!_ambiente) return;
  clearInterval(_ambiente.timer);
  for (const o of _ambiente.oscs) { try { o.stop(); } catch (e) {} }
  try { _ambiente.g.disconnect(); } catch (e) {}
  _ambiente = null;
}
