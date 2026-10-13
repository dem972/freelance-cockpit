import { Bell, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import type { Alert, AlertSeverity } from "@fc/engine/cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

const STYLE: Record<AlertSeverity, { icon: typeof Info; box: string; label: string }> = {
  critical: {
    icon: CircleAlert,
    box: "border-destructive/30 bg-destructive/5 text-destructive",
    label: "Urgent",
  },
  warning: {
    icon: TriangleAlert,
    box: "border-warning-fg/20 bg-warning-bg text-warning-fg",
    label: "À surveiller",
  },
  info: { icon: Info, box: "border-border bg-secondary text-secondary-foreground", label: "Info" },
};

export function AlertItem({
  alert,
  onDismiss,
  onOpen,
}: {
  alert: Alert;
  onDismiss?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
}) {
  const s = STYLE[alert.severity];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", s.box)}>
      <s.icon className="mt-0.5 size-4 shrink-0" />
      <div className="grid flex-1 gap-1">
        <p className="text-sm font-semibold">{alert.title}</p>
        <p className="text-sm text-foreground/80">{alert.message}</p>
        <div className="flex gap-2 pt-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              navigate(alert.route);
              onOpen?.();
            }}
          >
            Voir
          </Button>
          {onDismiss !== undefined && (
            <Button size="xs" variant="ghost" onClick={onDismiss}>
              <X /> Ignorer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function dismissAlert(key: string) {
  return api.post(`/alerts/${encodeURIComponent(key)}/dismiss`, {});
}

/** Header bell: count of active alerts, full list in a side sheet. */
export function AlertsBell({ alerts, reload }: { alerts: Alert[]; reload: () => void }) {
  const critical = alerts.some((a) => a.severity === "critical");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={`Alertes (${String(alerts.length)})`}
        >
          <Bell />
          {alerts.length > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
                critical ? "bg-destructive" : "bg-primary",
              )}
            >
              {alerts.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Alertes</SheetTitle>
          <SheetDescription>Calculées à partir de tes données, sans IA.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4 pb-6">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tout va bien, aucune alerte.</p>
          ) : (
            alerts.map((a) => (
              <AlertItem
                key={a.key}
                alert={a}
                onDismiss={() => {
                  void dismissAlert(a.key).then(reload);
                }}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Top of the cockpit: the alerts that need attention now. */
export function AlertsStrip({ alerts, reload }: { alerts: Alert[]; reload?: () => void }) {
  const important = alerts.filter((a) => a.severity !== "info").slice(0, 3);
  if (important.length === 0) return null;
  return (
    <section className="grid gap-2" aria-label="Alertes importantes">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="size-4 text-primary" /> À traiter
        <Badge variant="secondary">{important.length}</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {important.map((a) => (
          <AlertItem
            key={a.key}
            alert={a}
            onDismiss={
              reload === undefined
                ? undefined
                : () => {
                    void dismissAlert(a.key).then(reload);
                  }
            }
          />
        ))}
      </div>
    </section>
  );
}
