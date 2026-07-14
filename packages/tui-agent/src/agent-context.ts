import { AUTOMATION_PROTOCOL_VERSION, type AutomationErrorCode } from "@uniview/host-tui";

export interface AgentContext {
  version: number;
  actions: { kind: string; params: string[] }[];
  selectors: string[];
  errors: AutomationErrorCode[];
}

/**
 * The machine-readable capability description an agent reads to learn what it
 * can do. Generated from the action schema (not handwritten) so it can never
 * drift from the implementation — the plan's `agent-context` (§10.6).
 */
export function agentContext(): AgentContext {
  return {
    version: AUTOMATION_PROTOCOL_VERSION,
    actions: [
      { kind: "activate", params: ["target"] },
      { kind: "query", params: ["target"] },
      { kind: "expectNode", params: ["target", "text?", "disabled?", "checked?", "selected?"] },
      { kind: "expectText", params: ["text"] },
      { kind: "waitCommand", params: ["id", "timeoutMs?"] },
    ],
    selectors: ["role", "name", "id"],
    errors: ["no_match", "assertion_failed", "unknown_action", "timeout"],
  };
}
