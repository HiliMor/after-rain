// All sound is synthesized locally; nothing plays until the listener opts in.
export class ForestAudio {
  private context?: AudioContext;
  private master?: GainNode;
  enabled = false;
  async toggle() {
    if (!this.context) this.setup();
    await this.context!.resume();
    this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(this.enabled ? 0.32 : 0, this.context!.currentTime, 0.5);
    return this.enabled;
  }
  private setup() {
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate),
      d = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < d.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.025) / 1.025;
      d[i] = previous * 3;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    for (const hz of [1300, 2100]) {
      const osc = ctx.createOscillator(),
        amp = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      osc.frequency.value = hz;
      amp.gain.value = 0.003;
      lfo.frequency.value = hz === 1300 ? 0.16 : 0.23;
      depth.gain.value = 0.003;
      lfo.connect(depth).connect(amp.gain);
      osc.connect(amp).connect(this.master);
      osc.start();
      lfo.start();
    }
  }
  drop() {
    if (!this.context || !this.enabled) return;
    const ctx = this.context,
      t = ctx.currentTime;
    for (const [frequency, delay] of [
      [920, 0],
      [570, 0.065],
    ]) {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.setValueAtTime(frequency, t + delay);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, t + delay + 0.18);
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.13, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.45);
      osc.connect(gain).connect(this.master!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.5);
    }
  }
  async visibility(hidden: boolean) {
    if (this.context) {
      if (hidden) await this.context.suspend();
      else if (this.enabled) await this.context.resume();
    }
  }
}
