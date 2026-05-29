function stripCodeFences(s) {
  return String(s || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function unescapeJsonString(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return String(s || '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  }
}

/** Extrae el campo text aunque el JSON venga truncado o mal cerrado. */
function extractTextFromGroqRaw(raw) {
  const cleaned = stripCodeFences(raw);
  if (!cleaned) return '';

  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === 'object') {
      return normalizeGroqText(obj.text || obj.message || obj.content || '');
    }
  } catch (_) {}

  const m = cleaned.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) return unescapeJsonString(m[1]);

  if (!cleaned.trimStart().startsWith('{')) return cleaned.trim();
  return '';
}

function looksLikeJsonLeak(text) {
  const t = String(text || '').trimStart();
  if (!t.startsWith('{')) return false;
  return /"text"\s*:/.test(t) || /^\{\s*"text"/.test(t);
}

/** Normaliza texto ya extraído o anidado como JSON dentro de text. */
function normalizeGroqText(text) {
  let out = String(text || '').replace(/\\n/g, '\n').replace(/[—–-]+/g, ' ').trim();
  if (!out) return '';

  if (looksLikeJsonLeak(out)) {
    const inner = extractTextFromGroqRaw(out);
    if (inner && inner.length >= 8 && !looksLikeJsonLeak(inner)) out = inner;
  }

  if (looksLikeJsonLeak(out)) return '';
  return out;
}

function parseGroqJsonObject(raw) {
  const cleaned = stripCodeFences(raw);
  if (!cleaned) return null;

  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== 'object') return null;
    if (obj.text != null) obj.text = normalizeGroqText(obj.text);
    return obj;
  } catch (_) {
    const text = extractTextFromGroqRaw(cleaned);
    if (!text || text.length < 4 || looksLikeJsonLeak(text)) return null;

    const hookMatch = cleaned.match(/"hook"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const artistMatch = cleaned.match(/"artist"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    return {
      text,
      hook: hookMatch ? unescapeJsonString(hookMatch[1]) : text.slice(0, 80),
      artist: artistMatch ? unescapeJsonString(artistMatch[1]) : null,
    };
  }
}

module.exports = {
  stripCodeFences,
  extractTextFromGroqRaw,
  normalizeGroqText,
  looksLikeJsonLeak,
  parseGroqJsonObject,
};
