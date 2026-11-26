# 🃏 Mesa Commander

**Mesa Commander** es un proyecto colaborativo para jugar a **Magic: The Gathering — Commander** por Internet, desde el navegador y con amigos. La partida se ejecuta en un servidor propio, por lo que ningún jugador necesita mantener abierto su ordenador para actuar como anfitrión.

Actualmente lo alojamos en una **Raspberry Pi 5 con Docker**. Se accede mediante una dirección HTTPS compartida por el administrador y una contraseña de invitación. **Es un proyecto experimental**: estamos probando y mejorando el multijugador, las reconexiones y la seguridad.

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

### Política obligatoria de actualizaciones y despliegue

- **Una única rama de publicación: `main`.** Todos los cambios se publican directamente en ella. No se mantienen ramas de desarrollo, versiones alternativas ni instalaciones paralelas de Mesa Commander.
- **Un único contenedor Docker para Mesa Commander: `mesa-commander`**, correspondiente al servicio `commander` de Docker Compose. Todas las funciones del juego, el motor de reglas, el catálogo y el servidor se integran en el contenedor existente. No se crean contenedores nuevos ni instancias adicionales del juego.
- **Actualización automática a las 07:00 (Europe/Madrid)**: se comprueba `origin/main` y, cuando hay cambios, se reconstruye y sustituye el contenedor existente, incluso si hay jugadores conectados, partidas activas o conversaciones de voz. No se aplaza el despliegue por actividad de los usuarios.
- Se conserva el diseño de la aplicación, el chat de voz y la persistencia de datos, salvo cambios expresamente solicitados. Se mantienen las comprobaciones e intentos de restauración existentes si falla el despliegue.
- La copia de producción en la Raspberry Pi no se edita directamente; GitHub es la fuente de los cambios. Las pruebas se realizan sin instalar una segunda versión de la aplicación en producción.

### Reglas importantes para colaborar

- **No subas contraseñas, claves privadas, tokens ni el archivo `.env`**. Usa `.env.example` únicamente para documentar variables sin secretos.
- Evita subir mazos privados, datos personales y archivos de las partidas.
- Publica todos los cambios directamente en `main`, respetando la política de un único contenedor y sin versiones paralelas.
- Los cambios incorporados a `main` pueden terminar ejecutándose en la Raspberry: revisaremos especialmente los que afecten al servidor, Docker o scripts.
- No compartas públicamente el enlace del juego ni su contraseña sin permiso del administrador.

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
