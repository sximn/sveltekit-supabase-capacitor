<script lang="ts">
	import { getOAuth } from "#lib/auth/oauth.svelte.ts";
	import type { OAuthPending, OAuthProvider } from "#lib/auth/providers.ts";

	let {
		redirectTo = "/app",
		authCallbackTo = redirectTo,
		pending = $bindable<OAuthPending>(null),
		onstart,
	}: {
		redirectTo?: string;
		authCallbackTo?: string;
		pending?: OAuthPending;
		onstart?: () => void;
	} = $props();
	const oauth = getOAuth();

	async function signIn(provider: OAuthProvider) {
		if (pending) {
			return;
		}

		onstart?.();
		pending = provider;

		try {
			await oauth.signIn(provider, { returnPath: redirectTo, authCallbackTo });
		} catch {
			// the shared context exposes startup and callback errors in the root layout
		} finally {
			pending = null;
		}
	}
</script>

{#if oauth.enabledProviders.length}
	<div class="oauth-buttons">
		{#each oauth.enabledProviders as provider (provider.id)}
			<button
				type="button"
				onclick={() => signIn(provider.id)}
				disabled={pending !== null}
			>
				{pending === provider.id
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
