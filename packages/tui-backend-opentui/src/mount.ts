import type { OpenTuiDescriptor } from "./mapping";

/** An OpenTUI Renderable node (structural — the parts the adapter uses). */
export interface OpenTuiNode {
  add(child: OpenTuiNode): void;
}

/** The subset of @opentui/core's imperative API the adapter constructs. */
export interface OpenTuiApi {
  BoxRenderable: new (renderer: unknown, options: Record<string, unknown>) => OpenTuiNode;
  TextRenderable: new (renderer: unknown, options: Record<string, unknown>) => OpenTuiNode;
}

/**
 * Turn an {@link OpenTuiDescriptor} tree into OpenTUI Renderables via the
 * imperative API, returning the root node. Text options are flattened onto the
 * TextRenderable (content + fg/bg/attributes) as @opentui/core expects. This is
 * pure w.r.t. the API object, so it's testable with a mock (no native runtime).
 */
export function mountDescriptor(
  api: OpenTuiApi,
  renderer: unknown,
  descriptor: OpenTuiDescriptor,
): OpenTuiNode {
  if (descriptor.type === "text") {
    return new api.TextRenderable(renderer, {
      content: descriptor.content,
      ...descriptor.options,
    });
  }

  const box = new api.BoxRenderable(renderer, { ...descriptor.options });
  for (const child of descriptor.children) {
    box.add(mountDescriptor(api, renderer, child));
  }
  return box;
}
