import { z } from "zod";
import { Cents } from "./money.js";

export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

export const Statut = z.enum(["micro_bnc", "eurl_ir", "eurl_is", "sasu", "portage"]);
export type Statut = z.infer<typeof Statut>;

export const STATUT_LABELS: Record<Statut, string> = {
  micro_bnc: "Micro-entreprise (BNC)",
  eurl_ir: "EURL à l'IR",
  eurl_is: "EURL à l'IS",
  sasu: "SASU",
  portage: "Portage salarial",
};

/**
 * User settings. Each one can change during the year: they are stored as a
 * timeline of dated patches (see SettingsTimeline), never as a single config.
 */
export const Settings = z.object({
  statut: Statut,
  /** Caisse de retraite : régime général (SSI) ou Cipav (professions réglementées). */
  caisse: z.enum(["regime_general", "cipav"]),
  versementLiberatoire: z.boolean(),
  /** Date de début d'activité ouvrant droit à l'Acre, ou null si pas d'Acre. */
  acreDebutActivite: IsoDate.nullable(),
  tva: z.enum(["franchise", "assujetti"]),
  /** Micro : périodicité de déclaration et de paiement à l'Urssaf. */
  periodiciteUrssaf: z.enum(["mensuelle", "trimestrielle"]),
  situationFamiliale: z.enum(["seul", "couple"]),
  /** Nombre de parts fiscales du foyer (par quart de part). */
  parts: z.number().min(1).multipleOf(0.25),
  /** Revenu net imposable annuel du foyer hors activité freelance, en centimes. */
  autresRevenusImposables: Cents,
  /** EURL IS / SASU : part du résultat versée en rémunération (0..1), le reste en dividendes. */
  partRemuneration: z.number().min(0).max(1),
  /** EURL IS : capital social + comptes courants d'associé (seuil des 10 % sur les dividendes). */
  capitalEtComptesCourants: Cents,
  /** Portage : frais de gestion de la société de portage (0..1). */
  fraisGestionPortage: z.number().min(0).max(0.3),
});
export type Settings = z.infer<typeof Settings>;

export const SettingsPatch = z.object({
  validFrom: IsoDate,
  settings: Settings.partial(),
});
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/**
 * Ordered dated patches. The first patch must be complete; later ones only
 * carry what changes from their `validFrom` date.
 */
export const SettingsTimeline = z
  .array(SettingsPatch)
  .min(1)
  .refine((t) => Settings.safeParse(t[0]?.settings).success, {
    message: "Le premier réglage doit être complet",
  });
export type SettingsTimeline = z.infer<typeof SettingsTimeline>;

export const DEFAULT_SETTINGS: Settings = {
  statut: "micro_bnc",
  caisse: "regime_general",
  versementLiberatoire: false,
  acreDebutActivite: null,
  tva: "franchise",
  periodiciteUrssaf: "mensuelle",
  situationFamiliale: "seul",
  parts: 1,
  autresRevenusImposables: 0 as Cents,
  partRemuneration: 0.6,
  capitalEtComptesCourants: 100000 as Cents,
  fraisGestionPortage: 0.07,
};
