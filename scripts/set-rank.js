#!/usr/bin/env node
/**
 * Asigna rango manual en DB.
 * Uso: node scripts/set-rank.js <telefono> <grupo_jid|alias> <rango>
 * Ej: node scripts/set-rank.js 521234567890 mi_grupo "Black Knight"
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getDb, upsertUser } = require('../src/db');
const { LEVELS } = require('../src/scheduler/ranking');
const { resolveGroupAlias } = require('../src/config');

function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function resolveLevel(rankName) {
  const q = String(rankName || '').toLowerCase().trim();
  const idx = LEVELS.findIndex((l) => l.name && l.name.toLowerCase() === q);
  if (idx < 1) {
    console.error(`Rango desconocido: ${rankName}`);
    console.error('Disponibles:', LEVELS.filter((l) => l.name).map((l) => l.name).join(', '));
    process.exit(1);
  }
  return { level: idx, points: LEVELS[idx].pts };
}

function main() {
  const phone = normalizePhone(process.argv[2]);
  const groupArg = process.argv[3];
  const rankArg = process.argv.slice(4).join(' ') || 'Black Knight';

  if (!phone || !groupArg) {
    console.error('Uso: node scripts/set-rank.js <telefono> <grupo_jid|alias> [rango]');
    process.exit(1);
  }

  const groupId = resolveGroupAlias(groupArg);
  const { level, points } = resolveLevel(rankArg);
  const db = getDb();

  const existing = db.prepare(`
    SELECT jid, name, level, points FROM users
    WHERE group_id = ? AND (jid LIKE ? OR jid LIKE ? OR jid LIKE ?)
  `).all(groupId, `${phone}@%`, `%:${phone}@%`, `%${phone}%`);

  if (existing.length) {
    for (const row of existing) {
      db.prepare(`UPDATE users SET level = ?, points = ? WHERE jid = ? AND group_id = ?`)
        .run(level, points, row.jid, groupId);
      console.log(`✓ ${row.jid} (${row.name || 'sin nombre'}) → nivel ${level} ${rankArg} (${points} pts)`);
    }
  } else {
    const jid = `${phone}@s.whatsapp.net`;
    upsertUser(jid, phone, groupId);
    db.prepare(`UPDATE users SET level = ?, points = ? WHERE jid = ? AND group_id = ?`)
      .run(level, points, jid, groupId);
    console.log(`✓ creado ${jid} → nivel ${level} ${rankArg} (${points} pts)`);
    console.log('  (si usa LID distinto, que escriba en el grupo y usa !setrank o vuelve a correr tras deploy)');
  }

  console.log(`Grupo: ${groupId}`);
}

main();
