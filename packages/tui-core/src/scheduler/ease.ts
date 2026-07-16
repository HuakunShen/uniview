/** A normalized easing curve: maps progress `t` in [0, 1] to eased [0, 1]. */
export type EasingFn = (t: number) => number;

export const linear: EasingFn = (t) => t;

export const quadIn: EasingFn = (t) => t * t;
export const quadOut: EasingFn = (t) => 1 - (1 - t) * (1 - t);
export const quadInOut: EasingFn = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const cubicIn: EasingFn = (t) => t * t * t;
export const cubicOut: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
export const cubicInOut: EasingFn = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const sineIn: EasingFn = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const sineOut: EasingFn = (t) => Math.sin((t * Math.PI) / 2);
export const sineInOut: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const expoIn: EasingFn = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const expoOut: EasingFn = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const expoInOut: EasingFn = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

export const bounceOut: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};
export const bounceIn: EasingFn = (t) => 1 - bounceOut(1 - t);
export const bounceInOut: EasingFn = (t) =>
  t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2;

/**
 * The named curve registry. `EasingName` is derived from these keys with
 * `keyof typeof easings`, so the union and the table can never drift apart.
 */
export const easings = {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  sineIn,
  sineOut,
  sineInOut,
  expoIn,
  expoOut,
  expoInOut,
  bounceIn,
  bounceOut,
  bounceInOut,
} satisfies Record<string, EasingFn>;

export type EasingName = keyof typeof easings;

/** Resolve an easing option to a function; `undefined` yields `linear`. */
export function resolveEasing(ease?: EasingFn | EasingName): EasingFn {
  if (ease === undefined) return linear;
  return typeof ease === "function" ? ease : easings[ease];
}
