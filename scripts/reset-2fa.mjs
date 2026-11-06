// Notfall: zweiten Faktor abschalten und alle Geräte abmelden (z. B. Handy verloren): npm run reset-2fa
// Danach reicht wieder das Passwort; den Faktor in den Einstellungen neu einrichten.
import "dotenv/config";
import mariadb from "mariadb";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
const conn = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  allowPublicKeyRetrieval: true,
});
try {
  await conn.query("DELETE FROM `Setting` WHERE `key` IN ('totp', 'totp-pending')");
  const [row] = await conn.query("SELECT `value` FROM `Setting` WHERE `key` = 'session-version'");
  const next = (Number(typeof row?.value === "string" ? JSON.parse(row.value) : row?.value) || 0) + 1;
  await conn.query(
    "INSERT INTO `Setting` (`key`, `value`) VALUES ('session-version', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [JSON.stringify(next)],
  );
  console.log("Zweiter Faktor ist aus, alle Geräte sind abgemeldet. Anmelden geht jetzt nur mit dem Passwort.");
} finally {
  await conn.end();
}
