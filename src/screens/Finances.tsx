import { useEffect, useRef } from 'react';
import { MAX_FAVORITES, restoreCategory } from '../appData';
import type { BudgetResult } from '../domain/budget';
import { activeCategories, categoryName, MAX_CATEGORIES } from '../domain/categories';
import { addDays } from '../domain/dates';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { isCurrentPlan } from '../events';
import type { FeatureKey } from '../uiState';
import { formatDayMonth, scheduleText } from '../ui/labels';
import { CalendarBlock, type CalendarFocus } from './CalendarScreen';
import { CategoryForm, FavoriteForm, IncomeForm, PaymentForm, PaymentsList, ReconcileForm } from './SettingsForms';
import { TargetForm, TargetSection } from './TargetForm';

// The cushion and the goals live in «Копилка» since update 2 (src/screens/Savings.tsx).
export type FinanceRoute =
  | { screen: 'main' }
  | { screen: 'income'; id: string | null }
  | { screen: 'payments' }
  | { screen: 'payment'; id: string | null }
  | { screen: 'category'; id: string | null }
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
  /** Set when the calendar was asked for (from the home screen or «Что нового»): it scrolls into view. */
  calendarFocus?: CalendarFocus | null;
}

/**
 * «Финансы»: what comes in and goes out. The month calendar on top (update 2), then incomes, payments,
 * categories, favourites, the target daily limit and the balance. Each row opens a form.
 */
export function Finances(props: FinanceProps) {
  const { data, budget, today, route, onNavigate, update, feature } = props;
  const back = () => onNavigate({ screen: 'main' });
  // «Назад» brings the list back from the left; everything else enters from the right.
  const previous = useRef(route.screen);
  const cameBack = route.screen === 'main' && previous.current !== 'main';
  useEffect(() => {
    previous.current = route.screen;
  }, [route.screen]);

  switch (route.screen) {
    case 'income':
      return <IncomeForm {...props} id={route.id} onBack={back} />;
    case 'payments':
      return <PaymentsList {...props} onBack={back} />;
    case 'payment':
      return <PaymentForm {...props} id={route.id} onBack={() => onNavigate({ screen: 'payments' })} />;
    case 'category':
      return <CategoryForm {...props} id={route.id} onBack={back} />;
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
  const periodEnd = addDays(budget.period.end, 1);
  const favorites = data.settings.favorites;

  return (
    <main className={`screen settings with-tabs${cameBack ? ' is-back' : ''}`}>
      <h1 className="screen-title">Финансы</h1>

      {feature('calendar') && <CalendarBlock data={data} budget={budget} today={today} update={update} focus={props.calendarFocus ?? null} />}

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

      <span className="section-label">Обязательные платежи</span>
      <ul className="card list" data-testid="finance-payments">
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'payments' })}>
            <span className="list-text">
              <span className="list-name">Все платежи · {payments.length}</span>
              <span className="list-sub">не оплачено до {formatDayMonth(periodEnd)}</span>
            </span>
            <span className="list-value">{formatKopecks(unpaid)}</span>
          </button>
        </li>
      </ul>

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
