import { expect, test, type Page } from '@playwright/test';
import { emptyData, exampleA, exampleG, expense, fixedCushion, move, percentCushion, source, tx } from '../src/domain/fixtures';
import type { AppData, Goal } from '../src/domain/types';

// Update 1 «Копилка» (task B) in a real browser: a percent goal, the split of a confirmed income,
// the savings ring, «Вчера осталось…» and «Итоги периода». The state is seeded, not onboarded,
// and the clock is fixed to 26 September 2026 as in mvp.spec.ts.

const TODAY = new Date('2026-09-26T10:00:00');
/** «Знакомство» is done (every hint seen, «Что нового» closed, a copy just saved), so only the savings cards show. */
const UI = {
  tipsShown: true,
  whatsNewSeen: 'update-2',
  lessonsSeen: ['ring', 'firstExpense', 'tapRow', 'overspend', 'leftover', 'banner', 'savings', 'finances', 'deficit', 'periodEnd'],
  lastBackupAt: '2099-12-31',
};

const headphones: Goal = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-09-01',
  deadline: null,
  percent: 15,
  schedule: null,
  status: 'active',
};

/**
 * The scholarship of 300,00 was due yesterday, the 25th, and is late, so it is not counted yet; 200,00
 * from parents come on 10 October. «Наушники» take 15 % of every income. 100,00 on hand.
 * Limit 7,14 (100,00 over 14 days to the parents' money); the savings ring plans 30,00 from the parents.
 */
function lateScholarship(): AppData {
  const data = emptyData('2026-09-01');
  data.settings.mainIncomeSourceId = 'scholarship';
  data.incomeSources = [
    { ...source('scholarship', 'scholarship', 30000, 25, '2026-09-01'), name: 'Стипендия' },
    { ...source('parents', 'parents', 20000, 10, '2026-09-01'), name: 'От родителей' },
  ];
  data.goals = [headphones];
  data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-01', note: 'Стартовый баланс' })];
  return data;
}

/** Yesterday's limit was 20,00 and 12,00 went on a café: 8,00 left. «Наушники» hold 20,00, the cushion 30,00. */
function leftoverFromYesterday(): AppData {
  const data = emptyData('2026-09-20');
  data.settings.mainIncomeSourceId = 'scholarship';
  data.settings.cushion = fixedCushion(3000);
  data.incomeSources = [{ ...source('scholarship', 'scholarship', 22000, 5, '2026-09-20'), name: 'Стипендия' }];
  data.goals = [{ ...headphones, initialSavedKopecks: 2000, startDate: '2026-09-20' }];
  data.transactions = [tx({ type: 'adjustment', amountKopecks: 40000, date: '2026-09-20', note: 'Стартовый баланс' }), expense('2026-09-25', 1200, 'cafe')];
  data.daySummaries = [{ date: '2026-09-25', dailyLimitKopecks: 2000 }];
  return data;
}

/**
 * The scholarship comes on the 26th, so today starts a new period. The last one: 24 of 25 days in the
 * limit (40,00 on fun on the 10th), 15,00 of a 100,00 gift went to «Наушники», 245,00 left.
 */
function newPeriod(): AppData {
  const data = emptyData('2026-09-01');
  data.settings.mainIncomeSourceId = 'scholarship';
  data.incomeSources = [{ ...source('scholarship', 'scholarship', 22000, 26, '2026-09-01'), name: 'Стипендия' }];
  data.goals = [{ ...headphones, targetKopecks: 30000 }];
  data.transactions = [
    tx({ type: 'adjustment', amountKopecks: 20000, date: '2026-09-01', note: 'Стартовый баланс' }),
    expense('2026-09-10', 4000, 'fun'),
    tx({ type: 'income', amountKopecks: 10000, date: '2026-09-15', note: 'Подарок' }),
    tx({ type: 'income', amountKopecks: 22000, date: '2026-09-26', incomeSourceId: 'scholarship', plannedDate: '2026-09-26' }),
  ];
  for (let day = 1; day <= 25; day += 1) data.daySummaries.push({ date: `2026-09-${String(day).padStart(2, '0')}`, dailyLimitKopecks: 600 });
  return data;
}

/** Seeds the saved state before the app starts; a reload keeps what the app has saved since. */
async function open(page: Page, data: AppData, ui: object = UI, time: Date = TODAY) {
  await page.addInitScript(
    ([savedData, savedUi]) => {
      if (localStorage.getItem('dayly:data') !== null) return;
      localStorage.setItem('dayly:data', savedData);
      localStorage.setItem('dayly:ui', savedUi);
    },
    [JSON.stringify(data), JSON.stringify(ui)] as const,
  );
  await page.clock.install({ time });
  await page.goto('/');
}

/** The «Копилка» tab of update 2, where the cushion, «С каждого поступления» and the goals are. */
const savingsTab = (page: Page) => page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true });

/** A jar card of «Копилка»: 'cushion' or a goal's id. */
const jarCard = (page: Page, key: string) => page.locator(`[data-testid="jar-card"][data-jar="${key}"]`);

async function typeAmount(page: Page, amount: string) {
  for (const ch of amount) await page.keyboard.press(ch === ',' ? 'Comma' : ch);
}

/** Waits for the entrance, the rings and the count-up to finish, so a screenshot shows the settled screen. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  );
  await page.waitForTimeout(500); // the hero amount counts on requestAnimationFrame
}

/** No sideways scroll anywhere on the page or on the home screen. */
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    [document.documentElement, ...Array.from(document.querySelectorAll('.screen, .home-scroll'))].map((el) => el.scrollWidth - el.clientWidth),
  );
  expect(overflow.every((x) => x <= 0)).toBe(true);
}

test('a 15% goal: «Стипендия пришла?» with 300 puts 45,00 into it, the limit is recounted, the savings ring fills', async ({ page }) => {
  await open(page, lateScholarship());
  await expect(page.getByTestId('hero-amount')).toHaveText('7,14');
  await expect(page.getByTestId('savings-caption')).toHaveText('копилка 0 из 30');
  await expect(page.getByTestId('savings-arc')).toHaveAttribute('data-fraction', '0.000');

  await expect(page.getByTestId('banner')).toContainText('Стипендия пришла?');
  await page.getByRole('button', { name: 'Да, 300,00' }).click();

  await expect(page.locator('.sheet-title')).toHaveText('Стипендия 300,00 BYN разложилась');
  const split = page.getByTestId('split-sheet');
  await expect(split.locator('.split-row')).toHaveText(['Наушники15%45,00', 'На жизнь255,00']);
  await expect(page.getByTestId('split-limit')).toHaveText('Лимит на деньбыл 7,14 BYN18,10 BYN');
  // The savings ring waits under the sheet and fills once it closes.
  await expect(page.getByTestId('savings-arc')).toHaveAttribute('data-fraction', '0.000');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('split-sheet.png') });

  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByTestId('savings-arc')).toHaveAttribute('data-fraction', '0.600');
  await expect(page.getByTestId('savings-caption')).toHaveText('+45 BYN в копилку');
  await expect(page.getByTestId('hero-amount')).toHaveText('18,10');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 400,00 BYN');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('savings-ring-filled.png') });
  await expect(page.getByTestId('savings-caption')).toHaveText('копилка 45 из 75', { timeout: 5000 });

  // A tap on the caption opens «Копилка»: the piggy, the jars and where the savings come from.
  await page.getByTestId('savings-caption').click();
  await expect(savingsTab(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();
  await expect(page.getByTestId('piggy')).toBeInViewport();
  await expect(page.getByTestId('savings-split')).toContainText('15% наушники · 85% на жизнь');
  await expect(jarCard(page, 'headphones')).toHaveText(/Наушники45 из 150.*15% с поступления/);
});

test('«+ Доход» from a planned source splits too, and «Другая сумма» counts the amount that came', async ({ page }) => {
  await open(page, lateScholarship());
  await page.getByRole('button', { name: 'Другая сумма' }).click();
  await typeAmount(page, '250');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.sheet-title')).toHaveText('Стипендия 250,00 BYN разложилась');
  await expect(page.getByTestId('split-sheet').locator('.split-row')).toHaveText(['Наушники15%37,50', 'На жизнь212,50']);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByTestId('banner')).toHaveCount(0);

  await page.getByRole('button', { name: '+ Доход' }).click();
  await page.locator('.chip', { hasText: 'От родителей' }).click();
  await typeAmount(page, '200');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.sheet-title')).toHaveText('Деньги от родителей 200,00 BYN разложились');
  await expect(page.getByTestId('split-sheet').locator('.split-row')).toHaveText(['Наушники15%30,00', 'На жизнь170,00']);
});

test('«Отложить» yesterday’s 8,00: the goal grows by 8,00, the limit goes down, the balance stays', async ({ page }) => {
  await open(page, leftoverFromYesterday());
  await expect(page.getByTestId('hero-amount')).toHaveText('37,55');
  await expect(page.locator('.carry-pill')).toHaveText('+8,00 с вчера');
  const card = page.getByTestId('leftover-card');
  await expect(card).toContainText('Вчера осталось 8,00 BYN');
  await expect(card).toContainText('Отложить в «Наушники»?');
  await expect(card.getByTestId('savings-card-note')).toHaveText('Лимит станет 36,66 BYN в день');
  await card.getByRole('button', { name: 'Подушка' }).click();
  await expect(card).toContainText('Отложить в подушку?');
  await card.getByRole('button', { name: 'Наушники' }).click();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('leftover-card.png') });

  await card.getByRole('button', { name: 'Отложить', exact: true }).click();
  await expect(page.getByTestId('savings-toast')).toHaveText('Отложено 8,00 BYN в «Наушники»');
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('36,66');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 388,00 BYN');
  // The 8,00 are in savings now, so the pill no longer offers them as free money.
  await expect(page.locator('.carry-pill')).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('leftover-set-aside.png') });

  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('36,66');
  await expect(page.getByTestId('leftover-card')).toHaveCount(0);
  await expect(page.locator('.carry-pill')).toHaveCount(0);
  await savingsTab(page).click();
  await expect(jarCard(page, 'headphones')).toContainText('Наушники28 из 150');
});

test('«Не сейчас» puts the leftover off till tomorrow and keeps the pill', async ({ page }) => {
  await open(page, leftoverFromYesterday());
  await page.getByTestId('leftover-card').getByRole('button', { name: 'Не сейчас' }).click();
  await expect(page.getByTestId('leftover-card')).toHaveCount(0);
  await expect(page.locator('.carry-pill')).toHaveText('+8,00 с вчера');
  await expect(page.getByTestId('hero-amount')).toHaveText('37,55');
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('37,55');
  await expect(page.getByTestId('leftover-card')).toHaveCount(0);
});

test('«Итоги периода» on the first day: 245,00 go to the goal, and the card stays closed', async ({ page }) => {
  await open(page, newPeriod());
  const card = page.getByTestId('period-summary');
  await expect(card).toContainText('Прошлый период');
  await expect(card).toContainText('В лимите 24 из 25 дней, отложено 15,00 BYN, осталось 245,00 BYN');
  await expect(card).toContainText('Отправить остаток в «Наушники»?');
  await expect(page.getByTestId('hero-amount')).toHaveText('14,40');
  await expect(page.locator('.carry-pill')).toHaveText('+6,00 с вчера');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('period-summary.png') });

  await card.getByRole('button', { name: 'Отправить в копилку' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('savings-toast')).toHaveText('Отложено 245,00 BYN в «Наушники»');
  await expect(page.getByTestId('hero-amount')).toHaveText('6,23');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 480,00 BYN');
  // Yesterday's leftover was a part of it: no pill and no second question today.
  await expect(page.locator('.carry-pill')).toHaveCount(0);
  await expect(page.getByTestId('leftover-card')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('6,23');
  await expect(page.getByTestId('period-summary')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).dismissedCards)).toEqual(['summary|2026-08-26']);
});

test('a low screen folds the savings cards, so the ring stays whole; «Отложить…» opens the choice', async ({ browser }) => {
  const viewport = { width: 375, height: 667 };
  let context = await browser.newContext({ viewport, locale: 'ru-RU' });
  let page = await context.newPage();
  await open(page, leftoverFromYesterday());
  const card = page.getByTestId('leftover-card');
  await expect(card).toContainText('Вчера осталось 8,00 BYN');
  await expect(card.locator('.chip')).toHaveCount(0);
  await expect(card.getByTestId('savings-card-note')).toHaveCount(0);
  await settle(page);
  const ring = (await page.getByTestId('ring').boundingBox())!;
  const bottom = (await page.locator('.home-bottom').boundingBox())!;
  expect(ring.y + ring.height).toBeLessThanOrEqual(bottom.y);
  await page.screenshot({ path: test.info().outputPath('leftover-folded.png') });

  // Nothing is set aside until the choice is seen.
  await card.getByRole('button', { name: 'Отложить…' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('37,55');
  await expect(card.getByTestId('savings-card-note')).toHaveText('Лимит станет 36,66 BYN в день');
  await card.getByRole('button', { name: 'Подушка' }).click();
  await expect(card).toContainText('Отложить в подушку?');
  await card.getByRole('button', { name: 'Отложить', exact: true }).click();
  await expect(page.getByTestId('savings-toast')).toHaveText('Отложено 8,00 BYN в подушку');
  await expect(card).toHaveCount(0);
  await context.close();

  // «Итоги периода» keeps its numbers folded; the choice waits for «Отправить в копилку…».
  context = await browser.newContext({ viewport, locale: 'ru-RU' });
  page = await context.newPage();
  await open(page, newPeriod());
  const summary = page.getByTestId('period-summary');
  await expect(summary).toContainText('В лимите 24 из 25 дней, отложено 15,00 BYN, осталось 245,00 BYN');
  await expect(summary).not.toContainText('Отправить остаток');
  await summary.getByRole('button', { name: 'Отправить в копилку…' }).click();
  await expect(summary).toContainText('Отправить остаток в «Наушники»?');
  await expect(page.getByTestId('hero-amount')).toHaveText('14,40');
  await context.close();
});

test('«Функции»: with the savings ring, the leftover and the summary off, none of them shows', async ({ page }) => {
  const features = { savingsRing: false, leftover: false, periodSummary: false };
  await open(page, newPeriod(), { ...UI, features });
  await expect(page.getByTestId('hero-amount')).toHaveText('14,40');
  await expect(page.getByTestId('savings-arc')).toHaveCount(0);
  await expect(page.getByTestId('savings-caption')).toHaveCount(0);
  await expect(page.getByTestId('period-summary')).toHaveCount(0);
  await expect(page.getByTestId('leftover-card')).toHaveCount(0);
  // The day ring is drawn as before the update.
  await expect(page.locator('.ring-track')).toHaveAttribute('r', '136');
});

test('the savings ring on and off; the day ring keeps its 300×300 box', async ({ page }) => {
  await open(page, lateScholarship());
  await expect(page.getByTestId('savings-arc')).toHaveCount(1);
  await expect(page.locator('.ring-track')).toHaveAttribute('r', '131');
  const box = (await page.getByTestId('ring').boundingBox())!;
  expect([box.width, box.height].map(Math.round)).toEqual([300, 300]);

  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('dayly:ui')!);
    localStorage.setItem('dayly:ui', JSON.stringify({ ...ui, features: { ...ui.features, savingsRing: false } }));
  });
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('7,14');
  await expect(page.getByTestId('savings-arc')).toHaveCount(0);
  await expect(page.getByTestId('savings-caption')).toHaveCount(0);
});

test('a percent goal in its form: the rules stay below 100 %, the hint counts the main income', async ({ page }) => {
  await open(page, lateScholarship());
  await savingsTab(page).click();
  await expect(page.getByTestId('savings-split')).toContainText('15% наушники · 85% на жизнь');
  await expect(page.getByTestId('savings-split')).toContainText('Суммы со стипендии 300,00 BYN');

  await page.getByRole('button', { name: '+ Новая банка' }).click();
  await page.getByPlaceholder('Например, наушники').fill('Велосипед');
  await page.locator('.form-screen').getByPlaceholder('0,00').first().fill('500');
  await page.getByRole('radio', { name: '% с каждого поступления' }).click();
  const percent = page.getByPlaceholder('15');
  await percent.fill('90');
  await expect(page.locator('.field-hint')).toHaveText('Можно не больше 84%: ещё 15% уходит в «Наушники»');
  await page.getByRole('button', { name: 'Сохранить' }).click({ force: true });
  await expect(page.getByTestId('form-missing')).toHaveText('Можно не больше 84%: ещё 15% уходит в «Наушники»');
  await percent.fill('20');
  await expect(page.locator('.field-hint')).toHaveText('Со стипендии 300,00 BYN отложится 60,00 BYN.');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('goal-form-percent.png') });
  await page.getByRole('button', { name: 'Сохранить' }).click();

  const split = page.getByTestId('savings-split');
  await expect(split).toContainText('15% наушники · 20% велосипед · 65% на жизнь');
  await expect(split.locator('.list-row')).toHaveText(['Наушники45,00%', 'Велосипед60,00%', 'На жизнь195,0065%']);
  await expect(split.getByLabel('Процент: Наушники')).toHaveValue('15');
  await expect(split.getByLabel('Процент: Велосипед')).toHaveValue('20');
  await expect(page.locator('[data-testid="jar-card"]', { hasText: 'Велосипед' })).toContainText('20% с поступления');

  // A percent typed right in the split counts from today; more than the others leave is refused.
  await split.getByLabel('Процент: Велосипед').fill('25');
  await expect(split).toContainText('15% наушники · 25% велосипед · 60% на жизнь');
  await split.getByLabel('Процент: Велосипед').fill('90');
  await expect(page.getByTestId('split-problem')).toHaveText('Можно не больше 84%: ещё 15% уходит в «Наушники»');
  await split.getByLabel('Процент: Велосипед').blur();
  await expect(page.getByTestId('split-problem')).toHaveCount(0);
  await expect(split.getByLabel('Процент: Велосипед')).toHaveValue('25');
  await split.getByLabel('Процент: Велосипед').fill('20');
  await split.getByLabel('Процент: Велосипед').blur();

  // The card opens the goal; switching it to a date keeps what it has.
  await page.locator('[data-testid="jar-card"]', { hasText: 'Велосипед' }).getByRole('button').first().click();
  await page.getByRole('radio', { name: 'К дате' }).click();
  await expect(page.getByText('Уже накопленное останется в цели.')).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();

  // The cushion cannot take the rest either.
  await jarCard(page, 'cushion').getByRole('button').click();
  await page.getByRole('radio', { name: 'Процент с дохода' }).click();
  await page.locator('.form-screen input[inputmode="numeric"]').fill('70');
  await page.getByRole('button', { name: 'Сохранить' }).click({ force: true });
  await expect(page.getByTestId('form-missing')).toHaveText('Можно не больше 64%: ещё 35% уходит в цели');
  await page.locator('.form-screen input[inputmode="numeric"]').fill('10');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('savings-split')).toContainText('10% подушка · 15% наушники · 20% велосипед · 55% на жизнь');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('savings-split.png'), fullPage: true });
});

for (const [name, viewport] of [
  ['390×844', { width: 390, height: 844 }],
  ['small iPhone 375×667', { width: 375, height: 667 }],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`layout on ${name}, ${scheme}: the rings, the pills and a savings card fit`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme: scheme, locale: 'ru-RU' });
      const page = await context.newPage();
      const data = lateScholarship();
      // A leftover from yesterday too, so the pill sits beside the savings caption.
      data.daySummaries = [{ date: '2026-09-25', dailyLimitKopecks: 900 }];
      data.settings.cushion = percentCushion(10, 0, '2026-09-01');
      await open(page, data);
      await expect(page.getByTestId('savings-caption')).toBeVisible();
      await expect(page.locator('.carry-pill')).toHaveText('+9,00 с вчера');
      const ring = (await page.getByTestId('ring').boundingBox())!;
      expect([ring.width, ring.height].map(Math.round)).toEqual([300, 300]);
      const pills = await page.locator('.ring-pills > *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(pills).size).toBe(1); // one row
      await expectNoOverflow(page);
      await settle(page);
      await page.screenshot({ path: test.info().outputPath(`home-${viewport.width}-${scheme}.png`) });

      await page.getByRole('button', { name: 'Да, 300,00' }).click();
      await expect(page.getByRole('button', { name: 'Понятно' })).toBeInViewport();
      await settle(page);
      const button = (await page.getByRole('button', { name: 'Понятно' }).boundingBox())!;
      expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: test.info().outputPath(`split-${viewport.width}-${scheme}.png`) });
      await context.close();
    });
  }
}

// Update 2, task C: the «Копилка» tab on example Г of PROJECT_MAP.md (30 September, a Wednesday): the cushion
// 30,00, «Наушники» 150,00 by 20 November, «Велосипед» 15 % with 40,00, «Поездка» 20,00 every Monday,
// expenses rounded up into the cushion. The limit is 39,37.

const G_DAY = new Date('2026-09-30T10:00:00');

async function openG(page: Page, data: AppData = exampleG(), ui: object = UI) {
  await open(page, data, ui, G_DAY);
  await expect(page.getByTestId('hero-amount')).toBeVisible();
}

/** «Положить» or «Забрать»: the jar, the amount on the keypad; returns the sheet. */
async function moveSheet(page: Page, button: 'Положить' | 'Забрать', jar: string, amount: string) {
  await page.locator('.savings-actions').getByRole('button', { name: button }).click();
  const sheet = page.locator('.move-sheet');
  await sheet.locator('.chip', { hasText: jar }).click();
  await typeAmount(page, amount);
  return sheet;
}

const pigLevel = async (page: Page) => Number(await page.getByTestId('piggy-art').getAttribute('data-level'));

test('«Положить 20» into «Наушники»: the piggy fills up, the history says so, the limit goes down', async ({ page }) => {
  await openG(page);
  await expect(page.getByTestId('hero-amount')).toHaveText('39,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('piggy')).toHaveAttribute('aria-label', 'В копилке 103,40 BYN, заполнено на 16%');
  await expect(page.getByTestId('savings-total')).toHaveText('В копилке 103,40 BYN');
  await expect(jarCard(page, 'headphones')).toContainText('Наушники13 из 150');
  await expect(jarCard(page, 'headphones')).toContainText('к 20 ноября · 2,68 в день');
  await expect(jarCard(page, 'headphones').getByRole('button')).toHaveAccessibleName('Наушники, 13 из 150 BYN, к 20 ноября · 2,68 в день');
  await expect.poll(() => pigLevel(page)).toBeCloseTo(0.167, 2);

  const sheet = await moveSheet(page, 'Положить', 'Наушники', '20');
  await expect(sheet.getByTestId('move-preview')).toHaveText('Лимит станет 35,76 BYN в день');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('put-sheet.png') });
  await sheet.getByRole('button', { name: 'Положить', exact: true }).click();
  await expect(page.locator('.move-sheet')).toHaveCount(0);

  await expect(page.getByTestId('piggy')).toHaveAttribute('aria-label', 'В копилке 123,02 BYN, заполнено на 21%');
  await expect.poll(() => pigLevel(page)).toBeCloseTo(0.211, 2);
  await expect(jarCard(page, 'headphones')).toContainText('Наушники33 из 150');
  await expect(page.getByTestId('savings-move').first()).toHaveText(/Вручную → Наушники.*30 сен.*\+20,00/);
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('35,76');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 586,00 BYN');
});

test('«Положить» beyond the free money is refused with the reason; «Забрать» beyond the jar too', async ({ page }) => {
  await openG(page);
  await savingsTab(page).click();
  let sheet = await moveSheet(page, 'Положить', 'Подушка', '0');
  await expect(sheet.getByTestId('move-preview')).toHaveText('Можно положить до 196,89 BYN');
  await typeAmount(page, '500');
  await expect(sheet.getByTestId('move-preview')).toHaveText('Свободно 196,89 BYN: остальное нужно до 5 октября');
  await sheet.getByRole('button', { name: 'Положить', exact: true }).click({ force: true });
  await expect(sheet.getByTestId('form-missing')).toHaveText('Свободно 196,89 BYN: остальное нужно до 5 октября');
  await expect(page.locator('.move-sheet')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.move-sheet')).toHaveCount(0);

  sheet = await moveSheet(page, 'Забрать', 'Велосипед', '50');
  await expect(sheet.getByTestId('move-preview')).toHaveText('Можно забрать не больше 40,00 BYN');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('savings-total')).toHaveText('В копилке 103,40 BYN');
});

test('«Забрать 20» from a deadline goal warns how much a day it will take, then the limit goes up', async ({ page }) => {
  const data = exampleG();
  data.savingsMoves.push(move({ goalId: 'headphones', amountKopecks: 3000, date: '2026-09-29' }));
  await openG(page, data);
  await expect(page.getByTestId('hero-amount')).toHaveText('34,05');
  await savingsTab(page).click();
  const sheet = await moveSheet(page, 'Забрать', 'Наушники', '20');
  await expect(sheet.locator('.sheet-hint')).toHaveText([
    'Чтобы успеть к 20 ноября, в день будет уходить 2,50 вместо 2,12',
    'Лимит станет 37,67 BYN в день',
  ]);
  await expect(sheet.locator('.sheet-hint').first()).toHaveClass(/is-danger/);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('take-sheet.png') });
  await sheet.getByRole('button', { name: 'Забрать', exact: true }).click();
  await expect(page.getByTestId('savings-move').first()).toHaveText(/Забрал · Наушники.*−20,00/);
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('37,67');
});

test('a move by hand opens «Удалить»: it asks first, then the move and its effect are gone', async ({ page }) => {
  const data = exampleG();
  data.savingsMoves.push(move({ goalId: 'headphones', amountKopecks: 1000, date: '2026-09-30' }));
  await openG(page, data);
  await savingsTab(page).click();
  const rows = page.getByTestId('savings-move');
  // Computed rows are not buttons: only the move by hand opens the sheet.
  await expect(rows.getByRole('button')).toHaveCount(1);
  await rows.getByRole('button', { name: /Вручную → Наушники/ }).click();
  await expect(page.locator('.action-title')).toHaveText('Вручную → Наушники · +10,00 BYN · 30 сен');
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByTestId('move-delete-text')).toHaveText('Удалить? Лимит станет 39,37 BYN в день');
  await page.getByRole('button', { name: 'Да, удалить' }).click();
  await expect(rows.getByRole('button')).toHaveCount(0);
  await expect(rows.first()).toHaveText(/По расписанию → Поездка.*28 сен/);

  // Money taken out and already spent cannot go back into the jar.
  const spent = exampleG();
  spent.savingsMoves.push(move({ goalId: null, amountKopecks: -3000, date: '2026-09-29' }));
  spent.transactions.push(expense('2026-09-29', 21000, 'fun'));
  await page.evaluate((d) => localStorage.setItem('dayly:data', d), JSON.stringify(spent));
  await page.reload();
  await savingsTab(page).click();
  await rows.getByRole('button', { name: /Забрал из подушки/ }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByTestId('move-delete-text')).toHaveText('Удалить нельзя: эти деньги уже в лимите, без них до 5 октября не хватит 13,11 BYN');
  await expect(page.getByRole('button', { name: 'Да, удалить' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(rows.getByRole('button', { name: /Забрал из подушки/ })).toHaveCount(1);
});

test('rounding up to 1 BYN: an expense of 4,30 puts 0,70 into the cushion, «Отменить» takes both back', async ({ page }) => {
  await openG(page);
  await savingsTab(page).click();
  const roundUp = page.getByRole('switch', { name: /Округлять траты до 1 BYN/ });
  await expect(roundUp).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('roundup-note')).toHaveText('Трата 4,30 → 0,70 в подушку');
  await expect(page.getByRole('group', { name: 'Куда округлять' }).getByRole('button', { name: 'Подушка' })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, '4,30');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('34,93');
  await savingsTab(page).click();
  await expect(page.getByTestId('savings-move').first()).toHaveText(/Округление → Подушка.*30 сен.*\+0,70/);
  await expect(jarCard(page, 'cushion')).toContainText('30,70');

  // Deleting the expense deletes its round-up.
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await page.getByTestId('operation').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Удалить трату' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('39,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('savings-move').first()).toHaveText(/По расписанию → Поездка/);
  await expect(jarCard(page, 'cushion')).toContainText('30,00');

  // So does «Отменить» right after «Добавить».
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, '4,30');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('34,93');
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('39,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('savings-move').first()).toHaveText(/По расписанию → Поездка/);

  // Into a goal, or off.
  await page.getByRole('group', { name: 'Куда округлять' }).getByRole('button', { name: 'Велосипед' }).click();
  await expect(page.getByTestId('roundup-note')).toHaveText('Трата 4,30 → 0,70 в «Велосипед»');
  await roundUp.click();
  await expect(roundUp).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('group', { name: 'Куда округлять' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:data')!).settings.roundUp)).toBeNull();
});

test('«Остаток дня» here is the same switch as in «Функции»', async ({ page }) => {
  await openG(page);
  await savingsTab(page).click();
  const leftover = page.getByRole('switch', { name: /Остаток дня/ });
  await expect(leftover).toHaveAttribute('aria-checked', 'true');
  await leftover.click();
  await expect(leftover).toContainText('не спрашивать');
  await page.locator('.tab-bar').getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByTestId('settings-features').getByRole('switch', { name: 'Остаток дня в копилку' })).toHaveAttribute('aria-checked', 'false');
});

test('a jar of 50 BYN every week: the limit counts its next day at once, on that day +50 in the history', async ({ page }) => {
  await openG(page);
  await savingsTab(page).click();
  await page.getByRole('button', { name: '+ Новая банка' }).click();
  await expect(page.getByRole('heading', { name: 'Новая банка' })).toBeVisible();
  await page.getByPlaceholder('Например, наушники').fill('Концерт');
  await page.locator('.form-screen').getByPlaceholder('0,00').first().fill('300');
  await page.getByRole('radio', { name: 'Сумма по расписанию' }).click();
  await page.getByLabel('Сколько откладывать').fill('50');
  await page.getByRole('radio', { name: 'Каждую неделю' }).click();
  await page.getByRole('radio', { name: 'Чт' }).click();
  await expect(page.locator('.field-hint')).toHaveText('Наполнится ~5 ноя.');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  const jar = page.locator('[data-testid="jar-card"]', { hasText: 'Концерт' });
  await expect(jar).toHaveText(/Концерт0 из 300.*50 BYN каждую неделю · наполнится ~5 ноя/);
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  // Thursday 1 October is before the scholarship of 5 October: 196,89 − 50,00 = 146,89 ÷ 5.
  await expect(page.getByTestId('hero-amount')).toHaveText('29,37');

  await page.clock.setSystemTime(new Date('2026-10-01T10:00:00'));
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('36,72');
  await savingsTab(page).click();
  await expect(page.getByTestId('savings-move').first()).toHaveText(/По расписанию → Концерт.*1 окт.*\+50,00/);
  await expect(jar).toContainText('Концерт50 из 300');
});

test('a full jar: the piggy cheers once, «Купил» spends from the jar and the limit stays', async ({ page }) => {
  const data = exampleG();
  data.goals = data.goals.map((g) => (g.id === 'trip' ? { ...g, initialSavedKopecks: 8000 } : g));
  await openG(page, data);
  await expect(page.getByTestId('hero-amount')).toHaveText('23,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('piggy-happy')).toBeVisible();
  const trip = jarCard(page, 'trip');
  await expect(trip).toHaveText(/Поездка100 из 100.*Банка полна!КупилКоплю дальше/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).celebratedJars)).toEqual(['trip']);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('jar-full.png') });
  // Not again on the next visit.
  await page.reload();
  await savingsTab(page).click();
  await expect(trip).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('piggy-happy')).toHaveCount(0);

  // «Коплю дальше» opens the jar to raise the target.
  await trip.getByRole('button', { name: 'Коплю дальше' }).click();
  await expect(page.getByText('Банка полна. Чтобы копить дальше, подними цель.')).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();

  await trip.getByRole('button', { name: 'Купил' }).click();
  await expect(page.locator('.action-text')).toHaveText('Покупка спишется из копилки, дневной лимит не изменится.');
  await page.getByRole('button', { name: 'Купил за 100,00 BYN' }).click();
  await expect(trip).toHaveCount(0);
  await page.locator('.tab-bar').getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('23,37');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 486,00 BYN');
});

// Node's Buffer for setInputFiles; the project has no Node types (as playwright.config.ts declares process).
declare const Buffer: { from(text: string): never };

/** Example А with a percent goal as version 5 saved it: no moves, no schedules, no round-up, no cushion target. */
function exampleV5(): Record<string, unknown> {
  const data = exampleA();
  data.goals.push({ id: 'bike', name: 'Велосипед', targetKopecks: 19000, initialSavedKopecks: 4000, startDate: '2026-09-26', deadline: null, percent: 15, schedule: null, status: 'active' });
  const { savingsMoves: _moves, ...rest } = data;
  const { roundUp: _roundUp, cushion, ...settings } = data.settings;
  const { targetKopecks: _target, ...oldCushion } = cushion;
  return { ...rest, schemaVersion: 5, settings: { ...settings, cushion: oldCushion }, goals: data.goals.map(({ schedule: _s, ...goal }) => goal) };
}

test('data of version 5 and a copy of version 4 open with their jars', async ({ page }) => {
  await open(page, exampleV5() as unknown as AppData, UI, G_DAY);
  await expect(page.getByTestId('hero-amount')).toHaveText('43,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('jar-card')).toHaveText([/Подушка30,00\sBYN/, /Наушники13 из 150.*к 20 ноября/, /Велосипед40 из 190.*15% с поступления/]);
  await expect(page.getByRole('switch', { name: /Округлять траты/ })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Здесь будет всё, что положено в копилку и забрано из неё.')).toBeVisible();

  // A copy saved by version 4: goals only by a date.
  const v5 = exampleV5() as { settings: Record<string, unknown>; goals: Record<string, unknown>[]; incomeSources: Record<string, unknown>[]; payments: Record<string, unknown>[] };
  const { targetDailyLimitKopecks: _t, ...settings4 } = v5.settings;
  const v4 = {
    ...v5,
    schemaVersion: 4,
    settings: settings4,
    incomeSources: v5.incomeSources.map(({ date: _d, ...s }) => s),
    payments: v5.payments.map(({ weekday: _w, date: _d, ...p }) => p),
    goals: v5.goals.filter((g) => g.id === 'headphones').map(({ percent: _p, ...g }) => g),
  };
  await page.locator('.tab-bar').getByRole('button', { name: 'Настройки' }).click();
  await page.getByTestId('restore-input').setInputFiles({
    name: 'dayly-v4.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'dayly', exportedAt: '2026-09-28T10:00:00.000Z', data: v4 })),
  });
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('51,37');
  await savingsTab(page).click();
  await expect(page.getByTestId('jar-card')).toHaveText([/Подушка30,00\sBYN/, /Наушники13 из 150.*к 20 ноября · 2,68 в день/]);
});

// «Крупный текст» (task E) is not on this branch yet; the merge checks it on the same screens.
for (const scheme of ['light', 'dark'] as const) {
  test(`«Копилка» on 375×667, ${scheme}: the piggy, both buttons and the first jar on the first screen`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: scheme, locale: 'ru-RU' });
    const page = await context.newPage();
    const data = exampleG();
    data.settings.cushion = { mode: 'percent', percent: 10, baseKopecks: 3000, sinceDate: '2026-09-26', targetKopecks: 10000 };
    await openG(page, data);
    await savingsTab(page).click();
    await expect(page.getByTestId('piggy')).toBeVisible();
    const bar = (await page.locator('.tab-bar').boundingBox())!;
    for (const target of [page.getByTestId('piggy'), page.locator('.savings-actions'), jarCard(page, 'cushion')]) {
      const box = (await target.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    }
    // Every button of the tab is at least 44 px tall to tap.
    const small = await page.locator('.savings-screen button, .savings-screen input').evaluateAll((els) =>
      // A chip adds an invisible 3 px above and below (jars.css).
      els
        .map((el) => [el.textContent?.trim() || el.getAttribute('aria-label'), el.getBoundingClientRect().height + (el.classList.contains('chip') ? 6 : 0)] as const)
        .filter(([, h]) => h < 44),
    );
    expect(small).toEqual([]);
    await expectNoOverflow(page);
    await settle(page);
    const name = `savings-${scheme}`;
    await page.screenshot({ path: test.info().outputPath(`${name}-top.png`) });
    await page.locator('.screen').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`${name}-bottom.png`) });
    await page.locator('.screen').evaluate((el) => el.scrollTo(0, 0));
    await page.locator('.savings-actions').getByRole('button', { name: 'Забрать' }).click();
    await page.locator('.move-sheet .chip', { hasText: 'Велосипед' }).click();
    await typeAmount(page, '15');
    const submit = (await page.locator('.move-sheet').getByRole('button', { name: 'Забрать', exact: true }).boundingBox())!;
    expect(submit.y + submit.height).toBeLessThanOrEqual(667);
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`${name}-take.png`) });
    await context.close();
  });
}
