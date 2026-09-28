import { expect, test, type Locator, type Page } from '@playwright/test';

// Update 1 «Знакомство» (task E): the first setup with one question per screen, the first-launch tips,
// «Что нового» for people from before the update and «Настройки → Функции».
// The clock is fixed to 26 September 2026, the day of example А, so the numbers are known.

const TODAY = new Date('2026-09-26T10:00:00');
declare const process: { env: Record<string, string | undefined> };
const BASE = `http://localhost:${process.env.DAYLY_E2E_PORT ?? '4173'}/`;

const WHATS_NEW = [
  'Что нового в Dayly',
  'Календарь: нажми на дату и добавь доход или расход, разово или с повтором.',
  'Копилка: откладывай процент с каждого поступления, кольцо покажет, сколько уже отложено.',
  'Цель по лимиту: скажи, сколько хочешь тратить в день, и мы подскажем, как дотянуть.',
  'Неделя под кругом, отмена траты и итоги периода.',
  'Лишнее можно выключить в «Настройках → Функции».',
];

const TIPS = [
  'Нажми на круг — покажу, как считается',
  'Долгий тап по трате — изменить или удалить',
  'Во вкладке «Календарь» можно планировать доходы и расходы',
];

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

/** Example А through the whole setup, products and transport skipped, up to the home screen with its tips. */
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

/** Opens the app with what an older version saved; `ui` is the saved interface state. Seeds once, so a reload keeps changes. */
async function openSeeded(page: Page, data: unknown, ui: unknown) {
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
  await page.goto('/');
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
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

/** The «Календарь» button of the tab bar. */
const calendarTab = (page: Page) => page.locator('.tab-bar').getByRole('button', { name: 'Календарь', exact: true });

/** The «Календарь» tab is open. */
async function expectCalendarOpen(page: Page) {
  await expect(page.getByTestId('calendar-grid')).toBeVisible();
  await expect(calendarTab(page)).toHaveAttribute('aria-current', 'page');
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
  await expect(page.getByTestId('tips').getByTestId('tip-text')).toHaveText(TIPS[0]!);
  await page.getByTestId('tips').getByRole('button', { name: 'Пропустить' }).click();
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

test('first-launch tips: three in turn over the home screen, only once; a new person never sees «Что нового»', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await toPayments(page);
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  // Products and transport skipped: the limit still holds them.
  await expect(page.getByText('Пока лимит завышен')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Настроить резервы →' })).toBeVisible();
  await page.getByRole('button', { name: 'На главную' }).click();

  const tips = page.getByTestId('tips');
  const text = tips.getByTestId('tip-text');
  await expect(text).toHaveText(TIPS[0]!);
  await expect(tips).toContainText('1 из 3');
  // The first tip lights up the ring.
  const ring = (await page.getByTestId('ring').boundingBox())!;
  const spot = (await tips.locator('.tips-spot').boundingBox())!;
  const [x, y] = [ring.x + ring.width / 2, ring.y + ring.height / 2];
  expect(x > spot.x && x < spot.x + spot.width && y > spot.y && y < spot.y + spot.height).toBe(true);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('tip-ring.png') });

  await tips.getByRole('button', { name: 'Дальше' }).click();
  await expect(text).toHaveText(TIPS[1]!);
  // A tap anywhere goes on as well.
  await page.mouse.click(12, 12);
  await expect(text).toHaveText(TIPS[2]!);
  await expect(tips).toContainText('3 из 3');
  await expect(tips.getByRole('button', { name: 'Пропустить' })).toHaveCount(0);
  await settle(page);
  // The last one lights up the «Календарь» tab.
  const tab = (await calendarTab(page).boundingBox())!;
  const tabSpot = (await tips.locator('.tips-spot').boundingBox())!;
  const [tx, ty] = [tab.x + tab.width / 2, tab.y + tab.height / 2];
  expect(tx > tabSpot.x && tx < tabSpot.x + tabSpot.width && ty > tabSpot.y && ty < tabSpot.y + tabSpot.height).toBe(true);
  expect(tabSpot.width).toBeLessThan(tab.width * 2);
  await page.screenshot({ path: test.info().outputPath('tip-calendar.png') });
  await tips.getByRole('button', { name: 'Понятно' }).click();
  await expect(tips).toHaveCount(0);
  await expect(page.getByTestId('whats-new')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('65,11'); // 586,00 ÷ 9 days: no payments, no reserves
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('tips')).toHaveCount(0);
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
});

test('«Что нового»: on the home screen for someone from before update 1 until closed; again from «Настройки»', async ({ page }) => {
  await openSeeded(page, PRE_UPDATE_DATA, PRE_UPDATE_UI);
  const card = page.getByTestId('whats-new');
  for (const line of WHATS_NEW) await expect(card).toContainText(line);
  await expect(card.getByRole('button', { name: 'Открыть календарь' })).toBeVisible();
  // They know the app: no first-launch tips.
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('tips')).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('whats-new.png') });

  // Still there after a reload, gone for good once closed.
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Закрыть «Что нового»' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await page.waitForTimeout(1000);
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('tips')).toHaveCount(0);

  // «Настройки → Что нового» shows the same text; «Открыть календарь» opens the calendar.
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Что нового', exact: true }).click();
  const sheet = page.getByTestId('whats-new-sheet');
  for (const line of WHATS_NEW) await expect(sheet).toContainText(line);
  await page.getByRole('button', { name: 'Открыть календарь' }).click();
  await expect(sheet).toHaveCount(0);
  await expectCalendarOpen(page);
});

test('«Открыть календарь» on the card closes «Что нового» and opens the calendar', async ({ page }) => {
  await openSeeded(page, PRE_UPDATE_DATA, PRE_UPDATE_UI);
  await page.getByTestId('whats-new').getByRole('button', { name: 'Открыть календарь' }).click();
  await expectCalendarOpen(page);
  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(page.getByTestId('whats-new')).toHaveCount(0);
});

test('«Функции»: every feature on by default; «Календарь» turned off leaves the tab bar, the tips and «Что нового», and stays off', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await setUpSkippingReserves(page);
  await page.getByTestId('tips').getByRole('button', { name: 'Пропустить' }).click();

  await page.getByRole('button', { name: 'Настройки' }).click();
  const features = page.getByTestId('settings-features');
  await expect(features.getByRole('switch')).toHaveText([
    'Календарь',
    'Кольцо копилки',
    'Остаток дня в копилку',
    'Итоги периода',
    'Полоска недели и серия',
    '«Завтра будет…»',
    'Жёлтое кольцо на 80%',
    'Отмена траты',
    '«Ближайшее»',
  ]);
  for (const s of await features.getByRole('switch').all()) await expect(s).toHaveAttribute('aria-checked', 'true');
  const calendar = features.getByRole('switch', { name: 'Календарь' });
  await expect(calendarTab(page)).toBeVisible();
  await calendar.click();
  await expect(calendar).toHaveAttribute('aria-checked', 'false');
  await expect(calendarTab(page)).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('features.png'), fullPage: true });

  // «Что нового» can no longer open the calendar.
  await page.getByRole('button', { name: 'Что нового', exact: true }).click();
  await expect(page.getByTestId('whats-new-sheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть календарь' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByTestId('whats-new-sheet')).toHaveCount(0);

  // Off after a reload too; the data are as they were.
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(features.getByRole('switch', { name: 'Календарь' })).toHaveAttribute('aria-checked', 'false');
  await expect(calendarTab(page)).toHaveCount(0);

  // «Показать подсказки снова»: the tips come back on the home screen, without the calendar one.
  await page.getByRole('button', { name: /Показать подсказки снова/ }).click();
  const tips = page.getByTestId('tips');
  await expect(tips.getByTestId('tip-text')).toHaveText(TIPS[0]!);
  await expect(tips).toContainText('1 из 2');
  await tips.getByRole('button', { name: 'Дальше' }).click();
  await expect(tips.getByTestId('tip-text')).toHaveText(TIPS[1]!);
  await tips.getByRole('button', { name: 'Понятно' }).click();
  await expect(tips).toHaveCount(0);

  // Back on: the tab and the calendar tip are there again.
  await page.getByRole('button', { name: 'Настройки' }).click();
  await features.getByRole('switch', { name: 'Календарь' }).click();
  await expect(calendarTab(page)).toBeVisible();
  await page.getByRole('button', { name: /Показать подсказки снова/ }).click();
  await expect(tips).toContainText('1 из 3');
});
