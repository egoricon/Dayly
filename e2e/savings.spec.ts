import { expect, test, type Page } from '@playwright/test';
import { emptyData, expense, source, tx } from '../src/domain/fixtures';
import type { AppData, Goal } from '../src/domain/types';

// Update 1 «Копилка» (task B) in a real browser: a percent goal, the split of a confirmed income,
// the savings ring, «Вчера осталось…» and «Итоги периода». The state is seeded, not onboarded,
// and the clock is fixed to 26 September 2026 as in mvp.spec.ts.

const TODAY = new Date('2026-09-26T10:00:00');
/** The first-launch tips and «Что нового» are done, so only the savings cards show. */
const UI = { tipsShown: true, whatsNewSeen: 'update-1' };

const headphones: Goal = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-09-01',
  deadline: null,
  percent: 15,
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
  data.settings.cushion = { mode: 'fixed', amountKopecks: 3000 };
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
async function open(page: Page, data: AppData, ui: object = UI) {
  await page.addInitScript(
    ([savedData, savedUi]) => {
      if (localStorage.getItem('dayly:data') !== null) return;
      localStorage.setItem('dayly:data', savedData);
      localStorage.setItem('dayly:ui', savedUi);
    },
    [JSON.stringify(data), JSON.stringify(ui)] as const,
  );
  await page.clock.install({ time: TODAY });
  await page.goto('/');
}

/** The «Копилка» tab of update 2, where the cushion, «С каждого поступления» and the goals are. */
const savingsTab = (page: Page) => page.locator('.tab-bar').getByRole('button', { name: 'Копилка', exact: true });

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

  // A tap on the caption opens «Копилка»: where the savings come from and the goals.
  await page.getByTestId('savings-caption').click();
  await expect(savingsTab(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();
  await expect(page.getByTestId('savings-split')).toBeInViewport();
  await expect(page.getByTestId('savings-split')).toContainText('15% наушники · 85% на жизнь');
  await expect(page.locator('.goal-card')).toHaveText(/Наушники45 из 150.*15% с каждого поступления/);
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
  await expect(page.locator('.goal-card')).toContainText('Наушники28 из 150');
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

  await page.getByRole('button', { name: '+ Добавить цель' }).click();
  await page.getByPlaceholder('Например, наушники').fill('Велосипед');
  await page.locator('.form-screen').getByPlaceholder('0,00').first().fill('500');
  await page.getByRole('radio', { name: 'Процент с дохода' }).click();
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

  await expect(page.getByTestId('savings-split')).toContainText('15% наушники · 20% велосипед · 65% на жизнь');
  await expect(page.getByTestId('savings-split').locator('.list-row')).toHaveText([
    'Наушники15%45,00',
    'Велосипед20%60,00',
    'На жизнь65%195,00',
  ]);
  await expect(page.locator('.goal-card', { hasText: 'Велосипед' })).toContainText('20% с каждого поступления');

  // A row opens the goal; switching it to a date keeps what it has.
  await page.getByTestId('savings-split').getByRole('button', { name: /Велосипед/ }).click();
  await page.getByRole('radio', { name: 'К дате' }).click();
  await expect(page.getByText('Уже накопленное останется в цели.')).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();

  // The cushion cannot take the rest either.
  await page.getByTestId('savings-cushion').getByRole('button', { name: /Подушка/ }).click();
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
      data.settings.cushion = { mode: 'percent', percent: 10, baseKopecks: 0, sinceDate: '2026-09-01' };
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
