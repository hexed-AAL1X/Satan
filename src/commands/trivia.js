const Groq = require('groq-sdk');
const { TRIVIA } = require('../../data/content');
const { getState, setState, addContribution, upsertUser } = require('../db');
const { sendWithTyping } = require('../utils/typing');
const { parseGroqJsonObject } = require('../utils/groq-json');
const { KEYS, MAX, remember, exclusionBlock, loadList } = require('../utils/content-history');

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

// --- Trivia / Metal Quiz — generación Groq ---
const DIFF_LABELS = { facil: 'fácil', medio: 'media', dificil: 'difícil' };
const DIFF_KEYS = ['facil', 'medio', 'dificil'];

function resolveDifficulty(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  return DIFF_LABELS[key] || DIFF_LABELS[DIFF_KEYS[Math.floor(Math.random() * DIFF_KEYS.length)]];
}

function normalizeTriviaQuestion(data, difficultyLabel) {
  if (!data?.question || !Array.isArray(data.options) || data.options.length !== 3) return null;
  const answer = typeof data.answer === 'number' ? data.answer : parseInt(data.answer, 10);
  if (![0, 1, 2].includes(answer)) return null;

  const options = data.options.map((o, i) => {
    const letter = ['A', 'B', 'C'][i];
    const stripped = String(o).replace(/^[A-C]\)\s*/i, '').trim();
    if (!stripped) return null;
    return `${letter}) ${stripped}`;
  });
  if (options.some((o) => !o)) return null;

  const question = String(data.question).trim();
  if (question.length < 12) return null;

  return {
    question,
    options,
    answer,
    explanation: String(data.explanation || '').trim() || 'respuesta correcta ☠️',
    difficulty: data.difficulty || difficultyLabel || null,
  };
}

function isDuplicateQuestion(question, seen) {
  const key = String(question || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!key) return true;
  if (seen.has(key)) return true;
  const recent = loadList(KEYS.quiz).map((x) => String(x).toLowerCase());
  return recent.some((r) => r.includes(key.slice(0, 40)) || key.includes(r.slice(0, 40)));
}

async function groqTriviaJson(prompt, maxTokens = 220) {
  const groq = getGroq();
  if (!groq) return null;
  try {
    const r = await Promise.race([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const raw = r.choices[0]?.message?.content?.trim();
    return parseGroqJsonObject(raw) || (() => {
      const jsonMatch = raw?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      try { return JSON.parse(jsonMatch[0]); } catch { return null; }
    })();
  } catch {
    return null;
  }
}

async function generateTriviaQuestion(difficulty, extraExclude = '') {
  const diff = resolveDifficulty(difficulty);
  const exclude = exclusionBlock(KEYS.quiz, 'Preguntas ya usadas (NO repetir tema ni redacción)', 35);

  const prompt = `Genera UNA pregunta de trivia sobre metal extremo/rock pesado de dificultad "${diff}".
Debe ser factual y verificable. Evita datos ambiguos o fechas inventadas.
${exclude}${extraExclude}
JSON válido únicamente sin markdown:
{"question":"...","options":["A) ...","B) ...","C) ..."],"answer":0,"difficulty":"${diff}","explanation":"breve explicación de la respuesta correcta"}
"answer" es el índice (0=A, 1=B, 2=C) de la opción correcta.`;

  const data = await groqTriviaJson(prompt, 220);
  return normalizeTriviaQuestion(data, diff);
}

async function generateMetalQuizQuestions(difficulty) {
  const diff = resolveDifficulty(difficulty);
  const exclude = exclusionBlock(KEYS.quiz, 'Preguntas ya usadas (NO repetir tema ni redacción)', 40);
  const seen = new Set();
  const out = [];

  const batchPrompt = `Genera EXACTAMENTE 3 preguntas DIFERENTES de trivia sobre metal extremo/rock pesado.
Las 3 deben ser de dificultad "${diff}". Cada una factual y verificable.
Mezcla subgéneros (thrash, death, black, doom, grind, etc.) y regiones distintas.
${exclude}
JSON válido únicamente:
{"questions":[
  {"question":"...","options":["A) ...","B) ...","C) ..."],"answer":0,"explanation":"..."},
  {"question":"...","options":["A) ...","B) ...","C) ..."],"answer":1,"explanation":"..."},
  {"question":"...","options":["A) ...","B) ...","C) ..."],"answer":2,"explanation":"..."}
]}
"answer" es índice 0=A, 1=B, 2=C. Las 3 preguntas deben ser distintas entre sí.`;

  const batch = await groqTriviaJson(batchPrompt, 650);
  const rawList = Array.isArray(batch?.questions) ? batch.questions : [];

  for (const item of rawList) {
    const q = normalizeTriviaQuestion(item, diff);
    if (!q || isDuplicateQuestion(q.question, seen)) continue;
    seen.add(q.question.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100));
    out.push(q);
    if (out.length >= 3) break;
  }

  for (let attempt = 0; out.length < 3 && attempt < 4; attempt += 1) {
    const extra = out.length
      ? `\nYa generaste estas (NO repetir): ${out.map((q) => q.question.slice(0, 60)).join(' · ')}.`
      : '';
    const q = await generateTriviaQuestion(difficulty, extra);
    if (!q || isDuplicateQuestion(q.question, seen)) continue;
    seen.add(q.question.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100));
    out.push(q);
  }

  return out.length >= 3 ? out.slice(0, 3) : null;
}

function rememberQuizQuestions(questions) {
  for (const q of questions) {
    remember(KEYS.quiz, q.question.slice(0, 120), MAX.quiz);
  }
}

function getRandomStaticTrivia() {
  const lastIdx = parseInt(getState('last_single_trivia_idx') || '-1');
  const recent = loadList(KEYS.quiz).map((x) => String(x).toLowerCase());
  const candidates = TRIVIA.map((_, i) => i).filter((i) => {
    if (i === lastIdx) return false;
    const q = TRIVIA[i].question.toLowerCase();
    return !recent.some((r) => r.includes(q.slice(0, 30)) || q.includes(r.slice(0, 30)));
  });
  const pool = candidates.length ? candidates : TRIVIA.map((_, i) => i).filter((i) => i !== lastIdx);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  setState('last_single_trivia_idx', idx);
  return TRIVIA[idx];
}

function pickThreeStaticQuestions() {
  const recent = loadList(KEYS.quiz).map((x) => String(x).toLowerCase());
  const shuffled = [...TRIVIA].sort(() => Math.random() - 0.5);
  const picked = [];
  for (const q of shuffled) {
    const key = q.question.toLowerCase();
    if (recent.some((r) => r.includes(key.slice(0, 30)) || key.includes(r.slice(0, 30)))) continue;
    picked.push(q);
    if (picked.length >= 3) break;
  }
  if (picked.length < 3) {
    const rest = shuffled.filter((q) => !picked.includes(q));
    picked.push(...rest.slice(0, 3 - picked.length));
  }
  return picked.slice(0, 3);
}

// --- !trivia --- (una pregunta, 30s, dificultad opcional, sin puntaje)
const activeSingleTrivia = new Map();

async function startTrivia(sock, groupJid, difficulty) {
  if (activeSingleTrivia.has(groupJid) || activeMetalQuiz.has(groupJid)) {
    await sendWithTyping(sock, groupJid, '👁️ ya hay una trivia activa espera que termine');
    return null;
  }

  let q;
  if (getGroq()) {
    q = await generateTriviaQuestion(difficulty);
    if (q) remember(KEYS.quiz, q.question.slice(0, 120), MAX.quiz);
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
      text: `⚔️ @${senderJid.split('@')[0]} CORRECTO 🔱\n_${session.explanation || ''}_`,
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

function buildQuestionMsg(q, num) {
  return `☠️ PREGUNTA ${num}/3 ☠️\n\n${q.question}\n\n${q.options.join('\n')}\n\n_responde A, B o C 💀_`;
}

function cancelSingleTrivia(groupJid) {
  const session = activeSingleTrivia.get(groupJid);
  if (!session) return false;
  clearTimeout(session.timeout);
  activeSingleTrivia.delete(groupJid);
  return true;
}

function cancelMetalQuiz(groupJid) {
  return activeMetalQuiz.delete(groupJid);
}

async function startMetalQuiz(sock, groupJid, opts = {}) {
  const forceReplace = opts.forceReplace === true;
  const hasMetal = activeMetalQuiz.has(groupJid);
  const hasSingle = activeSingleTrivia.has(groupJid);

  if (hasMetal || hasSingle) {
    if (forceReplace) {
      cancelMetalQuiz(groupJid);
      cancelSingleTrivia(groupJid);
      await sendWithTyping(sock, groupJid, '⌛ ronda anterior cancelada — METAL QUIZ nuevo ⚔️');
    } else {
      await sendWithTyping(sock, groupJid, '👁️ ya hay una trivia activa espera que termine');
      return null;
    }
  }

  if (getGroq()) {
    await sendWithTyping(sock, groupJid, '👁️ generando preguntas del INFRAMUNDO ⚔️');
  }

  let questions = getGroq() ? await generateMetalQuizQuestions(opts.difficulty) : null;
  let source = 'groq';
  if (!questions || questions.length < 3) {
    questions = pickThreeStaticQuestions();
    source = 'static';
  } else {
    rememberQuizQuestions(questions);
  }

  const diffLabel = questions[0]?.difficulty ? ` · dificultad ${questions[0].difficulty}` : '';
  activeMetalQuiz.set(groupJid, {
    questions,
    currentQ: 0,
    answered: new Set(),
    correctlyAnswered: new Set(),
    scores: new Map(),
    firstFinisher: null,
  });

  const intro = `⚔️ METAL QUIZ 3 PREGUNTAS${diffLabel} ⚔️\n\nPrimero en acertar las 3 gana BONUS de ${PTS_COMPLETE_BONUS} pts 🔱\nCada respuesta correcta suma ${PTS_FIRST_CORRECT} pts ☠️\nSin tiempo límite 💀${source === 'static' ? '\n_respaldo local, Groq no respondió a tiempo_' : ''}`;
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
        text: `🔱 @${senderJid.split('@')[0]} COMPLETÓ LAS 3 PRIMERO\n+${PTS_COMPLETE_BONUS} pts BONUS total ${score.pts} pts ☠️`,
        mentions: [senderJid],
      });
    } else if (firstThisQ) {
      await sendWithTyping(sock, groupJid, {
        text: `✅ @${senderJid.split('@')[0]} PRIMERO en acertar +${PTS_FIRST_CORRECT} pts 🤘`,
        mentions: [senderJid],
      });
    } else {
      await sendWithTyping(sock, groupJid, {
        text: `✅ @${senderJid.split('@')[0]} correcto +${PTS_FIRST_CORRECT} pts`,
        mentions: [senderJid],
      });
    }

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

module.exports = {
  startTrivia,
  startMetalQuiz,
  cancelMetalQuiz,
  cancelSingleTrivia,
  checkTriviaAnswer,
  activeSingleTrivia,
  activeMetalQuiz,
};
