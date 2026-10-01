import { useEffect, useRef, useState } from 'react';
import '../styles/jars.css';
import { buyGoal, deleteSavingsMove, setRoundUp } from '../appData';
import { BottomSheet } from '../components/BottomSheet';
import { IncomeSplitBlock } from '../components/IncomeSplitBlock';
import { MoveSheet, type MoveKind } from '../components/MoveSheet';
import { Piggy } from '../components/Piggy';
import type { BudgetResult } from '../domain/budget';
import { savingsHistory, type SavingsHistoryRow } from '../domain/jarHistory';
import { jarRoom, jarsOf, MILESTONES, piggyFill, targetGoalId, type Jar, type SavingsTarget } from '../domain/jars';
import { formatMoney } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import type { FeatureKey } from '../uiState';
import {
  fillText,
  fullJarKeys,
  historyRowText,
  isDeletableRow,
  isJarFull,
  jarAmountLabel,
  jarAmountText,
  jarWayText,
  moveDeletion,
  roundUpNote,
  savingsSummary,
  shortDate,
  signedKopecks,
  type MoveDeletion,
} from '../ui/jars';
import { moneyInText } from '../ui/savings';
import type { Update } from './Finances';
import { CushionForm, GoalForm } from './JarForm';

/**
 * Inside «Копилка»: the tab itself (with a «Положить» / «Забрать» sheet open, e.g. from «Взять из подушки»
 * on the home screen), the cushion's settings or a goal's (null: a new jar).
 */
export type SavingsRoute =
  | { screen: 'main'; sheet?: { kind: MoveKind; jar: string } }
  | { screen: 'cushion' }
  | { screen: 'goal'; id: string | null };

interface SavingsProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  route: SavingsRoute;
  onNavigate: (route: SavingsRoute) => void;
  update: Update;
  feature: (key: FeatureKey) => boolean;
  onFeatureChange: (key: FeatureKey, on: boolean) => void;
  /** Jars the piggy has already cheered for (dayly:ui), and remembering new ones. */
  celebratedJars: string[];
  onCelebrate: (keys: string[]) => void;
}

/** How many rows of «История» show before «Показать все». */
export const HISTORY_ROWS = 20;

/** How long the piggy stays happy after a jar got full. */
const CHEER_MS = 2400;

/**
 * «Копилка» (update 2, map section 2): the piggy, «Положить» and «Забрать», the jars, «Как копим» and
 * the history of moves. Every jar opens its settings inside the tab.
 */
export function Savings(props: SavingsProps) {
  const { data, budget, today, route, onNavigate, update } = props;
  const back = () => onNavigate({ screen: 'main' });
  // «Назад» brings the tab back from the left; everything else enters from the right.
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
      return <SavingsMain {...props} sheet={route.sheet ?? null} cameBack={cameBack} />;
  }
}

type MainProps = SavingsProps & { sheet: { kind: MoveKind; jar: string } | null; cameBack: boolean };

function SavingsMain({ data, today, onNavigate, update, feature, onFeatureChange, celebratedJars, onCelebrate, sheet: askedSheet, cameBack }: MainProps) {
  const [sheet, setSheet] = useState(askedSheet);
  const [showAll, setShowAll] = useState(false);
  const [actionRow, setActionRow] = useState<SavingsHistoryRow | null>(null);
  const [buying, setBuying] = useState<Jar | null>(null);
  const [cheer, setCheer] = useState(false);

  const jars = jarsOf(data, today);
  const piggy = piggyFill(data, today);
  const summary = savingsSummary(data, today, piggy.savedKopecks);
  const allFull = piggy.fill !== null && piggy.fill >= 1;
  const history = savingsHistory(data, today);
  const rows = showAll ? history : history.slice(0, HISTORY_ROWS);

  // A jar that got full for the first time: the piggy is happy for a moment, with confetti.
  const fresh = fullJarKeys(data, today).filter((key) => !celebratedJars.includes(key));
  const freshKey = fresh.join('|');
  const celebrate = useRef(onCelebrate);
  celebrate.current = onCelebrate;
  useEffect(() => {
    if (freshKey === '') return;
    celebrate.current(freshKey.split('|'));
    setCheer(true);
  }, [freshKey]);
  useEffect(() => {
    if (!cheer) return;
    const timer = window.setTimeout(() => setCheer(false), CHEER_MS);
    return () => window.clearTimeout(timer);
  }, [cheer]);

  const openSheet = (kind: MoveKind) => setSheet({ kind, jar: '' });
  const closeSheet = () => {
    setSheet(null);
    // A sheet asked for by the route opens only once.
    if (askedSheet) onNavigate({ screen: 'main' });
  };

  return (
    <main className={`screen settings with-tabs savings-screen${cameBack ? ' is-back' : ''}`}>
      <h1 className="screen-title">Копилка</h1>

      <div className="savings-top">
        <Piggy fill={piggy.fill} totalKopecks={piggy.savedKopecks} full={allFull} cheer={cheer} />
        <div className="savings-total">
          <strong data-testid="savings-total">{summary.total}</strong>
          {summary.period && <span data-testid="savings-period">{summary.period}</span>}
        </div>
        <div className="savings-actions">
          <button type="button" className="button-primary savings-action" onClick={() => openSheet('put')}>
            Положить
          </button>
          <button type="button" className="button-secondary savings-action" onClick={() => openSheet('take')}>
            Забрать
          </button>
        </div>
      </div>

      <span className="section-label">Банки</span>
      {jars.map((jar) => (
        <JarCard
          key={jar.key}
          jar={jar}
          data={data}
          today={today}
          onOpen={() => onNavigate(jar.kind === 'cushion' ? { screen: 'cushion' } : { screen: 'goal', id: jar.key })}
          onBuy={() => setBuying(jar)}
        />
      ))}
      <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'goal', id: null })}>
        + Новая банка
      </button>

      <span className="section-label">Как копим</span>
      <IncomeSplitBlock data={data} today={today} update={update} />
      <SavingsSwitches data={data} today={today} update={update} leftover={feature('leftover')} onLeftover={(on) => onFeatureChange('leftover', on)} />

      <span className="section-label">История</span>
      {history.length === 0 ? (
        <p className="empty-note savings-empty">Здесь будет всё, что положено в копилку и забрано из неё.</p>
      ) : (
        <ul className="card list savings-history" data-testid="savings-history">
          {rows.map((row) => (
            <HistoryRow key={row.key} row={row} today={today} onOpen={isDeletableRow(row) ? () => setActionRow(row) : undefined} />
          ))}
          {history.length > HISTORY_ROWS && (
            <li>
              <button type="button" className="list-toggle" onClick={() => setShowAll((all) => !all)}>
                {showAll ? 'Свернуть' : `Показать все (${history.length})`}
              </button>
            </li>
          )}
        </ul>
      )}

      {sheet && (
        <MoveSheet
          kind={sheet.kind}
          data={data}
          today={today}
          initialKey={sheet.jar}
          onSave={(next) => update(() => next)}
          onClose={closeSheet}
        />
      )}
      {actionRow && <MoveActions row={actionRow} data={data} today={today} update={update} onClose={() => setActionRow(null)} />}
      {buying && <BuySheet jar={buying} today={today} update={update} onClose={() => setBuying(null)} />}
    </main>
  );
}

interface JarCardProps {
  jar: Jar;
  data: AppData;
  today: LocalDate;
  onOpen: () => void;
  onBuy: () => void;
}

/** A jar: name, «80 из 150», progress with marks at 25, 50 and 75 %, how it saves and when it fills. */
function JarCard({ jar, data, today, onOpen, onBuy }: JarCardProps) {
  const full = isJarFull(jar);
  const way = jarWayText(data, jar, today);
  const fill = fillText(data, jar, today);
  const sub = [way, fill].filter(Boolean).join(' · ');
  const label = `${jar.name}, ${jarAmountLabel(jar)}, ${full ? 'полна' : sub}`;
  return (
    <div className={`card jar-card${full ? ' is-full' : ''}`} data-testid="jar-card" data-jar={jar.key}>
      <button type="button" className="jar-main" aria-label={label} onClick={onOpen}>
        <span className="goal-head">
          <span className="list-name">{jar.name}</span>
          <span className="list-value">{jarAmountText(jar)}</span>
        </span>
        {jar.progress !== null && (
          <span className="progress jar-progress" aria-hidden="true">
            <span style={{ width: `${jar.progress * 100}%` }} />
            {MILESTONES.filter((m) => m < 100).map((m) => (
              <i key={m} className={`jar-mark${jar.progress! >= m / 100 ? ' is-reached' : ''}`} style={{ left: `${m}%` }} />
            ))}
          </span>
        )}
        <span className="list-sub">{full ? (jar.kind === 'cushion' ? 'цель подушки достигнута' : 'Банка полна!') : sub}</span>
      </button>
      {full && jar.kind !== 'cushion' && (
        <div className="jar-full-actions">
          <button type="button" className="banner-yes" onClick={onBuy}>
            Купил
          </button>
          <button type="button" className="banner-other" onClick={onOpen}>
            Коплю дальше
          </button>
        </div>
      )}
    </div>
  );
}

/** «Округлять траты до 1 BYN» and into which jar; «Остаток дня» asked about in the morning or not. */
function SavingsSwitches({ data, today, update, leftover, onLeftover }: { data: AppData; today: LocalDate; update: Update; leftover: boolean; onLeftover: (on: boolean) => void }) {
  const roundUp = data.settings.roundUp;
  const chosen = roundUp === null ? null : (roundUp.goalId ?? 'cushion');
  // The cushion and every goal that can still take money, and the chosen one even when it is full.
  const jars = jarsOf(data, today).filter((j) => j.kind === 'cushion' || j.key === chosen || jarRoom(data, j.target, today) > 0);
  const note = roundUpNote(data, today);
  const choose = (target: SavingsTarget | null) => update((d) => setRoundUp(d, target));
  return (
    <ul className="card list savings-switches">
      <li>
        <button type="button" role="switch" aria-checked={roundUp !== null} className="list-row" onClick={() => choose(roundUp === null ? { cushion: true } : null)}>
          <span className="list-text">
            <span className="list-name">Округлять траты до 1 BYN</span>
            <span className="list-sub" data-testid="roundup-note">
              {note ?? 'Сдача с каждой траты — в копилку'}
            </span>
          </span>
          <span className={`switch${roundUp !== null ? ' is-on' : ''}`} aria-hidden="true" />
        </button>
        {roundUp !== null && jars.length > 1 && (
          <div className="chips chips-left roundup-jars" role="group" aria-label="Куда округлять">
            {jars.map((j) => (
              <button
                key={j.key}
                type="button"
                className={`chip${j.key === chosen ? ' is-selected' : ''}`}
                aria-pressed={j.key === chosen}
                onClick={() => choose(j.target)}
              >
                {j.name}
              </button>
            ))}
          </div>
        )}
      </li>
      <li>
        <button type="button" role="switch" aria-checked={leftover} className="list-row" onClick={() => onLeftover(!leftover)}>
          <span className="list-text">
            <span className="list-name">Остаток дня</span>
            <span className="list-sub">{leftover ? 'спрашивать утром, куда отложить' : 'не спрашивать'}</span>
          </span>
          <span className={`switch${leftover ? ' is-on' : ''}`} aria-hidden="true" />
        </button>
      </li>
    </ul>
  );
}

/** «30 сен +45,00 Стипендия → Наушники»; a move made by hand is a button that opens «Удалить». */
function HistoryRow({ row, today, onOpen }: { row: SavingsHistoryRow; today: LocalDate; onOpen?: () => void }) {
  const content = (
    <>
      <span className="list-text">
        <span className="list-name">{historyRowText(row)}</span>
        <span className="list-sub">{shortDate(row.date, today)}</span>
      </span>
      <span className={`list-value${row.amountKopecks > 0 ? ' is-in' : ''}`}>{signedKopecks(row.amountKopecks)}</span>
    </>
  );
  return (
    <li data-testid="savings-move">
      {onOpen ? (
        <button type="button" className="list-row" onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="list-row is-static">{content}</div>
      )}
    </li>
  );
}

/** «Удалить» for a move made by hand: asks first, and refuses when the money is needed for the limit. */
function MoveActions({ row, data, today, update, onClose }: { row: SavingsHistoryRow; data: AppData; today: LocalDate; update: Update; onClose: () => void }) {
  const [asked, setAsked] = useState<MoveDeletion | null>(null);
  return (
    <BottomSheet onClose={onClose} className="action-sheet">
      {(close) => (
        <>
          <p className="action-title">
            {historyRowText(row)} · {signedKopecks(row.amountKopecks)} BYN · {shortDate(row.date, today)}
          </p>
          {asked && (
            <p className={`action-text${asked.ok ? '' : ' is-danger'}`} role={asked.ok ? undefined : 'alert'} data-testid="move-delete-text">
              {asked.ok ? `Удалить? Лимит станет ${moneyInText(asked.limitKopecks)} в день` : asked.text}
            </p>
          )}
          {asked === null && (
            <button type="button" className="button-action is-danger" onClick={() => setAsked(moveDeletion(data, row.moveId!, today))}>
              Удалить
            </button>
          )}
          {asked?.ok && (
            <button
              type="button"
              className="button-action is-danger"
              onClick={() => {
                update((d) => deleteSavingsMove(d, row.moveId!));
                close();
              }}
            >
              Да, удалить
            </button>
          )}
          <button type="button" className="button-action" onClick={close}>
            {asked?.ok === false ? 'Понятно' : 'Отмена'}
          </button>
        </>
      )}
    </BottomSheet>
  );
}

/** «Купил» on a full jar: a spend from the jar that leaves the limit as it is. */
function BuySheet({ jar, today, update, onClose }: { jar: Jar; today: LocalDate; update: Update; onClose: () => void }) {
  const goalId = targetGoalId(jar.target)!;
  return (
    <BottomSheet onClose={onClose} className="action-sheet">
      {(close) => (
        <>
          <p className="action-title">
            «{jar.name}» · {formatMoney(jar.targetKopecks!)}
          </p>
          <p className="action-text">Покупка спишется из копилки, дневной лимит не изменится.</p>
          <button
            type="button"
            className="button-action"
            onClick={() => {
              update((d) => buyGoal(d, goalId, jar.targetKopecks!, today, new Date()));
              close();
            }}
          >
            Купил за {formatMoney(jar.targetKopecks!)}
          </button>
          <button type="button" className="button-action" onClick={close}>
            Отмена
          </button>
        </>
      )}
    </BottomSheet>
  );
}
