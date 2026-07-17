'use strict';

/* ============================================================
   unidades.js — creación de unidades, stats RPG derivados
   (FUE/AGI/VIT/DES/SUE), experiencia, niveles y reclutas.
   ============================================================ */

// ---------- Stats derivados ----------
const pvMaxDe   = u => 12 + u.stats.VIT * 3 + (u.nivel - 1) * 2;
const movDe     = u => Math.min(9, (u.vuela ? 5 : 3) + Math.floor(u.stats.AGI / 4) + (u.vehiculo ? 2 : 0));
const esquivaDe = u => Math.min(40, u.stats.AGI * 2 + (u.vuela ? 10 : 0));
const criticoDe = u => Math.min(40, 5 + Math.floor(u.stats.SUE * 1.5));
const expSiguiente = nivel => 40 + (nivel - 1) * 30;

function recalcular(u) {
  const pct = u.pvMax ? u.pv / u.pvMax : 1;
  u.pvMax = pvMaxDe(u);
  u.pv = Math.max(1, Math.round(u.pvMax * pct));
  u.mov = movDe(u);
}

// ---------- Creación ----------
function crearUnidad(def) {
  // def: {equipo, clase|tipoEnemigo, nombre, x, y, nivel, arma}
  const base = def.equipo === 'jugador' ? CLASES[def.clase] : ENEMIGOS[def.clase];
  const u = {
    id: ++uid,
    equipo: def.equipo, clase: def.clase, nombre: def.nombre,
    sprite: base.sprite,
    x: def.x, y: def.y, gx: def.x, gy: def.y,
    cara: def.equipo === 'jugador' ? 1 : -1,
    nivel: def.nivel || 1, exp: def.exp || 0, puntos: def.puntos || 0,
    stats: def.stats ? { ...def.stats } : { ...base.stats },
    vuela: !!base.vuela, noAtaca: !!base.noAtaca,
    jefe: !!base.jefe, sapo: !!base.sapo,
    vision: base.vision || VISION_HUMANO,
    vehiculo: base.vehiculo || null,   // 'skate' | 'scooter': +2 movimiento
    armadura: def.armadura || null,    // 'casco' | 'chaleco': defensa extra
    aggro: false, actuo: false, aturdido: 0, disuadido: false,
    marcado: false,            // fotografiado: stats visibles y +daño recibido leve
    slots: def.slots || 3,     // capacidad de carga (ampliable con puntos)
    mochila: [],               // objetos de reserva (hasta u.slots)
    balanceo: Math.random() * Math.PI * 2,
    aggroBase: base.aggro || 0,
  };
  // enemigos escalan con el nivel del barrio
  if (def.equipo === 'enemigo' && u.nivel > 1) {
    for (const s of ['FUE', 'VIT']) u.stats[s] += Math.floor((u.nivel - 1) * 0.8);
    for (const s of ['AGI', 'DES']) u.stats[s] += Math.floor((u.nivel - 1) * 0.5);
  }
  u.pvMax = pvMaxDe(u); u.pv = u.pvMax; u.mov = movDe(u);
  u.arma = def.arma !== undefined
    ? def.arma
    : (base.arma ? instanciarArma(base.arma) : instanciarArma('punos'));
  return u;
}

// ---------- Experiencia y nivel ----------
function darExp(u, cant) {
  if (u.equipo !== 'jugador' || u.pv <= 0) return;
  u.exp += cant;
  flotante(u.x, u.y, `+${cant} exp`, '#9fd6ff');
  while (u.exp >= expSiguiente(u.nivel)) {
    u.exp -= expSiguiente(u.nivel);
    u.nivel++;
    u.puntos += 3;
    recalcular(u);
    u.pv = u.pvMax;   // subir de nivel cura del todo
    SFX.nivel();
    flotante(u.x, u.y, `¡NIVEL ${u.nivel}!`, '#f0c040');
    registrar(`⭐ <b>${u.nombre}</b> sube a nivel ${u.nivel} (+3 puntos de stats).`, 'imp');
  }
  refrescarPanel();
}

function subirStat(u, stat) {
  if (u.puntos <= 0 || u.stats[stat] === undefined) return;
  u.stats[stat]++;
  u.puntos--;
  recalcular(u);
  SFX.sel();
  refrescarPanel();
  guardar();
}

// gastar un punto de nivel en un slot más de mochila (máx. 6)
function subirSlots(u) {
  if (u.puntos <= 0 || u.slots >= 6) return;
  u.slots++;
  u.puntos--;
  SFX.sel();
  registrar(`🎒 ${u.nombre} amplía su carga a ${u.slots} espacios.`);
  refrescarPanel();
  guardar();
}

// ---------- Escuadrón inicial / persistido ----------
function armarEscuadron() {
  const lista = [];
  if (cruzada.plantilla && cruzada.plantilla.length) {
    for (const p of cruzada.plantilla)
      lista.push({ equipo: 'jugador', clase: p.clase, nombre: p.nombre, nivel: p.nivel,
                   exp: p.exp, puntos: p.puntos, stats: p.stats, slots: p.slots, armadura: p.armadura,
                   arma: p.arma ? instanciarArma(p.arma.id, p.arma.usos) : (CLASES[p.clase].arma ? undefined : null) });
    // el dron siempre vuelve (la junta lo vuelve a prestar)
    if (!lista.some(l => l.clase === 'dron'))
      lista.push({ equipo: 'jugador', clase: 'dron', nombre: '"La Garza"' });
  } else {
    for (const e of EQUIPO_INICIAL) lista.push({ equipo: 'jugador', clase: e.clase, nombre: e.nombre });
  }
  return lista;
}

// ---------- Poblar el barrio ----------
function poblarBarrio(dificultad, capitulo) {
  unidades = []; sueltos = []; uid = 0;
  const esMolotov = capitulo.tipo === 'molotov';
  const esFinal = capitulo.tipo === 'final';
  // patrulla entra por el oeste (en el prólogo aún no hay dron)
  const defs = armarEscuadron().filter(d => !(esMolotov && d.clase === 'dron'));
  let sy = Math.floor(mapa.filas / 2) - 1;
  for (const d of defs) {
    const [px, py] = celdaLibreCerca(0, sy);
    const u = crearUnidad({ ...d, x: px, y: py });
    unidades.push(u);
    sy++;
  }
  // en el prólogo, el líder lleva la molotov de la noche (su arma pasa a la mochila)
  if (esMolotov) {
    const portador = vivos('jugador')[0];
    if (portador.arma && portador.arma.id !== 'punos') meterMochila(portador, portador.arma);
    portador.arma = instanciarArma('molotov');
  }
  // banda: jefe al fondo este (salvo prólogo), soldados en los 2/3 orientales, sapos sueltos
  const nivel = dificultad;
  if (!esMolotov) {
    const bx = mapa.cols - 2, by = Math.floor(mapa.filas / 2);
    const [jx, jy] = celdaLibreCerca(bx, by);
    unidades.push(crearUnidad({
      equipo: 'enemigo', clase: 'vendedor', nivel: nivel + 1 + (esFinal ? 2 : 0),
      nombre: capitulo.jefe, x: jx, y: jy,
    }));
  }
  const tropa = capitulo.soldados || ['soldado', 'pistolero'];
  const nSoldados = esMolotov ? 3 : 4 + Math.min(5, dificultad) + (esFinal ? 2 : 0);
  for (let i = 0; i < nSoldados; i++) {
    const tipo = tropa[Math.floor(rnd() * tropa.length)];
    const ex = rndInt(Math.floor(mapa.cols * 0.35), mapa.cols - 1);
    const ey = rndInt(0, mapa.filas - 1);
    const [fx, fy] = celdaLibreCerca(ex, ey);
    if (unidadEn(fx, fy)) continue;
    unidades.push(crearUnidad({ equipo: 'enemigo', clase: tipo, nivel, nombre: ENEMIGOS[tipo].nombre, x: fx, y: fy }));
  }
  // traficantes plantados en la cancha (Santa Elisa)
  if (mapa.rasgos.cancha) {
    const c = mapa.rasgos.cancha;
    for (let i = 0; i < 2; i++) {
      const [fx, fy] = celdaLibreCerca(c.x + 1 + i * 3, c.y + 1 + i);
      if (!unidadEn(fx, fy))
        unidades.push(crearUnidad({ equipo: 'enemigo', clase: 'soldado', nivel, nombre: 'Traficante', x: fx, y: fy }));
    }
  }
  // un skate olvidado junto a las rampas del skatepark
  if (mapa.rasgos.skatepark) {
    const s = mapa.rasgos.skatepark;
    soltarEnPiso(s.x, s.y, instanciarObjeto('skate'));
  }
  // guardias pegados a cada punto de venta (Barrio Estación)
  for (const p of mapa.puntos) {
    const [fx, fy] = celdaLibreCerca(p.x + 1, p.y);
    if (!unidadEn(fx, fy) && rnd() < 0.8)
      unidades.push(crearUnidad({ equipo: 'enemigo', clase: tropa[0], nivel, nombre: ENEMIGOS[tropa[0]].nombre, x: fx, y: fy }));
  }
  const nSapos = esMolotov ? 1 : 1 + Math.floor(dificultad / 2);
  for (let i = 0; i < nSapos; i++) {
    const ex = rndInt(Math.floor(mapa.cols * 0.25), mapa.cols - 2);
    const ey = rndInt(0, mapa.filas - 1);
    const [fx, fy] = celdaLibreCerca(ex, ey);
    if (unidadEn(fx, fy)) continue;
    unidades.push(crearUnidad({ equipo: 'enemigo', clase: 'sapo', nivel: 1, nombre: 'Sapo', x: fx, y: fy }));
  }
}

// ---------- Reclutas (vía teléfono) ----------
function convocarVecino() {
  const lider = vivos('jugador').find(u => !u.vuela) || vivos('jugador')[0];
  if (!lider) return null;
  const [x, y] = celdaLibreCerca(0, Math.floor(mapa.filas / 2));
  const nombre = NOMBRES_VECINOS[Math.floor(Math.random() * NOMBRES_VECINOS.length)];
  const u = crearUnidad({ equipo: 'jugador', clase: 'vecino', nombre, x, y, nivel: Math.max(1, partida.barrio - 1) });
  u.actuo = true;   // llega este turno, actúa el próximo
  unidades.push(u);
  actualizarVision();
  return u;
}
