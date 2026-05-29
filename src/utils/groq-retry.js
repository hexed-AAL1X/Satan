const GROQ_UNAVAILABLE_MSG = '☠️ el inframundo no responde ahora — intenta de nuevo en un momento';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasGroqKey() {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Reintenta una llamada Groq hasta obtener un valor truthy.
 * @param {() => Promise<any>} fn
 */
async function groqWithRetry(fn, { attempts = 4, delayMs = 700, label = 'GROQ' } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await fn();
      if (result != null && result !== '') {
        if (Array.isArray(result) && result.length === 0) {
          // vacío — reintentar
        } else {
          return result;
        }
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[${label}] intento ${i + 1}/${attempts}:`, (e.message || String(e)).slice(0, 80));
    }
    if (i < attempts - 1) await sleep(delayMs * (i + 1));
  }
  if (lastErr) {
    console.error(`[${label}] agotado:`, (lastErr.message || String(lastErr)).slice(0, 80));
  }
  return null;
}

module.exports = {
  groqWithRetry,
  hasGroqKey,
  GROQ_UNAVAILABLE_MSG,
};
