import { useEffect, useState } from 'react';
import '../styles/savings.css';
import { setAsideLeftover } from '../appData';
import type { BudgetResult } from '../domain/budget';
import { addDays } from '../domain/dates';
import type { AppData, LocalDate } from '../domain/types';
import type { FeatureKey } from '../uiState';
import { afterLeave } from '../ui/motion';
import {
  carrySavedKey,
  intoTarget,
  leftoverKey,
  limitAfterSetAside,
  moneyInText,
  pickSavingsCard,
  setAsideAmount,
  summaryText,
  targetOptions,
  type TargetOption,
} from '../ui/savings';

/** How long «Отложено 8,00 BYN в «Наушники»» stays. */
const TOAST_MS = 3000;

interface SavingsCardsProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: (change: (data: AppData) => AppData) => void;
  feature: (key: FeatureKey) => boolean;
  isBannerHidden: (key: string) => boolean;
  onHideBanner: (key: string) => void;
  isCardDismissed: (key: string) => boolean;
  onDismissCard: (key: string) => void;
}

/**
 * The home screen's savings card, one at a time: «Итоги периода» in the first days of a period,
 * else «Вчера осталось…». Setting money aside moves no money, so the balance stays and the limit goes down.
 */
export function SavingsCards(props: SavingsCardsProps) {
  const { data, budget, today, update, onHideBanner, onDismissCard } = props;
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const card = pickSavingsCard(props);
  const yesterday = addDays(today, -1);
  const setAside = (option: TargetOption, amountKopecks: number) => {
    update((d) => setAsideLeftover(d, option.target, amountKopecks, today));
    setToast(`Отложено ${moneyInText(amountKopecks)} ${intoTarget(option)}`);
  };

  return (
    <>
      {card?.kind === 'summary' && (
        <SavingsCard
          key={card.key}
          testId="period-summary"
          title="Прошлый период"
          text={summaryText(card.summary)}
          offeredKopecks={card.summary.leftoverKopecks}
          question="Отправить остаток"
          setAsideLabel="Отправить в копилку"
          laterLabel="Закрыть"
          data={data}
          budget={budget}
          today={today}
          onSetAside={(option, amount) => {
            setAside(option, amount);
            // On the first day of a period yesterday's leftover is part of the period's one.
            if (today === budget.period.start) onHideBanner(carrySavedKey(yesterday));
          }}
          onDone={() => {
            // One savings question a day: after this card the leftover one waits till tomorrow.
            onDismissCard(card.key);
            onHideBanner(leftoverKey(yesterday));
          }}
        />
      )}
      {card?.kind === 'leftover' && (
        <SavingsCard
          key={card.key}
          testId="leftover-card"
          title={`Вчера осталось ${moneyInText(card.carryKopecks)}`}
          offeredKopecks={card.carryKopecks}
          question="Отложить"
          setAsideLabel="Отложить"
          laterLabel="Не сейчас"
          data={data}
          budget={budget}
          today={today}
          onSetAside={(option, amount) => {
            setAside(option, amount);
            // The money is in savings now, so «+8,00 с вчера» would say it is still free.
            onHideBanner(carrySavedKey(yesterday));
          }}
          onDone={() => onHideBanner(card.key)}
        />
      )}
      {toast && (
        <div className="toast" role="status" data-testid="savings-toast">
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}

interface SavingsCardProps {
  testId: string;
  title: string;
  text?: string;
  offeredKopecks: number;
  /** «Отложить» or «Отправить остаток»: the question before the target, «…в «Наушники»?». */
  question: string;
  setAsideLabel: string;
  laterLabel: string;
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  onSetAside: (option: TargetOption, amountKopecks: number) => void;
  /** The card is answered either way and leaves. */
  onDone: () => void;
}

/** A banner-like card with a choice of goal or cushion and what the limit becomes. */
function SavingsCard(props: SavingsCardProps) {
  const { data, budget, today, offeredKopecks } = props;
  const options = targetOptions(data, today).filter((o) => setAsideAmount(budget, o, offeredKopecks) > 0);
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? null);
  const [leaving, setLeaving] = useState(false);
  const option = options.find((o) => o.key === selectedKey) ?? options[0];
  const amount = option ? setAsideAmount(budget, option, offeredKopecks) : 0;
  // A second tap while the card leaves must not set the money aside twice.
  const leave = (then: () => void) => {
    if (leaving) return;
    setLeaving(true);
    afterLeave(then);
  };

  return (
    <div className={`card banner savings-card${leaving ? ' is-leaving' : ''}`} data-testid={props.testId}>
      <strong>{props.title}</strong>
      {props.text && <span className="banner-sub">{props.text}</span>}
      {option && (
        <>
          <span className="banner-sub">
            {props.question} {intoTarget(option)}?
          </span>
          {options.length > 1 && (
            <div className="chips" role="group" aria-label="Куда отложить">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`chip${o.key === option.key ? ' is-selected' : ''}`}
                  aria-pressed={o.key === option.key}
                  onClick={() => setSelectedKey(o.key)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <span className="savings-card-note" data-testid="savings-card-note">
            {amount < offeredKopecks ? `Поместится ${moneyInText(amount)}, лимит` : 'Лимит'} станет{' '}
            {moneyInText(limitAfterSetAside(data, option, amount, today))} в день
          </span>
        </>
      )}
      <div className="banner-actions">
        {option && (
          <button
            type="button"
            className="banner-yes"
            onClick={() =>
              leave(() => {
                props.onSetAside(option, amount);
                props.onDone();
              })
            }
          >
            {props.setAsideLabel}
          </button>
        )}
        <button type="button" className="banner-other" onClick={() => leave(props.onDone)}>
          {props.laterLabel}
        </button>
      </div>
    </div>
  );
}
