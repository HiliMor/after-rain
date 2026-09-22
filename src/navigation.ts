import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three/webgpu';

/** Local orbit, pan and dolly around whichever detail the visitor has chosen. */
export class SceneNavigation {
  yaw = 0;
  pitch = 0;
  zoom = 0;
  readonly offset = new Vector3();
  private readonly spherical = new Spherical();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  reset() {
    this.yaw = this.pitch = this.zoom = 0;
    this.offset.set(0, 0, 0);
  }

  rotate(dx: number, dy: number, height: number) {
    const speed = Math.PI / Math.max(320, height);
    this.yaw = MathUtils.clamp(this.yaw - dx * speed, -1.65, 1.65);
    this.pitch = MathUtils.clamp(this.pitch + dy * speed, -0.65, 1.15);
  }

  dolly(amount: number) {
    this.zoom = MathUtils.clamp(this.zoom + amount, -0.45, 2.35);
  }

  pan(dx: number, dy: number, camera: PerspectiveCamera, target: Vector3, height: number) {
    const units =
      (2 * camera.position.distanceTo(target) * Math.tan(MathUtils.degToRad(camera.fov / 2))) /
      Math.max(1, height);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    this.offset.addScaledVector(this.right, -dx * units).addScaledVector(this.up, dy * units);
    this.offset.clamp(new Vector3(-3.2, -1.8, -3), new Vector3(3.2, 1.8, 3));
  }

  /** Mutates a preset pose. Zoom follows its viewing direction, including close-ups. */
  compose(camera: Vector3, target: Vector3) {
    camera.sub(target);
    this.spherical.setFromVector3(camera);
    this.spherical.theta += this.yaw;
    this.spherical.phi = MathUtils.clamp(this.spherical.phi - this.pitch, 0.28, 1.48);
    this.spherical.radius = MathUtils.clamp(
      this.spherical.radius * Math.exp(-this.zoom * 0.72),
      0.85,
      15,
    );
    target.add(this.offset);
    target.y = MathUtils.clamp(target.y, 0.08, 4.2);
    camera.setFromSpherical(this.spherical).add(target);
  }
}

/** Up means closer; line and pixel wheels retain comparable travel. */
export function wheelZoom(delta: number, mode: number, pinch = false) {
  const lines = mode === 1 ? delta : mode === 2 ? delta * 12 : delta / 33;
  return -MathUtils.clamp(lines, -12, 12) * (pinch ? 0.12 : 0.05);
}
