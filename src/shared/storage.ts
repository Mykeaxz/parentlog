import { DEFAULT_SETTINGS, LedgerEntry, Settings } from "./types";

const ENTRIES_KEY = "pl_entries";
const SETTINGS_KEY = "pl_settings";

export async function getEntries(): Promise<LedgerEntry[]> {
  const r = await chrome.storage.local.get(ENTRIES_KEY);
  const list = (r[ENTRIES_KEY] as LedgerEntry[] | undefined) ?? [];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveEntries(entries: LedgerEntry[]): Promise<void> {
  await chrome.storage.local.set({ [ENTRIES_KEY]: entries });
}

export async function upsertEntry(entry: LedgerEntry): Promise<LedgerEntry> {
  const entries = await getEntries();
  const i = entries.findIndex((e) => e.id === entry.id);
  entry.updatedAt = Date.now();
  if (i >= 0) entries[i] = entry;
  else entries.unshift(entry);
  await saveEntries(entries);
  return entry;
}

export async function getEntry(id: string): Promise<LedgerEntry | undefined> {
  return (await getEntries()).find((e) => e.id === id);
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await getEntries();
  await saveEntries(entries.filter((e) => e.id !== id));
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(ENTRIES_KEY);
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  const s = (r[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {};
  return { ...DEFAULT_SETTINGS, ...s, counters: { ...DEFAULT_SETTINGS.counters, ...(s.counters ?? {}) } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function newId(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function onStorageChange(cb: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[ENTRIES_KEY] || changes[SETTINGS_KEY])) cb();
  });
}
