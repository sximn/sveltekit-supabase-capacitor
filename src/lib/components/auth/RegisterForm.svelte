<script lang="ts">
	import { supabase } from "#lib/supabase/client.ts";
	import { signInWithGoogle } from "#lib/auth/google.ts";
	import type { HTMLAttributes } from "svelte/elements";

	type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
		redirectTo?: string;
		authCallbackTo?: string;
		minPasswordLength?: number;
	};

	let {
		redirectTo = "/app",
		authCallbackTo = redirectTo,
		minPasswordLength = 8,
		class: className = "",
		...props
	}: Props = $props();

	let email = $state("");
	let password = $state("");
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);
	let pending = $state<"email" | "google" | null>(null);

	async function handleRegister(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;

		pending = "email";
		error = null;
		message = null;

		try {
			const { data, error: authError } = await supabase.auth.signUp({
				email: email.trim(),
				password,
				options: {
					emailRedirectTo: new URL(authCallbackTo, window.location.origin).href,
				},
			});

			if (authError) {
				throw authError;
			}

			password = "";

			if (data.session) {
				window.location.assign(redirectTo);
				return;
			}

			message = "Check your inbox for an email confirmation link.";
			pending = null;
		} catch (cause: unknown) {
			error =
				cause instanceof Error
					? cause.message
					: "Unable to create your account.";
			pending = null;
		}
	}

	async function handleGoogleSignup() {
		if (pending) return;

		pending = "google";
		error = null;
		message = null;

		try {
			await signInWithGoogle(authCallbackTo, redirectTo);
		} catch (cause: unknown) {
			error =
				cause instanceof Error
					? cause.message
					: "Unable to continue with Google.";
		} finally {
			pending = null;
		}
	}
</script>

<div {...props} class={`auth-form ${className}`}>
	<section class="card">
		<header>
			<h2>Create an account</h2>
			<p>Sign up with your email or Google account.</p>
		</header>

		<div class="content" aria-busy={pending !== null}>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}

			{#if message}
				<p class="success" role="status">{message}</p>
			{/if}

			<form onsubmit={handleRegister}>
				<label>
					Email
					<input
						name="email"
						type="email"
						autocomplete="email"
						bind:value={email}
						disabled={pending !== null}
						required
					/>
				</label>

				<label>
					Password
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						minlength={minPasswordLength}
						bind:value={password}
						disabled={pending !== null}
						required
					/>
					<small>Use at least {minPasswordLength} characters.</small>
				</label>

				<button type="submit" disabled={pending !== null}>
					{pending === "email" ? "Creating account..." : "Create account"}
				</button>
			</form>

			<div class="divider"><span>or</span></div>

			<button
				class="secondary"
				type="button"
				onclick={handleGoogleSignup}
				disabled={pending !== null}
			>
				{pending === "google" ? "Redirecting..." : "Continue with Google"}
			</button>
		</div>
	</section>
</div>

<style>
	.auth-form {
		display: flex;
		justify-content: center;
	}

	.card {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid #e4e4e7;
		border-radius: 0.75rem;
		background: #fff;
		color: #18181b;
		box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
	}

	.content {
		padding: 0 1.5rem 1.5rem;
	}

	.error,
	.success {
		margin: 0 0 1.25rem;
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}

	.error {
		color: #b91c1c;
	}
	.success {
		color: #15803d;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0;
		color: #71717a;
		font-size: 0.875rem;
	}

	.divider::before,
	.divider::after {
		content: "";
		flex: 1;
		height: 1px;
		background: #e4e4e7;
	}
</style>
