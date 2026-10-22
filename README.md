# SvelteKit-Supabase-Capacitor

> SvelteKit 3 + Svelte 5 + Supabase + Capacitor 8 - web & mobile template

An OAuth-focused starter for a static SPA-style web app, packaged as native iOS and Android apps using Capacitor.

This is an early starter, not a complete production application.

Google OAuth has been tested on an iOS simulator and a physical Android phone. Other providers are configurable but require your own verification.

Email and password signups, confirmation emails, magic links, and password recovery have not been tested.

## Prerequisites

- Node.js **24.x** and npm
    - `.nvmrc` is provided - with nvm run `nvm install` + `nvm use`
- Supabase project
- For iOS:
    - macOS, Xcode, and the Xcode command-line tools
- For Android:
    - Android Studio, Java **21**, Android SDK **36**, and Android SDK Build-Tools **36.0.0**

## 1. Create your project

Choose **Use this template** -> **Create a new repository** on GitHub and then clone your new repository.

Keep `ios/` and `android/`. Do not run `cap add ...` again.

## 2. Initialize your project

```sh
npm install
npm run setup
```

Setup asks for an app ID, display name and npm package name. To run it without prompts:

```sh
npm run setup -- --yes --app-id com.example.myapp --app-name "My App" --package-name my-app
```

Use an app ID based on a domain you control.

Setup updates:

- The shared app config in `src/lib/app-config.ts`
- The Android namespace, application ID, and Java activity package and path
- App names, callback schemes, and callback registration
- The iOS display name and both bundle IDs
- The npm package name and the corresponding lockfile entries

Setup creates `.env` from `.env.example` only if `.env` does not already exist.

The setup script does not install packages, configure external accounts, change git remotes, or reset your git history.

Use `--dry-run` to validate and preview, or `--help` for all options. Repeating setup is safe for the included native layout.

The script is not a general-purpose native project renaming tool. After a rename, sync each platform again and update your Supabase redirect URL allowlist. Changing the app ID causes the app to install as a separate app with separate local data.

## 3. Configure Supabase and OAuth

Replace the placeholders in `.env`. Project uses the static adapter and so all these variables are bundled at build time - so NEVER use a service-role key or any secret key.

In Supabase **Authentication** -> **Sign in / Providers** enable your provider of choice (Google is used by default here) and configure its credentials. In your provider's settings paste in the Supabase "Callback URL (for OAuth)". It should be this:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

In Supabase **Authentication** -> **URL Configuration** set Site URL to your web origin. Into the redirect URLs add the exact URLs printed by the setup script, for example:

```text
com.example.myapp://auth/callback
http://localhost:5173/app
https://your-web-domain.example/app
```

In `src/lib/auth/providers.ts`, enable only the providers you configured.
Google is initially enabled.
Apple, Facebook, and GitHub are listed but disabled.

## 4. Run the app

For web:

```sh
npm run dev
```

For iOS:

```sh
npm run ios:build:sync
npm run ios:open
```

For Android:

```sh
npm run android:build:sync
npm run android:open
```

## Application intent

The application uses `adapter-static` to build a client-rendered SPA. Every route runs in the browser or WebView, using `build/index.html` as the entry point. Routes such as `/app/items/[id]` can load data for IDs that only exist at runtime.

Deploy the contents of `build/` to a static web host. Configure the host to serve existing files first, then rewrite unmatched page requests to `/index.html` with a **200** status, preserving the requested URL. This fallback is required for direct visits, reloads, and OAuth returns to app routes. `npm run preview` supports it locally.

Capacitor uses the same build and serves `index.html` for app routes. The existing sync and run commands copy the build directly into each native project.

All pages, including the homepage, require JavaScript to render. This keeps the template simple for app development - an SEO-focused public site may need a separate rendering strategy.

This setup does not require a SvelteKit server. Use Supabase Edge Functions or another backend for secrets and privileged operations. Use row-level security (RLS) policies to authorize access to data. The `(authenticated)` layout controls the sign-in UI, it does not authorize database access.

## Checks and CI

```sh
npm run check
npm test
npm run build
```
