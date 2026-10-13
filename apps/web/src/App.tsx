import { lazy, Suspense } from "react";
import type { Alert } from "@fc/engine/cockpit";
import { AlertsBell } from "@/components/alerts";
import { DEMO, OUTILS, PILOTAGE, AppSidebar } from "@/components/app-sidebar";
import { CopilotButton } from "@/components/copilot";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApi } from "@/lib/api";
import { useRoute, type Route } from "@/lib/router";
import { useTheme } from "@/lib/theme";
import { Cockpit } from "@/pages/Cockpit";
import { Rapports } from "@/pages/Rapports";
import { Reglages } from "@/pages/Reglages";
import { Saisie } from "@/pages/Saisie";
import { Simulator } from "@/pages/Simulator";

// Demo mode is a separate route and bundle, enabled by a build-time flag.
const DEMO_ENABLED = import.meta.env.VITE_DEMO !== "false";
const Demo = lazy(() => import("@/pages/Demo"));

/** Rate tables exist for 2026 only (see packages/engine/rates). */
const YEAR = 2026;

function Page({ route }: { route: Route }) {
  switch (route) {
    case "/simulateur":
      return <Simulator />;
    case "/saisie":
      return <Saisie year={YEAR} />;
    case "/rapports":
      return <Rapports year={YEAR} />;
    case "/reglages":
      return <Reglages year={YEAR} />;
    case "/demo":
      return DEMO_ENABLED ? (
        <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}>
          <Demo />
        </Suspense>
      ) : (
        <Cockpit year={YEAR} />
      );
    default:
      return <Cockpit year={YEAR} />;
  }
}

export function App() {
  const route = useRoute();
  const { theme, setTheme } = useTheme();
  const item = [...PILOTAGE, ...OUTILS, DEMO].find((n) => n.route === route) ?? PILOTAGE[0];
  // Refetched on every page change, so saving data elsewhere refreshes the count.
  const alerts = useApi<Alert[]>(`/alerts?year=${String(YEAR)}&r=${route}`);
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <AppSidebar route={route} demo={DEMO_ENABLED} theme={theme} onTheme={setTheme} />
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" aria-label="Afficher ou masquer le menu" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <span className="text-sm font-medium">{item?.label}</span>
            <span className="ml-auto hidden text-xs text-muted-foreground md:inline">
              Estimations indicatives, sans valeur de conseil fiscal
            </span>
            <div className="ml-auto flex items-center gap-2 md:ml-2">
              <AlertsBell alerts={alerts.data ?? []} reload={alerts.reload} />
              <CopilotButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
            <Page route={route} />
          </main>
          <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-xs text-muted-foreground md:px-6">
            Estimations indicatives, sans valeur de conseil fiscal ou comptable. Vérifie toujours
            avec les simulateurs officiels.
          </footer>
        </SidebarInset>
      </SidebarProvider>
      <Toaster theme={theme} richColors closeButton />
    </TooltipProvider>
  );
}
