import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string | undefined;
  /** Signed difference to show as a trend badge (already formatted). */
  trend?: { label: string; positive: boolean } | undefined;
  highlight?: boolean;
}

/** KPI widget: icon, label, big serif value, optional trend and sub-line. */
export function StatCard({ icon: Icon, label, value, sub, trend, highlight = false }: Props) {
  return (
    <Card
      className={cn(
        "gap-3 py-5",
        highlight && "border-primary/30 bg-gradient-to-br from-accent/70 to-card",
      )}
    >
      <CardContent className="flex flex-col gap-3 px-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              highlight
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <div className="num font-serif text-3xl font-semibold tracking-tight">{value}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {trend !== undefined && (
            <Badge
              variant="outline"
              className={cn(
                "num",
                trend.positive
                  ? "border-success/40 text-success"
                  : "border-destructive/40 text-destructive",
              )}
            >
              {trend.positive ? <TrendingUp /> : <TrendingDown />}
              {trend.label}
            </Badge>
          )}
          {sub !== undefined && <span>{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
