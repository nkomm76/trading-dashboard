import type { LightColor } from "@/lib/rating";

const COLORS: Record<LightColor, string> = {
  GREEN: "bg-light-green",
  ORANGE: "bg-light-orange",
  RED: "bg-light-red",
  GREY: "bg-light-grey",
};

export const LIGHT_LABEL: Record<LightColor, string> = {
  GREEN: "Grün – alles im Rahmen",
  ORANGE: "Orange – beobachten",
  RED: "Rot – Warnsignal",
  GREY: "Grau – zu wenig Daten",
};

/** label überschreibt die Beschriftung, z. B. „Hinweis“ für graue Einträge, die keine Datenlücke sind */
export function Light({ light, size = "md", label }: { light: LightColor; size?: "md" | "lg"; label?: string }) {
  const s = size === "lg" ? "h-4 w-4" : "h-3 w-3";
  const text = label ?? LIGHT_LABEL[light];
  return <span role="img" aria-label={text} title={text} className={`inline-block shrink-0 rounded-full ${s} ${COLORS[light]}`} />;
}
