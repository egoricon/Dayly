import { cushionSavedBy, goalSavedBy, type BudgetResult } from '../domain/budget';
import { addDays } from '../domain/dates';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, LocalDate, ReserveCategory } from '../domain/types';
import { setTheme } from '../appData';
import { Segmented } from '../components/Form';
import { formatDayMonth } from '../ui/labels';
import { CushionForm, GoalForm, IncomeForm, PaymentForm, PaymentsList, ReconcileForm, ReserveForm } from './SettingsForms';

export type SettingsRoute =
  | { screen: 'main' }
  | { screen: 'income'; id: string | null }
  | { screen: 'payments' }
  | { screen: 'payment'; id: string | null }
  | { screen: 'reserve'; category: ReserveCategory }
  | { screen: 'cushion' }
  | { screen: 'goal'; id: string | null }
  | { screen: 'reconcile' };

export type Update = (change: (data: AppData) => AppData) => void;

export interface SettingsProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
  update: Update;
}

/** 2i: incomes, what is set aside until the next income, goals, balance. Each row opens a form. */
export function Settings(props: SettingsProps) {
  const { data, budget, today, route, onNavigate, update } = props;
  const back = () => onNavigate({ screen: 'main' });

  switch (route.screen) {
    case 'income':
      return <IncomeForm {...props} id={route.id} onBack={back} />;
    case 'payments':
      return <PaymentsList {...props} onBack={back} />;
    case 'payment':
      return <PaymentForm {...props} id={route.id} onBack={() => onNavigate({ screen: 'payments' })} />;
    case 'reserve':
      return <ReserveForm {...props} category={route.category} onBack={back} />;
    case 'cushion':
      return <CushionForm {...props} onBack={back} />;
    case 'goal':
      return <GoalForm {...props} id={route.id} onBack={back} />;
    case 'reconcile':
      return <ReconcileForm {...props} onBack={back} />;
    case 'main':
      break;
  }

  const incomes = data.incomeSources.filter((s) => s.isActive);
  const payments = data.payments.filter((p) => p.isActive);
  const unpaid = budget.unpaidPayments.reduce((sum, p) => sum + p.amountKopecks, 0);
  const reserve = (category: ReserveCategory) => budget.reserves.find((r) => r.category === category)!.remainingKopecks;
  const cushion = data.settings.cushion;
  const goals = data.goals.filter((g) => g.status === 'active');
  const periodEnd = addDays(budget.period.end, 1);

  return (
    <main className="screen settings with-tabs">
      <h1 className="screen-title">Настройки</h1>

      <span className="section-label">Доходы</span>
      {incomes.length > 0 && (
        <ul className="card list" data-testid="settings-incomes">
          {incomes.map((s) => (
            <li key={s.id}>
              <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'income', id: s.id })}>
                <span className="list-text">
                  <span className="list-name">
                    {s.name} · {s.dayOfMonth === null ? 'нерегулярно' : `${s.dayOfMonth}-го`}
                  </span>
                  {s.id === data.settings.mainIncomeSourceId && <span className="list-sub">основное, от него считается период</span>}
                </span>
                <span className="list-value">{formatKopecks(s.amountKopecks)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'income', id: null })}>
        + Добавить доход
      </button>

      <span className="section-label">Откладываем до {formatDayMonth(periodEnd)}</span>
      <ul className="card list" data-testid="settings-set-aside">
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'payments' })}>
            <span className="list-name">Обязательные платежи · {payments.length}</span>
            <span className="list-value">{formatKopecks(unpaid)}</span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'reserve', category: 'groceries' })}>
            <span className="list-name">Резерв на продукты</span>
            <span className="list-value">{formatKopecks(reserve('groceries'))}</span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'reserve', category: 'transport' })}>
            <span className="list-name">Резерв на транспорт</span>
            <span className="list-value">{formatKopecks(reserve('transport'))}</span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'cushion' })}>
            <span className="list-name">Подушка{cushion.mode === 'percent' ? ` · ${cushion.percent}% дохода` : ''}</span>
            <span className="list-value">{formatKopecks(cushionSavedBy(data, today))}</span>
          </button>
        </li>
      </ul>

      <span className="section-label">Коплю на</span>
      {goals.map((g) => {
        const saved = goalSavedBy(g, today);
        const perPeriod = goalSavedBy(g, budget.period.end) - goalSavedBy(g, addDays(budget.period.start, -1));
        return (
          <button key={g.id} type="button" className="card goal-card" onClick={() => onNavigate({ screen: 'goal', id: g.id })}>
            <span className="goal-head">
              <span className="list-name">{g.name}</span>
              <span className="list-value">
                {Math.floor(saved / 100)} из {Math.floor(g.targetKopecks / 100)}
              </span>
            </span>
            <span className="progress">
              <span style={{ width: `${Math.min(100, (saved / g.targetKopecks) * 100)}%` }} />
            </span>
            <span className="list-sub">
              по {formatKopecks(perPeriod)} за период · к {formatDayMonth(g.deadline)}
            </span>
          </button>
        );
      })}
      <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'goal', id: null })}>
        + Добавить цель
      </button>

      <span className="section-label">Баланс</span>
      <ul className="card list">
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'reconcile' })}>
            <span className="list-text">
              <span className="list-name">Сверить баланс</span>
              <span className="list-sub">если цифра разошлась с реальными деньгами</span>
            </span>
            <span className="list-value" data-testid="settings-balance">
              {formatMoney(budget.balanceKopecks)}
            </span>
          </button>
        </li>
      </ul>

      <span className="section-label">Тема</span>
      <Segmented
        options={[
          { value: 'light', label: 'Светлая' },
          { value: 'dark', label: 'Тёмная' },
          { value: 'auto', label: 'Авто' },
        ]}
        value={data.settings.theme}
        onChange={(theme) => update((d) => setTheme(d, theme))}
      />
    </main>
  );
}
