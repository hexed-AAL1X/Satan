const Groq = require('groq-sdk');

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function stripDashes(s) {
  return String(s || '')
    .split('\n')
    .map((line) => line.replace(/[—–-]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .trim();
}

/** Textos de respaldo si no hay API o timeout (mismo tono que antes). */
const FB = {
  genre_reject: () =>
    `👁️ ese GÉNERO no vive acá ⚔️\n\n` +
    `esto es para METAL ROCK y lo que LOS NUESTROS sí mezclan en LATINOAMÉRICA: CUMBIA BACHATA SALSA 🤘\n\n` +
    `nada de TRAP REGGAETON KPOP REGGAE URBANO de radio 📵 reformula 🔱`,
  admin_denied: () => `☠️ solo los ADMINS pueden usar eso 🔱`,
  infra_fail: () => `☠️ los servidores del inframundo fallaron\nintenta de nuevo MORTAL 🖤`,
  ban_failed: (f) => `💀 no pude expulsar a @${f.targetKey} ¿soy admin del grupo? ⚔️`,
  usage: (f) => `⚔️ Uso: ${f.usage}\nEjemplo: ${f.example}`,
  rank_none: (f) => `⚔️ @${f.senderName}, aún no tienes aportes registrados. ¡Comparte algo! 🤘`,
  rank_card: (f) =>
    `${f.dataBlock}\n\n☠️ el CIRCLE te observa 🖤`,
  top_empty: () => `☠️ Nadie ha aportado esta semana aún. Sean los primeros. 🤘`,
  top_body: (f) =>
    `${f.dataBlock}\n\n💀 se reinicia cada lunes ¿dónde estás tú? 🤘`,
  ruleset: () => getRulesetMessage(),
  help: () =>
    `👁️ *COMANDOS DEL CIRCLE* ⚔️\n\n` +
    `🎖️ *!rank* — tu rango y puntos actuales\n` +
    `🏆 *!top* — ranking semanal de aportadores\n` +
    `🔥 *!streak* — tu racha de días aportando\n` +
    `🎵 *!band [nombre]* — info + imagen de una banda\n` +
    `💿 *!album [álbum] de [banda]* — portada + info\n` +
    `🩸 *!recomienda [género o descripción]* — culto metal rock o cumbia bachata salsa de la tribu\n` +
    `🎤 *!letra [canción] por [artista]* — letra + portada\n` +
    `☠️ *!trivia [facil|medio|dificil]* — pregunta de 30s\n` +
    `📜 *!ruleset* — reglas del CIRCLE\n` +
    `⚡ *!onthisday* — qué pasó hoy en la historia del metal\n\n` +
    `_Admins:_ *!mute @persona [horas]* · *!unmute @persona* · *!ban @persona*\n\n` +
    `🖤 el CIRCLE te observa ⛧`,
  streak_none: () => `⚔️ aún no tienes aportes registrados en el CIRCLE 🖤`,
  streak_0: (f) => `☠️ @${f.senderName} tu racha está en CERO\naporta algo hoy y empieza 🖤`,
  streak_1: (f) => `🕯️ @${f.senderName} llevas 1 día seguido aportando\nno pares ahora ⚔️`,
  streak_low: (f) => `⚔️ @${f.senderName} llevas *${f.streak} días* seguidos\nel CIRCLE lo nota 🦇`,
  streak_mid: (f) => `💀 @${f.senderName} *${f.streak} días* consecutivos\neso es DEDICACIÓN BRUTAL ☠️`,
  streak_high: (f) => `☠️ @${f.senderName} *${f.streak} días* seguidos aportando\nel inframundo te RECONOCE como GUERRERO 🩸⛧`,
  mute_ok: (f) =>
    `☠️ @${f.targetKey} silenciado por ${f.hours} hora${f.hours !== 1 ? 's' : ''}\nsus mensajes serán eliminados automáticamente ⚔️`,
  ban_ok: (f) => `🔱 @${f.targetKey} fue expulsado del CIRCLE\nel inframundo no perdona ☠️`,
  unmute_ok: (f) => `🖤 @${f.targetKey} ya puede hablar de nuevo en el CIRCLE 🤘`,
  owner_dm_sent: () => `🔱 reporte enviado al privado ☠️`,
  owner_help_sent: () => `🔱 ayuda enviada al privado`,
  owner_pro_ok: () => `🔱 grupo aprobado PERMANENTE ☠️`,
  owner_trial_ok: () => `⌛ modo TRIAL activado — 12h y me voy ☠️`,
  meme_caption: () => `🤘 meme del CIRCLE ☠️`,
  owner_help: (f) => f.panelBlock || '',
  owner_cancel: () => `👁️ acción cancelada`,
  owner_invalid_num: (f) =>
    `⚠️ número inválido responde entre 1 y ${f.maxNum} o "0" para cancelar`,
  owner_approve_dm: (f) => `🔱 *${f.name}* → aprobado PERMANENTE ☠️`,
  owner_degrade_dm: (f) => `⌛ *${f.name}* → TRIAL activado\nse irá en ~${f.remHours}h ☠️`,
  group_pro_broadcast: () =>
    `🔱 el SEÑOR ha autorizado mi presencia aquí de manera PERMANENTE\nel INFRAMUNDO es su guardián eterno ☠️ 🤘`,
  menu_fetch_error: (f) => `⚠️ no pude obtener grupos: ${f.error}`,
  kick_owner_confirm: (f) => `✅ salí de *${f.groupName}* con mensaje de despedida ☠️`,
  reco_empty: () => `☠️ no encontré nada esta vez\nintenta de nuevo MORTAL 🖤`,
  owner_menu_list: (f) => f.rawBlock || '',
  groups_report: (f) => f.rawBlock || '',
  group_not_found: (f) => `👁️ no encontré ningún grupo con "${f.query}"`,
  unapprove_ok: (f) => `⚔️ *${f.subject}* → desaprobado`,
  lookup_invoking: (f) => `👁️ invocando ${f.kind} de *${f.query}* ☠️`,
  band_not_found: (f) => `☠️ no encontré info sobre *${f.band}* en el inframundo 💀`,
  album_not_found: (f) => `☠️ no encontré info sobre *${f.query}* en el inframundo 💀`,
  lyrics_not_found: (f) =>
    `☠️ no encontré letra de *${f.song}* en el inframundo 💀\nusa: !letra [canción] por [artista]`,
  private_catalog_ack: () => `📜 catálogo privado enviado a tu chat ☠️`,
  test_started_ack: () =>
    `⚔️ batería *!test* lanzada\nmirá TU PRIVADO con el bot 👁️\npuede tardar varios MINUTOS ☠️`,
  test_must_private: () =>
    `👁️ *!test* solo funciona escribiendo al bot en PRIVADO\nno desde el grupo ☠️`,
};

const SCENARIO_HINTS = {
  genre_reject:
    'Un usuario pidió género o estilo fuera del CIRCLE (trap kpop reggaeton reggae dembow etc). Rechazo corto e indignado. Di que aquí es METAL ROCK y que CUMBIA BACHATA SALSA sí entran como lo que la tribu latina cruza. Prohibido carácter guión. Palabras clave en MAYÚSCULAS sueltas. 3 a 6 líneas. sin decir que eres IA.',
  admin_denied:
    'Un no admin intentó comando de moderación. Respuesta muy corta de rechazo en voz SATÁN. Sin guión. 1 emoji.',
  infra_fail: 'Servicio externo falló. Frase corta oscura invitando a reintentar. Sin guión.',
  ban_failed:
    'No pudiste expulsar; quizá el bot no es admin. Menciona al usuario @{{targetKey}} en el texto con arroba y número. Sin guión.',
  usage:
    'Debes enseñar uso del comando. Incluye LITERAL en el mensaje las dos líneas exactas: "Uso: {{usage}}" y "Ejemplo: {{example}}" (con el texto que te paso en facts). Puedes añadir UNA frase corta SATÁN antes o después. Sin guión.',
  rank_none:
    'Usuario sin aportes. Anima a compartir música. Menciona @{{senderName}} con arroba. Sin guión.',
  rank_card:
    'Escribe UNA frase corta de SATÁN como intro (1 línea, oscura, con emoji). Luego pega EXACTO el bloque de datos que está en facts.dataBlock SIN modificar ninguna línea, emoji, número ni asterisco. Al final puedes añadir 1 frase corta de cierre. Sin guión.',
  top_empty: 'Ranking vacío esta semana. Motiva sin guión.',
  top_body:
    'Escribe UNA frase corta de SATÁN como intro (1 línea, oscura). Luego pega EXACTO el bloque de datos que está en facts.dataBlock SIN modificar ninguna línea, emoji, medalla, número ni asterisco. Al final añade 1 frase corta de cierre. Sin guión.',
  ruleset:
    'OBSOLETO: no reescribir reglas. Usa getRulesetMessage() estático.',
  help:
    'Te paso lista exacta de comandos en facts.helpBlock. Debes reproducir esa lista ÍNTEGRA al final del mensaje (puedes añadir 1 línea SATÁN al inicio). Sin inventar comandos nuevos. Sin guión.',
  streak_none:
    'Usuario sin fila en base de datos de aportes. Frase oscura corta sin mencionar base de datos técnica. Usa senderName del JSON facts.',
  streak_0: 'Racha cero motivación. Sin guión. Menciona @{{senderName}}.',
  streak_1: 'Un día de racha elogio breve @{{senderName}}.',
  streak_low: 'Racha {{streak}} días párrafo breve datos exactos.',
  streak_mid: 'Racha {{streak}} mayor elogio duro datos exactos.',
  streak_high: 'Racha {{streak}} épica GUERRERO datos exactos @{{senderName}}.',
  mute_ok:
    'Confirmación silencio {{hours}} horas para @{{targetKey}} eliminar mensajes automático tono SATÁN.',
  ban_ok: 'Confirmación expulsión @{{targetKey}}.',
  unmute_ok: 'Confirmación puede hablar @{{targetKey}}.',
  owner_dm_sent: 'Aviso corto: reporte ya en privado. Tono SATÁN directo sin adular.',
  owner_help_sent: 'Aviso corto: ayuda en privado. Sin reverencia.',
  owner_pro_ok: 'Grupo permanente confirmado. Tono seco SATÁN.',
  owner_trial_ok: 'Trial 12 h activado. Anuncio crudo corto.',
  meme_caption: 'Pie de imagen meme para metaleros 4 a 8 palabras 1 emoji humor oscuro.',
  owner_help:
    'Panel admin. Incluye facts.panelBlock completo. Tono SATÁN normal sin adular.',
  owner_cancel: 'Menú cancelado. Frase corta sin reverencia.',
  owner_invalid_num:
    'Número fuera de rango. Di que responda entre 1 y {{maxNum}} o 0 cancelar. Sin guión.',
  owner_approve_dm:
    'Confirmación grupo {{name}} aprobado permanente. Datos exactos tono directo.',
  owner_degrade_dm:
    'Confirmación trial para {{name}} ~{{remHours}}h restantes. Datos exactos.',
  group_pro_broadcast:
    'Mensaje al grupo: presencia permanente autorizada. Tono SATÁN breve.',
  menu_fetch_error: 'Error al listar grupos menciona error técnico facts.error breve.',
  kick_owner_confirm:
    'Confirmación: saliste de {{groupName}} con despedida enviada. Tono seco.',
  reco_empty: 'No hay resultados de recomendaciones ahora invita a reintentar otro estilo del CIRCLE muy breve sin guión.',
  owner_menu_list:
    'Menú admin. Conserva PALABRA POR PALABRA facts.rawBlock. Una línea SATÁN al inicio o final sin adular.',
  groups_report:
    'Reporte grupos. Conserva PALABRA POR PALABRA facts.rawBlock. Frase corta al inicio tono SATÁN normal.',
  group_not_found:
    'No encontraste grupos con ese nombre. Datos exactos: búsqueda era {{query}}. Menciona esa cadena. Sin guión.',
  unapprove_ok: 'Confirmación desaprobado datos exactos grupo {{subject}}.',
  lookup_invoking:
    'Frase cortísima de que estás invocando algo. Usa kind={{kind}} y query={{query}} con asterisco en el nombre si aplica.',
  band_not_found: 'No hay info de banda {{band}} muy breve.',
  album_not_found: 'No hay info de álbum/consulta {{query}} muy breve.',
  lyrics_not_found:
    'Sin letra para canción {{song}}. Di que prueben con !letra canción por artista. Incluye esa línea de uso literal al final.',
  private_catalog_ack:
    'Confirmación: catálogo enviado al privado. Frase SATÁN corta sin adular.',
  test_started_ack:
    'Confirmas batería !test en curso, mirar privado. Corto tono SATÁN normal.',
  test_must_private:
    '!test solo en DM. Rechazo breve directo sin reverencia.',
};

function interpolate(template, facts) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, k) => (facts[k] != null ? String(facts[k]) : ''));
}

const RULESET_INTROS = [
  '⛧ *REGLAS DEL INFRAMUNDO* ⛧\n_el CIRCLE observa cada palabra_ 👁️',
  '👁️ *PACTO DE SANGRE DEL CIRCLE* 🩸\n_lee o sé devorado_ ☠️',
  '🔱 *CÓDIGO DEL INFRAMUNDO* 🔱\n_SATÁN no negocia con los débiles_ ⛧',
];

const RULESET_BODY =
  '⚔️ *1.* Honra a tus *HERMANOS* del metal — aquí el respeto pesa más que el volumen\n' +
  '🦇 *2.* Cero links de otros grupos de WhatsApp — *3 strikes* y el inframundo te traga\n' +
  '☠️ *3.* Los *APORTADORES* son la esencia — quien comparte sube, quien vampiriza cae\n' +
  '🤘 *4.* Todo subgénero del metal tiene su templo — doom black thrash death grind\n' +
  '🖤 *5.* Prohibido spam y publicidad — no conviertas el culto en mercado\n' +
  '🔱 *6.* SATÁN vigila y modera — no intentes engañar al sistema _te estamos viendo_ 💀';

/** Reglas fijas con tono SATÁN — sin Groq (la IA las dejaba planas y sin emojis). */
function getRulesetMessage() {
  const intro = RULESET_INTROS[Math.floor(Math.random() * RULESET_INTROS.length)];
  return `${intro}\n\n${RULESET_BODY}\n\n_viola las reglas y el inframundo te reclama_ ⛧`;
}

/**
 * Mensaje SATÁN vía Groq o fallback estático.
 * @param {string} scenario — clave de SCENARIO_HINTS
 * @param {Record<string, string|number>} facts
 */
async function satanGroqMessage(scenario, facts = {}) {
  const fb = FB[scenario] ? FB[scenario](facts) : '☠️ el CIRCLE observa ⚔️';
  const groq = getGroq();
  if (!groq) return fb;

  let hint = SCENARIO_HINTS[scenario] || 'Mensaje corto SATÁN según facts JSON.';
  if (typeof hint === 'string') hint = interpolate(hint, facts);

  const factsJson = JSON.stringify(facts, null, 0);
  const sys = `Eres SATÁN señor del inframundo y del CIRCLE de metal en WhatsApp. Tus mensajes en español.
Siempre cumple: sin carácter guión ASCII ni guiones largos; no digas que eres IA; tono oscuro metalero.
En escenarios owner_* hablas con el admin del bot: mismo tono que con el grupo, directo, sin adular ni decir SEÑOR AMO MAESTRO.
Responde SOLO JSON: {"text":"tu mensaje aquí con saltos de línea reales como \\n"}`;

  const user = `Escenario: ${scenario}\nInstrucción: ${hint}\nDatos hechos (no inventes otros): ${factsJson}`;

  try {
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.88,
        max_tokens: ['help', 'ruleset', 'top_body', 'owner_help', 'groups_report', 'owner_menu_list'].includes(
          scenario
        )
          ? 900
          : 400,
        response_format: { type: 'json_object' },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    const raw = result.choices[0]?.message?.content?.trim() || '';
    let text = '';
    try {
      text = JSON.parse(raw).text?.trim() || '';
    } catch (_) {
      const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      text = m ? JSON.parse(`"${m[1]}"`) : '';
    }
    text = stripDashes(text).replace(/\\n/g, '\n');
    if (!text || text.length < 4) return fb;
    return text;
  } catch (e) {
    if (!String(e.message || e).includes('timeout')) console.error('[GROQ-COPY]', scenario, (e.message || '').slice(0, 80));
    return fb;
  }
}

/** Mismo texto que !help (Groq + bloque de respaldo idéntico). */
async function getCommandHelpMessage() {
  return satanGroqMessage('help', { helpBlock: FB.help() });
}

module.exports = {
  satanGroqMessage,
  getCommandHelpMessage,
  getRulesetMessage,
  stripDashes,
  FB,
};
