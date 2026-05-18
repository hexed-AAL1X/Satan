const Groq = require('groq-sdk');
const { TRIVIA } = require('../../data/content');
const { getState, setState, addContribution, upsertUser } = require('../db');
const { sendWithTyping } = require('../utils/typing');

const PTS_FIRST_CORRECT = 5;
const PTS_COMPLETE_BONUS = 15;

// Instrucción de estilo fija para TODOS los prompts de Groq
const CAPS_RULE = `REGLA DE ESCRITURA: pon PALABRAS COMPLETAS en mayúsculas para énfasis, el resto en minúsculas. NUNCA alternes mayúsculas y minúsculas dentro de una misma palabra. CORRECTO: "tu RESPUESTA está MAL". INCORRECTO: "tU rEsPuEsTa".`;
const NO_DASH = `No uses guiones ni rayas (ni - ni — ni –) para nada.`;

let groqClient = null;
function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

// --- Taunt para respuesta incorrecta (sin revelar la respuesta) ---
const WRONG_FALLBACK = [
  `NO ☠️ @{name} eso no era\nel INFRAMUNDO se ríe de ti ahora mismo 💀`,
  `🦇 @{name} fallaste\nhasta los mortales más básicos lo saben ⚔️`,
  `INCORRECTO @{name} 👁️\nel CIRCLE te observa con lástima 🖤`,
  `jajaja 🩸 @{name} ni cerca\npiénsalo mejor la próxima vez ☠️`,
  `ese no era @{name} 💀\nSATÁN esperaba más de ti ⛧`,
];

const EMOJI_POOL = ['☠️','⚔️','🦇','💀','👁️','🩸','⛧','🤘','🔱','🖤','🔥'];
function randEmoji() { return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]; }

async function getWrongAnswerTaunt(name) {
  try {
    const groq = getGroq();
    if (!groq) throw new Error('no groq');
    const e1 = randEmoji(), e2 = randEmoji();
    const prompt = `${CAPS_RULE} ${NO_DASH}
Eres SATÁN burlándote de alguien llamado "@${name}" que respondió MAL una trivia de metal.
Burla breve: máximo 1 línea. Menciona a @${name}. NO digas cuál era la respuesta correcta.
USA SOLO ESTOS EMOJIS: ${e1} ${e2} — ponlos dentro del texto. Oscuro, sarcástico, vivo. Solo el mensaje.`;
    const result = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.2,
        max_tokens: 60,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    const txt = result.choices[0]?.message?.content?.trim();
    return txt ? txt.replace(/\s*[—–-]+\s*/g, ' ').trim() : null;
  } catch {
    return null;
  }
}

// --- !trivia --- (una pregunta, 30s, dificultad opcional, sin puntaje)
const DIFF_LABELS = { facil: 'fácil', medio: 'media', dificil: 'difícil' };
const activeSingleTrivia = new Map(); // groupJid → { question, answer, timeout, answered }

async function generateTriviaQuestion(difficulty) {
  const groq = getGroq();
  if (!groq) return null;
  const diffs = ['fácil', 'media', 'difícil'];
  const diff = DIFF_LABELS[difficulty] || diffs[Math.floor(Math.random() * diffs.length)];

  const prompt = `Genera una pregunta de trivia sobre metal de dificultad "${diff}".
Responde ÚNICAMENTE con JSON válido sin texto extra ni markdown:
{"question":"...","options":["A) ...","B) ...","C) ..."],"answer":0,"difficulty":"${diff}","explanation":"breve explicación de la respuesta correcta"}
donde "answer" es el índice (0=A, 1=B, 2=C) de la opción correcta.`;
  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 200,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    const raw = r.choices[0]?.message?.content?.trim();
    const jsonMatch = raw?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch { return null; }
}

function getRandomStaticTrivia() {
  const lastIdx = parseInt(getState('last_single_trivia_idx') || '-1');
  const candidates = TRIVIA.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  setState('last_single_trivia_idx', idx);
  return TRIVIA[idx];
}

async function startTrivia(sock, groupJid, difficulty) {
  if (activeSingleTrivia.has(groupJid) || activeMetalQuiz.has(groupJid)) {
    await sendWithTyping(sock, groupJid, '👁️ ya hay una trivia activa espera que termine');
    return null;
  }

  let q;
  if (difficulty) {
    q = await generateTriviaQuestion(difficulty);
  }
  if (!q) q = getRandomStaticTrivia();

  const diffLabel = q.difficulty ? ` · dificultad ${q.difficulty}` : '';
  const msg = `☠️ TRIVIA METAL${diffLabel} ☠️\n\n${q.question}\n\n${q.options.join('\n')}\n\n_tienes 30 segundos 💀_`;
  await sendWithTyping(sock, groupJid, msg);

  const timeout = setTimeout(async () => {
    if (!activeSingleTrivia.has(groupJid)) return;
    activeSingleTrivia.delete(groupJid);
    await sendWithTyping(sock, groupJid, `⏰ tiempo agotado 💀\nnadie acertó esta vez\n¿lo sabías? 🔱`);
  }, 30000);

  activeSingleTrivia.set(groupJid, { ...q, timeout, answered: new Set() });
  return null;
}

async function checkSingleTriviaAnswer(sock, groupJid, senderJid, senderName, text) {
  const session = activeSingleTrivia.get(groupJid);
  if (!session) return false;

  const normalized = text.trim().toUpperCase().replace(')', '');
  if (!['A', 'B', 'C'].includes(normalized)) return false;

  if (session.answered.has(senderJid)) return true;
  session.answered.add(senderJid);

  const answerIdx = ['A', 'B', 'C'].indexOf(normalized);

  if (answerIdx === session.answer) {
    clearTimeout(session.timeout);
    activeSingleTrivia.delete(groupJid);
    await sendWithTyping(sock, groupJid, {
      text: `⚔️ @${senderName} CORRECTO 🔱\n_${session.explanation || ''}_`,
      mentions: [senderJid],
    });
  } else {
    const taunt = await getWrongAnswerTaunt(senderName) ||
      WRONG_FALLBACK[Math.floor(Math.random() * WRONG_FALLBACK.length)].replace('{name}', senderName);
    await sendWithTyping(sock, groupJid, { text: taunt, mentions: [senderJid] });
  }
  return true;
}

// --- !metalquiz --- (3 preguntas, sin timer, con puntaje, usado en scheduler y comando oculto)
const activeMetalQuiz = new Map();

function pickThreeQuestions() {
  const shuffled = [...TRIVIA].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function buildQuestionMsg(q, num) {
  return `☠️ PREGUNTA ${num}/3 ☠️\n\n${q.question}\n\n${q.options.join('\n')}\n\n_responde A, B o C 💀_`;
}

async function startMetalQuiz(sock, groupJid) {
  if (activeMetalQuiz.has(groupJid) || activeSingleTrivia.has(groupJid)) {
    await sendWithTyping(sock, groupJid, '👁️ ya hay una trivia activa espera que termine');
    return null;
  }

  const questions = pickThreeQuestions();
  activeMetalQuiz.set(groupJid, {
    questions,
    currentQ: 0,
    answered: new Set(),
    correctlyAnswered: new Set(), // set de números de pregunta que ya alguien acertó
    scores: new Map(),
    firstFinisher: null,
  });

  const intro = `⚔️ METAL QUIZ 3 PREGUNTAS ⚔️\n\nPrimero en acertar las 3 gana BONUS de ${PTS_COMPLETE_BONUS} pts 🔱\nCada respuesta correcta suma ${PTS_FIRST_CORRECT} pts ☠️\nSin tiempo límite 💀`;
  await sendWithTyping(sock, groupJid, intro);
  await new Promise(r => setTimeout(r, 1500));
  await sendWithTyping(sock, groupJid, buildQuestionMsg(questions[0], 1));
  return null;
}

async function checkMetalQuizAnswer(sock, groupJid, senderJid, senderName, text) {
  const session = activeMetalQuiz.get(groupJid);
  if (!session) return false;

  const normalized = text.trim().toUpperCase().replace(')', '');
  if (!['A', 'B', 'C'].includes(normalized)) return false;

  const answerIdx = ['A', 'B', 'C'].indexOf(normalized);
  const q = session.questions[session.currentQ];
  const key = senderJid + ':' + session.currentQ;

  if (session.answered.has(key)) return true;
  session.answered.add(key);

  if (!session.scores.has(senderJid)) {
    session.scores.set(senderJid, { name: senderName, pts: 0, correct: 0 });
  }
  const score = session.scores.get(senderJid);

  if (answerIdx === q.answer) {
    // Primero en acertar = nadie había acertado esta pregunta aún
    const firstThisQ = !session.correctlyAnswered.has(session.currentQ);
    session.correctlyAnswered.add(session.currentQ);

    score.correct += 1;
    upsertUser(senderJid, senderName, groupJid);
    addContribution(senderJid, 'trivia_correct', PTS_FIRST_CORRECT, `Metal Quiz Q${session.currentQ + 1}`, groupJid);
    score.pts += PTS_FIRST_CORRECT;

    if (score.correct === 3 && !session.firstFinisher) {
      session.firstFinisher = senderJid;
      addContribution(senderJid, 'trivia_winner', PTS_COMPLETE_BONUS, 'Metal Quiz completado primero', groupJid);
      score.pts += PTS_COMPLETE_BONUS;
      await sendWithTyping(sock, groupJid, {
        text: `🔱 @${senderName} COMPLETÓ LAS 3 PRIMERO\n+${PTS_COMPLETE_BONUS} pts BONUS total ${score.pts} pts ☠️`,
        mentions: [senderJid],
      });
    } else if (firstThisQ) {
      await sendWithTyping(sock, groupJid, {
        text: `✅ @${senderName} PRIMERO en acertar +${PTS_FIRST_CORRECT} pts 🤘`,
        mentions: [senderJid],
      });
    } else {
      await sendWithTyping(sock, groupJid, {
        text: `✅ @${senderName} correcto +${PTS_FIRST_CORRECT} pts`,
        mentions: [senderJid],
      });
    }

    // Avanzar pregunta cuando el primero acierte
    if (firstThisQ) {
      await new Promise(r => setTimeout(r, 1000));
      await sendWithTyping(sock, groupJid, `📖 ${q.explanation}`);

      if (session.currentQ < 2) {
        session.currentQ += 1;
        await new Promise(r => setTimeout(r, 1200));
        await sendWithTyping(sock, groupJid, buildQuestionMsg(session.questions[session.currentQ], session.currentQ + 1));
      } else {
        await new Promise(r => setTimeout(r, 800));
        const summary = [...session.scores.entries()]
          .filter(([, s]) => s.correct > 0)
          .sort(([, a], [, b]) => b.pts - a.pts)
          .slice(0, 5)
          .map(([, s], i) => `  ${i + 1}. ${s.name} ${s.correct}/3 correctas ${s.pts} pts`)
          .join('\n');
        await sendWithTyping(sock, groupJid,
          `☠️ QUIZ TERMINADO ☠️\n\n${summary || 'nadie completó todo'}\n\n${session.firstFinisher ? '' : '💀 nadie acertó las 3 para el próximo round 🖤'}`
        );
        activeMetalQuiz.delete(groupJid);
      }
    }

  } else {
    const taunt = await getWrongAnswerTaunt(senderName) ||
      WRONG_FALLBACK[Math.floor(Math.random() * WRONG_FALLBACK.length)].replace('{name}', senderName);
    await sendWithTyping(sock, groupJid, { text: taunt, mentions: [senderJid] });
  }

  return true;
}

async function checkTriviaAnswer(sock, groupJid, senderJid, senderName, text) {
  if (await checkSingleTriviaAnswer(sock, groupJid, senderJid, senderName, text)) return true;
  if (await checkMetalQuizAnswer(sock, groupJid, senderJid, senderName, text)) return true;
  return false;
}

module.exports = { startTrivia, startMetalQuiz, checkTriviaAnswer, activeSingleTrivia, activeMetalQuiz };
