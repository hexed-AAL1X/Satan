const Groq = require('groq-sdk');
const { ALBUMS, BANDS, CURIOSITIES, SONGS, ANNIVERSARIES } = require('../../data/content');
const {
  KEYS,
  MAX,
  remember,
  exclusionBlock,
  getDayCache,
  setDayCache,
  loadList,
} = require('../utils/content-history');
const {
  normalizeGroqText,
  looksLikeJsonLeak,
  parseGroqJsonObject,
} = require('../utils/groq-json');

const MEGA_BANNED =
  'Mayhem, Darkthrone, Burzum, Metallica, Slayer, Iron Maiden, Black Sabbath, Death, ' +
  'Cannibal Corpse, Morbid Angel, Sepultura, Behemoth, Emperor, Immortal, Opeth, Gojira, ' +
  'Tool, Rammstein, Nightwish, Pantera, Megadeth, Anthrax, Judas Priest, Motörhead';

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function parseJsonObject(raw) {
  return parseGroqJsonObject(raw);
}

function sanitizeOnThisDayEntry(entry) {
  if (!entry?.text) return null;
  const text = normalizeGroqText(entry.text);
  if (!text || text.length < 15 || looksLikeJsonLeak(text)) return null;
  return {
    text,
    artist: entry.artist ? String(entry.artist).trim() : null,
    hook: entry.hook ? String(entry.hook).trim() : text.slice(0, 80),
  };
}

function getOnThisDayFallback(month, day) {
  const mmdd = `${month}-${day}`;
  const ann = ANNIVERSARIES.find((a) => a.date === mmdd);
  if (ann) {
    return {
      text: `Un día como hoy en ${ann.year} el CIRCLE recuerda el lanzamiento de ${ann.title} de ${ann.band} ☠️`,
      artist: ann.band,
      hook: `${ann.band} ${ann.title} ${mmdd}`,
    };
  }
  const fb = pickStaticFallback(CURIOSITIES, KEYS.onthisday, (c) => c.slice(0, 60), MAX.onthisday);
  if (!fb) return null;
  const text = typeof fb === 'string' ? fb : String(fb);
  return { text, artist: null, hook: text.slice(0, 80) };
}

async function groqJson(prompt, maxTokens = 320, temperature = 0.95) {
  const groq = getGroq();
  if (!groq) return null;
  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    return parseJsonObject(result.choices[0]?.message?.content?.trim() || '');
  } catch (e) {
    if (!String(e.message || e).includes('timeout')) {
      console.error('[DAILY-GROQ]', (e.message || '').slice(0, 70));
    }
    return null;
  }
}

function pickStaticFallback(arr, histKey, mapRemember, maxSize = 80) {
  const used = new Set(loadList(histKey).map((x) => String(x).toLowerCase()));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  for (const item of shuffled) {
    const token = mapRemember(item);
    if (!token || used.has(String(token).toLowerCase())) continue;
    remember(histKey, token, maxSize);
    return item;
  }
  const item = shuffled[0];
  if (item) remember(histKey, mapRemember(item), maxSize);
  return item;
}

/** Álbum del día — uno nuevo por fecha (Perú), Groq primero. */
async function getDailyAlbum() {
  const cached = getDayCache('album');
  if (cached?.title && cached?.band) return cached;

  const exclude = exclusionBlock(KEYS.albums, 'Álbumes ya enviados', 50);
  const data = await groqJson(
    `Eres curador del CIRCLE de metal. Elige UN álbum REAL de metal/rock pesado para destacar HOY.
Prioriza discos de culto, escena latina/europea/nórdica, o joyas menos masivas. Evita lo obvio de radio.
Prohibido repetir megastars salvo un disco MUY específico poco citado: ${MEGA_BANNED}.${exclude}
Responde SOLO JSON:
{"title":"nombre del álbum","band":"banda","year":"año","genre":"subgénero","question":"pregunta corta en español para el grupo"}`
  );

  let album = null;
  if (data?.title && data?.band) {
    album = {
      title: String(data.title).trim(),
      band: String(data.band).trim(),
      year: String(data.year || '').trim(),
      genre: String(data.genre || 'metal').trim(),
      question: String(data.question || '¿Lo has escuchado?').trim(),
    };
    remember(KEYS.albums, `${album.band} — ${album.title}`, MAX.albums);
  } else {
    album = pickStaticFallback(ALBUMS, KEYS.albums, (a) => `${a.band} — ${a.title}`, MAX.albums);
  }

  if (album) setDayCache('album', album);
  return album;
}

/** Banda del día. */
async function getDailyBand() {
  const cached = getDayCache('band');
  if (cached?.name) return cached;

  const exclude = exclusionBlock(KEYS.bands, 'Bandas ya enviadas', 50);
  const data = await groqJson(
    `Elige UNA banda REAL de metal/rock pesado para presentar al CIRCLE hoy.
Menos masiva que las de estadio; escena seria latinoamérica europa oriente medio africa bienvenida.
Evita repetir: ${MEGA_BANNED}.${exclude}
JSON únicamente:
{"name":"banda","country":"país","genre":"género","formed":"año formación","albums":["disco1","disco2","disco3"],"fact":"dato curioso REAL en una frase"}`
  );

  let band = null;
  if (data?.name) {
    band = {
      name: String(data.name).trim(),
      country: String(data.country || '').trim(),
      genre: String(data.genre || 'metal').trim(),
      formed: String(data.formed || '').trim(),
      albums: Array.isArray(data.albums) ? data.albums.map(String).slice(0, 4) : [],
      fact: String(data.fact || '').trim(),
    };
    remember(KEYS.bands, band.name, MAX.bands);
  } else {
    band = pickStaticFallback(BANDS, KEYS.bands, (b) => b.name, MAX.bands);
  }

  if (band) setDayCache('band', band);
  return band;
}

/** Curiosidad del metal — texto nuevo cada día. */
async function getDailyCuriosity() {
  const cached = getDayCache('curiosity');
  if (cached?.text) return cached;

  const exclude = exclusionBlock(KEYS.curiosities, 'Curiosidades ya usadas', 40);
  const data = await groqJson(
    `Escribe UNA curiosidad REAL verificable sobre historia del metal o rock pesado (bandas, conciertos, grabaciones, anécdotas).
Tono informativo para metaleros. Español. 2 oraciones máximo. Sin inventar fechas falsas.${exclude}
JSON: {"text":"curiosidad aquí"}`
  );

  let text = data?.text ? normalizeGroqText(data.text) : '';
  if (!text || text.length < 20 || looksLikeJsonLeak(text)) {
    const fb = pickStaticFallback(CURIOSITIES, KEYS.curiosities, (c) => c.slice(0, 60), MAX.curiosities);
    text = typeof fb === 'string' ? fb : String(fb);
  } else {
    remember(KEYS.curiosities, text.slice(0, 100), MAX.curiosities);
  }

  const out = { text };
  setDayCache('curiosity', out);
  return out;
}

/** Canción del día. */
async function getDailySong() {
  const cached = getDayCache('song');
  if (cached?.title && cached?.band) return cached;

  const exclude = exclusionBlock(KEYS.songs, 'Canciones ya usadas', 40);
  const data = await groqJson(
    `Elige UNA canción icónica REAL de metal/rock pesado (puede ser deep cut, no solo hit radio).
Incluye dato curioso de grabación o leyenda.${exclude}
Evita solo: ${MEGA_BANNED}.
JSON: {"title":"canción","band":"banda","fact":"dato en español"}`
  );

  let song = null;
  if (data?.title && data?.band) {
    song = {
      title: String(data.title).trim(),
      band: String(data.band).trim(),
      fact: String(data.fact || '').trim(),
    };
    remember(KEYS.songs, `${song.band} — ${song.title}`, MAX.songs);
  } else {
    song = pickStaticFallback(SONGS, KEYS.songs, (s) => `${s.band} — ${s.title}`, MAX.songs);
  }

  if (song) setDayCache('song', song);
  return song;
}

/** Un día como hoy — hecho distinto cada vez que corre (por fecha). */
async function getDailyOnThisDay(month, day) {
  const cached = getDayCache('onthisday');
  const cachedClean = sanitizeOnThisDayEntry(cached);
  if (cachedClean) return cachedClean;

  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const monthName = monthNames[parseInt(month, 10) - 1] || month;
  const exclude = exclusionBlock(KEYS.onthisday, 'Hechos ya narrados', 35);

  const data = await groqJson(
    `Eres SATÁN. Hoy es ${day} de ${monthName}. Busca UN hecho histórico REAL del metal/rock pesado ocurrido en esa fecha (cualquier año): lanzamiento, muerte, debut, concierto legendario, polémica.
Si de verdad no hay nada documentable para esa fecha exacta, elige el hecho MÁS cercano en el calendario (±3 días) pero distinto a los ya listados.${exclude}
NO repitas Mayhem Euronymous mismo relato de siempre si ya está en la lista.
IMPORTANTE: el campo text debe ser SOLO prosa en español (2 líneas cortas, máximo 250 caracteres). NUNCA metas JSON ni llaves dentro de text.
Responde SOLO JSON válido:
{"text":"2 líneas estilo SATÁN mayúsculas en palabras clave sin guiones","artist":"artista o banda principal","hook":"frase única de 8 palabras max para deduplicar"}`,
    420,
    0.85
  );

  let result = sanitizeOnThisDayEntry(data);
  if (result) {
    remember(KEYS.onthisday, result.hook, MAX.onthisday);
  } else {
    result = sanitizeOnThisDayEntry(getOnThisDayFallback(month, day));
    if (result) remember(KEYS.onthisday, result.hook, MAX.onthisday);
  }

  if (result) setDayCache('onthisday', result);
  return result;
}

module.exports = {
  getDailyAlbum,
  getDailyBand,
  getDailyCuriosity,
  getDailySong,
  getDailyOnThisDay,
};
