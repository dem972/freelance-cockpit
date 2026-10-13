import { z } from "zod";
import { Cents } from "./money.js";
import { IsoDate } from "./settings.js";

const Id = z.number().int().positive();
const NonNegativeCents = Cents.refine((v) => v >= 0, "Montant positif attendu");

export const TransactionKind = z.enum(["encaissement", "frais_pro", "paiement_echeance", "autre"]);
export type TransactionKind = z.infer<typeof TransactionKind>;

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  encaissement: "Encaissement client",
  frais_pro: "Frais professionnel",
  paiement_echeance: "Paiement d'échéance",
  autre: "Autre mouvement",
};

/**
 * A bank movement entered by hand. `amount` is signed and TTC (in > 0, out < 0);
 * `vatAmount` is the TVA included in it (collected or recoverable), always ≥ 0.
 */
export const TransactionInput = z
  .object({
    date: IsoDate,
    label: z.string().trim().min(1).max(200),
    amount: Cents,
    kind: TransactionKind,
    vatAmount: NonNegativeCents,
    invoiceId: Id.nullable(),
    deadlineId: Id.nullable(),
  })
  .refine((t) => t.kind !== "encaissement" || t.amount > 0, {
    message: "Un encaissement est positif",
    path: ["amount"],
  })
  .refine((t) => t.kind !== "frais_pro" || t.amount < 0, {
    message: "Un frais est négatif",
    path: ["amount"],
  })
  .refine((t) => t.vatAmount <= Math.abs(t.amount), {
    message: "La TVA dépasse le montant",
    path: ["vatAmount"],
  });
export type TransactionInput = z.infer<typeof TransactionInput>;
export type Transaction = TransactionInput & { id: number };

export const InvoiceInput = z.object({
  number: z.string().trim().min(1).max(50),
  client: z.string().trim().min(1).max(200),
  issuedOn: IsoDate,
  dueOn: IsoDate.nullable(),
  amountHt: NonNegativeCents,
  vatAmount: NonNegativeCents,
  paidOn: IsoDate.nullable(),
  note: z.string().max(1000).nullable(),
});
export type InvoiceInput = z.infer<typeof InvoiceInput>;
export type Invoice = InvoiceInput & { id: number };

export const Projection = z.object({
  year: z.number().int().min(2000).max(2100),
  tjm: NonNegativeCents,
  /** Jours facturés prévus, 12 valeurs. */
  joursParMois: z.array(z.number().min(0).max(31)).length(12),
  fraisMensuels: NonNegativeCents,
  /** Congés posés (dates ISO) : déduits des jours ouvrés pour le prévisionnel (J6). */
  conges: z.array(IsoDate).default([]),
  /** true : jours prévus = jours ouvrés − congés ; false : joursParMois saisis à la main. */
  joursDepuisCalendrier: z.boolean().default(false),
});
export type Projection = z.infer<typeof Projection>;

export const ProvisionKind = z.enum(["urssaf", "cfp", "impot", "tva"]);
export type ProvisionKind = z.infer<typeof ProvisionKind>;

export const PROVISION_LABELS: Record<ProvisionKind, string> = {
  urssaf: "Cotisations Urssaf",
  cfp: "CFP",
  impot: "Impôt",
  tva: "TVA",
};

export const DeadlineKind = z.enum(["urssaf", "tva", "impot", "cfe", "autre"]);
export type DeadlineKind = z.infer<typeof DeadlineKind>;

export const DeadlineInput = z.object({
  kind: DeadlineKind,
  label: z.string().trim().min(1).max(200),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  dueOn: IsoDate,
  amountDue: NonNegativeCents,
  paidOn: IsoDate.nullable(),
  paidAmount: NonNegativeCents.nullable(),
});
export type DeadlineInput = z.infer<typeof DeadlineInput>;
export type Deadline = DeadlineInput & { id: number; auto: boolean };

/** Real bank balance observed on a date; the balance afterwards adds transactions. */
export const BalanceSnapshot = z.object({ date: IsoDate, amount: Cents });
export type BalanceSnapshot = z.infer<typeof BalanceSnapshot>;
