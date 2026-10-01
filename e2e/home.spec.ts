import { expect, test, type Browser, type Page } from '@playwright/test';
import { exampleA, tx } from '../src/domain/fixtures';
import type { AppData } from '../src/domain/types';

// Update 1 on the home screen (task C): «Хочу тратить N» with «Как дотянуть», «Завтра будет…», the week
// strip, the yellow ring, «Отменить» after «Добавить» and «Ближайшее». Data is seeded straight into
// localStorage; the clock is 26 September 2026, so example А of PROJECT_MAP.md gives the limit 28,54.

const TODAY = new Date('2026-09-26T10:00:00');
declare const process: { env: Record<string, string | undefined> };
const BASE = `http://localhost:${process.env.DAYLY_E2E_PORT ?? '4173'}/`;

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

const ACCENTS = ['amber', 'mint', 'sky', 'lavender', 'coral'];

/** Example А with the names a student would type. */
function named(data: AppData): AppData {
  const names: Record<string, string> = {
    scholarship: 'Стипендия',
    parents: 'От родителей',
    salary: 'Подработка',
    dorm: 'Общежитие',
    internet: 'Интернет',
    phone: 'Телефон',
  };
  return {
    ...data,
    incomeSources: data.incomeSources.map((s) => ({ ...s, name: names[s.id] ?? s.name })),
    payments: data.payments.map((p) => ({ ...p, name: names[p.id] ?? p.name })),
  };
}

/**
 * A lived week before 26 September: within the limit on the 20th and 22nd–25th, over it on the 21st.
 * 100,50 spent then, so 686,50 at the start leaves example А's 586,00 and its limit 28,54 today.
 */
function lived(): AppData {
  const data = named(exampleA({ balanceKopecks: 68650 }));
  const days: [string, number, number][] = [
    ['2026-09-20', 2600, 1200],
    ['2026-09-21', 2600, 3500],
    ['2026-09-22', 2700, 900],
    ['2026-09-23', 2700, 2000],
    ['2026-09-24', 2800, 0],
    ['2026-09-25', 2800, 2450],
  ];
  data.daySummaries = days.map(([date, dailyLimitKopecks]) => ({ date, dailyLimitKopecks }));
  for (const [date, , spent] of days) {
    if (spent > 0) data.transactions.push(tx({ type: 'expense', amountKopecks: spent, date, category: 'cafe' }));
  }
  return data;
}

/** Opens the app with `data`; the tips and «Что нового» are already seen. Seeds only once, so a reload keeps changes. */
async function open(page: Page, data: AppData, ui: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([data, ui]) => {
      if (localStorage.getItem('dayly:data') === null) {
        localStorage.setItem('dayly:data', data);
        localStorage.setItem('dayly:ui', ui);
      }
    },
    [JSON.stringify(data), JSON.stringify({ ...INTRO_DONE, ...ui })] as const,
  );
  await page.clock.install({ time: TODAY });
  await page.goto(BASE);
  await expect(page.getByTestId('hero-amount')).toBeVisible();
}

/** Waits for screen, card and ring animations to end, so a screenshot shows the final look. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

async function typeAmount(page: Page, amount: string) {
  for (const ch of amount) await page.keyboard.press(ch === ',' ? 'Comma' : ch);
}

/** «+ Трата» → amount → «Добавить», in the last used category («Кафе»). */
async function addExpense(page: Page, amount: string) {
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, amount);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}

/** Long press on the latest operation → «Изменить» → a new amount → «Сохранить». */
async function editLatest(page: Page, amount: string) {
  await page.getByTestId('operation').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Изменить' }).click();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
  await typeAmount(page, amount);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}

test('target 60 BYN: the home line opens «Как дотянуть», a lever gives exactly the limit it promised', async ({ page }) => {
  await open(page, named(exampleA()));
  await expect(page.getByTestId('target-line')).toHaveCount(0);

  // «Финансы → Цель по лимиту»: the form says how far the limit is from the typed amount.
  await page.getByRole('button', { name: 'Финансы' }).click();
  await expect(page.getByTestId('finance-target')).toContainText('задай сумму');
  await page.getByTestId('finance-target').getByRole('button').click();
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('60');
  await expect(page.locator('.field-hint')).toHaveText('Сейчас можно 28,54 BYN, не хватает 31,46. На главной подскажем, как дотянуть.');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('target-form.png') });
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('finance-target')).toContainText('Хочу тратить в деньсейчас 28,54, не хватает 31,4660,00');
  await page.getByTestId('finance-target').scrollIntoViewIfNeeded();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('finances-target.png') });

  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('target-line')).toHaveText('До 60,00 BYN в день не хватает 31,46 →');
  await page.getByTestId('target-line').click();
  await expect(page.getByRole('heading', { name: 'Как дотянуть' })).toBeVisible();
  await expect(page.getByTestId('levers-limit')).toHaveText('28,54');
  await expect(page.getByTestId('levers-target')).toHaveText('60,00');
  await expect(page.getByTestId('levers-verdict')).toHaveText('Не хватает 31,46 BYN в день');
  const levers = page.getByTestId('lever');
  await expect(levers.getByTestId('lever-title')).toHaveText([
    'Резерв «Продукты» 450 вместо 500',
    'Сдвинуть «Наушники» на 20 декабря',
    'Подушка 23 вместо 30',
    'Резерв «Транспорт» 90 вместо 100',
  ]);
  await expect(levers.getByTestId('lever-effect')).toHaveText([
    '+1,67 в день · станет 30,21',
    '+0,93 в день · станет 29,47',
    '+0,78 в день · станет 29,32',
    '+0,33 в день · станет 28,87',
  ]);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('levers.png') });

  // «Сдвинуть цель» shows the limit that applying it gives.
  await levers.filter({ hasText: 'Наушники' }).getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByTestId('levers-limit')).toHaveText('29,47');
  await expect(page.getByTestId('levers-verdict')).toHaveText('Не хватает 30,53 BYN в день');
  // The list is counted again from the changed data: the goal can move once more.
  await expect(levers.filter({ hasText: 'Наушники' }).getByTestId('lever-title')).toHaveText('Сдвинуть «Наушники» на 20 января 2027');
  const next = await levers.first().getByTestId('lever-effect').innerText();
  const promised = /станет (\S+)$/.exec(next)![1]!;
  await levers.first().getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByTestId('levers-limit')).toHaveText(promised);

  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText(promised);
  await expect(page.getByTestId('ring-caption')).toHaveText(`BYN из ${promised}`);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:data')!) as AppData);
  expect(stored.goals[0]!.deadline).toBe('2026-12-20');

  // Below the limit the line turns into a quiet «достигнута»; «Убрать цель» removes it.
  await page.getByRole('button', { name: 'Финансы' }).click();
  await page.getByTestId('finance-target').getByRole('button').click();
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('25');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('target-line')).toHaveText('Цель 25,00 BYN в день достигнута');
  await page.getByRole('button', { name: 'Финансы' }).click();
  await page.getByTestId('finance-target').getByRole('button').click();
  await page.getByRole('button', { name: 'Убрать цель' }).click();
  await expect(page.getByTestId('finance-target')).toContainText('задай сумму');
  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('target-line')).toHaveCount(0);
});

test('«Как дотянуть» with nothing to move says so', async ({ page }) => {
  // No goals, reserves or cushion: every lever is gone.
  const data = named(exampleA({ full: false }));
  data.settings.targetDailyLimitKopecks = 10000;
  await open(page, data);
  await page.getByTestId('target-line').click();
  await expect(page.getByTestId('levers-empty')).toContainText('Сейчас нечего подвинуть');
  await expect(page.getByTestId('lever')).toHaveCount(0);
});

test('spending 85 % of the limit turns the ring yellow, apart from every accent', async ({ page }) => {
  await open(page, named(exampleA()));
  const arc = page.locator('.ring-arc');
  await expect(arc).toHaveClass(/ring-arc-accent/);
  // Example А has no past day with a limit yet: the week strip waits for the first one.
  await expect(page.getByTestId('week-strip')).toHaveCount(0);

  // 85 % of 28,54 is 24,26: 4,28 left, less than 20 %.
  await addExpense(page, '24,26');
  await expect(page.getByTestId('hero-amount')).toHaveText('4,28');
  await expect(arc).toHaveClass(/ring-arc-warning/);
  await expect(page.locator('.ring-label')).toHaveText('Осталось меньше 20%');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('ring-warning.png') });

  // The arc colour against each accent: not the accent, and far from it.
  const colors = await page.evaluate(async (accents) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const result: Record<string, { arc: string; accent: string }> = {};
    for (const accent of accents) {
      document.documentElement.dataset.accent = accent;
      probe.style.color = 'var(--accent)';
      await new Promise((r) => requestAnimationFrame(r));
      result[accent] = {
        arc: getComputedStyle(document.querySelector('.ring-arc')!).stroke,
        accent: getComputedStyle(probe).color,
      };
    }
    probe.remove();
    return result;
  }, ACCENTS);
  console.log('warning arc vs accents:', JSON.stringify(colors));
  for (const accent of ACCENTS) expect(colors[accent]!.arc).not.toBe(colors[accent]!.accent);

  // Up to 80 % it stays the accent: 22,83 spent in all is 79,99 %.
  await page.evaluate(() => (document.documentElement.dataset.accent = 'amber'));
  await editLatest(page, '22,83');
  await expect(page.getByTestId('hero-amount')).toHaveText('5,71');
  await expect(arc).toHaveClass(/ring-arc-accent/);
  await expect(page.locator('.ring-label')).toHaveText('Сегодня можно');

  // All of the limit spent is still yellow; a kopeck more is red.
  await editLatest(page, '28,54');
  await expect(page.getByTestId('hero-amount')).toHaveText('0,00');
  await expect(arc).toHaveClass(/ring-arc-warning/);
  await expect(page.locator('.ring-label')).toHaveText('На сегодня всё');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('ring-all-spent.png') });
  await editLatest(page, '28,55');
  await expect(arc).toHaveClass(/ring-arc-danger/);
  await expect(page.locator('.ring-label')).toHaveText('Сегодня перерасход');
});

test('«Отменить» within 5 seconds takes back a new expense or income and restores the limit', async ({ page }) => {
  await open(page, named(exampleA()));
  await addExpense(page, '4,5');
  await expect(page.getByTestId('hero-amount')).toHaveText('24,04');
  const toast = page.getByRole('status');
  await expect(toast).toContainText('Кафе −4,50');
  await toast.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
  await expect(page.getByTestId('recent-operations')).toHaveCount(0);
  await expect(toast).toHaveCount(0);

  // An income too; the toast goes by itself after 5 seconds.
  await page.getByRole('button', { name: '+ Доход' }).click();
  await typeAmount(page, '50');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(toast).toContainText('Доход +50,00');
  await page.clock.fastForward(5000);
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('recent-operations')).toContainText('+50,00');

  // The toast follows its operation: an edit changes it, a delete takes it away.
  await expect(page.getByTestId('hero-amount')).toHaveText('34,09'); // with the 50,00
  await addExpense(page, '2');
  await expect(toast).toContainText('Кафе −2,00');
  await editLatest(page, '3');
  await expect(toast).toContainText('Кафе −3,00');
  await page.getByTestId('operation').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Удалить трату' }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('34,09');

  // Editing an expense offers no «Отменить».
  await addExpense(page, '2');
  await page.clock.fastForward(5000);
  await expect(toast).toHaveCount(0);
  await editLatest(page, '3');
  await expect(page.getByTestId('recent-operations')).toContainText('−3,00');
  await expect(toast).toHaveCount(0);
});

test('week strip, «Завтра будет…» and «Ближайшее»; each tap opens the calendar in «Финансы»', async ({ page }) => {
  await open(page, lived());
  const strip = page.getByTestId('week-strip');
  await expect(strip.locator('.week-dot')).toHaveCount(7);
  expect(await strip.locator('.week-dot').evaluateAll((dots) => dots.map((d) => d.className.replace('week-dot ', '')))).toEqual([
    'is-in',
    'is-over',
    'is-in',
    'is-in',
    'is-in',
    'is-in',
    'is-today',
  ]);
  await expect(strip.locator('.week-streak')).toHaveText('В лимите 4 дня подряд');

  await expect(page.getByTestId('tomorrow-hint')).toHaveText(/^Остановишься сейчас — завтра \d+,\d\d/);
  // Said once: the bottom line keeps only the balance while the hint is on.
  await expect(page.getByTestId('tomorrow')).toHaveCount(0);
  await addExpense(page, '8,5');
  await expect(page.getByTestId('tomorrow-hint')).toHaveText('Остановишься сейчас — завтра 31,04 (+2,50)');

  await expect(page.getByTestId('upcoming')).toHaveText('Ближайшее: Чт: Общежитие −45 · 3 окт: Интернет −30');
  // «Ближайшее» opens «Финансы» on that day's sheet, the calendar in view; the week strip opens this month.
  const finances = page.locator('.tab-bar').getByRole('button', { name: 'Финансы', exact: true });
  await page.getByTestId('upcoming-item').nth(1).click();
  await expect(finances).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('calendar-month')).toHaveText('Октябрь');
  await expect(page.getByTestId('calendar-grid')).toBeInViewport();
  await expect(page.locator('.day-sheet')).toContainText('3 октября');
  await page.locator('.sheet-dim').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.day-sheet')).toHaveCount(0);
  // A form of «Финансы» and back: the day sheet does not open again.
  await page.getByRole('button', { name: '+ Добавить доход' }).click();
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(page.getByTestId('calendar-month')).toHaveText('Сентябрь');
  await expect(page.locator('.day-sheet')).toHaveCount(0);
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня', exact: true }).click();
  await strip.click();
  await expect(finances).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('calendar-month')).toHaveText('Сентябрь');
  await expect(page.locator('.day-sheet')).toHaveCount(0);
});

test('features turned off in «Настройки → Функции» are not shown', async ({ page }) => {
  const features = { weekStrip: false, tomorrowHint: false, earlyWarning: false, undo: false, upcoming: false };
  await open(page, lived(), { features });
  await expect(page.getByTestId('week-strip')).toHaveCount(0);
  await expect(page.getByTestId('tomorrow-hint')).toHaveCount(0);
  await expect(page.getByTestId('tomorrow')).toHaveText('завтра можно 32,11'); // 256,89 ÷ 8 days
  await expect(page.getByTestId('upcoming')).toHaveCount(0);

  await addExpense(page, '24,26');
  await expect(page.getByTestId('hero-amount')).toHaveText('4,28');
  await expect(page.locator('.ring-arc')).toHaveClass(/ring-arc-accent/);
  await expect(page.locator('.ring-label')).toHaveText('Сегодня можно');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('without the calendar the strip and «Ближайшее» stay, but do not open it', async ({ page }) => {
  await open(page, lived(), { features: { calendar: false } });
  await expect(page.getByTestId('week-strip')).toBeVisible();
  await expect(page.getByTestId('week-strip').getByRole('button')).toHaveCount(0);
  expect(await page.getByTestId('week-strip').evaluate((el) => el.tagName)).toBe('DIV');
  await expect(page.getByTestId('upcoming').getByRole('button')).toHaveCount(0);
});

/** Home with everything on: the lived week, a carry, a target and money spent today. */
async function fullHome(browser: Browser, viewport: { width: number; height: number }, theme: AppData['settings']['theme'], accent: string) {
  const data = lived();
  data.settings.theme = theme;
  data.settings.targetDailyLimitKopecks = 3000;
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await context.newPage();
  await open(page, data, { accent });
  await addExpense(page, '8,5');
  await page.clock.fastForward(5000); // the «Отменить» toast goes
  await expect(page.getByRole('status')).toHaveCount(0);
  return { context, page };
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`layout at ${viewport.width}×${viewport.height}: the ring stays the hero, the page never scrolls`, async ({ browser }) => {
    for (const [theme, accent] of [
      ['light', 'amber'],
      ['dark', 'amber'],
      ['light', 'sky'],
    ] as const) {
      const { context, page } = await fullHome(browser, viewport, theme, accent);
      const ring = (await page.getByTestId('ring').boundingBox())!;
      expect(ring.x).toBeGreaterThanOrEqual(0);
      expect(ring.x + ring.width).toBeLessThanOrEqual(viewport.width);
      // Everything new keeps to one line each.
      for (const id of ['week-strip', 'tomorrow-hint', 'target-line', 'upcoming']) {
        const box = (await page.getByTestId(id).boundingBox())!;
        // «Ближайшее» has 12 px of padding above and below for its 44 px tap areas (update 2), outside the line.
        if (id === 'upcoming') box.height -= 24;
        expect(box.height, id).toBeGreaterThanOrEqual(18);
        expect(box.height, id).toBeLessThanOrEqual(34);
        expect(box.x + box.width, id).toBeLessThanOrEqual(viewport.width);
      }
      const add = (await page.getByRole('button', { name: '+ Трата' }).boundingBox())!;
      expect(add.y + add.height).toBeLessThanOrEqual(viewport.height);
      await page.mouse.wheel(0, 800);
      const scroll = await page.evaluate(() => [window.scrollX, window.scrollY, document.documentElement.scrollWidth - window.innerWidth]);
      expect(scroll).toEqual([0, 0, 0]);
      await settle(page);
      await page.screenshot({ path: test.info().outputPath(`home-${theme}-${accent}.png`) });

      // The yellow ring in the same theme: 23,50 of 28,54 spent, 5,04 left.
      await addExpense(page, '15');
      await expect(page.locator('.ring-arc')).toHaveClass(/ring-arc-warning/);
      await page.clock.fastForward(5000);
      await expect(page.getByRole('status')).toHaveCount(0);
      await settle(page);
      await page.screenshot({ path: test.info().outputPath(`warning-${theme}-${accent}.png`) });
      await context.close();
    }
  });
}
