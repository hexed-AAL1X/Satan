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

function lidsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return lidKey(a) === lidKey(b);
}

function normalizeLidJid(lid) {
  if (!lid) return null;
  if (lid.includes('@')) return lid;
  return `${lid}@lid`;
}

async function applyRankByPhone(sock, phone, groupId, level, points, displayName) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('telefono invalido');
  const db = getDb();
  const phoneJid = `${digits}@s.whatsapp.net`;
  upsertUser(phoneJid, displayName || digits, groupId);
  db.prepare('UPDATE users SET level = ?, points = ? WHERE jid = ? AND group_id = ?')
    .run(level, points, phoneJid, groupId);
  const from = getUser(phoneJid, groupId);
  const updated = [phoneJid];

  if (sock?.onWhatsApp) {
    try {
      const [info] = await sock.onWhatsApp(digits);
      const lidJid = normalizeLidJid(info?.lid);
      if (lidJid) {
        copyRankToJid(from, lidJid, groupId);
        updated.push(lidJid);
        console.log(`[SET-RANK] ${digits} → LID ${lidJid} nivel ${level}`);
        const lidRows = db.prepare(`SELECT jid FROM users WHERE group_id = ? AND jid LIKE '%@lid'`).all(groupId);
        for (const row of lidRows) {
          if (!updated.includes(row.jid) && lidsMatch(lidJid, row.jid)) {
            copyRankToJid(from, row.jid, groupId);
            updated.push(row.jid);
          }
        }
      }
    } catch (e) {
      console.error('[SET-RANK] onWhatsApp:', e.message);
    }
  }

  return { from, updated };
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

  for (const row of phoneRows) {
    const phone = row.jid.split('@')[0];
    let info;
    try {
      [info] = await sock.onWhatsApp(phone);
    } catch {
      continue;
    }
    if (!info?.lid) continue;
    const infoLidJid = normalizeLidJid(info.lid);
    if (lidsMatch(infoLidJid, senderJid) || lidsMatch(info.lid, senderJid)) {
      console.log(`[RANK-LID] ${phone} → ${senderJid} (nivel ${row.level})`);
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

  if (senderJid?.includes('@lid')) {
    const viaPhone = await matchPhoneRowToSender(sock, senderJid, groupId);
    if (viaPhone && (!best || viaPhone.level > best.level || viaPhone.points > best.points)) {
      best = viaPhone;
    }
  } else if (!hasElevatedRank(best)) {
    const viaPhone = await matchPhoneRowToSender(sock, senderJid, groupId);
    if (viaPhone) best = viaPhone;
  }

  return best || getUser(senderJid, groupId);
}

module.exports = { resolveUserForGroup, resolveTargetJids, copyRankToJid, applyRankByPhone };
