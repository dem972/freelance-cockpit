import { Sprout } from "lucide-react";
import type { AcreSummary } from "@fc/engine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { date, eur } from "@/lib/format";

const monthName = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Acre: when it runs out and what it saves. `asOf` drives the progress bar. */
export function AcreCard({ acre, asOf }: { acre: AcreSummary; asOf: string }) {
  const start = Date.parse(`${acre.debutActivite}T00:00:00Z`);
  const end = Date.parse(`${acre.fin}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const elapsed = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  const over = now > end;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Sprout className="size-5 text-success" /> Acre
          <Badge variant={over ? "secondary" : "outline"}>{over ? "terminée" : "en cours"}</Badge>
        </CardTitle>
        <CardDescription>{acre.regle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Mois d'épuisement</p>
          <p className="font-serif text-lg font-semibold capitalize">
            {monthName.format(new Date(`${acre.moisEpuisement}-01T00:00:00Z`))}
          </p>
          <p className="text-xs text-muted-foreground">taux réduit jusqu'au {date(acre.fin)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Économie sur l'année</p>
          <p className="num font-serif text-lg font-semibold text-success">{eur(acre.economie)}</p>
          <p className="text-xs text-muted-foreground">de cotisations en moins</p>
        </div>
        <div className="grid content-start gap-2">
          <p className="text-xs text-muted-foreground">Période écoulée</p>
          <Progress value={elapsed * 100} aria-label="Période Acre écoulée" />
          <p className="text-xs text-muted-foreground">
            {Math.round(elapsed * 100)} % depuis le {date(acre.debutActivite)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
