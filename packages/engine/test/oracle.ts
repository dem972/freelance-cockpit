// Reference oracle: URSSAF's own rules (modele-social, the engine behind
// mon-entreprise.urssaf.fr). Dev-only; never imported by src/.
import rules from "modele-social";
import Engine from "publicodes";

const engine = new Engine(rules, {
  logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
});

export const ORACLE_VERSION = "modele-social@11.1.0";

export type Situation = Record<string, string | number>;

export function evaluate(situation: Situation, rule: string): number {
  engine.setSituation(situation);
  const value = engine.evaluate({ valeur: rule, unité: "€/an" }).nodeValue;
  return typeof value === "number" ? value : 0;
}

export interface MicroCase {
  ca: number;
  cipav?: boolean;
  vl?: boolean;
  foyer?: "seul" | "couple" | "couple+1" | "couple+2";
}

export function microSituation(c: MicroCase): Situation {
  const foyer = c.foyer ?? "seul";
  return {
    date: "'01/06/2026'",
    "entreprise . date de création": "'01/01/2020'",
    "entreprise . catégorie juridique": "'EI'",
    "entreprise . catégorie juridique . EI . auto-entrepreneur": "oui",
    "entreprise . activité . nature": "'libérale'",
    "entreprise . activité . nature . libérale . réglementée": c.cipav === true ? "oui" : "non",
    "entreprise . chiffre d'affaires": `${String(c.ca)} €/an`,
    "dirigeant . auto-entrepreneur . impôt . versement libératoire": c.vl === true ? "oui" : "non",
    "impôt . méthode de calcul": "'barème standard'",
    "impôt . foyer fiscal . situation de famille": foyer === "seul" ? "'célibataire'" : "'couple'",
    "impôt . foyer fiscal . enfants à charge":
      foyer === "couple+1" ? 1 : foyer === "couple+2" ? 2 : 0,
  };
}
