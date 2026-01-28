<script lang="ts">
	import Input from '../ui/input/input.svelte';
	import Label from '../ui/label/label.svelte';

	interface Props {
		id?: string;
		label?: string;
		placeholder?: string;
		type?: string;
		value?: string;
		disabled?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	}

	let { 
		id,
		label,
		placeholder,
		type = 'text',
		value,
		disabled,
		class: className,
		onchange
	}: Props = $props();
</script>

<div class="space-y-2">
	{#if label}
		<Label for={id}>{label}</Label>
	{/if}
	<Input
		{id}
		{placeholder}
		{type}
		{value}
		{disabled}
		class={className}
		oninput={(e) => {
			const target = e.target as HTMLInputElement;
			onchange?.(target.value);
		}}
	/>
</div>
