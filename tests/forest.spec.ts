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
  await page.getByRole('button', { name: 'Release the drop' }).click();
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
  expect((await state(page)).renderProfile.depthOfField).toBe(false);
  expect((await state(page)).renderProfile.reflectionScale).toBe(0);
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
  expect((await state(page)).renderProfile.reflectionScale).toBe(0);
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});

test('WebGL fallback: renders and releases water', async ({ page }) => {
  const errors = captureErrors(page);
  await ready(page, '/?webgl=1');
  expect((await state(page)).backend).toBe('WebGL 2');
  await page.getByRole('button', { name: 'Release the drop' }).click();
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
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(0.3);
  await page.keyboard.press('-');
  await expect.poll(async () => (await state(page)).zoom).toBeLessThan(0.25);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).zoom).toBeLessThan(0.05);
  await page.locator('#about-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('dragging swings the view without moving the light, and reset restores it', async ({
  page,
}) => {
  await ready(page);
  await page.mouse.move(900, 500);
  const light = (await state(page)).lightPosition;
  expect((await state(page)).orbit).toEqual([0, 0]);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(900 - i * 14, 500 - i * 3);
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await state(page)).orbit[0])).toBeGreaterThan(0.2);
  expect((await state(page)).orbit[1]).not.toBe(0);
  // A held button means looking around, so the carried light stays where it was. It is
  // still easing toward its target, so allow for that rather than an exact match.
  const moved = (await state(page)).lightPosition.map((v: number, i: number) =>
    Math.abs(v - light[i]),
  );
  expect(Math.max(...moved)).toBeLessThan(0.05);
  await page.keyboard.press('Escape');
  await expect.poll(async () => Math.abs((await state(page)).orbit[0])).toBeLessThan(0.02);
});

test('a click that does not drag still reaches the scene', async ({ page }) => {
  await ready(page);
  const leaf = (await state(page)).leafScreen;
  const box = page.viewportSize()!;
  const x = ((leaf[0] + 1) / 2) * box.width,
    y = ((1 - leaf[1]) / 2) * box.height;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).dropBusy).toBe(true);
  expect(Math.abs((await state(page)).orbit[0])).toBeLessThan(0.02);
});

test('interface blocks do not collide on short or awkward windows', async ({ page }) => {
  const errors = captureErrors(page);
  // The headline was sized from viewport width alone, so a short window let it run down
  // into the footer and overlap the location caption.
  for (const [width, height] of [
    [1440, 620],
    [1024, 560],
    [844, 390],
    [1280, 700],
    [320, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await ready(page);
    const collisions = await page.evaluate(() => {
      const pick = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box && box.width > 0 && box.height > 0 ? box : null;
      };
      const boxes: Record<string, DOMRect | null> = {
        intro: pick('.intro'),
        location: pick('.location'),
        interactions: pick('.interactions'),
        hint: pick('.gesture-hint'),
        topbar: pick('.topbar'),
      };
      const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
        !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const names = Object.keys(boxes),
        found: string[] = [];
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++)
          if (overlaps(boxes[names[i]], boxes[names[j]])) found.push(`${names[i]}/${names[j]}`);
      return found;
    });
    expect(collisions, `${width}x${height}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('resizing switches render passes without breaking water interaction', async ({ page }) => {
  const errors = captureErrors(page);
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await state(page)).renderProfile.reflectionScale).toBe(0);
  expect((await state(page)).renderProfile.depthOfField).toBe(false);
  await page.getByRole('button', { name: 'Release the drop' }).click();
  await expect.poll(async () => (await state(page)).rippleAge).toBeLessThan(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () => (await state(page)).renderProfile.reflectionScale)
    .toBeGreaterThan(0);
  const water = await point(page, 'waterScreen');
  await page.mouse.click(water.x, water.y);
  await expect.poll(async () => (await state(page)).touchAge).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('a wheel notch means the same in pixel and line delta modes', async ({ page }) => {
  await ready(page);
  await page.mouse.move(760, 460);
  // Chrome reports pixels; Firefox reports lines for the same physical notch.
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(0.4);
  const pixelMode = (await state(page)).zoom;
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).zoom).toBeLessThan(0.05);
  await page.evaluate(() => {
    const target = document.querySelector('canvas')!.parentElement!;
    for (let i = 0; i < 3; i++)
      target.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true }),
      );
  });
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(0.4);
  expect(Math.abs((await state(page)).zoom - pixelMode)).toBeLessThan(0.06);
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
