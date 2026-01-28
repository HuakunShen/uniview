<script lang="ts">
	import { setContext, onMount, onDestroy } from "svelte";
	import type { UINode } from "@uniview/protocol";
	import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";
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
		unsubscribe = controller.subscribe((newTree) => {
			tree = newTree;
		});
		await controller.connect();
	});

	onDestroy(() => {
		unsubscribe?.();
		controller.disconnect();
	});
</script>

{#if tree}
	<ComponentRenderer node={tree} />
{:else if loading}
	{@render loading()}
{:else}
	<div>Loading...</div>
{/if}
