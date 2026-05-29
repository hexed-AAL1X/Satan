const cron = require('node-cron');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const { ANNIVERSARIES } = require('../../data/content');
const { buildRankingMessage } = require('./ranking');
const { startMetalQuiz } = require('../commands/trivia');
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

// Estado global de battles activos por grupo
const activeBattles = new Map();

const GROUP_ID = process.env.GROUP_ID;

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

async function generateBuenosDias() {
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
  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: (() => {
          const pool = ['☠️','⚔️','🦇','💀','👁️','🩸','⛧','🤘','🔱','🖤','🔥'];
          const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).join(' ');
          return `Eres SATÁN saludando a un grupo de metaleros en WhatsApp. Escribe un saludo de buenos días en español, estilo ${estilo}. Máximo 2 líneas cortas. Pon PALABRAS COMPLETAS en mayúsculas para énfasis, el resto en minúsculas (NUNCA alternes letras dentro de una palabra). USA EXACTAMENTE ESTOS EMOJIS y ningún otro: ${chosen} distribuidos en el texto. Sin guiones, sin preguntas al final, sin presentarte. Solo el mensaje.`;
        })() }],
        temperature: 1.2,
        max_tokens: 80,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    return r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '') || null;
  } catch { return null; }
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
  return `CURIOSIDAD 👁️ del metal:\n\n_${c?.text || 'el inframundo guarda secretos'}_\n\n¿lo sabías? ⚔️ deja tu reacción 🤘`;
}

async function buildSongMessage() {
  const s = await getDailySong();
  return `la CANCIÓN ⛧ del día:\n\n*${s?.title || '?'}* ${s?.band || ''}\n\n🩸 _${s?.fact || ''}_\n\n¿la conocías? ☠️`;
}

// Envía el contenido diario según el día de la semana (zona horaria Perú)
async function sendDailyContent(sock, jid) {
  const peruDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const day = peruDate.getDay();
  console.log(`[DAILY] día=${day} (0=dom 1=lun ... 6=sab) jid=${jid}`);
  switch (day) {
    case 1: return sendBandaDia(sock, jid); // Lunes: banda (también va ranking 9:05)
    case 2: return sendAlbumDia(sock, jid);
    case 3: return sendWithTyping(sock, jid, await buildCuriosityMessage());
    case 4: return sendBandaDia(sock, jid);
    case 5: return sendAlbumDia(sock, jid);
    case 6: return sendWithTyping(sock, jid, await buildSongMessage());
    case 0: return sendWithTyping(sock, jid, await buildCuriosityMessage());
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

// --- Buenos días (fallback por si Groq falla) ---
const BUENOS_DIAS_FALLBACK = [
  `DESPIERTEN ☠️ el inframundo no duerme\nHOY es un nuevo día para el METAL 🤘`,
  `el SOL 🩸 sale pero el metal no para\nBUENOS DÍAS hermanos del CIRCLE ⚔️ 🖤`,
  `AMANECE 👁️ y las sombras se retiran\npero SATÁN 💀 sigue aquí buenos días MORTALES ⛧`,
  `otro día 🦇 para el CIRCLE negro\nDESPIERTEN con algo BRUTAL ☠️`,
  `BUENOS DÍAS desde las sombras 👁️\nel inframundo abre sus puertas con el alba ☠️ 🖤`,
];

async function getBuenosDias() {
  const groqMsg = await generateBuenosDias();
  if (groqMsg) return groqMsg;
  const idx = Math.floor(Math.random() * BUENOS_DIAS_FALLBACK.length);
  return BUENOS_DIAS_FALLBACK[idx];
}

// --- Detector de inactividad ---
let lastMessageTime = Date.now();

const INACTIVITY_PROMPTS = [
  `el SILENCIO ☠️ es el enemigo del CIRCLE\n¿cuál es tu top 3 de bandas black metal? 🦇 responde o el grupo muere 💀`,
  `llevan horas sin hablar 👁️\n¿OVERRATED o UNDERRATED? 🔱 digan una banda y el grupo responde ⚔️`,
  `el fuego 🩸 se apaga\ndigan el ÚLTIMO disco que escucharon completo ☠️ sin excusas 🖤`,
  `SEÑALES DE VIDA 💀 necesarias\n¿qué subgénero del metal te parece el más BRUTAL? argumenten ⛧ 🦇`,
  `nadie habla 🔱 y eso no está bien\n¿cuál es el MEJOR riff de la historia del metal? ⚔️ defiendan su respuesta ☠️`,
];

function getInactivityMessage() {
  const lastIdx = parseInt(getState('last_inactivity_idx') || '-1');
  const candidates = INACTIVITY_PROMPTS.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  setState('last_inactivity_idx', idx);
  return INACTIVITY_PROMPTS[idx];
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
  if (result?.text) {
    await new Promise(r => setTimeout(r, 1500));
    const header = `👁️ UN DÍA COMO HOY en el metal:\n\n${result.text}`;

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
async function sendWeekWinner(sock, jid, groupId) {
  const winner = getPreviousWeekWinner(groupId);
  if (!winner) return;
  const groq = getGroq();
  let msg = null;
  if (groq) {
    try {
      const r = await Promise.race([
        groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content:
            `Eres SATÁN. El guerrero @${winner.name} fue el MAYOR APORTADOR de la semana pasada con ${winner.weekly_points} puntos en un grupo de metal. Escríbele un reconocimiento épico y oscuro, máximo 2 líneas, PALABRAS COMPLETAS en mayúsculas, sin guiones, emojis de: ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤. Solo el mensaje.` }],
          temperature: 1.1, max_tokens: 80,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 6000)),
      ]);
      msg = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    } catch {}
  }
  if (!msg) msg = `🏆 @${winner.name} fue el GUERRERO de la semana\n${winner.weekly_points} puntos 👑 el CIRCLE lo recuerda ☠️`;
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
  const groq = getGroq();
  let intro = null;
  if (groq) {
    try {
      const r = await Promise.race([
        groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content:
            `Eres SATÁN cerrando el mes en un grupo de metal. Escribe 1 línea dramática anunciando los campeones del mes. PALABRAS COMPLETAS en mayúsculas, sin guiones, 1-2 emojis de: ☠️ ⚔️ 💀 🩸 🔱. Solo la línea.` }],
          temperature: 1.1, max_tokens: 60,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 5000)),
      ]);
      intro = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    } catch {}
  }
  if (!intro) intro = `☠️ el MES termina y el CIRCLE tiene sus GUERREROS`;
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
  return crypto.createHash('sha256').update(name, 'utf8').digest();
}

async function sendBattle(sock, jid) {
  if (activeBattles.has(jid)) return;

  const shuffled = [...BATTLE_POOL].sort(() => Math.random() - 0.5);
  const band1 = shuffled[0];
  const band2 = shuffled[1];

  const opt1 = `⚔️ ${band1}`;
  const opt2 = `🩸 ${band2}`;

  const groq = getGroq();
  let intro = null;
  if (groq) {
    try {
      const r = await Promise.race([
        groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content:
            `Eres SATÁN lanzando una batalla épica entre "${band1}" y "${band2}" ante un grupo de metaleros. Escribe 2 líneas dramáticas y oscuras anunciando el enfrentamiento. PALABRAS COMPLETAS en mayúsculas, sin guiones. Emojis de: ☠️ ⚔️ 💀 🩸 🔱 🦇 👁️ ⛧. Solo las 2 líneas, nada más.` }],
          temperature: 1.1, max_tokens: 80,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 6000)),
      ]);
      intro = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    } catch {}
  }
  if (!intro) intro = `⚔️ EL INFRAMUNDO lanza su BATTLE semanal\n☠️ dos titanes del metal se enfrentan HOY`;

  const hash1 = optionHash(opt1);
  const hash2 = optionHash(opt2);
  const state = {
    band1, band2, opt1, opt2, hash1, hash2,
    votes: {}, // voterJid → 'band1' | 'band2'
    pollMsgKey: null,
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

    const v1 = Object.values(battle.votes).filter(v => v === 'band1').length;
    const v2 = Object.values(battle.votes).filter(v => v === 'band2').length;
    const total = v1 + v2;

    if (total === 0) {
      await sendWithTyping(sock, jid, `☠️ el CIRCLE no votó\neste BATTLE queda sin resolución 💀`);
      return;
    }

    const winner = v1 >= v2 ? band1 : band2;
    const pct1 = Math.round((v1 / total) * 100);
    const pct2 = 100 - pct1;

    const groq2 = getGroq();
    let result = null;
    if (groq2) {
      try {
        const r = await Promise.race([
          groq2.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content:
              `Eres SATÁN anunciando que "${winner}" GANÓ el battle del CIRCLE con ${Math.max(pct1,pct2)}% de los votos. 1-2 líneas brutales y dramáticas. PALABRAS COMPLETAS en mayúsculas, sin guiones. Emojis de: ☠️ ⚔️ 💀 🩸 🔱 🤘. Solo el mensaje.` }],
            temperature: 1.1, max_tokens: 80,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 5000)),
        ]);
        result = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
      } catch {}
    }
    if (!result) result = `⚔️ *${winner}* DOMINA el CIRCLE\nel inframundo ha DECIDIDO ☠️`;

    const bar1 = '▓'.repeat(Math.round(pct1 / 10)) + '░'.repeat(10 - Math.round(pct1 / 10));
    const bar2 = '▓'.repeat(Math.round(pct2 / 10)) + '░'.repeat(10 - Math.round(pct2 / 10));
    await sendWithTyping(sock, jid,
      `🏆 *RESULTADO del BATTLE* ☠️\n\n⚔️ *${band1}*\n${bar1} ${pct1}%\n\n🩸 *${band2}*\n${bar2} ${pct2}%\n\n${result}`
    );
  }, 30 * 60 * 1000);
}

// Registrar voto desde poll update — recibe hex del hash SHA-256 de la opción seleccionada
function registerPollVote(jid, voterJid, selectedHex) {
  const battle = activeBattles.get(jid);
  if (!battle) return;
  if (Date.now() > battle.endTime) return;
  const h1 = battle.hash1.toString('hex');
  const h2 = battle.hash2.toString('hex');
  if (selectedHex === h1) battle.votes[voterJid] = 'band1';
  else if (selectedHex === h2) battle.votes[voterJid] = 'band2';
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

  // Buenos días 5:00 AM
  cron.schedule('0 5 * * *', safe(async (sock) => {
    const msg = await getBuenosDias();
    await forEachGroup(sock, async (gid) => {
      await sendWithTyping(sock, gid, msg);
      if (getStickerFiles('buenos_dias').length > 0) {
        await new Promise(r => setTimeout(r, 1000));
        await sendMorningStickers(sock, gid);
      }
    }, 1500, 'buenos-dias');
  }), { timezone: 'America/Lima' });

  // On This Day 7AM
  cron.schedule('0 7 * * *', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => sendOnThisDay(sock, gid), 1500, 'onthisday');
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

  // Battle sáb/dom 2PM
  cron.schedule('0 14 * * 6,0', safe(async (sock) => {
    await forEachGroup(sock, async (gid) => sendBattle(sock, gid), 1500, 'battle');
  }), { timezone: 'America/Lima' });

  // Contenido diario 9AM/1PM/7PM
  ['0 9 * * *', '0 13 * * *', '0 19 * * *'].forEach((cronExpr, i) => {
    const labels = ['contenido-9am', 'contenido-1pm', 'contenido-7pm'];
    cron.schedule(cronExpr, safe(async (sock) => {
      await forEachGroup(sock, async (gid) => sendDailyContent(sock, gid), 1500, labels[i]);
    }), { timezone: 'America/Lima' });
  });

  // Metal Quiz L/M/V 1:20PM y 7:30PM
  ['20 13 * * 1,3,5', '30 19 * * 1,3,5'].forEach((cronExpr, i) => {
    const labels = ['quiz-1:20pm', 'quiz-7:30pm'];
    cron.schedule(cronExpr, safe(async (sock) => {
      await forEachGroup(sock, async (gid) => startMetalQuiz(sock, gid, { forceReplace: true }), 1500, labels[i]);
    }), { timezone: 'America/Lima' });
  });

  // Inactividad: cada hora 5AM-11PM
  cron.schedule('0 * * * *', safe(async (sock) => {
    const horasPeru = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const hora = parseInt(horasPeru);
    if (hora < 5 || hora > 23) return;
    const horasSinMensaje = (Date.now() - lastMessageTime) / (1000 * 60 * 60);
    if (horasSinMensaje >= 4) {
      const msg = getInactivityMessage();
      await forEachGroup(sock, async (gid) => sendWithTyping(sock, gid, msg), 1500, 'inactividad');
      lastMessageTime = Date.now();
    }
  }), { timezone: 'America/Lima' });

  // Recordatorio comandos cada 6h 5AM-11PM
  cron.schedule('0 */6 * * *', safe(async (sock) => {
    const horasPeru = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const hora = parseInt(horasPeru);
    if (hora < 5 || hora > 23) return;
    const msg = await getCommandHelpMessage();
    await forEachGroup(sock, async (gid) => sendWithTyping(sock, gid, msg), 1500, 'cmd-reminder');
  }), { timezone: 'America/Lima' });

  console.log('\x1b[1;32m✔  Scheduler activo (multi-grupo) — buenos días 5AM · contenido 9AM/1PM/7PM · ranking lunes 9:05AM · trivia L/M/V 1:20PM/7:30PM · inactividad/comandos desde 5AM\x1b[0m');
}

module.exports = {
  setupScheduler, updateLastMessage, getBuenosDias,
  sendDailyContent, sendAlbumDia, sendBandaDia,
  sendOnThisDay, sendBattle, sendWeekWinner, sendMonthlyTop,
  registerBattleVote, registerPollVote, getBattlePollKey, hasBattle,
  // compatibilidad hacia atrás con index.js HTTP endpoints
  getDailyContent, buildAlbumMessage: sendAlbumDiaTest, buildBandMessage: sendBandaDiaTest,
};
