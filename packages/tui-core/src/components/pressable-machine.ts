import type { TuiInputEvent } from "../input/events";

/** Effects emitted by a {@link PressableMachine}. */
export type PressableEffect = { type: "activate" };

export interface PressableInit {
  disabled?: boolean;
}

/**
 * Host-local activation logic for pressable widgets (buttons, menu items).
 * Enter and Space activate; a left mouse down-then-up over the target
 * activates. A disabled pressable ignores all input.
 */
export class PressableMachine {
  private disabled: boolean;
  private armed = false;

  constructor(init: PressableInit = {}) {
    this.disabled = init.disabled ?? false;
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) this.armed = false;
  }

  handle(event: TuiInputEvent): PressableEffect[] {
    if (this.disabled) return [];

    if (event.type === "key" && event.key === "Enter") {
      return [{ type: "activate" }];
    }
    if (event.type === "text" && event.text === " ") {
      return [{ type: "activate" }];
    }
    if (event.type === "mouse" && event.button === "left") {
      if (event.action === "down") {
        this.armed = true;
        return [];
      }
      if (event.action === "up" && this.armed) {
        this.armed = false;
        return [{ type: "activate" }];
      }
    }
    return [];
  }
}
