# Estado real del motor de reglas

Mesa Commander conserva el motor JavaScript en Chromium, el contenedor único,
la voz WebRTC y el despliegue incondicional de las 07:00 Europe/Madrid.
La integración experimental XMage no se activa; no se incorpora Java.

## Datos actualizables
Node consulta en el arranque y diariamente a partir de las 07:00:
- Scryfall Oracle Cards (bulk-data), por streaming, con catálogo compacto en
  /data/rules/oracle.json.
- Wizards Comprehensive Rules: enlace TXT oficial, contenido y hash en
  /data/rules/comprehensive.json.

Si falla la descarga se conserva el fichero válido anterior. No se envían
mazos al proveedor para esta actualización, no se descarga código ejecutable
y no se bloquea el arranque ni el despliegue por esta tarea.
Antes de empezar una partida central se refrescan las definiciones de los
mazos seleccionados, incluidas las de bots, con el catálogo disponible.
Las imágenes existentes se conservan. Si no hay catálogo se usan los datos
existentes. La auditoría notifica avisos de cobertura a los jugadores
correspondientes. No constituye una certificación de reglas ni de legalidad.
Las reglas oficiales descargadas son documentación: no se convierten
automáticamente en código ejecutable.

## Automatización
Se amplía el intérprete del motor central para frases completas opcionales
de robo y ganancia de vidas, con diálogo individual para humanos y heurística
para bots. Se fuerza la asistencia de efectos soportados en partidas
centrales, se corrige el registro de ganancia de vida prohibida y se
cancelan contadores +1/+1 y -1/-1 durante la comprobación de estado.

## Límites
La cobertura sigue siendo parcial. Entre otros pendientes: pila completa
de disparadas y APNAP, selección de objetivos y costes antes del lanzamiento,
capas y dependencias, orden y elección de reemplazos, reglas completas de
Commander y Avatar. No existe intérprete universal de Forge ni garantía de
soporte de nuevas mecánicas. Los avisos no bloquean la partida.
El temporizador y el actualizador de GitHub siguen intactos; una partida
activa no impide el despliegue programado.

Pruebas: node --test tests/*.test.mjs. Se añaden pruebas del parser de
catálogo, alias, horario Madrid, efectos opcionales y contadores.
Quedan por verificar descargas reales, partidas multijugador y ARM64.
Las notas anteriores de XMage describen un diseño experimental descartado.
