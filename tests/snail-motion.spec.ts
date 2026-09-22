import { test, expect } from '@playwright/test';
import { SnailMotion } from '../src/snail-motion';

function advance(snail: SnailMotion, seconds: number, fps: number, proximity = 0, passive = true) {
  for (let i = 0; i < Math.round(seconds * fps); i++) snail.update(1 / fps, proximity, passive);
}

test('crawl distance is independent of frame rate and never snaps backward', () => {
  const distances = [30, 60, 120].map((fps) => {
    const snail = new SnailMotion();
    let previous = 0;
    for (let i = 0; i < fps * 40; i++) {
      snail.update(1 / fps, 0, true);
      expect(snail.travel).toBeGreaterThanOrEqual(previous);
      previous = snail.travel;
    }
    return snail.travel;
  });
  expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(0.001);
  expect(distances[1]).toBeGreaterThan(0.05);
  expect(distances[1]).toBeLessThan(0.16);
});

test('antennae withdraw first, locomotion stops, and emergence waits after the threat leaves', () => {
  const snail = new SnailMotion();
  advance(snail, 2, 60);
  advance(snail, 0.15, 60, 1);
  expect(snail.antennaRetraction).toBeGreaterThan(snail.retraction + 0.2);
  advance(snail, 2, 60, 1);
  expect(snail.retraction).toBeGreaterThan(0.95);
  expect(snail.crawl).toBeLessThan(0.001);
  const travel = snail.travel;
  advance(snail, 0.8, 60);
  expect(snail.retraction).toBeGreaterThan(0.7);
  expect(snail.travel - travel).toBeLessThan(0.001);
  advance(snail, 7, 60);
  expect(snail.retraction).toBeLessThan(0.06);
  expect(snail.antennaRetraction).toBeLessThan(0.03);
});

test('reduced motion freezes passive crawling while keeping explicit approach/retreat', () => {
  const snail = new SnailMotion();
  advance(snail, 3, 60);
  const { travel, gait, time } = snail;
  advance(snail, 3, 60, 1, false);
  expect(snail.retraction).toBeGreaterThan(0.95);
  expect([snail.travel, snail.gait, snail.time]).toEqual([travel, gait, time]);
  advance(snail, 10, 60, 0, false);
  expect(snail.retraction).toBeLessThan(0.03);
  expect([snail.travel, snail.gait, snail.time]).toEqual([travel, gait, time]);
});
