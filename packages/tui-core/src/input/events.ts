/** A normalized terminal input event, transport-independent. */
export type TuiInputEvent =
  | {
      type: "key";
      key: string;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
      meta: boolean;
    }
  | { type: "text"; text: string }
  | { type: "paste"; text: string }
  | {
      type: "mouse";
      action: "down" | "up" | "move" | "drag" | "wheel";
      button: "left" | "middle" | "right" | "none";
      x: number;
      y: number;
      deltaY?: -1 | 1;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
    }
  | { type: "resize"; width: number; height: number }
  | { type: "terminal-focus"; focused: boolean };

export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export const NO_MODIFIERS: KeyModifiers = {
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
};

/** Build a key event with optional modifier overrides. */
export function keyEvent(
  key: string,
  mods: Partial<KeyModifiers> = {},
): TuiInputEvent {
  return {
    type: "key",
    key,
    ctrl: mods.ctrl ?? false,
    alt: mods.alt ?? false,
    shift: mods.shift ?? false,
    meta: mods.meta ?? false,
  };
}
