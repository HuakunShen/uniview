/**
 * A tiny, pure OpenAPI v3 model + the helpers the browser needs: flatten paths
 * into operations, resolve `$ref`s against `components/schemas`, and turn a
 * JSON-Schema into a collapsible typed tree (with `$ref` drill-down and a cycle
 * guard). This is the reusable "schema viewer" core the research doc called
 * out — framework-agnostic and unit-testable, no renderer dependency.
 */

export interface JsonSchema {
  type?: string;
  format?: string;
  description?: string;
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  enum?: readonly (string | number | boolean)[];
  allOf?: readonly JsonSchema[];
  nullable?: boolean;
  example?: unknown;
}

export interface OperationParam {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface MediaType {
  schema?: JsonSchema;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaType>;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaType>;
}

/** An operation as authored under a path (method is the object key). */
export interface OperationDef {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  parameters?: readonly OperationParam[];
  requestBody?: RequestBody;
  responses?: Record<string, ResponseObject>;
}

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OperationDef>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

/** A flattened operation: an {@link OperationDef} plus its method and path. */
export interface Operation extends OperationDef {
  method: string;
  path: string;
}

/** The HTTP methods we surface, in a stable display order. */
const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

/** Flatten `spec.paths` into a sorted operation list (by path, then method). */
export function listOperations(spec: OpenApiSpec): Operation[] {
  const ops: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const def = item[method];
      if (def) ops.push({ ...def, method, path });
    }
  }
  return ops.sort((a, b) => a.path.localeCompare(b.path) || METHODS.indexOf(a.method as (typeof METHODS)[number]) - METHODS.indexOf(b.method as (typeof METHODS)[number]));
}

/** All tag names used across the spec's operations, de-duplicated + sorted. */
export function listTags(spec: OpenApiSpec): string[] {
  const tags = new Set<string>();
  for (const op of listOperations(spec)) for (const t of op.tags ?? []) tags.add(t);
  return [...tags].sort();
}

/** The short name of a local `$ref` (`#/components/schemas/Pet` → `Pet`). */
export function refName(ref: string): string {
  const idx = ref.lastIndexOf("/");
  return idx >= 0 ? ref.slice(idx + 1) : ref;
}

/** Resolve a local `#/components/schemas/...` ref, or `undefined` if unknown. */
export function resolveRef(spec: OpenApiSpec, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let cur: unknown = spec;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return (cur ?? undefined) as JsonSchema | undefined;
}

/** Pick the first media type's schema from a content map (prefers JSON). */
export function contentSchema(content: Record<string, MediaType> | undefined): JsonSchema | undefined {
  if (!content) return undefined;
  return content["application/json"]?.schema ?? Object.values(content)[0]?.schema;
}

/** A collapsible tree node — structurally compatible with tui-react's `TreeNode`. */
export interface SchemaTreeNode {
  id: string;
  label: string;
  children?: SchemaTreeNode[];
}

/** The one-line type descriptor for a schema, e.g. `array<string>`, `Pet`, `integer(int64)`. */
function typeLabel(spec: OpenApiSpec, schema: JsonSchema): string {
  if (schema.$ref) return refName(schema.$ref);
  if (schema.allOf) return "allOf";
  if (schema.type === "array") {
    const items = schema.items;
    const inner = items ? (items.$ref ? refName(items.$ref) : items.type ?? "any") : "any";
    return `array<${inner}>`;
  }
  let base = schema.type ?? (schema.properties ? "object" : "any");
  if (schema.format) base += `(${schema.format})`;
  if (schema.enum) base += ` = ${schema.enum.join(" | ")}`;
  if (schema.nullable) base += "?";
  return base;
}

/**
 * Build a schema subtree rooted at `schema` labelled `name`. `$ref`s resolve
 * inline; a ref already open on the current path becomes a `↻` leaf so cycles
 * (e.g. a category that references itself) don't recurse forever.
 */
export function schemaToTree(
  spec: OpenApiSpec,
  schema: JsonSchema,
  name: string,
  id: string,
  seen: readonly string[] = [],
): SchemaTreeNode {
  // Follow a local $ref, guarding against cycles.
  if (schema.$ref) {
    const ref = schema.$ref;
    const label = `${name}: ${refName(ref)}`;
    if (seen.includes(ref)) return { id, label: `${label} ↻` };
    const target = resolveRef(spec, ref);
    if (!target) return { id, label: `${label} (unresolved)` };
    const node = schemaToTree(spec, target, name, id, [...seen, ref]);
    return { ...node, label: `${name}: ${refName(ref)}` };
  }

  const label = `${name}: ${typeLabel(spec, schema)}`;
  const children: SchemaTreeNode[] = [];

  if (schema.allOf) {
    schema.allOf.forEach((sub, i) => children.push(schemaToTree(spec, sub, `allOf[${i}]`, `${id}.all${i}`, seen)));
  }
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const marked = required.has(propName) ? `${propName}*` : propName;
      children.push(schemaToTree(spec, propSchema, marked, `${id}.${propName}`, seen));
    }
  }
  if (schema.type === "array" && schema.items) {
    const item = schema.items;
    if (item.$ref || item.properties || item.type === "array") {
      children.push(schemaToTree(spec, item, "items", `${id}.items`, seen));
    }
  }

  const node: SchemaTreeNode = { id, label };
  if (children.length > 0) node.children = children;
  return node;
}

/**
 * The full schema forest for an operation: a `requestBody` root (if present)
 * followed by one root per response status. Each root's subtree is the resolved
 * schema. This is what the browser feeds the schema `<Tree>`.
 */
export function operationSchemaForest(spec: OpenApiSpec, op: Operation): SchemaTreeNode[] {
  const roots: SchemaTreeNode[] = [];
  const bodySchema = contentSchema(op.requestBody?.content);
  if (bodySchema) {
    roots.push(schemaToTree(spec, bodySchema, "requestBody", "req"));
  }
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    const schema = contentSchema(response.content);
    const id = `res.${status}`;
    const desc = response.description ? ` — ${response.description}` : "";
    if (schema) {
      const sub = schemaToTree(spec, schema, status, id);
      roots.push({ id, label: `${status}${desc}: ${sub.label.replace(/^[^:]*:\s*/, "")}`, children: sub.children });
    } else {
      roots.push({ id, label: `${status}${desc}: (no content)` });
    }
  }
  return roots;
}
