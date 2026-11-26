# XMage en el contenedor único de Mesa Commander

Decisión de despliegue: todos los cambios se integran en main. La Raspberry conserva
el servicio Compose commander, el nombre mesa-commander, el puerto 3000 y
el volumen commander_data:/data. No crear un servicio Docker XMage ni Nexus,
ni una segunda instancia de Mesa Commander. Caddy y TURN existentes no cambian.

## Estado real

El motor JavaScript sigue siendo autoritativo. Este primer paso añade un cliente
de comprobación del protocolo Nexus fijado en docs/migration-status.md. No arranca
Java, no importa cartas ni modifica partidas. No está conectado al flujo de juego.
No se considera una migración operativa.

## Arquitectura objetivo

- Node.js, XMage Server y Mage.Proxy deben ejecutarse en el mismo contenedor,
  bajo un usuario no root, con un supervisor que controle procesos y señales.
- XMage y Nexus escuchan únicamente en loopback (17171 y 8787; HTTP del proxy
  también privado). Ningún puerto Java se publica en Compose o Caddy.
- Compilar ambos componentes contra la misma revisión compatible; comprobar
  ARM64, memoria y almacenamiento antes de modificar la imagen productiva.
- Mantener /data y su persistencia; no migrar partidas activas entre motores.
- Una sesión Nexus por jugador autenticado, vistas privadas por asiento y
  credenciales exclusivamente del servidor. Prohibido reenviar el estado de
  todos los jugadores al mismo cliente.
- XMage será la única autoridad de reglas cuando estén completas las pruebas
  de aceptación. No usar el motor legado como fallback en una partida XMage.

## Primera comprobación real (cuando Java esté instalado)

Con un servidor XMage y Mage.Proxy privados ya arrancados dentro del contenedor,
usar una cuenta de prueba dedicada, nunca una cuenta de un jugador. Definir las
variables XMAGE_PROBE_USER y XMAGE_PROBE_PASSWORD por un mecanismo seguro y ejecutar
`node scripts/probe-xmage.mjs` desde el directorio de la aplicación.
El script comprueba handshake, ping, autenticación, información del servidor y
consulta tipos de juego, mazo y jugador. No crea partidas ni imprime credenciales.
Un éxito solo prueba conectividad, no compatibilidad de Commander.

Pruebas unitarias: `node --test tests/xmage-probe.test.mjs`.
El workflow existente ejecuta tests/*.test.mjs; el proxy upstream se valida
por separado. Falta verificar una sesión real con el servidor fijado.

## Condiciones para activar XMage

Validar importación de mazos (incluido comandante explícito), juego de cuatro
jugadores, bots, decisiones, costes, prioridad, reconexiones, privacidad y cartas
de Avatar. Medir RAM y arranque en Raspberry. El actualizador de main se ejecuta
a las 07:00 y reconstruye el servicio existente: no activar un motor incompleto.
Una actualización de imagen puede recrear el contenedor con el mismo nombre y
volumen, pero no debe dejar una segunda instancia ni alterar los otros servicios.
