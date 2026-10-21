import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { goto, invalidate } from "$app/navigation";
import { createNativeOAuth } from "./native-oauth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext, setContext } from "svelte";
import {
	getOAuthOptions,
	getOAuthProvider,
	oauthProviders,
	type OAuthProvider,
	type OAuthProviderConfig,
} from "./providers.ts";

const OAUTH_CONTEXT = Symbol("oauth");

export class OAuth {
	error = $state<string | null>(null);
	private nativeOAuth: ReturnType<typeof createNativeOAuth> | undefined;

	constructor(
		private readonly auth: SupabaseClient["auth"],
		readonly providers: readonly OAuthProviderConfig[] = oauthProviders,
	) {}

	get enabledProviders() {
		return this.providers.filter((provider) => provider.enabled);
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
		}));
	}

	async initialize(): Promise<() => Promise<void>> {
		if (Capacitor.getPlatform() !== "ios") {
			return async () => {};
		}

		const oauth = this.getNativeOAuth();
		await oauth.initialize();

		return () => oauth.dispose();
	}

	async signIn(
		providerId: OAuthProvider,
		{
			returnPath = "/app",
			authCallbackTo = returnPath
		}: {
			returnPath?: string;
			authCallbackTo?: string;
		} = {},
	): Promise<void> {
		this.error = null;
		try {
			const provider = getOAuthProvider(providerId, this.providers);
			const options = getOAuthOptions(provider);

			if (Capacitor.isNativePlatform()) {
				if (Capacitor.getPlatform() !== "ios") {
					throw new Error("Native OAuth is currently configured for iOS only.");
				}

				await this.getNativeOAuth().signIn(provider.id, returnPath, options);
				return;
			}

			const { error } = await this.auth.signInWithOAuth({
				provider: provider.id,
				options: {
					...options,
					redirectTo: new URL(authCallbackTo, window.location.origin).href,
				},
			});

			if (error) {
				throw error;
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : "Unable to start sign-in.";
			throw error;
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
		throw new Error("OAuth context is missing. Call provideOAuth() in the root layout.");
	}
	return oauth;
}
