import * as THREE from 'three/webgpu';
import { color, exp, uv, vec2 } from 'three/tsl';
import {
  ground,
  snailFootGeometry,
  snailHeadGeometry,
  snailMantleGeometry,
  snailShellGeometry,
} from './nature';
import type { makeDetailMaps } from './surfaces';
import { SnailMotion } from './snail-motion';

type Tentacle = {
  root: THREE.Group;
  geometry: THREE.BufferGeometry;
  eye?: THREE.Mesh;
  side: number;
  lower: boolean;
};

/** Small procedural soft-body rig with a terrain-conforming sole. */
export class GardenSnail {
  readonly root = new THREE.Group();
  readonly hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicNodeMaterial({ visible: false }),
  );
  readonly motion = new SnailMotion();
  readonly head = new THREE.Group();
  readonly tentacles: Tentacle[] = [];
  private readonly body = new THREE.Group();
  private readonly shell: THREE.Mesh;
  private readonly mantle: THREE.Mesh;
  private readonly foot: THREE.Mesh;
  private readonly footRest: Float32Array;
  private readonly contact: THREE.Mesh;
  private readonly contactRest: Float32Array;
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly scale = 0.68;

  constructor(detail: ReturnType<typeof makeDetailMaps>) {
    this.root.name = 'garden-snail';
    this.root.scale.setScalar(this.scale);
    const skin = new THREE.MeshPhysicalNodeMaterial({
      color: '#b3b6a0',
      map: detail.skinColor,
      roughness: 0.88,
      roughnessMap: detail.skinRoughness,
      bumpMap: detail.skinHeight,
      bumpScale: 0.012,
      specularIntensity: 0.3,
      clearcoat: 0.16,
      clearcoatRoughness: 0.38,
      clearcoatRoughnessMap: detail.skinRoughness,
      side: THREE.DoubleSide,
    });
    const footMat = skin.clone();
    footMat.color.set('#a6ab8d');
    footMat.clearcoat = 0.06;
    footMat.roughness = 0.98;
    this.foot = new THREE.Mesh(snailFootGeometry(), footMat);
    this.foot.name = 'snail-foot';
    this.footRest = new Float32Array(this.foot.geometry.attributes.position.array);
    (this.foot.geometry.attributes.position as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.root.add(this.foot, this.body);

    const shadow = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    shadow.colorNode = color('#09110b');
    shadow.opacityNode = exp(uv().sub(0.5).mul(2).pow(2).dot(vec2(1, 1)).mul(-3.5)).mul(0.48);
    const contactGeo = new THREE.PlaneGeometry(1.7, 0.54, 20, 6);
    contactGeo.rotateX(-Math.PI / 2);
    contactGeo.translate(0.14, 0, 0);
    this.contact = new THREE.Mesh(contactGeo, shadow);
    this.contact.name = 'snail-contact';
    this.contactRest = new Float32Array(contactGeo.attributes.position.array);
    (this.contact.geometry.attributes.position as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.root.add(this.contact);

    const shellMat = new THREE.MeshPhysicalNodeMaterial({
      map: detail.shellColor,
      bumpMap: detail.shellHeight,
      bumpScale: 0.016,
      roughnessMap: detail.shellRoughness,
      color: '#bfc1ae',
      roughness: 0.88,
      specularIntensity: 0.28,
      clearcoat: 0.17,
      clearcoatRoughness: 0.43,
      clearcoatRoughnessMap: detail.shellRoughness,
      side: THREE.DoubleSide,
    });
    this.shell = new THREE.Mesh(snailShellGeometry(), shellMat);
    this.shell.position.set(0.06, 0.3, -0.035);
    this.shell.scale.set(1.08, 1, 0.9);
    this.shell.rotation.z = -0.045;
    // The aperture's thin pale lip breaks the uniformly rounded last whorl.
    const p = this.shell.geometry.attributes.position;
    const rim: THREE.Vector3[] = [];
    for (let i = p.count - 31; i < p.count - 1; i++)
      rim.push(new THREE.Vector3().fromBufferAttribute(p, i));
    const lipMat = shellMat.clone();
    lipMat.color.set('#e3d0ac');
    lipMat.clearcoat = 0.08;
    this.shell.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 48, 0.005, 5, true),
        lipMat,
      ),
    );
    this.mantle = new THREE.Mesh(snailMantleGeometry(), skin);
    this.body.add(this.shell, this.mantle, this.head);
    const headSkin = new THREE.Mesh(snailHeadGeometry(), skin);
    headSkin.name = 'snail-head-skin';
    this.head.add(headSkin);
    const eyeMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#151b13',
      roughness: 0.28,
      clearcoat: 0.3,
    });
    for (const lower of [false, true])
      for (const side of [-1, 1]) {
        const geometry = this.tentacleGeometry();
        const root = new THREE.Group();
        root.position.set(
          lower ? -0.19 : -0.09,
          lower ? 0.045 : 0.13,
          side * (lower ? 0.08 : 0.065),
        );
        root.add(new THREE.Mesh(geometry, skin));
        const eye = lower
          ? undefined
          : new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), eyeMat);
        if (eye) root.add(eye);
        this.head.add(root);
        this.tentacles.push({ root, geometry, eye, side, lower });
      }
    this.hit.position.set(-0.1, 0.25, 0);
    this.root.add(this.hit);
    this.update(0, 0, false);
  }

  private tentacleGeometry() {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(13 * 9 * 3),
      coords = new Float32Array(13 * 9 * 2),
      indices: number[] = [];
    for (let i = 0; i <= 12; i++)
      for (let j = 0; j <= 8; j++) {
        const n = i * 9 + j;
        coords.set([j / 8, i / 12], n * 2);
        if (i < 12 && j < 8) indices.push(n, n + 9, n + 1, n + 1, n + 9, n + 10);
      }
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute('uv', new THREE.BufferAttribute(coords, 2));
    geometry.setIndex(indices);
    return geometry;
  }

  private poseTentacle(tentacle: Tentacle, index: number, passive: boolean) {
    const { side, lower, geometry, eye } = tentacle;
    const t = this.motion.time,
      retreat = this.motion.antennaRetraction;
    const scan = passive
      ? Math.sin(t * (0.47 + index * 0.071) + index * 2.1) * 0.65 +
        Math.sin(t * 0.19 + index) * 0.35
      : 0;
    const extension = Math.max(0.075, 1 - retreat * (lower ? 0.76 : 0.91));
    const length = (lower ? 0.15 : 0.31) * extension;
    const forward = (lower ? -0.95 : -0.46 - scan * 0.15) * length;
    const up = (lower ? 0.21 : 0.91 + scan * 0.08) * length;
    const spread = side * (lower ? 0.6 : 0.24 + scan * 0.15) * length;
    const bend = (lower ? 0.025 : 0.047) * extension * (0.5 + scan * 0.5);
    const positions = geometry.attributes.position;
    for (let ring = 0; ring <= 12; ring++) {
      const along = ring / 12;
      this.centre.set(
        forward * along - bend * along ** 2,
        up * along,
        spread * along + side * bend * along ** 2,
      );
      this.tangent
        .set(forward - 2 * bend * along, up, spread + side * 2 * bend * along)
        .normalize();
      this.across.set(0, 0, 1).cross(this.tangent).normalize();
      this.normal.crossVectors(this.tangent, this.across).normalize();
      const radius = (lower ? 0.009 : 0.016) * (1 - along * 0.68) * (0.65 + extension * 0.35);
      for (let sideIndex = 0; sideIndex <= 8; sideIndex++) {
        const angle = (sideIndex / 8) * Math.PI * 2;
        const a = Math.cos(angle) * radius,
          b = Math.sin(angle) * radius;
        positions.setXYZ(
          ring * 9 + sideIndex,
          this.centre.x + this.across.x * a + this.normal.x * b,
          this.centre.y + this.across.y * a + this.normal.y * b,
          this.centre.z + this.across.z * a + this.normal.z * b,
        );
      }
    }
    if (eye) {
      eye.position.copy(this.centre);
      eye.scale.setScalar(0.6 + extension * 0.4);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  private settle(geometry: THREE.BufferGeometry, rest: Float32Array, foot: boolean) {
    const positions = geometry.attributes.position;
    const yaw = this.root.rotation.y,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < positions.count; i++) {
      const x = rest[i * 3],
        y = rest[i * 3 + 1],
        z = rest[i * 3 + 2];
      const envelope = foot ? Math.sin(Math.PI * Math.min(1, Math.max(0, (x + 0.62) / 1.57))) : 0;
      const wave = Math.sin((x + 0.62) * 18 + this.motion.gait * 5) * this.motion.crawl * envelope;
      const shiftedX = x + wave * 0.009;
      const wx = this.root.position.x + (shiftedX * c + z * s) * this.scale;
      const wz = this.root.position.z + (z * c - shiftedX * s) * this.scale;
      const floor = (ground(wx, wz) - 0.055 - this.root.position.y) / this.scale;
      positions.setXYZ(i, shiftedX, floor + y + (foot ? Math.max(0, wave) * 0.005 : 0.003), z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  update(dt: number, proximity: number, passive: boolean) {
    this.motion.update(dt, proximity, passive);
    const { travel, retraction, time, gait, crawl } = this.motion;
    const yaw = -0.4 + travel * 0.3;
    this.root.rotation.y = yaw;
    this.root.position.set(3.1 - travel * Math.cos(yaw), 0, 1.62 + travel * Math.sin(yaw));
    this.root.position.y = ground(this.root.position.x, this.root.position.z) - 0.055;
    const front = ground(
      this.root.position.x - Math.cos(yaw) * 0.28,
      this.root.position.z + Math.sin(yaw) * 0.28,
    );
    const back = ground(
      this.root.position.x + Math.cos(yaw) * 0.28,
      this.root.position.z - Math.sin(yaw) * 0.28,
    );
    this.body.rotation.z = Math.atan2(back - front, 0.56);
    this.body.position.y =
      ((front + back) * 0.5 - ground(this.root.position.x, this.root.position.z)) / this.scale -
      0.012;
    this.head.position.set(-0.46 + retraction * 0.16, 0.125 - retraction * 0.025, 0);
    this.head.scale.set(1 - retraction * 0.42, 1 + retraction * 0.03, 1);
    this.head.rotation.y = passive ? Math.sin(time * 0.27) * 0.055 * (1 - retraction) : 0;
    this.mantle.scale.y = 1 + (passive ? Math.sin(time * 0.82) * 0.008 : 0);
    this.shell.rotation.z = -0.045 + Math.sin(gait * 2) * crawl * 0.004;
    this.tentacles.forEach((tentacle, i) => this.poseTentacle(tentacle, i, passive));
    this.settle(this.foot.geometry, this.footRest, true);
    this.settle(this.contact.geometry, this.contactRest, false);
  }
}
