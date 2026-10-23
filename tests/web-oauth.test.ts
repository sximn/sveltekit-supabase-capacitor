import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { initializeWebOAuth } from "../src/lib/auth/web-oauth.ts";

function browserClient(t: TestContext, href: string, signedIn = false) {
	const location = new URL(href);
	for (const [name, value] of Object.entries({
		window: { location, addEventListener() {}, removeEventListener() {} },
		document: { visibilityState: "visible" },
	})) {
		const previous = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, { configurable: true, value });
		t.after(() => {
			if (previous) Object.defineProperty(globalThis, name, previous);
			else Reflect.deleteProperty(globalThis, name);
		});
	}

	const client = createClient(
		"https://example.supabase.co",
		"sb_publishable_web_test",
		{
			auth: {
				flowType: "implicit",
				detectSessionInUrl: true,
				persistSession: false,
				autoRefreshToken: false,
				storageKey: `web-oauth-test:${t.name}`,
			},
			global: {
				async fetch() {
					assert.ok(signedIn, "denied callbacks must not make auth requests");
					return new Response(
						JSON.stringify({ id: "test-user", aud: "authenticated" }),
						{
							headers: { "Content-Type": "application/json" },
						},
					);
				},
			},
		},
	);
	return { auth: client.auth, location };
}

test("a fragment denial exposes the SDK error and preserves the return route and query", async (t) => {
	const href =
		"https://app.example/app/items/123?tab=details#error=access_denied&error_description=User%20denied%20access&error_code=provider_denied";
	const { auth } = browserClient(t, href);
	// Root layout loading may already have awaited auth before OAuth mounts.
	await auth.getClaims();
	const result = await initializeWebOAuth(auth, new URL(href));
	assert.equal(result.error, "User denied access");
	assert.equal(
		result.url?.href,
		"https://app.example/app/items/123?tab=details",
	);
	assert.equal((await auth.getSession()).data.session, null);
});

test("query denial parameters are removed so a retry cannot inherit the failed callback", async (t) => {
	const href =
		"https://app.example/app?tab=profile&error=access_denied&error_description=Try%20again&error_code=denied#settings";
	const { auth } = browserClient(t, href);
	const result = await initializeWebOAuth(auth, new URL(href));
	assert.equal(result.error, "Try again");
	assert.equal(
		result.url?.href,
		"https://app.example/app?tab=profile#settings",
	);
	const retry = await auth.signInWithOAuth({
		provider: "google",
		options: { redirectTo: result.url!.href, skipBrowserRedirect: true },
	});
	assert.equal(retry.error, null);
	assert.equal(
		new URL(retry.data.url!).searchParams.get("redirect_to"),
		result.url?.href,
	);
});

test("errors in both query and fragment are cleaned without deleting unrelated parameters", async (t) => {
	const href =
		"https://app.example/app?tab=profile&error_description=Query%20error#error=access_denied&error_description=Fragment%20error&section=security";
	const { auth } = browserClient(t, href);
	const result = await initializeWebOAuth(auth, new URL(href));
	assert.equal(result.error, "Query error");
	assert.equal(
		result.url?.href,
		"https://app.example/app?tab=profile#section=security",
	);
});

test("a denial without a description still exposes the SDK fallback message", async (t) => {
	const href = "https://app.example/app#error=access_denied";
	const { auth } = browserClient(t, href);
	const result = await initializeWebOAuth(auth, new URL(href));
	assert.ok(result.error);
	assert.equal(result.url?.href, "https://app.example/app");
});

test("ordinary visits leave application query parameters and anchors alone", async (t) => {
	const href = "https://app.example/app?tab=profile#settings";
	const { auth, location } = browserClient(t, href);
	assert.deepEqual(await initializeWebOAuth(auth, new URL(href)), {
		error: null,
		url: null,
	});
	assert.equal(location.href, href);
});

test("a successful callback remains owned by the SDK and cannot restore cleared tokens", async (t) => {
	const href =
		"https://app.example/app?tab=profile#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer";
	const { auth, location } = browserClient(t, href, true);
	assert.deepEqual(await initializeWebOAuth(auth, new URL(href)), {
		error: null,
		url: null,
	});
	assert.equal(location.href, "https://app.example/app?tab=profile");
	assert.equal((await auth.getSession()).data.session?.user.id, "test-user");
});
