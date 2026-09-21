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
  cameraPosition,
  normalWorld,
  add,
  nodeObject,
  texture,
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
  shadeByHeight,
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
const UP = new THREE.Vector3(0, 1, 0);
// Basin profile shared by the terrain mesh, the water sheet and the shoreline planting.
const POOL_RADIUS_X = 2.35,
  POOL_RADIUS_Z = 1.55,
  POOL_CENTER_Z = 1.1,
  WATER_LEVEL = -0.027;

export class Forest {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.08, 70);
  readonly renderer: THREE.WebGPURenderer;
  readonly raycaster = new THREE.Raycaster();
  readonly pointer = new THREE.Vector2(0.2, -0.1);
  /** Startup cost per phase, in ms. Reported through `state()` so a slow first load on real
   *  hardware can be attributed instead of guessed at. */
  static readonly timings: Record<string, number> = {};
  private static phase<T>(name: string, run: () => T): T {
    const started = performance.now();
    const value = run();
    Forest.timings[name] = +(performance.now() - started).toFixed(1);
    return value;
  }
  readonly textures = Forest.phase('textures', makeTextures);
  private readonly naturalSurfaces = loadNaturalSurfaces();
  private readonly detail = Forest.phase('detailMaps', makeDetailMaps);
  readonly lightPosition = uniform(new THREE.Vector3(0.3, 0.4, 2));
  readonly time = uniform(0);
  readonly waveCenter = uniform(new THREE.Vector3(0.3, 0, 1));
  readonly waveTime = uniform(-50);
  readonly rippleCenter = uniform(new THREE.Vector2(1, 1));
  readonly rippleTime = uniform(-50);
  readonly touchCenter = uniform(new THREE.Vector2(0, 1));
  readonly touchTime = uniform(-50);
  readonly motion = uniform(1);
  readonly focusDistance = uniform(7.8);
  private pipeline!: THREE.RenderPipeline;
  private keyShadow?: THREE.LightShadow;
  private heroLeaf = new THREE.Group();
  private heroMesh!: THREE.Mesh;
  private heroDrop!: THREE.Mesh;
  private fallingDrop!: THREE.Mesh;
  private runningDrop!: THREE.Mesh;
  private dripTail!: THREE.Mesh;
  private dripTrail!: THREE.Mesh;
  private dripBeads!: THREE.InstancedMesh;
  private dripProgress = uniform(0);
  private dropPosition = new THREE.Vector3();
  private dropStarted = -100;
  private impactDone = true;
  private splash: THREE.Mesh[] = [];
  private waterMesh!: THREE.Mesh;
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
  private fireflyWing!: THREE.Group;
  private fireflyGlow!: THREE.Sprite;
  private fireflyBulb!: THREE.Mesh;
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
  /** Eased pointer offset for camera parallax. `pointer` itself stays exact for picking. */
  private parallax = new THREE.Vector2(0.2, -0.1);
  /** Size the bead had on the leaf, carried across the moment it lets go. */
  private detachScale = new THREE.Vector3(0.32, 0.47, 0.46);
  private currentZoom = 0;
  private viewIndex = 0;
  private gesture = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pointerStart = { x: 0, y: 0 };
  /** Where the visitor has swung the camera to, and where it has eased to so far. */
  private orbit = { yaw: 0, pitch: 0 };
  private orbitEased = { yaw: 0, pitch: 0 };
  private dragOrigin: { x: number; y: number } | null = null;
  private pinchCentre: { x: number; y: number } | null = null;
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
    // A flat fill made the backdrop read as a wall. A shallow vertical gradient, with the
    // fog matched to the band the trunks actually stand in, gives the distance some air.
    this.scene.backgroundNode = mix(color('#12293a'), color('#081824'), screenUV.y.pow(0.75));
    this.scene.fog = new THREE.FogExp2('#0e2433', 0.057);
    this.scene.environment = this.textures.env;
    this.scene.environmentIntensity = 0.65;
    this.motion.value = this.reducedMotion.matches ? 0 : 1;
    const sceneStarted = performance.now();
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
    this.buildGroundMist();
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
    Forest.timings.buildScene = +(performance.now() - sceneStarted).toFixed(1);
    this.resize();
    this.bindEvents();
  }

  async start() {
    try {
      const waitStarted = performance.now();
      await this.naturalSurfaces.ready;
      Forest.timings.awaitTextures = +(performance.now() - waitStarted).toFixed(1);
      const initStarted = performance.now();
      await this.renderer.init();
      Forest.timings.rendererInit = +(performance.now() - initStarted).toFixed(1);
      // Not compileAsync here: compiling the scene's materials up front and then rendering
      // through the post-processing chain compiles much of it twice, and measured 5.4 s to
      // ready against 4.8 s without, on a six-times-throttled CPU.
      const frameStarted = performance.now();
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
      Forest.timings.firstFrame = +(performance.now() - frameStarted).toFixed(1);
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
    // Identical trunks at one depth merged into a striped curtain. Per-trunk value, a
    // darkened base and a deeper spread let the fog separate them into layers.
    treeMat.vertexColors = true;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.65, 18, 11, 6);
    const trunkPos = trunkGeo.attributes.position,
      trunkShade = new Float32Array(trunkPos.count * 3);
    for (let i = 0; i < trunkPos.count; i++) {
      const height = (trunkPos.getY(i) + 9) / 18,
        base = 0.32 + 0.68 * Math.min(1, Math.max(0, (height - 0.02) * 2.6));
      trunkShade[i * 3] = trunkShade[i * 3 + 1] = trunkShade[i * 3 + 2] = base;
    }
    trunkGeo.setAttribute('color', new THREE.BufferAttribute(trunkShade, 3));
    this.trees = new THREE.InstancedMesh(trunkGeo, treeMat, 68);
    for (let i = 0; i < 68; i++) {
      this.dummy.position.set(range(-22, 22), 7, range(-30, -6));
      this.dummy.scale.set(range(0.28, 1.6), range(0.65, 1.35), range(0.28, 1.5));
      this.dummy.rotation.set(range(-0.2, 0.2), rand() * 6, range(-0.18, 0.18));
      this.dummy.updateMatrix();
      this.trees.setMatrixAt(i, this.dummy.matrix);
      this.trees.setColorAt(
        i,
        new THREE.Color().setHSL(range(0.46, 0.55), range(0.1, 0.3), range(0.2, 0.62)),
      );
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
      // No film on the carpet: a sharp one on instanced blades this small sparkles into
      // aliasing, and a soft one is invisible at their scale. The dew beads carry the wet
      // read down here instead.
      clearcoat: 0,
      // Every instance below is given its own colour, but a colorNode here would replace
      // the diffuse chain and quietly discard all of it, leaving one flat green carpet.
      // The base-to-tip darkening rides in vertex colours instead, so both survive.
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    mat.color = new THREE.Color('#a9b882');
    const d = distance(positionWorld.xz, this.lightPosition.xz);
    const waveD = distance(positionWorld.xz, this.waveCenter.xz);
    const age = this.time.sub(this.waveTime);
    const wave = exp(waveD.sub(age.mul(1.5)).pow(2).mul(-4))
      .mul(exp(age.mul(-0.75)))
      .mul(0.36);
    mat.emissiveNode = color('#6fa772')
      .mul(exp(d.mul(-1.6)).mul(0.12).add(wave))
      .add(this.foliageGlow(1.05));
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
    const moss = new THREE.InstancedMesh(shadeByHeight(mossBlade()), mat, count);
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
    const shootGeo = shadeByHeight(mossShoot(), 0.44);
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
    this.buildDew();
  }

  /**
   * Rain left on the carpet. These are the scene's reward for moving the light: each bead
   * is mostly specular, so the whole floor lights up in sequence as the light travels over
   * it. Its own material, not the drop's - that one is fully transmissive, which would put
   * a thousand instances through the transmission pass for beads a few pixels across.
   */
  private buildDew() {
    // A bead of water at night is mostly dark, carrying one hard glint. Lit up as a pale
    // body it reads as polystyrene, so the colour stays dim and the clearcoat does the work.
    const mat = new THREE.MeshPhysicalNodeMaterial({
      color: '#37525c',
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
    });
    const near = distance(positionWorld, this.lightPosition);
    mat.emissiveNode = color('#bfe2ea').mul(exp(near.mul(-2.2)).mul(0.34).add(0.012));
    const count = this.mobile ? 420 : 1100;
    const dew = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, count);
    for (let i = 0; i < count; i++) {
      let x: number, z: number;
      do {
        x = range(-6.5, 6.5);
        z = range(-4.6, 4.4);
      } while (!outsidePool(x, z, 1.05));
      // Beads gather where the moss is thickest, which is the same low-frequency pattern
      // the carpet itself is scattered by.
      const thickness = 0.5 + 0.5 * Math.sin(x * 3.2) * Math.sin(z * 3.7);
      const s = range(0.0055, 0.0155) * (0.55 + thickness * 0.75);
      this.dummy.position.set(x, ground(x, z) + range(0.012, 0.115), z);
      this.dummy.scale.set(s, s * range(0.72, 0.95), s);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      dew.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(dew);
  }

  /**
   * Light arriving through the far side of a leaf, seen when you look back along it. Foliage
   * at night is read mostly this way; without it every blade here was an opaque cutout.
   * A cheap directional approximation, not a subsurface solver.
   */
  private foliageGlow(strength: number, tint = '#a6dc86') {
    const toLight = this.lightPosition.sub(positionWorld),
      dist = toLight.length().max(0.001),
      toCamera = cameraPosition.sub(positionWorld).normalize();
    // Offsetting the sample along the normal spreads the glow across the blade rather than
    // pinning it to an exact back-alignment.
    const carried = toCamera
      .dot(toLight.div(dist).add(normalWorld.mul(0.45)).normalize().negate())
      .saturate()
      .pow(2.6)
      .mul(exp(dist.mul(-1.1)))
      .mul(strength);
    // The moon stands behind and above the clearing, so foliage keeps some of this before
    // the visitor brings a light anywhere near it.
    const moonlit = toCamera
      .dot(vec3(-0.33, 0.77, -0.55).add(normalWorld.mul(0.45)).normalize().negate())
      .saturate()
      .pow(3.4)
      .mul(strength * 0.26);
    return color(tint).mul(carried).add(color('#79b39a').mul(moonlit));
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
      // Wet foliage is a rough leaf under a thin film of water, so the gloss belongs in the
      // clearcoat rather than in the substrate. The film is broken up by the leaf's own
      // relief, which keeps it a sheen instead of one blown mirror highlight.
      clearcoatRoughness: 0.44,
      clearcoatRoughnessMap: this.detail.leafRoughness,
      side: THREE.DoubleSide,
    });
    fernMat.clearcoatNode = sin(uv().x.mul(11.7))
      .mul(cos(uv().y.mul(8.2).add(0.7)))
      .mul(0.5)
      .add(0.5)
      .pow(1.5)
      .mul(0.36)
      .add(0.03);
    fernMat.emissiveNode = this.foliageGlow(1.6);
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
      clearcoatRoughness: 0.42,
      clearcoatRoughnessMap: this.detail.leafRoughness,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    // Water on a leaf beads and runs off unevenly. An even film over the whole blade is
    // what reads as vinyl, so the film itself is patchy, not just its roughness.
    leafMat.clearcoatNode = sin(uv().x.mul(9.3).add(1.2))
      .mul(cos(uv().y.mul(6.4)))
      .mul(0.5)
      .add(0.5)
      .pow(1.5)
      .mul(0.4)
      .add(0.04);
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
    leafMat.emissiveNode = color('#2b5937')
      .mul(exp(leafDistance.mul(-1.7)).mul(0.08).add(float(0.012)))
      .add(this.foliageGlow(1.75));
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
        // Every blade shared one colour and one pitch. Each now ages its own way: some
        // still deep green, some yellowed and thinning, each hanging at its own angle.
        const geo = leafGeometry(
          range(0.55, 1.3),
          range(0.18, 0.35),
          range(0.1, 0.32),
          15,
          8,
          range(-0.04, 0.1),
        );
        const tint = new THREE.Color().setHSL(
          range(0.19, 0.28),
          range(0.3, 0.62),
          range(0.34, 0.72),
        );
        const uvs = geo.attributes.uv,
          shade = new Float32Array(uvs.count * 3);
        for (let v = 0; v < uvs.count; v++) {
          // Margins dry and pale first, so they sit lighter than the middle of the blade.
          const edge = 0.86 + 0.3 * Math.abs(uvs.getX(v) * 2 - 1) ** 2;
          shade[v * 3] = tint.r * edge;
          shade[v * 3 + 1] = tint.g * edge;
          shade[v * 3 + 2] = tint.b * edge;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
        const leaf = new THREE.Mesh(geo, leafMat);
        leaf.position.set(0.1, h * (0.5 + j * 0.2), 0.08);
        leaf.rotation.y = i + j * 2.3 + range(-0.5, 0.5);
        leaf.rotation.x = range(-0.22, 0.3);
        leaf.rotation.z = range(-0.2, 0.2);
        group.add(leaf);
      }
      this.scene.add(group);
      this.vegetation.push(group);
    }
    // A second understory layer adds broad, wind-responsive leaves between the moss and ferns.
    const understoryGeo = leafGeometry(0.72, 0.25, 0.24, 18, 7, 0.08);
    // leafMat reads vertex colours, so this shared geometry needs the margin shading too;
    // it stays neutral overall and lets each instance's own colour carry the variation.
    {
      const uvs = understoryGeo.attributes.uv,
        shade = new Float32Array(uvs.count * 3);
      for (let v = 0; v < uvs.count; v++)
        shade[v * 3] =
          shade[v * 3 + 1] =
          shade[v * 3 + 2] =
            0.88 + 0.28 * Math.abs(uvs.getX(v) * 2 - 1) ** 2;
      understoryGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    }
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
      clearcoat: 0.17,
      clearcoatRoughness: 0.5,
      clearcoatRoughnessMap: this.detail.skinRoughness,
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
      // Caps are still tacky after the rain rather than chalk dry.
      clearcoat: 0.13,
      clearcoatRoughness: 0.55,
      vertexColors: true,
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
      // One shared profile made eight copies of a single mushroom at different scales.
      // Age each one instead: young caps stay domed and tucked, older ones broaden and
      // lift their margin, and each stem leans its own way under its own crown.
      const spread = range(0.84, 1.26),
        rise = range(0.76, 1.32),
        flare = range(-0.02, 0.1),
        leanX = range(-0.11, 0.11),
        leanZ = range(-0.09, 0.09),
        rim = 0.57 * spread,
        capBase = 1.03;
      group.add(
        tube(
          [
            new THREE.Vector3(),
            new THREE.Vector3(leanX * 0.55 - 0.05, 0.55, leanZ * 0.55 + 0.02),
            new THREE.Vector3(leanX, 1.05, leanZ),
          ],
          0.075 * range(0.8, 1.2) * (0.62 + spread * 0.38),
          stemMat,
          16,
        ),
      );
      const profile = [
        new THREE.Vector2(0, capBase + 0.33 * rise),
        new THREE.Vector2(0.12 * spread, capBase + 0.34 * rise),
        new THREE.Vector2(0.25 * spread, capBase + 0.29 * rise),
        new THREE.Vector2(0.42 * spread, capBase + 0.18 * rise),
        new THREE.Vector2(0.55 * spread, capBase + 0.045 * rise + flare),
        new THREE.Vector2(rim, capBase + flare),
        new THREE.Vector2(0.49 * spread, capBase - 0.02),
        new THREE.Vector2(0.1 * spread, capBase - 0.005),
      ];
      const capGeometry = new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(36), 72);
      const points = capGeometry.attributes.position,
        coords = capGeometry.attributes.uv;
      const variation = x * 13 + z * 7;
      // Pigment sits heaviest over the centre of a cap and thins toward the margin.
      const tint = new THREE.Color().setHSL(
          range(0.05, 0.11),
          range(0.12, 0.33),
          range(0.68, 0.95),
        ),
        shade = new Float32Array(points.count * 3);
      for (let i = 0; i < points.count; i++) {
        const px = points.getX(i),
          py = points.getY(i),
          pz = points.getZ(i),
          a = Math.atan2(px, pz),
          radius = Math.hypot(px, pz),
          edge = radius / rim;
        const wobble =
          1 + Math.sin(a * 5 + variation) * 0.035 + Math.cos(a * 9 - variation) * 0.016;
        points.setXYZ(
          i,
          px * wobble,
          py + Math.sin(a * 6 + variation) * 0.013 * edge + Math.sin(a * 23) * 0.007 * edge ** 4,
          pz * wobble,
        );
        coords.setXY(i, (a + Math.PI) / (Math.PI * 2), edge);
        const pigment = 0.7 + 0.36 * Math.min(1, edge) ** 0.8;
        shade[i * 3] = tint.r * pigment;
        shade[i * 3 + 1] = tint.g * pigment;
        shade[i * 3 + 2] = tint.b * pigment;
      }
      capGeometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
      capGeometry.computeVertexNormals();
      // Cap and gills ride the stem top together, tilted off true like a real crown.
      const crown = new THREE.Group();
      crown.position.set(leanX, 0, leanZ);
      crown.rotation.set(range(-0.1, 0.1), rand() * 6, range(-0.1, 0.1));
      crown.add(new THREE.Mesh(capGeometry, capMat));
      const gills: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        gills.push(
          tube(
            [
              new THREE.Vector3(
                Math.cos(a) * 0.1 * spread,
                capBase - 0.01,
                Math.sin(a) * 0.1 * spread,
              ),
              new THREE.Vector3(
                Math.cos(a) * 0.49 * spread,
                capBase - 0.016 + flare * 0.8,
                Math.sin(a) * 0.49 * spread,
              ),
            ],
            0.007,
            gillMat,
            1,
          ).geometry,
        );
      }
      crown.add(new THREE.Mesh(mergeGeometries(gills), gillMat));
      gills.forEach((g) => g.dispose());
      group.add(crown);
      this.scene.add(group);
    }
  }

  private buildHero() {
    const mat = new THREE.MeshPhysicalNodeMaterial({
      map: this.textures.leaf,
      // Relief drawn from the same vein network as the colour map, so the veins the eye can
      // see are the ones that catch light. The shared surface map's ridges sit elsewhere.
      bumpMap: this.textures.leafRelief,
      bumpScale: 0.055,
      roughnessMap: this.detail.leafRoughness,
      // The old tint washed the painted leaf out to a flat pale sheet.
      color: '#aebd8c',
      roughness: 0.8,
      specularIntensity: 0.42,
      clearcoat: 0.07,
      clearcoatRoughness: 0.38,
      side: THREE.DoubleSide,
      sheen: 0.12,
      sheenColor: '#a6ba70',
      sheenRoughness: 0.5,
    });
    // A leaf underside still catches bounce light at night. Without a floor under it the
    // back faces crushed to pure black and read as a hole torn in the blade.
    mat.emissiveNode = color('#2c4030').mul(0.2).add(this.foliageGlow(1.2));
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
      // The hero drop is about 0.08 across, so a thickness of 0.62 had light crossing a body
      // nearly ten times its size and coming out grey. Same mistake the resting beads carried.
      thickness: 0.1,
      roughness: 0.015,
      ior: 1.333,
      metalness: 0,
      clearcoat: 0.95,
      clearcoatRoughness: 0.02,
      attenuationColor: '#e4f4f1',
      attenuationDistance: 11,
      envMapIntensity: 1.9,
    });
    const dropGeo = waterDropGeometry();
    this.heroDrop = new THREE.Mesh(dropGeo, waterMat);
    this.heroDrop.position.set(0, -0.235, 3.6);
    this.heroDrop.scale.set(0.28, 0.42, 0.28);
    // The drop is a transient event, so it should never hang from the tip in the idle scene.
    this.heroDrop.visible = false;
    this.heroLeaf.add(this.heroDrop);
    // Once it is off the leaf it is no longer a pendant. The clinging shape has its neck
    // and point built into the lathe, which no amount of squashing hides, so the falling
    // bead is a sphere of the same volume, shaped entirely by how it is scaled.
    this.fallingDrop = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), waterMat);
    this.fallingDrop.visible = false;
    this.scene.add(this.fallingDrop);
    // Water running across a leaf is a flattened dome wetting the surface, drawn out along
    // the direction it travels - not the pendant it becomes only once it hangs at the tip.
    this.runningDrop = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), waterMat);
    this.runningDrop.visible = false;
    this.heroLeaf.add(this.runningDrop);
    // A low, stretched lobe bridges the bead to the wet leaf while it is moving.
    this.dripTail = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), waterMat);
    this.dripTail.visible = false;
    this.heroLeaf.add(this.dripTail);
    // Water left behind on a leaf is a wet film, not a rod lying across it. The trail is a
    // narrow ribbon laid on the blade, each edge sampling the surface at its own offset so
    // it follows the cup instead of cutting through it.
    const trailSurface = (slide: number, x: number) => {
      const halfWidth = Math.max(0.16, Math.pow(Math.sin(slide * Math.PI), 0.82) * 1.03);
      return (
        Math.sin(slide * Math.PI) * 0.52 -
        Math.pow(slide, 5) * 0.52 * 0.6 +
        (x / halfWidth) * (x / halfWidth) * halfWidth * 0.2 +
        0.012
      );
    };
    const trailVerts: number[] = [],
      trailUvs: number[] = [],
      trailIndex: number[] = [];
    for (let i = 0; i < 30; i++) {
      const along = i / 29,
        slide = 0.52 + along * 0.46,
        pathProgress = (slide - 0.46) / 0.5,
        pathEnvelope = Math.sin(pathProgress * Math.PI),
        centre =
          0.018 +
          Math.sin(pathProgress * Math.PI * 3.1 + 0.8) * 0.09 * pathEnvelope +
          Math.sin(pathProgress * Math.PI * 1.2) * 0.02,
        // The smear is widest mid-run and narrows as the bead leaves and reaches the tip.
        halfSpan = 0.03 + 0.032 * Math.sin(Math.min(1, along * 1.25) * Math.PI);
      for (const side of [-1, 1]) {
        const x = centre + side * halfSpan;
        trailVerts.push(x, trailSurface(slide, x), slide * 3.65);
        trailUvs.push(along, side * 0.5 + 0.5);
      }
      if (i < 29) {
        const a = i * 2;
        trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailVerts, 3));
    trailGeo.setAttribute('uv', new THREE.Float32BufferAttribute(trailUvs, 2));
    trailGeo.setIndex(trailIndex);
    trailGeo.computeVertexNormals();
    const trailMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#8fc6a8',
      roughness: 0.2,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Fades in behind the bead, and softens across the ribbon so it has no cut edge.
    trailMat.opacityNode = smoothstep(0.02, 0.16, this.dripProgress.sub(uv().x))
      .mul(smoothstep(0.5, 0.16, uv().y.sub(0.5).abs()))
      .mul(0.46);
    this.dripTrail = new THREE.Mesh(trailGeo, trailMat);
    this.dripTrail.visible = false;
    this.heroLeaf.add(this.dripTrail);
    this.dripBeads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), waterMat, 6);
    this.dripBeads.visible = false;
    this.heroLeaf.add(this.dripBeads);
    // The beads used to share the hero drop's water, whose 0.62 thickness is an order above
    // their own diameter: they attenuated as though light crossed a body far larger than
    // they are and came out milky. Their own water, thin enough to stay clear and act as
    // the small lens a bead on a leaf actually is.
    const beadMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#ffffff',
      transmission: 1,
      thickness: 0.14,
      roughness: 0.02,
      ior: 1.333,
      metalness: 0,
      clearcoat: 0.92,
      clearcoatRoughness: 0.02,
      attenuationColor: '#e8f6f2',
      attenuationDistance: 14,
      envMapIntensity: 2.1,
    });
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), beadMat, 43);
    for (let i = 0; i < 43; i++) {
      const t = range(0.12, 0.84),
        w = Math.pow(Math.sin(t * Math.PI), 0.82) * 1.03,
        // Rain on a blade gathers toward the cup and runs along the midrib, so the spread
        // is weighted inward rather than sprinkled evenly across the whole surface.
        q = Math.sign(range(-1, 1)) * Math.pow(rand(), 1.5) * 0.86,
        // Many small beads and a few large ones, rather than one middling size repeated.
        s = 0.009 + Math.pow(rand(), 2.4) * 0.05;
      // These have to be read off the leaf the scene actually builds. They were being
      // placed on an older, shallower surface with the cup inverted, which left them
      // hanging in the air beside the blade instead of resting in it.
      this.dummy.position.set(
        q * w * (1 + 0.045 * Math.sin(t * 67 + q * 1.7) + 0.02 * Math.sin(t * 113)),
        Math.sin(t * Math.PI) * 0.52 +
          q * q * w * 0.2 * Math.min(1, t / 0.18) -
          Math.pow(t, 5) * 0.52 * 0.6 +
          Math.sin(t * 31 + q * 2) * Math.abs(q) * w * 0.045 * Math.min(1, t / 0.18) +
          s * 0.34,
        t * 3.65,
      );
      // Water on a leaf wets down into a shallow lens, it does not sit up like a marble.
      this.dummy.scale.set(s * 1.12, s * 0.46, s * 1.12);
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
      transmission: 0.2,
      thickness: 0.22,
      ior: 1.333,
      attenuationColor: '#1d5b61',
      attenuationDistance: 2.8,
      specularIntensity: 0.62,
      side: THREE.DoubleSide,
    });
    water.name = 'pool-water';
    // A wavefront measured as plain radius is a perfect circle, which is the one thing real
    // water never makes. Warping the radius by a smooth function of direction bends the
    // front without breaking it: the offset is a unit vector, so its components sweep like
    // cos and sin as the angle goes round, and combining them gives several harmonics.
    const bentRadius = (centre: typeof this.rippleCenter, phase: number) => {
      const offset = positionWorld.xz.sub(centre),
        radius = offset.length(),
        heading = offset.div(radius.max(0.0001));
      return radius.mul(
        float(1)
          .add(sin(heading.x.mul(5.7).add(heading.y.mul(3.1)).add(phase)).mul(0.052))
          .add(
            sin(
              heading.y
                .mul(6.9)
                .sub(heading.x.mul(2.3))
                .add(phase * 1.7),
            ).mul(0.038),
          )
          .add(sin(heading.x.mul(11.3).sub(heading.y.mul(9.1))).mul(0.018)),
      );
    };
    const d = bentRadius(this.rippleCenter, 0.6),
      age = this.time.sub(this.rippleTime),
      touchDistance = bentRadius(this.touchCenter, 2.3),
      touchAge = this.time.sub(this.touchTime);
    // These used to be backed up by drawn rings laid over the water, which expanded at a
    // different speed from the wavefront here and read as strokes rather than as water.
    // The rings are gone, so the surface has to carry the whole event: a wider packet with
    // several crests, deep enough that the moon sheen rides over it as it travels.
    const ripple = sin(d.mul(20).sub(age.mul(8.5)))
      .mul(exp(d.sub(age.mul(0.9)).pow(2).mul(-2.1)))
      .mul(exp(age.mul(-0.5)))
      .mul(0.2);
    // A fingertip on the surface is not a drop falling into it. This was carrying nearly
    // the same weight as the impact above and arriving at full strength on the first frame,
    // so it landed as a shove rather than a touch: a quarter of the amplitude, a tighter
    // and slower packet with a finer wavelength, and a brief rise instead of an onset.
    const touchRipple = sin(touchDistance.mul(32).sub(touchAge.mul(9.5)))
      .mul(exp(touchDistance.sub(touchAge.mul(0.7)).pow(2).mul(-8)))
      .mul(exp(touchAge.mul(-0.72)))
      .mul(float(1).sub(exp(touchAge.mul(-14))))
      .mul(0.095);
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
    // A fine, faster band on top. The surface was smooth enough that moonlight landed on it
    // as one even sheet, which is what made the pool read as dusty glass when nothing was
    // lighting it from nearby; glitter needs slope variation to break the reflection up.
    // Axis-aligned products at related frequencies moire into visible stripes across the
    // surface, so these run at angles to each other on deliberately unrelated frequencies.
    const chop = sin(
      positionWorld.x.mul(13.7).add(positionWorld.z.mul(5.3)).add(this.time.mul(1.05)),
    )
      .mul(cos(positionWorld.x.mul(-6.1).add(positionWorld.z.mul(17.9)).sub(this.time.mul(0.83))))
      .mul(0.62)
      .add(
        sin(positionWorld.x.mul(29.3).sub(positionWorld.z.mul(24.1)).add(this.time.mul(1.47))).mul(
          0.38,
        ),
      )
      .mul(0.017)
      .mul(this.motion);
    const normalX = ripple.add(touchRipple).add(still).add(swell).add(crossWave).add(chop),
      normalZ = ripple
        .mul(0.72)
        .add(touchRipple.mul(0.78))
        .add(still.mul(0.8))
        .add(swell.mul(0.75))
        .sub(crossWave)
        .add(chop.mul(0.84));
    const surfaceNormal = vec3(normalX, float(1), normalZ).normalize();
    water.normalNode = surfaceNormal.transformDirection(this.camera.matrixWorldInverse);
    // Moonlight glittering off the chop. Computed here rather than left to the lighting
    // pipeline so the pool keeps its own structure with no light anywhere near it.
    const toEye = cameraPosition.sub(positionWorld).normalize(),
      bounced = surfaceNormal.mul(surfaceNormal.dot(toEye).mul(2)).sub(toEye),
      moonAim = vec3(-0.33, 0.77, -0.55),
      aligned = bounced.dot(moonAim).saturate(),
      // A broad sheen rather than point sparkle: from these angles the reflected ray only
      // ever comes within about 0.78 of the moon, and a tight exponent on that is zero.
      glitter = aligned.pow(10).mul(0.22).add(aligned.pow(36).mul(1.1));
    // Reconstruct the basin floor from the same profile the terrain mesh uses, so the
    // water knows how deep it is at every point instead of being a single flat tone.
    const bankRise = float(0.2)
      .add(sin(positionWorld.x.mul(1.7).add(positionWorld.z)).mul(0.16))
      .add(cos(positionWorld.z.mul(2.7).sub(positionWorld.x)).mul(0.09));
    const shoreRamp = positionWorld.xz
      .sub(vec2(0, POOL_CENTER_Z))
      .div(vec2(POOL_RADIUS_X, POOL_RADIUS_Z))
      .length();
    const floorHeight = shoreRamp.sub(0.83).mul(2.3).clamp(0, 1).mul(bankRise).sub(0.185);
    const depth = float(WATER_LEVEL).sub(floorHeight).max(0);
    const depthMix = smoothstep(0.012, 0.115, depth);
    // Grazing angles reflect, steep ones look into the water: the difference is most of
    // what separates a pool from a sheet of tinted glass.
    const fresnel = cameraPosition.sub(positionWorld).normalize().y.abs().oneMinus().pow(3.2);
    const shimmer = sin(
      positionWorld.x.mul(5.4).add(positionWorld.z.mul(3.8)).add(this.time.mul(0.32)),
    )
      .mul(0.5)
      .add(0.5);
    // The bed read through the water. Without it the body was a smooth tone ramp, which is
    // what left the pool looking like dusty glass whenever nothing lit it from nearby: a
    // shallow pool is mostly read by the litter and silt visible through it.
    // What you actually read a ripple by in a shallow pool is the bed bending underneath it
    // and the reflection breaking up, not the shading of the surface itself.
    const disturbance = ripple.add(touchRipple);
    const bed = texture(
      this.naturalSurfaces.maps.groundColor,
      positionWorld.xz
        .mul(0.42)
        .add(vec2(0.31, 0.12))
        .add(vec2(disturbance.mul(0.55), disturbance.mul(0.42))),
    ).rgb.mul(color('#7d9a86'));
    const deepTone = mix(color('#06202a'), color('#2d5d5b'), shimmer.mul(0.16).add(0.14)),
      shallowTone = mix(color('#26362c'), color('#47624b'), shimmer.mul(0.2).add(0.22)),
      // Light reaching the bed and coming back falls away quickly with depth.
      bedThrough = exp(depth.mul(-11)).mul(0.85),
      waterTone = mix(shallowTone, deepTone, depthMix).add(bed.mul(bedThrough));
    // Tilting the surface changes how much sky and how much bed each point shows, so a
    // passing wave brightens along one face and darkens along the other. Over the middle of
    // the pool, where the bed is too deep to read and the reflection is weak at this angle,
    // this is the only channel with enough contrast to carry the wave at all.
    const waveShading = float(1).add(disturbance.mul(2.6)).max(0.15);
    const lightThroughWater = exp(distance(positionWorld.xz, this.lightPosition.xz).mul(-1.35)).mul(
        0.26,
      ),
      litWaterTone = mix(waterTone, color('#78c4ae'), lightThroughWater).mul(waveShading);
    water.emissiveNode = color('#4f978a')
      .mul(lightThroughWater.mul(depthMix).mul(0.2))
      .add(color('#cfe6f2').mul(glitter.mul(depthMix.mul(0.55).add(0.45))));
    if (!this.mobile) {
      const reflection = reflector({ resolutionScale: 1, bounces: false });
      reflection.target.rotation.x = -Math.PI / 2;
      reflection.target.position.y = -0.035;
      this.scene.add(reflection.target);
      reflection.uvNode = screenUV
        .flipX()
        .add(vec2(disturbance.mul(0.16).add(still), disturbance.mul(0.1)));
      water.colorNode = mix(litWaterTone, reflection.rgb, fresnel.mul(0.55).add(0.07));
    } else {
      water.colorNode = litWaterTone;
    }
    // The sheet reaches past the old machined oval and dissolves where it runs thin, so the
    // shoreline is drawn by the ground contour rather than by the edge of a disc.
    water.transparent = true;
    water.opacityNode = smoothstep(0.003, 0.042, depth)
      .mul(smoothstep(1.21, 1.02, shoreRamp))
      .mul(fresnel.mul(0.2).add(0.8));
    const geo = new THREE.CircleGeometry(1, 96);
    geo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(geo, water);
    this.waterMesh.scale.set(POOL_RADIUS_X * 1.22, 1, POOL_RADIUS_Z * 1.22);
    this.waterMesh.position.set(0, WATER_LEVEL, POOL_CENTER_Z);
    this.scene.add(this.waterMesh);
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
      clearcoat: 0.18,
      clearcoatRoughness: 0.48,
      clearcoatRoughnessMap: this.detail.skinRoughness,
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
      clearcoat: 0.16,
      clearcoatRoughness: 0.5,
      clearcoatRoughnessMap: this.detail.skinRoughness,
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
      // A damp shell, not a glazed one. Set high and tight this threw hard white streaks
      // and read as lacquered ceramic - a shell in a dark wood carries a soft sheen along
      // its whorl, nothing more, so the film is weak and its highlight deliberately broad.
      clearcoat: 0.2,
      clearcoatRoughness: 0.46,
      clearcoatRoughnessMap: this.detail.shellRoughness,
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

  /**
   * Mist lying on the wet ground. Stacked horizontal slices rather than a volumetric pass:
   * the scene is read from above the clearing, so slices are seen near enough face-on to
   * hold together, and the whole thing costs fill rate and nothing else.
   */
  private buildGroundMist() {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
    const p = positionWorld,
      drift = this.time.mul(this.motion);
    // Three drifting bands multiplied together break into wisps instead of an even wash.
    const band = (fx: number, fz: number, sx: number, sz: number, phase: number) =>
      sin(p.x.mul(fx).add(drift.mul(sx)).add(phase))
        .mul(cos(p.z.mul(fz).add(drift.mul(sz))))
        .mul(0.5)
        .add(0.5);
    const density = band(0.85, 1.05, 0.07, 0.05, 0)
      .mul(band(2.4, 1.9, -0.06, 0.09, 1.7))
      .mul(band(0.42, 0.55, 0.035, -0.045, 3.1))
      .pow(1.1);
    const lit = exp(distance(p.xz, this.lightPosition.xz).mul(-0.85));
    mat.colorNode = mix(color('#5d87a6'), color('#c8a577'), lit.mul(0.85));
    mat.opacityNode = density
      // Low-lying, gone by head height.
      .mul(smoothstep(0.46, -0.08, p.y))
      // Weighted behind the pool rather than over it. Mist really does gather on water,
      // but stacked across the basin it washed the one element the eye should land on, so
      // it sits in the band behind instead, where haze separates the log from the trees.
      .mul(smoothstep(2.2, -1.6, p.z).mul(0.82).add(0.18))
      .mul(
        smoothstep(
          0.55,
          1.25,
          positionWorld.xz
            .sub(vec2(0, POOL_CENTER_Z))
            .div(vec2(POOL_RADIUS_X, POOL_RADIUS_Z))
            .length(),
        )
          .mul(0.72)
          .add(0.28),
      )
      // Held to the clearing, and kept off the very front of the lens.
      .mul(smoothstep(11, 4.5, p.xz.length()))
      .mul(smoothstep(1.4, 3.2, distance(p, cameraPosition)))
      .mul(lit.mul(0.7).add(0.55))
      .mul(3.4);
    // Each slice is additive over a large part of the frame, so this is all fill rate:
    // five slices on a 26x26 quad more than halved the frame rate. Three discs cropped to
    // where the radial fade actually reaches cost a fraction of that for the same look.
    const slices = this.mobile ? 2 : 3;
    const disc = new THREE.CircleGeometry(11.4, 40);
    disc.rotateX(-Math.PI / 2);
    for (let i = 0; i < slices; i++) {
      const slice = new THREE.Mesh(disc, mat);
      slice.position.set(0, -0.05 + (i / slices) * 0.42, 0.4);
      slice.renderOrder = 3;
      this.scene.add(slice);
    }
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
    // This was one rigid plate four times the body's length, run through the middle of the
    // insect on a glossy material, so it caught a specular and read as a white rod. A beating
    // wing at this scale is a smudge of light, not a surface: two of them, each shorter than
    // the body, matte enough to catch no highlight, and faint enough to blur as they go.
    this.fireflyWing = new THREE.Group();
    const wingMat = new THREE.MeshBasicNodeMaterial({
      color: '#c3d6dd',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), wingMat);
      wing.scale.set(0.026, 0.0025, 0.014);
      wing.position.set(side * 0.024, 0.006, -0.004);
      wing.rotation.y = side * 0.5;
      this.fireflyWing.add(wing);
    }
    this.firefly.add(this.fireflyWing);
    this.fireflyGlow = glow;
    this.fireflyBulb = bulb;
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
    this.heroDrop.visible = false;
    this.runningDrop.visible = false;
    this.dripTail.visible = false;
    this.snailFocusUntil = 0;
    return true;
  }
  focusSnail() {
    this.snailFocusUntil = this.elapsed + 12;
    this.snailReveal = 1;
    this.zoom = 0.6;
    this.discoverSnail();
  }
  cycleView() {
    this.viewIndex = (this.viewIndex + 1) % 3;
    this.snailFocusUntil = 0;
    this.zoom = this.viewIndex === 2 ? 0.48 : this.viewIndex === 1 ? 0.2 : 0;
    return ['The clearing', 'Waterline', 'Leaf study'][this.viewIndex];
  }
  /**
   * Swing the view around the clearing. Pitch is clamped well short of overhead and of the
   * waterline: past either the framing falls apart, and there is nothing worth seeing there.
   */
  private swing(dx: number, dy: number) {
    this.orbit.yaw = THREE.MathUtils.clamp(this.orbit.yaw - dx * 0.0042, -0.85, 0.85);
    this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - dy * 0.0028, -0.26, 0.46);
    this.snailFocusUntil = 0;
  }

  private touchWater(point: THREE.Vector3) {
    this.touchCenter.value.set(point.x, point.z);
    this.touchTime.value = this.elapsed;
    this.waveCenter.value.copy(point);
    this.waveTime.value = this.elapsed;
  }
  reset() {
    this.zoom = 0;
    this.orbit.yaw = 0;
    this.orbit.pitch = 0;
    this.viewIndex = 0;
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
            d = Math.hypot(a.x - b.x, a.y - b.y),
            centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (this.pinchDistance)
            this.zoom = THREE.MathUtils.clamp(this.zoom + (d - this.pinchDistance) * 0.008, 0, 1.4);
          // Two fingers spreading zooms, two fingers travelling swings the view. Touch keeps
          // one finger for the light, which is the interaction the scene is built around.
          if (this.pinchCentre)
            this.swing(centre.x - this.pinchCentre.x, centre.y - this.pinchCentre.y);
          this.pinchCentre = centre;
          this.pinchDistance = d;
          return;
        }
        // A held button means the visitor is looking around, so the light stays put: on a
        // mouse the light already follows the bare pointer, which leaves dragging free.
        if (this.dragOrigin && event.pointerType === 'mouse') {
          this.swing(event.clientX - this.dragOrigin.x, event.clientY - this.dragOrigin.y);
          this.dragOrigin = { x: event.clientX, y: event.clientY };
          this.cursor.style.left = `${event.clientX}px`;
          this.cursor.style.top = `${event.clientY}px`;
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
        this.dragOrigin = { x: event.clientX, y: event.clientY };
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
        this.dragOrigin = null;
        if (this.gesture.size === 0) {
          this.pinchDistance = 0;
          this.pinchCentre = null;
        }
        if (
          wasPinch ||
          Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 9
        )
          return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        if (this.raycaster.intersectObject(this.heroLeaf, true).length) this.drop();
        else if (this.raycaster.intersectObject(this.snailHit).length) this.focusSnail();
        else {
          const waterHit = this.raycaster.intersectObject(this.waterMesh).at(0);
          // The sheet now extends under the bank; only the part that is actually wet responds.
          if (waterHit && !outsidePool(waterHit.point.x, waterHit.point.z, 1.02))
            this.touchWater(waterHit.point);
          else {
            this.waveCenter.value.copy(this.targetLight);
            this.waveTime.value = this.elapsed;
          }
        }
      },
      options,
    );
    this.container.addEventListener(
      'pointercancel',
      (event) => {
        this.gesture.delete(event.pointerId);
        this.dragOrigin = null;
        this.pinchCentre = null;
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
        // deltaY arrives in pixels, lines or pages depending on the device and browser, so
        // the raw value is not comparable between them: a line-mode wheel notch reports ~3
        // where a pixel-mode one reports ~100. Normalise to lines so a notch means the same
        // everywhere, and cap a single event only against absurd spikes - a deliberate hard
        // scroll should still cross most of the range in one go.
        const lines =
          event.deltaMode === 1
            ? event.deltaY
            : event.deltaMode === 2
              ? event.deltaY * 12
              : event.deltaY / 33;
        this.zoom = THREE.MathUtils.clamp(
          this.zoom + THREE.MathUtils.clamp(lines, -12, 12) * 0.05,
          0,
          1.4,
        );
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
        if (
          event.shiftKey &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
        ) {
          event.preventDefault();
          this.swing(
            event.key === 'ArrowLeft' ? -26 : event.key === 'ArrowRight' ? 26 : 0,
            event.key === 'ArrowUp' ? -26 : event.key === 'ArrowDown' ? 26 : 0,
          );
          return;
        }
        // Looking closer had no keyboard path at all: it was wheel or pinch only.
        if (['+', '=', '-', '_'].includes(event.key)) {
          event.preventDefault();
          this.zoom = THREE.MathUtils.clamp(
            this.zoom + (event.key === '-' || event.key === '_' ? -0.18 : 0.18),
            0,
            1.4,
          );
          this.snailFocusUntil = 0;
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
    const ease = 1 - Math.exp(-dt * 6);
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.zoom, ease);
    const focus = this.snailFocusUntil > t;
    // The camera used to smooth a value that was already smoothed, at half rate, so scroll
    // took the better part of a second to land. These are separate on purpose: the frame
    // follows quickly, the parallax offset settles slowly so a twitchy mouse cannot shake
    // it, and the push in to the snail stays deliberate.
    const glide = 1 - Math.exp(-dt * (focus ? 2.8 : 4.5)),
      drift = 1 - Math.exp(-dt * 2.6);
    this.parallax.x += (this.pointer.x - this.parallax.x) * drift;
    this.parallax.y += (this.pointer.y - this.parallax.y) * drift;
    const cam = this.mobile
      ? this.viewIndex === 1
        ? new THREE.Vector3(-1.1, 2.15, 9.25 - this.currentZoom * 2.1)
        : this.viewIndex === 2
          ? new THREE.Vector3(2.7, 3.55, 7.6 - this.currentZoom * 1.8)
          : new THREE.Vector3(1.6, 2.9, 10.1 - this.currentZoom * 2.3)
      : this.viewIndex === 1
        ? new THREE.Vector3(
            -2.2 + this.parallax.x * 0.42 * motion,
            1.8 + this.parallax.y * 0.22 * motion,
            7.25 - this.currentZoom * 2.0,
          )
        : this.viewIndex === 2
          ? new THREE.Vector3(
              2.7 + this.parallax.x * 0.38 * motion,
              3.45 + this.parallax.y * 0.26 * motion,
              6.9 - this.currentZoom * 2.2,
            )
          : new THREE.Vector3(
              0.1 + this.parallax.x * 0.55 * motion,
              2.65 + this.parallax.y * 0.3 * motion,
              8.6 - this.currentZoom * 2.5,
            );
    // The look target follows a fraction of the camera's swing. Without it the wider
    // parallax would slide the whole composition sideways; with it the camera leans around
    // the clearing and the foreground travels against the distance, which is the part that
    // actually reads as being somewhere.
    const lean = this.mobile ? 0 : this.parallax.x * 0.16 * motion;
    const target =
      this.viewIndex === 1
        ? new THREE.Vector3(
            0.15 + lean,
            0.48 - this.currentZoom * 0.08,
            1.1 + this.currentZoom * 0.2,
          )
        : this.viewIndex === 2
          ? new THREE.Vector3(2.35 + lean, 2.35 - this.currentZoom * 0.12, -0.8)
          : new THREE.Vector3(
              (this.mobile ? 0.65 : 0.4) + lean,
              1.45 - this.currentZoom * 0.22,
              0.2 + this.currentZoom * 0.15,
            );
    if (focus) {
      // Looking across the water keeps the sightline clear: the old approach came in
      // over the bank, so undergrowth crossed in front of the one thing being shown.
      if (this.mobile) {
        // A narrow portrait frame cropped the head and tentacles, so it stands back.
        cam.set(1.78, 1.13, 4.06);
        target.set(2.68, 0.19, 1.5);
      } else {
        cam.set(2.05, 0.86, 3.32);
        target.set(2.78, 0.17, 1.5);
      }
    }
    // Apply the visitor's swing by rotating the framing around what it is looking at, so
    // the subject stays centred and only the angle on to it changes.
    this.orbitEased.yaw += (this.orbit.yaw - this.orbitEased.yaw) * glide;
    this.orbitEased.pitch += (this.orbit.pitch - this.orbitEased.pitch) * glide;
    if (
      !focus &&
      (Math.abs(this.orbitEased.yaw) > 1e-4 || Math.abs(this.orbitEased.pitch) > 1e-4)
    ) {
      const offset = cam.clone().sub(target);
      offset.applyAxisAngle(UP, this.orbitEased.yaw);
      const right = new THREE.Vector3().crossVectors(UP, offset).normalize();
      offset.applyAxisAngle(right, this.orbitEased.pitch);
      // Never let the swing drop the camera to or below the waterline.
      offset.y = Math.max(offset.y, 0.55);
      cam.copy(target).add(offset);
    }
    if (this.frame === 0 || this.reducedMotion.matches) {
      this.parallax.copy(this.pointer);
      this.orbitEased.yaw = this.orbit.yaw;
      this.orbitEased.pitch = this.orbit.pitch;
      this.camera.position.copy(cam);
      this.lookAt.copy(target);
    } else {
      this.camera.position.lerp(cam, glide);
      this.lookAt.lerp(target, glide);
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
    // Fireflies pulse rather than shine steadily. Shaping the sine leaves it dim for most of
    // the cycle and swells briefly, which is the rhythm that reads as a living signal.
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 1.15 * motion), 2.2);
    this.guideLight.intensity = 0.62 + pulse * 1.25;
    this.fireflyBulb.scale.setScalar(0.72 + pulse * 0.5);
    this.fireflyGlow.scale.setScalar(0.42 + pulse * 0.46);
    // The two wings beat against each other rather than sweeping as one plate.
    const beat = Math.sin(t * 67 * motion) * 0.7;
    this.fireflyWing.children[0].rotation.z = beat;
    this.fireflyWing.children[1].rotation.z = -beat;
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
    const slideDuration = 2.45,
      // The bead used to switch from sliding to falling in a single frame, and the two
      // states did not agree: its height tripled and its width halved on that frame. It now
      // gathers at the tip first, rolls over it and draws out into a pendant, so the shape
      // the fall begins on is the shape the hang ended on.
      hangDuration = 0.5,
      fallDuration = 0.72,
      slideStart = 0.46,
      slideLength = 0.5,
      surfaceY = (slide: number, x: number) => {
        const halfWidth = Math.max(0.16, Math.pow(Math.sin(slide * Math.PI), 0.82) * 1.03),
          edgeLift = (x / halfWidth) * (x / halfWidth) * halfWidth * 0.2;
        return Math.sin(slide * Math.PI) * 0.52 - Math.pow(slide, 5) * 0.52 * 0.6 + edgeLift;
      },
      pathX = (slide: number, phase: number) => {
        const pathProgress = THREE.MathUtils.clamp((slide - slideStart) / slideLength, 0, 1),
          pathEnvelope = Math.sin(pathProgress * Math.PI);
        return (
          0.018 +
          Math.sin(pathProgress * Math.PI * 3.1 + phase * 1.8) * 0.09 * pathEnvelope +
          Math.sin(pathProgress * Math.PI * 1.2) * 0.02
        );
      };
    const fallStart = slideDuration + hangDuration;
    this.dripProgress.value =
      age < 0.12
        ? 0
        : age < slideDuration
          ? THREE.MathUtils.clamp((age - 0.12) / (slideDuration - 0.12), 0, 1)
          : age < fallStart
            ? 1
            : // Dries back from the tip once the drop has gone, rather than blinking out.
              Math.max(0, 1 - (age - fallStart) / (fallDuration * 1.3));
    this.dripTrail.visible = age >= 0.12 && this.dripProgress.value > 0.002;
    this.dripBeads.visible = age >= 0.04 && age < slideDuration;
    this.dripTail.visible = age >= 0.04 && age < slideDuration;
    if (age < slideDuration) {
      const progress = THREE.MathUtils.clamp(age / slideDuration, 0, 1),
        eased = progress * progress * (3 - 2 * progress),
        pathEnvelope = Math.sin(progress * Math.PI),
        microSlip = Math.sin(progress * Math.PI * 5.2 + t * 1.35) * 0.014 * pathEnvelope,
        slide = THREE.MathUtils.clamp(
          slideStart + eased * slideLength + microSlip,
          slideStart,
          0.98,
        ),
        x = pathX(slide, t),
        y = surfaceY(slide, x),
        velocity = 0.48 + 0.52 * Math.sin(progress * Math.PI),
        birth = THREE.MathUtils.clamp(age / 0.24, 0, 1),
        birthEase = birth * birth * (3 - 2 * birth),
        pulse = 1 + Math.sin(t * 7.4 + progress * 5) * 0.06 * velocity;
      this.runningDrop.visible = birthEase > 0.005;
      this.heroDrop.visible = false;
      const across = 0.098 * pulse * birthEase,
        height = 0.044 * pulse * birthEase,
        along = (0.108 + velocity * 0.03) * pulse * birthEase;
      this.runningDrop.scale.set(across, height, along);
      // Sunk very slightly into the blade so it wets the surface instead of resting on it.
      this.runningDrop.position.set(x, y + height * 0.42, slide * 3.65);
      // A bead running down a surface does not tumble; it lies along the slope it is on.
      const ahead = slide + 0.02,
        slope = Math.atan2(surfaceY(ahead, pathX(ahead, t)) - y, (ahead - slide) * 3.65);
      this.runningDrop.rotation.set(-slope, 0, 0);

      // A sliding bead drags a short neck behind it, roughly its own length - not the
      // ten-diameter tube this used to stretch into.
      const tailLength = 0.032 + velocity * 0.042,
        tailBehind = Math.max(slideStart, slide - tailLength),
        tailFront = Math.max(tailBehind + 0.012, slide - 0.008),
        behindX = pathX(tailBehind, t - 0.15),
        frontX = pathX(tailFront, t),
        behindY = surfaceY(tailBehind, behindX) + 0.035,
        frontY = surfaceY(tailFront, frontX) + 0.035,
        tailSpan = (tailFront - tailBehind) * 3.65;
      this.dripTail.position.set(
        (behindX + frontX) * 0.5,
        (behindY + frontY) * 0.5,
        (tailBehind + tailFront) * 3.65 * 0.5,
      );
      this.dripTail.rotation.set(
        -Math.atan2(frontY - behindY, tailSpan),
        Math.sin(progress * Math.PI * 2 + t) * 0.04,
        Math.sin(progress * Math.PI * 1.4 + t * 0.8) * 0.035,
      );
      this.dripTail.scale.set(
        across * 0.62,
        height * 0.58,
        Math.max(0.03, tailSpan * 0.6) * birthEase,
      );
      for (let i = 0; i < 6; i++) {
        const beadT = i / 5,
          beadSlide = THREE.MathUtils.clamp(slide - tailLength * (1 - beadT), slideStart, slide),
          beadX = pathX(beadSlide, t - (1 - beadT) * 0.35),
          beadY = surfaceY(beadSlide, beadX) + 0.045,
          beadSize = (0.012 + beadT * 0.012) * (0.82 + 0.18 * Math.sin(t * 3.2 + i)) * birthEase;
        this.dummy.position.set(beadX, beadY, beadSlide * 3.65);
        this.dummy.scale.setScalar(beadSize);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.dripBeads.setMatrixAt(i, this.dummy.matrix);
      }
      this.dripBeads.instanceMatrix.needsUpdate = true;
      this.heroLeaf.rotation.z += Math.sin(progress * Math.PI) * 0.08;
      this.heroLeaf.rotation.x += Math.sin(progress * Math.PI) * 0.035;
    } else if (age < fallStart) {
      const h = (age - slideDuration) / hangDuration,
        ease = h * h * (3 - 2 * h),
        // The shape the slide finished on, and the one the fall is written to begin on.
        across0 = 0.098,
        height0 = 0.044,
        along0 = 0.108 + 0.48 * 0.03,
        bead = Math.cbrt(across0 * height0 * along0),
        // Volume preserving: 0.845^2 * 1.4 is 1. A pendant this shape reads as a drop about
        // to let go; the 1.85 the fall used to assume made a capsule, not a bead.
        acrossEnd = bead * 0.845,
        heightEnd = bead * 1.4,
        // A neck thins the bead just before it lets go.
        neck = 1 - Math.pow(Math.max(0, h - 0.7) / 0.3, 2) * 0.12;
      this.runningDrop.visible = true;
      this.heroDrop.visible = false;
      const across = THREE.MathUtils.lerp(across0, acrossEnd, ease) * neck,
        height = THREE.MathUtils.lerp(height0, heightEnd, ease),
        along = THREE.MathUtils.lerp(along0, acrossEnd, ease) * neck;
      this.runningDrop.scale.set(across, height, along);
      // It has to travel past the end of the blade, not just down. The leaf is read from
      // above, so a drop lowered beneath the surface goes behind it and disappears; it hangs
      // in open air off the point instead.
      const restX = pathX(0.98, t),
        restY = surfaceY(0.98, restX),
        tipX = pathX(1, t),
        tipY = surfaceY(1, tipX);
      this.runningDrop.position.set(
        THREE.MathUtils.lerp(restX, tipX, ease),
        THREE.MathUtils.lerp(restY + height0 * 0.42, tipY - heightEnd * 0.72, ease),
        THREE.MathUtils.lerp(0.98, 1.014, ease) * 3.65,
      );
      // The pendant hangs plumb, so whatever tilt it carried on the blade unwinds.
      const slope = Math.atan2(tipY - restY, 0.02 * 3.65);
      this.runningDrop.rotation.set(-slope * (1 - ease), 0, 0);
      // The blade bends under the weight collecting at its tip.
      this.heroLeaf.rotation.z += ease * 0.055;
      this.heroLeaf.rotation.x += ease * 0.022;
    } else if (age < fallStart + fallDuration) {
      if (this.runningDrop.visible) {
        this.runningDrop.getWorldPosition(this.fallingDrop.position);
        // The bead used to more than double in size the instant it let go. It keeps the
        // size it had on the leaf instead.
        this.runningDrop.getWorldScale(this.detachScale);
        this.runningDrop.visible = false;
        this.dripTail.visible = false;
        this.dripBeads.visible = false;
        this.dripTrail.visible = false;
        this.fallingDrop.visible = true;
        this.fallingDrop.userData.startY = this.fallingDrop.position.y;
      }
      this.heroDrop.visible = false;
      // Radius of the sphere holding the same water the bead carried on the leaf.
      const radius = Math.cbrt(this.detachScale.x * this.detachScale.y * this.detachScale.z),
        f = (age - fallStart) / fallDuration,
        // Fall to where the underside of the bead meets the water, not an arbitrary zero.
        landing = WATER_LEVEL + radius,
        startY = this.fallingDrop.userData.startY as number;
      this.fallingDrop.position.y = startY + (landing - startY) * f * f;
      // It leaves the leaf still drawn out by the neck it broke from. Surface tension pulls
      // that back within the first moments, then the bead rings between stretched and
      // flattened and settles - that oscillation is what reads as liquid rather than glass.
      // Start from the exact shape the hang handed over and relax toward a ringing sphere of
      // the same volume. Re-deriving the shape from a radius left a small step at f = 0,
      // because the neck that thins the pendant does not thin it evenly on every axis.
      const settle = Math.min(1, f * 4.5),
        ring = Math.sin(f * 31) * 0.17 * Math.exp(-f * 4.2) * motion,
        wide = THREE.MathUtils.lerp(this.detachScale.x, radius * (1 - ring * 0.55), settle),
        tall = THREE.MathUtils.lerp(this.detachScale.y, radius * (1 + ring), settle);
      this.fallingDrop.scale.set(wide, tall, wide);
      // The blade was bent down by the weight at its tip and snapped straight the instant
      // the drop left. It now springs back from exactly where the hang left it and rings.
      const release = Math.exp(-f * 6),
        recoil = Math.exp(-f * 5.5) * Math.sin(f * 26) * 0.042 * motion;
      this.heroLeaf.rotation.z += 0.055 * release + recoil;
      this.heroLeaf.rotation.x += 0.022 * release + recoil * 0.4;
    } else if (!this.impactDone) {
      this.impactDone = true;
      this.fallingDrop.visible = false;
      this.rippleTime.value = t;
      this.rippleCenter.value.set(this.fallingDrop.position.x, this.fallingDrop.position.z);
      this.events.onDrop();
    }
    this.heroDrop.visible = false;
    const rippleAge = t - this.rippleTime.value,
      touchAge = t - this.touchTime.value;
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
    const dropReaction = rippleAge < 5 ? Math.sin(rippleAge * 5) * Math.exp(-rippleAge) : 0,
      touchReaction = touchAge < 3 ? Math.sin(touchAge * 5.4) * Math.exp(-touchAge) : 0,
      reaction = dropReaction + touchReaction * 0.7;
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
      timings: Forest.timings,
      backend: 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2',
      frames: this.frame,
      dropBusy: this.elapsed - this.dropStarted < 5.8,
      dropVisible: this.heroDrop.visible,
      dropFalling: this.fallingDrop.visible,
      dropSliding: this.runningDrop.visible,
      dropSlideScale: this.runningDrop.scale.toArray().map((v) => +v.toFixed(4)),
      dropSlideScreen: this.runningDrop
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera)
        .toArray(),
      dropFallPosition: this.fallingDrop.position.toArray().map((v) => +v.toFixed(3)),
      rippleAge: this.elapsed - this.rippleTime.value,
      snailRetraction: this.snailRetraction,
      snailDiscovered: this.snailDiscovered,
      lightEnabled: this.lightEnabled,
      reducedMotion: this.reducedMotion.matches,
      quality: this.quality,
      zoom: this.currentZoom,
      orbit: [+this.orbitEased.yaw.toFixed(3), +this.orbitEased.pitch.toFixed(3)],
      viewIndex: this.viewIndex,
      touchAge: this.elapsed - this.touchTime.value,
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
      fireflyScreen: this.firefly
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera)
        .toArray(),
      snailScreen: this.snailHit
        .getWorldPosition(new THREE.Vector3())
        .project(this.camera)
        .toArray(),
      waterScreen: this.waterMesh
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
