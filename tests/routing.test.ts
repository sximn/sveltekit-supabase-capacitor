import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
	cp,
	mkdir,
	mkdtemp,
	readFile,
	symlink,
	writeFile,
	rm,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

test("client-only pages and unenumerated routes build a SPA entry point", async (t) => {

	const dir = await mkdtemp(join(root, ".supacapacitor-routing-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	for (const path of [
		"src",
		"static",
		"package.json",
		"tsconfig.json",
		"vite.config.ts",
	]) {
		await cp(join(root, path), join(dir, path), { recursive: true });
	}
	await symlink(
		join(root, "node_modules"),
		join(dir, "node_modules"),
		process.platform === "win32" ? "junction" : "dir",
	);

	// No entries or known IDs: this page must be resolved at runtime.
	const route = join(dir, "src/routes/(authenticated)/app/items/[id]");
	await mkdir(route, { recursive: true });
	await writeFile(
		join(route, "+page.svelte"),
		'<script lang="ts">let { data } = $props();</script><h1>Item {data.id}</h1>',
	);
	await writeFile(
		join(route, "+page.ts"),
		`
		export const load = ({ params, url }) => ({
			id: params.id,
			tab: url.searchParams.get("tab"),
			origin: window.location.origin,
		});
	`,
	);
	await writeFile(
		join(dir, "src/routes/+page.svelte"),
		"<h1>Client-rendered home probe</h1>",
	);
	await writeFile(
		join(dir, "src/routes/+page.ts"),
		"export const load = () => ({ origin: window.location.origin });",
	);

	await exec(
		process.execPath,
		[join(root, "node_modules/vite/bin/vite.js"), "build"],
		{
			cwd: dir,
			env: {
				...process.env,
				PUBLIC_SUPABASE_URL: "https://example.supabase.co",
				PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_routing_test",
			},
		},
	);

	const web = join(dir, "build");
	const entry = await readFile(join(web, "index.html"), "utf8");
	assert.ok(!entry.includes("Client-rendered home probe"));
	assert.match(entry, /<script/);
});
