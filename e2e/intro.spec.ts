import { expect, test, type Locator, type Page } from '@playwright/test';

// «Знакомство»: the first setup with one question per screen and «Настройки → Функции» (update 1); hints at
// the moment something first happens, «Первая неделя», «Сохрани копию», «Как устроен Dayly» and «Что нового»
// of update 2 (task F).
// The clock is fixed to 26 September 2026, the day of example А, so the numbers are known.

const TODAY = new Date('2026-09-26T10:00:00');
declare const process: { env: Record<string, string | undefined> };
const BASE = `http://localhost:${process.env.DAYLY_E2E_PORT ?? '4173'}/`;

const WHATS_NEW = [
  'Что нового в Dayly',
  'Копилка: свинка, банки, положить и забрать, округление трат.',
  'Календарь теперь во вкладке «Финансы».',
  'Трату можно изменить обычным нажатием и добавить вчерашнюю.',
  'В «Истории» — итоги по категориям за период.',
  '«Крупный текст» — в «Настройках».',
];

const RING_HINT = 'Это твоя сумма на сегодня. Тратишь не больше — денег хватит до 5 октября. Нажми на круг, покажу, как считается';

const ALL_LESSONS = ['ring', 'firstExpense', 'tapRow', 'overspend', 'leftover', 'banner', 'savings', 'finances', 'deficit', 'periodEnd'];

/** The hint on screen: at most one at a time. */
const lesson = (page: Page) => page.getByTestId('lesson');

async function typeAmount(page: Page, amount: string) {
  for (const ch of amount) await page.keyboard.press(ch === ',' ? 'Comma' : ch);
}

/** Waits for animations and transitions to end, so a screenshot shows the final look. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/** A payment from its chip: the form comes with the name and «Каждый месяц»; the day is in October. */
async function addPayment(page: Page, name: string, amount: string, day: number) {
  await page.getByRole('button', { name, exact: true }).click();
  const sheet = page.locator('.form-sheet');
  await expect(sheet.getByPlaceholder('Например, общежитие')).toHaveValue(name);
  await sheet.getByPlaceholder('0,00').fill(amount);
  await sheet.getByRole('button', { name: 'Следующий месяц' }).click();
  await sheet.locator('.calendar-day', { hasText: new RegExp(`^${day}$`) }).click();
  await expect(sheet.getByRole('radio', { name: `Каждый месяц, ${day}-го` })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Добавить' }).click();
  await expect(sheet).toHaveCount(0);
}

/** Example А up to the payments step: 586 on hand, «Стипендия» 220 every month from 5 October. */
async function toPayments(page: Page) {
  await page.getByRole('button', { name: 'Начать' }).click();
  await typeAmount(page, '586');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Стипендия', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await page.locator('.calendar-day', { hasText: /^5$/ }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await typeAmount(page, '220');
  await page.getByRole('button', { name: 'Дальше' }).click();
}

/** Example А through the whole setup, products and transport skipped, up to the home screen with its hint. */
async function setUpSkippingReserves(page: Page) {
  await toPayments(page);
  await addPayment(page, 'Общежитие', '45', 1);
  await addPayment(page, 'Интернет', '30', 3);
  await addPayment(page, 'Телефон', '20', 4);
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.getByTestId('first-limit')).toHaveText('54,55BYN');
  await page.getByRole('button', { name: 'На главную' }).click();
}

/**
 * Opens the app with what an older version saved; `ui` is the saved interface state. Seeds once, so
 * a reload keeps changes. `hero` is the limit the home screen should show.
 */
async function openSeeded(page: Page, data: unknown, ui: unknown, hero: string | null = '54,55') {
  await page.addInitScript(
    ([data, ui]) => {
      if (localStorage.getItem('dayly:data') === null) {
        localStorage.setItem('dayly:data', data);
        localStorage.setItem('dayly:ui', ui);
      }
    },
    [JSON.stringify(data), JSON.stringify(ui)] as const,
  );
  await page.clock.install({ time: TODAY });
  await page.goto(BASE);
  if (hero === null) await expect(page.getByTestId('hero-amount')).toBeVisible();
  else await expect(page.getByTestId('hero-amount')).toHaveText(hero);
}

/** Example А as the app saved it before update 1 (data version 4), set up on 20 September. */
const PRE_UPDATE_DATA = {
  schemaVersion: 4,
  settings: {
    onboardingCompleted: true,
    trackingStartDate: '2026-09-20',
    mainIncomeSourceId: 'stipend',
    categories: [
      { id: 'cafe', name: 'Кафе', reserveKopecks: null, isActive: true },
      { id: 'delivery', name: 'Доставка', reserveKopecks: null, isActive: true },
      { id: 'shopping', name: 'Покупки', reserveKopecks: null, isActive: true },
      { id: 'fun', name: 'Развлечения', reserveKopecks: null, isActive: true },
      { id: 'groceries', name: 'Продукты', reserveKopecks: 0, isActive: true },
      { id: 'transport', name: 'Транспорт', reserveKopecks: 0, isActive: true },
    ],
    cushion: { mode: 'fixed', amountKopecks: 0 },
    theme: 'auto',
    lastCategory: 'cafe',
    favorites: [],
  },
  incomeSources: [
    { id: 'stipend', kind: 'scholarship', name: 'Стипендия', amountKopecks: 22000, dayOfMonth: 5, weekday: null, startDate: '2026-09-20', isActive: true },
  ],
  payments: [
    { id: 'dorm', name: 'Общежитие', amountKopecks: 4500, dayOfMonth: 1, startDate: '2026-09-20', isActive: true },
    { id: 'internet', name: 'Интернет', amountKopecks: 3000, dayOfMonth: 3, startDate: '2026-09-20', isActive: true },
    { id: 'phone', name: 'Телефон', amountKopecks: 2000, dayOfMonth: 4, startDate: '2026-09-20', isActive: true },
  ],
  goals: [],
  transactions: [
    {
      id: 'start',
      type: 'adjustment',
      amountKopecks: 58600,
      date: '2026-09-20',
      createdAt: '2026-09-20T09:00:00.000Z',
      category: null,
      incomeSourceId: null,
      paymentId: null,
      goalId: null,
      plannedDate: null,
      note: 'Стартовый баланс',
    },
  ],
  daySummaries: [],
};

/** The interface state of before update 1: no features, «Что нового» or tips yet. */
const PRE_UPDATE_UI = { hiddenBanners: {}, accent: 'mint', launches: 12, installHintDismissed: true, statsEnabled: true };

/** The «Финансы» button of the tab bar: the calendar is at the top of that tab since update 2. */
const financesTab = (page: Page) => page.locator('.tab-bar').getByRole('button', { name: 'Финансы', exact: true });

/** «Финансы» is open with its calendar in view. */
async function expectCalendarOpen(page: Page) {
  await expect(page.getByTestId('calendar-grid')).toBeInViewport();
  await expect(financesTab(page)).toHaveAttribute('aria-current', 'page');
}

test('first setup with products and transport: an honest first limit and «Вот твой месяц»', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByRole('heading', { name: 'Сколько у тебя сейчас денег?' })).toBeVisible();
  await expect(page.locator('[aria-label="Шаг 1 из 6"]')).toBeVisible();
  await typeAmount(page, '586');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Откуда приходят деньги?' })).toBeVisible();
  await expect(page.locator('.source-card')).toHaveText(['Стипендия', 'Зарплата', 'Родители', 'Другое', 'Пока нет постоянныхрастянем деньги на месяц']);
  await page.getByRole('button', { name: 'Стипендия', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Когда придёт стипендия?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Каждый месяц' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  // Up to the same day next month.
  await expect(page.locator('.calendar-day', { hasText: /^26$/ })).toBeEnabled();
  await expect(page.locator('.calendar-day', { hasText: /^27$/ })).toBeDisabled();
  await page.locator('.calendar-day', { hasText: /^5$/ }).click();
  await expect(page.locator('.step-caption')).toHaveText('5 октября, через 9 дней, дальше каждый месяц 5-го');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Сколько придёт?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Дальше' })).toBeDisabled();
  await typeAmount(page, '220');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Что оплачиваешь регулярно?' })).toBeVisible();
  await expect(page.getByText('Эти деньги отложим заранее, в дневной лимит они не попадут.')).toBeVisible();
  await addPayment(page, 'Общежитие', '45', 1);
  await addPayment(page, 'Телефон', '20', 4);
  await addPayment(page, 'Интернет', '30', 3);
  // «Своё» once, then removed with ×.
  await page.getByRole('button', { name: '+ Своё' }).click();
  const sheet = page.locator('.form-sheet');
  await sheet.getByPlaceholder('Например, общежитие').fill('Бассейн');
  await sheet.getByPlaceholder('0,00').fill('9,99');
  await sheet.locator('.calendar-day', { hasText: /^30$/ }).click();
  await sheet.getByRole('radio', { name: 'Не повторять' }).click();
  await sheet.getByRole('button', { name: 'Добавить' }).click();
  const list = page.getByTestId('onboarding-payments');
  await expect(list.locator('li')).toHaveText([
    /^Бассейн30 сентября · один раз9,99/,
    /^Общежитие1 октября · каждый месяц45,00/,
    /^Интернет3 октября · каждый месяц30,00/,
    /^Телефон4 октября · каждый месяц20,00/,
  ]);
  await expect(page.getByRole('button', { name: 'Общежитие', exact: true })).toHaveClass(/is-selected/);
  await expect(page.getByRole('button', { name: 'Пропустить' })).toHaveCount(0);
  await list.getByRole('button', { name: 'Убрать Бассейн' }).click();
  await expect(list.locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Дальше' }).click();

  await expect(page.getByRole('heading', { name: 'Сколько уходит на продукты и проезд?' })).toBeVisible();
  await expect(page.getByText('Примерно за месяц.')).toBeVisible();
  await page.getByLabel('Продукты').fill('500');
  await page.getByLabel('Транспорт').fill('100');
  // The first period started on 5 September: 9 of its 30 days are left.
  await expect(page.getByTestId('reserves-preview')).toHaveText('До 5 октября отложим 180,00 BYN — это 9 дней из 30');
  await expect(page.getByRole('button', { name: 'Пропустить' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Посчитать лимит' }).click();

  // (586 − 95 − 150 − 30) ÷ 9 instead of 54,55 without products and transport.
  await expect(page.getByTestId('first-limit')).toHaveText('34,55BYN');
  await expect(page.getByTestId('first-limit-formula')).toHaveText('586,00 − 95,00 платежей − 180,00 на продукты и транспорт = 311,00 на 9 дней');
  await expect(page.getByText('Пока лимит завышен')).toHaveCount(0);
  const month = page.getByTestId('month-preview');
  await expect(month).toContainText('Вот твой месяц');
  const marks = await month.locator('[data-marks]').evaluateAll((days) => days.map((d) => [d.getAttribute('data-date'), d.getAttribute('data-marks')]));
  expect(marks).toEqual([
    ['2026-10-01', 'payment'],
    ['2026-10-03', 'payment'],
    ['2026-10-04', 'payment'],
    ['2026-10-05', 'income'],
  ]);
  await expect(month.locator('.is-today')).toHaveAttribute('data-date', '2026-09-26');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('first-limit-reserves.png') });

  await page.getByRole('button', { name: 'На главную' }).click();
  // With products and transport the money still lasts to 5 October, only the limit is smaller.
  await expect(lesson(page).getByTestId('lesson-text')).toHaveText(RING_HINT);
  await lesson(page).getByRole('button', { name: 'Понятно' }).click();
  await expect(lesson(page)).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('34,55');
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
});

test('short phone 375×667: every setup screen fits with its main button; a step back keeps every answer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'ru-RU' });
  const page = await context.newPage();
  await page.clock.install({ time: TODAY });
  await page.goto(BASE);

  /** Nothing scrolls, and the main button is fully on screen. */
  const fits = async (name: string, button: Locator) => {
    await expect(button).toBeInViewport({ ratio: 1 });
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main.screen')!;
      const body = main.querySelector('.onboarding-body, .first-limit-body');
      return [main.scrollHeight - main.clientHeight, body ? body.scrollHeight - body.clientHeight : 0, window.scrollY];
    });
    console.log(`${name}: screen, body and page overflow ${overflow.join(', ')}`);
    expect(overflow).toEqual([0, 0, 0]);
  };
  const next = page.getByRole('button', { name: 'Дальше' });

  await fits('welcome', page.getByRole('button', { name: 'Начать' }));
  await page.getByRole('button', { name: 'Начать' }).click();
  await typeAmount(page, '586');
  await fits('money', next);
  await next.click();
  await fits('source', page.getByRole('button', { name: /Пока нет постоянных/ }));
  await page.getByRole('button', { name: 'Стипендия', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await page.locator('.calendar-day', { hasText: /^5$/ }).click();
  await fits('when', next);
  await next.click();
  await typeAmount(page, '220');
  await fits('amount', next);
  await next.click();
  await addPayment(page, 'Общежитие', '45', 1);
  await addPayment(page, 'Интернет', '30', 3);
  await addPayment(page, 'Телефон', '20', 4);
  await fits('payments', next);
  await next.click();
  await page.getByLabel('Продукты').fill('500');
  await page.getByLabel('Транспорт').fill('100');
  await fits('reserves', page.getByRole('button', { name: 'Посчитать лимит' }));

  // All the way back: every answer is still there.
  const back = page.getByRole('button', { name: 'Назад' });
  await back.click();
  await expect(page.getByTestId('onboarding-payments').locator('li')).toHaveCount(3);
  await back.click();
  await expect(page.getByTestId('income-amount')).toHaveText('220');
  await back.click();
  await expect(page.locator('.step-caption')).toHaveText('5 октября, через 9 дней, дальше каждый месяц 5-го');
  await back.click();
  await expect(page.getByRole('button', { name: 'Стипендия', exact: true })).toHaveClass(/is-selected/);
  await back.click();
  await expect(page.getByTestId('start-amount')).toHaveText('586');

  // And forward again to the same first limit.
  await next.click();
  await page.getByRole('button', { name: 'Стипендия', exact: true }).click();
  await next.click();
  await next.click();
  await next.click();
  await expect(page.getByLabel('Продукты')).toHaveValue('500');
  await expect(page.getByLabel('Транспорт')).toHaveValue('100');
  await page.getByRole('button', { name: 'Посчитать лимит' }).click();
  await expect(page.getByTestId('first-limit')).toHaveText('34,55BYN');
  await fits('first limit', page.getByRole('button', { name: 'На главную' }));
  await context.close();
});

/** Example А as update 2 saves it (data version 6), set up on 20 September. */
function v6(changes: Record<string, unknown> = {}) {
  return {
    ...PRE_UPDATE_DATA,
    schemaVersion: 6,
    settings: {
      ...PRE_UPDATE_DATA.settings,
      cushion: { mode: 'fixed', amountKopecks: 0, targetKopecks: null },
      targetDailyLimitKopecks: null,
      roundUp: null,
    },
    incomeSources: PRE_UPDATE_DATA.incomeSources.map((s) => ({ ...s, date: null })),
    payments: PRE_UPDATE_DATA.payments.map((p) => ({ ...p, weekday: null, date: null })),
    savingsMoves: [],
    ...changes,
  };
}

/** The same as update 1 saved it (data version 5). */
const V5_DATA = {
  ...PRE_UPDATE_DATA,
  schemaVersion: 5,
  settings: { ...PRE_UPDATE_DATA.settings, targetDailyLimitKopecks: null },
  incomeSources: PRE_UPDATE_DATA.incomeSources.map((s) => ({ ...s, date: null })),
  payments: PRE_UPDATE_DATA.payments.map((p) => ({ ...p, weekday: null, date: null })),
};

/** The interface state of update 1 after its tips: «Что нового» of update 1 closed. */
const UPDATE_1_UI = { ...PRE_UPDATE_UI, tipsShown: true, whatsNewSeen: 'update-1' };

/** Update 2 with every hint seen but `except`, «Что нового» closed and a copy just saved. */
function uiSeen(except: string[] = [], changes: Record<string, unknown> = {}) {
  return { ...PRE_UPDATE_UI, tipsShown: true, whatsNewSeen: 'update-2', lessonsSeen: ALL_LESSONS.filter((id) => !except.includes(id)), lastBackupAt: '2026-09-25', ...changes };
}

function expenseTx(id: string, amountKopecks: number, date: string, createdAt: string) {
  return { id, type: 'expense', amountKopecks, date, createdAt, category: 'cafe', incomeSourceId: null, paymentId: null, goalId: null, plannedDate: null, note: null };
}

const START = PRE_UPDATE_DATA.transactions[0]!;
const COFFEE = expenseTx('coffee', 350, '2026-09-26', '2026-09-26T07:30:00.000Z');
const HEADPHONES = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-09-20',
  deadline: '2026-12-20',
  percent: null,
  schedule: null,
  status: 'active',
};

/** Two boxes overlap. */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('a new person: the ring hint after the setup, then what is left after the first expense, then the row; «Первая неделя» ticks itself and goes after five', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await setUpSkippingReserves(page);

  // One hint, at the ring, with the day of the next income; nothing is dimmed.
  const hint = lesson(page);
  await expect(hint).toHaveAttribute('data-lesson', 'ring');
  await expect(hint.getByTestId('lesson-text')).toHaveText(RING_HINT);
  await expect(hint).toHaveRole('status');
  const ring = (await page.getByTestId('ring').boundingBox())!;
  const bubble = (await hint.boundingBox())!;
  expect(overlaps(ring, bubble)).toBe(false);
  expect(bubble.y).toBeGreaterThan(ring.y + ring.height);
  const week = page.getByTestId('first-week');
  await expect(week.getByTestId('first-week-title')).toHaveText('Знакомство с Dayly · 0 из 5');
  await expect(week.getByTestId('first-week-item')).toHaveText([
    'Добавь первую трату',
    'Посмотри, как считается лимит',
    'Запланируй платёж или доход в календаре',
    'Заведи банку в копилке',
    'Установи Dayly на экран «Домой»',
  ]);
  await expect(page.getByTestId('whats-new')).toHaveCount(0);

  // A tap elsewhere closes the hint and still works: «+ Трата» opens the sheet, with no hint over it.
  await page.getByRole('button', { name: '+ Трата' }).click();
  await expect(page.locator('.expense-sheet')).toBeVisible();
  await expect(hint).toHaveCount(0);
  await typeAmount(page, '3,5');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.expense-sheet')).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
  await expect(hint).toHaveAttribute('data-lesson', 'firstExpense');
  await expect(hint.getByTestId('lesson-text')).toHaveText('Осталось 51,05 BYN. Не потратишь сегодня — завтра можно будет больше');
  await expect(week.getByTestId('first-week-title')).toHaveText('Знакомство с Dayly · 1 из 5');

  // «Понятно», and the next one points at the new row once it is in view, below «Первая неделя».
  await hint.getByRole('button', { name: 'Понятно' }).click();
  await page.waitForTimeout(800);
  await expect(hint).toHaveCount(0);
  await page.getByTestId('operation').first().scrollIntoViewIfNeeded();
  await expect(hint).toHaveAttribute('data-lesson', 'tapRow');
  await expect(hint.getByTestId('lesson-text')).toHaveText('Нажми на трату, чтобы изменить или удалить');
  const row = (await page.getByTestId('operation').first().boundingBox())!;
  expect(overlaps(row, (await hint.boundingBox())!)).toBe(false);
  await page.getByTestId('operation').first().getByRole('button').click();
  await expect(hint).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Удалить' })).toBeVisible();
  await page.locator('.sheet-dim').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('button', { name: 'Удалить' })).toHaveCount(0);

  // «Посмотри, как считается лимит» opens «Как считается».
  await week.getByRole('button', { name: 'Посмотри, как считается лимит' }).click();
  await expect(page.getByRole('heading', { name: 'Как считается лимит' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(week.getByTestId('first-week-title')).toHaveText('Знакомство с Dayly · 2 из 5');

  // «Запланируй…» opens the calendar, whose hint shows on this first visit.
  await week.getByRole('button', { name: 'Запланируй платёж или доход в календаре' }).click();
  await expectCalendarOpen(page);
  await expect(hint).toHaveAttribute('data-lesson', 'finances');
  await expect(hint.getByTestId('lesson-text')).toHaveText('Нажми на день, чтобы запланировать доход или расход');
  await page.locator('.cal-day[data-date="2026-09-30"]').click();
  await expect(hint).toHaveCount(0);
  await page.locator('.day-sheet').getByRole('button', { name: '+ Расход' }).click();
  const form = page.locator('.event-sheet');
  await form.getByPlaceholder('Например, общежитие').fill('Спортзал');
  await form.getByPlaceholder('0,00').fill('25');
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect(form).toHaveCount(0);
  await page.locator('.sheet-dim').click({ position: { x: 20, y: 20 } });
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(week.getByTestId('first-week-title')).toHaveText('Знакомство с Dayly · 3 из 5');
  await expect(week.locator('li[data-done="true"]')).toHaveCount(3);

  // A jar, and the app on the home screen: the card says it is done, once.
  await page.evaluate(
    (goal) => {
      const data = JSON.parse(localStorage.getItem('dayly:data')!);
      localStorage.setItem('dayly:data', JSON.stringify({ ...data, goals: [goal] }));
    },
    { ...HEADPHONES, startDate: '2026-09-26' },
  );
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.reload();
  await expect(week).toContainText('Готово, ты знаешь всё главное');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('first-week-done.png') });
  await week.getByRole('button', { name: 'Скрыть знакомство' }).click();
  await expect(week).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(week).toHaveCount(0);
});

test('a person of update 1 (data v5, tips seen): «Что нового» of update 2, no «Первая неделя», the «Копилка» and calendar hints on the first visit', async ({ page }) => {
  await openSeeded(page, V5_DATA, UPDATE_1_UI);
  const card = page.getByTestId('whats-new');
  for (const line of WHATS_NEW) await expect(card).toContainText(line);
  await expect(card.getByRole('button', { name: 'Открыть копилку' })).toBeVisible();
  await expect(page.getByTestId('first-week')).toHaveCount(0);
  // They know the ring: no hint on the home screen.
  await page.waitForTimeout(1000);
  await expect(lesson(page)).toHaveCount(0);

  await page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true }).click();
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'savings');
  await expect(lesson(page).getByTestId('lesson-text')).toHaveText(
    'Отложенное остаётся на твоей карте, просто лимит считается без него. Положи первую сумму или заведи банку',
  );
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('hint-savings.png') });
  await lesson(page).getByRole('button', { name: 'Понятно' }).click();
  await expect(lesson(page)).toHaveCount(0);

  await financesTab(page).click();
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'finances');
  await page.keyboard.press('Escape');
  await expect(lesson(page)).toHaveCount(0);

  // Once each.
  await page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true }).click();
  await financesTab(page).click();
  await page.waitForTimeout(800);
  await expect(lesson(page)).toHaveCount(0);

  // «Что нового» stays until closed; «Открыть копилку» closes it and opens the tab.
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Открыть копилку' }).click();
  await expect(page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).lessonsSeen)).toEqual([
    'ring',
    'firstExpense',
    'overspend',
    'leftover',
    'banner',
    'deficit',
    'periodEnd',
    'savings',
    'finances',
  ]);
});

test('a person from before update 1 (data v4): «Что нового» from «Настройки» too; «Открыть копилку» there opens the tab', async ({ page }) => {
  await openSeeded(page, PRE_UPDATE_DATA, PRE_UPDATE_UI);
  await expect(page.getByTestId('whats-new')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(lesson(page)).toHaveCount(0);
  await page.getByTestId('whats-new').getByRole('button', { name: 'Закрыть «Что нового»' }).click();
  await expect(page.getByTestId('whats-new')).toHaveCount(0);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Что нового', exact: true }).click();
  const sheet = page.getByTestId('whats-new-sheet');
  for (const line of WHATS_NEW) await expect(sheet).toContainText(line);
  await page.getByRole('button', { name: 'Открыть копилку' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('«Что нового» sits right under the ring: a small phone shows its title without scrolling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'ru-RU' });
  const page = await context.newPage();
  // A lived week: the week strip and «с вчера» are under the ring too.
  const coffee = expenseTx('coffee', 1250, '2026-09-25', '2026-09-25T12:00:00.000Z');
  const lived = {
    ...PRE_UPDATE_DATA,
    transactions: [...PRE_UPDATE_DATA.transactions, coffee],
    daySummaries: [
      { date: '2026-09-24', dailyLimitKopecks: 5000 },
      { date: '2026-09-25', dailyLimitKopecks: 5100 },
    ],
  };
  await openSeeded(page, lived, PRE_UPDATE_UI, '53,16'); // (573,50 − 95,00) ÷ 9
  const title = (await page.getByTestId('whats-new').getByText('Что нового в Dayly').boundingBox())!;
  const ring = (await page.getByTestId('ring').boundingBox())!;
  const bar = (await page.locator('.home-bottom').boundingBox())!;
  console.log(`375×667: ring bottom ${Math.round(ring.y + ring.height)}, «Что нового» title ${Math.round(title.y)}–${Math.round(title.y + title.height)}, bottom bar from ${Math.round(bar.y)}`);
  expect(title.y).toBeGreaterThan(ring.y + ring.height);
  expect(title.y + title.height).toBeLessThanOrEqual(bar.y);
  await expect(page.getByText('В лимите 2 дня подряд')).toBeAttached();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('whats-new-small.png') });
  await context.close();
});

test('«Сохрани копию» in a browser: a week of data and an old copy; «Сохранить» saves the file and the card goes', async ({ page }) => {
  // Set up on 10 September, last copy on 1 September.
  const data = v6({ settings: { ...v6().settings, trackingStartDate: '2026-09-10' } });
  await openSeeded(page, data, uiSeen([], { lastBackupAt: '2026-09-01' }));
  const card = page.getByTestId('backup-card');
  await expect(card).toContainText('Сохрани копию');
  await expect(card).toContainText('Браузер может стереть данные, если долго не открывать Dayly. Сохрани копию — это секунда.');
  await expect(page.getByTestId('first-week')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  expect((await download).suggestedFilename()).toBe('dayly-2026-09-26.json');
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).lastBackupAt)).toBe('2026-09-26');
});

test('«Сохрани копию»: «Не сейчас» hides it for two weeks; never in the installed app or with less than a week of data', async ({ page }) => {
  const data = v6({ settings: { ...v6().settings, trackingStartDate: '2026-09-10' } });
  await openSeeded(page, data, uiSeen([], { lastBackupAt: null }));
  const card = page.getByTestId('backup-card');
  await card.getByRole('button', { name: 'Не сейчас' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await page.waitForTimeout(500);
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).backupCardHiddenOn)).toBe('2026-09-26');

  // From 20 September: six days of data only.
  await page.evaluate((v) => localStorage.setItem('dayly:data', v), JSON.stringify(v6()));
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('dayly:ui')!);
    localStorage.setItem('dayly:ui', JSON.stringify({ ...ui, backupCardHiddenOn: null }));
  });
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await page.waitForTimeout(500);
  await expect(card).toHaveCount(0);
});

test('«Как устроен Dayly»: six pages from «Настройки» with the person’s numbers; «Подробнее» on a hint opens its page', async ({ page }) => {
  await openSeeded(page, v6(), uiSeen(['ring']));
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'ring');
  await lesson(page).getByRole('button', { name: 'Подробнее' }).click();
  await expect(page.getByRole('heading', { name: 'Как устроен Dayly' })).toBeVisible();
  const limit = page.locator('#guide-limit');
  await expect(limit).toBeInViewport();
  await expect(limit).toContainText('Сегодня можно 54,55 BYN: столько, чтобы денег хватило до 5 октября.');
  await expect(page.getByTestId('guide-card').locator('strong')).toHaveText([
    'Лимит на день',
    'Резервы на продукты и проезд',
    'Перенос и перерасход',
    'Копилка и банки',
    'Календарь и платежи',
    'Где хранятся данные и зачем копия',
  ]);
  await expect(page.locator('#guide-calendar')).toContainText('Следующее поступление: Стипендия, 5 октября.');
  await expect(page.locator('#guide-data')).toContainText('Последняя копия — 25 сентября.');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('guide.png'), fullPage: true });
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  // The hint counts as seen.
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(lesson(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: /Как устроен Dayly/ }).click();
  await expect(page.getByTestId('guide-card')).toHaveCount(6);
});

test('«Начать знакомство заново»: the ring hint again, and «Первая неделя» within two weeks of the setup', async ({ page }) => {
  const week = { startedOn: '2026-09-20', dismissed: true, seenExplain: true, setupPlanIds: ['stipend', 'dorm', 'internet', 'phone'], completedOn: null };
  await openSeeded(page, v6(), uiSeen([], { firstWeek: week }));
  await page.waitForTimeout(800);
  await expect(lesson(page)).toHaveCount(0);
  await expect(page.getByTestId('first-week')).toHaveCount(0);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: /Начать знакомство заново/ }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'ring');
  await expect(page.getByTestId('first-week').getByTestId('first-week-title')).toHaveText('Знакомство с Dayly · 1 из 5');
});

test('«Функции»: every feature on by default; off leaves «Финансы», the hint of its calendar and «Открыть копилку», and stays off', async ({ page }) => {
  await openSeeded(page, v6(), uiSeen());
  await page.getByRole('button', { name: 'Настройки' }).click();
  const features = page.getByTestId('settings-features');
  await expect(features.getByRole('switch')).toHaveText([
    'Копилка',
    'Кольцо копилки',
    'Остаток дня в копилку',
    'Итоги периода',
    'Календарь в «Финансах»',
    'Полоска недели и серия',
    '«Завтра будет…»',
    'Жёлтое кольцо на 80%',
    'Отмена траты',
    '«Ближайшее»',
  ]);
  for (const s of await features.getByRole('switch').all()) await expect(s).toHaveAttribute('aria-checked', 'true');
  await features.getByRole('switch', { name: 'Календарь' }).click();
  await features.getByRole('switch', { name: 'Копилка', exact: true }).click();
  await expect(features.getByRole('switch', { name: 'Календарь' })).toHaveAttribute('aria-checked', 'false');
  // The calendar's tab stays without it; «Копилка» leaves the tab bar.
  await expect(page.locator('.tab-bar .tab')).toHaveCount(4);

  // «Начать знакомство заново»: no hint about a calendar that is off.
  await page.getByRole('button', { name: /Начать знакомство заново/ }).click();
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'ring');
  await lesson(page).getByRole('button', { name: 'Понятно' }).click();
  await financesTab(page).click();
  await expect(page.getByTestId('settings-incomes')).toBeVisible();
  await expect(page.getByTestId('finance-calendar')).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(lesson(page)).toHaveCount(0);

  // «Что нового» can no longer open «Копилка».
  await page.getByRole('button', { name: 'Настройки' }).click();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('features.png'), fullPage: true });
  await page.getByRole('button', { name: 'Что нового', exact: true }).click();
  await expect(page.getByTestId('whats-new-sheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть копилку' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByTestId('whats-new-sheet')).toHaveCount(0);

  // Off after a reload too; back on, the calendar and its hint are there again.
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(features.getByRole('switch', { name: 'Календарь' })).toHaveAttribute('aria-checked', 'false');
  await features.getByRole('switch', { name: 'Календарь' }).click();
  await financesTab(page).click();
  await expect(page.getByTestId('finance-calendar')).toBeVisible();
  await expect(lesson(page)).toHaveAttribute('data-lesson', 'finances');
});

// Every hint and card at 375×667 in both themes: the bubble stays clear of what it points at, the ring
// stays on screen with the card under it.

interface HintCase {
  name: string;
  data: unknown;
  lesson: string;
  /** The tab the hint is on, when not «Сегодня». */
  tab?: string;
  time?: Date;
  ui?: Record<string, unknown>;
  /** What the bubble points at. */
  target: string;
  text: string;
  /** The target is further down: the hint waits until it is scrolled into view. */
  scroll?: boolean;
}

const HINTS: HintCase[] = [
  { name: 'ring', data: v6(), lesson: 'ring', target: '[data-testid="ring"]', text: RING_HINT },
  {
    name: 'first-expense',
    data: v6({ transactions: [START, COFFEE] }),
    lesson: 'firstExpense',
    target: '[data-testid="ring"]',
    text: 'Осталось 51,05 BYN. Не потратишь сегодня — завтра можно будет больше',
  },
  {
    name: 'row',
    data: v6({ transactions: [START, COFFEE] }),
    lesson: 'tapRow',
    target: '[data-transaction-id="coffee"]',
    text: 'Нажми на трату, чтобы изменить или удалить',
    scroll: true,
  },
  {
    name: 'overspend',
    data: v6({ transactions: [START, expenseTx('dinner', 6000, '2026-09-26', '2026-09-26T08:00:00.000Z')] }),
    lesson: 'overspend',
    target: '[data-testid="ring"]',
    text: 'Ничего страшного: перерасход разойдётся по оставшимся дням. Завтра можно 53,87 BYN',
  },
  {
    name: 'leftover',
    data: v6({ goals: [HEADPHONES], daySummaries: [{ date: '2026-09-25', dailyLimitKopecks: 5100 }] }),
    lesson: 'leftover',
    target: '[data-testid="leftover-card"]',
    text: 'Остаток можно отложить в копилку или оставить — тогда лимит на следующие дни чуть вырастет',
  },
  {
    name: 'banner',
    data: v6({
      incomeSources: [
        ...v6().incomeSources,
        { id: 'parents', kind: 'parents', name: 'Родители', amountKopecks: 10000, dayOfMonth: 26, weekday: null, date: null, startDate: '2026-09-20', isActive: true },
      ],
    }),
    lesson: 'banner',
    target: '[data-testid="banner"]',
    text: 'Отметь, когда деньги придут: без этого я не знаю, что они уже у тебя',
  },
  {
    name: 'deficit',
    data: v6({ transactions: [{ ...START, amountKopecks: 5000 }] }),
    lesson: 'deficit',
    target: '[data-testid="deficit-hints"]',
    text: 'До 5 октября не хватает 45,00 BYN, поэтому лимит пока 0. Вот что можно сделать',
  },
  {
    name: 'period-end',
    // 6 October: the stipend came on the 5th, the first period is over.
    time: new Date('2026-10-06T10:00:00'),
    data: v6({
      transactions: [
        START,
        { ...START, id: 'stipend-5', type: 'income', amountKopecks: 22000, date: '2026-10-05', createdAt: '2026-10-05T09:00:00.000Z', incomeSourceId: 'stipend', plannedDate: '2026-10-05', note: null },
      ],
      daySummaries: [
        { date: '2026-09-28', dailyLimitKopecks: 5400 },
        { date: '2026-09-29', dailyLimitKopecks: 5500 },
      ],
    }),
    lesson: 'periodEnd',
    target: '[data-testid="period-summary"]',
    // No jar yet, so the card only closes.
    text: 'Так прошёл твой первый период. Новый лимит считается до следующего поступления',
  },
  { name: 'savings', data: v6(), lesson: 'savings', tab: 'Копилка', target: '[data-testid="piggy"], main.screen .screen-title', text: 'Отложенное остаётся на твоей карте, просто лимит считается без него. Положи первую сумму или заведи банку' },
  { name: 'calendar', data: v6(), lesson: 'finances', tab: 'Финансы', target: '[data-testid="calendar-grid"]', text: 'Нажми на день, чтобы запланировать доход или расход' },
];

for (const scheme of ['light', 'dark'] as const) {
  test(`hints at 375×667, ${scheme}: each next to its target, clear of it, the ring on screen`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'ru-RU', colorScheme: scheme });
    for (const hint of HINTS) {
      const page = await context.newPage();
      await page.addInitScript(
        ([data, ui]) => {
          localStorage.setItem('dayly:data', data);
          localStorage.setItem('dayly:ui', ui);
        },
        [JSON.stringify(hint.data), JSON.stringify(uiSeen([hint.lesson], hint.ui))] as const,
      );
      await page.clock.install({ time: hint.time ?? TODAY });
      await page.goto(BASE);
      await expect(page.getByTestId('hero-amount')).toBeVisible();
      if (hint.tab) await page.locator('.tab-bar').getByRole('button', { name: hint.tab, exact: true }).click();
      if (hint.scroll) await page.locator(hint.target).scrollIntoViewIfNeeded();
      const bubble = lesson(page);
      await expect(bubble, hint.name).toHaveAttribute('data-lesson', hint.lesson);
      await expect(bubble.getByTestId('lesson-text')).toHaveText(hint.text);
      await settle(page);
      const box = (await bubble.boundingBox())!;
      const target = (await page.locator(hint.target).first().boundingBox())!;
      expect(overlaps(box, target), `${hint.name}: the bubble covers its target`).toBe(false);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(667);
      // A banner's buttons stay free.
      for (const button of await page.locator('[data-testid="banner"] button, [data-testid="leftover-card"] button, [data-testid="period-summary"] button').all()) {
        expect(overlaps(box, (await button.boundingBox())!), `${hint.name}: covers a card button`).toBe(false);
      }
      await page.screenshot({ path: test.info().outputPath(`hint-${hint.name}-${scheme}.png`) });
      await page.close();
    }
    await context.close();
  });

  test(`cards under the ring at 375×667, ${scheme}: one at a time, the ring stays on screen`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'ru-RU', colorScheme: scheme });
    const longAgo = v6({ settings: { ...v6().settings, trackingStartDate: '2026-09-10' } });
    const cards = [
      // Everything at once: «Что нового» goes first.
      { name: 'whats-new', data: longAgo, ui: uiSeen([], { whatsNewSeen: 'update-1', lastBackupAt: null, firstWeek: { startedOn: '2026-09-20', dismissed: false, seenExplain: false, setupPlanIds: [], completedOn: null } }), card: 'whats-new' },
      { name: 'first-week', data: longAgo, ui: uiSeen([], { lastBackupAt: null, firstWeek: { startedOn: '2026-09-20', dismissed: false, seenExplain: true, setupPlanIds: ['stipend', 'dorm', 'internet', 'phone'], completedOn: null } }), card: 'first-week' },
      { name: 'backup', data: longAgo, ui: uiSeen([], { lastBackupAt: null }), card: 'backup-card' },
    ];
    for (const { name, data, ui, card } of cards) {
      const page = await context.newPage();
      await page.addInitScript(
        ([data, ui]) => {
          localStorage.setItem('dayly:data', data);
          localStorage.setItem('dayly:ui', ui);
        },
        [JSON.stringify(data), JSON.stringify(ui)] as const,
      );
      await page.clock.install({ time: TODAY });
      await page.goto(BASE);
      await expect(page.getByTestId(card)).toBeVisible();
      for (const other of ['whats-new', 'first-week', 'backup-card'].filter((c) => c !== card)) await expect(page.getByTestId(other)).toHaveCount(0);
      await settle(page);
      await expect(page.getByTestId('ring')).toBeInViewport({ ratio: 1 });
      const ring = (await page.getByTestId('ring').boundingBox())!;
      const top = (await page.getByTestId(card).boundingBox())!;
      const bar = (await page.locator('.home-bottom').boundingBox())!;
      console.log(`${name}, ${scheme}: ring bottom ${Math.round(ring.y + ring.height)}, card from ${Math.round(top.y)}, bottom bar from ${Math.round(bar.y)}`);
      expect(top.y).toBeGreaterThan(ring.y + ring.height);
      expect(top.y + 40).toBeLessThanOrEqual(bar.y);
      await page.screenshot({ path: test.info().outputPath(`card-${name}-${scheme}.png`) });
      await page.close();
    }
    await context.close();
  });
}
