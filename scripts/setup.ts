import { constants } from "node:fs";
import {
	access,
	copyFile,
	mkdir,
	readFile,
	realpath,
	rename,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { createHash } from "node:crypto";
import type { AppConfig } from "../src/lib/app-config.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = "src/lib/app-config.ts";

type Identity = AppConfig & { packageName: string };
type SetupOptions = Partial<Identity> & { yes?: boolean; dryRun?: boolean };
type Replacement = [RegExp, string, number?];

const javaKeywords = new Set(
	(
		"abstract assert boolean break byte case catch char class const continue " +
		"default do double else enum extends final finally float for goto if implements import instanceof " +
		"int interface long native new package private protected public return short static strictfp super " +
		"switch synchronized this throw throws transient try void volatile while true false null _"
	).split(" "),
);

function validateIdentity({ appId, appName, packageName }: Identity) {
	if (
		typeof appId !== "string" ||
		appId.length > 150 ||
		!/^(?:[a-z][a-z0-9]*\.){2,}[a-z][a-z0-9]*$/.test(appId) ||
		appId.split(".").some((part) => javaKeywords.has(part))
	) {
		throw new Error(
			"App ID must have at least three lowercase segments, e.g. com.example.myapp. Use letters and digits; Java keywords are reserved.",
		);
	}

	if (
		typeof appName !== "string" ||
		!appName.trim() ||
		appName !== appName.trim() ||
		appName.length > 80 ||
		/[\p{Cc}\p{Cf}\p{Cs}]/u.test(appName)
	) {
		throw new Error(
			"App name must be 1–80 visible characters without leading or trailing whitespace.",
		);
	}

	if (
		typeof packageName !== "string" ||
		packageName.length > 214 ||
		!/^(?![._])[a-z0-9][a-z0-9._-]*$/.test(packageName) ||
		["node_modules", "favicon.ico"].includes(packageName)
	) {
		throw new Error(
			"Package name must be an unscoped lowercase npm name, e.g. my-app.",
		);
	}
}

function slug(name: string) {
	return (
		name
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 214) || "my-app"
	);
}

function xml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function androidName(value: string) {
	// Android resource quoting preserves whitespace and literal @, ?, quotes and apostrophes.
	return xml(
		`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'")}"`,
	);
}

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function exists(path: string) {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;	
		}
		throw error;
	}
}

async function readAppConfig(root: string): Promise<AppConfig> {
	const path = join(root, configPath);
	const source = await readFile(path, "utf8");
	const url = pathToFileURL(path);

	// Setup can run repeatedly in one process; reload after its generated module changes.
	url.searchParams.set(
		"version",
		createHash("sha256").update(source).digest("hex"),
	);

	return (await import(url.href)).default;
}

function renderAppConfig({ appId, appName }: AppConfig): string {
	return `import type { CapacitorConfig } from '@capacitor/cli';

export type AppConfig = Required<Pick<CapacitorConfig, 'appId' | 'appName'>>;

// Managed by npm run setup; use that command to keep native identities in sync.
export default {
\tappId: ${JSON.stringify(appId)},
\tappName: ${JSON.stringify(appName)},
} satisfies AppConfig;
`;
}

/** Plan every edit before writing. Refuse unexpected native customization rather than guessing. */
export async function setupProject(root: string, options: SetupOptions) {
	const read = (path: string) => readFile(join(root, path), "utf8");

	const previous = await readAppConfig(root);
	const pkg = JSON.parse(await read("package.json"));

	const identity = {
		appId: options.appId ?? previous.appId,
		appName: options.appName ?? previous.appName,
		packageName:
			options.packageName ??
			(options.appName ? slug(options.appName) : pkg.name),
	};

	validateIdentity(identity);
	validateIdentity({ ...previous, packageName: pkg.name });

	const { appId, appName, packageName } = identity;
	const edits = new Map<string, string>();

	async function edit(path: string, replacements: Replacement[]) {
		let source = await read(path);

		for (const [pattern, value, count = 1] of replacements) {
			const matches = [...source.matchAll(pattern)];
			if (matches.length !== count) {
				throw new Error(
					`Cannot safely update ${path}: expected ${count} matching identity field(s), found ${matches.length}. Restore its identity fields to match ${configPath}, or rename manually.`,
				);
			}
			source = source.replace(pattern, () => value);
		}
		edits.set(path, source);
	}

	const oldId = escapeRegex(previous.appId);

	await edit("android/app/build.gradle", [
		[new RegExp(`namespace = "${oldId}"`, "g"), `namespace = "${appId}"`],
		[new RegExp(`applicationId "${oldId}"`, "g"), `applicationId "${appId}"`],
	]);

	await edit("android/app/src/main/AndroidManifest.xml", [
		[new RegExp(`android:scheme="${oldId}"`, "g"), `android:scheme="${appId}"`],
	]);

	await edit("android/app/src/main/res/values/strings.xml", [
		...["app_name", "title_activity_main"].map((key): Replacement => [
			new RegExp(
				`<string name="${key}"(?: formatted="false")?>(?:${escapeRegex(xml(previous.appName))}|${escapeRegex(androidName(previous.appName))})<\/string>`,
				"g",
			),
			`<string name="${key}" formatted="false">${androidName(appName)}</string>`,
		]),
		...["package_name", "custom_url_scheme"].map((key): Replacement => [
			new RegExp(`<string name="${key}">${oldId}<\/string>`, "g"),
			`<string name="${key}">${appId}</string>`,
		]),
	]);

	await edit("ios/App/App/Info.plist", [
		[
			new RegExp(
				`(<key>CFBundleDisplayName<\/key>\\s*)<string>${escapeRegex(xml(previous.appName))}<\/string>`,
				"g",
			),
			`<key>CFBundleDisplayName</key>\n\t<string>${xml(appName)}</string>`,
		],
		[
			new RegExp(`<string>${oldId}\\.auth<\/string>`, "g"),
			`<string>${appId}.auth</string>`,
		],
		[
			new RegExp(`<string>${oldId}<\/string>`, "g"),
			`<string>${appId}</string>`,
		],
	]);

	await edit("ios/App/App.xcodeproj/project.pbxproj", [
		[
			new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${oldId};`, "g"),
			`PRODUCT_BUNDLE_IDENTIFIER = ${appId};`,
			2,
		],
	]);

	const oldActivity = `android/app/src/main/java/${previous.appId.replaceAll(".", "/")}/MainActivity.java`;
	const newActivity = `android/app/src/main/java/${appId.replaceAll(".", "/")}/MainActivity.java`;

	await edit(oldActivity, [
		[new RegExp(`^package ${oldId};`, "gm"), `package ${appId};`],
	]);

	if (oldActivity !== newActivity && (await exists(join(root, newActivity)))) {
		throw new Error(`Refusing to overwrite existing ${newActivity}.`);
	}

	const json = (value: unknown) => JSON.stringify(value, null, "\t") + "\n";

	edits.set(configPath, renderAppConfig({ appId, appName }));
	pkg.name = packageName;
	edits.set("package.json", json(pkg));

	const lock = JSON.parse(await read("package-lock.json"));
	if (!lock.packages?.[""]) {
		throw new Error("Expected an npm lockfile with a root package.");
	}

	lock.name = packageName;
	lock.packages[""].name = packageName;
	edits.set("package-lock.json", json(lock));

	const createEnv = !(await exists(join(root, ".env")));
	if (createEnv) {
		await read(".env.example");
	}

	if (!options.dryRun) {
		if (oldActivity !== newActivity) {
			await mkdir(dirname(join(root, newActivity)), { recursive: true });
			await rename(join(root, oldActivity), join(root, newActivity));
			edits.set(newActivity, edits.get(oldActivity)!);
			edits.delete(oldActivity);
		}

		for (const [path, content] of edits) {
			if ((await read(path)) !== content)
				await writeFile(join(root, path), content);
		}

		if (createEnv) {
			try {
				await copyFile(
					join(root, ".env.example"),
					join(root, ".env"),
					constants.COPYFILE_EXCL,
				);
			} catch (error) {
				if (!(
					error instanceof Error &&
					"code" in error &&
					error.code === "EEXIST"
				)) {
					throw error;
				}
			}
		}
	}
	return { ...identity, createEnv };
}

const help = `Usage: npm run setup -- [options]

  --app-id ID          Reverse-domain ID, e.g. com.example.myapp
  --app-name NAME      Display name, e.g. "My App"
  --package-name NAME  npm package name (defaults to a slug of the new app name)
  --yes               Use current values for omitted options; do not prompt
  --dry-run           Validate and preview without writing
  --help              Show this help

Updates the committed native projects and shared app identity. Creates .env only
if absent. Run before configuring signing or adding native targets. No installs,
network requests, credential prompts, or Git history/remote changes are performed.`;

async function main() {
	const options: SetupOptions = {};
	const names: Record<string, keyof Identity> = {
		"--app-id": "appId",
		"--app-name": "appName",
		"--package-name": "packageName",
	};

	const args = process.argv.slice(2);

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help") {
			console.log(help);
			return;
		}

		if (arg === "--yes") {
			options.yes = true;
			continue;
		}

		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (
			!Object.hasOwn(names, arg) ||
			!args[i + 1] ||
			args[i + 1].startsWith("--")
		) {
			throw new Error(
				`Unknown option or missing value: ${arg}. Run npm run setup -- --help.`,
			);
		}

		options[names[arg]] = args[++i];
	}

	if (!options.yes) {
		if (!process.stdin.isTTY || !process.stdout.isTTY) {
			throw new Error(
				"Non-interactive setup requires --yes. Supply --app-id and --app-name to customize the starter.",
			);
		}
		const current = await readAppConfig(projectRoot);
		const pkg = JSON.parse(
			await readFile(join(projectRoot, "package.json"), "utf8"),
		);

		const prompt = createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		try {
			const questions: [keyof Identity, string, string | null][] = [
				["appId", "App ID", current.appId],
				["appName", "App display name", current.appName],
				["packageName", "npm package name", null],
			];

			for (const [key, label, fallback] of questions) {
				if (options[key] !== undefined) {
					continue;
				}

				const defaultValue =
					fallback ??
					(options.appName !== current.appName
						? slug(options.appName!)
						: pkg.name);
				options[key] =
					(await prompt.question(`${label} (${defaultValue}): `)).trim() ||
					defaultValue;
			}
		} finally {
			prompt.close();
		}
	}

	const result = await setupProject(projectRoot, options);

	console.log(
		`\n${options.dryRun ? "Preview" : "Configured"}: ${result.appName} (${result.appId})\nPackage: ${result.packageName}`,
	);

	console.log(
		options.dryRun
			? "No files changed."
			: result.createEnv
				? "Created .env from .env.example."
				: "Preserved existing .env.",
	);

	console.log(`\nNext steps:
1. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.
2. Enable your provider in Supabase and src/lib/auth/providers.ts.
3. Add these exact Supabase redirect URLs:
   ${result.appId}://auth/callback
   http://localhost:5173/app
   https://<your-web-domain>/app
   Add other return paths explicitly if you introduce them.
4. Set Supabase Site URL to your web origin. Provider consoles use:
   https://<project-ref>.supabase.co/auth/v1/callback
5. Run npm run build, npm run ios:sync, npm run android:sync
   Re-sync both native projects after renaming; signing and provider accounts
   are configured separately. See README.md for platform prerequisites.`);
}

if (
	process.argv[1] &&
	import.meta.url ===
		pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
	main().catch((error) => {
		console.error(`Setup failed: ${error.message}`);
		process.exitCode = 1;
	});
}
