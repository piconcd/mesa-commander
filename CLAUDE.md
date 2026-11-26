# Mesa Commander: normas para Claude Code

Proyecto colaborativo para jugar a Magic: The Gathering (formato Commander) por Internet. El juego corre en un servidor propio (Raspberry Pi 5 con Docker) y los jugadores entran desde el navegador. Responde siempre en **español**. Miguel no es programador y dicta por voz, así que puede haber erratas o nombres de cartas escritos «de oído» (interprétalos). Explícale los cambios en lenguaje sencillo y dile qué debe revisar.

## Cómo está hecho

| Parte | Archivo | Notas |
| --- | --- | --- |
| Interfaz + motor de reglas actual | `app/index.html` | Un único archivo de unas 14.000 líneas. Contiene la interfaz, el motor, los bots, el intérprete de textos Oracle y los mazos de ejemplo. **Es el motor que juega las partidas reales.** |
| Servidor | `server/index.mjs` | Node + WebSockets. Arranca un Chromium sin ventana (Playwright) que ejecuta `app/index.html?engine=1` y actúa como anfitrión autoritativo. Comprueba la contraseña de invitación. |
| Puente servidor ↔ motor | `server/central.js` | Dos bloques: `if (engine) {…}` se ejecuta dentro del Chromium del servidor; el resto se ejecuta en el navegador de cada jugador. |
| Voz | `server/voice.js` | WebRTC; el servidor solo reenvía la señalización. |
| Catálogo de reglas | `server/rules-catalog.mjs` | Descarga a diario las cartas Oracle de Scryfall (se usan para refrescar los textos de los mazos antes de cada partida) y el reglamento oficial (solo se guarda; **ningún código lo lee**). |
| Motor nativo nuevo | `server/engine/*.mjs` | Experimental. **No se usa en las partidas.** No lo conectes salvo que Miguel lo pida. |
| Configuración | `config/game.json` | Nombre de la mesa, mínimo de jugadores, voz. |
| Pruebas | `tests/*.test.mjs` | `node:test`, sin dependencias externas. |

### Modo servidor: detalles importantes
- El Chromium del servidor ocupa el asiento 0 con el DOM real; cada jugador remoto tiene una copia oculta de la interfaz (`SHADOW[k]`). Los clics de los jugadores llegan al servidor con `netHostEvent` y se reproducen en su copia mediante `asSeat(k, …)`.
- Todo lo que en la app original solo podía hacer el anfitrión (comprobaciones `NET.mode !== 'client'`) **no lo puede pulsar nadie** en modo servidor. Las funciones nuevas deben estar al alcance de los jugadores: botones dibujados en su propia interfaz o mensajes `central-*` gestionados en `server/central.js` y validados en el servidor.
- Nunca confíes en datos del cliente sin validarlos en el bloque `engine` (asiento, tipo, estado de la partida).

### Convenciones del motor (`app/index.html`)
- Se amplía el código envolviendo funciones existentes: `const original = f; f = function (...) { …; return original(...); }`. Los arreglos por carta o por set suelen ir en bloques al final del script.
- Intérprete: `abOf(def)` analiza el texto de la carta, `parseEffects(texto)` produce operaciones, y `XOPS` (aplicar), `XPROMPT` (preguntar a un humano), `XTEXT` (descripción), `CHGEN`/`CHWHO`/`chGo` (efectos en los que cada jugador elige) las ejecutan. `auditDef(def)` y `abOf(def).manual` indican lo que no se reconoce: es lo que usa el botón «Comprobar cartas».
- Elecciones: los humanos eligen (`askYesNo`, `askChoice`, `pickFromList`, `seatOps`, `userOps`) y los bots deciden solos (`isBotSeat(s)`). Si la carta dice «puedes», «elige» u «objetivo», debe preguntar al humano que corresponde.
- Las funciones asíncronas se esperan con el patrón `__R(ME, G, await …)`. El bucle de turnos (`gameLoop`) usa `G.loopGen` para que no corran dos bucles a la vez.

## Normas obligatorias del proyecto
1. **Una sola rama: `main`.** No crees ramas, forks, versiones alternativas ni instalaciones paralelas.
2. **Un solo contenedor Docker** (`mesa-commander`, servicio `commander`). No añadas contenedores ni servicios nuevos.
3. **Todo lo que llega a `main` se instala solo en la Raspberry a las 07:00 (Europe/Madrid), aunque haya partidas o voz en curso.** Un error en `main` rompe la partida de todos. Nunca dejes nada a medias.
4. **No toques la Raspberry ni su copia.** GitHub es la única fuente de cambios.
5. **No hagas `git commit` ni `git push` salvo que Miguel lo pida expresamente en ese momento.** Él revisa los cambios y los sube con GitHub Desktop. Antes de empezar una tanda de cambios, recuérdale que pulse «Fetch origin».
6. **Nunca subas** `.env`, contraseñas, tokens, mazos privados, partidas guardadas ni archivos de datos grandes (por ejemplo, el JSON de Oracle Cards de Scryfall). Los datos y los informes de trabajo van en `D:\MTG claude\`, **fuera** de la carpeta del repositorio.
7. Conserva el diseño, el chat de voz y la persistencia, salvo que se pida cambiarlos.
8. **Saltos de línea:** la copia de trabajo de Windows usa CRLF. No conviertas archivos enteros a LF ni reformatees archivos completos; el cambio debe mostrar solo las líneas modificadas en GitHub Desktop.

## Antes de dar un cambio por terminado
Ejecuta lo mismo que GitHub Actions (`.github/workflows/mesa-ci.yml`):

```
npm run check
node --check server/voice.js
node --test tests/*.test.mjs
```

- Cada cambio lleva su prueba en `tests/`. Estilo habitual: leer el archivo fuente, extraer la función con `indexOf`/`slice` y ejecutarla con `new Function(...)` y objetos falsos (ver `tests/central-reset.test.mjs` y `tests/central-tobot.test.mjs`), o comprobaciones con expresiones regulares cuando no se pueda aislar.
- Para cambios del motor, pruébalo además jugando: Playwright puede abrir `app/index.html` con `file://` (bloquea las peticiones externas), poner `SET.spectate = true; SET.stepMode = false; SET.speed = 'test'` y llamar a `startNewGame()` para una partida de 4 bots; también se puede llamar directamente a `XOPS.<op>(...)` para probar un efecto. Para esto hace falta `npm install` y `npx playwright install chromium` (la carpeta `node_modules/` está en `.gitignore`).
- Al terminar, dile a Miguel exactamente qué archivos debe ver en la pestaña «Changes» de GitHub Desktop y un resumen corto para el commit.

## Cartas y reglas
- Usa siempre el texto oficial Oracle (Scryfall), nunca una aproximación de memoria. Las reglas de referencia son las Comprehensive Rules de Wizards.
- Objetivo del proyecto: que cada carta haga sola lo que dice su texto y que solo se pregunte al jugador cuando las reglas le dejan elegir. Prioriza arreglar **mecánicas** (arreglan muchas cartas a la vez) antes que parches carta a carta.
- Si una carta necesita reglas que el motor actual no tiene (capas, efectos de reemplazo generales, copias complejas, cambios de tipo en cadena), **no metas un parche que funcione a medias**: márcala como pendiente y explícalo. Esas reglas están planificadas en `docs/rules-engine-migration.md` y `docs/migration-status.md`.
- No publiques porcentajes de cobertura sin una comprobación verificable.
