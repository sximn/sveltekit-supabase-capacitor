<script lang="ts">
	import { supabase } from "#lib/supabase/client.ts";
	import { signInWithGoogle } from "#lib/auth/google.ts";
	import type { HTMLAttributes } from "svelte/elements";

	type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
		redirectTo?: string;
		authCallbackTo?: string;
	};

	let {
		redirectTo = "/app",
		authCallbackTo = redirectTo,
		class: className = "",
		...props
	}: Props = $props();

	let email = $state("");
	let password = $state("");
	let error = $state<string | null>(null);
	let pending = $state<"email" | "google" | null>(null);

	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;

		pending = "email";
		error = null;

		try {
			const { error: authError } = await supabase.auth.signInWithPassword({
				email: email.trim(),
				password,
			});

			if (authError) {
				throw authError;
			}

			// TODO: we shouldn't need this, since the auth state will get assigned and +layout.svelte
			//       will render page instead of AuthGuard
			// window.location.assign(redirectTo);
		} catch (cause: unknown) {
			error = cause instanceof Error ? cause.message : "Unable to sign in.";
			pending = null;
		}
	}

	async function handleGoogleLogin() {
		if (pending) return;

		pending = "google";
		error = null;

		try {
			await signInWithGoogle(authCallbackTo, redirectTo);
		} catch (cause: unknown) {
			error =
				cause instanceof Error
					? cause.message
					: "Unable to sign in with Google.";
		} finally {
			pending = null;
		}
	}
</script>

<div {...props} class={`auth-form ${className}`}>
	<section class="card">
		<header>
			<h2>Welcome back!</h2>
			<p>Sign in to your account to continue.</p>
		</header>

		<div class="content" aria-busy={pending !== null}>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}

			<form onsubmit={handleLogin}>
				<label>
					Email
					<input
						name="email"
						type="email"
						autocomplete="username"
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
						autocomplete="current-password"
						bind:value={password}
						disabled={pending !== null}
						required
					/>
				</label>

				<button type="submit" disabled={pending !== null}>
					{pending === "email" ? "Signing in..." : "Sign in"}
				</button>
			</form>

			<div class="divider"><span>or</span></div>

			<button
				class="secondary"
				type="button"
				onclick={handleGoogleLogin}
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

	.error {
		margin: 0 0 1.25rem;
		color: #b91c1c;
		font-size: 0.875rem;
		overflow-wrap: anywhere;
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
