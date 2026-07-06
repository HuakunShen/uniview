type Handler = (...args: unknown[]) => unknown

/**
 * Registry mapping stable handler ids to plugin-side functions.
 *
 * Handler ids are deterministic — `${nodeId}:${propName}` — so re-serializing
 * a node OVERWRITES its entries instead of growing the registry, and an
 * event RPC that arrives after a re-render executes that node's latest
 * handler (correct semantics) instead of a stale or wrong one. The previous
 * counter-based ids were reset by clear() on every full update, so a late
 * event could execute a DIFFERENT node's handler that reused the id.
 *
 * Ownership is tracked per node: `syncNode` replaces a node's full handler
 * set (dropping props that disappeared), `releaseNode` frees everything a
 * removed node owned. Full-tree serialization brackets its walk with
 * `beginSweep`/`endSweep` to release nodes that are no longer in the tree.
 */
export class HandlerRegistry {
	private handlers: Map<string, Handler> = new Map()
	private nodeHandlers: Map<string, Set<string>> = new Map()
	private sweepSeen: Set<string> | null = null

	/**
	 * Replace the handler set owned by a node. Ids present before but not in
	 * `next` are released; ids in `next` are (re-)registered in place.
	 */
	syncNode(nodeId: string, next: Map<string, Handler>): void {
		this.sweepSeen?.add(nodeId)

		const prev = this.nodeHandlers.get(nodeId)
		if (prev) {
			for (const id of prev) {
				if (!next.has(id)) this.handlers.delete(id)
			}
		}

		if (next.size === 0) {
			this.nodeHandlers.delete(nodeId)
			return
		}

		const ids = new Set<string>()
		for (const [id, handler] of next) {
			this.handlers.set(id, handler)
			ids.add(id)
		}
		this.nodeHandlers.set(nodeId, ids)
	}

	/** Release every handler owned by a node (e.g. on removeChild). */
	releaseNode(nodeId: string): void {
		const ids = this.nodeHandlers.get(nodeId)
		if (!ids) return
		for (const id of ids) this.handlers.delete(id)
		this.nodeHandlers.delete(nodeId)
	}

	/**
	 * Start tracking which nodes a full-tree serialization touches.
	 * Nodes not seen by the matching `endSweep` are released — they left
	 * the tree without an explicit removeChild (full update mode).
	 */
	beginSweep(): void {
		this.sweepSeen = new Set()
	}

	endSweep(): void {
		const seen = this.sweepSeen
		this.sweepSeen = null
		if (!seen) return
		for (const nodeId of [...this.nodeHandlers.keys()]) {
			if (!seen.has(nodeId)) this.releaseNode(nodeId)
		}
	}

	async execute(handlerId: string, ...args: unknown[]): Promise<unknown> {
		const handler = this.handlers.get(handlerId)
		if (!handler) {
			console.warn(
				`[uniview] executeHandler: no handler registered for "${handlerId}" (node unmounted or event arrived after removal)`,
			)
			return
		}

		const result = handler(...args)
		if (result instanceof Promise) {
			return await result
		}
		return result
	}

	has(handlerId: string): boolean {
		return this.handlers.has(handlerId)
	}

	clear(): void {
		this.handlers.clear()
		this.nodeHandlers.clear()
		this.sweepSeen = null
	}

	get size(): number {
		return this.handlers.size
	}
}
