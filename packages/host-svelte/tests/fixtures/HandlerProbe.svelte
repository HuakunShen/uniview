<script lang="ts">
	// Test fixture standing in for a product primitive registered with the host.
	// It renders the names of the handler props it was actually handed, so a test
	// can assert which events a registered component is able to receive.
	let props: Record<string, unknown> = $props();

	const received = $derived(
		Object.keys(props)
			.filter((key) => typeof props[key] === "function")
			.sort()
			.join(" ")
	);
</script>

<div data-handlers={received}></div>
