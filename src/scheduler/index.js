const cron = require('node-cron');
const Groq = require('groq-sdk');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { ANNIVERSARIES } = require('../../data/content');
const { buildRankingMessage } = require('./ranking');
const { startMetalQuiz } = require('../commands/trivia');
const {
  storeMessage,
  pollOptionHash,
  handleBattlePollVote,
  tallyBattleVotes,
} = require('./battle-polls');
const { getState, setState, getMonthlyRanking, resetMonthlyPoints, getPreviousWeekWinner, getPreviousWeekKey } = require('../db');
const { sendWithTyping } = require('../utils/typing');
const { getCommandHelpMessage } = require('../handlers/groq-satan-copy');
const { sendWelcomeStickers, sendMorningStickers, getStickerFiles } = require('../handlers/stickers');
const { getAlbumArtworkSafe, getBandImageSafe } = require('../utils/images');
const {
  getDailyAlbum,
  getDailyBand,
  getDailyCuriosity,
  getDailySong,
  getDailyOnThisDay,
} = require('./daily-groq-content');
const { groqWithRetry, hasGroqKey } = require('../utils/groq-retry');
const { normalizeGroqText, looksLikeJsonLeak } = require('../utils/groq-json');

// Estado global de battles activos por grupo
const activeBattles = new Map();

const GROUP_ID = process.env.GROUP_ID;

/** Modo menos invasivo (~50% mensajes automáticos vs cron anterior). */
const SCHED = {
  activeFrom: 9,   // no nudges antes de las 9
  activeUntil: 22, // no nudges después de las 22
  inactivityHours: 8,
  inactivityCron: '0 */2 * * *', // revisar cada 2h (antes cada 1h)
};

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

async function generateBuenosDias() {
  if (!hasGroqKey()) return null;
  const groq = getGroq();
  if (!groq) return null;
  const estilos = [
    'oscuro y amenazante como SATÁN despertando',
    'épico como un guerrero metal saludando al amanecer',
    'irónico y sarcástico sobre que el día comienza',
    'misterioso y poético sobre las sombras de la noche que se van',
    'brutal y directo como un riff de death metal',
  ];
  const estilo = estilos[Math.floor(Math.random() * estilos.length)];

  return groqWithRetry(async () => {
    const pool = ['☠️','⚔️','🦇','💀','👁️','🩸','⛧','🤘','🔱','🖤','🔥'];
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).join(' ');
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content:
          `Eres SATÁN saludando a un grupo de metaleros en WhatsApp. Escribe un saludo de buenos días en español, estilo ${estilo}. Máximo 2 líneas cortas. Pon PALABRAS COMPLETAS en mayúsculas para énfasis, el resto en minúsculas (NUNCA alternes letras dentro de una palabra). USA EXACTAMENTE ESTOS EMOJIS y ningún otro: ${chosen} distribuidos en el texto. Sin guiones, sin preguntas al final, sin presentarte. Solo el mensaje.` }],
        temperature: 1.2,
        max_tokens: 80,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const msg = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    if (!msg || msg.length < 8) throw new Error('respuesta vacía');
    return msg;
  }, { attempts: 4, label: 'BUENOS-DIAS' });
}

// --- Helpers --- (Groq + historial persistente, una pieza por fecha Perú) ---
async function sendAlbumDia(sock, jid) {
  const a = await getDailyAlbum();
  if (!a) return;

  const imgUrl = await getAlbumArtworkSafe(a.band, a.title, 7000);
  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.band + ' ' + a.title + ' full album')}`;
  const caption =
    `el ÁLBUM 🔱 de hoy:\n\n*${a.title}* ${a.band}${a.year ? ` (${a.year})` : ''}\nGénero 🖤 ${a.genre || 'metal'}\n\n${a.question || '¿Lo has escuchado?'} ⚔️\n\n🔗 ${ytLink}`;

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

// --- Banda del día ---
async function sendBandaDia(sock, jid) {
  const b = await getDailyBand();
  if (!b) return;

  const imgUrl = await getBandImageSafe(b.name, 7000);
  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(b.name + ' metal')}`;
  const spLink = `https://open.spotify.com/search/${encodeURIComponent(b.name)}`;
  const albumsLine = (b.albums || []).slice(0, 3).join(', ');
  const caption =
    `la BANDA ☠️ del día:\n\n*${b.name}* ${b.country || ''}\nGénero 💀 ${b.genre || 'metal'}${b.formed ? ` | Formada en ${b.formed}` : ''}\n` +
    (albumsLine ? `Álbumes clave 🦇 ${albumsLine}\n\n` : '\n') +
    (b.fact ? `_${b.fact}_\n\n` : '') +
    `🔗 YouTube: ${ytLink}\n🎧 Spotify: ${spLink}`;

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

async function buildCuriosityMessage() {
  const c = await getDailyCuriosity();
  if (!c?.text) return null;
  return `CURIOSIDAD 👁️ del metal:\n\n_${c.text}_\n\n¿lo sabías? ⚔️ deja tu reacción 🤘`;
}

async function buildSongMessage() {
  const s = await getDailySong();
  if (!s?.title || !s?.band) return null;
  return `la CANCIÓN ⛧ del día:\n\n*${s.title}* ${s.band}\n\n🩸 _${s.fact || ''}_\n\n¿la conocías? ☠️`;
}

// Envía el contenido diario según el día de la semana (zona horaria Perú)
async function sendDailyContent(sock, jid) {
  const peruDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const day = peruDate.getDay();
  console.log(`[DAILY] día=${day} (0=dom 1=lun ... 6=sab) jid=${jid}`);
  switch (day) {
    case 1: return sendBandaDia(sock, jid); // Lunes: banda (también va ranking 9:05)
    case 2: return sendAlbumDia(sock, jid);
    case 3: {
      const msg = await buildCuriosityMessage();
      if (msg) return sendWithTyping(sock, jid, msg);
      return;
    }
    case 4: return sendBandaDia(sock, jid);
    case 5: return sendAlbumDia(sock, jid);
    case 6: {
      const msg = await buildSongMessage();
      if (msg) return sendWithTyping(sock, jid, msg);
      return;
    }
    case 0: {
      const msg = await buildCuriosityMessage();
      if (msg) return sendWithTyping(sock, jid, msg);
      return;
    }
    default: return sendBandaDia(sock, jid);
  }
}

// Para el endpoint de test HTTP
async function getDailyContent(sock, jid) {
  return sendDailyContent(sock, jid);
}

// Para el endpoint de test HTTP: solo álbum del día
async function sendAlbumDiaTest(sock, jid) {
  return sendAlbumDia(sock, jid);
}

// Para el endpoint de test HTTP: solo banda del día
async function sendBandaDiaTest(sock, jid) {
  return sendBandaDia(sock, jid);
}

async function getBuenosDias() {
  return generateBuenosDias();
}

const INACTIVITY_THEMES = [
  'pide top 3 de bandas black metal',
  'lanza debate OVERRATED vs UNDERRATED con una banda',
  'pide el último disco que escucharon completo',
  'pregunta qué subgénero del metal es el más brutal',
  'pregunta cuál es el mejor riff de la historia del metal',
];

async function generateInactivityMessage() {
  if (!hasGroqKey()) return null;
  const groq = getGroq();
  if (!groq) return null;
  const theme = INACTIVITY_THEMES[Math.floor(Math.random() * INACTIVITY_THEMES.length)];

  return groqWithRetry(async () => {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content:
          `Eres SATÁN despertando un grupo de WhatsApp de metal que lleva horas en silencio. Tema del mensaje: ${theme}.
Escribe 2 líneas cortas en español, tono oscuro y directo. PALABRAS COMPLETAS en mayúsculas para énfasis. Emojis de: ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤. Sin guiones. Solo el mensaje.` }],
        temperature: 1.1,
        max_tokens: 100,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const msg = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    if (!msg || msg.length < 12) throw new Error('respuesta vacía');
    return msg;
  }, { attempts: 4, label: 'INACTIVITY' });
}

async function getInactivityMessage() {
  return generateInactivityMessage();
}

function getPeruHour() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }),
    10
  );
}

function isActiveHour() {
  const h = getPeruHour();
  return h >= SCHED.activeFrom && h <= SCHED.activeUntil;
}

function isWeekdayPeru() {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay();
  return day >= 1 && day <= 5;
}

function updateLastMessage() {
  lastMessageTime = Date.now();
}

// --- On This Day + Aniversarios de álbumes ---
function getTodayMMDD() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function checkAnniversaries() {
  const today = getTodayMMDD();
  const currentYear = new Date().getFullYear();
  return ANNIVERSARIES.filter(a => a.date === today).map(a => ({
    ...a,
    years: currentYear - a.year,
  }));
}

async function sendOnThisDay(sock, jid) {
  const today = getTodayMMDD();
  const [mm, dd] = today.split('-');

  // Aniversarios fijos del calendario (solo si toca hoy)
  const anniversaries = checkAnniversaries();
  if (anniversaries.length > 0) {
    for (const a of anniversaries) {
      const imgUrl = await getAlbumArtworkSafe(a.band, a.title, 6000);
      const yearsText = a.years === 1 ? '1 año' : `${a.years} años`;
      const caption = `☠️ HOY hace ${yearsText}\n\n*${a.title}* de *${a.band}* salió un ${dd}/${mm}/${a.year}\n\nuno de los discos que MOLDEÓ el metal tal como lo conocemos 🩸`;
      try {
        if (imgUrl) {
          await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
        } else {
          await sendWithTyping(sock, jid, caption);
        }
      } catch { await sendWithTyping(sock, jid, caption); }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const result = await getDailyOnThisDay(mm, dd);
  const body = result?.text ? normalizeGroqText(result.text) : '';
  if (body && body.length >= 15 && !looksLikeJsonLeak(body)) {
    await new Promise(r => setTimeout(r, 1500));
    const header = `👁️ UN DÍA COMO HOY en el metal:\n\n${body}`;

    let artistImg = null;
    if (result.artist) {
      artistImg = await Promise.race([
        getBandImageSafe(result.artist, 6000),
        new Promise(r => setTimeout(() => r(null), 6000)),
      ]);
    }

    try {
      if (artistImg) {
        await sock.sendMessage(jid, { image: { url: artistImg }, caption: header });
      } else {
        await sendWithTyping(sock, jid, header);
      }
    } catch { await sendWithTyping(sock, jid, header); }
  }
}

// --- Aportador de la semana (se anuncia el lunes antes del ranking) ---
async function groqSatanLine(prompt, label, maxTokens = 80) {
  if (!hasGroqKey()) return null;
  const groq = getGroq();
  if (!groq) return null;
  return groqWithRetry(async () => {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.1,
        max_tokens: maxTokens,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const line = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    if (!line || line.length < 4) throw new Error('respuesta vacía');
    return line;
  }, { attempts: 4, label });
}

async function sendWeekWinner(sock, jid, groupId) {
  const winner = getPreviousWeekWinner(groupId);
  if (!winner) return;
  const msg = await groqSatanLine(
    `Eres SATÁN. El guerrero @${winner.name} fue el MAYOR APORTADOR de la semana pasada con ${winner.weekly_points} puntos en un grupo de metal. Escríbele un reconocimiento épico y oscuro, máximo 2 líneas, PALABRAS COMPLETAS en mayúsculas, sin guiones, emojis de: ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤. Solo el mensaje.`,
    'WEEK-WINNER'
  );
  if (!msg) {
    console.warn('[WEEK-WINNER] Groq no respondió — omitiendo anuncio');
    return;
  }
  await sendWithTyping(sock, jid, msg);
}

// --- Top mensual (día 1 de cada mes) ---
async function sendMonthlyTop(sock, jid, groupId) {
  const top = getMonthlyRanking(groupId);
  if (!top?.length) return;
  const medals = ['🥇', '🥈', '🥉'];
  const podium = top.slice(0, 3).map((u, i) =>
    `${medals[i] || '  🔱'} ${u.name} ${u.monthly_points} pts`
  ).join('\n');
  const intro = await groqSatanLine(
    `Eres SATÁN cerrando el mes en un grupo de metal. Escribe 1 línea dramática anunciando los campeones del mes. PALABRAS COMPLETAS en mayúsculas, sin guiones, 1-2 emojis de: ☠️ ⚔️ 💀 🩸 🔱. Solo la línea.`,
    'MONTHLY-TOP',
    60
  );
  if (!intro) {
    console.warn('[MONTHLY-TOP] Groq no respondió — omitiendo anuncio');
    return;
  }
  await sendWithTyping(sock, jid, `${intro}\n\n⚔️ TOP MENSUAL:\n\n${podium}\n\n💀 el marcador se reinicia 🖤`);
  resetMonthlyPoints(groupId);
}

// --- Battle sábado/domingo 2PM ---
const BATTLE_POOL = [
  'Mayhem', 'Darkthrone', 'Burzum', 'Emperor', 'Immortal', 'Gorgoroth',
  'Morbid Angel', 'Death', 'Cannibal Corpse', 'Obituary', 'Deicide',
  'Slayer', 'Metallica', 'Megadeth', 'Anthrax', 'Pantera',
  'Iron Maiden', 'Black Sabbath', 'Judas Priest',
  'Sepultura', 'Opeth', 'Meshuggah', 'Gojira', 'Tool',
];

function optionHash(name) {
  return pollOptionHash(name);
}

async function sendBattle(sock, jid) {
  if (activeBattles.has(jid)) return;

  const shuffled = [...BATTLE_POOL].sort(() => Math.random() - 0.5);
  const band1 = shuffled[0];
  const band2 = shuffled[1];

  const opt1 = `⚔️ ${band1}`;
  const opt2 = `🩸 ${band2}`;

  const intro = await groqSatanLine(
    `Eres SATÁN lanzando una batalla épica entre "${band1}" y "${band2}" ante un grupo de metaleros. Escribe 2 líneas dramáticas y oscuras anunciando el enfrentamiento. PALABRAS COMPLETAS en mayúsculas, sin guiones. Emojis de: ☠️ ⚔️ 💀 🩸 🔱 🦇 👁️ ⛧. Solo las 2 líneas, nada más.`,
    'BATTLE-INTRO'
  );
  if (!intro) {
    console.warn('[BATTLE] Groq no respondió intro — omitiendo battle');
    return;
  }

  const hash1 = optionHash(opt1);
  const hash2 = optionHash(opt2);
  const state = {
    band1, band2, opt1, opt2, hash1, hash2,
    votes: {},
    pollMsgKey: null,
    pollMsg: null,
    endTime: Date.now() + 30 * 60 * 1000,
  };
  activeBattles.set(jid, state);

  await sendWithTyping(sock, jid, intro);
  await new Promise(r => setTimeout(r, 1000));

  // Encuesta nativa de WhatsApp
  try {
    const sent = await sock.sendMessage(jid, {
      poll: {
        name: `🏆 BATTLE DEL CIRCLE ☠️`,
        values: [opt1, opt2],
        selectableCount: 1,
      }
    });
    state.pollMsgKey = sent?.key || null;
    if (sent) {
      state.pollMsg = sent;
      storeMessage(sent);
    }
  } catch (e) {
    console.error('[BATTLE POLL]', e.message);
    // fallback texto
    await sendWithTyping(sock, jid, `*${band1}* vs *${band2}* ¿quién domina? ⚔️`);
  }

  // Resultado en 30 minutos
  setTimeout(async () => {
    const battle = activeBattles.get(jid);
    if (!battle) return;
    activeBattles.delete(jid);

    const meId = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
    const { v1, v2, total } = tallyBattleVotes(battle, meId);

    if (total === 0) {
      await sendWithTyping(sock, jid, `☠️ el CIRCLE no votó\neste BATTLE queda sin resolución 💀`);
      return;
    }

    const winner = v1 >= v2 ? band1 : band2;
    const pct1 = Math.round((v1 / total) * 100);
    const pct2 = 100 - pct1;
    const winPct = Math.max(pct1, pct2);

    const result = await groqSatanLine(
      `Eres SATÁN anunciando que "${winner}" GANÓ el battle del CIRCLE con ${winPct}% de los votos (${total} guerreros votaron). 1-2 líneas brutales y dramáticas. PALABRAS COMPLETAS en mayúsculas, sin guiones. Emojis de: ☠️ ⚔️ 💀 🩸 🔱 🤘. Solo el mensaje.`,
      'BATTLE-RESULT'
    );
    if (!result) {
      console.warn('[BATTLE] Groq no respondió resultado — omitiendo cierre');
      return;
    }

    const bar1 = '▓'.repeat(Math.round(pct1 / 10)) + '░'.repeat(10 - Math.round(pct1 / 10));
    const bar2 = '▓'.repeat(Math.round(pct2 / 10)) + '░'.repeat(10 - Math.round(pct2 / 10));
    await sendWithTyping(sock, jid,
      `🏆 *RESULTADO del BATTLE* ☠️\n\n⚔️ *${band1}*\n${bar1} ${pct1}% (${v1} voto${v1 !== 1 ? 's' : ''})\n\n🩸 *${band2}*\n${bar2} ${pct2}% (${v2} voto${v2 !== 1 ? 's' : ''})\n\n${result}`
    );
  }, 30 * 60 * 1000);
}

// Registrar voto (legacy messages.update — hash Baileys binario, no hex)
function registerPollVote(jid, voterJid, selectedHash) {
  const battle = activeBattles.get(jid);
  if (!battle) return;
  if (Date.now() > battle.endTime) return;
  const h1 = pollOptionHash(battle.opt1);
  const h2 = pollOptionHash(battle.opt2);
  const hash = typeof selectedHash === 'string'
    ? selectedHash
    : Buffer.from(selectedHash).toString();
  if (hash === h1) battle.votes[voterJid] = 'band1';
  else if (hash === h2) battle.votes[voterJid] = 'band2';
}

function onBattlePollVote(sock, msg) {
  return handleBattlePollVote(sock, msg, activeBattles);
}

function getBattlePollKey(jid) {
  return activeBattles.get(jid)?.pollMsgKey || null;
}

// Procesar voto de battle por texto (fallback)
function registerBattleVote(jid, voterJid, vote) {
  const battle = activeBattles.get(jid);
  if (!battle) return false;
  if (Date.now() > battle.endTime) return false;
  if (vote !== '1' && vote !== '2') return false;
  battle.votes[voterJid] = vote === '1' ? 'band1' : 'band2';
  return true;
}

function hasBattle(jid) {
  return activeBattles.has(jid);
}

// --- Recordatorio de comandos: mismo contenido que !help ---
// --- Setup de todos los cron jobs ---
// Cache de grupos activos: se refresca al conectar y se mantiene en memoria
let cachedGroups = [];
function setCachedGroups(arr) { cachedGroups = arr; }
function getCachedGroups() { return cachedGroups.slice(); }

// Obtiene todos los grupos donde el bot está activo (con cache + fallback robusto)
async function getActiveGroups(sock) {
  try {
    const groups = await Promise.race([
      sock.groupFetchAllParticipating(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('fetch_timeout')), 15000)),
    ]);
    const ids = Object.keys(groups);
    if (ids.length) {
      cachedGroups = ids;
      return ids;
    }
  } catch (e) {
    console.error('[SCHEDULER] groupFetchAllParticipating falló:', e.message);
  }
  // Fallback: cache previo
  if (cachedGroups.length) {
    console.log(`[SCHEDULER] usando cache de ${cachedGroups.length} grupos`);
    return cachedGroups.slice();
  }
  // Último recurso: GROUP_ID del env
  return GROUP_ID ? [GROUP_ID] : [];
}

// Ejecuta una tarea en todos los grupos activos con un pequeño delay entre cada uno
async function forEachGroup(sock, fn, delayMs = 1500, label = 'job') {
  const groups = await getActiveGroups(sock);
  console.log(`[CRON ${label}] disparando en ${groups.length} grupo(s)`);
  if (!groups.length) {
    console.error(`[CRON ${label}] NO HAY GRUPOS — verifica conexión`);
    return;
  }
  for (const gid of groups) {
    try {
      await fn(gid);
      await new Promise(r => setTimeout(r, delayMs));
    } catch (err) {
      console.error(`[CRON ${label}] error en ${gid}:`, err.message);
    }
  }
}

// Acepta un sock directo o un objeto { getSock: () => sock }.
// El getter permite que los crons sigan funcionando aunque el sock cambie por reconexión.
function setupScheduler(arg) {
  const getSock = typeof arg?.getSock === 'function' ? arg.getSock : () => arg;
  const safe = (fn) => async () => {
    try {
      const sock = getSock();
      if (!sock) { console.error('[CRON] no hay sock activo'); return; }
      await fn(sock);
    } catch (e) {
      console.error('[CRON-ERR]', e.message);
    }
  };

  // Pre-cargar lista de grupos
  (async () => {
    const sock = getSock();
    if (sock) {
      const g = await getActiveGroups(sock);
      console.log(`[SCHEDULER] grupos en cache: ${g.length}`);
    }
  })();

  // Mañana 7:00 — Lun-Vie buenos días; On This Day Lun/Mié/Vie (alternado, no diario)
  cron.schedule('0 7 * * *', safe(async (sock) => {
    const peruDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay();
    const sendOnThisDayToday = [1, 3, 5].includes(peruDay); // lun, mié, vie

    if (isWeekdayPeru()) {
      const msg = await getBuenosDias();
      if (msg) {
        await forEachGroup(sock, async (gid) => {
          await sendWithTyping(sock, gid, msg);
          if (getStickerFiles('buenos_dias').length > 0) {
            await new Promise(r => setTimeout(r, 1000));
            await sendMorningStickers(sock, gid);
          }
        }, 1500, 'buenos-dias');
      } else {
        console.warn('[CRON buenos-dias] Groq no respondió — omitiendo');
      }
    }

    if (sendOnThisDayToday) {
      await new Promise(r => setTimeout(r, 2000));
      await forEachGroup(sock, async (gid) => sendOnThisDay(sock, gid), 1500, 'onthisday');
    }
  }), { timezone: 'America/Lima' });

  // Ranking lunes 9:05 AM — podio de la semana PASADA (antes de que cuente la nueva)
  cron.schedule('5 9 * * 1', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => {
      const prevWeek = getPreviousWeekKey();
      await sendWeekWinner(sock, gid, gid);
      await new Promise(r => setTimeout(r, 3000));
      const msg = buildRankingMessage(gid, prevWeek);
      if (msg) await sendWithTyping(sock, gid, msg);
    }, 2000, 'ranking-lunes');
  }), { timezone: 'America/Lima' });

  // Top mensual día 1 9AM
  cron.schedule('0 9 1 * *', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => sendMonthlyTop(sock, gid, gid), 1500, 'top-mensual');
  }), { timezone: 'America/Lima' });

  // Battle sábado 2PM (solo 1 día; antes sáb+dom)
  cron.schedule('0 14 * * 6', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => sendBattle(sock, gid), 1500, 'battle');
  }), { timezone: 'America/Lima' });

  // Contenido diario 7PM (1 slot; antes 9AM/1PM/7PM)
  cron.schedule('0 19 * * *', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => sendDailyContent(sock, gid), 1500, 'contenido-7pm');
  }), { timezone: 'America/Lima' });

  // Metal Quiz viernes 7:30PM (1 slot; antes Lun/Mié/Vie × 2)
  cron.schedule('30 19 * * 5', safe(async (sock) => {
    const diffs = ['facil', 'medio', 'dificil'];
    const difficulty = diffs[Math.floor(Math.random() * diffs.length)];
    await forEachGroup(sock, async (gid) => startMetalQuiz(sock, gid, { forceReplace: true, difficulty }), 1500, 'quiz-viernes');
  }), { timezone: 'America/Lima' });

  // Inactividad: cada 2h, umbral 8h, ventana 9–22
  cron.schedule(SCHED.inactivityCron, safe(async (sock) => {
    if (!isActiveHour()) return;
    const horasSinMensaje = (Date.now() - lastMessageTime) / (1000 * 60 * 60);
    if (horasSinMensaje >= SCHED.inactivityHours) {
      const msg = await getInactivityMessage();
      if (msg) {
        await forEachGroup(sock, async (gid) => sendWithTyping(sock, gid, msg), 1500, 'inactividad');
        lastMessageTime = Date.now();
      } else {
        console.warn('[CRON inactividad] Groq no respondió — omitiendo');
      }
    }
  }), { timezone: 'America/Lima' });

  // Recordatorio comandos 12:00 (1×/día; antes cada 6h)
  cron.schedule('0 12 * * *', safe(async (sock) => {
    if (!isActiveHour()) return;
    const msg = await getCommandHelpMessage();
    await forEachGroup(sock, async (gid) => sendWithTyping(sock, gid, msg), 1500, 'cmd-reminder');
  }), { timezone: 'America/Lima' });

  console.log('\x1b[1;32m✔  Scheduler activo (modo ~50%) — mañana 7AM Lun-Vie · onthisday Lun/Mié/Vie · contenido 7PM · quiz Vie 7:30PM · battle Sáb 2PM · ranking Lun 9:05 · inactividad 8h/2h · comandos 12PM\x1b[0m');
}

module.exports = {
  setupScheduler, updateLastMessage, getBuenosDias,
  sendDailyContent, sendAlbumDia, sendBandaDia,
  sendOnThisDay, sendBattle, sendWeekWinner, sendMonthlyTop,
  registerBattleVote, registerPollVote, onBattlePollVote, getBattlePollKey, hasBattle,
  // compatibilidad hacia atrás con index.js HTTP endpoints
  getDailyContent, buildAlbumMessage: sendAlbumDiaTest, buildBandMessage: sendBandaDiaTest,
};
