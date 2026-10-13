import { TriangleAlert } from "lucide-react";
import type { EngineWarning } from "@fc/engine";
import { MONTHS } from "@/lib/format";

export function Warnings({ warnings }: { warnings: EngineWarning[] }) {
  if (warnings.length === 0) return null;
  const unique = warnings.filter((w, i) => warnings.findIndex((x) => x.code === w.code) === i);
  return (
    <div role="status" className="rounded-xl bg-warning-bg p-4 text-sm text-warning-fg">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4" /> À surveiller
      </div>
      <ul className="grid gap-1.5 pl-6 [list-style:disc]">
        {unique.map((w) => (
          <li key={w.code}>
            {w.month !== undefined && <strong>{MONTHS[w.month - 1]} : </strong>}
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
