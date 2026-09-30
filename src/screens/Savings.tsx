import { useEffect, useRef } from 'react';
import { IncomeSplitBlock } from '../components/IncomeSplitBlock';
import { cushionSavedBy, goalSavedBy, type BudgetResult } from '../domain/budget';
import { addDays } from '../domain/dates';
import { formatKopecks } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { formatDayMonth } from '../ui/labels';
import type { Update } from './Finances';
import { CushionForm, GoalForm } from './SettingsForms';

export type SavingsRoute = { screen: 'main' } | { screen: 'cushion' } | { screen: 'goal'; id: string | null };

interface SavingsProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  route: SavingsRoute;
  onNavigate: (route: SavingsRoute) => void;
  update: Update;
}

/**
 * «Копилка» (update 2), first version: the cushion, «С каждого поступления» and the goals, moved here
 * from «Финансы» as they were. Each row opens its form inside this tab.
 */
export function Savings({ data, budget, today, route, onNavigate, update }: SavingsProps) {
  const back = () => onNavigate({ screen: 'main' });
  // «Назад» brings the list back from the left; everything else enters from the right.
  const previous = useRef(route.screen);
  const cameBack = route.screen === 'main' && previous.current !== 'main';
  useEffect(() => {
    previous.current = route.screen;
  }, [route.screen]);

  const forms = { data, budget, today, update, onBack: back };
  switch (route.screen) {
    case 'cushion':
      return <CushionForm {...forms} />;
    case 'goal':
      return <GoalForm {...forms} id={route.id} />;
    case 'main':
      break;
  }

  const cushion = data.settings.cushion;
  const goals = data.goals.filter((g) => g.status === 'active');

  return (
    <main className={`screen settings with-tabs${cameBack ? ' is-back' : ''}`}>
      <h1 className="screen-title">Копилка</h1>

      <ul className="card list" data-testid="savings-cushion">
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
      />

      <span className="section-label">Коплю на</span>
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
    </main>
  );
}
