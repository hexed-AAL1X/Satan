// Banco de contenido metalero para el bot

const ALBUMS = [
  { title: 'De Mysteriis Dom Sathanas', band: 'Mayhem', year: 1994, genre: 'Black Metal', question: '¿Lo has escuchado completo sin parar?' },
  { title: 'A Blaze in the Northern Sky', band: 'Darkthrone', year: 1992, genre: 'Black Metal', question: '¿Cuál es tu track favorito de este disco?' },
  { title: 'Altars of Madness', band: 'Morbid Angel', year: 1989, genre: 'Death Metal', question: '¿Qué tan alto lo pondrías en tu top death metal?' },
  { title: 'Reign in Blood', band: 'Slayer', year: 1986, genre: 'Thrash Metal', question: '¿Dónde estabas cuando escuchaste esto por primera vez?' },
  { title: 'Master of Puppets', band: 'Metallica', year: 1986, genre: 'Thrash Metal', question: '¿Overrated o merece su leyenda?' },
  { title: 'Blessed Are the Sick', band: 'Morbid Angel', year: 1991, genre: 'Death Metal', question: '¿Este o Altars of Madness — cuál pesa más?' },
  { title: 'Hvis lyset tar oss', band: 'Burzum', year: 1994, genre: 'Black Metal', question: '¿Atmósfera o técnica — qué valoras más?' },
  { title: 'Symbolic', band: 'Death', year: 1995, genre: 'Death Metal', question: '¿Chuck Schuldiner es el padre del death metal — de acuerdo o no?' },
  { title: 'Rust in Peace', band: 'Megadeth', year: 1990, genre: 'Thrash Metal', question: '¿Mustaine o Hetfield — quién escribe mejores riffs?' },
  { title: 'Transilvanian Hunger', band: 'Darkthrone', year: 1994, genre: 'Black Metal', question: '¿La producción lo-fi le suma o le resta?' },
  { title: 'Heartwork', band: 'Carcass', year: 1993, genre: 'Melodic Death Metal', question: '¿El mejor disco de transición del death al melodeath?' },
  { title: 'Blackwater Park', band: 'Opeth', year: 2001, genre: 'Progressive Death Metal', question: '¿Opeth en esta era o en la progresiva — cuál prefieres?' },
  { title: 'Chaos A.D.', band: 'Sepultura', year: 1993, genre: 'Groove Metal', question: '¿Chaos A.D. o Roots — cuál define más a Sepultura?' },
  { title: 'Among the Living', band: 'Anthrax', year: 1987, genre: 'Thrash Metal', question: '¿El thrash de la costa este merece más respeto?' },
  { title: 'Damnation and a Day', band: 'Cradle of Filth', year: 2003, genre: 'Symphonic Black Metal', question: '¿CoF es metal de verdad o no entra en el círculo?' },
];

const BANDS = [
  { name: 'Mayhem', country: 'Noruega', genre: 'Black Metal', formed: 1984, albums: ['Deathcrush EP', 'De Mysteriis Dom Sathanas', 'Wolf\'s Lair Abyss EP'], fact: 'Euronymous fue asesinado por Varg Vikernes (Burzum) en 1993.' },
  { name: 'Darkthrone', country: 'Noruega', genre: 'Black Metal', formed: 1986, albums: ['A Blaze in the Northern Sky', 'Transilvanian Hunger', 'Panzerfaust'], fact: 'Grabaron Transilvanian Hunger en solo 3 días.' },
  { name: 'Death', country: 'EE.UU.', genre: 'Death Metal', formed: 1983, albums: ['Scream Bloody Gore', 'Symbolic', 'The Sound of Perseverance'], fact: 'Chuck Schuldiner murió en 2001, es considerado el padre del death metal.' },
  { name: 'Slayer', country: 'EE.UU.', genre: 'Thrash Metal', formed: 1981, albums: ['Reign in Blood', 'South of Heaven', 'Seasons in the Abyss'], fact: 'Reign in Blood dura exactamente 28 minutos — pura brutalidad sin relleno.' },
  { name: 'Burzum', country: 'Noruega', genre: 'Black Metal / Ambient', formed: 1991, albums: ['Burzum', 'Hvis lyset tar oss', 'Filosofem'], fact: 'Varg grabó Filosofem con micrófonos de cassette para lograr el sonido más crudo posible.' },
  { name: 'Morbid Angel', country: 'EE.UU.', genre: 'Death Metal', formed: 1983, albums: ['Altars of Madness', 'Blessed Are the Sick', 'Covenant'], fact: 'Trey Azagthoth no toca en vivo bajo luz natural — siempre requiere iluminación oscura.' },
  { name: 'Sepultura', country: 'Brasil', genre: 'Thrash / Groove Metal', formed: 1984, albums: ['Beneath the Remains', 'Chaos A.D.', 'Roots'], fact: 'Roots fue grabado parcialmente en la selva amazónica con la tribu Xavante.' },
  { name: 'Opeth', country: 'Suecia', genre: 'Progressive Death Metal', formed: 1990, albums: ['Still Life', 'Blackwater Park', 'Ghost Reveries'], fact: 'Mikael Åkerfeldt nunca tomó clases de canto — desarrolló el growl y el limpio de forma autodidacta.' },
];

const CURIOSITIES = [
  'El riff de apertura de "Enter Sandman" fue originalmente rechazado por James Hetfield como "demasiado simple". Kirk Hammett insistió — y salvó el tema.',
  'Varg Vikernes grabó todo el primer álbum de Burzum en una sola noche con un presupuesto de 50 dólares.',
  'Dave Mustaine fue expulsado de Metallica en un autobús en 1983. Recibió la noticia por escrito cuando los demás dormían.',
  'El baterista de Mayhem, Hellhammer, guardó el cráneo de Dead (el vocalista que se suicidó) y lo usó en collares. Hay fotos.',
  'Slayer grabó Reign in Blood en solo 3 semanas. Rick Rubin lo produjo porque ningún productor de metal lo quería tocar.',
  'Chuck Schuldiner tuvo que vender su propia colección de vinilos para financiar el primer demo de Death en 1984.',
  '"Stairway to Heaven" de Led Zeppelin fue silbada por el público en su estreno en vivo — el mismo público que después la convirtió en himno.',
  'Ozzy Osbourne mordió la cabeza de un murciélago en vivo pensando que era de plástico. Tuvo que vacunarse contra la rabia.',
  'El bajista original de Iron Maiden, Steve Harris, diseñó el logo de la banda él mismo a los 17 años.',
  'Tony Iommi de Black Sabbath perdió las puntas de dos dedos en una fábrica a los 17 años. Aprendió a tocar con prótesis de cuero — y de ahí nació el sonido pesado del metal.',
  'Cuando Metallica grabó "Master of Puppets", Lars Ulrich no sabía leer partituras. Aprendió la batería escuchando el demo una y otra vez.',
  'El nombre "Cannibal Corpse" fue elegido porque era el más ofensivo de una lista de 50 nombres que consideraron.',
  'Dimebag Darrell de Pantera afinaba su guitarra medio tono abajo porque le parecía que sonaba "más oscuro y agresivo".',
  'Emperor grabó "In the Nightside Eclipse" mientras su guitarrista Samoth estaba en prisión por quemar iglesias.',
  'El primer concierto de Black Sabbath fue el 6 de agosto de 1968 — el mismo día que se estrenó una película de terror en el cine de al lado.',
];

const SONGS = [
  { title: 'Raining Blood', band: 'Slayer', fact: 'La lluvia de sangre al inicio fue grabada realmente con sonido de lluvia + distorsión baja en la mezcla.' },
  { title: 'Orion', band: 'Metallica', fact: 'Es el único instrumental de Master of Puppets. Cliff Burton la escribió casi completamente solo.' },
  { title: 'Freezing Moon', band: 'Mayhem', fact: 'Dead (el vocalista) se cortaba en vivo antes de salir al escenario para "sentir" la canción.' },
  { title: 'Crystal Mountain', band: 'Death', fact: 'Chuck Schuldiner la escribió como crítica a las religiones organizadas, no como himno satánico como muchos creen.' },
  { title: 'Roots Bloody Roots', band: 'Sepultura', fact: 'La intro percusiva fue grabada con la tribu Xavante en Brasil — instrumentos tribales reales.' },
  { title: 'The Trooper', band: 'Iron Maiden', fact: 'Steve Harris la escribió inspirado en la Carga de la Brigada Ligera — batalla de la guerra de Crimea en 1854.' },
  { title: 'War Pigs', band: 'Black Sabbath', fact: 'Originalmente se llamaba "Walpurgis" con letras satánicas — la discográfica les obligó a cambiarla a temática bélica.' },
];

// Aniversarios de álbumes míticos — formato MM-DD
const ANNIVERSARIES = [
  { title: 'Reign in Blood',              band: 'Slayer',         year: 1986, date: '10-07' },
  { title: 'Master of Puppets',           band: 'Metallica',      year: 1986, date: '03-03' },
  { title: 'De Mysteriis Dom Sathanas',   band: 'Mayhem',         year: 1994, date: '05-25' },
  { title: 'Metallica (Black Album)',     band: 'Metallica',      year: 1991, date: '08-12' },
  { title: 'Altars of Madness',           band: 'Morbid Angel',   year: 1989, date: '05-10' },
  { title: 'Transilvanian Hunger',        band: 'Darkthrone',     year: 1994, date: '02-07' },
  { title: 'Symbolic',                    band: 'Death',          year: 1995, date: '06-20' },
  { title: 'Rust in Peace',               band: 'Megadeth',       year: 1990, date: '09-24' },
  { title: 'Heartwork',                   band: 'Carcass',        year: 1993, date: '09-27' },
  { title: 'Beneath the Remains',         band: 'Sepultura',      year: 1989, date: '04-22' },
  { title: 'Blessed Are the Sick',        band: 'Morbid Angel',   year: 1991, date: '05-23' },
  { title: 'A Blaze in the Northern Sky', band: 'Darkthrone',     year: 1991, date: '11-23' },
  { title: 'Roots',                       band: 'Sepultura',      year: 1996, date: '02-20' },
  { title: 'Chaos A.D.',                  band: 'Sepultura',      year: 1993, date: '10-05' },
  { title: 'Among the Living',            band: 'Anthrax',        year: 1987, date: '03-22' },
  { title: 'Blackwater Park',             band: 'Opeth',          year: 2001, date: '03-12' },
  { title: 'Deathcrush EP',               band: 'Mayhem',         year: 1987, date: '08-18' },
  { title: 'South of Heaven',             band: 'Slayer',         year: 1988, date: '07-05' },
  { title: 'Countdown to Extinction',     band: 'Megadeth',       year: 1992, date: '07-14' },
  { title: 'Seasons in the Abyss',        band: 'Slayer',         year: 1990, date: '10-09' },
  { title: 'Painkiller',                  band: 'Judas Priest',   year: 1990, date: '09-03' },
  { title: 'Paranoid',                    band: 'Black Sabbath',  year: 1970, date: '09-18' },
  { title: 'Black Sabbath',               band: 'Black Sabbath',  year: 1970, date: '02-13' },
  { title: 'Piece of Mind',               band: 'Iron Maiden',    year: 1983, date: '05-16' },
  { title: 'Powerslave',                  band: 'Iron Maiden',    year: 1984, date: '09-03' },
  { title: 'Scream Bloody Gore',          band: 'Death',          year: 1987, date: '05-25' },
  { title: 'The Sound of Perseverance',   band: 'Death',          year: 1998, date: '09-07' },
  { title: 'Covenant',                    band: 'Morbid Angel',   year: 1993, date: '06-22' },
  { title: 'In the Nightside Eclipse',    band: 'Emperor',        year: 1994, date: '02-14' },
  { title: 'Anthems to the Welkin at Dusk', band: 'Emperor',      year: 1997, date: '05-01' },
];

const TRIVIA = [
  {
    question: '¿En qué banda tocaba Euronymous antes de su muerte?',
    options: ['A) Mayhem', 'B) Darkthrone', 'C) Emperor'],
    answer: 0,
    explanation: 'Euronymous fue fundador y guitarrista de Mayhem. Murió en 1993 a manos de Varg Vikernes.',
  },
  {
    question: '¿Qué parte del cuerpo perdió Tony Iommi que cambió el sonido del metal para siempre?',
    options: ['A) Los dedos de la mano derecha', 'B) Las puntas de dos dedos de la mano derecha', 'C) Toda la mano izquierda'],
    answer: 1,
    explanation: 'Tony Iommi perdió las puntas del anular y meñique de la mano derecha en un accidente industrial. Para seguir tocando afinó la guitarra más grave — inventando el sonido pesado del metal.',
  },
  {
    question: '¿Qué país es la cuna del Black Metal noruego?',
    options: ['A) Suecia', 'B) Finlandia', 'C) Noruega'],
    answer: 2,
    explanation: 'El segundo círculo negro (Mayhem, Darkthrone, Burzum, Emperor) surgió en Noruega a principios de los 90.',
  },
  {
    question: '¿Quién fundó la banda Death, considerado padre del death metal?',
    options: ['A) Trey Azagthoth', 'B) Chuck Schuldiner', 'C) Glen Benton'],
    answer: 1,
    explanation: 'Chuck Schuldiner fundó Death en 1983 en Florida. Falleció en 2001 a los 34 años.',
  },
  {
    question: '¿En qué álbum grabó Sepultura con la tribu indígena Xavante?',
    options: ['A) Chaos A.D.', 'B) Beneath the Remains', 'C) Roots'],
    answer: 2,
    explanation: 'En Roots (1996) viajaron al Amazonas y grabaron percusiones con la tribu Xavante. Fue un quiebre total en el sonido del metal latinoamericano.',
  },
  {
    question: '¿Cuánto dura exactamente el álbum Reign in Blood de Slayer?',
    options: ['A) 28 minutos', 'B) 35 minutos', 'C) 42 minutos'],
    answer: 0,
    explanation: 'Reign in Blood dura 28 minutos y 14 segundos. Pura brutalidad sin un segundo de relleno.',
  },
  {
    question: '¿Qué animal mordió Ozzy Osbourne en vivo pensando que era de plástico?',
    options: ['A) Una rata', 'B) Un murciélago', 'C) Una paloma'],
    answer: 1,
    explanation: 'Un fan lanzó un murciélago al escenario. Ozzy pensó que era de goma y lo mordió. Tuvo que vacunarse contra la rabia.',
  },
  {
    question: '¿Qué banda grabó "Transilvanian Hunger" en solo 3 días?',
    options: ['A) Mayhem', 'B) Burzum', 'C) Darkthrone'],
    answer: 2,
    explanation: 'Darkthrone grabó Transilvanian Hunger (1994) en 3 días con producción intencionalmente sucia. Uno de los discos más influyentes del black metal.',
  },
  {
    question: '¿De qué país es la banda Sepultura?',
    options: ['A) Argentina', 'B) Brasil', 'C) México'],
    answer: 1,
    explanation: 'Sepultura es de Belo Horizonte, Brasil. Fundada en 1984 por los hermanos Cavalera.',
  },
  {
    question: '¿Cuál es el álbum debut de Morbid Angel?',
    options: ['A) Blessed Are the Sick', 'B) Covenant', 'C) Altars of Madness'],
    answer: 2,
    explanation: 'Altars of Madness (1989) fue el debut de Morbid Angel. Definió el death metal de Florida junto con bandas como Death y Obituary.',
  },
];

// Muertes verificadas (MM-DD) — la IA NO puede inventar ni mover estas fechas
const METAL_VERIFIED_DEATHS = [
  { date: '05-24', year: 2010, names: ['paul gray'] },
  { date: '05-16', year: 2010, names: ['ronnie james dio', 'dio'] },
  { date: '04-14', year: 2010, names: ['peter steele'] },
  { date: '08-10', year: 1993, names: ['euronymous', 'øystein aarseth'] },
  { date: '09-27', year: 1986, names: ['cliff burton'] },
  { date: '12-04', year: 2001, names: ['chuck schuldiner'] },
  { date: '12-08', year: 2004, names: ['dimebag darrell', 'dimebag'] },
];

// Hechos históricos verificados por fecha (MM-DD) — única fuente para "un día como hoy"
const ON_THIS_DAY_EVENTS = [
  { date: '02-15', year: 1982, type: 'release', artist: 'Venom', text: 'Un día como hoy en 1982 Venom publica Black Metal el disco que le puso NOMBRE al subgénero entero ⚔️' },
  { date: '03-05', year: 1967, type: 'birth', artist: 'Chuck Schuldiner', text: 'Un día como hoy en 1967 nace Chuck Schuldiner en California el arquitecto del death metal moderno 💀' },
  { date: '03-29', year: 1984, type: 'formed', artist: 'Sepultura', text: 'Un día como hoy en 1984 los hermanos Cavalera forman Sepultura en Belo Horizonte antes de conquistar el mundo 🤘' },
  { date: '04-14', year: 2010, type: 'death', artist: 'Peter Steele', text: 'Un día como hoy en 2010 muere Peter Steele vocal de Type O Negative voz grave del metal gótico neoyorquino 🖤' },
  { date: '04-20', year: 1992, type: 'release', artist: 'Obituary', text: 'Un día como hoy en 1992 Obituary lanza The End Complete referencia del death metal de Florida en plena era dorada ☠️' },
  { date: '05-16', year: 2010, type: 'death', artist: 'Ronnie James Dio', text: 'Un día como hoy en 2010 muere Ronnie James Dio voz de Rainbow Black Sabbath y Dio el signo de los cuernos nunca muere 🔱' },
  { date: '05-18', year: 1984, type: 'release', artist: 'Mercyful Fate', text: 'Un día como hoy en 1984 Mercyful Fate lanza Dont Break the Oath álbum maldito del King Diamond noruego ⛧' },
  { date: '05-24', year: 2010, type: 'death', artist: 'Paul Gray', text: 'Un día como hoy en 2010 muere Paul Gray bajista de Slipknot el CIRCLE recuerda al Número 2 ☠️' },
  { date: '06-11', year: 1984, type: 'release', artist: 'Bathory', text: 'Un día como hoy en 1984 Bathory publica Blood Fire Death puente entre black y viking metal nórdico 🩸' },
  { date: '06-17', year: 1967, type: 'birth', artist: 'Lee Dorian', text: 'Un día como hoy en 1967 nace Lee Dorian fundador de Napalm Death y luego Cathedral una voz clave del death y doom británico 🦇' },
  { date: '06-18', year: 1987, type: 'release', artist: 'Sodom', text: 'Un día como hoy en 1987 Sodom lanza Persecution Mania thrash teutón en estado puro de la escena alemana ⚔️' },
  { date: '07-03', year: 1983, type: 'release', artist: 'Metallica', text: 'Un día como hoy en 1983 Metallica publica Kill Em All el manifiesto del thrash bay area que cambió todo 🔥' },
  { date: '07-31', year: 1985, type: 'birth', artist: 'Alissa White-Gluz', text: 'Un día como hoy en 1985 nace Alissa White-Gluz hoy voz de Arch Enemy y referente del metal melódico extremo 🦇' },
  { date: '08-10', year: 1993, type: 'death', artist: 'Euronymous', text: 'Un día como hoy en 1993 muere Euronymous guitarrista de Mayhem asesinado por Varg Vikernes en Oslo 🩸' },
  { date: '08-12', year: 1991, type: 'release', artist: 'Carcass', text: 'Un día como hoy en 1991 Carcass publica Necroticism el death grind británico en su forma más quirúrgica 💀' },
  { date: '09-27', year: 1986, type: 'death', artist: 'Cliff Burton', text: 'Un día como hoy en 1986 muere Cliff Burton bajista de Metallica en un accidente de autobús en Suecia el CIRCLE lo recuerda ⚔️' },
  { date: '10-13', year: 1990, type: 'release', artist: 'Paradise Lost', text: 'Un día como hoy en 1990 Paradise Lost lanza Gothic disco fundacional del death doom europeo 🖤' },
  { date: '11-01', year: 1993, type: 'other', artist: 'Cradle of Filth', text: 'Un día como hoy en 1993 Cradle of Filth graba demos que los llevarían al black sinfónico británico más polémico ⛧' },
  { date: '11-15', year: 1985, type: 'release', artist: 'Possessed', text: 'Un día como hoy en 1985 Possessed publica Seven Churches death metal antes de que existiera el nombre del género 💀' },
  { date: '12-04', year: 2001, type: 'death', artist: 'Chuck Schuldiner', text: 'Un día como hoy en 2001 muere Chuck Schuldiner a los 34 años el CIRCLE pierde al padre del death metal ☠️' },
  { date: '12-08', year: 2004, type: 'death', artist: 'Dimebag Darrell', text: 'Un día como hoy en 2004 el metal pierde a Dimebag Darrell asesinado en el escenario una herida que no cierra 🩸' },
  { date: '12-15', year: 1987, type: 'release', artist: 'Sarcófago', text: 'Un día como hoy en 1987 Sarcófago lanza INRI thrash death primitivo de Belo Horizonte leyenda sudamericana 🤘' },
];

module.exports = {
  ALBUMS, BANDS, CURIOSITIES, SONGS, TRIVIA, ANNIVERSARIES,
  ON_THIS_DAY_EVENTS, METAL_VERIFIED_DEATHS,
};
