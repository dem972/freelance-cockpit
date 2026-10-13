import { Settings, type IsoDate, type SettingsTimeline } from "@fc/shared";

/**
 * Resolves the settings in effect on `date`: the first (complete) patch,
 * then every later patch whose `validFrom` is on or before `date`, in order.
 */
export function settingsAt(timeline: SettingsTimeline, date: IsoDate): Settings {
  const sorted = [...timeline].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const [first, ...rest] = sorted;
  if (first === undefined) throw new Error("Empty settings timeline");
  const current: Record<string, unknown> = { ...first.settings };
  for (const patch of rest) {
    if (patch.validFrom > date) break;
    for (const [key, value] of Object.entries(patch.settings)) {
      if (value !== undefined) current[key] = value;
    }
  }
  return Settings.parse(current);
}
