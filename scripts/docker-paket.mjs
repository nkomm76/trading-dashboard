// Erzeugt die fertige Compose-Datei für den Docker Manager von Hostinger: npm run docker-paket
// Füllt deploy/docker-manager.yml mit neu erzeugten Zugangsdaten und schreibt das Ergebnis auf den Schreibtisch.
// Login-Passwort sowie die optionalen Schlüssel für Claude und Eulerpool kommen aus der lokalen .env (nichts wird angezeigt).
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import { askHidden } from "./ask-hidden.mjs";

const out = join(homedir(), "Desktop", "dividenden-docker-manager.yml");
const force = process.argv.includes("--neu");

// Ein zweites Paket hätte ein neues Datenbank-Passwort; die bestehende Datenbank auf dem Server kennt nur das alte
if (existsSync(out) && !force) {
  console.error(`Es gibt schon ein Paket: ${out}`);
  console.error("Für den Server immer dieselbe Datei verwenden. Nur für eine komplett neue Installation: npm run docker-paket -- --neu");
  process.exit(1);
}

// Zeilenweise lesen: funktioniert im Terminal und mit umgeleiteter Eingabe
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  const r = await lines.next();
  return r.done ? "" : r.value.trim();
};
const domain = (await ask("Adresse des Dashboards (z. B. depot.example.de): ")).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const reuse = process.env.ADMIN_PASSWORD_HASH_B64 ? !/^n/i.test(await ask("Login-Passwort wie auf dem Mac verwenden? [J/n]: ")) : false;
rl.close();

if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) {
  console.error("Bitte nur die Adresse angeben, z. B. depot.example.de");
  process.exit(1);
}

let hash = reuse ? process.env.ADMIN_PASSWORD_HASH_B64 : undefined;
if (!hash) {
  const pw = await askHidden("Login-Passwort für den Server (min. 12 Zeichen): ");
  if (pw.length < 12) {
    console.error("Zu kurz – mindestens 12 Zeichen.");
    process.exit(1);
  }
  if ((await askHidden("Passwort wiederholen: ")) !== pw) {
    console.error("Die Eingaben stimmen nicht überein.");
    process.exit(1);
  }
  hash = Buffer.from(bcrypt.hashSync(pw, 12)).toString("base64");
}

const hex = (n) => randomBytes(n).toString("hex");
// In Compose ist "$" ein Platzhalterzeichen, in YAML-Anführungszeichen sind " und \ besonders
const esc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "$$$$");

const values = {
  APP_DOMAIN: domain,
  DB_PASSWORD: hex(24),
  DB_ROOT_PASSWORD: hex(24),
  SESSION_PASSWORD: hex(32),
  CRON_SECRET: hex(24),
  ADMIN_PASSWORD_HASH_B64: hash,
  SEC_USER_AGENT: process.env.SEC_USER_AGENT || "dividenden-dashboard privat",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  EULERPOOL_API_KEY: process.env.EULERPOOL_API_KEY ?? "",
};

let yml = readFileSync(new URL("../deploy/docker-manager.yml", import.meta.url), "utf8");
// Kopfkommentar der Vorlage durch einen Hinweis für die fertige Datei ersetzen
yml = yml.replace(/^(#.*\n)+\n/, `# Fertige Datei für den Docker Manager von Hostinger, erzeugt am ${new Date().toISOString().slice(0, 10)}.
# Enthält Zugangsdaten: nicht weitergeben, im Passwortmanager ablegen. Für Updates im Docker Manager dieselbe Datei verwenden.

`);
for (const [k, v] of Object.entries(values)) yml = yml.replaceAll(`__${k}__`, () => esc(v));
const left = yml.match(/__[A-Z0-9_]+__/g);
if (left) {
  console.error(`Nicht ersetzte Platzhalter: ${[...new Set(left)].join(", ")}`);
  process.exit(1);
}

writeFileSync(out, yml, { mode: 0o600 });
console.log(`
Fertig: ${out}

So geht es weiter:
1. Beim DNS-Anbieter einen A-Eintrag für ${domain} auf die IP des VPS setzen.
2. hPanel → VPS → Docker Manager → Projekt erstellen → Compose-Datei: den Inhalt dieser Datei einfügen, Name z. B. "dividenden".
3. Bereitstellen. Nach 1–2 Minuten https://${domain} öffnen, anmelden und sofort unter Einstellungen → Anmeldung den zweiten Faktor einrichten.
${values.ANTHROPIC_API_KEY ? "" : "\nHinweis: Ohne ANTHROPIC_API_KEY in der lokalen .env bleibt der KI-Ausblick aus."}`);
