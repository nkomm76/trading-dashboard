import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const OutlookSchema = z.object({
  found: z.boolean().describe("true nur, wenn ein Bericht zur genannten Periode gefunden wurde"),
  reportTitle: z.string(),
  status: z.enum(["RAISED", "CONFIRMED", "LOWERED", "UNKNOWN"]),
  dividendCut: z.boolean(),
  summary: z.array(z.string()).describe("3–5 Kernaussagen auf Deutsch"),
  risks: z.array(z.string()).describe("bis zu 3 Risiken auf Deutsch"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type OutlookResult = z.infer<typeof OutlookSchema> & { model: string };

export const OUTLOOK_MODEL = process.env.OUTLOOK_MODEL ?? "claude-sonnet-5-5";

const SYSTEM = `Du wertest für ein privates Dividenden-Dashboard den Ausblick börsennotierter Unternehmen aus.
Suche die offizielle Pressemitteilung, den Quartals-/Halbjahresbericht oder das Earnings-Call-Transkript zur angegebenen Berichtsperiode – bevorzugt auf der Investor-Relations-Seite des Unternehmens.
Bewerte nur die Prognose für das laufende Gesamtjahr:
- RAISED: Prognose angehoben
- CONFIRMED: Prognose bestätigt oder unverändert
- LOWERED: Prognose gesenkt, Gewinnwarnung oder Prognose zurückgezogen
- UNKNOWN: keine Prognose veröffentlicht oder keine verlässliche Quelle gefunden
dividendCut ist true, nur wenn eine Kürzung oder Aussetzung der Dividende angekündigt wurde.
Nutze ausschließlich gefundene Quellen; erfinde nichts. Findest du nichts Belastbares, setze found=false und status=UNKNOWN. Gib jede genutzte Quelle mit URL an.`;

export async function evaluateOutlook(params: { name: string; symbol: string; period: string }): Promise<OutlookResult | undefined> {
  if (!process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")) return undefined; // leer oder Platzhalter → KI aus
  const client = new Anthropic();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Unternehmen: ${params.name} (Symbol ${params.symbol}). Jüngste Berichtsperiode endet am ${params.period}. Werte den Ausblick aus diesem Bericht aus.`,
    },
  ];

  // Server-Tools können pausieren (pause_turn) – dann den Zug zurückgeben und fortsetzen.
  for (let i = 0; i < 4; i++) {
    const response = await client.beta.messages.parse({
      model: OUTLOOK_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      output_config: { format: betaZodOutputFormat(OutlookSchema), effort: "medium" },
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal" || !response.parsed_output) return undefined;
    const out = response.parsed_output;
    if (!out.found) return { ...out, status: "UNKNOWN", model: response.model };
    return { ...out, model: response.model };
  }
  return undefined;
}
