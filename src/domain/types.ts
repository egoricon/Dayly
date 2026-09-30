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

export type Cushion = (
  | { mode: 'fixed'; amountKopecks: number }
  | { mode: 'percent'; percent: number; baseKopecks: number; sinceDate: LocalDate }
) & {
  targetKopecks: number | null; // optional target for the piggy fill and the progress; the cushion is never capped by it
};

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
  roundUp: { goalId: string | null } | null; // expenses rounded up to 1 BYN into a goal (null: the cushion); null: off
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

/** A goal's fixed amount on a schedule: exactly one of dayOfMonth and weekday is set. */
export interface GoalSchedule {
  amountKopecks: number;
  dayOfMonth: number | null; // every month on this day (1–31; a short month takes its last day)
  weekday: number | null; // every week: 1 = Monday … 7 = Sunday
}

export interface Goal {
  id: string;
  name: string;
  targetKopecks: number;
  initialSavedKopecks: number;
  startDate: LocalDate;
  // At most one of the three is set; all null: saved by hand only («вручную»).
  deadline: LocalDate | null; // saved evenly by day up to the deadline
  percent: number | null; // 1–99: saved as this percent of every income
  schedule: GoalSchedule | null; // a fixed amount every week or month
  status: 'active' | 'done' | 'cancelled';
}

/**
 * Money put into or taken out of a goal or the cushion by hand, from the day's leftover, from the
 * period's leftover or by rounding up an expense. Income shares and scheduled amounts are computed, not stored.
 */
export interface SavingsMove {
  id: string;
  goalId: string | null; // null: the cushion
  amountKopecks: number; // signed: + put in, − taken out
  date: LocalDate; // the day it counts from
  createdAt: string; // ISO time
  source: 'manual' | 'withdraw' | 'leftover' | 'period' | 'roundup';
  transactionId: string | null; // roundup: the expense it rounds; otherwise null
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
  // 5 one-off incomes, weekly and one-off payments, percent goals and the target daily limit,
  // 6 savings moves, goals on a schedule and by hand, rounding expenses up, the cushion's target
  schemaVersion: 6;
  settings: Settings;
  incomeSources: IncomeSource[];
  payments: MandatoryPayment[];
  goals: Goal[];
  transactions: Transaction[];
  daySummaries: DaySummary[];
  savingsMoves: SavingsMove[];
}
