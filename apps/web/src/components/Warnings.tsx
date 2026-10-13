import type { EngineWarning } from "@fc/engine";
import { MONTHS } from "../lib/format.js";

export function Warnings({ warnings }: { warnings: EngineWarning[] }) {
  if (warnings.length === 0) return null;
  const unique = warnings.filter((w, i) => warnings.findIndex((x) => x.code === w.code) === i);
  return (
    <ul className="warnings" role="status">
      {unique.map((w) => (
        <li key={w.code}>
          {w.month !== undefined && <strong>{MONTHS[w.month - 1]} : </strong>}
          {w.message}
        </li>
      ))}
    </ul>
  );
}
