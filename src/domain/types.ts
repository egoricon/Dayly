// Data model agreed in CLAUDE.md. Change only after asking the user.

export type LocalDate = string; // 'YYYY-MM-DD', device-local calendar day

// 'groceries' and 'transport' are spent from reserves
export type Category = 'cafe' | 'delivery' | 'shopping' | 'fun' | 'groceries' | 'transport';

export type ReserveCategory = 'groceries' | 'transport';

export type Cushion =
  | { mode: 'fixed'; amountKopecks: number }
  | { mode: 'percent'; percent: number; baseKopecks: number; sinceDate: LocalDate };

export interface Settings {
  onboardingCompleted: boolean;
  trackingStartDate: LocalDate;
  mainIncomeSourceId: string | null; // defines the period; null means calendar month
  reserves: { groceriesKopecks: number; transportKopecks: number }; // per full period
  cushion: Cushion;
  theme: 'light' | 'dark' | 'auto';
  lastCategory: Category;
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
  schemaVersion: 2; // 2 added IncomeSource.weekday
  settings: Settings;
  incomeSources: IncomeSource[];
  payments: MandatoryPayment[];
  goals: Goal[];
  transactions: Transaction[];
  daySummaries: DaySummary[];
}
