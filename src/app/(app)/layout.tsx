import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { logout } from "../actions";
import { countOpenSuggestions } from "@/lib/dividend-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const openDividends = await countOpenSuggestions();
  return (
    <>
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/" className="mr-auto font-semibold">
            Dividenden-Dashboard
          </Link>
          <Link href="/" className="hover:text-accent">Übersicht</Link>
          <Link href="/kauf" className="hover:text-accent">Kauf / Verkauf</Link>
          <Link href="/dividenden" className="hover:text-accent">
            Dividenden
            {openDividends > 0 && (
              <span className="ml-1 rounded-full bg-light-orange px-1.5 text-xs font-medium text-white" title="Offene Zahlungen zum Bestätigen">
                {openDividends}
              </span>
            )}
          </Link>
          <Link href="/archiv" className="hover:text-accent">Archiv</Link>
          <Link href="/einstellungen" className="hover:text-accent">Einstellungen</Link>
          <form action={logout}>
            <button className="text-muted hover:text-foreground">Abmelden</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
