const Database = require('better-sqlite3');
const path = require('path');

// La DB se guarda en el mismo directorio que la sesión de WhatsApp (volumen persistente)
// Esto garantiza que puntos, rangos y strikes sobrevivan reinicios y deploys
const AUTH_DIR = path.join(__dirname, '../../auth_info_baileys');
const DB_PATH = path.join(AUTH_DIR, 'satan_bot.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    migrateSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      jid               TEXT NOT NULL,
      group_id          TEXT NOT NULL DEFAULT '',
      name              TEXT,
      points            INTEGER DEFAULT 0,
      level             INTEGER DEFAULT 1,
      strikes           INTEGER DEFAULT 0,
      muted_until       INTEGER DEFAULT 0,
      banned            INTEGER DEFAULT 0,
      streak            INTEGER DEFAULT 0,
      last_contrib_date TEXT DEFAULT '',
      monthly_points    INTEGER DEFAULT 0,
      joined_at         INTEGER DEFAULT (strftime('%s','now')),
      last_seen         INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (jid, group_id)
    );

    CREATE TABLE IF NOT EXISTS contributions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT NOT NULL,
      group_id    TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL,
      points      INTEGER NOT NULL,
      description TEXT,
      week        TEXT NOT NULL,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS strikes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT NOT NULL,
      group_id    TEXT NOT NULL DEFAULT '',
      reason      TEXT NOT NULL,
      message     TEXT,
      issued_by   TEXT DEFAULT 'bot',
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS trivia (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question    TEXT NOT NULL,
      options     TEXT NOT NULL,
      answer      INTEGER NOT NULL,
      explanation TEXT,
      used_at     INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contributions_week     ON contributions(week);
    CREATE INDEX IF NOT EXISTS idx_contributions_jid      ON contributions(jid);
    CREATE INDEX IF NOT EXISTS idx_contributions_group    ON contributions(group_id);
  `);
}

// --- Users ---

function upsertUser(jid, name, groupId = '') {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (jid, group_id, name) VALUES (?, ?, ?)
    ON CONFLICT(jid, group_id) DO UPDATE SET
      name = excluded.name,
      last_seen = strftime('%s','now')
  `).run(jid, groupId, name || jid.split('@')[0]);
}

function getUser(jid, groupId = '') {
  return getDb().prepare('SELECT * FROM users WHERE jid = ? AND group_id = ?').get(jid, groupId);
}

/** Resuelve usuario cuando WhatsApp usa LID distinto al JID de teléfono (misma persona, varias filas). */
function getUserBestMatch(jids, groupId = '') {
  const list = [...new Set((jids || []).filter(Boolean))];
  if (!list.length) return null;
  let best = null;
  for (const jid of list) {
    const u = getUser(jid, groupId);
    if (!u) continue;
    if (!best || u.level > best.level || (u.level === best.level && u.points > best.points)) best = u;
  }
  return best;
}

function addStrike(jid, reason, message, groupId = '') {
  const db = getDb();
  db.prepare(`INSERT INTO strikes (jid, group_id, reason, message) VALUES (?, ?, ?, ?)`).run(jid, groupId, reason, message || '');
  db.prepare(`UPDATE users SET strikes = strikes + 1 WHERE jid = ? AND group_id = ?`).run(jid, groupId);
  return getUser(jid, groupId).strikes;
}

// In-memory mute map: groupId → Map<jid, muteUntilUnix>
const _mutedMemory = new Map();

function muteUser(jid, hours, groupId = '') {
  const db = getDb();
  const until = hours > 0 ? Math.floor(Date.now() / 1000) + hours * 3600 : 0;
  db.prepare(`
    INSERT INTO users (jid, group_id, name, muted_until) VALUES (?, ?, ?, ?)
    ON CONFLICT(jid, group_id) DO UPDATE SET muted_until = excluded.muted_until
  `).run(jid, groupId, jid.split('@')[0], until);
  // Also store in memory for fast cross-format matching
  if (!_mutedMemory.has(groupId)) _mutedMemory.set(groupId, new Map());
  _mutedMemory.get(groupId).set(jid, until);
  console.log(`[MUTE-DB] stored jid=${jid} group=${groupId} until=${until}`);
}

function muteUserMultiJid(jids, hours, groupId = '') {
  for (const j of jids) muteUser(j, hours, groupId);
}

function banUser(jid, groupId = '') {
  getDb().prepare(`UPDATE users SET banned = 1 WHERE jid = ? AND group_id = ?`).run(jid, groupId);
}

function isUserMuted(jid, groupId = '') {
  const now = Math.floor(Date.now() / 1000);
  // 1. Check DB exact match
  const user = getUser(jid, groupId);
  if (user && user.muted_until > now) return true;
  // 2. Check DB fuzzy (number prefix)
  const number = jid.split('@')[0].split(':')[0];
  if (number) {
    const row = getDb().prepare(
      `SELECT muted_until FROM users WHERE group_id = ? AND (jid LIKE ? OR jid LIKE ?)`
    ).get(groupId, `${number}@%`, `%:${number}@%`);
    if (row && row.muted_until > now) return true;
  }
  // 3. Check in-memory map (catches LID↔phone mismatches)
  const groupMap = _mutedMemory.get(groupId);
  if (groupMap) {
    if (groupMap.has(jid) && groupMap.get(jid) > now) return true;
    if (number) {
      for (const [storedJid, until] of groupMap) {
        if (until <= now) continue;
        const storedNum = storedJid.split('@')[0].split(':')[0];
        if (storedNum === number) return true;
      }
    }
  }
  return false;
}

function getMutedMemory() { return _mutedMemory; }

function removeUser(jid, groupId = '') {
  const db = getDb();
  db.prepare(`DELETE FROM users WHERE jid = ? AND group_id = ?`).run(jid, groupId);
  db.prepare(`DELETE FROM contributions WHERE jid = ? AND group_id = ?`).run(jid, groupId);
  db.prepare(`DELETE FROM strikes WHERE jid = ? AND group_id = ?`).run(jid, groupId);
  console.log(`[DB] Usuario eliminado: ${jid} del grupo ${groupId}`);
}

// --- Contributions ---

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function weekKeyFromDate(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const week = getWeekNumber(date);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function getWeekKey() {
  return weekKeyFromDate(new Date());
}

function getPreviousWeekKey(refDate = new Date()) {
  const prev = new Date(refDate.getTime() - 7 * 86400000);
  return weekKeyFromDate(prev);
}

// Thresholds para 15 rangos (índice = nivel)
const LEVEL_THRESHOLDS = [0, 0, 20, 50, 100, 175, 275, 400, 550, 725, 925, 1150, 1400, 1700, 2050, 2500];

function getLevelForPoints(points) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 1; i--) {
    if (points >= LEVEL_THRESHOLDS[i]) { level = i; break; }
  }
  return level;
}

function getTodayKey() {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD
}

function addContribution(jid, type, points, description, groupId = '') {
  const db = getDb();
  const week = getWeekKey();
  const today = getTodayKey();
  db.prepare(`
    INSERT INTO contributions (jid, group_id, type, points, description, week)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jid, groupId, type, points, description || '', week);
  db.prepare(`UPDATE users SET points = points + ?, monthly_points = monthly_points + ? WHERE jid = ? AND group_id = ?`)
    .run(points, points, jid, groupId);

  // Actualizar racha diaria
  const user = getUser(jid, groupId);
  if (user) {
    if (user.last_contrib_date === today) {
      // ya contribuyó hoy, no cambia la racha
    } else {
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      const newStreak = user.last_contrib_date === yesterday ? (user.streak || 0) + 1 : 1;
      db.prepare(`UPDATE users SET streak = ?, last_contrib_date = ? WHERE jid = ? AND group_id = ?`)
        .run(newStreak, today, jid, groupId);
    }
  }
}

function updateLevel(jid, groupId = '') {
  const db = getDb();
  const user = getUser(jid, groupId);
  if (!user) return null;
  const newLevel = getLevelForPoints(user.points);
  if (newLevel !== user.level) {
    db.prepare(`UPDATE users SET level = ? WHERE jid = ? AND group_id = ?`).run(newLevel, jid, groupId);
  }
  return { oldLevel: user.level, newLevel };
}

function getWeeklyRanking(week, groupId = '') {
  week = week || getWeekKey();
  return getDb().prepare(`
    SELECT u.jid, u.name, u.level, COALESCE(SUM(c.points), 0) as weekly_points
    FROM users u
    LEFT JOIN contributions c ON u.jid = c.jid AND c.week = ? AND c.group_id = ?
    WHERE u.group_id = ?
    GROUP BY u.jid
    HAVING weekly_points > 0
    ORDER BY weekly_points DESC
    LIMIT 10
  `).all(week, groupId, groupId);
}

function getMonthlyRanking(groupId = '') {
  return getDb().prepare(`
    SELECT jid, name, level, monthly_points
    FROM users
    WHERE group_id = ? AND monthly_points > 0
    ORDER BY monthly_points DESC
    LIMIT 5
  `).all(groupId);
}

function resetMonthlyPoints(groupId = '') {
  getDb().prepare(`UPDATE users SET monthly_points = 0 WHERE group_id = ?`).run(groupId);
}

function getPreviousWeekWinner(groupId = '') {
  const prevWeekKey = getPreviousWeekKey();

  const results = getDb().prepare(`
    SELECT u.jid, u.name, u.level, COALESCE(SUM(c.points), 0) as weekly_points
    FROM users u
    LEFT JOIN contributions c ON u.jid = c.jid AND c.week = ? AND c.group_id = ?
    WHERE u.group_id = ?
    GROUP BY u.jid
    HAVING weekly_points > 0
    ORDER BY weekly_points DESC
    LIMIT 1
  `).get(prevWeekKey, groupId, groupId);
  return results || null;
}

// --- Bot state ---

function getState(key) {
  const row = getDb().prepare('SELECT value FROM bot_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setState(key, value) {
  getDb().prepare(`
    INSERT INTO bot_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

// Migración segura: agrega columnas si no existen en DB antigua
function migrateSchema() {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!cols.includes('streak'))            db.exec(`ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0`);
  if (!cols.includes('last_contrib_date')) db.exec(`ALTER TABLE users ADD COLUMN last_contrib_date TEXT DEFAULT ''`);
  if (!cols.includes('monthly_points'))    db.exec(`ALTER TABLE users ADD COLUMN monthly_points INTEGER DEFAULT 0`);
}

module.exports = {
  getDb,
  upsertUser,
  getUser,
  getUserBestMatch,
  addStrike,
  muteUser,
  muteUserMultiJid,
  banUser,
  isUserMuted,
  getMutedMemory,
  removeUser,
  addContribution,
  updateLevel,
  getWeeklyRanking,
  getMonthlyRanking,
  resetMonthlyPoints,
  getPreviousWeekWinner,
  getPreviousWeekKey,
  getWeekKey,
  getState,
  setState,
  migrateSchema,
  hasGroupPresentation,
  markGroupPresentation,
  removeGroupPresentation,
  isGroupApproved,
  approveGroup,
  unapproveGroup,
  startTrial,
  getTrialStart,
  endTrial,
  getAllTrials,
  markTrialConsumed,
  isTrialConsumed,
  clearTrialConsumed,
};

function isGroupApproved(groupId) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM bot_state WHERE key = ?`).get(`approved_${groupId}`);
  return !!row;
}

function approveGroup(groupId) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)`).run(`approved_${groupId}`, '1');
  clearTrialConsumed(groupId);
}

function unapproveGroup(groupId) {
  const db = getDb();
  db.prepare(`DELETE FROM bot_state WHERE key = ?`).run(`approved_${groupId}`);
}

// --- Sistema de período de prueba ---
function startTrial(groupId) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)`)
    .run(`trial_${groupId}`, String(Date.now()));
}

function getTrialStart(groupId) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM bot_state WHERE key = ?`).get(`trial_${groupId}`);
  return row ? parseInt(row.value) : null;
}

function endTrial(groupId) {
  const db = getDb();
  db.prepare(`DELETE FROM bot_state WHERE key = ?`).run(`trial_${groupId}`);
}

function getAllTrials() {
  const db = getDb();
  return db.prepare(`
    SELECT key, value FROM bot_state
    WHERE key LIKE 'trial_%' AND key NOT LIKE 'trial_consumed_%'
  `).all()
    .map(r => ({ groupId: r.key.replace('trial_', ''), startedAt: parseInt(r.value) }));
}

/** El grupo ya gastó su prueba gratuita única sin aprobación del owner */
function markTrialConsumed(groupId) {
  getDb().prepare(`INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)`).run(`trial_consumed_${groupId}`, '1');
}

function isTrialConsumed(groupId) {
  const row = getDb().prepare(`SELECT value FROM bot_state WHERE key = ?`).get(`trial_consumed_${groupId}`);
  return !!row;
}

function clearTrialConsumed(groupId) {
  getDb().prepare(`DELETE FROM bot_state WHERE key = ?`).run(`trial_consumed_${groupId}`);
}

function hasGroupPresentation(groupId) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM bot_state WHERE key = ?`).get(`presented_${groupId}`);
  return !!row;
}

function markGroupPresentation(groupId) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)`).run(`presented_${groupId}`, '1');
}

function removeGroupPresentation(groupId) {
  const db = getDb();
  db.prepare(`DELETE FROM bot_state WHERE key = ?`).run(`presented_${groupId}`);
}
