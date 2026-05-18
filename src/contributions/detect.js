const { addContribution, upsertUser } = require('../db');

const CONTRIBUTION_TYPES = [
  {
    type: 'music_link',
    points: 3,
    desc: 'Compartió link de música',
    patterns: [
      /spotify\.com/i,
      /youtu\.?be/i,
      /bandcamp\.com/i,
      /soundcloud\.com/i,
      /mureka\.ai/i,
      /music\.apple\.com/i,
      /deezer\.com/i,
      /tidal\.com/i,
    ],
  },
  {
    type: 'music_article',
    points: 2,
    desc: 'Compartió artículo o info de banda',
    patterns: [
      /metal-archives\.com/i,
      /blabbermouth\.net/i,
      /loudwire\.com/i,
      /metalinjection\.net/i,
      /revolvermag\.com/i,
      /facebook\.com\/(share|watch)/i,
      /instagram\.com\/(reel|p)\//i,
      /youtube\.com\/(watch|shorts)/i,
      /fb\.watch/i,
    ],
  },
];

// Sesiones de álbum: { userKey -> { firstAt, counted, pendingMsgKey, ... } }
// Clave: senderJid + ':' + groupId  → distinto por grupo para evitar spillover
const albumSessions = new Map();
const ALBUM_WINDOW_MS = 3 * 60 * 1000;
const ALBUM_POINTS = 5;

// Cooldown de reacciones
const reactionCooldowns = new Map();
const REACTION_COOLDOWN_MS = 4 * 60 * 1000;

function sessionKey(jid, groupId) { return `${jid}::${groupId || ''}`; }

// --- Heurísticas de detección de contenido musical ---

// Caption negativo: meme, foto personal, conversación casual
const NON_MUSIC_CAPTION_RE = /jaja|lol|xd|jeje|haha|gracioso|chistoso|cuando|pov:|me when|nobody:|nadie:|broo|🤣|😂|💀|selfie|yo mismo|mi cara|aquí estoy|comprando|cocinando|cumple|cumpleaños|feliz cumple|familia|mi perro|mi gato|mi novia|mi novio|mi hija|mi hijo|el clima|paisaje|atardecer|amanecer|pollada|chela|cerveza|borracho|pe[ds]o|comida|almuerzo|cena|desayuno|chiste|joda|chamba|trabajo|oficina|gym|gimnasio/i;

// Caption positivo: parece música
const MUSIC_CAPTION_RE = /album|álbum|disco|ep\b|demo|track|canci[oó]n|tema|banda|metal|rock|punk|grindcore|crust|black|death|doom|thrash|sludge|grind|hardcore|live|en vivo|portada|cover|riff|guitarrista|batería|baterista|vocalista|toc[oa]ndo|gira|tour|live at|recorded|grabado|estudio|sello|label|lanzamiento|nuevo (?:disco|álbum|track|tema|single)|sale el|salió|escuchen|escuchando|recomendaci[oó]n/i;

// Mimetypes de audio
function isMusicMime(mime) {
  if (!mime) return false;
  return /^audio\//.test(mime) ||
    /(mpeg|mp3|m4a|aac|wav|flac|ogg|opus|wma)/i.test(mime);
}

// Filename típico de audio
function isAudioFilename(name) {
  if (!name) return false;
  return /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma)$/i.test(name);
}

/**
 * Clasifica si un mensaje multimedia parece aporte musical legítimo.
 * Retorna: 'music' | 'pending' | 'non-music'
 *  - 'music'     → claro aporte musical (audio confirmado, caption musical, o sesión activa)
 *  - 'pending'   → imagen sin contexto, abre/extiende sesión pendiente sin dar puntos aún
 *  - 'non-music' → meme/foto personal/cosa no musical, no cuenta
 */
function classifyMedia(rawMsg, hasActiveSession) {
  const audio = rawMsg?.audioMessage;
  const doc = rawMsg?.documentMessage;
  const img = rawMsg?.imageMessage;
  const vid = rawMsg?.videoMessage;

  // Audio nativo → siempre música si mimetype lo confirma
  if (audio) {
    if (isMusicMime(audio.mimetype)) return 'music';
    return 'pending';
  }

  // Documento → música si mimetype/extensión lo confirman
  if (doc) {
    if (isMusicMime(doc.mimetype) || isAudioFilename(doc.fileName)) return 'music';
    return 'non-music'; // PDF, doc, etc. no son aportes
  }

  // Caption del media
  const caption = (img?.caption || vid?.caption || '').toLowerCase();

  // Caption claramente NO musical → meme/foto personal
  if (caption && NON_MUSIC_CAPTION_RE.test(caption)) return 'non-music';

  // Caption claramente musical → cuenta
  if (caption && MUSIC_CAPTION_RE.test(caption)) return 'music';

  // Caption ambiguo pero no negativo → si hay sesión activa, cuenta (contexto)
  if (caption && hasActiveSession) return 'music';

  // Imagen / video sin caption — pending: abre sesión, espera contexto
  if (img && !caption) return hasActiveSession ? 'music' : 'pending';
  if (vid && !caption) return 'non-music'; // videos sin texto rara vez son aportes

  return 'non-music';
}

function detectAndRegisterContribution(jid, name, text, groupId = '') {
  if (!text) return 0;

  for (const ct of CONTRIBUTION_TYPES) {
    if (ct.patterns.some(p => p.test(text))) {
      upsertUser(jid, name, groupId);
      addContribution(jid, ct.type, ct.points, ct.desc, groupId);
      return ct.points;
    }
  }
  return 0;
}

/**
 * Registra un media item como parte de una sesión de álbum.
 * Solo da puntos si la clasificación es 'music'. 'pending' abre sesión sin puntos
 * (otorgará puntos retroactivos si llega música después en la ventana).
 *
 * Retorna número de puntos otorgados (0 si no se dan, ALBUM_POINTS si se dieron en este mensaje).
 */
function registerAlbumSession(jid, name, groupId = '', rawMsg = null) {
  const now = Date.now();
  const key = sessionKey(jid, groupId);
  const session = albumSessions.get(key);
  const active = session && (now - session.firstAt < ALBUM_WINDOW_MS);

  const kind = rawMsg ? classifyMedia(rawMsg, active) : 'music';

  if (kind === 'non-music') {
    console.log(`[APORTE] descartado: contenido no musical de ${name}`);
    return 0;
  }

  // Sesión activa
  if (active) {
    session.firstAt = now;
    // Si ya se otorgaron puntos en esta sesión, no se dan más
    if (session.counted) return 0;
    // Si esta sesión estaba 'pending' y ahora llega música → otorgar retroactivos
    if (kind === 'music') {
      session.counted = true;
      upsertUser(jid, name, groupId);
      addContribution(jid, 'album_share', ALBUM_POINTS, 'Compartió álbum/material', groupId);
      console.log(`[APORTE] sesión confirmada por contexto, +${ALBUM_POINTS} pts a ${name}`);
      return ALBUM_POINTS;
    }
    return 0; // sigue pending
  }

  // Nueva sesión
  const newSession = {
    firstAt: now,
    counted: kind === 'music',
    maxAudioReactions: 1 + Math.floor(Math.random() * 3),
    audioReactionCount: 0,
  };
  albumSessions.set(key, newSession);

  if (kind === 'music') {
    upsertUser(jid, name, groupId);
    addContribution(jid, 'album_share', ALBUM_POINTS, 'Compartió álbum/material', groupId);
    return ALBUM_POINTS;
  }

  // 'pending': abrió sesión pero sin puntos aún
  console.log(`[APORTE] sesión pendiente (sin contexto musical) abierta por ${name}`);
  return 0;
}

function shouldReactAudio(jid, groupId = '') {
  const session = albumSessions.get(sessionKey(jid, groupId));
  if (!session) return false;
  if (session.audioReactionCount >= session.maxAudioReactions) return false;
  session.audioReactionCount++;
  return true;
}

function shouldReact(jid, groupId = '') {
  const key = sessionKey(jid, groupId);
  const now = Date.now();
  const last = reactionCooldowns.get(key) || 0;
  if (now - last > REACTION_COOLDOWN_MS) {
    reactionCooldowns.set(key, now);
    return true;
  }
  return false;
}

// Helper para que el caller sepa si vale la pena reaccionar a un media
function classifyMediaPublic(rawMsg, jid, groupId = '') {
  const session = albumSessions.get(sessionKey(jid, groupId));
  const active = session && (Date.now() - session.firstAt < ALBUM_WINDOW_MS);
  return classifyMedia(rawMsg, active);
}

module.exports = {
  detectAndRegisterContribution,
  registerAlbumSession,
  shouldReact,
  shouldReactAudio,
  classifyMedia: classifyMediaPublic,
};
