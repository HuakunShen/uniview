import { describe, expect, it } from "vitest";
import {
  bounceOut,
  cubicInOut,
  easings,
  linear,
  quadOut,
  resolveEasing,
  sineInOut,
  type EasingName,
} from "../../src/scheduler/ease";

const NAMES: EasingName[] = [
  "linear",
  "quadIn",
  "quadOut",
  "quadInOut",
  "cubicIn",
  "cubicOut",
  "cubicInOut",
  "sineIn",
  "sineOut",
  "sineInOut",
  "expoIn",
  "expoOut",
  "expoInOut",
  "bounceIn",
  "bounceOut",
  "bounceInOut",
];

describe("easings", () => {
  it("pin the endpoints for every curve", () => {
    for (const name of NAMES) {
      const fn = easings[name];
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    }
  });

  it("linear is the identity", () => {
    expect(linear(0.37)).toBe(0.37);
  });

  it("quadOut decelerates (past its linear midpoint at t=0.5)", () => {
    expect(quadOut(0.5)).toBeCloseTo(0.75, 10);
  });

  it("symmetric in-out curves cross 0.5 at their midpoint", () => {
    expect(cubicInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(sineInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  it("stays monotonic across a sampled sweep", () => {
    for (const name of NAMES) {
      const fn = easings[name];
      let prev = fn(0);
      for (let i = 1; i <= 20; i += 1) {
        const v = fn(i / 20);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("bounceOut lands exactly on 1", () => {
    expect(bounceOut(1)).toBeCloseTo(1, 10);
  });

  it("resolveEasing maps name, passes through a fn, and defaults to linear", () => {
    expect(resolveEasing("quadOut")).toBe(quadOut);
    const custom: (t: number) => number = (t) => t;
    expect(resolveEasing(custom)).toBe(custom);
    expect(resolveEasing(undefined)).toBe(linear);
  });
});
