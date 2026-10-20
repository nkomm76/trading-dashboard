import type { Sourced } from "@/lib/data/types";
import { sourceHint } from "@/lib/format";

/** Zeigt einen Wert nur, wenn eine Quelle vorliegt; Herkunft als Tooltip. */
export function Value<T>({ s, format, className = "" }: { s: Sourced<T> | undefined; format: (v: T) => string; className?: string }) {
  if (!s) return <span className="text-muted" title="Keine Quelle verfügbar">–</span>;
  return (
    <span title={sourceHint(s)} className={`tabular ${className}`}>
      {format(s.value)}
      {s.period && s.period !== "TTM" && s.period !== "Quartal" && <sup className="ml-0.5 text-[10px] text-muted">{s.period}</sup>}
    </span>
  );
}
