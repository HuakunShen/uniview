<script lang="ts">
	interface Props {
		children?: any;
		name?: string;
		form?: any;
		className?: string;
	}

	let { children, name, className }: Props = $props();
</script>

<!-- For now, just render a simple wrapper div since we're not using actual form validation -->
<div class={className || 'space-y-2'} data-form-field={name}>
	{@render children?.()}
</div>
