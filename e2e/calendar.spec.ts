import { expect, test, type Page } from '@playwright/test';
import { exampleA, expense, tx } from '../src/domain/fixtures';
import type { AppData } from '../src/domain/types';

/**
 * «Знакомство» done (update 2): «Что нового» closed, every hint seen and a copy just saved, so no hint
 * or card of it gets in the way.
 */
const INTRO_DONE = {
  tipsShown: true,
  whatsNewSeen: 'update-2',
  lessonsSeen: ['ring', 'firstExpense', 'tapRow', 'overspend', 'leftover', 'banner', 'savings', 'finances', 'deficit', 'periodEnd'],
  lastBackupAt: '2099-12-31',
};

// «Календарь» of update 1 in a real browser, at the top of «Финансы» since update 2. The data is seeded (no onboarding), the clock is fixed
// to 26 September 2026, the day of example А: limit 28,54 until the scholarship on 5 October
// (256,89 free for 9 days); a payment of X in this period makes it (256,89 − X) ÷ 9.

const TODAY = new Date('2026-09-26T10:00:00');

const NAMES: Record<string, string> = {
  scholarship: 'Стипендия',
  parents: 'От родителей',
  salary: 'Подработка',
  dorm: 'Общежитие',
  internet: 'Интернет',
  phone: 'Телефон',
};

/** Example А with names as a person would type them. */
function example(): AppData {
  const data = exampleA();
  data.incomeSources = data.incomeSources.map((s) => ({ ...s, name: NAMES[s.id] ?? s.name }));
  data.payments = data.payments.map((p) => ({ ...p, name: NAMES[p.id] ?? p.name }));
  return data;
}

/**
 * Example А tracked since 14 September with 1 000,00 on hand, at 20,00 a day: over it on the 16th
 * and 22nd, no record on the 17th. The reserves cover 21 days of the period, so today is no deficit.
 */
function lived(): AppData {
  const data = example();
  data.settings.trackingStartDate = '2026-09-14';
  data.transactions = [tx({ type: 'adjustment', amountKopecks: 100000, date: '2026-09-14' })];
  for (let day = 14; day <= 25; day++) {
    if (day !== 17) data.daySummaries.push({ date: `2026-09-${day}`, dailyLimitKopecks: 2000 });
  }
  data.transactions.push(
    expense('2026-09-15', 1250, 'cafe'),
    expense('2026-09-16', 3200, 'fun'),
    expense('2026-09-19', 800, 'delivery'),
    expense('2026-09-22', 2600, 'shopping'),
  );
  return data;
}

/** Seeds the data once, so a reload keeps what the test changed. The first-launch tips are done. */
async function seed(page: Page, data: AppData, ui: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ data, ui }) => {
      if (localStorage.getItem('dayly:data') !== null) return;
      localStorage.setItem('dayly:data', data);
      localStorage.setItem('dayly:ui', ui);
    },
    { data: JSON.stringify(data), ui: JSON.stringify({ ...INTRO_DONE, ...ui }) },
  );
  await page.clock.install({ time: TODAY });
  await page.goto('/');
}

const tab = (page: Page, name: string) => page.locator('.tab-bar').getByRole('button', { name, exact: true });
const day = (page: Page, date: string) => page.locator(`.cal-day[data-date="${date}"]`);
const dots = (page: Page, date: string, kind: 'income' | 'payment') => day(page, date).locator(`.cal-dot.is-${kind}`);
const daySheet = (page: Page) => page.locator('.day-sheet');
const eventSheet = (page: Page) => page.locator('.event-sheet');

/** The calendar is the first block of «Финансы». */
async function openCalendar(page: Page, months = 0) {
  await tab(page, 'Финансы').click();
  await expect(page.getByTestId('finance-calendar')).toBeVisible();
  for (let i = 0; i < months; i++) await page.getByRole('button', { name: 'Следующий месяц' }).click();
}

/** A tap above the day sheet closes it, once the form over it has slid away. */
async function closeDaySheet(page: Page) {
  await expect(eventSheet(page)).toHaveCount(0);
  await page.locator('.sheet-dim').click({ position: { x: 20, y: 20 } });
  await expect(daySheet(page)).toHaveCount(0);
}

test('a tap on a date → «+ Расход» every month: dots on that day of every month, and today’s limit drops', async ({ page }) => {
  await seed(page, example());
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');

  await openCalendar(page);
  await expect(page.getByTestId('calendar-month')).toHaveText('Сентябрь');
  await expect(day(page, '2026-09-26')).toHaveAttribute('aria-current', 'date');
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(page.getByTestId('calendar-month')).toHaveText('Октябрь');
  await expect(dots(page, '2026-10-01', 'payment')).toHaveCount(1);
  await expect(dots(page, '2026-10-05', 'income')).toHaveCount(1);
  await expect(day(page, '2026-10-02').locator('.cal-dot')).toHaveCount(0);

  await day(page, '2026-10-02').click();
  await expect(daySheet(page).getByRole('heading')).toHaveText('Пт, 2 октября');
  await expect(page.getByTestId('day-line')).toHaveText('Прогноз: около 28 BYN в день');
  await daySheet(page).getByRole('button', { name: '+ Расход' }).click();

  const form = eventSheet(page);
  await expect(form.getByRole('heading')).toHaveText('Расход');
  await form.getByPlaceholder('Например, общежитие').fill('Спортзал');
  await form.getByPlaceholder('0,00').fill('25');
  await form.getByRole('radio', { name: 'Каждый месяц, 2-го' }).click();
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(form).toHaveCount(0);

  // The day sheet under the form shows the new «расход» at once.
  await expect(page.getByTestId('day-events')).toContainText('Спортзалкаждый месяц, 2-го−25,00');
  await closeDaySheet(page);
  await expect(dots(page, '2026-10-02', 'payment')).toHaveCount(1);
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(dots(page, '2026-11-02', 'payment')).toHaveCount(1);
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(dots(page, '2026-12-02', 'payment')).toHaveCount(1);

  // 2 October is in the current period: (256,89 − 25,00) ÷ 9 = 25,76.
  await tab(page, 'Сегодня').click();
  await expect(page.getByTestId('hero-amount')).toHaveText('25,76');
});

test('a tap on a planned «расход» changes it; «Удалить со всеми повторами» takes every dot away', async ({ page }) => {
  const data = example();
  data.payments.push({ id: 'gym', name: 'Спортзал', amountKopecks: 2500, dayOfMonth: 2, weekday: null, date: null, startDate: '2026-10-02', isActive: true });
  await seed(page, data);
  await expect(page.getByTestId('hero-amount')).toHaveText('25,76');

  await openCalendar(page, 1);
  await day(page, '2026-10-02').click();
  await daySheet(page).getByRole('button', { name: /Спортзал/ }).click();
  const form = eventSheet(page);
  await expect(form.getByRole('heading')).toHaveText('Спортзал');
  await expect(form.getByRole('radio', { name: 'Каждый месяц, 2-го' })).toHaveAttribute('aria-checked', 'true');
  await form.getByPlaceholder('0,00').fill('30');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('day-events')).toContainText('Спортзалкаждый месяц, 2-го−30,00');

  await closeDaySheet(page);
  await tab(page, 'Сегодня').click();
  // (256,89 − 30,00) ÷ 9 = 25,21
  await expect(page.getByTestId('hero-amount')).toHaveText('25,21');

  await openCalendar(page, 1);
  await day(page, '2026-10-02').click();
  await daySheet(page).getByRole('button', { name: /Спортзал/ }).click();
  await eventSheet(page).getByRole('button', { name: 'Удалить со всеми повторами' }).click();
  await expect(eventSheet(page)).toHaveCount(0);
  await expect(page.getByTestId('day-events')).toHaveCount(0);
  await closeDaySheet(page);
  await expect(day(page, '2026-10-02').locator('.cal-dot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(day(page, '2026-11-02').locator('.cal-dot')).toHaveCount(0);
  await tab(page, 'Сегодня').click();
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
});

test('a one-off «+ Доход» on a future day shows on that day only', async ({ page }) => {
  await seed(page, example());
  await openCalendar(page, 1);
  await day(page, '2026-10-15').click();
  await daySheet(page).getByRole('button', { name: '+ Доход' }).click();
  const form = eventSheet(page);
  await form.getByRole('button', { name: 'Другое' }).click();
  await form.getByPlaceholder('Например, подработка').fill('Подарок');
  await form.getByPlaceholder('0,00').fill('50');
  await expect(form.getByRole('radio', { name: 'Не повторять' })).toHaveAttribute('aria-checked', 'true');
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('day-events')).toContainText('Подарокразово+50,00');
  await closeDaySheet(page);

  await expect(dots(page, '2026-10-15', 'income')).toHaveCount(1);
  await expect(page.locator('.cal-day .cal-dot.is-income')).toHaveCount(4); // 5th, 10th, 15th, 20th
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(day(page, '2026-11-15').locator('.cal-dot')).toHaveCount(0);
  // 15 October is in the next period: today's limit stays.
  await tab(page, 'Сегодня').click();
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
});

test('past days are tinted; a day’s sheet shows how it went, today’s rest or the forecast', async ({ page }) => {
  await seed(page, lived());
  // (1 000,00 − 78,50 spent − 95,00 payments − 420,00 reserves for 21 days − 24,11 goal − 30,00 cushion) ÷ 9
  await expect(page.getByTestId('hero-amount')).toHaveText('39,15');
  await openCalendar(page);

  await expect(day(page, '2026-09-15')).toHaveClass(/is-in/);
  await expect(day(page, '2026-09-16')).toHaveClass(/is-over/);
  await expect(day(page, '2026-09-17')).toHaveClass(/is-none/);
  await expect(day(page, '2026-09-13')).not.toHaveClass(/is-(in|over|none)/);
  await expect(day(page, '2026-09-26')).toHaveClass(/is-today/);
  await expect(page.getByTestId('calendar-legend')).toHaveText('в лимитеперерасход');

  await day(page, '2026-09-16').click();
  await expect(page.getByTestId('day-line')).toHaveText('Лимит 20,00 · потрачено 32,00');
  await expect(page.getByTestId('day-line')).toHaveClass(/is-danger/);
  await closeDaySheet(page);
  await day(page, '2026-09-17').click();
  await expect(page.getByTestId('day-line')).toHaveText('В этот день приложение не открывалось');
  await closeDaySheet(page);
  await day(page, '2026-09-26').click();
  await expect(page.getByTestId('day-line')).toHaveText('Сегодня осталось 39,15 из 39,15');
  await closeDaySheet(page);
  await day(page, '2026-09-10').click();
  await expect(page.getByTestId('day-line')).toHaveText('Учёт идёт с 14 сентября');
  // Before tracking started nothing is counted, so nothing can be planned there.
  await expect(daySheet(page).getByRole('button', { name: '+ Доход' })).toHaveCount(0);
  await closeDaySheet(page);
  await day(page, '2026-09-30').click();
  await expect(page.getByTestId('day-line')).toHaveText(/^Прогноз: около \d+ BYN в день$/);
});

test('an empty calendar hints what to do; a swipe turns the month; «Сегодня» comes back', async ({ page }) => {
  const data = example();
  data.incomeSources = [];
  data.payments = [];
  data.settings.mainIncomeSourceId = null;
  await seed(page, data);
  await openCalendar(page);
  await expect(page.getByTestId('calendar-hint')).toHaveText('Нажми на дату, чтобы добавить доход или расход');
  await expect(page.getByTestId('calendar-legend')).toHaveCount(0);

  const grid = (await page.getByTestId('calendar-grid').boundingBox())!;
  const y = grid.y + grid.height / 2;
  await page.mouse.move(grid.x + grid.width - 40, y);
  await page.mouse.down();
  await page.mouse.move(grid.x + grid.width / 2, y, { steps: 5 });
  await page.mouse.move(grid.x + 40, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('calendar-month')).toHaveText('Октябрь');
  await expect(daySheet(page)).toHaveCount(0);

  await page.locator('.cal-head').getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('calendar-month')).toHaveText('Сентябрь');
  await expect(page.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();

  // The hint goes once something is planned.
  await day(page, '2026-09-30').click();
  await daySheet(page).getByRole('button', { name: '+ Расход' }).click();
  await eventSheet(page).getByPlaceholder('Например, общежитие').fill('Кино');
  await eventSheet(page).getByPlaceholder('0,00').fill('12');
  await eventSheet(page).getByRole('button', { name: 'Добавить' }).click();
  await closeDaySheet(page);
  await expect(page.getByTestId('calendar-hint')).toHaveCount(0);
  await expect(page.getByTestId('calendar-legend')).toHaveText('расход');
});

test('«Календарь» turned off in «Функции» hides the calendar of «Финансы», not a tab', async ({ page }) => {
  await seed(page, example(), { features: { calendar: false } });
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
  await expect(page.locator('.tab-bar')).toHaveText('СегодняКопилкаИсторияФинансыНастройки');
  await tab(page, 'Финансы').click();
  await expect(page.getByRole('heading', { name: 'Финансы' })).toBeVisible();
  await expect(page.getByTestId('settings-incomes')).toBeVisible();
  await expect(page.getByTestId('finance-calendar')).toHaveCount(0);
  await expect(page.locator('.cal-day')).toHaveCount(0);
});

test('«Финансы»: a weekly and a one-off payment, a one-off income; the calendar shows them', async ({ page }) => {
  await seed(page, example());
  await tab(page, 'Финансы').click();
  await page.getByTestId('finance-payments').getByRole('button', { name: /Все платежи/ }).click();

  await page.getByRole('button', { name: '+ Добавить платёж' }).click();
  await page.getByPlaceholder('Например, общежитие').fill('Бассейн');
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('5');
  await page.getByRole('radio', { name: 'Раз в неделю' }).click();
  await page.getByRole('radio', { name: 'Вс' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await page.getByRole('button', { name: '+ Добавить платёж' }).click();
  await page.getByPlaceholder('Например, общежитие').fill('Концерт');
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('25');
  await page.getByRole('radio', { name: 'Один раз' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click({ force: true });
  await expect(page.getByTestId('form-missing')).toHaveText('Выбери дату');
  await page.locator('.form-screen input[type="date"]').fill('2026-10-02');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  const list = page.getByTestId('payments-list');
  await expect(list).toContainText('Бассейнпо воскресеньям · до 27 сентября5,00');
  await expect(list).toContainText('Концертразово · до 2 октября25,00');
  await page.waitForTimeout(400); // the list slides in
  await page.screenshot({ path: test.info().outputPath('payments.png') });

  // The weekly one keeps its schedule when opened again.
  await list.getByRole('button', { name: /Бассейн/ }).click();
  await expect(page.getByRole('radio', { name: 'Раз в неделю' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Вс' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await page.getByRole('button', { name: '‹ Назад' }).click();

  await page.getByRole('button', { name: '+ Добавить доход' }).click();
  await page.getByRole('button', { name: 'Другое' }).click();
  await page.locator('.form-screen input').first().fill('Подарок');
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('50');
  await page.getByRole('radio', { name: 'Один раз' }).click();
  await expect(page.getByText('Основное поступление')).toHaveCount(0);
  await page.locator('.form-screen input[type="date"]').fill('2026-09-30');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('settings-incomes')).toContainText('Подарок · 30 сентября');

  await openCalendar(page);
  await expect(dots(page, '2026-09-27', 'payment')).toHaveCount(1);
  await expect(dots(page, '2026-09-30', 'income')).toHaveCount(1);
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  for (const date of ['2026-10-02', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']) {
    await expect(dots(page, date, 'payment')).toHaveCount(1);
  }
});

test('small iPhone 375×667: the month, the day sheet and five tabs fit without sideways scroll', async ({ browser }) => {
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: scheme, locale: 'ru-RU' });
    const page = await context.newPage();
    const data = lived();
    // A payment in September as well, so its legend has all four marks.
    data.payments.push({ id: 'cinema', name: 'Кино', amountKopecks: 1200, dayOfMonth: null, weekday: null, date: '2026-09-28', startDate: '2026-09-26', isActive: true });
    await seed(page, data);
    // To October and back: the month slides in from either side and settles within the screen.
    await openCalendar(page, 1);
    await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(() => {
      const screen = document.querySelector('.screen.settings')!;
      return [document.documentElement.scrollWidth - window.innerWidth, screen.scrollWidth - screen.clientWidth];
    });
    expect(overflow).toEqual([0, 0]);
    const labels = await page.locator('.tab-bar .tab span').evaluateAll((spans) => spans.map((s) => s.scrollWidth <= s.clientWidth + 0.5 && s.getBoundingClientRect().width <= s.parentElement!.getBoundingClientRect().width));
    expect(labels).toEqual([true, true, true, true, true]);
    const gridBottom = (await page.getByTestId('calendar-grid').boundingBox())!;
    const tabTop = (await page.locator('.tab-bar').boundingBox())!.y;
    expect(gridBottom.y + gridBottom.height).toBeLessThanOrEqual(tabTop);
    await page.screenshot({ path: test.info().outputPath(`small-month-${scheme}.png`) });

    await day(page, '2026-09-26').click();
    await page.waitForTimeout(400);
    const add = (await daySheet(page).getByRole('button', { name: '+ Расход' }).boundingBox())!;
    expect(add.y + add.height).toBeLessThanOrEqual(667);
    await page.screenshot({ path: test.info().outputPath(`small-day-${scheme}.png`) });
    await context.close();
  }
});
