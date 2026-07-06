/**
 * Incremental-mode root seeding (BACKLOG #9).
 *
 * Solid mounts the plugin into a synthetic container node (id "root") the host
 * never sees. Previously the reconciler emitted appendChild(parentId:"root")
 * for the container insert — a no-op on the host, which never seeded its tree —
 * so the runtime had to resend the whole tree every flush. The reconciler now
 * emits a setRoot mutation for container-level changes, so a host MutableTree
 * converges from the mutation stream ALONE.
 */
import { afterEach, describe, expect, test } from "vitest";
import type { Mutation, UINode } from "@uniview/protocol";
import {
	HandlerRegistry,
	SolidMutationCollector,
	createElement,
	createTextNode,
	insertNode,
	serializeTree,
	setMutationCollector,
	setMutationUpdateCallback,
	setRootNode,
	resetIdCounter,
	type SolidNode,
} from "../src";
import { MutableTree } from "../../host-sdk/src/mutable-tree";

function makeContainer(): SolidNode {
	return {
		_type: "element",
		id: "root",
		type: "div",
		props: {},
		children: [],
		parent: null,
	};
}

const flush = () => new Promise<void>((r) => queueMicrotask(() => r()));

afterEach(() => {
	setMutationCollector(null);
	setMutationUpdateCallback(() => {});
});

describe("solid incremental root seeding", () => {
	test("host MutableTree converges from mutations alone (no full tree)", async () => {
		resetIdCounter();
		const registry = new HandlerRegistry();
		const collector = new SolidMutationCollector(registry);
		const batches: Mutation[][] = [];

		const container = makeContainer();
		setRootNode(container);
		setMutationCollector(collector);
		setMutationUpdateCallback((m) => batches.push(m));

		// Build the plugin's root subtree bottom-up (as Solid does), then
		// attach it to the synthetic container.
		const appRoot = createElement("section") as SolidNode;
		insertNode(appRoot, createTextNode("hello"));
		insertNode(container, appRoot);
		await flush();

		const host = new MutableTree();
		for (const batch of batches.splice(0)) {
			for (const m of batch) {
				if (host.getTree() === null && m.type === "setRoot") host.init(m.node);
				else host.applyMutations([m]);
			}
		}

		// The very first meaningful mutation must be a setRoot seeding the
		// real app-root id — not an appendChild against the container.
		expect(host.getTree()).not.toBeNull();
		expect(host.getTree()!.id).toBe(appRoot.id);

		const truth = serializeTree(appRoot, new HandlerRegistry()) as UINode;
		expect(host.getTree()).toEqual(truth);

		// A post-seed update references real node ids and still converges.
		insertNode(appRoot, createElement("span"));
		await flush();
		for (const batch of batches.splice(0)) host.applyMutations(batch);

		const truth2 = serializeTree(appRoot, new HandlerRegistry()) as UINode;
		expect(host.getTree()).toEqual(truth2);
		expect(host.getTree()!.children).toHaveLength(2);
	});
});
