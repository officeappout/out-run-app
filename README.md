# OUT (OUTRUN) — app + admin panel

OUT is a fitness app for Israeli municipalities: calisthenics parks, routes, workouts and XP progression.
This repository holds both:

- **The admin panel** (Next.js 14 App Router, TypeScript, Tailwind) — CRM for authorities, content and exercise
  management, feature flags, Google Drive/Gmail integration. API routes live under `src/app/api/`.
- **The mobile app** — the same Next.js web app wrapped with Capacitor for iOS and Android (`ios/`, `android/`,
  `capacitor.config.ts`, local plugin in `plugins/health-bridge/`).

Backend: Firebase (Auth, Firestore, Storage, Cloud Functions in `functions/`), served on Vercel.

## Deploy

- **Web (panel + app web content):** Vercel deploys automatically on merge to `main` only (`vercel.json`).
  Work goes through a branch + PR; nothing is pushed straight to `main`.
- **Native config / plugins:** `npx cap sync` (see the `cap:*` / `ship:*` scripts in `package.json`).
  `cap sync` does not ship web content.
- **Firestore rules / indexes:** deployed by the owner from `main`, after merge — never from a feature branch.
  See `CLAUDE.md` (Git / Deploy Rules).
- **CI:** `.github/workflows/ci.yml` (type-check baseline, lint, tests).

## Where things are documented

| What | Where |
|---|---|
| Rules for agents and contributors | `CLAUDE.md`, `.claude/rules/axioms.md` |
| Code structure rules | `docs/architecture/STANDARDS.md` |
| Docs index | `docs/README.md` |
| Security + Firestore rules | `SECURITY.md` |
| Environment variables | `.env.example` (never commit `.env.local` or key files) |
