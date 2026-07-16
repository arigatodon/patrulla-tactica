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
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}
function elegirCelda(px, py) {
  let mejor = null, mejorD = 24;
  for (const u of unidades) {
    if (u.pv <= 0) continue;
    if (u.equipo === 'enemigo' && !visible(u.x, u.y)) continue;
    const alt = u.vuela ? -18 : 0;
    const d = Math.hypot(px - isoX(u.gx, u.gy), py - (isoY(u.gx, u.gy) - 16 + alt));
    if (d < mejorD) { mejorD = d; mejor = u; }
  }
  if (mejor) return [mejor.x, mejor.y, mejor];
  const rx = (px - OX) / (TW / 2), ry = (py - OY) / (TH / 2);
  const x = Math.floor((rx + ry) / 2), y = Math.floor((ry - rx) / 2);
  return enMapa(x, y) ? [x, y, unidadEn(x, y)] : [null, null, null];
}

function conectarEntrada() {
  canvas.addEventListener('click', e => {
    activarAudio();
    if (partida.ocupado || partida.terminada || partida.fase !== 'jugador') return;
    if (partida.estado === 'telefono') { cerrarTelefono(); return; }
    const [x, y, u] = elegirCelda(...posCanvas(e));
    if (x === null) return;

    if (partida.estado === 'idle') {
      if (u && u.equipo === 'jugador' && !u.actuo) seleccionar(u);
      else { partida.hoverUnidad = u; refrescarPanel(); }

    } else if (partida.estado === 'seleccion') {
      const sel = partida.seleccion;
      if (u === sel) return deseleccionar();
      if (u && u.equipo === 'jugador' && !u.actuo) return seleccionar(u);
      if (u && u.equipo === 'enemigo' && partida.blancos.has(u)) return void atacarMoviendo(sel, u);
      // banca adyacente al personaje: romperla
      if (mapa.celdas[y] && mapa.celdas[y][x] === 'N' && !mapa.bancasRotas.has(clave(x, y))
          && mdist(sel.x, sel.y, x, y) === 1 && !sel.noAtaca) {
        romperBanca(sel, x, y);
        return void terminarAccion(sel);
      }
      const key = clave(x, y);
      if (partida.alcance.has(key) && puedeParar(sel, x, y)) return void moverJugador(sel, key);
      deseleccionar();

    } else if (partida.estado === 'objetivo') {
      const sel = partida.seleccion;
      if (u && u.equipo === 'enemigo' && partida.postBlancos.includes(u)) return void atacarDesdeAqui(sel, u);
      terminarAccion(sel);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const [x, y, u] = elegirCelda(...posCanvas(e));
    partida.hover = x === null ? null : [x, y];
    partida.hoverUnidad = u || null;
    refrescarPanel();
  });
  canvas.addEventListener('mouseleave', () => { partida.hover = null; partida.hoverUnidad = null; refrescarPanel(); });

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
  });

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

// ---------- Ficha de unidad ----------
const NOMBRES_STATS = { FUE: 'Fuerza', AGI: 'Agilidad', VIT: 'Vitalidad', DES: 'Destreza', SUE: 'Suerte' };

function fichaUnidad(u) {
  const esJugador = u.equipo === 'jugador';
  const claseNombre = esJugador ? CLASES[u.clase].nombre : ENEMIGOS[u.clase].nombre;
  const oculta = !esJugador && !u.marcado;   // sin foto, stats enemigos ocultos
  const pct = Math.round(100 * u.pv / u.pvMax);
  const t = terrenoEn(u.x, u.y);
  const a = armaDe(u);
  const statsHTML = oculta
    ? '<div style="color:var(--dim)">📸 Fotografíalo para ver sus stats</div>'
    : `<div class="statsRPG">${Object.keys(u.stats).map(s => `
        <span title="${NOMBRES_STATS[s]}">${s} <b>${u.stats[s]}</b>${
          esJugador && u.puntos > 0 && partida.fase === 'jugador'
            ? `<a class="mas" data-uid="${u.id}" data-stat="${s}">+</a>` : ''
        }</span>`).join('')}</div>`;
  const armaHTML = u.noAtaca
    ? '<div style="color:var(--dim)">🚫 No ataca — revela el mapa y fotografía</div>'
    : `<div>${a.icono} ${a.nombre} · daño ${a.dano} · rango ${a.rmin === a.rmax ? a.rmax : a.rmin + '–' + a.rmax}
       · <b>${u.arma.usos === Infinity ? '∞' : u.arma.usos + ' usos'}</b></div>`;
  const mochilaHTML = esJugador && u.mochila.length
    ? `<div class="mochila">🎒 ${u.mochila.map((it, i) => {
        const d = defDe(it), rz = rarezaDe(it);
        const accion = d.tipo === 'cura' ? `data-cura="${i}"` : `data-equipa="${i}"`;
        return `<a class="itemMochila" ${accion} data-uid="${u.id}" style="color:${rz.color}"
                 title="${d.nombre}${d.tipo === 'cura' ? ' (usar = acción)' : ' (equipar gratis)'}">${d.icono}</a>`;
      }).join(' ')}</div>` : '';
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

  // botones dinámicos de la ficha (subir stat, mochila)
  for (const el of document.querySelectorAll('#infoUnidad .mas'))
    el.onclick = ev => { ev.stopPropagation(); const u = unidades.find(x => x.id == el.dataset.uid); if (u) subirStat(u, el.dataset.stat); };
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
  if (mapa.fuego.has(clave(x, y))) extra += ' · 🔥 ardiendo';
  const s = sueltos.find(o => o.x === x && o.y === y);
  if (s && visible(x, y)) extra += ` · en el piso: ${defDe(s.item).icono} ${defDe(s.item).nombre}`;
  return t.nombre + extra;
}
