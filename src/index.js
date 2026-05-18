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

const { upsertUser, getDb, updateLevel, removeUser, isUserMuted, hasGroupPresentation, markGroupPresentation, removeGroupPresentation } = require('./db');
const { getLevelName, getLevelEmoji } = require('./scheduler/ranking');
const { getWelcomeMessage, sendBotPresentation } = require('./handlers/welcome');
const { getSatanResponse } = require('./handlers/satan-dm');
const { saveSticker, sendWelcomeStickers, sendMorningStickers, getStickerFiles } = require('./handlers/stickers');
const { hasGroupLink, handleGroupLink } = require('./moderation/links');
const { detectAndRegisterContribution, registerAlbumSession, shouldReact, shouldReactAudio, classifyMedia } = require('./contributions/detect');
const { handleChatMessage, handleCommand, saveMemeFromMsg } = require('./commands');
const { checkTriviaAnswer } = require('./commands/trivia');
const { setupScheduler, updateLastMessage, registerBattleVote, registerPollVote, getBattlePollKey, hasBattle } = require('./scheduler');
const { sendWithTyping } = require('./utils/typing');

const AUTH_DIR = path.join(__dirname, '../auth_info_baileys');
const GROUP_ID = process.env.GROUP_ID || '';
const OWNER_NUMBER = '51943605088';
const BOT_NUMBER = process.env.BOT_NUMBER || '51937761964';
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

// Servidor HTTP para servir el QR y la API interna — arranca inmediatamente
const _httpServer = (() => {
  const PORT = process.env.PORT || 3131;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/qr') {
      const qrPath = path.join(__dirname, '../qr.png');
      if (require('fs').existsSync(qrPath)) {
        const img = require('fs').readFileSync(qrPath);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
        res.end(img);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2 style="font-family:sans-serif;text-align:center;margin-top:20%">QR generándose... recarga en 3 segundos</h2><script>setTimeout(()=>location.reload(),3000)</script>');
      }
      return;
    }
    // Para el resto de rutas POST (API interna) las maneja el servidor completo
    // Este servidor solo atiende GET /qr antes de conectarse
    res.writeHead(503); res.end('bot iniciando...');
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\x1b[1;36m🌐 Servidor QR en puerto ${PORT}\x1b[0m`);
  });
  server.on('error', () => {}); // ignorar si ya está en uso
  return server;
})();

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
        // Guardar grupos conocidos para detectar cuando el bot sea añadido a uno nuevo
        global._knownGroups = global._knownGroups || new Set(Object.keys(groups));
        // Suscribir presencia para mostrar "está escribiendo..." en grupos
        for (const gid of Object.keys(groups)) {
          try { await sock.presenceSubscribe(gid); } catch (_) {}
        }
        // Detectar grupos sin presentación (bot fue añadido durante un reinicio)
        // IMPORTANTE: marcar ANTES de enviar para evitar spam si hay crash o reintentos
        for (const gid of Object.keys(groups)) {
          if (!hasGroupPresentation(gid)) {
            console.log(`[PRESENTACION-STARTUP] grupo sin presentación detectado: ${gid}`);
            markGroupPresentation(gid); // marca inmediatamente — no spammear
            await new Promise(r => setTimeout(r, 4000));
            sendBotPresentation(sock, gid)
              .catch(e => console.error('[PRESENTACION-STARTUP]', e.message));
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      } catch (_) {
        global._knownGroups = global._knownGroups || new Set();
      }
      // Guardar el sock actual globalmente para que el scheduler use siempre el activo
      global._sock = sock;
      // Solo instalar scheduler una vez por proceso (reconexiones reusan el getter)
      if (!global._schedulerInstalled) {
        global._schedulerInstalled = true;
        // El scheduler recibirá un getter para tomar siempre el sock vivo
        setupScheduler({ getSock: () => global._sock });
      } else {
        console.log('[SCHEDULER] ya estaba instalado — sock actualizado');
      }

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

          // GET de prueba para endpoints test (desde navegador)
          if (req.method === 'GET' && url.startsWith('/test/')) {
            const jidParam = GROUP_ID;
            if (url === '/test/presentacion') {
              sendBotPresentation(sock, jidParam).catch(console.error);
              res.writeHead(200); res.end('presentacion enviada a ' + jidParam); return;
            }
            if (url === '/test/buenos-dias') {
              getBuenosDias().then(msg => sendWithTyping(sock, jidParam, msg)).catch(console.error);
              res.writeHead(200); res.end('buenos dias enviados'); return;
            }
            if (url === '/test/contenido') {
              sendDailyContent(sock, jidParam).catch(console.error);
              res.writeHead(200); res.end('contenido enviado'); return;
            }
            res.writeHead(200); res.end('endpoint de test: ' + url); return;
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
        // Cerrar el servidor QR simple y reemplazarlo con la API completa
        _httpServer.close(() => {
          server.listen(PORT, '0.0.0.0', () => {
            console.log(`\x1b[1;36m🌐 API completa en puerto ${PORT}\x1b[0m`);
          });
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
    const botPhoneNum = BOT_NUMBER || (sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : '');
    const botLidNum = global._botLid || '';
    // Método 1: comparar por JID/LID
    const botInParticipants = update.participants.some(p =>
      p === botJid ||
      (botPhoneNum && p.includes(botPhoneNum)) ||
      (botLidNum && p.includes(botLidNum))
    );
    // Método 2: el grupo es nuevo (no estaba en los grupos conocidos al arrancar)
    const knownGroups = global._knownGroups || new Set();
    const isNewGroup = update.action === 'add' && !knownGroups.has(update.id);
    const botWasAdded = update.action === 'add' && (botInParticipants || isNewGroup);
    console.log(`[PART-CHECK] botJid=${botJid} botPhone=${botPhoneNum} botLid=${botLidNum} participants=${update.participants?.join(',')} botInP=${botInParticipants} isNewGroup=${isNewGroup}`);

    if (botWasAdded) {
      // Registrar el grupo como conocido
      knownGroups.add(update.id);
      const adderJid = update.author || '';
      const ownerLidResolved = global._ownerLid || '';
      const adderIsOwner = adderJid.includes(OWNER_NUMBER) ||
        (ownerLidResolved && adderJid.includes(ownerLidResolved));
      // Si no podemos identificar al adder (LID no resuelto aún), dar beneficio de la duda
      const adderUnknown = !adderJid || (!adderJid.includes('@') );
      console.log(`[BOT-ADD] grupo=${update.id} adder=${adderJid} ownerLid=${ownerLidResolved} isOwner=${adderIsOwner} unknown=${adderUnknown}`);

      if (!adderIsOwner && !adderUnknown) {
        // Confirmado que no fue el owner — despedida dramática + salida
        const FAREWELL = [
          `SILENCIO ☠️\nnadie me convoca sin el permiso del SEÑOR\nme retiro 🖤 el inframundo tiene sus propias reglas ⛧`,
          `👁️ interesante movimiento\npero SATÁN 🩸 no opera en territorios no autorizados\nadiós MORTALES ☠️`,
          `nadie me invoca sin permiso ⚔️\neste no es mi CIRCLE — me voy\nel que me trajo aquí ya sabe lo que le espera 💀`,
          `el INFRAMUNDO no se abre para cualquiera 🩸\nyo ELIJO mis dominios — aquí no es uno de ellos\nadiós ☠️ 🦇`,
        ];
        console.log(`[AUTO-LEAVE] adder confirmado no-owner: ${adderJid}`);
        try {
          await sock.sendMessage(update.id, { text: FAREWELL[Math.floor(Math.random() * FAREWELL.length)] });
          await new Promise(r => setTimeout(r, 3000));
          await sock.groupLeave(update.id);
        } catch (err) { console.error('[AUTO-LEAVE]', err.message); }
        return;
      }

      // Owner confirmado o adder desconocido — presentación épica
      // Marcar ANTES para evitar duplicados ante reintentos
      if (hasGroupPresentation(update.id)) {
        console.log(`[PRESENTACION] grupo ${update.id} ya tiene presentación — skip`);
        return;
      }
      console.log(`[PRESENTACION] bot agregado al grupo ${update.id}`);
      markGroupPresentation(update.id);
      await new Promise(r => setTimeout(r, 3000));
      sendBotPresentation(sock, update.id)
        .catch(e => console.error('[PRESENTACION]', e.message));
      return;
    }

    // Eliminar de DB cuando alguien sale o es expulsado
    if (update.action === 'remove' || update.action === 'leave') {
      const botRemoved = update.participants.some(p =>
        (botPhoneNum && p.includes(botPhoneNum)) ||
        (botLidNum && p.includes(botLidNum)) ||
        p === botJid
      );
      if (botRemoved) {
        global._knownGroups?.delete(update.id);
        removeGroupPresentation(update.id);
        console.log(`[BOT-REMOVED] saliendo de ${update.id}, presentación reseteada`);
      }
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

      // Normalizar mensaje (ephemeral, viewOnce, etc.)
      const rawMsg = msg.message?.ephemeralMessage?.message ||
        msg.message?.viewOnceMessage?.message ||
        msg.message?.viewOnceMessageV2?.message ||
        msg.message?.documentWithCaptionMessage?.message ||
        msg.message;
      const text = (
        rawMsg?.conversation ||
        rawMsg?.extendedTextMessage?.text ||
        rawMsg?.imageMessage?.caption ||
        rawMsg?.videoMessage?.caption ||
        rawMsg?.documentMessage?.caption ||
        ''
      ).trim();
      console.log(`[MSG] ${isGroup ? 'grupo' : 'privado'} ${senderName}: "${text.slice(0,60)}" tipo=${Object.keys(rawMsg||{}).join(',').slice(0,80)}`);

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

      // El bot opera en TODOS los grupos donde esté
      // Solo se usa GROUP_ID como grupo principal para scheduler/ranking
      // Detectar @menciones igual para usarlas en respuesta
      const botNumber = sock.user?.id?.split(':')[0] || '';
      const botLid = global._botLid || (sock.user?.lid?.split(':')[0] ?? '');
      const ctxInfo = rawMsg?.extendedTextMessage?.contextInfo ||
        msg.message?.extendedTextMessage?.contextInfo || {};
      const mentionedJids = ctxInfo.mentionedJid || [];
      const isMentioned = mentionedJids.some(j =>
        (botNumber && j.includes(botNumber)) ||
        (botLid && j.includes(botLid))
      ) || (botNumber && text.includes('@' + botNumber))
        || text.toLowerCase().includes('@satán')
        || text.toLowerCase().includes('@satan');
      if (isGroup) {
        updateLastMessage();
        if (mentionedJids.length > 0 || text.includes('@')) {
          console.log(`[MENTION] text="${text}" mentionedJids=${JSON.stringify(mentionedJids)} botNum=${botNumber} botLid=${botLid} isMentioned=${isMentioned}`);
        }
      }

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
        rawMsg?.imageMessage ||
        rawMsg?.videoMessage ||
        rawMsg?.documentMessage ||
        rawMsg?.audioMessage
      );

      try {
        const REACTION_EMOJIS = ['🤘', '🔥', '☠️', '💀', '🖤', '⚔️', '🦇', '🫀'];
        const randomReaction = () => REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];

        // 1a. Aporte por imagen/archivo — sesión de álbum (5 pts, solo si es música real)
        if (isGroup && isMedia) {
          const caption = (rawMsg?.imageMessage?.caption || rawMsg?.videoMessage?.caption || '').toLowerCase();
          const isImage = !!rawMsg?.imageMessage;

          // Meme solo si caption tiene texto cómico explícito
          const looksLikeMeme = isImage &&
            /jaja|lol|xd|jeje|😂|🤣|gracioso|cuando|pov:|me when|nobody:|nadie:|broo|💀/.test(caption);

          // Clasificar primero el contenido antes de decidir puntos/reacciones
          const kind = classifyMedia(rawMsg, senderJid, jid);
          const points = registerAlbumSession(senderJid, senderName, jid, rawMsg);
          if (points > 0) console.log(`[APORTE +${points}] ${senderName} (${kind})`);

          // Reaccionar SOLO si es contenido musical o un meme con caption explícito
          const doReact = (kind === 'music' && (isImage || shouldReactAudio(senderJid, jid))) || looksLikeMeme;
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

            if (shouldReact(senderJid, jid) || points > 0) {
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
            if (typeof reply === 'object' && reply.text) {
              await sendWithTyping(sock, jid, { text: reply.text, mentions: reply.mentions || [senderJid] }, { quoted: msg });
            } else {
              await sendWithTyping(sock, jid, { text: reply, mentions: [senderJid] }, { quoted: msg });
            }
          }
          continue;
        }

        // 5. Reacción cuando alguien responde a un mensaje del bot
        if (isGroup && text) {
          const ctxQuoted = ctxInfo || msg.message?.extendedTextMessage?.contextInfo || {};
          const quotedParticipant = ctxQuoted.participant || '';
          const isReplyToBot = quotedParticipant && (
            (botNumber && quotedParticipant.includes(botNumber)) ||
            (botLid && quotedParticipant.includes(botLid))
          );

          // Si responde a una recomendación / banda / álbum del bot pidiendo link o info → redirige a !album o !band
          if (isReplyToBot && !isMentioned) {
            const lowText = text.toLowerCase().trim();
            const wantsLink = (
              // Pide link o info explícito
              /link|enlace|p[aá]same|escuchar|d[oó]nde|c[oó]mo lo|info|m[aá]s info|cu[eé]ntame|mu[eé]strame|env[ií]a|m[aá]ndame|busca|encuentra|investiga/.test(lowText) ||
              // Pide deíctico — "dame este", "quiero esta", "ese", "este sí"
              /\b(?:dame|quiero|ponme|tr[aá]eme|mu[eé]strame|m[aá]ndame|p[aá]same|p[aá]salo)\b/.test(lowText) ||
              /\b(?:este|esta|eso|ese|esa|estos|esas|el siguiente|el de arriba|el primero|el segundo|el tercero|del primero|del segundo|del tercero)\b/.test(lowText) ||
              // Variaciones muy cortas
              /^(?:dale|este|esta|eso|ese|esa|si|sí|yes|🤘|🔥|☠️|m[aá]s|otro|otra)$/i.test(lowText)
            );
            if (wantsLink) {
              const quotedMsg = ctxQuoted.quotedMessage || {};
              const quotedCaption = quotedMsg.imageMessage?.caption ||
                quotedMsg.videoMessage?.caption ||
                quotedMsg.extendedTextMessage?.text ||
                quotedMsg.conversation || '';

              // Patrones de las recomendaciones (markdown WhatsApp con asteriscos)
              // Formato típico: "💿 *Banda* — País\n🩸 Album: *Nombre Album* (Año)"
              const bandMatch = quotedCaption.match(/[💿🎸🩸]\s*\*([^*\n]+)\*/);
              const albumMatch = quotedCaption.match(/[Aa]lbum:\s*[_*]?([^_*\n(]+?)[_*]?\s*(?:\(|$)/);

              const band = bandMatch ? bandMatch[1].trim() : null;
              const album = albumMatch ? albumMatch[1].trim() : null;

              if (band && album) {
                const { getAlbumInfo } = require('./commands');
                console.log(`[QUOTED-LINK] band=${band} album=${album}`);
                await sendWithTyping(sock, jid, { text: `🔥 invocando *${album}* de *${band}* ⚔️`, mentions: [senderJid] }, { quoted: msg });
                getAlbumInfo(sock, jid, `${album} de ${band}`).catch(() => {});
                continue;
              }
              if (band) {
                const { getBandInfo } = require('./commands');
                console.log(`[QUOTED-LINK] solo band=${band}`);
                await sendWithTyping(sock, jid, { text: `🔥 invocando *${band}* ⚔️`, mentions: [senderJid] }, { quoted: msg });
                getBandInfo(sock, jid, band).catch(() => {});
                continue;
              }
            }
          }

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

        // 6. Chat directo o @mención al bot — responde como SATÁN con guía de comandos si aplica
        if (isMentioned && isGroup) {
          const cleanText = text.replace(/@\S+/g, '').trim();
          const lower = cleanText.toLowerCase();

          // Si piden recomendaciones → redirige a !recomienda
          if (/recomienda|recomendam|recomendá|recomiéndame|recomiendame|recom[ie]nd|suger[ie]nc|suger[ií]|albums?|bandas? (?:de|con|para)/.test(lower)) {
            const query = cleanText
              .replace(/^(?:recom[ie]nd[ae]?m?[eé]?|sug[ei]r[eí]nce?m?e?|p[oa]s[aá]m?e?|d[ai]m?e?|busc[ae]m?e?)\s*/i, '')
              .replace(/^(?:bandas?|albums?|discos?)\s+(?:de|con|para)\s*/i, '')
              .trim() || 'metal extremo';
            await sendWithTyping(sock, jid, { text: `🩸 invocando recomendaciones de *${query}* — usa también *!recomienda ${query}* directo ⚔️`, mentions: [senderJid] }, { quoted: msg });
            const { sendRecommendations } = require('./commands');
            sendRecommendations(sock, jid, query).catch(() => {});
            continue;
          }

          // Si piden link/info de una banda específica → redirige a !band
          const bandLinkMatch = cleanText.match(/link[s]? (?:de |del )?(.+)|(?:busca|encuentra|dónde|donde) (?:a |la banda |)(.+)/i);
          if (bandLinkMatch) {
            const bandName = (bandLinkMatch[1] || bandLinkMatch[2] || '').trim();
            if (bandName) {
              await sendWithTyping(sock, jid, { text: `usa *!band ${bandName}* para ver info y links ⚔️`, mentions: [senderJid] }, { quoted: msg });
              const { getBandInfo } = require('./commands');
              getBandInfo(sock, jid, bandName).catch(() => {});
              continue;
            }
          }

          // Si piden letra → redirige a !letra
          const lyricsMatch = cleanText.match(/(?:letra|lyrics)\s+(?:de |of )?(.+)/i);
          if (lyricsMatch && lyricsMatch[1]) {
            const song = lyricsMatch[1].trim();
            await sendWithTyping(sock, jid, { text: `🎤 usa *!letra ${song}* para ver la letra completa ⛧`, mentions: [senderJid] }, { quoted: msg });
            const { getLyrics } = require('./commands');
            getLyrics(sock, jid, song).catch(() => {});
            continue;
          }

          // Si preguntan por comandos/funciones → !help
          if (/comando[s]?|función|funciones|cómo|como usar|qué hace|que hace|ayuda\b|help\b|menú|menu/i.test(lower)) {
            const helpText = `👁️ *usa !help* para ver todos mis comandos ⚔️\no !band, !album, !recomienda, !trivia, !rank, !top, !streak, !letra 🖤`;
            await sendWithTyping(sock, jid, { text: helpText, mentions: [senderJid] }, { quoted: msg });
            continue;
          }

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
