import { executeAction, type AutomationSession } from "@uniview/host-tui";
import { agentContext } from "./agent-context";
import { parseCommand } from "./parse";

/**
 * Run a stateless CLI invocation against a live {@link AutomationSession} and
 * return a JSON string (the CLI's default machine-readable output). Errors are
 * JSON, never thrown, so an agent always gets a structured response.
 */
export async function runCommand(
  session: AutomationSession,
  argv: readonly string[],
): Promise<string> {
  const command = parseCommand(argv);

  switch (command.kind) {
    case "tree":
      return JSON.stringify(session.tree());
    case "agent-context":
      return JSON.stringify(agentContext());
    case "action":
      return JSON.stringify(await executeAction(session, command.action));
    case "error":
      return JSON.stringify({ ok: false, error: { code: "unknown_action", message: command.message } });
  }
}
