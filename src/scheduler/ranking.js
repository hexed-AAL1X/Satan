const { getWeeklyRanking, getWeekKey } = require('../db');

// 15 rangos metal — índice 0 es sin rango (nivel 0, no se usa en display)
const LEVELS = [
  { name: '',                    emoji: '',       pts: 0     }, // 0 - sin rango
  { name: 'Initiate',            emoji: '🕯️',    pts: 0     }, // 1
  { name: 'Acolyte',             emoji: '🗡️',    pts: 20    }, // 2
  { name: 'Headbanger',          emoji: '🤘',     pts: 50    }, // 3
  { name: 'Warrior',             emoji: '⚔️',    pts: 100   }, // 4
  { name: 'Berserker',           emoji: '🔥',     pts: 175   }, // 5
  { name: 'Warlord',             emoji: '💀',     pts: 275   }, // 6
  { name: 'Deathbringer',        emoji: '☠️',    pts: 400   }, // 7
  { name: 'Black Knight',        emoji: '🩸',     pts: 550   }, // 8
  { name: 'Necromancer',         emoji: '🦇',     pts: 725   }, // 9
  { name: 'Archpriest of Chaos', emoji: '⛧',     pts: 925   }, // 10
  { name: 'Blood Sovereign',     emoji: '🔱',     pts: 1150  }, // 11
  { name: 'Fallen Angel',        emoji: '👁️',    pts: 1400  }, // 12
  { name: 'Herald of the Abyss', emoji: '🩸 ☠️', pts: 1700  }, // 13
  { name: 'Dark Lord',           emoji: '🖤 💀', pts: 2050  }, // 14
  { name: 'Lord of the Abyss',   emoji: '🔱 🩸', pts: 2500  }, // 15
];

function getLevelName(level) {
  const l = LEVELS[level] || LEVELS[LEVELS.length - 1];
  return `${l.emoji} ${l.name}`.trim();
}

function getLevelEmoji(level) {
  return (LEVELS[level] || LEVELS[LEVELS.length - 1]).emoji;
}

const RANKING_POOL = [
  (top, week) => {
    const podium = top.slice(0, 3);
    const rest = top.slice(3);
    const medals = ['🥇', '🥈', '🥉'];
    const podiumLines = podium.map((u, i) =>
      `${medals[i]} *${i + 1}er puesto* — ${u.name}  ${getLevelEmoji(u.level)}  [ ${u.weekly_points} pts ]`
    ).join('\n');
    const restLines = rest.map((u, i) =>
      `  ${i + 4}. ${u.name} ${getLevelEmoji(u.level)} — ${u.weekly_points} pts`
    ).join('\n');
    return `☠️⚔️ RANKING SEMANAL — ${week} ⚔️☠️\n\n${podiumLines}${restLines ? '\n\n' + restLines : ''}\n\n🤘 ${top[0]?.name} lidera el CIRCLE esta semana\nel trono se pelea de nuevo el próximo lunes 🖤`;
  },
  (top, week) => {
    const podium = top.slice(0, 3);
    const rest = top.slice(3);
    const crowns = ['👑 LÍDER', '⚔️ 2DO', '💀 3RO'];
    const podiumLines = podium.map((u, i) =>
      `${crowns[i]} — ${u.name} ${getLevelEmoji(u.level)}  ( ${u.weekly_points} pts · ${getLevelName(u.level)} )`
    ).join('\n');
    const restLines = rest.map((u, i) =>
      `  ${i + 4}. ${u.name} ${getLevelEmoji(u.level)} — ${u.weekly_points} pts`
    ).join('\n');
    return `🩸 BATALLA SEMANAL 🩸\n\n${podiumLines}${restLines ? '\n\n' + restLines : ''}\n\n⛧ semana ${week} — la competencia reinicia el lunes\n¿quién defiende el trono? 🔱`;
  },
  (top, week) => {
    const podium = top.slice(0, 3);
    const rest = top.slice(3);
    const icons = ['🔥', '🦇', '☠️'];
    const podiumLines = podium.map((u, i) =>
      `${icons[i]} ${u.name} ${getLevelEmoji(u.level)} — *${u.weekly_points} puntos*`
    ).join('\n');
    const restLines = rest.map((u, i) =>
      `  ${i + 4}. ${u.name} ${getLevelEmoji(u.level)} — ${u.weekly_points} pts`
    ).join('\n');
    return `👁️ LOS QUE MANTUVIERON EL FUEGO — ${week} 👁️\n\n${podiumLines}${restLines ? '\n\n' + restLines : ''}\n\n💀 el podio se resetea cada lunes\n${top[0]?.name} tiene el trono por ahora 🤘`;
  },
];

const { getState, setState } = require('../db');

function buildRankingMessage(groupId = '', week = null) {
  const top = getWeeklyRanking(week, groupId);
  if (!top.length) return null;

  const lastIdx = parseInt(getState('last_ranking_idx') || '-1');
  let candidates = RANKING_POOL.map((_, i) => i).filter(i => i !== lastIdx);
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  setState('last_ranking_idx', idx);

  return RANKING_POOL[idx](top, week || getWeekKey());
}

module.exports = { buildRankingMessage, getLevelName, getLevelEmoji };
