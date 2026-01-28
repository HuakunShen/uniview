<script lang="ts">
	import { Toggle } from '../ui/toggle/index.js';
	import type { Snippet } from 'svelte';

	interface Props {
		pressed?: boolean;
		disabled?: boolean;
		variant?: 'default' | 'outline';
		size?: 'default' | 'sm' | 'lg';
		class?: string;
		onclick?: () => void;
		children?: Snippet;
	}

	let { 
		pressed,
		disabled,
		variant = 'default',
		size = 'default',
		class: className,
		onclick,
		children
	}: Props = $props();
</script>

<Toggle
	{pressed}
	{disabled}
	{variant}
	{size}
	class={className}
	onPressedChange={() => onclick?.()}
>
	{#if children}
		{@render children()}
	{/if}
</Toggle>
