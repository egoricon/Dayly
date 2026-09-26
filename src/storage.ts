import type { AppData, IncomeSource } from './domain/types';

export const DATA_KEY = 'dayly:data';
const CORRUPT_KEY = 'dayly:data:corrupt';

/** Version 1 had monthly and irregular incomes only; version 2 adds a weekday for weekly ones. */
function migrate(data: { schemaVersion: number }): AppData | null {
  if (data.schemaVersion === 2) return data as AppData;
  if (data.schemaVersion === 1) {
    const v1 = data as unknown as Omit<AppData, 'schemaVersion' | 'incomeSources'> & { incomeSources: Omit<IncomeSource, 'weekday'>[] };
    return { ...v1, schemaVersion: 2, incomeSources: v1.incomeSources.map((s) => ({ ...s, weekday: null })) };
  }
  return null;
}

/** Reads saved data, upgrading older versions. Unreadable data is kept aside under a separate key, never silently lost. */
export function loadData(storage: Storage): AppData | null {
  const raw = storage.getItem(DATA_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as AppData).schemaVersion === 'number') {
      const data = migrate(parsed as AppData);
      if (data) return data;
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
