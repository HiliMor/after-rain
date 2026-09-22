/** A sustained frame budget, independent of animation's clamped time step. */
export class FrameBudget {
  level = 0;
  private warmup = 3;
  private seconds = 0;
  private samples = 0;
  private slow = 0;

  reset() {
    this.warmup = 3;
    this.seconds = this.samples = this.slow = 0;
  }

  sample(seconds: number) {
    // Tab switches, debugger stops and shader compilation are not sustained GPU load.
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.15) {
      this.reset();
      return false;
    }
    if (this.warmup > 0) {
      this.warmup -= seconds;
      return false;
    }
    this.seconds += seconds;
    this.samples++;
    if (seconds > 1 / 48) this.slow++;
    if (this.seconds < 3 || this.samples < 40) return false;
    const reduce = this.level < 2 && this.slow / this.samples > 0.6;
    this.seconds = this.samples = this.slow = 0;
    if (reduce) {
      this.level++;
      this.reset();
    }
    // Keep the lower ceiling for this visit; repeatedly restoring expensive passes makes
    // quality oscillate on a device that can only meet the budget after they are removed.
    return reduce;
  }
}

export function renderProfile(
  width: number,
  height: number,
  dpr: number,
  compact: boolean,
  level: number,
) {
  const tier = compact ? 2 : Math.min(2, Math.max(0, level));
  const cap = [1.65, 1.35, 1.05][tier];
  const pixels = [3_200_000, 2_200_000, 1_300_000][tier];
  return {
    tier,
    pixelRatio: Math.min(dpr, cap, Math.sqrt(pixels / Math.max(1, width * height))),
    depthOfField: tier === 0,
    reflectionScale: [0.65, 0.4, 0][tier],
  };
}
