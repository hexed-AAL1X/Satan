const crypto = require('crypto');
const {
  decryptPollVote,
  getAggregateVotesInPollMessage,
  updateMessageWithPollUpdate,
  getKeyAuthor,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const messageStore = new Map();

function storeKey(key) {
  return `${key.remoteJid}:${key.id}`;
}

function storeMessage(msg) {
  if (msg?.key?.id) messageStore.set(storeKey(msg.key), msg);
}

function getStoredMessage(key) {
  if (!key?.id) return null;
  return messageStore.get(storeKey(key)) || null;
}

/** Mismo formato que Baileys usa en getAggregateVotesInPollMessage. */
function pollOptionHash(optionName) {
  return crypto.createHash('sha256').update(Buffer.from(optionName || '')).digest().toString();
}

function uniqJids(list) {
  const seen = new Set();
  const out = [];
  for (const j of list) {
    if (!j) continue;
    const n = jidNormalizedUser(j);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function getPollUpdateContent(msg) {
  const inner = msg?.message?.ephemeralMessage?.message || msg?.message;
  return inner?.pollUpdateMessage || null;
}

function tryDecryptPollVote(voteEnc, { sock, creationKey, messageKey, pollEncKey }) {
  const meId = jidNormalizedUser(sock.user?.id);
  const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
  const pollMsgId = creationKey.id;

  const creators = uniqJids([
    getKeyAuthor(creationKey, meId),
    meId,
    myLid,
  ]);
  const voters = uniqJids([
    getKeyAuthor(messageKey, meId),
    messageKey.participant,
    messageKey.remoteJid,
  ]);

  for (const pollCreatorJid of creators) {
    for (const voterJid of voters) {
      try {
        const voteMsg = decryptPollVote(voteEnc, {
          pollEncKey,
          pollCreatorJid,
          pollMsgId,
          voterJid,
        });
        if (voteMsg?.selectedOptions?.length) return { voteMsg, voterJid };
      } catch (_) {}
    }
  }
  return null;
}

function registerVoteByHash(battle, voterJid, selectedHash) {
  const h1 = pollOptionHash(battle.opt1);
  const h2 = pollOptionHash(battle.opt2);
  if (selectedHash === h1) battle.votes[voterJid] = 'band1';
  else if (selectedHash === h2) battle.votes[voterJid] = 'band2';
  else console.warn(`[BATTLE-VOTE] hash desconocido en ${battle.band1} vs ${battle.band2}`);
}

function handleBattlePollVote(sock, msg, activeBattles) {
  const pollUpdate = getPollUpdateContent(msg);
  if (!pollUpdate?.vote || !pollUpdate.pollCreationMessageKey) return false;

  const creationKey = pollUpdate.pollCreationMessageKey;
  const groupJid = creationKey.remoteJid;
  const battle = activeBattles.get(groupJid);
  if (!battle?.pollMsgKey || battle.pollMsgKey.id !== creationKey.id) return false;

  const pollMsg = battle.pollMsg || getStoredMessage(creationKey);
  if (!pollMsg?.message) {
    console.warn('[BATTLE-VOTE] mensaje de encuesta no encontrado', creationKey.id);
    return false;
  }

  const pollEncKey = pollMsg.message.messageContextInfo?.messageSecret;
  if (!pollEncKey) {
    console.warn('[BATTLE-VOTE] messageSecret ausente en encuesta', creationKey.id);
    return false;
  }

  const decrypted = tryDecryptPollVote(pollUpdate.vote, {
    sock,
    creationKey,
    messageKey: msg.key,
    pollEncKey,
  });
  if (!decrypted) {
    console.warn('[BATTLE-VOTE] no se pudo descifrar voto', groupJid);
    return false;
  }

  const update = {
    pollUpdateMessageKey: msg.key,
    vote: decrypted.voteMsg,
    senderTimestampMs: pollUpdate.senderTimestampMs?.toNumber?.()
      || Number(pollUpdate.senderTimestampMs)
      || Date.now(),
  };

  updateMessageWithPollUpdate(pollMsg, update);
  battle.pollMsg = pollMsg;

  const selectedHash = decrypted.voteMsg.selectedOptions[0].toString();
  registerVoteByHash(battle, decrypted.voterJid, selectedHash);

  const tally = tallyBattleVotes(battle, jidNormalizedUser(sock.user?.id));
  console.log(`[BATTLE-VOTE] ${decrypted.voterJid} → ${groupJid} (${tally.total} votos)`);
  return true;
}

function tallyBattleVotes(battle, meId) {
  if (battle.pollMsg?.message) {
    const aggregated = getAggregateVotesInPollMessage(
      { message: battle.pollMsg.message, pollUpdates: battle.pollMsg.pollUpdates || [] },
      meId
    );
    let v1 = 0;
    let v2 = 0;
    const voters1 = [];
    const voters2 = [];
    for (const opt of aggregated) {
      if (opt.name === battle.opt1) {
        v1 = opt.voters.length;
        voters1.push(...opt.voters);
      } else if (opt.name === battle.opt2) {
        v2 = opt.voters.length;
        voters2.push(...opt.voters);
      }
    }
    if (v1 + v2 > 0) {
      return { v1, v2, total: v1 + v2, voters1, voters2, aggregated };
    }
  }

  const v1 = Object.values(battle.votes).filter((v) => v === 'band1').length;
  const v2 = Object.values(battle.votes).filter((v) => v === 'band2').length;
  return {
    v1,
    v2,
    total: v1 + v2,
    voters1: Object.keys(battle.votes).filter((k) => battle.votes[k] === 'band1'),
    voters2: Object.keys(battle.votes).filter((k) => battle.votes[k] === 'band2'),
    aggregated: [],
  };
}

module.exports = {
  storeMessage,
  getStoredMessage,
  getPollUpdateContent,
  pollOptionHash,
  handleBattlePollVote,
  tallyBattleVotes,
};
