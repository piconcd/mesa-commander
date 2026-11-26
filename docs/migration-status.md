# Estado real del motor de reglas nativo

Auditoría estática de la revisión `2b0ba2f9df44a07e6a2d91927b69d1c66b9bc47e` (26 de noviembre de 2026). El motor JavaScript ejecutado en Chromium es la autoridad de las partidas. Se conserva Node.js, WebRTC, el contenedor único y el despliegue de las 07:00 Europe/Madrid.

## Datos y automatización existentes

- Scryfall Oracle Cards (bulk-data) al arrancar y diariamente a partir de las 07:00; caché compacta en `/data/rules/oracle.json`.
- Comprehensive Rules de Wizards, enlace TXT, contenido y hash en `/data/rules/comprehensive.json`. Si falla una descarga se conserva la última copia válida.
- Antes de iniciar una partida central se refrescan las definiciones de los mazos de humanos y bots, conservando imágenes. Si no hay catálogo se usan las definiciones anteriores.
- El intérprete reconoce numerosos patrones y excepciones de cartas, incluye costes, combate, efectos comunes y decisiones individuales; la asistencia está activada en partidas centrales.
- Hay correcciones específicas de habilidades opcionales de robo/vidas y cancelación de contadores opuestos.

Los datos remotos no se ejecutan como código. Descargar Oracle y el reglamento **no equivale a implementarlos**. La auditoría `mcAuditDeck` es heurística y no bloquea mazos ni acredita que una interacción sea correcta.

## Hallazgos confirmados

Los números de línea corresponden a la revisión auditada de [app/index.html](https://github.com/piconcd/mesa-commander/blob/2b0ba2f9df44a07e6a2d91927b69d1c66b9bc47e/app/index.html). El archivo contiene extensiones que envuelven funciones base; no son un motor independiente.

| Prioridad | Reglas (CR) | Evidencia | Pendiente |
| --- | --- | --- | --- |
| P0 | 117, 405, 603 | `trigger` (2096, extensión 9961) llama a `runOpsAI` / `userOps`; `G.stack` guarda un ID; `responseWindow` (4602) tiene límites y contrarresta directamente | Pila LIFO de objetos, disparadas pendientes APNAP, prioridad sucesiva de todos, respuestas a respuestas y habilidades |
| P0 | 601–602, 608 | `castSpell` (4268) preselecciona objetivos para bots; `resolveSpell` (4411) solicita operaciones al resolver; `userOps` (5633) difiere decisiones | Lanzamiento/activación transaccional, objetivos y modos previos, costes completos, objetivos ilegales al resolver |
| P0 | 613 | `recomputeMods` (1890) recompone modificadores, anexos y antífonas con lógica específica | Capas 1–7, subcapas, dependencias, timestamps, CDA y efectos con duración |
| P0 | 614–616 | `moveCard` (1983) y `combatDamage` (4959) contienen redirecciones y prevenciones codificadas directamente | Eventos reemplazables, elección y revaluación, prevención, prohibiciones y efectos de entrada simultáneos |
| P0 | 400.7, 603, 704 | `moveCard` reutiliza ID y conserva campos de salida; `sba` (4655) modifica permanentes secuencialmente con límite de 12 iteraciones | Identidad por cambio de zona, LKI, eventos simultáneos, acciones de estado completas hasta punto fijo |
| P0 | 903, 800.4 | `moveCard` redirige comandante antes de llegar a cementerio/exilio y no ofrece la opción equivalente para mano; `eliminate` (4685) recorre solo permanentes | Elección de mando según zona y momento, salida de jugador completa, legalidad de mazos, variantes de comandantes |
| P1 | 508–510 | `combatDamage` (4959) asigna daño siguiendo una lista de bloqueadores y ejecuta eventos uno a uno | Asignación legal elegida por jugador según reglas actuales, simultaneidad, batallas y restricciones/requisitos completos |
| P1 | 700–729 y nuevas mecánicas | `abOf`, `parseEffects`, `XOPS`, extensiones por colección y carta; no se encontraron implementaciones explícitas de las cuatro mecánicas de bending en el archivo | Catálogo semántico de habilidades, acciones, palabras clave y excepciones Oracle |
| P1 | 903, 103 | `doImport` (7049) permite definiciones ausentes y propone la primera criatura legendaria; `mcAuditDeck` solo avisa | Validación normativa de formato, identidad, 100 cartas, singleton/excepciones, prohibidas, elegibilidad, mulligan y procedimientos iniciales |
| P1 | 108, 201–209, 707–712 | `fromScry` (7085) adapta selectivamente layouts y no conserva todos los campos de cada cara | Tipos, características, valores copiables, caras, objetos boca abajo, meld, copias y permisos de zona completos |

## Verificación

Hay pruebas de regresión de sintaxis, selección de maná, shocklands, afinidad, voz, reinicio central, catálogo y efectos opcionales/contadores. No equivalen a una suite integral de conformidad. Esta auditoría no ejecutó CI ni una partida real, y no mide un porcentaje de cobertura. Se requiere inventario por regla y carta, pruebas de interacción y escenarios multijugador.

Véase [plan de conformidad](rules-engine-migration.md) para implementación y criterios de aceptación. Las reglas oficiales se consultan en https://magic.wizards.com/en/rules y las notas de colección complementan el reglamento.

## Entrega incremental del motor (sin validación funcional)

Se incorpora `server/engine/core.mjs`, un núcleo independiente de la interfaz con estado serializable, referencias por generación de objeto, pila LIFO, prioridad y pases, orden APNAP de disparadas, preparación transaccional de acciones, comprobación de objetivos al resolver, aplicación ordenada de reemplazos, orden de efectos clasificados por capa y detección de un subconjunto de acciones basadas en estado. Incluye casos de prueba en `tests/native-rules-core.test.mjs`. **El núcleo aún no sustituye a la ruta de juego de Chromium**: los adaptadores de cartas, eventos, costes, capas, decisiones y fases deben integrarse antes de considerarlo completo.

Cambios activos en `app/index.html`:

- Commander multijugador: el primer jugador roba en su primer turno; se conserva la excepción del primer turno de duelo.
- Jugar tierras: se rechaza fuera de la propia fase principal con pila vacía y cuando se supera el límite.
- Se impide el lanzamiento por la ruta normal si ya se aplicó la restricción de Conduit of Worlds.
- Los comandantes enviados a cementerio/exilio llegan a esa zona; el retorno automático se aplica en la comprobación de estado, usando la preferencia del propietario (bots: sí). Mano/biblioteca conservan el tratamiento de reemplazo. La elección individual en cada evento y su orden correcto respecto a todas las disparadas siguen pendientes.
- La ruta de contrahechizo envía al cementerio o exilio según flashback, antes de las comprobaciones de estado; se corrige un caso de disparadas de muerte al aplicar exilio en lugar de morir.

Estas son correcciones parciales sobre el motor existente; no garantizan conformidad universal. Se ha comprobado la sintaxis del script HTML y del núcleo, pero no se han ejecutado las nuevas pruebas funcionales ni partidas. La regla de leyendas, la resolución simultánea, los efectos de capas y reemplazo reales, las cuatro mecánicas de bending, todos los costes/objetivos y las cartas Oracle siguen pendientes de integración general.


## Máquina de partidas experimental

`server/engine/game.mjs` amplía el núcleo con comandos versionados y estado serializable, costes de maná, objetivos, pila, disparadas, decisiones, fases, combate parcial y vistas privadas. Los efectos se describen mediante operaciones declarativas; no se ejecuta texto Oracle. Las pruebas nuevas están en `tests/native-rules-game.test.mjs`. Seis escenarios superados en un entorno JavaScript aislado; falta confirmar CI y la ejecución nativa de Node.js.

La integración con Chromium, los bots, el catálogo de cartas, la reconexión y persistencia de producción, las capas/reemplazos generales y la conformidad integral siguen pendientes. No se cambia el motor activo ni se certifica cobertura universal.
