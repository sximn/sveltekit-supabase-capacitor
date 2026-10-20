<script lang="ts">
	import "../app.css";
	import favicon from "#lib/assets/favicon.svg";
	import { onMount } from "svelte";
	import type { LayoutProps } from "./$types";
	import { invalidate } from "$app/navigation";
	import { page } from "$app/state";
	import { initializeNativeGoogleAuth, nativeAuthError } from "#lib/auth/google.ts";

	let { children, data }: LayoutProps = $props();
	const { supabase, authClaims } = $derived(data);

	onMount(() => {
		let disposed = false;
		let disposeNativeAuth: (() => Promise<void>) | undefined;

		void initializeNativeGoogleAuth().then((dispose) => {
			if (disposed) {
				void dispose();
			} else {
				disposeNativeAuth = dispose;
			}
		}).catch(() => nativeAuthError.set("Unable to initialize iOS sign-in. Please restart the app."));

		const { data } = supabase.auth.onAuthStateChange((event, _session) => {
			if (_session?.expires_at !== authClaims?.exp || _session?.user.id !== authClaims?.sub) {
				invalidate("supabase:auth");
			}
		});
		return () => {
			disposed = true;
			data.subscription.unsubscribe();
			void disposeNativeAuth?.();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname !== "/"}
	<a href="/">Home</a>
{/if}

{#if $nativeAuthError}
	<p class="native-auth-error" role="alert">{$nativeAuthError}</p>
{/if}

{@render children()}

<style>
	.native-auth-error {
		padding: 1rem;
		color: #b91c1c;
	}
</style>
