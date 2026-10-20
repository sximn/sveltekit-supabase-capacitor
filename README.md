## Google OAuth on iOS

The web app uses Supabase's normal browser redirect flow. On iOS, Google sign-in
opens a Safari browser controller through `@capacitor/browser`. The app uses PKCE
and receives the result through `@capacitor/app`, exchanges the code in the
original WebView, and restores the page that started sign-in. No application
backend or Google client secret is needed in the app.

The iOS URL scheme is registered in `ios/App/App/Info.plist`. In Supabase
Authentication → URL Configuration → Redirect URLs, allow this exact URL:

```text
com.supacapacitor.app://auth/callback
```

Keep the Google Console authorized redirect pointing at Supabase's
`https://<project-ref>.supabase.co/auth/v1/callback`. Keep your existing web return
URLs in Supabase's allowlist as well. When changing the app identity, update both
the native URL registration and `NATIVE_AUTH_CALLBACK` in
`src/lib/auth/native-oauth.ts`, then update the Supabase allowlist.

After editing the frontend or installing plugins:

```sh
npm run ios:sync
npm run ios:open
```

`ios:sync` builds the static site and synchronizes its assets and plugins into
iOS. Build and run the **App** scheme in Xcode on a simulator or device. Opening
Xcode alone does not update its copied web assets.

Verification:

```sh
npm run check
npm test
```

The tests cover callback validation, warm/cold starts, cancellation, provider
errors, expired codes, duplicate callbacks, and overlapping sign-in attempts.
They mock the platform and auth service; also test a real Google login, app
restart after login, signout, and dismissing the browser followed by retrying.
Native tokens and the PKCE verifier remain in Supabase's WebView storage. The
app stores only the return path separately so a cold-start callback can finish.

iOS Google OAuth is configured here. Android URL registration and native email
confirmation/password-recovery flows need their own setup; the existing email
forms are unchanged.
