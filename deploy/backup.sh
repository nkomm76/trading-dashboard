#!/bin/sh
# Tägliche Sicherung der Datenbank nach /backups, ältere als KEEP_DAYS Tage entfallen.
# Läuft im Container "backup" (docker-compose.yml). Kopie außer Haus und Verschlüsselung: siehe deploy/VPS.md
set -eu
KEEP_DAYS="${KEEP_DAYS:-14}"
while true; do
  file="/backups/dividenden-$(date +%F).sql.gz"
  if mysqldump -h db -u "$DB_USER" --single-transaction --no-tablespaces "$DB_NAME" | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "Sicherung geschrieben: $file"
  else
    echo "Sicherung fehlgeschlagen" >&2
  fi
  find /backups -name 'dividenden-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
