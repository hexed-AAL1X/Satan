const { addStrike, muteUser, banUser, getUser, upsertUser } = require('../db');
const { sendWithTyping } = require('../utils/typing');

// Solo bloquea invitaciones a grupos de WhatsApp
const WA_GROUP_LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

// Dominios permitidos (redes sociales y musica)
const ALLOWED_DOMAINS = [
  'instagram.com', 'facebook.com', 'fb.watch',
  'youtube.com', 'youtu.be', 'spotify.com',
  'tiktok.com', 'bandcamp.com', 'soundcloud.com',
  'twitter.com', 'x.com', 'open.spotify.com',
];

function isAllowedLink(text) {
  const lower = text.toLowerCase();
  return ALLOWED_DOMAINS.some(d => lower.includes(d));
}

function hasGroupLink(text) {
  return WA_GROUP_LINK_RE.test(text) && !isAllowedLink(text);
}

const STRIKE_MSGS = {
  1: (name) => `⚠️ @${name} — Primer aviso.\nSe detectó un enlace de grupo externo. No está permitido.\nEso te cuesta un strike. [ 1/3 ] ⚔️`,
  2: (name) => `☠️ @${name} — Segundo strike [ 2/3 ]\nQuedas silenciado por 24 horas.\nUna más y sales del CIRCLE. 🦇`,
  3: (name) => `🔱 @${name} — Tres strikes.\nEl CIRCLE te expulsa. Fue tu decision. ☠️`,
};

async function handleGroupLink(sock, msg, jid, senderJid, senderName, groupMetadata) {
  // Admins pueden mandar lo que quieran
  const isAdmin = (groupMetadata?.participants || [])
    .some(p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin'));
  if (isAdmin) return false;

  upsertUser(senderJid, senderName);

  // Borrar el mensaje
  try {
    await sock.sendMessage(jid, { delete: msg.key });
  } catch (_) {}

  const strikes = addStrike(senderJid, 'group_link', msg.message?.conversation || '');
  const strikeMsg = STRIKE_MSGS[Math.min(strikes, 3)](senderName);

  await sendWithTyping(sock, jid, {
    text: strikeMsg,
    mentions: [senderJid],
  });

  if (strikes === 2) {
    muteUser(senderJid, 24);
  } else if (strikes >= 3) {
    banUser(senderJid);
    try {
      await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
    } catch (_) {}
  }

  return true;
}

module.exports = { hasGroupLink, handleGroupLink };
