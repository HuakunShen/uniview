/**
 * Signal core for the audio scope — all pure, clock-fed, deterministic math so
 * it runs in a sandboxed Worker with no audio device (see the demo README for
 * how a Node/Bun bridge plugin would swap in a real PCM source). Nothing here
 * touches `Date.now()`/`Math.random()`: a frame is a pure function of the time
 * the host `FrameClock` hands us, which is what keeps the tests deterministic.
 */

/** The nominal sample rate our synthetic source pretends to run at. */
export const SAMPLE_RATE = 44100;

/** A block of stereo PCM in [-1, 1]; `left`/`right` share a length. */
export interface StereoFrame {
  left: Float64Array;
  right: Float64Array;
}

/** One additive partial: a sine of `freq` Hz at `amp`, panned `pan` ∈ [-1, 1]. */
interface Partial {
  freq: number;
  amp: number;
  pan: number;
}

/**
 * A small, musically-related partial set. The left/right pans and the detuned
 * partials (330/660 vs. 440/550) make the vectorscope trace an evolving
 * Lissajous figure instead of a flat diagonal, and give the spectroscope a few
 * clean peaks to resolve.
 */
const PARTIALS: readonly Partial[] = [
  { freq: 220, amp: 0.6, pan: -0.2 },
  { freq: 440, amp: 0.32, pan: 0.5 },
  { freq: 330, amp: 0.3, pan: -0.6 },
  { freq: 660, amp: 0.18, pan: 0.3 },
  { freq: 550, amp: 0.14, pan: -0.4 },
];

/** Pan-law gains: `pan=-1` → full left, `+1` → full right (equal-power). */
function panGains(pan: number): [number, number] {
  const angle = ((pan + 1) / 2) * (Math.PI / 2);
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Synthesize `n` stereo samples starting at time `t` seconds. A slow phase
 * drift on the right channel (0.08 Hz) keeps the Lissajous figure rotating, so
 * the scope is always alive even though the tones are steady.
 */
export function synthFrame(t: number, n: number): StereoFrame {
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  const drift = 2 * Math.PI * 0.08 * t; // rotates the L/R phase relationship
  for (const partial of PARTIALS) {
    const [gl, gr] = panGains(partial.pan);
    const w = 2 * Math.PI * partial.freq;
    for (let i = 0; i < n; i += 1) {
      const ti = t + i / SAMPLE_RATE;
      const base = partial.amp * Math.sin(w * ti);
      left[i] += gl * base;
      right[i] += gr * partial.amp * Math.sin(w * ti + drift);
    }
  }
  // Normalize so the summed partials stay inside [-1, 1].
  const peak = PARTIALS.reduce((s, p) => s + p.amp, 0);
  for (let i = 0; i < n; i += 1) {
    left[i] /= peak;
    right[i] /= peak;
  }
  return { left, right };
}

/** A Hann analysis window of length `n` (raised cosine), cached per length. */
const hannCache = new Map<number, Float64Array>();
export function hannWindow(n: number): Float64Array {
  const cached = hannCache.get(n);
  if (cached) return cached;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  hannCache.set(n, w);
  return w;
}

/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` must share a
 * power-of-two length; on return they hold the transform. Hand-rolled to keep
 * the demo dependency-free (the research doc's alternative was `fft.js`).
 */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fft length must be a power of two, got ${n}`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  // Butterflies, doubling the transform length each pass.
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k += 1) {
        const a = start + k;
        const b = a + half;
        const bRe = re[b]! * curRe - im[b]! * curIm;
        const bIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - bRe;
        im[b] = im[a]! - bIm;
        re[a] = re[a]! + bRe;
        im[a] = im[a]! + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Magnitude spectrum of a real signal: Hann-window `samples`, FFT, and return
 * the first `n/2` bin magnitudes (the non-redundant half up to Nyquist).
 * `samples.length` must be a power of two.
 */
export function magnitudeSpectrum(samples: Float64Array): Float64Array {
  const n = samples.length;
  const win = hannWindow(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i += 1) re[i] = samples[i]! * win[i]!;
  fft(re, im);
  const half = n >> 1;
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k += 1) mag[k] = Math.hypot(re[k]!, im[k]!);
  return mag;
}

/** Bin index → frequency in Hz for an `n`-point transform at `SAMPLE_RATE`. */
export function binFrequency(k: number, n: number): number {
  return (k * SAMPLE_RATE) / n;
}

/**
 * Rising-edge trigger: the first index (searching the front of the block) where
 * the signal crosses zero going upward. Anchoring the oscilloscope's display
 * window here holds a steady tone still instead of letting it scroll. Returns 0
 * if no such crossing is found.
 */
export function risingEdge(samples: Float64Array, searchLimit: number): number {
  const limit = Math.min(searchLimit, samples.length - 1);
  for (let i = 1; i < limit; i += 1) {
    if (samples[i - 1]! <= 0 && samples[i]! > 0) return i;
  }
  return 0;
}
