const Groq = require('groq-sdk');
const https = require('https');
const http = require('http');
const { getUser, getWeeklyRanking, getWeekKey, muteUser, banUser } = require('../db');
const { getLevelName, getLevelEmoji } = require('../scheduler/ranking');
const { startTrivia, startMetalQuiz } = require('./trivia');
const { sendWithTyping } = require('../utils/typing');
const { getAlbumArtworkSafe, getBandImageSafe } = require('../utils/images');

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

async function getUndergroundRecommendations(genre) {
  const groq = getGroq();
  if (!groq) return null;
  const alreadySeen = recentlyRecommended.size > 0
    ? `NUNCA recomiendes estas bandas: ${[...recentlyRecommended].slice(-15).join(', ')}.`
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
  const isDescriptive = genre && !/^[a-záéíóúüñ\s]+$/i.test(genre) || (genre && genre.split(' ').length > 2);
  const searchContext = isDescriptive
    ? `que tengan estas características: ${genre}`
    : `del género ${genre || 'metal extremo'}`;
  const prompt = `Eres un experto en metal extremo con acceso a bandas muy oscuras y desconocidas. Recomienda exactamente 3 bandas de metal ${searchContext} que sean MUY poco conocidas, de culto, con menos de 20,000 oyentes mensuales en total — de Latinoamérica, Noruega, Suecia, Finlandia, Polonia, Brasil, Grecia, México, Colombia, Chile u otros países. Prioriza bandas que solo los fanáticos más dedicados conocen. NUNCA recomiendes estas bandas: ${banned}. ${alreadySeen}

IMPORTANTE: en el campo "why", escribe en español pero NUNCA traduzcas los géneros musicales — siempre en inglés (black metal, death metal, doom metal, thrash metal, etc). No uses la palabra "underground".

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown:
[
  {"band":"nombre","country":"país","album":"álbum recomendado","year":"año","why":"una línea en español de por qué es especial"},
  {"band":"...","country":"...","album":"...","year":"...","why":"..."},
  {"band":"...","country":"...","album":"...","year":"...","why":"..."}
]`;

  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.0,
        max_tokens: 400,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    const raw = result.choices[0]?.message?.content?.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const bands = JSON.parse(jsonMatch[0]);
    bands.forEach(b => recentlyRecommended.add(b.band));
    return bands;
  } catch (e) {
    console.error('[RECOMIENDA]', e.message?.slice(0, 60));
    return null;
  }
}

// Delegamos al módulo centralizado de imágenes
const getAlbumArtworkUrl = (band, album) => getAlbumArtworkSafe(band, album, 8000);
const getBandArtistImageUrl = (band) => getBandImageSafe(band, 8000);

async function getSatanLine(prompt) {
  const groq = getGroq();
  if (!groq) return null;
  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.1, max_tokens: 60,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 5000)),
    ]);
    const line = r.choices[0]?.message?.content?.trim() || null;
    // strip dashes regardless of what groq outputs
    return line ? line.replace(/\s*[—–-]+\s*/g, ' ').trim() : null;
  } catch { return null; }
}

const INTRO_FALLBACK = [
  `👁️ el CIRCLE busca en las sombras ⚔️\nesto es lo que pocos escuchan 🖤`,
  `🩸 hay bandas que merecen ser conocidas\nel CIRCLE las trae hoy ⚔️`,
  `☠️ más allá de lo comercial\nexisten sonidos que muy pocos han oído 🖤`,
];
const OUTRO_FALLBACK = [
  `🤘 ¿las conocen? si tienes más aporta al grupo ☠️`,
  `🖤 el CIRCLE siempre busca más\naporta si conoces otras ⚔️`,
  `☠️ estas son para los que van más allá\n¿alguna la conoces? 🤘`,
];

async function sendRecommendations(sock, jid, genre) {
  const bands = await getUndergroundRecommendations(genre);
  if (!bands?.length) {
    await sendWithTyping(sock, jid, `☠️ no encontré nada esta vez\nintenta de nuevo MORTAL 🖤`);
    return;
  }

  const introExamples = [
    'esto es lo que POCOS escuchan 🖤',
    'el CIRCLE trae lo que el mainstream oculta ☠️',
    'ESCUCHA bien esto 👁️',
    'hay MÚSICA que merece ser conocida ⚔️',
  ];
  const introPrompt = `Eres SATÁN hablando a un grupo de metal. Escribe exactamente 1 frase muy corta (5-8 palabras) en español, oscura y directa, diciendo que vas a mostrar bandas. Imita este estilo: "${introExamples[Math.floor(Math.random()*introExamples.length)]}". Una palabra en MAYÚSCULAS. 1 emoji de: ☠️ ⚔️ 🖤 🤘 👁️. Responde SOLO la frase, nada más.`;
  const intro = await getSatanLine(introPrompt) || INTRO_FALLBACK[Math.floor(Math.random() * INTRO_FALLBACK.length)];
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
  const outroExamples = [
    '¿las conocen? APORTA lo tuyo 🤘',
    'el CIRCLE siempre quiere más ☠️',
    '¿alguna la conoces? APORTA 🖤',
  ];
  const outroPrompt = `Eres SATÁN hablando a un grupo de metal. Escribe exactamente 1 frase muy corta (5-8 palabras) invitando a que aporten más bandas. Imita este estilo: "${outroExamples[Math.floor(Math.random()*outroExamples.length)]}". Una palabra en MAYÚSCULAS. 1 emoji de: 🤘 ☠️ 🖤. Responde SOLO la frase, nada más.`;
  const outro = await getSatanLine(outroPrompt) || OUTRO_FALLBACK[Math.floor(Math.random() * OUTRO_FALLBACK.length)];
  await sendWithTyping(sock, jid, outro);
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
  { triggers: ['reglas', 'rules'], reply: () => `LAS REGLAS ⚔️ del CIRCLE:\n\n⚔️ respeta a tus HERMANOS del metal\n☠️ no links de otros grupos 3 strikes y FUERA\n🤘 los APORTADORES son el alma de esto\n🖤 todo subgénero del metal es bienvenido\n💀 sin spam sin publicidad` },
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
    const captions = [`🤘 meme del CIRCLE ☠️`, `💀 humor del INFRAMUNDO 🤘`, `😈 el CIRCLE se ríe ☠️`, `🖤 la oscuridad también tiene humor 💀`];
    const caption = captions[Math.floor(Math.random() * captions.length)];
    if (meme.buffer) {
      await sock.sendMessage(jid, { image: meme.buffer, caption });
    } else {
      await sock.sendMessage(jid, { image: { url: meme.url }, caption });
    }
  } else {
    const { sendWithTyping } = require('../utils/typing');
    await sendWithTyping(sock, jid, `☠️ los servidores del inframundo fallaron\nintenta de nuevo MORTAL 🖤`);
  }
}

async function handleCommand(sock, jid, senderJid, senderName, text, groupMetadata, msg) {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const command = cmd.toLowerCase();
  const OWNER_NUMBER = '51943605088';
  const isOwner = senderJid && senderJid.includes(OWNER_NUMBER);

  // Extraer mentionedJid con soporte para rawMsg (ephemeral, etc.)
  const rawMsgInner = msg?.message?.ephemeralMessage?.message ||
    msg?.message?.viewOnceMessage?.message ||
    msg?.message;
  const getMentionedJid = () =>
    rawMsgInner?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
    msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

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

  if (command === '!rank' || command === '!rango') {
    const user = getUser(senderJid, jid);
    if (!user) {
      return `⚔️ @${senderName}, aún no tienes aportes registrados. ¡Comparte algo! 🤘`;
    }
    return `${getLevelEmoji(user.level)} RANGO DE @${senderName}\n\n${getLevelName(user.level)}\n⚔️ Puntos totales: ${user.points}\n🦇 Strikes: ${user.strikes}/3`;
  }

  if (command === '!top' || command === '!ranking') {
    const top = getWeeklyRanking(null, jid);
    if (!top.length) return `☠️ Nadie ha aportado esta semana aún. Sean los primeros. 🤘`;
    const medals = ['🥇', '🥈', '🥉'];
    const podium = top.slice(0, 3).map((u, i) =>
      `${medals[i]} *${i + 1}er puesto* ${u.name} ${getLevelEmoji(u.level)}  [ ${u.weekly_points} pts ]`
    ).join('\n');
    const rest = top.slice(3).map((u, i) =>
      `  ${i + 4}. ${u.name} ${getLevelEmoji(u.level)} ${u.weekly_points} pts`
    ).join('\n');
    return `⚔️ RANKING SEMANAL ${getWeekKey()}\n\n${podium}${rest ? '\n\n' + rest : ''}\n\n💀 se reinicia cada lunes ¿dónde estás tú? 🤘`;
  }

  if (command === '!ruleset' || command === '!reglas') {
    return `📜 REGLAS DEL CIRCLE:\n\n⚔️ 1. Respeta a tus hermanos del metal\n🦇 2. No links de otros grupos de WhatsApp 3 strikes y BAN\n☠️ 3. Los APORTADORES son el alma del grupo\n🤘 4. Todo subgénero de metal es bienvenido\n🖤 5. Sin spam sin publicidad\n🔱 6. El bot modera automáticamente no te hagas el vivo`;
  }

  if (command === '!help' || command === '!ayuda' || command === '!comandos') {
    return `👁️ *COMANDOS DEL CIRCLE* ⚔️\n\n` +
      `🎖️ *!rank* — tu rango y puntos actuales\n` +
      `🏆 *!top* — ranking semanal de aportadores\n` +
      `🔥 *!streak* — tu racha de días aportando\n` +
      `🎵 *!band [nombre]* — info + imagen de una banda\n` +
      `💿 *!album [álbum] de [banda]* — portada + info\n` +
      `🩸 *!recomienda [género o descripción]* — 3 bandas de culto\n` +
      `🎤 *!letra [canción] por [artista]* — letra + portada\n` +
      `☠️ *!trivia [facil|medio|dificil]* — pregunta de 30s\n` +
      `📜 *!ruleset* — reglas del CIRCLE\n` +
      `⚡ *!onthisday* — qué pasó hoy en la historia del metal\n\n` +
      `_Admins:_ *!mute @persona [horas]* · *!unmute @persona* · *!ban @persona*\n\n` +
      `🖤 el CIRCLE te observa ⛧`;
  }

  if (command === '!recomienda') {
    const query = args.join(' ') || 'metal extremo';
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
    await startMetalQuiz(sock, jid);
    return null;
  }

  if (command === '!meme') {
    const meme = await getMeme();
    if (meme) {
      const captions = [`🤘 meme del CIRCLE ☠️`, `💀 humor del INFRAMUNDO 🤘`, `😈 el CIRCLE se ríe ☠️`, `🖤 la oscuridad también tiene humor 💀`];
      const caption = captions[Math.floor(Math.random() * captions.length)];
      if (meme.buffer) {
        await sock.sendMessage(jid, { image: meme.buffer, caption });
      } else {
        await sock.sendMessage(jid, { image: { url: meme.url }, caption });
      }
    } else {
      await sendWithTyping(sock, jid, `☠️ los servidores del inframundo fallaron\nintenta de nuevo MORTAL 🖤`);
    }
    return null;
  }

  // --- Comandos de admin ---
  if (command === '!mute') {
    if (!isAdmin) return `☠️ solo los ADMINS pueden usar eso 🔱`;
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) return `⚔️ Uso: !mute @persona [horas]\nEjemplo: !mute @Juan 24`;
    const hours = parseInt(args.find(a => /^\d+$/.test(a))) || 24;
    muteUser(mentionedJid, hours, jid);
    const targetName = mentionedJid.split('@')[0];
    return {
      text: `☠️ @${targetName} silenciado por ${hours} hora${hours !== 1 ? 's' : ''}\nsus mensajes serán eliminados automáticamente ⚔️`,
      mentions: [mentionedJid],
    };
  }

  if (command === '!ban') {
    if (!isAdmin) return `☠️ solo los ADMINS pueden usar eso 🔱`;
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) return `⚔️ Uso: !ban @persona`;
    const targetName = mentionedJid.split('@')[0];
    try {
      await sock.groupParticipantsUpdate(jid, [mentionedJid], 'remove');
    } catch (e) {
      console.error('[BAN]', e.message);
      return `💀 no pude expulsar a @${targetName} ¿soy admin del grupo? ⚔️`;
    }
    return {
      text: `🔱 @${targetName} fue expulsado del CIRCLE\nel inframundo no perdona ☠️`,
      mentions: [mentionedJid],
    };
  }

  if (command === '!unmute') {
    if (!isAdmin) return `☠️ solo los ADMINS pueden usar eso 🔱`;
    const mentionedJid = getMentionedJid();
    if (!mentionedJid) return `⚔️ Uso: !unmute @persona`;
    muteUser(mentionedJid, 0, jid);
    const targetName = mentionedJid.split('@')[0];
    return {
      text: `🖤 @${targetName} ya puede hablar de nuevo en el CIRCLE 🤘`,
      mentions: [mentionedJid],
    };
  }

  if (command === '!band') {
    const band = args.join(' ');
    if (!band) return `⚔️ Uso: !band [nombre de banda]\nEjemplo: !band Mayhem`;
    getBandInfo(sock, jid, band).catch(console.error);
    return null;
  }

  if (command === '!album') {
    const query = args.join(' ');
    if (!query) return `⚔️ Uso: !album [nombre del álbum] de [banda]\nEjemplo: !album Reign in Blood de Slayer\nO solo: !album Reign in Blood`;
    getAlbumInfo(sock, jid, query).catch(console.error);
    return null;
  }

  if (command === '!streak') {
    const user = getUser(senderJid, jid);
    if (!user) return `⚔️ aún no tienes aportes registrados en el CIRCLE 🖤`;
    const streak = user.streak || 0;
    if (streak === 0) return `☠️ @${senderName} tu racha está en CERO\naporta algo hoy y empieza 🖤`;
    if (streak === 1) return `🕯️ @${senderName} llevas 1 día seguido aportando\nno pares ahora ⚔️`;
    if (streak < 5) return `⚔️ @${senderName} llevas *${streak} días* seguidos\nel CIRCLE lo nota 🦇`;
    if (streak < 10) return `💀 @${senderName} *${streak} días* consecutivos\neso es DEDICACIÓN BRUTAL ☠️`;
    return `☠️ @${senderName} *${streak} días* seguidos aportando\nel inframundo te RECONOCE como GUERRERO 🩸⛧`;
  }

  if (command === '!letra') {
    const query = args.join(' ');
    if (!query) return `⚔️ Uso: !letra [canción] por [artista]\nEjemplo: !letra Freezing Moon por Mayhem`;
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

  // --- Owner-only: aprobar/desaprobar grupo (modo comercial) ---
  if (command === '!aprobar' || command === '!approve') {
    if (!isOwner) return null; // silencio si no es owner
    const { approveGroup, endTrial } = require('../db');
    approveGroup(jid);
    endTrial(jid);
    return `🔱 grupo aprobado por el SEÑOR\nel INFRAMUNDO se queda aquí de manera PERMANENTE ☠️`;
  }

  if (command === '!desaprobar' || command === '!unapprove') {
    if (!isOwner) return null;
    const { unapproveGroup } = require('../db');
    unapproveGroup(jid);
    return `⚔️ grupo desaprobado\nel próximo reinicio aplicará período de prueba`;
  }

  // --- Owner-only: reporte de grupos (PRO + TRIAL) enviado al privado ---
  if (command === '!grupos' || command === '!estado' || command === '!status') {
    if (!isOwner) return null;
    sendGroupsReport(sock, senderJid).catch(e => console.error('[GRUPOS]', e.message));
    if (jid !== senderJid) {
      return `🔱 reporte enviado al privado SEÑOR ☠️`;
    }
    return null;
  }

  return null;
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
  try { groups = await sock.groupFetchAllParticipating(); } catch (e) {
    await sock.sendMessage(ownerJid, { text: `⚠️ no pude obtener la lista de grupos: ${e.message}` });
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

  await sock.sendMessage(ownerJid, { text: lines.join('\n') });
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
  await sendWithTyping(sock, jid, `👁️ invocando info de *${band}* ☠️`);

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
    await sendWithTyping(sock, jid, `☠️ no encontré info sobre *${band}* en el inframundo 💀`);
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
  await sendWithTyping(sock, jid, `👁️ invocando info de *${query}* ☠️`);

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
    await sendWithTyping(sock, jid, `☠️ no encontré info sobre *${query}* en el inframundo 💀`);
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
  await sendWithTyping(sock, jid, `👁️ invocando letra de *${query}* ☠️`);

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
    await sendWithTyping(sock, jid, `☠️ no encontré letra de *${song}* en el inframundo 💀\nusa: !letra [canción] por [artista]`);
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

module.exports = { handleChatMessage, handleCommand, sendRecommendations, sendMeme, getBandInfo, getAlbumInfo, saveMemeFromMsg, getLyrics };
