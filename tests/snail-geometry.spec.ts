import { test, expect } from '@playwright/test';
import * as THREE from 'three/webgpu';
import { GardenSnail } from '../src/snail';
import { ground } from '../src/nature';
import type { makeDetailMaps } from '../src/surfaces';

test('the sole follows the bank and soft tentacles stay finite while crawling and withdrawing', () => {
  // Geometry-only fixture: the maps are never uploaded or sampled by a renderer here.
  const map = new THREE.CanvasTexture(null);
  const maps = Object.fromEntries(
    ['skinColor', 'skinHeight', 'skinRoughness', 'shellColor', 'shellHeight', 'shellRoughness'].map(
      (name) => [name, map],
    ),
  ) as ReturnType<typeof makeDetailMaps>;
  const snail = new GardenSnail(maps);
  for (const proximity of [0, 1, 0]) {
    for (let i = 0; i < (proximity === 0 ? 4000 : 400); i++) snail.update(0.1, proximity, true);
    snail.root.updateMatrixWorld(true);
    const foot = snail.root.getObjectByName('snail-foot') as THREE.Mesh;
    const positions = foot.geometry.attributes.position,
      uvs = foot.geometry.attributes.uv;
    let maxGap = 0;
    for (let i = 0; i < positions.count; i++) {
      if (uvs.getY(i) > 0.001 && uvs.getY(i) < 0.999) continue;
      const p = foot.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
      maxGap = Math.max(maxGap, Math.abs(p.y - (ground(p.x, p.z) - 0.055)));
    }
    expect(maxGap).toBeLessThan(0.025);
    const head = snail.root.getObjectByName('snail-head-skin') as THREE.Mesh;
    const headBounds = new THREE.Box3().setFromObject(head, true);
    expect(headBounds.min.y).toBeGreaterThan(-0.027);
    for (const tentacle of snail.tentacles) {
      expect(Array.from(tentacle.geometry.attributes.position.array).every(Number.isFinite)).toBe(
        true,
      );
      expect(Array.from(tentacle.geometry.attributes.normal.array).every(Number.isFinite)).toBe(
        true,
      );
    }
  }
});
