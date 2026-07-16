import type { EventPropName } from "@uniview/protocol";
import {
  FocusManager,
  TextInputMachine,
  type TuiInputEvent,
} from "@uniview/tui-core";
import type { TuiHost } from "./tui-host";

const HOVER_EVENTS: readonly EventPropName[] = ["onMouseEnter", "onMouseLeave"];
const WHEEL_EVENTS: readonly EventPropName[] = ["onWheel"];
const KEY_EVENTS: readonly EventPropName[] = ["onKeyDown"];

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
  private hoveredId: string | null = null;
  private readonly inputSubscribers = new Set<(event: TuiInputEvent) => void>();

  constructor(private readonly host: TuiHost) {}

  /**
   * Subscribe to global input — key/text events the focused control did not
   * consume, plus every paste. This is the host-side seam useInput/usePaste
   * build on: high-frequency keys resolve here, never one RPC round trip per
   * event (the plan's principle 3). Returns an unsubscribe function.
   */
  subscribeInput(listener: (event: TuiInputEvent) => void): () => void {
    this.inputSubscribers.add(listener);
    return () => this.inputSubscribers.delete(listener);
  }

  private emitGlobal(event: TuiInputEvent): void {
    for (const listener of this.inputSubscribers) listener(event);
  }

  /** Refresh the focusable set after a render; prunes fields for removed nodes. */
  onRender(): void {
    const targets = this.host.focusableTargets();
    this.focus.setFocusables(targets.map((t) => ({ id: t.id })));
    const live = new Set(targets.map((t) => t.id));
    for (const id of [...this.fields.keys()]) {
      if (!live.has(id)) this.fields.delete(id);
    }
    // Drop hover state if the hovered node is gone (no leave — it no longer exists).
    if (this.hoveredId && this.host.nearestTarget(this.hoveredId, HOVER_EVENTS) !== this.hoveredId) {
      this.hoveredId = null;
    }
  }

  /** Update hover: leave the previous target, enter the new one under (x, y). */
  private updateHover(x: number, y: number): void {
    const target = this.host.nearestTarget(this.host.nodeAt(x, y), HOVER_EVENTS);
    if (target === this.hoveredId) return;
    if (this.hoveredId) this.host.fireEvent(this.hoveredId, "onMouseLeave", { x, y });
    this.hoveredId = target;
    if (target) this.host.fireEvent(target, "onMouseEnter", { x, y });
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
    if (event.type === "paste") {
      // Paste is neither mouse nor key; it is always a global event.
      this.emitGlobal(event);
      return;
    }

    if (event.type === "mouse") {
      if (event.action === "move" || event.action === "drag") {
        this.updateHover(event.x, event.y);
        return;
      }
      if (event.action === "wheel") {
        const target = this.host.nearestTarget(this.host.nodeAt(event.x, event.y), WHEEL_EVENTS);
        if (target) {
          this.host.fireEvent(target, "onWheel", {
            deltaY: event.deltaY ?? 0,
            x: event.x,
            y: event.y,
          });
        }
        return;
      }
      if (event.action === "up" && event.button === "left") {
        const id = this.host.nodeAt(event.x, event.y);
        if (id) {
          // Focus the nearest focusable ancestor, not the raw hit node: the hit
          // is usually a leaf (the label inside a row), which is not focusable,
          // and focusing it is a silent no-op that strands focus elsewhere.
          const focusTarget = this.host.nearestFocusable(id);
          if (focusTarget) this.focus.focus(focusTarget, "pointer");
          if (!this.isTextbox(id)) {
            this.host.fireEventBubbling(id, "onClick", { x: event.x, y: event.y });
          }
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
      this.fireKey(focused, event);
      return;
    }

    // Enter/Space activate the focused node. This runs before the bubbling below
    // so that activating a focused row still fires its onClick, rather than
    // being swallowed by an ancestor's keymap now that one is reachable.
    if (event.type === "key" && event.key === "Enter" && focused) {
      if (this.host.fireEvent(focused, "onClick")) return;
    }
    if (event.type === "text" && event.text === " " && focused) {
      if (this.host.fireEvent(focused, "onClick")) return;
    }

    // Otherwise the key bubbles to the nearest ancestor that handles it, exactly
    // as a click does. A left-click focuses the *exact* node under the cursor —
    // in a list that is the row, which carries onClick but no onKeyDown — so
    // without this an arrow key pressed right after a click would be dropped and
    // keyboard navigation would silently die until the user pressed Tab.
    if (event.type === "key" && focused) {
      const target = this.host.nearestTarget(focused, KEY_EVENTS);
      if (target) {
        this.fireKey(target, event);
        return;
      }
    }

    // Nothing local consumed this key/text — surface it to the global layer
    // (useInput). Resolved host-side, so a global hotkey costs zero round trips.
    if (event.type === "key" || event.type === "text") this.emitGlobal(event);
  }

  private fireKey(id: string, event: Extract<TuiInputEvent, { type: "key" }>): void {
    this.host.fireEvent(id, "onKeyDown", {
      key: event.key,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
      meta: event.meta,
    });
  }
}
