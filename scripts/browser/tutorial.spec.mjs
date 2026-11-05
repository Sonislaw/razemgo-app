import { test, expect } from '@playwright/test';
import { A, B, state, backend, login } from './trip-fixtures.mjs';
import { TAB_ITEMS } from '../../src/constants/navigation.ts';
const STEPS = [TAB_ITEMS[0], { name: 'notifications', label: 'Powiadomienia' }, ...TAB_ITEMS.slice(1)];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const offer = page => page.getByTestId('tutorial-offer');
const step = page => page.getByTestId('tutorial-step');
async function begin(page, store) {
  store.tutorialStates.delete(A);
  await backend(page.context(), store);
  await login(page);
  await expect(offer(page)).toBeVisible();
  await button(page, 'Pokaż').click();
}
async function assertStep(page, n, target) {
  await expect(step(page).getByText(`${n} z ${STEPS.length}`, { exact: true })).toBeVisible();
  await expect(step(page).getByRole('heading', { name: STEPS[n - 1].label, exact: true })).toBeVisible();
  await expect(button(page, 'Pomiń')).toBeVisible();
  if (target) {
    await expect(page.getByTestId('tutorial-spotlight')).toBeVisible();
    await expect.poll(async () => {
      const spotlight = await page.getByTestId('tutorial-spotlight').boundingBox();
      const actual = await (target === 'notifications'
        ? page.getByTestId('home-notifications-bell')
        : page.getByRole('tab', { name: STEPS[n - 1].label, exact: true })).boundingBox();
      const bubble = await step(page).boundingBox();
      const pointer = await page.getByTestId('tutorial-pointer').boundingBox();
      return !!spotlight && !!actual && !!bubble && !!pointer && actual.y >= 0 && actual.y + actual.height <= page.viewportSize().height
        && Math.abs(spotlight.y - actual.y) < 10
        && (target === 'notifications' ? bubble.y > actual.y + actual.height : bubble.y + bubble.height < actual.y)
        && pointer.x + pointer.width / 2 >= actual.x && pointer.x + pointer.width / 2 <= actual.x + actual.width;
    }).toBe(true);
    await expect(page.getByTestId(`tutorial-target-${target}`)).toBeVisible();
  }
}
for (const width of [320, 390]) test(`menu and bell bubbles, back and completion at ${width}px without any trips`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const store = state(); await begin(page, store);
  await assertStep(page, 1, 'index');
  await page.screenshot({ path: `.expo/tutorial-${width}-step1.png` });
  await button(page, 'Dalej').click(); await assertStep(page, 2, 'notifications');
  await button(page, 'Wstecz').click(); await assertStep(page, 1, 'index');
  for (let i = 1; i < STEPS.length; i++) {
    await button(page, 'Dalej').click(); await assertStep(page, i + 1, STEPS[i].name);
    await expect(page).toHaveURL('http://localhost:8085/');
    if (['notifications', 'messages'].includes(STEPS[i].name)) await page.screenshot({ path: `.expo/tutorial-${width}-${STEPS[i].name}.png` });
  }
  await page.screenshot({ path: `.expo/tutorial-${width}-step6.png` });
  await button(page, 'Gotowe').click();
  await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  await expect.poll(() => store.tutorialStates.get(A)).toBe('completed');
  await page.getByRole('tab', { name: 'Profil', exact: true }).click();
  await button(page, 'Edytuj profil').click(); await expect(page).toHaveURL(/\/edit-profile$/);
  await page.goto('/'); await expect(page.getByTestId('home-main')).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
});
test('skip is remembered and Settings can replay; skipping replay keeps completion', async ({ page }) => {
  const store = state(); store.tutorialStates.delete(A);
  await backend(page.context(), store); await login(page);
  await expect(offer(page)).toBeVisible(); await button(page, 'Pomiń').click();
  await expect.poll(() => store.tutorialStates.get(A)).toBe('skipped');
  await page.goto('/settings'); await button(page, 'Uruchom samouczek').click();
  await assertStep(page, 1, 'index');
  for (let i = 1; i < STEPS.length; i++) await button(page, 'Dalej').click();
  await button(page, 'Gotowe').click(); await expect.poll(() => store.tutorialStates.get(A)).toBe('completed');
  await page.goto('/settings'); await button(page, 'Uruchom samouczek').click();
  await button(page, 'Dalej').click(); await page.keyboard.press('Escape');
  await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  await expect.poll(() => store.tutorialSaveCalls?.length).toBe(3);
  expect(store.tutorialStates.get(A)).toBe('completed');
});
test('offline skipping closes immediately, survives reload and retries on reconnection', async ({ page }) => {
  const store = state(); await begin(page, store);
  store.failTutorialSave = true; await button(page, 'Pomiń').click();
  await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  await expect.poll(() => store.tutorialSaveCalls?.length).toBe(1);
  await page.reload(); await expect(page.getByTestId('home-main')).toBeVisible();
  await expect.poll(() => store.tutorialSaveCalls?.length).toBe(2);
  await expect(offer(page)).toHaveCount(0);
  store.failTutorialSave = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => store.tutorialStates.get(A)).toBe('skipped');
});
test('a second device respects the account decision; another account receives its own offer', async ({ page, browser }) => {
  const store = state(); await begin(page, store); await button(page, 'Pomiń').click();
  await expect.poll(() => store.tutorialStates.get(A)).toBe('skipped');
  const device = await browser.newContext();
  try {
    await backend(device, store); const other = await device.newPage();
    await login(other); await expect(other.getByTestId('home-main')).toBeVisible();
    await expect.poll(() => store.tutorialLoadCalls.length).toBeGreaterThanOrEqual(2);
    await expect(offer(other)).toHaveCount(0);
    store.tutorialStates.delete(B);
    await other.goto('/settings'); await button(other, 'Wyloguj się').click();
    await login(other, 'b@example.com'); await expect(offer(other)).toBeVisible();
    await button(other, 'Pomiń').click(); await expect.poll(() => store.tutorialStates.get(B)).toBe('skipped');
  } finally { await device.close(); }
});
test('an initial load failure leaves the app usable; a short viewport still exposes Skip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  const store = state(); store.tutorialStates.delete(A); store.failTutorialLoad = true;
  await backend(page.context(), store); await login(page);
  await expect(page.getByTestId('home-main')).toBeVisible(); await expect(offer(page)).toHaveCount(0);
  await page.goto('/settings'); await button(page, 'Uruchom samouczek').click();
  await expect(button(page, 'Pomiń')).toBeInViewport(); await expect(button(page, 'Dalej')).toBeInViewport();
  await button(page, 'Pomiń').click(); await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
});
test('the menu item stays highlighted when enlarged text leaves too little room for the whole description', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 400 });
  const store = state(); await begin(page, store);
  await assertStep(page, 1, 'index');
  // Simulate the taller native text layout produced by system font scaling.
  await page.addStyleTag({ content: '[data-testid="tutorial-step"] [role="heading"] { font-size: 36px !important; line-height: 48px !important; } [data-testid="tutorial-step"] [role="heading"] + div { font-size: 30px !important; line-height: 44px !important; }' });
  await expect(step(page).getByRole('heading')).toHaveCSS('font-size', '36px');
  await assertStep(page, 1, 'index');
  const panel = await step(page).boundingBox();
  const target = await page.getByTestId('tutorial-spotlight').boundingBox();
  expect(panel.y >= target.y + target.height || panel.y + panel.height <= target.y).toBe(true);
  await expect(button(page, 'Pomiń')).toBeInViewport();
  await expect(button(page, 'Dalej')).toBeInViewport();
  await page.screenshot({ path: '.expo/tutorial-large-text-first-step.png' });
});
test('the bell step reveals a previously scrolled header and remains usable after completing the tutorial', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  const store = state(); await begin(page, store);
  const offset = await page.getByTestId('home-main').evaluate(node => { node.scrollTop = node.scrollHeight; return node.scrollTop; });
  expect(offset).toBeGreaterThan(40);
  await button(page, 'Dalej').click(); await assertStep(page, 2, 'notifications');
  await expect.poll(() => page.getByTestId('home-main').evaluate(node => node.scrollTop)).toBe(0);
  await button(page, 'Dalej').click(); await assertStep(page, 3, 'explore');
  await button(page, 'Wstecz').click(); await assertStep(page, 2, 'notifications');
  await button(page, 'Pomiń').click();
  await page.getByTestId('home-notifications-bell').click();
  await expect(page.getByRole('button', { name: 'Zobacz wszystkie powiadomienia', exact: true })).toBeVisible();
});
