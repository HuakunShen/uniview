<script lang="ts">
	import { getContext } from "svelte";
	import type { UINode } from "@uniview/protocol";
	import { LAYOUT_TAGS, TEXT_NODE_TYPE, isHandlerIdProp, extractEventName, textContent } from "@uniview/protocol";
	import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";
	import type { Component } from "svelte";
	import { serializeHandlerArgs } from "./event-handlers";
	import Self from "./ComponentRenderer.svelte";

	interface Props {
		node: UINode | string;
	}

	let { node }: Props = $props();

	const controller = getContext<PluginController>("uniview:controller");
	const registry = getContext<ComponentRegistry<Component>>("uniview:registry");

	const VOID_ELEMENTS = new Set(["hr", "br", "img", "wbr"])

	function createHandler(handlerId: string, eventName: string) {
		return async (...args: unknown[]) => {
			await controller.executeHandler(handlerId, serializeHandlerArgs(eventName, args));
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
				// extractEventName returns null for handler props outside the
				// DOM event whitelist (EVENT_PROPS); those must still be passed
				// through below, not dropped.
				let matched = false;
				if (eventName && typeof value === "string") {
					const handler = createHandler(value, eventName);
					matched = true;
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
					} else {
						matched = false;
					}
				}
				// Pass through unrecognized handler ID props as-is so registered
				// host components can relay them via executeHandler
				// (e.g. app-level handlers like _onSearchTextChangeHandlerId)
				if (!matched && typeof value === "string") {
					attrs[key] = value;
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

	// Pass the raw DOM event through — createHandler runs it through
	// serializeHandlerArgs, which extracts input values, keyboard payloads
	// (key/code/modifiers), and strips non-serializable events. Previously
	// keydown/keyup were wrapped as () => handler(), so plugins never saw
	// which key was pressed.
	function wrapEventListener(event: string, handler: (...args: unknown[]) => void): EventListener {
		if (event === 'submit') {
			return (e: Event) => {
				e.preventDefault();
				handler(e);
			};
		}
		return (e: Event) => handler(e);
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
				const listener = wrapEventListener(event, handler);
				el.addEventListener(event, listener);
				cleanup.push(() => el.removeEventListener(event, listener));
			}
		}

		return {
			update(newHandlers: TransformedProps) {
				// Remove old handlers
				cleanup.forEach(fn => void fn());
				cleanup.length = 0;

				// Add new handlers
				for (const [event, propKey] of Object.entries(eventMap)) {
					const handler = newHandlers[propKey] as ((...args: unknown[]) => void) | undefined;
					if (handler) {
						const listener = wrapEventListener(event, handler);
						el.addEventListener(event, listener);
						cleanup.push(() => void el.removeEventListener(event, listener));
					}
				}
			},
			destroy() {
				cleanup.forEach(fn => void fn());
			}
		};
	}
</script>

{#if typeof node === "string"}
	{node}
{:else if node.type === TEXT_NODE_TYPE}
	{node.text}
{:else if VOID_ELEMENTS.has(node.type)}
	{@const p = transformProps(node.props)}
	<svelte:element this={node.type} {...p.attrs} />
{:else if node.type === "button"}
	{@const p = transformProps(node.props)}
	<button class="cursor-pointer {p.attrs.class || ''}" {...p.attrs} use:attachEvents={p}>
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
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
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
			<Self node={child} />
		{/each}
	</select>
{:else if node.type === "a"}
	{@const p = transformProps(node.props)}
	<a {...p.attrs} use:attachEvents={p}>
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
			<Self node={child} />
		{/each}
	</a>
{:else if node.type === "form"}
	{@const p = transformProps(node.props)}
	<form {...p.attrs} use:attachEvents={p}>
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
			<Self node={child} />
		{/each}
	</form>
{:else if LAYOUT_TAGS.includes(node.type as typeof LAYOUT_TAGS[number])}
	{@const p = transformProps(node.props)}
	<svelte:element this={node.type} {...p.attrs} use:attachEvents={p}>
		{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
			<Self node={child} />
		{/each}
	</svelte:element>
{:else if registry?.has(node.type)}
	{@const RegisteredComponent = registry.get(node.type)}
	{@const p = transformProps(node.props)}
	{@const textChildren = node.children.map((child) => textContent(child) ?? '').join('')}
	{@const componentProps = {
		...p.attrs,
		// Pass UINode children so registered components can manage their own child rendering
		_childNodes: node.children,
		// Pass the UINode's auto-generated id for tracking (distinct from props.id)
		_nodeId: node.id,
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
	{#if node.children.length > 0}
		<RegisteredComponent {...componentProps}>
			<!-- Render children in their original order — text nodes go through
			     <Self> too (TEXT_NODE_TYPE branch). The old split rendered all
			     text before all elements, scrambling interleaved children. -->
			{#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
				<Self node={child} />
			{/each}
		</RegisteredComponent>
	{:else}
		<RegisteredComponent {...componentProps} />
	{/if}
{:else}
	<div class="uniview-unknown">Unknown: {node.type}</div>
{/if}
