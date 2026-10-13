import { Crown, Scale } from "lucide-react";
import type { Breakdown } from "@fc/engine";
import { STATUT_LABELS, type Statut } from "@fc/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SEGMENTS } from "./BreakdownBar";

interface Props {
  results: Breakdown[];
  selected: Statut;
  onSelect: (s: Statut) => void;
}

export function StatutCompare({ results, selected, onSelect }: Props) {
  const best = Math.max(...results.map((r) => r.net));
  const scale = Math.max(...results.map((r) => r.ca), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Scale className="size-5 text-primary" /> Comparaison des statuts
        </CardTitle>
        <CardDescription>Mêmes TJM, jours et frais. Clique pour voir le détail.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {results.map((r) => {
          const active = r.statut === selected;
          return (
            <button
              key={r.statut}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onSelect(r.statut);
              }}
              className={cn(
                "grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50",
                active && "border-primary bg-accent/60 ring-1 ring-primary",
              )}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {STATUT_LABELS[r.statut]}
                {r.net === best && (
                  <Badge className="bg-primary/15 text-primary">
                    <Crown /> le plus favorable
                  </Badge>
                )}
              </span>
              <span className="num text-right font-serif text-lg font-semibold">
                {eur(r.net)}
                {r.netRange !== undefined && (
                  <span className="block font-sans text-xs font-normal text-muted-foreground">
                    {eur(r.netRange.min)} – {eur(r.netRange.max)}
                  </span>
                )}
              </span>
              <span
                className="col-span-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
                aria-hidden
              >
                {SEGMENTS.map((s) => {
                  const v = Math.max(0, r[s.key]);
                  return v > 0 ? (
                    <span
                      key={s.key}
                      className="h-full"
                      style={{ width: `${String((v / scale) * 100)}%`, background: s.color }}
                    />
                  ) : null;
                })}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
