/**
 * El CIRCLE: metal, rock pesado/punk/industrial ligado al metal y,
 * típico del ambiente LATAM metalero, cumbia / bachata / salsa.
 * Rechazo explícito: trap, kpop, reggaetón, reggae, música urbana de moda, etc.
 */

const FORBIDDEN = [
  /\b(?:latin\s*)?trap\b/i,
  /\bk[\s\-_]*pop\b|\bkpop\b/i,
  /\bj[\s\-_]*pop\b/i,
  /\bc[\s\-_]*pop\b/i,
  /\breggae\b/i,
  /\bregga\s*eton\b|\breguet[oó]n\b|\bperreo\b/i,
  /\bdembow\b/i,
  /\bau\s*r(?:\s*and\s*b)?\b/i,
  /\bafrobeats?\b/i,
  /\bhyperpop\b/i,
  /\bphonk\b/i,
  /\b(?:música\s*)?(?:infantil|kids?\b)/i,
  /\b(?:idol\s*pop|boy\s*band|girl\s*group)\b/i,
  /\b(?:lo\s*fi\s*beats?|beats?\s*(?:para\s*)?estudiar)\b/i,
];

function normalize(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/**
 * Devuelve true si el texto pide géneros/markets que este bot NO cubre aquí.
 * Vacío/falsy → false (se asume metal por defecto en !recomienda).
 */
function isForbiddenNonCircleGenre(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const q = normalize(raw);
  for (const re of FORBIDDEN) {
    if (re.test(q)) return true;
  }
  return false;
}

/**
 * Para !band / !album / !letra con consultas muy cortas tipo "quiero trap": rechazar.
 */
function isForbiddenGenreLookupQuery(text) {
  return isForbiddenNonCircleGenre(text);
}

function rejectionMessageShort() {
  return (
    `👁️ ese GÉNERO no vive acá ⚔️\n\n` +
    `esto es para METAL ROCK y lo que LOS NUESTROS sí mezclan en LATINOAMÉRICA: CUMBIA BACHATA SALSA 🤘\n\n` +
    `nada de TRAP REGGAETON KPOP REGGAE URBANO de radio 📵 reformula 🔱`
  );
}

module.exports = {
  isForbiddenNonCircleGenre,
  isForbiddenGenreLookupQuery,
  rejectionMessageShort,
};
