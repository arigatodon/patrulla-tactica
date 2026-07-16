'use strict';

/* ============================================================
   datos.js — diseño puro: terrenos, rarezas, armas, clases,
   enemigos, barrios y textos. Sin lógica.
   ============================================================ */

// ---------- Terrenos ----------
// Cada celda del mapa es un char. 'B' y 'T' bloquean; el dron vuela por encima.
const TERRENOS = {
  '.': { nombre: 'Calle',     costo: 1, def: 0, bloquea: false, color: '#33373d' },
  ',': { nombre: 'Acera',     costo: 1, def: 0, bloquea: false, color: '#5d626c' },
  'G': { nombre: 'Parque',    costo: 1, def: 1, bloquea: false, color: '#3f6d38' },
  'C': { nombre: 'Cobertura', costo: 2, def: 2, bloquea: false, color: '#5d626c' },
  'B': { nombre: 'Edificio',  costo: 0, def: 0, bloquea: true,  color: '#22252b' },
  'T': { nombre: 'Árbol',     costo: 0, def: 0, bloquea: true,  color: '#3f6d38' },
  'N': { nombre: 'Banca',     costo: 0, def: 0, bloquea: true,  color: '#5d626c', rompible: true },
  'J': { nombre: 'Caja',      costo: 1, def: 1, bloquea: false, color: '#5d626c', caja: true },
  'P': { nombre: 'Punto de venta', costo: 0, def: 0, bloquea: true, color: '#4a3a3a' },
};

// ---------- Rarezas (aura de color) ----------
const RAREZAS = {
  comun:      { nombre: 'Común',       color: '#b8bec8', aura: null,      peso: 55 },
  pococomun:  { nombre: 'Poco común',  color: '#57c8e8', aura: '#57c8e8', peso: 27 },
  rara:       { nombre: 'Rara',        color: '#a86ae8', aura: '#a86ae8', peso: 14 },
  legendaria: { nombre: 'Legendaria',  color: '#f0c040', aura: '#f0c040', peso: 4 },
};
const ORDEN_RAREZA = ['comun', 'pococomun', 'rara', 'legendaria'];

// ---------- Armas ----------
// tipo: 'mele' | 'distancia' | 'area'  ·  usos: durabilidad (Infinity = puños)
// dano se suma a FUE (melé) o DES (distancia). aturde: turnos sin actuar.
const ARMAS = {
  punos:    { nombre: 'Puños',    icono: '👊', tipo: 'mele', dano: 2,  rmin: 1, rmax: 1, usos: Infinity, rareza: 'comun' },
  palo:     { nombre: 'Palo',     icono: '🪵', tipo: 'mele', dano: 4,  rmin: 1, rmax: 1, usos: 6,  rareza: 'comun' },
  botella:  { nombre: 'Botella',  icono: '🍾', tipo: 'mele', dano: 6,  rmin: 1, rmax: 1, usos: 1,  rareza: 'comun' },
  piedras:  { nombre: 'Piedras',  icono: '🪨', tipo: 'distancia', dano: 3, rmin: 2, rmax: 3, usos: 5, rareza: 'comun' },
  silla:    { nombre: 'Silla',    icono: '🪑', tipo: 'mele', dano: 5,  rmin: 1, rmax: 1, usos: 3,  rareza: 'comun' },
  cuchilla: { nombre: 'Cuchilla', icono: '🔪', tipo: 'mele', dano: 6,  rmin: 1, rmax: 1, usos: 8,  rareza: 'pococomun' },
  manopla:  { nombre: 'Manopla',  icono: '🥊', tipo: 'mele', dano: 5,  rmin: 1, rmax: 1, usos: 14, rareza: 'pococomun' },
  taser:    { nombre: 'Táser',    icono: '⚡', tipo: 'mele', dano: 3,  rmin: 1, rmax: 1, usos: 5,  rareza: 'pococomun', aturde: 1 },
  arco:     { nombre: 'Arco',     icono: '🏹', tipo: 'distancia', dano: 6, rmin: 2, rmax: 4, usos: 9, rareza: 'rara' },
  pistola:  { nombre: 'Pistola',  icono: '🔫', tipo: 'distancia', dano: 8, rmin: 2, rmax: 4, usos: 6, rareza: 'rara' },
  molotov:  { nombre: 'Molotov',  icono: '🔥', tipo: 'area', dano: 7, rmin: 2, rmax: 3, usos: 2, rareza: 'rara', incendia: true },
  katana:   { nombre: 'Katana',   icono: '⚔️', tipo: 'mele', dano: 11, rmin: 1, rmax: 1, usos: 12, rareza: 'legendaria' },
};

// Otros objetos que caen en cajas o de enemigos
const OBJETOS = {
  botiquin: { nombre: 'Botiquín', icono: '💊', tipo: 'cura', cura: 8, rareza: 'pococomun' },
  vendas:   { nombre: 'Vendas',   icono: '🩹', tipo: 'cura', cura: 4, rareza: 'comun' },
  carta:    { nombre: 'Carta municipal', icono: '📇', tipo: 'carta', rareza: 'legendaria' },
};

// Loot de cajas: qué puede salir y con qué peso (la rareza del arma manda su aura)
const LOOT_CAJA = [
  { peso: 16, item: 'palo' },  { peso: 10, item: 'botella' }, { peso: 12, item: 'piedras' },
  { peso: 10, item: 'cuchilla' }, { peso: 8, item: 'manopla' }, { peso: 7, item: 'taser' },
  { peso: 5, item: 'arco' }, { peso: 5, item: 'pistola' }, { peso: 4, item: 'molotov' },
  { peso: 1.5, item: 'katana' },
  { peso: 12, item: 'vendas' }, { peso: 7, item: 'botiquin' }, { peso: 2.5, item: 'carta' },
];

// ---------- Clases del jugador ----------
// stats: FUE fuerza · AGI agilidad · VIT vitalidad · DES destreza · SUE suerte
const CLASES = {
  lider:    { nombre: 'Líder',      sprite: 'lider',  stats: { FUE: 6, AGI: 4, VIT: 7, DES: 4, SUE: 5 }, arma: 'palo' },
  tecnico:  { nombre: 'Técnico',    sprite: 'tecnico',stats: { FUE: 3, AGI: 5, VIT: 4, DES: 7, SUE: 6 }, arma: 'taser' },
  pescador: { nombre: 'Explorador', sprite: 'flaco',  stats: { FUE: 5, AGI: 7, VIT: 5, DES: 5, SUE: 4 }, arma: 'piedras' },
  dron:     { nombre: 'Dron',       sprite: 'dron',   stats: { FUE: 1, AGI: 9, VIT: 3, DES: 5, SUE: 5 }, arma: null, vuela: true, vision: VISION_DRON, noAtaca: true },
  vecino:   { nombre: 'Vecino',     sprite: 'vecino', stats: { FUE: 4, AGI: 4, VIT: 5, DES: 4, SUE: 4 }, arma: 'palo' },
};

const EQUIPO_INICIAL = [
  { clase: 'lider',    nombre: 'Doña Ruth' },
  { clase: 'tecnico',  nombre: 'Maicol' },
  { clase: 'pescador', nombre: 'El Flaco Andrés' },
  { clase: 'dron',     nombre: '"La Garza"' },
];

// Nombres para vecinos reclutados
const NOMBRES_VECINOS = [
  'Yesica la mototaxista', 'Wilmer el albañil', 'La seño Carmen', 'Deivis el estudiante',
  'Marelvis la de las arepas', 'El primo Jhonatan', 'Tatiana la mecánica', 'Don Rafa el sastre',
];

// ---------- Enemigos ----------
// El nivel del barrio suma stats. 'sapo' no pelea: alerta a la banda y huye.
const ENEMIGOS = {
  soldado:   { nombre: 'Soldado',   sprite: 'soldado', stats: { FUE: 5, AGI: 4, VIT: 5, DES: 3, SUE: 3 }, arma: 'cuchilla', aggro: 6 },
  pistolero: { nombre: 'Pistolero', sprite: 'pistolero', stats: { FUE: 3, AGI: 3, VIT: 4, DES: 6, SUE: 3 }, arma: 'pistola', aggro: 7 },
  sapo:      { nombre: 'Sapo',      sprite: 'sapo', stats: { FUE: 2, AGI: 6, VIT: 3, DES: 2, SUE: 4 }, arma: null, aggro: 0, sapo: true, vision: 4 },
  vendedor:  { nombre: 'Vendedor',  sprite: 'vendedor', stats: { FUE: 6, AGI: 4, VIT: 8, DES: 5, SUE: 5 }, arma: 'pistola', aggro: 3, jefe: true },
};

// ---------- Campaña: capítulos del GUION.md ----------
// tipo: 'molotov' (quemar el punto y escapar) · 'jefe' (eliminar al vendedor)
//       'final' (jefe élite con más banda)
// La misión N usa CAPITULOS[N-1]; después del final, barrios procedurales.
const CAPITULOS = [
  { tipo: 'molotov', nombre: 'San Diego', banda: 'Los del Punto', jefe: null, sinDron: true,
    titulo: 'Prólogo · "Una molotov cada noche"',
    brief: 'Nadie recuerda quién fue el primero. Esta noche te toca a ti: <b>quema el punto de venta</b> ' +
      '(lanza la 🔥 molotov, o préndele fuego de cerca) y <b>vuelve con todos al borde oeste</b>. ' +
      'Mientras los soldados vigilan este barrio tranquilo, los demás barrios se organizan. Evita que te vean.' },
  { tipo: 'jefe', nombre: 'La Boquilla', banda: 'Los del Muelle', jefe: '"El Mello"',
    titulo: 'Capítulo 1 · "El préstamo"',
    brief: 'La junta de Crespo prestó un dron: <b>"La Garza"</b>. El plan de Doña Ruth: revelar el barrio, ' +
      '<b>identificar a los soldados uno por uno</b> (📸 foto) y sacarlos. Elimina al vendedor <b>"El Mello"</b>.' },
  { tipo: 'jefe', nombre: 'Olaya Herrera', banda: 'Los Cobradores', jefe: '"Care Piña"',
    titulo: 'Capítulo 2 · "Lo que haya a mano"',
    brief: 'Aquí no hay arsenal: hay palos, botellas y bancas que romper. Las patrullas de otros barrios ' +
      'dejaron 📦 <b>cajas escondidas</b> — písalas y mira qué aura sale. Elimina a <b>"Care Piña"</b>.' },
  { tipo: 'jefe', nombre: 'Bazurto', banda: 'Los del Mercado', jefe: '"El Enfermo"',
    titulo: 'Capítulo 3 · "Respeto"',
    brief: 'Todo lo que hagas, publícalo 📱: el <b>respeto</b> trae vecinos a la cruzada (🤝 convocar). ' +
      'Pero cuidado con el backlash. Elimina a <b>"El Enfermo"</b> en el mercado.' },
  { tipo: 'jefe', nombre: 'El Pozón', banda: 'La Oficina', jefe: '"Don Waldo"',
    titulo: 'Capítulo 4 · "Papeles de la Alcaldía"',
    brief: 'Un funcionario arrepentido filtra 📇 <b>cartas municipales</b>. Con 3, podrás jugar sucio una vez: ' +
      '🚨 llamar a la patrulla municipal para dispersar soldados. Elimina a <b>"Don Waldo"</b>.' },
  { tipo: 'jefe', nombre: 'Nelson Mandela', banda: 'Los Invisibles', jefe: '"La Sombra"',
    titulo: 'Capítulo 5 · "Uno por uno"',
    brief: 'La cruzada ya es un método: dron arriba, identificar, aislar, sacar. Cada noche un sector nuevo. ' +
      'Elimina a <b>"La Sombra"</b>.' },
  { tipo: 'final', nombre: 'Getsemaní', banda: 'La Flota del Almirante', jefe: '"El Almirante"',
    titulo: 'Capítulo 6 · "El que manda"',
    brief: 'Las bandas eran franquicias: el proveedor mueve todo desde el puerto. Va con su mejor gente. ' +
      'Elimina a <b>"El Almirante"</b> y Cartagena respira.' },
];
// tras el final: rotación procedural
const BARRIOS_EXTRA = [
  { nombre: 'Torices', banda: 'Los Rezagados' }, { nombre: 'El Campestre', banda: 'La Recaída' },
  { nombre: 'Blas de Lezo', banda: 'Los Nuevos' }, { nombre: 'La María', banda: 'Los Últimos' },
];

function capituloDe(n) {
  if (n <= CAPITULOS.length) return CAPITULOS[n - 1];
  const extra = BARRIOS_EXTRA[(n - CAPITULOS.length - 1) % BARRIOS_EXTRA.length];
  return {
    tipo: 'jefe', nombre: extra.nombre, banda: extra.banda, jefe: '"El Relevo"',
    titulo: `Barrio ${n} · ${extra.nombre}`,
    brief: 'La ciudad es grande y siempre aparece un relevo. El método es el mismo: dron, foto, uno por uno.',
  };
}

// ---------- Habilidades globales de crew (con rareza) ----------
// Se ganan como recompensa de escenario; 1 uso por misión cada una.
// El Operativo municipal (dorado) se desbloquea aparte, con 3 cartas.
const HABILIDADES_CREW = {
  olla: {
    nombre: 'Olla comunitaria', icono: '🍲', rareza: 'pococomun', peso: 50,
    desc: 'Las señoras del barrio montan olla: toda la patrulla recupera 5 PV.',
  },
  apagon: {
    nombre: 'Apagón coordinado', icono: '💡', rareza: 'rara', peso: 32,
    desc: 'Los vecinos bajan los tacos del sector: 2 rondas con la banda medio ciega (menos alcance de alarma, los sapos no alertan).',
  },
  murga: {
    nombre: 'La Murga del barrio', icono: '🥁', rareza: 'legendaria', peso: 18,
    desc: 'La murga arma fiesta en la esquina: la banda entera pierde 1 ronda mirando el bochinche.',
  },
};

// ---------- Textos del teléfono ----------
const POSTS_FOTO_SOLDADO = [
  'Identificado. Este es el que cobra en la esquina de la 31.',
  'Cara nueva de la banda. Ya está en el mapa vecinal.',
  'Este vigila el punto por las tardes. Pilas.',
];
const POSTS_FOTO_SAPO = [
  'Este "vecino" le pasa nombres a la banda. Expuesto.',
  'Cuidado con este. Sapo confirmado, hay pruebas.',
];
const POSTS_HAZANA = [
  'Otra esquina recuperada. El barrio es de la gente. 💪',
  'Anoche la patrulla sacó otro punto. Sin esperar a nadie.',
  'Se pudo. Se puede. Súmate a la patrulla de tu cuadra.',
];
const POSTS_BACKLASH = [
  '“¿Y quién los nombró jueces a ustedes?” — el post se llenó de rabia.',
  'El video salió borroso y la gente entendió otra cosa. Mal día.',
];
const COMENTARIOS_PUBLICO = [
  'Mi cuadra necesita una patrulla así 🙏', 'Gracias por lo de anoche ❤️', 'Cuídense mucho',
  '¿Cómo me uno?', 'Eso no se hace ni con ellos 😠', 'Al fin alguien hace algo',
];
