<script lang="ts">
	import { getOAuth } from "#lib/auth/oauth.svelte.ts";
	import type { OAuthProvider } from "#lib/auth/providers.ts";
	import Spinner from "./Spinner.svelte";

	let {
		redirectTo = "/app",
		authCallbackTo = redirectTo,
	}: {
		redirectTo?: string;
		authCallbackTo?: string;
	} = $props();

	const oauth = getOAuth();

	async function signIn(provider: OAuthProvider) {
		if (oauth.busy) {
			return;
		}

		try {
			await oauth.signIn(provider, { returnPath: redirectTo, authCallbackTo });
		} catch {
			// the shared context exposes startup and callback errors in the root layout
		}
	}
</script>

{#if oauth.enabledProviders.length}
	<div class="oauth-buttons">
		{#each oauth.enabledProviders as provider (provider.id)}
			<button
				type="button"
				onclick={() => signIn(provider.id)}
				disabled={oauth.busy}
				aria-busy={oauth.pendingProvider === provider.id}
			>
				{#if oauth.pendingProvider === provider.id}<Spinner />{/if}
				{oauth.pendingProvider === provider.id
					? "Redirecting..."
					: `Continue with ${provider.label}`}
			</button>
		{/each}
	</div>
{:else}
	<p role="status">No sign-in providers are available.</p>
{/if}

<style>
	.oauth-buttons {
		display: grid;
		gap: 0.75rem;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.625rem 0.875rem;
		border: 1px solid #d4d4d8;
		border-radius: 0.375rem;
		background: #fff;
		color: #18181b;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #f4f4f5;
	}

	button:focus-visible {
		outline: 2px solid #18181b;
		outline-offset: 3px;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
