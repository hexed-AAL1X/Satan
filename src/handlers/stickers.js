const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const STICKERS_BASE    = path.join(__dirname, '../../data/stickers');
const STICKERS_WELCOME = path.join(STICKERS_BASE, 'bienvenida');
const STICKERS_MORNING = path.join(STICKERS_BASE, 'buenos_dias');

[STICKERS_BASE, STICKERS_WELCOME, STICKERS_MORNING].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function getStickerFiles(type = 'bienvenida') {
  const dir = type === 'buenos_dias' ? STICKERS_MORNING : STICKERS_WELCOME;
  return fs.readdirSync(dir).filter(f => f.endsWith('.webp'));
}

function pickUniqueStickers(count, type = 'bienvenida') {
  const dir = type === 'buenos_dias' ? STICKERS_MORNING : STICKERS_WELCOME;
  const files = getStickerFiles(type);
  if (!files.length) return [];
  const shuffled = [...files].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length))
    .map(f => path.join(dir, f));
}

async function sendWelcomeStickers(sock, jid, forceCount) {
  const files = getStickerFiles('bienvenida');
  if (!files.length) return;
  const count = forceCount ?? (Math.random() < 0.5 ? 2 : 4);
  const stickers = pickUniqueStickers(count, 'bienvenida');
  for (const stickerPath of stickers) {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    try {
      await sock.sendMessage(jid, { sticker: fs.readFileSync(stickerPath) });
    } catch (err) {
      console.error('[STICKER SEND ERROR]', err.message);
    }
  }
}

async function sendMorningStickers(sock, jid) {
  const files = getStickerFiles('buenos_dias');
  if (!files.length) return;
  const stickers = pickUniqueStickers(1, 'buenos_dias');
  for (const stickerPath of stickers) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    try {
      await sock.sendMessage(jid, { sticker: fs.readFileSync(stickerPath) });
    } catch (err) {
      console.error('[STICKER MORNING ERROR]', err.message);
    }
  }
}

// type: 'bienvenida' | 'buenos_dias'
async function saveSticker(sock, msg, type = 'bienvenida') {
  try {
    const stickerMsg = msg.message?.stickerMessage;
    if (!stickerMsg) return false;
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: { info: () => {}, error: () => {}, warn: () => {} },
      reuploadRequest: sock.updateMediaMessage,
    });
    const dir = type === 'buenos_dias' ? STICKERS_MORNING : STICKERS_WELCOME;
    const filename = `sticker_${Date.now()}.webp`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    console.log(`[STICKER] Guardado en ${type}: ${filename}`);
    return filename;
  } catch (err) {
    console.error('[STICKER ERROR]', err.message);
    return false;
  }
}

module.exports = { saveSticker, sendWelcomeStickers, sendMorningStickers, getStickerFiles };
