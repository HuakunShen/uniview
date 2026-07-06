import type { Mutation, UINode } from "@uniview/protocol";
import { UpdateTreeRequestSchema, MutationsSchema } from "@uniview/protocol";

/**
 * Optional dev-mode validation of plugin -> host messages.
 *
 * The protocol Zod schemas are the source of truth for what a well-behaved
 * plugin may send; a misbehaving or version-mismatched plugin can put the
 * host tree into a corrupt state that surfaces far from the cause. When a
 * controller is created with `validate: true`, each incoming tree/mutation
 * batch is checked and any violation is reported (without blocking, so
 * behaviour is otherwise unchanged) — turning the previously dead schemas
 * into an actual protocol-debugging aid.
 *
 * Off by default: validation walks the whole payload and is not free.
 */
export function validateIncomingTree(tree: UINode | null): string | null {
  const result = UpdateTreeRequestSchema.safeParse(tree);
  return result.success ? null : `invalid updateTree payload: ${result.error.message}`;
}

export function validateIncomingMutations(mutations: Mutation[]): string | null {
  const result = MutationsSchema.safeParse(mutations);
  return result.success ? null : `invalid mutations payload: ${result.error.message}`;
}
