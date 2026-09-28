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
  mainIncomeSourceId: string | null; // defines the period; null: a month from the day of trackingStartDate
  categories: ExpenseCategory[]; // in the sheet's order; at most MAX_CATEGORIES active, at least one
  cushion: Cushion;
  theme: 'light' | 'dark' | 'auto';
  lastCategory: Category;
  favorites: Favorite[]; // at most MAX_FAVORITES, in display order
  targetDailyLimitKopecks: number | null; // «Хочу тратить N в день»; null: no target
}

export interface IncomeSource {
  id: string;
  kind: 'scholarship' | 'salary' | 'parents' | 'other';
  name: string;
  amountKopecks: number;
  // At most one of the three is set; all null means irregular, not forecast.
  dayOfMonth: number | null; // monthly income
  weekday: number | null; // weekly income: 1 = Monday … 7 = Sunday
  date: LocalDate | null; // one-off income on that day
  startDate: LocalDate; // occurrences before it are not expected
  isActive: boolean;
}

export interface MandatoryPayment {
  id: string;
  name: string;
  amountKopecks: number;
  // Exactly one of the three is set.
  dayOfMonth: number | null; // monthly payment
  weekday: number | null; // weekly payment: 1 = Monday … 7 = Sunday
  date: LocalDate | null; // one-off payment on that day
  startDate: LocalDate; // occurrences before it are not due
  isActive: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetKopecks: number;
  initialSavedKopecks: number;
  startDate: LocalDate;
  // Exactly one of the two is set.
  deadline: LocalDate | null; // saved evenly by day up to the deadline
  percent: number | null; // 1–99: saved as this percent of every income
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
  // 2 added IncomeSource.weekday, 3 settings.favorites, 4 settings.categories instead of reserves,
  // 5 one-off incomes, weekly and one-off payments, percent goals and the target daily limit
  schemaVersion: 5;
  settings: Settings;
  incomeSources: IncomeSource[];
  payments: MandatoryPayment[];
  goals: Goal[];
  transactions: Transaction[];
  daySummaries: DaySummary[];
}
