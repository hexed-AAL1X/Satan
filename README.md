<a id="readme-top"></a>

<!-- SHIELDS -->
<img src="https://github.com/AnderMendoza/AnderMendoza/raw/main/assets/line-neon.gif" width="100%">
<p align='center'>
  <img alt="GitHub Repo contributors" src="https://img.shields.io/github/contributors/hexed-AAL1X/satan-bot?style=for-the-badge">&nbsp;
  <img alt="GitHub Repo forks" src="https://img.shields.io/github/forks/hexed-AAL1X/satan-bot?style=for-the-badge">&nbsp;
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/hexed-AAL1X/satan-bot?style=for-the-badge">&nbsp;
  <img alt="GitHub Repo issues" src="https://img.shields.io/github/issues/hexed-AAL1X/satan-bot?style=for-the-badge">&nbsp;
</p>

<!-- PROJECT LOGO -->
<br>
<div align="center">
   <img src="data/satan_presentacion.png" alt="SATAN Bot" width="280">
   <h3 align="center">SATÁN — The Black Circle</h3>
   <p align="center">
     Bot de WhatsApp para comunidades metaleras: moderacion, ranking, trivia y contenido diario con personalidad oscura
     <br>
     <a href="https://github.com/hexed-AAL1X/satan-bot"><strong>Explorar el repo »</strong></a>
     <br>
     <br>
     <a href="MANUAL.md">Manual de operacion</a>
     ·
     <a href="https://github.com/hexed-AAL1X/satan-bot/issues/new?labels=bug">Reportar bug</a>
     ·
     <a href="https://github.com/hexed-AAL1X/satan-bot/issues/new?labels=enhancement">Solicitar feature</a>
   </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Tabla de contenidos</summary>
  <ol>
    <li>
      <a href="#about-the-proyect">Acerca del proyecto</a>
      <ul>
        <li><a href="#built-with">Tecnologias</a></li>
      </ul>
    </li>
    <li><a href="#important-notices">Avisos importantes</a></li>
    <li>
      <a href="#getting-started">Primeros pasos</a>
      <ul>
        <li><a href="#prerequisites">Requisitos</a></li>
        <li><a href="#installation">Instalacion</a></li>
      </ul>
    </li>
    <li><a href="#comandos">Comandos principales</a></li>
    <li><a href="#contributing">Contribuir</a></li>
    <li><a href="#contact">Contacto</a></li>
  </ol>
</details>
<br>

<!-- ABOUT THE PROJECT -->
<a id="about-the-proyect"></a>

***Acerca del proyecto***

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

**SATÁN** es un bot de WhatsApp pensado para grupos de metal. Combina moderacion automatica, sistema de rangos y puntos, eventos programados, trivia generada por IA y una persona narrativa consistente: el senor del inframundo que cuida el CIRCLE.

Por que existe:

* Centralizar la vida del grupo (bienvenidas, ranking, reglas, contenido diario) sin depender de un moderador humano 24/7.
* Premiar aportes reales (musica, links, participacion) con un sistema de rangos metalero.
* Mantener el tono del grupo con copy generado por Groq bajo reglas fijas de persona SATÁN.

Documentacion extendida en [`MANUAL.md`](MANUAL.md).

<a id="built-with"></a>

### Tecnologias

* ![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)&nbsp;
* ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)&nbsp;
* ![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)&nbsp;
* ![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)&nbsp;
* ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)&nbsp;
* ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)&nbsp;

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- IMPORTANT NOTICES -->
<a id="important-notices"></a>

***Avisos importantes***

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

> [!WARNING]
> Este repositorio **no incluye** credenciales, sesiones de WhatsApp ni bases de datos de produccion.
> Nunca subas `.env`, `auth_info_baileys/` ni archivos `.db` a GitHub.

> [!NOTE]
> Requisitos para ejecutar el bot:

> | Requisito | Descripcion |
> |-----------|-------------|
> | Node.js | >= 20 |
> | Cuenta WhatsApp | Numero dedicado al bot (`BOT_NUMBER`) |
> | Groq API | Clave en `GROQ_API_KEY` |
> | Despliegue | Railway, VPS o local con volumen persistente |

> [!IMPORTANT]
> El endpoint `/qr` sirve la imagen para vincular WhatsApp. **No lo expongas publicamente** sin proteccion (dominio privado, VPN o acceso restringido). Cualquiera con acceso al QR puede secuestrar la sesion del bot.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- GETTING STARTED -->
<a id="getting-started"></a>

***Primeros pasos***

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

Pasos para levantar una copia local o en tu propio servidor.

<a id="prerequisites"></a>

### Requisitos

* Node.js 20+
* npm
* Cuenta en [Groq](https://console.groq.com/) para la API key
* Numero de WhatsApp exclusivo para el bot

<a id="installation"></a>

### Instalacion

1. Clona el repositorio

   ```sh
   git clone https://github.com/hexed-AAL1X/satan-bot.git
   cd satan-bot
   ```

2. Instala dependencias

   ```sh
   npm install
   ```

3. Configura variables de entorno

   ```sh
   cp .env.example .env
   ```

   Edita `.env` con tus valores (ver `.env.example`). Minimo:

   ```env
   BOT_NUMBER=         # sin + ni espacios
   OWNER_NUMBER=       # admin del bot
   GROUP_ID=           # JID del grupo principal
   GROQ_API_KEY=       # clave Groq
   PORT=3131
   ```

4. Arranca el bot

   ```sh
   npm start
   ```

5. Vincula WhatsApp

   * Local: abre `http://localhost:3131/qr` (solo en tu maquina).
   * Produccion: usa la URL **privada** de tu despliegue + `/qr`.
   * En el telefono del bot: WhatsApp → Dispositivos vinculados → Vincular dispositivo.

6. (Opcional) Cambia el remote si haces fork

   ```sh
   git remote set-url origin https://github.com/TU_USUARIO/satan-bot.git
   git remote -v
   ```

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- COMANDOS -->
<a id="comandos"></a>

***Comandos principales***

| Comando | Funcion |
|---------|---------|
| `!help` | Lista de comandos |
| `!rank` | Rango y puntos del usuario |
| `!top` | Ranking semanal |
| `!ruleset` | Reglas del grupo |
| `!band` / `!album` / `!letra` | Info musical |
| `!recomienda` | Tres bandas sugeridas |
| `!trivia` / `!metalquiz` | Trivia metalera |
| `!onthisday` | Hechos metal del dia |

Comandos de owner (`!aprobar`, `!setrank`, `!grupos`, etc.) documentados en [`MANUAL.md`](MANUAL.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- CONTRIBUTING -->
<a id="contributing"></a>

***Contribuir***

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

Las contribuciones son bienvenidas. Si tienes una mejora:

1. Haz fork del proyecto.
2. Crea una rama (`git checkout -b feature/mi-mejora`).
3. Commit (`git commit -m 'Add: mi mejora'`).
4. Push (`git push origin feature/mi-mejora`).
5. Abre un Pull Request.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

<!-- CONTACT -->
<a id="contact"></a>

***Contacto***

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif">

<p align="center">
  <a href="mailto:hexed_aal1x.ops@proton.me"><img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white&color=black" /></a>
  <a href="https://www.instagram.com/hexed_aal1x"><img src="https://img.shields.io/badge/instagram-%2312100E.svg?&style=for-the-badge&logo=instagram&logoColor=white&color=black" /></a>
  <a href="https://www.linkedin.com/in/leonardo-bravo-4120b8228/"><img src="https://img.shields.io/badge/linkedin-%2312100E.svg?&style=for-the-badge&logo=linkedin&logoColor=white&color=black" /></a>
</p>

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>
