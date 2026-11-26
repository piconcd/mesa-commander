# 🃏 Mesa Commander

**Mesa Commander** es un proyecto colaborativo para jugar a **Magic: The Gathering — Commander** por Internet, desde el navegador y con amigos. La partida se ejecuta en un servidor propio, por lo que ningún jugador necesita mantener abierto su ordenador para actuar como anfitrión.

Actualmente lo alojamos en una **Raspberry Pi 5 con Docker**. Se accede mediante una dirección HTTPS compartida por el administrador y una contraseña de invitación. **Es un proyecto experimental**: estamos probando y mejorando el multijugador, las reconexiones y la seguridad.

> 📜 **¿Vas a cambiar algo?** Lee antes las [normas del proyecto](#-normas-del-proyecto). Lo que se sube a `main` se instala solo en el servidor y afecta a la partida de todos.

## ✨ Funcionalidades

- **Hasta cuatro jugadores humanos** desde distintas casas, en una misma mesa. Los asientos libres pueden ocuparse con bots.
- **Partidas de Commander** con un motor de reglas JavaScript propio, automatización de los efectos compatibles, turnos, combate, decisiones individuales y registro de la partida.
- **Importación y selección de mazos**, con información de cartas obtenida mediante **Scryfall** y actualización automática del catálogo Oracle.
- **Chat de voz opcional** dentro del juego: unirse, silenciar el micrófono y salir del canal. Usa WebRTC y requiere permiso de micrófono.
- **Servidor centralizado** con Node.js, WebSockets y un motor de juego ejecutado en Chromium dentro de Docker.
- **Guardado de puntos de recuperación** de la partida. No garantiza restaurar cada acción si se produce un apagado inesperado.
- **Actualizaciones desde GitHub**: el servidor comprueba la rama `main` cada día a las **07:00 (Europe/Madrid)** y despliega los cambios aunque haya una partida activa o usuarios conectados, incluidos los del canal de voz.

> **Estado del proyecto:** la interfaz y el motor funcionan, pero todavía faltan pruebas completas con varios jugadores reales, recuperación ante fallos y endurecimiento de la seguridad. El chat de voz puede necesitar un servidor TURN para algunas redes.

## 🆕 Últimas novedades — 26 de noviembre de 2026

Las correcciones de la [PR #1](https://github.com/piconcd/mesa-commander/pull/1) ya están incorporadas a `main` y se distribuirán mediante el actualizador habitual de la Raspberry Pi.

| Área | Cambios |
| --- | --- |
| Voz | Controles locales del panel y limpieza de conexiones al salir o reconectar. |
| Teclado | Gestión local de la entrada y de la cesión de prioridad mediante la barra espaciadora. |
| Maná y costes | Validación del pago de hechizos, selección de fuentes alternativas y mejoras en el impuesto de comandante y la afinidad por Aliados. |
| Tierras | Elección de pagar 2 vidas o entrar giradas para las shocklands jugadas normalmente. |
| Tutores | Revelación de las cartas buscadas cuando corresponda en los tutores compatibles. |
| Fichas | Mejoras en la carga de imágenes de tokens. |
| Sagas | Correcciones en las solicitudes de decisión y en la gestión de capítulos, que avanzan al comienzo de la primera fase principal según las reglas generales. |
| Calidad | Pruebas de regresión automáticas mediante GitHub Actions. |

### Motor de reglas propio y actualización automática

El motor JavaScript existente, ejecutado en Chromium dentro del servidor central, es la base de todas las partidas. El objetivo es automatizar todos los efectos e interacciones de Magic: The Gathering conforme al reglamento oficial, solicitando una elección individual al jugador correspondiente cuando las reglas lo requieran. Los bots utilizan el mismo motor.

La [ampliación del motor y del catálogo de reglas](https://github.com/piconcd/mesa-commander/commit/676ea924b1b625e6320cc7b895cf1d9ee28b2518) incorpora los siguientes cambios:

| Área | Cambios publicados |
| --- | --- |
| Reglamento oficial | Descarga del texto de las [Comprehensive Rules de Wizards](https://magic.wizards.com/en/rules), con registro de su versión mediante hash. |
| Catálogo Oracle | Actualización de [Scryfall Bulk Data](https://scryfall.com/docs/api/bulk-data) al arrancar y diariamente a partir de las 07:00 (Europe/Madrid). |
| Persistencia | Conservación del último catálogo válido en `/data/rules/` si falla una descarga. |
| Mazos | Actualización de las definiciones Oracle disponibles antes de iniciar una partida central, incluidos los mazos de los bots, conservando las imágenes existentes. |
| Automatización | Asistencia obligatoria para los efectos compatibles en partidas centralizadas. |
| Decisiones | Diálogos individuales para determinadas habilidades opcionales de robo y ganancia de vidas; decisiones automáticas para bots. |
| Reglas de estado | Corrección del registro de ganancia de vida prohibida y cancelación de contadores +1/+1 y -1/-1 opuestos. |
| Cobertura | Auditoría parcial de habilidades no reconocidas, con avisos a los jugadores correspondientes. |
| Pruebas | Nuevos casos de regresión del catálogo, horario de Madrid, habilidades opcionales y contadores. |

**Estado de cobertura (auditoría del 26 de noviembre de 2026):** el motor es operativo, pero no es un simulador íntegro de Magic. La pila de hechizos y habilidades, prioridad APNAP, objetivos y costes transaccionales, capas, reemplazos, acciones basadas en estado, combate, reglas completas de Commander y mecánicas de Avatar requieren desarrollo y pruebas adicionales. Los avisos del intérprete son orientativos y no certifican la legalidad de los mazos ni la ejecución de todos los efectos.

| Prioridad | Próximos bloques de desarrollo |
| --- | --- |
| P0 | Núcleo de objetos/eventos, pila LIFO, prioridad, disparadas y elecciones, costes/objetivos, reemplazos, capas y acciones basadas en estado. |
| P1 | Combate conforme al reglamento vigente, reglas de Commander y multijugador, validación de mazos, palabras clave y cobertura de cartas Oracle. |
| P2 | Pruebas de integración exhaustivas, privacidad, reconexión, persistencia y rendimiento en Raspberry Pi/ARM64. |

El objetivo es un único motor nativo que ejecute todas las reglas aplicables, con las mismas acciones legales para humanos y bots. Descargar datos de Oracle y las Comprehensive Rules no genera automáticamente nuevas implementaciones. No se publica un porcentaje de conformidad hasta contar con una matriz verificable por regla, carta e interacción.

- [Auditoría técnica y estado actual](docs/migration-status.md).
- [Plan de conformidad, fases y criterios de aceptación](docs/rules-engine-migration.md).

### Avance del motor nativo — 26 de noviembre de 2026

El núcleo independiente `server/engine/core.mjs` cuenta ahora con una máquina de partidas experimental en `server/engine/game.mjs`, con las funciones `createGame`, `dispatch` y `view`. No depende del DOM ni de Chromium.

| Bloque | Implementación experimental |
| --- | --- |
| Pila y prioridad | Pila LIFO, pases sucesivos, contrahechizos, disparadas y orden APNAP. |
| Comandos | Validación de versión, costes de maná, acciones transaccionales y objetivos. |
| Estado | Identidad por cambio de zona, muertes en lote, regla de leyendas y contadores opuestos. |
| Commander | Impuesto, decisiones individuales de zona de mando, daño de comandante y eliminación de jugadores (parcial). |
| Turnos y combate | Fases, declaración de atacantes y bloqueadores, asignación de daño, dañar primero/dos veces y arrollar (subconjunto). |
| Privacidad | Vista por jugador que oculta manos ajenas y bibliotecas. |
| Cartas | Definiciones declarativas implementadas explícitamente; las cartas sin implementación se rechazan. |

**Importante:** el motor nuevo aún no dirige las partidas reales; Chromium conserva la autoridad. No se ha conectado la interfaz, el catálogo Oracle, los bots ni la persistencia al núcleo nuevo. No es una implementación completa del reglamento: faltan capas y reemplazos generales, costes especiales, legalidad de mazos, numerosas habilidades y cartas, y pruebas integrales. Los cambios no modifican el despliegue existente.

Pruebas del nuevo núcleo: `node --test tests/native-rules-game.test.mjs` y `node --test tests/native-rules-core.test.mjs`. Los seis escenarios nuevos se han comprobado en un entorno JavaScript aislado; queda pendiente la ejecución completa de Node.js y CI. Consulta el [detalle de la entrega](docs/migration-status.md).


### Pruebas y seguimiento

Las correcciones se probarán durante las partidas reales en la instalación habitual; no es necesario montar otro servidor. Las pruebas automáticas de GitHub Actions complementan este proceso, pero no certifican una partida completa ni todas las interacciones de Magic. Para comprobar el código localmente, ejecuta `npm run check` y `node --test tests/*.test.mjs`. La auditoría de cobertura es estática; no implica una ejecución satisfactoria de CI ni de partidas reales.

- [Estado de las comprobaciones en GitHub Actions](https://github.com/piconcd/mesa-commander/actions).
- Para comunicar un fallo, indica la carta, el turno o fase, los pasos realizados y el resultado esperado. Si es posible, añade una captura sin información privada.

## 🎮 Cómo jugar

1. Pide al administrador la **dirección HTTPS** de Mesa Commander y la **contraseña de invitación**.
2. Abre el enlace desde un navegador actualizado, escribe tu nombre y entra a la mesa.
3. Importa o selecciona tu mazo. El primer jugador conectado puede iniciar la partida cuando haya suficientes jugadores preparados (mínimo configurable entre 2 y 4).
4. Durante una partida de Commander, cualquier jugador conectado puede pulsar **«Reiniciar partida»** en la barra superior y confirmar. Se descarta el progreso de la mesa compartida y se abre una sala nueva; los jugadores vuelven a conectarse con su nombre y mazo seleccionado (si no lo hacen automáticamente, pueden entrar de nuevo). No se necesita reiniciar Docker. El chat de voz se desconecta y se puede volver a activar.
5. Si quieres hablar, pulsa **«Unirse a voz»**, concede permiso al micrófono y utiliza los controles para silenciarte o salir. Es opcional.

No necesitas instalar Docker, Tailscale ni el juego en tu ordenador para jugar. Si el audio no conecta, puedes seguir jugando sin voz.

## 📜 Normas del proyecto

Estas normas son para todas las personas que colaboran. Son las mismas que sigue el asistente de IA del proyecto, que las tiene con más detalle técnico en [`CLAUDE.md`](CLAUDE.md). Si una norma de aquí y otra de `CLAUDE.md` parecen decir cosas distintas, avisa para corregirlo.

### 1. Publicación y servidor

1. **Una sola rama: `main`.** No se crean ramas, forks, versiones alternativas ni instalaciones paralelas del juego.
2. **Un solo contenedor Docker: `mesa-commander`** (servicio `commander`). Las funciones nuevas van dentro de él; no se añaden contenedores ni servicios.
3. **Todo lo que llega a `main` se instala solo en la Raspberry a las 07:00 (hora de Madrid)**, aunque haya partidas o gente en el chat de voz. Un error en `main` rompe la partida de todos, así que **nunca se sube nada a medias**.
4. **No se toca la Raspberry ni su copia del proyecto.** GitHub es la única forma de hacer cambios.
5. Se conservan el diseño, el chat de voz y el guardado de partidas, salvo que se pida cambiarlos expresamente.

### 2. Antes de subir un cambio

1. En GitHub Desktop, pulsa **«Fetch origin»** antes de empezar, para trabajar sobre la última versión.
2. Cada cambio lleva **su prueba automática** en la carpeta `tests/`.
3. Ejecuta las mismas comprobaciones que hace GitHub Actions. Las tres tienen que salir bien:

   ```bash
   npm run check
   node --check server/voice.js
   node --test tests/*.test.mjs
   ```

4. Si el cambio afecta al motor de reglas, pruébalo también jugando (por ejemplo, una partida de 4 bots).
5. **Saltos de línea:** los archivos usan el formato de Windows (CRLF). No conviertas archivos enteros ni los reformatees. En la pestaña «Changes» de GitHub Desktop solo deben verse las líneas que has cambiado.
6. Revisa en «Changes» que solo aparecen los archivos que esperas y escribe un resumen corto y claro en el commit.

### 3. Lo que no se sube nunca

- El archivo `.env`, contraseñas, claves privadas ni tokens. Usa `.env.example` solo para documentar variables, sin valores secretos.
- Mazos privados, partidas guardadas ni datos personales.
- Archivos de datos grandes, como el JSON de Oracle Cards de Scryfall. Los datos y los informes de trabajo se guardan **fuera** de la carpeta del repositorio.
- Tampoco se comparte públicamente el enlace del juego ni su contraseña sin permiso del administrador.

### 4. Cartas y reglas

- Se usa siempre el **texto Oracle oficial** de cada carta (Scryfall), nunca una versión de memoria. Las reglas de referencia son las [Comprehensive Rules de Wizards](https://magic.wizards.com/en/rules).
- **Objetivo:** que cada carta haga sola lo que dice su texto y que el juego **solo pregunte al jugador cuando las reglas le dejan elegir** (cuando la carta dice «puedes», «elige» u «objetivo»). Los bots deciden solos.
- Primero se arreglan **mecánicas** (que corrigen muchas cartas a la vez) y después cartas sueltas.
- **Nada de parches a medias.** Si una carta necesita reglas que el motor todavía no tiene (capas, efectos de reemplazo generales, copias complejas, cambios de tipo en cadena…), se deja marcada como pendiente y se explica por qué. Estas reglas están planificadas en [`docs/rules-engine-migration.md`](docs/rules-engine-migration.md) y [`docs/migration-status.md`](docs/migration-status.md).
- No se publican porcentajes de «cartas que funcionan» sin una comprobación que se pueda verificar. Que la auditoría diga que una carta «funciona entera» solo significa que el intérprete no avisa de nada; no garantiza que la carta haga bien todo lo que dice.
- El motor nuevo de `server/engine/` es experimental y **no se usa en las partidas**. No se conecta al juego salvo que el grupo lo decida.

### 5. Para quien programe en el modo servidor

- Las partidas reales las dirige un Chromium dentro del servidor, que ejecuta `app/index.html`. Lo que en la versión original solo podía pulsar el anfitrión **no lo puede pulsar nadie** en modo servidor. Por eso, las funciones nuevas deben estar al alcance de los jugadores: botones en su propia interfaz o mensajes `central-*` gestionados en `server/central.js`.
- **Nunca se confía en lo que envía el navegador de un jugador** sin comprobarlo en el servidor (asiento, tipo de acción y estado de la partida).

### 6. Si trabajas con el asistente de IA (Claude Code)

- El asistente lee [`CLAUDE.md`](CLAUDE.md), responde en español y explica los cambios en lenguaje sencillo, diciendo qué hay que revisar.
- **El asistente no hace commit ni push** salvo que se le pida expresamente en ese momento. La persona revisa los cambios y los sube con GitHub Desktop.
- Al terminar, el asistente debe decir qué archivos aparecerán en «Changes» y proponer un resumen para el commit.
- Se le puede dictar por voz: es normal que haya erratas o nombres de cartas escritos «de oído», y el asistente debe interpretarlos.

## 🤝 ¿Quieres colaborar?

¡Las propuestas de cambios, informes de errores y mejoras son bienvenidas! El código está en este repositorio público: **[piconcd/mesa-commander](https://github.com/piconcd/mesa-commander)**.

### 1. Accede al repositorio

Puedes consultar el código públicamente. Para colaborar con permisos de escritura, pide a la persona administradora que te invite en GitHub. Si no tienes permisos, puedes proponer cambios mediante una Issue. **No necesitas acceso SSH a la Raspberry**.

### 2. Elige qué mejorar

| Quiero cambiar… | Archivo o carpeta |
| --- | --- |
| Nombre de la mesa, código, mínimo de jugadores o activación de la voz | `config/game.json` |
| Apariencia, interfaz y lógica original del juego | `app/index.html` |
| Comunicación y servidor centralizado | `server/` |
| Instrucciones del proyecto | `README.md` |
| Contenedor y despliegue | `compose.yaml`, `Dockerfile`, `deploy/`, `scripts/` |
| Motor de reglas y catálogo Oracle | `app/index.html`, `server/central.js`, `server/rules-catalog.mjs`, `docs/migration-status.md`, `docs/rules-engine-migration.md` |
| Pruebas automáticas | `tests/`, `.github/workflows/` |

### 3. Publica tu cambio

1. Si no tienes permisos de escritura, abre una Issue con tu propuesta para que una persona autorizada pueda incorporarla.
2. Si tienes permisos, abre el archivo en GitHub y pulsa el icono del lápiz, o trabaja en una copia local de la rama `main`.
3. Realiza y revisa los cambios, ejecuta las pruebas disponibles y agrupa los archivos relacionados en un commit coherente.
4. Publica el commit directamente en `main`. No crees ramas de versiones alternativas ni despliegues paralelos.
5. El servidor recogerá los cambios en su siguiente actualización programada, aunque haya una partida activa.

Para comunicar un fallo, abre una **Issue** con los pasos para reproducirlo, el comportamiento esperado y lo que ocurrió. Si afecta a la interfaz, añade una captura sin información privada.

### Normas para colaborar

Antes de publicar, repasa las [normas del proyecto](#-normas-del-proyecto): una sola rama (`main`), un solo contenedor, actualización automática a las 07:00 aunque haya partidas, comprobaciones obligatorias y nada de secretos ni datos privados en el repositorio. Revisaremos con especial cuidado los cambios que afecten al servidor, a Docker o a los scripts, porque terminan ejecutándose en la Raspberry. Si falla un despliegue, se mantienen las comprobaciones e intentos de restauración que ya existen.

## 🛠️ Administración del servidor

El proyecto está desplegado en una Raspberry Pi 5 (`aarch64`) con Docker Compose. **Tailscale Funnel** proporciona el acceso HTTPS sin necesidad de comprar un dominio o abrir puertos del router. El único contenedor de la aplicación, `mesa-commander` (servicio `commander`), escucha solo en `127.0.0.1:3000` del anfitrión. No se deben levantar contenedores adicionales para nuevas funciones ni versiones del juego.

Desde la Raspberry:

```bash
cd ~/docker/mesa-commander

docker compose ps                         # Ver estado
docker compose logs --tail=100 commander  # Ver registros
curl http://127.0.0.1:3000/healthz       # Comprobar el motor
```

Para una instalación nueva, crea `.env` a partir de `.env.example`, establece `INVITE_PASSWORD` (mínimo 12 caracteres) y arranca `docker compose up -d --build commander`. **Nunca publiques `.env`**.

Las actualizaciones se gestionan con `scripts/update-from-github.sh` y el temporizador `deploy/systemd/mesa-commander-update.timer` (07:00, hora de Madrid). Si el equipo estaba apagado, `Persistent=true` permite recuperar la comprobación al encenderlo. Si hay una nueva revisión, el despliegue se realiza sin consultar el estado del motor, de las partidas ni del canal de voz. **Puede interrumpir una partida o una conversación en curso**; los jugadores deberán reconectar y la recuperación del último checkpoint no garantiza conservar todas las acciones. Esta política también se aplica si se inicia el servicio manualmente. Se mantienen las comprobaciones de cambios locales, el bloqueo de ejecuciones simultáneas y los intentos de restauración ante fallos de compilación o despliegue.

```bash
systemctl list-timers --all mesa-commander-update.timer
sudo journalctl -u mesa-commander-update.service -n 50 --no-pager
```

La actualización utiliza una **clave SSH de despliegue de solo lectura** para consultar `origin/main`. La copia desplegada en la Raspberry no debe editarse directamente: los cambios se publican directamente en `main` de GitHub.

### Limitaciones conocidas

- Las partidas y las reconexiones siguen en fase de pruebas; un reinicio inesperado puede perder las acciones posteriores al último punto de recuperación.
- La voz utiliza WebRTC entre navegadores. Tailscale Funnel publica la web y los WebSockets, **pero no sustituye a un servidor TURN**; algunas conexiones entre casas necesitarán TURN accesible públicamente.
- La autenticación y la validación de acciones todavía requieren mejoras antes de considerar segura una publicación pública permanente. La contraseña de invitación no sustituye a un sistema completo de cuentas y permisos.

---

**Proyecto hecho para disfrutar de Commander con amigos y mejorarlo entre todos.** 🧙
