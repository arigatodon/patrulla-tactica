'use strict';

/* ============================================================
   combate.js — daño derivado de stats RPG, precisión/esquiva/
   crítico, contraataques, molotov de área, fuego y muerte.
   ============================================================ */

// ---------- Fórmulas ----------
function armaDe(u) { return u.arma ? ARMAS[u.arma.id] : ARMAS.punos; }

function danoBase(att, def) {
  const a = armaDe(att);
  const stat = a.tipo === 'mele' ? att.stats.FUE : att.stats.DES;
  let d = a.dano + Math.floor(stat * 0.8) - Math.floor(def.stats.VIT * 0.3) - terrenoEn(def.x, def.y).def;
  if (def.marcado) d += 1;                    // enemigo fotografiado: debilidad conocida
  return Math.max(1, d);
}
function precision(att, def) {
  return Math.max(50, Math.min(95, 82 + att.stats.DES * 2 - esquivaDe(def)));
}
function pronostico(att, def) {
  const b = danoBase(att, def);
  return { dano: `${b}–${b + 2}`, prec: precision(att, def) + '%', crit: criticoDe(att) + '%' };
}
function enRangoAtaque(u, tx, ty) {
  const a = armaDe(u);
  const d = mdist(u.x, u.y, tx, ty);
  return !u.noAtaca && d >= a.rmin && d <= a.rmax;
}

// blancos alcanzables moviendo: Map(enemigo -> [claves de celda de disparo])
function opcionesAtaque(u, alcance) {
  const objetivos = new Map();
  if (u.noAtaca) return objetivos;
  const a = armaDe(u);
  const paradas = paradasDe(u, alcance);
  for (const e of vivos(u.equipo === 'jugador' ? 'enemigo' : 'jugador')) {
    if (u.equipo === 'jugador' && !visible(e.x, e.y)) continue;   // no atacas lo que no ves
    const celdas = paradas.filter(key => {
      const [x, y] = desClave(key);
      const d = mdist(x, y, e.x, e.y);
      return d >= a.rmin && d <= a.rmax;
    });
    if (celdas.length) objetivos.set(e, celdas);
  }
  return objetivos;
}

function mejorCeldaAtaque(u, celdas, enemigo, alcance) {
  const armaE = armaDe(enemigo);
  let mejor = null, mejorPuntaje = -1e9;
  for (const key of celdas) {
    const [x, y] = desClave(key);
    const d = mdist(x, y, enemigo.x, enemigo.y);
    const sinContra = (d < armaE.rmin || d > armaE.rmax) ? 100 : 0;
    const p = sinContra + d * 2 + terrenoEn(x, y).def * 3 - alcance.get(key).c * 0.1;
    if (p > mejorPuntaje) { mejorPuntaje = p; mejor = key; }
  }
  return mejor;
}

// ---------- Golpe individual ----------
async function golpe(att, def) {
  const a = armaDe(att);
  const sdx = isoX(def.x, def.y) - isoX(att.x, att.y);
  if (Math.abs(sdx) > 1) { att.cara = sdx > 0 ? 1 : -1; def.cara = -att.cara; }
  const distancia = mdist(att.x, att.y, def.x, def.y) > 1;

  if (distancia) { SFX.tiro(); trazadora(att, def); }
  else {
    SFX.golpe();
    const ox = att.x, oy = att.y;
    await interpolar(150, t => {
      const s = Math.sin(t * Math.PI) * 0.35;
      att.gx = lerp(ox, def.x, s); att.gy = lerp(oy, def.y, s);
    });
    att.gx = ox; att.gy = oy;
  }
  gastarArma(att);

  // ¿esquiva? (azar de partida → rnd())
  if (rnd() * 100 > precision(att, def)) {
    flotante(def.x, def.y, '¡esquiva!', '#9fd6ff');
    await dormir(250);
    return 0;
  }
  let dano = danoBase(att, def) + Math.floor(rnd() * 3);
  const crit = rnd() * 100 < criticoDe(att);
  if (crit) dano = Math.floor(dano * 1.6);
  def.pv = Math.max(0, def.pv - dano);
  partida.sacudida = crit ? 9 : 6;
  SFX.golpe();
  flotante(def.x, def.y, (crit ? '¡CRÍTICO! ' : '') + '-' + dano, crit ? '#f0c040' : '#ff6b5e');
  if (a.aturde && def.pv > 0) {
    def.aturdido = Math.max(def.aturdido, a.aturde);
    flotante(def.x, def.y, '⚡ aturdido', '#57c8e8');
  }
  // alarma de banda
  if (def.equipo === 'enemigo')
    for (const al of vivos('enemigo')) if (mdist(al.x, al.y, def.x, def.y) <= 3) al.aggro = true;
  await dormir(300);
  if (def.pv <= 0) await morir(def, att);
  return dano;
}

// ---------- Molotov / área ----------
async function ataqueArea(att, cx, cy) {
  SFX.tiro();
  trazadoraXY(att, cx, cy);
  gastarArma(att);
  await dormir(200);
  partida.sacudida = 10;
  explosion(cx, cy);
  const celdasFuego = [[cx, cy], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
  // ¿el punto de venta quedó dentro de la llamarada?
  if (mapa.punto && !mapa.punto.quemado)
    for (const [fx, fy] of celdasFuego)
      if (fx === mapa.punto.x && fy === mapa.punto.y) prenderPunto(att);
  for (const [fx, fy] of celdasFuego) {
    if (!enMapa(fx, fy) || terrenoEn(fx, fy).bloquea) continue;
    mapa.fuego.set(clave(fx, fy), 2);          // arde 2 rondas
    const v = unidadEn(fx, fy);
    if (v) {
      const dano = Math.max(1, 7 + Math.floor(att.stats.DES * 0.5) - Math.floor(v.stats.VIT * 0.3));
      v.pv = Math.max(0, v.pv - dano);
      flotante(v.x, v.y, '-' + dano + ' 🔥', '#ff9040');
      if (v.equipo === 'enemigo')
        for (const al of vivos('enemigo')) if (mdist(al.x, al.y, v.x, v.y) <= 4) al.aggro = true;
      if (v.pv <= 0) await morir(v, att);
    }
  }
  await dormir(250);
}

// ---------- Punto de venta (misión molotov) ----------
function prenderPunto(autor) {
  if (!mapa.punto || mapa.punto.quemado) return;
  mapa.punto.quemado = true;
  partida.sacudida = 10;
  SFX.raro();
  explosion(mapa.punto.x, mapa.punto.y);
  flotante(mapa.punto.x, mapa.punto.y, '🔥 ¡EL PUNTO ARDE!', '#ff9040');
  registrar('🔥 <b>El punto de venta arde.</b> Ahora todos de vuelta al borde oeste, ¡rápido!', 'imp');
  partida.hazanas.push('punto');
  // la banda entera se entera
  for (const e of vivos('enemigo')) e.aggro = true;
  if (autor && autor.equipo === 'jugador') darExp(autor, 20);
  refrescarPanel();
  chequearFin();
}

// prender de cerca, sin molotov (consume la acción; despierta a la banda)
function prenderDeCerca(u) {
  prenderPunto(u);
}

// daño de fuego al terminar la ronda sobre una celda ardiendo
async function aplicarFuego() {
  for (const [key, rondas] of [...mapa.fuego]) {
    const [fx, fy] = desClave(key);
    const v = unidadEn(fx, fy);
    if (v) {
      v.pv = Math.max(0, v.pv - 4);
      flotante(fx, fy, '-4 🔥', '#ff9040');
      if (v.pv <= 0) await morir(v, null);
    }
    if (rondas <= 1) mapa.fuego.delete(key); else mapa.fuego.set(key, rondas - 1);
  }
}

// ---------- Combate completo (con contraataque) ----------
async function combate(att, def) {
  const a = armaDe(att);
  if (a.tipo === 'area') { await ataqueArea(att, def.x, def.y); return; }
  await golpe(att, def);
  if (partida.terminada) return;
  if (def.pv > 0 && !def.noAtaca && def.aturdido <= 0 && enRangoAtaque(def, att.x, att.y)) {
    await dormir(220);
    await golpe(def, att);
  }
}

// ---------- Muerte ----------
async function morir(u, autor) {
  SFX.muerte();
  await interpolar(350, t => { u.animMuerte = t; });
  u.pv = 0;

  if (u.equipo === 'enemigo') {
    // exp para el autor (o el escuadrón si murió por fuego)
    const exp = u.sapo ? 8 : 15 + u.nivel * 8 + (u.jefe ? 30 : 0);
    if (autor && autor.equipo === 'jugador') darExp(autor, exp);
    else if (!autor) for (const p of vivos('jugador')) darExp(p, Math.ceil(exp / 3));

    if (u.sapo) {
      registrar(`⚠️ Cayó un sapo. Era un vecino: el barrio no lo ve bien.`, 'mal');
      cambiarRespeto(-6, 'El barrio repudia la violencia contra un vecino, aunque fuera sapo');
    } else {
      registrar(`💀 ${u.nombre} de la banda queda fuera.`, 'bien');
      partida.hazanas.push(u.jefe ? 'jefe' : 'soldado');
    }
    if (u.jefe) {
      registrar(`👑 <b>¡${u.nombre} eliminado! El barrio es libre.</b>`, 'imp');
      cambiarRespeto(+15, 'El barrio celebra la caída del vendedor');
    }
    const drop = dropDeEnemigo(u);
    if (drop) {
      soltarEnPiso(u.x, u.y, drop);
      const rz = rarezaDe(drop);
      registrar(`${u.nombre} soltó ${defDe(drop).icono} <b style="color:${rz.color}">${defDe(drop).nombre}</b>.`, rz.aura ? 'imp' : '');
    }
  } else {
    registrar(`🕯️ <b>${u.nombre}</b> ha caído.`, 'mal');
    if (u.vuela) registrar('La junta de Crespo prestará otro dron la próxima misión.', 'mal');
  }
  refrescarPanel();
  chequearFin();
}
