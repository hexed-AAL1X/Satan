/** Extrae A/B/C de respuestas tipo "B", "B?", "b)", "B.", "opción C", etc. */
function parseQuizLetter(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const direct = t.match(/^([ABCabc])(?:\s*[).:\-!?])*(?:\s|$)/);
  if (direct) return direct[1].toUpperCase();

  const withLabel = t.match(/(?:opcion|opción|letra|respuesta|alternativa)\s*([ABCabc])/i);
  if (withLabel) return withLabel[1].toUpperCase();

  const loose = t.match(/^([ABCabc])[\s?!.,:;]*$/);
  if (loose) return loose[1].toUpperCase();

  return null;
}

function isQuizAnswerAttempt(text) {
  return parseQuizLetter(text) != null;
}

module.exports = { parseQuizLetter, isQuizAnswerAttempt };
