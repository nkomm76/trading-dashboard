import { db } from "@/lib/db";
import { getThresholds } from "@/lib/settings";
import { SettingsForm } from "@/components/settings-form";
import { RefreshButton } from "@/components/refresh-button";

export default async function SettingsPage() {
  const t = await getThresholds();
  const logs = await db.refreshLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const kiActive = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-"));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h1 className="mb-1 text-lg font-semibold">Ampel-Schwellen</h1>
        <p className="mb-4 text-sm text-muted">Gesamtfarbe = schlechtestes Einzelkriterium. Branchen-Sonderregeln für Immobilien (REITs) und Versorger bleiben aktiv.</p>
        <SettingsForm t={t} />
      </section>

      <section className="space-y-6">
        <div className="card p-5">
          <h2 className="mb-1 font-semibold">Daten aktualisieren</h2>
          <p className="mb-4 text-sm text-muted">
            Läuft automatisch jede Nacht per Cronjob. KI-Ausblick: {kiActive ? "aktiv" : "inaktiv (ANTHROPIC_API_KEY fehlt)"}.
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
