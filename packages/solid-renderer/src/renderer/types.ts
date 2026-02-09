export interface SolidNode {
	_type: "element"
	id: string
	type: string
	props: Record<string, unknown>
	children: (SolidNode | SolidTextNode | SolidSlotNode)[]
	parent: SolidNode | null
}

export interface SolidTextNode {
	_type: "text"
	id: string
	value: string
	parent: SolidNode | null
}

export interface SolidSlotNode {
	_type: "slot"
	id: string
	parent: SolidNode | null
}

export type AnyNode = SolidNode | SolidTextNode | SolidSlotNode

let idCounter = 0

export function generateId(prefix = "node"): string {
	return `${prefix}-${++idCounter}`
}

export function resetIdCounter(): void {
	idCounter = 0
}
