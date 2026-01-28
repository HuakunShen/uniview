import { z } from "zod";
import type { JSONValue, UINode } from "./tree";
import { LAYOUT_TAGS } from "./tree";
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
  }),
);

export const UILayoutTagSchema = z.enum(
  LAYOUT_TAGS as unknown as [string, ...string[]],
);

export const InitializeRequestSchema = z.object({
  protocolVersion: z.number().int().positive(),
  props: JSONValueSchema.optional(),
});

export const UpdatePropsRequestSchema = JSONValueSchema;

export const ExecuteHandlerRequestSchema = z.object({
  handlerId: z.string(),
  args: z.array(JSONValueSchema),
});

export const UpdateTreeRequestSchema = z.union([UINodeSchema, z.null()]);

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
