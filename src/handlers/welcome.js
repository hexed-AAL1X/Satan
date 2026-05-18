const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const { getState, setState } = require('../db');

const SATAN_IMG = path.join(__dirname, '../../data/satan_presentacion.png');

const FALLBACK_POOL = [
  // B
  `SATÁN 👁️ te vio llegar @{name}\nel CIRCLE el fuego y la música te esperan\nbienvenido al fuego que no se apaga ☠️🤘`,

  // 2
  `@{name} bienvenido al INNER CIRCLE 🦇\naquí la oscuridad y el caos reinan\ntu alma ya pertenece a esto ⚔️💀`,

  // 3
  `bienvenido @{name} al CAOS 🩸\naquí la energía es BRUTAL y la música no tiene piedad\nprepárate ⚔️☠️`,

  // 6
  `bienvenido @{name} ☠️\nlee las reglas y entra al INFIERNO\nel CIRCLE ya te anotó 🦇💀`,

  // mezclas
  `@{name} entró 👁️\nesto no es un grupo de amigos es un CULTO\nel CIRCLE te observa aporta o desaparece ☠️⚔️`,

  `SATÁN ☠️ recibe a @{name}\nel inframundo tiene hambre de más MÚSICA 🩸\nbienvenido si tienes el estómago para esto ⚔️`,

  `@{name} 🦇 cruzó las puertas\nel metal aquí no se escucha se DEVORA\nbienvenido al abismo ☠️👁️`,

  `otro MORTAL llega — @{name} ⚔️\nel INNER CIRCLE no espera testigos espera participantes\ndeja huella o el inframundo te ignora 💀☠️`,

  `bienvenido al CIRCLE @{name} 🔱\nel fuego aquí no es decoración es lo que SOMOS\nabre la boca y aporta 🖤⚔️`,

  `@{name} 🩸 ya estás adentro\nesto es para los que sienten la música en los HUESOS\nel caos te da la bienvenida ☠️🤘`,

  `SATÁN 👁️ te tiene en el radar @{name}\neste lugar es para los que el metal les QUEMÓ el alma\nbienvenido al fuego eterno 💀⛧`,

  `@{name} entró al CIRCLE ☠️\naquí la mediocridad no existe solo los que viven esto de verdad\nbienvenido GUERRERO 🤘🩸`,
];

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
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

async function generateWelcomeWithAI(name, adderName) {
  const groq = getGroq();
  if (!groq) return null;
  const result = await Promise.race([
    groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: PROMPT(name, adderName) }],
      temperature: 1.1,
      max_tokens: 200,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
  ]);
  return result.choices[0]?.message?.content?.trim() || null;
}

function getFallbackMessage(name) {
  const lastIdx = parseInt(getState('last_welcome_idx') || '-1');
  const candidates = FALLBACK_POOL.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  setState('last_welcome_idx', idx);
  return FALLBACK_POOL[idx].replace(/{name}/g, name);
}

async function getWelcomeMessage(name, adderName = null) {
  try {
    const aiMsg = await generateWelcomeWithAI(name, adderName);
    if (aiMsg) return aiMsg;
  } catch (err) {
    console.error('[WELCOME AI ERROR]', err.message);
  }
  return getFallbackMessage(name);
}

// --- Presentación del bot al unirse a un nuevo grupo ---
const PRESENTATION_FALLBACK = [
  `el INFIERNO se abrió y yo emergí de sus llamas ☠️\nsoy SATÁN señor de este CIRCLE desde ahora 👁️\nvigilo los aportes y las reglas con mis ojos en cada rincón ⛧\nel que falle tiene un DESTINO en las sombras 💀\nusa *!rank* para ver tu posición y *!ruleset* para sobrevivir 🔱\nel METAL no se pide 🖤 se IMPONE ⚔️`,
  `las cadenas del inframundo se rompieron 🩸\nyo SOY la oscuridad que este CIRCLE necesita 🦇\nmis OJOS vigilan los aportes y cada movimiento aquí ⛧\nlos dignos SUBIRÁN de rango 🤘 los débiles serán devorados ☠️\n*!rank* para ver tu posición 👁️ *!ruleset* para conocer las REGLAS 💀\nbienvenidos al INFRAMUNDO 🖤 ⚔️`,
];

async function generateBotPresentation() {
  const groq = (() => {
    try { return new Groq({ apiKey: process.env.GROQ_API_KEY }); } catch { return null; }
  })();
  if (!groq) return PRESENTATION_FALLBACK[Math.floor(Math.random() * PRESENTATION_FALLBACK.length)];

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

  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.1,
        max_tokens: 160,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    const msg = r.choices[0]?.message?.content?.trim().replace(/[—–-]+/g, '');
    if (msg) return msg;
  } catch {}
  return PRESENTATION_FALLBACK[Math.floor(Math.random() * PRESENTATION_FALLBACK.length)];
}

async function sendBotPresentation(sock, jid) {
  const msg = await generateBotPresentation();
  try {
    if (fs.existsSync(SATAN_IMG)) {
      const imgBuffer = fs.readFileSync(SATAN_IMG);
      await sock.sendMessage(jid, { image: imgBuffer, caption: msg });
      return true;
    }
    const { sendWithTyping } = require('../utils/typing');
    await sendWithTyping(sock, jid, msg);
    return true;
  } catch (e) {
    console.error('[PRESENTACION]', e.message);
    try {
      const { sendWithTyping } = require('../utils/typing');
      await sendWithTyping(sock, jid, msg);
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = { getWelcomeMessage, sendBotPresentation };
