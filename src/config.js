require('dotenv').config();

function digits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

const OWNER_NUMBER = digits(process.env.OWNER_NUMBER);
const BOT_NUMBER = digits(process.env.BOT_NUMBER);

function ownerJid() {
  return OWNER_NUMBER ? `${OWNER_NUMBER}@s.whatsapp.net` : '';
}

function ownerWaLink() {
  return OWNER_NUMBER ? `wa.me/${OWNER_NUMBER}` : '';
}

function parseGroupAliases() {
  if (!process.env.GROUP_ALIASES) return {};
  try {
    return JSON.parse(process.env.GROUP_ALIASES);
  } catch {
    console.warn('[CONFIG] GROUP_ALIASES JSON invalido');
    return {};
  }
}

function resolveGroupAlias(arg) {
  const key = String(arg || '').toLowerCase().trim();
  if (key.includes('@g.us')) return key;
  const aliases = parseGroupAliases();
  return aliases[key] || key;
}

module.exports = {
  OWNER_NUMBER,
  BOT_NUMBER,
  ownerJid,
  ownerWaLink,
  parseGroupAliases,
  resolveGroupAlias,
};
