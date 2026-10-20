<script lang="ts">
	import LoginForm from "./LoginForm.svelte";
	import RegisterForm from "./RegisterForm.svelte";

	let {
		redirectTo,
		authCallbackTo,
	}: {
		redirectTo?: string;
		authCallbackTo?: string;
	} = $props();

	let role: "register" | "login" = $state("login");

	function switchRole() {
		if (role === "login") {
			role = "register";
		} else {
			role = "login";
		}
	}
</script>

<div class="auth-wrapper">
	<div class="auth-container">
		{#if role === "login"}
			<LoginForm {redirectTo} {authCallbackTo} />
		{:else}
			<RegisterForm {redirectTo} {authCallbackTo} />
		{/if}

		<div class="role-wrapper">
			<button class="role-btn" onclick={switchRole}>
				{role === "login" ? "Log In" : "Sign Up"}
			</button>
		</div>
	</div>
</div>

<style>
	.auth-wrapper {
		height: 100svh;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		font-family: system-ui, sans-serif;
	}

	.auth-container {
		width: 100%;
		max-width: 40rem;
		/* box-sizing: border-box; */
		padding: 2rem 2rem 0 2rem;
		border: 1px solid #e4e4e7;
		border-radius: 0.75rem;
		background: #fff;
		color: #18181b;
		box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
	}

	.role-wrapper {
		display: flex;
		width: 100%;
		justify-content: center;
	}

	.role-btn {
		background-color: transparent;
		border: none;
		color: black;
		width: fit-content;
	}

	.role-btn:hover {
		background-color: transparent;
		border: none;
		text-decoration: underline;
	}
	.role-btn:focus-visible {
		outline: 2px dotted #18181b;
		outline-offset: -5px;
		text-decoration: underline;
	}
</style>
