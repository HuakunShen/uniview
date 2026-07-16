import { describe, expect, it } from "vitest";
import {
  contentSchema,
  listOperations,
  listTags,
  operationSchemaForest,
  refName,
  resolveRef,
  schemaToTree,
  type SchemaTreeNode,
} from "../src/openapi";
import { petstore } from "../src/petstore";

/** Depth-first collect of every node label (for structural assertions). */
function labels(nodes: readonly SchemaTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly SchemaTreeNode[]): void => {
    for (const n of list) {
      out.push(n.label);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

describe("listOperations", () => {
  it("flattens paths × methods into operations, sorted by path then method", () => {
    const ops = listOperations(petstore);
    expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual([
      "get /pets",
      "post /pets",
      "get /pets/{petId}",
      "delete /pets/{petId}",
      "get /store/inventory",
    ]);
  });

  it("carries method and path onto each operation", () => {
    const first = listOperations(petstore)[0]!;
    expect(first.method).toBe("get");
    expect(first.path).toBe("/pets");
    expect(first.operationId).toBe("listPets");
  });
});

describe("listTags", () => {
  it("collects unique sorted tags", () => {
    expect(listTags(petstore)).toEqual(["pets", "store"]);
  });
});

describe("refName / resolveRef", () => {
  it("extracts the short name of a local ref", () => {
    expect(refName("#/components/schemas/Pet")).toBe("Pet");
  });

  it("resolves a local ref to its schema", () => {
    const pet = resolveRef(petstore, "#/components/schemas/Pet");
    expect(pet?.type).toBe("object");
    expect(pet?.properties?.name?.type).toBe("string");
  });

  it("returns undefined for unknown or external refs", () => {
    expect(resolveRef(petstore, "#/components/schemas/Nope")).toBeUndefined();
    expect(resolveRef(petstore, "https://example.com/x")).toBeUndefined();
  });
});

describe("contentSchema", () => {
  it("prefers application/json", () => {
    const schema = contentSchema({ "text/plain": { schema: { type: "string" } }, "application/json": { schema: { type: "object" } } });
    expect(schema?.type).toBe("object");
  });
});

describe("schemaToTree", () => {
  it("drills into a $ref inline", () => {
    const pet = resolveRef(petstore, "#/components/schemas/Pet")!;
    const tree = schemaToTree(petstore, pet, "pet", "root");
    const ls = labels([tree]);
    expect(ls).toContain("id*: integer(int64)");
    expect(ls).toContain("name*: string");
    expect(ls.some((l) => l.startsWith("status:") && l.includes("available | pending | sold"))).toBe(true);
  });

  it("marks a self-referential $ref with ↻ instead of recursing forever", () => {
    const category = resolveRef(petstore, "#/components/schemas/Category")!;
    const tree = schemaToTree(petstore, category, "category", "root");
    const ls = labels([tree]);
    // Category.parent → Category is a cycle; must terminate with a ↻ marker.
    expect(ls.some((l) => l.includes("↻"))).toBe(true);
  });

  it("labels arrays with their element type", () => {
    const pet = resolveRef(petstore, "#/components/schemas/Pet")!;
    const tree = schemaToTree(petstore, pet, "pet", "root");
    expect(labels([tree]).some((l) => l === "photoUrls: array<string>")).toBe(true);
  });
});

describe("operationSchemaForest", () => {
  it("produces a root per response plus requestBody", () => {
    const post = listOperations(petstore).find((o) => o.method === "post" && o.path === "/pets")!;
    const forest = operationSchemaForest(petstore, post);
    const roots = forest.map((n) => n.id);
    expect(roots).toContain("req");
    expect(roots).toContain("res.201");
    expect(roots).toContain("res.default");
  });

  it("gives responses without content a (no content) root", () => {
    const del = listOperations(petstore).find((o) => o.method === "delete")!;
    const forest = operationSchemaForest(petstore, del);
    const noContent = forest.find((n) => n.id === "res.204");
    expect(noContent?.label).toContain("(no content)");
  });
});
