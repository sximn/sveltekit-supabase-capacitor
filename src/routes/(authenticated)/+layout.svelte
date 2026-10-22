<script lang="ts">
	import AuthGuard from "#lib/components/auth/AuthGuard.svelte";
	import { getOAuth } from "#lib/auth/oauth.svelte.ts";
	import Spinner from "#lib/components/auth/Spinner.svelte";
	import { browser } from "$app/env";
	import { page } from "$app/state";

	let { children, data } = $props();
	const oauth = getOAuth();
	const signingOut = $derived(oauth.phase === "signing-out");

	async function signOut() {
		try {
			await oauth.signOut();
		} catch {
			// The shared auth context displays the error and permits a retry.
		}
	}

	const redirectTo = $derived(
		page.url.pathname + (browser ? page.url.search : ""),
	);
</script>

{#if data.userId || signingOut}
	<div class="auth-welcome">
		<p>Signed in</p>
		<button class="sign-out-btn" disabled={oauth.busy} aria-busy={signingOut} onclick={signOut}>
			{#if signingOut}<Spinner />{/if}
			{signingOut ? "Signing out..." : "Sign out"}
		</button>
	</div>

	{#if data.userId}
		{@render children?.()}
	{/if}
{:else}
	<AuthGuard {redirectTo} />
{/if}

<style>
	.auth-welcome {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid black;
		line-height: 1.5;
	}

	.auth-welcome p {
		margin: 0;
	}

	.sign-out-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: fit-content;
		min-height: 2.75rem;
		padding: 0.625rem 0.875rem;
		border: 1px solid #d4d4d8;
		border-radius: 0.375rem;
		background: #18181b;
		color: #fff;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	.sign-out-btn:hover:not(:disabled) {
		background: #3f3f46;
	}

	.sign-out-btn:focus-visible {
		outline: 2px solid #18181b;
		outline-offset: 3px;
	}

	.sign-out-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
