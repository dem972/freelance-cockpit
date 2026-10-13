// EURL IR, EURL IS, SASU and portage salarial.
//
// Social contributions, IS and taxable amounts come from modele-social: the
// official Urssaf rules behind mon-entreprise.urssaf.fr (pure, in-memory).
// Income tax uses this engine's own sourced barème, as for Micro-BNC, so all
// statuts are taxed the same way (marginal on the household).
import rules from "modele-social";
import Engine from "publicodes";
import type { Cents, Settings, Statut, UsedRate } from "@fc/shared";
import { acreEndDate12Mois } from "./acre.js";
import { monthEnd, monthStart } from "./dates.js";
import { impotRevenu } from "./ir.js";
import { computeMicroBnc } from "./micro.js";
import { applyRate, eurosToCents, sum } from "./money.js";
import { Rates } from "./rates.js";
import { settingsAt } from "./settings.js";
import type { Breakdown, EngineWarning, MonthBreakdown, YearInput } from "./types.js";

export const MODELE_SOCIAL_VERSION = "11.1.0";
/** Publication date of modele-social 11.1.0 on npm. */
const MODELE_SOCIAL_DATE = "2026-07-16";
const MODELE_SOCIAL_URL =
  "https://mon-entreprise.urssaf.fr/int%C3%A9gration/biblioth%C3%A8que-de-calcul";

type Situation = Record<string, string>;
type RuleName = keyof typeof rules;

let engine: Engine | null = null;
function getEngine(): Engine {
  engine ??= new Engine(rules, {
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return engine;
}

/** Evaluates a rule in €/an and returns cents (0 when not applicable). */
function evalCents(situation: Situation, rule: RuleName): Cents {
  const e = getEngine();
  e.setSituation(situation);
  const value = e.evaluate({ valeur: rule, unité: "€/an" }).nodeValue;
  return typeof value === "number" ? eurosToCents(value) : (0 as Cents);
}

function firstReference(rule: RuleName): string {
  const refs = (rules[rule] as { références?: Record<string, string> } | undefined)?.références;
  const url = refs === undefined ? undefined : Object.values(refs)[0];
  return url ?? MODELE_SOCIAL_URL;
}

function msRate(key: string, rule: RuleName, value: number, note: string): UsedRate {
  return {
    key,
    year: 0,
    value,
    unit: "rate",
    source_url: firstReference(rule),
    verified_on: MODELE_SOCIAL_DATE,
    note: `${note} Valeur issue de modele-social ${MODELE_SOCIAL_VERSION} (règles Urssaf).`,
  };
}

const eurosArg = (cents: number) => `${String(Math.round(cents) / 100)} €/an`;

function baseSituation(year: number, s: Settings): Situation {
  const acre = s.acreDebutActivite !== null && s.acreDebutActivite >= `${String(year - 1)}-01-01`;
  const [y, m, d] = (acre ? (s.acreDebutActivite ?? "") : "2020-01-01").split("-");
  return {
    date: `'01/01/${String(year)}'`,
    "entreprise . date de création": `'${d ?? "01"}/${m ?? "01"}/${y ?? "2020"}'`,
    "dirigeant . exonérations . ACRE": acre ? "oui" : "non",
    "entreprise . activité . nature": "'libérale'",
    "entreprise . activité . nature . libérale . réglementée": s.caisse === "cipav" ? "oui" : "non",
    "impôt . méthode de calcul": "'barème standard'",
  };
}

interface Annual {
  cotisations: number;
  is: number;
  /** Revenu d'activité imposable au barème (après abattement de 10 % le cas échéant). */
  revenuImposable: number;
  dividendesBruts: number;
  dividendesPrelevements: number;
  /** Dividendes imposables si option pour le barème. */
  dividendesImposables: number;
  rates: UsedRate[];
  warnings: EngineWarning[];
  assumptions: string[];
}

function eurlIr(base: Situation, ca: number, charges: number): Annual {
  const s: Situation = {
    ...base,
    "entreprise . catégorie juridique": "'SARL'",
    "entreprise . associés": "'unique'",
    "entreprise . imposition": "'IR'",
    "entreprise . imposition . IR . type de bénéfices": "'BNC'",
    "entreprise . chiffre d'affaires": eurosArg(ca),
    "entreprise . charges": eurosArg(charges),
  };
  return {
    cotisations: evalCents(s, "dirigeant . rémunération . cotisations"),
    is: 0,
    // Bénéfice BNC: taxed as is, no 10 % abattement.
    revenuImposable: evalCents(s, "dirigeant . rémunération . net . imposable"),
    dividendesBruts: 0,
    dividendesPrelevements: 0,
    dividendesImposables: 0,
    rates: [],
    warnings: [],
    assumptions: [
      "EURL à l'IR : le bénéfice (CA − charges) est la rémunération du gérant, soumise aux cotisations des indépendants et à l'impôt au barème (BNC).",
    ],
  };
}

function societeIs(
  base: Situation,
  statut: "eurl_is" | "sasu",
  ca: number,
  charges: number,
  settings: Settings,
): Annual {
  const resultatAvantRemuneration = Math.max(0, ca - charges);
  const remunerationTotale = Math.round(resultatAvantRemuneration * settings.partRemuneration);
  const s: Situation = {
    ...base,
    "entreprise . catégorie juridique": statut === "sasu" ? "'SAS'" : "'SARL'",
    "entreprise . associés": "'unique'",
    "entreprise . imposition": "'IS'",
    "entreprise . chiffre d'affaires": eurosArg(ca),
    "entreprise . charges": eurosArg(charges),
    "dirigeant . rémunération . totale": eurosArg(remunerationTotale),
  };
  const cotisationsRemuneration = evalCents(s, "dirigeant . rémunération . cotisations");
  const is = evalCents(s, "entreprise . imposition . IS . montant");
  const revenuImposable = evalCents(
    s,
    "impôt . foyer fiscal . revenu imposable . revenu d'activité abattu",
  );
  // All profit left after IS is distributed.
  const dividendesBruts = Math.max(0, resultatAvantRemuneration - remunerationTotale - is);

  const div: Situation = {
    ...s,
    bénéficiaire: "oui",
    "bénéficiaire . dividendes . bruts": eurosArg(dividendesBruts),
  };
  const prelevementsTotal = evalCents(
    div,
    "bénéficiaire . dividendes . cotisations et contributions",
  );
  const dividendesImposables = evalCents(div, "bénéficiaire . dividendes . imposables");
  const tauxPrelevements = dividendesBruts > 0 ? prelevementsTotal / dividendesBruts : 0;
  const pfu = { ...div, "impôt . méthode de calcul": "'PFU'" };
  const tauxPfu =
    dividendesBruts > 0 ? evalCents(pfu, "impôt . dividendes . PFU") / dividendesBruts : 0;

  const warnings: EngineWarning[] = [];
  const assumptions = [
    `Rémunération du dirigeant : ${String(Math.round(settings.partRemuneration * 100))} % du résultat avant rémunération (coût total, cotisations comprises).`,
    "Tout le bénéfice restant après IS est distribué en dividendes ; l'impôt sur les dividendes retient l'option la plus favorable entre PFU et barème.",
  ];
  let dividendesPrelevements: number = prelevementsTotal;
  let cotisations: number = cotisationsRemuneration;

  if (statut === "eurl_is") {
    // Gérant majoritaire: dividends above 10 % of capital + comptes courants are
    // subject to independent contributions, not to the flat prélèvements sociaux.
    // modele-social computes the base but not these contributions: we compute
    // them as the extra contributions caused by adding the excess to net pay.
    const seuil = Math.round(settings.capitalEtComptesCourants / 10);
    const excedent = Math.max(0, dividendesBruts - seuil);
    if (excedent > 0) {
      const netRemuneration = remunerationTotale - cotisationsRemuneration;
      const parNet: Situation = { ...s };
      delete parNet["dirigeant . rémunération . totale"];
      parNet["dirigeant . rémunération . net"] = eurosArg(netRemuneration + excedent);
      const avecExcedent = evalCents(parNet, "dirigeant . rémunération . cotisations");
      const cotisationsExcedent = Math.max(0, avecExcedent - cotisationsRemuneration);
      cotisations += cotisationsExcedent;
      dividendesPrelevements = Math.round(Math.min(dividendesBruts, seuil) * tauxPrelevements);
      warnings.push({
        code: "estimation_dividendes_tns",
        message:
          "Dividendes au-delà de 10 % du capital et des comptes courants : soumis aux cotisations des indépendants (estimation).",
      });
      assumptions.push(
        "EURL IS : cotisations sur les dividendes excédentaires = cotisations supplémentaires d'un gérant dont le revenu net augmenterait de cet excédent.",
      );
    }
  }

  const rates: UsedRate[] = [
    msRate(
      "societe.is.taux_reduit",
      "entreprise . imposition . IS . montant",
      0.15,
      "IS au taux réduit jusqu'à 42 500 € de bénéfice.",
    ),
    msRate(
      "societe.is.taux_normal",
      "entreprise . imposition . IS . montant",
      0.25,
      "IS au taux normal au-delà.",
    ),
  ];
  if (dividendesBruts > 0) {
    rates.push(
      msRate(
        "societe.dividendes.prelevements_sociaux",
        "bénéficiaire . dividendes . cotisations et contributions",
        tauxPrelevements,
        "Prélèvements sociaux sur les dividendes (CSG, CRDS, prélèvement de solidarité).",
      ),
      msRate(
        "societe.dividendes.pfu",
        "impôt . dividendes . PFU",
        tauxPfu,
        "Prélèvement forfaitaire unique (part impôt sur le revenu).",
      ),
    );
  }
  return {
    cotisations,
    is,
    revenuImposable,
    dividendesBruts,
    dividendesPrelevements,
    dividendesImposables: dividendesImposables,
    rates,
    warnings,
    assumptions,
  };
}

function portage(base: Situation, ca: number, charges: number, fraisGestion: number): Annual {
  // Enveloppe = CA − frais de gestion − frais pro remboursés ; it is the
  // employer's total cost of the salaried consultant (cadre).
  const enveloppe = Math.max(0, ca * (1 - fraisGestion) - charges);
  const s: Situation = {
    date: base.date ?? "'01/01/2026'",
    "impôt . méthode de calcul": "'barème standard'",
    dirigeant: "non",
    "salarié . contrat . statut cadre": "oui",
    "salarié . coût total employeur": eurosArg(enveloppe),
  };
  const net = evalCents(s, "salarié . rémunération . net . à payer avant impôt");
  return {
    // Everything between the enveloppe and the net pay, plus the portage fees.
    cotisations: Math.round(enveloppe - net),
    is: 0,
    revenuImposable: evalCents(
      s,
      "impôt . foyer fiscal . revenu imposable . revenu d'activité abattu",
    ),
    dividendesBruts: 0,
    dividendesPrelevements: 0,
    dividendesImposables: 0,
    rates: [],
    warnings: [],
    assumptions: [
      "Portage : l'enveloppe (CA − frais de gestion − frais pro) est le coût employeur total d'un salarié cadre. Réserve financière et indemnité d'apport d'affaires non détaillées.",
    ],
  };
}

export type SocieteStatut = Exclude<Statut, "micro_bnc">;

/** Annual computation for a company statut. Pure (in-memory rules only). */
export function computeSociete(input: YearInput, statut: SocieteStatut): Breakdown {
  const { year } = input;
  const rates = new Rates(year);
  const debut = settingsAt(input.timeline, monthStart(year, 1));
  const fin = settingsAt(input.timeline, monthEnd(year, 12));
  const ca = sum(input.months.map((m) => m.ca));
  const fraisPro = sum(input.months.map((m) => m.fraisPro));
  const base = baseSituation(year, debut);

  const run = (
    fraisGestion: number,
    situation: Situation = base,
  ): { annual: Annual; impot: number; net: number; fraisGestionCents: number } => {
    const annual =
      statut === "eurl_ir"
        ? eurlIr(situation, ca, fraisPro)
        : statut === "portage"
          ? portage(situation, ca, fraisPro, fraisGestion)
          : societeIs(situation, statut, ca, fraisPro, debut);
    const autres = fin.autresRevenusImposables;
    const sansActivite = impotRevenu(autres, fin, rates);
    const irActivite =
      impotRevenu((autres + annual.revenuImposable) as Cents, fin, rates) - sansActivite;
    // Dividends: the cheaper of PFU and barème.
    let irDividendes = 0;
    if (annual.dividendesBruts > 0) {
      const pfu = annual.rates.find((r) => r.key === "societe.dividendes.pfu")?.value as number;
      const viaPfu = Math.round(annual.dividendesBruts * pfu);
      const viaBareme =
        impotRevenu(
          (autres + annual.revenuImposable + annual.dividendesImposables) as Cents,
          fin,
          rates,
        ) -
        sansActivite -
        irActivite;
      irDividendes = Math.min(viaPfu, viaBareme);
    }
    const fraisGestionCents = statut === "portage" ? Math.round(ca * fraisGestion) : 0;
    const impot = annual.is + irActivite + irDividendes;
    const cotisations = annual.cotisations + annual.dividendesPrelevements;
    const net = ca - fraisPro - cotisations - impot - fraisGestionCents;
    return { annual, impot, net, fraisGestionCents };
  };

  const main = run(debut.fraisGestionPortage);
  const { annual } = main;
  const cotisations = Math.round(annual.cotisations + annual.dividendesPrelevements) as Cents;
  const impot = Math.round(main.impot) as Cents;

  const warnings: EngineWarning[] = [...annual.warnings];

  // Acre (not for portage: the consultant is an employee of the portage company).
  let acre: Breakdown["acre"];
  const debutAcre = debut.acreDebutActivite;
  if (
    statut !== "portage" &&
    base["dirigeant . exonérations . ACRE"] === "oui" &&
    debutAcre !== null
  ) {
    const sansAcre = run(debut.fraisGestionPortage, {
      ...base,
      "dirigeant . exonérations . ACRE": "non",
    });
    const economie = Math.max(
      0,
      Math.round(
        sansAcre.annual.cotisations + sansAcre.annual.dividendesPrelevements - cotisations,
      ),
    ) as Cents;
    const finAcre = acreEndDate12Mois(debutAcre);
    acre = {
      debutActivite: debutAcre,
      fin: finAcre,
      moisEpuisement: finAcre.slice(0, 7),
      economie,
      regle:
        "Exonération de 12 mois, totale sous 75 % du plafond de la sécurité sociale puis dégressive jusqu'à 100 % (calcul modele-social).",
    };
    if (finAcre <= monthEnd(year, 12)) {
      warnings.push({
        code: "acre_fin",
        month: Number(finAcre.slice(5, 7)),
        message: `Fin de l'Acre le ${finAcre}.`,
      });
    }
    if (economie === 0) {
      warnings.push({
        code: "acre_fin",
        message: "Acre sans effet : revenu au-delà du plafond de l'exonération.",
      });
    }
  }
  const assumptions = [
    ...annual.assumptions,
    "Calcul annuel avec les réglages au 1er janvier (situation familiale au 31 décembre), réparti sur les mois au prorata du CA.",
    "Les cotisations comprennent la formation professionnelle ; la CFE et les frais de comptabilité sont à saisir en frais pro.",
    "Impôt sur le revenu : différence entre l'impôt du foyer avec et sans l'activité (barème de ce moteur).",
  ];
  let netRange: Breakdown["netRange"];
  if (statut === "portage") {
    const low = run(0.1);
    const high = run(0.05);
    netRange = { min: Math.round(low.net) as Cents, max: Math.round(high.net) as Cents };
    assumptions.push(
      `Fourchette portage : frais de gestion de 5 % à 10 % du CA (valeur retenue : ${String(Math.round(debut.fraisGestionPortage * 1000) / 10)} %). Ce ne sont pas des taux réglementaires : remplace-les par ceux de ton contrat.`,
    );
  }
  if (impot > 0) {
    warnings.push({
      code: "estimation_bareme",
      message: rates.usedRates().find((r) => r.key === "ir.bareme.taux.2")?.note ?? "",
    });
  }

  // Portage fees are counted with cotisations in the bar ("prélevé avant toi").
  const cotisationsAffichees = (cotisations + main.fraisGestionCents) as Cents;
  const months = spread(
    input.months,
    { cotisations: cotisationsAffichees, impot },
    ca,
    debut.tva,
    rates,
  );
  const collectee = sum(months.map((m) => m.tvaCollectee));
  const deductible = sum(months.map((m) => m.tvaDeductible));

  return {
    statut,
    year,
    ca,
    fraisPro,
    cotisations: cotisationsAffichees,
    cfp: 0 as Cents,
    impot,
    net: (ca - fraisPro - cotisationsAffichees - impot) as Cents,
    netRange,
    tva: { collectee, deductible, due: (collectee - deductible) as Cents },
    months,
    rates: [...rates.usedRates(), ...annual.rates],
    warnings,
    assumptions,
    acre,
    details: {
      remunerationImposable: Math.round(annual.revenuImposable) as Cents,
      is: Math.round(annual.is) as Cents,
      dividendesBruts: Math.round(annual.dividendesBruts) as Cents,
    },
  };
}

function spread(
  inputs: YearInput["months"],
  totals: { cotisations: Cents; impot: Cents },
  ca: number,
  tva: Settings["tva"],
  rates: Rates,
): MonthBreakdown[] {
  const tauxTva = tva === "assujetti" ? rates.rate("tva.taux_normal") : 0;
  let restCot = totals.cotisations as number;
  let restImpot = totals.impot as number;
  let restCa = ca;
  return inputs.map((m) => {
    const share = restCa > 0 ? m.ca / restCa : 0;
    const cotisations = Math.round(restCot * share);
    const impot = Math.round(restImpot * share);
    restCot -= cotisations;
    restImpot -= impot;
    restCa -= m.ca;
    return {
      month: m.month,
      ca: m.ca,
      fraisPro: m.fraisPro,
      cotisations: cotisations as Cents,
      cfp: 0 as Cents,
      impot: impot as Cents,
      tvaCollectee: applyRate(m.ca, tauxTva),
      tvaDeductible: applyRate(m.fraisPro, tauxTva),
      acre: false,
      tauxCotisations: ca > 0 ? totals.cotisations / ca : 0,
    };
  });
}

/** Any statut: Micro-BNC with the pure engine, companies with modele-social. */
export function computeStatut(input: YearInput, statut: Statut): Breakdown {
  return statut === "micro_bnc" ? computeMicroBnc(input) : computeSociete(input, statut);
}

export const STATUTS: readonly Statut[] = ["micro_bnc", "eurl_ir", "eurl_is", "sasu", "portage"];

/** Same inputs, every statut: for the comparison view. */
export function compareStatuts(input: YearInput): Breakdown[] {
  return STATUTS.map((statut) => computeStatut(input, statut));
}

export type { Breakdown, YearInput } from "./types.js";
