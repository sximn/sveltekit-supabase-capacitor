<script lang="ts">
	import app from "#lib/app-config.ts";
</script>

<svelte:head>
	<title>{app.appName}</title>
	<meta name="description" content="An OAuth starter for web, iOS, and Android." />
</svelte:head>

<main>
	<h1>{app.appName}</h1>
	<p>One SvelteKit application for web, iOS, and Android, with Supabase sign-in.</p>
	<a href="/app">Open app</a>
</main>

<style>
	main { max-width: 40rem; margin: 4rem auto; padding: 1.5rem; }
	p { margin: 1rem 0; }
</style>
