import { test, expect } from '@playwright/test';
import { mockMapTiles } from './map-fixtures.mjs';
test('map tiles paint fully above the background', async ({
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
      camera: { latitude: 52, longitude: 19, zoom: 5 },
    }),
  );
  const tile = page.locator('.leaflet-tile-loaded').first();
  await expect(tile).toBeVisible();
  await expect
    .poll(() => tile.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  expect(
    await tile.evaluate((el) => el.complete && el.naturalWidth === 256),
  ).toBe(true);
  await page.screenshot({ path: '.expo/discovery-map-render.png' });
});
