/**
 * Regression tests for move semantics in the solid renderer.
 *
 * Solid's universal renderer reuses insertNode to MOVE existing nodes when
 * keyed lists (<For>) reorder. DOM insertBefore auto-detaches; the
 * array-based children model must detach explicitly, otherwise the same
 * node ends up in a children array twice — serialized trees then contain
 * duplicate ids, which crashes keyed renderers on the host.
 */
import { describe, expect, test } from "vitest";
import { createElement, createTextNode, insertNode } from "../src";
import type { AnyNode, SolidNode } from "../src";

function childIds(parent: SolidNode): string[] {
	return parent.children.map((c) => c.id);
}

function expectNoDuplicates(ids: string[]): void {
	expect(new Set(ids).size).toBe(ids.length);
}

function makeList(parent: SolidNode, count: number): AnyNode[] {
	const nodes: AnyNode[] = [];
	for (let i = 0; i < count; i++) {
		const node = createElement("Item");
		insertNode(parent, node);
		nodes.push(node);
	}
	return nodes;
}

describe("solid keyed move semantics", () => {
	test("insertNode moves an existing child instead of duplicating it", () => {
		const parent = createElement("List") as SolidNode;
		const [a, b, c] = makeList(parent, 3);

		// Move a before c (same parent): [a,b,c] -> [b,a,c]
		insertNode(parent, a, c);

		expect(childIds(parent)).toEqual([b.id, a.id, c.id]);
		expectNoDuplicates(childIds(parent));
		expect(a.parent).toBe(parent);
	});

	test("append-style insertNode moves an existing child to the end", () => {
		const parent = createElement("List") as SolidNode;
		const [a, b, c] = makeList(parent, 3);

		// Move a to the end: [a,b,c] -> [b,c,a]
		insertNode(parent, a);

		expect(childIds(parent)).toEqual([b.id, c.id, a.id]);
		expectNoDuplicates(childIds(parent));
	});

	test("insertNode detaches from the previous parent on cross-parent moves", () => {
		const parentA = createElement("SectionA") as SolidNode;
		const parentB = createElement("SectionB") as SolidNode;
		const [a, b] = makeList(parentA, 2);
		const [x] = makeList(parentB, 1);

		// Move b from parentA into parentB before x
		insertNode(parentB, b, x);

		expect(childIds(parentA)).toEqual([a.id]);
		expect(childIds(parentB)).toEqual([b.id, x.id]);
		expect(b.parent).toBe(parentB);
	});

	test("reverse shuffle via repeated moves never duplicates nodes", () => {
		const parent = createElement("List") as SolidNode;
		const nodes = makeList(parent, 6);

		// Reverse the list the way a keyed reconciler would: move each node
		// to the front, one at a time.
		for (const node of nodes) {
			const first = parent.children[0];
			if (first !== node) insertNode(parent, node, first);
		}

		expectNoDuplicates(childIds(parent));
		expect(childIds(parent)).toEqual(nodes.map((n) => n.id).reverse());
	});

	test("text nodes are moved, not duplicated", () => {
		const parent = createElement("P") as SolidNode;
		const t1 = createTextNode("one");
		const t2 = createTextNode("two");
		insertNode(parent, t1);
		insertNode(parent, t2);

		// Move t1 after t2 (append form)
		insertNode(parent, t1);

		expect(childIds(parent)).toEqual([t2.id, t1.id]);
		expectNoDuplicates(childIds(parent));
	});
});
