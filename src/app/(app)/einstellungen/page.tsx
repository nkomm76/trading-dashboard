import { db } from "@/lib/db";
import { getPortfolioSettings, getThresholds } from "@/lib/settings";
import { PortfolioRulesForm } from "@/components/portfolio-rules-form";
import { SettingsForm } from "@/components/settings-form";
import { RefreshButton } from "@/components/refresh-button";
import { eulerpoolEnabled } from "@/lib/data/eulerpool";
import { getTotp } from "@/lib/auth-store";
import { SecuritySettings } from "@/components/security-settings";

export default async function SettingsPage() {
  const t = await getThresholds();
  const rules = await getPortfolioSettings();
  const totpActive = Boolean(await getTotp());
  const logs = await db.refreshLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const kiActive = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-"));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h1 className="mb-1 text-lg font-semibold">Ampel-Schwellen</h1>
        <p className="mb-4 text-sm text-muted">Eine Ampel für Depot, Aktien Check und Watchliste. Gesamtfarbe = schlechtestes Einzelkriterium. Zahlt eine Aktie keine Dividende, entfallen Payout, Dividendenwachstum und Kürzung; eine in den letzten 2 Jahren eingestellte Dividende zählt rot. Branchen-Sonderregeln für Immobilien (REITs) und Versorger bleiben aktiv.</p>
        <SettingsForm t={t} />
      </section>

      <section className="space-y-6">
        <div id="depot" className="card scroll-mt-4 p-5">
          <h2 className="mb-1 font-semibold">Depot-Regeln</h2>
          <p className="mb-4 text-sm text-muted">Eigene Ziele für die Übersicht. Die Übersicht zeigt nur die Abweichung, sie empfiehlt nichts.</p>
          <PortfolioRulesForm s={rules} defaultMax={0.1} />
        </div>
        <div id="sicherheit" className="card scroll-mt-4 p-5">
          <h2 className="mb-1 font-semibold">Anmeldung</h2>
          <p className="mb-4 text-sm text-muted">Mit zweitem Faktor reicht ein erratenes oder abgefangenes Passwort nicht mehr. Wer das Handy verliert, schaltet den Faktor auf dem Server mit „npm run reset-2fa“ ab.</p>
          <SecuritySettings totpActive={totpActive} />
        </div>
        <div className="card p-5">
          <h2 className="mb-1 font-semibold">Daten aktualisieren</h2>
          <p className="mb-4 text-sm text-muted">
            Läuft automatisch beim Öffnen der Übersicht, wenn die Daten älter als 12 Stunden sind. KI-Ausblick: {kiActive ? "aktiv" : "inaktiv (ANTHROPIC_API_KEY fehlt)"}. Eulerpool (längere Jahreshistorie im Aktien Check): {eulerpoolEnabled() ? "aktiv" : "inaktiv (EULERPOOL_API_KEY fehlt)"}.
          </p>
          <div className="flex flex-wrap gap-3">
            <RefreshButton />
            {kiActive && <RefreshButton withOutlook />}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Letzte Läufe</h2>
          <ul className="space-y-2 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className={l.ok ? "text-light-green" : l.finishedAt ? "text-light-red" : "text-muted"}>{l.ok ? "✓" : l.finishedAt ? "!" : "…"}</span>
                <span className="tabular text-muted">{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(l.startedAt)}</span>
                <span className="whitespace-pre-wrap break-words">{l.message ?? "läuft"}</span>
              </li>
            ))}
            {logs.length === 0 && <li className="text-muted">Noch keine Läufe.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
