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
				class="secondary"
				type="button"
				onclick={() => signIn(provider.id)}
				disabled={pending !== null}
			>
				{pending === provider.id ? "Redirecting..." : `Continue with ${provider.label}`}
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
</style>
