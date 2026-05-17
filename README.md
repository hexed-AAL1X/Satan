# Metal Bot — The Black Circle

Bot de WhatsApp para gestión del grupo de metal.

## Arrancar por primera vez

```bash
npm install
npm start
```

Escanea el QR con WhatsApp → Dispositivos vinculados → Vincular dispositivo.

## Configurar

Edita `.env`:

```
GROUP_ID=        # ID del grupo (aparece en consola al primer mensaje del grupo)
TEST_MODE=true   # true mientras pruebas, false para activar en el grupo
```

## Comandos disponibles

| Comando | Función |
|---|---|
| `!rank` | Tu rango y puntos |
| `!top` | Ranking semanal |
| `!ruleset` | Reglas del grupo |
| `!recomienda [genero]` | 3 bandas sugeridas |
| `!metalquiz` | Trivia |
| `!meme` | Meme metalero |
| `!band [nombre]` | Info de banda |

## Estructura

```
src/
  index.js              # Entry point, conexión Baileys
  db/index.js           # SQLite — usuarios, aportes, strikes
  handlers/welcome.js   # Mensajes de bienvenida variados
  moderation/links.js   # Detección de links WA + strikes
  contributions/detect.js # Detección de aportes (música, videos)
  commands/index.js     # Comandos !cmd y respuestas de chat
  scheduler/ranking.js  # Ranking semanal del lunes
data/
  metal_bot.db          # Base de datos (se crea automáticamente)
```
