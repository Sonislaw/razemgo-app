import { test, expect } from '@playwright/test';
import { state, backend, login } from './trip-fixtures.mjs';

async function capture(page) {
  await page.evaluate(() => {
    window.__stopSheetCapture?.();
    window.__sheetFrames = [];
    let frame;
    const record = () => {
      const backdrop = [...document.querySelectorAll('[data-testid="sheet-backdrop"]')].at(-1);
      const surface = [...document.querySelectorAll('[data-testid="sheet-surface"]')].at(-1);
      if (backdrop && surface && surface.getBoundingClientRect().height) {
        const rect = backdrop.getBoundingClientRect(), style = getComputedStyle(surface);
        window.__sheetFrames.push({opacity:Number(getComputedStyle(backdrop).opacity),
          translateY:style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m42,
          surfaceOpacity:Number(style.opacity),height:surface.getBoundingClientRect().height,
          backdropTop:rect.top,backdropHeight:rect.height,viewportHeight:innerHeight});
      }
      frame = requestAnimationFrame(record);
    };
    frame = requestAnimationFrame(record);
    window.__stopSheetCapture = () => cancelAnimationFrame(frame);
  });
}

async function settled(page) {
  const surface = page.getByTestId('sheet-surface').last();
  await expect(surface).toBeInViewport();
  await expect.poll(() => surface.evaluate(el => {
    const transform = getComputedStyle(el).transform;
    return transform === 'none' ? 0 : Math.abs(new DOMMatrixReadOnly(transform).m42);
  })).toBeLessThan(0.1);
  return page.evaluate(() => {
    window.__stopSheetCapture();
    return window.__sheetFrames;
  });
}

function expectSeparateMotion(frames) {
  const fading = frames.filter(frame => frame.opacity > 0 && frame.opacity < 0.999);
  const moving = frames.filter(frame => frame.translateY > 1 && frame.translateY < frame.height - 1);
  expect(fading.length).toBeGreaterThan(0);
  expect(moving.length).toBeGreaterThan(0);
  for (const frame of fading) expect(frame.translateY).toBeGreaterThanOrEqual(frame.height - 1);
  for (const frame of moving) expect(frame.opacity).toBe(1);
  for (const frame of frames) {
    expect(Math.abs(frame.backdropTop)).toBeLessThan(1);
    expect(frame.backdropHeight).toBeCloseTo(frame.viewportHeight,0);
    expect(frame.surfaceOpacity).toBe(1);
  }
}

for (const width of [320,390]) test(`backdrop stays fixed and fades before panels, filters and nested calendar at ${width}px`, async ({page,context}) => {
  await page.setViewportSize({width,height:844});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await backend(context,state()); await login(page); await page.goto('/explore');
  await capture(page);
  await page.getByRole('button',{name:'Zapisane · 0',exact:true}).click();
  expectSeparateMotion(await settled(page));
  await page.getByRole('button',{name:'Zamknij',exact:true}).click();
  await expect(page.getByTestId('sheet-surface')).toHaveCount(0);

  await capture(page);
  await page.getByRole('button',{name:'Otwórz filtry',exact:true}).click();
  expectSeparateMotion(await settled(page));
  await capture(page);
  await page.getByRole('button',{name:'Wybierz zakres dat',exact:true}).click();
  expectSeparateMotion(await settled(page));
  await page.getByRole('button',{name:'Zamknij wybór dat bez zmian',exact:true}).click();
  await expect(page.getByTestId('sheet-surface')).toHaveCount(1);
  await page.getByRole('button',{name:'Zamknij filtry bez zmian',exact:true}).click();
  await expect(page.getByTestId('sheet-surface')).toHaveCount(0);

  await page.getByRole('button',{name:'Zapisane · 0',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sheet-surface')).toHaveCount(0);
  await page.getByRole('button',{name:'Zapisane · 0',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Zapisane filtry wyjazdów',exact:true})).toBeInViewport();
  expect(errors).toEqual([]);
});

test('reduced motion shows the panel and backdrop without intermediate animation frames', async ({page,context}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await backend(context,state()); await login(page); await page.goto('/explore');
  await capture(page);
  await page.getByRole('button',{name:'Zapisane · 0',exact:true}).click();
  const frames = await settled(page);
  for (const frame of frames) {
    expect([0,1]).toContain(frame.opacity);
    if (frame.opacity === 1) expect(Math.abs(frame.translateY)).toBeLessThan(0.1);
  }
  await page.getByRole('button',{name:'Zamknij',exact:true}).click();
  await expect(page.getByTestId('sheet-surface')).toHaveCount(0);
});
