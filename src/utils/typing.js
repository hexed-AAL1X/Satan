/**
 * Simula que el bot está escribiendo antes de mandar un mensaje.
 * El tiempo de espera es proporcional al largo del texto — como una persona real.
 */
async function typingDelay(sock, jid, text = '') {
  // Velocidad humana aprox: 200 caracteres por minuto → ~300ms por caracter, pero acotado
  const base = 2000; // mínimo 2s
  const perChar = 25; // ms por caracter
  const max = 6500;  // máximo 6.5s
  const ms = Math.min(base + text.length * perChar, max);

  await sock.sendPresenceUpdate('composing', jid);
  await new Promise(r => setTimeout(r, ms));
  await sock.sendPresenceUpdate('paused', jid);
}

/**
 * Manda un mensaje de texto simulando escritura humana.
 */
async function sendWithTyping(sock, jid, content, options = {}) {
  const text = typeof content === 'string' ? content : (content.text || '');
  await typingDelay(sock, jid, text);
  return sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content, options);
}

module.exports = { typingDelay, sendWithTyping };
