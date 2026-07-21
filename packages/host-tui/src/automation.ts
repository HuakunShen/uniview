import type { HandlerId, JSONValue } from "@uniview/protocol/core";
import type { TuiHost } from "./tui-host";
import type { RoleQuery, SemanticNode } from "./semantics";

/** A semantic target: by role (+ optional name) or by id. */
export type SemanticTarget = { role: string; name?: string | RegExp } | { id: string };

export interface NodeAssertion {
  text?: string | RegExp;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
}

export interface RecordedAction {
  kind: "activate";
  target: SemanticTarget;
}

export interface AutomationTrace {
  actions: readonly RecordedAction[];
  commands: readonly { id: HandlerId; payload?: JSONValue }[];
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

function matchText(value: string | undefined, matcher: string | RegExp): boolean {
  if (value === undefined) return false;
  return typeof matcher === "string" ? value === matcher : matcher.test(value);
}

/**
 * A semantic automation session over a {@link TuiHost}: query the accessibility
 * tree, act on controls by role/name, assert on state, and record a replayable
 * trace. Because it speaks roles and commands (not coordinates), the same trace
 * can drive any surface — the plan's cross-surface contract layer.
 */
export class AutomationSession {
  private readonly actions: RecordedAction[] = [];

  constructor(private readonly host: TuiHost) {}

  /** The current semantic tree. */
  tree(): SemanticNode | null {
    return this.host.semanticTree();
  }

  /** Find a node by role (+ optional name). */
  query(target: { role: string } & RoleQuery): SemanticNode | null {
    return this.host.queryByRole(target.role, { name: target.name });
  }

  readonly act = {
    activate: (target: SemanticTarget): boolean => {
      this.actions.push({ kind: "activate", target });
      return this.host.activate(target);
    },
  };

  private resolve(target: SemanticTarget): SemanticNode | null {
    return "id" in target
      ? this.host.queryById(target.id)
      : this.host.queryByRole(target.role, { name: target.name });
  }

  readonly expect = {
    node: (target: SemanticTarget, assertion: NodeAssertion = {}): SemanticNode => {
      const node = this.resolve(target);
      if (!node) {
        throw new Error(`expect.node: no node matched ${JSON.stringify(target)}`);
      }
      if (assertion.text !== undefined && !matchText(node.text ?? node.name, assertion.text)) {
        throw new Error(
          `expect.node: ${node.id} text ${JSON.stringify(node.text ?? node.name)} did not match ${assertion.text}`,
        );
      }
      for (const key of ["disabled", "checked", "selected"] as const) {
        if (assertion[key] !== undefined && (node[key] ?? false) !== assertion[key]) {
          throw new Error(`expect.node: ${node.id} ${key} was not ${assertion[key]}`);
        }
      }
      return node;
    },

    text: (matcher: string | RegExp): SemanticNode => {
      const found = this.host.queryByText(matcher);
      if (!found) throw new Error(`expect.text: no node matched ${matcher}`);
      return found;
    },
  };

  /** The recorded command trace. */
  commands(): readonly { id: HandlerId; payload?: JSONValue }[] {
    return this.host.commands();
  }

  /** Resolve once a command with `id` has been recorded, else reject. */
  waitForCommand(id: HandlerId, options: WaitOptions = {}): Promise<void> {
    const has = () => this.host.commands().some((c) => c.id === id);
    if (has()) return Promise.resolve();

    const timeoutMs = options.timeoutMs ?? 1000;
    const intervalMs = options.intervalMs ?? 8;
    return new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (has()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error(`waitForCommand: "${id}" not recorded within ${timeoutMs}ms`));
        }
      }, intervalMs);
    });
  }

  /** A replayable trace of actions plus the resulting command sequence. */
  record(): AutomationTrace {
    return { actions: [...this.actions], commands: [...this.host.commands()] };
  }
}
