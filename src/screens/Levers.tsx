import { useMemo } from 'react';
import { FormScreen } from '../components/Form';
import type { BudgetResult } from '../domain/budget';
import { limitLevers } from '../domain/levers';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { leverEffect, leverTitle } from '../ui/homeHints';
import { useAnimatedNumber } from '../ui/motion';
import type { Update } from './Finances';
import '../styles/home-extras.css';

interface LeversProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: Update;
  onBack: () => void;
  /** Opens «Хочу тратить в день» in «Финансы». */
  onEditTarget: () => void;
}

/**
 * «Как дотянуть»: today's limit against «Хочу тратить N в день» and one-step changes that raise it,
 * biggest effect first. «Применить» makes the change, and the list is counted again from the new data.
 */
export function Levers({ data, budget, today, update, onBack, onEditTarget }: LeversProps) {
  const levers = useMemo(() => limitLevers(data, today), [data, today]);
  const target = data.settings.targetDailyLimitKopecks;
  const limit = budget.dailyLimitKopecks;
  const reached = target !== null && limit >= target;
  const shownLimit = useAnimatedNumber(limit);

  return (
    <FormScreen title="Как дотянуть" onBack={onBack}>
      <div className="card levers-status" data-testid="levers-status">
        <div className="levers-numbers">
          <span className="levers-number">
            <span className="levers-caption">Сейчас в день</span>
            <strong data-testid="levers-limit">{formatKopecks(shownLimit)}</strong>
          </span>
          {target !== null && (
            <span className="levers-number">
              <span className="levers-caption">Хочу</span>
              <strong data-testid="levers-target">{formatKopecks(target)}</strong>
            </span>
          )}
        </div>
        {target !== null && (
          <span className={`levers-verdict${reached ? ' is-reached' : ''}`} data-testid="levers-verdict">
            {reached ? 'Цель достигнута, лимит не меньше неё' : `Не хватает ${formatMoney(target - limit)} в день`}
          </span>
        )}
      </div>

      {!reached &&
        (levers.length > 0 ? (
          <>
            <span className="section-label">Что можно поменять</span>
            <ul className="card list levers-list" data-testid="levers">
              {levers.map((lever) => (
                <li key={`${lever.kind}|${lever.targetId}`} className="lever" data-testid="lever">
                  <span className="list-name" data-testid="lever-title">
                    {leverTitle(lever, data, today)}
                  </span>
                  <span className="lever-row">
                    <span className="lever-effect" data-testid="lever-effect">
                      {leverEffect(lever)}
                    </span>
                    <button type="button" className="lever-apply" onClick={() => update(lever.apply)}>
                      Применить
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="form-note">Каждый шаг меняет одну настройку в «Финансах». После него список считается заново, шаги можно повторять.</p>
          </>
        ) : (
          <div className="note-card" data-testid="levers-empty">
            <strong>Сейчас нечего подвинуть</strong>
            <span>Ни цели, ни резервы, ни подушка не поднимут лимит на шаг. Он вырастет, если сегодня потратить меньше: остаток дня переходит на следующие дни.</span>
          </div>
        ))}

      <button type="button" className="link-accent" onClick={onEditTarget}>
        {target === null ? 'Задать цель по лимиту →' : 'Изменить цель →'}
      </button>
    </FormScreen>
  );
}
