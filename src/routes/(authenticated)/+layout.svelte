<script lang="ts">
	import AuthGuard from "#lib/components/auth/AuthGuard.svelte";
	import { supabase } from "#lib/supabase/client.js";
	import { browser } from "$app/env";
	import { page } from "$app/state";

	let { children, data } = $props();
	let signOutError = $state<string | null>(null);
	let signingOut = $state(false);

	async function signOut() {
		signingOut = true;
		signOutError = null;
		try {
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
		} catch (error) {
			signOutError = error instanceof Error ? error.message : "Unable to sign out.";
		} finally {
			signingOut = false;
		}
	}

	const redirectTo = $derived(
		page.url.pathname + (browser ? page.url.search : ""),
	);
</script>

{#if data.userId}
	<div class="auth-welcome">
		<p>Signed in</p>
		<button
			class="sign-out-btn"
			disabled={signingOut}
			onclick={signOut}>{signingOut ? "Signing out..." : "Sign out"}</button
		>
	</div>
	{#if signOutError}
		<p role="alert">{signOutError}</p>
	{/if}

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
