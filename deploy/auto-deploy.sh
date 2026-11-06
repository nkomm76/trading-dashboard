#!/bin/sh
# Holt neue freigegebene Stände ab: GitHub setzt den Zweig "production" erst nach grünen Tests
# und erfolgreichem Docker-Build. Läuft alle 5 Minuten per systemd-Timer (deploy/dividenden-deploy.timer).
# Von Hand: sh deploy/auto-deploy.sh
set -eu

# Das Update ersetzt auch diese Datei; deshalb aus einer Kopie laufen, damit die Shell nicht mitten im Skript neue Zeilen liest
if [ -z "${DEPLOY_REPO:-}" ]; then
  DEPLOY_REPO=$(cd "$(dirname "$0")/.." && pwd)
  copy=$(mktemp)
  cp "$0" "$copy"
  DEPLOY_REPO="$DEPLOY_REPO" exec sh "$copy"
fi
trap 'rm -f "$0"' EXIT
cd "$DEPLOY_REPO"

# Nie zwei Läufe gleichzeitig
exec 9>"/tmp/dividenden-deploy.lock"
flock -n 9 || { echo "Läuft bereits."; exit 0; }

git fetch --quiet origin production
current=$(git rev-parse HEAD)
target=$(git rev-parse origin/production)
[ "$current" = "$target" ] && exit 0
# Ein Stand, der hier schon einmal gescheitert ist, wird nicht alle 5 Minuten neu versucht
if [ "$target" = "$(cat .deploy-failed 2>/dev/null || true)" ]; then
  exit 0
fi

echo "Neuer Stand: $(git log -1 --format='%h %s' "$target")"
# Nur versionierte Dateien werden ersetzt; .env und backups/ sind nicht im Git und bleiben unverändert
git checkout --quiet -B production "$target"
# Baut zuerst die neuen Images; schlägt das fehl, laufen die alten Container weiter
if docker compose up -d --build --remove-orphans; then
  rm -f .deploy-failed
  docker image prune -f > /dev/null
  echo "Aktualisiert auf $(git rev-parse --short HEAD)."
else
  echo "Aktualisierung auf $(git rev-parse --short "$target") fehlgeschlagen, zurück auf $(git rev-parse --short "$current")." >&2
  echo "$target" > .deploy-failed
  git checkout --quiet -B production "$current"
  docker compose up -d --build --remove-orphans || true
  exit 1
fi
