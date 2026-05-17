/**
 * Script de prueba — usa la API interna del bot (sin crear segunda conexión WA)
 * Uso: node scripts/test-messages.js
 */
require('dotenv').config();
const http = require('http');
const { CURIOSITIES, SONGS, TRIVIA, ALBUMS, BANDS } = require('../data/content');
const { buildRankingMessage } = require('../src/scheduler/ranking');
const { getDb, upsertUser, addContribution } = require('../src/db');

const GROUP_ID = process.env.GROUP_ID;
const API_URL = 'http://127.0.0.1:3131/send';

function post(text, mentions = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jid: GROUP_ID, text, mentions });
    const req = http.request(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function send(label, text) {
  console.log(`📤 ${label}`);
  await post(text);
  await delay(600);
}

async function run() {
  if (!GROUP_ID) { console.error('GROUP_ID no configurado'); process.exit(1); }

  // Seed usuarios de prueba para el ranking
  getDb();
  const testUsers = [
    { jid: '51900000001@s.whatsapp.net', name: 'Luis',  pts: 21 },
    { jid: '51900000002@s.whatsapp.net', name: 'Ana',   pts: 14 },
    { jid: '51900000003@s.whatsapp.net', name: 'Pedro', pts: 9  },
    { jid: '51900000004@s.whatsapp.net', name: 'Kairo', pts: 6  },
    { jid: '51900000005@s.whatsapp.net', name: 'Hex',   pts: 3  },
  ];
  for (const u of testUsers) {
    upsertUser(u.jid, u.name);
    addContribution(u.jid, 'test', u.pts, 'seed prueba');
  }

  console.log('Enviando mensajes de prueba al grupo Proof...\n');

  // 1. Bienvenida (pool estático para prueba rápida)
  await send('BIENVENIDA', `BIENVENIDO SEAS ☠️ @Nuevo Hermano\nes un placer tenerte acá en nuestro círculo 🤘\nSIÉNTETE CÓMODO ☠️ — aquí hay BLACK METAL, SATANISMO y mucha ADRENALINA 🖤`);

  // 2. Album del día
  const a = ALBUMS[Math.floor(Math.random() * ALBUMS.length)];
  await send('ÁLBUM DEL DÍA', `el ÁLBUM 🔱 de hoy:\n\n*${a.title}* — ${a.band} (${a.year})\nGénero 🖤 ${a.genre}\n\n${a.question} ⚔️`);

  // 3. Banda del día
  const b = BANDS[Math.floor(Math.random() * BANDS.length)];
  await send('BANDA DEL DÍA', `la BANDA ☠️ del día:\n\n*${b.name}* — ${b.country}\nGénero 💀 ${b.genre} | Formada en ${b.formed}\n\n_${b.fact}_`);

  // 4. Curiosidad
  const c = CURIOSITIES[Math.floor(Math.random() * CURIOSITIES.length)];
  await send('CURIOSIDAD', `CURIOSIDAD 👁️ del metal:\n\n_${c}_\n\n¿lo sabías? ⚔️ deja tu reacción 🤘`);

  // 5. Canción
  const s = SONGS[Math.floor(Math.random() * SONGS.length)];
  await send('CANCIÓN DEL DÍA', `la CANCIÓN ⛧ del día:\n\n*${s.title}* — ${s.band}\n\n🩸 _${s.fact}_\n\n¿la conocías? ☠️`);

  // 6. Trivia
  const t = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
  await send('TRIVIA', `☠️ TRIVIA METAL ☠️\n\n${t.question}\n\n${t.options.join('\n')}\n\n_tienes 30 segundos... 💀_`);

  // 7. Ranking
  const ranking = buildRankingMessage();
  await send('RANKING SEMANAL', ranking || '☠️ nadie ha aportado esta semana aún. Sean los primeros. 🤘');

  // 8. Inactividad
  await send('INACTIVIDAD', `el SILENCIO ☠️ es el enemigo del círculo\n¿cuál es tu top 3 de bandas black metal? 🦇 responde o el grupo muere 💀`);

  // 9. Strike
  await send('STRIKE (ejemplo)', `⚠️ @Alguien — Primer aviso.\nSe detectó un enlace de grupo externo. No está permitido.\nEso te cuesta un strike. [ 1/3 ] ⚔️`);

  // 10. !rank
  await send('RESPUESTA !rank', `👁️ RANGO DE @Luis\n\n💀 Rango: Headbanger\n⚔️ Puntos totales: 21\n🦇 Strikes: 0/3\n🖤 Nivel: 2`);

  console.log('\n✅ Todos los mensajes enviados. Revisa el grupo Proof.');
  process.exit(0);
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
