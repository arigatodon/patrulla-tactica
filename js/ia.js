'use strict';

/* ============================================================
   ia.js — turno enemigo: soldados con activación por zona,
   sapos que alertan y huyen, disuasión del operativo municipal.
   ============================================================ */

async function turnoEnemigo() {
  partida.fase = 'enemigo';
  partida.ocupado = true;
  refrescarPanel();
  SFX.turno();
  mostrarBanner('TURNO DE LA BANDA', '#e05555');
  await dormir(900);

  // La Murga: la banda entera pierde la ronda mirando el bochinche
  if (partida.murgaRondas > 0) {
    partida.murgaRondas--;
    mostrarBanner('🥁 LA BANDA MIRA LA MURGA 🥁', '#f0c040');
    for (const e of vivos('enemigo')) flotante(e.x, e.y, '🥁', '#f0c040');
    await dormir(1100);
    return cerrarRondaEnemiga();
  }

  for (const e of [...vivos('enemigo')]) {
    if (partida.terminada) break;
    if (e.pv <= 0) continue;
    if (e.aturdido > 0) { e.aturdido--; flotante(e.x, e.y, '⚡ aturdido', '#57c8e8'); await dormir(200); continue; }

    const jugadores = vivos('jugador');
    if (!jugadores.length) break;

    if (e.sapo) { await turnoSapo(e, jugadores); continue; }

    // carabineros vendidos: cumplen su turno de "servicio" y se retiran
    if (e.esPolicia && partida.ronda >= e.seVaEnRonda) {
      registrar('🚓 Los carabineros vendidos "terminan el turno" y se retiran.');
      e.pv = 0; e.animMuerte = 1;
      continue;
    }

    // operativo municipal activo: los no-jefes huyen hacia el borde este
    if (partida.operativoRondas > 0 && !e.jefe && !e.esPolicia) { await huir(e); continue; }

    // el jefe encara a la patrulla la primera vez que se activa
    if (e.jefe && e.aggro && !e.hablo) {
      e.hablo = true;
      const idx = (partida.barrio * 7) % FRASES_JEFE.length;
      await dialogo([
        { u: e, t: FRASES_JEFE[idx] },
        { q: 'lider', t: RESPUESTAS_LIDER[partida.barrio % RESPUESTAS_LIDER.length] },
      ]);
    }

    // activación (el apagón coordinado deja a la banda medio ciega)
    if (!e.aggro) {
      const cerca = Math.min(...jugadores.map(p => mdist(e.x, e.y, p.x, p.y)));
      const alcanceAggro = Math.max(1, e.aggroBase - (partida.apagonRondas > 0 ? 2 : 0));
      if (cerca <= alcanceAggro) e.aggro = true;
      else continue;
    }

    const alcance = alcanceDe(e);
    const objetivos = opcionesAtaque(e, alcance);

    if (objetivos.size) {
      // víctima: a la que pueda rematar; si no, la más herida
      let victima = null, puntaje = -1e9;
      for (const [p] of objetivos) {
        const est = danoBase(e, p) + 1;
        const s = (p.pv <= est ? 100 : 0) + (p.pvMax - p.pv) * 2 + est;
        if (s > puntaje) { puntaje = s; victima = p; }
      }
      const celda = mejorCeldaAtaque(e, objetivos.get(victima), victima, alcance);
      await animMover(e, rutaHacia(alcance, celda));
      await dormir(150);
      await combate(e, victima);
    } else if (!e.jefe) {
      await acercarse(e, jugadores, alcance);
    }
    if (partida.terminada) break;
    await dormir(200);
  }

  if (partida.terminada) return;
  await cerrarRondaEnemiga();
}

// ---------- Olas de yonkis ----------
// La banda del sector muerta no significa paz: si el objetivo sigue pendiente,
// los yonkis huelen la pelea. Y pasada cierta ronda llegan igual, en olas
// cada vez más grandes: conviene ganar "más o menos rápido".
function rondaDeOlas() {
  const bandaViva = vivos('enemigo').some(e => !e.yonki && !e.esPolicia);
  const base = partida.rondaOlas || (RONDA_OLAS_BASE + Math.floor(partida.barrio / 2));
  return bandaViva ? base : Math.min(base, partida.ronda + 1);
}

async function olaDeYonkis() {
  if (partida.terminada) return;
  const inicio = rondaDeOlas();
  if (partida.ronda === inicio - 1) {
    registrar('⚠️ Se escuchan gritos en los pasajes… <b>los yonkis huelen la pelea</b>. Termina rápido.', 'mal');
    SFX.notif();
    return;
  }
  if (partida.ronda < inicio) return;
  const n = partida.ronda - inicio + 1;
  const tamano = OLA_TAMANO(n);
  mostrarBanner(`💀 OLA ${n} DE YONKIS`, '#a86ae8');
  registrar(`💀 <b>Ola ${n}:</b> ${tamano} yonkis de la pasta base entran al sector tirando piedras.`, 'mal');
  SFX.muerte();
  for (let i = 0; i < tamano; i++) {
    // aparecen por los bordes este/norte/sur, nunca por tu retaguardia
    const borde = Math.floor(rnd() * 3);
    const bx = borde === 0 ? mapa.cols - 1 : rndInt(Math.floor(mapa.cols / 3), mapa.cols - 1);
    const by = borde === 0 ? rndInt(0, mapa.filas - 1) : (borde === 1 ? 0 : mapa.filas - 1);
    const [fx, fy] = celdaLibreCerca(bx, by);
    if (unidadEn(fx, fy)) continue;
    const y = crearUnidad({ equipo: 'enemigo', clase: 'yonki', nivel: 1, nombre: 'Yonki', x: fx, y: fy });
    y.aggro = true;
    unidades.push(y);
  }
  await dormir(600);
}

// cierre común de la ronda enemiga (también lo usa la Murga)
async function cerrarRondaEnemiga() {
  await aplicarFuego();
  if (partida.terminada) return;
  await olaDeYonkis();
  if (partida.operativoRondas > 0) {
    partida.operativoRondas--;
    if (partida.operativoRondas === 0) registrar('🚨 La patrulla municipal se retiró de la zona.');
  }
  if (partida.apagonRondas > 0) {
    partida.apagonRondas--;
    if (partida.apagonRondas === 0) registrar('💡 Volvió la luz al sector.');
  }
  partida.ronda++;
  partida.fase = 'jugador';
  for (const u of vivos('jugador')) u.actuo = false;
  partida.fotosEsteTurno = 0;
  partida.ocupado = false;
  SFX.turno();
  mostrarBanner(`RONDA ${partida.ronda} — TU TURNO`, '#39c5e0');
  actualizarVision();
  refrescarPanel();
  await chequearPolicia();   // ¿apareció la unidad que llamaste?
  chequearFin();   // p. ej. escape completado justo antes de la ronda
}

// sapo: si ve a la patrulla, da la alarma (aggro en radio 6) y huye del peligro
// (durante el apagón coordinado no hay señal: no puede alertar)
async function turnoSapo(e, jugadores) {
  const veA = jugadores.find(p => mdist(e.x, e.y, p.x, p.y) <= e.vision);
  if (veA && partida.apagonRondas > 0) { await huir(e); return; }
  if (veA && !e.dioAlarma) {
    e.dioAlarma = true;
    flotante(e.x, e.y, '📢 ¡ALARMA!', '#ff9040');
    if (visible(e.x, e.y)) registrar('📢 ¡Un <b>sapo</b> dio la alarma! La banda viene.', 'mal');
    SFX.notif();
    for (const al of vivos('enemigo')) if (mdist(al.x, al.y, e.x, e.y) <= 6) al.aggro = true;
    await dormir(350);
  }
  if (veA) await huir(e);
}

// moverse maximizando distancia al jugador más cercano (sapos y disuadidos)
async function huir(e) {
  const jugadores = vivos('jugador');
  if (!jugadores.length) return;
  const alcance = alcanceDe(e);
  let mejor = null, mejorD = -1;
  for (const key of paradasDe(e, alcance)) {
    const [x, y] = desClave(key);
    const d = Math.min(...jugadores.map(p => mdist(x, y, p.x, p.y))) + (partida.operativoRondas > 0 ? x * 0.3 : 0);
    if (d > mejorD) { mejorD = d; mejor = key; }
  }
  if (mejor && mejor !== clave(e.x, e.y)) await animMover(e, rutaHacia(alcance, mejor));
}

// acercarse al jugador más próximo rodeando manzanas
async function acercarse(e, jugadores, alcance) {
  let campo = null, mejorD = 1e9;
  for (const p of jugadores) {
    const f = campoHacia(p.x, p.y);
    const d = f.get(clave(e.x, e.y)) ?? 1e9;
    if (d < mejorD) { mejorD = d; campo = f; }
  }
  if (!campo) return;
  let mejor = null, mejorV = 1e9;
  for (const key of paradasDe(e, alcance)) {
    const [x, y] = desClave(key);
    const v = (campo.get(key) ?? 1e9) - terrenoEn(x, y).def * 0.4;
    if (v < mejorV) { mejorV = v; mejor = key; }
  }
  if (mejor && mejor !== clave(e.x, e.y)) await animMover(e, rutaHacia(alcance, mejor));
}
