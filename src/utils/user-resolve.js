const { getDb, getUser, getUserBestMatch, upsertUser } = require('../db');

function resolveTargetJids(groupMetadata, targetRef) {
  if (!targetRef) return [];
  const allJids = new Set([targetRef]);
  const targetNum = targetRef.split('@')[0]?.split(':')[0] || '';
  for (const p of groupMetadata?.participants || []) {
    const pNum = p.id?.split('@')[0]?.split(':')[0] || '';
    const pLidNum = p.lid?.split('@')[0]?.split(':')[0] || '';
    const match = p.id === targetRef || p.lid === targetRef ||
      (targetNum && (pNum === targetNum || pLidNum === targetNum));
    if (match) {
      if (p.id) allJids.add(p.id);
      if (p.lid) allJids.add(p.lid);
    }
  }
  return [...allJids];
}

function lidKey(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function hasElevatedRank(user) {
  return user && (user.level > 1 || user.points > 0);
}

function copyRankToJid(from, toJid, groupId) {
  if (!from || !toJid || from.jid === toJid) return getUser(toJid, groupId) || from;
  upsertUser(toJid, from.name, groupId);
  getDb().prepare(`
    UPDATE users SET level = ?, points = ?, monthly_points = ?, strikes = ?, streak = ?
    WHERE jid = ? AND group_id = ?
  `).run(
    from.level, from.points, from.monthly_points || 0, from.strikes || 0, from.streak || 0,
    toJid, groupId,
  );
  return getUser(toJid, groupId) || from;
}

async function matchPhoneRowToSender(sock, senderJid, groupId) {
  if (!sock?.onWhatsApp || !senderJid?.includes('@lid')) return null;
  const db = getDb();
  const phoneRows = db.prepare(`
    SELECT * FROM users WHERE group_id = ? AND jid LIKE '%@s.whatsapp.net'
      AND (level > 1 OR points > 0)
  `).all(groupId);
  if (!phoneRows.length) return null;

  const senderLid = lidKey(senderJid);
  for (const row of phoneRows) {
    const phone = row.jid.split('@')[0];
    let info;
    try {
      [info] = await sock.onWhatsApp(phone);
    } catch {
      continue;
    }
    if (!info?.lid) continue;
    const infoLid = lidKey(info.lid);
    const infoLidJid = info.lid.includes('@') ? info.lid : `${info.lid}@lid`;
    if (infoLid === senderLid || infoLidJid === senderJid) {
      return copyRankToJid(row, senderJid, groupId);
    }
  }
  return null;
}

/** Resuelve usuario en grupo cruzando metadata, DB y LID↔teléfono vía WhatsApp. */
async function resolveUserForGroup(sock, senderJid, groupId, groupMetadata) {
  const jids = resolveTargetJids(groupMetadata, senderJid);
  const allJids = [...new Set([senderJid, ...jids])];
  let best = getUserBestMatch(allJids, groupId);

  if (hasElevatedRank(best) && best.jid !== senderJid) {
    return copyRankToJid(best, senderJid, groupId);
  }

  if (!hasElevatedRank(best)) {
    const viaPhone = await matchPhoneRowToSender(sock, senderJid, groupId);
    if (viaPhone) best = viaPhone;
  }

  return best || getUser(senderJid, groupId);
}

module.exports = { resolveUserForGroup, resolveTargetJids, copyRankToJid };
