import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import app from "../src/lib/app-config.ts";

type AuthError = { message: string } | null;

test("OAuth service busy state follows asynchronous auth work", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "supacapacitor-auth-loading-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const source = fileURLToPath(
		new URL("../src/lib/auth/oauth.svelte.ts", import.meta.url),
	);
	const mocks = fileURLToPath(
		new URL("./fixtures/auth-runtime.ts", import.meta.url),
	);
	await writeFile(
		join(dir, "entry.ts"),
		`export { OAuth } from ${JSON.stringify(source)}; export { runtime, resetRuntime } from ${JSON.stringify(mocks)};`,
	);
	// Compile the actual runes service; no fake $state implementation or extra test runner.
	await build({
		configFile: false,
		logLevel: "silent",
		plugins: [svelte()],
		resolve: {
			alias: Object.fromEntries(
				[
					"@capacitor/core",
					"@capacitor/app",
					"@capacitor/browser",
					"$app/navigation",
					"$app/state",
				].map((id) => [id, mocks]),
			),
		},
		build: {
			outDir: join(dir, "dist"),
			lib: { entry: join(dir, "entry.ts"), formats: ["es"], fileName: "oauth" },
		},
	});
	const {
		OAuth,
		runtime: compiledRuntime,
		resetRuntime,
	} = await import(pathToFileURL(join(dir, "dist/oauth.js")).href);
	const runtime: typeof import("./fixtures/auth-runtime.ts").runtime =
		compiledRuntime;

	function harness(t: TestContext, native = false) {
		resetRuntime(native);
		const pageEvents = new Map<
			string,
			(event: { persisted: boolean }) => void
		>();
		const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					href: "https://app.example/app",
					origin: "https://app.example",
				},
				addEventListener: (
					name: string,
					listener: (event: { persisted: boolean }) => void,
				) => pageEvents.set(name, listener),
				removeEventListener: (name: string) => pageEvents.delete(name),
				localStorage: {
					getItem: (key: string) => runtime.storage.get(key) ?? null,
					setItem: (key: string, value: string) =>
						runtime.storage.set(key, value),
					removeItem: (key: string) => runtime.storage.delete(key),
				},
			},
		});
		t.after(() => {
			if (previous) Object.defineProperty(globalThis, "window", previous);
			else Reflect.deleteProperty(globalThis, "window");
		});
		const auth = {
			async initialize(): Promise<{ error: AuthError }> {
				return { error: null };
			},
			async signInWithOAuth(): Promise<{
				data: { url: string | null };
				error: AuthError;
			}> {
				return {
					data: { url: "https://provider.example/authorize" },
					error: null,
				};
			},
			async exchangeCodeForSession(): Promise<{
				data: { session: object | null };
				error: AuthError;
			}> {
				return { data: { session: {} }, error: null };
			},
			async signOut(): Promise<{ error: AuthError }> {
				return { error: null };
			},
		};
		return { auth, oauth: new OAuth(auth), pageEvents };
	}

	await t.test(
		"initialization stays busy until the SDK finishes, with no auth event required",
		async (t) => {
			const h = harness(t);
			const gate = Promise.withResolvers<{ error: AuthError }>();
			h.auth.initialize = () => gate.promise;
			const initializing = h.oauth.initialize();
			assert.equal(h.oauth.phase, "initializing");
			assert.equal(h.oauth.busy, true);
			gate.resolve({ error: null });
			const dispose = await initializing;
			assert.equal(h.oauth.phase, "idle");
			await dispose();
			assert.equal(h.pageEvents.size, 0);
		},
	);

	await t.test(
		"web pending survives the redirect request resolving and browser history permits retry",
		async (t) => {
			const h = harness(t);
			await h.oauth.initialize();
			const gate =
				Promise.withResolvers<
					Awaited<ReturnType<typeof h.auth.signInWithOAuth>>
				>();
			h.auth.signInWithOAuth = () => gate.promise;
			const signingIn = h.oauth.signIn("google");
			assert.equal(h.oauth.pendingProvider, "google");
			assert.equal(h.oauth.busy, true);
			await assert.rejects(h.oauth.signIn("google"), /already in progress/);
			gate.resolve({
				data: { url: "https://provider.example/authorize" },
				error: null,
			});
			await signingIn;
			assert.equal(h.oauth.phase, "redirecting");
			h.pageEvents.get("pageshow")!({ persisted: false });
			assert.equal(h.oauth.busy, true);
			h.pageEvents.get("pageshow")!({ persisted: true });
			assert.equal(h.oauth.busy, false);
			assert.equal(h.oauth.pendingProvider, null);
		},
	);

	await t.test(
		"failed or missing redirect URLs release loading and allow retry",
		async (t) => {
			const h = harness(t);
			await h.oauth.initialize();
			h.auth.signInWithOAuth = async () => ({
				data: { url: null },
				error: { message: "Provider unavailable" },
			});
			await assert.rejects(h.oauth.signIn("google"), /Provider unavailable/);
			assert.equal(h.oauth.phase, "idle");
			assert.equal(h.oauth.pendingProvider, null);
			h.auth.signInWithOAuth = async () => ({
				data: { url: null },
				error: null,
			});
			await assert.rejects(h.oauth.signIn("google"), /authorization URL/);
			assert.equal(h.oauth.busy, false);
		},
	);

	await t.test(
		"initialization failures release loading and remove the history listener",
		async (t) => {
			const h = harness(t);
			h.auth.initialize = async () => {
				throw new Error("Initialization failed");
			};
			await assert.rejects(h.oauth.initialize(), /Initialization failed/);
			assert.equal(h.oauth.phase, "idle");
			assert.equal(h.pageEvents.size, 0);
		},
	);

	await t.test(
		"logout stays busy until signOut and invalidation promises settle",
		async (t) => {
			const h = harness(t);
			await h.oauth.initialize();
			const request = Promise.withResolvers<{ error: AuthError }>();
			const refresh = Promise.withResolvers<void>();
			h.auth.signOut = () => request.promise;
			runtime.onInvalidate = () => refresh.promise;
			const signingOut = h.oauth.signOut();
			assert.equal(h.oauth.phase, "signing-out");
			await assert.rejects(h.oauth.signOut(), /already in progress/);
			request.resolve({ error: null });
			await setImmediate();
			assert.deepEqual(runtime.invalidations, ["supabase:auth"]);
			assert.equal(h.oauth.phase, "signing-out");
			refresh.resolve();
			await signingOut;
			assert.equal(h.oauth.phase, "idle");
		},
	);

	await t.test(
		"logout failures expose an error and release loading",
		async (t) => {
			const h = harness(t);
			await h.oauth.initialize();
			h.auth.signOut = async () => ({
				error: { message: "Network unavailable" },
			});
			await assert.rejects(h.oauth.signOut(), /Network unavailable/);
			assert.equal(h.oauth.phase, "idle");
			assert.equal(h.oauth.error, "Network unavailable");
		},
	);

	await t.test(
		"native browser dismissal clears pending and permits another attempt",
		async (t) => {
			const h = harness(t, true);
			await h.oauth.initialize();
			await h.oauth.signIn("google");
			assert.equal(h.oauth.phase, "redirecting");
			assert.equal(h.oauth.pendingProvider, "google");
			runtime.browserEvents.get("browserFinished")!();
			assert.equal(h.oauth.phase, "idle");
			assert.equal(h.oauth.pendingProvider, null);
			assert.match(h.oauth.error, /cancelled/);
			await h.oauth.signIn("google");
			assert.equal(runtime.opened.length, 2);
		},
	);

	await t.test(
		"a stale native browser event cannot clear logout loading",
		async (t) => {
			const h = harness(t, true);
			await h.oauth.initialize();
			const request = Promise.withResolvers<{ error: AuthError }>();
			h.auth.signOut = () => request.promise;
			const signingOut = h.oauth.signOut();
			runtime.browserEvents.get("browserFinished")!();
			assert.equal(h.oauth.phase, "signing-out");
			request.resolve({ error: null });
			await signingOut;
			assert.equal(h.oauth.phase, "idle");
		},
	);

	await t.test(
		"native callback stays busy through exchange, invalidation, and goto",
		async (t) => {
			const h = harness(t, true);
			await h.oauth.initialize();
			await h.oauth.signIn("google", { returnPath: "/app?tab=profile" });
			const exchange =
				Promise.withResolvers<
					Awaited<ReturnType<typeof h.auth.exchangeCodeForSession>>
				>();
			const refresh = Promise.withResolvers<void>();
			const navigation = Promise.withResolvers<void>();
			h.auth.exchangeCodeForSession = () => exchange.promise;
			runtime.onInvalidate = () => refresh.promise;
			runtime.onGoto = () => navigation.promise;
			runtime.appEvents.get("appUrlOpen")!({
				url: `${app.appId}://auth/callback?code=callback-code`,
			});
			assert.equal(h.oauth.phase, "completing");
			runtime.browserEvents.get("browserFinished")!();
			assert.equal(h.oauth.phase, "completing");
			exchange.resolve({ data: { session: {} }, error: null });
			await setImmediate();
			assert.equal(h.oauth.phase, "completing");
			refresh.resolve();
			await setImmediate();
			assert.deepEqual(runtime.paths, ["/app?tab=profile"]);
			assert.equal(h.oauth.phase, "completing");
			navigation.resolve();
			await setImmediate();
			assert.equal(h.oauth.phase, "idle");
			assert.equal(h.oauth.pendingProvider, null);
		},
	);

	await t.test(
		"a cold native callback stays busy until the restored session is ready",
		async (t) => {
			const h = harness(t, true);
			runtime.storage.set("supacapacitor:oauth:return-path", "/app?restored=1");
			runtime.launch = {
				url: `${app.appId}://auth/callback?code=cold-start-code`,
			};
			const exchange =
				Promise.withResolvers<
					Awaited<ReturnType<typeof h.auth.exchangeCodeForSession>>
				>();
			h.auth.exchangeCodeForSession = () => exchange.promise;
			const initializing = h.oauth.initialize();
			await setImmediate();
			assert.equal(h.oauth.phase, "completing");
			exchange.resolve({ data: { session: {} }, error: null });
			await initializing;
			assert.equal(h.oauth.phase, "idle");
			assert.deepEqual(runtime.paths, ["/app?restored=1"]);
		},
	);
});
