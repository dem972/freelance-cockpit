import { useEffect, useState } from "react";
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  FileWarning,
  Loader2,
  Package,
  Play,
  Quote,
  Radar,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ErrorText } from "@/components/ErrorText";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { date, eur, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SourceCheck {
  url: string;
  status: "ok" | "changed" | "unreachable";
  detail: string | null;
  checked_at: string;
}
interface Run {
  id: number;
  started_at: string;
  finished_at: string | null;
  summary: {
    confirmed?: string[];
    rejected?: { key: string; reason: string }[];
    proposals?: number[];
    sources?: { url: string; status: string }[];
    dependency?: { current?: string; latest?: string; status?: string } | null;
  };
}
interface Proposal {
  id: number;
  kind: "rate_change" | "source_changed" | "dependency_update";
  title: string;
  status: "pending" | "approved" | "rejected" | "applied";
  created_at: string;
  payload: Record<string, unknown>;
}

async function agentCall<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`/agent${url}`, init);
  const json = (await res.json().catch(() => null)) as { detail?: string } | null;
  if (!res.ok) throw new Error(json?.detail ?? `Erreur ${String(res.status)}`);
  return json as T;
}

function formatValue(unit: unknown, value: unknown): string {
  if (typeof value !== "number") return String(value);
  return unit === "rate" ? pct(value) : unit === "eur" ? eur(value * 100) : String(value);
}

const STATUS: Record<SourceCheck["status"], { label: string; className: string }> = {
  ok: { label: "à jour", className: "border-success/40 text-success" },
  changed: { label: "modifiée", className: "border-primary/40 text-primary" },
  unreachable: { label: "injoignable", className: "border-destructive/40 text-destructive" },
};

function PatchBlock({ proposal }: { proposal: Proposal }) {
  const patch = JSON.stringify(proposal.payload.patch, null, 2);
  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          À appliquer dans <code>packages/engine/rates/{String(proposal.payload.year)}.json</code>,
          puis lancer <code>pnpm test</code> (comparaison avec les règles Urssaf).
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(patch).then(() => toast.success("Correctif copié"));
          }}
        >
          <Copy /> Copier
        </Button>
      </div>
      <pre className="overflow-x-auto text-xs">{patch}</pre>
    </div>
  );
}

function ProposalCard({ p, onDecide }: { p: Proposal; onDecide: (approved: boolean) => void }) {
  const Icon =
    p.kind === "rate_change" ? FileWarning : p.kind === "dependency_update" ? Package : Radar;
  const source =
    typeof p.payload.source_url === "string"
      ? p.payload.source_url
      : typeof p.payload.url === "string"
        ? p.payload.url
        : null;
  return (
    <li className="grid gap-3 rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {p.kind === "rate_change"
                ? String(p.payload.key)
                : p.kind === "dependency_update"
                  ? "Nouvelle version des règles Urssaf (modele-social)"
                  : "Page source modifiée"}
            </p>
            <p className="text-xs text-muted-foreground">
              proposé le {date(p.created_at.slice(0, 10))}
            </p>
          </div>
        </div>
        {p.status !== "pending" && (
          <Badge variant={p.status === "approved" ? "default" : "secondary"}>
            {p.status === "approved"
              ? "validée"
              : p.status === "rejected"
                ? "refusée"
                : "appliquée"}
          </Badge>
        )}
      </div>

      {p.kind === "rate_change" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="num text-muted-foreground line-through">
              {formatValue(p.payload.unit, p.payload.current)}
            </span>
            <span>→</span>
            <span className="num font-serif text-lg font-semibold text-primary">
              {formatValue(p.payload.unit, p.payload.proposed)}
            </span>
          </div>
          <blockquote className="flex gap-2 rounded-lg bg-secondary p-3 text-sm italic">
            <Quote className="size-4 shrink-0 text-primary" />« {String(p.payload.quote)} »
          </blockquote>
        </>
      )}
      {p.kind === "source_changed" && (
        <p className="text-sm">
          Le texte de la page a changé depuis la dernière vérification. Taux concernés :{" "}
          {(p.payload.keys as string[]).map((k) => (
            <Badge key={k} variant="outline" className="mr-1 font-normal">
              {k}
            </Badge>
          ))}
          Revérifie-les, puis marque comme traité.
        </p>
      )}
      {p.kind === "dependency_update" && (
        <p className="text-sm">
          Installée : <strong>{String(p.payload.current)}</strong>, publiée :{" "}
          <strong>{String(p.payload.latest)}</strong>. À mettre à jour après deux semaines de recul,
          puis relancer les tests du moteur.
        </p>
      )}
      {source !== null && (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {new URL(source).hostname}
          <ExternalLink className="size-3" />
        </a>
      )}

      {p.status === "pending" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              onDecide(true);
            }}
          >
            <Check /> {p.kind === "rate_change" ? "Valider" : "Marquer traité"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onDecide(false);
            }}
          >
            <X /> Refuser
          </Button>
        </div>
      ) : (
        p.kind === "rate_change" && p.status === "approved" && <PatchBlock proposal={p} />
      )}
    </li>
  );
}

export function Veille() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [sources, setSources] = useState<SourceCheck[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = () =>
    Promise.all([
      agentCall<{ runs: Run[]; sources: SourceCheck[] }>("GET", "/rates-watch"),
      agentCall<Proposal[]>("GET", "/proposals"),
    ])
      .then(([state, props]) => {
        setRuns(state.runs);
        setSources(state.sources);
        setProposals(props);
        setError(null);
        return state.runs;
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        return [] as Run[];
      });

  useEffect(() => {
    void load();
  }, []);

  const start = () => {
    const before = runs[0]?.id ?? 0;
    setRunning(true);
    agentCall("POST", "/rates-watch")
      .then(() => {
        toast.info("Veille lancée : vérification des sources officielles…");
        let tries = 0;
        const timer = window.setInterval(() => {
          tries += 1;
          void load().then((r) => {
            const done = r[0] !== undefined && r[0].id > before && r[0].finished_at !== null;
            if (done || tries >= 60) {
              window.clearInterval(timer);
              setRunning(false);
              if (done) toast.success("Veille terminée");
              else toast.error("La veille n'a pas fini : vérifie les logs du worker.");
            }
          });
        }, 3000);
      })
      .catch((e: unknown) => {
        setRunning(false);
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  const decide = (p: Proposal, approved: boolean) => {
    agentCall("POST", `/proposals/${String(p.id)}/decision`, { approved })
      .then(() => {
        toast.success(approved ? "Validée" : "Refusée");
        void load();
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
      });
  };

  const last = runs[0];
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending").slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={Radar}
        title="Veille des taux"
        description="Chaque semaine (et à la demande), les sources officielles sont revérifiées"
        actions={
          <Button onClick={start} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} Lancer la veille
          </Button>
        }
      />
      <ErrorText error={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <CircleCheck className="size-5 text-success" /> Dernière vérification
            </CardTitle>
            <CardDescription>
              {last === undefined
                ? "Jamais lancée."
                : `Le ${date(last.started_at.slice(0, 10))}${last.finished_at === null ? " (en cours)" : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {last !== undefined && (
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                {[
                  ["confirmés", last.summary.confirmed?.length ?? 0],
                  ["propositions", last.summary.proposals?.length ?? 0],
                  ["écartés", last.summary.rejected?.length ?? 0],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded-lg bg-secondary p-2">
                    <p className="num font-serif text-xl font-semibold">{n}</p>
                    <p className="truncate text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}
            <ul className="grid gap-2">
              {sources.map((s) => (
                <li key={s.url} className="grid min-w-0 gap-1 rounded-lg border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={s.url}
                      className="min-w-0 truncate text-primary hover:underline"
                    >
                      {new URL(s.url).hostname}
                      {new URL(s.url).pathname.slice(0, 28)}
                    </a>
                    <Badge variant="outline" className={cn(STATUS[s.status].className)}>
                      {STATUS[s.status].label}
                    </Badge>
                  </div>
                  {s.status === "unreachable" && (
                    <p className="flex items-start gap-1 text-xs text-muted-foreground">
                      <ShieldAlert className="mt-0.5 size-3 shrink-0" />
                      Le site refuse les robots ou ne répond pas : vérifie ces taux à la main via le
                      lien.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {(last?.summary.rejected?.length ?? 0) > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Lectures écartées par les garde-fous</summary>
                <ul className="mt-2 grid gap-1">
                  {last?.summary.rejected?.map((r) => (
                    <li key={r.key}>
                      <code>{r.key}</code> : {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <FileWarning className="size-5 text-primary" /> À valider
              {pending.length > 0 && <Badge>{pending.length}</Badge>}
            </CardTitle>
            <CardDescription>
              Une proposition n'apparaît que si sa citation figure mot pour mot sur la page
              officielle et contient la valeur proposée.
            </CardDescription>
            <CardAction />
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Rien à valider.</p>
            ) : (
              <ul className="grid gap-3">
                {pending.map((p) => (
                  <ProposalCard
                    key={p.id}
                    p={p}
                    onDecide={(approved) => {
                      decide(p, approved);
                    }}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Décisions récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {decided.map((p) => (
                <ProposalCard key={p.id} p={p} onDecide={() => undefined} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
