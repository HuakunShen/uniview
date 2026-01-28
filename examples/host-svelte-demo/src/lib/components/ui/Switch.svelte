<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	interface SwitchProps {
		checked?: boolean;
		defaultChecked?: boolean;
		disabled?: boolean;
		id?: string;
		onChange?: (checked: boolean) => void;
		className?: string;
	}

	let {
		checked = false,
		defaultChecked,
		disabled,
		id,
		onChange,
		className
	}: SwitchProps = $props();

	// Use the controlled checked value, falling back to defaultChecked
	let displayChecked = $derived(checked ?? defaultChecked ?? false);

	function handleCheckedChange(newChecked: boolean) {
		// Call onChange callback when user interacts with the switch
		onChange?.(newChecked);
	}
</script>

<SwitchPrimitive.Root
	checked={displayChecked}
	onCheckedChange={handleCheckedChange}
	{disabled}
	{id}
	data-slot="switch"
	class={cn(
		'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
		className
	)}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class={cn(
			'pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground'
		)}
	/>
</SwitchPrimitive.Root>
