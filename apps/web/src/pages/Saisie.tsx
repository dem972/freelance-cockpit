import { useState } from "react";
import {
  PROVISION_LABELS,
  TRANSACTION_KIND_LABELS,
  type Deadline,
  type DeadlineKind,
  type Invoice,
  type ProvisionKind,
  type Transaction,
  type TransactionKind,
} from "@fc/shared";
import { ErrorText } from "../components/ErrorText.js";
import { Field } from "../components/Field.js";
import { MoneyInput } from "../components/MoneyInput.js";
import { api, useApi } from "../lib/api.js";
import { date, eur } from "../lib/format.js";

export interface TxRow extends Transaction {
  provisions: { kind: ProvisionKind; amount: number; rateVersion: string }[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function useAction(after: () => void) {
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn()
      .then(after)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };
  return { error, run };
}

// --- Transactions -----------------------------------------------------------

function TransactionForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<TransactionKind>("encaissement");
  const [day, setDay] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [vat, setVat] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const { error, run } = useAction(() => {
    setLabel("");
    setAmount(0);
    setVat(0);
    setFormKey((k) => k + 1);
    onSaved();
  });

  const submit = () => {
    // Outflows are stored negative; the user types positive amounts.
    const signed = kind === "encaissement" ? amount : kind === "autre" ? amount : -amount;
    run(() =>
      api.post("/transactions", {
        date: day,
        label,
        amount: signed,
        kind,
        vatAmount: vat,
        invoiceId: null,
        deadlineId: null,
      }),
    );
  };

  return (
    <form
      className="card"
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3>Nouveau mouvement</h3>
      <div className="grid-3">
        <Field label="Type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as TransactionKind);
            }}
          >
            {(["encaissement", "frais_pro", "autre"] as const).map((k) => (
              <option key={k} value={k}>
                {TRANSACTION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            required
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
            }}
          />
        </Field>
        <Field label="Libellé">
          <input
            required
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </Field>
        <Field
          label="Montant TTC (€)"
          {...(kind === "autre" ? { hint: "Négatif pour une sortie" } : {})}
        >
          <MoneyInput
            value={amount}
            onChange={setAmount}
            allowNegative={kind === "autre"}
            required
          />
        </Field>
        {kind !== "autre" && (
          <Field
            label="Dont TVA (€)"
            hint={kind === "encaissement" ? "TVA collectée" : "TVA récupérable"}
          >
            <MoneyInput value={vat} onChange={setVat} />
          </Field>
        )}
        <div className="field">
          <button type="submit">Ajouter</button>
        </div>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

function TransactionList({ rows, onChange }: { rows: TxRow[]; onChange: () => void }) {
  const { error, run } = useAction(onChange);
  if (rows.length === 0) return <p className="muted">Aucun mouvement cette année.</p>;
  return (
    <>
      <ErrorText error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Provisions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{date(t.date)}</td>
                <td className="wrap">
                  {t.label}
                  <span className="badge">{TRANSACTION_KIND_LABELS[t.kind]}</span>
                </td>
                <td className={`num ${t.amount < 0 ? "neg" : ""}`}>{eur(t.amount)}</td>
                <td className="small wrap">
                  {t.provisions
                    .map((p) => `${PROVISION_LABELS[p.kind]} ${eur(p.amount)}`)
                    .join(" · ")}
                </td>
                <td>
                  {t.kind !== "paiement_echeance" && (
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Supprimer ${t.label}`}
                      onClick={() => {
                        if (confirm(`Supprimer « ${t.label} » ?`)) {
                          run(() => api.del(`/transactions/${String(t.id)}`));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Invoices ---------------------------------------------------------------

function InvoiceForm({ onSaved }: { onSaved: () => void }) {
  const [number, setNumber] = useState("");
  const [client, setClient] = useState("");
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [dueOn, setDueOn] = useState("");
  const [ht, setHt] = useState(0);
  const [vat, setVat] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const { error, run } = useAction(() => {
    setNumber("");
    setHt(0);
    setVat(0);
    setFormKey((k) => k + 1);
    onSaved();
  });
  return (
    <form
      className="card"
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          api.post("/invoices", {
            number,
            client,
            issuedOn,
            dueOn: dueOn === "" ? null : dueOn,
            amountHt: ht,
            vatAmount: vat,
            paidOn: null,
            note: null,
          }),
        );
      }}
    >
      <h3>Nouvelle facture</h3>
      <div className="grid-3">
        <Field label="Numéro">
          <input
            required
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
            }}
          />
        </Field>
        <Field label="Client">
          <input
            required
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
            }}
          />
        </Field>
        <Field label="Émise le">
          <input
            type="date"
            required
            value={issuedOn}
            onChange={(e) => {
              setIssuedOn(e.target.value);
            }}
          />
        </Field>
        <Field label="Échéance">
          <input
            type="date"
            value={dueOn}
            onChange={(e) => {
              setDueOn(e.target.value);
            }}
          />
        </Field>
        <Field label="Montant HT (€)">
          <MoneyInput value={ht} onChange={setHt} required />
        </Field>
        <Field label="TVA (€)" hint="0 en franchise">
          <MoneyInput value={vat} onChange={setVat} />
        </Field>
        <div className="field">
          <button type="submit">Ajouter</button>
        </div>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

function InvoiceList({ rows, onChange }: { rows: Invoice[]; onChange: () => void }) {
  const { error, run } = useAction(onChange);
  if (rows.length === 0) return <p className="muted">Aucune facture cette année.</p>;
  return (
    <>
      <ErrorText error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Émise</th>
              <th>HT</th>
              <th>TVA</th>
              <th>Encaissée</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.number}</td>
                <td className="wrap">{i.client}</td>
                <td>{date(i.issuedOn)}</td>
                <td className="num">{eur(i.amountHt)}</td>
                <td className="num">{eur(i.vatAmount)}</td>
                <td>
                  {i.paidOn === null ? <span className="badge">à encaisser</span> : date(i.paidOn)}
                </td>
                <td className="actions">
                  {i.paidOn === null && (
                    <button
                      type="button"
                      onClick={() => {
                        const day = prompt("Date d'encaissement (AAAA-MM-JJ)", todayIso());
                        if (day !== null) {
                          run(() => api.post(`/invoices/${String(i.id)}/pay`, { date: day }));
                        }
                      }}
                    >
                      Encaissée
                    </button>
                  )}
                  {i.paidOn === null && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (confirm(`Supprimer la facture ${i.number} ?`)) {
                          run(() => api.del(`/invoices/${String(i.id)}`));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Deadlines --------------------------------------------------------------

const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  urssaf: "Urssaf",
  tva: "TVA",
  impot: "Impôt",
  cfe: "CFE",
  autre: "Autre",
};

function DeadlineForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<DeadlineKind>("tva");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [amount, setAmount] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const { error, run } = useAction(() => {
    setLabel("");
    setAmount(0);
    setFormKey((k) => k + 1);
    onSaved();
  });
  return (
    <form
      className="card"
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          api.post("/deadlines", {
            kind,
            label,
            periodStart: start,
            periodEnd: end,
            dueOn,
            amountDue: amount,
            paidOn: null,
            paidAmount: null,
          }),
        );
      }}
    >
      <h3>Nouvelle échéance</h3>
      <p className="muted small">
        Les échéances Urssaf de la micro-entreprise sont créées automatiquement. Ajoute ici la TVA,
        l'impôt ou la CFE avec les dates de ton avis.
      </p>
      <div className="grid-3">
        <Field label="Type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as DeadlineKind);
            }}
          >
            {(["tva", "impot", "cfe", "urssaf", "autre"] as const).map((k) => (
              <option key={k} value={k}>
                {DEADLINE_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Libellé">
          <input
            required
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </Field>
        <Field label="Montant dû (€)">
          <MoneyInput value={amount} onChange={setAmount} required />
        </Field>
        <Field label="Période : début">
          <input
            type="date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
            }}
          />
        </Field>
        <Field label="Période : fin">
          <input
            type="date"
            required
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
            }}
          />
        </Field>
        <Field label="À payer avant le">
          <input
            type="date"
            required
            value={dueOn}
            onChange={(e) => {
              setDueOn(e.target.value);
            }}
          />
        </Field>
        <div className="field">
          <button type="submit">Ajouter</button>
        </div>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export function DeadlineList({ rows, onChange }: { rows: Deadline[]; onChange: () => void }) {
  const { error, run } = useAction(onChange);
  if (rows.length === 0) return <p className="muted">Aucune échéance.</p>;
  return (
    <>
      <ErrorText error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Échéance</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{date(d.dueOn)}</td>
                <td className="wrap">
                  {d.label}
                  {d.auto && <span className="badge">auto</span>}
                </td>
                <td className="num">{eur(d.paidAmount ?? d.amountDue)}</td>
                <td>{d.paidOn === null ? "à payer" : `payée le ${date(d.paidOn)}`}</td>
                <td className="actions">
                  {d.paidOn === null && (
                    <button
                      type="button"
                      onClick={() => {
                        const day = prompt("Date de paiement (AAAA-MM-JJ)", todayIso());
                        if (day !== null) {
                          run(() => api.post(`/deadlines/${String(d.id)}/pay`, { date: day }));
                        }
                      }}
                    >
                      Payée
                    </button>
                  )}
                  {!d.auto && d.paidOn === null && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (confirm(`Supprimer « ${d.label} » ?`)) {
                          run(() => api.del(`/deadlines/${String(d.id)}`));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Page -------------------------------------------------------------------

type Tab = "transactions" | "factures" | "echeances";

export function Saisie({ year }: { year: number }) {
  const [tab, setTab] = useState<Tab>("transactions");
  const txs = useApi<TxRow[]>(`/transactions?year=${String(year)}`);
  const invs = useApi<Invoice[]>(`/invoices?year=${String(year)}`);
  const dls = useApi<Deadline[]>(`/deadlines?year=${String(year)}`);
  const reloadAll = () => {
    txs.reload();
    invs.reload();
    dls.reload();
  };

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {(
          [
            ["transactions", "Mouvements"],
            ["factures", "Factures"],
            ["echeances", "Échéances"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "" : "secondary"}
            onClick={() => {
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorText error={txs.error ?? invs.error ?? dls.error} />
      {tab === "transactions" && (
        <>
          <TransactionForm onSaved={reloadAll} />
          <section className="card">
            <h3>Mouvements {year}</h3>
            {txs.data !== null && <TransactionList rows={txs.data} onChange={reloadAll} />}
          </section>
        </>
      )}
      {tab === "factures" && (
        <>
          <InvoiceForm onSaved={reloadAll} />
          <section className="card">
            <h3>Factures {year}</h3>
            {invs.data !== null && <InvoiceList rows={invs.data} onChange={reloadAll} />}
          </section>
        </>
      )}
      {tab === "echeances" && (
        <>
          <DeadlineForm onSaved={reloadAll} />
          <section className="card">
            <h3>Échéances {year}</h3>
            {dls.data !== null && <DeadlineList rows={dls.data} onChange={reloadAll} />}
          </section>
        </>
      )}
    </div>
  );
}
