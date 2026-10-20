# Dividenden-Dashboard

Privates, passwortgeschütztes Dashboard für das eigene Dividendendepot (Next.js, MySQL, Prisma).

- Käufe manuell erfassen (Suche per Name, ISIN oder Ticker)
- Täglich: Kurs, Dividendenrendite, Yield on Cost, Payout (EPS und FCF), Dividenden-CAGR 3/5/10 Jahre, Debt to Equity, Neuverschuldung, Ausschüttungsrhythmus, FCF, EPS
- Ampel aus festen Regeln (Schwellen unter „Einstellungen“) plus optionaler KI-Auswertung des Jahresausblicks (Claude API mit Websuche)
- **Keine Quelle → keine Anzeige:** Fehlende Werte bleiben leer; jede Zahl zeigt per Tooltip Quelle und Stichtag

Datenquellen (kostenlos): Yahoo Finance (`yahoo-finance2`), SEC EDGAR (US-Ergänzung), EZB-Referenzkurse.

## Lokal nutzen (Standard)

```bash
cd ~/KI/code/dividenden-dashboard && npm run app
```

Danach http://localhost:3000 öffnen. Beenden mit Ctrl-C im Terminal.
MySQL startet über Homebrew automatisch mit dem Mac. Sind die Daten beim Öffnen des Dashboards älter als 12 Stunden,
werden sie im Hintergrund aktualisiert. Für lokales http muss in `.env` `COOKIE_SECURE="false"` stehen.

## Entwicklung

```bash
brew services start mysql
npm install
npm run db:migrate
npm run set-password
npm run dev
```

Dann http://localhost:3000 öffnen. Die Umgebungsvariablen stehen in `.env` (Vorlage: `.env.example`).

Tests: `npm test`

## Optional: Deployment auf Hostinger (Cloud Agency)

1. **Datenbank:** im hPanel unter *Datenbanken → MySQL* eine Datenbank samt Benutzer anlegen.
2. **Node.js-App:** im hPanel *Websites → Node.js-App hinzufügen* → Framework „Next.js“, Node 22, Quelle: Git-Repository oder ZIP-Upload. Build-Befehl `npm run build`, Start-Befehl `npm start`.
3. **Umgebungsvariablen** in der App setzen (Werte nicht aus der lokalen `.env` kopieren, sondern neu erzeugen):
   - `DATABASE_URL` = `mysql://USER:PASSWORT@localhost:3306/DATENBANK`
   - `SESSION_PASSWORD` = Ausgabe von `openssl rand -hex 32`
   - `CRON_SECRET` = Ausgabe von `openssl rand -hex 24`
   - `ADMIN_PASSWORD_HASH_B64` = Ausgabe von `npm run set-password`
   - `SEC_USER_AGENT` = z. B. `dividenden-dashboard privat`
   - optional `ANTHROPIC_API_KEY` für den KI-Ausblick
4. **Tabellen anlegen:** einmalig `npm run db:deploy` (per SSH im App-Verzeichnis oder als Teil des Build-Befehls: `npm run db:deploy && npm run build`).
5. **HTTPS:** SSL-Zertifikat für die (Sub-)Domain im hPanel aktivieren. Das Session-Cookie wird in Produktion nur über HTTPS gesendet.
6. **Cronjob** (hPanel → *Erweitert → Cronjobs*), täglich um 23:00 Uhr:
   ```
   curl -s -H "Authorization: Bearer DEIN_CRON_SECRET" https://DEINE-DOMAIN/api/cron/refresh
   ```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/lib/data/` | Adapter für Yahoo, SEC, EZB |
| `src/lib/metrics.ts` | Kennzahlen-Berechnung (mit Tests) |
| `src/lib/rating.ts` | Ampel-Regeln und Standardschwellen |
| `src/lib/outlook.ts` | KI-Auswertung des Ausblicks |
| `src/lib/refresh.ts` | Täglicher Datenabgleich |
| `src/app/(app)/` | Dashboard, Kauf erfassen, Detailseite, Einstellungen |
| `src/app/api/cron/refresh` | Endpunkt für den Cronjob |

Die Ampel ist eine mechanische Auswertung eigener Regeln, keine Anlageberatung.
