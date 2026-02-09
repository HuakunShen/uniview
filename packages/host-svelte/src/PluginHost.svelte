<script lang="ts">
	import { setContext, onMount, onDestroy } from "svelte";
	import type { UINode } from "@uniview/protocol";
	import type { PluginController, ComponentRegistry, TreeUpdate } from "@uniview/host-sdk";
	import type { Component, Snippet } from "svelte";
	import ComponentRenderer from "./ComponentRenderer.svelte";

	interface Props {
		controller: PluginController;
		registry: ComponentRegistry<Component>;
		loading?: Snippet;
	}

	let { controller, registry, loading }: Props = $props();

	let tree = $state<UINode | null>(null);
	let unsubscribe: (() => void) | null = null;

	setContext("uniview:controller", controller);
	setContext("uniview:registry", registry);

	onMount(async () => {
		unsubscribe = controller.subscribe((update: TreeUpdate) => {
			if (update.type === "full") {
				tree = update.tree;
			} else if (update.type === "mutations") {
				applyMutations(update.mutations);
			}
		});
		await controller.connect();
	});

	onDestroy(() => {
		unsubscribe?.();
		controller.disconnect();
	});

	function applyMutations(mutations: TreeUpdate["mutations"]) {
		if (!tree) return;
		
		for (const mutation of mutations) {
			applyMutation(mutation);
		}
	}

	function applyMutation(mutation: TreeUpdate["mutations"][number]) {
		switch (mutation.type) {
			case "setProp":
				applySetProp(mutation.nodeId, mutation.key, mutation.value);
				break;
			case "removeProp":
				applyRemoveProp(mutation.nodeId, mutation.key);
				break;
			case "create":
				applyCreate(mutation);
				break;
			case "remove":
				applyRemove(mutation.nodeId, mutation.parentId);
				break;
			case "setText":
				applySetText(mutation.nodeId, mutation.text);
				break;
			case "reorder":
				applyReorder(mutation.parentId, mutation.childIds);
				break;
		}
	}

	function applySetProp(nodeId: string, key: string, value: unknown) {
		const node = findNode(tree, nodeId);
		if (node) {
			node.props[key] = value;
		}
	}

	function applyRemoveProp(nodeId: string, key: string) {
		const node = findNode(tree, nodeId);
		if (node) {
			delete node.props[key];
		}
	}

	function applyCreate(mutation: Extract<TreeUpdate["mutations"][number], { type: "create" }>) {
		const newNode: UINode = {
			id: mutation.nodeId,
			type: mutation.nodeType,
			props: mutation.props || {},
			children: [],
		};

		if (mutation.parentId === null) {
			tree = newNode;
		} else {
			const parent = findNode(tree, mutation.parentId);
			if (parent) {
				const index = Math.min(mutation.index, parent.children.length);
				parent.children.splice(index, 0, newNode);
			}
		}
	}

	function applyRemove(nodeId: string, parentId: string) {
		const parent = findNode(tree, parentId);
		if (parent) {
			const index = parent.children.findIndex(
				(child) => typeof child !== "string" && child.id === nodeId
			);
			if (index !== -1) {
				parent.children.splice(index, 1);
			}
		}
	}

	function applySetText(nodeId: string, text: string) {
		if (!tree) return;
		// Text nodes are UINode objects with type "text" - update their props.text
		for (const node of getAllNodes(tree)) {
			for (const child of node.children) {
				if (typeof child !== "string" && child.id === nodeId && child.type === "text") {
					child.props.text = text;
					return;
				}
			}
		}
	}

	function applyReorder(parentId: string, childIds: string[]) {
		const parent = findNode(tree, parentId);
		if (!parent) return;

		const childMap = new Map<string, UINode | string>();
		for (const child of parent.children) {
			if (typeof child === "string") {
				childMap.set(`text_${Math.random().toString(36).slice(2)}`, child);
			} else {
				childMap.set(child.id, child);
			}
		}

		const reordered: (UINode | string)[] = [];
		for (const id of childIds) {
			if (childMap.has(id)) {
				reordered.push(childMap.get(id)!);
			}
		}

		for (const child of parent.children) {
			const id = typeof child === "string" ? null : child.id;
			if (id && !childIds.includes(id)) {
				reordered.push(child);
			}
		}

		parent.children = reordered;
	}

	function findNode(root: UINode | null, nodeId: string): UINode | null {
		if (!root) return null;
		if (root.id === nodeId) return root;
		
		for (const child of root.children) {
			if (typeof child !== "string") {
				const found = findNode(child, nodeId);
				if (found) return found;
			}
		}
		return null;
	}

	function getAllNodes(root: UINode): UINode[] {
		const nodes: UINode[] = [root];
		for (const child of root.children) {
			if (typeof child !== "string") {
				nodes.push(...getAllNodes(child));
			}
		}
		return nodes;
	}
</script>

{#if tree}
	<ComponentRenderer node={tree} />
{:else if loading}
	{@render loading()}
{:else}
	<div>Loading...</div>
{/if}
