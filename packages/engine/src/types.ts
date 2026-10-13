import type { Cents, SettingsTimeline, Statut, UsedRate } from "@fc/shared";

export interface MonthInput {
  /** 1..12 */
  month: number;
  /** Chiffre d'affaires HT encaissé dans le mois. */
  ca: Cents;
  /** Frais professionnels HT payés dans le mois. */
  fraisPro: Cents;
}

export interface YearInput {
  year: number;
  /** Exactly 12 entries, month 1..12. */
  months: MonthInput[];
  timeline: SettingsTimeline;
  /** Revenu fiscal de référence N-2 du foyer, pour vérifier l'éligibilité au VFL. */
  rfrNMoins2?: Cents | undefined;
}

export interface MonthBreakdown {
  month: number;
  ca: Cents;
  fraisPro: Cents;
  cotisations: Cents;
  cfp: Cents;
  /** VFL du mois, ou part de l'impôt annuel estimé (au prorata du CA). */
  impot: Cents;
  tvaCollectee: Cents;
  tvaDeductible: Cents;
  acre: boolean;
  tauxCotisations: number;
}

export type WarningCode =
  | "plafond_micro_depasse"
  | "tva_seuil_majore_depasse"
  | "tva_seuil_depasse"
  | "vl_rfr_trop_eleve"
  | "vl_changement_en_cours_annee"
  | "statut_non_micro"
  | "estimation_bareme";

export interface EngineWarning {
  code: WarningCode;
  message: string;
  month?: number;
}

/** Low/high bounds, for statuts that cannot be modelled to the euro. */
export interface Range {
  min: Cents;
  max: Cents;
}

export interface Breakdown {
  statut: Statut;
  year: number;
  ca: Cents;
  fraisPro: Cents;
  cotisations: Cents;
  cfp: Cents;
  impot: Cents;
  /** Ce qui reste pour toi : CA − frais − cotisations − CFP − impôt. */
  net: Cents;
  /** Set when the result is a fourchette rather than a precise value. */
  netRange?: Range | undefined;
  tva: { collectee: Cents; deductible: Cents; due: Cents };
  months: MonthBreakdown[];
  rates: UsedRate[];
  warnings: EngineWarning[];
  assumptions: string[];
}
