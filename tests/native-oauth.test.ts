import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createNativeOAuth, localReturnPath, NATIVE_AUTH_CALLBACK } from "../src/lib/auth/native-oauth.ts";
import { getOAuthOptions, getOAuthProvider } from "../src/lib/auth/providers.ts";

function harness(
	storage = new Map<string, string>(),
	launchUrl?: string,
	auth?: Parameters<typeof createNativeOAuth>[0]["auth"],
) {
	let urlListener: ((event: { url: string }) => void) | undefined;
	let finishedListener: (() => void) | undefined;
	const calls = {
		signIns: [] as unknown[], exchanges: [] as string[], opened: [] as string[],
		paths: [] as string[], errors: [] as string[], closed: 0, removed: 0,
	};
	let exchangeResult = { data: { session: {} as unknown | null }, error: null as { message: string } | null };
	let failOpen = false;
	let finishOnClose = false;
	const oauth = createNativeOAuth({
		auth: auth ?? {
			async signInWithOAuth(options) {
				calls.signIns.push(options);
				return { data: { url: `https://example.supabase.co/auth/v1/authorize?provider=${options.provider}` }, error: null };
			},
			async exchangeCodeForSession(code) {
				calls.exchanges.push(code);
				return exchangeResult;
			},
		},
		app: {
			async addListener(_event, listener) {
				urlListener = listener;
				return { async remove() { urlListener = undefined; calls.removed++; } };
			},
			async getLaunchUrl() { return launchUrl ? { url: launchUrl } : undefined; },
		},
		browser: {
			async open({ url }) {
				if (failOpen) throw new Error("Browser unavailable");
				calls.opened.push(url);
			},
			async close() { calls.closed++; if (finishOnClose) finishedListener?.(); },
			async addListener(_event, listener) {
				finishedListener = listener;
				return { async remove() { finishedListener = undefined; calls.removed++; } };
			},
		},
		storage: {
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => { storage.set(key, value); },
			removeItem: (key) => { storage.delete(key); },
		},
		async onSignedIn(path) { calls.paths.push(path); },
		onError(message) { calls.errors.push(message); },
	});
	return {
		oauth, calls, storage,
		async openUrl(url: string) { urlListener?.({ url }); await setImmediate(); },
		finish() { finishedListener?.(); },
		failOpen() { failOpen = true; },
		finishOnClose() { finishOnClose = true; },
		failExchange() { exchangeResult = { data: { session: null }, error: { message: "Expired code" } }; },
	};
}

test("native sign-in requests the registered PKCE callback without navigating the WebView", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app?tab=profile");
	assert.deepEqual(h.calls.signIns, [{
		provider: "google", options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
	}]);
	assert.equal(h.calls.opened.length, 1);
	assert.deepEqual([...h.storage.values()], ["/app?tab=profile"]);
	await h.oauth.dispose();
});

for (const provider of ["google", "apple", "facebook", "github"] as const) {
	test(`${provider} uses the same native browser and callback exchange`, async () => {
		const h = harness();
		await h.oauth.signIn(provider, "/app");
		assert.deepEqual(h.calls.signIns, [{
			provider, options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
		}]);
		assert.equal(new URL(h.calls.opened[0]).searchParams.get("provider"), provider);
		await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=${provider}-code`);
		assert.deepEqual(h.calls.exchanges, [`${provider}-code`]);
		assert.deepEqual(h.calls.paths, ["/app"]);
		assert.deepEqual(h.calls.errors, []);
		await h.oauth.dispose();
	});
}

test("provider scopes and query parameters are passed through without changing the native callback", async () => {
	const h = harness();
	const options = { scopes: "read:user user:email", queryParams: { allow_signup: "false" } };
	await h.oauth.signIn("github", "/app", options);
	assert.deepEqual(h.calls.signIns, [{
		provider: "github",
		options: { ...options, redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
	}]);
	await h.oauth.dispose();
});

test("only explicitly enabled providers are selectable", () => {
	const providers = [
		{ id: "google", label: "Google", enabled: true },
		{ id: "apple", label: "Apple", enabled: false },
	] as const;
	assert.equal(getOAuthProvider("google", providers).label, "Google");
	assert.throws(() => getOAuthProvider("apple", providers), /not enabled/);
	assert.throws(() => getOAuthProvider("discord", providers), /not enabled/);
	assert.equal(getOAuthProvider("apple", [{ id: "apple", label: "Apple", enabled: true }]).id, "apple");
});

test("provider options exclude credentials and transport settings", () => {
	const config = {
		scopes: "email", queryParams: { prompt: "consent" },
		clientSecret: "must-not-forward", redirectTo: "https://example.test", skipBrowserRedirect: false,
	};
	assert.deepEqual(getOAuthOptions(config), { scopes: "email", queryParams: { prompt: "consent" } });
});

test("a warm callback exchanges once, persists no code, and returns to the requested page", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app?tab=profile");
	h.finishOnClose();
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=one-time-code`);
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=one-time-code`);
	assert.deepEqual(h.calls.exchanges, ["one-time-code"]);
	assert.deepEqual(h.calls.paths, ["/app?tab=profile"]);
	assert.equal(h.calls.closed, 1);
	assert.equal(h.storage.size, 0);
	assert.deepEqual(h.calls.errors, []);
});

test("a cold-start callback completes the attempt saved by a previous app process", async () => {
	const storage = new Map<string, string>();
	const first = harness(storage);
	await first.oauth.signIn("google", "/app");
	await first.oauth.dispose();
	const restarted = harness(storage, `${NATIVE_AUTH_CALLBACK}?code=cold-code`);
	await restarted.oauth.initialize();
	assert.deepEqual(restarted.calls.exchanges, ["cold-code"]);
	assert.deepEqual(restarted.calls.paths, ["/app"]);
	await restarted.openUrl(`${NATIVE_AUTH_CALLBACK}?code=cold-code`);
	assert.equal(restarted.calls.exchanges.length, 1);
});

test("unrelated and malformed deep links cannot consume a pending sign-in", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app");
	for (const url of [
		"not a URL", "https://auth/callback?code=wrong", "com.other.app://auth/callback?code=wrong",
		"com.supacapacitor.app://other/callback?code=wrong", "com.supacapacitor.app://auth/other?code=wrong",
		"com.supacapacitor.app://user@auth/callback?code=wrong", "com.supacapacitor.app://auth:123/callback?code=wrong",
		`${NATIVE_AUTH_CALLBACK}#access_token=wrong`,
	]) await h.openUrl(url);
	assert.deepEqual(h.calls.exchanges, []);
	assert.equal(h.storage.size, 1);
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=right`);
	assert.deepEqual(h.calls.exchanges, ["right"]);
});

test("unsolicited or stale launch callbacks never establish a session", async () => {
	const h = harness(new Map(), `${NATIVE_AUTH_CALLBACK}?code=stale`);
	await h.oauth.initialize();
	assert.deepEqual(h.calls.exchanges, []);
	assert.deepEqual(h.calls.paths, []);
});

test("provider denial is displayed, closes the browser, and permits retry", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app");
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?error=access_denied&error_description=User%20denied%20access`);
	assert.deepEqual(h.calls.errors, ["User denied access"]);
	assert.deepEqual(h.calls.exchanges, []);
	assert.deepEqual(h.calls.paths, []);
	assert.equal(h.calls.closed, 1);
	await h.oauth.signIn("google", "/app");
	assert.equal(h.calls.signIns.length, 2);
});

test("exchange failures and missing codes do not navigate or leave an active attempt", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app");
	await h.openUrl(NATIVE_AUTH_CALLBACK);
	assert.match(h.calls.errors[0], /authorization code/);
	await h.oauth.signIn("google", "/app");
	h.failExchange();
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=expired`);
	assert.equal(h.calls.errors[1], "Expired code");
	assert.deepEqual(h.calls.paths, []);
	assert.equal(h.storage.size, 0);
});

test("browser cancellation resets the attempt and allows another sign-in", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app");
	h.finish();
	assert.match(h.calls.errors[0], /cancelled/);
	assert.equal(h.storage.size, 0);
	await h.openUrl(`${NATIVE_AUTH_CALLBACK}?code=after-cancellation`);
	assert.deepEqual(h.calls.exchanges, []);
	await h.oauth.signIn("google", "/app");
	assert.equal(h.calls.opened.length, 2);
});

test("overlapping sign-ins cannot overwrite the PKCE verifier", async () => {
	const h = harness();
	await h.oauth.signIn("google", "/app");
	await assert.rejects(h.oauth.signIn("google", "/"), /already in progress/);
	assert.equal(h.calls.signIns.length, 1);
});

test("browser opening failures release the attempt", async () => {
	const h = harness();
	h.failOpen();
	await assert.rejects(h.oauth.signIn("google", "/app"), /Browser unavailable/);
	assert.equal(h.storage.size, 0);
	await assert.rejects(h.oauth.signIn("google", "/app"), /Browser unavailable/);
	assert.equal(h.calls.signIns.length, 2);
});

test("listener initialization is shared and disposing removes only owned listeners", async () => {
	const h = harness();
	await Promise.all([h.oauth.initialize(), h.oauth.initialize()]);
	await h.oauth.dispose();
	assert.equal(h.calls.removed, 2);
	await h.oauth.initialize();
	await h.oauth.dispose();
	assert.equal(h.calls.removed, 4);
});

test("return destinations cannot escape into external URLs", () => {
	for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "javascript:alert(1)"]) {
		assert.equal(localReturnPath(path), "/app");
	}
	assert.equal(localReturnPath("/app?tab=profile"), "/app?tab=profile");
});

test("the real Supabase SDK restores the PKCE verifier and persists a session across a cold start", async () => {
	const storage = new Map<string, string>();
	const requests: { url: string; body: Record<string, string> }[] = [];
	const accessToken = [
		{ alg: "HS256", typ: "JWT" },
		{ sub: "test-user", exp: Math.floor(Date.now() / 1000) + 3600 },
	].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".signature";
	function client() {
		return createClient("https://example.supabase.co", "sb_publishable_test", {
			auth: {
				flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: false,
				storage: {
					getItem: (key) => storage.get(key) ?? null,
					setItem: (key, value) => { storage.set(key, value); },
					removeItem: (key) => { storage.delete(key); },
				},
			},
			global: {
				async fetch(input, init) {
					requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
					return new Response(JSON.stringify({
						access_token: accessToken, refresh_token: "test-refresh", expires_in: 3600,
						token_type: "bearer", user: { id: "test-user", aud: "authenticated" },
					}), { headers: { "Content-Type": "application/json" } });
				},
			},
		});
	}
	const first = harness(storage, undefined, client().auth);
	await first.oauth.signIn("google", "/app");
	const authorize = new URL(first.calls.opened[0]);
	assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
	assert.ok(authorize.searchParams.get("code_challenge"));
	const verifierEntry = [...storage.entries()].find(([key]) => key.endsWith("-code-verifier"));
	assert.ok(verifierEntry, "the verifier must persist in the app's storage before opening Safari");
	const verifier = JSON.parse(verifierEntry![1]);
	await first.oauth.dispose();

	const restoredClient = client();
	const restored = harness(storage, `${NATIVE_AUTH_CALLBACK}?code=returned-code`, restoredClient.auth);
	await restored.oauth.initialize();
	assert.equal(requests.length, 1);
	assert.equal(new URL(requests[0].url).searchParams.get("grant_type"), "pkce");
	assert.deepEqual(requests[0].body, { auth_code: "returned-code", code_verifier: verifier });
	assert.deepEqual(restored.calls.errors, []);
	assert.deepEqual(restored.calls.paths, ["/app"]);
	assert.equal((await restoredClient.auth.getSession()).data.session?.user.id, "test-user");
	// The SDK owns its verifier-slot cleanup; our app-owned attempt must be gone.
	assert.equal(storage.has("supacapacitor:oauth:return-path"), false);
	await restored.oauth.dispose();
});
