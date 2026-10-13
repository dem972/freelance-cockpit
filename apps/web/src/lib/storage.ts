import { useEffect, useState } from "react";

/** State remembered in this browser only (a convenience, never the source of truth). */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : { ...initial, ...(JSON.parse(raw) as T) };
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode): keep in memory only.
    }
  }, [key, value]);
  return [value, setValue];
}
