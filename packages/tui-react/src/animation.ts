import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Timeline, type EasingFn, type EasingName, type FrameClock, type FrameInfo } from "@uniview/tui-core";

/** The ambient {@link FrameClock}; `createTuiReactRoot` provides one. */
export const TuiClockContext = createContext<FrameClock | null>(null);

export function TuiClockProvider(props: { clock: FrameClock; children: ReactNode }): ReactElement {
  return createElement(TuiClockContext.Provider, { value: props.clock }, props.children);
}

function useClock(): FrameClock {
  const clock = useContext(TuiClockContext);
  if (!clock) {
    throw new Error("useAnimation/animate require a TuiClockProvider — createTuiReactRoot installs one.");
  }
  return clock;
}

export interface AnimationState {
  frame: number;
  time: number;
  delta: number;
  reset(): void;
}

/** Subscribe to the frame loop: `{ frame, time, delta, reset }`, updated per frame. */
export function useAnimation(): AnimationState {
  const clock = useClock();
  const [info, setInfo] = useState<FrameInfo>({ frame: 0, time: 0, delta: 0 });
  useEffect(() => clock.subscribe(setInfo), [clock]);
  return { frame: info.frame, time: info.time, delta: info.delta, reset: () => clock.reset() };
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
 * Declaratively tween a scalar toward `to`; returns the current value to place
 * into a node's style/props. When `to` changes the tween restarts from the
 * current value. This is a hook — call it at the top level (rules of hooks).
 * `prop` is a stable identity key for the animation.
 */
export function animate(prop: string, to: number, options: AnimateOptions): number {
  const clock = useClock();
  const [value, setValue] = useState(options.from ?? to);
  const current = useRef(options.from ?? to);

  useEffect(() => {
    const timeline = new Timeline({
      from: current.current,
      to,
      duration: options.duration,
      ease: options.ease,
      loop: options.loop,
      alternate: options.alternate,
      onUpdate: (v) => {
        current.current = v;
        setValue(v);
      },
      onComplete: () => options.onComplete?.(),
    });
    return clock.add(timeline);
    // Retarget when the clock, identity key, destination, or timing changes;
    // ease/loop/alternate are read at (re)start.
  }, [clock, prop, to, options.duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return value;
}
