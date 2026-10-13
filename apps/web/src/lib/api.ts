import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`/api${url}`, init);
  const text = await res.text();
  const json: unknown = text === "" ? null : JSON.parse(text);
  if (!res.ok) {
    const issues = (json as { issues?: { message: string }[] } | null)?.issues;
    const message =
      issues?.map((i) => i.message).join(", ") ??
      (res.status === 409 ? "Existe déjà" : `Erreur ${String(res.status)}`);
    throw new ApiError(res.status, message);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: (url: string) => request<null>("DELETE", url),
};

/** Loads a GET endpoint; `reload` refetches (after a mutation). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T names the expected JSON shape
export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<T>(url)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  return { data, error, reload };
}
