import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, KeyRound, Loader2, Plus, Send, Sparkles, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { agent, notifyDataChanged, type ChatState, type PendingAction } from "@/lib/agent";
import { cn } from "@/lib/utils";

const THREAD_KEY = "fc.copilot.thread";
const SUGGESTIONS = [
  "Comment va ma trésorerie ce mois-ci ?",
  "Simule 3 semaines de congés en août",
  "Quel statut me laisserait le plus avec mon TJM actuel ?",
  "Pourquoi 25,6 % de cotisations ?",
];

const TOOL_LABELS: Record<string, string> = {
  get_cockpit: "cockpit",
  get_alerts: "alertes",
  list_transactions: "mouvements",
  list_invoices: "factures",
  get_settings: "réglages",
  simulate: "simulation",
  search_knowledge: "sources",
  add_transaction: "saisie",
  add_invoice: "facture",
  mark_invoice_paid: "encaissement",
  pay_deadline: "paiement",
  change_settings: "réglages",
  add_days_off: "congés",
  remember: "mémoire",
};

function readThread(): string | null {
  try {
    return localStorage.getItem(THREAD_KEY);
  } catch {
    return null;
  }
}

function writeThread(id: string | null) {
  try {
    if (id === null) localStorage.removeItem(THREAD_KEY);
    else localStorage.setItem(THREAD_KEY, id);
  } catch {
    // Private mode: the conversation lasts for this session only.
  }
}

/** Minimal, safe markdown: paragraphs, bullet lists and **bold** (no HTML injection). */
function Markdown({ text }: { text: string }) {
  const inline = (line: string): ReactNode[] =>
    line
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length > 0) {
      blocks.push(
        <ul key={`l${String(blocks.length)}`} className="grid gap-1 pl-5 [list-style:disc]">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet?.[1] !== undefined) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      heading?.[1] !== undefined ? (
        <p key={blocks.length} className="font-serif font-semibold">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="grid gap-2">{blocks}</div>;
}

function ApprovalCard({
  pending,
  busy,
  onDecide,
}: {
  pending: PendingAction;
  busy: boolean;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border-2 border-primary/40 bg-accent/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
        <Wrench className="size-4" /> Action proposée, à valider
      </div>
      <p className="text-sm font-medium">{pending.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {Object.entries(pending.details).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="num break-all">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            onDecide(true);
          }}
        >
          <Check /> Valider
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            onDecide(false);
          }}
        >
          <X /> Refuser
        </Button>
      </div>
    </div>
  );
}

function Conversation() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [state, setState] = useState<ChatState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    agent
      .health()
      .then((h) => {
        setEnabled(h.ai_enabled);
      })
      .catch(() => {
        setEnabled(false);
      });
    const thread = readThread();
    if (thread !== null) {
      agent
        .history(thread)
        .then(setState)
        .catch(() => {
          writeThread(null);
        });
    }
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [state, busy]);

  const run = (fn: () => Promise<ChatState>, after?: (s: ChatState) => void) => {
    setBusy(true);
    fn()
      .then((s) => {
        setState(s);
        writeThread(s.thread_id);
        after?.(s);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const send = (text: string) => {
    const message = text.trim();
    if (message === "" || busy) return;
    setInput("");
    setState((s) =>
      s === null
        ? { thread_id: "", messages: [{ role: "user", content: message }], pending: null }
        : { ...s, messages: [...s.messages, { role: "user", content: message }] },
    );
    run(() => agent.chat(message, state?.thread_id ?? readThread()));
  };

  const decide = (approved: boolean) => {
    if (state === null) return;
    run(
      () => agent.resume(state.thread_id, approved),
      () => {
        if (approved) {
          notifyDataChanged();
          toast.success("Action enregistrée");
        }
      },
    );
  };

  if (enabled === false) {
    return (
      <div className="m-4 grid gap-2 rounded-xl border bg-secondary p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> Copilot désactivé
        </p>
        <p>
          Ajoute ta clé dans <code>infra/.env</code> (<code>OPENAI_API_KEY=…</code>) puis redémarre
          les services agent. Le reste de l'app fonctionne sans.
        </p>
      </div>
    );
  }

  const messages = state?.messages ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {messages.length === 0 && (
          <div className="grid gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Je lis tes données et le moteur de calcul, je ne fabrique aucun chiffre. Toute
              écriture t'est soumise avant d'être enregistrée.
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-xl border bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => {
                    send(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-secondary text-secondary-foreground",
              )}
            >
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
              {m.steps !== undefined && m.steps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {[...new Set(m.steps)].map((s) => (
                    <Badge key={s} variant="outline" className="bg-card/60 text-[10px] font-normal">
                      {TOOL_LABELS[s] ?? s}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {state?.pending != null && (
          <ApprovalCard pending={state.pending} busy={busy} onDecide={decide} />
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Le copilot réfléchit…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-end gap-2 border-t bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          rows={2}
          placeholder={
            state?.pending != null ? "Valide ou refuse l'action d'abord" : "Pose une question…"
          }
          disabled={state?.pending != null}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          className="min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Message au copilot"
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || input.trim() === ""}
          aria-label="Envoyer"
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}

export function CopilotButton() {
  const [key, setKey] = useState(0);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Sparkles /> <span className="hidden sm:inline">Copilot</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 font-serif text-xl">
            <Sparkles className="size-5 text-primary" /> Copilot
          </SheetTitle>
          <SheetDescription>Questions, simulations, saisie guidée.</SheetDescription>
          <div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                writeThread(null);
                setKey((k) => k + 1);
              }}
            >
              <Plus /> Nouvelle conversation
            </Button>
          </div>
        </SheetHeader>
        <Conversation key={key} />
      </SheetContent>
    </Sheet>
  );
}
