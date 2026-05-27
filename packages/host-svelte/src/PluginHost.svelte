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
	let error = $state<string | null>(null);
	let unsubscribe: (() => void) | null = null;

	setContext("uniview:controller", controller);
	setContext("uniview:registry", registry);

	onMount(async () => {
		unsubscribe = controller.subscribe((newTree: UINode | null) => {
			tree = newTree;
		});
		try {
			await controller.connect();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	});

	onDestroy(() => {
		unsubscribe?.();
		controller.disconnect();
	});
</script>

{#if error}
	<div style="padding: 2rem; text-align: center; color: #ef4444;">
		<p style="font-weight: 600;">Failed to load plugin</p>
		<p style="font-size: 0.875rem; opacity: 0.7; margin-top: 0.5rem;">{error}</p>
	</div>
{:else if tree}
	<ComponentRenderer node={tree} />
{:else if loading}
	{@render loading()}
{:else}
	<div>Loading...</div>
{/if}
