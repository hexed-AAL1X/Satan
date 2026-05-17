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

// Sesiones de álbum: { jid -> { firstAt, counted, maxReactions, reactionCount } }
const albumSessions = new Map();
const ALBUM_WINDOW_MS = 3 * 60 * 1000;
const ALBUM_POINTS = 5;

// Cooldown de reacciones: no spamear acks si ya se reaccionó recientemente
const reactionCooldowns = new Map();
const REACTION_COOLDOWN_MS = 4 * 60 * 1000;

/**
 * Revisa si un mensaje de texto contiene un link de aporte y lo registra.
 * Retorna los puntos otorgados o 0.
 */
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
 * Registra un archivo multimedia (imagen, audio, doc) como parte de una sesión de álbum.
 * - Si es la primera vez en la ventana: registra 5 pts y retorna 5.
 * - Si ya se registró en esta sesión: acumula silenciosamente y retorna 0.
 * - Si pasó la ventana: nueva sesión, registra 5 pts y retorna 5.
 */
function registerAlbumSession(jid, name, groupId = '') {
  const now = Date.now();
  const session = albumSessions.get(jid);

  if (session && now - session.firstAt < ALBUM_WINDOW_MS) {
    if (!session.counted) {
      session.counted = true;
      upsertUser(jid, name, groupId);
      addContribution(jid, 'album_share', ALBUM_POINTS, 'Compartió álbum/material', groupId);
    }
    session.firstAt = now;
    return 0; // puntos ya dados al inicio de sesión
  }

  // Nueva sesión — max reacciones a audios: 1, 2 o 3 al azar
  albumSessions.set(jid, {
    firstAt: now,
    counted: true,
    maxAudioReactions: 1 + Math.floor(Math.random() * 3),
    audioReactionCount: 0,
  });
  upsertUser(jid, name, groupId);
  addContribution(jid, 'album_share', ALBUM_POINTS, 'Compartió álbum/material', groupId);
  return ALBUM_POINTS;
}

/**
 * Indica si se debe reaccionar a un audio/doc en la sesión actual.
 * Respeta el límite aleatorio de 1-3 reacciones por sesión.
 */
function shouldReactAudio(jid) {
  const session = albumSessions.get(jid);
  if (!session) return false;
  if (session.audioReactionCount >= session.maxAudioReactions) return false;
  session.audioReactionCount++;
  return true;
}

/**
 * Determina si hay que reaccionar con emoji al mensaje.
 * Respeta un cooldown para no reaccionar en cada mensaje de una sesión.
 */
function shouldReact(jid) {
  const now = Date.now();
  const last = reactionCooldowns.get(jid) || 0;
  if (now - last > REACTION_COOLDOWN_MS) {
    reactionCooldowns.set(jid, now);
    return true;
  }
  return false;
}

module.exports = { detectAndRegisterContribution, registerAlbumSession, shouldReact, shouldReactAudio };
