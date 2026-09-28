import { useEffect, useRef } from 'react';
import { MAX_FAVORITES, restoreCategory } from '../appData';
import { cushionSavedBy, goalSavedBy, type BudgetResult } from '../domain/budget';
import { activeCategories, categoryName, MAX_CATEGORIES } from '../domain/categories';
import { addDays } from '../domain/dates';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { isCurrentPlan } from '../events';
import type { FeatureKey } from '../uiState';
import { formatDayMonth, scheduleText } from '../ui/labels';
import { percentRules } from '../ui/savings';
import { IncomeSplitBlock } from '../components/IncomeSplitBlock';
import { CategoryForm, CushionForm, FavoriteForm, GoalForm, IncomeForm, PaymentForm, PaymentsList, ReconcileForm } from './SettingsForms';
import { TargetForm, TargetSection } from './TargetForm';

export type FinanceRoute =
  | { screen: 'main'; section?: 'savings' } // 'savings': opened from the savings ring
  | { screen: 'income'; id: string | null }
  | { screen: 'payments' }
  | { screen: 'payment'; id: string | null }
  | { screen: 'category'; id: string | null }
  | { screen: 'cushion' }
  | { screen: 'goal'; id: string | null }
  | { screen: 'target' } // «Хочу тратить в день»
  | { screen: 'reconcile' }
  | { screen: 'favorite'; id: string | null };

export type Update = (change: (data: AppData) => AppData) => void;

export interface FinanceProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  route: FinanceRoute;
  onNavigate: (route: FinanceRoute) => void;
  update: Update;
  /** Whether a feature is on in «Настройки → Функции». */
  feature: (key: FeatureKey) => boolean;
}

/** «Финансы» (2i without the app settings): incomes, what is set aside, goals, categories, favourites, balance. Each row opens a form. */
export function Finances(props: FinanceProps) {
  const { data, budget, today, route, onNavigate, update } = props;
  const back = () => onNavigate({ screen: 'main' });
  // «Назад» brings the list back from the left; everything else enters from the right.
  const previous = useRef(route.screen);
  const cameBack = route.screen === 'main' && previous.current !== 'main';
  useEffect(() => {
    previous.current = route.screen;
  }, [route.screen]);
  // From the savings ring: «С каждого поступления» scrolls to itself; without percent rules, the goals.
  const focusSavings = route.screen === 'main' && route.section === 'savings';
  const goalsLabel = useRef<HTMLSpanElement>(null);
  const noPercentRules = percentRules(data).length === 0;
  useEffect(() => {
    if (focusSavings && noPercentRules) goalsLabel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focusSavings, noPercentRules]);

  switch (route.screen) {
    case 'income':
      return <IncomeForm {...props} id={route.id} onBack={back} />;
    case 'payments':
      return <PaymentsList {...props} onBack={back} />;
    case 'payment':
      return <PaymentForm {...props} id={route.id} onBack={() => onNavigate({ screen: 'payments' })} />;
    case 'category':
      return <CategoryForm {...props} id={route.id} onBack={back} />;
    case 'cushion':
      return <CushionForm {...props} onBack={back} />;
    case 'goal':
      return <GoalForm {...props} id={route.id} onBack={back} />;
    case 'target':
      return <TargetForm {...props} onBack={back} />;
    case 'reconcile':
      return <ReconcileForm {...props} onBack={back} />;
    case 'favorite':
      return <FavoriteForm {...props} id={route.id} onBack={back} />;
    case 'main':
      break;
  }

  // One-off incomes and payments of earlier periods are history; the calendar keeps them.
  const incomes = data.incomeSources.filter((s) => s.isActive && isCurrentPlan(s, budget.period));
  const payments = data.payments.filter((p) => p.isActive && isCurrentPlan(p, budget.period));
  const unpaid = budget.unpaidPayments.reduce((sum, p) => sum + p.amountKopecks, 0);
  const categories = activeCategories(data);
  const removedCategories = data.settings.categories.filter((c) => !c.isActive);
  const cushion = data.settings.cushion;
  const goals = data.goals.filter((g) => g.status === 'active');
  const periodEnd = addDays(budget.period.end, 1);
  const favorites = data.settings.favorites;

  return (
    <main className={`screen settings with-tabs${cameBack ? ' is-back' : ''}`}>
      <h1 className="screen-title">Финансы</h1>

      <span className="section-label">Доходы</span>
      {incomes.length > 0 && (
        <ul className="card list" data-testid="settings-incomes">
          {incomes.map((s) => (
            <li key={s.id}>
              <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'income', id: s.id })}>
                <span className="list-text">
                  <span className="list-name">
                    {s.name} · {scheduleText(s)}
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
        {budget.reserves.map((r) => (
          <li key={r.category}>
            <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'category', id: r.category })}>
              <span className="list-name">Резерв «{categoryName(data, r.category)}»</span>
              <span className="list-value">{formatKopecks(r.remainingKopecks)}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'cushion' })}>
            <span className="list-name">Подушка{cushion.mode === 'percent' ? ` · ${cushion.percent}% дохода` : ''}</span>
            <span className="list-value">{formatKopecks(cushionSavedBy(data, today))}</span>
          </button>
        </li>
      </ul>

      <IncomeSplitBlock
        data={data}
        today={today}
        onOpenCushion={() => onNavigate({ screen: 'cushion' })}
        onOpenGoal={(id) => onNavigate({ screen: 'goal', id })}
        focused={focusSavings}
      />

      <span className="section-label" ref={goalsLabel}>
        Коплю на
      </span>
      {goals.map((g) => {
        const saved = goalSavedBy(data, g, today);
        const perPeriod = goalSavedBy(data, g, budget.period.end) - goalSavedBy(data, g, addDays(budget.period.start, -1));
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
              {g.deadline !== null
                ? `по ${formatKopecks(perPeriod)} за период · к ${formatDayMonth(g.deadline)}`
                : `${g.percent}% с каждого поступления`}
            </span>
          </button>
        );
      })}
      <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'goal', id: null })}>
        + Добавить цель
      </button>

      <span className="section-label">Категории трат</span>
      <ul className="card list" data-testid="finance-categories">
        {categories.map((c) => (
          <li key={c.id}>
            <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'category', id: c.id })}>
              <span className="list-text">
                <span className="list-name">{c.name}</span>
                <span className="list-sub">
                  {c.reserveKopecks === null ? 'из дневного лимита' : c.reserveKopecks === 0 ? 'резерв не задан' : `резерв ${formatMoney(c.reserveKopecks)} на период`}
                </span>
              </span>
            </button>
          </li>
        ))}
        {removedCategories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="list-row is-removed"
              disabled={categories.length >= MAX_CATEGORIES}
              onClick={() => update((d) => restoreCategory(d, c.id))}
            >
              <span className="list-text">
                <span className="list-name">{c.name}</span>
                <span className="list-sub">убрана · нажми, чтобы вернуть</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {categories.length < MAX_CATEGORIES && (
        <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'category', id: null })}>
          + Добавить категорию
        </button>
      )}

      <span className="section-label">Любимые траты</span>
      {favorites.length > 0 && (
        <ul className="card list" data-testid="finance-favorites">
          {favorites.map((f) => (
            <li key={f.id}>
              <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'favorite', id: f.id })}>
                <span className="list-text">
                  <span className="list-name">{f.label}</span>
                  <span className="list-sub">{categoryName(data, f.category)}</span>
                </span>
                <span className="list-value">{formatKopecks(f.amountKopecks)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {favorites.length < MAX_FAVORITES && (
        <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'favorite', id: null })}>
          + Добавить любимую трату
        </button>
      )}

      <TargetSection data={data} budget={budget} onOpen={() => onNavigate({ screen: 'target' })} />

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

    </main>
  );
}
