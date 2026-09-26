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
  await page.getByRole('button', { name: 'Добавить' }).click();
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
  expect(manifest).toMatchObject({ short_name: 'Dayly', display: 'standalone', start_url: '/' });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(BASE);
  const persisted = await page.evaluate(() => navigator.storage.persisted());
  console.log('manifest:', manifest.name, '| service worker scope:', scope, '| storage.persisted():', persisted);
});
