import type { AppData, IncomeSource } from './domain/types';

export const DATA_KEY = 'dayly:data';
const CORRUPT_KEY = 'dayly:data:corrupt';

/**
 * Upgrades saved data step by step: version 2 added a weekday for weekly incomes,
 * version 3 added favourite expenses.
 */
function migrate(data: { schemaVersion: number }): AppData | null {
  let current = data as unknown as Record<string, unknown> & { schemaVersion: number };
  if (!Array.isArray(current.transactions) || !Array.isArray(current.incomeSources) || typeof current.settings !== 'object') return null;
  if (current.schemaVersion === 1) {
    const sources = current.incomeSources as Omit<IncomeSource, 'weekday'>[];
    current = { ...current, schemaVersion: 2, incomeSources: sources.map((s) => ({ ...s, weekday: null })) };
  }
  if (current.schemaVersion === 2) {
    const settings = current.settings as Omit<AppData['settings'], 'favorites'>;
    current = { ...current, schemaVersion: 3, settings: { ...settings, favorites: [] } };
  }
  return current.schemaVersion === 3 ? (current as unknown as AppData) : null;
}

/** Any saved or exported data brought to the current version; null when it is not Dayly data. */
export function upgradeData(value: unknown): AppData | null {
  if (typeof value !== 'object' || value === null || typeof (value as AppData).schemaVersion !== 'number') return null;
  return migrate(value as AppData);
}

/** Reads saved data, upgrading older versions. Unreadable data is kept aside under a separate key, never silently lost. */
export function loadData(storage: Storage): AppData | null {
  const raw = storage.getItem(DATA_KEY);
  if (raw === null) return null;
  try {
    const data = upgradeData(JSON.parse(raw));
    if (data) return data;
  } catch {
    // falls through to the backup below
  }
  storage.setItem(CORRUPT_KEY, raw);
  return null;
}

export function saveData(storage: Storage, data: AppData): void {
  storage.setItem(DATA_KEY, JSON.stringify(data));
}
