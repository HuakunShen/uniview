import { describe, expect, it } from "vitest";
import {
  binFrequency,
  fft,
  hannWindow,
  magnitudeSpectrum,
  risingEdge,
  SAMPLE_RATE,
  synthFrame,
} from "../src/signal";

describe("fft", () => {
  it("throws on non-power-of-two length", () => {
    expect(() => fft(new Float64Array(3), new Float64Array(3))).toThrow(/power of two/);
  });

  it("transforms a DC signal to a single bin", () => {
    const n = 8;
    const re = new Float64Array(n).fill(1);
    const im = new Float64Array(n);
    fft(re, im);
    expect(re[0]).toBeCloseTo(n, 10); // sum of all ones
    for (let k = 1; k < n; k += 1) expect(Math.hypot(re[k]!, im[k]!)).toBeCloseTo(0, 10);
  });

  it("puts a pure cosine's energy in its own bin", () => {
    const n = 64;
    const k0 = 8;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.cos((2 * Math.PI * k0 * i) / n);
    fft(re, im);
    // A real cosine of bin k0 splits energy between bins k0 and n-k0.
    const mag = Array.from({ length: n }, (_, k) => Math.hypot(re[k]!, im[k]!));
    let argmax = 0;
    for (let k = 1; k <= n / 2; k += 1) if (mag[k]! > mag[argmax]!) argmax = k;
    expect(argmax).toBe(k0);
    expect(mag[k0]).toBeCloseTo(n / 2, 6);
  });

  it("agrees with a naive DFT on a random-ish signal", () => {
    const n = 16;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.sin(i) + 0.5 * Math.cos(3 * i);
    const ref = re.slice();
    fft(re, im);
    for (let k = 0; k < n; k += 1) {
      let sr = 0;
      let si = 0;
      for (let t = 0; t < n; t += 1) {
        const ang = (-2 * Math.PI * k * t) / n;
        sr += ref[t]! * Math.cos(ang);
        si += ref[t]! * Math.sin(ang);
      }
      expect(re[k]).toBeCloseTo(sr, 8);
      expect(im[k]).toBeCloseTo(si, 8);
    }
  });
});

describe("hannWindow", () => {
  it("is zero at the ends and one in the middle", () => {
    const w = hannWindow(9);
    expect(w[0]).toBeCloseTo(0, 12);
    expect(w[8]).toBeCloseTo(0, 12);
    expect(w[4]).toBeCloseTo(1, 12);
  });

  it("caches by length (same reference)", () => {
    expect(hannWindow(16)).toBe(hannWindow(16));
  });
});

describe("magnitudeSpectrum", () => {
  it("returns the non-redundant half and peaks at the input tone", () => {
    const n = 256;
    const k0 = 20;
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i += 1) samples[i] = Math.sin((2 * Math.PI * k0 * i) / n);
    const mag = magnitudeSpectrum(samples);
    expect(mag.length).toBe(n / 2);
    let argmax = 1;
    for (let k = 2; k < mag.length; k += 1) if (mag[k]! > mag[argmax]!) argmax = k;
    // Hann leakage spreads the peak; it must still land within one bin of k0.
    expect(Math.abs(argmax - k0)).toBeLessThanOrEqual(1);
  });
});

describe("binFrequency", () => {
  it("maps bin index to Hz", () => {
    expect(binFrequency(0, 1024)).toBe(0);
    expect(binFrequency(512, 1024)).toBeCloseTo(SAMPLE_RATE / 2, 6);
  });
});

describe("synthFrame", () => {
  it("is deterministic in time (no Date.now/Math.random)", () => {
    const a = synthFrame(1.5, 64);
    const b = synthFrame(1.5, 64);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it("stays within [-1, 1] on both channels", () => {
    const f = synthFrame(0.37, 4096);
    for (const v of f.left) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    for (const v of f.right) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it("advances with time (different frames at different t)", () => {
    const a = synthFrame(0, 64);
    const b = synthFrame(0.5, 64);
    expect(Array.from(a.left)).not.toEqual(Array.from(b.left));
  });
});

describe("risingEdge", () => {
  it("finds the first upward zero crossing", () => {
    const s = Float64Array.from([-0.2, -0.1, 0.1, 0.3, -0.1, 0.2]);
    expect(risingEdge(s, s.length)).toBe(2);
  });

  it("returns 0 when there is no crossing", () => {
    const s = Float64Array.from([0.1, 0.2, 0.3]);
    expect(risingEdge(s, s.length)).toBe(0);
  });
});
