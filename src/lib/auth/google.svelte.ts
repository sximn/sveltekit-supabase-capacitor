import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { goto, invalidate } from "$app/navigation";
import { createNativeOAuth } from "./native-oauth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext, setContext } from "svelte";

const GOOGLE_AUTH_CONTEXT = Symbol("google-auth");

export class GoogleAuth {
	error = $state<string | null>(null);
	private nativeOAuth: ReturnType<typeof createNativeOAuth> | undefined;

	constructor(private readonly auth: SupabaseClient["auth"]) {}

	private getNativeOAuth() {
		return this.nativeOAuth ??= createNativeOAuth({
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
		});
	}

	async initialize(): Promise<() => Promise<void>> {
		if (Capacitor.getPlatform() !== "ios") {
			return async () => {};
		}

		const oauth = this.getNativeOAuth();
		await oauth.initialize();

		return () => oauth.dispose();
	}

	async signIn(authCallbackTo: string, returnPath: string): Promise<void> {
		this.error = null;
		try {
			if (Capacitor.isNativePlatform()) {
				if (Capacitor.getPlatform() !== "ios") {
					throw new Error(
						"Native Google sign-in is currently configured for iOS only.",
					);
				}

				await this.getNativeOAuth().signIn(returnPath);
				return;
			}

			const { error } = await this.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: new URL(authCallbackTo, window.location.origin).href,
				},
			});

			if (error) {
				throw error;
			}
		} catch (error) {
			this.error = error instanceof Error
				? error.message
				: "Unable to start Google sign-in.";

			throw error;
		}
	}
}

export function provideGoogleAuth(auth: SupabaseClient["auth"]): GoogleAuth {
	const googleAuth = new GoogleAuth(auth);
	setContext(GOOGLE_AUTH_CONTEXT, googleAuth);
	return googleAuth;
}

export function getGoogleAuth(): GoogleAuth {
	const googleAuth = getContext<GoogleAuth | undefined>(GOOGLE_AUTH_CONTEXT);

	if (!googleAuth) {
		throw new Error(
			"Google auth context is missing. Call provideGoogleAuth() in the root layout.",
		);
	}

	return googleAuth;
}

// export const nativeAuthError = writable<string | null>(null);
// let nativeOAuth: ReturnType<typeof createNativeOAuth> | undefined;

// function getNativeOAuth() {
// 	return nativeOAuth ??= createNativeOAuth({
// 		auth: supabase.auth,
// 		app: App,
// 		browser: Browser,
// 		storage: window.localStorage,
// 		onSignedIn: async (path) => {
// 			nativeAuthError.set(null);
// 			await invalidate("supabase:auth");
// 			await goto(path, { replaceState: true });
// 		},
// 		onError: (message) => nativeAuthError.set(message),
// 	});
// }

// export async function initializeNativeGoogleAuth(): Promise<() => Promise<void>> {
// 	if (Capacitor.getPlatform() !== "ios") {
// 		return async () => {};
// 	}

// 	const oauth = getNativeOAuth();
// 	await oauth.initialize();

// 	return () => oauth.dispose();
// }

// export async function signInWithGoogle(authCallbackTo: string, returnPath: string) {
// 	nativeAuthError.set(null);

// 	if (Capacitor.isNativePlatform()) {
// 		if (Capacitor.getPlatform() !== "ios") {
// 			throw new Error("Native Google sign-in is currently configured for iOS only.");
// 		}

// 		await getNativeOAuth().signIn(returnPath);
// 		return;
// 	}

// 	const { error } = await supabase.auth.signInWithOAuth({
// 		provider: "google",
// 		options: { redirectTo: new URL(authCallbackTo, window.location.origin).href },
// 	});
// 	if (error) throw error;
// }
