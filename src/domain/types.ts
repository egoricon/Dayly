// Data model agreed in CLAUDE.md. Change only after asking the user.

export type LocalDate = string; // 'YYYY-MM-DD', device-local calendar day

/** Id of an expense category: 'cafe', 'delivery', 'shopping', 'fun', 'groceries', 'transport' built in, own ones generated. */
export type Category = string;

/** An expense category of the input sheet. With a reserve, its expenses spend the reserve first. */
export interface ExpenseCategory {
  id: Category;
  name: string;
  reserveKopecks: number | null; // per full period; null: expenses go to the daily limit
  isActive: boolean; // false: removed from the sheet, old expenses keep its name; can be brought back
}

export type Cushion =
  | { mode: 'fixed'; amountKopecks: number }
  | { mode: 'percent'; percent: number; baseKopecks: number; sinceDate: LocalDate };

/** A favourite expense on the home screen: one tap adds it. */
export interface Favorite {
  id: string;
  label: string; // shown on the button and as the expense's name in the history
  amountKopecks: number;
  category: Category;
}

export interface Settings {
  onboardingCompleted: boolean;
  trackingStartDate: LocalDate;
  mainIncomeSourceId: string | null; // defines the period; null means calendar month
  categories: ExpenseCategory[]; // in the sheet's order; at most MAX_CATEGORIES active, at least one
  cushion: Cushion;
  theme: 'light' | 'dark' | 'auto';
  lastCategory: Category;
  favorites: Favorite[]; // at most MAX_FAVORITES, in display order
}

export interface IncomeSource {
  id: string;
  kind: 'scholarship' | 'salary' | 'parents' | 'other';
  name: string;
  amountKopecks: number;
  dayOfMonth: number | null; // monthly income; null for weekly and irregular
  weekday: number | null; // weekly income: 1 = Monday … 7 = Sunday; both null means irregular, not forecast
  startDate: LocalDate;
  isActive: boolean;
}

export interface MandatoryPayment {
  id: string;
  name: string;
  amountKopecks: number;
  dayOfMonth: number;
  startDate: LocalDate;
  isActive: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetKopecks: number;
  initialSavedKopecks: number;
  startDate: LocalDate;
  deadline: LocalDate;
  status: 'active' | 'done' | 'cancelled';
}

export interface Transaction {
  id: string;
  type: 'expense' | 'income' | 'adjustment';
  amountKopecks: number; // expense and income > 0; adjustment is signed
  date: LocalDate;
  createdAt: string; // ISO time
  category: Category | null;
  incomeSourceId: string | null;
  paymentId: string | null;
  goalId: string | null;
  plannedDate: LocalDate | null; // which planned occurrence this operation closes
  note: string | null;
}

export interface DaySummary {
  date: LocalDate;
  dailyLimitKopecks: number;
}

export interface AppData {
  schemaVersion: 4; // 2 added IncomeSource.weekday, 3 settings.favorites, 4 settings.categories instead of reserves
  settings: Settings;
  incomeSources: IncomeSource[];
  payments: MandatoryPayment[];
  goals: Goal[];
  transactions: Transaction[];
  daySummaries: DaySummary[];
}
