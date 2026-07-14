import type { AutomationActionJson, SemanticTargetJson } from "@uniview/host-tui";

/** A parsed agent CLI invocation. */
export type AgentCommand =
  | { kind: "action"; action: AutomationActionJson }
  | { kind: "tree" }
  | { kind: "agent-context" }
  | { kind: "error"; message: string };

function parseFlags(args: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = "true";
    }
  }
  return flags;
}

function target(flags: Record<string, string>): SemanticTargetJson | null {
  if (flags.id !== undefined) return { id: flags.id };
  if (flags.role !== undefined) {
    return flags.name !== undefined ? { role: flags.role, name: flags.name } : { role: flags.role };
  }
  return null;
}

const error = (message: string): AgentCommand => ({ kind: "error", message });

/**
 * Parse a stateless CLI invocation (argv after the program name) into an
 * {@link AgentCommand}. Mirrors the plan's `uniview-agent` grammar:
 *   tree | agent-context | query … | act activate … | wait command <id>
 *   | expect text <t> | expect node --role … --text …
 */
export function parseCommand(argv: readonly string[]): AgentCommand {
  const [command, ...rest] = argv;

  switch (command) {
    case "tree":
      return { kind: "tree" };
    case "agent-context":
      return { kind: "agent-context" };

    case "query": {
      const t = target(parseFlags(rest));
      if (!t || "id" in t) return error("query needs --role (with optional --name)");
      return { kind: "action", action: { kind: "query", target: t } };
    }

    case "act": {
      const [sub, ...flagArgs] = rest;
      if (sub !== "activate") return error(`unknown act subcommand: ${sub ?? "(none)"}`);
      const t = target(parseFlags(flagArgs));
      if (!t) return error("act activate needs --role/--name or --id");
      return { kind: "action", action: { kind: "activate", target: t } };
    }

    case "wait": {
      const [sub, id] = rest;
      if (sub === "command" && id) return { kind: "action", action: { kind: "waitCommand", id } };
      return error("wait supports: command <id>");
    }

    case "expect": {
      const [sub, ...flagArgs] = rest;
      if (sub === "text") {
        const value = flagArgs[0];
        if (value === undefined) return error("expect text needs a value");
        return { kind: "action", action: { kind: "expectText", text: value } };
      }
      if (sub === "node") {
        const flags = parseFlags(flagArgs);
        const t = target(flags);
        if (!t) return error("expect node needs --role/--name or --id");
        return {
          kind: "action",
          action:
            flags.text !== undefined
              ? { kind: "expectNode", target: t, text: flags.text }
              : { kind: "expectNode", target: t },
        };
      }
      return error(`unknown expect subcommand: ${sub ?? "(none)"}`);
    }

    default:
      return error(`unknown command: ${command ?? "(none)"}`);
  }
}
