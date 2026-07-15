import { z } from "zod";
import type { JSONValue, UINode } from "./tree";
import { LAYOUT_TAGS } from "./tree";
import type { Mutation } from "./mutations";
import { EVENT_PROPS } from "./events";

export const JSONValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JSONValueSchema),
    z.record(z.string(), JSONValueSchema),
  ]),
);

export const UINodeSchema: z.ZodType<UINode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    props: z.record(z.string(), JSONValueSchema),
    children: z.array(z.union([UINodeSchema, z.string()])),
    text: z.string().optional(),
  }),
);

export const UILayoutTagSchema = z.enum(
  LAYOUT_TAGS as unknown as [string, ...string[]],
);

/**
 * The environment the host pushes with `initialize` (and later via
 * `setEnvironment`). All fields optional — it's a `Partial<HostEnvironment>`, so
 * a host can send only what it knows.
 */
export const HostEnvironmentSchema = z.object({
  colorScheme: z.enum(["light", "dark"]).optional(),
  accentColor: z.string().optional(),
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const InitializeRequestSchema = z.object({
  protocolVersion: z.number().int().positive(),
  props: JSONValueSchema.optional(),
  // Must be in the schema, or Zod strips it: the first environment would be
  // dropped by any path that validates the request before forwarding, and
  // `useColorScheme()` would render with the default until a later
  // `setEnvironment` round trip corrected it.
  env: HostEnvironmentSchema.optional(),
});

export const UpdatePropsRequestSchema = JSONValueSchema;

/**
 * `executeHandler` takes two POSITIONAL args over RPC — (handlerId, args) —
 * not a single object. The previous object schema never matched the wire
 * shape. Validate the two arguments individually instead.
 */
export const HandlerIdSchema = z.string();
export const HandlerArgsSchema = z.array(JSONValueSchema);

export const UpdateTreeRequestSchema = z.union([UINodeSchema, z.null()]);

/**
 * Discriminated union mirroring the `Mutation` type in mutations.ts. Kept in
 * lockstep with that file — a missing case here silently accepts bad data.
 */
export const MutationSchema: z.ZodType<Mutation> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("appendChild"),
      parentId: z.string(),
      node: UINodeSchema,
    }),
    z.object({
      type: z.literal("insertBefore"),
      parentId: z.string(),
      node: UINodeSchema,
      beforeId: z.string(),
    }),
    z.object({
      type: z.literal("removeChild"),
      parentId: z.string(),
      nodeId: z.string(),
    }),
    z.object({
      type: z.literal("setText"),
      nodeId: z.string(),
      text: z.string(),
    }),
    z.object({
      type: z.literal("setProps"),
      nodeId: z.string(),
      props: z.record(z.string(), JSONValueSchema),
    }),
    z.object({
      type: z.literal("setRoot"),
      node: z.union([UINodeSchema, z.null()]),
    }),
  ]),
) as z.ZodType<Mutation>;

export const MutationsSchema = z.array(MutationSchema);

export const LogRequestSchema = z.object({
  level: z.enum(["log", "info", "warn", "error"]),
  args: z.array(JSONValueSchema),
});

export const ReportErrorRequestSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
});

export const EventPropNameSchema = z.enum(
  EVENT_PROPS as unknown as [string, ...string[]],
);

export function validateUINode(data: unknown): UINode {
  return UINodeSchema.parse(data);
}

export function validateInitializeRequest(data: unknown) {
  return InitializeRequestSchema.parse(data);
}

export function validateJSONValue(data: unknown): JSONValue {
  return JSONValueSchema.parse(data);
}

export function isValidUINode(data: unknown): data is UINode {
  return UINodeSchema.safeParse(data).success;
}

export function isValidJSONValue(data: unknown): data is JSONValue {
  return JSONValueSchema.safeParse(data).success;
}

export function validateMutations(data: unknown): Mutation[] {
  return MutationsSchema.parse(data);
}

export function isValidMutations(data: unknown): data is Mutation[] {
  return MutationsSchema.safeParse(data).success;
}

/**
 * Validate the two positional arguments of an `executeHandler` RPC call.
 * Returns a human-readable error string, or `null` when both are valid.
 */
export function validateExecuteHandlerArgs(
  handlerId: unknown,
  args: unknown,
): string | null {
  const idResult = HandlerIdSchema.safeParse(handlerId);
  if (!idResult.success) return `invalid handlerId: ${idResult.error.message}`;
  const argsResult = HandlerArgsSchema.safeParse(args);
  if (!argsResult.success) return `invalid args: ${argsResult.error.message}`;
  return null;
}
