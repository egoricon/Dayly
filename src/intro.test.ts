import { describe, expect, it } from 'vitest';
import { firstLaunchTips } from './components/FirstLaunchTips';
import { afterFirstSetup, atLaunch, nextIncomeCaption, reservesPreview, shouldShowWhatsNew } from './intro';
import { defaultUiState, loadUiState, UI_KEY, WHATS_NEW_ID } from './uiState';

function storageWith(value: string): Storage {
  return { getItem: (key: string) => (key === UI_KEY ? value : null) } as Storage;
}

describe('who sees «Что нового» and the first-launch tips', () => {
  it('a new person: no «Что нового»; the tips after the first setup until they are done', () => {
    // No data yet: the first setup is on screen, nothing changes.
    const launched = atLaunch(defaultUiState(), false);
    expect(launched).toEqual(defaultUiState());
    expect(shouldShowWhatsNew(launched, false)).toBe(false);

    const setUp = afterFirstSetup(launched);
    expect(setUp).toMatchObject({ whatsNewSeen: WHATS_NEW_ID, tipsShown: false });
    expect(shouldShowWhatsNew(setUp, true)).toBe(false);
    // Closed before the tips were done: they come again at the next launch.
    expect(atLaunch(setUp, true)).toEqual(setUp);
    const done = { ...setUp, tipsShown: true };
    expect(atLaunch(done, true)).toEqual(done);
  });

  it('a person from before update 1: «Что нового» until it is closed, and no first-launch tips', () => {
    const saved = loadUiState(storageWith(JSON.stringify({ hiddenBanners: {}, accent: 'mint', launches: 7, installHintDismissed: true })));
    const state = atLaunch(saved, true);
    expect(state.tipsShown).toBe(true);
    expect(shouldShowWhatsNew(state, true)).toBe(true);

    const closed = { ...state, whatsNewSeen: WHATS_NEW_ID };
    expect(shouldShowWhatsNew(closed, true)).toBe(false);
    expect(atLaunch(closed, true)).toEqual(closed);
  });

  it('«Показать подсказки снова» brings the tips back for anyone who closed «Что нового»', () => {
    const again = { ...defaultUiState(), whatsNewSeen: WHATS_NEW_ID, tipsShown: false };
    expect(atLaunch(again, true)).toEqual(again);
  });

  it('a later «Что нового» shows even to someone who closed an earlier one', () => {
    expect(shouldShowWhatsNew({ ...defaultUiState(), whatsNewSeen: 'update-0', tipsShown: true }, true)).toBe(true);
  });

  it('three tips; the calendar one, about «Финансы», only while the calendar is on', () => {
    expect(firstLaunchTips(true).map((t) => t.text)).toEqual([
      'Нажми на круг — покажу, как считается',
      'Долгий тап по трате — изменить или удалить',
      'Во вкладке «Финансы» можно планировать доходы и расходы в календаре',
    ]);
    expect(firstLaunchTips(false)).toHaveLength(2);
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
