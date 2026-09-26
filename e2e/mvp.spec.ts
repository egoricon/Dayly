import { chromium, expect, test, type Page } from '@playwright/test';

// MVP readiness criteria (PROJECT_MAP.md section 7) in a real browser.
// The clock is fixed to 26 September 2026, the day of example А, so the numbers are known.

const TODAY = new Date('2026-09-26T10:00:00');
const BASE = 'http://localhost:4173/';

async function typeAmount(page: Page, amount: string) {
  for (const ch of amount) await page.keyboard.press(ch === ',' ? 'Comma' : ch);
}

/** Onboarding 2a–2e with example А: 586 on hand, scholarship 220 on 5 October, three payments. */
async function onboard(page: Page) {
  await page.getByRole('button', { name: 'Начать' }).click();
  await typeAmount(page, '586');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await page.locator('.calendar-day', { hasText: /^5$/ }).click();
  await page.getByPlaceholder('0,00').fill('220');
  await page.getByRole('button', { name: 'Дальше' }).click();
  for (const [name, amount, day] of [
    ['Общежитие', '45', '1'],
    ['Интернет', '30', '3'],
    ['Телефон', '20', '4'],
  ] as const) {
    await page.getByRole('button', { name: '+ Добавить платёж' }).click();
    const sheet = page.locator('.form-sheet');
    await sheet.getByPlaceholder('Общежитие').fill(name);
    await sheet.getByPlaceholder('0,00').fill(amount);
    await sheet.getByRole('button', { name: 'Следующий месяц' }).click();
    await sheet.locator('.calendar-day', { hasText: new RegExp(`^${day}$`) }).click();
    await sheet.getByRole('button', { name: 'Добавить' }).click();
    await expect(sheet).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Посчитать лимит' }).click();
  await expect(page.getByTestId('first-limit')).toHaveText('54,55BYN');
  await page.getByRole('button', { name: 'На главную' }).click();
}

/** «+ Трата» → amount → «Добавить»: the three actions of the main scenario. */
async function addExpense(page: Page, amount: string) {
  await page.getByRole('button', { name: '+ Трата' }).click();
  await typeAmount(page, amount);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
}

test('limit is large, balance secondary; an expense recounts the limit without a reload', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await onboard(page);

  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 586,00 BYN');
  const heroSize = await page.locator('.hero-whole').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const balanceSize = await page.getByTestId('balance').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  console.log(`hero ${heroSize}px, balance ${balanceSize}px`);
  expect(heroSize).toBeGreaterThanOrEqual(4 * balanceSize);

  // A marker on window survives only if the page is not reloaded.
  await page.evaluate(() => ((window as unknown as { noReload: boolean }).noReload = true));
  await addExpense(page, '3,5');
  await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
  await expect(page.getByTestId('ring-caption')).toHaveText('BYN из 54,55');
  await expect(page.getByTestId('balance')).toHaveText('Баланс 582,50 BYN');
  await expect(page.getByTestId('today-expenses')).toContainText('Кафе');
  expect(await page.evaluate(() => (window as unknown as { noReload?: boolean }).noReload)).toBe(true);
  console.log('after «+ Трата» → 3,5 → «Добавить»:', await page.locator('.ring-center').innerText());
});

test('data survive a browser restart; the app opens offline', async ({}, testInfo) => {
  // Browser profile in test-results/, removed by Playwright before the next run.
  const profile = testInfo.outputPath('profile');
  {
    let context = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
    let page = context.pages()[0] ?? (await context.newPage());
    await page.clock.install({ time: TODAY });
    await page.goto(BASE);
    await onboard(page);
    await addExpense(page, '3,5');
    await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.close();

    // New browser process on the same profile, as after closing the app.
    context = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
    page = context.pages()[0] ?? (await context.newPage());
    await page.clock.install({ time: TODAY });
    await page.goto(BASE);
    await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
    await expect(page.getByTestId('balance')).toHaveText('Баланс 582,50 BYN');
    await expect(page.getByTestId('today-expenses')).toContainText('−3,50');
    console.log('after restart:', await page.locator('.ring-center').innerText(), '|', await page.getByTestId('balance').innerText());

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
    console.log('offline reload:', await page.locator('.ring-center').innerText());
    await context.close();
  }
});

test('PWA: manifest and service worker are served', async ({ page }) => {
  await page.goto('/');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ short_name: 'Dayly', display: 'standalone', start_url: './' });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(BASE);
  const persisted = await page.evaluate(() => navigator.storage.persisted());
  console.log('manifest:', manifest.name, '| service worker scope:', scope, '| storage.persisted():', persisted);
});

test('accent colour applies at once and survives a reload', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await onboard(page);
  const hue = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-h').trim());
  expect(await hue()).toBe('85');

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('radio', { name: 'Мята' }).click();
  expect(await hue()).toBe('170');
  const ring = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  console.log('accent after «Мята»:', ring);

  await page.reload();
  expect(await hue()).toBe('170');
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
});

test('home-screen hint: iPhone steps from the second launch, gone once dismissed', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.clock.install({ time: TODAY });
  await page.goto(BASE);
  await onboard(page);
  await expect(page.getByTestId('install-hint')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('install-hint')).toBeVisible();
  await expect(page.getByTestId('install-steps-ios')).toContainText('На экран „Домой“');
  console.log('hint:', (await page.getByTestId('install-hint').innerText()).replace(/\n/g, ' | '));

  await page.getByRole('button', { name: 'Скрыть подсказку' }).click();
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(page.getByTestId('install-hint')).toHaveCount(0);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: /Как добавить на главный экран/ }).click();
  await expect(page.getByText('iPhone, Safari')).toBeVisible();
  await expect(page.getByText('Android, Chrome')).toBeVisible();
  await context.close();
});

/** Every text the big number showed while `action` ran. */
async function heroTexts(page: Page, action: () => Promise<void>): Promise<string[]> {
  await page.evaluate(() => {
    const w = window as unknown as { heroTexts: string[] };
    w.heroTexts = [];
    const el = document.querySelector('[data-testid="hero-amount"]')!;
    new MutationObserver(() => w.heroTexts.push(el.textContent ?? '')).observe(el, { subtree: true, characterData: true, childList: true });
  });
  await action();
  await page.waitForTimeout(700);
  return page.evaluate(() => [...new Set((window as unknown as { heroTexts: string[] }).heroTexts)]);
}

test('animations: the limit runs to the new value, a deleted row collapses; reduced motion jumps', async ({ page, browser }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await onboard(page);
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');

  const running = await heroTexts(page, () => addExpense(page, '3,5'));
  console.log('values shown after the expense:', running.join(' → '));
  expect(running.length).toBeGreaterThan(2);
  expect(running.at(-1)).toBe('51,05');

  await page.getByTestId('operation').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Удалить трату' }).click();
  await expect(page.getByTestId('operation').first()).toHaveClass(/is-leaving/);
  await expect(page.getByTestId('operation')).toHaveCount(0);
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');

  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const calm = await context.newPage();
  await calm.clock.install({ time: TODAY });
  await calm.goto(BASE);
  await onboard(calm);
  await expect(calm.getByTestId('hero-amount')).toHaveText('54,55');
  const jumped = await heroTexts(calm, () => addExpense(calm, '3,5'));
  console.log('reduced motion:', jumped.join(' → '));
  expect(jumped).toEqual(['51,05']);
  await context.close();
});

test('iPhone fixes: a step back keeps the input, the payment button fits a short screen, the page never scrolls', async ({ browser }) => {
  // Short viewport, like an in-app browser with its bars.
  const context = await browser.newContext({ viewport: { width: 393, height: 640 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.clock.install({ time: TODAY });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Начать' }).click();
  await typeAmount(page, '586');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByTestId('start-amount')).toHaveText('586');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await page.locator('.calendar-day', { hasText: /^5$/ }).click();
  await page.getByPlaceholder('0,00').fill('220');
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByPlaceholder('0,00')).toHaveValue('220');
  await page.getByRole('button', { name: 'Дальше' }).click();

  await page.getByRole('button', { name: '+ Добавить платёж' }).click();
  const add = page.locator('.form-sheet').getByRole('button', { name: 'Добавить' });
  await page.waitForTimeout(400);
  const box = (await add.boundingBox())!;
  console.log(`«Добавить» bottom at ${box.y + box.height} of 640`);
  expect(box.y + box.height).toBeLessThanOrEqual(640);

  await page.mouse.wheel(300, 800);
  const scroll = await page.evaluate(() => [window.scrollX, window.scrollY, document.documentElement.scrollWidth - window.innerWidth]);
  expect(scroll).toEqual([0, 0, 0]);
  await context.close();
});

test('weekly income: «Раз в неделю» with a weekday shows in settings', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await onboard(page);
  await page.getByRole('button', { name: 'Финансы' }).click();
  await page.getByRole('button', { name: /Добавить доход/ }).click();
  await page.getByRole('radio', { name: 'Раз в неделю' }).click();
  await page.getByRole('radio', { name: 'Пт' }).click();
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('50');
  const [scrollWidth, clientWidth] = await page.locator('.segmented').first().evaluate((el) => [el.scrollWidth, el.clientWidth] as const);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await page.screenshot({ path: test.info().outputPath('weekly-income.png') });
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('settings-incomes')).toContainText('по пятницам');
  console.log('incomes:', (await page.getByTestId('settings-incomes').innerText()).replace(/\n/g, ' | '));
});

test('home: name, «+ Доход», favourites with undo; «Финансы» tab; full reset after a warning', async ({ page }) => {
  await page.clock.install({ time: TODAY });
  await page.goto('/');
  await onboard(page);
  await expect(page.locator('.brand')).toHaveText('Dayly');

  // «+ Доход» opens the sheet already in income mode.
  await page.getByRole('button', { name: '+ Доход' }).click();
  await expect(page.getByRole('radio', { name: 'Доход' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('.sheet-dim').click();
  await expect(page.locator('.sheet')).toHaveCount(0);

  // A favourite from «Финансы», then one tap on the home screen and «Отменить».
  await page.getByRole('button', { name: 'Финансы' }).click();
  await expect(page.getByRole('heading', { name: 'Финансы' })).toBeVisible();
  await page.getByRole('button', { name: '+ Добавить любимую трату' }).click();
  await page.getByPlaceholder('Кофе').fill('Кофе');
  await page.locator('.form-screen').getByPlaceholder('0,00').fill('3,5');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('finance-favorites')).toContainText('Кофе');
  await page.getByRole('button', { name: 'Сегодня' }).click();

  await page.getByTestId('favorites').getByRole('button', { name: /Кофе/ }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('51,05');
  await expect(page.getByTestId('today-expenses')).toContainText('Кофе');
  await expect(page.getByRole('status')).toContainText('Кофе −3,50');
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByTestId('hero-amount')).toHaveText('54,55');
  await expect(page.getByTestId('today-expenses')).toHaveCount(0);

  // Long press → «В любимые» on an ordinary expense.
  await addExpense(page, '2');
  await page.getByTestId('operation').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'В любимые' }).click();
  await expect(page.getByTestId('favorites')).toContainText('Кафе');
  await page.screenshot({ path: test.info().outputPath('home.png') });

  // Settings keep only the app: the warning comes first, cancel keeps the data.
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByText('Доходы')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сбросить всё' }).click();
  await expect(page.getByText('Удалить все данные?')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await page.reload();
  await expect(page.getByTestId('hero-amount')).toHaveText('52,55');

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Сбросить всё' }).click();
  await page.getByRole('button', { name: 'Удалить всё' }).click();
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('dayly:data'), JSON.parse(localStorage.getItem('dayly:ui') ?? '{}').accent])).toEqual([null, 'amber']);
});
