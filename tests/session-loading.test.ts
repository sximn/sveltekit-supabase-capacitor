import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { build } from "vite";

test("session loading distinguishes verification failures from signed-out sessions", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "supacapacitor-session-loading-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const source = fileURLToPath(new URL("../src/routes/+layout.ts", import.meta.url));
	const mock = join(dir, "client.ts");
	await writeFile(mock, "export const supabase = { auth: null };");
	await writeFile(join(dir, "entry.ts"), `export { load } from ${JSON.stringify(source)}; export { supabase } from './client.ts';`);
	// Exercise the real layout load with the real SDK, substituting only its configured client.
	await build({
		configFile: false,
		logLevel: "silent",
		resolve: { alias: { "#lib/supabase/client.ts": mock } },
		build: {
			outDir: join(dir, "dist"),
			lib: { entry: join(dir, "entry.ts"), formats: ["es"], fileName: "session" },
		},
	});
	const { load, supabase } = await import(pathToFileURL(join(dir, "dist/session.js")).href);

	function client(savedSession = true) {
		const expiresAt = Math.floor(Date.now() / 1000) + 3600;
		const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
		const accessToken = [
			encode({ alg: "HS256", typ: "JWT" }),
			encode({ sub: "saved-user", aud: "authenticated", exp: expiresAt }),
			Buffer.from("test-signature").toString("base64url"),
		].join(".");
		const store = new Map<string, string>();
		if (savedSession) {
			store.set("test-session", JSON.stringify({
				access_token: accessToken,
				refresh_token: "test-refresh-token",
				expires_at: expiresAt,
				token_type: "bearer",
				user: { id: "saved-user", aud: "authenticated" },
			}));
		}
		const requests: string[] = [];
		let failure: string | null = "Temporarily unavailable";
		const sdk = createClient("https://example.supabase.co", "sb_publishable_session_test", {
			auth: {
				storageKey: "test-session",
				persistSession: true,
				autoRefreshToken: false,
				detectSessionInUrl: false,
				storage: {
					getItem: (key) => store.get(key) ?? null,
					setItem: (key, value) => { store.set(key, value); },
					removeItem: (key) => { store.delete(key); },
				},
			},
			global: {
				async fetch(url) {
					requests.push(String(url));
					// HS256 claims require server verification, so an unavailable
					// auth server can fail even while a session remains in storage.
					return new Response(JSON.stringify(failure
						? { message: failure }
						: { id: "saved-user", aud: "authenticated" }), {
						status: failure ? 503 : 200,
						headers: { "Content-Type": "application/json" },
					});
				},
			},
		});
		supabase.auth = sdk.auth;
		return { sdk, store, requests, fail: (message: string | null) => { failure = message; } };
	}

	async function reload() {
		const dependencies: string[] = [];
		const data = await load({ depends: (key: string) => dependencies.push(key) });
		assert.deepEqual(dependencies, ["supabase:auth"]);
		return data;
	}

	await t.test("a stored session survives failed checks and a fresh retry restores claims", async () => {
		const h = client();
		assert.equal((await h.sdk.auth.initialize()).error, null);
		const failed = await reload();
		assert.equal(failed.sessionError, "Temporarily unavailable");
		assert.equal(failed.userId, undefined);
		assert.equal(failed.authClaims, undefined);
		assert.equal((await h.sdk.auth.getSession()).data.session?.user.id, "saved-user");

		h.fail("Still unavailable");
		assert.equal((await reload()).sessionError, "Still unavailable");
		h.fail(null);
		const recovered = await reload();
		assert.equal(recovered.sessionError, null);
		assert.equal(recovered.userId, "saved-user");
		assert.equal(recovered.authClaims.sub, "saved-user");
		assert.equal(h.requests.length, 3);
		assert.ok(h.requests.every((url) => url.endsWith("/auth/v1/user")));
	});

	await t.test("no session is a successful signed-out check, with no verification request", async () => {
		const h = client(false);
		const data = await reload();
		assert.equal(data.sessionError, null);
		assert.equal(data.userId, undefined);
		assert.equal(data.authClaims, undefined);
		assert.equal(h.requests.length, 0);
	});

	await t.test("retry can resolve a failed check to a genuinely signed-out session", async () => {
		const h = client();
		assert.equal((await reload()).sessionError, "Temporarily unavailable");
		h.store.clear();
		const data = await reload();
		assert.equal(data.sessionError, null);
		assert.equal(data.userId, undefined);
	});

	await t.test("unexpected request failures are also surfaced and remain retryable", async () => {
		supabase.auth = { async getClaims() { throw new Error("Storage unavailable"); } };
		assert.equal((await reload()).sessionError, "Storage unavailable");
		supabase.auth = { async getClaims() { throw undefined; } };
		assert.equal((await reload()).sessionError, "Session check failed. Please try again.");
		client(false);
		assert.equal((await reload()).sessionError, null);
	});
});
