# Contributing to the Template

Use Node 24 (`nvm use`).
For simplicity, npm is used in this template.

Install dependencies with `npm ci`.
Follow the README's Supabase configuration if testing live sign-in.

Before proposing a change run
```sh
npm run check
npm run test
npm run build
```

Keep secrets and generated web/native build output out of commits.

Use GitHub issues for reproducible bugs - include node/npm versions, platform/OS,
provider, the failed step, and logs (sanitized, redact any secrets).
