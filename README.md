# Mesa Commander central - prototipo experimental

Este repositorio contiene **una adaptación experimental**, no un lanzamiento de producción validado.
La partida se ejecuta en Chromium **dentro de Docker** y Node.js recibe a los jugadores
por WebSocket, con Caddy como proxy inverso HTTPS. Reutiliza la lógica original del HTML.
PeerJS ya no es necesario para el juego centralizado. **La voz es opcional y usa WebRTC** entre los navegadores; Node.js solamente transmite mensajes de negociación.

**Pruebas realizadas:** el motor ha iniciado partidas con 2 y 4 asientos humanos
simulados en Chromium local, enviando las vistas y eventos de inicio para cada
asiento sin errores de JavaScript. También se simuló un cliente que envía su
contraseña, se conecta, carga el mazo y recibe la orden de inicio. No se ha podido compilar la imagen Docker
en este entorno ni validar todavía una sesión real entre distintos hogares.

## Características

- Los cuatro asientos pueden pertenecer a jugadores desde distintos domicilios.
- El primero que se conecte ocupa el asiento 1 y tiene el botón **Empezar partida**.
- Los demás entran desde la misma URL. Si hay 2-3 jugadores, los asientos vacíos son bots.
- Cada jugador puede elegir uno de sus mazos; importar mazos antes de entrar.
- El juego mantiene checkpoints en el perfil persistente del navegador del servidor.
- El servidor consulta Scryfall desde su propio Chromium.
- `scripts/update-from-github.sh` busca nuevas versiones y **no reinicia** con partidas activas ni personas conectadas al canal de voz.

## Poner en marcha

Requisitos: Docker Compose, Git y un dominio propio con DNS hacia tu servidor.
Es necesario que los puertos TCP 80 y 443 sean alcanzables desde Internet. Los clientes
utilizan HTTPS/WSS, así que no hace falta publicar el puerto 3000.

```bash
git clone git@github.com:TU_USUARIO/TU_REPO.git /opt/mesa-commander
cd /opt/mesa-commander
cp .env.example .env
# Edita DOMAIN=commander.tudominio.com
docker compose up -d --build
```

Configura una contraseña larga en `.env` como `INVITE_PASSWORD` y compártela
solo con tus amigos; no subas `.env` al repositorio. Cada jugador la introduce
al entrar y se guarda únicamente durante su sesión de navegador.

Edita `config/game.json` y sube los cambios a GitHub para modificar el nombre de mesa,
el código de sala, el número mínimo de jugadores (entre 2 y 4) y `voiceEnabled`.

## Canal de voz integrado (opcional)

Cada persona **primero entra al servidor de juego**. En la barra superior aparece
**🎙️ Unirse a voz**. Al pulsar, el navegador solicita permiso para usar el micrófono.
El audio se reproduce desde los demás jugadores que también hayan entrado al
canal. El panel muestra quién está en voz y permite **Silenciar micrófono**,
**Activar sonido** (por si el navegador impide reproducir automáticamente) y
**Salir del canal**, sin tener que abandonar la mesa.

- Es voluntario: **entrar al juego NO abre el micrófono**. El botón está disponible
  en la sala de espera y durante la partida, solo para clientes con asiento.
- Hasta cuatro usuarios: audio WebRTC de navegador a navegador, cifrado de
  extremo a extremo en tránsito mediante DTLS-SRTP. El servidor Node solo
  señaliza; **no graba ni procesa el audio**.
- **Se necesita HTTPS** (o localhost para pruebas) y permiso de micrófono.
- Conexión directa mediante STUN en redes domésticas que lo permiten; para
  NAT/firewalls restrictivos, prepara el TURN opcional de abajo.
- Si se corta la conexión con el servidor, el navegador deja de usar el
  micrófono y deberás entrar de nuevo en el canal tras reconectar.

### TURN propio en Docker (opcional pero recomendado para amigos en distintas casas)

STUN solo no garantiza llamadas desde todas las conexiones residenciales.
Se incluye Coturn como **perfil Docker optativo** que puede retransmitir audio
cuando WebRTC no logra la conexión directa. En un host Linux con IP pública:

1. Genera un secreto aleatorio de al menos 32 caracteres: `openssl rand -hex 32`.
2. En tu `.env`, descomenta y completa las variables siguientes (con el **mismo**
   secreto para ambos servicios):

```dotenv
COMPOSE_PROFILES=turn
TURN_PUBLIC_IP=TU_IP_PUBLICA
TURN_REALM=commander.tudominio.com
TURN_SHARED_SECRET=PEGA_EL_SECRETO_GENERADO
TURN_URLS=turn:commander.tudominio.com:3478?transport=udp,turn:commander.tudominio.com:3478?transport=tcp
```

3. El DNS de `commander.tudominio.com` debe resolver a tu servidor. Abre o
   redirige hacia él **TCP/UDP 3478 y UDP 49160–49200** además de TCP 80/443.
4. Ejecuta `docker compose up -d --build` y comprueba `docker compose logs turn`.

El servicio TURN usa `network_mode: host`, recomendado para servidores Docker
Linux, y necesita una IP pública correcta. Si estás tras CG-NAT, usa un VPS
público u otro servidor TURN accesible. Las credenciales TURN se generan en
Node.js para cada jugador autenticado, con caducidad de 24 horas; el secreto
compartido solo se guarda en `.env`, nunca se envía al navegador.

Puedes desactivar el canal del todo usando `"voiceEnabled": false` en
`config/game.json`. No se necesita Discord ni cuentas adicionales.

**Limitación de pruebas de voz:** se han verificado sintaxis, estructura e
integración, pero el entorno de pruebas no ha permitido abrir una llamada
WebRTC real entre dos navegadores. Prueba micrófono, auriculares, silenciamiento
y recuperación de conexión con tus amigos antes de depender del canal.


El primero que entre abre `https://commander.tudominio.com`, importa su mazo
(opcional), pulsa «Entrar al servidor», indica su nombre y elige mazo.
Cuando los demás estén conectados, pulsa «Empezar partida».
El primer jugador puede iniciar otra partida desde «Nueva partida» cuando
termine la anterior.

Las partidas en curso se mantienen mientras el contenedor y Chromium siguen vivos.
Un reinicio recupera el último checkpoint guardado, no todos los movimientos posteriores.
**No hay garantía de recuperación exacta ante cierre abrupto o fallos**.

## Configurar actualización automática a las 07:00 Europe/Madrid

El host Linux debe tener `git`, `curl`, `python3`, `flock`, `docker` y el plugin compose.
El usuario que ejecute el servicio debe poder acceder al clon por Git SSH (deploy key)
y ejecutar `docker compose`. Ser miembro del grupo Docker equivale prácticamente
al control del host: utiliza una cuenta administrativa dedicada.

Sustituye `__DEPLOY_USER__` y `__APP_PATH__` en el archivo `.service`:

```bash
sudo cp deploy/systemd/mesa-commander-update.service /etc/systemd/system/
sudo cp deploy/systemd/mesa-commander-update.timer /etc/systemd/system/
sudo nano /etc/systemd/system/mesa-commander-update.service
sudo systemctl daemon-reload
sudo systemctl enable --now mesa-commander-update.timer
systemctl list-timers mesa-commander-update.timer
```

Prueba el servicio con `sudo systemctl start mesa-commander-update.service`.
Consulta logs con `journalctl -u mesa-commander-update.service -n 100`.
El script solo actualiza si el commit remoto es distinto. Si hay una partida activa **o un jugador en voz**,
**aplaza hasta la siguiente ejecución**. `Persistent=true` ejecuta una activación
pendiente tras un apagado o suspensión del host.

El script presupone que `origin/main` es la rama de publicación (protegida y
revisada). No es recomendable dejar que cualquier contribuidor despliegue código
arbitrario a tu servidor: aprobar cambios mediante pull requests.

## Limitaciones que aún deben probarse

Este proyecto es una **integración inicial** construida sobre un archivo de unos
14.000 renglones y múltiples mecanismos en el navegador, especialmente torneos,
reconexión, eventos, prompts, guardados y mazos. Aunque el motor se ejecuta en el
servidor, las partidas de 4 humanos, las reconexiones, permisos y restauración no
han sido validadas extremo a extremo. No uses esta versión para partidas importantes
sin hacer pruebas con navegadores y usuarios reales.

El servidor aplica los mensajes de entrada mediante la lógica del HTML original;
la validación exhaustiva de permisos de cada acción y autenticación por jugador
no están resueltas. Para exposición pública más allá de un pequeño grupo de
amigos es necesario introducir autenticación (o invitaciones firmadas), limitar
peticiones y reforzar el protocolo. El nombre y el PID del navegador **no son
credenciales seguras** y permiten suplantación si alguien los conoce.

## Archivos

- `app/index.html`: HTML original adaptado para conectar el asiento 0.
- `config/game.json`: parámetros compartidos (nombre de mesa, código y mínimo de jugadores).
- `server/central.js`: puente de eventos, lobby y cuatro clientes.
- `server/index.mjs`: servidor HTTP/WebSocket, señalización de voz y Chromium con perfil persistente.
- `server/voice.js`: interfaz de voz y conexiones WebRTC de audio.
- `Dockerfile` y `compose.yaml`: servidor de juego en Docker con TLS en Caddy y TURN opcional.
- `scripts/update-from-github.sh`: pull condicionado y despliegue con Docker.
- `deploy/systemd`: comprobación de cambios a las 07:00 (Madrid).

## Para colaboración

Cada persona crea una rama y un pull request. El administrador aprueba cambios a
`main`; el servidor solo despliega `main` a las 07:00. Mantened `.env` y secretos
fuera del repositorio. Los parámetros generales pueden vivir en archivos
versionados; preferencias y mazos privados deberían permanecer fuera de Git.
