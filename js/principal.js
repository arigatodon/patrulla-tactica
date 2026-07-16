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
  // ¿quedan blancos desde aquí sin volver a mover?
  const post = vivos('enemigo').filter(e => visible(e.x, e.y) && enRangoAtaque(u, e.x, e.y));
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
  const jefes = vivos('enemigo').filter(e => e.jefe);
  if (!jefes.length) return finMision(true);
  if (!vivos('jugador').filter(u => !u.vuela).length) return finMision(false);   // el dron solo no pelea
}

function finMision(gano) {
  partida.terminada = true; partida.ocupado = true;
  const pantalla = $('pantallaFin'), titulo = $('finTitulo');
  if (gano) {
    titulo.textContent = `✔ ${partida.nombreBarrio} es libre`;
    titulo.className = 'gana';
    // recompensas de escenario: respeto + posible carta extra si el barrio es alto
    let extra = '';
    if (rnd() < 0.25 + partida.barrio * 0.05) {
      cruzada.cartas++;
      extra = ' Un vecino agradecido entrega una <b style="color:#f0c040">carta municipal</b>.';
    }
    $('finTexto').innerHTML =
      `La banda quedó fuera en ${partida.ronda} rondas. Los vecinos salen a la calle y la app se llena de puntos verdes.${extra}`;
    cruzada.barrio = partida.barrio + 1;
    cruzada.operativoUsado = false;   // el favor municipal se renueva por barrio
    $('btnSiguiente').textContent = `Siguiente barrio: ${BARRIOS[Math.min(cruzada.barrio - 1, BARRIOS.length - 1)].nombre} →`;
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
  const info = BARRIOS[Math.min(nBarrio - 1, BARRIOS.length - 1)];
  const semilla = semillaOpcional !== undefined ? semillaOpcional : Math.floor(Math.random() * 2 ** 31);

  mapa = generarMapa(semilla, nBarrio);
  centrarCamara();
  poblarBarrio(nBarrio);

  efectos = []; tweens = []; lineasRegistro = []; feed = [];
  Object.assign(partida, {
    barrio: nBarrio, nombreBarrio: info.nombre, banda: info.banda,
    ronda: 1, fase: 'jugador', estado: 'idle',
    seleccion: null, alcance: null, blancos: null, postBlancos: null,
    hover: null, hoverUnidad: null, ocupado: false, terminada: false,
    banner: null, sacudida: 0, operativoRondas: 0, fotosEsteTurno: 0, hazanas: [],
  });
  actualizarVision();

  registrar(`📍 <b>${info.nombre}</b> — banda: <b>${info.banda}</b>. La patrulla entra por el oeste.`, 'imp');
  registrar('Usa a "La Garza" (dron) para revelar el barrio y fotografiar soldados y sapos.');
  mostrarBanner(`${info.nombre.toUpperCase()} — RONDA 1`, '#39c5e0');
  guardar();
  refrescarPanel();
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
    iniciarMision();
  });
  $('btnSiguiente').addEventListener('click', () => {
    $('pantallaFin').style.display = 'none';
    iniciarMision();
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
