const Groq = require('groq-sdk');
const { ALBUMS, BANDS, CURIOSITIES, SONGS, ANNIVERSARIES, ON_THIS_DAY_EVENTS, METAL_VERIFIED_DEATHS } = require('../../data/content');
const {
  KEYS,
  MAX,
  remember,
  exclusionBlock,
  getDayCache,
  setDayCache,
  clearDayCache,
  loadList,
} = require('../utils/content-history');
const {
  normalizeGroqText,
  looksLikeJsonLeak,
  parseGroqJsonObject,
} = require('../utils/groq-json');
const {
  artistKey,
  mmddKey,
  validateOnThisDayAccuracy,
  buildArtistExactDates,
} = require('../utils/metal-dates-verify');

const ARTIST_EXACT_DATES = buildArtistExactDates(METAL_VERIFIED_DEATHS, ON_THIS_DAY_EVENTS);

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

function isArtistAllowedOnDate(artist, month, day) {
  const a = artistKey(artist);
  if (!a) return true;
  const mmdd = mmddKey(month, day);
  for (const [needle, allowed] of Object.entries(ARTIST_EXACT_DATES)) {
    if (a.includes(needle) || needle.includes(a)) {
      return mmdd === allowed;
    }
  }
  return true;
}

function wasArtistUsedRecently(artist) {
  const a = artistKey(artist);
  if (!a) return false;
  return loadList(KEYS.onthisday).some((entry) => {
    const storedArtist = String(entry).split('|')[0]?.toLowerCase() || String(entry).toLowerCase();
    return storedArtist.includes(a) || a.includes(storedArtist);
  });
}

function rememberOnThisDay(result) {
  const artist = artistKey(result.artist) || 'general';
  const hook = String(result.hook || result.text.slice(0, 80)).trim();
  remember(KEYS.onthisday, `${artist}|${hook}`, MAX.onthisday);
}

function isVagueOnThisDayText(text, artist) {
  const t = String(text || '').toLowerCase();
  if (/\b(19|20)\d{2}\b/.test(text)) {
    if (/un ídolo|un idolo|la muerte de un|celebra la muerte|música eterna|leyenda del metal/i.test(t)) {
      if (!artist || artistKey(artist).length < 3) return true;
    }
    return false;
  }
  return true;
}

function sanitizeOnThisDayEntry(entry, month, day) {
  if (!entry?.text) return null;
  const text = normalizeGroqText(entry.text);
  if (!text || text.length < 20 || looksLikeJsonLeak(text)) return null;
  if (isVagueOnThisDayText(text, entry.artist)) return null;

  const artist = entry.artist ? String(entry.artist).trim() : null;
  if (artist && !isArtistAllowedOnDate(artist, month, day)) return null;
  if (artist && wasArtistUsedRecently(artist)) return null;
  if (!validateOnThisDayAccuracy(text, artist, month, day, METAL_VERIFIED_DEATHS, ON_THIS_DAY_EVENTS)) {
    return null;
  }

  return {
    text,
    artist,
    hook: entry.hook ? String(entry.hook).trim() : text.slice(0, 80),
  };
}

function pickCuratedOnThisDay(month, day) {
  const mmdd = mmddKey(month, day);
  const candidates = ON_THIS_DAY_EVENTS.filter((e) => e.date === mmdd);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  for (const ev of shuffled) {
    if (!isArtistAllowedOnDate(ev.artist, month, day)) continue;
    if (wasArtistUsedRecently(ev.artist)) continue;
    const used = new Set(loadList(KEYS.onthisday).map((x) => String(x).toLowerCase()));
    const token = `${artistKey(ev.artist)}|${ev.year} ${mmdd}`.toLowerCase();
    if ([...used].some((u) => u.includes(artistKey(ev.artist)))) continue;
    return {
      text: ev.text,
      artist: ev.artist,
      hook: `${ev.artist} ${ev.year} ${mmdd}`,
    };
  }
  return null;
}

function getAnniversaryOnThisDay(month, day) {
  const mmdd = mmddKey(month, day);
  const ann = ANNIVERSARIES.find((a) => a.date === mmdd);
  if (!ann || wasArtistUsedRecently(ann.band)) return null;
  return {
    text: `Un día como hoy en ${ann.year} el CIRCLE recuerda el lanzamiento de ${ann.title} de ${ann.band} ☠️`,
    artist: ann.band,
    hook: `${ann.band} ${ann.title} ${mmdd}`,
  };
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

/** Un día como hoy — SOLO hechos verificados en DB (sin Groq: cero alucinaciones de fechas). */
async function getDailyOnThisDay(month, day) {
  const cached = getDayCache('onthisday');
  const cachedClean = sanitizeOnThisDayEntry(cached, month, day);
  if (cachedClean) return cachedClean;
  if (cached) clearDayCache('onthisday');

  let result = pickCuratedOnThisDay(month, day);
  if (!result) {
    result = sanitizeOnThisDayEntry(getAnniversaryOnThisDay(month, day), month, day);
  }

  if (result) {
    rememberOnThisDay(result);
    setDayCache('onthisday', result);
  }
  return result;
}

module.exports = {
  getDailyAlbum,
  getDailyBand,
  getDailyCuriosity,
  getDailySong,
  getDailyOnThisDay,
};
