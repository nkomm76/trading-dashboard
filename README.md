# Dividenden-Dashboard

Privates, passwortgeschütztes Dashboard für das eigene Dividendendepot (Next.js, MySQL, Prisma).

- Käufe manuell erfassen (Suche per Name, ISIN oder Ticker)
- Täglich: Kurs, Dividendenrendite, Yield on Cost, Payout (EPS und FCF), Dividenden-CAGR 3/5/10 Jahre, Debt to Equity, Neuverschuldung, Ausschüttungsrhythmus, FCF, EPS
- Ampel aus festen Regeln (Schwellen unter „Einstellungen“) plus optionaler KI-Auswertung des Jahresausblicks (Claude API mit Websuche)
- **Keine Quelle → keine Anzeige:** Fehlende Werte bleiben leer; jede Zahl zeigt per Tooltip Quelle und Stichtag

Datenquellen (kostenlos): Yahoo Finance (`yahoo-finance2`), SEC EDGAR (US-Ergänzung), EZB-Referenzkurse, optional Eulerpool (Gratis-Tarif: längere Jahreshistorie und ISIN-Suche, wenn Yahoo eine ISIN nicht kennt).

## Lokal nutzen (Standard)

```bash
cd ~/KI/code/dividenden-dashboard && npm run app
```

Danach http://localhost:3000 öffnen. Beenden mit Ctrl-C im Terminal.
MySQL startet über Homebrew automatisch mit dem Mac. Sind die Daten beim Öffnen des Dashboards älter als 12 Stunden,
werden sie im Hintergrund aktualisiert; ebenso Titel der Watchliste beim Öffnen der Übersicht oder der Watchliste. Für lokales http muss in `.env` `COOKIE_SECURE="false"` stehen.

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

## Betrieb auf einem VPS (Docker)

`Dockerfile` und `docker-compose.yml` starten App, MySQL, Migrationen und eine tägliche Sicherung.
Die Datenbank ist nur intern erreichbar, die App nur auf `127.0.0.1:3000`. Schritt für Schritt: [deploy/VPS.md](deploy/VPS.md).

```bash
docker compose up -d --build
```

## Sicherheit

- Passwort (bcrypt) und optional zweiter Faktor per Authenticator-App (Einstellungen → Anmeldung)
- Sperre je IP nach Fehlversuchen, „Überall abmelden“, Notfall: `npm run reset-2fa`
- Content-Security-Policy mit Nonce, HSTS, kein Einbetten, `noindex`

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
