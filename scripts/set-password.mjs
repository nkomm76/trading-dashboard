// Setzt das Login-Passwort: npm run set-password
// Schreibt den bcrypt-Hash (Base64, damit "$" nicht als Variable gelesen wird) in .env
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";

/** Liest eine Eingabe, ohne sie anzuzeigen (je Zeichen ein "*"). */
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      console.error("Bitte in einem Terminal ausführen, damit die Eingabe verdeckt bleibt.");
      process.exit(1);
    }
    // Erst Echo abschalten, dann fragen – sonst könnte sehr schnelle Eingabe sichtbar werden
    stdin.setRawMode(true);
    stdout.write(question);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(input);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl-C
          stdin.setRawMode(false);
          stdout.write("\nAbgebrochen.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (input.length) {
            input = input.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (ch < " ") continue; // übrige Steuerzeichen ignorieren
        input += ch;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

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
