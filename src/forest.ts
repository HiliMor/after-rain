import * as THREE from 'three/webgpu';
import {
  color,
  uniform,
  positionWorld,
  positionLocal,
  distance,
  sin,
  cos,
  exp,
  float,
  vec2,
  vec3,
  mix,
  smoothstep,
  pass,
  reflector,
  screenUV,
  materialOpacity,
  add,
  nodeObject,
  uv,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { loadNaturalSurfaces, makeDetailMaps } from './surfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeTextures,
  ground,
  outsidePool,
  range,
  rand,
  leafGeometry,
  mossBlade,
  mossShoot,
  snailHeadGeometry,
  snailMantleGeometry,
  snailShellGeometry,
  snailFootGeometry,
  waterDropGeometry,
  fernGeometry,
  tube,
} from './nature';

export type ForestEvents = {
  onReady: (backend: string) => void;
  onDrop: () => void;
  onDiscovery: () => void;
  onError: (error: unknown) => void;
};
type Ripple = {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicNodeMaterial>;
  born: number;
  delay: number;
};
const UP = new THREE.Vector3(0, 1, 0);

export class Forest {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.08, 70);
  readonly renderer: THREE.WebGPURenderer;
  readonly raycaster = new THREE.Raycaster();
  readonly pointer = new THREE.Vector2(0.2, -0.1);
  readonly textures = makeTextures();
  private readonly naturalSurfaces = loadNaturalSurfaces();
  private readonly detail = makeDetailMaps();
  readonly lightPosition = uniform(new THREE.Vector3(0.3, 0.4, 2));
  readonly time = uniform(0);
  readonly waveCenter = uniform(new THREE.Vector3(0.3, 0, 1));
  readonly waveTime = uniform(-50);
  readonly rippleCenter = uniform(new THREE.Vector2(1, 1));
  readonly rippleTime = uniform(-50);
  readonly motion = uniform(1);
  readonly focusDistance = uniform(7.8);
  private pipeline!: THREE.RenderPipeline;
  private keyShadow?: THREE.LightShadow;
  private heroLeaf = new THREE.Group();
  private heroMesh!: THREE.Mesh;
  private heroDrop!: THREE.Mesh;
  private fallingDrop!: THREE.Mesh;
  private runningDrop!: THREE.Mesh;
  private dripTrail!: THREE.Mesh;
  private dripBeads!: THREE.InstancedMesh;
  private dripProgress = uniform(0);
  private dropPosition = new THREE.Vector3();
  private dropStarted = -100;
  private impactDone = true;
  private rippleRings: Ripple[] = [];
  private splash: THREE.Mesh[] = [];
  private floatingLeaf!: THREE.Group;
  private snail = new THREE.Group();
  private snailHead = new THREE.Group();
  private tentacles: THREE.Group[] = [];
  private snailHit!: THREE.Mesh;
  private snailRetraction = 0;
  private snailDiscovered = false;
  private snailFocusUntil = 0;
  private snailReveal = 0;
  private firefly = new THREE.Group();
  private pointerLight = new THREE.PointLight(0xffdc8d, 3, 5.5, 2);
  private guideLight = new THREE.PointLight(0xffce72, 1.3, 4, 2);
  private fireflyWing!: THREE.Mesh;
  private stars!: THREE.InstancedMesh;
  private trees!: THREE.InstancedMesh;
  private vegetation: THREE.Object3D[] = [];
  private dustData: { pos: THREE.Vector3; seed: number; size: number }[] = [];
  private targetLight = new THREE.Vector3(0.3, 0.45, 1.7);
  private lookAt = new THREE.Vector3(0.4, 1.35, 0);
  private frame = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private zoom = 0;
  private currentZoom = 0;
  private gesture = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pointerStart = { x: 0, y: 0 };
  private hover = false;
  private snailHovered = false;
  private visible = true;
  private ready = false;
  private disposal = new AbortController();
  private dummy = new THREE.Object3D();
  private label = document.querySelector<HTMLElement>('#world-label')!;
  private cursor = document.querySelector<HTMLElement>('#cursor')!;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private quality = 1;
  private slowFrames = 0;
  private adjustedQuality = false;
  private mobile = innerWidth < 680;
  lightEnabled = true;

  constructor(
    private container: HTMLElement,
    private events: ForestEvents,
  ) {
    const forceWebGL = new URLSearchParams(location.search).has('webgl');
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: false,
      forceWebGL,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.35 : 1.65));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#0d2330');
    this.scene.fog = new THREE.FogExp2('#0d2330', 0.057);
    this.scene.environment = this.textures.env;
    this.scene.environmentIntensity = 0.65;
    this.motion.value = this.reducedMotion.matches ? 0 : 1;
    this.buildLighting();
    this.buildTerrain();
    this.buildMoss();
    this.buildPlants();
    this.buildBark();
    this.buildMushrooms();
    this.buildHero();
    this.buildWater();
    this.buildSnail();
    this.buildAtmosphere();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (
        material instanceof THREE.MeshStandardNodeMaterial &&
        !(material instanceof THREE.MeshPhysicalNodeMaterial && material.transmission > 0)
      ) {
        object.receiveShadow = true;
        object.castShadow =
          !(object instanceof THREE.InstancedMesh) && material.name !== 'pool-water';
      }
    });
    this.resize();
    this.bindEvents();
  }

  async start() {
    try {
      await this.naturalSurfaces.ready;
      await this.renderer.init();
      const scenePass = pass(this.scene, this.camera);
      const output = scenePass.getTextureNode('output');
      this.pipeline = new THREE.RenderPipeline(this.renderer);
      // The r186 addon declares an untyped TempNode; its implementation returns vec4.
      const focused = this.mobile
        ? output
        : (nodeObject(
            dof(output, scenePass.getViewZNode(), this.focusDistance, 3.4, 0.65),
          ) as unknown as THREE.Node<'vec4'>);
      this.pipeline.outputNode = add(focused, bloom(output, 0.16, 0.4, 1.25));
      this.camera.position.set(
        this.mobile ? 1.6 : 0.1,
        this.mobile ? 2.9 : 2.65,
        this.mobile ? 10.1 : 8.6,
      );
      this.camera.lookAt(this.mobile ? 0.65 : 0.4, 1.45, 0.2);
      this.pipeline.render();
      this.ready = true;
      this.renderer.setAnimationLoop(this.animate);
      const backend = 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2';
      this.events.onReady(backend);
    } catch (error) {
      this.events.onError(error);
    }
  }

  private buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0x9bbcc8, 0x343d22, 1.85));
    const moon = new THREE.DirectionalLight(0xa7d2ed, 2.15);
    moon.position.set(-3, 7, -5);
    this.scene.add(moon);
    const front = new THREE.DirectionalLight(0xc4d6bb, 1.65);
    front.position.set(-2.5, 6, 5);
    front.castShadow = true;
    front.shadow.mapSize.setScalar(this.mobile ? 1024 : 2048);
    Object.assign(front.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
      near: 0.5,
      far: 22,
    });
    front.shadow.normalBias = 0.025;
    front.shadow.bias = -0.0002;
    front.shadow.radius = 3;
    front.shadow.autoUpdate = false;
    front.shadow.needsUpdate = true;
    this.keyShadow = front.shadow;
    this.scene.add(front);
    const rim = new THREE.PointLight(0x67bcb4, 6, 12, 2);
    rim.position.set(0, 3, -2.8);
    this.scene.add(rim);
    this.pointerLight.position.copy(this.targetLight);
    this.scene.add(this.pointerLight);
    this.scene.add(this.guideLight);
  }

  private buildTerrain() {
    const terrain = new THREE.PlaneGeometry(42, 42, 180, 180);
    terrain.rotateX(-Math.PI / 2);
    const p = terrain.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) - 0.055);
    terrain.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({
      color: '#8b9a72',
      map: this.naturalSurfaces.maps.groundColor,
      normalMap: this.naturalSurfaces.maps.groundNormal,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: this.naturalSurfaces.maps.groundArm,
      aoMap: this.naturalSurfaces.maps.groundArm,
      aoMapIntensity: 0.85,
      roughness: 1,
    });
    this.scene.add(new THREE.Mesh(terrain, mat));
    const pebbleMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#85816c',
      roughness: 0.87,
      roughnessMap: this.detail.leafRoughness,
      bumpMap: this.detail.grainHeight,
      bumpScale: 0.027,
      specularIntensity: 0.3,
      clearcoat: 0.04,
      clearcoatRoughness: 0.6,
    });
    const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), pebbleMat, 190);
    for (let i = 0; i < 190; i++) {
      const a = range(0, Math.PI * 2),
        r = range(0.98, 1.16),
        x = Math.cos(a) * 2.35 * r,
        z = 1.1 + Math.sin(a) * 1.55 * r;
      this.dummy.position.set(x, ground(x, z) - 0.025, z);
      this.dummy.scale.set(range(0.045, 0.14), range(0.045, 0.085), range(0.06, 0.2));
      this.dummy.rotation.set(rand() * 3, rand() * 6, rand() * 3);
      this.dummy.updateMatrix();
      pebbles.setMatrixAt(i, this.dummy.matrix);
      pebbles.setColorAt(i, new THREE.Color().setHSL(range(0.12, 0.2), 0.11, range(0.16, 0.36)));
    }
    this.scene.add(pebbles);
    const treeMat = new THREE.MeshStandardNodeMaterial({
      color: '#233938',
      map: this.naturalSurfaces.maps.barkColor,
      normalMap: this.naturalSurfaces.maps.barkNormal,
      roughness: 0.9,
    });
    this.trees = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.3, 0.65, 18, 9, 4),
      treeMat,
      55,
    );
    for (let i = 0; i < 55; i++) {
      this.dummy.position.set(range(-20, 20), 7, range(-28, -7));
      this.dummy.scale.set(range(0.3, 1.5), range(0.7, 1.3), range(0.3, 1.4));
      this.dummy.rotation.set(range(-0.14, 0.14), rand() * 6, range(-0.12, 0.12));
      this.dummy.updateMatrix();
      this.trees.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(this.trees);
  }

  private buildMoss() {
    const mat = new THREE.MeshPhysicalNodeMaterial({
      color: '#aabc77',
      roughness: 0.95,
      roughnessMap: this.detail.leafRoughness,
      bumpMap: this.detail.leafHeight,
      bumpScale: 0.006,
      metalness: 0,
      specularIntensity: 0.17,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    mat.colorNode = color('#a9b882').mul(mix(0.38, 1, uv().y));
    const d = distance(positionWorld.xz, this.lightPosition.xz);
    const waveD = distance(positionWorld.xz, this.waveCenter.xz);
    const age = this.time.sub(this.waveTime);
    const wave = exp(waveD.sub(age.mul(1.5)).pow(2).mul(-4))
      .mul(exp(age.mul(-0.75)))
      .mul(0.36);
    mat.emissiveNode = color('#6fa772').mul(exp(d.mul(-1.6)).mul(0.12).add(wave));
    mat.positionNode = positionLocal.add(
      vec3(
        sin(this.time.mul(0.65).add(positionLocal.y.mul(2)))
          .mul(positionLocal.y.pow(2))
          .mul(0.025)
          .mul(this.motion),
        0,
        0,
      ),
    );
    const count = this.mobile ? 17000 : 28000;
    const moss = new THREE.InstancedMesh(mossBlade(), mat, count);
    for (let i = 0; i < count; i++) {
      let x: number, z: number;
      do {
        x = range(-9, 9);
        z = range(-6.5, 5.8);
      } while (!outsidePool(x, z, 1.02) || (x > 1.8 && x < 3.8 && z > -0.7 && z < 1.2));
      const h = range(0.035, 0.12) * (1 + 0.8 * Math.sin(x * 3.2) * Math.sin(z * 3.7));
      this.dummy.position.set(x, ground(x, z), z);
      this.dummy.rotation.set(range(-0.5, 0.5), rand() * 6.28, range(-0.4, 0.4));
      this.dummy.scale.set(h * range(0.5, 1.4), h, h);
      this.dummy.updateMatrix();
      moss.setMatrixAt(i, this.dummy.matrix);
      moss.setColorAt(
        i,
        new THREE.Color().setHSL(range(0.19, 0.29), range(0.26, 0.55), range(0.14, 0.4)),
      );
    }
    this.scene.add(moss);
    // Each patch has many fine curled leaflets and an irregular, cushioned outline.
    const shootGeo = mossShoot();
    const shootCount = this.mobile ? 1900 : 2800;
    const shoots = new THREE.InstancedMesh(shootGeo, mat, shootCount);
    for (let i = 0; i < shootCount; i++) {
      let x: number, z: number;
      do {
        x = range(-5.5, 5.5);
        z = range(-3.5, 4.2);
      } while (!outsidePool(x, z, 1.1));
      const s = range(0.25, 0.6) * (1 + 0.45 * Math.sin(x * 3.2) * Math.sin(z * 3.7));
      this.dummy.position.set(x, ground(x, z), z);
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(range(-0.3, 0.3), rand() * 7, range(-0.4, 0.4));
      this.dummy.updateMatrix();
      shoots.setMatrixAt(i, this.dummy.matrix);
      shoots.setColorAt(i, new THREE.Color().setHSL(range(0.18, 0.28), 0.4, range(0.2, 0.44)));
    }
    this.scene.add(shoots);
  }

  private buildPlants() {
    const fernMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#9dac73',
      map: this.textures.leaf,
      roughness: 0.91,
      roughnessMap: this.detail.leafRoughness,
      bumpMap: this.detail.leafHeight,
      bumpScale: 0.014,
      specularIntensity: 0.25,
      clearcoat: 0.025,
      clearcoatRoughness: 0.6,
      side: THREE.DoubleSide,
    });
    const fernGeo = fernGeometry();
    const clusters = [
      [-3.7, -0.9, 1.2],
      [3.7, -1.4, 1.6],
      [-4.6, 1.9, 1.05],
      [4.3, 2.9, 1.25],
      [-2, -3.6, 1.4],
      [1.8, -4, 1.2],
      [-6, -3, 2],
      [6, -4, 2.2],
    ];
    for (const [x, z, scale] of clusters) {
      const group = new THREE.Group();
      group.position.set(x, ground(x, z), z);
      for (let j = 0; j < 7; j++) {
        const fern = new THREE.Mesh(fernGeo, fernMat);
        fern.rotation.y = (j / 7) * Math.PI * 2;
        fern.rotation.x = range(-0.25, 0.25);
        fern.scale.setScalar(scale * range(0.75, 1));
        group.add(fern);
      }
      this.scene.add(group);
      this.vegetation.push(group);
    }
    // A pale frond behind the hanging lens gives the refraction something to magnify.
    const lensFrond = new THREE.Mesh(
      fernGeo,
      new THREE.MeshPhysicalNodeMaterial({
        color: '#b6c190',
        map: this.textures.leaf,
        roughness: 0.88,
        bumpMap: this.detail.leafHeight,
        bumpScale: 0.014,
        specularIntensity: 0.22,
        side: THREE.DoubleSide,
        emissive: '#314638',
        emissiveIntensity: 0.12,
      }),
    );
    lensFrond.position.set(0.5, 0.2, -1.4);
    lensFrond.scale.setScalar(1.55);
    lensFrond.rotation.y = 0.35;
    this.scene.add(lensFrond);
    const leafMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#98ad69',
      map: this.textures.leaf,
      bumpMap: this.detail.leafHeight,
      bumpScale: 0.024,
      roughnessMap: this.detail.leafRoughness,
      roughness: 0.88,
      specularIntensity: 0.3,
      clearcoat: 0.04,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
    });
    const stemMat = new THREE.MeshStandardNodeMaterial({ color: '#4d6b3b', roughness: 0.54 });
    leafMat.positionNode = positionLocal.add(
      vec3(
        sin(this.time.mul(0.42).add(positionLocal.y.mul(2.2)))
          .mul(positionLocal.y.pow(1.35))
          .mul(0.035)
          .mul(this.motion),
        sin(this.time.mul(0.28).add(positionLocal.z))
          .mul(positionLocal.y.pow(1.4))
          .mul(0.008)
          .mul(this.motion),
        cos(this.time.mul(0.35).add(positionLocal.x.mul(2)))
          .mul(positionLocal.y.pow(1.2))
          .mul(0.018)
          .mul(this.motion),
      ),
    );
    const leafDistance = distance(positionWorld.xz, this.lightPosition.xz);
    leafMat.emissiveNode = color('#2b5937').mul(
      exp(leafDistance.mul(-1.7)).mul(0.08).add(float(0.012)),
    );
    for (let i = 0; i < 24; i++) {
      const x = range(-7, 7),
        z = range(-5, 0.5);
      if (!outsidePool(x, z, 1.6)) continue;
      const group = new THREE.Group();
      group.position.set(x, ground(x, z), z);
      const h = range(0.55, 1.7);
      group.add(
        tube(
          [
            new THREE.Vector3(),
            new THREE.Vector3(0.08, h * 0.6, 0),
            new THREE.Vector3(0.2, h, 0.15),
          ],
          0.018,
          stemMat,
        ),
      );
      for (let j = 0; j < 3; j++) {
        const leaf = new THREE.Mesh(
          leafGeometry(range(0.55, 1.3), range(0.18, 0.35), 0.16, 15),
          leafMat,
        );
        leaf.position.set(0.1, h * (0.5 + j * 0.2), 0.08);
        leaf.rotation.y = i + j * 2.3;
        leaf.rotation.x = 0.05;
        group.add(leaf);
      }
      this.scene.add(group);
      this.vegetation.push(group);
    }
    // A second understory layer adds broad, wind-responsive leaves between the moss and ferns.
    const understoryGeo = leafGeometry(0.72, 0.25, 0.24, 18, 7, 0.08);
    const understoryCount = this.mobile ? 130 : 230;
    const understory = new THREE.InstancedMesh(understoryGeo, leafMat, understoryCount);
    for (let i = 0; i < understoryCount; i++) {
      let x: number, z: number;
      do {
        x = range(-7.5, 7.5);
        z = range(-5.2, 4.8);
      } while (!outsidePool(x, z, 1.1) || (x > 1.45 && x < 3.9 && z > -1.1 && z < 2.9));
      const size = range(0.62, 1.25);
      this.dummy.position.set(x, ground(x, z) + 0.012, z);
      this.dummy.rotation.set(range(-0.5, 0.25), rand() * Math.PI * 2, range(-0.42, 0.42));
      this.dummy.scale.set(size * range(0.8, 1.2), size * range(0.75, 1.15), size);
      this.dummy.updateMatrix();
      understory.setMatrixAt(i, this.dummy.matrix);
      understory.setColorAt(
        i,
        new THREE.Color().setHSL(range(0.2, 0.34), range(0.32, 0.65), range(0.24, 0.5)),
      );
    }
    this.scene.add(understory);
    // Reeds break the clean oval shoreline and give the pool a living, layered edge.
    const reedMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#769968',
      map: this.textures.leaf,
      roughness: 0.96,
      roughnessMap: this.detail.leafRoughness,
      bumpMap: this.detail.leafHeight,
      bumpScale: 0.008,
      specularIntensity: 0.14,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    reedMat.emissiveNode = color('#4c7544').mul(0.12);
    const reedCount = this.mobile ? 190 : 380;
    const reeds = new THREE.InstancedMesh(mossBlade(), reedMat, reedCount);
    for (let i = 0; i < reedCount; i++) {
      const angle = range(0, Math.PI * 2),
        ring = range(1.01, 1.11),
        x = Math.cos(angle) * 2.35 * ring,
        z = 1.1 + Math.sin(angle) * 1.55 * ring,
        h = range(0.12, 0.36) * (0.82 + 0.18 * Math.sin(angle * 7));
      this.dummy.position.set(x, ground(x, z) + 0.008, z);
      this.dummy.rotation.set(range(-0.22, 0.22), angle + range(-0.6, 0.6), range(-0.35, 0.35));
      this.dummy.scale.set(h * range(0.55, 1.15), h, h * range(0.65, 1.2));
      this.dummy.updateMatrix();
      reeds.setMatrixAt(i, this.dummy.matrix);
      reeds.setColorAt(
        i,
        new THREE.Color().setHSL(range(0.2, 0.32), range(0.35, 0.68), range(0.2, 0.44)),
      );
    }
    this.scene.add(reeds);
    // Delicate seed stalks at the edge of the pool, each with an actual dew bead.
    const dew = new THREE.MeshPhysicalNodeMaterial({
      color: '#e4f9ff',
      transmission: 0.94,
      thickness: 0.07,
      ior: 1.333,
      roughness: 0.02,
      metalness: 0,
    });
    const dewGeo = new THREE.SphereGeometry(0.026, 10, 8);
    for (let i = 0; i < 40; i++) {
      const a = range(0, Math.PI * 2),
        x = Math.cos(a) * range(2.6, 3.2),
        z = 1.1 + Math.sin(a) * range(1.7, 2.1),
        y = ground(x, z),
        h = range(0.15, 0.5);
      const tip = new THREE.Vector3(x + 0.09, y + h, z + 0.05);
      this.scene.add(
        tube(
          [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h * 0.8, z), tip],
          0.007,
          stemMat,
          7,
        ),
      );
      const bead = new THREE.Mesh(dewGeo, dew);
      bead.position.copy(tip);
      this.scene.add(bead);
    }
  }

  private buildBark() {
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: '#aaa28b',
      map: this.naturalSurfaces.maps.barkColor,
      normalMap: this.naturalSurfaces.maps.barkNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: this.naturalSurfaces.maps.barkArm,
      aoMap: this.naturalSurfaces.maps.barkArm,
      aoMapIntensity: 1,
      roughness: 1,
      specularIntensity: 0.2,
      clearcoat: 0,
    });
    const geo = new THREE.CylinderGeometry(0.49, 0.67, 4.6, 64, 42, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        a = Math.atan2(z, x),
        v =
          1 +
          0.095 * Math.sin(a * 13) +
          0.045 * Math.sin(a * 31) +
          0.022 * Math.cos(y * 23 + a * 12);
      p.setXYZ(i, x * v, y, z * v);
    }
    geo.computeVertexNormals();
    const log = new THREE.Group();
    log.position.set(3.25, 0.37, -0.6);
    log.rotation.set(Math.PI / 2, 0.15, -0.43);
    log.add(new THREE.Mesh(geo, material));
    const cutMat = new THREE.MeshStandardNodeMaterial({ color: '#302d24', roughness: 0.85 });
    const cut = new THREE.Mesh(new THREE.CircleGeometry(0.66, 28), cutMat);
    cut.rotation.x = Math.PI / 2;
    cut.position.y = -2.29;
    log.add(cut);
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.09 + i * 0.069, 0.007, 4, 48),
        new THREE.MeshStandardNodeMaterial({ color: '#534933', roughness: 0.8 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.295;
      log.add(ring);
    }
    this.scene.add(log);
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4.8, 7), material);
    wood.position.set(-2.2, 0.1, -0.1);
    wood.rotation.set(0.1, 0.3, 1.32);
    this.scene.add(wood);
    for (let i = 0; i < 26; i++) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(range(0.1, 0.28), 0.05, range(0.3, 0.7)),
        material,
      );
      const x = range(-4, 4),
        z = range(-3, 3);
      if (!outsidePool(x, z, 1.08)) continue;
      shard.position.set(x, ground(x, z), z);
      shard.rotation.set(rand() * 0.7, rand() * 7, rand() * 0.4);
      this.scene.add(shard);
    }
  }

  private buildMushrooms() {
    const capMat = new THREE.MeshPhysicalNodeMaterial({
      map: this.detail.capColor,
      bumpMap: this.detail.capHeight,
      bumpScale: 0.024,
      roughnessMap: this.detail.capRoughness,
      color: '#efdbc3',
      roughness: 0.96,
      specularIntensity: 0.27,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    const stemMat = new THREE.MeshStandardNodeMaterial({
      color: '#c7bba3',
      roughness: 0.96,
      bumpMap: this.detail.grainHeight,
      bumpScale: 0.018,
      emissive: '#536749',
      emissiveIntensity: 0.14,
    });
    const age = this.time.sub(this.waveTime);
    const wave = exp(
      distance(positionWorld.xz, this.waveCenter.xz).sub(age.mul(1.5)).pow(2).mul(-4),
    ).mul(exp(age.mul(-0.75)));
    stemMat.emissiveNode = color('#a4bf79').mul(
      float(0.035)
        .add(wave.mul(0.2))
        .add(exp(distance(positionWorld.xz, this.lightPosition.xz).mul(-2)).mul(0.14)),
    );
    const gillMat = new THREE.MeshStandardNodeMaterial({ color: '#c2c3aa', roughness: 0.6 });
    const sets = [
      [-2.35, 0.2, 0.8],
      [-2.87, -0.05, 0.57],
      [-1.93, -0.12, 0.43],
      [-2.7, 0.65, 0.33],
      [2.7, 1.3, 0.46],
      [2.99, 1.47, 0.29],
      [-0.8, -2.2, 0.55],
      [-0.5, -2.4, 0.32],
    ];
    for (const [x, z, size] of sets) {
      const group = new THREE.Group();
      group.position.set(x, ground(x, z), z);
      group.rotation.z = range(-0.14, 0.14);
      group.scale.setScalar(size);
      group.add(
        tube(
          [
            new THREE.Vector3(),
            new THREE.Vector3(-0.08, 0.55, 0.02),
            new THREE.Vector3(0.03, 1.05, 0),
          ],
          0.075,
          stemMat,
          16,
        ),
      );
      const profile = [
        new THREE.Vector2(0, 1.36),
        new THREE.Vector2(0.12, 1.37),
        new THREE.Vector2(0.25, 1.32),
        new THREE.Vector2(0.42, 1.21),
        new THREE.Vector2(0.55, 1.075),
        new THREE.Vector2(0.57, 1.03),
        new THREE.Vector2(0.49, 1.01),
        new THREE.Vector2(0.1, 1.025),
      ];
      const capGeometry = new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(36), 72);
      const points = capGeometry.attributes.position,
        coords = capGeometry.attributes.uv;
      const variation = x * 13 + z * 7;
      for (let i = 0; i < points.count; i++) {
        const px = points.getX(i),
          py = points.getY(i),
          pz = points.getZ(i),
          a = Math.atan2(px, pz),
          radius = Math.hypot(px, pz),
          edge = radius / 0.57;
        const wobble =
          1 + Math.sin(a * 5 + variation) * 0.035 + Math.cos(a * 9 - variation) * 0.016;
        points.setXYZ(
          i,
          px * wobble,
          py + Math.sin(a * 6 + variation) * 0.013 * edge + Math.sin(a * 23) * 0.007 * edge ** 4,
          pz * wobble,
        );
        coords.setXY(i, (a + Math.PI) / (Math.PI * 2), edge);
      }
      capGeometry.computeVertexNormals();
      const cap = new THREE.Mesh(capGeometry, capMat);
      group.add(cap);
      const gills: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        gills.push(
          tube(
            [
              new THREE.Vector3(Math.cos(a) * 0.1, 1.02, Math.sin(a) * 0.1),
              new THREE.Vector3(Math.cos(a) * 0.49, 1.014, Math.sin(a) * 0.49),
            ],
            0.007,
            gillMat,
            1,
          ).geometry,
        );
      }
      group.add(new THREE.Mesh(mergeGeometries(gills), gillMat));
      gills.forEach((g) => g.dispose());
      this.scene.add(group);
    }
  }

  private buildHero() {
    const mat = new THREE.MeshPhysicalNodeMaterial({
      map: this.textures.leaf,
      bumpMap: this.detail.leafHeight,
      bumpScale: 0.032,
      roughnessMap: this.detail.leafRoughness,
      color: '#d4dcb6',
      roughness: 0.8,
      specularIntensity: 0.42,
      clearcoat: 0.07,
      clearcoatRoughness: 0.38,
      side: THREE.DoubleSide,
      sheen: 0.12,
      sheenColor: '#a6ba70',
      sheenRoughness: 0.5,
    });
    this.heroLeaf.position.set(3.38, 3.16, -1.5);
    this.heroLeaf.rotation.set(0.18, -0.72, -0.08);
    this.heroMesh = new THREE.Mesh(leafGeometry(3.65, 1.03, 0.52, 56, 12, 0.32), mat);
    this.heroLeaf.add(this.heroMesh);
    const veinMat = new THREE.MeshStandardNodeMaterial({ color: '#9aaf5d', roughness: 0.43 });
    const points = Array.from({ length: 28 }, (_, i) => {
      const t = i / 27;
      return new THREE.Vector3(
        0,
        Math.sin(t * Math.PI) * 0.52 - Math.pow(t, 5) * 0.52 * 0.6 + 0.006,
        t * 3.65,
      );
    });
    this.heroLeaf.add(tube(points, 0.012, veinMat, 28));
    const stemMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#527948',
      roughness: 0.8,
      bumpMap: this.detail.grainHeight,
      bumpScale: 0.012,
      specularIntensity: 0.25,
      clearcoat: 0.04,
    });
    this.scene.add(
      tube(
        [
          new THREE.Vector3(3.8, 0.2, -2.7),
          new THREE.Vector3(3.95, 2.4, -2.7),
          new THREE.Vector3(3.38, 3.16, -1.5),
        ],
        0.045,
        stemMat,
        30,
      ),
    );
    const secondary = new THREE.Mesh(leafGeometry(1.9, 0.65, 0.3), mat);
    secondary.position.set(3.67, 2.3, -2.5);
    secondary.rotation.set(-0.4, -2, 0.3);
    this.scene.add(secondary);
    const waterMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#f5ffff',
      transmission: 1,
      thickness: 0.62,
      roughness: 0.015,
      ior: 1.333,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.01,
      attenuationColor: '#b3dfde',
      attenuationDistance: 3,
      envMapIntensity: 1.3,
    });
    const dropGeo = waterDropGeometry();
    this.heroDrop = new THREE.Mesh(dropGeo, waterMat);
    this.heroDrop.position.set(0, -0.235, 3.6);
    this.heroDrop.scale.set(0.28, 0.42, 0.28);
    this.heroLeaf.add(this.heroDrop);
    this.fallingDrop = new THREE.Mesh(dropGeo, waterMat);
    this.fallingDrop.visible = false;
    this.scene.add(this.fallingDrop);
    this.runningDrop = new THREE.Mesh(waterDropGeometry(), waterMat);
    this.runningDrop.scale.set(0.34, 0.46, 0.34);
    this.runningDrop.visible = false;
    this.heroLeaf.add(this.runningDrop);
    const trailPoints = Array.from({ length: 28 }, (_, i) => {
      const slide = 0.52 + (i / 27) * 0.46;
      return new THREE.Vector3(
        0.025 + Math.sin(i * 1.7) * 0.008,
        Math.sin(slide * Math.PI) * 0.52 - Math.pow(slide, 5) * 0.52 * 0.6 + 0.038,
        slide * 3.65,
      );
    });
    const trailMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#74b694',
      roughness: 0.13,
      metalness: 0.04,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    trailMat.opacityNode = smoothstep(0.02, 0.16, this.dripProgress.sub(uv().x)).mul(0.58);
    this.dripTrail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trailPoints), 26, 0.021, 6, false),
      trailMat,
    );
    this.dripTrail.visible = false;
    this.heroLeaf.add(this.dripTrail);
    this.dripBeads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), waterMat, 6);
    this.dripBeads.visible = false;
    this.heroLeaf.add(this.dripBeads);
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), waterMat, 43);
    for (let i = 0; i < 43; i++) {
      const t = range(0.1, 0.92),
        w = Math.pow(Math.sin(t * Math.PI), 0.82) * 1.03,
        q = range(-0.8, 0.8),
        s = range(0.016, 0.065);
      this.dummy.position.set(
        q * w,
        Math.sin(t * Math.PI) * 0.37 - q * q * w * 0.22 - Math.pow(t, 5) * 0.37 * 0.6 + s * 0.52,
        t * 3.65,
      );
      this.dummy.scale.set(s, s * 0.7, s);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      beads.setMatrixAt(i, this.dummy.matrix);
    }
    this.heroLeaf.add(beads);
    this.scene.add(this.heroLeaf);
    this.scene.updateMatrixWorld(true);
    this.heroDrop.getWorldPosition(this.dropPosition);
    this.rippleCenter.value.set(this.dropPosition.x, this.dropPosition.z);
  }

  private buildWater() {
    const water = new THREE.MeshPhysicalNodeMaterial({
      color: '#587c82',
      metalness: 0.12,
      roughness: 0.24,
      clearcoat: 0.58,
      clearcoatRoughness: 0.16,
      side: THREE.DoubleSide,
    });
    water.name = 'pool-water';
    const d = distance(positionWorld.xz, this.rippleCenter),
      age = this.time.sub(this.rippleTime);
    const ripple = sin(d.mul(22).sub(age.mul(9)))
      .mul(exp(d.sub(age.mul(0.9)).pow(2).mul(-3)))
      .mul(exp(age.mul(-0.6)))
      .mul(0.07);
    const still = sin(positionWorld.x.mul(7).add(this.time.mul(0.4)))
      .mul(cos(positionWorld.z.mul(9).add(this.time.mul(0.5))))
      .mul(0.005)
      .mul(this.motion);
    const swell = sin(positionWorld.x.mul(2.2).add(this.time.mul(0.23)))
      .mul(cos(positionWorld.z.mul(3.4).sub(this.time.mul(0.18))))
      .mul(0.015)
      .mul(this.motion);
    const crossWave = sin(
      positionWorld.x.mul(11).sub(positionWorld.z.mul(8)).add(this.time.mul(0.48)),
    )
      .mul(0.004)
      .mul(this.motion);
    const normalX = ripple.add(still).add(swell).add(crossWave),
      normalZ = ripple.mul(0.72).add(still.mul(0.8)).add(swell.mul(0.75)).sub(crossWave);
    water.normalNode = vec3(normalX, float(1), normalZ)
      .normalize()
      .transformDirection(this.camera.matrixWorldInverse);
    const shimmer = sin(
      positionWorld.x.mul(5.4).add(positionWorld.z.mul(3.8)).add(this.time.mul(0.32)),
    )
      .mul(0.5)
      .add(0.5);
    const waterTone = mix(color('#0d2f39'), color('#3d6b65'), shimmer.mul(0.16).add(0.14));
    if (!this.mobile) {
      const reflection = reflector({ resolutionScale: 1, bounces: false });
      reflection.target.rotation.x = -Math.PI / 2;
      reflection.target.position.y = -0.035;
      this.scene.add(reflection.target);
      reflection.uvNode = screenUV.flipX().add(vec2(ripple.mul(0.1).add(still), ripple.mul(0.06)));
      water.colorNode = mix(waterTone, reflection.rgb, 0.38);
    } else {
      water.colorNode = waterTone;
    }
    const geo = new THREE.CircleGeometry(1, 96);
    geo.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(geo, water);
    waterMesh.scale.set(2.38, 1, 1.57);
    waterMesh.position.set(0, -0.027, 1.1);
    this.scene.add(waterMesh);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({
        color: '#b4dfe1',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mat.opacityNode = float(1)
        .sub(smoothstep(0.95, 1, positionWorld.xz.sub(vec2(0, 1.1)).div(vec2(2.38, 1.57)).length()))
        .mul(materialOpacity);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.dropPosition.x, -0.017 + i * 0.001, this.dropPosition.z);
      ring.visible = false;
      this.scene.add(ring);
      this.rippleRings.push({ mesh: ring, born: -100, delay: i * 0.17 });
    }
    const splatMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#b9e0e7',
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 7, 6), splatMat);
      m.visible = false;
      this.scene.add(m);
      this.splash.push(m);
    }
    this.floatingLeaf = new THREE.Group();
    this.floatingLeaf.position.set(-0.4, 0.01, 1.9);
    this.floatingLeaf.rotation.set(0, 1.3, 0);
    this.floatingLeaf.add(
      new THREE.Mesh(
        leafGeometry(0.58, 0.16, 0.018, 12),
        new THREE.MeshPhysicalNodeMaterial({
          color: '#8e6935',
          map: this.textures.leaf,
          roughness: 0.82,
          roughnessMap: this.detail.leafRoughness,
          bumpMap: this.detail.leafHeight,
          bumpScale: 0.02,
          specularIntensity: 0.3,
          clearcoat: 0.06,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.scene.add(this.floatingLeaf);
  }

  private buildSnail() {
    this.snail.position.set(2.78, ground(2.78, 1.5) + 0.018, 1.5);
    this.snail.rotation.y = -0.4;
    this.snail.scale.setScalar(0.68);
    const footMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#74836c',
      map: this.detail.skinColor,
      roughness: 0.98,
      roughnessMap: this.detail.skinRoughness,
      bumpMap: this.detail.skinHeight,
      bumpScale: 0.024,
      specularIntensity: 0.14,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    const bodyMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#9b916d',
      map: this.detail.skinColor,
      roughness: 0.96,
      roughnessMap: this.detail.skinRoughness,
      bumpMap: this.detail.skinHeight,
      bumpScale: 0.02,
      specularIntensity: 0.16,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    const headMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#a69c76',
      map: this.detail.skinColor,
      roughness: 0.99,
      roughnessMap: this.detail.skinRoughness,
      bumpMap: this.detail.skinHeight,
      bumpScale: 0.022,
      specularIntensity: 0.12,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    const mucusMat = new THREE.MeshStandardNodeMaterial({
      color: '#536451',
      roughness: 1,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mucusTrail = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.14, 18, 2), mucusMat);
    mucusTrail.rotation.x = -Math.PI / 2;
    mucusTrail.position.set(0.14, 0.018, 0.012);
    this.snail.add(mucusTrail);
    this.snail.add(new THREE.Mesh(snailFootGeometry(), footMat));
    const shellMat = new THREE.MeshPhysicalNodeMaterial({
      map: this.detail.shellColor,
      bumpMap: this.detail.shellHeight,
      bumpScale: 0.018,
      roughnessMap: this.detail.shellRoughness,
      color: '#a66f3f',
      roughness: 0.98,
      specularIntensity: 0.16,
      clearcoat: 0,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(snailShellGeometry(), shellMat);
    shell.position.set(0.06, 0.3, -0.035);
    shell.scale.set(1.08, 1, 0.9);
    shell.rotation.z = -0.045;
    this.snail.add(shell);
    this.snail.add(new THREE.Mesh(snailMantleGeometry(), bodyMat));
    this.snailHead.position.set(-0.47, 0.06, 0);
    this.snail.add(this.snailHead);
    this.snailHead.add(new THREE.Mesh(snailHeadGeometry(), headMat));
    const mouthMat = new THREE.MeshStandardNodeMaterial({ color: '#49372a', roughness: 1 });
    this.snailHead.add(
      tube(
        [new THREE.Vector3(-0.21, 0.045, 0.105), new THREE.Vector3(-0.255, 0.037, 0.11)],
        0.008,
        mouthMat,
        8,
      ),
    );
    const eyeMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#121b16',
      roughness: 0.35,
      clearcoat: 0.35,
    });
    for (const side of [-1, 1]) {
      const tentacle = new THREE.Group();
      tentacle.position.set(-0.09, 0.09, side * 0.07);
      tentacle.add(
        tube(
          [
            new THREE.Vector3(),
            new THREE.Vector3(-0.07, 0.12, side * 0.015),
            new THREE.Vector3(-0.15, 0.24, side * 0.035),
          ],
          0.015,
          bodyMat,
          10,
        ),
      );
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeMat);
      eye.position.set(-0.15, 0.24, side * 0.035);
      tentacle.add(eye);
      this.snailHead.add(tentacle);
      this.tentacles.push(tentacle);
      this.snailHead.add(
        tube(
          [
            new THREE.Vector3(-0.1, -0.02, side * 0.06),
            new THREE.Vector3(-0.21, 0.02, side * 0.12),
          ],
          0.013,
          bodyMat,
          6,
        ),
      );
    }
    this.snailHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.67, 8, 6),
      new THREE.MeshBasicNodeMaterial({ visible: false }),
    );
    this.snailHit.position.y = 0.28;
    this.snail.add(this.snailHit);
    this.scene.add(this.snail);
  }

  private buildAtmosphere() {
    const skyMat = new THREE.MeshBasicNodeMaterial({ depthWrite: false });
    skyMat.colorNode = mix(
      color('#0a1d28'),
      color('#427287'),
      exp(uv().sub(vec2(0.63, 0.63)).mul(vec2(2.1, 1.6)).length().pow(2).mul(-4)),
    );
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(55, 34), skyMat);
    sky.position.set(0, 8, -24);
    this.scene.add(sky);
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7 + i * 0.24, 14),
        new THREE.MeshBasicNodeMaterial({
          map: this.textures.mist,
          color: '#a4d3e1',
          transparent: true,
          opacity: 0.055,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      beam.position.set(2.1 + i * 1.8, 6.1, -5.8 - i * 0.65);
      beam.rotation.z = -0.4;
      this.scene.add(beam);
    }
    const bugMat = new THREE.MeshStandardNodeMaterial({ color: '#64502c', roughness: 0.4 });
    const bug = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 8), bugMat);
    bug.scale.set(0.65, 0.7, 1.3);
    this.firefly.add(bug);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 12, 8),
      new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#ffe1a0').multiplyScalar(4) }),
    );
    bulb.position.z = 0.035;
    this.firefly.add(bulb);
    const glow = new THREE.Sprite(
      new THREE.SpriteNodeMaterial({
        map: this.textures.glow,
        color: '#ffe0a1',
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    glow.scale.setScalar(0.68);
    this.firefly.add(glow);
    this.fireflyWing = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 6),
      new THREE.MeshPhysicalNodeMaterial({
        color: '#cadce0',
        transparent: true,
        opacity: 0.26,
        roughness: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    this.fireflyWing.scale.set(0.1, 0.004, 0.036);
    this.firefly.add(this.fireflyWing);
    this.scene.add(this.firefly);
    const pointerGlow = new THREE.Sprite(
      new THREE.SpriteNodeMaterial({
        map: this.textures.glow,
        color: '#e2ecb0',
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pointerGlow.scale.setScalar(0.36);
    this.pointerLight.add(pointerGlow);
    const count = this.mobile ? 40 : 80;
    this.stars = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 4, 3),
      new THREE.MeshBasicNodeMaterial({ color: '#b7c7ad', transparent: true, opacity: 0.32 }),
      count,
    );
    for (let i = 0; i < count; i++)
      this.dustData.push({
        pos: new THREE.Vector3(range(-8, 8), range(0.4, 6), range(-9, 4)),
        seed: rand() * 20,
        size: range(0.003, 0.009),
      });
    this.scene.add(this.stars);
  }

  drop() {
    if (!this.ready || this.elapsed - this.dropStarted < 5.8) return false;
    this.dropStarted = this.elapsed;
    this.impactDone = false;
    this.heroDrop.visible = true;
    this.heroDrop.position.y = -0.235;
    this.heroDrop.scale.set(0.28, 0.42, 0.28);
    this.snailFocusUntil = 0;
    return true;
  }
  focusSnail() {
    this.snailFocusUntil = this.elapsed + 12;
    this.snailReveal = 1;
    this.zoom = 0.6;
    this.discoverSnail();
  }
  reset() {
    this.zoom = 0;
    this.snailFocusUntil = 0;
    this.pointer.set(0.2, -0.1);
    this.targetLight.set(0.3, 0.45, 1.7);
    document.body.classList.remove('exploring');
  }
  toggleLight() {
    this.lightEnabled = !this.lightEnabled;
    this.pointerLight.visible = this.lightEnabled;
    if (!this.lightEnabled) this.lightPosition.value.set(100, 0, 100);
    return this.lightEnabled;
  }
  private discoverSnail() {
    if (!this.snailDiscovered) {
      this.snailDiscovered = true;
      this.events.onDiscovery();
    }
  }

  private bindEvents() {
    const options = { signal: this.disposal.signal };
    window.addEventListener('resize', () => this.resize(), options);
    this.reducedMotion.addEventListener(
      'change',
      () => {
        this.motion.value = this.reducedMotion.matches ? 0 : 1;
      },
      options,
    );
    this.container.addEventListener(
      'pointermove',
      (event) => {
        if (this.gesture.has(event.pointerId))
          this.gesture.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.gesture.size === 2) {
          const [a, b] = [...this.gesture.values()],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinchDistance)
            this.zoom = THREE.MathUtils.clamp(this.zoom + (d - this.pinchDistance) * 0.008, 0, 1.4);
          this.pinchDistance = d;
          return;
        }
        this.pointer.set(
          (event.clientX / innerWidth) * 2 - 1,
          (-event.clientY / innerHeight) * 2 + 1,
        );
        this.cursor.style.left = `${event.clientX}px`;
        this.cursor.style.top = `${event.clientY}px`;
        this.cursor.style.display = event.pointerType === 'mouse' ? 'block' : 'none';
        this.updatePointer();
      },
      options,
    );
    this.container.addEventListener(
      'pointerdown',
      (event) => {
        this.pointerStart = { x: event.clientX, y: event.clientY };
        this.gesture.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.container.setPointerCapture(event.pointerId);
        this.pointer.set(
          (event.clientX / innerWidth) * 2 - 1,
          (-event.clientY / innerHeight) * 2 + 1,
        );
        this.updatePointer();
      },
      options,
    );
    this.container.addEventListener(
      'pointerup',
      (event) => {
        const wasPinch = this.gesture.size > 1 || this.pinchDistance > 0;
        this.gesture.delete(event.pointerId);
        if (this.gesture.size === 0) this.pinchDistance = 0;
        if (
          wasPinch ||
          Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 9
        )
          return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        if (this.raycaster.intersectObject(this.heroLeaf, true).length) this.drop();
        else if (this.raycaster.intersectObject(this.snailHit).length) this.focusSnail();
        else {
          this.waveCenter.value.copy(this.targetLight);
          this.waveTime.value = this.elapsed;
        }
      },
      options,
    );
    this.container.addEventListener(
      'pointercancel',
      (event) => {
        this.gesture.delete(event.pointerId);
        this.pinchDistance = 0;
      },
      options,
    );
    this.container.addEventListener(
      'pointerleave',
      () => {
        this.cursor.style.display = 'none';
        this.hover = false;
        this.snailHovered = false;
      },
      options,
    );
    this.container.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * 0.0015, 0, 1.4);
        this.snailFocusUntil = 0;
      },
      { ...options, passive: false },
    );
    window.addEventListener(
      'keydown',
      (event) => {
        if (document.querySelector('dialog[open]')) return;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          if (!this.lightEnabled) {
            this.toggleLight();
            const button = document.querySelector('#light-button');
            button?.setAttribute('aria-pressed', 'true');
            button?.classList.add('active');
          }
          this.pointer.x = THREE.MathUtils.clamp(
            this.pointer.x +
              (event.key === 'ArrowLeft' ? -0.09 : event.key === 'ArrowRight' ? 0.09 : 0),
            -0.95,
            0.95,
          );
          this.pointer.y = THREE.MathUtils.clamp(
            this.pointer.y +
              (event.key === 'ArrowDown' ? -0.09 : event.key === 'ArrowUp' ? 0.09 : 0),
            -0.9,
            0.4,
          );
          this.updatePointer();
        }
        if (event.key === 'Escape') this.reset();
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.visible = !document.hidden;
        this.lastFrame = 0;
      },
      options,
    );
  }

  private updatePointer() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(UP, -0.25), hit)) {
      hit.x = THREE.MathUtils.clamp(hit.x, -6, 6);
      hit.z = THREE.MathUtils.clamp(hit.z, -4, 4);
      hit.y = ground(hit.x, hit.z) + 0.4;
      if (
        hit.distanceTo(this.targetLight) > 0.45 &&
        this.elapsed - this.waveTime.value > 0.75 &&
        this.lightEnabled
      ) {
        this.waveCenter.value.copy(hit);
        this.waveTime.value = this.elapsed;
      }
      this.targetLight.copy(hit);
    }
    this.snailHovered = this.raycaster.intersectObject(this.snailHit).length > 0;
    this.hover =
      this.raycaster.intersectObject(this.heroLeaf, true).length > 0 || this.snailHovered;
    this.cursor.classList.toggle('interactive', this.hover);
    this.container.style.cursor = this.hover ? 'pointer' : 'default';
  }

  private resize() {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    this.mobile = width < 680;
    this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 59 : 43;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (timestamp: number) => {
    if (!this.visible) return;
    const dt = this.lastFrame ? Math.min((timestamp - this.lastFrame) / 1000, 0.05) : 1 / 60;
    this.lastFrame = timestamp;
    this.elapsed += dt;
    this.time.value = this.elapsed;
    const t = this.elapsed,
      motion = this.motion.value;
    const ease = 1 - Math.exp(-dt * 4);
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.zoom, ease);
    const focus = this.snailFocusUntil > t;
    const cam = this.mobile
      ? new THREE.Vector3(1.6, 2.9, 10.1 - this.currentZoom * 2.3)
      : new THREE.Vector3(
          0.1 + this.pointer.x * 0.12 * motion,
          2.65 + this.pointer.y * 0.08 * motion,
          8.6 - this.currentZoom * 2.5,
        );
    const target = new THREE.Vector3(
      this.mobile ? 0.65 : 0.4,
      1.45 - this.currentZoom * 0.22,
      0.2 + this.currentZoom * 0.15,
    );
    if (focus) {
      cam.set(3.22, 1.48, 6.0);
      target.set(2.52, 0.42, 1.5);
    }
    if (this.frame === 0 || this.reducedMotion.matches) {
      this.camera.position.copy(cam);
      this.lookAt.copy(target);
    } else {
      this.camera.position.lerp(cam, ease * 0.5);
      this.lookAt.lerp(target, ease * 0.5);
    }
    this.camera.lookAt(this.lookAt);
    this.focusDistance.value = focus
      ? this.camera.position.distanceTo(this.snail.position)
      : this.camera.position.distanceTo(new THREE.Vector3(0.7, 1.3, 1));
    document.body.classList.toggle('exploring', this.currentZoom > 0.4 || focus);
    this.pointerLight.position.lerp(this.targetLight, ease * 1.3);
    if (this.lightEnabled) this.lightPosition.value.copy(this.pointerLight.position);
    this.firefly.position.set(
      -0.1 + Math.sin(t * 0.37 * motion) * 0.7,
      1.48 + Math.cos(t * 0.62 * motion) * 0.19,
      0.6 + Math.sin(t * 0.24 * motion) * 0.5,
    );
    this.guideLight.position.copy(this.firefly.position);
    this.guideLight.intensity = 1.1 + Math.sin(t * 2 * motion) * 0.18;
    this.fireflyWing.rotation.z = Math.sin(t * 67 * motion) * 0.5;
    this.vegetation.forEach((plant, i) => {
      plant.rotation.z = Math.sin(t * 0.42 + i) * 0.016 * motion;
      plant.rotation.x = Math.sin(t * 0.27 + i * 0.7) * 0.006 * motion;
    });
    if (
      this.keyShadow &&
      (this.frame % 60 === 0 || (t - this.dropStarted < 2 && this.frame % 4 === 0))
    )
      this.keyShadow.needsUpdate = true;
    this.updateDrop(t);
    this.updateSnail(t, ease);
    for (let i = 0; i < this.dustData.length; i++) {
      const d = this.dustData[i];
      this.dummy.position.copy(d.pos);
      this.dummy.position.x += Math.sin(t * 0.1 + d.seed) * 0.25 * motion;
      this.dummy.position.y += Math.sin(t * 0.18 + d.seed) * 0.13 * motion;
      this.dummy.scale.setScalar(d.size * (0.75 + Math.sin(t + d.seed) * 0.25 * motion));
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.stars.setMatrixAt(i, this.dummy.matrix);
    }
    this.stars.instanceMatrix.needsUpdate = true;
    if (this.frame % 3 === 0) {
      this.heroDrop.getWorldPosition(this.dropPosition);
      const labelPosition = this.dropPosition.clone().project(this.camera);
      this.label.style.left = `${Math.min(this.container.clientWidth - this.label.offsetWidth - 15, (labelPosition.x * 0.5 + 0.5) * this.container.clientWidth + 27)}px`;
      this.label.style.top = `${(-labelPosition.y * 0.5 + 0.5) * this.container.clientHeight + 14}px`;
      this.label.style.opacity =
        !focus &&
        this.currentZoom < 0.3 &&
        this.heroDrop.visible &&
        this.heroDrop.scale.y > 0.58 &&
        labelPosition.x < 0.48
          ? '.68'
          : '0';
    }
    try {
      this.pipeline.render();
    } catch (error) {
      this.renderer.setAnimationLoop(null);
      this.events.onError(error);
    }
    this.frame++;
    // One conservative reduction after warm-up, never an oscillating quality loop.
    if (!this.adjustedQuality && this.frame > 180 && this.frame < 360)
      this.slowFrames += dt > 0.029 ? 1 : 0;
    if (!this.adjustedQuality && this.frame === 360) {
      this.adjustedQuality = true;
      if (this.slowFrames > 95) {
        this.quality = 0.8;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1 : 1.25));
      }
    }
  };

  private updateDrop(t: number) {
    const age = t - this.dropStarted,
      motion = this.motion.value;
    this.heroLeaf.position.y = 3.16 + Math.sin(t * 0.23) * 0.024 * motion;
    this.heroLeaf.position.z = -1.5 + Math.sin(t * 0.18 + 1.2) * 0.015 * motion;
    this.heroLeaf.rotation.x = 0.18 + Math.sin(t * 0.27) * 0.018 * motion;
    this.heroLeaf.rotation.y = -0.72 + Math.sin(t * 0.19 + 0.7) * 0.018 * motion;
    this.heroLeaf.rotation.z = -0.08 + Math.sin(t * 0.37) * 0.022 * motion;
    this.dripProgress.value =
      age >= 0.18 && age < 1.8 ? THREE.MathUtils.clamp((age - 0.18) / 1.62, 0, 1) : 0;
    this.dripTrail.visible = age >= 0.18 && age < 1.8;
    this.dripBeads.visible = age >= 0.28 && age < 1.8;
    if (age < 1.8) {
      const progress = THREE.MathUtils.clamp(age / 1.8, 0, 1),
        eased = progress * progress * (3 - 2 * progress),
        slide = 0.52 + eased * 0.46;
      this.runningDrop.visible = age > 0.32;
      this.heroDrop.visible = age < 0.34;
      this.runningDrop.position.set(
        0.025,
        Math.sin(slide * Math.PI) * 0.52 - Math.pow(slide, 5) * 0.52 * 0.6 + 0.05,
        slide * 3.65,
      );
      this.runningDrop.rotation.x = 0.18 + Math.sin(progress * Math.PI) * 0.09;
      this.runningDrop.rotation.z = Math.sin(progress * Math.PI * 2) * 0.05;
      this.runningDrop.scale.set(
        THREE.MathUtils.lerp(0.32, 0.46, eased),
        THREE.MathUtils.lerp(0.5, 0.9, eased),
        THREE.MathUtils.lerp(0.32, 0.46, eased),
      );
      for (let i = 0; i < 6; i++) {
        const beadT = i / 5,
          beadSlide = 0.52 + eased * 0.46 * beadT,
          beadY = Math.sin(beadSlide * Math.PI) * 0.52 - Math.pow(beadSlide, 5) * 0.52 * 0.6 + 0.04,
          beadSize = 0.022 * (1 - beadT * 0.22) * (0.8 + 0.2 * Math.sin(t * 3 + i));
        this.dummy.position.set(0.025 + Math.sin(i * 2.7 + t) * 0.018, beadY, beadSlide * 3.65);
        this.dummy.scale.setScalar(beadSize);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.dripBeads.setMatrixAt(i, this.dummy.matrix);
      }
      this.dripBeads.instanceMatrix.needsUpdate = true;
      this.heroLeaf.rotation.z += Math.sin(progress * Math.PI) * 0.11;
      this.heroLeaf.rotation.x += Math.sin(progress * Math.PI) * 0.05;
      this.heroDrop.position.y = THREE.MathUtils.lerp(-0.235, -0.39, eased);
      this.heroDrop.scale.set(
        THREE.MathUtils.lerp(0.28, 0.76, eased),
        THREE.MathUtils.lerp(0.42, 1.12, eased),
        THREE.MathUtils.lerp(0.28, 0.76, eased),
      );
    } else if (age < 2.55) {
      if (this.heroDrop.visible || this.runningDrop.visible) {
        const source = this.runningDrop.visible ? this.runningDrop : this.heroDrop;
        source.getWorldPosition(this.fallingDrop.position);
        this.heroDrop.visible = false;
        this.runningDrop.visible = false;
        this.fallingDrop.visible = true;
        this.fallingDrop.userData.startY = this.fallingDrop.position.y;
      }
      const f = (age - 1.8) / 0.75;
      this.fallingDrop.position.y = this.fallingDrop.userData.startY * (1 - f * f);
      this.fallingDrop.scale.set(0.78, 1.25, 0.78);
    } else if (!this.impactDone) {
      this.impactDone = true;
      this.fallingDrop.visible = false;
      this.rippleTime.value = t;
      this.rippleCenter.value.set(this.fallingDrop.position.x, this.fallingDrop.position.z);
      this.rippleRings.forEach((r) => {
        r.born = t;
        r.mesh.position.x = this.fallingDrop.position.x;
        r.mesh.position.z = this.fallingDrop.position.z;
      });
      this.events.onDrop();
    }
    if (age >= 3.0) {
      this.heroDrop.visible = true;
      this.heroDrop.position.y = -0.235;
      const refill = THREE.MathUtils.clamp((age - 3.0) / 2.8, 0, 1);
      this.heroDrop.scale.set(
        THREE.MathUtils.lerp(0.22, 0.34, refill),
        THREE.MathUtils.lerp(0.34, 0.68, refill),
        THREE.MathUtils.lerp(0.22, 0.34, refill),
      );
    }
    const rippleAge = t - this.rippleTime.value;
    this.rippleRings.forEach((r) => {
      const a = t - r.born - r.delay;
      const radius = 0.05 + a * 0.7;
      r.mesh.visible = a >= 0 && a < 2.6;
      if (r.mesh.visible) {
        r.mesh.scale.setScalar(radius);
        r.mesh.material.opacity = Math.max(0, 0.2 * (1 - a / 2.6));
      }
    });
    this.splash.forEach((m, i) => {
      const a = rippleAge;
      m.visible = a >= 0 && a < 0.48;
      if (m.visible) {
        const angle = (i / 12) * Math.PI * 2,
          r = a * 0.8;
        m.position.set(
          this.rippleCenter.value.x + Math.cos(angle) * r,
          Math.max(0, Math.sin((a / 0.48) * Math.PI) * (0.12 + (i % 3) * 0.05)),
          this.rippleCenter.value.y + Math.sin(angle) * r,
        );
        m.scale.setScalar(1 - a);
      }
    });
    const reaction = rippleAge < 5 ? Math.sin(rippleAge * 5) * Math.exp(-rippleAge) : 0;
    this.floatingLeaf.rotation.z = Math.sin(t * 0.7) * 0.015 * motion + reaction * 0.14;
    this.floatingLeaf.position.y = 0.013 + reaction * 0.025;
  }

  private updateSnail(t: number, ease: number) {
    const near =
      this.snailHovered ||
      (this.lightEnabled && this.targetLight.distanceTo(this.snail.position) < 0.8);
    this.snailRetraction = THREE.MathUtils.lerp(
      this.snailRetraction,
      near ? 1 : 0,
      ease * (near ? 0.8 : 0.16),
    );
    if (near) this.discoverSnail();
    this.snailReveal = Math.min(1, this.snailReveal + 0.0006 * this.motion.value);
    this.snail.position.x = 2.78 - this.snailReveal * 0.1 + this.snailRetraction * 0.06;
    this.snail.position.z = 1.5 + Math.sin(t * 0.34) * 0.012 * this.motion.value;
    this.snail.position.y = ground(this.snail.position.x, this.snail.position.z) + 0.018;
    this.snailHead.scale.x = 1 - this.snailRetraction * 0.5;
    this.snailHead.position.x = -0.47 + this.snailRetraction * 0.1;
    this.tentacles.forEach((tentacle, i) => {
      tentacle.scale.y = 1 - this.snailRetraction * 0.55;
      tentacle.rotation.z = Math.sin(t * 0.8 + i) * 0.13 * this.motion.value;
      tentacle.rotation.x = Math.sin(t * 0.5 + i * 2) * 0.19 * this.motion.value;
    });
  }

  diagnostics() {
    return {
      ready: this.ready,
      backend: 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2',
      frames: this.frame,
      dropBusy: this.elapsed - this.dropStarted < 5.8,
      dropVisible: this.heroDrop.visible,
      rippleAge: this.elapsed - this.rippleTime.value,
      snailRetraction: this.snailRetraction,
      snailDiscovered: this.snailDiscovered,
      lightEnabled: this.lightEnabled,
      reducedMotion: this.reducedMotion.matches,
      quality: this.quality,
      zoom: this.currentZoom,
      drawCalls: this.renderer.info.render.drawCalls,
      triangles: this.renderer.info.render.triangles,
      heroScreen: this.heroDrop
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera)
        .toArray(),
      leafScreen: this.heroLeaf
        .localToWorld(new THREE.Vector3(0, 0.3, 1.6))
        .project(this.camera)
        .toArray(),
      snailScreen: this.snailHit
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera)
        .toArray(),
      lightPosition: this.targetLight.toArray(),
    };
  }
  dispose() {
    this.disposal.abort();
    this.renderer.setAnimationLoop(null);
    this.pipeline?.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          material.dispose();
      }
    });
    Object.values(this.textures).forEach((t) => t.dispose());
    Object.values(this.detail).forEach((t) => t.dispose());
    Object.values(this.naturalSurfaces.maps).forEach((t) => t.dispose());
    this.renderer.dispose();
  }
}
