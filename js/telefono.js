'use strict';

/* ============================================================
   telefono.js — el celular de la patrulla: fotos que marcan
   enemigos y exponen sapos, publicaciones que dan respeto (o
   backlash), convocar vecinos y el feed de la red vecinal.
   ============================================================ */

let feed = [];   // publicaciones: {texto, likes, cls}

// ---------- Respeto ----------
function cambiarRespeto(delta, motivo) {
  cruzada.respeto = Math.max(0, Math.min(RESPETO_MAX, cruzada.respeto + delta));
  if (delta !== 0) {
    registrar(`${delta > 0 ? '📈 +' : '📉 '}${delta} respeto — ${motivo}.`, delta > 0 ? 'bien' : 'mal');
    guardar();
    refrescarPanel();
  }
}

// ---------- Abrir / cerrar el panel (desliza desde el borde derecho) ----------
function abrirTelefono(u) {
  if (u.actuo || partida.ocupado) return;
  partida.estado = 'telefono';
  partida.seleccion = u;
  $('telefono').classList.add('abierto');
  pintarTelefono(u);
  SFX.notif();
}
function cerrarTelefono() {
  $('telefono').classList.remove('abierto');
  if (partida.estado === 'telefono') { partida.estado = 'idle'; partida.seleccion = null; }
  refrescarPanel();
}

// ---------- Acciones del teléfono (cada una consume la acción del personaje) ----------

// enemigos visibles a distancia de foto (visión del que fotografía)
function fotografiables(u) {
  return vivos('enemigo').filter(e =>
    !e.marcado && visible(e.x, e.y) && mdist(u.x, u.y, e.x, e.y) <= u.vision + 1);
}

function accionFoto(u) {
  const objetivos = fotografiables(u);
  if (!objetivos.length) return;
  // prioridad: sapos (exponerlos los saca del mapa), luego el más cercano
  objetivos.sort((a, b) => (b.sapo - a.sapo) || (mdist(u.x, u.y, a.x, a.y) - mdist(u.x, u.y, b.x, b.y)));
  const e = objetivos[0];
  e.marcado = true;
  SFX.foto();
  destelloFoto(e.x, e.y);
  const esTecnico = u.clase === 'tecnico';
  if (e.sapo) {
    e.expuesto = true;
    publicar(POSTS_FOTO_SAPO[Math.floor(Math.random() * POSTS_FOTO_SAPO.length)], 'bien');
    cambiarRespeto(esTecnico ? 10 : 8, 'sapo expuesto en la red vecinal');
    registrar(`📸 <b>${u.nombre}</b> expone al sapo: abandonará la banda.`, 'imp');
    e.seVaEnRonda = partida.ronda + 1;   // se retira al inicio de su próximo turno
  } else {
    publicar(POSTS_FOTO_SOLDADO[Math.floor(Math.random() * POSTS_FOTO_SOLDADO.length)], '');
    cambiarRespeto(esTecnico ? 4 : 3, `${e.nombre} identificado`);
    registrar(`📸 <b>${u.nombre}</b> marca a ${e.nombre}: stats visibles y +1 daño en su contra.`);
  }
  darExp(u, 6);
  terminarAccionTelefono(u);
}

function accionPublicar(u) {
  if (!partida.hazanas.length) return;
  const n = partida.hazanas.length;
  partida.hazanas = [];
  // riesgo de backlash: la SUE del que publica lo reduce
  const riesgo = Math.max(4, 18 - u.stats.SUE);
  if (rnd() * 100 < riesgo) {
    publicar(POSTS_BACKLASH[Math.floor(Math.random() * POSTS_BACKLASH.length)], 'mal');
    cambiarRespeto(-5, 'la publicación salió mal y el público se enojó');
  } else {
    publicar(POSTS_HAZANA[Math.floor(Math.random() * POSTS_HAZANA.length)], 'bien');
    const ganancia = (3 + n * 3) * (u.clase === 'tecnico' ? 1.5 : 1);
    cambiarRespeto(Math.round(ganancia), `el barrio celebra ${n} ${n === 1 ? 'hazaña' : 'hazañas'}`);
  }
  darExp(u, 4);
  terminarAccionTelefono(u);
}

function accionConvocar(u) {
  if (cruzada.respeto < COSTO_CONVOCAR) return;
  cambiarRespeto(-COSTO_CONVOCAR, 'convocatoria por la app vecinal');
  const v = convocarVecino();
  if (v) {
    publicar(`"¿Quién puede venir YA a ${partida.nombreBarrio}?" — ${v.nombre} respondió.`, 'bien');
    registrar(`🤝 <b>${v.nombre}</b> se une a la patrulla (entra por el oeste).`, 'imp');
    SFX.gana();
  }
  terminarAccionTelefono(u);
}

function terminarAccionTelefono(u) {
  cerrarTelefono();
  u.actuo = true;
  partida.seleccion = null;
  partida.estado = 'idle';
  refrescarPanel();
  chequearFinDeTurnoAuto();
}

// ---------- Feed ----------
function publicar(texto, cls) {
  const likes = 12 + Math.floor(Math.random() * 88) + cruzada.respeto * 3;
  feed.unshift({ texto, likes, cls: cls || '' });
  feed = feed.slice(0, 12);
  const com = COMENTARIOS_PUBLICO[Math.floor(Math.random() * COMENTARIOS_PUBLICO.length)];
  feed[0].comentario = com;
}

function pintarTelefono(u) {
  const fotos = fotografiables(u);
  const puedePublicar = partida.hazanas.length > 0;
  const puedeConvocar = cruzada.respeto >= COSTO_CONVOCAR;
  $('telTitulo').textContent = `Celular de ${u.nombre}`;
  $('telRespeto').innerHTML = `Respeto del barrio: <b>${cruzada.respeto}</b>/${RESPETO_MAX}`;
  $('telAcciones').innerHTML = `
    <button class="telBtn" id="btnFoto" ${fotos.length ? '' : 'disabled'}>
      📸 Fotografiar ${fotos.length ? (fotos[0].sapo ? '¡SAPO a la vista!' : fotos[0].nombre) : '(nadie a la vista)'}
    </button>
    <button class="telBtn" id="btnPublicar" ${puedePublicar ? '' : 'disabled'}>
      📢 Publicar hazañas (${partida.hazanas.length})
    </button>
    <button class="telBtn" id="btnConvocar" ${puedeConvocar ? '' : 'disabled'}>
      🤝 Convocar vecino (−${COSTO_CONVOCAR} respeto)
    </button>`;
  $('btnFoto').onclick = () => accionFoto(u);
  $('btnPublicar').onclick = () => accionPublicar(u);
  $('btnConvocar').onclick = () => accionConvocar(u);
  $('telFeed').innerHTML = feed.map(p => `
    <div class="post ${p.cls}">
      <div>${p.texto}</div>
      <div class="postMeta">❤️ ${p.likes}${p.comentario ? ` · 💬 “${p.comentario}”` : ''}</div>
    </div>`).join('') || '<div class="post"><div style="color:var(--dim)">La red vecinal está tranquila…</div></div>';
}

// ---------- Habilidad global de crew: Operativo municipal ----------
function operativoDisponible() {
  return cruzada.cartas >= CARTAS_PARA_OPERATIVO && !cruzada.operativoUsado && !partida.terminada;
}
function usarOperativo() {
  if (!operativoDisponible() || partida.ocupado || partida.fase !== 'jugador') return;
  cruzada.operativoUsado = true;
  partida.operativoRondas = RONDAS_OPERATIVO;
  SFX.sirena();
  mostrarBanner('🚨 OPERATIVO MUNICIPAL 🚨', '#f0c040');
  registrar(`🚨 <b>Operativo municipal</b>: una llamada con los papeles correctos y las patrullas oficiales "pasan de casualidad". Los soldados se abren por ${RONDAS_OPERATIVO} rondas.`, 'imp');
  publicar('Raro: la municipal patrullando justo hoy por aquí… 🤔', '');
  for (const e of vivos('enemigo')) if (!e.jefe) e.disuadido = true;
  guardar();
  refrescarPanel();
}
