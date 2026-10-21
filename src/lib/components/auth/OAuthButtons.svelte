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
	<div class="divider"><span>or</span></div>
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
{/if}

<style>
	.oauth-buttons {
		display: grid;
		gap: 0.75rem;
	}
	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0;
		color: #71717a;
		font-size: 0.875rem;
	}
	.divider::before,
	.divider::after {
		content: "";
		flex: 1;
		height: 1px;
		background: #e4e4e7;
	}
</style>
