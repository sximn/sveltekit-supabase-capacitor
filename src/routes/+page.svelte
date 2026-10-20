<script>
	import { onMount } from "svelte";

	let { data } = $props();
	const { supabase } = $derived(data);

	async function getData() {
		const channels = supabase.getChannels();
		console.log({ channels });
	}

	onMount(() => {
		getData();
	});
</script>

<h1>HOME</h1>
<p>👇 will redirect you to /auth if you aren't authenticated.</p>
<a href="/app">App</a>
