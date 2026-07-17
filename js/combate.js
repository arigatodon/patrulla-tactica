'use strict';

/* ============================================================
   combate.js — daño derivado de stats RPG, precisión/esquiva/
   crítico, contraataques, molotov de área, fuego y muerte.
   ============================================================ */

// ---------- Fórmulas ----------
// armaDe devuelve el arma CON la maestría del portador aplicada
// (cada nivel invertido dio +daño, +alcance o +resistencia al desgaste).
function armaDe(u) {
  const base = u.arma ? ARMAS[u.arma.id] : ARMAS.punos;
  const m = u.maestria && u.arma && u.maestria[u.arma.id];
  if (!m || (!m.dano && !m.alcance)) return base;
  return { ...base, dano: base.dano + (m.dano || 0), rmax: base.rmax + Math.min(2, m.alcance || 0) };
}
const armaduraDe = u => u.armadura ? OBJETOS[u.armadura].defensa : 0;

// con buena puntería (DES ≥ 7) las armas melé se pueden LANZAR a 2-3 casillas;
// el arma queda tirada donde cayó (se puede recuperar)
const puedeLanzar = u => u.equipo === 'jugador' && !u.noAtaca && u.arma
  && u.arma.id !== 'punos' && armaDe(u).tipo === 'mele' && u.stats.DES >= 7;
function rangoAtaqueDe(u) {
  const a = armaDe(u);
  return puedeLanzar(u) ? { rmin: a.rmin, rmax: Math.max(a.rmax, 3) } : { rmin: a.rmin, rmax: a.rmax };
}

function danoBase(att, def) {
  const a = armaDe(att);
  const dist = mdist(att.x, att.y, def.x, def.y);
  // melé a distancia = lanzamiento: cuenta la puntería, no la fuerza
  const stat = (a.tipo === 'mele' && dist <= 1) ? att.stats.FUE : att.stats.DES;
  let d = a.dano + Math.floor(stat * 0.8) - Math.floor(def.stats.VIT * 0.3)
        - terrenoEn(def.x, def.y).def - armaduraDe(def);
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
  const r = rangoAtaqueDe(u);
  const d = mdist(u.x, u.y, tx, ty);
  return !u.noAtaca && d >= r.rmin && d <= r.rmax;
}

// blancos alcanzables moviendo: Map(enemigo -> [claves de celda de disparo])
function opcionesAtaque(u, alcance) {
  const objetivos = new Map();
  if (u.noAtaca) return objetivos;
  const r = rangoAtaqueDe(u);
  const paradas = paradasDe(u, alcance);
  for (const e of vivos(u.equipo === 'jugador' ? 'enemigo' : 'jugador')) {
    // no atacas lo que no ves (los fotografiados quedan rastreados siempre)
    if (u.equipo === 'jugador' && !visible(e.x, e.y) && !e.marcado) continue;
    const celdas = paradas.filter(key => {
      const [x, y] = desClave(key);
      const d = mdist(x, y, e.x, e.y);
      return d >= r.rmin && d <= r.rmax;
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

  att.pose = 'ataca';
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
  // lanzamiento de arma melé: vuela hacia el objetivo y queda tirada allá
  const armaLanzada = (a.tipo === 'mele' && distancia) ? att.arma : null;
  gastarArma(att);
  if (armaLanzada) {
    if (att.arma === armaLanzada) att.arma = instanciarArma('punos');   // ya no está en la mano
    if (armaLanzada.usos > 0) {
      soltarEnPiso(def.x, def.y, armaLanzada);
      registrar(`🎯 ${att.nombre} lanza ${a.icono} ${a.nombre}: quedó tirada allá (písala para recuperarla).`);
    } else {
      registrar(`🎯 ${att.nombre} lanza ${a.icono} ${a.nombre}… y se hizo pedazos con el impacto.`);
    }
    refrescarPanel();
  }

  // ¿esquiva? (azar de partida → rnd())
  if (rnd() * 100 > precision(att, def)) {
    flotante(def.x, def.y, '¡esquiva!', '#9fd6ff');
    await dormir(250);
    att.pose = null;
    return 0;
  }
  let dano = danoBase(att, def) + Math.floor(rnd() * 3);
  const crit = rnd() * 100 < criticoDe(att);
  if (crit) dano = Math.floor(dano * 1.6);
  def.pv = Math.max(0, def.pv - dano);
  def.pose = 'herido';
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
  att.pose = null; def.pose = null;
  if (def.pv <= 0) await morir(def, att);
  return dano;
}

// ---------- Armas de área (molotov incendia, fuegos artificiales aturden) ----------
async function ataqueArea(att, cx, cy) {
  const a = armaDe(att);
  SFX.tiro();
  trazadoraXY(att, cx, cy);
  gastarArma(att);
  await dormir(200);
  partida.sacudida = 10;
  explosion(cx, cy);
  const celdasArea = [[cx, cy], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
  // ¿algún punto de venta quedó dentro de la llamarada?
  if (a.incendia)
    for (const [fx, fy] of celdasArea) {
      const p = puntoEn(fx, fy);
      if (p && !p.quemado) prenderPunto(att, p);
    }
  for (const [fx, fy] of celdasArea) {
    if (!enMapa(fx, fy) || terrenoEn(fx, fy).bloquea) continue;
    if (a.incendia) mapa.fuego.set(clave(fx, fy), 2);          // arde 2 rondas
    const v = unidadEn(fx, fy);
    if (v) {
      const dano = Math.max(1, a.dano + Math.floor(att.stats.DES * 0.5)
        - Math.floor(v.stats.VIT * 0.3) - armaduraDe(v));
      v.pv = Math.max(0, v.pv - dano);
      flotante(v.x, v.y, '-' + dano + (a.incendia ? ' 🔥' : ' 🎆'), '#ff9040');
      if (a.aturde && v.pv > 0) {
        v.aturdido = Math.max(v.aturdido, a.aturde);
        flotante(v.x, v.y, '💫 aturdido', '#57c8e8');
      }
      if (v.equipo === 'enemigo')
        for (const al of vivos('enemigo')) if (mdist(al.x, al.y, v.x, v.y) <= 4) al.aggro = true;
      if (v.pv <= 0) await morir(v, att);
    }
  }
  await dormir(250);
}

// ---------- Puntos de venta (misiones molotov / puntos) ----------
function prenderPunto(autor, p) {
  if (!p || p.quemado) return;
  p.quemado = true;
  partida.sacudida = 10;
  SFX.raro();
  explosion(p.x, p.y);
  flotante(p.x, p.y, '🔥 ¡EL PUNTO ARDE!', '#ff9040');
  const quedan = puntosVivos().length;
  registrar(quedan
    ? `🔥 <b>Punto de venta quemado.</b> Quedan <b>${quedan}</b> en el sector.`
    : (partida.tipoMision === 'molotov'
        ? '🔥 <b>El punto arde.</b> Ahora todos de vuelta al borde oeste, ¡rápido!'
        : '🔥 <b>¡Todos los puntos quemados!</b> El negocio de la banda se acabó.'), 'imp');
  partida.hazanas.push('punto');
  // la banda entera se entera
  for (const e of vivos('enemigo')) e.aggro = true;
  if (autor && autor.equipo === 'jugador') darExp(autor, 20);
  refrescarPanel();
  chequearFin();
}

// prender de cerca, sin molotov (consume la acción; despierta a la banda)
function prenderDeCerca(u, p) {
  prenderPunto(u, p);
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
    // los yonkis dan poca exp: las olas no son granja, son castigo
    const exp = u.yonki ? 5 : u.sapo ? 8 : 15 + u.nivel * 8 + (u.jefe ? 30 : 0);
    if (autor && autor.equipo === 'jugador') darExp(autor, exp);
    else if (!autor) for (const p of vivos('jugador')) darExp(p, Math.ceil(exp / 3));

    if (u.sapo) {
      registrar(`⚠️ Cayó un sapo. Era un vecino: el barrio no lo ve bien.`, 'mal');
      cambiarRespeto(-6, 'El barrio repudia la violencia contra un vecino, aunque fuera sapo');
    } else if (u.esPolicia) {
      registrar('🚓 Cayó un carabinero (vendido, pero uniformado). Esto trae cola.', 'mal');
      cambiarRespeto(-4, 'pegarle a un uniformado asusta al barrio');
    } else if (u.yonki) {
      registrar(`${u.nombre} cae. Vienen más detrás.`, '');
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
