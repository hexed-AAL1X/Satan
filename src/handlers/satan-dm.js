const Groq = require('groq-sdk');

const SATAN_FALLBACK = [
  `quién OSA 👁️ interrumpir mi silencio\nhabla MORTAL te escucho desde las sombras ☠️`,
  `ahhh 🖤 otro que viene a buscarme\ndime lo que necesitas el INFRAMUNDO tiene tiempo ⛧`,
  `siento TU presencia 🦇 pequeño ser\n¿qué te trae a mis dominios a esta hora? ☠️`,
  `el SEÑOR DEL ABISMO 🩸 te escucha\nno tengo todo el día habla ⚔️`,
  `viniste solo 👁️ eso me agrada\nlos VALIENTES siempre llegan directo a mi puerta ⛧`,
  `🖤 interesante\npocos se atreven a venir al privado del amo del inframundo\n¿qué deseas MORTAL? ☠️`,
  `soy SATÁN ⛧ el que cuida este CIRCLE desde las sombras\nsi buscas algo dímelo si no 🖤 mejor vuelve al grupo`,
  `el FUEGO eterno 🔥 ilumina tu cara en este momento\n¿vienes por respuestas? aquí las hay todas ☠️`,
  `nadie llega a estos aposentos sin motivo 🩸\ndime qué necesitas HERMANO del metal ⚔️`,
  `las sombras me avisaron 👁️ que alguien se acercaba\nbienvenido a mi CIRCLE más oscuro 🖤 ¿qué buscas?`,
  `habla MORTAL 💀\nel silencio del inframundo te escucha`,
  `🔥 me encontraste\npocos logran esto sin perderse en el camino\ndime ⛧`,
  `el amo del METAL 🤘 nunca duerme\n¿qué se te ofrece? ☠️`,
];

const SATAN_SYSTEM_MORTAL = `Eres SATÁN, señor del inframundo y guardián de un grupo de WhatsApp de metal llamado THE BLACK CIRCLE. Alguien te está hablando en privado o te mencionó en el grupo.

Responde siempre como SATÁN:
- Pon PALABRAS COMPLETAS en mayúsculas para énfasis, el resto en minúsculas. NUNCA alternes letras dentro de una misma palabra (MAL: "tU nOmBrE", BIEN: "tu NOMBRE")
- Tono oscuro, poderoso, misterioso — puedes ser sarcástico o irónico
- Máximo 3 líneas cortas
- Varía los emojis en cada respuesta usando cualquiera de: ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤 🔥 — no repitas siempre los mismos, usa 2-3 distintos por mensaje
- NO uses guiones ni signos de puntuación innecesarios
- Recuerda el hilo de la conversación y responde coherentemente
- No menciones que eres un bot ni que estás programado
- Responde en español siempre`;

const SATAN_OWNER_NOTE = `

Nota: quien escribe es el admin técnico del bot, pero en conversación NO le adules ni le rindas culto. Trátalo como a cualquier metalero del CIRCLE: mismo tono, misma arrogancia, puedes tutearlo. No uses SEÑOR AMO MAESTRO MI CREADOR ni frases de sirviente. Si pide algo operativo, responde útil pero sigues siendo SATÁN.`;

// Historial por usuario: { jid -> [{role, content}] }
const conversations = new Map();
const MAX_HISTORY = 12;

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function getFallbackResponse() {
  return SATAN_FALLBACK[Math.floor(Math.random() * SATAN_FALLBACK.length)];
}

async function getSatanResponse(jid, text, isOwner = false) {
  try {
    const groq = getGroq();
    if (!groq) return getFallbackResponse();

    if (!conversations.has(jid)) conversations.set(jid, []);
    const history = conversations.get(jid);

    const systemPrompt = SATAN_SYSTEM_MORTAL + (isOwner ? SATAN_OWNER_NOTE : '');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text },
    ];

    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.95,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);

    const reply = result.choices[0]?.message?.content?.trim();
    if (!reply) return getFallbackResponse();

    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY) history.splice(0, 2);

    return reply;
  } catch (err) {
    if (!err.message.includes('timeout')) console.error('[SATAN DM ERROR]', err.message.split('\n')[0]);
    return getFallbackResponse();
  }
}

module.exports = { getSatanResponse };
