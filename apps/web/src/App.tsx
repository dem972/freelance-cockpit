import { navigate, useRoute, type Route } from "./lib/router.js";
import { Simulator } from "./pages/Simulator.js";

const NAV: { route: Route; label: string }[] = [
  { route: "/simulateur", label: "Simulateur" },
  { route: "/cockpit", label: "Cockpit" },
];

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
      <main>{route === "/simulateur" ? <Simulator /> : <p>Cockpit : jalon J5.</p>}</main>
      <footer className="disclaimer">
        Estimations indicatives, sans valeur de conseil fiscal ou comptable. Vérifie toujours avec
        les simulateurs officiels.
      </footer>
    </>
  );
}
