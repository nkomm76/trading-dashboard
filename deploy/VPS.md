# Betrieb auf dem VPS mit Docker

Ziel: Die App läuft auf dem VPS in Docker. Die Datenbank ist nur im internen
Docker-Netz erreichbar, die App nur auf `127.0.0.1:3000`. Aus dem Internet ist
zunächst nur SSH offen. Den öffentlichen Zugang richtet später ein Cloudflare
Tunnel mit Cloudflare Access ein.

Geht von Ubuntu 24.04 aus (Vorlage im Hostinger-hPanel). 2 GB RAM reichen für
den Betrieb, für den Build sind 4 GB angenehmer (z. B. KVM 1 oder größer).
Platzhalter in `<SPITZEN KLAMMERN>` ersetzen.

## 1. Server absichern

Auf dem Mac einen SSH-Schlüssel anlegen, falls noch keiner existiert, und auf
den Server kopieren:

```bash
ssh-keygen -t ed25519
ssh-copy-id root@<VPS-IP>
```

Auf dem Server einen eigenen Benutzer anlegen und Updates einspielen:

```bash
adduser <NUTZER>
usermod -aG sudo <NUTZER>
rsync -a ~/.ssh /home/<NUTZER>/ && chown -R <NUTZER>:<NUTZER> /home/<NUTZER>/.ssh
apt update && apt full-upgrade -y
apt install -y ufw fail2ban unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

In einem **zweiten** Terminal prüfen, dass `ssh <NUTZER>@<VPS-IP>` mit dem
Schlüssel klappt. Erst danach Passwort- und Root-Login abschalten, sonst sperrst
du dich aus:

```bash
sudo tee /etc/ssh/sshd_config.d/99-haertung.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo systemctl restart ssh
```

Firewall: nur SSH offen.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
```

Hinweis: Docker umgeht ufw bei veröffentlichten Ports. Deshalb bindet
`docker-compose.yml` die App ausdrücklich an `127.0.0.1`. Ports dort nie auf
`0.0.0.0` ändern.

## 2. Docker installieren

Nach der offiziellen Anleitung (apt-Paketquelle von Docker, nicht das
Komfort-Skript): https://docs.docker.com/engine/install/ubuntu/

Danach den Benutzer zur Gruppe `docker` hinzufügen und neu anmelden:

```bash
sudo usermod -aG docker <NUTZER>
```

## 3. Code holen

Das Repository ist privat. Am sichersten ist ein Deploy-Key, der nur lesen darf:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dividenden_deploy -N ""
cat ~/.ssh/dividenden_deploy.pub
```

Den ausgegebenen Schlüssel in GitHub unter *Repository → Settings → Deploy
keys → Add deploy key* eintragen, ohne Schreibrecht. Dann:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-dividenden
  HostName github.com
  User git
  IdentityFile ~/.ssh/dividenden_deploy
  IdentitiesOnly yes
EOF
git clone github-dividenden:nkomm76/dividenden-dashboard.git ~/dividenden-dashboard
cd ~/dividenden-dashboard
git checkout production
```

Der Zweig `production` enthält nur Stände, die auf GitHub alle Prüfungen
bestanden haben (Tests, Lint, Docker-Build). GitHub legt ihn beim ersten grünen
Lauf auf `main` an.

## 4. Zugangsdaten (.env)

Alle Geheimnisse **neu** erzeugen, nicht von der lokalen `.env` übernehmen.

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 24   # für DB_PASSWORD
openssl rand -hex 24   # für DB_ROOT_PASSWORD
openssl rand -hex 32   # für SESSION_PASSWORD
openssl rand -hex 24   # für CRON_SECRET
nano .env
```

In `.env` eintragen: `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `SESSION_PASSWORD`,
`CRON_SECRET`, optional `ANTHROPIC_API_KEY` und `EULERPOOL_API_KEY`.
`DATABASE_URL`, `SHADOW_DATABASE_URL` und `COOKIE_SECURE` weglassen bzw. leer
lassen.

Den Passwort-Hash auf dem **Mac** erzeugen. Mit `--print` bleibt die lokale
`.env` unverändert:

```bash
cd ~/KI/code/dividenden-dashboard && npm run set-password -- --print
```

Die ausgegebene Zeile als `ADMIN_PASSWORD_HASH_B64="…"` in die `.env` auf dem
Server eintragen.

## 5. Starten

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Beim Start legt der Dienst `migrate` die Tabellen an bzw. bringt sie auf den
neuesten Stand. Danach startet die App.

## 6. Daten vom Mac übernehmen

Auf dem Mac nur die Daten sichern, ohne Tabellenstruktur und
Migrationsprotokoll. Benutzer und Datenbankname stehen in der lokalen
`DATABASE_URL`.

```bash
mysqldump -u <LOKALER_DB_NUTZER> -p --no-create-info --skip-triggers --complete-insert --ignore-table=<LOKALE_DB>._prisma_migrations <LOKALE_DB> > dividenden-daten.sql
scp dividenden-daten.sql <NUTZER>@<VPS-IP>:~/dividenden-dashboard/
```

Auf dem Server einspielen, solange die App gestoppt ist (die Tabellen sind
nach dem ersten Start noch leer):

```bash
cd ~/dividenden-dashboard
docker compose stop app
docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < dividenden-daten.sql
docker compose start app
rm dividenden-daten.sql
```

Die Datei enthält das ganze Depot. Deshalb auch auf dem Mac danach löschen.

## 7. Testen über einen SSH-Tunnel

Solange noch kein Cloudflare Tunnel eingerichtet ist, erreichst du die App nur
über SSH:

```bash
ssh -L 3000:127.0.0.1:3000 <NUTZER>@<VPS-IP>
```

Dann im Browser (Chrome) `http://localhost:3000` öffnen und anmelden. Gleich
danach unter *Einstellungen → Anmeldung* den zweiten Faktor einrichten.

Bleibt die Anmeldung über `http://localhost` nicht bestehen, vorübergehend
`COOKIE_SECURE="false"` in die `.env` schreiben und `docker compose up -d app`
ausführen. Nach dem Einrichten des Cloudflare Tunnels wieder entfernen.

## 8. Automatisch aktualisieren

Ablauf: Du pushst auf `main`. GitHub Actions prüft den Stand und setzt bei
Erfolg den Zweig `production` darauf. Der VPS schaut alle 5 Minuten nach und
startet bei einem neuen Stand mit neu gebauten Containern. GitHub hat dabei
keinen Zugang zum Server. Der VPS liest nur über den Deploy-Key.

Einrichten (einmalig, `<NUTZER>` ersetzen):

```bash
cd ~/dividenden-dashboard
sed "s/<NUTZER>/$USER/g" deploy/dividenden-deploy.service | sudo tee /etc/systemd/system/dividenden-deploy.service >/dev/null
sudo cp deploy/dividenden-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dividenden-deploy.timer
```

Prüfen:

```bash
systemctl list-timers dividenden-deploy.timer
journalctl -u dividenden-deploy -n 50
```

- **Scheitert ein Stand auf dem Server**, zum Beispiel beim Start: Das Skript
  springt auf den vorherigen Stand zurück und versucht den kaputten Stand nicht
  erneut. Der nächste Push mit einer Korrektur wird wieder normal übernommen.
- **Vorsicht bei Datenbank-Migrationen:** Ist die Migration schon gelaufen und
  scheitert erst danach der Start, passt der alte Code womöglich nicht mehr zur
  Datenbank. Dann die Korrektur pushen und nicht zurückgehen.
- **Sofort statt in bis zu 5 Minuten:** `sudo systemctl start dividenden-deploy`.

## Betrieb

| Aufgabe | Befehl (im Ordner `~/dividenden-dashboard`) |
|---|---|
| Neuen Code einspielen | automatisch (Abschnitt 8); sofort: `sudo systemctl start dividenden-deploy` |
| Automatik pausieren | `sudo systemctl stop dividenden-deploy.timer` (wieder an: `start`) |
| Protokoll ansehen | `docker compose logs -f app` |
| Neu starten | `docker compose restart app` |
| Zweiten Faktor im Notfall abschalten | `docker compose run --rm migrate npm run reset-2fa` |
| Sicherungen ansehen | `ls -lh backups/` |
| Sicherung zurückspielen | `docker compose stop app`, dann `gunzip -c backups/<DATEI>.sql.gz \| docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'`, dann `docker compose start app` |

**Sicherungen:** Der Dienst `backup` schreibt täglich eine Sicherung nach
`backups/` und behält 14 Tage. Die Sicherungen liegen unverschlüsselt auf
demselben Server. Eine verschlüsselte Kopie außerhalb des VPS (z. B. mit
restic) kommt in einem späteren Schritt. Bis dahin gelegentlich auf den Mac
holen:

```bash
scp '<NUTZER>@<VPS-IP>:~/dividenden-dashboard/backups/*' ~/KI/code/dividenden-dashboard/backups/
```

**Tägliche Aktualisierung (optional):** Die Daten werden ohnehin beim Öffnen der
Übersicht aktualisiert, wenn sie älter als 12 Stunden sind. Für einen festen
Lauf um 23 Uhr `crontab -e` öffnen und diese Zeile eintragen:

```
0 23 * * * cd ~/dividenden-dashboard && . ./.env && curl -s -m 900 -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/refresh > /dev/null
```

Mit `ANTHROPIC_API_KEY` erzeugt dieser Lauf auch den KI-Ausblick. Das kostet
etwas.

## Nächster Schritt

Cloudflare Tunnel mit Cloudflare Access. Dafür braucht es eine Domain, deren
DNS bei Cloudflare liegt. Danach ist die App öffentlich unter einer eigenen
Adresse erreichbar, aber erst nach der Anmeldung bei Cloudflare Access. Auf
dem VPS bleiben weiterhin nur SSH offen.
