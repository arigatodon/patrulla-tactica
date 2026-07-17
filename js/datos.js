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
  'F': { nombre: 'Cancha',    costo: 1, def: 0, bloquea: false, color: '#4a7d42' },
  'R': { nombre: 'Vía férrea',costo: 1, def: 0, bloquea: false, color: '#43423c' },
  'D': { nombre: 'Duna',      costo: 2, def: 1, bloquea: false, color: '#c0a468' },
  'K': { nombre: 'Rampa de skate', costo: 0, def: 0, bloquea: true, color: '#8a8f98' },
  'S': { nombre: 'Silla',     costo: 0, def: 0, bloquea: true,  color: '#5d626c', rompible: true },
  'O': { nombre: 'Basurero',  costo: 0, def: 0, bloquea: true,  color: '#5d626c', rompible: true },
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
  ametralleta: { nombre: 'Ametralleta', icono: '💥', tipo: 'distancia', dano: 9, rmin: 1, rmax: 3, usos: 10, rareza: 'legendaria' },
  fierro:   { nombre: 'Fierro',   icono: '🔩', tipo: 'mele', dano: 5,  rmin: 1, rmax: 1, usos: 12, rareza: 'comun' },
  bate:     { nombre: 'Bate',     icono: '🏏', tipo: 'mele', dano: 7,  rmin: 1, rmax: 1, usos: 8,  rareza: 'pococomun' },
  honda:    { nombre: 'Honda',    icono: '🪃', tipo: 'distancia', dano: 4, rmin: 2, rmax: 4, usos: 7, rareza: 'pococomun' },
  fuegos:   { nombre: 'Fuegos artificiales', icono: '🎆', tipo: 'area', dano: 5, rmin: 2, rmax: 4, usos: 1, rareza: 'rara', aturde: 1 },
};

// Otros objetos que caen en cajas o de enemigos
const OBJETOS = {
  botiquin: { nombre: 'Botiquín', icono: '💊', tipo: 'cura', cura: 8, rareza: 'pococomun' },
  vendas:   { nombre: 'Vendas',   icono: '🩹', tipo: 'cura', cura: 4, rareza: 'comun' },
  empanada: { nombre: 'Empanada', icono: '🥟', tipo: 'cura', cura: 5, rareza: 'comun' },
  bebida:   { nombre: 'Bebida energética', icono: '🥤', tipo: 'cura', cura: 3, rareza: 'comun' },
  casco:    { nombre: 'Casco',    icono: '⛑️', tipo: 'armadura', defensa: 1, rareza: 'pococomun' },
  chaleco:  { nombre: 'Chaleco',  icono: '🦺', tipo: 'armadura', defensa: 2, rareza: 'rara' },
  carta:    { nombre: 'Carta municipal', icono: '📇', tipo: 'carta', rareza: 'legendaria' },
  skate:    { nombre: 'Skate',    icono: '🛹', tipo: 'vehiculo', movExtra: 2, rareza: 'rara' },
};

// Loot de cajas: qué puede salir y con qué peso (la rareza del arma manda su aura)
const LOOT_CAJA = [
  { peso: 13, item: 'palo' },  { peso: 9, item: 'botella' }, { peso: 10, item: 'piedras' },
  { peso: 9, item: 'cuchilla' }, { peso: 7, item: 'manopla' }, { peso: 6, item: 'taser' },
  { peso: 8, item: 'fierro' }, { peso: 6, item: 'bate' }, { peso: 5, item: 'honda' },
  { peso: 5, item: 'arco' }, { peso: 5, item: 'pistola' }, { peso: 4, item: 'molotov' },
  { peso: 3, item: 'fuegos' }, { peso: 1.5, item: 'katana' },
  { peso: 9, item: 'vendas' }, { peso: 7, item: 'empanada' }, { peso: 6, item: 'bebida' },
  { peso: 6, item: 'botiquin' }, { peso: 4, item: 'casco' }, { peso: 2, item: 'chaleco' },
  { peso: 2.5, item: 'carta' },
];
// lo que puede aparecer al volcar un basurero
const LOOT_BASURERO = [
  { peso: 30, item: 'botella' }, { peso: 22, item: 'piedras' }, { peso: 16, item: 'palo' },
  { peso: 12, item: 'fierro' }, { peso: 12, item: 'empanada' }, { peso: 8, item: 'vendas' },
];
// ítems sorpresa extra según el sector
const LOOT_TEMA = {
  santaelisa: [{ peso: 14, item: 'skate' }],                       // los skates del skatepark
  estacion:   [{ peso: 4, item: 'ametralleta' }],                  // el fierro de Los Cholas
  dunas:      [{ peso: 8, item: 'skate' }, { peso: 6, item: 'botella' }],
};

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
  cholo:     { nombre: 'Cholo',     sprite: 'soldado', stats: { FUE: 4, AGI: 3, VIT: 6, DES: 5, SUE: 3 }, arma: 'ametralleta', aggro: 6 },
  scooter:   { nombre: 'Soldado en scooter', sprite: 'scooter', stats: { FUE: 4, AGI: 7, VIT: 4, DES: 4, SUE: 3 }, arma: 'cuchilla', aggro: 8, vehiculo: 'scooter' },
  policia:   { nombre: 'Carabinero', sprite: 'policia', stats: { FUE: 4, AGI: 4, VIT: 6, DES: 6, SUE: 3 }, arma: 'pistola', aggro: 99 },
};

// ---------- Llamada a la policía ----------
const PROB_POLICIA_VIENE = 0.30;   // 30%: puede que ni aparezcan
const PROB_POLICIA_VENDIDA = 0.35; // si vienen: ¿están vendidos a la banda del sector?
const DEMORA_POLICIA_MAX = 5;      // llegan entre 1 y 5 rondas después
const COIMA_POLICIA = 10;          // respeto que piden para "ayudar al barrio"
const RONDAS_POLICIA = 3;          // rondas que se quedan los vendidos

// ---------- Diálogos ----------
const FRASES_JEFE = [
  '"¿Y ustedes qué se creen? ¿Héroes? Esta esquina come gente como ustedes."',
  '"Díganle a la junta que esto tiene dueño. Última advertencia."',
  '"¿La patrullita del barrio? Ja. A ver cuánto les dura el show."',
];
const RESPUESTAS_LIDER = [
  '"El barrio no es tuyo. Era de nosotros antes y va a serlo después."',
  '"No venimos a conversar. Venimos a que te vayas."',
];
const FRASE_SAPO_EXPUESTO = '"¡Yo no sé nada! ¡Bórrenme de la app, por favor!"';
const DIALOGO_POLICIA_VENDIDA = [
  { q: 'policia', n: 'Carabinero', t: '"Recibimos un llamado por desórdenes… pero ya nos atendieron <b>los otros</b>, ¿me entiende? Los alterados son ustedes."' },
  { q: 'lider', t: '"…Llegaron vendidos. ¡Cúbranse!"' },
];
const DIALOGO_POLICIA_COIMA = { q: 'policia', n: 'Carabinero',
  t: '"Podríamos hacer una pasada por el sector, espantar a esa gente… pero la bencina está cara y el papeleo es largo, ¿me entiende usted?"' };

// ---------- Campaña: los sectores de Cartagena ----------
// tipo: 'molotov' (quemar el punto y escapar) · 'jefe' (eliminar al vendedor)
//       'puntos' (quemar todos los puntos de venta) · 'final' (jefe élite)
// tema del mapa: 'urbano' | 'santaelisa' | 'estacion' | 'dunas'
// soldados: tipos de tropa que puebla el sector.
const CAPITULOS = [
  { tipo: 'molotov', nombre: 'Playa Chica', banda: 'Los del Punto', jefe: null, tema: 'urbano',
    soldados: ['soldado', 'pistolero'],
    titulo: 'Prólogo · "Una molotov cada noche"',
    brief: 'Nadie recuerda quién fue el primero. Esta noche te toca a ti: <b>quema el punto de venta</b> ' +
      '(lanza la 🔥 molotov, o préndele fuego de cerca) y <b>vuelve con todos al borde oeste</b>. ' +
      'Mientras los soldados vigilan este sector tranquilo, el resto de la comuna se organiza. Evita que te vean.',
    dialogo: [
      { q: 'lider', t: '"Una molotov. Todas las noches, una. Que crean que este sector está embrujado."' },
      { q: 'pescador', t: '"Y apenas prenda, todos de vuelta a la costanera. Nadie se queda a mirar el fuego."' },
    ] },
  { tipo: 'jefe', nombre: 'Santa Elisa', banda: 'Los de la Cancha', jefe: '"El Rucio"', tema: 'santaelisa',
    soldados: ['soldado', 'pistolero'],
    titulo: 'Capítulo 1 · "La cancha no se toca"',
    brief: 'Santa Elisa tiene skatepark y cancha de fútbol — y en la cancha se instalaron los traficantes. ' +
      'La junta prestó el dron <b>"La Garza"</b>: revela el sector, 📸 identifica y saca a <b>"El Rucio"</b>. ' +
      'Ojo con las cajas: por aquí ruedan 🛹 <b>skates</b> que dan +2 de movimiento.',
    dialogo: [
      { q: 'tecnico', t: '"La Garza está en el aire. Skatepark despejado… los traficantes están instalados en la cancha."' },
      { q: 'lider', t: '"En MI cancha. Vamos uno por uno, con foto primero. Y ojo con las cajas: por ahí dejaron skates."' },
    ] },
  { tipo: 'puntos', nombre: 'Barrio Estación', banda: 'Los Cholas', jefe: '"La Chola Mayor"', tema: 'estacion',
    soldados: ['cholo', 'soldado', 'pistolero'],
    titulo: 'Capítulo 2 · "La estación abandonada"',
    brief: 'La antigua estación de trenes es hoy un páramo tomado: la familia de <b>Los Cholas</b> montó ' +
      '<b>varios puntos de venta</b> entre los rieles. Van armados hasta con 💥 <b>ametralleta</b>. ' +
      '<b>Quema todos los puntos</b> para cortarles el negocio.',
    dialogo: [
      { q: 'pescador', t: '"La estación vieja… mi abuelo tomaba el tren aquí. Ahora Los Cholas venden entre los rieles."' },
      { q: 'lider', t: '"Tres puntos, tres fuegos. Y cuidado: esa familia carga ametralleta."' },
    ] },
  { tipo: 'jefe', nombre: 'El Arellano', banda: 'Los de las Dunas', jefe: '"El Motorizado"', tema: 'dunas',
    soldados: ['scooter', 'soldado', 'pistolero'],
    titulo: 'Capítulo 3 · "Dunas y scooters"',
    brief: 'Entre la playa grande y las dunas, la banda patrulla en 🛴 <b>scooters eléctricos</b>: ' +
      'se mueven el doble. La arena cansa (cuesta más avanzar), úsala a tu favor. Elimina a <b>"El Motorizado"</b>.',
    dialogo: [
      { q: 'tecnico', t: '"Detecto scooters eléctricos patrullando las dunas. Se mueven el doble que nosotros."' },
      { q: 'lider', t: '"La arena los frena igual que a todos. Emboscada en las dunas y se acabó el motorizado."' },
    ] },
  { tipo: 'final', nombre: 'Las Tomas de La Punta', banda: 'Todas las banderas', jefe: '"El Patrón de La Punta"', tema: 'dunas',
    soldados: ['cholo', 'scooter', 'soldado', 'pistolero'],
    titulo: 'Capítulo 4 · "La Punta"',
    brief: 'Las tomas de terreno en La Punta han sido refugio de <b>todas las bandas</b> que fueron llegando ' +
      'a la comuna. Ahí se atrincheró lo que queda de todas. Elimina a <b>"El Patrón"</b> y la comuna respira.',
    dialogo: [
      { q: 'lider', t: '"Aquí terminaron juntándose todas las banderas que fuimos sacando. La Punta es lo último."' },
      { q: 'pescador', t: '"Después de esta noche, la comuna duerme tranquila. Vamos."' },
    ] },
];
// tras el final: rotación procedural por sectores de la comuna
const BARRIOS_EXTRA = [
  { nombre: 'Playa Grande', banda: 'Los Rezagados', tema: 'dunas' },
  { nombre: 'San Sebastián', banda: 'La Recaída', tema: 'urbano' },
  { nombre: 'Las Terrazas', banda: 'Los Nuevos', tema: 'urbano' },
  { nombre: 'El Estadio', banda: 'Los Últimos', tema: 'santaelisa' },
];

function capituloDe(n) {
  if (n <= CAPITULOS.length) return CAPITULOS[n - 1];
  const extra = BARRIOS_EXTRA[(n - CAPITULOS.length - 1) % BARRIOS_EXTRA.length];
  return {
    tipo: 'jefe', nombre: extra.nombre, banda: extra.banda, jefe: '"El Relevo"', tema: extra.tema,
    soldados: ['soldado', 'pistolero', 'cholo', 'scooter'],
    titulo: `Sector ${n} · ${extra.nombre}`,
    brief: 'La comuna es grande y siempre aparece un relevo. El método es el mismo: dron, foto, uno por uno.',
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
