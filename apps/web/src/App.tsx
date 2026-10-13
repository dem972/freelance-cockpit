import { navigate, useRoute, type Route } from "./lib/router.js";
import { Reglages } from "./pages/Reglages.js";
import { Saisie } from "./pages/Saisie.js";
import { Simulator } from "./pages/Simulator.js";

/** Rate tables exist for 2026 only (see packages/engine/rates). */
const YEAR = 2026;

const NAV: { route: Route; label: string }[] = [
  { route: "/cockpit", label: "Cockpit" },
  { route: "/saisie", label: "Saisie" },
  { route: "/simulateur", label: "Simulateur" },
  { route: "/reglages", label: "Réglages" },
];

function Page({ route }: { route: Route }) {
  switch (route) {
    case "/simulateur":
      return <Simulator />;
    case "/saisie":
      return <Saisie year={YEAR} />;
    case "/reglages":
      return <Reglages year={YEAR} />;
    default:
      return <p>Cockpit : jalon J5.</p>;
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
