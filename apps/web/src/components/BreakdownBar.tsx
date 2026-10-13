import type { Breakdown } from "@fc/engine";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { eur, pct } from "@/lib/format";

export const SEGMENTS = [
  { key: "net", label: "Pour toi", color: "var(--chart-net)" },
  { key: "cotisations", label: "Cotisations", color: "var(--chart-cotis)" },
  { key: "impot", label: "Impôt", color: "var(--chart-impot)" },
  { key: "fraisPro", label: "Frais pro", color: "var(--chart-frais)" },
  { key: "cfp", label: "CFP", color: "var(--chart-cfp)" },
] as const;

/** Where each euro of CA goes: stacked bar (2 px gaps) + legend with values. */
export function BreakdownBar({ b }: { b: Breakdown }) {
  const total = Math.max(b.ca, 1);
  const parts = SEGMENTS.map((s) => ({ ...s, value: Math.max(0, b[s.key]) }));
  return (
    <div className="grid gap-4">
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${eur(p.value)}`).join(", ")}
      >
        {parts.map((p) =>
          p.value > 0 ? (
            <Tooltip key={p.key}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${String((p.value / total) * 100)}%`, background: p.color }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {p.label} : {eur(p.value)} ({pct(p.value / total)})
              </TooltipContent>
            </Tooltip>
          ) : null,
        )}
      </div>
      <ul className="grid gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="grid grid-cols-[12px_1fr_auto_56px] items-center gap-3">
            <span className="size-3 rounded-[4px]" style={{ background: p.color }} />
            <span>{p.label}</span>
            <span className="num font-medium">{eur(p.value)}</span>
            <span className="num text-right text-muted-foreground">{pct(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
