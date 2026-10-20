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

export function Light({ light, size = "md" }: { light: LightColor; size?: "md" | "lg" }) {
  const s = size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return <span role="img" aria-label={LIGHT_LABEL[light]} title={LIGHT_LABEL[light]} className={`inline-block shrink-0 rounded-full ${s} ${COLORS[light]}`} />;
}
