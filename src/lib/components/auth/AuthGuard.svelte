<script lang="ts">
	import OAuthButtons from "./OAuthButtons.svelte";

	let {
		redirectTo,
		authCallbackTo,
	}: {
		redirectTo?: string;
		authCallbackTo?: string;
	} = $props();
</script>

<div class="auth-wrapper">
	<div class="auth-container">
		<h1>Sign in</h1>
		<p>
			Continue with your preferred provider to create an account or sign in.
		</p>
		<OAuthButtons {redirectTo} {authCallbackTo} />
	</div>
</div>

<style>
	.auth-wrapper {
		min-height: 70svh;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 1rem;
		font-family: system-ui, sans-serif;
	}

	.auth-container {
		width: 100%;
		max-width: 40rem;
		padding: 2rem;
		border: 1px solid #e4e4e7;
		border-radius: 0.75rem;
		background: #fff;
		color: #18181b;
		box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
	}

	.auth-container p {
		margin: 0.5rem 0 1.5rem;
	}
</style>
