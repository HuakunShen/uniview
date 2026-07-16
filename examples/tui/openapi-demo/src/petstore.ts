import type { OpenApiSpec } from "./openapi";

/**
 * A compact but realistic OpenAPI 3.0 document (a trimmed Swagger Petstore),
 * authored as a typed constant so it is checked against {@link OpenApiSpec}
 * with no casts. It exercises the browser's interesting cases: `$ref`s, nested
 * arrays, `allOf` composition, and a self-referential schema (Category → parent)
 * for the tree's cycle guard.
 */
export const petstore: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Swagger Petstore",
    version: "1.0.6",
    description: "A sample API that browses a pet store inventory.",
  },
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["pets"],
        parameters: [
          { name: "limit", in: "query", required: false, description: "Max items to return", schema: { type: "integer", format: "int32" } },
          { name: "tags", in: "query", required: false, description: "Filter by tags", schema: { type: "array", items: { type: "string" } } },
        ],
        responses: {
          "200": { description: "A paged array of pets", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } } } } },
          default: { description: "Unexpected error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        tags: ["pets"],
        requestBody: { required: true, description: "Pet to add", content: { "application/json": { schema: { $ref: "#/components/schemas/NewPet" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } },
          default: { description: "Unexpected error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        operationId: "getPetById",
        summary: "Info for a specific pet",
        tags: ["pets"],
        parameters: [{ name: "petId", in: "path", required: true, description: "The id of the pet", schema: { type: "string" } }],
        responses: {
          "200": { description: "The pet", content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          default: { description: "Unexpected error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        operationId: "deletePet",
        summary: "Delete a pet",
        tags: ["pets"],
        parameters: [{ name: "petId", in: "path", required: true, description: "The id of the pet", schema: { type: "string" } }],
        responses: {
          "204": { description: "Deleted" },
          default: { description: "Unexpected error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/store/inventory": {
      get: {
        operationId: "getInventory",
        summary: "Return pet inventories by status",
        tags: ["store"],
        responses: {
          "200": { description: "A map of status → count", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer", format: "int64" },
          name: { type: "string", description: "The pet's display name" },
          tag: { type: "string" },
          status: { type: "string", enum: ["available", "pending", "sold"] },
          category: { $ref: "#/components/schemas/Category" },
          photoUrls: { type: "array", items: { type: "string", format: "uri" } },
        },
      },
      NewPet: {
        allOf: [
          { $ref: "#/components/schemas/Pet" },
          { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        ],
      },
      Category: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          name: { type: "string" },
          parent: { $ref: "#/components/schemas/Category" },
        },
      },
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "integer", format: "int32" },
          message: { type: "string" },
        },
      },
    },
  },
};
