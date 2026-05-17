const cron = require('node-cron');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const { ALBUMS, BANDS, CURIOSITIES, SONGS, ANNIVERSARIES } = require('../../data/content');
const { buildRankingMessage } = require('./ranking');
const { startMetalQuiz } = require('../commands/trivia');
const { getState, setState, getMonthlyRanking, resetMonthlyPoints, getPreviousWeekWinner, getWeekKey } = require('../db');
const { sendWithTyping } = require('../utils/typing');
const { sendWelcomeStickers, sendMorningStickers, getStickerFiles } = require('../handlers/stickers');
const { getAlbumArtworkSafe, getBandImageSafe } = require('../utils/images');

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

// --- Helpers ---
function pickByIndex(arr, idx) {
  return arr[((idx % arr.length) + arr.length) % arr.length];
}

// Toma hasta `maxTry` candidatos distintos al último usado
function pickCandidates(arr, stateKey, maxTry) {
  const lastIdx = parseInt(getState(stateKey) || '-1');
  const candidates = arr.map((_, i) => i).filter(i => i !== lastIdx);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, maxTry).map(i => ({ item: arr[i], idx: i }));
}

function pickRandom(arr, stateKey) {
  const lastIdx = parseInt(getState(stateKey) || '-1');
  const candidates = arr.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  setState(stateKey, idx);
  return arr[idx];
}

// --- Álbum del día con imagen obligatoria ---
// Prueba hasta 5 álbumes distintos hasta encontrar uno con portada
async function sendAlbumDia(sock, jid) {
  const candidates = pickCandidates(ALBUMS, 'last_album_idx', 5);

  for (const { item: a, idx } of candidates) {
    const imgUrl = await getAlbumArtworkSafe(a.band, a.title, 7000);
    if (!imgUrl) continue;

    setState('last_album_idx', idx);
    const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.band + ' ' + a.title + ' full album')}`;
    const caption =
      `el ÁLBUM 🔱 de hoy:\n\n*${a.title}* ${a.band} (${a.year})\nGénero 🖤 ${a.genre}\n\n${a.question} ⚔️\n\n🔗 ${ytLink}`;
    try {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
    } catch {
      await sendWithTyping(sock, jid, caption);
    }
    return;
  }

  // Si ninguno tiene imagen, manda el último candidato sin imagen
  const fallback = candidates[0]?.item || ALBUMS[0];
  const a = fallback;
  setState('last_album_idx', candidates[0]?.idx ?? 0);
  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.band + ' ' + a.title + ' full album')}`;
  await sendWithTyping(sock, jid,
    `el ÁLBUM 🔱 de hoy:\n\n*${a.title}* ${a.band} (${a.year})\nGénero 🖤 ${a.genre}\n\n${a.question} ⚔️\n\n🔗 ${ytLink}`
  );
}

// --- Banda del día con imagen obligatoria ---
async function sendBandaDia(sock, jid) {
  const candidates = pickCandidates(BANDS, 'last_band_idx', 5);

  for (const { item: b, idx } of candidates) {
    const imgUrl = await getBandImageSafe(b.name, 7000);
    if (!imgUrl) continue;

    setState('last_band_idx', idx);
    const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(b.name + ' metal')}`;
    const spLink = `https://open.spotify.com/search/${encodeURIComponent(b.name)}`;
    const caption =
      `la BANDA ☠️ del día:\n\n*${b.name}* ${b.country}\nGénero 💀 ${b.genre} | Formada en ${b.formed}\nÁlbumes clave 🦇 ${b.albums.slice(0, 3).join(', ')}\n\n_${b.fact}_\n\n🔗 YouTube: ${ytLink}\n🎧 Spotify: ${spLink}`;
    try {
      await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
    } catch {
      await sendWithTyping(sock, jid, caption);
    }
    return;
  }

  // Fallback sin imagen
  const b = candidates[0]?.item || BANDS[0];
  setState('last_band_idx', candidates[0]?.idx ?? 0);
  const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(b.name + ' metal')}`;
  const spLink = `https://open.spotify.com/search/${encodeURIComponent(b.name)}`;
  await sendWithTyping(sock, jid,
    `la BANDA ☠️ del día:\n\n*${b.name}* ${b.country}\nGénero 💀 ${b.genre} | Formada en ${b.formed}\nÁlbumes clave 🦇 ${b.albums.slice(0, 3).join(', ')}\n\n_${b.fact}_\n\n🔗 YouTube: ${ytLink}\n🎧 Spotify: ${spLink}`
  );
}

function buildCuriosityMessage() {
  const c = pickRandom(CURIOSITIES, 'last_curiosity_idx');
  return `CURIOSIDAD 👁️ del metal:\n\n_${c}_\n\n¿lo sabías? ⚔️ deja tu reacción 🤘`;
}

function buildSongMessage() {
  const s = pickRandom(SONGS, 'last_song_idx');
  return `la CANCIÓN ⛧ del día:\n\n*${s.title}* ${s.band}\n\n🩸 _${s.fact}_\n\n¿la conocías? ☠️`;
}

// Envía el contenido diario según el día de la semana
async function sendDailyContent(sock, jid) {
  const day = new Date().getDay();
  switch (day) {
    case 1: return; // Lunes → ranking (se manda aparte)
    case 2: return sendAlbumDia(sock, jid);
    case 3: return sendWithTyping(sock, jid, buildCuriosityMessage());
    case 4: return sendBandaDia(sock, jid);
    case 5: return sendAlbumDia(sock, jid);
    case 6: return sendWithTyping(sock, jid, buildSongMessage());
    case 0: return sendWithTyping(sock, jid, buildCuriosityMessage());
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

async function generateOnThisDay(month, day) {
  const groq = getGroq();
  if (!groq) return null;
  const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const monthName = monthNames[parseInt(month) - 1];
  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content:
          `Eres SATÁN hablando a un grupo de metal. Hoy es ${day} de ${monthName}. Encuentra UN hecho histórico real del mundo del metal que ocurrió esta fecha (cualquier año): muerte de músico, lanzamiento legendario, concierto histórico, etc.
Si no hay nada relevante para esta fecha exacta, responde: NO_FOUND
Si encuentras algo, responde ÚNICAMENTE este JSON (sin markdown):
{"text":"el mensaje 2-3 líneas estilo SATÁN con PALABRAS COMPLETAS en mayúsculas para énfasis sin guiones emojis de ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤","artist":"nombre exacto del artista o banda principal del hecho"}` }],
        temperature: 0.7,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
    ]);
    const raw = r.choices[0]?.message?.content?.trim();
    if (!raw || raw.includes('NO_FOUND')) return null;
    // Extraer JSON del output
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.text && !parsed.text.includes('NO_FOUND')) {
          return { text: parsed.text.replace(/[—–-]+/g, ''), artist: parsed.artist || null };
        }
      } catch {}
    }
    // Si no hay JSON válido, usar el texto directo como fallback
    return { text: raw.replace(/[—–-]+/g, ''), artist: null };
  } catch { return null; }
}

async function sendOnThisDay(sock, jid) {
  const today = getTodayMMDD();
  const [mm, dd] = today.split('-');

  // Primero: aniversarios del día (con portada del álbum)
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

  // Luego: hecho histórico via Groq (con imagen del artista)
  const result = await generateOnThisDay(mm, dd);
  if (result?.text) {
    await new Promise(r => setTimeout(r, 1500));
    const header = `👁️ UN DÍA COMO HOY en el metal:\n\n${result.text}`;

    // Buscar imagen del artista mencionado
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

// --- Recordatorio de comandos (sin meme, con parámetros) ---
const CMD_REMINDERS = [
  `⚔️ COMANDOS del CIRCLE:\n\n🎖️ !rank  ← tu rango y puntos\n🏆 !top  ← ranking semanal\n🎵 !band [nombre]  ← info de una banda con imagen\n💿 !album [nombre]  ← info de un álbum con portada\n🩸 !recomienda [género]  ← 3 bandas poco conocidas\n☠️ !trivia [facil|medio|dificil]  ← pregunta de 30s\n📜 !ruleset  ← reglas del CIRCLE 🖤`,
  `👁️ qué PUEDES HACER aquí:\n\n!rank  ← tu nivel actual\n!top  ← quién lidera esta semana\n!band [nombre]  ← busca una banda con imagen y links\n!album [nombre]  ← portada info y links del álbum\n!recomienda  ← descubre bandas de culto\n!trivia  ← pregunta metal 30 segundos\n!ruleset  ← normas del CIRCLE ⚔️`,
  `☠️ LOS COMANDOS del INFRAMUNDO:\n\n🤘 !rank  ← tu rango\n🥇 !top  ← ranking semanal\n🎸 !band [nombre de banda]\n🎶 !album [nombre del álbum]\n🩸 !recomienda [género opcional]\n⚡ !trivia [facil / medio / dificil]\n📜 !ruleset  ← las reglas 🖤`,
];

// --- Setup de todos los cron jobs ---
function setupScheduler(sock) {
  if (!GROUP_ID) {
    console.log('⚠  GROUP_ID no configurado — scheduler desactivado');
    return;
  }

  // Buenos días todos los días a las 5:00 AM con sticker
  cron.schedule('0 5 * * *', async () => {
    try {
      const msg = await getBuenosDias();
      await sendWithTyping(sock, GROUP_ID, msg);
      if (getStickerFiles('buenos_dias').length > 0) {
        await new Promise(r => setTimeout(r, 1000));
        await sendMorningStickers(sock, GROUP_ID);
      }
    } catch (err) { console.error('[BUENOS DÍAS]', err.message); }
  }, { timezone: 'America/Lima' });

  // On This Day — todos los días a las 7AM
  cron.schedule('0 7 * * *', async () => {
    await sendOnThisDay(sock, GROUP_ID).catch(console.error);
  }, { timezone: 'America/Lima' });

  // Ranking del lunes a las 9:05 AM (con anuncio del winner de la semana anterior)
  cron.schedule('5 9 * * 1', async () => {
    await sendWeekWinner(sock, GROUP_ID, GROUP_ID).catch(console.error);
    await new Promise(r => setTimeout(r, 3000));
    const msg = buildRankingMessage();
    if (msg) await sendWithTyping(sock, GROUP_ID, msg).catch(console.error);
  }, { timezone: 'America/Lima' });

  // Top mensual — día 1 de cada mes a las 9AM
  cron.schedule('0 9 1 * *', async () => {
    await sendMonthlyTop(sock, GROUP_ID, GROUP_ID).catch(console.error);
  }, { timezone: 'America/Lima' });

  // Battle automático — sábados y domingos a las 2PM
  cron.schedule('0 14 * * 6,0', async () => {
    await sendBattle(sock, GROUP_ID).catch(console.error);
  }, { timezone: 'America/Lima' });

  // Contenido diario: 9AM, 1PM, 7PM (todos los días)
  ['0 9 * * *', '0 13 * * *', '0 19 * * *'].forEach(cronExpr => {
    cron.schedule(cronExpr, async () => {
      await sendDailyContent(sock, GROUP_ID).catch(console.error);
    }, { timezone: 'America/Lima' });
  });

  // Metal Quiz automático: Lunes, Miércoles y Viernes a las 1:20PM y 7:30PM
  ['20 13 * * 1,3,5', '30 19 * * 1,3,5'].forEach(cronExpr => {
    cron.schedule(cronExpr, async () => {
      await startMetalQuiz(sock, GROUP_ID);
    }, { timezone: 'America/Lima' });
  });

  // Detector de inactividad: cada hora desde las 5AM hasta las 11PM
  cron.schedule('0 * * * *', async () => {
    const horasPeru = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const hora = parseInt(horasPeru);
    if (hora < 5 || hora > 23) return;
    const horasSinMensaje = (Date.now() - lastMessageTime) / (1000 * 60 * 60);
    if (horasSinMensaje >= 4) {
      const msg = getInactivityMessage();
      await sendWithTyping(sock, GROUP_ID, msg).catch(console.error);
      lastMessageTime = Date.now();
    }
  }, { timezone: 'America/Lima' });

  // Recordatorio de comandos cada 6 horas (desde las 5AM hasta las 11PM)
  cron.schedule('0 */6 * * *', async () => {
    const horasPeru = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    const hora = parseInt(horasPeru);
    if (hora < 5 || hora > 23) return;
    const msg = CMD_REMINDERS[Math.floor(Math.random() * CMD_REMINDERS.length)];
    await sendWithTyping(sock, GROUP_ID, msg).catch(console.error);
  }, { timezone: 'America/Lima' });

  console.log('\x1b[1;32m✔  Scheduler activo — buenos días 5AM, contenido 9AM/1PM/7PM, ranking lunes 9:05AM, trivia L/M/V 1:20PM y 7:30PM, inactividad/comandos desde 5AM\x1b[0m');
}

module.exports = {
  setupScheduler, updateLastMessage, getBuenosDias,
  sendDailyContent, sendAlbumDia, sendBandaDia,
  sendOnThisDay, sendBattle, sendWeekWinner, sendMonthlyTop,
  registerBattleVote, registerPollVote, getBattlePollKey, hasBattle,
  // compatibilidad hacia atrás con index.js HTTP endpoints
  getDailyContent, buildAlbumMessage: sendAlbumDiaTest, buildBandMessage: sendBandaDiaTest,
};
