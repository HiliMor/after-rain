import * as THREE from 'three/webgpu';

/** Local copies of two CC0 scans. Color is sRGB; normals and ARM are linear data. */
export function loadNaturalSurfaces() {
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];
  function load(asset: string, channel: string, repeat: number, srgb = false) {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    pending.push(
      new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    const map = loader.load(
      `${import.meta.env.BASE_URL}textures/${asset}_${channel}.jpg`,
      () => resolve(),
      undefined,
      reject,
    );
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.anisotropy = 8;
    if (srgb) map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const maps = {
    barkColor: load('bark_brown_02', 'color', 2, true),
    barkNormal: load('bark_brown_02', 'normal', 2),
    barkArm: load('bark_brown_02', 'arm', 2),
    groundColor: load('forest_leaves_02', 'color', 14, true),
    groundNormal: load('forest_leaves_02', 'normal', 14),
    groundArm: load('forest_leaves_02', 'arm', 14),
  };
  return { maps, ready: Promise.all(pending) };
}

function hash(x: number, y: number) {
  let n = Math.imul(x + 1709, 374761393) ^ Math.imul(y + 2309, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(u: number, v: number, grid: number) {
  const x = u * grid,
    y = v * grid,
    ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix % grid, iy % grid),
    b = hash((ix + 1) % grid, iy % grid);
  const c = hash(ix % grid, (iy + 1) % grid),
    d = hash((ix + 1) % grid, (iy + 1) % grid);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function canvasMap(data: Uint8ClampedArray, size: number, srgb = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  pixels.data.set(data);
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/** Height and roughness are authored separately from pigmentation, never inferred from sRGB. */
export function makeDetailMaps() {
  const size = 512;
  const names = [
    'leafHeight',
    'leafRoughness',
    'capColor',
    'capHeight',
    'capRoughness',
    'skinColor',
    'skinHeight',
    'skinRoughness',
    'shellColor',
    'shellHeight',
    'shellRoughness',
    'grainHeight',
  ] as const;
  const buffers = Object.fromEntries(
    names.map((name) => [name, new Uint8ClampedArray(size * size * 4)]),
  ) as Record<(typeof names)[number], Uint8ClampedArray>;
  const put = (name: (typeof names)[number], i: number, r: number, g = r, b = r) => {
    const d = buffers[name];
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        i = (y * size + x) * 4;
      const broad = noise(u, v, 8),
        medium = noise(u, v, 32),
        fine = noise(u, v, 128),
        grain = hash(x, y);
      const patch = broad * 0.55 + medium * 0.3 + fine * 0.15;
      const veinPhase = (v - Math.abs(u - 0.5) * 0.38) * 16;
      const vein = Math.exp(-Math.pow(Math.sin(veinPhase * Math.PI), 2) * 160) * 0.12;
      const midrib = Math.exp(-Math.pow((u - 0.5) * 180, 2)) * 0.16;
      put('leafHeight', i, 95 + fine * 24 + medium * 10 + (vein + midrib) * 255);
      put('leafRoughness', i, 155 + broad * 75 + medium * 20 - vein * 60);
      const radialFiber = Math.pow(0.5 + 0.5 * Math.sin(u * 850 + broad * 8 + v * 6), 5);
      const paleEdge = Math.pow(v, 5),
        capShade = 1 - patch * 0.3 - radialFiber * 0.1;
      put(
        'capColor',
        i,
        (158 + paleEdge * 50) * capShade,
        (116 + paleEdge * 66) * capShade,
        (69 + paleEdge * 72) * capShade,
      );
      put('capHeight', i, 108 + radialFiber * 19 + medium * 16 + fine * 12 + grain * 3);
      put('capRoughness', i, 161 + broad * 54 + fine * 20);
      // A cellular skin relief, with valleys separating many small irregular cells.
      const sx = u * 86,
        sy = v * 58,
        cx = Math.floor(sx),
        cy = Math.floor(sy);
      let nearest = 10,
        second = 10;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = cx + dx + hash(cx + dx, cy + dy) * 0.8,
            py = cy + dy + hash(cx + dx + 83, cy + dy) * 0.8;
          const d = (sx - px) ** 2 + (sy - py) ** 2;
          if (d < nearest) {
            second = nearest;
            nearest = d;
          } else if (d < second) second = d;
        }
      const cell = Math.min(1, Math.max(0, (Math.sqrt(second) - Math.sqrt(nearest)) * 5));
      put('skinHeight', i, 92 + cell * 49 + fine * 13);
      put(
        'skinColor',
        i,
        91 + cell * 23 + broad * 30 + fine * 10,
        86 + cell * 21 + broad * 27 + fine * 8,
        64 + cell * 16 + broad * 24 + fine * 7,
      );
      put('skinRoughness', i, 117 + (1 - cell) * 46 + broad * 58);
      const growth = Math.pow(0.5 + 0.5 * Math.sin(u * 1200 + medium * 3), 5);
      const band = Math.pow(
        0.5 + 0.5 * Math.sin(v * Math.PI * 8 + broad * 0.55 + Math.sin(u * 17) * 0.18),
        6,
      );
      const weathering = Math.max(0, broad - 0.48) * 0.6;
      const shellShade = 0.92 + patch * 0.22 - band * 0.35 - growth * 0.075;
      put(
        'shellColor',
        i,
        161 * shellShade + medium * 12 + weathering * 36,
        123 * shellShade + medium * 9 + weathering * 48,
        79 * shellShade + medium * 7 + weathering * 46,
      );
      put('shellHeight', i, 103 + growth * 27 + fine * 10 + medium * 8);
      put('shellRoughness', i, 143 + broad * 61 + growth * 24 + weathering * 30);
      put('grainHeight', i, 98 + medium * 22 + fine * 34 + grain * 9);
    }
  return Object.fromEntries(
    names.map((name) => [name, canvasMap(buffers[name], size, name.endsWith('Color'))]),
  ) as Record<(typeof names)[number], THREE.CanvasTexture>;
}
