import { createSignal, onCleanup } from "solid-js";
import { FrameClock, Timeline, type EasingFn, type EasingName } from "@uniview/tui-core";

let activeClock: FrameClock | null = null;

/** Set the ambient frame clock; `createTuiSolidRoot` calls this before render. */
export function setActiveTuiClock(clock: FrameClock | null): void {
  activeClock = clock;
}

export function getActiveTuiClock(): FrameClock {
  if (!activeClock) {
    throw new Error("useAnimation/animate require an active clock — createTuiSolidRoot installs one.");
  }
  return activeClock;
}

export interface AnimationState {
  frame: () => number;
  time: () => number;
  delta: () => number;
  reset(): void;
}

/** Subscribe to the frame loop as Solid accessors: `{ frame, time, delta, reset }`. */
export function useAnimation(): AnimationState {
  const clock = getActiveTuiClock();
  const [frame, setFrame] = createSignal(0);
  const [time, setTime] = createSignal(0);
  const [delta, setDelta] = createSignal(0);
  const unsubscribe = clock.subscribe((info) => {
    setFrame(info.frame);
    setTime(info.time);
    setDelta(info.delta);
  });
  onCleanup(unsubscribe);
  return { frame, time, delta, reset: () => clock.reset() };
}

export interface AnimateOptions {
  duration: number;
  ease?: EasingFn | EasingName;
  from?: number;
  loop?: boolean | number;
  alternate?: boolean;
  onComplete?: () => void;
}

/**
 * Declaratively tween a scalar toward `to`; returns a Solid accessor for the
 * current value to drop into a node's style/props. `to` is read once at setup
 * (the finite-tween case); retarget by re-creating in a `createEffect`.
 */
export function animate(prop: string, to: number, options: AnimateOptions): () => number {
  const clock = getActiveTuiClock();
  const [value, setValue] = createSignal(options.from ?? to);
  const timeline = new Timeline({
    from: options.from ?? to,
    to,
    duration: options.duration,
    ease: options.ease,
    loop: options.loop,
    alternate: options.alternate,
    onUpdate: (v) => setValue(v),
    onComplete: () => options.onComplete?.(),
  });
  const remove = clock.add(timeline);
  onCleanup(remove);
  return value;
}
