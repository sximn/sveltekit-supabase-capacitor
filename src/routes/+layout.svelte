<script lang="ts">
	import "../app.css";
	import favicon from "#lib/assets/favicon.svg";
	import { onMount, untrack } from "svelte";
	import type { LayoutProps } from "./$types";
	import { invalidate } from "$app/navigation";
	import { page } from "$app/state";
	import { provideOAuth } from "#lib/auth/oauth.svelte.ts";
	import AuthLoading from "#lib/components/auth/AuthLoading.svelte";

	let { children, data }: LayoutProps = $props();
	const { supabase, authClaims } = $derived(data);

	const oauth = provideOAuth(untrack(() => supabase.auth));

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
	{@render children()}
{/if}

<style>
	.oauth-error {
		margin: 0;
		padding: 1rem;
		color: #b91c1c;
	}
</style>
