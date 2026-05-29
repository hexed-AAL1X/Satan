const MONTH_ES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

function artistKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function mmddKey(month, day) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extrae "24 de mayo" del texto si está explícito. */
function extractSpanishDateMmDd(text) {
  const m = String(text || '').match(
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i
  );
  if (!m) return null;
  const month = MONTH_ES[m[2].toLowerCase()];
  if (!month) return null;
  return `${month}-${String(m[1]).padStart(2, '0')}`;
}

function extractYear(text) {
  const m = String(text || '').match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Valida que el texto no contradiga fechas verificadas de muertes ni mueva fechas en el copy.
 */
function validateOnThisDayAccuracy(text, artist, month, day, verifiedDeaths = [], curatedEvents = []) {
  const mmdd = mmddKey(month, day);
  const blob = `${text || ''} ${artist || ''}`.toLowerCase();

  for (const death of verifiedDeaths) {
    const hit = death.names.some((n) => blob.includes(n));
    if (!hit) continue;
    if (mmdd !== death.date) return false;
    const year = extractYear(text);
    if (year && year !== death.year) return false;
  }

  const explicitDate = extractSpanishDateMmDd(text);
  if (explicitDate && explicitDate !== mmdd) return false;

  if (/murió|muere|falleció|fallecio|asesinado|mataron|muerte de|muerto el/i.test(blob)) {
    for (const ev of curatedEvents) {
      if (ev.type !== 'death') continue;
      const a = artistKey(ev.artist);
      if (!a || !blob.includes(a)) continue;
      if (mmdd !== ev.date) return false;
      const year = extractYear(text);
      if (year && year !== ev.year) return false;
    }
  }

  return true;
}

function buildArtistExactDates(verifiedDeaths, curatedEvents) {
  const map = {};
  for (const d of verifiedDeaths) {
    for (const n of d.names) map[n] = d.date;
  }
  for (const ev of curatedEvents) {
    const k = artistKey(ev.artist);
    if (k) map[k] = ev.date;
  }
  return map;
}

module.exports = {
  artistKey,
  mmddKey,
  extractSpanishDateMmDd,
  validateOnThisDayAccuracy,
  buildArtistExactDates,
};
