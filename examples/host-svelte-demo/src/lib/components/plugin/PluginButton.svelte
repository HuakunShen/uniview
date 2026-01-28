<script lang="ts">
	import Button from '../ui/button/button.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
		disabled?: boolean;
		class?: string;
		onclick?: () => void;
		children?: Snippet;
		[key: string]: unknown;
	}

	let { 
		title,
		variant = 'secondary',
		disabled,
		class: className,
		onclick,
		children,
		...rest
	}: Props = $props();

	const variantMap: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost'> = {
		primary: 'default',
		secondary: 'secondary',
		outline: 'outline',
		destructive: 'destructive',
		ghost: 'ghost'
	};
</script>

<Button
	variant={variantMap[variant] ?? 'secondary'}
	{disabled}
	class={className}
	onclick={onclick}
>
	{#if children}
		{@render children()}
	{:else if title}
		{title}
	{/if}
</Button>
