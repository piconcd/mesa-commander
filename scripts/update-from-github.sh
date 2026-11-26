#!/usr/bin/env bash
# Ejecutar mediante systemd a las 07:00 Europe/Madrid.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/mesa-commander-deploy.lock
flock -n 9 || exit 0

# La copia de despliegue no se usa para editar. Las ediciones van al repositorio.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "No se actualiza: hay modificaciones locales sin subir." >&2
  exit 1
fi

git fetch --quiet origin main
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
if [[ "$OLD" == "$NEW" ]]; then
  echo "Sin cambios en GitHub: $OLD"
  exit 0
fi

# Despliegue programado incondicional: puede interrumpir partidas y voz.
# No consultar /healthz: una partida activa o un motor no preparado no bloquean el despliegue.
echo "Actualización programada: se desplegará aunque haya partidas o usuarios conectados."

# La rama de producción se mantiene sin commits locales.
git merge --ff-only origin/main
if ! docker compose build commander; then
  echo "Fallo al compilar; restaurando la revisión anterior." >&2
  git reset --hard "$OLD"
  exit 1
fi
if ! docker compose up -d --no-deps commander; then
  echo "Fallo al desplegar; intentando restaurar la revisión anterior." >&2
  git reset --hard "$OLD"
  docker compose build commander && docker compose up -d --no-deps commander
  exit 1
fi
printf 'Actualizado: %s -> %s\n' "$OLD" "$NEW"
