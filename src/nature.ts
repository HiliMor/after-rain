import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function random(seed = 921) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = random();
export const range = (a: number, b: number) => a + rand() * (b - a);
export function ground(x: number, z: number) {
  const shore = Math.min(1, Math.max(0, (Math.hypot(x / 2.35, (z - 1.1) / 1.55) - 0.83) * 2.3));
  return -0.13 + shore * (0.2 + 0.16 * Math.sin(x * 1.7 + z) + 0.09 * Math.cos(z * 2.7 - x));
}
export function outsidePool(x: number, z: number, margin = 1) {
  return Math.hypot(x / 2.35, (z - 1.1) / 1.55) > margin;
}

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  color = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const map = new THREE.CanvasTexture(canvas);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export function makeTextures() {
  const r = random(302);
  const leaf = canvasTexture(1024, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, '#1b362b');
    g.addColorStop(0.47, '#45693b');
    g.addColorStop(0.5, '#78934c');
    g.addColorStop(0.53, '#496e3c');
    g.addColorStop(1, '#183e2e');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 45000; i++) {
      c.fillStyle = r() > 0.5 ? '#c4d16c10' : '#072e2119';
      c.fillRect(r() * s, r() * s, r() * 4 + 1, r() * 6 + 1);
    }
    c.strokeStyle = '#adc07770';
    c.lineWidth = 3;
    for (let i = -3; i < 19; i++) {
      const y = i * 66;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(s / 2, y);
        c.bezierCurveTo(
          s / 2 + side * 100,
          y + 20,
          s / 2 + side * 320,
          y + 115,
          s / 2 + side * 520,
          y + 205,
        );
        c.stroke();
        c.lineWidth = 0.7;
        for (let k = 1; k < 8; k++) {
          const x = s / 2 + side * k * 60;
          const sy = y + k * 21;
          c.beginPath();
          c.moveTo(x, sy);
          c.lineTo(x + side * 70, sy - 35);
          c.stroke();
        }
        c.lineWidth = 3;
      }
    }
    c.strokeStyle = '#c1cd8a';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(512, 0);
    c.lineTo(512, s);
    c.stroke();
  });
  const bark = canvasTexture(1024, (c, s) => {
    c.fillStyle = '#443c33';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2700; i++) {
      const x = r() * s,
        y = r() * s;
      c.strokeStyle = `rgba(${r() > 0.5 ? '140,129,103' : '17,23,20'},${r() * 0.7})`;
      c.lineWidth = r() * 8 + 0.5;
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(
        x + r() * 30,
        y + 30,
        x - r() * 30,
        y + 80,
        x + r() * 20,
        y + 150 + r() * 200,
      );
      c.stroke();
    }
    for (let i = 0; i < 80; i++) {
      const x = r() * s,
        y = r() * s;
      c.fillStyle = '#b2b39e30';
      c.beginPath();
      c.ellipse(x, y, 5 + r() * 25, 3 + r() * 30, r() * 4, 0, Math.PI * 2);
      c.fill();
    }
  });
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  bark.repeat.set(2, 1);
  const earth = canvasTexture(512, (c, s) => {
    c.fillStyle = '#323d2d';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 24000; i++) {
      const v = Math.floor(r() * 55);
      c.fillStyle = `rgba(${25 + v},${30 + v},${20 + v * 0.7},.5)`;
      c.beginPath();
      c.ellipse(r() * s, r() * s, r() * 4, r() * 2, r() * 6, 0, 7);
      c.fill();
    }
  });
  earth.wrapS = earth.wrapT = THREE.RepeatWrapping;
  earth.repeat.set(9, 9);
  const shell = canvasTexture(512, (c, s) => {
    c.fillStyle = '#916346';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 380; i++) {
      c.fillStyle = i % 7 < 2 ? '#321f18a0' : '#deae7650';
      c.fillRect((i / 380) * s, 0, r() * 3 + 0.4, s);
    }
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#241a1277');
    g.addColorStop(0.35, '#ffdb9122');
    g.addColorStop(0.55, '#29170f88');
    g.addColorStop(0.7, '#d2ac7066');
    g.addColorStop(1, '#3f251388');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  shell.wrapS = shell.wrapT = THREE.RepeatWrapping;
  const cap = canvasTexture(512, (c, s) => {
    const g = c.createRadialGradient(256, 256, 10, 256, 256, 330);
    g.addColorStop(0, '#af875a');
    g.addColorStop(0.45, '#95724b');
    g.addColorStop(0.78, '#c0ac80');
    g.addColorStop(1, '#e2d0a6');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      c.strokeStyle = '#352d2519';
      c.lineWidth = r() * 1.5;
      const a = r() * Math.PI * 2;
      const d = r() * 250;
      c.beginPath();
      c.moveTo(256 + Math.cos(a) * d, 256 + Math.sin(a) * d);
      c.lineTo(256 + Math.cos(a) * (d + 70), 256 + Math.sin(a) * (d + 70));
      c.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = '#fff2cc19';
      c.fillRect(r() * s, r() * s, 1.5, 1.5);
    }
  });
  const glow = canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#fffef2ff');
    g.addColorStop(0.06, '#fff1cadd');
    g.addColorStop(0.18, '#f4d17855');
    g.addColorStop(0.45, '#d3a64e19');
    g.addColorStop(1, '#9b772c00');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  const mist = canvasTexture(256, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, '#aecddd00');
    g.addColorStop(0.4, '#aecddd66');
    g.addColorStop(0.55, '#aecddd88');
    g.addColorStop(1, '#aecddd00');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = 'destination-in';
    const v = c.createLinearGradient(0, 0, 0, s);
    v.addColorStop(0, '#fff0');
    v.addColorStop(0.25, '#ffff');
    v.addColorStop(0.8, '#fff6');
    v.addColorStop(1, '#fff0');
    c.fillStyle = v;
    c.fillRect(0, 0, s, s);
  });
  const env = canvasTexture(1024, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#7aafbe');
    g.addColorStop(0.3, '#324e69');
    g.addColorStop(0.52, '#182c36');
    g.addColorStop(1, '#06120f');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    const moon = c.createRadialGradient(680, 280, 1, 680, 280, 145);
    moon.addColorStop(0, '#e4f6ff');
    moon.addColorStop(0.15, '#adcfe7');
    moon.addColorStop(0.4, '#718ea880');
    moon.addColorStop(1, '#718ea800');
    c.fillStyle = moon;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 50; i++) {
      c.fillStyle = '#051b1a88';
      const x = r() * s;
      c.fillRect(x, 450, r() * 25 + 4, s);
    }
    c.fillStyle = '#d3e5ed';
    c.fillRect(550, 210, 10, 150);
    c.fillStyle = '#e2d7aa';
    c.fillRect(150, 430, 60, 25);
  });
  env.mapping = THREE.EquirectangularReflectionMapping;
  return { leaf, bark, earth, shell, cap, glow, mist, env };
}

export function tube(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  segments = 20,
) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false),
    material,
  );
}
export function leafGeometry(length: number, width: number, curl = 0.35, segments = 28) {
  const verts: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      w = Math.pow(Math.sin(Math.PI * t), 0.82) * width;
    for (let j = 0; j <= 8; j++) {
      const q = j / 4 - 1;
      verts.push(
        q * w * (1 + 0.025 * Math.sin(t * 90)),
        Math.sin(t * Math.PI) * curl - q * q * w * 0.22 - Math.pow(t, 5) * curl * 0.6,
        t * length,
      );
      uvs.push(j / 8, t);
      if (i < segments && j < 8) {
        const a = i * 9 + j;
        indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function mossBlade() {
  const g = new THREE.BufferGeometry();
  const v: number[] = [],
    uv: number[] = [],
    ids: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6,
      w = Math.sin(Math.PI * t) * 0.12;
    for (let j = 0; j < 3; j++) {
      v.push((j - 1) * w + t * t * 0.11, t, t * t * 0.35 + (j === 1 ? w * 0.5 : 0));
      uv.push(j / 2, t);
      if (i < 6 && j < 2) {
        const a = i * 3 + j;
        ids.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ids);
  g.computeVertexNormals();
  return g;
}
export function fernGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CatmullRomCurve3([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0.65, 0.2),
    new THREE.Vector3(0, 1.2, 0.8),
    new THREE.Vector3(0, 1.28, 1.6),
  ]);
  parts.push(new THREE.TubeGeometry(stem, 24, 0.012, 4));
  for (let i = 1; i < 17; i++) {
    const t = i / 18,
      p = stem.getPoint(t),
      l = Math.sin(t * Math.PI) * 0.65;
    for (const side of [-1, 1]) {
      const g = leafGeometry(l, l * 0.16, 0.06, 7);
      g.rotateY(side * 1.08);
      g.rotateX(-0.25);
      g.translate(p.x, p.y, p.z);
      parts.push(g);
    }
  }
  const result = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return result;
}
