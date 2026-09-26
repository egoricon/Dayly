import type { AppData } from './domain/types';

export const DATA_KEY = 'dayly:data';
const CORRUPT_KEY = 'dayly:data:corrupt';

/** Reads saved data. Unreadable data is kept aside under a separate key, never silently lost. */
export function loadData(storage: Storage): AppData | null {
  const raw = storage.getItem(DATA_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && (parsed as AppData).schemaVersion === 1) {
      return parsed as AppData;
    }
  } catch {
    // falls through to the backup below
  }
  storage.setItem(CORRUPT_KEY, raw);
  return null;
}

export function saveData(storage: Storage, data: AppData): void {
  storage.setItem(DATA_KEY, JSON.stringify(data));
}
