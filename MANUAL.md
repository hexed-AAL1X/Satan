# MANUAL DE OPERACIÓN — SATÁN BOT

> Bot de WhatsApp para grupos de metal. Persona: **SATÁN, señor del inframundo**. Modera, premia aportadores, recomienda música y mantiene los grupos activos.

---

## ÍNDICE

1. [Identidades](#1-identidades)
2. [Comandos para usuarios](#2-comandos-para-usuarios)
3. [Comandos de administración](#3-comandos-de-administración)
4. [Comandos privados (solo owner)](#4-comandos-privados-solo-owner)
5. [Sistema de aportes y puntos](#5-sistema-de-aportes-y-puntos)
6. [Rangos del CIRCLE](#6-rangos-del-circle)
7. [Eventos automáticos](#7-eventos-automáticos)
8. [Cronograma completo](#8-cronograma-completo)
9. [Trivia y Metal Quiz](#9-trivia-y-metal-quiz)
10. [Moderación automática](#10-moderación-automática)
11. [Cuando el bot se une a un grupo](#11-cuando-el-bot-se-une-a-un-grupo)
12. [Persistencia y base de datos](#12-persistencia-y-base-de-datos)
13. [Variables de entorno](#13-variables-de-entorno)
14. [Endpoints HTTP](#14-endpoints-http)

---

## 1. Identidades

| Rol | Número | Notas |
|-----|--------|-------|
| **Bot** | `BOT_NUMBER` en `.env` | Cuenta de WhatsApp del bot |
| **Owner** | `OWNER_NUMBER` en `.env` | Unico autorizado para anadir el bot a grupos y gestionar stickers/memes |

Cualquier otra persona que añada el bot a un grupo recibe despedida dramática y el bot sale automáticamente.

---

## 2. Comandos para usuarios

Todos los comandos funcionan en grupos donde el bot esté presente.

| Comando | Qué hace | Ejemplo |
|---------|----------|---------|
| `!help` · `!ayuda` · `!comandos` | Lista de comandos | `!help` |
| `!rank` · `!rango` | Tu rango y puntos | `!rank` |
| `!top` · `!ranking` | Top 10 semanal del grupo | `!top` |
| `!streak` | Tu racha de días aportando | `!streak` |
| `!ruleset` · `!reglas` · `!rules` | Reglas del grupo (tono SATÁN, emojis fijos) | `!reglas` |
| `!band [nombre]` | Info + imagen de una banda con links a YouTube y Spotify | `!band Mayhem` |
| `!album [álbum] de [banda]` | Info + portada de un álbum | `!album Reign in Blood de Slayer` |
| `!album [álbum]` | Igual pero sin especificar banda | `!album Master of Puppets` |
| `!letra [canción] por [artista]` | Letra de la canción + portada del álbum | `!letra Raining Blood por Slayer` |
| `!recomienda [género/descripción]` | 3 bandas de culto con imágenes | `!recomienda black metal noruego` |
| `!recomienda [descripción]` | Acepta descripciones largas | `!recomienda bandas con baterías rápidas y caos` |
| `!trivia` | Pregunta random, 30 segundos | `!trivia` |
| `!trivia [facil\|medio\|dificil]` | Pregunta por dificultad, 30 segundos | `!trivia dificil` |
| `!onthisday` · `!hoy` | Qué pasó hoy en la historia del metal | `!onthisday` |

### Trivia: cómo responder

Cuando hay una trivia activa, escribe solo la letra: `A`, `B` o `C`.

---

## 3. Comandos de administración

> Solo funcionan si quien los escribe es:
> - **Admin del grupo** en WhatsApp, o
> - El **owner** del bot (`OWNER_NUMBER`)

| Comando | Qué hace | Ejemplo |
|---------|----------|---------|
| `!mute @persona [horas]` | Silencia. Sin número = 24h | `!mute @Juan 12` |
| `!unmute @persona` | Quita el mute | `!unmute @Juan` |
| `!ban @persona` | Expulsa del grupo | `!ban @Juan` |

**Importante:** la `@persona` debe ser una mención real (azul). Selecciónala del autocompletado de WhatsApp, no la escribas a mano.

Cuando alguien está muteado, sus mensajes se borran automáticamente.

---

## 4. Comandos privados (solo owner)

Estos comandos solo funcionan en el chat privado del owner con el bot.

| Comando | Qué hace | Cómo se usa |
|---------|----------|-------------|
| `!bv` | Activa modo "guardar stickers de bienvenida" durante 5 minutos | Escribes `!bv`, después envías stickers |
| `!bd` | Activa modo "guardar stickers de buenos días" durante 5 minutos | Escribes `!bd`, después envías stickers |
| `!savememe` (en caption de imagen) | Guarda esa imagen al banco de memes | Mandas la imagen con caption `!savememe` |

Cualquier otro mensaje al privado el bot lo responde como SATÁN.

---

## 5. Sistema de aportes y puntos

El bot detecta automáticamente:

- **Imágenes** (portadas de álbumes) → +5 pts por sesión
- **Audios / documentos** (mp3, archivos) → +5 pts por sesión
- **Videos** → +5 pts por sesión
- **Links de YouTube, Spotify, Bandcamp, Soundcloud** → +3 pts

### Sesión de álbum

Si alguien sube varios archivos seguidos (imagen del álbum + canciones del álbum), se cuentan como **una sola sesión** durante 90 segundos → solo recibe puntos una vez (evita spam de puntos).

### Reacciones automáticas

El bot reacciona con emojis aleatorios a los aportes:
- **Imágenes**: siempre reacciona (puede detectar memes y reaccionar con 😂💀)
- **Audios**: reacciona aleatoriamente (1-3 por sesión, no a todos)
- **Links**: reacción aleatoria con delay de 1.5-5 segundos

Si alguien responde a un mensaje del bot, también reacciona según el tono (insulto, agradecimiento, broma, pregunta).

---

## 6. Rangos del CIRCLE

Hay 15 rangos. Subes automáticamente al alcanzar los puntos.

| Rango | Nombre | Emoji | Puntos requeridos |
|-------|--------|-------|-------------------|
| 1 | Initiate | 🕯️ | 0 |
| 2 | Acolyte | 🗡️ | 20 |
| 3 | Headbanger | 🤘 | 50 |
| 4 | Warrior | ⚔️ | 100 |
| 5 | Berserker | 🔥 | 175 |
| 6 | Warlord | 💀 | 275 |
| 7 | Deathbringer | ☠️ | 400 |
| 8 | Black Knight | 🩸 | 550 |
| 9 | Necromancer | 🦇 | 725 |
| 10 | Archpriest of Chaos | ⛧ | 925 |
| 11 | Blood Sovereign | 🔱 | 1150 |
| 12 | Fallen Angel | 👁️ | 1400 |
| 13 | Herald of the Abyss | 🩸 ☠️ | 1700 |
| 14 | Dark Lord | 🖤 💀 | 2050 |
| 15 | Lord of the Abyss | 🔱 🩸 | 2500 |

Cuando alguien sube de rango, el bot anuncia el ascenso.

---

## 7. Eventos automáticos

### Cuando entra un nuevo miembro

- Bienvenida personalizada (generada por IA + fallbacks de respaldo)
- Si tiene quien lo agregó visible, lo menciona
- Envía 2-4 stickers de bienvenida (si están guardados)

### Buenos días con sticker

- **7:00 AM Lun–Vie** (sin despertar el fin de semana)
- Mensaje generado en tiempo real con Groq
- 1 sticker del banco de buenos días (si hay)

### On This Day

- **7:00 AM Lun/Mié/Vie** (3× por semana, no diario)
- Solo hechos del calendario verificado en `data/content.js` (muertes, lanzamientos, etc. con fecha exacta)
- **Sin Groq inventando fechas** — si no hay hecho verificado para ese día, no publica nada
- Si hay evento, lo manda con imagen del artista cuando aplica

### Contenido diario

- **7:00 PM** diario (1 slot; antes 9AM/1PM/7PM)
- Rotativo: álbum del día, banda del día, canción del día, curiosidad metal

### Detector de inactividad

- Cada **2 horas** chequea
- Si pasan **8 horas** sin mensajes, lanza prompt para activar el grupo
- Solo entre las **9 AM y las 10 PM**

### Recordatorio de comandos

- **12:00 PM** una vez al día (antes cada 6 h)
- Mensaje aleatorio recordando comandos disponibles

### Ranking semanal

- Lunes a las 9:05 AM
- Anuncia al ganador de la semana anterior
- Muestra el podio nuevo (vacío al inicio porque se reinicia)

### Top mensual

- Día 1 de cada mes a las 9:00 AM
- Top del mes anterior, luego resetea los puntos mensuales

### Battle

- Sábados y domingos a las 2:00 PM
- Encuesta nativa de WhatsApp con 2 opciones
- 30 minutos para votar
- Anuncia ganador automáticamente

### Metal Quiz (oculto)

- **Viernes 7:30 PM** (1 ronda semanal; antes Lun/Mié/Vie × 2)
- 3 preguntas Groq por dificultad (aleatoria en cron; `!metalquiz dificil` manual)
- 5 pts por acertar, 15 pts bonus para el primero que acierte las 3
- Avanza a la siguiente pregunta cuando alguien acierta

---

## 8. Cronograma completo

Zona horaria: **America/Lima (Perú)**.

Modo **~50% menos invasivo**: el bot interviene menos pero sigue activo cuando el grupo está muerto.

| Hora | Días | Evento |
|------|------|--------|
| 07:00 | Lun–Vie | Buenos días + sticker |
| 07:00 | Lun/Mié/Vie | On This Day (alternado; no diario) |
| 09:05 | Lunes | Ranking semanal + ganador anterior |
| 09:00 | Día 1 del mes | Top mensual + reset |
| 12:00 | Diario | Recordatorio de comandos (1× al día) |
| 14:00 | Sábado | Battle (encuesta; antes también domingo) |
| 19:00 | Diario | Contenido diario (1 slot; antes 9AM/1PM/7PM) |
| 19:30 | Viernes | Metal Quiz |
| Cada 2 h, 9–22 | Diario | Check inactividad (si ≥8 h sin mensajes; antes 4 h) |

Todas las funciones automáticas se envían a **todos los grupos donde el bot esté presente**.

---

## 9. Trivia y Metal Quiz

### `!trivia` (público, sin puntos)

- 1 sola pregunta
- 30 segundos para responder
- No otorga puntos
- Cualquiera puede invocarlo

### Metal Quiz (oculto, con puntos)

- 3 preguntas consecutivas **generadas por Groq** según dificultad (fácil / media / difícil)
- Sin tiempo límite
- **+5 pts** por cada respuesta correcta
- **+15 pts bonus** al primero que conteste las 3 correctamente
- Viernes 19:30 con dificultad aleatoria; manual: `!metalquiz [facil|medio|dificil]`
- **Solo Groq** — sin banco estático; si la IA no responde, no inicia la ronda
- Acepta respuestas `A`, `B`, `C` también como `B?`, `b)`, `opción B`, etc.

### Comportamiento

- Si fallas, SATÁN se burla con respuestas dinámicas generadas por IA
- No se revela la respuesta hasta que alguien acierte
- La pregunta avanza cuando alguien la acierta correctamente

---

## 10. Moderación automática

### Links de otros grupos de WhatsApp

Si alguien manda un link `chat.whatsapp.com/...` (que NO sea admin):

1. **Strike 1**: el bot borra el mensaje y avisa
2. **Strike 2**: silenciado por 24 horas + aviso
3. **Strike 3**: expulsión del grupo

### Links permitidos

YouTube, Spotify, Instagram, Facebook, TikTok, Bandcamp, SoundCloud, Twitter/X.

### Insultos al bot

Si alguien responde a un mensaje del bot con un insulto, el bot reacciona con emojis amenazantes y puede responder molesto.

---

## 11. Cuando el bot se une a un grupo

### Si lo anade el owner (`OWNER_NUMBER`)

1. El bot manda una presentación épica generada por IA con una imagen imponente de Satán
2. Se queda en el grupo
3. El registro queda persistido en la DB (no se vuelve a presentar aunque haya reinicios)

### Si lo añade cualquier otra persona

1. El bot manda un mensaje de despedida dramática
2. Sale del grupo automáticamente (`groupLeave`)

### Si lo añadieron durante un reinicio

Cuando arranca, revisa todos sus grupos:
- Si un grupo no tiene registro de presentación, manda la presentación
- Si ya hay registro, no hace nada (no spam)

---

## 12. Persistencia y base de datos

La base de datos SQLite y la sesión de WhatsApp se guardan en `/app/auth_info_baileys/` que está montado como **volumen persistente en Railway**.

Esto significa que sobreviven:
- Reinicios del contenedor
- Redeploys
- Crashes

Tablas principales:
- `users` — usuarios por grupo con puntos, rangos, strikes, racha
- `contributions` — historial de aportes
- `strikes` — historial de strikes
- `trivia` / `metalquiz` — solo Groq; contenido diario e inactividad igual
- `bot_state` — estado interno (índices usados, grupos con presentación, etc.)

---

## 13. Variables de entorno

En Railway → **Variables**:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `BOT_NUMBER` | (sin +) | Numero del bot |
| `OWNER_NUMBER` | (sin +) | Numero del owner |
| `GROUP_ID` | (cualquiera de los reales) | Grupo "principal" para fallback del scheduler |
| `GROQ_API_KEY` | `gsk_...` | API de Groq para IA |
| `PORT` | `3131` | Puerto HTTP |
| `TZ` | `America/Lima` | Timezone |
| `GROUP_ALIASES` | JSON opcional | Alias de grupos para `!setrank` |

---

## 14. Endpoints HTTP

URL base: `https://tu-app.railway.app` (o tu dominio privado)

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/qr` | Muestra el QR para vincular sesion (**no expongas esta URL publicamente**) |
| GET | `/test/presentacion` | Envía presentación al `GROUP_ID` |
| GET | `/test/buenos-dias` | Envía buenos días al `GROUP_ID` |
| GET | `/test/contenido` | Envía contenido diario al `GROUP_ID` |
| POST | `/send` | Envía texto a un grupo (body: `{jid, text}`) |
| POST | `/test/{tipo}` | Endpoints de prueba con body `{jid}` |

Estos endpoints estan pensados para debug en despliegues privados. Protege el dominio o restringe acceso; `/qr` permite vincular la sesion de WhatsApp.

---

## 15. Stickers

El bot tiene dos bancos de stickers:

- **Bienvenida** (`data/stickers/bienvenida/`): se mandan 2-4 cuando entra alguien nuevo
- **Buenos días** (`data/stickers/buenos_dias/`): se manda 1 cada mañana a las 5 AM

### Cómo agregar stickers

1. Owner manda `!bv` o `!bd` en privado al bot
2. Durante los siguientes 5 minutos, todos los stickers que envíe se guardan en ese banco
3. Para cambiar de banco, manda el otro comando

---

## 16. Memes

- El bot tiene un banco local en `data/memes/`
- También intenta sacar memes de subreddits metaleros
- Owner puede agregar memes mandando una imagen con caption `!savememe`
- El comando `!meme` está oculto del help público pero funciona si se invoca

---

## 17. Persona SATÁN

Cuando interactúa con texto generado por IA, SATÁN:

- Mezcla minúsculas con PALABRAS COMPLETAS en mayúsculas para énfasis
- Usa emojis temáticos: ☠️ ⚔️ 🦇 💀 👁️ 🩸 ⛧ 🤘 🔱 🖤 🔥
- No usa guiones
- No traduce géneros musicales (black metal, death metal, etc.)
- No es positivo/soft: oscuro, agresivo, intenso
- Menciona "el CIRCLE", "INNER CIRCLE", "inframundo"

### Cuando lo mencionas con `@~SATÁN`

Responde según el contexto:
- Si preguntas por comandos → te dirige a `!help`
- Si pides recomendaciones → te ejecuta `!recomienda` con la query
- Si pides un link de banda → te ejecuta `!band`
- Si pides letra → te ejecuta `!letra`
- Si es chat normal → responde como SATÁN

---

## 18. Logs útiles en Railway

| Log | Qué significa |
|-----|---------------|
| `[MSG] grupo X: "..."` | Llegó un mensaje |
| `[PART-CHECK]` | Detección de bot agregado a un grupo |
| `[BOT-ADD]` | Confirmación de que el bot fue añadido |
| `[PRESENTACION]` | Envío de presentación |
| `[BOT-REMOVED]` | El bot fue sacado de un grupo |
| `[APORTE LINK]` | Detectó un aporte por link |
| `[ÁLBUM SESSION]` | Sesión de álbum activa |
| `[REACCIÓN]` | Reaccionó a un mensaje |
| `[AUTO-LEAVE]` | Se va del grupo (no fue invitado por owner) |
| `[MENTION]` | Detección de mención al bot |

---

🖤 *Documentación del CIRCLE — el inframundo es código* ⛧
