import {
  FocusManager,
  TextInputMachine,
  type TuiInputEvent,
} from "@uniview/tui-core";
import type { TuiHost } from "./tui-host";

interface FieldState {
  machine: TextInputMachine;
  /** The last value this router committed, for optimistic reconciliation. */
  lastSent: string;
}

/**
 * Routes normalized input to the right control for a {@link TuiHost}: keeps a
 * host-local {@link TextInputMachine} per text field, dispatches editing keys
 * to the focused field (firing onChange/onSubmit), and Tab/Enter/Space/click to
 * buttons. Field state lives in the host, not the plugin — the plan's
 * "local default actions" with optimistic controlled reconciliation (§5.4).
 */
export class InputRouter {
  private readonly focus = new FocusManager();
  private readonly fields = new Map<string, FieldState>();

  constructor(private readonly host: TuiHost) {}

  /** Refresh the focusable set after a render; prunes fields for removed nodes. */
  onRender(): void {
    const targets = this.host.focusableTargets();
    this.focus.setFocusables(targets.map((t) => ({ id: t.id })));
    const live = new Set(targets.map((t) => t.id));
    for (const id of [...this.fields.keys()]) {
      if (!live.has(id)) this.fields.delete(id);
    }
  }

  get focusedId(): string | null {
    return this.focus.focused;
  }

  private isTextbox(id: string): boolean {
    return this.host.focusableTargets().some((t) => t.id === id && t.textbox);
  }

  private hasKeyHandler(id: string): boolean {
    return this.host.eventTargets("onKeyDown").includes(id);
  }

  private fieldFor(id: string): FieldState {
    const committed = this.host.queryById(id)?.value ?? "";
    let field = this.fields.get(id);
    if (!field) {
      field = {
        machine: new TextInputMachine({ value: committed, cursor: committed.length }),
        lastSent: committed,
      };
      this.fields.set(id, field);
    } else if (committed !== field.lastSent) {
      // An external (non-local) change: adopt the server value.
      field.machine.setValue(committed);
      field.lastSent = committed;
    }
    return field;
  }

  dispatch(event: TuiInputEvent): void {
    if (event.type === "mouse" && event.action === "up" && event.button === "left") {
      const id = this.host.nodeAt(event.x, event.y);
      if (id) {
        this.focus.focus(id, "pointer");
        if (!this.isTextbox(id)) {
          this.host.fireEventBubbling(id, "onClick", { x: event.x, y: event.y });
        }
      }
      return;
    }

    if (event.type === "key" && event.key === "Tab") {
      this.focus.move(event.shift ? "previous" : "next");
      return;
    }

    const focused = this.focus.focused;

    if (focused && this.isTextbox(focused)) {
      const field = this.fieldFor(focused);
      const before = field.machine.value;
      for (const effect of field.machine.handle(event)) {
        if (effect.type === "change") {
          if (effect.value !== before) {
            field.lastSent = effect.value;
            this.host.fireEvent(focused, "onChange", effect.value);
          }
        } else {
          this.host.fireEvent(focused, "onSubmit", effect.value);
        }
      }
      return;
    }

    // A focused node can opt into raw keyboard handling (scroll, keymaps).
    if (event.type === "key" && focused && this.hasKeyHandler(focused)) {
      this.host.fireEvent(focused, "onKeyDown", {
        key: event.key,
        ctrl: event.ctrl,
        alt: event.alt,
        shift: event.shift,
        meta: event.meta,
      });
      return;
    }

    if (event.type === "key" && event.key === "Enter" && focused) {
      this.host.fireEvent(focused, "onClick");
      return;
    }
    if (event.type === "text" && event.text === " " && focused) {
      this.host.fireEvent(focused, "onClick");
    }
  }
}
