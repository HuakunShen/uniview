import type { JSONValue } from "@uniview/protocol";
import type { AutomationSession, SemanticTarget } from "./automation";

/** Versioned so agents can negotiate the action schema. */
export const AUTOMATION_PROTOCOL_VERSION = 1;

/** A JSON-safe semantic target (subset of {@link SemanticTarget}). */
export type SemanticTargetJson = { role: string; name?: string } | { id: string };

/** A JSON automation action an AI/agent client can send. */
export type AutomationActionJson =
  | { kind: "activate"; target: SemanticTargetJson }
  | { kind: "query"; target: { role: string; name?: string } }
  | {
      kind: "expectNode";
      target: SemanticTargetJson;
      text?: string;
      disabled?: boolean;
      checked?: boolean;
      selected?: boolean;
    }
  | { kind: "expectText"; text: string }
  | { kind: "waitCommand"; id: string; timeoutMs?: number };

/** Stable error taxonomy — agents branch on `code`, never on message text. */
export type AutomationErrorCode =
  | "no_match"
  | "assertion_failed"
  | "unknown_action"
  | "timeout";

export interface ActionResult {
  ok: boolean;
  error?: { code: AutomationErrorCode; message: string };
  data?: JSONValue;
}

const ok = (data?: JSONValue): ActionResult => (data === undefined ? { ok: true } : { ok: true, data });
const err = (code: AutomationErrorCode, message: string): ActionResult => ({ ok: false, error: { code, message } });

/** Text matchers arrive as strings; treat them as case-insensitive regexes. */
function matcher(text: string): RegExp {
  return new RegExp(text, "i");
}

function toTarget(target: SemanticTargetJson): SemanticTarget {
  return target;
}

/**
 * Execute a single JSON {@link AutomationActionJson} against a session and
 * return a structured result. Never throws — assertion/lookup failures become
 * `{ ok: false, error }` with a stable {@link AutomationErrorCode}.
 */
export async function executeAction(
  session: AutomationSession,
  action: AutomationActionJson,
): Promise<ActionResult> {
  switch (action.kind) {
    case "activate":
      return session.act.activate(toTarget(action.target))
        ? ok()
        : err("no_match", `no control matched ${JSON.stringify(action.target)}`);

    case "query": {
      const node = session.query(action.target);
      return ok(node ? { id: node.id, role: node.role } : null);
    }

    case "expectNode":
      try {
        session.expect.node(toTarget(action.target), {
          ...(action.text !== undefined ? { text: matcher(action.text) } : {}),
          ...(action.disabled !== undefined ? { disabled: action.disabled } : {}),
          ...(action.checked !== undefined ? { checked: action.checked } : {}),
          ...(action.selected !== undefined ? { selected: action.selected } : {}),
        });
        return ok();
      } catch (e) {
        return err("assertion_failed", (e as Error).message);
      }

    case "expectText":
      try {
        session.expect.text(matcher(action.text));
        return ok();
      } catch (e) {
        return err("assertion_failed", (e as Error).message);
      }

    case "waitCommand":
      try {
        await session.waitForCommand(action.id, { timeoutMs: action.timeoutMs });
        return ok();
      } catch (e) {
        return err("timeout", (e as Error).message);
      }

    default:
      return err("unknown_action", `unknown action kind: ${(action as { kind: string }).kind}`);
  }
}

/**
 * Run a JSON trace, returning one {@link ActionResult} per action. Stops early
 * if an action fails, so a replayed trace reports the first divergence.
 */
export async function runTrace(
  session: AutomationSession,
  actions: readonly AutomationActionJson[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    const result = await executeAction(session, action);
    results.push(result);
    if (!result.ok) break;
  }
  return results;
}
