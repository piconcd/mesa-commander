# Migración del motor de reglas

Estado: diseño y entorno aislado. XMage todavía no está integrado.

## Entorno
La decisión de despliegue actual es integrar los cambios en main y conservar el contenedor mesa-commander existente. No iniciar otro servicio de aplicación en Raspberry. Las pruebas aisladas se ejecutan en CI o fuera de producción; no activar el motor incompleto. Véase [XMage en el contenedor único](xmage-single-container.md).

## Fases
1. Reproducir fallos del cliente legado y corregir voz, teclado y tokens en cambios pequeños.
2. Evaluar XMage y el proxy de XMage Nexus: licencia, versión fijada, compilación ARM64, autenticación, compatibilidad Commander de cuatro jugadores, bots, cartas Avatar y consumo. No adoptar código sin revisar licencia y dependencias.
3. Prototipo de partida: importar dos mazos, crear mesa, lanzar hechizo, elegir objetivo, pagar coste y ceder prioridad. Luego cuatro jugadores y bots.
4. Adaptador Node/Java: comandos autenticados por asiento, solicitudes de decisión con identificador, vistas filtradas por jugador, snapshots versionados, reconexión y manejo de errores. No exponer manos ni bibliotecas privadas ni aceptar cambios de estado del navegador.
5. Integrar vistas de mesa, pila, fases, combate, selección de maná, revelaciones y eventos. XMage es única autoridad de reglas en partidas nuevas; no combinar dos motores en una partida.
6. Validación, despliegue y rollback. No intentar migrar partidas activas entre motores. Integrar cambios compatibles en main; activar el motor únicamente tras superar las pruebas de aceptación. Comprobar salud tras despliegue y conservar datos de producción.

## Pruebas de aceptación
| Caso | Resultado esperado |
|---|---|
| Voz / reconexión | Cerrar panel siempre; limpiar micrófono y peers al perder o sustituir conexión; permitir volver a entrar |
| Shockland | Elección de pagar 2 vidas o entrar girada; respetar otros efectos |
| Espacio | Ceder prioridad según contexto; no saltar respuestas ni interceptar entrada de texto |
| Tokens | Imagen correcta por identificador de token; fallback si no hay imagen |
| Sagas | Capítulos al entrar y al comienzo de primera fase principal, no mantenimiento salvo efecto específico |
| Comandante | Rechazar lanzamiento sin coste pagable; impuesto por lanzamientos previos desde zona de mando |
| Allies at Last | Aplicar afinidad por Allies al coste genérico, validar objetivos y resolver texto Oracle |
| Avatar Aang | Disparar robo por bending y comprobar condición de transformación según Oracle |
| Earthbend | Elegir tierra legal, contadores, efecto de retorno según reglas |
| Aang's Iceberg | Ofrecer objetivos legales y resolver exilio según Oracle |
| Avatar's Wrath | Resolver objetivos y efectos de airbend y restricciones según Oracle |
| Tutor | Revelar solo cuando corresponda y preservar información oculta |
| Avatar | Verificar las cuatro mecánicas y cobertura de cartas importadas |
| Maná | Elegir fuentes y colores, validar pago y cancelación |
| Teferi's Protection | Phasing, protección y vidas según Oracle, duración y exilio del hechizo |

Además: prioridad APNAP, objetivos ilegales al resolver, reemplazos, acciones basadas en estado, efectos continuos, concurrencia, desconexiones durante decisiones, privacidad entre asientos y partidas de cuatro jugadores. Las cartas no soportadas se detectan antes de iniciar partida; no se presentan como automatizadas.

## Referencias
- https://github.com/magefree/mage
- https://github.com/Adamychen/xmage-nexus
- https://magic.wizards.com/en/rules
- https://magic.wizards.com/en/news/feature/avatar-the-last-airbender-release-notes
