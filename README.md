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
- **Actualizaciones desde GitHub**: el servidor comprueba la rama `main` cada día a las **07:00 (Europe/Madrid)** y despliega cambios si no hay una partida activa ni usuarios en voz.

> **Estado del proyecto:** la interfaz y el motor funcionan, pero todavía faltan pruebas completas con varios jugadores reales, recuperación ante fallos y endurecimiento de la seguridad. El chat de voz puede necesitar un servidor TURN para algunas redes.

## 🎮 Cómo jugar

1. Pide al administrador la **dirección HTTPS** de Mesa Commander y la **contraseña de invitación**.
2. Abre el enlace desde un navegador actualizado, escribe tu nombre y entra a la mesa.
3. Importa o selecciona tu mazo. El primer jugador conectado puede iniciar la partida cuando haya suficientes jugadores preparados (mínimo configurable entre 2 y 4).
4. Si quieres hablar, pulsa **«Unirse a voz»**, concede permiso al micrófono y utiliza los controles para silenciarte o salir. Es opcional.

No necesitas instalar Docker, Tailscale ni el juego en tu ordenador para jugar. Si el audio no conecta, puedes seguir jugando sin voz.

## 🤝 ¿Quieres colaborar?

¡Las propuestas de cambios, informes de errores y mejoras son bienvenidas! El código está en este repositorio privado: **[piconcd/mesa-commander](https://github.com/piconcd/mesa-commander)**.

### 1. Consigue acceso al repositorio

Pide a la persona administradora que te invite como colaborador en GitHub y acepta la invitación. Necesitarás una cuenta de GitHub; **no necesitas acceso SSH a la Raspberry**.

### 2. Elige qué mejorar

| Quiero cambiar… | Archivo o carpeta |
| --- | --- |
| Nombre de la mesa, código, mínimo de jugadores o activación de la voz | `config/game.json` |
| Apariencia, interfaz y lógica original del juego | `app/index.html` |
| Comunicación y servidor centralizado | `server/` |
| Instrucciones del proyecto | `README.md` |
| Contenedores y despliegue | `compose.yaml`, `Dockerfile`, `deploy/`, `scripts/` |

### 3. Propón tu cambio (sin usar la terminal)

1. En GitHub, abre el archivo que quieras editar y pulsa el **icono del lápiz**.
2. Realiza los cambios y selecciona la opción de **crear una rama nueva** en lugar de modificar directamente `main`.
3. Guarda el cambio (*Commit changes*) y abre un **Pull Request** explicando qué has cambiado y por qué.
4. El administrador revisará la propuesta. Si la aprueba, la incorporará a `main`.
5. El servidor comprobará los cambios en su siguiente ejecución programada y los aplicará cuando sea seguro reiniciar.

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

Las actualizaciones se gestionan con `scripts/update-from-github.sh` y el temporizador `deploy/systemd/mesa-commander-update.timer` (07:00, hora de Madrid). Si el equipo estaba apagado, `Persistent=true` permite recuperar la comprobación al encenderlo. Si existe una partida o alguien está en voz, el despliegue se aplaza hasta una ejecución posterior; **no se aplica inmediatamente al terminar la partida**.

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
