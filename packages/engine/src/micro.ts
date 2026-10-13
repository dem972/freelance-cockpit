import type { Cents, Settings } from "@fc/shared";
import { acreActiveInMonth } from "./acre.js";
import { monthEnd, monthStart } from "./dates.js";
import { impotRevenu } from "./ir.js";
import { applyRate, sum } from "./money.js";
import { Rates } from "./rates.js";
import { settingsAt } from "./settings.js";
import type { Breakdown, EngineWarning, MonthBreakdown, YearInput } from "./types.js";

export const MICRO_ASSUMPTIONS = [
  "Les réglages en vigueur le 1er du mois s'appliquent à tout le mois.",
  "Cotisations, CFP et VFL sont calculés sur le CA HT encaissé du mois, sans minimum (0 € encaissé = 0 € dû).",
  "Les frais professionnels ne sont pas déductibles en micro : ils réduisent seulement ce qui reste pour toi.",
  "TVA (si assujetti) : taux normal sur tout le CA ; frais saisis HT, avec TVA récupérable au taux normal.",
  "Impôt sans VFL : différence entre l'impôt du foyer avec et sans le revenu micro (abattement 34 %, minimum 305 €), réparti au prorata du CA.",
  "Avec VFL, le revenu micro abattu entre dans le taux effectif d'imposition des autres revenus du foyer.",
  "Situation familiale et parts : celles en vigueur au 31 décembre.",
  "Calcul en centimes sans arrondi intermédiaire à l'euro : écart possible de quelques euros avec impots.gouv.",
];

function abattement(ca: Cents, rates: Rates): Cents {
  const forfait = applyRate(ca, rates.rate("micro.abattement.bnc"));
  return Math.min(ca, Math.max(forfait, rates.cents("micro.abattement.minimum"))) as Cents;
}

function tauxCotisations(s: Settings, year: number, month: number, rates: Rates) {
  const caisse = s.caisse;
  const debut = s.acreDebutActivite;
  if (debut !== null && acreActiveInMonth(debut, year, month)) {
    const periode =
      debut < rates.date("micro.acre.date_bascule") ? "debut_avant_bascule" : "debut_apres_bascule";
    return { taux: rates.rate(`micro.acre.bnc.${caisse}.${periode}`), acre: true };
  }
  return { taux: rates.rate(`micro.cotisations.bnc.${caisse}`), acre: false };
}

/** Full-year Micro-BNC computation over a settings timeline. Pure. */
export function computeMicroBnc(input: YearInput): Breakdown {
  const { year } = input;
  const rates = new Rates(year);
  const warnings: EngineWarning[] = [];
  const seuilMajore = rates.cents("tva.franchise.seuil_majore.services");
  const tauxTva = rates.rate("tva.taux_normal");

  let cumulCa = 0;
  const tvaState = { franchisePerdue: false };
  let caAvecVl = 0;
  let caSansVl = 0;
  let previousVl: boolean | null = null;

  const months: MonthBreakdown[] = input.months.map(({ month, ca, fraisPro }) => {
    const s = settingsAt(input.timeline, monthStart(year, month));
    if (s.statut !== "micro_bnc") {
      warnings.push({
        code: "statut_non_micro",
        month,
        message: `Statut ${s.statut} en vigueur : ce mois est calculé comme en micro-BNC.`,
      });
    }
    const { taux, acre } = tauxCotisations(s, year, month, rates);
    const cotisations = applyRate(ca, taux);
    const cfp = applyRate(ca, rates.rate("micro.cfp.liberal"));

    if (previousVl !== null && previousVl !== s.versementLiberatoire) {
      warnings.push({
        code: "vl_changement_en_cours_annee",
        month,
        message: "L'option pour le VFL ne prend normalement effet qu'au 1er janvier.",
      });
    }
    previousVl = s.versementLiberatoire;
    const impot = s.versementLiberatoire ? applyRate(ca, rates.rate("micro.vl.bnc")) : (0 as Cents);
    if (s.versementLiberatoire) caAvecVl += ca;
    else caSansVl += ca;

    // TVA: either opted in, or franchise lost when crossing the seuil majoré
    // (TVA due from the first day of crossing: only the excess in that month).
    const avant = cumulCa;
    cumulCa += ca;
    let caTaxable = 0;
    if (s.tva === "assujetti" || tvaState.franchisePerdue) {
      caTaxable = ca;
    } else if (cumulCa > seuilMajore) {
      caTaxable = cumulCa - Math.max(avant, seuilMajore);
      tvaState.franchisePerdue = true;
      warnings.push({
        code: "tva_seuil_majore_depasse",
        month,
        message: "Seuil majoré de franchise de TVA dépassé : TVA due dès le jour du dépassement.",
      });
    }
    const assujetti = s.tva === "assujetti" || tvaState.franchisePerdue;

    return {
      month,
      ca,
      fraisPro,
      cotisations,
      cfp,
      impot,
      tvaCollectee: applyRate(caTaxable as Cents, tauxTva),
      tvaDeductible: assujetti ? applyRate(fraisPro, tauxTva) : (0 as Cents),
      acre,
      tauxCotisations: taux,
    };
  });

  // Annual income tax (settings at year end).
  const fin = settingsAt(input.timeline, monthEnd(year, 12));
  const autres = fin.autresRevenusImposables;
  const revSansVl = caSansVl - abattement(caSansVl as Cents, rates);
  const revAvecVl = caAvecVl - abattement(caAvecVl as Cents, rates);
  const base = autres + revSansVl;
  const impotAvecTauxEffectif =
    base > 0
      ? (impotRevenu((base + revAvecVl) as Cents, fin, rates) * base) / (base + revAvecVl)
      : 0;
  const impotHorsMicro = impotRevenu(autres, fin, rates);
  const impotBareme = Math.max(0, Math.round(impotAvecTauxEffectif - impotHorsMicro));

  // Spread the barème part over the months without VFL, pro rata of CA.
  let reste = impotBareme;
  let caRestant = caSansVl;
  for (const m of months) {
    const vl = settingsAt(input.timeline, monthStart(year, m.month)).versementLiberatoire;
    if (vl || caRestant <= 0) continue;
    const part = Math.round((reste * m.ca) / caRestant);
    m.impot = (m.impot + part) as Cents;
    reste -= part;
    caRestant -= m.ca;
  }

  const ca = sum(months.map((m) => m.ca));
  if (ca > rates.cents("micro.plafond_ca.bnc")) {
    warnings.push({
      code: "plafond_micro_depasse",
      message:
        "Plafond de CA micro dépassé. Deux années consécutives au-dessus : sortie du régime micro.",
    });
  }
  if (
    !tvaState.franchisePerdue &&
    fin.tva === "franchise" &&
    ca > rates.cents("tva.franchise.seuil.services")
  ) {
    warnings.push({
      code: "tva_seuil_depasse",
      message: "Seuil de franchise de TVA dépassé sur l'année : TVA due au 1er janvier suivant.",
    });
  }
  if (
    caAvecVl > 0 &&
    input.rfrNMoins2 !== undefined &&
    input.rfrNMoins2 > rates.cents("micro.vl.plafond_rfr_par_part") * fin.parts
  ) {
    warnings.push({
      code: "vl_rfr_trop_eleve",
      message: "Revenu fiscal de référence N-2 au-dessus du plafond : le VFL n'est pas accessible.",
    });
  }
  if (impotBareme > 0) {
    warnings.push({
      code: "estimation_bareme",
      message: rates.usedRates().find((r) => r.key === "ir.bareme.taux.2")?.note ?? "",
    });
  }

  const cotisations = sum(months.map((m) => m.cotisations));
  const cfp = sum(months.map((m) => m.cfp));
  const impot = sum(months.map((m) => m.impot));
  const fraisPro = sum(months.map((m) => m.fraisPro));
  const collectee = sum(months.map((m) => m.tvaCollectee));
  const deductible = sum(months.map((m) => m.tvaDeductible));

  return {
    statut: "micro_bnc",
    year,
    ca,
    fraisPro,
    cotisations,
    cfp,
    impot,
    net: (ca - fraisPro - cotisations - cfp - impot) as Cents,
    tva: { collectee, deductible, due: (collectee - deductible) as Cents },
    months,
    rates: rates.usedRates(),
    warnings,
    assumptions: MICRO_ASSUMPTIONS,
  };
}
