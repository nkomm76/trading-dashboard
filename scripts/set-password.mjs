// Setzt das Login-Passwort: npm run set-password
// Schreibt den bcrypt-Hash (Base64, damit "$" nicht als Variable gelesen wird) in .env
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import { askHidden } from "./ask-hidden.mjs";

const pw = await askHidden("Neues Passwort (min. 12 Zeichen): ");
if (pw.length < 12) {
  console.error("Zu kurz – mindestens 12 Zeichen.");
  process.exit(1);
}
const repeat = await askHidden("Passwort wiederholen: ");
if (repeat !== pw) {
  console.error("Die Eingaben stimmen nicht überein. Nichts geändert.");
  process.exit(1);
}

const hash = Buffer.from(bcrypt.hashSync(pw, 12)).toString("base64");
// --print: nur ausgeben (z. B. für die .env auf dem VPS), die lokale .env bleibt unverändert
if (process.argv.includes("--print")) {
  console.log("ADMIN_PASSWORD_HASH_B64 für die .env auf dem Server:");
  console.log(hash);
  process.exit(0);
}
const file = ".env";
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
env = env.replace(/^ADMIN_PASSWORD_HASH_B64=.*\n?/m, "");
writeFileSync(file, env.trimEnd() + `\nADMIN_PASSWORD_HASH_B64="${hash}"\n`);
console.log("Passwort gespeichert. Für Hostinger diesen Wert als Umgebungsvariable ADMIN_PASSWORD_HASH_B64 setzen:");
console.log(hash);
console.log("Den Entwicklungsserver neu starten, damit das neue Passwort gilt.");
