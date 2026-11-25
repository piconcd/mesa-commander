# Estado de la migración
El código actual sigue utilizando el motor JavaScript de Mesa Commander. Las correcciones incrementales de voz, teclado, shocklands jugadas normalmente, pago normal de hechizos, afinidad por Aliados, tutores compatibles, imágenes de fichas y capítulos de saga no constituyen una integración completa de XMage.

## Validación
`node --test tests/*.test.mjs` ejecuta pruebas unitarias sobre fragmentos del motor real. No sustituye las partidas multijugador ni las pruebas de despliegue ARM64.

## XMage
Candidato: XMage Nexus, proxy Java, licencia MIT. Referencias fijadas para reproducir pruebas:
- Proxy: https://github.com/Adamychen/xmage-nexus/tree/779c38624c0de265a679fa947bb771e01a9f0414
- Fork de motor: https://github.com/Adamychen/xmage-nexus/tree/82a5d9a7f6ee202e5944d44ce30a4ffb5de170c5

El job de CI comprueba el proxy upstream, no conecta todavía Mesa al motor. Se requiere un servidor privado, adaptador de protocolo, sincronización y prioridades, y pruebas ARM64. No enviar datos de la mesa a servidores públicos.

## Pendientes
Resolución completa de Allies at Last, Avatar Aang, earthbend y demás bending, Aang's Iceberg, Avatar's Wrath, Teferi's Protection, cobertura exhaustiva de tutores/costes y elección de colores de fuentes multicolor. Las sagas siguen las reglas oficiales: al comienzo de la primera fase principal, después del paso de robo, no en el mantenimiento.

No fusionar el PR global ni desplegarlo automáticamente hasta validar los cambios.
