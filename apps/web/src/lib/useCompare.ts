import { useEffect, useRef, useState } from "react";
import type { Breakdown, YearInput } from "@fc/engine";
import type { WorkerRequest, WorkerResponse } from "./engine.worker.js";

interface Done {
  key: string;
  result: Breakdown[] | null;
  error: string | null;
}

/**
 * Runs every statut in a Web Worker (the company rules take ~100 ms each),
 * debounced, keeping the previous result on screen while computing.
 */
export function useCompare(input: YearInput) {
  const worker = useRef<Worker | null>(null);
  const keys = useRef(new Map<number, string>());
  const lastId = useRef(0);
  const [done, setDone] = useState<Done>({ key: "", result: null, error: null });
  const key = JSON.stringify(input);

  useEffect(() => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id } = event.data;
      if (id !== lastId.current) return;
      const doneKey = keys.current.get(id) ?? "";
      keys.current.clear();
      setDone((prev) =>
        event.data.ok
          ? { key: doneKey, result: event.data.result, error: null }
          : { key: doneKey, result: prev.result, error: event.data.error },
      );
    };
    worker.current = w;
    return () => {
      w.terminate();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      lastId.current += 1;
      keys.current.set(lastId.current, key);
      const request: WorkerRequest = { id: lastId.current, input: JSON.parse(key) as YearInput };
      worker.current?.postMessage(request);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [key]);

  return { result: done.result, error: done.error, pending: done.key !== key };
}
