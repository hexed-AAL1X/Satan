const Groq = require('groq-sdk');
const { groqWithRetry, hasGroqKey, GROQ_UNAVAILABLE_MSG } = require('../utils/groq-retry');

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

const conversations = new Map();
const MAX_HISTORY = 12;

let groqClient = null;
function getGroq() {
  if (!hasGroqKey()) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

async function getSatanResponse(jid, text, isOwner = false) {
  const groq = getGroq();
  if (!groq) return GROQ_UNAVAILABLE_MSG;

  if (!conversations.has(jid)) conversations.set(jid, []);
  const history = conversations.get(jid);

  const systemPrompt = SATAN_SYSTEM_MORTAL + (isOwner ? SATAN_OWNER_NOTE : '');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text },
  ];

  const reply = await groqWithRetry(async () => {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.95,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const out = result.choices[0]?.message?.content?.trim();
    if (!out || out.length < 2) throw new Error('respuesta vacía');
    return out;
  }, { attempts: 4, label: 'SATAN-DM' });

  if (!reply) return GROQ_UNAVAILABLE_MSG;

  history.push({ role: 'user', content: text });
  history.push({ role: 'assistant', content: reply });
  if (history.length > MAX_HISTORY) history.splice(0, 2);

  return reply;
}

module.exports = { getSatanResponse };
