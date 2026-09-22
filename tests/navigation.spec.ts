import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { SceneNavigation, wheelZoom } from '../src/navigation';

test('dolly follows the subject after an orbit and pan, with safe distance limits', () => {
  const nav = new SceneNavigation();
  const base = new Vector3(2, 0.9, 3.3),
    subject = new Vector3(3, 0.2, 1.6);
  nav.rotate(-250, 80, 900);
  nav.offset.set(0.6, 0.2, -0.1);
  const far = base.clone(),
    target = subject.clone();
  nav.compose(far, target);
  nav.dolly(0.7);
  const near = base.clone(),
    nearTarget = subject.clone();
  nav.compose(near, nearTarget);
  expect(nearTarget.distanceTo(target)).toBeLessThan(1e-6);
  expect(near.distanceTo(target)).toBeLessThan(far.distanceTo(target) * 0.7);
  expect(near.clone().sub(target).normalize().dot(far.clone().sub(target).normalize())).toBeCloseTo(
    1,
    8,
  );
  for (let i = 0; i < 100; i++) {
    nav.dolly(1);
    nav.rotate(900, 900, 900);
  }
  nav.compose(near.copy(base), nearTarget.copy(subject));
  expect(near.distanceTo(nearTarget)).toBeGreaterThanOrEqual(0.8499);
  expect(near.toArray().every(Number.isFinite)).toBe(true);
});

test('pan scales with distance, reset restores framing, and wheel modes agree', () => {
  const nav = new SceneNavigation(),
    camera = new PerspectiveCamera(43, 1, 0.08, 70),
    target = new Vector3();
  camera.position.set(0, 0, 8);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  nav.pan(100, 50, camera, target, 800);
  const wide = nav.offset.length();
  nav.reset();
  camera.position.z = 2;
  camera.updateMatrixWorld();
  nav.pan(100, 50, camera, target, 800);
  expect(nav.offset.length()).toBeCloseTo(wide / 4, 6);
  nav.dolly(1);
  nav.rotate(100, 50, 800);
  nav.reset();
  expect([nav.zoom, nav.yaw, nav.pitch, ...nav.offset.toArray()]).toEqual([0, 0, 0, 0, 0, 0]);
  expect(wheelZoom(-99, 0)).toBe(wheelZoom(-3, 1));
  expect(wheelZoom(-100, 0)).toBeGreaterThan(0);
  expect(wheelZoom(100, 0)).toBeLessThan(0);
});
