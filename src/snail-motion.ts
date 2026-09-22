const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

/** An authored crawl/observe/withdraw rhythm, not a locomotion physics simulation. */
export class SnailMotion {
  time = 0;
  gait = 0;
  travel = 0;
  crawl = 0;
  retraction = 0;
  antennaRetraction = 0;
  private caution = 0;

  update(dt: number, proximity: number, passiveMotion: boolean) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.1);
    const threat = Math.max(0, Math.min(1, proximity));
    if (threat > 0.3) this.caution = 1.15;
    else this.caution = Math.max(0, this.caution - step);
    const wary = Math.max(threat, this.caution > 0 ? 0.72 : 0);
    this.antennaRetraction = approach(
      this.antennaRetraction,
      wary,
      wary > this.antennaRetraction ? 9 : 0.65,
      step,
    );
    this.retraction = approach(this.retraction, wary, wary > this.retraction ? 2.6 : 0.48, step);

    if (!passiveMotion) {
      this.crawl = 0;
      return;
    }
    this.time += step;
    const cycle = this.time % 23;
    const walking = cycle < 7 ? 1 : cycle < 11 ? 0 : cycle < 18 ? 0.65 : 0;
    const remaining = Math.max(0, 1 - this.travel / 0.16);
    this.crawl = approach(
      this.crawl,
      walking * (1 - wary) ** 3 * remaining,
      wary > 0.3 ? 7 : 1.25,
      step,
    );
    this.gait += step * this.crawl * 2.1;
    this.travel = Math.min(0.16, this.travel + step * this.crawl * 0.006);
  }
}
