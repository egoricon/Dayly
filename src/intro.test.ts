import { describe, expect, it } from 'vitest';
import { addExpense, createInitialData, type OnboardingResult } from './appData';
import { calculateBudget } from './domain/budget';
import { headphones } from './domain/fixtures';
import type { AppData, LocalDate } from './domain/types';
import { saveEvent } from './events';
import {
  afterFirstSetup,
  atLaunch,
  firstWeekCard,
  firstWeekItems,
  markLessonSeen,
  nextIncomeCaption,
  pickHomeCard,
  pickHomeLesson,
  pickTabLesson,
  reservesPreview,
  restartIntro,
  shouldShowBackupCard,
  shouldShowWhatsNew,
  withFirstWeekCompleted,
  type HomeLessonContext,
} from './intro';
import { defaultUiState, LESSONS_KNOWN_BEFORE_UPDATE_2, loadUiState, UI_KEY, WHATS_NEW_ID, type FeatureKey, type LessonId, type UiState } from './uiState';

function storageWith(value: string): Storage {
  return { getItem: (key: string) => (key === UI_KEY ? value : null) } as Storage;
}

const TODAY = '2026-09-26';

/** Example А through the first setup on 26 September: 586,00, «Стипендия» 220,00 from 5 October, three payments. */
const SETUP: OnboardingResult = {
  balanceKopecks: 58600,
  income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' },
  payments: [
    { name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' },
    { name: 'Интернет', amountKopecks: 3000, date: '2026-10-03' },
    { name: 'Телефон', amountKopecks: 2000, date: '2026-10-04' },
  ],
};

function setUp(): AppData {
  return createInitialData(TODAY, SETUP, new Date(`${TODAY}T10:00:00`));
}

const at = (day: LocalDate, time = '12:00') => new Date(`${day}T${time}:00`);
const NOTHING: HomeLessonContext = { banner: null, savingsCard: null };
const allOn = (): boolean => true;

/** The hints in the order the home screen shows them, each closed in turn. */
function homeLessons(data: AppData, today: LocalDate, seen: LessonId[] = [], context = NOTHING): string[] {
  const budget = calculateBudget(data, today);
  const shown: string[] = [];
  for (let lesson = pickHomeLesson(data, budget, today, seen, context); lesson; lesson = pickHomeLesson(data, budget, today, seen, context)) {
    shown.push(`${lesson.id}: ${lesson.text}`);
    seen = [...seen, lesson.id];
  }
  return shown;
}

describe('who gets «Что нового» and which hints', () => {
  it('a new person: no «Что нового», every hint, «Первая неделя» from the day of the setup', () => {
    const launched = atLaunch(defaultUiState(), false);
    expect(launched).toEqual(defaultUiState());
    expect(shouldShowWhatsNew(launched, false)).toBe(false);

    const data = setUp();
    const state = afterFirstSetup(launched, data, TODAY);
    expect(state).toMatchObject({ whatsNewSeen: WHATS_NEW_ID, lessonsSeen: [] });
    expect(state.firstWeek).toEqual({
      startedOn: TODAY,
      dismissed: false,
      seenExplain: false,
      setupPlanIds: [data.incomeSources[0]!.id, ...data.payments.map((p) => p.id)],
      completedOn: null,
    });
    expect(shouldShowWhatsNew(state, true)).toBe(false);
    expect(atLaunch(state, true)).toEqual(state);
  });

  it('a person from before update 1: «Что нового» and only the hints about what is new, once', () => {
    const saved = loadUiState(storageWith(JSON.stringify({ hiddenBanners: {}, accent: 'mint', launches: 7, installHintDismissed: true })));
    const state = atLaunch(saved, true);
    expect(state.tipsShown).toBe(true);
    expect(state.lessonsSeen).toEqual(LESSONS_KNOWN_BEFORE_UPDATE_2);
    expect(shouldShowWhatsNew(state, true)).toBe(true);
    expect(state.firstWeek.startedOn).toBeNull();
    // «Начать знакомство заново» before closing «Что нового» is not undone by the next launch.
    const again = restartIntro(state, TODAY);
    expect(atLaunch(again, true)).toEqual(again);
  });

  it('a person of update 1 sees «Что нового» of update 2', () => {
    const update1 = loadUiState(storageWith(JSON.stringify({ whatsNewSeen: 'update-1', tipsShown: true })));
    expect(shouldShowWhatsNew(atLaunch(update1, true), true)).toBe(true);
    expect(shouldShowWhatsNew({ ...update1, whatsNewSeen: WHATS_NEW_ID }, true)).toBe(false);
  });

  it('«Начать знакомство заново»: every hint again; «Первая неделя» back within 14 days of the setup', () => {
    const data = setUp();
    const state: UiState = {
      ...afterFirstSetup(defaultUiState(), data, TODAY),
      lessonsSeen: ['ring', 'savings'],
    };
    const closed = { ...state, firstWeek: { ...state.firstWeek, dismissed: true, completedOn: '2026-09-30' } };
    expect(restartIntro(closed, '2026-10-09')).toMatchObject({ lessonsSeen: [], firstWeek: { dismissed: false, completedOn: null } });
    expect(restartIntro(closed, '2026-10-10')).toMatchObject({ lessonsSeen: [], firstWeek: { dismissed: true } });
    // Old users have no «Первая неделя» to bring back.
    expect(restartIntro({ ...defaultUiState(), lessonsSeen: ['ring'] }, TODAY).firstWeek.startedOn).toBeNull();
  });

  it('a hint seen is seen once', () => {
    const state = markLessonSeen(defaultUiState(), 'ring');
    expect(state.lessonsSeen).toEqual(['ring']);
    expect(markLessonSeen(state, 'ring')).toBe(state);
  });
});

describe('hints on the home screen', () => {
  it('after the setup the ring, with the day the money lasts to; after the first expense what is left, then the row', () => {
    const data = setUp();
    expect(homeLessons(data, TODAY)).toEqual([
      'ring: Это твоя сумма на сегодня. Тратишь не больше — денег хватит до 5 октября. Нажми на круг, покажу, как считается',
    ]);
    const spent = addExpense(data, 350, 'cafe', TODAY, at(TODAY));
    const budget = calculateBudget(spent, TODAY);
    expect(budget.remainingTodayKopecks).toBe(5105);
    expect(homeLessons(spent, TODAY, ['ring'])).toEqual([
      'firstExpense: Осталось 51,05 BYN. Не потратишь сегодня — завтра можно будет больше',
      'tapRow: Нажми на трату, чтобы изменить или удалить',
    ]);
    // The row hint points at the newest expense.
    const twice = addExpense(spent, 200, 'fun', TODAY, at(TODAY, '13:00'));
    const lesson = pickHomeLesson(twice, calculateBudget(twice, TODAY), TODAY, ['ring', 'firstExpense'], NOTHING);
    expect(lesson?.target).toEqual({ kind: 'row', transactionId: twice.transactions.at(-1)!.id });
    // The first expense on another day: no «Осталось» until there is one today.
    expect(homeLessons(spent, '2026-09-27', ['ring']).map((l) => l.split(':')[0])).toEqual(['tapRow']);
  });

  it('the limit spent exactly', () => {
    const data = addExpense(setUp(), 5455, 'cafe', TODAY, at(TODAY));
    expect(homeLessons(data, TODAY, ['ring', 'tapRow'])).toEqual(['firstExpense: Лимит на сегодня потрачен ровно. Завтра снова можно 54,55 BYN']);
  });

  it('the first overspend: it goes over the days left, and tomorrow’s limit', () => {
    const data = addExpense(setUp(), 6000, 'cafe', TODAY, at(TODAY));
    // (586,00 − 95,00 − 60,00) ÷ 8 days.
    expect(homeLessons(data, TODAY)).toEqual([
      'overspend: Ничего страшного: перерасход разойдётся по оставшимся дням. Завтра можно 53,87 BYN',
      'tapRow: Нажми на трату, чтобы изменить или удалить',
    ]);
  });

  it('the first deficit points at what can be done', () => {
    const data = createInitialData(TODAY, { ...SETUP, balanceKopecks: 5000 }, at(TODAY));
    expect(homeLessons(data, TODAY)).toEqual(['deficit: До 5 октября не хватает 45,00 BYN, поэтому лимит пока 0. Вот что можно сделать']);
    const lesson = pickHomeLesson(data, calculateBudget(data, TODAY), TODAY, [], NOTHING);
    expect(lesson).toMatchObject({ target: { kind: 'deficitHints' }, more: 'limit' });
  });

  it('a banner first, then the cards above the ring, then the ring', () => {
    const data = setUp();
    const ids = (context: HomeLessonContext) => homeLessons(data, TODAY, [], context).map((l) => l.split(':')[0]);
    expect(homeLessons(data, TODAY, [], { banner: 'income', savingsCard: null })[0]).toBe(
      'banner: Отметь, когда деньги придут: без этого я не знаю, что они уже у тебя',
    );
    expect(homeLessons(data, TODAY, [], { banner: 'payment', savingsCard: null })[0]).toBe(
      'banner: Отметь, когда оплатишь: до этого деньги на платёж я держу в стороне',
    );
    expect(ids({ banner: null, savingsCard: { kind: 'leftover' } })).toEqual(['leftover', 'ring']);
    expect(homeLessons(data, TODAY, ['ring'], { banner: null, savingsCard: { kind: 'leftover' } })).toEqual([
      'leftover: Остаток можно отложить в копилку или оставить — тогда лимит на следующие дни чуть вырастет',
    ]);
    expect(homeLessons(data, TODAY, ['ring'], { banner: null, savingsCard: { kind: 'summary', canSetAside: true } })).toEqual([
      'periodEnd: Так прошёл твой первый период. Остаток можно отправить в копилку',
    ]);
    expect(homeLessons(data, TODAY, ['ring'], { banner: null, savingsCard: { kind: 'summary', canSetAside: false } })).toEqual([
      'periodEnd: Так прошёл твой первый период. Новый лимит считается до следующего поступления',
    ]);
  });

  it('someone who saw the tips of update 1 gets only the hint about a tap on an operation', () => {
    const data = addExpense(setUp(), 6000, 'cafe', TODAY, at(TODAY));
    expect(homeLessons(data, TODAY, LESSONS_KNOWN_BEFORE_UPDATE_2, { banner: 'income', savingsCard: { kind: 'leftover' } }).map((l) => l.split(':')[0])).toEqual([
      'tapRow',
    ]);
  });
});

describe('hints of the tabs', () => {
  const data = setUp();
  const only = (off: FeatureKey) => (key: FeatureKey) => key !== off;

  it('«Копилка» at the piggy and the calendar of «Финансы», on the first visit, while they are on', () => {
    expect(pickTabLesson('savings', data, TODAY, [], allOn)).toMatchObject({
      id: 'savings',
      text: 'Отложенное остаётся на твоей карте, просто лимит считается без него. Положи первую сумму или заведи банку',
      target: { kind: 'piggy' },
    });
    expect(pickTabLesson('savings', data, TODAY, ['savings'], allOn)).toBeNull();
    expect(pickTabLesson('savings', data, TODAY, [], only('savings'))).toBeNull();
    expect(pickTabLesson('finances', data, TODAY, [], allOn)).toMatchObject({
      id: 'finances',
      text: 'Нажми на день, чтобы запланировать доход или расход',
      target: { kind: 'calendar' },
    });
    expect(pickTabLesson('finances', data, TODAY, [], only('calendar'))).toBeNull();
  });

  it('«История»: the tap on an operation once there is an expense', () => {
    expect(pickTabLesson('history', data, TODAY, [], allOn)).toBeNull();
    const spent = addExpense(data, 350, 'cafe', TODAY, at(TODAY));
    expect(pickTabLesson('history', spent, TODAY, [], allOn)).toMatchObject({ id: 'tapRow', target: { kind: 'row', transactionId: spent.transactions.at(-1)!.id } });
    expect(pickTabLesson('history', spent, TODAY, ['tapRow'], allOn)).toBeNull();
  });
});

describe('«Первая неделя»', () => {
  const data = setUp();
  const state = afterFirstSetup(defaultUiState(), data, TODAY);
  const ticks = (d: AppData, s: UiState, standalone = false) => firstWeekItems(d, s.firstWeek, standalone).map((i) => `${i.done ? '✓' : '○'} ${i.label}`);

  it('ticks itself from the data and from what was opened', () => {
    expect(ticks(data, state)).toEqual([
      '○ Добавь первую трату',
      '○ Посмотри, как считается лимит',
      '○ Запланируй платёж или доход в календаре',
      '○ Заведи банку в копилке',
      '○ Установи Dayly на экран «Домой»',
    ]);
    let next = addExpense(data, 350, 'cafe', TODAY, at(TODAY));
    // A payment of the setup does not count; one planned later does, and so does an income with a day.
    const planned = saveEvent(next, { kind: 'payment', incomeKind: 'other', name: 'Спортзал', amountKopecks: 3000, date: '2026-10-10', repeat: 'monthly' }, null);
    const income = saveEvent(next, { kind: 'income', incomeKind: 'parents', name: 'Родители', amountKopecks: 10000, date: '2026-10-02', repeat: 'once' }, null);
    next = { ...planned, goals: [headphones] };
    const seen = { ...state, firstWeek: { ...state.firstWeek, seenExplain: true } };
    expect(ticks(next, seen).filter((t) => t.startsWith('✓'))).toHaveLength(4);
    expect(ticks(income, state)[2]).toBe('✓ Запланируй платёж или доход в календаре');
    expect(ticks(next, seen, true).every((t) => t.startsWith('✓'))).toBe(true);
  });

  it('only for people set up from update 2, until ×, for 14 days; «Готово» on the day of the last tick', () => {
    expect(firstWeekCard(data, state, TODAY, false)).toMatchObject({ complete: false });
    expect(firstWeekCard(data, defaultUiState(), TODAY, false)).toBeNull();
    expect(firstWeekCard(data, { ...state, firstWeek: { ...state.firstWeek, dismissed: true } }, TODAY, false)).toBeNull();
    expect(firstWeekCard(data, state, '2026-10-09', false)).not.toBeNull();
    expect(firstWeekCard(data, state, '2026-10-10', false)).toBeNull();

    const all = { ...addExpense(data, 350, 'cafe', TODAY, at(TODAY)), goals: [headphones] };
    const done = saveEvent(all, { kind: 'payment', incomeKind: 'other', name: 'Спортзал', amountKopecks: 3000, date: '2026-10-10', repeat: 'monthly' }, null);
    const seen = { ...state, firstWeek: { ...state.firstWeek, seenExplain: true } };
    expect(firstWeekCard(done, seen, '2026-09-28', true)).toMatchObject({ complete: true });
    expect(withFirstWeekCompleted(state, data, TODAY, false)).toBe(state);
    const completed = withFirstWeekCompleted(seen, done, '2026-09-28', true);
    expect(completed.firstWeek.completedOn).toBe('2026-09-28');
    expect(withFirstWeekCompleted(completed, done, '2026-09-29', true)).toBe(completed);
    expect(firstWeekCard(done, completed, '2026-09-28', true)).toMatchObject({ complete: true });
    expect(firstWeekCard(done, completed, '2026-09-29', true)).toBeNull();
  });
});

describe('«Сохрани копию» and one card under the ring', () => {
  const data = setUp();
  const state = defaultUiState();

  it('in a browser, after a week of data, 14 days after the last copy or «Не сейчас»', () => {
    expect(shouldShowBackupCard(data, state, '2026-10-02', false)).toBe(false);
    expect(shouldShowBackupCard(data, state, '2026-10-03', false)).toBe(true);
    expect(shouldShowBackupCard(data, state, '2026-10-03', true)).toBe(false);
    const saved = { ...state, lastBackupAt: '2026-10-03' };
    expect(shouldShowBackupCard(data, saved, '2026-10-16', false)).toBe(false);
    expect(shouldShowBackupCard(data, saved, '2026-10-17', false)).toBe(true);
    const later = { ...state, backupCardHiddenOn: '2026-10-05' };
    expect(shouldShowBackupCard(data, later, '2026-10-18', false)).toBe(false);
    expect(shouldShowBackupCard(data, later, '2026-10-19', false)).toBe(true);
  });

  it('«Что нового», else «Первая неделя», else «Сохрани копию»', () => {
    expect(pickHomeCard({ whatsNew: true, firstWeek: true, backup: true })).toBe('whatsNew');
    expect(pickHomeCard({ whatsNew: false, firstWeek: true, backup: true })).toBe('firstWeek');
    expect(pickHomeCard({ whatsNew: false, firstWeek: false, backup: true })).toBe('backup');
    expect(pickHomeCard({ whatsNew: false, firstWeek: false, backup: false })).toBeNull();
  });
});

describe('first setup captions', () => {
  it('says when the income comes and how it repeats', () => {
    expect(nextIncomeCaption('2026-09-26', '2026-10-05', false)).toBe('5 октября, через 9 дней, дальше каждый месяц 5-го');
    expect(nextIncomeCaption('2026-09-26', '2026-10-02', true)).toBe('2 октября, через 6 дней, дальше по пятницам');
    expect(nextIncomeCaption('2026-09-26', '2026-09-27', true)).toBe('27 сентября, через 1 день, дальше по воскресеньям');
    expect(nextIncomeCaption('2026-10-26', '2026-10-31', false)).toBe('31 октября, через 5 дней, дальше каждый месяц 31-го или в последний день');
  });

  it('reserves: a partial first period takes its share of the days, counted as the limit will count it', () => {
    const exampleA = {
      balanceKopecks: 58600,
      income: { kind: 'scholarship' as const, amountKopecks: 22000, date: '2026-10-05' },
      payments: [],
      reserves: { groceriesKopecks: 50000, transportKopecks: 10000 },
    };
    // 9 of the 30 days from 5 September to 4 October: 150,00 + 30,00.
    expect(reservesPreview('2026-09-26', exampleA)).toEqual({ kopecks: 18000, until: '2026-10-05', days: 9, periodDays: 30 });
    // No regular income: a whole month from today.
    expect(reservesPreview('2026-09-26', { ...exampleA, income: null })).toEqual({ kopecks: 60000, until: '2026-10-26', days: 30, periodDays: 30 });
    // Weekly on Fridays: 6 of the 7 days from Friday 25 September.
    const weekly = { ...exampleA, income: { kind: 'salary' as const, amountKopecks: 5000, date: '2026-10-02', weekly: true }, reserves: { groceriesKopecks: 7000, transportKopecks: 0 } };
    expect(reservesPreview('2026-09-26', weekly)).toEqual({ kopecks: 6000, until: '2026-10-02', days: 6, periodDays: 7 });
  });
});
