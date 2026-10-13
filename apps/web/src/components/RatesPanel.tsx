import { useState } from "react";
import { BookCheck, ExternalLink, ShieldAlert } from "lucide-react";
import type { UsedRate } from "@fc/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { date, eur, pct } from "@/lib/format";

function formatValue(r: UsedRate) {
  if (r.unit === "rate") return pct(r.value as number);
  if (r.unit === "eur") return eur((r.value as number) * 100);
  return date(r.value as string);
}

const PREVIEW = 6;

export function RatesPanel({ rates }: { rates: UsedRate[] }) {
  const [all, setAll] = useState(false);
  // Flagged values first: they need attention.
  const sorted = [...rates].sort(
    (a, b) => Number(b.flag !== undefined) - Number(a.flag !== undefined),
  );
  const shown = all ? sorted : sorted.slice(0, PREVIEW);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <BookCheck className="size-5 text-primary" /> Taux et seuils utilisés
        </CardTitle>
        <CardDescription>
          Chaque valeur vient d'une source officielle, vérifiée à la date indiquée.
        </CardDescription>
        {rates.length > PREVIEW && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAll(!all);
              }}
            >
              {all ? "Réduire" : `Tout voir (${String(rates.length)})`}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <li
              key={r.key}
              className="flex flex-col gap-1.5 rounded-xl border bg-background/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="num font-serif text-lg font-semibold">{formatValue(r)}</span>
                {r.flag !== undefined && (
                  <Badge variant="destructive">
                    <ShieldAlert />
                    {r.flag === "conflict" ? "sources divergentes" : "non vérifié"}
                  </Badge>
                )}
              </div>
              <code className="text-[11px] break-all text-muted-foreground">{r.key}</code>
              {r.note !== undefined && <p className="text-xs leading-relaxed">{r.note}</p>}
              <a
                href={r.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {new URL(r.source_url).hostname}
                <ExternalLink className="size-3" />
                <span className="text-muted-foreground">· vérifié le {date(r.verified_on)}</span>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
