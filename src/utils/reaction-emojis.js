/**
 * Emojis seguros para reacciones de WhatsApp.
 * Evita símbolos Unicode (⛧ 🔱 ⚔️) y emojis nuevos/raros (🫀) que salen como cuadritos.
 * En mensajes de texto puedes usar el set completo; en react: solo estos.
 */
const REACTION_POOLS = {
  music: ['🤘', '🔥', '💀', '☠️', '🖤', '🎸'],
  meme: ['😂', '🤣', '💀', '😈'],
  insult: ['😈', '👿', '💀'],
  funny: ['😂', '🤣', '💀'],
  thanks: ['🤘', '🖤', '🔥', '👍'],
  question: ['🤔', '👀', '🤘'],
  default: ['🤘', '💀', '🖤', '🔥', '😈', '☠️'],
};

function pickReaction(pool = 'default') {
  const list = REACTION_POOLS[pool] || REACTION_POOLS.default;
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { REACTION_POOLS, pickReaction };
