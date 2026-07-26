/**
 * Types for the vendored `universal.js`, copied verbatim from
 * `node_modules/solid-js/universal/types/universal.d.ts` (solid-js@1.9.10).
 *
 * The real package keeps the same pair of files side by side —
 * packages/solid-renderer/src/renderer/universal.js and universal.d.ts — for
 * the same reason: the renderer itself is untyped JS, and the contract with it
 * is a hand-maintained declaration.
 *
 * THIS INTERFACE IS THE POINT OF STEP 06. Ten members. Compare it with
 * react-reconciler's `HostConfig`, of which the real React renderer implements
 * 53 (packages/react-renderer/src/reconciler/host-config.ts).
 */
export interface RendererOptions<NodeType> {
  createElement(tag: string): NodeType
  createTextNode(value: string): NodeType
  replaceText(textNode: NodeType, value: string): void
  isTextNode(node: NodeType): boolean
  setProperty<T>(node: NodeType, name: string, value: T, prev?: T): void
  insertNode(parent: NodeType, node: NodeType, anchor?: NodeType): void
  removeNode(parent: NodeType, node: NodeType): void
  getParentNode(node: NodeType): NodeType | undefined
  getFirstChild(node: NodeType): NodeType | undefined
  getNextSibling(node: NodeType): NodeType | undefined
}

export interface Renderer<NodeType> {
  render(code: () => NodeType, node: NodeType): () => void
  effect<T>(fn: (prev?: T) => T, init?: T): void
  memo<T>(fn: () => T, equal: boolean): () => T
  createComponent<T>(Comp: (props: T) => NodeType, props: T): NodeType
  createElement(tag: string): NodeType
  createTextNode(value: string): NodeType
  insertNode(parent: NodeType, node: NodeType, anchor?: NodeType): void
  insert<T>(parent: unknown, accessor: (() => T) | T, marker?: unknown, initial?: unknown): NodeType
  spread<T>(node: unknown, accessor: (() => T) | T, skipChildren?: boolean): void
  setProp<T>(node: NodeType, name: string, value: T, prev?: T): T
  mergeProps(...sources: unknown[]): unknown
  use<A, T>(fn: (element: NodeType, arg: A) => T, element: NodeType, arg: A): T
}

export function createRenderer<NodeType>(options: RendererOptions<NodeType>): Renderer<NodeType>
