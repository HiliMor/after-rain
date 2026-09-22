import { test, expect } from '@playwright/test';
import { FrameBudget, renderProfile } from '../src/quality';

function frames(budget: FrameBudget, count: number, seconds: number) {
  for (let i = 0; i < count; i++) budget.sample(seconds);
}

test('sustained 44 fps reduces expensive passes; 60 fps and occasional hitches do not', () => {
  const slow = new FrameBudget();
  frames(slow, 290, 1 / 44);
  expect(slow.level).toBe(1);
  const reduced = renderProfile(2560, 1440, 2, false, slow.level);
  expect(reduced.depthOfField).toBe(false);
  expect(reduced.reflectionScale).toBe(0.4);
  frames(slow, 290, 1 / 44);
  expect(slow.level).toBe(2);
  expect(renderProfile(2560, 1440, 2, false, slow.level).reflectionScale).toBe(0);

  const smooth = new FrameBudget();
  for (let i = 0; i < 900; i++) smooth.sample(i % 120 === 0 ? 0.09 : 1 / 60);
  expect(smooth.level).toBe(0);
});

test('resuming a tab and isolated compilation stalls do not lower quality', () => {
  const budget = new FrameBudget();
  frames(budget, 200, 1 / 44);
  budget.sample(4);
  frames(budget, 240, 1 / 60);
  expect(budget.level).toBe(0);
  budget.reset();
  frames(budget, 120, 1 / 30);
  expect(budget.level).toBe(0);
});

test('profiles cap large drawing buffers and keep touch layouts light in either orientation', () => {
  for (const level of [0, 1, 2]) {
    const profile = renderProfile(3840, 2160, 2, false, level);
    expect(3840 * 2160 * profile.pixelRatio ** 2).toBeLessThanOrEqual(3_200_001);
  }
  for (const [w, h] of [
    [390, 844],
    [844, 390],
  ]) {
    const profile = renderProfile(w, h, 3, true, 0);
    expect(profile.reflectionScale).toBe(0);
    expect(profile.depthOfField).toBe(false);
    expect(profile.pixelRatio).toBeLessThanOrEqual(1.05);
  }
});
