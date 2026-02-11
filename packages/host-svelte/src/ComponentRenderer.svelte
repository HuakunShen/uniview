<script lang="ts">
	import { getContext } from "svelte";
	import type { UINode, JSONValue } from "@uniview/protocol";
	import { LAYOUT_TAGS, isHandlerIdProp, extractEventName } from "@uniview/protocol";
	import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";
	import type { Component } from "svelte";
	import Self from "./ComponentRenderer.svelte";

	interface Props {
		node: UINode | string;
	}

	let { node }: Props = $props();

	const controller = getContext<PluginController>("uniview:controller");
	const registry = getContext<ComponentRegistry<Component>>("uniview:registry");

	function createHandler(handlerId: string) {
		return async (...args: unknown[]) => {
			await controller.execute(handlerId, args as JSONValue[]);
		};
	}

	interface TransformedProps {
		attrs: Record<string, unknown>;
		onclick?: () => Promise<void>;
		oninput?: (e: Event) => Promise<void>;
		onchange?: (e: Event) => Promise<void>;
		onsubmit?: (e: Event) => Promise<void>;
		onfocus?: () => Promise<void>;
		onblur?: () => Promise<void>;
		onkeydown?: (e: KeyboardEvent) => Promise<void>;
		onkeyup?: (e: KeyboardEvent) => Promise<void>;
		onmouseenter?: () => Promise<void>;
		onmouseleave?: () => Promise<void>;
	}

	function transformProps(props: Record<string, unknown>): TransformedProps {
		const attrs: Record<string, unknown> = {};
		const result: TransformedProps = { attrs };

		for (const [key, value] of Object.entries(props)) {
			if (key === "children" || key === "key") continue;

			if (isHandlerIdProp(key)) {
				const eventName = extractEventName(key);
				if (eventName && typeof value === "string") {
					const handler = createHandler(value);
					if (eventName === "onChange") {
						result.oninput = handler;
						result.onchange = handler;
					} else if (eventName === "onInput") {
						result.oninput = handler;
					} else if (eventName === "onClick") {
						result.onclick = handler;
					} else if (eventName === "onSubmit") {
						result.onsubmit = handler;
					} else if (eventName === "onFocus") {
						result.onfocus = handler;
					} else if (eventName === "onBlur") {
						result.onblur = handler;
					} else if (eventName === "onKeyDown") {
						result.onkeydown = handler;
					} else if (eventName === "onKeyUp") {
						result.onkeyup = handler;
					} else if (eventName === "onMouseEnter") {
						result.onmouseenter = handler;
					} else if (eventName === "onMouseLeave") {
						result.onmouseleave = handler;
					}
				}
				continue;
			}

			if (key === "className") {
				attrs.class = value;
			} else if (key === "htmlFor") {
				attrs.for = value;
			} else if (key === "style" && typeof value === "object" && value !== null) {
				// Convert style objects to CSS strings (e.g. { padding: "20px" } → "padding: 20px")
				attrs.style = Object.entries(value as Record<string, string>)
					.map(([prop, val]) => {
						const cssProp = prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
						return `${cssProp}: ${val}`;
					})
					.join("; ");
			} else {
				attrs[key] = value;
			}
		}

		return result;
	}

	// Wrap event handler to extract serializable data from DOM events
	function wrapEventListener(event: string, handler: (...args: unknown[]) => void, el: HTMLElement): EventListener {
		if ((event === 'input' || event === 'change') && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
			return (e: Event) => {
				const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
				handler(target.value);
			};
		}
		if (event === 'submit') {
			return (e: Event) => {
				e.preventDefault();
				handler();
			};
		}
		return () => handler();
	}

	// Action to attach events dynamically
	function attachEvents(el: HTMLElement, handlers: TransformedProps) {
		const eventMap: Record<string, keyof TransformedProps> = {
			click: 'onclick',
			input: 'oninput',
			change: 'onchange',
			submit: 'onsubmit',
			focus: 'onfocus',
			blur: 'onblur',
			keydown: 'onkeydown',
			keyup: 'onkeyup',
			mouseenter: 'onmouseenter',
			mouseleave: 'onmouseleave',
		};

		const cleanup: (() => void)[] = [];

		for (const [event, propKey] of Object.entries(eventMap)) {
			const handler = handlers[propKey] as ((...args: unknown[]) => void) | undefined;
			if (handler) {
				const listener = wrapEventListener(event, handler, el);
				el.addEventListener(event, listener);
				cleanup.push(() => el.removeEventListener(event, listener));
			}
		}

		return {
			update(newHandlers: TransformedProps) {
				// Remove old handlers
				cleanup.forEach(fn => fn());
				cleanup.length = 0;

				// Add new handlers
				for (const [event, propKey] of Object.entries(eventMap)) {
					const handler = newHandlers[propKey] as ((...args: unknown[]) => void) | undefined;
					if (handler) {
						const listener = wrapEventListener(event, handler, el);
						el.addEventListener(event, listener);
						cleanup.push(() => el.removeEventListener(event, listener));
					}
				}
			},
			destroy() {
				cleanup.forEach(fn => fn());
			}
		};
	}
</script>

{#if typeof node === "string"}
	{node}
{:else if node.type === "button"}
	{@const p = transformProps(node.props)}
	<button class="cursor-pointer {p.attrs.class || ''}" {...p.attrs} use:attachEvents={p}>
		{#each node.children as child}
			<Self node={child} />
		{/each}
	</button>
{:else if node.type === "input"}
	{@const p = transformProps(node.props)}
	<input {...p.attrs} use:attachEvents={p} />
{:else if node.type === "textarea"}
	{@const p = transformProps(node.props)}
	<textarea {...p.attrs} use:attachEvents={p}></textarea>
{:else if node.type === "select"}
	{@const p = transformProps(node.props)}
	<select {...p.attrs} use:attachEvents={p}>
		{#each node.children as child}
			<Self node={child} />
		{/each}
	</select>
{:else if node.type === "a"}
	{@const p = transformProps(node.props)}
	<a {...p.attrs} use:attachEvents={p}>
		{#each node.children as child}
			<Self node={child} />
		{/each}
	</a>
{:else if node.type === "form"}
	{@const p = transformProps(node.props)}
	<form {...p.attrs} use:attachEvents={p}>
		{#each node.children as child}
			<Self node={child} />
		{/each}
	</form>
{:else if LAYOUT_TAGS.includes(node.type as typeof LAYOUT_TAGS[number])}
	{@const p = transformProps(node.props)}
	<svelte:element this={node.type} {...p.attrs} use:attachEvents={p}>
		{#each node.children as child}
			<Self node={child} />
		{/each}
	</svelte:element>
{:else if registry?.has(node.type)}
	{@const RegisteredComponent = registry.get(node.type)}
	{@const p = transformProps(node.props)}
	{@const textChildren = node.children.filter((child): child is string => typeof child === 'string').join('')}
	{@const nonTextChildren = node.children.filter((child) => typeof child !== 'string')}
	{@const componentProps = {
		...p.attrs,
		// For Button-like components, use text children as title fallback
		title: textChildren || p.attrs.title,
		onclick: p.onclick,
		oninput: p.oninput,
		onchange: p.onchange,
		onsubmit: p.onsubmit,
		onfocus: p.onfocus,
		onblur: p.onblur,
		onkeydown: p.onkeydown,
		onkeyup: p.onkeyup,
	}}
	{#if nonTextChildren.length > 0 || textChildren}
		<RegisteredComponent {...componentProps}>
			{#if textChildren}{textChildren}{/if}
			{#each nonTextChildren as child}
				<Self node={child} />
			{/each}
		</RegisteredComponent>
	{:else}
		<RegisteredComponent {...componentProps} />
	{/if}
{:else}
	<div class="uniview-unknown">Unknown: {node.type}</div>
{/if}
