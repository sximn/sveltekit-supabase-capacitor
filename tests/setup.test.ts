import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { setupProject } from '../scripts/setup.ts';
import original, { type AppConfig } from '../src/lib/app-config.ts';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const activity = (id: string) => `android/app/src/main/java/${id.replaceAll('.', '/')}/MainActivity.java`;
const files = [
	'scripts/setup.ts', 'src/lib/app-config.ts', 'src/lib/auth/native-oauth.ts',
	'package.json', 'package-lock.json', '.env.example', 'capacitor.config.ts',
	'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
	'android/app/src/main/res/values/strings.xml', activity(original.appId),
	'ios/App/App/Info.plist', 'ios/App/App.xcodeproj/project.pbxproj',
];
const identity = { appId: 'dev.example.newapp', appName: 'New App', packageName: 'new-app' };
let configRead = 0;

async function readConfig(dir: string): Promise<AppConfig> {
	const url = pathToFileURL(join(dir, 'src/lib/app-config.ts'));
	url.searchParams.set('read', String(++configRead));
	return (await import(url.href)).default;
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
	const dir = await mkdtemp(join(tmpdir(), 'supacapacitor-setup-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	for (const file of files) {
		await mkdir(dirname(join(dir, file)), { recursive: true });
		await copyFile(join(root, file), join(dir, file));
	}
	return dir;
}

async function snapshot(dir: string) {
	const entries = await readdir(dir, { recursive: true });
	const result: Record<string, string> = {};
	for (const entry of entries.sort()) {
		if ((await stat(join(dir, entry))).isFile()) result[entry] = await readFile(join(dir, entry), 'utf8');
	}
	return result;
}

test('setup renames native identities, moves MainActivity, and synchronizes npm metadata', async (t) => {
	const dir = await fixture(t);
	await setupProject(dir, identity);
	const read = (file: string) => readFile(join(dir, file), 'utf8');
	assert.deepEqual(await readConfig(dir), { appId: identity.appId, appName: identity.appName });
	assert.match(await read('android/app/build.gradle'), /applicationId "dev.example.newapp"/);
	assert.match(await read('android/app/build.gradle'), /namespace = "dev.example.newapp"/);
	assert.match(await read('android/app/src/main/AndroidManifest.xml'), /android:scheme="dev.example.newapp"/);
	const strings = await read('android/app/src/main/res/values/strings.xml');
	assert.match(strings, /name="app_name" formatted="false">&quot;New App&quot;/);
	assert.match(strings, /name="title_activity_main" formatted="false">&quot;New App&quot;/);
	assert.match(strings, /name="package_name">dev.example.newapp/);
	assert.match(strings, /name="custom_url_scheme">dev.example.newapp/);
	assert.match(await read(activity(identity.appId)), /^package dev.example.newapp;/);
	if (original.appId !== identity.appId) await assert.rejects(read(activity(original.appId)), { code: 'ENOENT' });
	assert.equal((await read('ios/App/App.xcodeproj/project.pbxproj')).match(/PRODUCT_BUNDLE_IDENTIFIER = dev.example.newapp;/g)?.length, 2);
	const plist = await read('ios/App/App/Info.plist');
	assert.match(plist, /<string>New App<\/string>/);
	assert.match(plist, /<string>dev.example.newapp.auth<\/string>/);
	assert.match(plist, /<string>dev.example.newapp<\/string>/);
	assert.equal(JSON.parse(await read('package.json')).name, identity.packageName);
	const lock = JSON.parse(await read('package-lock.json'));
	assert.equal(lock.name, identity.packageName);
	assert.equal(lock.packages[''].name, identity.packageName);
	assert.equal(await read('.env'), await read('.env.example'));
	// Exercise the real callback module after renaming, without Svelte or Capacitor mocks.
	const { stdout } = await exec(process.execPath, ['--input-type=module', '-e',
		`import { NATIVE_AUTH_CALLBACK } from ${JSON.stringify(pathToFileURL(join(dir, 'src/lib/auth/native-oauth.ts')).href)}; console.log(NATIVE_AUTH_CALLBACK);`]);
	assert.equal(stdout.trim(), `${identity.appId}://auth/callback`);
});

test('setup preserves .env byte-for-byte and is repeatable, including a second rename', async (t) => {
	const dir = await fixture(t);
	const env = '# existing configuration\r\nPUBLIC_SUPABASE_URL=https://keep.example\r\n';
	await writeFile(join(dir, '.env'), env);
	await setupProject(dir, identity);
	const first = await snapshot(dir);
	await setupProject(dir, identity);
	assert.deepEqual(await snapshot(dir), first);
	await setupProject(dir, {});
	assert.deepEqual(await snapshot(dir), first);
	await setupProject(dir, { appId: 'org.example.another', appName: 'Another App' });
	assert.deepEqual(await readConfig(dir), { appId: 'org.example.another', appName: 'Another App' });
	assert.match(await readFile(join(dir, activity('org.example.another')), 'utf8'), /^package org.example.another;/);
	assert.equal(await readFile(join(dir, '.env'), 'utf8'), env);
});

test('setup preserves literal display names in generated TypeScript and native resources', async (t) => {
	const dir = await fixture(t);
	const appName = 'Café & "Friends" <App> \'$&\\ %s %d `${1 + 1}`';
	await setupProject(dir, { ...identity, appName });
	assert.equal((await readConfig(dir)).appName, appName);
	const plist = await readFile(join(dir, 'ios/App/App/Info.plist'), 'utf8');
	assert.ok(plist.includes('Café &amp; &quot;Friends&quot; &lt;App&gt; &apos;$&amp;\\'));
	const strings = await readFile(join(dir, 'android/app/src/main/res/values/strings.xml'), 'utf8');
	assert.ok(strings.includes('Café &amp; \\&quot;Friends\\&quot; &lt;App&gt; \\&apos;$&amp;\\\\'));
	const before = await snapshot(dir);
	await setupProject(dir, { ...identity, appName });
	assert.deepEqual(await snapshot(dir), before);
});

for (const invalid of [
	{ appId: '../../outside' }, { appId: 'com.Example.app' }, { appId: 'com.example.class' },
	{ appId: 'com.example.my_app' }, { appId: 'com.app' },
	{ appName: '' }, { appName: ' App ' }, { appName: 'App\nName' },
	{ packageName: '@scope/app' }, { packageName: '../app' }, { packageName: 'Uppercase' },
]) {
	test(`invalid identity is rejected before any files change: ${JSON.stringify(invalid)}`, async (t) => {
		const dir = await fixture(t);
		const before = await snapshot(dir);
		await assert.rejects(setupProject(dir, { ...identity, ...invalid }));
		assert.deepEqual(await snapshot(dir), before);
	});
}

test('native customization and destination collisions fail before writes', async (t) => {
	const dir = await fixture(t);
	const path = join(dir, 'ios/App/App.xcodeproj/project.pbxproj');
	const source = await readFile(path, 'utf8');
	await writeFile(path, source.replaceAll(original.appId, 'com.custom.identity'));
	const before = await snapshot(dir);
	await assert.rejects(setupProject(dir, identity), /Cannot safely update/);
	assert.deepEqual(await snapshot(dir), before);
	await writeFile(path, source);
	await mkdir(dirname(join(dir, activity(identity.appId))), { recursive: true });
	await writeFile(join(dir, activity(identity.appId)), '// custom activity');
	const collision = await snapshot(dir);
	await assert.rejects(setupProject(dir, identity), /Refusing to overwrite/);
	assert.deepEqual(await snapshot(dir), collision);
});

test('dry-run validates without modifying files or creating .env', async (t) => {
	const dir = await fixture(t);
	const before = await snapshot(dir);
	const result = await setupProject(dir, { ...identity, dryRun: true });
	assert.equal(result.createEnv, true);
	assert.deepEqual(await snapshot(dir), before);
});

test('CLI works from another directory and prints the configured redirect without exposing .env', async (t) => {
	const dir = await fixture(t);
	await writeFile(join(dir, '.env'), 'PRIVATE_SENTINEL=do-not-print\n');
	const script = join(dir, 'scripts/setup.ts');
	const { stdout } = await exec(process.execPath, [script, '--yes', '--app-id', identity.appId, '--app-name', identity.appName], { cwd: tmpdir() });

	assert.ok(
		stdout.includes(`${identity.appId}://auth/callback`),
		`Unexpected CLI stdout: ${JSON.stringify(stdout)}`,
	);

	assert.ok(stdout.includes('Preserved existing .env'));
	assert.ok(!stdout.includes('do-not-print'));
	assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).name, 'new-app');

	for (const args of [['--unknown'], ['--app-id'], []]) {
		await assert.rejects(exec(process.execPath, [script, ...args]), (error: { code?: number }) => error.code === 1);
	}

	assert.match((await exec(process.execPath, [script, '--help'])).stdout, /Usage:/);
});
