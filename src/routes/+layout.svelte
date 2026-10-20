<script lang="ts">
	import "../app.css";
	import favicon from "#lib/assets/favicon.svg";
	import { onMount } from "svelte";
	import type { LayoutProps } from "./$types";
	import { invalidate } from "$app/navigation";
	import { page } from "$app/state";

	let { children, data }: LayoutProps = $props();
	const { supabase, authClaims } = $derived(data);

	onMount(() => {
		const { data } = supabase.auth.onAuthStateChange((event, _session) => {
			if (_session?.expires_at !== authClaims?.exp) {
				invalidate("supabase:auth");
			}
		});
		return () => data.subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname !== "/"}
	<a href="/">Home</a>
{/if}

{@render children()}
