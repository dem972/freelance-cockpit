import { useEffect, useState } from "react";

export type Route =
  "/simulateur" | "/cockpit" | "/saisie" | "/rapports" | "/veille" | "/reglages" | "/demo";
const ROUTES: Route[] = [
  "/simulateur",
  "/cockpit",
  "/saisie",
  "/rapports",
  "/veille",
  "/reglages",
  "/demo",
];

function current(): Route {
  const path = window.location.pathname;
  return ROUTES.find((r) => path.startsWith(r)) ?? "/cockpit";
}

export function navigate(route: Route) {
  window.history.pushState(null, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onPop = () => {
      setRoute(current());
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return route;
}
