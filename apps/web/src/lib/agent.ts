export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
}

export interface PendingAction {
  action: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface ChatState {
  thread_id: string;
  messages: ChatMessage[];
  pending: PendingAction | null;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`/agent${url}`, init);
  const json = (await res.json().catch(() => null)) as { detail?: string } | null;
  if (!res.ok) throw new Error(json?.detail ?? `Erreur ${String(res.status)}`);
  return json as T;
}

export const agent = {
  health: () => call<{ status: string; ai_enabled: boolean }>("GET", "/health"),
  chat: (message: string, threadId: string | null) =>
    call<ChatState>("POST", "/chat", { message, thread_id: threadId }),
  resume: (threadId: string, approved: boolean) =>
    call<ChatState>("POST", `/chat/${threadId}/resume`, { approved }),
  history: (threadId: string) => call<ChatState>("GET", `/chat/${threadId}`),
};

/** Tells every page that data changed (after an approved write). */
export function notifyDataChanged() {
  window.dispatchEvent(new Event("fc:data-changed"));
}
