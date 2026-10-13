// Deterministic optimizer: replays the year with one change at a time and
// ranks the outcomes by net. No AI, no advice: it shows what each lever does.
import type { Cents, Settings, Statut } from "@fc/shared";
import { monthStart } from "./dates.js";
import { settingsAt } from "./settings.js";
import { computeStatut } from "./societe.js";
import type { Breakdown, YearInput } from "./types.js";

export interface OptimizationOption {
  id: string;
  title: string;
  /** What would change, applied from 1 January. */
  change: Partial<Settings>;
  statut: Statut;
  net: Cents;
  netRange?: { min: Cents; max: Cents } | undefined;
  /** net − baseline net. */
  gain: Cents;
  cotisations: Cents;
  impot: Cents;
  /** Points of attention coming from the engine (thresholds, estimates). */
  warnings: string[];
}

export interface OptimizationResult {
  year: number;
  baseline: OptimizationOption;
  /** Sorted by gain, best first; the baseline is not repeated. */
  options: OptimizationOption[];
  /** For EURL IS and SASU: net for each share of pay (0 … 1). */
  remunerationCurves: Record<"eurl_is" | "sasu", { part: number; net: Cents }[]>;
  disclaimer: string;
}

const LABELS: Record<Statut, string> = {
  micro_bnc: "Micro-entreprise (BNC)",
  eurl_ir: "EURL à l'IR",
  eurl_is: "EURL à l'IS",
  sasu: "SASU",
  portage: "Portage salarial",
};

function run(input: YearInput, change: Partial<Settings>): Breakdown {
  const year = input.year;
  const base = settingsAt(input.timeline, monthStart(year, 1));
  const settings = { ...base, ...change };
  // The whole year as if the change had been in place since 1 January.
  const timeline = [{ validFrom: `${String(year)}-01-01`, settings }];
  return computeStatut({ ...input, timeline }, settings.statut);
}

function option(
  id: string,
  title: string,
  change: Partial<Settings>,
  b: Breakdown,
  baseNet: number,
) {
  return {
    id,
    title,
    change,
    statut: b.statut,
    net: b.net,
    netRange: b.netRange,
    gain: (b.net - baseNet) as Cents,
    cotisations: b.cotisations,
    impot: b.impot,
    // The provisional barème applies to every option alike: said once in the disclaimer.
    warnings: [
      ...new Set(b.warnings.filter((w) => w.code !== "estimation_bareme").map((w) => w.message)),
    ],
  } satisfies OptimizationOption;
}

/** Grid step for the pay / dividends share. */
const PARTS = Array.from({ length: 11 }, (_, i) => i / 10);

export function optimize(input: YearInput): OptimizationResult {
  const current = settingsAt(input.timeline, monthStart(input.year, 1));
  const baseB = run(input, {});
  const baseline = option(
    "actuel",
    `Situation actuelle (${LABELS[current.statut]})`,
    {},
    baseB,
    baseB.net,
  );
  const options: OptimizationOption[] = [];

  // 1. Other statuts, keeping the other settings.
  for (const statut of Object.keys(LABELS) as Statut[]) {
    if (statut === current.statut) continue;
    options.push(
      option(`statut-${statut}`, LABELS[statut], { statut }, run(input, { statut }), baseB.net),
    );
  }

  // 2. Share of pay vs dividends for companies at the IS.
  const remunerationCurves = { eurl_is: [], sasu: [] } as OptimizationResult["remunerationCurves"];
  for (const statut of ["eurl_is", "sasu"] as const) {
    let best: { part: number; b: Breakdown } | null = null;
    for (const part of PARTS) {
      const b = run(input, { statut, partRemuneration: part });
      remunerationCurves[statut].push({ part, net: b.net });
      if (best === null || b.net > best.b.net) best = { part, b };
    }
    if (best !== null) {
      options.push(
        option(
          `${statut}-part-${String(best.part)}`,
          `${LABELS[statut]}, ${String(Math.round(best.part * 100))} % en rémunération`,
          { statut, partRemuneration: best.part },
          best.b,
          baseB.net,
        ),
      );
    }
  }

  // 3. Versement libératoire (micro only).
  if (current.statut === "micro_bnc") {
    const vl = !current.versementLiberatoire;
    options.push(
      option(
        `vl-${String(vl)}`,
        vl ? "Opter pour le versement libératoire" : "Sortir du versement libératoire",
        { versementLiberatoire: vl },
        run(input, { versementLiberatoire: vl }),
        baseB.net,
      ),
    );
  }

  // Keep one option per (statut, change) and drop the exact baseline.
  const seen = new Set<string>();
  const unique = options.filter((o) => {
    const k = JSON.stringify(o.change);
    if (seen.has(k) || k === "{}") return false;
    seen.add(k);
    return true;
  });

  return {
    year: input.year,
    baseline,
    options: unique.sort((a, b) => b.gain - a.gain),
    remunerationCurves,
    disclaimer:
      "Comparaison chiffrée par le moteur, à situation identique (même CA, mêmes frais, même foyer). Un changement de statut a d'autres conséquences (protection sociale, retraite, formalités, coûts de gestion) : ce n'est pas un conseil, à valider avec un expert-comptable. Impôt calculé avec le barème 2026 (revenus 2025), provisoire pour les revenus 2026.",
  };
}
