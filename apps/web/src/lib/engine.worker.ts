/// <reference lib="webworker" />
import { compareStatuts, type Breakdown, type YearInput } from "@fc/engine/societe";

export interface WorkerRequest {
  id: number;
  input: YearInput;
}
export type WorkerResponse =
  { id: number; ok: true; result: Breakdown[] } | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input } = event.data;
  let response: WorkerResponse;
  try {
    response = { id, ok: true, result: compareStatuts(input) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
