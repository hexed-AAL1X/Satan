const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const { groqWithRetry, hasGroqKey, GROQ_UNAVAILABLE_MSG } = require('../utils/groq-retry');

const SATAN_IMG = path.join(__dirname, '../../data/satan_presentacion.png');

const ALL_EMOJIS = ['☠️', '⚔️', '🦇', '💀', '👁️', '🩸', '⛧', '🤘', '🔱', '🖤'];

function pickEmojis(n = 4) {
  return [...ALL_EMOJIS].sort(() => Math.random() - 0.5).slice(0, n).join(' ');
}

const PROMPT = (name, adderName = null) => {
  const emojis = pickEmojis(4);
  const adderLine = adderName
    ? `\n- Si mencionas al que lo agregó, hazlo así: "@${adderName} lo trajo al CIRCLE" o "llegó gracias a @${adderName}" (solo a veces, no siempre)`
    : '';
  return `Eres SATÁN, señor del inframundo, guardián de un grupo de WhatsApp de metal llamado THE BLACK CIRCLE. Acaba de llegar "${name}".

Dale la bienvenida mezclando estos estilos (elige uno al azar):
- oscuro emocionante: SATÁN lo vio llegar, el fuego y la música esperan, bienvenido al caos
- culto intenso: entró al INNER CIRCLE o al CIRCLE, esto no es para todos, el inframundo lo tiene en el radar
- adrenalina brutal: la música aquí se DEVORA, energía brutal, bienvenido al abismo
- directo y corto: pocas palabras, mucho peso, lee las reglas entra al infierno

REGLAS ESTRICTAS:
- Menciona @${name} en el mensaje${adderLine}
- Pon PALABRAS COMPLETAS en mayúsculas para énfasis, el resto en minúsculas — NUNCA alternes letras dentro de una misma palabra (MAL: "bIeNvEnIdO", BIEN: "BIENVENIDO")
- A veces menciona "el CIRCLE", "INNER CIRCLE" o "el inframundo" — no siempre, varía
- NUNCA menciones géneros específicos (black metal, death metal, etc.)
- USA EXACTAMENTE ESTOS EMOJIS y ningún otro: ${emojis} — distribúyelos en el texto, no los pongas todos juntos al final
- Máximo 3 líneas cortas. Sin guiones. Sin signos de puntuación innecesarios
- PROHIBIDO: "siéntete cómodo", "estás en casa", "somos familia", "un placer"
- Sin comillas ni explicación. Solo el mensaje.`;
};

let groqClient = null;
function getGroq() {
  if (!hasGroqKey()) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

async function generateWelcomeWithAI(name, adderName) {
  const groq = getGroq();
  if (!groq) return null;

  return groqWithRetry(async () => {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: PROMPT(name, adderName) }],
        temperature: 1.1,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const msg = result.choices[0]?.message?.content?.trim();
    if (!msg || msg.length < 8) throw new Error('respuesta vacía');
    return msg;
  }, { attempts: 4, label: 'WELCOME' });
}

async function getWelcomeMessage(name, adderName = null) {
  const aiMsg = await generateWelcomeWithAI(name, adderName);
  if (aiMsg) return aiMsg;
  return `☠️ @${name} entró al CIRCLE 👁️\n${GROQ_UNAVAILABLE_MSG}`;
}

async function generateBotPresentation() {
  const groq = getGroq();
  if (!groq) return null;

  const emojis = pickEmojis(4);
  const prompt = `Eres SATÁN señor del inframundo. Acabas de aparecer en un grupo de metal de WhatsApp por primera vez como si hubieras emergido del fuego. Escribe tu presentación.
REGLAS ABSOLUTAS:
- mezcla minúsculas con PALABRAS COMPLETAS en mayúsculas para énfasis (no alternes letras dentro de una misma palabra)
- sin guiones de ningún tipo
- emojis solo de esta lista: ${emojis} ☠️ 🔱 🖤
- entre 5 y 6 líneas cortas
- menciona que vigilarás los aportes y las reglas
- menciona los comandos *!rank* y *!ruleset*
- tono oscuro agresivo como nacido del infierno mismo
Solo el mensaje, sin comillas ni explicaciones.`;

  return groqWithRetry(async () => {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.1,
        max_tokens: 160,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const msg = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    if (!msg || msg.length < 20) throw new Error('respuesta vacía');
    return msg;
  }, { attempts: 4, label: 'PRESENTACION' });
}

async function sendBotPresentation(sock, jid) {
  console.log(`[PRESENT] inicio ${jid}`);

  const msg = await generateBotPresentation();
  if (!msg) {
    console.warn('[PRESENT] Groq no respondió — omitiendo presentación');
    return false;
  }
  console.log(`[PRESENT] texto OK (${msg.length} chars)`);

  try {
    if (fs.existsSync(SATAN_IMG)) {
      console.log(`[PRESENT] enviando imagen+caption...`);
      await sock.sendMessage(jid, { image: fs.readFileSync(SATAN_IMG), caption: msg });
      console.log(`[PRESENT] ✓ imagen enviada`);
      return true;
    }
  } catch (e) {
    console.error(`[PRESENT] imagen falló: ${e.message}`);
  }

  try {
    console.log(`[PRESENT] enviando solo texto...`);
    await sock.sendMessage(jid, { text: msg });
    console.log(`[PRESENT] ✓ texto enviado`);
    return true;
  } catch (e) {
    console.error(`[PRESENT] ✗ todo falló: ${e.message}`);
    return false;
  }
}

module.exports = { getWelcomeMessage, sendBotPresentation };
