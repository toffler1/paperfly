// AudioManager — PaperFly
//
// Fully procedural: every sound is synthesised at runtime via the Web Audio API.
// No external audio files are needed, which keeps the bundle at zero extra bytes
// and sidesteps browser autoplay policy for music (a GainNode ramp-to-zero starts
// silently and fades in once the first user interaction has been detected).
//
// Public API surface used by scenes:
//
//   AudioManager.getInstance(scene)   – get/create the singleton
//   .onInteraction()                  – call once on the first pointerdown
//   .playMusic(track)                 – 'flight' | 'shop', crossfades
//   .stopMusic(fadeMs?)               – fade out and stop current track
//   .play(sfxKey)                     – one-shot SFX by name
//   .playStretch(power: 0..1)         – rubber-band creak, pitch scales with power
//   .startWhoosh() / .stopWhoosh()    – looping flight-wind layer
//   .playAltitudeEffect(n: 0..1)      – per-frame whoosh filter shift at altitude
//   .toggleMute()                     – persisted via localStorage
//   .isMuted()
//
// SFX keys: 'launch' | 'coin' | 'crash' | 'land' | 'uiClick' | 'upgrade'
//           'birdHit' | 'windEnter' | 'biomeTransition'

export type MusicTrack = 'flight' | 'shop';
export type SfxKey =
  | 'launch' | 'coin' | 'crash' | 'land' | 'uiClick' | 'upgrade'
  | 'birdHit' | 'windEnter' | 'biomeTransition'
  | 'turboFire' | 'laserFire' | 'shieldAbsorb' | 'bounce';

// ─── tiny helper: schedule a GainNode envelope ──────────────────────────────────────────────
function applyEnvelope(
  gain: GainNode,
  ctx: AudioContext,
  attackTime: number,
  sustainLevel: number,
  sustainDuration: number,
  releaseTime: number,
  startAt: number = ctx.currentTime,
): void {
  gain.gain.cancelScheduledValues(startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(sustainLevel, startAt + attackTime);
  gain.gain.setValueAtTime(sustainLevel, startAt + attackTime + sustainDuration);
  gain.gain.linearRampToValueAtTime(0, startAt + attackTime + sustainDuration + releaseTime);
}

// ─── Main class ──────────────────────────────────────────────────────────────────────────────
export class AudioManager {
  private static instance: AudioManager | null = null;

  private ctx: AudioContext;
  private masterGain: GainNode;
  private musicGain: GainNode;
  private sfxGain: GainNode;

  private currentTrack: MusicTrack | null = null;
  private musicNodes: AudioNode[] = [];   // all nodes belonging to the current music loop
  private musicStopScheduled = false;

  private whooshGain: GainNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private whooshOsc: OscillatorNode | null = null;
  private whooshNoise: AudioBufferSourceNode | null = null;
  private whooshLoopActive = false; // guards the noise loop so it stops cleanly

  private interactionReceived = false;
  private muted = false;

  // Volume hierarchy (mirrors CORE PRINCIPLES §4 frequency spreading and §7 loudness)
  private static readonly VOL_MASTER  = 0.85;
  private static readonly VOL_MUSIC   = 0.38;   // -8 dB relative to SFX so it sits behind action
  private static readonly VOL_SFX     = 0.72;

  // ── Singleton ──────────────────────────────────────────────────────────────────────────────

  private constructor() {
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = AudioManager.VOL_MASTER;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = AudioManager.VOL_MUSIC;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = AudioManager.VOL_SFX;
    this.sfxGain.connect(this.masterGain);

    // Restore mute state from localStorage without triggering a real mute yet
    // (AudioContext starts suspended anyway until onInteraction()).
    this.muted = localStorage.getItem('paperfly_muted') === 'true';
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // ── Autoplay gate ───────────────────────────────────────────────────────────────────────────

  /** Call this exactly once from the first pointerdown handler in any scene. */
  onInteraction(): void {
    if (this.interactionReceived) return;
    this.interactionReceived = true;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.muted) {
      this.masterGain.gain.value = 0;
    }
  }

  // ── Mute ──────────────────────────────────────────────────────────────────────────────────

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('paperfly_muted', String(this.muted));
    const targetVol = this.muted ? 0 : AudioManager.VOL_MASTER;
    this.masterGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ── Music ────────────────────────────────────────────────────────────────────────────────

  /**
   * Crossfade to a new music track.
   * If the same track is already playing nothing happens.
   * fadeMs controls the crossfade duration in milliseconds.
   */
  playMusic(track: MusicTrack, fadeMs: number = 800): void {
    if (this.currentTrack === track) return;

    // Fade out and discard any current music
    this.stopMusic(fadeMs);

    this.currentTrack = track;
    this.musicStopScheduled = false;

    const fadeSec = fadeMs / 1000;
    const now = this.ctx.currentTime + fadeSec; // start playing after old track fades

    if (track === 'flight') {
      this.startFlightMusic(now);
    } else {
      this.startShopMusic(now);
    }
  }

  stopMusic(fadeMs: number = 600): void {
    if (this.musicNodes.length === 0) return;
    if (this.musicStopScheduled) return;
    this.musicStopScheduled = true;

    const fadeSec = fadeMs / 1000;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0, now + fadeSec);

    // Restore music gain after fade for the next track
    this.ctx.currentTime; // side-effect: forces timeline
    const oldNodes = this.musicNodes;
    this.musicNodes = [];
    this.currentTrack = null;

    setTimeout(() => {
      oldNodes.forEach(n => {
        try { (n as OscillatorNode | AudioBufferSourceNode).stop(); } catch (_) { /* already stopped */ }
        n.disconnect();
      });
      this.musicGain.gain.setValueAtTime(AudioManager.VOL_MUSIC, this.ctx.currentTime);
    }, fadeMs + 100);
  }

  // ── Flight music — airy, 110 BPM, C major, glockenspiel + pad ───────────────────────────
  // Built entirely from oscillators + noise.  Loop length = 4 bars × 60s/110 × 4 beats ≈ 8.73s
  private startFlightMusic(startAt: number): void {
    const bpm = 110;
    const beat = 60 / bpm;           // seconds per beat
    const bar  = beat * 4;           // seconds per bar
    const loop = bar * 4;            // 4-bar loop ≈ 8.73 s

    // ── Soft pad chord (Cmaj9) ──
    // C3, E3, G3, D4 — airy fifths and thirds, looped under everything
    const padFreqs = [130.81, 164.81, 196.00, 293.66];
    padFreqs.forEach(freq => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.065;
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(startAt);
      this.musicNodes.push(osc, gain);
    });

    // ── Warm wind-texture noise layer ──
    const windBuf = this.makeNoiseBuffer(2.0);
    const windBpf = this.ctx.createBiquadFilter();
    windBpf.type = 'bandpass';
    windBpf.frequency.value = 900;
    windBpf.Q.value = 0.6;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.01;

    // Wire the filter chain once — reconnecting inside the loop creates additive audio paths.
    windBpf.connect(windGain);
    windGain.connect(this.musicGain);

    let windFirst = true;
    const windLoop = (): void => {
      if (this.currentTrack !== 'flight' || this.musicStopScheduled) return;
      const src = this.ctx.createBufferSource();
      src.buffer = windBuf;
      src.connect(windBpf);
      if (windFirst) { src.start(startAt); windFirst = false; } else { src.start(); }
      src.onended = windLoop;   // manual loop to avoid AudioBufferSourceNode.loop click artefacts
      this.musicNodes.push(src);
    };
    windLoop();
    this.musicNodes.push(windBpf, windGain);

    // ── Glockenspiel melody ──
    // Pentatonic C major pattern: C5 E5 G5 A5 C6 — plays on beats 1,2,3,4 with simple rhythm
    //  Bar 1: C5 – E5 – G5 – A5
    //  Bar 2: C6 – A5 – G5 – E5
    //  Bar 3: G5 – C5 – E5 – A5
    //  Bar 4: C6 – G5 – E5 – C5  (resolving)
    const melody: [number, number][] = [
      // [freq, beat-offset]
      [523.25, 0],   [659.25, 1],  [783.99, 2],  [880.00, 3],   // bar 1
      [1046.5, 4],   [880.00, 5],  [783.99, 6],  [659.25, 7],   // bar 2
      [783.99, 8],   [523.25, 9],  [659.25, 10], [880.00, 11],  // bar 3
      [1046.5, 12],  [783.99, 13], [659.25, 14], [523.25, 15],  // bar 4
    ];

    const scheduleNote = (freq: number, when: number): void => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';   // softer than sawtooth, brighter than sine — glockenspiel-ish
      osc.frequency.value = freq;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.musicGain);
      applyEnvelope(gain, this.ctx, 0.005, 0.12, 0.05, 0.22, when);
      osc.start(when);
      osc.stop(when + 0.38);
      this.musicNodes.push(osc, gain);
    };

    // Schedule 3 full loops up-front so the player hears no gap for the first ~26s
    for (let repeat = 0; repeat < 3; repeat++) {
      melody.forEach(([freq, beatOffset]) => {
        scheduleNote(freq, startAt + repeat * loop + beatOffset * beat);
      });
    }

    // ── Simple bass pulse on beats 1 & 3 ──
    const bassFreqs = [65.41, 65.41, 65.41, 65.41]; // C2 root pedal
    for (let repeat = 0; repeat < 3; repeat++) {
      [0, 2].forEach(beatOffset => {
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = bassFreqs[0];
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.musicGain);
        const when = startAt + repeat * loop + beatOffset * beat * 4; // bars * beats
        applyEnvelope(gain, this.ctx, 0.01, 0.1, 0.3, 0.25, when);
        osc.start(when);
        osc.stop(when + 0.7);
        this.musicNodes.push(osc, gain);
      });
    }

    // After the 3 pre-scheduled loops expire, recursively restart.
    // Using setTimeout avoids keeping hundreds of nodes alive forever.
    const restartAfterMs = (3 * loop - 0.5) * 1000;
    const restartTimer = setTimeout(() => {
      if (this.currentTrack === 'flight' && !this.musicStopScheduled) {
        this.currentTrack = null; // allow playMusic to not short-circuit
        const prevNodes = this.musicNodes;
        this.musicNodes = [];
        this.startFlightMusic(this.ctx.currentTime);
        // Clean up old nodes half a second later (let envelopes finish)
        setTimeout(() => {
          prevNodes.forEach(n => {
            try { (n as OscillatorNode | AudioBufferSourceNode).stop(); } catch (_) { /* ok */ }
            n.disconnect();
          });
        }, 600);
      }
    }, restartAfterMs);

    // Store timer id so stopMusic can cancel it
    (this as unknown as Record<string, unknown>)['_musicTimer'] = restartTimer;
  }

  // ── Shop music — calm, 90 BPM, C major, soft piano-like + warm pad ───────────────────────
  // 4-bar loop ≈ 10.67 s
  private startShopMusic(startAt: number): void {
    const bpm  = 90;
    const beat = 60 / bpm;
    const loop = beat * 16; // 4 bars

    // ── Warm pad (lower register, Am to F to C to G progression) ──
    const chords: number[][] = [
      [220.00, 261.63, 329.63],  // Am  (A3 C4 E4)
      [174.61, 220.00, 261.63],  // F   (F3 A3 C4)
      [130.81, 196.00, 261.63],  // C   (C3 G3 C4)
      [196.00, 246.94, 293.66],  // G   (G3 B3 D4)
    ];
    chords.forEach((chord, chordIndex) => {
      chord.forEach(freq => {
        for (let rep = 0; rep < 3; rep++) {
          const when = startAt + rep * loop + chordIndex * beat * 4;
          const osc  = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.value = 0;
          osc.connect(gain);
          gain.connect(this.musicGain);
          applyEnvelope(gain, this.ctx, 0.06, 0.055, beat * 3.2, 0.4, when);
          osc.start(when);
          osc.stop(when + beat * 4.2);
          this.musicNodes.push(osc, gain);
        }
      });
    });

    // ── Piano-like melody — every 2 beats, descending then ascending ──
    const shopMelody: [number, number][] = [
      [523.25, 0], [493.88, 2], [440.00, 4],  [392.00, 6],   // bar 1 desc
      [349.23, 8], [392.00, 10],[440.00, 12], [493.88, 14],  // bar 2 asc
      [523.25, 16],[440.00, 18],[392.00, 20], [349.23, 22],  // bar 3
      [440.00, 24],[523.25, 26],[587.33, 28], [523.25, 30],  // bar 4 — resolve up
    ];

    for (let rep = 0; rep < 3; rep++) {
      shopMelody.forEach(([freq, beatOff]) => {
        const when = startAt + rep * loop + beatOff * beat;
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.musicGain);
        applyEnvelope(gain, this.ctx, 0.004, 0.09, 0.05, 0.30, when);
        osc.start(when);
        osc.stop(when + 0.5);
        this.musicNodes.push(osc, gain);
      });
    }

    // Gentle bass root notes
    const bassNotes: [number, number][] = [
      [55.00, 0], [43.65, 4], [32.70, 8], [49.00, 12], // A1 F1 C1 G1
    ];
    for (let rep = 0; rep < 3; rep++) {
      bassNotes.forEach(([freq, beatOff]) => {
        const when = startAt + rep * loop + beatOff * beat;
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.musicGain);
        applyEnvelope(gain, this.ctx, 0.02, 0.08, beat * 3.0, 0.3, when);
        osc.start(when);
        osc.stop(when + beat * 4.2);
        this.musicNodes.push(osc, gain);
      });
    }

    const restartAfterMs = (3 * loop - 0.5) * 1000;
    const restartTimer = setTimeout(() => {
      if (this.currentTrack === 'shop' && !this.musicStopScheduled) {
        this.currentTrack = null;
        const prevNodes = this.musicNodes;
        this.musicNodes = [];
        this.startShopMusic(this.ctx.currentTime);
        setTimeout(() => {
          prevNodes.forEach(n => {
            try { (n as OscillatorNode | AudioBufferSourceNode).stop(); } catch (_) { /* ok */ }
            n.disconnect();
          });
        }, 600);
      }
    }, restartAfterMs);
    (this as unknown as Record<string, unknown>)['_musicTimer'] = restartTimer;
  }

  // ── Flight whoosh (continuous looping wind layer during flight) ─────────────────────────────

  /** Call when the plane launches. Fades in a filtered noise whoosh. */
  startWhoosh(): void {
    if (this.whooshGain) return; // already running
    this.whooshLoopActive = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 1400;
    bpf.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.3);

    gain.connect(this.sfxGain);
    bpf.connect(gain);

    const buf  = this.makeNoiseBuffer(1.0);
    const loop = (): void => {
      if (!this.whooshLoopActive) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(bpf);
      src.start();
      src.onended = loop;
      this.whooshNoise = src;
    };
    loop();

    this.whooshGain   = gain;
    this.whooshFilter = bpf;
  }

  /** Call on landing or crash. Fades out the whoosh. */
  stopWhoosh(fadeMs: number = 400): void {
    if (!this.whooshGain) return;
    const gain = this.whooshGain;
    const noise = this.whooshNoise; // capture before nulling — setTimeout fires after null assignment
    this.whooshLoopActive = false;
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeMs / 1000);
    setTimeout(() => {
      try { noise?.stop(); } catch (_) { /* ok */ }
      gain.disconnect();
    }, fadeMs + 50);
    this.whooshGain   = null;
    this.whooshFilter = null;
    this.whooshNoise  = null;
  }

  // ── Altitude effect (per-frame whoosh modulation) ───────────────────────────────────────

  /**
   * Call every frame while plane.y < 0 (above the horizon line).
   * normalizedAltitude: 0 = just crossing y=0, 1 = maximum height (~200 px above horizon).
   * Shifts the whoosh bandpass centre upward and thins the Q as the plane climbs,
   * simulating thinner air.  No new nodes are created — it's a simple parameter write.
   */
  playAltitudeEffect(normalizedAltitude: number): void {
    if (!this.whooshFilter) return;
    const n = Math.max(0, Math.min(1, normalizedAltitude));
    // Base frequency 1400 Hz → rises to 3200 Hz at full altitude (thinner, shriller wind)
    const targetFreq = 1400 + n * 1800;
    // Q narrows from 1.2 → 2.8, making the band more narrow / piercing at altitude
    const targetQ = 1.2 + n * 1.6;
    const now = this.ctx.currentTime;
    this.whooshFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.whooshFilter.Q.setTargetAtTime(targetQ, now, 0.08);
  }

  // ── Rubber-band stretch sound ─────────────────────────────────────────────────────

  /**
   * Call every pointermove frame while the player is aiming.
   * power: 0..1 (powerScalar from getAimVector)
   * Produces a short creaking chirp whose pitch scales with power.
   */
  playStretch(power: number): void {
    if (power <= 0.05) return; // ignore micro-movements

    // Pitch range: 200 Hz (slack) → 900 Hz (fully taut)
    const freq  = 200 + power * 700;
    const dur   = 0.04; // very short click-creak

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 1.4, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq, this.ctx.currentTime + dur);

    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.001, 0.06, 0, 0.04);

    osc.start();
    osc.stop(this.ctx.currentTime + dur + 0.05);
  }

  // ── One-shot SFX ────────────────────────────────────────────────────────────────────────

  play(key: SfxKey): void {
    switch (key) {
      case 'launch':          this.sfxLaunch();          break;
      case 'coin':            this.sfxCoin();            break;
      case 'crash':           this.sfxCrash();           break;
      case 'land':            this.sfxLand();            break;
      case 'uiClick':         this.sfxUiClick();         break;
      case 'upgrade':         this.sfxUpgrade();         break;
      case 'birdHit':         this.sfxBirdHit();         break;
      case 'windEnter':       this.sfxWindEnter();       break;
      case 'biomeTransition': this.sfxBiomeTransition(); break;
      case 'turboFire':       this.sfxTurboFire();       break;
      case 'laserFire':       this.sfxLaserFire();       break;
      case 'shieldAbsorb':    this.sfxShieldAbsorb();    break;
      case 'bounce':          this.sfxBounce();          break;
    }
  }

  // Launch — sharp upward frequency sweep, like a rubber-band snap + whoosh onset
  private sfxLaunch(): void {
    const now = this.ctx.currentTime;

    // Snap transient
    const snap  = this.ctx.createOscillator();
    const snapG = this.ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(80, now);
    snap.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    snap.connect(snapG);
    snapG.connect(this.sfxGain);
    applyEnvelope(snapG, this.ctx, 0, 0.55, 0, 0.08, now);
    snap.start(now);
    snap.stop(now + 0.15);

    // Rising whoosh accent
    const whoosh  = this.ctx.createOscillator();
    const whooshG = this.ctx.createGain();
    whoosh.type = 'sine';
    whoosh.frequency.setValueAtTime(300, now + 0.05);
    whoosh.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
    whoosh.connect(whooshG);
    whooshG.connect(this.sfxGain);
    applyEnvelope(whooshG, this.ctx, 0, 0.2, 0.05, 0.22, now + 0.05);
    whoosh.start(now + 0.05);
    whoosh.stop(now + 0.42);
  }

  // Coin — bright triangle bell ping, randomised pitch so repeated pickups feel fresh
  private sfxCoin(): void {
    const now   = this.ctx.currentTime;
    // Pitch varies across a minor third: 1200–1400 Hz
    const freq  = 1200 + Math.random() * 200;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.002, 0.28, 0, 0.18, now);
    osc.start(now);
    osc.stop(now + 0.22);

    // Subtle harmonic overtone 1 octave up for sparkle
    const ov  = this.ctx.createOscillator();
    const ovG = this.ctx.createGain();
    ov.type = 'sine';
    ov.frequency.value = freq * 2;
    ov.connect(ovG);
    ovG.connect(this.sfxGain);
    applyEnvelope(ovG, this.ctx, 0.001, 0.10, 0, 0.10, now);
    ov.start(now);
    ov.stop(now + 0.14);
  }

  // Crash — low-frequency impact thud + descending crunch
  private sfxCrash(): void {
    const now = this.ctx.currentTime;

    // Sub-bass thud
    const thud  = this.ctx.createOscillator();
    const thudG = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(30, now + 0.18);
    thud.connect(thudG);
    thudG.connect(this.sfxGain);
    applyEnvelope(thudG, this.ctx, 0.002, 0.7, 0.05, 0.20, now);
    thud.start(now);
    thud.stop(now + 0.30);

    // Crunchy noise burst (paper crumple character)
    const noiseBuf = this.makeNoiseBuffer(0.18);
    const hpf      = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 600;
    const noiseG   = this.ctx.createGain();
    noiseG.gain.value = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.connect(hpf);
    hpf.connect(noiseG);
    noiseG.connect(this.sfxGain);
    applyEnvelope(noiseG, this.ctx, 0.002, 0.35, 0.04, 0.14, now);
    src.start(now);

    // Descending creak
    const creak  = this.ctx.createOscillator();
    const creakG = this.ctx.createGain();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(380, now + 0.06);
    creak.frequency.exponentialRampToValueAtTime(80, now + 0.26);
    creak.connect(creakG);
    creakG.connect(this.sfxGain);
    applyEnvelope(creakG, this.ctx, 0.002, 0.18, 0.06, 0.12, now + 0.06);
    creak.start(now + 0.06);
    creak.stop(now + 0.30);
  }

  // Soft landing — gentle descending pitch sweep, like a sigh
  private sfxLand(): void {
    const now = this.ctx.currentTime;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.4);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.005, 0.22, 0.1, 0.28, now);
    osc.start(now);
    osc.stop(now + 0.45);

    // Paper rustle noise
    const buf  = this.makeNoiseBuffer(0.4);
    const lpf  = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 800;
    const ng   = this.ctx.createGain();
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(lpf);
    lpf.connect(ng);
    ng.connect(this.sfxGain);
    applyEnvelope(ng, this.ctx, 0.005, 0.12, 0.12, 0.20, now);
    src.start(now);
  }

  // UI click — crisp mid-range pop (not too high to avoid shrillness)
  private sfxUiClick(): void {
    const now  = this.ctx.currentTime;
    const freq = 520 + Math.random() * 80; // slight randomisation per CORE PRINCIPLE §4

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.001, 0.3, 0, 0.06, now);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Upgrade purchased — rising arpeggio: C5 → E5 → G5 → C6 (triumphant chord)
  private sfxUpgrade(): void {
    const now   = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const when = now + i * 0.09;
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(this.sfxGain);
      applyEnvelope(gain, this.ctx, 0.003, 0.28 - i * 0.02, 0.04, 0.22, when);
      osc.start(when);
      osc.stop(when + 0.42);
    });
  }

  // Bird hit — surprised flap + short tonal squawk (~150 ms).
  private sfxBirdHit(): void {
    const now = this.ctx.currentTime;

    // Layer 1: flap noise burst — filtered white noise, fast decay
    const flapBuf  = this.makeNoiseBuffer(0.12);
    const flapBpf  = this.ctx.createBiquadFilter();
    flapBpf.type   = 'bandpass';
    flapBpf.frequency.value = 2800 + Math.random() * 400;
    flapBpf.Q.value = 3.5;
    const flapGain = this.ctx.createGain();
    const flapSrc  = this.ctx.createBufferSource();
    flapSrc.buffer = flapBuf;
    flapSrc.connect(flapBpf);
    flapBpf.connect(flapGain);
    flapGain.connect(this.sfxGain);
    applyEnvelope(flapGain, this.ctx, 0.001, 0.35, 0.01, 0.08, now);
    flapSrc.start(now);

    // Second flap micro-burst slightly offset for a double-wing effect
    const flap2Buf  = this.makeNoiseBuffer(0.08);
    const flap2Bpf  = this.ctx.createBiquadFilter();
    flap2Bpf.type   = 'bandpass';
    flap2Bpf.frequency.value = 2400 + Math.random() * 300;
    flap2Bpf.Q.value = 4.0;
    const flap2Gain = this.ctx.createGain();
    const flap2Src  = this.ctx.createBufferSource();
    flap2Src.buffer = flap2Buf;
    flap2Src.connect(flap2Bpf);
    flap2Bpf.connect(flap2Gain);
    flap2Gain.connect(this.sfxGain);
    applyEnvelope(flap2Gain, this.ctx, 0.001, 0.22, 0, 0.07, now + 0.05);
    flap2Src.start(now + 0.05);

    // Layer 2: tonal squawk — descending pitch, triangle wave for softness
    const squawk  = this.ctx.createOscillator();
    const squawkG = this.ctx.createGain();
    squawk.type = 'triangle';
    squawk.frequency.setValueAtTime(880 + Math.random() * 80, now + 0.01);
    squawk.frequency.exponentialRampToValueAtTime(380, now + 0.13);
    squawk.connect(squawkG);
    squawkG.connect(this.sfxGain);
    applyEnvelope(squawkG, this.ctx, 0.005, 0.28, 0, 0.06, now + 0.01);
    squawk.start(now + 0.01);
    squawk.stop(now + 0.16);
  }

  // Wind zone entry — gentle 200 ms whoosh cue, non-intrusive.
  private sfxWindEnter(): void {
    const now = this.ctx.currentTime;

    const buf  = this.makeNoiseBuffer(0.22);
    const bpf  = this.ctx.createBiquadFilter();
    bpf.type   = 'bandpass';
    bpf.frequency.setValueAtTime(1800, now);
    bpf.frequency.exponentialRampToValueAtTime(700, now + 0.18);
    bpf.Q.value = 1.8;

    const gain = this.ctx.createGain();
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bpf);
    bpf.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.005, 0.14, 0.04, 0.10, now);
    src.start(now);
  }

  // Biome transition jingle — 3-note ascending arpeggio in C major, ~400 ms.
  private sfxBiomeTransition(): void {
    const now   = this.ctx.currentTime;
    const notes: [number, number][] = [
      [659.25, 0.00],   // E5
      [783.99, 0.13],   // G5
      [1046.5, 0.26],   // C6
    ];
    notes.forEach(([freq, offset]) => {
      const when = now + offset;
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type   = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(this.sfxGain);
      const level = 0.38 - offset * 0.12;
      applyEnvelope(gain, this.ctx, 0.004, level, 0.04, 0.26, when);
      osc.start(when);
      osc.stop(when + 0.38);

      const ov  = this.ctx.createOscillator();
      const ovG = this.ctx.createGain();
      ov.type = 'sine';
      ov.frequency.value = freq * 2;
      ov.connect(ovG);
      ovG.connect(this.sfxGain);
      applyEnvelope(ovG, this.ctx, 0.002, level * 0.15, 0, 0.18, when);
      ov.start(when);
      ov.stop(when + 0.22);
    });
  }

  // Turbo fire — rocket ignition burst: upward sweep + low kick thud (~110 ms total)
  private sfxTurboFire(): void {
    const now = this.ctx.currentTime;

    // Sub-bass kick for ignition punch (80 Hz sine, fast decay)
    const kick  = this.ctx.createOscillator();
    const kickG = this.ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(80, now);
    kick.frequency.exponentialRampToValueAtTime(30, now + 0.08);
    kick.connect(kickG);
    kickG.connect(this.sfxGain);
    applyEnvelope(kickG, this.ctx, 0.001, 0.60, 0, 0.07, now);
    kick.start(now);
    kick.stop(now + 0.10);

    // Jet whoosh: sawtooth sweeping 200 Hz → 2000 Hz
    const jet  = this.ctx.createOscillator();
    const jetG = this.ctx.createGain();
    jet.type = 'sawtooth';
    jet.frequency.setValueAtTime(200, now);
    jet.frequency.exponentialRampToValueAtTime(2000, now + 0.10);
    jet.connect(jetG);
    jetG.connect(this.sfxGain);
    applyEnvelope(jetG, this.ctx, 0.002, 0.45, 0, 0.05, now);
    jet.start(now);
    jet.stop(now + 0.12);
  }

  // Laser fire — sci-fi zap: dual oscillators + noise texture (~80 ms)
  private sfxLaserFire(): void {
    const now = this.ctx.currentTime;

    // Sawtooth sweeping 2000 Hz → 800 Hz
    const saw  = this.ctx.createOscillator();
    const sawG = this.ctx.createGain();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(2000, now);
    saw.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    saw.connect(sawG);
    sawG.connect(this.sfxGain);
    applyEnvelope(sawG, this.ctx, 0.001, 0.20, 0, 0.04, now);
    saw.start(now);
    saw.stop(now + 0.09);

    // Fixed 1200 Hz sine "beam" tone
    const beam  = this.ctx.createOscillator();
    const beamG = this.ctx.createGain();
    beam.type = 'sine';
    beam.frequency.value = 1200;
    beam.connect(beamG);
    beamG.connect(this.sfxGain);
    applyEnvelope(beamG, this.ctx, 0.001, 0.14, 0.01, 0.05, now);
    beam.start(now);
    beam.stop(now + 0.08);

    // Highpass-filtered noise for "zap" texture
    const nBuf = this.makeNoiseBuffer(0.07);
    const hpf  = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3500;
    const nG  = this.ctx.createGain();
    const src = this.ctx.createBufferSource();
    src.buffer = nBuf;
    src.connect(hpf);
    hpf.connect(nG);
    nG.connect(this.sfxGain);
    applyEnvelope(nG, this.ctx, 0.001, 0.16, 0, 0.04, now);
    src.start(now);
  }

  // Shield absorb — metallic bell clang + energy-dispersal noise sweep (~300 ms)
  private sfxShieldAbsorb(): void {
    const now = this.ctx.currentTime;

    // Triangle bell at 600 Hz — fast decay gives a struck-metal feel
    const bell  = this.ctx.createOscillator();
    const bellG = this.ctx.createGain();
    bell.type = 'triangle';
    bell.frequency.value = 600;
    bell.connect(bellG);
    bellG.connect(this.sfxGain);
    applyEnvelope(bellG, this.ctx, 0.001, 0.42, 0, 0.18, now);
    bell.start(now);
    bell.stop(now + 0.22);

    // Bandpass noise sweeping 1800 Hz → 800 Hz — energy dissipating
    const nBuf = this.makeNoiseBuffer(0.20);
    const bpf  = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(1800, now + 0.02);
    bpf.frequency.exponentialRampToValueAtTime(800, now + 0.20);
    bpf.Q.value = 2.8;
    const nG  = this.ctx.createGain();
    const src = this.ctx.createBufferSource();
    src.buffer = nBuf;
    src.connect(bpf);
    bpf.connect(nG);
    nG.connect(this.sfxGain);
    applyEnvelope(nG, this.ctx, 0.005, 0.28, 0.04, 0.14, now + 0.02);
    src.start(now + 0.02);
  }

  // Bounce — cartoon spring: sawtooth descending 500 Hz → 150 Hz over 200 ms
  private sfxBounce(): void {
    const now = this.ctx.currentTime;

    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.20);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    applyEnvelope(gain, this.ctx, 0.003, 0.32, 0.02, 0.12, now);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // ── Utility ─────────────────────────────────────────────────────────────────────────────────

  /** Creates a white-noise AudioBuffer of the specified duration in seconds. */
  private makeNoiseBuffer(durationSec: number): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length     = Math.ceil(sampleRate * durationSec);
    const buf        = this.ctx.createBuffer(1, length, sampleRate);
    const data       = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }
}
