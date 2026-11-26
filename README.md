# 🃏 Mesa Commander

**Mesa Commander** es un proyecto colaborativo para jugar a **Magic: The Gathering — Commander** por Internet, desde el navegador y con amigos. La partida se ejecuta en un servidor propio, por lo que ningún jugador necesita mantener abierto su ordenador para actuar como anfitrión.

Actualmente lo alojamos en una **Raspberry Pi 5 con Docker**. Se accede mediante una dirección HTTPS compartida por el administrador y una contraseña de invitación. **Es un proyecto experimental**: estamos probando y mejorando el multijugador, las reconexiones y la seguridad.

## ✨ Funcionalidades

- **Hasta cuatro jugadores humanos** desde distintas casas, en una misma mesa. Los asientos libres pueden ocuparse con bots.
- **Partidas de Commander** con gestión de cartas, turnos, mesa, acciones y registro de la partida.
- **Importación y selección de mazos**, con información de cartas obtenida mediante **Scryfall**.
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
| Calidad | Pruebas de regresión automáticas y validación independiente del proxy de XMage Nexus mediante GitHub Actions. |

### Motor de reglas: migración a XMage

La partida **continúa utilizando el motor JavaScript original** ejecutado en Chromium. XMage Nexus es el candidato para sustituirlo y su proxy ya cuenta con una comprobación independiente en CI, pero todavía no existe una integración operativa con Mesa Commander.

El objetivo es delegar en XMage las reglas, prioridades, pila, combate, costes, habilidades y decisiones legales de Commander, manteniendo la interfaz web y el chat de voz.

Quedan pendientes la integración del adaptador, el soporte efectivo de las mecánicas de Avatar (incluido bending), interacciones complejas como Teferi's Protection, y la validación integral de partidas de cuatro jugadores y compatibilidad ARM64.

Más información: [estado de la migración](docs/migration-status.md) y [plan técnico](docs/rules-engine-migration.md).

### Pruebas y seguimiento

Las correcciones se probarán durante las partidas reales en la instalación habitual; no es necesario montar otro servidor. Las pruebas automáticas de GitHub Actions complementan este proceso, pero no certifican una partida completa ni todas las interacciones de Magic.

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

Puedes consultar el código públicamente. Para colaborar con permisos de escritura, pide a la persona administradora que te invite en GitHub. También puedes proponer cambios desde un fork. **No necesitas acceso SSH a la Raspberry**.

### 2. Elige qué mejorar

| Quiero cambiar… | Archivo o carpeta |
| --- | --- |
| Nombre de la mesa, código, mínimo de jugadores o activación de la voz | `config/game.json` |
| Apariencia, interfaz y lógica original del juego | `app/index.html` |
| Comunicación y servidor centralizado | `server/` |
| Instrucciones del proyecto | `README.md` |
| Contenedores y despliegue | `compose.yaml`, `Dockerfile`, `deploy/`, `scripts/` |
| Migración a XMage | `docs/` |
| Pruebas automáticas | `tests/`, `.github/workflows/` |

### 3. Propón tu cambio (sin usar la terminal)

1. En GitHub, abre el archivo que quieras editar y pulsa el **icono del lápiz**.
2. Realiza los cambios y selecciona la opción de **crear una rama nueva** en lugar de modificar directamente `main`.
3. Guarda el cambio (*Commit changes*) y abre un **Pull Request** explicando qué has cambiado y por qué.
4. El administrador revisará la propuesta. Si la aprueba, la incorporará a `main`.
5. El servidor comprobará los cambios en su siguiente ejecución programada y los aplicará aunque haya una partida en curso.

También puedes trabajar con **GitHub Desktop** o Git desde tu ordenador: clona el repositorio, crea una rama, modifica los archivos, haz *commit*, publica la rama y abre un Pull Request.

**Para ayudarnos a revisar tu Pull Request**, explica brevemente el objetivo, los archivos modificados, cómo has probado el cambio y, si afecta a la interfaz, añade una captura de pantalla. Para reportar fallos, abre una **Issue** con los pasos para reproducirlo, el comportamiento esperado y lo que ocurrió.

### Reglas importantes para colaborar

- **No subas contraseñas, claves privadas, tokens ni el archivo `.env`**. Usa `.env.example` únicamente para documentar variables sin secretos.
- Evita subir mazos privados, datos personales y archivos de las partidas.
- No hagas cambios directamente en `main`: utiliza ramas y Pull Requests.
- Los cambios incorporados a `main` pueden terminar ejecutándose en la Raspberry: revisaremos especialmente los que afecten al servidor, Docker o scripts.
- No compartas públicamente el enlace del juego ni su contraseña sin permiso del administrador.

## 🛠️ Administración del servidor

El proyecto está desplegado en una Raspberry Pi 5 (`aarch64`) con Docker Compose. **Tailscale Funnel** proporciona el acceso HTTPS sin necesidad de comprar un dominio o abrir puertos del router. El servicio `commander` escucha solo en `127.0.0.1:3000` del anfitrión; no es necesario levantar el servicio opcional `caddy` cuando se usa Funnel.

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

La actualización utiliza una **clave SSH de despliegue de solo lectura** para consultar `origin/main`. La copia desplegada en la Raspberry no debe editarse directamente: los cambios se preparan en ramas de GitHub y se aprueban mediante Pull Requests.

### Limitaciones conocidas

- Las partidas y las reconexiones siguen en fase de pruebas; un reinicio inesperado puede perder las acciones posteriores al último punto de recuperación.
- La voz utiliza WebRTC entre navegadores. Tailscale Funnel publica la web y los WebSockets, **pero no sustituye a un servidor TURN**; algunas conexiones entre casas necesitarán TURN accesible públicamente.
- La autenticación y la validación de acciones todavía requieren mejoras antes de considerar segura una publicación pública permanente. La contraseña de invitación no sustituye a un sistema completo de cuentas y permisos.

---

**Proyecto hecho para disfrutar de Commander con amigos y mejorarlo entre todos.** 🧙
