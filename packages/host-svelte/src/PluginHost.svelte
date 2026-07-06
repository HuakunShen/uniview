<script lang="ts">
	import { setContext, onMount, onDestroy, untrack } from "svelte";
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
	let runtimeError = $state<string | null>(null);
	let unsubscribe: (() => void) | null = null;
	let unsubscribeErrors: (() => void) | null = null;

	setContext("uniview:controller", untrack(() => controller));
	setContext("uniview:registry", untrack(() => registry));

	onMount(async () => {
		unsubscribe = controller.subscribe((newTree: UINode | null) => {
			tree = newTree;
			// A fresh tree means the plugin recovered/re-rendered
			runtimeError = null;
		});
		unsubscribeErrors =
			controller.subscribeErrors?.((message: string) => {
				runtimeError = message;
			}) ?? null;
		try {
			await controller.connect();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	});

	onDestroy(() => {
		unsubscribe?.();
		unsubscribeErrors?.();
		controller.disconnect();
	});
</script>

{#if error}
	<div style="padding: 2rem; text-align: center; color: #ef4444;">
		<p style="font-weight: 600;">Failed to load plugin</p>
		<p style="font-size: 0.875rem; opacity: 0.7; margin-top: 0.5rem;">{error}</p>
	</div>
{:else}
	{#if runtimeError}
		<div
			role="alert"
			style="padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; border: 1px solid #ef4444; border-radius: 0.375rem; color: #ef4444; font-size: 0.875rem;"
		>
			<span style="font-weight: 600;">Plugin error:</span>
			{runtimeError}
		</div>
	{/if}
	{#if tree}
		<ComponentRenderer node={tree} />
	{:else if loading}
		{@render loading()}
	{:else}
		<div>Loading...</div>
	{/if}
{/if}
