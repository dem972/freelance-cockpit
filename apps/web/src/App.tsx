import { useEffect, useState } from "react";
import { HealthResponse } from "@fc/shared";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((json) => {
        setState({ kind: "ok", health: HealthResponse.parse(json) });
      })
      .catch(() => {
        setState({ kind: "error" });
      });
  }, []);

  return (
    <main>
      <h1>Finance Cockpit</h1>
      <p>
        API :{" "}
        {state.kind === "loading"
          ? "…"
          : state.kind === "error"
            ? "injoignable"
            : `${state.health.status} (db ${state.health.db})`}
      </p>
      <p>
        <small>Estimations uniquement, ne constitue pas un conseil fiscal.</small>
      </p>
    </main>
  );
}
