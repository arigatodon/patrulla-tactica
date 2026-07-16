'use strict';

/* ============================================================
   objetos.js — armas con durabilidad, cajas de loot, drops
   con aura de rareza, recoger, curar y romper bancas.
   ============================================================ */

// ---------- Instanciar ítems ----------
function instanciarArma(id, usos) {
  const base = ARMAS[id];
  return { id, esArma: true, usos: usos !== undefined ? usos : base.usos };
}
function instanciarObjeto(id) {
  return { id, esArma: false };
}
const defDe = item => item.esArma ? ARMAS[item.id] : OBJETOS[item.id];
const rarezaDe = item => RAREZAS[defDe(item).rareza];

// ---------- Loot con rareza ----------
function tirarLoot() {
  const elegido = rndPeso(LOOT_CAJA);
  return ARMAS[elegido.item] ? instanciarArma(elegido.item) : instanciarObjeto(elegido.item);
}

// drop de enemigo al caer: su arma gastada, algo de loot, o nada
function dropDeEnemigo(e) {
  const r = rnd();
  if (e.jefe) return instanciarObjeto('carta');                 // el jefe siempre suelta carta municipal
  if (r < 0.20 && e.arma && e.arma.id !== 'punos')
    return instanciarArma(e.arma.id, Math.max(1, Math.ceil(defDe(e.arma).usos / 3)));
  if (r < 0.35) return tirarLoot();
  return null;
}

function soltarEnPiso(x, y, item) {
  const [fx, fy] = celdaLibreCerca(x, y);
  sueltos.push({ x: fx, y: fy, item });
}

// ---------- Abrir caja / recoger del piso ----------
function abrirCaja(u, x, y) {
  mapa.cajasAbiertas.add(clave(x, y));
  const item = tirarLoot();
  anunciarLoot(u, item, 'La caja tenía');
  entregar(u, item);
}

function recogerSuelto(u) {
  const idx = sueltos.findIndex(s => s.x === u.x && s.y === u.y);
  if (idx < 0) return;
  const { item } = sueltos.splice(idx, 1)[0];
  anunciarLoot(u, item, 'Recogido');
  entregar(u, item);
}

function anunciarLoot(u, item, prefijo) {
  const d = defDe(item), rz = rarezaDe(item);
  (rz.aura === '#f0c040' || rz.aura === '#a86ae8') ? SFX.raro() : SFX.loot();
  flotante(u.x, u.y, `${d.icono} ${d.nombre}`, rz.color);
  registrar(`${prefijo}: ${d.icono} <b style="color:${rz.color}">${d.nombre}</b> <small>(${rz.nombre})</small>`, rz.aura ? 'imp' : '');
}

// ---------- Entregar: equipar, guardar o efecto inmediato ----------
function entregar(u, item) {
  const d = defDe(item);
  if (d.tipo === 'carta') {
    cruzada.cartas++;
    registrar(`📇 Cartas municipales: <b>${cruzada.cartas}/${CARTAS_PARA_OPERATIVO}</b> para desbloquear el Operativo.`, 'imp');
    if (cruzada.cartas >= CARTAS_PARA_OPERATIVO && cruzada.operativoUsado === false)
      registrar('🚨 <b>¡Operativo municipal desbloqueado!</b> (habilidad de crew, 1 uso)', 'imp');
    guardar(); refrescarPanel();
    return;
  }
  if (item.esArma) {
    // el dron no porta armas; los demás equipan si es mejor, si no a la mochila
    if (u.noAtaca) { soltarEnPiso(u.x, u.y, item); registrar(`${u.nombre} no puede portar armas; la deja en el piso.`); return; }
    const actual = u.arma ? ARMAS[u.arma.id] : null;
    if (!actual || actual.dano < d.dano || u.arma.usos <= 0) {
      if (u.arma && u.arma.id !== 'punos' && u.arma.usos > 0) meterMochila(u, u.arma);
      u.arma = item;
      registrar(`${u.nombre} empuña ${d.icono} ${d.nombre}.`);
    } else meterMochila(u, item);
  } else {
    meterMochila(u, item);   // curas van a la mochila, se usan como acción
  }
  refrescarPanel();
}

function meterMochila(u, item) {
  if (u.mochila.length >= 2) {
    soltarEnPiso(u.x, u.y, u.mochila.shift());   // lo más viejo al piso
    registrar(`Mochila de ${u.nombre} llena: deja algo en el piso.`);
  }
  u.mochila.push(item);
}

// usar un objeto de cura de la mochila (consume la acción)
function usarCura(u, idx) {
  const item = u.mochila[idx];
  if (!item || item.esArma || defDe(item).tipo !== 'cura') return false;
  const d = defDe(item);
  u.mochila.splice(idx, 1);
  u.pv = Math.min(u.pvMax, u.pv + d.cura);
  flotante(u.x, u.y, `+${d.cura}`, '#7bd07c');
  SFX.loot();
  registrar(`${u.nombre} usa ${d.icono} ${d.nombre} (+${d.cura} PV).`);
  return true;
}

// equipar un arma de la mochila (gratis, no consume acción)
function equiparDeMochila(u, idx) {
  const item = u.mochila[idx];
  if (!item || !item.esArma) return;
  u.mochila.splice(idx, 1);
  if (u.arma && u.arma.id !== 'punos' && u.arma.usos > 0) meterMochila(u, u.arma);
  u.arma = item;
  registrar(`${u.nombre} empuña ${defDe(item).icono} ${defDe(item).nombre}.`);
  refrescarPanel();
}

// ---------- Durabilidad ----------
function gastarArma(u) {
  if (!u.arma || u.arma.usos === Infinity) return;
  u.arma.usos--;
  if (u.arma.usos <= 0) {
    const d = defDe(u.arma);
    registrar(`💥 ¡${d.icono} ${d.nombre} de ${u.nombre} se rompió!`, 'mal');
    SFX.romper();
    // auto-equipar la mejor arma de la mochila, o quedar a puños
    const idxArma = u.mochila.findIndex(i => i.esArma && i.usos > 0);
    u.arma = idxArma >= 0 ? u.mochila.splice(idxArma, 1)[0] : instanciarArma('punos');
    if (u.arma.id !== 'punos') registrar(`${u.nombre} saca ${defDe(u.arma).icono} ${defDe(u.arma).nombre} de la mochila.`);
  }
}

// ---------- Romper banca → palo (cuesta el turno) ----------
function bancasAdyacentes(u) {
  const lista = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = u.x + dx, ny = u.y + dy;
    if (enMapa(nx, ny) && mapa.celdas[ny][nx] === 'N' && !mapa.bancasRotas.has(clave(nx, ny)))
      lista.push([nx, ny]);
  }
  return lista;
}

function romperBanca(u, x, y) {
  mapa.bancasRotas.add(clave(x, y));
  SFX.romper();
  flotante(x, y, '🪵 ¡Palo!', '#c8a060');
  registrar(`${u.nombre} rompe la banca y saca un palo (pierde el turno).`);
  entregar(u, instanciarArma('palo'));
}
