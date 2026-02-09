import type { AnyNode } from "./types"

export interface RendererOptions<Node extends AnyNode> {
	createElement(tagName: string): Node
	createTextNode(value: string | number): Node
	createSlotNode(): Node
	isTextNode(node: Node): boolean
	replaceText(textNode: Node, value: string): void
	insertNode(parent: Node, node: Node, anchor?: Node): void
	removeNode(parent: Node, node: Node): void
	setProperty(node: Node, name: string, value: unknown, prev: unknown): void
	getParentNode(childNode: Node): Node | undefined
	getFirstChild(node: Node): Node | undefined
	getNextSibling(node: Node): Node | undefined
}

export interface RendererAPI<Node extends AnyNode> {
	render(code: () => unknown, element: Node): () => void
	insert(parent: Node, accessor: unknown, marker?: Node, initial?: unknown): unknown
	spread(node: Node, accessor: unknown, skipChildren?: boolean): void
	createElement(tagName: string): Node
	createTextNode(value: string | number): Node
	insertNode(parent: Node, node: Node, anchor?: Node): void
	setProp(node: Node, name: string, value: unknown, prev: unknown): unknown
	mergeProps: typeof import("solid-js").mergeProps
	effect: typeof import("solid-js").createRenderEffect
	memo: <T>(fn: () => T) => () => T
	createComponent: typeof import("solid-js").createComponent
	use: (fn: (element: Node, arg: unknown) => unknown, element: Node, arg: unknown) => unknown
}

export function createRenderer<Node extends AnyNode>(
	options: RendererOptions<Node>,
): RendererAPI<Node>
