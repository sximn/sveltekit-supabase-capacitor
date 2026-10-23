import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "vite";

test("root layout data distinguishes session errors from signed-out results", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "supacapacitor-session-loading-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const source = fileURLToPath(
		new URL("../src/routes/+layout.ts", import.meta.url),
	);
	const mock = fileURLToPath(
		new URL("./fixtures/session-client.ts", import.meta.url),
	);
	await writeFile(
		join(dir, "entry.ts"),
		`export { load } from ${JSON.stringify(source)}; export { supabase } from ${JSON.stringify(mock)};`,
	);
	// Exercise the real layout load with controlled getClaims results.
	await build({
		configFile: false,
		logLevel: "silent",
		resolve: { alias: { "#lib/supabase/client.ts": mock } },
		build: {
			outDir: join(dir, "dist"),
			lib: {
				entry: join(dir, "entry.ts"),
				formats: ["es"],
				fileName: "session",
			},
		},
	});
	const { load, supabase: compiledClient } = await import(
		pathToFileURL(join(dir, "dist/session.js")).href
	);
	const supabase: typeof import("./fixtures/session-client.ts").supabase =
		compiledClient;

	async function loadSession() {
		const dependencies: string[] = [];
		const data = await load({
			depends: (key: string) => dependencies.push(key),
		});
		assert.deepEqual(dependencies, ["supabase:auth"]);
		return data;
	}

	await t.test(
		"successive loads surface current errors and then recovered claims",
		async () => {
			supabase.auth.result = {
				data: null,
				error: { message: "Temporarily unavailable" },
			};
			const failed = await loadSession();
			assert.equal(failed.sessionError, "Temporarily unavailable");
			assert.equal(failed.userId, undefined);
			assert.equal(failed.authClaims, undefined);

			supabase.auth.result = {
				data: null,
				error: { message: "Still unavailable" },
			};
			assert.equal((await loadSession()).sessionError, "Still unavailable");
			supabase.auth.result = {
				data: { claims: { sub: "saved-user" } },
				error: null,
			};
			const recovered = await loadSession();
			assert.equal(recovered.sessionError, null);
			assert.equal(recovered.userId, "saved-user");
			assert.equal(recovered.authClaims.sub, "saved-user");
		},
	);

	await t.test("no claims and no error produce signed-out data", async () => {
		supabase.auth.result = { data: null, error: null };
		const data = await loadSession();
		assert.equal(data.sessionError, null);
		assert.equal(data.userId, undefined);
		assert.equal(data.authClaims, undefined);
	});

	await t.test(
		"a subsequent signed-out result clears the previous session error",
		async () => {
			supabase.auth.result = {
				data: null,
				error: { message: "Temporarily unavailable" },
			};
			assert.equal(
				(await loadSession()).sessionError,
				"Temporarily unavailable",
			);
			supabase.auth.result = { data: null, error: null };
			const data = await loadSession();
			assert.equal(data.sessionError, null);
			assert.equal(data.userId, undefined);
			assert.equal(data.authClaims, undefined);
		},
	);
});
