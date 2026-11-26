# Plan de conformidad del motor nativo de Magic: The Gathering

## Objetivo y alcance

Un único motor JavaScript autoritativo, compartido por humanos y bots, capaz de ejecutar las reglas oficiales y las interacciones de las cartas con texto Oracle vigente. Prioridad inicial: Commander multijugador. No presentar como soportadas las variantes de juego o cartas no validadas. El soporte completo de otros formatos y reglas especiales (equipos, Planechase, Archenemy, Vanguard, cartas casuales y mecánicas digitales si se incluyen) requiere matrices separadas.

No hay certificación de cobertura total actualmente. Véase [auditoría del estado actual](migration-status.md).

## Arquitectura objetivo

Separar gradualmente del HTML un núcleo testeable sin DOM, con comandos validados, estado serializable, identificadores de objeto por cambio de zona, eventos tipados, pila, prioridad, motor de efectos continuos y reemplazos, solicitudes de decisión, registro reproducible y vistas privadas por jugador. La interfaz muestra el estado; no decide qué es legal. Los bots eligen entre las mismas acciones legales. Mantener el contenedor, servidor y API existentes durante la transición; no activar una ruta incompleta en producción.

## Orden de implementación

| Fase | Trabajo | Criterio de aceptación |
| --- | --- | --- |
| 0 | Congelar escenarios de regresión y fijar versiones de CR y Oracle para pruebas | Reproducción determinista con semilla, comandos y estado esperado; manifest por regla y carta con estado pendiente/parcial/verificado |
| 1 | Modelo de objetos, zonas, propiedad/control, identificadores, eventos, LKI, elecciones e información oculta | Un objeto que sale y vuelve no es el mismo objetivo; vistas sin cartas privadas; decisiones serializables |
| 2 | Pila, prioridad (CR 117/405), disparadas (603), APNAP, activadas (602), mana abilities (605) | Todos los jugadores vivos pueden responder; tras cada acción se reinician pases; se resuelve un solo objeto cuando todos pasan; disparadas simultáneas se ordenan correctamente |
| 3 | Lanzar/activar/resolver (601/602/608), costes y restricciones (106/118), modos, X, objetivos, reparto, alternativas y adicionales | Cancelación sin pagos parciales indebidos; legalidad al declarar y resolver; un hechizo con todos sus objetivos ilegales no resuelve; costes y disparadas de pago correctos |
| 4 | Reemplazos/prevención (614–616), eventos simultáneos y acciones basadas en estado (704) | Orden elegido por jugador afectado, reevaluación después de cada aplicación, cada reemplazo una vez por evento; SBAs simultáneas hasta punto fijo |
| 5 | Capas (613), timestamps, dependencias, CDA, características, control, tipos y habilidades | Humility/Opalescence, Blood Moon/Urborg, copias, cambios de tipo y P/T producen resultados correctos en ambos órdenes de entrada |
| 6 | Turnos (500–514), combate, pasos adicionales/omitidos, requisitos y restricciones, daño simultáneo | Multi-bloqueo con asignación actual, arrollar/toque mortal, first/double strike, batallas, planeswalkers, ataque a varios oponentes |
| 7 | Commander (903) y multijugador (800–809) | 100 cartas, singleton y excepciones, identidad de color, elegibilidad y combinaciones de comandantes, impuesto, daño de combate 21 por comandante, mando desde cada zona según CR, eliminación y victoria/empate |
| 8 | Operaciones y habilidades (700 en adelante), layouts, cartas especiales y todas las colecciones | Cada texto Oracle tiene implementación semántica revisada o estado explícito no soportado; casos por cada cara, palabra clave y excepción |
| 9 | Integración, rendimiento, persistencia, privacidad y robustez | Partidas de 2–4 jugadores, bots, reconexión con pila/decisiones pendientes, aislamiento de asientos, restauración y pruebas en ARM64 |

El orden es de dependencias técnicas; las fases 4 y 5 pueden iterarse juntas. No asumir que reconocer una palabra clave significa que su semántica está completa.

## Matriz mínima de aceptación

| Caso | Resultado esperado |
| --- | --- |
| Counterspell sobre otro Counterspell; Stifle sobre una disparada | Pila LIFO y prioridad real, no atajos de resolución |
| Rhystic Study / Esper Sentinel | Elección de pagar al resolver la disparada; se puede responder antes |
| Wrath of God con varias criaturas y Blood Artist | Muertes simultáneas, LKI, disparadas APNAP y elección de orden |
| Rest in Peace y comandante destruido | Reemplazo al exilio y posterior elección de mando como SBA |
| Comandante devuelto a mano o biblioteca | Opción de reemplazar ese movimiento por zona de mando |
| Torpor Orb, Panharmonicon y entradas múltiples | Impedir o duplicar disparadas únicamente cuando corresponde |
| Doubling Season / Hardened Scales / efectos de prevención | Orden de reemplazos, contadores y daño correctos |
| Dos legendarios del mismo nombre | Elección obligatoria del controlador; excepciones y efectos continuos |
| Teferi's Protection | Phasing sin cambio de zona, protección y restricciones de vida con duración correcta |
| Shockland y otros reemplazos de entrada | Elegir pago de vida o entrar girada; combinar con efectos aplicables |
| Allies at Last | Afinidad reduce genérico, objetivos válidos y resolución Oracle |
| Avatar Aang | Disparadas por bending y condición de transformación según Oracle |
| Airbend | Exiliar objeto legal, incluido hechizo si procede; permiso de relanzamiento por coste alternativo |
| Earthbend | Animar tierra, contadores y disparada retardada para retorno girado tras muerte/exilio |
| Firebending | Disparada de ataque en pila; maná disponible hasta fin de combate |
| Waterbend | Pagar componente genérico con artefactos/criaturas enderezados sin doble uso; disparada por pago |
| Aang's Iceberg y Avatar's Wrath | Exilio vinculado y restricciones conforme al texto específico, incluidos objetivos ilegales y salida anticipada |
| Tutor y búsquedas | Revelar solo si corresponde, búsqueda fallida cuando se permite, información privada |
| Sagas | Capítulos y sacrificio final en el momento normativo, respuestas a la última disparada |
| Jugador abandona con hechizos, permanentes y efectos de control | Aplicar CR 800.4; retirar sus objetos y efectos correspondientes, conservar objetos ajenos según reglas |
| Bucles obligatorios y opcionales | Detectar y aplicar empate o elección de número finito conforme al reglamento; nunca cortar en silencio por un límite |
| Reconexión con decisiones pendientes | Misma pila y elección válida por asiento, sin duplicación ni filtración de información |

## Estrategia de pruebas y cobertura

- Unitarias del núcleo por subregla; integración por carta y combinación; escenarios multijugador; pruebas generativas de invariantes (propiedad, zonas, costes, información, prioridad).
- Versionar CR/hash y Oracle/oracle_id + versión del texto y cara. Enumerar reglas aplicables y cartas por alcance; clasificar cada entrada como no aplicable, pendiente, parcial o verificada con evidencia. No inventar porcentajes ni considerar los avisos del parser una métrica de conformidad.
- Fallar explícitamente para efectos sin semántica en modo estricto. Si se conserva modo experimental, advertir que su ejecución no garantiza reglas oficiales y nunca confundirlo con modo verificado.
- Las actualizaciones de catálogo deben identificar cambios de texto y mecánicas nuevas, invalidar verificaciones afectadas y generar casos pendientes; no ejecutar texto descargado.
- Mantener `npm run check` y `node --test tests/*.test.mjs`; ampliar CI con escenarios deterministas y partidas reales del motor. Validar ARM64 antes de cambios de runtime. No afirmar cobertura completa sin evidencia de todas las reglas aplicables y cartas del alcance.

## Operación

Publicar cambios en main, mantener el servicio Compose commander y el contenedor mesa-commander; no introducir otra instancia productiva. Conservar datos, voz y política de actualización diaria a las 07:00 Europe/Madrid.

## Referencias

- https://magic.wizards.com/en/rules
- https://magic.wizards.com/en/news/feature/avatar-the-last-airbender-release-notes
- https://scryfall.com/docs/api/bulk-data
