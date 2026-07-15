import type { TuiInputEvent } from "../input/events";

export type CheckboxEffect = { type: "change"; checked: boolean };

export interface CheckboxInit {
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Host-local toggle logic for a checkbox/switch. Space, Enter and a left mouse
 * click flip the checked state; a disabled checkbox ignores all input.
 */
export class CheckboxMachine {
  private state: boolean;
  private disabled: boolean;

  constructor(init: CheckboxInit = {}) {
    this.state = init.checked ?? false;
    this.disabled = init.disabled ?? false;
  }

  get checked(): boolean {
    return this.state;
  }

  setChecked(checked: boolean): void {
    this.state = checked;
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
  }

  handle(event: TuiInputEvent): CheckboxEffect[] {
    if (this.disabled) return [];
    const isToggle =
      (event.type === "key" && event.key === "Enter") ||
      (event.type === "text" && event.text === " ") ||
      (event.type === "mouse" && event.action === "up" && event.button === "left");
    if (!isToggle) return [];
    this.state = !this.state;
    return [{ type: "change", checked: this.state }];
  }
}
