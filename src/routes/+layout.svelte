<script lang="ts">
	import "../app.css";
	import favicon from "#lib/assets/favicon.svg";
	import { onMount, untrack } from "svelte";
	import type { LayoutProps } from "./$types";
	import { invalidate } from "$app/navigation";
	import { page } from "$app/state";
	import { provideOAuth } from "#lib/auth/oauth.svelte.ts";
	import AuthLoading from "#lib/components/auth/AuthLoading.svelte";
	import Spinner from "#lib/components/auth/Spinner.svelte";

	let { children, data }: LayoutProps = $props();
	const { supabase, authClaims } = $derived(data);

	const oauth = provideOAuth(untrack(() => supabase.auth));
	let retryingSession = $state(false);

	async function retrySession() {
		if (retryingSession || oauth.busy) {
			return;
		}

		retryingSession = true;

		try {
			await invalidate("supabase:auth");
		} catch (error) {
			// keep the last session error visible if navigation itself fails
			console.error("Unable to reload session data.", error);
		} finally {
			retryingSession = false;
		}
	}

	onMount(() => {
		let disposed = false;
		let disposeOAuth: (() => Promise<void>) | undefined;

		function disposeSafely(dispose: () => Promise<void>) {
			void dispose().catch((error) => {
				console.error("Unable to dispose OAuth.", error);
			});
		}

		void oauth
			.initialize()
			.then((dispose) => {
				if (disposed) {
					disposeSafely(dispose);
				} else {
					disposeOAuth = dispose;
				}
			})
			.catch((error) => {
				console.error("Unable to initialize OAuth.", error);

				if (!disposed) {
					oauth.error =
						"Unable to initialize sign-in. Please reload the page or restart the app.";
				}
			});

		const { data } = supabase.auth.onAuthStateChange((event, _session) => {
			if (
				_session?.expires_at !== authClaims?.exp ||
				_session?.user.id !== authClaims?.sub
			) {
				invalidate("supabase:auth");
			}
		});

		return () => {
			disposed = true;
			data.subscription.unsubscribe();

			if (disposeOAuth) {
				disposeSafely(disposeOAuth);
			}
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname !== "/"}
	<a href="/">Home</a>
{/if}

{#if oauth.error}
	<p class="oauth-error" role="alert">{oauth.error}</p>
{/if}

{#if oauth.phase === "initializing" || oauth.phase === "completing"}
	<AuthLoading message={oauth.phase === "completing" ? "Finishing sign-in..." : "Checking session..."} />
{:else}
	{#if data.sessionError}
		<section class="session-error">
			<p role="alert">Unable to load your session: {data.sessionError}</p>
			<button
				type="button"
				onclick={retrySession}
				disabled={retryingSession || oauth.busy}
				aria-busy={retryingSession}
			>
				{#if retryingSession}<Spinner />{/if}
				{retryingSession ? "Retrying..." : "Retry"}
			</button>
		</section>
	{/if}
	{@render children()}
{/if}

<style>
	.session-error {
		padding: 1rem;
	}

	.session-error p {
		margin: 0 0 0.75rem;
		color: #b91c1c;
	}

	.session-error button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.oauth-error {
		margin: 0;
		padding: 1rem;
		color: #b91c1c;
	}
</style>
