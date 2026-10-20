<script lang="ts">
	import AuthGuard from "#lib/components/auth/AuthGuard.svelte";
	import { supabase } from "#lib/supabase/client.js";
	import { browser } from "$app/env";
	import { page } from "$app/state";

	let { children, data } = $props();
	console.log({ url: page.url, route: page.route });

	const redirectTo = $derived(
		page.url.pathname + (browser ? page.url.search : '')
	);
</script>

{#if data.userId}
	<div class="auth-welcome">
		<p>YOU ARE AUTHENTICATED</p>
		<button
			class="sign-out-btn"
			onclick={() => {
				supabase.auth.signOut();
			}}>Sign Out</button
		>
	</div>

	{@render children?.()}
{:else}
	<AuthGuard {redirectTo} />
{/if}

<style>
	.auth-welcome {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid black;
	}

	.sign-out-btn {
		width: fit-content;
	}
</style>
