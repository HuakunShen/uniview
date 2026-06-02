<script lang="ts">
	import { untrack } from 'svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';

	interface InputProps {
		id?: string;
		value?: string;
		defaultValue?: string;
		placeholder?: string;
		label?: string;
		type?: string;
		onChange?: (value: string, event?: Event) => void;
		onInput?: (value: string, event?: Event) => void;
		class?: string;
	}

	let {
		id,
		value,
		defaultValue,
		placeholder,
		label,
		type = 'text',
		onChange,
		onInput,
		class: className
	}: InputProps = $props();

	let internalValue = $state(untrack(() => value ?? defaultValue ?? ''));

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = target.value;
		internalValue = newValue;
		onChange?.(newValue, event);
		onInput?.(newValue, event);
	}

	$effect(() => {
		if (value !== undefined) {
			internalValue = value;
		}
	});
</script>

<div class="grid w-full max-w-sm items-center gap-1.5">
	{#if label}
		<Label for={id}>{label}</Label>
	{/if}
	<Input
		{id}
		{type}
		{placeholder}
		bind:value={internalValue}
		oninput={handleChange}
		onchange={handleChange}
		class={className}
	/>
</div>
