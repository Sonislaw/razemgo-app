import { test, expect } from '@playwright/test';
import { mockMapTiles } from './map-fixtures.mjs';
test('the optional Google browser map loads above its background', async ({
  page,
  context,
}) => {
  await mockMapTiles(context);
  await page.goto('/razemgo-map.html');
  await page.evaluate(() =>
    window.RazemGoMap.receive({
      channel: 'razemgo-discovery-map-v1',
      token: 'qa',
      type: 'init',
      apiKey: 'qa-google-maps-browser-only',
      camera: { latitude: 52, longitude: 19, zoom: 5 },
    }),
  );
  const tile = page.locator('.google-map-canvas').first();
  await expect(tile).toBeVisible();
  await expect
    .poll(() => tile.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  await page.screenshot({ path: '.expo/discovery-map-render.png' });
});

test('single markers render every bundled transport image and clusters keep their number', async ({ page, context }) => {
  await mockMapTiles(context);
  await page.goto('/razemgo-map.html');
  await page.evaluate(() => {
    window.RazemGoMap.receive({
      channel: 'razemgo-discovery-map-v1', token: 'qa', type: 'init',
      apiKey: 'qa-google-maps-browser-only',
      camera: { latitude: 52, longitude: 19, zoom: 5 },
    });
  });
  await expect(page.locator('.google-map-canvas')).toBeVisible();
  await page.evaluate(() => {
    window.RazemGoMap.receive({
      channel: 'razemgo-discovery-map-v1', token: 'qa', type: 'points',
      points: ['Kamper', 'Van', 'Przyczepa', 'Samochód', 'Namiot', null].map((travelMode, i) => ({
        key: 'p:1:' + i, count: i === 5 ? 8 : 1,
        latitude: 54 - i, longitude: i % 2 ? 20.5 : 17.5,
        label: 'Wyjazd ' + i, travelMode,
      })),
    });
  });
  await expect(page.locator('.crew-pin img')).toHaveCount(5);
  for (const mode of ['Kamper', 'Van', 'Przyczepa', 'Samochód', 'Namiot']) {
    const image = page.locator(`.crew-pin img[data-travel-mode="${mode}"]`);
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/);
    const label = mode === 'Van' ? 'Kampervan' : mode;
    await expect(page.getByRole('button', { name: new RegExp(' · ' + label + '$') })).toBeVisible();
  }
  await expect(page.locator('.crew-cluster')).toHaveText('8');
  await expect(page.locator('.crew-cluster img')).toHaveCount(0);
  await page.screenshot({ path: '.expo/discovery-map-transport.png' });
});
