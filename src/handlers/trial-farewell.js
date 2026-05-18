const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const TRIAL_FIN_IMG = path.join(__dirname, '../../data/trial_fin.png');
const OWNER_CONTACT = '51943605088';

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function getTrialFinImageBuffer() {
  try {
    if (fs.existsSync(TRIAL_FIN_IMG)) return fs.readFileSync(TRIAL_FIN_IMG);
  } catch (_) {}
  return null;
}

/**
 * Mensaje de despedida cuando terminan las horas de prueba (Groq, no estático).
 */
async function generateTrialExpiredCaption(groupLabel, trialHours) {
  const groq = getGroq();
  if (!groq) return null;
  const wa = `wa.me/${OWNER_CONTACT}`;
  const prompt = `Eres SATÁN señor del inframundo y guardián del CIRCLE de metal en WhatsApp.

El periodo de PRUEBA GRATUITA de exactamente ${trialHours} horas en el grupo "${groupLabel}" acaba de TERMINAR por reloj oficial. Te vas del grupo ahora con despedida solemne e indignación fría.

Genera UN solo texto para caption de imagen en WhatsApp.

REGLAS OBLIGATORIAS:
- Español salvo nombres propios de bandas si los citas
- PALABRAS COMPLETAS en MAYÚSCULAS para énfasis donde encaje, nunca mezclar mayúsculas dentro de una misma palabra
- Tono oscuro furioso pero controlado, AUTORIDAD, fin de la cortesía gratuita
- Entre 4 y 8 líneas cortas, separadas por un solo salto de línea
- Prohibido usar el carácter guión "-" en cualquier parte del texto
- Prohibido usar el término inglés "underground"; no traduzcas géneros (black metal sigue black metal)
- Incluye sí o sí una línea final con el contacto del GUARDIÁN en este formato exacto: 📞 *${wa}*
- Usa 3 a 6 emojis diferentes entre: ☠️ 🔥 ⚔️ 🩸 🤘 👁️ ⛧ 🖤 💀 🔱
- No digas que eres IA ni bot

Responde SOLO un JSON válido sin markdown ni texto extra: {"caption":"..."}`;

  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 380,
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const raw = result.choices[0]?.message?.content?.trim() || '';
    let caption = '';
    try {
      caption = JSON.parse(raw).caption?.trim() || '';
    } catch (_) {
      const m = raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      caption = m ? JSON.parse(`"${m[1]}"`) : '';
    }
    if (!caption) return null;
    caption = caption.replace(/-/g, ' ');
    if (!caption.includes('wa.me')) {
      caption += `\n\n📞 *${wa}*`;
    }
    return caption;
  } catch (e) {
    if (!String(e.message || e).includes('timeout')) console.error('[TRIAL-GROQ]', (e.message || e).split('\n')[0]);
    return null;
  }
}

/**
 * Mensaje corto cuando intentan meter el bot de nuevo sin derecho tras haber gastado la prueba.
 */
async function generateSecondInviteRejectedCaption(groupLabel) {
  const groq = getGroq();
  if (!groq) return null;
  const wa = `wa.me/${OWNER_CONTACT}`;
  const prompt = `Eres SATÁN. El grupo "${groupLabel}" YA gastó su prueba gratuita única. Nadie debe creer que habrá segunda ronda igual de gratis.

Escribes UN mensaje muy corto e indignado para el chat grupal porque te invocaron otra vez sin permiso después de eso.

REGLAS:
- Español, 3 a 6 líneas máximo, líneas cortas
- MAYÚSCULAS en PALABRAS ENTERAS donde enfatice furia
- Prohibido el carácter guión "-"
- Incluye en alguna línea: 📞 *${wa}*
- 3 a 5 emojis variados (☠️ 🔥 ⚔️ 🩸 🤘 👁️ ⛧)
- No menciones IA
- No digas "underground"

Solo JSON: {"caption":"..."}`;

  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.92,
        max_tokens: 280,
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const raw = result.choices[0]?.message?.content?.trim() || '';
    let caption = '';
    try {
      caption = JSON.parse(raw).caption?.trim() || '';
    } catch (_) {
      const m = raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      caption = m ? JSON.parse(`"${m[1]}"`) : '';
    }
    if (!caption) return null;
    caption = caption.replace(/-/g, ' ');
    if (!caption.includes('wa.me')) caption += `\n\n📞 *${wa}*`;
    return caption;
  } catch (e) {
    if (!String(e.message || e).includes('timeout')) console.error('[TRIAL-REINV-GROQ]', (e.message || e).split('\n')[0]);
    return null;
  }
}

/**
 * Envía imagen + caption (Groq o fallback), espera delayMs y NO hace leave/cleanup (eso lo llama index.js o commands).
 */
async function sendTrialExpiredFarewell(sock, gid, opts) {
  const { trialHours, getFallbackCaption, delayBeforeLeaveMs = 4000 } = opts;
  let groupName = gid;
  try {
    const meta = await sock.groupMetadata(gid);
    groupName = meta?.subject || gid;
  } catch (_) {}
  let caption = await generateTrialExpiredCaption(groupName, trialHours).catch(() => null);
  if (!caption && typeof getFallbackCaption === 'function') caption = getFallbackCaption();
  if (!caption) caption = '⌛ tiempo AGOTADO 🔱 contacten al GUARDIÁN 📞 *wa.me/51943605088* ☠️';
  const img = getTrialFinImageBuffer();
  try {
    if (img && img.length) await sock.sendMessage(gid, { image: img, caption });
    else await sock.sendMessage(gid, { text: caption });
    await new Promise(r => setTimeout(r, delayBeforeLeaveMs));
  } catch (e) {
    console.error('[TRIAL-FAREWELL-SEND]', e.message);
    try {
      await sock.sendMessage(gid, { text: caption });
      await new Promise(r => setTimeout(r, delayBeforeLeaveMs));
    } catch (_) {}
  }
}

module.exports = {
  getTrialFinImageBuffer,
  generateTrialExpiredCaption,
  generateSecondInviteRejectedCaption,
  sendTrialExpiredFarewell,
  TRIAL_FIN_IMG,
};
