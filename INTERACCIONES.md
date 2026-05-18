# GUÍA DE INTERACCIONES DEL USUARIO

> Análisis de cómo los usuarios **realmente** se comunican con el bot vs. cómo asumen que deberían. Cada sección lista las formas naturales que un humano usaría para pedir algo — útil para entrenar/expandir los detectores del bot.
>
> ✅ = ya funciona · ⚠️ = parcialmente · ❌ = no funciona aún · 💡 = sugerencia de implementación

---

## 1. Pedir información de una banda

### Cómo el bot espera que le pidan
```
!band Mayhem
```

### Cómo los usuarios realmente piden

| Forma | Estado | Notas |
|-------|--------|-------|
| `!band Mayhem` | ✅ | Sintaxis oficial |
| `@~SATÁN dame info de Mayhem` | ✅ | Detectado por regex de mención |
| `@~SATÁN busca Mayhem` | ✅ | Detectado |
| `@~SATÁN qué sabes de Mayhem` | ❌ | 💡 agregar a regex |
| `@~SATÁN quién es Mayhem` | ❌ | 💡 agregar |
| `@~SATÁN cuéntame sobre Mayhem` | ❌ | 💡 agregar |
| `@~SATÁN háblame de Mayhem` | ❌ | 💡 agregar |
| `@~SATÁN Mayhem` (a secas) | ❌ | 💡 si solo un nombre propio, asumir banda |
| `info de Mayhem` (sin mención) | ❌ | No procesa |
| `quién es Mayhem` (sin mención) | ❌ | No procesa |

### Cómo responden cuando ven un mensaje del bot

Si el bot mandó "Banda del día: Mayhem" y alguien responde citando:

| Forma | Estado |
|-------|--------|
| "dame info" | ✅ |
| "más info" | ✅ |
| "cuéntame más" | ✅ |
| "quién es esto" | ⚠️ regex "quien" no cubre |
| "no los conozco" | ❌ |
| "pásame data" | ❌ |
| solo "?" | ❌ |

---

## 2. Pedir información de un álbum

### Sintaxis oficial
```
!album Reign in Blood de Slayer
```

### Formas naturales

| Forma | Estado |
|-------|--------|
| `!album Reign in Blood` | ✅ |
| `!album Reign in Blood de Slayer` | ✅ |
| `!album Reign in Blood by Slayer` | ✅ |
| `!album Reign in Blood - Slayer` | ✅ |
| `@~SATÁN álbum Reign in Blood` | ❌ |
| `@~SATÁN qué hay en el álbum X` | ❌ |
| `@~SATÁN tracklist de Reign in Blood` | ❌ |
| `@~SATÁN cuál es el mejor album de Slayer` | ❌ |
| `@~SATÁN portada de Reign in Blood` | ❌ |

### Cuando responden a una recomendación
*(Ya implementado pero podría expandirse)*

| Forma | Estado |
|-------|--------|
| "dame el link" | ✅ |
| "pásame este" | ✅ |
| "dame este" | ✅ |
| "quiero este" | ✅ |
| "ese sí" | ✅ |
| "🤘" solo | ✅ |
| "🔥" solo | ✅ |
| "no conozco esa" | ❌ |
| "ese suena bueno" | ❌ |
| "lo voy a escuchar" | ❌ |
| "está en spotify?" | ❌ 💡 redirigir a !album |
| "tienen bandcamp?" | ❌ 💡 idem |

---

## 3. Pedir recomendaciones

### Sintaxis oficial
```
!recomienda black metal noruego
```

### Formas naturales

| Forma | Estado |
|-------|--------|
| `!recomienda` | ✅ |
| `!recomienda black metal` | ✅ |
| `!recomienda bandas con baterías rápidas y caos` | ✅ |
| `@~SATÁN recomiéndame algo` | ✅ |
| `@~SATÁN recomendame death metal` | ✅ |
| `@~SATÁN sugiéreme bandas` | ✅ |
| `@~SATÁN qué me recomiendas` | ⚠️ "qué me" no en regex |
| `@~SATÁN dame bandas nuevas` | ⚠️ |
| `@~SATÁN qué escucho` | ❌ |
| `@~SATÁN ponme algo bueno` | ❌ |
| `@~SATÁN algo similar a Burzum` | ❌ 💡 |
| `@~SATÁN bandas como Mayhem` | ❌ 💡 |
| `@~SATÁN música nueva` | ❌ |
| `recomiendame algo` (sin mención) | ❌ |

### Posibilidades avanzadas

| Forma | Estado |
|-------|--------|
| `@~SATÁN una banda para depresivos` | ❌ |
| `@~SATÁN algo brutal para el gimnasio` | ❌ |
| `@~SATÁN algo de Colombia` | ❌ |
| `@~SATÁN una mujer en black metal` | ❌ |

---

## 4. Pedir letra de canción

### Sintaxis oficial
```
!letra Freezing Moon por Mayhem
```

### Formas naturales

| Forma | Estado |
|-------|--------|
| `!letra Freezing Moon por Mayhem` | ✅ |
| `!letra Freezing Moon by Mayhem` | ✅ |
| `!letra Freezing Moon - Mayhem` | ✅ |
| `!letra Freezing Moon` | ⚠️ sin artista falla a veces |
| `@~SATÁN letra de Freezing Moon` | ✅ |
| `@~SATÁN lyrics de X` | ✅ |
| `@~SATÁN qué dice Freezing Moon` | ❌ |
| `@~SATÁN cómo dice la letra de X` | ❌ |
| `@~SATÁN ponme la letra de X` | ❌ |
| `@~SATÁN traduceme X` | ❌ 💡 muy útil para canciones en otros idiomas |
| `@~SATÁN qué significa esta letra` | ❌ |

---

## 5. Ver ranking / puntos

### Sintaxis oficial
```
!rank · !top · !streak
```

### Formas naturales

| Forma | Estado |
|-------|--------|
| `!rank` | ✅ |
| `!rango` | ✅ |
| `!top` / `!ranking` | ✅ |
| `!streak` | ✅ |
| `@~SATÁN cuántos puntos tengo` | ❌ 💡 |
| `@~SATÁN cuál es mi rango` | ❌ |
| `@~SATÁN quién va ganando` | ❌ |
| `@~SATÁN quién aporta más` | ❌ |
| `@~SATÁN tabla de posiciones` | ❌ |
| `@~SATÁN cómo subo de rango` | ❌ |
| `@~SATÁN cuánto me falta para subir` | ❌ |
| `@~SATÁN dame mi historial` | ❌ |

---

## 6. Trivia

### Sintaxis oficial
```
!trivia · !trivia facil · !trivia dificil
```

### Formas naturales para iniciar

| Forma | Estado |
|-------|--------|
| `!trivia` | ✅ |
| `!trivia facil/medio/dificil` | ✅ |
| `@~SATÁN hazme una pregunta` | ❌ |
| `@~SATÁN trivia` | ⚠️ depende del regex |
| `@~SATÁN ponme a prueba` | ❌ |
| `@~SATÁN reta al grupo` | ❌ |
| `@~SATÁN una pregunta difícil` | ❌ |

### Cómo responden

| Forma | Estado |
|-------|--------|
| `A` / `B` / `C` | ✅ |
| `a` / `b` / `c` (minúscula) | ✅ |
| `A)` | ✅ |
| `1` / `2` / `3` | ❌ 💡 algunos asumen números |
| `la A` | ❌ |
| `opción A` | ❌ |
| `creo que es A` | ❌ |
| `A porque...` | ❌ 💡 extraer la letra del texto |

### Patrones cuando se equivocan
*(Ya manejado con respuestas dinámicas)*

---

## 7. Comandos de admin (mute / ban)

### Sintaxis oficial
```
!mute @persona 24 · !ban @persona
```

### Formas naturales que un admin haría

| Forma | Estado |
|-------|--------|
| `!mute @persona 24` | ✅ |
| `!mute @persona` (sin horas, default 24) | ✅ |
| `!ban @persona` | ✅ |
| `!unmute @persona` | ✅ |
| `!silencia @persona` | ❌ 💡 alias |
| `!callate @persona` | ❌ |
| `!sacalo` (respondiendo a mensaje) | ❌ 💡 leer quotedParticipant |
| `!expulsa @persona` | ❌ |
| `!echa @persona` | ❌ |
| `silencia a @persona por X horas` (sin !) | ❌ |
| Si admin **responde a un mensaje** con `!mute` (sin mención) | ❌ 💡 usar `quotedParticipant` |

---

## 8. Saludos al bot

### Cómo saluda gente

| Forma | Estado |
|-------|--------|
| `@~SATÁN hola` | ✅ responde como SATÁN |
| `@~SATÁN qué onda` | ✅ |
| `@~SATÁN buenas` | ✅ |
| `@~SATÁN saludos` | ✅ |
| `@~SATÁN despierta` | ✅ |
| Sin mención: "hola SATÁN" | ❌ 💡 detectar nombre del bot en texto |
| Sin mención: "satán?" | ❌ |
| Saludo al grupo sin mención: "buenos días!" | ❌ |

---

## 9. Quejas / comentarios al bot

| Forma | Estado |
|-------|--------|
| Insulto directo (respondiendo) | ✅ reacciona molesto |
| `@~SATÁN cállate` | ⚠️ responde como SATÁN |
| `@~SATÁN no sirves` | ⚠️ |
| `@~SATÁN te equivocaste` | ❌ |
| `@~SATÁN eres un bot` | ❌ |
| `@~SATÁN eres real?` | ❌ |
| `@~SATÁN quién te creó` | ❌ |
| `@~SATÁN cuál es tu propósito` | ❌ |
| Risa: `jajajaja` (respondiendo) | ✅ reacciona con risa |
| Agradecimiento: `gracias` (respondiendo) | ✅ reacciona con 🤘 |

---

## 10. Preguntas sobre cómo funciona el bot

| Forma | Estado |
|-------|--------|
| `!help` / `!ayuda` / `!comandos` | ✅ |
| `@~SATÁN ayuda` | ✅ |
| `@~SATÁN cómo te uso` | ✅ |
| `@~SATÁN qué haces` | ⚠️ |
| `@~SATÁN qué puedes hacer` | ⚠️ |
| `@~SATÁN qué eres` | ❌ |
| `@~SATÁN para qué sirves` | ❌ |
| `@~SATÁN dime tus comandos` | ✅ |
| `@~SATÁN menú` | ✅ |

---

## 11. Aportes que NO son música

### El bot debería ignorar / no dar puntos

| Forma | Estado |
|-------|--------|
| Foto de gato | ✅ no da puntos si no parece álbum |
| Selfie | ⚠️ podría dar puntos por error |
| Meme genérico | ⚠️ |
| Imagen de un texto/captura de pantalla | ⚠️ |
| Foto del bot | ⚠️ |

### Y debería detectar

| Forma | Estado |
|-------|--------|
| Portada de álbum + caption "banda - álbum" | ✅ |
| Solo portada (imagen sola) | ✅ |
| Link de YouTube → canción | ✅ |
| Link de Spotify → álbum | ✅ |
| Audio mp3 | ✅ |
| Video con caption "live show de X" | ⚠️ |

---

## 12. Conversaciones casuales en grupo

### Casos comunes que un usuario espera

| Forma | Estado |
|-------|--------|
| "alguien escuchó el nuevo de X?" | ❌ 💡 podría detectar nombre de banda y dar info |
| "qué opinan de X?" | ❌ 💡 podría dar info de X |
| "ese álbum es mid" | ❌ |
| "concierto de X mañana" | ❌ |
| "estoy bajón" | ❌ 💡 recomendar doom/depressive |
| "qué les gusta del black metal" | ❌ |
| "Mayhem mejor que Burzum" | ❌ |
| "necesito energía" | ❌ 💡 recomendar grindcore/thrash |

---

## 13. Comportamientos esperados pero NO implementados

### 💡 Sugerencias de mejora prioridad ALTA

| Funcionalidad | Detalle | Comando relacionado |
|---------------|---------|---------------------|
| Detección de nombre de banda sin comando | Si alguien escribe "estoy escuchando Drudkh" → reaccionar/dar info | indirecto |
| Comparar bandas | "Mayhem vs Burzum" → opinión SATÁN | nuevo |
| Top de TODOS los tiempos | `!alltop` o `!historico` | nuevo |
| Buscar por país | `!pais Polonia` o `!recomienda Polonia` | parcial |
| Ver mi historial de aportes | `!historial` o `!mishistorial` | nuevo |
| Estadísticas del grupo | `!stats` — total aportes, contribuidor histórico, etc. | nuevo |
| Calendario | `!conciertos` — próximos shows | nuevo |
| Compartir banda con un emoji | reaccionar al mensaje del bot con 🤘 = guardar como favorita | nuevo |
| `!fav [banda]` y `!misfavs` | favoritos personales | nuevo |
| `!aniversario [banda]` | calcula años desde formación | nuevo |
| `!discografia [banda]` | lista todos sus álbumes con años | nuevo |

### 💡 Sugerencias prioridad MEDIA

| Funcionalidad | Detalle |
|---------------|---------|
| Respuesta cuando alguien dice el nombre del bot sin mencionarlo | "SATÁN" en texto → responde |
| `!quiet` (admin) | Silencia al bot 1 hora en ese grupo |
| `!review [álbum]` | Crítica del álbum con tono SATÁN |
| `!subiendo` | Cuántas personas están a un rango de ascender |
| Detectar y reaccionar a canciones legendarias por título | "Raining Blood" → reacción especial |

### 💡 Sugerencias prioridad BAJA

| Funcionalidad | Detalle |
|---------------|---------|
| Karaoke ASCII | Letra animada en mensajes secuenciales |
| Adivina la canción | Solo 3 versos, adivinar canción |
| Vs. semanal | Pelea de bandas semanal con votación |
| Modo "dios" del owner | Comandos especiales escondidos para `+51 943 605 088` |
| Mensaje del día random | Una frase ominosa al azar entre eventos |

---

## 14. Lo que el usuario NO debería poder hacer

> Casos en los que el bot debe ignorar / negarse

| Caso | Comportamiento esperado |
|------|------------------------|
| Comando `!mute` sin ser admin | ✅ "solo los ADMINS pueden..." |
| Spam de un mismo comando 5 veces seguidas | ❌ 💡 cooldown por usuario |
| Petición de letra con palabras prohibidas (spoilers, etc.) | ✅ Groq filtra |
| Pedir banda que no existe | ✅ devuelve "no encontré info" |
| Pedir letra de canción inventada | ⚠️ Groq puede alucinar |
| Mandar mil aportes en 1 minuto | ⚠️ podría hacer rate limit en sesiones |

---

## 15. Patrones lingüísticos peruanos / latinos a considerar

Los miembros del grupo son principalmente latinoamericanos. Modismos comunes:

| Frase | Significa | Estado |
|-------|-----------|--------|
| "qué hay" / "qué ahí" / "qué ondi" | saludo | ⚠️ |
| "compa" / "bro" / "loco" / "causa" | amigo / vocativo | sin uso |
| "está cabezón" / "ta cabeza" / "joya" | está bueno | ❌ |
| "pendejo" (Perú) | inteligente, atrevido | distinto en otros países |
| "concha tu madre" / "ctmre" | insulto | ✅ detectado |
| "puta" / "mrd" / "vrg" | exclamación/insulto | ✅ detectado |
| "está mal" / "joy" / "está fome" (Chile) | malo | ❌ |
| "yapa" / "extra" | bonus | ❌ |
| "wn" / "weón" (Chile) | bro/wey | ⚠️ |

Considerar regex más permisivas en los detectores de insulto / agradecimiento / chiste.

---

## 16. Errores comunes que cometen los usuarios

| Error | Cómo el bot lo maneja |
|-------|----------------------|
| Falta el `!` | ❌ no responde |
| `! comando` (con espacio) | ❌ no detecta |
| Comando en mayúsculas: `!BAND Mayhem` | ✅ se hace lowercase |
| Acentos: `!recomiéndame` | ❌ |
| Typos: `!mte` por `!mute` | ❌ |
| Comando con más espacios: `!band  Mayhem` | ✅ funciona |
| Mencionar al bot sin texto: `@~SATÁN` solo | ⚠️ responde "me llamaste" |

### 💡 Sugerencia: fuzzy matching de comandos
Si alguien escribe `!recomien` o `!recomiendame`, sugerir o autocompletar.

---

## 17. Tabla resumen de regex sugeridas para mejorar

```javascript
// !band / info de banda
/(?:info|datos?|quien es|qu[ée] sabes|cu[eé]ntame de|h[aá]blame de|para mi)\s+(?:de\s+|sobre\s+|la banda\s+)?(.+)/i

// !album / info de álbum
/(?:[aá]lbum|disco|portada|tracklist|canciones de)\s+(?:de\s+)?(.+)/i

// !recomienda / sugerencia
/(?:recom[ie]nd|sug[ie]r|qu[eé]\s+(?:me\s+)?(?:escuch|recomien|sugier|sub)|ponme|dame|busc(?:a|am[ée])|tr[aá]eme|pasame|tira[mt]e?)\s+(?:algo|bandas?|música|música|m[uú]sica|albums?)?\s*(?:de|con|para|tipo|como|similar a)?\s*(.+)?/i

// !letra
/(?:letra|lyrics|qu[eé] dice|c[oó]mo dice|traduce|traducción)\s+(?:de\s+)?(.+)/i

// !rank / status
/(?:cu[aá]ntos puntos|cu[aá]l (?:es )?mi rango|quién (?:va )?(?:ganando|gana|lidera)|tabla|posición|posiciones|nivel|cuánto me falta)/i

// !trivia
/(?:trivia|pregunta|reto|p[ée]game|ponme a prueba|h[aá]zme una pregunta|reta|qu[ée] sabes preguntar)/i

// !help
/(?:ayuda|help|comandos|menú|qu[ée] (?:puedes|sabes|haces|eres)|para qu[eé] sirves|c[oó]mo (?:te|funciona))/i

// quotedReply pidiendo link
/(?:link|enlace|p[aá]same|pasalo|spotify|youtube|escuchar|d[oó]nde|c[oó]mo (?:lo|las?) (?:escucho|consigo|encuentro)|info|m[aá]s info|cu[eé]ntame|mu[eé]stra|env[ií]a|busca|tr[aá]eme|m[aá]ndame|dame|quiero|este|esta|eso|ese|esa|🤘|🔥|♥️|❤️)/i
```

---

## 18. Roadmap recomendado de mejoras

1. **Inmediato (1 hora):** Ampliar regex de menciones para cubrir las formas más comunes de pedir banda/álbum/recomendación sin comando exacto
2. **Corto plazo (1 día):** Detección de nombres propios sin comando (alguien escribe "Drudkh" → reaccionar)
3. **Mediano plazo (1 semana):** Comandos nuevos: `!discografia`, `!historial`, `!stats`, `!fav`
4. **Largo plazo (1 mes):** Sistema de favoritos, reseñas, modo dios del owner, integración con calendarios de conciertos

---

🖤 *Documento de análisis de interacciones — para mejorar la experiencia real* ⛧
