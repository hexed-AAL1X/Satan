const Groq = require('groq-sdk');
const https = require('https');
const http = require('http');
const { getUser, getUserBestMatch, getWeeklyRanking, getWeekKey, muteUserMultiJid, banUser } = require('../db');
const { getLevelName, getLevelEmoji } = require('../scheduler/ranking');
const { startTrivia, startMetalQuiz } = require('./trivia');
const { sendWithTyping } = require('../utils/typing');
const { getAlbumArtworkSafe, getBandImageSafe } = require('../utils/images');
const { getSatanResponse } = require('../handlers/satan-dm');

function httpGetSimple(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'SatanMetalBot/1.0' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', () => resolve(null));
    });
    req.setTimeout(7000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

const recentlyRecommended = new Set();

const { isForbiddenNonCircleGenre } = require('../utils/circle-genre-guard');
const { groqWithRetry, hasGroqKey, GROQ_UNAVAILABLE_MSG } = require('../utils/groq-retry');
const { satanGroqMessage, FB, getRulesetMessage } = require('../handlers/groq-satan-copy');

function getMessageContextInfo(msg) {
  const inner = msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message?.viewOnceMessageV2?.message ||
    msg?.message;
  if (!inner) return null;
  return inner.extendedTextMessage?.contextInfo ||
    inner.imageMessage?.contextInfo ||
    inner.videoMessage?.contextInfo ||
    inner.documentMessage?.contextInfo ||
    inner.audioMessage?.contextInfo ||
    inner.stickerMessage?.contextInfo ||
    null;
}

function extractMentionedJid(msg, text = '') {
  const ctx = getMessageContextInfo(msg);
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant && ctx?.quotedMessage) return ctx.participant;
  const atNum = String(text || '').match(/@(\d{8,15})/);
  if (atNum) return `${atNum[1]}@s.whatsapp.net`;
  return null;
}

function resolveTargetJids(groupMetadata, targetRef) {
  if (!targetRef) return [];
  const allJids = new Set([targetRef]);
  const targetNum = targetRef.split('@')[0]?.split(':')[0] || '';
  for (const p of groupMetadata?.participants || []) {
    const pNum = p.id?.split('@')[0]?.split(':')[0] || '';
    const pLidNum = p.lid?.split('@')[0]?.split(':')[0] || '';
    const match = p.id === targetRef || p.lid === targetRef ||
      (targetNum && (pNum === targetNum || pLidNum === targetNum));
    if (match) {
      if (p.id) allJids.add(p.id);
      if (p.lid) allJids.add(p.lid);
    }
  }
  return [...allJids];
}
const { KEYS, remember, exclusionBlock, loadList } = require('../utils/content-history');

// Hidratar historial de recomendaciones (persiste en SQLite)
for (const b of loadList(KEYS.reco)) recentlyRecommended.add(b);

const RECO_ANGLES = [
  'prioriza escena LATINOAMÉRICA obscure sin repetir clichés',
  'prioriza death/black EUROPEO de culto años 80-90',
  'prioriza doom/sludge/stoner poco masivo',
  'prioriza punk duro / crust / d-beat conectado al metal',
  'prioriza folk/pagan/viking fuera de los nombres obvios',
  'prioriza industrial/noise metal de nicho',
  'prioriza bandas con menos de 15k oyentes mensuales si puedes',
];

/** Owner: +51 943 605 088 — JID donde se reenvía siempre el catálogo privado */
const OWNER_PN = '51943605088';
const OWNER_PRIV_JID = `${OWNER_PN}@s.whatsapp.net`;

function getOwnerPrivateCatalogChunks() {
  return [
    `📜 *CATÁLOGO PRIVADO DEL SEÑOR*
Número: *+51 943 605 088*
JID: \`${OWNER_PRIV_JID}\`

*1) Chat sin comando (texto normal)*
SATÁN responde por *Groq*: contigo tono de AMO.
Si acabas de lanzar *!aprobar* / *!degradar* / *!expulsar* (y variantes) y el menú está activo, un *número*, *0* o *cancelar* completa la acción (~2 min TTL).`,

    `*2) Stickers → bancos (solo tú)*
*!bd* → los stickers que mandes en los siguientes *5 minutos* van al banco *buenos días*.
*!bv* → igual para el banco *bienvenida*.
Las confirmaciones y conteos te llegan en este chat.`,

    `*3) Memes*
Manda una *imagen* con leyenda exacta *!savememe* → se guarda en el banco interno de memes.`,

    `*4) Menú de grupos desde el privado*
*!aprobar* · *!approve* · *!degradar* · *!trial* · *!expulsar* · *!kick* · *!salir*
El bot lista tus grupos numerados; respondes el número o cancelas.
Tras elegir: mensajes de resultado (y en aprobar, también aviso al grupo) vía Groq + fallbacks.`,

    `*5) Reporte y ayuda admin*
*!grupos* · *!estado* · *!status* → reporte PRO / TRIAL / sin estado (+ trials huérfanos).
*!ownerhelp* · *!adminhelp* → panel de comandos (si lo pides desde un grupo, el panel largo se manda aquí igual).`,

    `*6) Comandos con ! también en DM*
Ejemplos: *!rank* *!top* *!ruleset* *!help* *!recomienda* *!trivia* *!metalquiz* *!meme* *!band* *!album* *!streak* *!letra* *!battle* *!onthisday* *!hoy*
*!mute* · *!unmute* · *!ban*: úsalos *en el grupo* con mención (no están pensados desde el solo chat privado).`,

    `*7) Avisos automáticos que te llegan al privado*
Si un CIRCLE ya *gastó el trial* y vuelven a meter al bot sin acuerdo, recibes un DM de alerta citando el *nombre del grupo*, el texto del rechazo Groq/hardcodeado y contacto wa.me.`,
    `*8) Repetir este catálogo*
*!privado* o *!catalogoprivado* (solo tú): vuelve a mandar estos mensajes a *+51 943 605 088*.
*!test* (solo DM): batería LIVE de casi todas las funciones — tarda bastante ☠️`,
  ];
}

/** Envía al owner el listado completo de funciones / mensajes de DM fijas. */
async function sendOwnerPrivateCatalog(sock) {
  for (const chunk of getOwnerPrivateCatalogChunks()) {
    await sock.sendMessage(OWNER_PRIV_JID, { text: chunk }).catch((e) => {
      console.error('[PRIV-CAT]', e.message);
    });
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function getUndergroundRecommendations(genre) {
  const groq = getGroq();
  if (!groq) return null;
  const histBlock = exclusionBlock(KEYS.reco, 'Bandas YA recomendadas en este CIRCLE', 70);
  const angle = RECO_ANGLES[Math.floor(Math.random() * RECO_ANGLES.length)];
  const alreadySeen = recentlyRecommended.size > 0
    ? `NUNCA recomiendes estas bandas: ${[...recentlyRecommended].slice(-25).join(', ')}.`
    : '';

  const banned = [
    'Mayhem','Darkthrone','Burzum','Metallica','Slayer','Iron Maiden','Black Sabbath','Death',
    'Cannibal Corpse','Morbid Angel','Deicide','Obituary','Sepultura','Behemoth','Watain',
    'Immortal','Emperor','Dimmu Borgir','Gorgoroth','Cradle of Filth','Belphegor','Marduk',
    'Rotting Christ','Sarcófago','Impaled Nazarene','Possessed','Venom','Celtic Frost',
    'Bathory','Mercyful Fate','King Diamond','Pantera','Lamb of God','Trivium','Avenged Sevenfold',
    'System of a Down','Rammstein','Nightwish','Arch Enemy','In Flames','Opeth','Meshuggah',
    'Tool','Gojira','Mastodon','Ghost','Sabaton','Amon Amarth','Children of Bodom',
  ].join(', ');
  const rawGenre = String(genre || '').trim();
  const isLatinDanceAsk = /\b(?:cumbia|bachata|salsa|merengue)\b/i.test(rawGenre);

  const isDescriptive =
    genre && (!/^[a-záéíóúüñ\s]+$/i.test(genre) || (genre && genre.split(' ').length > 2));
  let searchContext;
  if (isDescriptive) {
    searchContext = `que cumplan esta petición SIN SALIR del mundo permitido (METAL ROCK PESADO PUNK DURA y si el texto habla de fiesta latina CUMBIA BACHATA SALSA MERENGUE dentro de la misma tribu): ${genre}`;
  } else if (isLatinDanceAsk) {
    searchContext = `dentro solo del género latino fiestero ${genre}: artistas poco masivos o de culto, nada de estrella radial obvia`;
  } else {
    searchContext = `del núcleo METAL ROCK PESADO (incluye subgéneros doom death black folk stoner punk duro industriales etc): ${genre || 'metal extremo'}`;
  }

  const alcance =
    `MUNDO PERMITIDO: todo METAL cualquier subtipo, ROCK OSCURO o PESADO cercano METALHEADS incluye hard rock progre oscuro punk Oi hardcore cuando la tribu los escucha.` +
    ` También válido cuando el texto lo pide: CUMBIA BACHATA SALSA MERENGUE priorizando perfiles menos masivos cuando puedas.\n\n` +
    `MUNDOS IGNORADOS: TRAP latin trap REGGAETON DEMBOW REGGAE KPOP Jpop Cpop hyperpop idols AFROBEATS R&B música infantil playlists radio.\n`;

  const prompt = `${alcance}

Eres un experto dentro de ese CIRCLE únicamente. Ángulo de hoy: ${angle}.
Recomienda exactamente ${isLatinDanceAsk ? '3 artistas (pueden ser solistas) o agrupaciones' : '3 bandas'} ${searchContext} que sean MUY poco conocidas, menos de 20 000 oyentes mensuales aprox cuando sea posible mencionar ese matiz en el why.
Prioriza Latinoamérica Scandinavia Este Europa otros focos donde haya ESCENA seria.
NUNCA recomiendes estas bandas: ${banned}. ${alreadySeen}${histBlock}

IMPORTANTE campo why en español sin traducir géneros al castellano (black metal doom metal siguen inglés cuando toque metal). Sin palabra "underground".

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown:
[
  {"band":"nombre","country":"país","album":"album o disco recomendado","year":"año","why":"una línea en español de por qué es especial"},
  {"band":"...","country":"...","album":"...","year":"...","why":"..."},
  {"band":"...","country":"...","album":"...","year":"...","why":"..."}
]`;

  return groqWithRetry(async () => {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.05,
        max_tokens: 450,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    const raw = result.choices[0]?.message?.content?.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('json vacío');
    const bands = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(bands) || bands.length < 1) throw new Error('sin bandas');
    bands.forEach(b => {
      recentlyRecommended.add(b.band);
      remember(KEYS.reco, b.band, 150);
    });
    return bands;
  }, { attempts: 4, label: 'RECOMIENDA' });
}

// Delegamos al módulo centralizado de imágenes
const getAlbumArtworkUrl = (band, album) => getAlbumArtworkSafe(band, album, 8000);
const getBandArtistImageUrl = (band) => getBandImageSafe(band, 8000);

async function getSatanLine(prompt) {
  const groq = getGroq();
  if (!groq) return null;
  return groqWithRetry(async () => {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.1,
        max_tokens: 60,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const line = r.choices[0]?.message?.content?.trim();
    if (!line) throw new Error('respuesta vacía');
    return line.replace(/\s*[—–-]+\s*/g, ' ').trim();
  }, { attempts: 4, label: 'SATAN-LINE' });
}

async function sendRecommendations(sock, jid, genre) {
  const gRaw = (genre || '').trim();
  if (isForbiddenNonCircleGenre(gRaw)) {
    await sendWithTyping(sock, jid, await satanGroqMessage('genre_reject'));
    return;
  }
  if (!hasGroqKey()) {
    await sendWithTyping(sock, jid, GROQ_UNAVAILABLE_MSG);
    return;
  }
  const bands = await getUndergroundRecommendations(gRaw || 'metal extremo');
  if (!bands?.length) {
    await sendWithTyping(sock, jid, await satanGroqMessage('reco_empty'));
    return;
  }

  const introPrompt = `Eres SATÁN hablando a un grupo de metal. Escribe exactamente 1 frase muy corta (5-8 palabras) en español, oscura y directa, diciendo que vas a mostrar bandas. Una palabra en MAYÚSCULAS. 1 emoji de: ☠️ ⚔️ 🖤 🤘 👁️. Responde SOLO la frase, nada más.`;
  const intro = await getSatanLine(introPrompt);
  if (!intro) {
    await sendWithTyping(sock, jid, GROQ_UNAVAILABLE_MSG);
    return;
  }
  await sendWithTyping(sock, jid, intro);

  for (const b of bands) {
    await new Promise(r => setTimeout(r, 1000));
    const caption = `🩸 *${b.band}* ${b.country}\n💀 Album: _${b.album}_ (${b.year})\n🖤 ${b.why}`;
    try {
      const artUrl = await getAlbumArtworkUrl(b.band, b.album);
      console.log(`[RECOMIENDA] ${b.band} → ${artUrl ? 'imagen OK' : 'sin imagen'}`);
      if (artUrl) {
        await sock.sendMessage(jid, { image: { url: artUrl }, caption });
      } else {
        await sendWithTyping(sock, jid, caption);
      }
    } catch (e) {
      console.error('[RECOMIENDA IMG]', e.message?.slice(0, 80));
      await sendWithTyping(sock, jid, caption);
    }
  }

  await new Promise(r => setTimeout(r, 800));
  const outroPrompt = `Eres SATÁN hablando a un grupo de metal. Escribe exactamente 1 frase muy corta (5-8 palabras) invitando a que aporten más bandas. Una palabra en MAYÚSCULAS. 1 emoji de: 🤘 ☠️ 🖤. Responde SOLO la frase, nada más.`;
  const outro = await getSatanLine(outroPrompt);
  if (outro) await sendWithTyping(sock, jid, outro);
}

const LEVEL_NAMES = ['', 'Recruit', 'Headbanger', 'Berserker', 'Deathbringer', 'Overlord'];

// Respuestas del bot a mensajes de texto normales (modo chat / prueba)
const CHAT_RESPONSES = [
  { triggers: ['hola', 'buenas', 'saludos', 'hey'], reply: () => `siente ☠️ la presencia\nel CIRCLE ☠️ te escucha` },
  { triggers: ['que pasa', 'que hay', 'que onda', 'que tal'], reply: () => `todo 🖤 en las sombras\ncomo DEBE 🖤 ser` },
  { triggers: ['metal'], reply: () => `el METAL 🤘 no muere\nsolo cambia 🤘 de forma` },
  { triggers: ['black metal', 'bm'], reply: () => `BLACK METAL ⛧ donde el fuego\ny el hielo ⛧ se encuentran` },
  { triggers: ['death metal', 'dm'], reply: () => `DEATH METAL 💀 la brutalidad\nhecha ARTE 💀` },
  { triggers: ['gracias', 'thank'], reply: () => `para ESO 🔱 estamos\nGUERRERO 🔱` },
  { triggers: ['quien eres', 'que eres', 'eres un bot'], reply: () => `soy 👁️ la sombra que cuida este CIRCLE\nel que OBSERVA 👁️ el que ACTÚA 👁️` },
  { triggers: ['reglas', 'rules'], reply: () => getRulesetMessage() },
  { triggers: ['ayuda', 'help', 'comandos'], reply: () => `los COMANDOS 🔱 del CIRCLE:\n\n!rank ← tu rango y puntos\n!top ← ranking semanal\n!band [nombre] ← info de banda\n!trivia ← pregunta metal\n!recomienda [género] ← 3 bandas\n!ruleset ← reglas` },
];

function handleChatMessage(text) {
  const lower = text.toLowerCase().trim();
  for (const cr of CHAT_RESPONSES) {
    if (cr.triggers.some(t => lower.includes(t))) {
      return cr.reply();
    }
  }
  return null;
}

const fs = require('fs');
const path = require('path');
const MEMES_DIR = path.join(__dirname, '../../data/memes');
if (!fs.existsSync(MEMES_DIR)) fs.mkdirSync(MEMES_DIR, { recursive: true });

// Subreddits con memes de metal/humor
const MEME_SOURCES = [
  { type: 'memeapi', sub: 'BlackMetalMemes' },
  { type: 'memeapi', sub: 'metalmemes' },
  { type: 'memeapi', sub: 'MetalMemes' },
  { type: 'memeapi', sub: 'Metalheads' },
  { type: 'memeapi', sub: 'DarkHumorAndMemes' },
  { type: 'memeapi', sub: 'HeavyMetal' },
];

let lastMemeIdx = -1;
let memeCache = [];
let lastCacheRefresh = 0;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchFromMemeApi(subreddit) {
  return new Promise((resolve) => {
    https.get(
      `https://meme-api.com/gimme/${subreddit}/10`,
      { headers: { 'User-Agent': 'SatanMetalBot/2.0' } },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const posts = json?.memes || (json?.url ? [json] : []);
            const imgs = posts
              .filter(p => !p.nsfw && /\.(jpg|jpeg|png|gif)/i.test(p.url))
              .map(p => p.url);
            resolve(imgs);
          } catch { resolve([]); }
        });
        res.on('error', () => resolve([]));
      }
    ).on('error', () => resolve([]));
  });
}

async function refreshMemeCache() {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL && memeCache.length > 10) return;
  try {
    const shuffled = [...MEME_SOURCES].sort(() => Math.random() - 0.5);
    const results = await Promise.allSettled(
      shuffled.map(s => fetchFromMemeApi(s.sub))
    );
    const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(Boolean);
    if (all.length > 0) {
      memeCache = all;
      lastCacheRefresh = now;
      console.log(`[MEMES] Cache actualizado: ${all.length} imágenes`);
    }
  } catch (e) {
    console.error('[MEMES CACHE]', e.message);
  }
}

async function getMeme() {
  await refreshMemeCache();
  if (memeCache.length > 0) {
    const url = memeCache[Math.floor(Math.random() * memeCache.length)];
    return { url };
  }
  // Fallback: banco local curado
  const localFiles = fs.existsSync(MEMES_DIR)
    ? fs.readdirSync(MEMES_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)/i.test(f))
    : [];
  if (localFiles.length > 0) {
    const candidates = localFiles.map((_, i) => i).filter(i => i !== lastMemeIdx);
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    lastMemeIdx = idx;
    return { buffer: fs.readFileSync(path.join(MEMES_DIR, localFiles[idx])) };
  }
  return null;
}

// Guardar meme enviado por el owner al privado
async function saveMemeFromMsg(msg, sock) {
  try {
    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: { info: () => {}, error: () => {}, warn: () => {} },
      reuploadRequest: sock.updateMediaMessage,
    });
    const filename = `meme_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(MEMES_DIR, filename), buffer);
    return filename;
  } catch { return null; }
}

module.exports.saveMemeFromMsg = saveMemeFromMsg;

async function sendMeme(sock, jid) {
  const meme = await getMeme();
  if (meme) {
    const caption = await satanGroqMessage('meme_caption');
    if (meme.buffer) {
      await sock.sendMessage(jid, { image: meme.buffer, caption });
    } else {
      await sock.sendMessage(jid, { image: { url: meme.url }, caption });
    }
  } else {
    const { sendWithTyping } = require('../utils/typing');
    await sendWithTyping(sock, jid, await satanGroqMessage('infra_fail'));
  }
}

async function handleCommand(sock, jid, senderJid, senderName, text, groupMetadata, msg) {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const command = cmd.toLowerCase();
  const ownerLidResolved = global._ownerLid || '';
  const isOwner = senderJid && (
    senderJid.includes(OWNER_PN) ||
    (ownerLidResolved && senderJid.includes(ownerLidResolved))
  );

  // Extraer mención: @persona, respuesta a mensaje o @número en texto
  const getMentionedJid = () => extractMentionedJid(msg, text);

  // Detección robusta de admin: compara por id, por número y por LID
  const senderNumber = senderJid?.split('@')[0]?.split(':')[0] || '';
  const isAdmin = isOwner || (groupMetadata?.participants || [])
    .some(p => {
      if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
      if (p.id === senderJid) return true;
      const pNum = p.id?.split('@')[0]?.split(':')[0] || '';
      if (senderNumber && pNum === senderNumber) return true;
      if (p.lid && p.lid === senderJid) return true;
      if (p.lid && p.lid.split('@')[0] === senderJid?.split('@')[0]) return true;
      return false;
    });

  // --- Owner: batería live de todo el bot (solo DM) ---
  if (command === '!test') {
    if (!isOwner) return null;
    if (jid.endsWith('@g.us')) return await satanGroqMessage('test_must_private');
    runOwnerLiveTest(sock, senderJid, senderName || 'SEÑOR').catch((e) => console.error('[!test]', e.message));
    return await satanGroqMessage('test_started_ack');
  }

  if (command === '!rank' || command === '!rango') {
    const rankJids = resolveTargetJids(groupMetadata, senderJid);
    const user = getUserBestMatch(rankJids.length ? rankJids : [senderJid], jid) || getUser(senderJid, jid);
    if (!user) return await satanGroqMessage('rank_none', { senderName });
    const emoji = getLevelEmoji(user.level);
    const levelName = getLevelName(user.level);
    const dataBlock = `${emoji} *RANGO DE @${senderName}* ${emoji}\n\n` +
      `🔱 Rango: *${levelName}*\n` +
      `⚔️ Puntos totales: *${user.points}*\n` +
      `🔥 Puntos mensuales: *${user.monthly_points || 0}*\n` +
      `🦇 Strikes: *${user.strikes}/3*\n` +
      `📅 Racha: *${user.streak || 0} días*`;
    return await satanGroqMessage('rank_card', { senderName, dataBlock });
  }

  if (command === '!top' || command === '!ranking') {
    const top = getWeeklyRanking(null, jid);
    if (!top.length) return await satanGroqMessage('top_empty');
    const medals = ['🥇', '🥈', '🥉'];
    const podium = top.slice(0, 3).map((u, i) =>
      `${medals[i]} *${i + 1}°* ${u.name} ${getLevelEmoji(u.level)} — *${u.weekly_points} pts*`
    ).join('\n');
    const rest = top.slice(3).map((u, i) =>
      `  ${i + 4}. ${u.name} ${getLevelEmoji(u.level)} ${u.weekly_points} pts`
    ).join('\n');
    const dataBlock = `⚔️ *RANKING SEMANAL* ${getWeekKey()} ☠️\n\n` +
      `${podium}${rest ? '\n\n' + rest : ''}`;
    return await satanGroqMessage('top_body', { weekKey: getWeekKey(), dataBlock });
  }

  if (command === '!ruleset' || command === '!reglas' || command === '!rules') {
    return getRulesetMessage();
  }

  if (command === '!help' || command === '!ayuda' || command === '!comandos') {
    return await satanGroqMessage('help', { helpBlock: FB.help() });
  }

  if (command === '!recomienda') {
    const query = args.join(' ') || 'metal extremo';
    if (isForbiddenNonCircleGenre(query)) {
      return await satanGroqMessage('genre_reject');
    }
    sendRecommendations(sock, jid, query).catch(console.error);
    return null;
  }

  if (command === '!trivia') {
    const diff = args[0]?.toLowerCase(); // facil | medio | dificil | undefined
    await startTrivia(sock, jid, diff);
    return null;
  }

  // !metalquiz es oculto (no aparece en recordatorios) — usa el quiz de 3 preguntas con puntaje
  if (command === '!metalquiz') {
    const diff = args[0] && ['facil', 'medio', 'dificil'].includes(args[0].toLowerCase()) ? args[0].toLowerCase() : null;
    await startMetalQuiz(sock, jid, { difficulty: diff });
    return null;
  }

  if (command === '!meme') {
    const meme = await getMeme();
    if (meme) {
      const caption = await satanGroqMessage('meme_caption');
      if (meme.buffer) {
        await sock.sendMessage(jid, { image: meme.buffer, caption });
      } else {
        await sock.sendMessage(jid, { image: { url: meme.url }, caption });
      }
    } else {
      await sendWithTyping(sock, jid, await satanGroqMessage('infra_fail'));
    }
    return null;
  }

  // --- Comandos de admin ---
  if (command === '!mute') {
    if (!isAdmin) return await satanGroqMessage('admin_denied');
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) {
      return await satanGroqMessage('usage', { usage: '!mute @persona [horas]', example: '!mute @Juan 24' });
    }
    const hours = parseInt(args.find(a => /^\d+$/.test(a))) || 24;
    const allJids = resolveTargetJids(groupMetadata, mentionedJid);
    console.log(`[MUTE] mentionedJid=${mentionedJid} allJids=${JSON.stringify(allJids)} group=${jid}`);
    muteUserMultiJid(allJids, hours, jid);
    const targetKey = mentionedJid.split('@')[0];
    return {
      text: await satanGroqMessage('mute_ok', { targetKey, hours }),
      mentions: [mentionedJid],
    };
  }

  if (command === '!ban') {
    if (!isAdmin) return await satanGroqMessage('admin_denied');
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) return await satanGroqMessage('usage', { usage: '!ban @persona', example: '!ban @Juan' });
    const targetKey = mentionedJid.split('@')[0];
    try {
      await sock.groupParticipantsUpdate(jid, [mentionedJid], 'remove');
    } catch (e) {
      console.error('[BAN]', e.message);
      return await satanGroqMessage('ban_failed', { targetKey });
    }
    return {
      text: await satanGroqMessage('ban_ok', { targetKey }),
      mentions: [mentionedJid],
    };
  }

  if (command === '!unmute') {
    if (!isAdmin) return await satanGroqMessage('admin_denied');
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) return await satanGroqMessage('usage', { usage: '!unmute @persona', example: '!unmute @Juan' });
    const allJids = resolveTargetJids(groupMetadata, mentionedJid);
    muteUserMultiJid(allJids, 0, jid);
    const targetKey = mentionedJid.split('@')[0];
    return {
      text: await satanGroqMessage('unmute_ok', { targetKey }),
      mentions: [mentionedJid],
    };
  }

  if (command === '!band') {
    const band = args.join(' ');
    if (!band) return await satanGroqMessage('usage', { usage: '!band [nombre de banda]', example: '!band Mayhem' });
    if (isForbiddenNonCircleGenre(band)) return await satanGroqMessage('genre_reject');
    getBandInfo(sock, jid, band).catch(console.error);
    return null;
  }

  if (command === '!album') {
    const query = args.join(' ');
    if (!query) {
      return await satanGroqMessage('usage', {
        usage: '!album [álbum] de [banda] o solo nombre',
        example: '!album Reign in Blood de Slayer',
      });
    }
    if (isForbiddenNonCircleGenre(query)) return await satanGroqMessage('genre_reject');
    getAlbumInfo(sock, jid, query).catch(console.error);
    return null;
  }

  if (command === '!streak') {
    const streakJids = resolveTargetJids(groupMetadata, senderJid);
    const user = getUserBestMatch(streakJids.length ? streakJids : [senderJid], jid) || getUser(senderJid, jid);
    if (!user) return await satanGroqMessage('streak_none', { senderName });
    const streak = user.streak || 0;
    if (streak === 0) return await satanGroqMessage('streak_0', { senderName });
    if (streak === 1) return await satanGroqMessage('streak_1', { senderName });
    if (streak < 5) return await satanGroqMessage('streak_low', { senderName, streak });
    if (streak < 10) return await satanGroqMessage('streak_mid', { senderName, streak });
    return await satanGroqMessage('streak_high', { senderName, streak });
  }

  if (command === '!letra') {
    const query = args.join(' ');
    if (!query) {
      return await satanGroqMessage('usage', { usage: '!letra [canción] por [artista]', example: '!letra Freezing Moon por Mayhem' });
    }
    if (isForbiddenNonCircleGenre(query)) return await satanGroqMessage('genre_reject');
    getLyrics(sock, jid, query).catch(console.error);
    return null;
  }

  if (command === '!battle') {
    const { sendBattle } = require('../scheduler');
    sendBattle(sock, jid).catch(console.error);
    return null;
  }

  if (command === '!onthisday' || command === '!hoy') {
    const { sendOnThisDay } = require('../scheduler');
    sendOnThisDay(sock, jid).catch(console.error);
    return null;
  }

  // --- Comandos owner-only: menú interactivo ---
  const OWNER_MENU_CMDS = ['!aprobar', '!approve', '!degradar', '!trial', '!expulsar', '!kick', '!salir'];
  if (OWNER_MENU_CMDS.includes(command)) {
    if (!isOwner) return null;

    // Desde dentro de un grupo sin args → acción directa
    if (jid.endsWith('@g.us') && args.length === 0) {
      if (command === '!aprobar' || command === '!approve') {
        const { approveGroup, endTrial } = require('../db');
        approveGroup(jid); endTrial(jid);
        return await satanGroqMessage('owner_pro_ok');
      }
      if (command === '!degradar' || command === '!trial') {
        const { unapproveGroup, startTrial, getTrialStart, clearTrialConsumed } = require('../db');
        unapproveGroup(jid);
        clearTrialConsumed(jid);
        if (!getTrialStart(jid)) startTrial(jid);
        return await satanGroqMessage('owner_trial_ok');
      }
      if (['!expulsar','!kick','!salir'].includes(command)) {
        kickGroupWithFarewell(sock, senderJid, jid, null).catch(console.error);
        return null;
      }
    }

    // Desde privado o con args → mostrar menú interactivo
    openOwnerMenu(sock, senderJid, command).catch(e => console.error('[MENU]', e.message));
    return null;
  }

  // --- Owner-only: reporte de grupos (PRO + TRIAL) ---
  if (command === '!grupos' || command === '!estado' || command === '!status') {
    if (!isOwner) return null;
    sendGroupsReport(sock, senderJid).catch(e => console.error('[GRUPOS]', e.message));
    if (jid !== senderJid) return await satanGroqMessage('owner_dm_sent');
    return null;
  }

  // --- Owner-only: catálogo de mensajes/fun. privadas → siempre +51 943 605 088 ---
  if (command === '!privado' || command === '!catalogoprivado') {
    if (!isOwner) return null;
    await sendOwnerPrivateCatalog(sock);
    if (jid.endsWith('@g.us')) return await satanGroqMessage('private_catalog_ack');
    return null;
  }

  // --- Owner-only: ayuda privada ---
  if (command === '!ownerhelp' || command === '!adminhelp') {
    if (!isOwner) return null;
    const panelBlock = [
      `🔱 *PANEL DEL SEÑOR* ☠️`,
      ``,
      `*GESTIÓN DE GRUPOS*`,
      `!grupos — reporte completo (PRO/TRIAL/tiempo)`,
      `!privado — catálogo COMPLETO de todo lo que pasa por DM (~+51 943 605 088)`,
      `!aprobar — menú para aprobar un grupo (PRO permanente)`,
      `!degradar — menú para bajar un grupo a TRIAL 12h`,
      `!expulsar — menú para sacar un grupo con despedida comercial`,
      ``,
      `*STICKERS*`,
      `!bd — próximos stickers enviados → banco buenos días`,
      `!bv — próximos stickers enviados → banco bienvenida`,
      ``,
      `*MEMES*`,
      `!savememe [imagen] — guarda imagen al banco de memes`,
      ``,
      `*MODERACIÓN*`,
      `!mute @usuario — silencia en el grupo`,
      `!unmute @usuario — quita silencio`,
      `!ban @usuario — expulsa del grupo`,
      ``,
      `*SCHEDULER / TEST*`,
      `!onthisday — fuerza envío del "on this day"`,
      `!test — batería LIVE de casi todas las funciones (solo PRIVADO)`,
      ``,
      `_Solo tú puedes usar estos comandos_ 👁️`,
    ].join('\n');
    const helpMsg = await satanGroqMessage('owner_help', { panelBlock });
    await sock.sendMessage(senderJid, { text: helpMsg }).catch(() => {});
    if (jid !== senderJid) return await satanGroqMessage('owner_help_sent');
    return null;
  }

  return null;
}

// ─── Menú interactivo owner ────────────────────────────────────────────────
// pendingMenus: ownerJid → { action, groups: [{gid, name, status, remaining}], expiresAt }
const pendingMenus = new Map();
const MENU_TTL = 2 * 60 * 1000; // 2 minutos para responder

function fmtStatus(gid) {
  const { isGroupApproved, getTrialStart } = require('../db');
  const TRIAL_MS = 12 * 60 * 60 * 1000;
  if (isGroupApproved(gid)) return '🩸 PRO';
  const ts = getTrialStart(gid);
  if (ts) {
    const rem = TRIAL_MS - (Date.now() - ts);
    return rem > 0 ? `⌛ TRIAL ${fmtRemaining(rem)}` : '⌛ TRIAL EXPIRADO';
  }
  return '❓ sin estado';
}

async function openOwnerMenu(sock, ownerJid, action) {
  let groups = {};
  try {
    groups = await sock.groupFetchAllParticipating();
  } catch (e) {
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('menu_fetch_error', { error: e.message }),
    });
    return;
  }
  const list = Object.entries(groups).map(([gid, m], i) => ({
    num: i + 1,
    gid,
    name: m?.subject || gid,
    size: m?.participants?.length || 0,
  }));

  const actionLabel = {
    '!aprobar': '✅ APROBAR (PRO permanente)',
    '!approve': '✅ APROBAR (PRO permanente)',
    '!degradar': '⌛ DEGRADAR (TRIAL 12h)',
    '!trial':    '⌛ DEGRADAR (TRIAL 12h)',
    '!expulsar': '💀 EXPULSAR (despedida + salir)',
    '!kick':     '💀 EXPULSAR (despedida + salir)',
    '!salir':    '💀 EXPULSAR (despedida + salir)',
  }[action] || action;

  const lines = [`🔱 *${actionLabel}*\n`, `elige el número del grupo SEÑOR:\n`];
  for (const g of list) {
    lines.push(`*${g.num}.* ${g.name} 👥${g.size}  ${fmtStatus(g.gid)}`);
  }
  lines.push(`\n_responde con el número o con "0" para cancelar_`);

  pendingMenus.set(ownerJid, {
    action,
    groups: list,
    expiresAt: Date.now() + MENU_TTL,
  });

  const menuBody = await satanGroqMessage('owner_menu_list', { rawBlock: lines.join('\n') });
  await sock.sendMessage(ownerJid, { text: menuBody });
}

async function handlePendingMenu(sock, ownerJid, text) {
  const pending = pendingMenus.get(ownerJid);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    pendingMenus.delete(ownerJid);
    return false;
  }

  const trimmed = text.trim();
  if (trimmed === '0' || trimmed.toLowerCase() === 'cancelar') {
    pendingMenus.delete(ownerJid);
    await sock.sendMessage(ownerJid, { text: await satanGroqMessage('owner_cancel') });
    return true;
  }

  const num = parseInt(trimmed);
  if (isNaN(num) || num < 1 || num > pending.groups.length) {
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('owner_invalid_num', { maxNum: pending.groups.length }),
    });
    return true;
  }

  pendingMenus.delete(ownerJid);
  const { gid, name } = pending.groups[num - 1];
  const { action } = pending;

  if (action === '!aprobar' || action === '!approve') {
    const { approveGroup, endTrial } = require('../db');
    approveGroup(gid); endTrial(gid);
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('owner_approve_dm', { name }),
    });
    try {
      await sock.sendMessage(gid, { text: await satanGroqMessage('group_pro_broadcast') });
    } catch (_) {}

  } else if (action === '!degradar' || action === '!trial') {
    const { unapproveGroup, startTrial, getTrialStart, clearTrialConsumed } = require('../db');
    unapproveGroup(gid);
    clearTrialConsumed(gid);
    if (!getTrialStart(gid)) startTrial(gid);
    const ts = getTrialStart(gid);
    const TRIAL_MS = 12 * 60 * 60 * 1000;
    const rem = ts ? Math.round((TRIAL_MS - (Date.now() - ts)) / 3600000 * 10) / 10 : 12;
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('owner_degrade_dm', { name, remHours: rem }),
    });

  } else if (['!expulsar','!kick','!salir'].includes(action)) {
    await kickGroupWithFarewell(sock, ownerJid, gid, null);
  }

  return true;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function kickGroupWithFarewell(sock, ownerJid, targetGid, query) {
  const { unapproveGroup, endTrial, removeGroupPresentation, markTrialConsumed } = require('../db');

  const TRIAL_END = [
    `⌛ el RELOJ del INFRAMUNDO marca el final\n\nles concedí mi presencia 🩸 espero que hayan tomado nota MORTALES\n\nme retiro al ABISMO porque mi GUARDIÁN no ha autorizado mi permanencia aquí 👁️\n\n🔱 si DESEAN tenerme de vuelta como su moderador del CIRCLE 🤘\n📞 contacten al SEÑOR *wa.me/51943605088*\n\nadiós ☠️ el inframundo nunca olvida`,
    `el tiempo de mi VISITA ha llegado a su fin ⚔️\n\nles mostré lo que es tener a SATÁN en su grupo 🩸 🔥\n\npero mi GUARDIÁN no recibió la palabra y me debo retirar\n\n🔱 _para hacerme suyo de manera PERMANENTE:_\n📞 *wa.me/51943605088* — el SEÑOR del INFRAMUNDO atiende\n\nhasta pronto MORTALES 🖤 ⛧`,
    `el período de PRUEBA expiró ⌛\n\nles regalé mi poder absoluto pero nadie negoció con mi GUARDIÁN\n\nel CIRCLE se cierra para ustedes 💀 vuelvo al ABISMO de donde vine\n\n🔱 si cambian de opinión y quieren al INFRAMUNDO como aliado permanente\n📞 *wa.me/51943605088* hablen con el SEÑOR\n\nadiós ⚔️ ☠️`,
  ];

  const { sendTrialExpiredFarewell } = require('../handlers/trial-farewell');
  const TRIAL_HOURS_KICK = 12;

  const doKick = async (gid, groupName) => {
    try {
      await sendTrialExpiredFarewell(sock, gid, {
        trialHours: TRIAL_HOURS_KICK,
        getFallbackCaption: () => TRIAL_END[Math.floor(Math.random() * TRIAL_END.length)],
        delayBeforeLeaveMs: 4000,
      });
      await sock.groupLeave(gid);
    } catch (err) { console.error('[KICK]', err.message); }
    unapproveGroup(gid);
    endTrial(gid);
    markTrialConsumed(gid);
    if (removeGroupPresentation) removeGroupPresentation(gid);
    if (ownerJid) {
      await sock.sendMessage(ownerJid, {
        text: await satanGroqMessage('kick_owner_confirm', { groupName }),
      }).catch(() => {});
    }
  };

  // Modo directo: gid ya conocido
  if (targetGid) {
    let groupName = targetGid;
    try {
      const meta = await sock.groupMetadata(targetGid);
      groupName = meta?.subject || targetGid;
    } catch (_) {}
    await doKick(targetGid, groupName);
    return;
  }

  // Modo búsqueda por nombre
  let groups = {};
  try { groups = await sock.groupFetchAllParticipating(); } catch (e) {
    if (ownerJid) {
      await sock.sendMessage(ownerJid, {
        text: await satanGroqMessage('menu_fetch_error', { error: e.message }),
      });
    }
    return;
  }
  const q = (query || '').toLowerCase();
  const matches = Object.entries(groups).filter(([, m]) => (m?.subject || '').toLowerCase().includes(q));
  if (!matches.length) {
    if (ownerJid) {
      await sock.sendMessage(ownerJid, {
        text: await satanGroqMessage('group_not_found', { query: String(query || '') }),
      });
    }
    return;
  }
  for (const [gid, meta] of matches) {
    await doKick(gid, meta?.subject || gid);
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function unapproveGroupByName(sock, ownerJid, query) {
  const { unapproveGroup } = require('../db');
  let groups = {};
  try { groups = await sock.groupFetchAllParticipating();   } catch (e) {
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('menu_fetch_error', { error: e.message }),
    });
    return;
  }
  const q = query.toLowerCase();
  const matches = Object.entries(groups).filter(([, m]) => (m?.subject || '').toLowerCase().includes(q));
  if (!matches.length) {
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('group_not_found', { query }),
    });
    return;
  }
  for (const [gid, meta] of matches) {
    unapproveGroup(gid);
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('unapprove_ok', { subject: meta.subject }),
    });
  }
}

function fmtRemaining(ms) {
  if (ms <= 0) return 'EXPIRADO';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

async function sendGroupsReport(sock, ownerJid) {
  const { isGroupApproved, getTrialStart, getAllTrials } = require('../db');
  const TRIAL_MS = 12 * 60 * 60 * 1000;
  let groups = {};
  try { groups = await sock.groupFetchAllParticipating();   } catch (e) {
    await sock.sendMessage(ownerJid, {
      text: await satanGroqMessage('menu_fetch_error', { error: `lista: ${e.message}` }),
    });
    return;
  }

  const pro = [];
  const trial = [];
  const orphan = [];
  for (const [gid, meta] of Object.entries(groups)) {
    const name = meta?.subject || gid;
    const size = meta?.participants?.length || 0;
    if (isGroupApproved(gid)) {
      pro.push({ gid, name, size });
    } else {
      const started = getTrialStart(gid);
      if (started) {
        const remaining = TRIAL_MS - (Date.now() - started);
        trial.push({ gid, name, size, remaining, started });
      } else {
        orphan.push({ gid, name, size });
      }
    }
  }

  // Trials huérfanos en DB (bot ya no está en ese grupo)
  const allTrials = getAllTrials();
  const liveGids = new Set(Object.keys(groups));
  const ghostTrials = allTrials.filter(t => !liveGids.has(t.groupId));

  const lines = [];
  lines.push(`🔱 *REPORTE DEL INFRAMUNDO* ⚔️`);
  lines.push(`📊 total grupos: *${Object.keys(groups).length}*`);
  lines.push(`💀 PRO: *${pro.length}*  ⌛ TRIAL: *${trial.length}*  ❓ sin estado: *${orphan.length}*`);
  lines.push('');

  if (pro.length) {
    lines.push(`🩸 *MODO PRO* (permanentes)`);
    pro.forEach((g, i) => {
      lines.push(`${i + 1}. ${g.name} 👥 ${g.size}`);
    });
    lines.push('');
  }

  if (trial.length) {
    lines.push(`⌛ *MODO TRIAL* (12h)`);
    trial.sort((a, b) => a.remaining - b.remaining);
    trial.forEach((g, i) => {
      const sinceStart = Math.round((Date.now() - g.started) / 60000);
      lines.push(`${i + 1}. ${g.name} 👥 ${g.size}`);
      lines.push(`   ⏳ restan: *${fmtRemaining(g.remaining)}* (lleva ${sinceStart}min)`);
    });
    lines.push('');
  }

  if (orphan.length) {
    lines.push(`❓ *SIN ESTADO* (revisar)`);
    orphan.forEach((g, i) => {
      lines.push(`${i + 1}. ${g.name} 👥 ${g.size}`);
    });
    lines.push('');
  }

  if (ghostTrials.length) {
    lines.push(`👻 *TRIALS HUÉRFANOS* (bot ya no está)`);
    ghostTrials.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.groupId}`);
    });
  }

  await sock.sendMessage(ownerJid, {
    text: await satanGroqMessage('groups_report', { rawBlock: lines.join('\n') }),
  });
}

async function fetchBandData(band) {
  const groq = getGroq();
  if (!groq) return null;
  const prompt = `Devuelve información sobre la banda de metal "${band}" en JSON estricto, sin texto adicional ni markdown. Usa solo comillas dobles, no apostrofes dentro de los valores:
{"name":"nombre oficial","country":"pais","genre":"genero","formed":"anno","status":"activa o disuelta","members":"miembros clave separados por coma","albums":["album1 (anno)","album2 (anno)","album3 (anno)"],"fact":"un dato curioso en espannol sin apostrofes ni comillas internas"}
Si no existe la banda o no es de metal responde: {"error":"not_found"}`;
  const result = await Promise.race([
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 350,
      response_format: { type: 'json_object' },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
  ]);
  const raw = result.choices[0]?.message?.content?.trim();
  return JSON.parse(raw);
}

async function getBandInfo(sock, jid, band) {
  await sendWithTyping(sock, jid, await satanGroqMessage('lookup_invoking', { kind: 'info', query: band }));

  let data = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      data = await fetchBandData(band);
      if (data) break;
    } catch (e) {
      console.error(`[!band intento ${attempt + 1}]`, e.message);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!data || data.error) {
    await sendWithTyping(sock, jid, await satanGroqMessage('band_not_found', { band }));
    return;
  }

  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.name + ' metal')}`;
  const spLink = `https://open.spotify.com/search/${encodeURIComponent(data.name)}`;

  const caption =
    `🩸 *${data.name}* ${data.country}\n` +
    `💀 ${data.genre}\n` +
    `⚔️ Formada en ${data.formed} · ${data.status}\n` +
    `🎸 ${data.members}\n\n` +
    `📀 *Discografía clave*\n${(data.albums || []).map(a => `  ⛧ ${a}`).join('\n')}\n\n` +
    `🦇 ${data.fact}\n\n` +
    `🔗 YouTube: ${ytLink}\n` +
    `🎧 Spotify: ${spLink}`;

  const imgUrl = await getBandArtistImageUrl(data.name);

  try {
    if (imgUrl) {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
    } else {
      await sendWithTyping(sock, jid, caption);
    }
  } catch (e) {
    console.error('[!band send]', e.message);
    await sendWithTyping(sock, jid, caption);
  }
}

async function fetchAlbumData(query) {
  const groq = getGroq();
  if (!groq) return null;
  // Parsear "Album X de Banda Y" o "Album X by Banda Y" o "Album X - Banda Y"
  let albumQuery = query;
  let bandHint = '';
  const sep = query.match(/^(.+?)\s+(?:de|by|del|por|-)\s+(.+)$/i);
  if (sep) { albumQuery = sep[1].trim(); bandHint = sep[2].trim(); }
  const hintLine = bandHint
    ? `IMPORTANTE: el album es de la banda "${bandHint}". Si hay varias bandas con un album similar, usa la informacion de ESTA banda especifica.`
    : '';
  const prompt = `Devuelve información sobre el album de metal "${albumQuery}"${bandHint ? ` de la banda "${bandHint}"` : ''} en JSON estricto, sin texto adicional ni markdown. ${hintLine}
Usa solo comillas dobles, sin apostrofes dentro de los valores:
{"title":"titulo","band":"banda","year":"anno","genre":"genero","label":"sello","tracks":["track1","track2","track3","track4","track5"],"description":"descripcion en 1-2 lineas en espannol sin apostrofes","highlight":"cancion mas iconica del album"}
Si no existe el album responde: {"error":"not_found"}`;
  const result = await Promise.race([
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 350,
      response_format: { type: 'json_object' },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
  ]);
  const raw = result.choices[0]?.message?.content?.trim();
  return JSON.parse(raw);
}

async function getAlbumInfo(sock, jid, query) {
  await sendWithTyping(sock, jid, await satanGroqMessage('lookup_invoking', { kind: 'info de álbum', query }));

  let data = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      data = await fetchAlbumData(query);
      if (data) break;
    } catch (e) {
      console.error(`[!album intento ${attempt + 1}]`, e.message);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!data || data.error) {
    await sendWithTyping(sock, jid, await satanGroqMessage('album_not_found', { query }));
    return;
  }

  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.band + ' ' + data.title + ' full album')}`;
  const spLink = `https://open.spotify.com/search/${encodeURIComponent(data.band + ' ' + data.title)}`;

  const caption =
    `💿 *${data.title}* ${data.band}\n` +
    `📅 ${data.year} · ${data.genre}\n` +
    `🏷️ ${data.label}\n\n` +
    `🖤 ${data.description}\n\n` +
    `🔥 Track destacado: _${data.highlight}_\n\n` +
    `🎵 *Tracklist*\n${(data.tracks || []).slice(0, 5).map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n\n` +
    `🔗 YouTube: ${ytLink}\n` +
    `🎧 Spotify: ${spLink}`;

  // Buscar la portada — preferentemente con la banda detectada por Groq
  const imgUrl = await getAlbumArtworkSafe(data.band, data.title, 7000);

  try {
    if (imgUrl) {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
    } else {
      await sendWithTyping(sock, jid, caption);
    }
  } catch (e) {
    console.error('[!album send]', e.message);
    await sendWithTyping(sock, jid, caption);
  }
}

async function getLyrics(sock, jid, query) {
  await sendWithTyping(sock, jid, await satanGroqMessage('lookup_invoking', { kind: 'letra', query }));

  // Parsear "canción por artista" o "canción - artista" o "canción by artista"
  let song = query, artist = '';
  const sepMatch = query.match(/^(.+?)\s+(?:por|by|-)\s+(.+)$/i);
  if (sepMatch) { song = sepMatch[1].trim(); artist = sepMatch[2].trim(); }

  let lyricsText = null;

  // 1. lyrics.ovh (si tiene artista)
  if (artist) {
    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`;
      const res = await httpGetSimple(url);
      if (res?.body) {
        const data = JSON.parse(res.body);
        if (data.lyrics && data.lyrics.length > 20) {
          const lines = data.lyrics.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
          lyricsText = lines.slice(0, 14).join('\n');
        }
      }
    } catch {}
  }

  // 2. Groq: letra + nombre del álbum donde aparece
  let albumName = null;
  if (!lyricsText) {
    const groq = getGroq();
    if (groq) {
      try {
        const r = await Promise.race([
          groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content:
              `Para la cancion "${song}"${artist ? ` de ${artist}` : ''}, devuelve SOLO este JSON sin markdown:
{"album":"nombre del album donde aparece la cancion","lyrics":"los versos mas iconicos en el idioma original maximo 12 lineas"}
Si no la conoces exactamente responde: {"album":"","lyrics":"NO_FOUND"}` }],
            temperature: 0.2, max_tokens: 450,
            response_format: { type: 'json_object' },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 10000)),
        ]);
        const raw = r.choices[0]?.message?.content?.trim();
        const parsed = JSON.parse(raw);
        if (parsed.lyrics && !parsed.lyrics.includes('NO_FOUND')) {
          lyricsText = parsed.lyrics;
          albumName = parsed.album || null;
        }
      } catch {}
    }
  }

  if (!lyricsText) {
    await sendWithTyping(
      sock,
      jid,
      await satanGroqMessage('lyrics_not_found', { song })
    );
    return;
  }

  const caption = `🩸 *${song}*${artist ? `  ${artist}` : ''}${albumName ? `\n💿 _${albumName}_` : ''}\n\n${lyricsText}\n\n🖤 ⛧`;

  // Buscar portada del álbum (con el nombre exacto del álbum si Groq lo dio), o foto del artista
  let imgUrl = null;
  const albumToSearch = albumName || song; // si no hay álbum, intentar con el nombre de la canción
  if (artist) {
    imgUrl = await Promise.race([
      getAlbumArtworkSafe(artist, albumToSearch, 6000)
        .then(url => url || getBandImageSafe(artist, 5000)),
      new Promise(r => setTimeout(() => r(null), 8000)),
    ]);
  }

  try {
    if (imgUrl) {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
    } else {
      await sendWithTyping(sock, jid, caption);
    }
  } catch {
    await sendWithTyping(sock, jid, caption);
  }
}

/** Batería de pruebas: encadena llamadas reales del bot enviando casi todo al DM del owner. */
async function runOwnerLiveTest(sock, ownerJid, senderName) {
  const STEP = Math.max(700, parseInt(process.env.TEST_STEP_MS || '2400', 10));
  const zzz = (m = STEP) => new Promise((r) => setTimeout(r, m));
  const noopMsg = { message: { extendedTextMessage: { contextInfo: {} } } };
  const nm = senderName || 'SEÑOR';

  const say = async (title, extra = '') => {
    await sock.sendMessage(ownerJid, { text: `🧪 *${title}*\n${extra}`.trim() }).catch(() => {});
  };

  const forwardReply = async (reply) => {
    if (!reply) return;
    if (typeof reply === 'string')
      await sock.sendMessage(ownerJid, { text: reply }).catch(() => {});
    else if (reply.text)
      await sock.sendMessage(ownerJid, { text: reply.text, mentions: reply.mentions }).catch(() => {});
  };

  async function execPrivate(cmd) {
    await say(cmd, '');
    const r = await handleCommand(sock, ownerJid, ownerJid, nm, cmd, null, noopMsg);
    await forwardReply(r);
    await zzz();
  }

  async function execGroupContext(cmd, gJid) {
    await say(`${cmd}`, `_contexto grupo:_ \`${gJid}\``);
    const meta = await sock.groupMetadata(gJid).catch(() => null);
    const r = await handleCommand(sock, gJid, ownerJid, nm, cmd, meta, noopMsg);
    await forwardReply(r);
    await zzz();
  }

  let groupJid = (process.env.GROUP_ID || '').trim();
  if (groupJid && !groupJid.endsWith('@g.us')) {
    const id = groupJid.replace(/\D/g, '');
    groupJid = id ? `${id}@g.us` : '';
  }
  if (!groupJid) {
    try {
      const all = await sock.groupFetchAllParticipating();
      groupJid = Object.keys(all || {})[0] || '';
    } catch (_) {}
  }

  try {
    await say(
      '!TEST — INFRAMUNDO QA',
      [
        `Pausa ~${STEP} ms entre pasos.`,
        `Grupo ref BD: ${groupJid ? `\`${groupJid}\`` : '⚠️ ninguno'}`,
        'No ejecuta mute/ban/kick ni menús !aprobar/!expulsar.',
        'Recomendaciones e info banda pueden tardar ~1 min cada una por APIs.',
      ].join('\n'),
    );

    await say('getSatanResponse (owner)');
    try {
      const dmLine = await getSatanResponse(ownerJid, 'una línea: prueba interna !test funcionando ACK', true);
      await sock.sendMessage(ownerJid, { text: dmLine }).catch(() => {});
    } catch (_) {}
    await zzz();

    await say(
      'satanGroqMessage (muestras)',
      [
        `• admin_denied → ${await satanGroqMessage('admin_denied')}`,
        `• genre_reject → ${await satanGroqMessage('genre_reject')}`,
        `• usage → ${await satanGroqMessage('usage', { usage: '!band [nombre]', example: '!band Celtic Frost' })}`,
      ].join('\n\n'),
    );
    await zzz();

    for (const cmd of ['!ruleset', '!help', '!recomienda trap', '!recomienda doom metal culto europeo']) {
      await execPrivate(cmd);
    }

    if (groupJid) {
      for (const cmd of ['!rank', '!top', '!streak']) await execGroupContext(cmd, groupJid);
    } else {
      await say('rank/top/streak', '⚠️ sin jid de grupo: saltados.');
    }

    await execPrivate('!mute');

    await execPrivate('!meme');

    await say('getBandInfo → Mayhem', '');
    getBandInfo(sock, ownerJid, 'Mayhem').catch(console.error);
    await zzz(6500);

    await say('getAlbumInfo …', '');
    getAlbumInfo(sock, ownerJid, 'De Mysteriis Dom Sathanas de Mayhem').catch(console.error);
    await zzz(6500);

    await say('getLyrics …', '');
    getLyrics(sock, ownerJid, 'Freezing Moon por Mayhem').catch(console.error);
    await zzz(8000);

    await say('sendRecommendations (1 tanda)');
    sendRecommendations(sock, ownerJid, 'grindcore sudamericana').catch(console.error);
    await zzz(14000);

    await say('!trivia facil', 'respondé A/B/C o esperá timeout 30s 💀');
    await startTrivia(sock, ownerJid, 'facil').catch(console.error);
    await zzz(32000);

    await say('!metalquiz', 'tres preguntas aquí — respondé A/B/C ⚔️');
    await startMetalQuiz(sock, ownerJid).catch(console.error);
    await zzz(5000);

    const sched = require('../scheduler');
    const {
      sendOnThisDay,
      sendBattle,
      sendDailyContent,
      sendAlbumDia,
      sendBandaDia,
      sendWeekWinner,
    } = sched;

    await say('scheduler.sendOnThisDay', '');
    await sendOnThisDay(sock, ownerJid).catch((e) => say('→ error', String(e.message)));
    await zzz();

    await say('scheduler.sendDailyContent', '');
    await sendDailyContent(sock, ownerJid).catch((e) => say('→ error', String(e.message)));
    await zzz();

    await say('scheduler.sendAlbumDia', '');
    await sendAlbumDia(sock, ownerJid).catch((e) => say('→ error', String(e.message)));
    await zzz();

    await say('scheduler.sendBandaDia', '');
    await sendBandaDia(sock, ownerJid).catch((e) => say('→ error', String(e.message)));
    await zzz();

    try {
      const gd = await sched.getBuenosDias();
      await sendWithTyping(sock, ownerJid, `☀️ *texto buenos días (\`getBuenosDias\`)*\n${gd}`);
    } catch (_) {}
    await zzz();

    try {
      const { sendMorningStickers } = require('../handlers/stickers');
      await sendMorningStickers(sock, ownerJid);
    } catch (_) {}
    await zzz();

    if (groupJid) {
      await say('scheduler.sendWeekWinner', `\`${groupJid}\``);
      await sendWeekWinner(sock, ownerJid, groupJid).catch(() => {});
      await zzz();
    }

    await say(
      '!battle / sendBattle',
      'Poll nativa puede fallar en algunos chats; hay fallback texto. Timer 30 min ⚠️',
    );
    await sendBattle(sock, ownerJid).catch((e) => say('battle error', String(e.message)));
    await zzz();

    await say('sendGroupsReport', '');
    await sendGroupsReport(sock, ownerJid).catch((e) => say('→ error', String(e.message)));
    await zzz();

    await say('comando !onthisday (mismo día que scheduler arriba)', '');
    await execPrivate('!onthisday');

    await say(
      '!TEST FIN',
      'omitido: menús !aprobar/!kick, mute/ban con mención real, bienvenidas automáticas, \`sendMonthlyTop\` (resetea puntos mensuales).',
    );
  } catch (e) {
    await sock.sendMessage(ownerJid, { text: `☠️ [!test abort] ${e.message}` }).catch(() => {});
  }
}

module.exports = { handleChatMessage, handleCommand, sendRecommendations, sendMeme, getBandInfo, getAlbumInfo, saveMemeFromMsg, getLyrics, handlePendingMenu, sendOwnerPrivateCatalog };
