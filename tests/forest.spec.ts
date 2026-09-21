import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.evaluate(() => (window as any).__afterRain.state());
async function ready(page: Page, path = '/') {
  await page.goto(path);
  await expect.poll(async () => (await state(page))?.ready).toBe(true);
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('#error')).toBeHidden();
}
async function point(page: Page, name: string) {
  const p = (await state(page))[name],
    v = page.viewportSize()!;
  return { x: (p[0] * 0.5 + 0.5) * v.width, y: (-p[1] * 0.5 + 0.5) * v.height };
}
function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('desktop: light, drop, leaf hit, snail, sound, notes and zoom work without runtime errors', async ({
  page,
}) => {
  const errors = captureErrors(page);
  await ready(page);
  expect((await state(page)).backend).toBe('WebGPU');
  await page.screenshot({ path: 'work/desktop-final.png' });
  const before = (await state(page)).lightPosition;
  await page.mouse.move(950, 700);
  await expect.poll(async () => (await state(page)).lightPosition).not.toEqual(before);
  const water = await point(page, 'waterScreen');
  await page.mouse.click(water.x, water.y);
  await expect.poll(async () => (await state(page)).touchAge).toBeLessThan(1);
  await page.getByRole('button', { name: 'Change camera view' }).click();
  await expect.poll(async () => (await state(page)).viewIndex).toBe(1);
  await page.getByRole('button', { name: 'Change camera view' }).click();
  await expect.poll(async () => (await state(page)).viewIndex).toBe(2);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect.poll(async () => (await state(page)).viewIndex).toBe(0);
  await page.getByRole('button', { name: 'Let it rain' }).click();
  await expect.poll(async () => (await state(page)).dropBusy).toBe(true);
  await expect.poll(async () => (await state(page)).dropVisible).toBe(false);
  await expect.poll(async () => (await state(page)).rippleAge).toBeLessThan(1);
  await page.screenshot({ path: 'work/ripple-final.png' });
  await expect.poll(async () => (await state(page)).dropBusy).toBe(false);
  const leaf = await point(page, 'leafScreen');
  await page.mouse.click(leaf.x, leaf.y);
  await expect.poll(async () => (await state(page)).dropBusy).toBe(true);
  await page.getByRole('button', { name: 'A quiet neighbour' }).click();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: 'work/snail-final.png' });
  const snail = await point(page, 'snailScreen');
  await page.mouse.move(snail.x, snail.y);
  await expect.poll(async () => (await state(page)).snailRetraction).toBeGreaterThan(0.5);
  await page.mouse.move(100, 650);
  await expect
    .poll(async () => (await state(page)).snailRetraction, { timeout: 16000 })
    .toBeLessThan(0.25);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('body')).not.toHaveClass('exploring');
  await page.getByRole('button', { name: 'Turn forest sound on' }).click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Turn forest sound off' }).click();
  await page.getByRole('button', { name: 'Field notes' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, 420);
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(0.4);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).zoom).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('mobile: touch the leaf, drag light, pinch and resize', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage(),
    errors = captureErrors(page);
  await ready(page);
  await page.screenshot({ path: 'work/mobile-final.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(
    await page.evaluate(() => document.querySelector('canvas')!.getBoundingClientRect().width),
  ).toBe(390);
  const leaf = await point(page, 'leafScreen');
  await page.touchscreen.tap(leaf.x, leaf.y);
  await expect.poll(async () => (await state(page)).dropBusy).toBe(true);
  await expect.poll(async () => (await state(page)).rippleAge).toBeLessThan(1);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 150, y: 550 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 250, y: 590 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const light = (await state(page)).lightPosition;
  expect(light).not.toEqual([0.3, 0.45, 1.7]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 120, y: 510 },
      { x: 230, y: 510 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 110, y: 510 },
      { x: 240, y: 510 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 65, y: 510 },
      { x: 285, y: 510 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(0.2);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});

test('WebGL fallback: renders and releases water', async ({ page }) => {
  const errors = captureErrors(page);
  await ready(page, '/?webgl=1');
  expect((await state(page)).backend).toBe('WebGL 2');
  await page.getByRole('button', { name: 'Let it rain' }).click();
  await expect.poll(async () => (await state(page)).rippleAge).toBeLessThan(1);
  await page.screenshot({ path: 'work/webgl-final.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('reduced motion and keyboard alternatives stay usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect((await state(page)).reducedMotion).toBe(true);
  const light = (await state(page)).lightPosition;
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).lightPosition).not.toEqual(light);
  await page.locator('#light-button').click();
  expect((await state(page)).lightEnabled).toBe(false);
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).lightEnabled).toBe(true);
  await expect(page.locator('#light-button')).toHaveClass(/active/);
  await page.locator('#drop-button').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).rippleAge).toBeLessThan(1);
  await page.locator('#about-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('unsupported renderer shows an actionable readable state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: any[]) {
      if (args[0] === 'webgl2' || args[0] === 'webgl') return null;
      return (original as any).apply(this, args);
    } as any;
  });
  await page.goto('/');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
