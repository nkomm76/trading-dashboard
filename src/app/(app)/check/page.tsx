import { StockCheck } from "@/components/stock-check";

export default function CheckPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Aktien Check</h1>
        <p className="text-sm text-muted">Schnellbewertung vor dem Kauf: ISIN eingeben und prüfen.</p>
      </div>
      <StockCheck />
    </div>
  );
}
