import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addExpense as addExpenseTo } from '../src/appData';
import { calculateBudget } from '../src/domain/budget';
import { exampleA, tx } from '../src/domain/fixtures';
import { categoryTotals } from '../src/domain/history';
import { formatKopecks } from '../src/domain/money';
import type { AppData } from '../src/domain/types';

// Update 2, task E «Удобство»: the ring for VoiceOver, 44 px tap areas, «Крупный текст», a tap on an
// operation to change it, «Сегодня / Вчера» in the expense sheet, totals by category in «История» and
// only the Cyrillic and Latin fonts. Data is seeded into localStorage; the clock is 26 September 2026.

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
const SMALL = { width: 375, height: 667 };

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
 * Example А tracked since 20 September, so yesterday can take an expense: a week within the limit
 * except the 21st, and yesterday, the 25th, 24,50 of 28,00 spent, so 3,50 is left over.
 */
function lived(): AppData {
  const data = named(exampleA({ balanceKopecks: 68650 }));
  data.settings.trackingStartDate = '2026-09-20';
  data.settings.favorites = [{ id: 'coffee', label: 'Кофе', amountKopecks: 350, category: 'cafe' }];
  const days: [string, number, number, string][] = [
    ['2026-09-20', 2600, 1200, 'cafe'],
    ['2026-09-21', 2600, 3500, 'fun'],
    ['2026-09-22', 2700, 900, 'delivery'],
    ['2026-09-23', 2700, 2000, 'cafe'],
    ['2026-09-24', 2800, 0, 'cafe'],
    ['2026-09-25', 2800, 2450, 'cafe'],
  ];
  data.daySummaries = days.map(([date, dailyLimitKopecks]) => ({ date, dailyLimitKopecks }));
  for (const [date, , spent, category] of days) {
    if (spent > 0) data.transactions.push(tx({ type: 'expense', amountKopecks: spent, date, category }));
  }
  data.transactions.push(tx({ type: 'expense', amountKopecks: 4200, date: '2026-09-22', category: 'groceries' }));
  return data;
}

/** Opens the app with `data`; the hints and «Что нового» are already seen. Seeds only once, so a reload keeps changes. */
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

async function openSmall(browser: Browser, data: AppData, scheme: 'light' | 'dark' = 'light', ui: Record<string, unknown> = {}) {
  const context = await browser.newContext({ viewport: SMALL, colorScheme: scheme, locale: 'ru-RU' });
  const page = await context.newPage();
  await open(page, data, ui);
  return page;
}

/** Waits for screen, card and ring animations to end, so a screenshot or a measurement sees the final layout. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  );
  await page.waitForTimeout(500); // the hero amount counts on requestAnimationFrame
}

async function typeAmount(page: Page, amount: string) {
  for (const ch of amount) await page.keyboard.press(ch === ',' ? 'Comma' : ch);
}

/** Every control of `controls` takes taps 21 px away from its centre on every side: a 44×44 area at least. */
async function expectTapAreas(controls: Locator) {
  const all = await controls.all();
  expect(all.length).toBeGreaterThan(0);
  for (const control of all) {
    const result = await control.evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const probes = [[-21, -21], [0, -21], [21, -21], [-21, 0], [21, 0], [-21, 21], [0, 21], [21, 21]];
      const misses = probes.filter(([dx, dy]) => {
        const hit = document.elementFromPoint(cx + dx!, cy + dy!);
        return hit === null || !el.contains(hit);
      });
      // Says what took each missed tap instead, for a failing check.
      const took = misses.map(([dx, dy]) => (document.elementFromPoint(cx + dx!, cy + dy!) as HTMLElement | null)?.className ?? 'nothing');
      return { name: `${el.className} «${el.textContent?.trim().slice(0, 24)}» ${Math.round(r.width)}×${Math.round(r.height)}, taken by ${took.join(', ')}`, misses };
    });
    expect(result.misses, result.name).toEqual([]);
  }
}

/** No sideways scroll on the page, on the screens or on the home list. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() =>
    [document.documentElement, ...Array.from(document.querySelectorAll('.screen, .home-scroll'))].map((el) => el.scrollWidth - el.clientWidth),
  );
  expect(overflow.every((x) => x <= 0)).toBe(true);
}

/**
 * How far the label, the number and the caption stay inside the ring's inner edge, in px (negative:
 * they cross it). The glyphs are taken as 0.35 em up and down from the middle of each line.
 */
async function ringTextRoom(page: Page): Promise<number> {
  return page.getByTestId('ring').evaluate((ring) => {
    const box = ring.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const arc = ring.querySelector('.ring-arc')!;
    const inner = Number(arc.getAttribute('r')) - parseFloat(getComputedStyle(arc).strokeWidth) / 2;
    const rooms = Array.from(ring.querySelectorAll('.ring-label, .ring-caption, .hero-whole, .hero-fraction')).map((el) => {
      const r = el.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(el).fontSize);
      const mid = r.top + r.height / 2;
      const corners = [mid - 0.35 * em, mid + 0.35 * em].flatMap((y) => [r.left, r.right].map((x) => Math.hypot(x - cx, y - cy)));
      return inner - Math.max(...corners);
    });
    return Math.min(...rooms);
  });
}

test('VoiceOver hears the state and the amount of the ring in one phrase, then what a tap does', async ({ page, browser }) => {
  await open(page, named(exampleA()));
  const ring = page.getByTestId('ring');
  await expect(ring).toHaveAttribute('role', 'button');
  await expect(ring).toHaveAccessibleName('Сегодня можно 28,54 BYN. Как считается лимит');
  // The number alone is one phrase with the currency too, not «28» «,54».
  await expect(page.getByTestId('hero-amount')).toHaveAccessibleName('28,54 BYN');
  await expect(page.getByRole('button', { name: 'Сегодня можно 28,54 BYN. Как считается лимит' })).toBeVisible();

  // Running low, all spent and overspent.
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, '24,26');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(ring).toHaveAccessibleName('Осталось меньше 20%: сегодня можно 4,28 BYN. Как считается лимит');
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, '7,74');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(ring).toHaveAccessibleName('Сегодня перерасход 3,46 BYN. Как считается лимит');

  // Enter on the focused ring opens the explanation, as a tap does.
  await ring.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Как считается' })).toBeVisible();

  // Short of money.
  const deficit = await openSmall(browser, named(exampleA({ balanceKopecks: 25000 })));
  await expect(deficit.getByTestId('ring')).toHaveAccessibleName('Не хватает денег 79,11 BYN до 5 октября. Как считается лимит');
  await deficit.context().close();
});

test('tap areas of at least 44×44 on the home screen, the expense sheet, history, «Финансы» and «Настройки»', async ({ browser }) => {
  const data = lived();
  data.settings.targetDailyLimitKopecks = 6000; // «До 60,00 BYN в день не хватает…» under the ring
  const page = await openSmall(browser, data);
  await settle(page);

  // Home: the leftover card starts folded on this screen, then shows where the money goes.
  const card = page.getByTestId('leftover-card');
  await expectTapAreas(card.getByRole('button'));
  await card.getByRole('button', { name: 'Отложить…' }).click();
  await expect(card.locator('.chip')).toHaveCount(2);
  await settle(page);
  await expectTapAreas(card.locator('.chip'));
  await expectTapAreas(card.getByRole('button', { name: 'Отложить', exact: true }));
  await expectTapAreas(card.getByRole('button', { name: 'Не сейчас' }));
  await expectTapAreas(page.getByTestId('upcoming-item'));
  await expectTapAreas(page.getByTestId('favorites').getByRole('button'));
  await expectTapAreas(page.getByTestId('savings-caption'));
  await expectTapAreas(page.getByTestId('week-strip'));
  await expectTapAreas(page.getByTestId('target-line'));
  await expectTapAreas(page.getByTestId('recent-operations').getByRole('button'));

  // The expense sheet: «Трата / Доход», «Сегодня / Вчера», the categories and the keypad.
  await page.getByRole('button', { name: '+ Трата' }).click();
  await settle(page);
  const sheet = page.locator('.expense-sheet');
  await expectTapAreas(sheet.getByRole('radio'));
  await expectTapAreas(sheet.locator('.chip'));
  await expectTapAreas(sheet.locator('.keypad-key'));
  await sheet.getByRole('radio', { name: 'Доход' }).click();
  await expectTapAreas(sheet.locator('.chip'));
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // History: the categories and the operations.
  await page.getByRole('button', { name: 'История' }).click();
  await settle(page);
  await expectTapAreas(page.getByTestId('category-total'));
  await expectTapAreas(page.locator('.history-list').getByRole('button'));

  // «Финансы»: the calendar's month arrows and the list rows.
  await page.getByRole('button', { name: 'Финансы' }).click();
  await settle(page);
  await expectTapAreas(page.getByRole('button', { name: /месяц$/ }));
  await expectTapAreas(page.locator('.screen .list-row'));

  // «Настройки»: the theme, «Крупный текст», the accents and the rows.
  await page.getByRole('button', { name: 'Настройки' }).click();
  await settle(page);
  await expectTapAreas(page.locator('.settings .segmented').getByRole('radio'));
  await expectTapAreas(page.getByRole('switch', { name: /Крупный текст/ }));
  await expectTapAreas(page.getByRole('radiogroup', { name: 'Цвет акцента' }).getByRole('radio'));
  await expectTapAreas(page.locator('.settings button.list-row'));
  await page.context().close();
});

test('«Крупный текст»: a switch in «Настройки», 1.2× everywhere, kept after a reload', async ({ page }) => {
  await open(page, lived());
  await page.getByRole('button', { name: 'Настройки' }).click();
  const label = page.locator('.section-label').first();
  await expect(label).toHaveCSS('font-size', '13px');
  const toggle = page.getByRole('switch', { name: /Крупный текст/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(label).toHaveCSS('font-size', '15.6px');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayly:ui')!).largeText)).toBe(true);

  // index.html sets it before the app starts, as it does the theme.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('.brand')).toHaveCSS('font-size', `${22 * 1.2}px`);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('switch', { name: /Крупный текст/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('.section-label').first()).toHaveCSS('font-size', '13px');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`«Крупный текст» on 375×667, ${scheme}: the ring states, the sheet, history, «Финансы» and «Настройки» fit`, async ({ browser }) => {
    const large = { largeText: true };
    const shot = async (page: Page, name: string) => {
      await settle(page);
      await page.screenshot({ path: test.info().outputPath(`large-${name}-${scheme}.png`) });
    };

    // Every ring state keeps the label, the number and the caption inside the ring.
    const states: [string, AppData][] = [];
    states.push(['ok', lived()]);
    const low = lived();
    // 13,00 of 15,21: the yellow ring, «Осталось меньше 20%».
    low.transactions.push(tx({ type: 'expense', amountKopecks: 1300, date: '2026-09-26', category: 'cafe' }));
    states.push(['low', low]);
    const over = lived();
    over.transactions.push(tx({ type: 'expense', amountKopecks: 6533, date: '2026-09-26', category: 'fun' }));
    states.push(['overspent', over]);
    states.push(['deficit', named(exampleA({ balanceKopecks: 25000 }))]);
    // A two-line confirmation banner above the ring.
    const banner = lived();
    banner.payments.push({ id: 'gym', name: 'Спортзал и бассейн', amountKopecks: 12050, dayOfMonth: 26, weekday: null, date: null, startDate: '2026-09-20', isActive: true });
    states.push(['banner', banner]);
    for (const [name, data] of states) {
      const page = await openSmall(browser, data, scheme, large);
      await settle(page);
      const said: Record<string, RegExp> = { ok: /^Сегодня можно/, low: /^Осталось меньше 20%/, overspent: /^Сегодня перерасход/, deficit: /^Не хватает денег/ };
      if (said[name]) await expect(page.getByTestId('ring')).toHaveAccessibleName(said[name]!);
      const room = await ringTextRoom(page);
      console.log(`large text, ${name}, ${scheme}: ring text ${room.toFixed(1)} px inside the ring`);
      expect(room).toBeGreaterThanOrEqual(0);
      expect(await page.getByTestId('hero-amount').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expectNoSidewaysScroll(page);
      // The five tab labels stay apart.
      const tabs = await page.locator('.tab-bar .tab span').evaluateAll((spans) => spans.map((s) => s.getBoundingClientRect()).map((r) => [r.left, r.right]));
      for (let i = 1; i < tabs.length; i += 1) expect(tabs[i]![0]!).toBeGreaterThan(tabs[i - 1]![1]!);
      await shot(page, `home-${name}`);
      if (name === 'banner') await expect(page.getByTestId('banner')).toBeInViewport();

      if (name === 'ok') {
        // The sheet: the categories scroll sideways in one row, so the keypad and «Добавить» fit.
        await page.getByRole('button', { name: '+ Трата' }).click();
        await page.getByRole('radio', { name: 'Вчера' }).click();
        await typeAmount(page, '12');
        await settle(page);
        const add = (await page.getByRole('button', { name: 'Добавить', exact: true }).boundingBox())!;
        expect(add.y + add.height).toBeLessThanOrEqual(SMALL.height);
        const strip = page.locator('.expense-sheet > .chips');
        expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
        await expect(strip.locator('.chip.is-selected')).toBeInViewport();
        expect(await page.locator('.expense-sheet').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
        await shot(page, 'sheet');
        await page.keyboard.press('Escape');
        await expect(page.locator('.expense-sheet')).toHaveCount(0);

        for (const tab of ['История', 'Финансы', 'Настройки']) {
          await page.getByRole('button', { name: tab }).click();
          await expectNoSidewaysScroll(page);
          await shot(page, tab === 'История' ? 'history' : tab === 'Финансы' ? 'finances' : 'settings');
        }
      }
      await page.context().close();
    }
  });
}

test('a tap on an operation opens «Изменить / Удалить»; a long press and a right click still do', async ({ page }) => {
  await open(page, lived());
  const list = page.getByTestId('recent-operations');
  const row = list.getByRole('button', { name: 'Кафе, −24,50 BYN, вчера, 12:00' });
  await expect(row).toBeVisible();
  await row.click();
  const actions = page.locator('.action-sheet');
  await expect(actions).toHaveCount(1);
  await expect(actions.getByRole('button', { name: 'Изменить' })).toBeVisible();
  await actions.getByRole('button', { name: 'Отмена' }).click();
  await expect(actions).toHaveCount(0);

  // A long press opens it once: the click that ends the press does not open it again.
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(600);
  await expect(actions).toHaveCount(1);
  await page.mouse.up();
  await expect(actions).toHaveCount(1);
  await actions.getByRole('button', { name: 'Отмена' }).click();
  await expect(actions).toHaveCount(0);
  await row.click({ button: 'right' });
  await expect(actions).toHaveCount(1);
  await actions.getByRole('button', { name: 'Отмена' }).click();
  await expect(actions).toHaveCount(0);

  // Keyboard: the row is a button like any other.
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(actions).toHaveCount(1);
  await actions.getByRole('button', { name: 'Отмена' }).click();

  // In «История» a tap deletes as well; a balance adjustment is not an operation to change.
  await page.getByRole('button', { name: 'История' }).click();
  const yesterday = page.getByTestId('history-day').filter({ hasText: 'Вчера, пт' });
  await yesterday.getByRole('button', { name: /^Кафе, −24,50 BYN/ }).click();
  await page.getByRole('button', { name: 'Удалить трату' }).click();
  await expect(page.getByTestId('history-day').filter({ hasText: 'Вчера, пт' })).toHaveCount(0);
  const adjustment = page.getByTestId('operation').filter({ hasText: 'Сверка баланса' });
  await expect(adjustment.getByRole('button')).toHaveCount(0);
  await adjustment.click();
  await adjustment.click({ button: 'right' });
  await expect(actions).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`«Вчера» in the expense sheet, ${scheme}: yesterday's result, the strip, the carry and history recount; «Отменить» works`, async ({ browser }) => {
    const data = lived();
    const page = await openSmall(browser, data, scheme);
    const before = calculateBudget(data, '2026-09-26');
    const after = calculateBudget(addExpenseTo(data, 1000, 'cafe', '2026-09-26', TODAY, null, '2026-09-25'), '2026-09-26');
    expect(after.dailyLimitKopecks).toBeLessThan(before.dailyLimitKopecks);
    const hero = page.getByTestId('hero-amount');
    await expect(hero).toHaveText(formatKopecks(before.remainingTodayKopecks));
    const strip = page.getByTestId('week-strip');
    const lastDot = strip.locator('.week-dot').nth(5);
    await expect(lastDot).toHaveAttribute('data-status', 'in');
    await expect(strip.locator('.week-streak')).toHaveText('В лимите 4 дня подряд');
    await expect(page.locator('.carry-pill')).toHaveText('+3,50 с вчера');
    await expect(page.getByTestId('leftover-card')).toBeVisible();

    await page.getByRole('button', { name: '+ Трата' }).click();
    const days = page.getByRole('radiogroup', { name: 'День траты' });
    await expect(days.getByRole('radio', { name: 'Сегодня' })).toHaveAttribute('aria-checked', 'true');
    await days.getByRole('radio', { name: 'Вчера' }).click();
    await expect(page.getByTestId('sheet-hint')).toHaveText(`Лимит на сегодня ${formatKopecks(before.dailyLimitKopecks)} BYN`);
    await typeAmount(page, '10');
    await expect(page.getByTestId('sheet-hint')).toHaveText(`Лимит на сегодня станет ${formatKopecks(after.dailyLimitKopecks)} BYN`);
    // «Сегодня» says what is left today, as before.
    await days.getByRole('radio', { name: 'Сегодня' }).click();
    await expect(page.getByTestId('sheet-hint')).toHaveText(/^Останется на сегодня/);
    await days.getByRole('radio', { name: 'Вчера' }).click();
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`sheet-yesterday-${scheme}.png`) });
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.locator('.expense-sheet')).toHaveCount(0);

    // Today's limit drops, yesterday is now over its limit: a red dot, no streak, a negative carry, no leftover card.
    await expect(hero).toHaveText(formatKopecks(after.remainingTodayKopecks));
    await expect(lastDot).toHaveAttribute('data-status', 'over');
    await expect(strip.locator('.week-streak')).toHaveCount(0);
    await expect(page.locator('.carry-pill')).toHaveText('−6,50 с вчера');
    await expect(page.getByTestId('leftover-card')).toHaveCount(0);
    await expect(page.getByTestId('recent-operations').getByRole('button').first()).toHaveAccessibleName('Кафе, −10,00 BYN, вчера');
    await expect(page.getByRole('status').filter({ hasText: 'Отменить' })).toContainText('Кафе −10,00 · вчера');
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`home-after-yesterday-${scheme}.png`) });

    // «Отменить» takes it back.
    await page.getByRole('status').getByRole('button', { name: 'Отменить' }).click();
    await expect(hero).toHaveText(formatKopecks(before.remainingTodayKopecks));
    await expect(lastDot).toHaveAttribute('data-status', 'in');
    await expect(page.locator('.carry-pill')).toHaveText('+3,50 с вчера');

    // Added again, it is in yesterday's history with the day's result recounted, and it keeps its day when changed.
    await page.getByRole('button', { name: '+ Трата' }).click();
    await page.getByRole('radio', { name: 'Вчера' }).click();
    await typeAmount(page, '10');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByRole('button', { name: 'История' }).click();
    const yesterday = page.getByTestId('history-day').filter({ hasText: 'Вчера, пт' });
    await expect(yesterday.getByTestId('history-summary')).toHaveText('34,50 из 28,00 · −6,50');
    await yesterday.getByRole('button', { name: /^Кафе, −10,00 BYN/ }).click();
    await page.getByRole('button', { name: 'Изменить' }).click();
    await expect(page.getByRole('radiogroup', { name: 'День траты' })).toHaveCount(0);
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Backspace');
    await typeAmount(page, '2');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(yesterday.getByTestId('history-summary')).toHaveText('26,50 из 28,00 · +1,50');

    // A new sheet starts on «Сегодня»; «Доход» has no day.
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
    await page.getByRole('button', { name: '+ Трата' }).click();
    await expect(page.getByRole('radio', { name: 'Сегодня' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Доход' }).click();
    await expect(page.getByRole('radiogroup', { name: 'День траты' })).toHaveCount(0);
    await page.context().close();
  });
}

test('«Вчера» is not offered on the first day of tracking', async ({ page }) => {
  await open(page, named(exampleA()));
  await page.getByRole('button', { name: '+ Трата' }).click();
  await expect(page.getByRole('radio', { name: 'Трата' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'День траты' })).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`«История», ${scheme}: totals by category for the period; a tap on one shows only its expenses`, async ({ browser }) => {
    const data = lived();
    const page = await openSmall(browser, data, scheme);
    await page.getByRole('button', { name: 'История' }).click();
    const card = page.getByTestId('category-totals');
    await expect(card).toContainText('За период с 20 сентября');
    const expected = categoryTotals(data, '2026-09-20', '2026-09-26');
    const names: Record<string, string> = { cafe: 'Кафе', fun: 'Развлечения', delivery: 'Доставка', groceries: 'Продукты' };
    const rows = card.getByTestId('category-total');
    await expect(rows.locator('.category-total-name')).toHaveText(expected.map((t) => names[t.category]!));
    await expect(rows.locator('.category-total-amount')).toHaveText(expected.map((t) => formatKopecks(t.totalKopecks)));
    // Kafe 12,00 + 20,00 + 24,50; «Продукты» came from its reserve.
    await expect(rows.first()).toContainText('Кафе56,50');
    await expect(rows.filter({ hasText: 'Продукты' })).toContainText('из резерва 42,00 · из лимита 0,00');
    const sum = data.transactions.filter((t) => t.type === 'expense' && t.category !== null).reduce((total, t) => total + t.amountKopecks, 0);
    await expect(card.getByTestId('category-totals-sum')).toHaveText(`${formatKopecks(sum)} BYN`);
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`history-totals-${scheme}.png`) });

    // A tap on «Кафе» leaves only its expenses; the card says so. Another tap shows everything.
    const operations = page.locator('.history-list').getByTestId('operation');
    const all = await operations.count();
    await rows.filter({ hasText: 'Кафе' }).click();
    await expect(rows.filter({ hasText: 'Кафе' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('category-filter')).toHaveText('Только «Кафе» · нажми ещё раз, чтобы показать всё');
    await expect(operations).toHaveCount(3);
    await expect(operations.locator('.expense-name')).toHaveText(['Кафе', 'Кафе', 'Кафе']);
    await expect(page.getByTestId('history-day').first().getByTestId('history-summary')).toHaveText('24,50');
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`history-filtered-${scheme}.png`) });
    await rows.filter({ hasText: 'Кафе' }).click();
    await expect(page.getByTestId('category-filter')).toHaveCount(0);
    await expect(operations).toHaveCount(all);
    await page.context().close();
  });
}

test('fonts: only the Cyrillic and Latin files load and are cached; Latin text and digits are Manrope', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (/\.woff2?$/.test(request.url())) fonts.push(request.url().split('/').pop()!);
  });
  await open(page, lived());
  await page.evaluate(() => document.fonts.ready);
  console.log('fonts loaded:', fonts.join(', '));
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((f) => /^manrope-(cyrillic|latin)-(400|600|700|800)-normal-.+\.woff2$/.test(f))).toBe(true);

  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const names: string[] = [];
    for (const key of await caches.keys()) {
      for (const request of await (await caches.open(key)).keys()) {
        if (request.url.endsWith('.woff2')) names.push(request.url.split('/').pop()!);
      }
    }
    return names;
  });
  console.log('fonts cached by the service worker:', cached.length);
  expect(cached.map((f) => f.replace(/-normal-.+/, '')).sort()).toEqual(
    ['cyrillic', 'latin'].flatMap((subset) => ['400', '600', '700', '800'].map((w) => `manrope-${subset}-${w}`)).sort(),
  );

  // The font the browser drew each text with: «Dayly» (Latin), the number (digits), «Сегодня можно» (Cyrillic).
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  for (const selector of ['.brand', '.hero-whole', '.ring-label', '[data-testid="balance"]']) {
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts: used } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
    console.log(selector, JSON.stringify(used));
    // The woff2 files name themselves «Manrope ExtraLight …» (the variable font's default instance).
    expect(used.length).toBeGreaterThan(0);
    for (const font of used) {
      expect(font.isCustomFont).toBe(true);
      expect(font.familyName).toMatch(/^Manrope/);
    }
  }
});
