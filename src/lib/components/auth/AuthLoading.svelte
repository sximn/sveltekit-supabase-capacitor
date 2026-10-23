<script lang="ts">
	import Spinner from "./Spinner.svelte";
	let { message = "Checking session..." }: { message?: string } = $props();
</script>

<p role="status"><Spinner />{message}</p>

<style>
	p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
	}
</style>
