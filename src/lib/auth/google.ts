import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { goto, invalidate } from "$app/navigation";
import { writable } from "svelte/store";
import { supabase } from "#lib/supabase/client.ts";
import { createNativeOAuth } from "./native-oauth.ts";

export const nativeAuthError = writable<string | null>(null);
let nativeOAuth: ReturnType<typeof createNativeOAuth> | undefined;

function getNativeOAuth() {
	return nativeOAuth ??= createNativeOAuth({
		auth: supabase.auth,
		app: App,
		browser: Browser,
		storage: window.localStorage,
		onSignedIn: async (path) => {
			nativeAuthError.set(null);
			await invalidate("supabase:auth");
			await goto(path, { replaceState: true });
		},
		onError: (message) => nativeAuthError.set(message),
	});
}

export async function initializeNativeGoogleAuth(): Promise<() => Promise<void>> {
	if (Capacitor.getPlatform() !== "ios") {
		return async () => {};
	}

	const oauth = getNativeOAuth();
	await oauth.initialize();

	return () => oauth.dispose();
}

export async function signInWithGoogle(authCallbackTo: string, returnPath: string) {
	nativeAuthError.set(null);

	if (Capacitor.isNativePlatform()) {
		if (Capacitor.getPlatform() !== "ios") {
			throw new Error("Native Google sign-in is currently configured for iOS only.");
		}

		await getNativeOAuth().signIn(returnPath);
		return;
	}

	const { error } = await supabase.auth.signInWithOAuth({
		provider: "google",
		options: { redirectTo: new URL(authCallbackTo, window.location.origin).href },
	});
	if (error) throw error;
}
