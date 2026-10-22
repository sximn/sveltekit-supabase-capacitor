import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { goto, invalidate } from "$app/navigation";
import { page } from "$app/state";
import { createNativeOAuth, type NativeOAuthPhase } from "./native-oauth.ts";
import { initializeWebOAuth } from "./web-oauth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext, setContext } from "svelte";
import {
	getOAuthOptions,
	getOAuthProvider,
	oauthProviders,
	type OAuthProvider,
	type OAuthProviderConfig,
	type OAuthPending,
} from "./providers.ts";

const OAUTH_CONTEXT = Symbol("oauth");

export class OAuth {
	error = $state<string | null>(null);
	phase = $state<NativeOAuthPhase | "initializing" | "signing-out">("initializing");
	pendingProvider = $state<OAuthPending>(null);
	private nativeOAuth: ReturnType<typeof createNativeOAuth> | undefined;

	constructor(
		private readonly auth: SupabaseClient["auth"],
		readonly providers: readonly OAuthProviderConfig[] = oauthProviders,
	) {}

	get enabledProviders() {
		return this.providers.filter((provider) => provider.enabled);
	}

	get busy() {
		return this.phase !== "idle";
	}

	private getNativeOAuth() {
		return (this.nativeOAuth ??= createNativeOAuth({
			auth: this.auth,
			app: App,
			browser: Browser,
			storage: window.localStorage,
			onSignedIn: async (path) => {
				this.error = null;
				await invalidate("supabase:auth");
				await goto(path, { replaceState: true });
			},
			onError: (message) => {
				this.error = message;
			},
			onPhaseChange: (phase) => {
				this.phase = phase;
				if (phase === "idle") this.pendingProvider = null;
			},
		}));
	}

	async initialize(): Promise<() => Promise<void>> {
		try {
			if (!Capacitor.isNativePlatform()) {
				const onPageShow = (event: PageTransitionEvent) => {
					// returning from the provider via browser history can restore this
					// document with its pre-redirect state still in memory
					if (event.persisted && this.phase === "redirecting") {
						this.phase = "idle";
						this.pendingProvider = null;
					}
				};
				window.addEventListener("pageshow", onPageShow);
				try {
					const result = await initializeWebOAuth(this.auth, new URL(window.location.href));

					this.error = result.error;

					if (result.url && result.url.href !== window.location.href) {
						await goto(result.url, { state: page.state, shallow: true, replace: true });
					}
				} catch (error) {
					window.removeEventListener("pageshow", onPageShow);
					throw error;
				}
				return async () => window.removeEventListener("pageshow", onPageShow);
			}

			const oauth = this.getNativeOAuth();
			await oauth.initialize();

			return () => oauth.dispose();
		} finally {
			if (this.phase === "initializing") this.phase = "idle";
		}
	}

	async signIn(
		providerId: OAuthProvider,
		{
			returnPath = "/app",
			authCallbackTo = returnPath,
		}: {
			returnPath?: string;
			authCallbackTo?: string;
		} = {},
	): Promise<void> {
		if (this.busy) {
			throw new Error("Authentication is already in progress.");
		}

		this.phase = "redirecting";
		this.pendingProvider = providerId;
		this.error = null;

		try {
			const provider = getOAuthProvider(providerId, this.providers);
			const options = getOAuthOptions(provider);

			if (Capacitor.isNativePlatform()) {
				await this.getNativeOAuth().signIn(provider.id, returnPath, options);
				return;
			}

			const { data, error } = await this.auth.signInWithOAuth({
				provider: provider.id,
				options: {
					...options,
					redirectTo: new URL(authCallbackTo, window.location.origin).href,
				},
			});

			if (error) {
				throw new Error(error.message);
			}
			if (!data.url) {
				throw new Error("Sign-in did not return an authorization URL.");
			}
			// keep the pending state until the document actually leaves
			// the SDK resolving this request doesn't mean navigation has completed
		} catch (error) {
			this.phase = "idle";
			this.pendingProvider = null;
			this.error =
				error instanceof Error ? error.message : "Unable to start sign-in.";
			throw error;
		}
	}

	async signOut(): Promise<void> {
		if (this.busy) {
			throw new Error("Authentication is already in progress.");
		}

		this.phase = "signing-out";
		this.error = null;

		try {
			const { error } = await this.auth.signOut();

			if (error) {
				throw new Error(error.message);
			}

			// Wait for the signed-out layout data, even if the auth event is late.
			await invalidate("supabase:auth");
		} catch (error) {
			this.error = error instanceof Error ? error.message : "Unable to sign out.";
			throw error;
		} finally {
			this.phase = "idle";
		}
	}
}

export function provideOAuth(
	auth: SupabaseClient["auth"],
	providers: readonly OAuthProviderConfig[] = oauthProviders,
): OAuth {
	const oauth = new OAuth(auth, providers);
	setContext(OAUTH_CONTEXT, oauth);
	return oauth;
}

export function getOAuth(): OAuth {
	const oauth = getContext<OAuth | undefined>(OAUTH_CONTEXT);
	if (!oauth) {
		throw new Error(
			"OAuth context is missing. Call provideOAuth() in the root layout.",
		);
	}
	return oauth;
}
