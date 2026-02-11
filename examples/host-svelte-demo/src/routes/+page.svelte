<script lang="ts">
	import { browser } from "$app/environment";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { PluginHost } from "@uniview/host-svelte";
	import { createWorkerController, createWebSocketController, createMainController, createComponentRegistry } from "@uniview/host-sdk";
	import type { PluginController } from "@uniview/host-sdk";
	import type { Component } from "svelte";
	import { SimpleDemo, AdvancedDemo } from "@uniview/example-plugin";
	import PluginButton from '$lib/components/plugin/PluginButton.svelte';
	import PluginInput from '$lib/components/plugin/PluginInput.svelte';
	import PluginSwitch from '$lib/components/plugin/PluginSwitch.svelte';
	import PluginToggle from '$lib/components/plugin/PluginToggle.svelte';

	type FrameworkType = 'react' | 'solid';
	type DemoType = 'simple' | 'advanced' | 'benchmark';
	type RuntimeMode = 'worker' | 'main-thread' | 'node-server';
	type UpdateMode = 'full' | 'incremental';

	// Read initial values from URL query params
	function getInitialValues() {
		if (!browser) {
			return { framework: 'react', demo: 'simple', runtime: 'worker', update: 'full' };
		}
		const url = new URL(window.location.href);
		const framework = (url.searchParams.get('framework') as FrameworkType) || 'react';
		const demo = (url.searchParams.get('demo') as DemoType) || 'simple';
		const runtime = (url.searchParams.get('runtime') as RuntimeMode) || 'worker';
		const update = (url.searchParams.get('update') as UpdateMode) || 'full';
		return {
			framework: ['react', 'solid'].includes(framework) ? framework : 'react',
			demo: ['simple', 'advanced', 'benchmark'].includes(demo) ? demo : 'simple',
			runtime: ['worker', 'main-thread', 'node-server'].includes(runtime) ? runtime : 'worker',
			update: ['full', 'incremental'].includes(update) ? update : 'full',
		};
	}

	const initial = getInitialValues();

	let framework: FrameworkType = $state(initial.framework as FrameworkType);
	let currentDemo: DemoType = $state(initial.demo as DemoType);
	let runtimeMode: RuntimeMode = $state(initial.runtime as RuntimeMode);
	let updateMode: UpdateMode = $state(initial.update as UpdateMode);

	// Update URL when state changes
	$effect(() => {
		if (!browser) return;
		const url = new URL(window.location.href);
		url.searchParams.set('framework', framework);
		url.searchParams.set('demo', currentDemo);
		url.searchParams.set('runtime', runtimeMode);
		url.searchParams.set('update', updateMode);
		goto(url.toString(), { replaceState: true, keepFocus: true });
	});

	// Reset to worker mode when switching to Solid (main-thread not supported)
	$effect(() => {
		if (framework === 'solid' && runtimeMode === 'main-thread') {
			runtimeMode = 'worker';
		}
	});

	// Plugin URLs - served from bridge server
	let pluginUrl = $derived.by(() => {
		if (currentDemo === 'benchmark') {
			// Benchmark plugins have -full and -incremental variants
			const mode = updateMode === 'full' ? 'full' : 'incremental';
			return `http://localhost:3000/${framework}/benchmark-${mode}.worker.js`;
		}
		const demo = currentDemo === 'simple' ? 'simple-demo' : 'advanced-demo';
		return `http://localhost:3000/${framework}/${demo}.worker.js`;
	});

	// Bridge server URL for Node.js mode (single server for all plugins)
	const bridgeServerUrl = 'ws://localhost:3000';

	// Plugin ID based on current demo and framework
	let pluginId = $derived.by(() => {
		if (currentDemo === 'benchmark') {
			const mode = updateMode === 'full' ? 'full' : 'incremental';
			return framework === 'solid' ? `solid-benchmark-${mode}` : `benchmark-${mode}`;
		}
		const demo = currentDemo === 'simple' ? 'simple-demo' : 'advanced-demo';
		return framework === 'solid' ? `solid-${demo}` : demo;
	});

	// Create controller based on mode - using $derived for controller creation
	let controllerConfig = $derived.by(() => {
		if (!browser) return null;

		const mode = runtimeMode;
		const demo = currentDemo;
		const workerUrl = pluginUrl;
		const wsUrl = bridgeServerUrl;
		const pId = pluginId;

		// Create registry (shared across modes)
		const newRegistry = createComponentRegistry<Component>();
		newRegistry.register('Button', PluginButton);
		newRegistry.register('Input', PluginInput);
		newRegistry.register('Switch', PluginSwitch);
		newRegistry.register('Toggle', PluginToggle);

		// Create appropriate controller based on mode
		let newController: PluginController;
		if (mode === 'worker') {
			newController = createWorkerController({
				pluginUrl: workerUrl,
			});
		} else if (mode === 'node-server') {
			newController = createWebSocketController({
				serverUrl: wsUrl,
				pluginId: pId,
			});
		} else {
			// Main thread mode - only available for React (Solid can't import into React main-thread)
			newController = createMainController({
				App: demo === 'simple' ? SimpleDemo : AdvancedDemo,
			});
		}

		return { controller: newController, registry: newRegistry };
	});

	// Cleanup on change
	$effect(() => {
		const config = controllerConfig;
		return () => {
			if (config?.controller) {
				config.controller.disconnect();
			}
		};
	});

	// Expose for template
	let controller = $derived(controllerConfig?.controller ?? null);
	let registry = $derived(controllerConfig?.registry ?? null);
</script>

<div class="min-h-screen bg-zinc-950">
	<div class="container mx-auto px-4 py-8">
		<div class="mx-auto max-w-4xl">
			<!-- Header -->
			<div class="mb-8 space-y-2">
				<h1 class="text-3xl font-bold tracking-tight text-zinc-50">Uniview Demo</h1>
				<p class="text-lg text-zinc-400">
					{framework === 'solid' ? 'Solid' : 'React'} plugins rendered in Svelte via @uniview
				</p>
			</div>

			<!-- Main Card -->
			<div class="rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
				<div class="p-6">
					<div class="space-y-6">
						<!-- Framework Selector -->
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="text-sm font-medium text-zinc-400">Framework:</div>
							<div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
								<button
									class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {framework === 'react'
										? 'bg-zinc-700 text-zinc-50 shadow-sm'
										: 'text-zinc-400 hover:text-zinc-300'}"
									onclick={() => (framework = 'react')}
								>
									React
								</button>
								<button
									class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {framework === 'solid'
										? 'bg-zinc-700 text-zinc-50 shadow-sm'
										: 'text-zinc-400 hover:text-zinc-300'}"
									onclick={() => (framework = 'solid')}
								>
									Solid
								</button>
							</div>
						</div>

						<!-- Runtime Mode Toggle -->
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="text-sm font-medium text-zinc-400">Runtime Mode:</div>
							<div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
								<button
									class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {runtimeMode === 'worker'
										? 'bg-zinc-700 text-zinc-50 shadow-sm'
										: 'text-zinc-400 hover:text-zinc-300'}"
									onclick={() => (runtimeMode = 'worker')}
								>
									<span class="text-base">⚡</span> Worker
								</button>
								<button
									class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {runtimeMode === 'node-server'
										? 'bg-zinc-700 text-zinc-50 shadow-sm'
										: 'text-zinc-400 hover:text-zinc-300'}"
									onclick={() => (runtimeMode = 'node-server')}
								>
									<span class="text-base">🖥️</span> Node.js
								</button>
								<button
									class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {runtimeMode === 'main-thread'
										? 'bg-zinc-700 text-zinc-50 shadow-sm'
										: 'text-zinc-400 hover:text-zinc-300'} {framework === 'solid' ? 'opacity-40 cursor-not-allowed' : ''}"
									onclick={() => { if (framework !== 'solid') runtimeMode = 'main-thread' }}
									disabled={framework === 'solid'}
									title={framework === 'solid' ? 'Main thread mode is not available for Solid plugins' : ''}
								>
									<span class="text-base">🧵</span> Main
								</button>
							</div>
						</div>

						<!-- Update Mode Toggle (only for worker/websocket modes) -->
						{#if runtimeMode !== 'main-thread'}
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="text-sm font-medium text-zinc-400">Update Mode:</div>
								<div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
									<button
										class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {updateMode === 'full'
											? 'bg-zinc-700 text-zinc-50 shadow-sm'
											: 'text-zinc-400 hover:text-zinc-300'}"
										onclick={() => (updateMode = 'full')}
									>
										Full Tree
									</button>
									<button
										class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {updateMode === 'incremental'
											? 'bg-zinc-700 text-zinc-50 shadow-sm'
											: 'text-zinc-400 hover:text-zinc-300'}"
										onclick={() => (updateMode = 'incremental')}
									>
										Incremental
									</button>
								</div>
							</div>
						{/if}

						<!-- Demo Tabs -->
						<div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
							<button
								class="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {currentDemo === 'simple'
									? 'bg-zinc-700 text-zinc-50 shadow-sm'
									: 'text-zinc-400 hover:text-zinc-300'}"
								onclick={() => (currentDemo = 'simple')}
							>
								Simple Demo
							</button>
							<button
								class="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {currentDemo === 'advanced'
									? 'bg-zinc-700 text-zinc-50 shadow-sm'
									: 'text-zinc-400 hover:text-zinc-300'}"
								onclick={() => (currentDemo = 'advanced')}
							>
								Advanced Demo
							</button>
							<button
								class="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none {currentDemo === 'benchmark'
									? 'bg-zinc-700 text-zinc-50 shadow-sm'
									: 'text-zinc-400 hover:text-zinc-300'}"
								onclick={() => (currentDemo = 'benchmark')}
							>
								Benchmark
							</button>
						</div>

						<!-- Window Chrome -->
						<div class="flex items-center gap-2 border-b border-zinc-800 pb-4">
							<div class="h-3 w-3 rounded-full bg-red-500"></div>
							<div class="h-3 w-3 rounded-full bg-yellow-500"></div>
							<div class="h-3 w-3 rounded-full bg-green-500"></div>
							<span class="ml-4 font-mono text-sm text-zinc-500">
								{#if runtimeMode === 'worker'}
									{pluginUrl}
								{:else if runtimeMode === 'node-server'}
									{bridgeServerUrl}/host/{pluginId}
								{:else}
									{currentDemo}-demo.tsx (local)
								{/if}
							</span>
						</div>

						<!-- Plugin Container -->
						<div class="min-h-[300px] rounded-lg bg-zinc-950/50 p-4">
							{#if browser && controller && registry}
								{#key framework + runtimeMode + currentDemo + updateMode}
									<PluginHost {controller} {registry}>
										{#snippet loading()}
											<div class="flex h-[200px] items-center justify-center">
												<div class="flex items-center gap-3 text-zinc-500">
													<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
														<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
														<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
													<span>Loading plugin...</span>
												</div>
											</div>
										{/snippet}
									</PluginHost>
								{/key}
							{:else}
								<div class="flex h-[200px] items-center justify-center text-zinc-500">
									Initializing...
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="mt-8 space-y-2 text-center text-sm text-zinc-500">
				<p>Built with Svelte 5, {framework === 'solid' ? 'Solid' : 'React'}, and @uniview</p>
				<p class="text-xs">
					{currentDemo === 'benchmark'
						? 'Showing: Performance benchmark with 1000 list items (max 2000)'
						: currentDemo === 'simple'
							? 'Showing: Basic Button and Input components'
							: 'Showing: Form, Switch, and Toggle components'}
				</p>
				{#if runtimeMode === 'worker'}
					<p class="text-xs text-violet-400">
						⚡ {framework === 'solid' ? 'Solid' : 'React'} plugin running in Web Worker (sandboxed)
						{#if currentDemo === 'benchmark'}
							• {updateMode === 'incremental' ? 'Incremental updates' : 'Full tree updates'}
						{/if}
					</p>
				{:else if runtimeMode === 'node-server'}
					<p class="text-xs text-purple-400">
						🖥️ {framework === 'solid' ? 'Solid' : 'React'} plugin running in Node.js (WebSocket)
						{#if currentDemo === 'benchmark'}
							• {updateMode === 'incremental' ? 'Incremental updates' : 'Full tree updates'}
						{/if}
					</p>
				{:else}
					<p class="text-xs text-emerald-400">
						🧵 React plugin running in Main Thread (direct)
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>
