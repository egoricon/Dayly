import { expect, test, type Browser, type Page } from '@playwright/test';
import { exampleA, oneOffPayment } from '../src/domain/fixtures';
import type { AppData } from '../src/domain/types';

// Update 2, task A «Вкладки»: Сегодня · Копилка · История · Финансы · Настройки. The calendar is at the
// top of «Финансы»; the cushion, «С каждого поступления» and the goals are in «Копилка». Data is seeded,
// the clock is 26 September 2026, so example А of PROJECT_MAP.md gives the limit 28,54.

const TODAY = new Date('2026-09-26T10:00:00');
const TABS = ['Сегодня', 'Копилка', 'История', 'Финансы', 'Настройки'];

/** Example А with the names a student would type: the cushion 30,00 and «Наушники» 150,00 by 20 November. */
function named(): AppData {
  const data = exampleA();
  const names: Record<string, string> = { scholarship: 'Стипендия', parents: 'От родителей', salary: 'Подработка', dorm: 'Общежитие', internet: 'Интернет', phone: 'Телефон' };
  data.incomeSources = data.incomeSources.map((s) => ({ ...s, name: names[s.id] ?? s.name }));
  data.payments = data.payments.map((p) => ({ ...p, name: names[p.id] ?? p.name }));
  return data;
}

/** Everything «Копилка» shows: the cushion takes 10 % of every income on top of its 30,00, «Велосипед» 15 %. */
function withPercents(): AppData {
  const data = named();
  data.settings.cushion = { mode: 'percent', percent: 10, baseKopecks: 3000, sinceDate: '2026-09-26' };
  data.goals.push({ id: 'bike', name: 'Велосипед', targetKopecks: 50000, initialSavedKopecks: 2000, startDate: '2026-09-26', deadline: null, percent: 15, status: 'active' });
  return data;
}

async function open(page: Page, data: AppData, ui: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([data, ui]) => {
      if (localStorage.getItem('dayly:data') === null) {
        localStorage.setItem('dayly:data', data);
        localStorage.setItem('dayly:ui', ui);
      }
    },
    [JSON.stringify(data), JSON.stringify({ tipsShown: true, whatsNewSeen: 'update-1', ...ui })] as const,
  );
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await expect(page.getByTestId('hero-amount')).toBeVisible();
}

const tab = (page: Page, name: string) => page.locator('.tab-bar').getByRole('button', { name, exact: true });

/** Waits for screen, card and ring animations to end, so a screenshot shows the final look. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/** WCAG contrast of a tab's label against the tab bar. */
async function labelContrast(page: Page, name: string): Promise<number> {
  return tab(page, name).evaluate((el) => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (color: string) => {
      const [r, g, b] = rgb(color).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const fg = luminance(getComputedStyle(el).color);
    const bg = luminance(getComputedStyle(el.closest('.tab-bar')!).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
}

test('five tabs in order; the savings tab has a piggy bank; every tab is 44 px or more, labels readable in both themes', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme, locale: 'ru-RU' });
    const page = await context.newPage();
    await open(page, named());
    await expect(page.locator('.tab-bar .tab')).toHaveText(TABS);
    await expect(tab(page, 'Сегодня')).toHaveAttribute('aria-current', 'page');
    await expect(tab(page, 'Копилка').locator('svg ellipse')).toHaveCount(1);
    for (const name of TABS) {
      const box = (await tab(page, name).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      if (name !== 'Сегодня') expect(await labelContrast(page, name), `${colorScheme} ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    // The active tab is not told by colour alone: its icon sits on a pill.
    const pill = (name: string) => tab(page, name).evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
    expect(await pill('Сегодня')).not.toBe('rgba(0, 0, 0, 0)');
    expect(await pill('Копилка')).toBe('rgba(0, 0, 0, 0)');
    await tab(page, 'Копилка').click();
    await expect(tab(page, 'Копилка')).toHaveAttribute('aria-current', 'page');
    expect(await pill('Копилка')).not.toBe('rgba(0, 0, 0, 0)');
    await settle(page);
    await page.locator('.tab-bar').screenshot({ path: test.info().outputPath(`tab-bar-${colorScheme}.png`) });
    await context.close();
  }
});

test('«Финансы»: the calendar on top, then incomes, payments, categories, favourites, the target and the balance', async ({ page }) => {
  await open(page, named());
  await tab(page, 'Финансы').click();
  const calendar = page.getByTestId('finance-calendar');
  await expect(calendar).toBeInViewport();
  await expect(page.getByTestId('calendar-month')).toHaveText('Сентябрь');
  await expect(page.locator('.cal-day[data-date="2026-09-26"]')).toHaveAttribute('aria-current', 'date');
  await expect(page.locator('.day-sheet')).toHaveCount(0);
  // Right under the title, before every section.
  const order = await page.locator('.screen.settings > *').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? el.textContent));
  expect(order.slice(0, 3)).toEqual(['Финансы', 'finance-calendar', 'Доходы']);
  await expect(page.locator('.screen.settings > .section-label')).toHaveText(['Доходы', 'Обязательные платежи', 'Категории трат', 'Любимые траты', 'Цель по лимиту', 'Баланс']);
  // What is set aside lives in «Копилка» now.
  await expect(page.getByText('Коплю на')).toHaveCount(0);
  await expect(page.getByText(/Откладываем/)).toHaveCount(0);
  await expect(page.locator('.goal-card')).toHaveCount(0);

  // The payments keep their row: the unpaid sum until the scholarship, and the list behind it.
  const payments = page.getByTestId('finance-payments');
  await expect(payments).toHaveText('Все платежи · 3не оплачено до 5 октября95,00');
  await payments.getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Обязательные платежи' })).toBeVisible();
  await expect(page.getByTestId('payments-list')).toContainText('Общежитие');
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(calendar).toBeInViewport();

  // A day of the calendar plans a payment right here.
  await page.locator('.cal-day[data-date="2026-09-29"]').click();
  await expect(page.locator('.day-sheet')).toContainText('29 сентября');
  await page.locator('.day-sheet').getByRole('button', { name: '+ Расход' }).click();
  await page.locator('.event-sheet').getByPlaceholder('Например, общежитие').fill('Кино');
  await page.locator('.event-sheet').getByPlaceholder('0,00').fill('12');
  await page.locator('.event-sheet').getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByTestId('day-events')).toContainText('Кино');
  await expect(payments).toHaveText('Все платежи · 4не оплачено до 5 октября107,00');
});

test('«Копилка»: the cushion, «С каждого поступления» and the goals; their forms open inside the tab', async ({ page }) => {
  await open(page, withPercents());
  await tab(page, 'Копилка').click();
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();
  await expect(page.getByTestId('savings-cushion')).toHaveText('Подушка · 10% дохода30,00');
  await expect(page.getByTestId('savings-split')).toContainText('10% подушка · 15% велосипед · 75% на жизнь');
  await expect(page.locator('.goal-card')).toHaveText(['Наушники2 из 150по 24,11 за период · к 20 ноября', 'Велосипед20 из 50015% с каждого поступления']);
  await expect(page.getByRole('button', { name: '+ Добавить цель' })).toBeVisible();

  // The cushion's form, with «Взять из подушки»; «Назад» comes back to «Копилка».
  await page.getByTestId('savings-cushion').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Подушка' })).toBeVisible();
  await expect(page.getByText('Взять из подушки')).toBeVisible();
  await expect(tab(page, 'Копилка')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();

  // A goal card and a row of «С каждого поступления» open the goal.
  await page.locator('.goal-card', { hasText: 'Наушники' }).click();
  await expect(page.getByRole('heading', { name: 'Наушники' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Купил за 150,00 BYN' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await page.getByTestId('savings-split').getByRole('button', { name: /Велосипед/ }).click();
  await expect(page.getByRole('heading', { name: 'Велосипед' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();

  // A new goal is saved from here; another tab and back shows the list again.
  await page.getByRole('button', { name: '+ Добавить цель' }).click();
  await expect(page.getByRole('heading', { name: 'Новая цель' })).toBeVisible();
  await page.getByPlaceholder('Например, наушники').fill('Поездка');
  await page.locator('.form-screen').getByPlaceholder('0,00').first().fill('200');
  await page.locator('.form-screen input[type="date"]').fill('2026-12-01');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.goal-card')).toHaveCount(3);
  await page.locator('.goal-card', { hasText: 'Поездка' }).click();
  await expect(page.getByRole('heading', { name: 'Поездка' })).toBeVisible();
  await tab(page, 'Сегодня').click();
  await tab(page, 'Копилка').click();
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();
});

test('the savings ring’s caption opens «Копилка»', async ({ page }) => {
  await open(page, named());
  await expect(page.getByTestId('savings-arc')).toHaveCount(1);
  await page.getByTestId('savings-caption').click();
  await expect(tab(page, 'Копилка')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();
  await expect(page.locator('.goal-card')).toContainText('Наушники');
});

test('a deficit’s «Сдвинуть срок цели» and «Взять из подушки» open their forms in «Копилка»', async ({ page }) => {
  const data = named();
  data.payments.push({ ...oneOffPayment('laptop', 60000, '2026-09-30', '2026-09-26'), name: 'Ремонт ноутбука' });
  await open(page, data);
  const hints = page.getByTestId('deficit-hints');
  await hints.getByRole('button', { name: /Сдвинуть срок цели «Наушники»/ }).click();
  await expect(tab(page, 'Копилка')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Наушники' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Копилка' })).toBeVisible();

  await tab(page, 'Сегодня').click();
  await hints.getByRole('button', { name: /Взять из подушки/ }).click();
  await expect(page.getByRole('heading', { name: 'Подушка' })).toBeVisible();
  await expect(page.getByTestId('cushion-saved')).toHaveText('Сейчас в подушке 30,00 BYN');
});

test('«Функции → Копилка» off hides the tab, the savings ring and its caption; the limit still counts the savings', async ({ page }) => {
  await open(page, named());
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
  await expect(page.getByTestId('savings-caption')).toBeVisible();

  await tab(page, 'Настройки').click();
  const features = page.getByTestId('settings-features');
  const savings = features.getByRole('switch', { name: 'Копилка', exact: true });
  await expect(savings).toHaveAttribute('aria-checked', 'true');
  await savings.click();
  await expect(savings).toHaveAttribute('aria-checked', 'false');
  // «Кольцо копилки» keeps its own switch.
  await expect(features.getByRole('switch', { name: 'Кольцо копилки' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.tab-bar .tab')).toHaveText(['Сегодня', 'История', 'Финансы', 'Настройки']);

  await tab(page, 'Сегодня').click();
  await expect(page.getByTestId('savings-caption')).toHaveCount(0);
  await expect(page.getByTestId('savings-arc')).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('28,54');
  await expect(tab(page, 'Копилка')).toHaveCount(0);
  await expect(page.getByTestId('savings-caption')).toHaveCount(0);

  // Back on: the tab, the ring and its caption are there again, with the same goal.
  await tab(page, 'Настройки').click();
  await features.getByRole('switch', { name: 'Копилка', exact: true }).click();
  await tab(page, 'Копилка').click();
  await expect(page.locator('.goal-card')).toContainText('Наушники');
  await tab(page, 'Сегодня').click();
  await expect(page.getByTestId('savings-caption')).toBeVisible();
});

test('«Функции → Копилка» off takes the deficit’s savings hints away; «Сверить баланс» stays', async ({ page }) => {
  const data = named();
  data.payments.push({ ...oneOffPayment('laptop', 60000, '2026-09-30', '2026-09-26'), name: 'Ремонт ноутбука' });
  await open(page, data, { features: { savings: false } });
  const hints = page.getByTestId('deficit-hints');
  await expect(hints.getByRole('button')).toHaveText(['Сверить баланс →']);
});

async function smallScreens(browser: Browser, colorScheme: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme, locale: 'ru-RU' });
  const page = await context.newPage();
  const data = withPercents();
  data.settings.favorites = [{ id: 'coffee', label: 'Кофе', amountKopecks: 350, category: 'cafe' }];
  data.settings.targetDailyLimitKopecks = 3000;
  await open(page, data);
  return { context, page };
}

/** No sideways scroll on the page or the screen; the screen's top and bottom as screenshots. */
async function shoot(page: Page, name: string) {
  const overflow = await page.evaluate(() => {
    const screen = document.querySelector('.screen')!;
    return [document.documentElement.scrollWidth - window.innerWidth, screen.scrollWidth - screen.clientWidth];
  });
  expect(overflow, name).toEqual([0, 0]);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath(`${name}-top.png`) });
  await page.locator('.screen').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: test.info().outputPath(`${name}-bottom.png`) });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`small iPhone 375×667, ${colorScheme}: «Финансы» and «Копилка» fit without sideways scroll`, async ({ browser }) => {
    const { context, page } = await smallScreens(browser, colorScheme);
    await tab(page, 'Финансы').click();
    const grid = (await page.getByTestId('calendar-grid').boundingBox())!;
    const bar = (await page.locator('.tab-bar').boundingBox())!;
    expect(grid.y + grid.height).toBeLessThanOrEqual(bar.y);
    await shoot(page, `finances-${colorScheme}`);
    await tab(page, 'Копилка').click();
    await shoot(page, `savings-${colorScheme}`);
    await context.close();
  });
}
