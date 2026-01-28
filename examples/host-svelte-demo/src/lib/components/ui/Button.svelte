<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';

	interface ButtonProps {
		title?: string;
		icon?: string;
		variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
		shortcut?: string;
		onClick?: () => void;
		class?: string;
	}

	let {
		title,
		icon,
		variant = 'secondary',
		shortcut,
		onClick,
		class: className
	}: ButtonProps = $props();

	function handleClick() {
		console.log('Button clicked, onClick handler:', onClick);
		onClick?.();
		console.log('Button onClick called');
	}

	const variantMap = {
		primary: 'default',
		secondary: 'secondary',
		outline: 'outline',
		destructive: 'destructive',
		ghost: 'ghost',
		link: 'link'
	} as const;
</script>

<Button variant={variantMap[variant] || 'secondary'} onclick={handleClick} class={className}>
	{#if icon}
		<span class="text-base">{icon}</span>
	{/if}
	{#if title}
		<span class="flex-1">{title}</span>
	{/if}
	{#if shortcut}
		<span class="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs opacity-60">{shortcut}</span>
	{/if}
</Button>
