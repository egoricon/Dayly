import type { AppData, Category, ExpenseCategory } from './types';

// Expense categories (schemaVersion 4): the built-in six, renamed, removed or joined by own ones.
// Any category can be a reserve; «Продукты» and «Транспорт» are reserves from the start.

export const MAX_CATEGORIES = 10;

/** The categories of a new user; the reserves are 0 until set. */
export function defaultCategories(groceriesKopecks = 0, transportKopecks = 0): ExpenseCategory[] {
  return [
    { id: 'cafe', name: 'Кафе', reserveKopecks: null, isActive: true },
    { id: 'delivery', name: 'Доставка', reserveKopecks: null, isActive: true },
    { id: 'shopping', name: 'Покупки', reserveKopecks: null, isActive: true },
    { id: 'fun', name: 'Развлечения', reserveKopecks: null, isActive: true },
    { id: 'groceries', name: 'Продукты', reserveKopecks: groceriesKopecks, isActive: true },
    { id: 'transport', name: 'Транспорт', reserveKopecks: transportKopecks, isActive: true },
  ];
}

export function findCategory(data: AppData, id: Category | null): ExpenseCategory | undefined {
  return id === null ? undefined : data.settings.categories.find((c) => c.id === id);
}

/** A removed category keeps its name for old expenses. */
export function categoryName(data: AppData, id: Category | null): string {
  return findCategory(data, id)?.name ?? 'Трата';
}

export function activeCategories(data: AppData): ExpenseCategory[] {
  return data.settings.categories.filter((c) => c.isActive);
}

/** Categories whose expenses spend a reserve first. A removed one holds no reserve any more. */
export function reserveCategories(data: AppData): ExpenseCategory[] {
  return data.settings.categories.filter((c) => c.isActive && c.reserveKopecks !== null);
}

export function isReserveCategory(data: AppData, id: Category | null): boolean {
  const category = findCategory(data, id);
  return category !== undefined && category.isActive && category.reserveKopecks !== null;
}

/** The category the sheet starts with: the last used one while it is active, else the first one. */
export function startCategory(data: AppData): Category {
  return findCategory(data, data.settings.lastCategory)?.isActive ? data.settings.lastCategory : (activeCategories(data)[0]?.id ?? 'cafe');
}
