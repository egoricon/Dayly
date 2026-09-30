import { defaultCategories } from './domain/categories';
import type { AppData, Goal, IncomeSource, MandatoryPayment } from './domain/types';

export const DATA_KEY = 'dayly:data';
const CORRUPT_KEY = 'dayly:data:corrupt';

/**
 * Upgrades saved data step by step: version 2 added a weekday for weekly incomes,
 * version 3 added favourite expenses, version 4 own categories and reserves,
 * version 5 one-off incomes, weekly and one-off payments, percent goals and the target daily limit,
 * version 6 savings moves, goals on a schedule and by hand, rounding expenses up and the cushion's target.
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
  if (current.schemaVersion === 3) {
    // Reserves became categories with a reserve; the built-in six keep their ids, so expenses stay as they are.
    const { reserves, ...settings } = current.settings as Record<string, unknown> & {
      reserves?: { groceriesKopecks?: number; transportKopecks?: number };
    };
    const categories = defaultCategories(reserves?.groceriesKopecks ?? 0, reserves?.transportKopecks ?? 0);
    current = { ...current, schemaVersion: 4, settings: { ...settings, categories } };
  }
  if (current.schemaVersion === 4) {
    // Everything planned so far repeats, every goal has a deadline, and there is no target limit.
    const sources = current.incomeSources as Omit<IncomeSource, 'date'>[];
    const payments = (current.payments ?? []) as Omit<MandatoryPayment, 'weekday' | 'date'>[];
    const goals = (current.goals ?? []) as Omit<Goal, 'percent'>[];
    current = {
      ...current,
      schemaVersion: 5,
      settings: { ...(current.settings as object), targetDailyLimitKopecks: null },
      incomeSources: sources.map((s) => ({ ...s, date: null })),
      payments: payments.map((p) => ({ ...p, weekday: null, date: null })),
      goals: goals.map((g) => ({ ...g, percent: null })),
    };
  }
  if (current.schemaVersion === 5) {
    // Nothing was moved by hand yet: what update 1 set aside is already in the goals' and cushion's base.
    const settings = current.settings as Omit<AppData['settings'], 'roundUp' | 'cushion'> & { cushion: object };
    const goals = (current.goals ?? []) as Omit<Goal, 'schedule'>[];
    current = {
      ...current,
      schemaVersion: 6,
      settings: { ...settings, roundUp: null, cushion: { ...settings.cushion, targetKopecks: null } },
      goals: goals.map((g) => ({ ...g, schedule: null })),
      savingsMoves: [],
    };
  }
  return current.schemaVersion === 6 ? (current as unknown as AppData) : null;
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
