<script lang="ts">
	import { Switch } from '../ui/switch/index.js';

	interface Props {
		id?: string;
		checked?: boolean;
		disabled?: boolean;
		class?: string;
		onchange?: (checked: boolean) => void;
	}

	let { 
		id,
		checked,
		disabled,
		class: className,
		onchange
	}: Props = $props();
</script>

<Switch
	{id}
	{checked}
	{disabled}
	class={className}
	onCheckedChange={(newChecked) => onchange?.(newChecked)}
/>
