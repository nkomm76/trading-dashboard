# Dashboard im Docker Manager von Hostinger

Der einfachste Weg: eine fertige Datei im Docker Manager einfügen. Kein SSH, kein
Git auf dem Server. Die App kommt als fertiges Image von GitHub, das bei jeder
Änderung automatisch neu gebaut wird.

## Einmalig einrichten

1. **Auf dem Mac** die fertige Datei erzeugen:

   ```bash
   cd ~/KI/code/dividenden-dashboard && npm run docker-paket
   ```

   Das Skript fragt nach der Adresse (z. B. `depot.example.de`) und ob das
   Login-Passwort vom Mac gelten soll. Es legt
   `dividenden-docker-manager.yml` auf den Schreibtisch, mit neu erzeugten
   Zugangsdaten. **Diese Datei aufheben** (z. B. im Passwortmanager), sie
   enthält das Datenbank-Passwort.

2. **DNS:** Beim Anbieter der Domain einen A-Eintrag für die Adresse auf die
   IP des VPS setzen.

3. **hPanel → VPS → Docker Manager → Projekt erstellen:** Name `dividenden`,
   als Compose-Datei den Inhalt von `dividenden-docker-manager.yml` einfügen,
   bereitstellen.

4. Nach 1–2 Minuten `https://<adresse>` öffnen, anmelden und **sofort** unter
   *Einstellungen → Anmeldung* den zweiten Faktor einrichten. Erst danach
   Käufe, Kontostand und Depot-Regeln eintragen.

## Später

- **Neue Version:** Im Docker Manager beim Projekt `dividenden` neu
  bereitstellen. Er holt dabei das neueste Image (`pull_policy: always`).
  Immer dieselbe Datei verwenden, keine neue erzeugen.
- **Sicherungen:** täglich, 14 Tage, im Docker-Volume `backups`.
- **Handy verloren (zweiten Faktor abschalten):** In der Webkonsole des VPS:

  ```bash
  docker exec dividenden-db-1 sh -c 'mysql -u dividenden -p"$MYSQL_PASSWORD" dividenden -e "DELETE FROM Setting WHERE \`key\` IN (\"totp\", \"totp-pending\")"'
  ```

  Danach geht die Anmeldung nur mit dem Passwort; den Faktor neu einrichten.

## Sicherheit

- Die Datenbank hat keinen Port nach außen und kein Internet.
- Öffentlich ist nur `https://<adresse>` über Traefik (Zertifikat von
  Let's Encrypt). Passwort, zweiter Faktor und Sperre nach Fehlversuchen
  schützen den Login.
- In der Hostinger-Firewall nur die Ports 80 und 443 (und 22, falls SSH
  genutzt wird) erlauben.
