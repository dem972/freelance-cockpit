import { lazy, Suspense } from "react";
import { navigate, useRoute, type Route } from "./lib/router.js";
import { Cockpit } from "./pages/Cockpit.js";
import { Reglages } from "./pages/Reglages.js";
import { Saisie } from "./pages/Saisie.js";
import { Simulator } from "./pages/Simulator.js";

// Demo mode is a separate route and bundle, enabled by a build-time flag.
const DEMO_ENABLED = import.meta.env.VITE_DEMO !== "false";
const Demo = lazy(() => import("./pages/Demo.js"));

/** Rate tables exist for 2026 only (see packages/engine/rates). */
const YEAR = 2026;

const NAV: { route: Route; label: string }[] = [
  { route: "/cockpit", label: "Cockpit" },
  { route: "/saisie", label: "Saisie" },
  { route: "/simulateur", label: "Simulateur" },
  { route: "/reglages", label: "Réglages" },
  ...(DEMO_ENABLED ? [{ route: "/demo" as const, label: "Démo" }] : []),
];

function Page({ route }: { route: Route }) {
  switch (route) {
    case "/simulateur":
      return <Simulator />;
    case "/saisie":
      return <Saisie year={YEAR} />;
    case "/reglages":
      return <Reglages year={YEAR} />;
    case "/demo":
      return DEMO_ENABLED ? (
        <Suspense fallback={<p className="muted">Chargement…</p>}>
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
  return (
    <>
      <header className="topbar">
        <span className="brand">Finance Cockpit</span>
        <nav>
          {NAV.map((n) => (
            <a
              key={n.route}
              href={n.route}
              aria-current={route === n.route ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(n.route);
              }}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Page route={route} />
      </main>
      <footer className="disclaimer">
        Estimations indicatives, sans valeur de conseil fiscal ou comptable. Vérifie toujours avec
        les simulateurs officiels.
      </footer>
    </>
  );
}
