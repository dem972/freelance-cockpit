import { useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDialog, DateDialog } from "@/components/ActionDialogs";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/page-header";
import { Choice } from "@/components/SettingsForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useApi } from "@/lib/api";
import { date, eur } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TxRow extends Transaction {
  provisions: { kind: ProvisionKind; amount: number; rateVersion: string }[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Runs an API call, then toasts success or error and refreshes. */
function useAction(after: () => void) {
  return (fn: () => Promise<unknown>, success: string) => {
    fn()
      .then(() => {
        toast.success(success);
        after();
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };
}

function FormCard({
  icon: Icon,
  title,
  description,
  children,
  onSubmit,
  error,
}: {
  icon: typeof Plus;
  title: string;
  description: string;
  children: ReactNode;
  onSubmit: () => void;
  error: string | null;
}) {
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="grid grid-cols-1 gap-6"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <Icon className="size-5 text-primary" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
          <ErrorText error={error} />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit">
            <Plus /> Ajouter
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Plus; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5" />
      </span>
      {text}
    </div>
  );
}

// --- Transactions -----------------------------------------------------------

function TransactionForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<TransactionKind>("encaissement");
  const [day, setDay] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [vat, setVat] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    // Outflows are stored negative; the user types positive amounts.
    const signed = kind === "frais_pro" ? -amount : amount;
    api
      .post("/transactions", {
        date: day,
        label,
        amount: signed,
        kind,
        vatAmount: vat,
        invoiceId: null,
        deadlineId: null,
      })
      .then(() => {
        toast.success("Mouvement ajouté", { description: "Provisions recalculées." });
        setLabel("");
        setAmount(0);
        setVat(0);
        setError(null);
        setFormKey((k) => k + 1);
        onSaved();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <FormCard
      key={formKey}
      icon={Wallet}
      title="Nouveau mouvement"
      description="Encaissement, frais professionnel ou autre mouvement du compte pro."
      onSubmit={submit}
      error={error}
    >
      <Field label="Type">
        <Choice
          value={kind}
          options={(["encaissement", "frais_pro", "autre"] as const).map(
            (k) => [k, TRANSACTION_KIND_LABELS[k]] as const,
          )}
          onChange={setKind}
        />
      </Field>
      <Field label="Date">
        <Input
          type="date"
          required
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
          }}
        />
      </Field>
      <Field label="Libellé">
        <Input
          required
          value={label}
          placeholder="Client, fournisseur…"
          onChange={(e) => {
            setLabel(e.target.value);
          }}
        />
      </Field>
      <Field label="Montant TTC" hint={kind === "autre" ? "Négatif pour une sortie" : undefined}>
        <MoneyInput value={amount} onChange={setAmount} allowNegative={kind === "autre"} required />
      </Field>
      {kind !== "autre" && (
        <Field
          label="Dont TVA"
          hint={kind === "encaissement" ? "TVA collectée" : "TVA récupérable"}
        >
          <MoneyInput value={vat} onChange={setVat} />
        </Field>
      )}
    </FormCard>
  );
}

function TransactionList({ rows, onChange }: { rows: TxRow[]; onChange: () => void }) {
  const run = useAction(onChange);
  if (rows.length === 0) return <EmptyState icon={Wallet} text="Aucun mouvement cette année." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Libellé</TableHead>
          <TableHead className="text-right">Montant</TableHead>
          <TableHead>Provisions</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="text-muted-foreground">{date(t.date)}</TableCell>
            <TableCell className="min-w-48 whitespace-normal">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    t.amount >= 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {t.amount >= 0 ? (
                    <ArrowDownLeft className="size-3.5" />
                  ) : (
                    <ArrowUpRight className="size-3.5" />
                  )}
                </span>
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{TRANSACTION_KIND_LABELS[t.kind]}</p>
                </div>
              </div>
            </TableCell>
            <TableCell
              className={cn("num text-right font-semibold", t.amount < 0 && "text-destructive")}
            >
              {eur(t.amount)}
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-wrap gap-1">
                {t.provisions.map((p) => (
                  <Badge
                    key={p.kind}
                    variant="secondary"
                    className="num"
                    title={`Taux ${p.rateVersion}`}
                  >
                    {PROVISION_LABELS[p.kind]} {eur(p.amount)}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {t.kind !== "paiement_echeance" && (
                <ConfirmDialog
                  title="Supprimer ce mouvement ?"
                  description={`« ${t.label} », ${eur(t.amount)}. Les provisions seront recalculées.`}
                  confirm="Supprimer"
                  onConfirm={() => {
                    run(() => api.del(`/transactions/${String(t.id)}`), "Mouvement supprimé");
                  }}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${t.label}`}>
                      <Trash2 />
                    </Button>
                  }
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  const [error, setError] = useState<string | null>(null);
  return (
    <FormCard
      key={formKey}
      icon={FileText}
      title="Nouvelle facture"
      description="Elle comptera dans le CA au moment de son encaissement."
      error={error}
      onSubmit={() => {
        api
          .post("/invoices", {
            number,
            client,
            issuedOn,
            dueOn: dueOn === "" ? null : dueOn,
            amountHt: ht,
            vatAmount: vat,
            paidOn: null,
            note: null,
          })
          .then(() => {
            toast.success(`Facture ${number} ajoutée`);
            setNumber("");
            setHt(0);
            setVat(0);
            setError(null);
            setFormKey((k) => k + 1);
            onSaved();
          })
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e));
          });
      }}
    >
      <Field label="Numéro">
        <Input
          required
          value={number}
          placeholder="F-2026-001"
          onChange={(e) => {
            setNumber(e.target.value);
          }}
        />
      </Field>
      <Field label="Client">
        <Input
          required
          value={client}
          onChange={(e) => {
            setClient(e.target.value);
          }}
        />
      </Field>
      <Field label="Émise le">
        <Input
          type="date"
          required
          value={issuedOn}
          onChange={(e) => {
            setIssuedOn(e.target.value);
          }}
        />
      </Field>
      <Field label="Échéance">
        <Input
          type="date"
          value={dueOn}
          onChange={(e) => {
            setDueOn(e.target.value);
          }}
        />
      </Field>
      <Field label="Montant HT">
        <MoneyInput value={ht} onChange={setHt} required />
      </Field>
      <Field label="TVA" hint="0 en franchise">
        <MoneyInput value={vat} onChange={setVat} />
      </Field>
    </FormCard>
  );
}

function InvoiceList({ rows, onChange }: { rows: Invoice[]; onChange: () => void }) {
  const run = useAction(onChange);
  if (rows.length === 0) return <EmptyState icon={FileText} text="Aucune facture cette année." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>N°</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Émise</TableHead>
          <TableHead className="text-right">HT</TableHead>
          <TableHead className="text-right">TVA</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="font-medium">{i.number}</TableCell>
            <TableCell className="whitespace-normal">{i.client}</TableCell>
            <TableCell className="text-muted-foreground">{date(i.issuedOn)}</TableCell>
            <TableCell className="num text-right">{eur(i.amountHt)}</TableCell>
            <TableCell className="num text-right">{eur(i.vatAmount)}</TableCell>
            <TableCell>
              {i.paidOn === null ? (
                <Badge variant="outline" className="border-primary/40 text-primary">
                  à encaisser
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 text-success">
                  <CheckCircle2 /> encaissée le {date(i.paidOn)}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {i.paidOn === null && (
                <div className="flex justify-end gap-1">
                  <DateDialog
                    title={`Encaisser ${i.number}`}
                    description={`${eur(i.amountHt + i.vatAmount)} TTC de ${i.client}. Crée l'encaissement et ses provisions.`}
                    label="Date d'encaissement"
                    confirm="Marquer encaissée"
                    onConfirm={(day) => {
                      run(
                        () => api.post(`/invoices/${String(i.id)}/pay`, { date: day }),
                        `Facture ${i.number} encaissée`,
                      );
                    }}
                    trigger={<Button size="sm">Encaissée</Button>}
                  />
                  <ConfirmDialog
                    title={`Supprimer la facture ${i.number} ?`}
                    description="Cette action est définitive."
                    confirm="Supprimer"
                    onConfirm={() => {
                      run(
                        () => api.del(`/invoices/${String(i.id)}`),
                        `Facture ${i.number} supprimée`,
                      );
                    }}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${i.number}`}>
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  const [error, setError] = useState<string | null>(null);
  const dateField = (label: string, value: string, set: (v: string) => void) => (
    <Field label={label}>
      <Input
        type="date"
        required
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
      />
    </Field>
  );
  return (
    <FormCard
      key={formKey}
      icon={CalendarClock}
      title="Nouvelle échéance"
      description="Les échéances Urssaf de la micro-entreprise sont créées automatiquement. Ajoute ici la TVA, l'impôt ou la CFE avec les dates de ton avis."
      error={error}
      onSubmit={() => {
        api
          .post("/deadlines", {
            kind,
            label,
            periodStart: start,
            periodEnd: end,
            dueOn,
            amountDue: amount,
            paidOn: null,
            paidAmount: null,
          })
          .then(() => {
            toast.success("Échéance ajoutée");
            setLabel("");
            setAmount(0);
            setError(null);
            setFormKey((k) => k + 1);
            onSaved();
          })
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e));
          });
      }}
    >
      <Field label="Type">
        <Choice
          value={kind}
          options={(["tva", "impot", "cfe", "urssaf", "autre"] as const).map(
            (k) => [k, DEADLINE_LABELS[k]] as const,
          )}
          onChange={setKind}
        />
      </Field>
      <Field label="Libellé">
        <Input
          required
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
        />
      </Field>
      <Field label="Montant dû">
        <MoneyInput value={amount} onChange={setAmount} required />
      </Field>
      {dateField("Période : début", start, setStart)}
      {dateField("Période : fin", end, setEnd)}
      {dateField("À payer avant le", dueOn, setDueOn)}
    </FormCard>
  );
}

function DeadlineList({ rows, onChange }: { rows: Deadline[]; onChange: () => void }) {
  const run = useAction(onChange);
  if (rows.length === 0) return <EmptyState icon={CalendarClock} text="Aucune échéance." />;
  const today = todayIso();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Échéance</TableHead>
          <TableHead>Libellé</TableHead>
          <TableHead className="text-right">Montant</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => {
          // Urssaf wants a declaration even at 0 €: not a debt, so never "late".
          const zero = d.amountDue === 0 && d.paidOn === null;
          const late = !zero && d.paidOn === null && d.dueOn < today;
          return (
            <TableRow key={d.id}>
              <TableCell className={cn(late && "font-semibold text-destructive")}>
                {date(d.dueOn)}
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="font-medium">{d.label}</span>
                {d.auto && (
                  <Badge variant="secondary" className="ml-2">
                    auto
                  </Badge>
                )}
              </TableCell>
              <TableCell className="num text-right font-semibold">
                {eur(d.paidAmount ?? d.amountDue)}
              </TableCell>
              <TableCell>
                {d.paidOn !== null ? (
                  <Badge variant="outline" className="border-success/40 text-success">
                    <CheckCircle2 /> payée le {date(d.paidOn)}
                  </Badge>
                ) : zero ? (
                  <Badge variant="secondary">déclaration à 0 €</Badge>
                ) : late ? (
                  <Badge variant="destructive">en retard</Badge>
                ) : (
                  <Badge variant="outline">à payer</Badge>
                )}
              </TableCell>
              <TableCell>
                {d.paidOn === null && !zero && (
                  <div className="flex justify-end gap-1">
                    <DateDialog
                      title={`Payer « ${d.label} »`}
                      description={`${eur(d.amountDue)}. Enregistre la sortie et solde les provisions correspondantes.`}
                      label="Date de paiement"
                      confirm="Marquer payée"
                      onConfirm={(day) => {
                        run(
                          () => api.post(`/deadlines/${String(d.id)}/pay`, { date: day }),
                          "Échéance payée",
                        );
                      }}
                      trigger={<Button size="sm">Payée</Button>}
                    />
                    {!d.auto && (
                      <ConfirmDialog
                        title={`Supprimer « ${d.label} » ?`}
                        description="Cette action est définitive."
                        confirm="Supprimer"
                        onConfirm={() => {
                          run(() => api.del(`/deadlines/${String(d.id)}`), "Échéance supprimée");
                        }}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Supprimer ${d.label}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// --- Page -------------------------------------------------------------------

function ListCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number | undefined;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          {title}
          {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Saisie({ year }: { year: number }) {
  const txs = useApi<TxRow[]>(`/transactions?year=${String(year)}`);
  const invs = useApi<Invoice[]>(`/invoices?year=${String(year)}`);
  const dls = useApi<Deadline[]>(`/deadlines?year=${String(year)}`);
  const reloadAll = () => {
    txs.reload();
    invs.reload();
    dls.reload();
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={ReceiptText}
        title="Saisie"
        description="Chaque mouvement recalcule ses provisions et tes échéances"
      />
      <ErrorText error={txs.error ?? invs.error ?? dls.error} />
      <Tabs defaultValue="transactions" className="min-w-0 gap-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="transactions">
            <Wallet /> Mouvements
          </TabsTrigger>
          <TabsTrigger value="factures">
            <FileText /> Factures
          </TabsTrigger>
          <TabsTrigger value="echeances">
            <CalendarClock /> Échéances
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="grid grid-cols-1 gap-6">
          <TransactionForm onSaved={reloadAll} />
          <ListCard title={`Mouvements ${String(year)}`} count={txs.data?.length}>
            {txs.data !== null && <TransactionList rows={txs.data} onChange={reloadAll} />}
          </ListCard>
        </TabsContent>
        <TabsContent value="factures" className="grid grid-cols-1 gap-6">
          <InvoiceForm onSaved={reloadAll} />
          <ListCard title={`Factures ${String(year)}`} count={invs.data?.length}>
            {invs.data !== null && <InvoiceList rows={invs.data} onChange={reloadAll} />}
          </ListCard>
        </TabsContent>
        <TabsContent value="echeances" className="grid grid-cols-1 gap-6">
          <DeadlineForm onSaved={reloadAll} />
          <ListCard title={`Échéances ${String(year)}`} count={dls.data?.length}>
            {dls.data !== null && <DeadlineList rows={dls.data} onChange={reloadAll} />}
          </ListCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
