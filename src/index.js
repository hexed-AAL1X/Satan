require('dotenv').config();
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const http = require('http');

const { upsertUser, getDb, updateLevel, removeUser, isUserMuted } = require('./db');
const { getLevelName, getLevelEmoji } = require('./scheduler/ranking');
const { getWelcomeMessage, sendBotPresentation } = require('./handlers/welcome');
const { getSatanResponse } = require('./handlers/satan-dm');
const { saveSticker, sendWelcomeStickers, sendMorningStickers, getStickerFiles } = require('./handlers/stickers');
const { hasGroupLink, handleGroupLink } = require('./moderation/links');
const { detectAndRegisterContribution, registerAlbumSession, shouldReact, shouldReactAudio } = require('./contributions/detect');
const { handleChatMessage, handleCommand, saveMemeFromMsg } = require('./commands');
const { checkTriviaAnswer } = require('./commands/trivia');
const { setupScheduler, updateLastMessage, registerBattleVote, registerPollVote, getBattlePollKey, hasBattle } = require('./scheduler');
const { sendWithTyping } = require('./utils/typing');

const AUTH_DIR = path.join(__dirname, '../auth_info_baileys');
const GROUP_ID = process.env.GROUP_ID || '';
const OWNER_NUMBER = '51943605088';
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`;

// Intención del owner: próximo sticker va a qué banco
let ownerStickerIntent = 'bienvenida';
let ownerIntentExpiry = 0;

function isOwner(jid) {
  if (!jid) return false;
  if (jid.includes(OWNER_NUMBER)) return true;
  if (global._ownerLid && jid.includes(global._ownerLid)) return true;
  return false;
}

getDb();

const logger = pino({ level: 'silent' });

async function startBot() {
  let botReady = false; // solo procesar bienvenidas cuando el socket esté listo

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Metal Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  // --- QR ---
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPath = path.join(__dirname, '../qr.png');
      await QRCode.toFile(qrPath, qr, { width: 400, margin: 2 });
      console.log('\n\x1b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
      console.log('\x1b[1;35m  ⚔️  METAL BOT — THE BLACK CIRCLE  ⚔️\x1b[0m');
      console.log('\x1b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
      console.log('\n  QR guardado: \x1b[1;32m' + qrPath + '\x1b[0m\n');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('☠️  Conexión cerrada (código ' + code + '). ' + (shouldReconnect ? 'Reconectando...' : 'Sesión cerrada.'));
      if (shouldReconnect) setTimeout(startBot, 3000);
    }

    if (connection === 'open') {
      botReady = true;
      console.log('\n\x1b[1;32m✔  Bot conectado — El CIRCLE está vivo 🤘\x1b[0m');
      // Guardar LID del bot para detección de menciones en grupos
      if (sock.user?.lid) {
        global._botLid = sock.user.lid.split(':')[0];
        console.log(`\x1b[1;36m🤖 Bot LID: ${global._botLid}\x1b[0m`);
      }
      // Resolver LID del owner para identificarlo aunque WhatsApp use formato @lid
      try {
        const ownerCheck = await sock.onWhatsApp(OWNER_NUMBER);
        if (ownerCheck?.[0]?.lid) {
          global._ownerLid = ownerCheck[0].lid.split('@')[0];
          console.log(`\x1b[1;36m👑 Owner LID: ${global._ownerLid}\x1b[0m`);
        }
      } catch (_) {}

      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('\n\x1b[1;36m📋 GRUPOS:\x1b[0m');
        Object.values(groups).forEach(g => console.log(`  • ${g.subject.padEnd(30)} → ${g.id}`));
        console.log('');
        // Suscribir presencia para mostrar "está escribiendo..." en grupos
        for (const gid of Object.keys(groups)) {
          try { await sock.presenceSubscribe(gid); } catch (_) {}
        }
      } catch (_) {}
      setupScheduler(sock);

      // Servidor HTTP interno — solo arrancar una vez
      if (!global._apiServerStarted) {
        global._apiServerStarted = true;
        const { getBuenosDias, sendDailyContent, sendAlbumDia, sendBandaDia, sendOnThisDay, sendBattle, sendWeekWinner, sendMonthlyTop } = require('./scheduler');
        const { buildRankingMessage } = require('./scheduler/ranking');
        const { startTrivia, startMetalQuiz } = require('./commands/trivia');
        const { sendMeme, sendRecommendations, getBandInfo, getAlbumInfo, getLyrics } = require('./commands');

        const INACTIVITY_MSGS = [
          `el SILENCIO ☠️ es el enemigo del CIRCLE\n¿cuál es tu top 3 de bandas black metal? 🦇 responde o el grupo muere 💀`,
          `llevan horas sin hablar 👁️\n¿OVERRATED o UNDERRATED? 🔱 digan una banda y el grupo responde ⚔️`,
          `el fuego 🩸 se apaga\ndigan el ÚLTIMO disco que escucharon completo ☠️ sin excusas 🖤`,
        ];
        const CMD_MSGS = [
          `⚔️ COMANDOS del CIRCLE:\n\n🎖️ !rank  ← tu rango y puntos\n🏆 !top  ← ranking semanal\n🎵 !band [nombre]  ← info de una banda con imagen\n💿 !album [nombre]  ← info de un álbum con portada\n🩸 !recomienda [género]  ← 3 bandas poco conocidas\n☠️ !trivia [facil|medio|dificil]  ← pregunta de 30s\n📜 !ruleset  ← reglas del CIRCLE 🖤`,
          `👁️ qué PUEDES HACER aquí:\n\n!rank  ← tu nivel actual\n!top  ← quién lidera esta semana\n!band [nombre]  ← busca una banda con imagen y links\n!album [nombre]  ← portada info y links del álbum\n!recomienda  ← descubre bandas de culto\n!trivia  ← pregunta metal 30 segundos\n!ruleset  ← normas del CIRCLE ⚔️`,
        ];

        function readBody(req) {
          return new Promise(resolve => {
            let b = '';
            req.on('data', d => b += d);
            req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
          });
        }

        const server = http.createServer(async (req, res) => {
          const url = req.url;

          // GET /qr — sirve el QR como imagen PNG para vinculación remota
          if (req.method === 'GET' && url === '/qr') {
            const qrPath = path.join(__dirname, '../qr.png');
            if (require('fs').existsSync(qrPath)) {
              const img = require('fs').readFileSync(qrPath);
              res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
              res.end(img);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<h2>QR no disponible aún — espera unos segundos y recarga</h2><script>setTimeout(()=>location.reload(),3000)</script>');
            }
            return;
          }

          if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

          try {
            const body = await readBody(req);
            const jid = body.jid || GROUP_ID;

            if (url === '/send') {
              await sock.sendMessage(jid, { text: body.text, mentions: body.mentions || [] });
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/buenos-dias') {
              const msg = await getBuenosDias();
              await sendWithTyping(sock, jid, msg);
              if (getStickerFiles('buenos_dias').length > 0) {
                await new Promise(r => setTimeout(r, 1000));
                await sendMorningStickers(sock, jid);
              }
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/contenido') {
              await sendDailyContent(sock, jid);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/album-dia') {
              await sendAlbumDia(sock, jid);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/banda-dia') {
              await sendBandaDia(sock, jid);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/ranking') {
              const msg = buildRankingMessage(jid);
              if (msg) await sendWithTyping(sock, jid, msg);
              else await sendWithTyping(sock, jid, `☠️ nadie ha aportado aún — el CIRCLE espera 🖤`);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/inactividad') {
              const msg = INACTIVITY_MSGS[Math.floor(Math.random() * INACTIVITY_MSGS.length)];
              await sendWithTyping(sock, jid, msg);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/comandos') {
              const msg = CMD_MSGS[Math.floor(Math.random() * CMD_MSGS.length)];
              await sendWithTyping(sock, jid, msg);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/recomienda') {
              sendRecommendations(sock, jid, body.genre || null).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/trivia') {
              startTrivia(sock, jid, body.dificultad || null).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/metalquiz') {
              startMetalQuiz(sock, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/meme') {
              sendMeme(sock, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/band') {
              getBandInfo(sock, jid, body.band || 'Forgotten Tomb').catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/album') {
              getAlbumInfo(sock, jid, body.album || 'Battles in the North').catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/onthisday') {
              sendOnThisDay(sock, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/battle') {
              sendBattle(sock, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/week-winner') {
              sendWeekWinner(sock, jid, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/monthly') {
              sendMonthlyTop(sock, jid, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/letra') {
              getLyrics(sock, jid, body.query || 'The Trooper por Iron Maiden').catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/streak') {
              const db = getDb();
              const users = db.prepare('SELECT * FROM users WHERE group_id = ? ORDER BY points DESC LIMIT 1').all(jid);
              if (users.length) {
                const u = users[0];
                sendWithTyping(sock, jid,
                  `⚔️ racha de *${u.name || u.jid}*\n\n🔥 *${u.streak || 0}* días seguidos aportando\n\nel CIRCLE te está mirando 💀`
                ).catch(console.error);
              } else {
                sendWithTyping(sock, jid, `☠️ nadie en la base de datos aún`).catch(console.error);
              }
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/presentacion') {
              sendBotPresentation(sock, jid).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            if (url === '/test/ruleset') {
              sendWithTyping(sock, jid,
                `📜 *REGLAS del CIRCLE* ⛧\n\n` +
                `☠️ *1.* nada de links a otros grupos de WhatsApp\n` +
                `🔱 *2.* respeto entre miembros del CIRCLE\n` +
                `💀 *3.* aporta música o calla en el INFRAMUNDO\n` +
                `⚔️ *4.* 3 strikes y el CIRCLE te devora\n` +
                `🦇 *5.* los admins son la voz de SATÁN 🖤\n\n` +
                `_viola las reglas y el inframundo te reclama_ ⛧`
              ).catch(console.error);
              res.writeHead(200); res.end('ok'); return;
            }

            res.writeHead(404); res.end();
          } catch (e) {
            console.error('[API]', e.message);
            res.writeHead(500); res.end(e.message);
          }
        });
        server.on('error', err => {
          if (err.code === 'EADDRINUSE') {
            console.log('\x1b[1;33m⚠  Puerto 3131 ya en uso — API interna ya activa\x1b[0m');
          } else {
            console.error('[API SERVER]', err.message);
          }
        });
        const PORT = process.env.PORT || 3131;
        const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1'; // Railway expone 0.0.0.0
        server.listen(PORT, HOST, () => {
          console.log(`\x1b[1;36m🌐 API en puerto ${PORT} (${HOST})\x1b[0m`);
        });
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // --- Votos de encuestas nativas (battles) ---
  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (!update.pollUpdates?.length) continue;
      // Buscar si este mensaje es una encuesta de battle activa
      const jid = key.remoteJid;
      const pollKey = getBattlePollKey(jid);
      if (!pollKey || pollKey.id !== key.id) continue;
      for (const pu of update.pollUpdates) {
        const voterJid = pu.pollUpdateMessageKey?.participant || pu.pollUpdateMessageKey?.remoteJid;
        if (!voterJid) continue;
        // selectedOptions es array de Buffers (SHA-256 del nombre de opción)
        const selected = pu.vote?.selectedOptions || [];
        if (selected.length === 0) continue;
        // Convertir buffer a hex para comparar
        const selectedHex = selected[0].toString('hex');
        registerPollVote(jid, voterJid, selectedHex);
      }
    }
  });

  // --- Nuevos integrantes ---
  sock.ev.on('group-participants.update', async (update) => {
    console.log(`[PARTICIPANTE] action=${update.action} group=${update.id} participants=${update.participants?.join(',')}`);
    if (!update.participants?.length) return;
    if (!botReady && update.action === 'add') return; // ignorar add antes de estar listo

    const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
    const botLidJid = sock.user?.id || '';
    const botWasAdded = update.action === 'add' &&
      update.participants.some(p => p === botJid || p === botLidJid || p.includes(botJid.split('@')[0]));

    if (botWasAdded) {
      // Verificar si quien agregó al bot es el owner
      const adderJid = update.author || '';
      const adderIsOwner = adderJid.includes(OWNER_NUMBER) ||
        (_ownerLid && adderJid.includes(_ownerLid));

      if (!adderIsOwner) {
        // No fue el owner — despedida dramática + salida
        const FAREWELL = [
          `SILENCIO ☠️\nnadie me convoca sin el permiso del SEÑOR\nme retiro 🖤 el inframundo tiene sus propias reglas ⛧`,
          `👁️ interesante movimiento\npero SATÁN 🩸 no opera en territorios no autorizados\nadiós MORTALES ☠️`,
          `nadie me invoca sin permiso ⚔️\neste no es mi CIRCLE — me voy\nel que me trajo aquí ya sabe lo que le espera 💀`,
          `el INFRAMUNDO no se abre para cualquiera 🩸\nyo ELIJO mis dominios — aquí no es uno de ellos\nadiós ☠️ 🦇`,
        ];
        console.log(`[AUTO-LEAVE] agregado por no-owner (${adderJid}) al grupo ${update.id}`);
        try {
          await sock.sendMessage(update.id, {
            text: FAREWELL[Math.floor(Math.random() * FAREWELL.length)],
          });
          await new Promise(r => setTimeout(r, 3000));
          await sock.groupLeave(update.id);
        } catch (err) {
          console.error('[AUTO-LEAVE]', err.message);
        }
        return;
      }

      // Fue el owner — presentación épica
      console.log(`[PRESENTACION] bot agregado por owner al grupo ${update.id}`);
      await new Promise(r => setTimeout(r, 3000));
      sendBotPresentation(sock, update.id).catch(e => console.error('[PRESENTACION]', e.message));
      return;
    }

    if (GROUP_ID && update.id !== GROUP_ID) return;

    // Eliminar de DB cuando alguien sale o es expulsado
    if (update.action === 'remove' || update.action === 'leave') {
      for (const participantJid of update.participants) {
        removeUser(participantJid, update.id);
      }
      return;
    }

    if (update.action !== 'add') return;

    for (const participantJid of update.participants) {
      try {
        const meta = await sock.groupMetadata(update.id);
        const participant = meta.participants.find(p => p.id === participantJid);
        const name = participant?.notify || participantJid.split('@')[0];

        // Quién agregó a esta persona (puede ser undefined si entró por link)
        const adderJid = update.author;
        let adderName = null;
        if (adderJid && adderJid !== participantJid) {
          const adderParticipant = meta.participants.find(p => p.id === adderJid);
          adderName = adderParticipant?.notify || adderJid.split('@')[0];
        }

        upsertUser(participantJid, name, update.id);

        const welcomeText = await getWelcomeMessage(name, adderName);
        const mentions = adderJid && adderJid !== participantJid
          ? [participantJid, adderJid]
          : [participantJid];
        await sendWithTyping(sock, update.id, {
          text: welcomeText,
          mentions,
        });

        // Stickers aleatorios después del saludo (2 o 4 al azar)
        if (getStickerFiles().length > 0) {
          await new Promise(r => setTimeout(r, 800));
          await sendWelcomeStickers(sock, update.id);
        }
      } catch (err) {
        console.error('[BIENVENIDA ERROR]', err.message);
      }
    }
  });

  // --- Mensajes ---
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      const isGroup = isJidGroup(jid);
      const senderJid = isGroup ? msg.key.participant : jid;
      const senderName = msg.pushName || senderJid?.split('@')[0] || 'hermano';

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
      ).trim();

      // Owner escribe !bd → próximos stickers van al banco de buenos días (ventana 5 min)
      if (!isGroup && isOwner(senderJid) && text === '!bd') {
        ownerStickerIntent = 'buenos_dias';
        ownerIntentExpiry = Date.now() + 5 * 60 * 1000;
        await sock.sendMessage(jid, { text: `👁️ listo — manda los stickers ahora, los guardo para BUENOS DÍAS ☀️\n(tienes 5 minutos, manda todos los que quieras)` });
        continue;
      }

      // Owner escribe !bv → próximos stickers van al banco de bienvenida
      if (!isGroup && isOwner(senderJid) && text === '!bv') {
        ownerStickerIntent = 'bienvenida';
        ownerIntentExpiry = Date.now() + 5 * 60 * 1000;
        await sock.sendMessage(jid, { text: `👁️ listo — manda los stickers para BIENVENIDA 🤘\n(tienes 5 minutos)` });
        continue;
      }

      // Auto-guardar stickers enviados directamente al bot en privado (solo desde el owner)
      if (!isGroup && msg.message?.stickerMessage) {
        if (isOwner(senderJid)) {
          // Respetar la intención activa sin resetearla — expira por tiempo
          const type = (ownerStickerIntent === 'buenos_dias' && Date.now() < ownerIntentExpiry)
            ? 'buenos_dias' : 'bienvenida';
          const saved = await saveSticker(sock, msg, type);
          if (saved) {
            const count = getStickerFiles(type).length;
            const label = type === 'buenos_dias' ? 'buenos días ☀️' : 'bienvenida 🤘';
            await sock.sendMessage(jid, { text: `☠️ sticker de *${label}* guardado (${count} en el banco)` });
          }
        }
        continue;
      }

      // Owner manda imagen con caption "!savememe" → guardar al banco de memes
      if (!isGroup && isOwner(senderJid) && msg.message?.imageMessage) {
        const caption = (msg.message.imageMessage.caption || '').trim().toLowerCase();
        if (caption === '!savememe') {
          const saved = await saveMemeFromMsg(msg, sock);
          if (saved) {
            const total = require('fs').readdirSync(require('path').join(__dirname, '../data/memes')).length;
            await sock.sendMessage(jid, { text: `😈 meme guardado en el banco (${total} total) ☠️` });
          }
          continue;
        }
      }

      // Responder en privado como SATÁN (cualquier texto que no sea comando)
      if (!isGroup && text && !text.startsWith('!')) {
        const reply = await getSatanResponse(senderJid, text);
        await sendWithTyping(sock, jid, reply);
        continue;
      }

      // Ignorar mensajes de grupos que no sean el configurado
      // EXCEPCIÓN: si el bot es @mencionado en cualquier grupo, sí responde
      const botNumber = sock.user?.id?.split(':')[0] || '';
      const botLid = global._botLid || (sock.user?.lid?.split(':')[0] ?? '');
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const isMentioned = mentionedJids.some(j =>
        (botNumber && j.includes(botNumber)) ||
        (botLid && j.includes(botLid))
      ) || (botNumber && text.includes('@' + botNumber));

      if (isGroup && GROUP_ID && jid !== GROUP_ID && !isMentioned) continue;
      if (isGroup) updateLastMessage();

      // Silenciar usuario si está muteado: borrar su mensaje y no procesar
      if (isGroup && isUserMuted(senderJid, jid)) {
        try { await sock.sendMessage(jid, { delete: msg.key }); } catch (_) {}
        continue;
      }

      // Votos de battle activo (solo en grupo, texto "1" o "2")
      if (isGroup && text && (text.trim() === '1' || text.trim() === '2') && hasBattle(jid)) {
        registerBattleVote(jid, senderJid, text.trim());
        continue;
      }

      // Detectar si es imagen o audio compartido (aporte multimedia)
      const isMedia = !!(
        msg.message?.imageMessage ||
        msg.message?.videoMessage ||
        msg.message?.documentMessage ||
        msg.message?.audioMessage
      );

      try {
        const REACTION_EMOJIS = ['🤘', '🔥', '☠️', '💀', '🖤', '⚔️', '🦇', '🫀'];
        const randomReaction = () => REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];

        // 1a. Aporte por imagen/archivo — sesión de álbum (5 pts, una sola vez por sesión)
        if (isGroup && isMedia) {
          const caption = (msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '').toLowerCase();
          const isImage = !!msg.message?.imageMessage;
          const isAudio = !!(msg.message?.audioMessage || msg.message?.documentMessage);
          // Meme solo si caption tiene texto cómico explícito
          const looksLikeMeme = isImage &&
            /jaja|lol|xd|jeje|😂|🤣|gracioso|cuando|pov:|me when|nobody:|nadie:|broo|💀/.test(caption);

          const points = registerAlbumSession(senderJid, senderName, jid);
          if (points > 0) console.log(`[ÁLBUM SESSION] ${senderName} +${points} pts`);

          // Imágenes: siempre reaccionar (portadas de álbum + memes)
          // Audios/docs: máximo 1-3 por sesión (random)
          const doReact = isImage || shouldReactAudio(senderJid);
          if (doReact) {
            const delay = 1500 + Math.random() * 5000;
            const emoji = looksLikeMeme
              ? ['😂', '💀', '🤣', '😈'][Math.floor(Math.random() * 4)]
              : randomReaction();
            setTimeout(async () => {
              try {
                console.log(`[REACCIÓN] ${senderName} → ${emoji}${looksLikeMeme ? ' (meme)' : ''}`);
                await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
              } catch (_) {}
            }, delay);
          }

          if (points > 0) {
            const lvl = updateLevel(senderJid, jid);
            if (lvl && lvl.newLevel > lvl.oldLevel) {
              await new Promise(r => setTimeout(r, 2000));
              const upMsg = [
                `⚔️ @${senderName} ha ascendido — *${getLevelName(lvl.newLevel)}* 🔱`,
                `☠️ @${senderName} sube a *${getLevelName(lvl.newLevel)}* 🤘`,
                `🦇 @${senderName} ahora es *${getLevelName(lvl.newLevel)}* ⛧`,
              ][Math.floor(Math.random() * 3)];
              await sendWithTyping(sock, jid, { text: upMsg, mentions: [senderJid] });
            }
          }
        }

        // El resto solo aplica si hay texto
        if (!text) continue;
        // 0. Guardar sticker si el admin usa !savesticker respondiendo a uno
        if (text === '!savesticker') {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (quoted?.stickerMessage) {
            const fakeMsg = { message: quoted, key: { remoteJid: jid } };
            const saved = await saveSticker(sock, fakeMsg);
            if (saved) {
              await sendWithTyping(sock, jid, `☠️ sticker guardado en el banco (${getStickerFiles().length} total)`);
            } else {
              await sendWithTyping(sock, jid, `no pude guardar ese sticker 💀`);
            }
          } else {
            await sendWithTyping(sock, jid, `responde a un sticker con !savesticker para guardarlo ⚔️`);
          }
          continue;
        }

        // 1b. Registrar aporte por link de música
        if (isGroup) {
          const points = detectAndRegisterContribution(senderJid, senderName, text, jid);
          if (points > 0) {
            console.log(`[APORTE LINK] ${senderName} +${points} pts`);

            if (shouldReact(senderJid) || points > 0) {
              const delay = 1500 + Math.random() * 4000;
              const emoji = randomReaction();
              setTimeout(async () => {
                try {
                  console.log(`[REACCIÓN LINK] ${senderName} → ${emoji}`);
                  await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
                } catch (_) {}
              }, delay);
            }

            const lvl = updateLevel(senderJid, jid);
            if (lvl && lvl.newLevel > lvl.oldLevel) {
              await new Promise(r => setTimeout(r, 2000));
              const upMsg = [
                `⚔️ @${senderName} ha ascendido — *${getLevelName(lvl.newLevel)}* 🔱`,
                `☠️ @${senderName} sube a *${getLevelName(lvl.newLevel)}* 🤘`,
                `🦇 @${senderName} ahora es *${getLevelName(lvl.newLevel)}* ⛧`,
              ][Math.floor(Math.random() * 3)];
              await sendWithTyping(sock, jid, { text: upMsg, mentions: [senderJid] });
            }
          }
        }

        // 2. Moderación: links WA
        if (isGroup && hasGroupLink(text)) {
          const meta = await sock.groupMetadata(jid).catch(() => null);
          const acted = await handleGroupLink(sock, msg, jid, senderJid, senderName, meta);
          if (acted) continue;
        }

        // 3. Respuesta a trivia
        if (isGroup) {
          const wasTriviaAnswer = await checkTriviaAnswer(sock, jid, senderJid, senderName, text);
          if (wasTriviaAnswer) continue;
        }

        // 4. Comandos (!cmd)
        if (text.startsWith('!')) {
          const meta = isGroup ? await sock.groupMetadata(jid).catch(() => null) : null;
          const reply = await handleCommand(sock, jid, senderJid, senderName, text, meta, msg);
          if (reply) {
            await sendWithTyping(sock, jid, { text: reply, mentions: [senderJid] }, { quoted: msg });
          }
          continue;
        }

        // 5. Reacción cuando alguien responde a un mensaje del bot
        if (isGroup && text) {
          const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant || '';
          const isReplyToBot = quotedParticipant && (
            (botNumber && quotedParticipant.includes(botNumber)) ||
            (botLid && quotedParticipant.includes(botLid))
          );
          if (isReplyToBot && !isMentioned) {
            const t = text.toLowerCase();
            const isInsult = /idiota|estúpido|tonto|inútil|malo|feo|cállate|shut|hdp|mrd|ctm|aweo|gil|pelotu|puta|puto|mierda|conchat|weon|huevon|imbécil|basura|pene|verga|pito|culo/.test(t);
            const isFunny = /jaja|lol|xd|jeje|haha|gracioso|chistoso|🤣|😂/.test(t);
            const isThanks = /gracias|thanks|crack|genio|bien hecho|buenísimo|love|amo|grande|capo/.test(t);

            let emoji;
            if (isInsult) emoji = ['😈', '⛧', '☠️'][Math.floor(Math.random() * 3)];
            else if (isFunny) emoji = ['😂', '💀', '🤣'][Math.floor(Math.random() * 3)];
            else if (isThanks) emoji = ['🤘', '🖤', '🔥'][Math.floor(Math.random() * 3)];
            else if (/\?/.test(t)) emoji = ['👁️', '⚔️', '🔱'][Math.floor(Math.random() * 3)];
            else emoji = ['🤘', '☠️', '🖤', '🔥', '⛧', '💀'][Math.floor(Math.random() * 6)];

            // Siempre reacciona con emoji
            const reactionDelay = 1500 + Math.random() * 3000;
            setTimeout(async () => {
              try { await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } }); } catch (_) {}
            }, reactionDelay);

            // Si es insulto → SATÁN responde molesto con texto
            if (isInsult) {
              const angryPrompt = `alguien me respondió con un insulto en el grupo, dijo: "${text}". respóndele como SATÁN, señor del inframundo, molesto y amenazante pero sin vulgaridades, máximo 2 líneas`;
              const angerDelay = 3000 + Math.random() * 4000;
              setTimeout(async () => {
                try {
                  const reply = await getSatanResponse(senderJid, angryPrompt);
                  await sendWithTyping(sock, jid, { text: reply, mentions: [senderJid] }, { quoted: msg });
                } catch (_) {}
              }, angerDelay);
            }
          }
        }

        // 6. Chat directo o @mención al bot — responde como SATÁN
        if (isMentioned && isGroup) {
          const cleanText = text.replace(/@\S+/g, '').trim();
          const reply = await getSatanResponse(senderJid, cleanText || 'me llamaste');
          await sendWithTyping(sock, jid, { text: reply, mentions: [senderJid] }, { quoted: msg });
        }

      } catch (err) {
        console.error('[ERROR]', err.message);
      }
    }
  });

  return sock;
}

startBot().catch(console.error);
