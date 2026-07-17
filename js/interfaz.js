'use strict';

/* ============================================================
   interfaz.js — panel lateral, entrada de ratón/teclado,
   ficha de unidad con subida de stats, mochila y pronóstico.
   ============================================================ */

let lineasRegistro = [];

function registrar(html, cls = '') {
  lineasRegistro.unshift(`<div class="${cls}">${html}</div>`);
  lineasRegistro = lineasRegistro.slice(0, 40);
  if ($('registro')) $('registro').innerHTML = lineasRegistro.join('');
}

// ---------- Entrada ----------
function posCanvas(e) {
  const r = canvas.getBoundingClientRect();
  // a coordenadas de mundo: deshace el escalado CSS y el zoom del encuadre
  return [(e.clientX - r.left) * (W / r.width) / zoom, (e.clientY - r.top) * (H / r.height) / zoom];
}
function elegirCelda(px, py) {
  let mejor = null, mejorD = 24;
  for (const u of unidades) {
    if (u.pv <= 0) continue;
    if (u.equipo === 'enemigo' && !visible(u.x, u.y) && !u.marcado) continue;
    const alt = u.vuela ? -18 : 0;
    const d = Math.hypot(px - isoX(u.gx, u.gy), py - (isoY(u.gx, u.gy) - 16 + alt));
    if (d < mejorD) { mejorD = d; mejor = u; }
  }
  if (mejor) return [mejor.x, mejor.y, mejor];
  // inversa del isométrico (en coordenadas de render) y luego des-rotar
  const rxp = (px - OX) / (TW / 2), ryp = (py - OY) / (TH / 2);
  const frx = Math.round((rxp + ryp) / 2), fry = Math.round((ryp - rxp) / 2);
  const [x, y] = desRender(frx, fry);
  return enMapa(x, y) ? [x, y, unidadEn(x, y)] : [null, null, null];
}

// pulsación de juego (clic de mouse o toque en celular), en coordenadas de mundo
function manejarPulsacion(px, py) {
  activarAudio();
  if (partida.ocupado || partida.terminada || partida.fase !== 'jugador') return;
  if (partida.estado === 'telefono') { cerrarTelefono(); return; }
  const [x, y, u] = elegirCelda(px, py);
  if (x === null) return;

  if (partida.estado === 'idle') {
    if (u && u.equipo === 'jugador' && !u.actuo) seleccionar(u);
    else { partida.hoverUnidad = u; refrescarPanel(); }

  } else if (partida.estado === 'seleccion') {
    const sel = partida.seleccion;
    if (u === sel) return deseleccionar();
    if (u && u.equipo === 'jugador' && !u.actuo) return seleccionar(u);
    if (u && u.equipo === 'enemigo' && partida.blancos.has(u)) return void atacarMoviendo(sel, u);
    // mueble rompible adyacente: banca → palo, silla → arma, basurero → sorpresa
    if (esRompibleIntacto(x, y) && mdist(sel.x, sel.y, x, y) === 1 && !sel.noAtaca) {
      romperMueble(sel, x, y);
      return void terminarAccion(sel);
    }
    // punto de venta: prenderlo de cerca o lanzarle la molotov
    const pv = puntoEn(x, y);
    if (pv && !pv.quemado) return void interactuarPunto(sel, pv);
    const key = clave(x, y);
    if (partida.alcance.has(key) && puedeParar(sel, x, y)) return void moverJugador(sel, key);
    deseleccionar();

  } else if (partida.estado === 'objetivo') {
    const sel = partida.seleccion;
    if (u && u.equipo === 'enemigo' && partida.postBlancos.includes(u)) return void atacarDesdeAqui(sel, u);
    terminarAccion(sel);
  }
}

function conectarEntrada() {
  // ---- puntero unificado: mouse y táctil ----
  // toque/clic corto = jugar · arrastrar = mover la cámara · dos dedos = zoom
  const punteros = new Map();
  let arrastre = null, distPellizco = null;
  const escalaCSS = () => W / canvas.getBoundingClientRect().width;

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1)
      arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, movido: false };
    else if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      distPellizco = Math.hypot(a.x - b.x, a.y - b.y);
      arrastre = null;   // dos dedos: solo zoom
    }
  });

  canvas.addEventListener('pointermove', e => {
    const p = punteros.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }

    if (punteros.size === 2 && distPellizco) {          // pellizco = zoom
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 10) { ajustarZoom(d / distPellizco); distPellizco = d; }
      return;
    }
    if (p && arrastre) {                                // arrastre = paneo de cámara
      const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      if (!arrastre.movido &&
          Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) > 9) arrastre.movido = true;
      if (arrastre.movido) moverCamara(-dx * escalaCSS(), -dy * escalaCSS());
      arrastre.x = e.clientX; arrastre.y = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse' && e.buttons === 0) { // hover solo con mouse
      const [x, y, u] = elegirCelda(...posCanvas(e));
      partida.hover = x === null ? null : [x, y];
      partida.hoverUnidad = u || null;
      refrescarPanel();
    }
  });

  const soltar = e => {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) distPellizco = null;
    if (arrastre && !arrastre.movido && e.type === 'pointerup' && (e.button === 0 || e.pointerType !== 'mouse'))
      manejarPulsacion(...posCanvas(e));
    if (!punteros.size) arrastre = null;
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('mouseleave', () => { partida.hover = null; partida.hoverUnidad = null; refrescarPanel(); });

  canvas.addEventListener('wheel', e => {               // rueda = zoom
    e.preventDefault();
    ajustarZoom(e.deltaY < 0 ? 1.12 : 0.9);
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (partida.ocupado || partida.terminada) return;
    if (partida.estado === 'telefono') cerrarTelefono();
    else if (partida.estado === 'objetivo') terminarAccion(partida.seleccion);
    else deseleccionar();
  });

  window.addEventListener('keydown', e => {
    if (partida.terminada) return;
    if (e.key === 'Escape') {
      if (partida.estado === 'telefono') return cerrarTelefono();
      if (partida.ocupado) return;
      if (partida.estado === 'objetivo') terminarAccion(partida.seleccion);
      else deseleccionar();
    }
    if (e.key.toLowerCase() === 'e') terminarTurnoJugador();
    if (e.key.toLowerCase() === 't' && partida.seleccion && partida.estado === 'seleccion')
      abrirTelefono(partida.seleccion);
    if (e.key.toLowerCase() === 'r' && mapa) rotarCamara();
  });

  $('btnRotar').addEventListener('click', () => { if (mapa) rotarCamara(); });
  if ($('dialogo')) $('dialogo').addEventListener('click', _avanzarDialogo);

  $('btnFinTurno').addEventListener('click', () => { activarAudio(); terminarTurnoJugador(); });
  $('btnEsperar').addEventListener('click', () => {
    if (!partida.ocupado && partida.estado === 'objetivo') terminarAccion(partida.seleccion);
  });
  $('btnOperativo').addEventListener('click', () => { activarAudio(); usarOperativo(); });
  $('btnTelefono').addEventListener('click', () => {
    if (partida.seleccion && partida.estado === 'seleccion') abrirTelefono(partida.seleccion);
  });
  $('telCerrar').addEventListener('click', cerrarTelefono);
}

// ---------- Diálogos de enfrentamiento (retrato con zoom a la izquierda) ----------
// dialogo([{q:'lider'|'policia'|..., u: unidad, n: nombre, t: texto}, ...])
// dialogoEleccion(linea, [{texto, valor}, ...]) → Promise<valor>
let dialogoActivo = null;

function dialogo(lineas) {
  if (window.AUTODIALOGO || !$('dialogo')) return Promise.resolve();
  return new Promise(res => { dialogoActivo = { lineas, i: 0, res }; _pintarDialogo(); });
}
function dialogoEleccion(linea, opciones) {
  if (window.AUTODIALOGO || !$('dialogo')) return Promise.resolve(opciones[0].valor);
  return new Promise(res => { dialogoActivo = { lineas: [linea], i: 0, res, opciones }; _pintarDialogo(); });
}

const _NOMBRES_Q = { lider: null, tecnico: null, pescador: null, policia: 'Carabinero' };
function _unidadDeLinea(l) {
  if (l.u) return l.u;
  const propia = vivos('jugador').find(x => x.clase === l.q);
  if (propia) return propia;
  // retrato sintético (p. ej. carabinero que no está en el mapa)
  return { sprite: l.q, equipo: 'enemigo', arma: { id: 'punos' }, vehiculo: null };
}

function _pintarDialogo() {
  const d = dialogoActivo;
  const l = d.lineas[d.i];
  const u = _unidadDeLinea(l);
  $('dialogo').style.display = 'flex';
  $('dNombre').textContent = l.n || (u.nombre || ENEMIGOS[l.q]?.nombre || '???');
  $('dTexto').innerHTML = l.t;
  _retrato(u);
  const ultimo = d.i === d.lineas.length - 1;
  const ops = ultimo && d.opciones;
  $('dOpciones').innerHTML = ops
    ? d.opciones.map((o, i) => `<button data-op="${i}">${o.texto}</button>`).join('')
    : '';
  $('dSeguir').style.display = ops ? 'none' : 'block';
  if (ops)
    for (const b of $('dOpciones').querySelectorAll('button'))
      b.onclick = ev => { ev.stopPropagation(); _cerrarDialogo(d.opciones[+b.dataset.op].valor); };
}

function _avanzarDialogo() {
  const d = dialogoActivo;
  if (!d || (d.opciones && d.i === d.lineas.length - 1)) return;   // esperando elección
  d.i++;
  if (d.i >= d.lineas.length) _cerrarDialogo(undefined);
  else _pintarDialogo();
}
function _cerrarDialogo(valor) {
  const d = dialogoActivo;
  dialogoActivo = null;
  $('dialogo').style.display = 'none';
  d.res(valor);
}

// dibuja el sprite de la unidad ampliado en el canvas del retrato
function _retrato(u) {
  const cv = $('dRetrato');
  const rctx = cv.getContext('2d');
  const prev = ctx;
  ctx = rctx;
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    // foco de luz detrás del personaje
    const g = ctx.createRadialGradient(60, 78, 8, 60, 78, 62);
    g.addColorStop(0, 'rgba(57,197,224,.25)');
    g.addColorStop(1, 'rgba(57,197,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(60, 126);
    ctx.scale(3.2, 3.2);
    if (u.vehiculo) dibVehiculo(u);
    const S = { dron: dibDron }[u.sprite] || dibHumano;
    S(u);
  } finally {
    ctx = prev;
  }
}

// ---------- Punto de venta: prender de cerca o molotov a distancia ----------
async function interactuarPunto(sel, p) {
  // adyacente: prenderle fuego a mano (consume la acción y despierta a la banda)
  if (mdist(sel.x, sel.y, p.x, p.y) === 1) {
    prenderDeCerca(sel, p);
    return void terminarAccion(sel);
  }
  // con arma de área: buscar celda alcanzable desde donde llegue la molotov
  const a = armaDe(sel);
  if (a.tipo !== 'area') {
    registrar('Acércate al punto para prenderlo, o lánzale la 🔥 molotov desde lejos.');
    return;
  }
  const celdas = paradasDe(sel, partida.alcance).filter(key => {
    const [cx, cy] = desClave(key);
    const d = mdist(cx, cy, p.x, p.y);
    return d >= a.rmin && d <= a.rmax;
  });
  if (!celdas.length) {
    registrar('La molotov no llega desde ahí: acércate un poco más.');
    return;
  }
  partida.ocupado = true;
  // la celda más lejana dentro del rango (menos riesgo)
  celdas.sort((k1, k2) => mdist(...desClave(k2), p.x, p.y) - mdist(...desClave(k1), p.x, p.y));
  await animMover(sel, rutaHacia(partida.alcance, celdas[0]));
  await ataqueArea(sel, p.x, p.y);
  partida.ocupado = false;
  if (!partida.terminada) await terminarAccion(sel);
}

// ---------- Ficha de unidad ----------
const NOMBRES_STATS = { FUE: 'Fuerza', AGI: 'Agilidad', VIT: 'Vitalidad', DES: 'Destreza', SUE: 'Suerte' };

function fichaUnidad(u) {
  const esJugador = u.equipo === 'jugador';
  const claseNombre = esJugador ? CLASES[u.clase].nombre : ENEMIGOS[u.clase].nombre;
  const oculta = !esJugador && !u.marcado;   // sin foto, stats enemigos ocultos
  const pct = Math.round(100 * u.pv / u.pvMax);
  const t = terrenoEn(u.x, u.y);
  const a = armaDe(u);
  const puedeGastar = esJugador && u.puntos > 0 && partida.fase === 'jugador';
  const statsHTML = oculta
    ? '<div style="color:var(--dim)">📸 Fotografíalo para ver sus stats</div>'
    : `<div class="statsRPG">${Object.keys(u.stats).map(s => `
        <span title="${NOMBRES_STATS[s]}">${s} <b>${u.stats[s]}</b>${
          puedeGastar ? `<a class="mas" data-uid="${u.id}" data-stat="${s}">+</a>` : ''
        }</span>`).join('')}
        ${esJugador && !u.vuela ? `<span title="Espacios de carga">🎒 <b>${u.slots}</b>${
          puedeGastar && u.slots < 6 ? `<a class="mas" data-uid="${u.id}" data-slot="1">+</a>` : ''}</span>` : ''}
      </div>`;
  const armaHTML = u.noAtaca
    ? '<div style="color:var(--dim)">🚫 No ataca — revela el mapa y fotografía</div>'
    : `<div class="armaEquipada">${a.icono} <b>${a.nombre}</b> · daño ${a.dano} · rango ${a.rmin === a.rmax ? a.rmax : a.rmin + '–' + a.rmax}
       · ${u.arma.usos === Infinity ? '∞' : u.arma.usos + ' usos'}
       ${u.vehiculo ? ' · ' + (u.vehiculo === 'skate' ? '🛹' : '🛴') : ''}
       ${u.armadura ? ` · ${OBJETOS[u.armadura].icono} +${OBJETOS[u.armadura].defensa} def` : ''}</div>`;
  const mochilaHTML = esJugador && !u.vuela
    ? `<div class="mochila">🎒 ${u.mochila.map((it, i) => {
        const d = defDe(it), rz = rarezaDe(it);
        const accion = d.tipo === 'cura' ? `data-cura="${i}"` : `data-equipa="${i}"`;
        return `<a class="itemMochila" ${accion} data-uid="${u.id}" style="color:${rz.color}"
                 title="${d.nombre}${d.tipo === 'cura' ? ' (usar = acción)' : ' (equipar gratis: muestra su rango)'}">${d.icono}</a>`;
      }).join(' ')}${'<span class="slotVacio">▫</span>'.repeat(Math.max(0, u.slots - u.mochila.length))}</div>` : '';
  return `
    <div class="uname ${esJugador ? 'jugador' : 'enemigo'}">${u.nombre}
      ${u.jefe ? ' <span style="color:var(--gold)">$ OBJETIVO</span>' : ''}
      ${u.sapo ? ' <span style="color:#ff9040">SAPO</span>' : ''}</div>
    <div style="color:var(--dim);font-size:11px">${claseNombre} · Nv ${u.nivel}
      ${esJugador ? `· exp ${u.exp}/${expSiguiente(u.nivel)}` : ''}
      ${esJugador && u.puntos ? ` · <b style="color:var(--gold)">${u.puntos} pts</b>` : ''}</div>
    <div class="hpbar"><div style="width:${pct}%"></div></div>
    <div class="stats">
      <span>PV <b>${u.pv}/${u.pvMax}</b></span>
      <span>MOV <b>${u.mov}</b></span>
      <span>Esquiva <b>${oculta ? '?' : esquivaDe(u) + '%'}</b></span>
      <span>Crítico <b>${oculta ? '?' : criticoDe(u) + '%'}</b></span>
      <span>Suelo <b>${t.nombre}${t.def ? ' +' + t.def : ''}</b></span>
      <span>Visión <b>${u.vision}</b></span>
    </div>
    ${statsHTML}${armaHTML}${mochilaHTML}
    ${u.actuo ? '<div style="color:var(--dim);margin-top:4px">✓ Ya actuó este turno</div>' : ''}`;
}

function refrescarPanel() {
  if (!$('etiquetaTurno')) return;
  const tl = $('etiquetaTurno');
  if (partida.fase === 'jugador') { tl.textContent = `Ronda ${partida.ronda} — Patrulla`; tl.className = 'jugador'; }
  else { tl.textContent = `Ronda ${partida.ronda} — ${partida.banda || 'La banda'}`; tl.className = 'enemigo'; }
  $('nombreBarrio').textContent = `${partida.nombreBarrio} · Barrio ${partida.barrio}`;
  $('objetivoTexto').innerHTML = partida.tipoMision === 'molotov'
    ? (mapa && mapa.puntos.length && !puntosVivos().length
        ? '🏃 <b>¡Todos de vuelta al borde oeste!</b>'
        : '🔥 Quema el <b>punto de venta</b> y escapa por el oeste')
    : partida.tipoMision === 'puntos'
      ? `🔥 Puntos de venta quemados: <b>${mapa ? mapa.puntos.length - puntosVivos().length : 0}/${mapa ? mapa.puntos.length : 0}</b>`
      : `💀 Elimina al vendedor <b style="color:var(--gold)">$</b> de ${partida.banda || 'la banda'}`;

  // habilidades de crew ganadas
  const cont = $('habilidadesCrew');
  cont.innerHTML = cruzada.habilidades.map(id => {
    const h = HABILIDADES_CREW[id], rz = RAREZAS[h.rareza];
    const usos = partida.usosHabilidad[id] || 0;
    return `<button class="habCrew" data-hab="${id}" ${habilidadLista(id) ? '' : 'disabled'}
      style="border-color:${rz.color};color:${usos ? rz.color : 'var(--dim)'}"
      title="${h.desc} (${rz.nombre})">${h.icono} ${h.nombre}${usos ? '' : ' (usada)'}</button>`;
  }).join('');
  for (const el of cont.querySelectorAll('.habCrew'))
    el.onclick = () => { activarAudio(); usarHabilidadCrew(el.dataset.hab); };
  $('respetoBarra').style.width = cruzada.respeto + '%';
  $('respetoNum').textContent = cruzada.respeto;
  $('cartasNum').textContent = `${Math.min(cruzada.cartas, CARTAS_PARA_OPERATIVO)}/${CARTAS_PARA_OPERATIVO}`;
  $('btnFinTurno').disabled = partida.ocupado || partida.terminada || partida.fase !== 'jugador';
  $('btnEsperar').style.display = partida.estado === 'objetivo' ? 'block' : 'none';
  $('btnTelefono').style.display =
    (partida.estado === 'seleccion' && partida.seleccion && !partida.seleccion.actuo) ? 'block' : 'none';
  const op = $('btnOperativo');
  op.style.display = cruzada.cartas >= CARTAS_PARA_OPERATIVO ? 'block' : 'none';
  op.disabled = !operativoDisponible() || partida.ocupado || partida.fase !== 'jugador';
  op.textContent = partida.operativoRondas > 0 ? `🚨 Operativo activo (${partida.operativoRondas})`
    : cruzada.operativoUsado ? '🚨 Operativo (usado)' : '🚨 Operativo municipal';

  const foco = partida.hoverUnidad || partida.seleccion;
  $('infoUnidad').innerHTML = foco
    ? fichaUnidad(foco)
    : (partida.hover
      ? `<span style="color:var(--dim)">${infoCelda(...partida.hover)}</span>`
      : '<span style="color:var(--dim)">Pasa el cursor o selecciona una unidad</span>');

  // botones dinámicos de la ficha (subir stat / ampliar mochila, usar mochila)
  for (const el of document.querySelectorAll('#infoUnidad .mas'))
    el.onclick = ev => {
      ev.stopPropagation();
      const u = unidades.find(x => x.id == el.dataset.uid);
      if (!u) return;
      if (el.dataset.slot) subirSlots(u); else subirStat(u, el.dataset.stat);
    };
  for (const el of document.querySelectorAll('#infoUnidad .itemMochila'))
    el.onclick = ev => {
      ev.stopPropagation();
      const u = unidades.find(x => x.id == el.dataset.uid);
      if (!u || u.actuo || partida.ocupado || partida.fase !== 'jugador') return;
      if (el.dataset.cura !== undefined) { if (usarCura(u, +el.dataset.cura)) terminarAccion(u); }
      else equiparDeMochila(u, +el.dataset.equipa);
    };

  // pronóstico
  const fb = $('cajaPronostico');
  const sel = partida.seleccion, hov = partida.hoverUnidad;
  let ver = false;
  if (sel && hov && hov.equipo === 'enemigo' && !sel.noAtaca) {
    let desde = null;
    if (partida.estado === 'objetivo' && partida.postBlancos.includes(hov)) desde = [sel.x, sel.y];
    else if (partida.estado === 'seleccion' && partida.blancos && partida.blancos.has(hov)) {
      const celda = mejorCeldaAtaque(sel, partida.blancos.get(hov), hov, partida.alcance);
      if (celda) desde = desClave(celda);
    }
    if (desde) {
      const p = pronostico(sel, hov);
      const d = mdist(desde[0], desde[1], hov.x, hov.y);
      const aE = armaDe(hov);
      const contra = !hov.sapo && hov.aturdido <= 0 && d >= aE.rmin && d <= aE.rmax;
      $('pronostico').innerHTML = `
        <div class="frow"><span>Tu daño</span><b>${p.dano}</b></div>
        <div class="frow"><span>Precisión / crítico</span><b>${p.prec} / ${p.crit}</b></div>
        <div class="frow"><span>Contraataque</span><b>${contra ? pronostico(hov, sel).dano : '—'}</b></div>`;
      ver = true;
    }
  }
  fb.style.display = ver ? 'block' : 'none';
}

function infoCelda(x, y) {
  if (!explorado(x, y)) return 'Zona sin explorar — acerca la patrulla o el dron';
  const ch = charEn(x, y), t = TERRENOS[ch];
  let extra = t.def ? ` · defensa +${t.def}` : '';
  if (ch === 'J' && !mapa.cajasAbiertas.has(clave(x, y))) extra += ' · 📦 písala para abrirla';
  if (ch === 'N' && !mapa.bancasRotas.has(clave(x, y))) extra += ' · rompible: da un palo (cuesta el turno)';
  if (ch === 'S' && !mapa.bancasRotas.has(clave(x, y))) extra += ' · rompible: la silla sirve de arma (cuesta el turno)';
  if (ch === 'O' && !mapa.bancasRotas.has(clave(x, y))) extra += ' · rompible: nunca se sabe qué hay adentro (cuesta el turno)';
  if (ch === 'P') { const p = puntoEn(x, y); extra += p && p.quemado ? ' · 🔥 ya arde' : ' · 🎯 quémalo: molotov o de cerca'; }
  if (ch === 'K') extra += ' · skatepark';
  if (mapa.fuego.has(clave(x, y))) extra += ' · 🔥 ardiendo';
  const s = sueltos.find(o => o.x === x && o.y === y);
  if (s && visible(x, y)) extra += ` · en el piso: ${defDe(s.item).icono} ${defDe(s.item).nombre}`;
  return t.nombre + extra;
}
