'use strict';

/* ============================================================
   principal.js — flujo del turno del jugador, misión,
   campamento entre barrios y bucle de render.
   ============================================================ */

// ---------- Flujo del jugador ----------
function seleccionar(u) {
  partida.seleccion = u;
  partida.estado = 'seleccion';
  partida.alcance = alcanceDe(u);
  partida.blancos = opcionesAtaque(u, partida.alcance);
  SFX.sel();
  refrescarPanel();
}

function deseleccionar() {
  partida.seleccion = null; partida.alcance = null; partida.blancos = null; partida.postBlancos = null;
  if (partida.estado !== 'telefono') partida.estado = 'idle';
  refrescarPanel();
}

async function terminarAccion(u) {
  u.actuo = true;
  deseleccionar();
  chequearFinDeTurnoAuto();
}

function chequearFinDeTurnoAuto() {
  if (!partida.terminada && partida.fase === 'jugador' && vivos('jugador').every(p => p.actuo))
    setTimeout(() => { if (!partida.ocupado && !partida.terminada) terminarTurnoJugador(); }, 400);
}

async function moverJugador(u, destinoClave) {
  partida.ocupado = true;
  const ruta = rutaHacia(partida.alcance, destinoClave);
  await animMover(u, ruta);
  // caja debajo / loot en el piso
  if (charEn(u.x, u.y) === 'J' && !mapa.cajasAbiertas.has(clave(u.x, u.y))) abrirCaja(u, u.x, u.y);
  recogerSuelto(u);
  chequearFin();   // p. ej. escape del prólogo completado con este movimiento
  if (partida.terminada) { partida.ocupado = false; return; }
  // ¿quedan blancos desde aquí sin volver a mover?
  const post = vivos('enemigo').filter(e => (visible(e.x, e.y) || e.marcado) && enRangoAtaque(u, e.x, e.y));
  partida.ocupado = false;
  if (post.length) {
    partida.estado = 'objetivo';
    partida.postBlancos = post;
    refrescarPanel();
  } else {
    await terminarAccion(u);
  }
}

async function atacarMoviendo(u, enemigo) {
  partida.ocupado = true;
  const celda = mejorCeldaAtaque(u, partida.blancos.get(enemigo), enemigo, partida.alcance);
  await animMover(u, rutaHacia(partida.alcance, celda));
  if (charEn(u.x, u.y) === 'J' && !mapa.cajasAbiertas.has(clave(u.x, u.y))) abrirCaja(u, u.x, u.y);
  recogerSuelto(u);
  await combate(u, enemigo);
  partida.ocupado = false;
  if (!partida.terminada) await terminarAccion(u);
}

async function atacarDesdeAqui(u, enemigo) {
  partida.ocupado = true;
  await combate(u, enemigo);
  partida.ocupado = false;
  if (!partida.terminada) await terminarAccion(u);
}

function terminarTurnoJugador() {
  if (partida.ocupado || partida.terminada || partida.fase !== 'jugador') return;
  if (partida.estado === 'telefono') cerrarTelefono();
  deseleccionar();
  // sapos expuestos se retiran al cierre del turno
  for (const e of [...vivos('enemigo')]) {
    if (e.sapo && e.expuesto) {
      registrar(`El sapo expuesto abandona el barrio: la banda pierde sus ojos.`, 'bien');
      e.pv = 0; e.animMuerte = 1;
    }
  }
  turnoEnemigo();
}

// ---------- Fin de misión ----------
function chequearFin() {
  if (partida.terminada) return;
  if (!vivos('jugador').filter(u => !u.vuela).length) return finMision(false);   // el dron solo no pelea
  if (partida.tipoMision === 'molotov') {
    // prólogo: punto quemado + toda la patrulla de vuelta en el borde oeste
    if (mapa.puntos.length && !puntosVivos().length && vivos('jugador').every(u => u.x <= 1))
      return finMision(true);
  } else if (partida.tipoMision === 'puntos') {
    // Barrio Estación: quemar todos los puntos de venta
    if (mapa.puntos.length && !puntosVivos().length) return finMision(true);
  } else {
    const jefes = vivos('enemigo').filter(e => e.jefe);
    if (!jefes.length) return finMision(true);
  }
}

function finMision(gano) {
  partida.terminada = true; partida.ocupado = true;
  const pantalla = $('pantallaFin'), titulo = $('finTitulo');
  if (gano) {
    titulo.textContent = partida.tipoMision === 'molotov'
      ? '✔ El punto ardió y nadie los vio venir'
      : `✔ ${partida.nombreBarrio} es libre`;
    titulo.className = 'gana';
    // recompensas de escenario: carta posible + habilidad de crew por rareza
    let extra = '';
    if (rnd() < 0.25 + partida.barrio * 0.05) {
      cruzada.cartas++;
      extra = ' Un vecino agradecido entrega una <b style="color:#f0c040">carta municipal</b> 📇.';
    }
    const hab = recompensaEscenario();
    if (hab) {
      const h = HABILIDADES_CREW[hab], rz = RAREZAS[h.rareza];
      extra += ` La cruzada aprende algo nuevo: ${h.icono} <b style="color:${rz.color}">${h.nombre}</b> <small>(${rz.nombre})</small> — ${h.desc}`;
    }
    $('finTexto').innerHTML = (partida.tipoMision === 'molotov'
      ? `La primera chispa. Mañana otra patrulla lanzará la suya en otro barrio — y la junta de Crespo ya ofreció prestar su dron.`
      : `La banda quedó fuera en ${partida.ronda} rondas. Los vecinos salen a la calle y la app se llena de puntos verdes.`) + extra;
    cruzada.barrio = partida.barrio + 1;
    cruzada.operativoUsado = false;   // el favor municipal se renueva por barrio
    $('btnSiguiente').textContent = `${capituloDe(cruzada.barrio).titulo} →`;
    SFX.gana();
  } else {
    titulo.textContent = '✖ La patrulla se repliega';
    titulo.className = 'pierde';
    $('finTexto').innerHTML =
      'Los que quedaron en pie sacaron a los heridos. El barrio sigue tomado… por ahora. La cruzada no termina: se reintenta con lo aprendido.';
    cambiarRespeto(-8, 'la retirada duele');
    $('btnSiguiente').textContent = `Reintentar ${partida.nombreBarrio} →`;
    SFX.pierde();
  }
  guardar();
  setTimeout(() => { pantalla.style.display = 'flex'; }, 900);
}

// ---------- Iniciar misión ----------
function iniciarMision(semillaOpcional) {
  const nBarrio = cruzada.barrio;
  const cap = capituloDe(nBarrio);
  const semilla = semillaOpcional !== undefined ? semillaOpcional : Math.floor(Math.random() * 2 ** 31);

  mapa = generarMapa(semilla, nBarrio, cap.tema);
  rotacion = 0; panX = 0; panY = 0; zoomExtra = 1;
  centrarCamara();

  // puntos de venta según el tipo de misión (antes de poblar: llevan guardias)
  if (cap.tipo === 'molotov') colocarPuntos(1, false);
  else if (cap.tipo === 'puntos') colocarPuntos(3, cap.tema === 'estacion');

  poblarBarrio(nBarrio, cap);

  // usos de habilidades de crew por misión
  const usos = {};
  for (const id of cruzada.habilidades) usos[id] = 1;

  efectos = []; tweens = []; lineasRegistro = []; feed = [];
  Object.assign(partida, {
    barrio: nBarrio, nombreBarrio: cap.nombre, banda: cap.banda, tipoMision: cap.tipo, tema: cap.tema,
    ronda: 1, fase: 'jugador', estado: 'idle',
    seleccion: null, alcance: null, blancos: null, postBlancos: null,
    hover: null, hoverUnidad: null, ocupado: false, terminada: false,
    banner: null, sacudida: 0, operativoRondas: 0, fotosEsteTurno: 0, hazanas: [],
    apagonRondas: 0, murgaRondas: 0, usosHabilidad: usos,
    policia: null, policiaLlamada: false,
    rondaOlas: RONDA_OLAS_BASE + Math.floor(nBarrio / 2),
  });
  actualizarVision();

  registrar(`📍 <b>${cap.nombre}</b> — banda: <b>${cap.banda}</b>. La patrulla entra por el oeste.`, 'imp');
  registrar(cap.tipo === 'molotov'
    ? '🔥 Quema el punto de venta y vuelve con todos al borde oeste.'
    : cap.tipo === 'puntos'
      ? `🔥 Quema los <b>${mapa.puntos.length} puntos de venta</b> de ${cap.banda}.`
      : 'Usa a "La Garza" (dron) para revelar el sector y fotografiar soldados y sapos.');
  mostrarBanner(`${cap.nombre.toUpperCase()} — RONDA 1`, '#39c5e0');
  guardar();
  refrescarPanel();
  if (cap.dialogo) dialogo(cap.dialogo);   // conversación de apertura del sector
}

// briefing del capítulo antes de arrancar
function mostrarBriefing() {
  const cap = capituloDe(cruzada.barrio);
  $('briefTitulo').textContent = cap.titulo;
  $('briefTexto').innerHTML = cap.brief;
  $('pantallaBrief').style.display = 'flex';
}

// ---------- Bucle principal ----------
let _ultimoT = 0;
function cuadro(t) {
  const dt = Math.min(50, t - _ultimoT);
  _ultimoT = t; reloj = t;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.e += dt;
    const p = Math.min(1, tw.e / tw.ms);
    tw.fn(p);
    if (p >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  for (let i = efectos.length - 1; i >= 0; i--)
    if (!efectos[i].update(dt)) efectos.splice(i, 1);
  if (partida.sacudida > 0) partida.sacudida = Math.max(0, partida.sacudida - dt * 0.03);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);   // encuadre de mapas grandes
  if (partida.sacudida > 0.2)
    ctx.translate((Math.random() - 0.5) * partida.sacudida, (Math.random() - 0.5) * partida.sacudida);

  if (mapa) {
    dibujarSuelo();
    dibujarResaltados();
    dibujarAltos();
    for (const fx of efectos) fx.draw(ctx);
    dibujarBanner(dt);
  }
  requestAnimationFrame(cuadro);
}

// ---------- Arranque ----------
function arrancar() {
  cargar();
  conectarEntrada();
  $('btnEmpezar').addEventListener('click', () => {
    activarAudio();
    $('pantallaIntro').style.display = 'none';
    mostrarBriefing();
  });
  $('btnBrief').addEventListener('click', () => {
    activarAudio();
    $('pantallaBrief').style.display = 'none';
    iniciarMision();
  });
  $('btnSiguiente').addEventListener('click', () => {
    $('pantallaFin').style.display = 'none';
    mostrarBriefing();
  });
  $('btnAmbiente').addEventListener('click', () => {
    $('btnAmbiente').textContent = alternarAmbiente() ? '🔊 ambiente: sí' : '🔈 ambiente: no';
  });
  $('btnReiniciarTodo').addEventListener('click', () => {
    if (!confirm('¿Borrar todo el progreso de la cruzada?')) return;
    borrarSave();
    location.reload();
  });
  if (location.search.includes('nointro')) {
    $('pantallaIntro').style.display = 'none';
    iniciarMision(12345);
  }
  requestAnimationFrame(cuadro);
}
if (canvas) arrancar();
