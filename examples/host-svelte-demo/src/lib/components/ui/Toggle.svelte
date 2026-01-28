<script lang="ts">
	import { Toggle as TogglePrimitive } from 'bits-ui';
	import { toggleVariants } from '$lib/components/ui/toggle/toggle.svelte';
	import { cn } from '$lib/utils.js';

	interface ToggleProps {
		pressed?: boolean;
		defaultPressed?: boolean;
		disabled?: boolean;
		variant?: 'default' | 'outline';
		size?: 'default' | 'sm' | 'lg';
		onClick?: () => void;
		className?: string;
		children?: any;
	}

	let {
		pressed = false,
		defaultPressed,
		disabled,
		variant = 'default',
		size = 'default',
		onClick,
		className,
		children
	}: ToggleProps = $props();

	// Use a derived value for pressed state
	let displayPressed = $derived(pressed ?? defaultPressed ?? false);

	function handlePressedChange(_newPressed: boolean) {
		// When the toggle changes, call onClick if provided
		// The parent (React) will update the pressed prop
		if (onClick) {
			onClick();
		}
	}
</script>

<TogglePrimitive.Root
	pressed={displayPressed}
	onPressedChange={handlePressedChange}
	{disabled}
	class={cn(toggleVariants({ variant, size }), className)}
>
	{#if children}
		{children}
	{/if}
</TogglePrimitive.Root>
