# center-ops

Staff-management app for Learn N' Play. React + TypeScript + Vite frontend, Supabase (Postgres, Auth, Edge Functions) backend, Tailwind CSS.

## Conventions

- **Linter is `oxlint`** (`npm run lint`), not ESLint. `.oxlintrc.json` only enables `react/rules-of-hooks` (error) and `react/only-export-components` (warn) — no `exhaustive-deps` rule, so missing-effect-dependency warnings are tolerated throughout the codebase; don't refactor working code just to silence one.
- TypeScript strict mode has `noUnusedLocals`/`noUnusedParameters` enabled in both `tsconfig.app.json` and `tsconfig.node.json`. Run `npx tsc --noEmit -p tsconfig.app.json` after edits.
- **`profiles.role`** (`super_admin | admin | teacher | staff | parent | shareholder`) is for auth/permission gating ONLY (RLS policies, `RequireRole`, inline `profile.role === '...'` checks). **`profiles.title`** drives all user-facing display labels, falling back to `'Staff'` when null/empty. Never conflate the two, never use `role` as a display label.
- `RequireRole` (`src/components/RequireRole.tsx`) is a client-side UX convenience only — real access enforcement is Supabase Row Level Security policies.
- Self-lockout prevention pattern: any admin UI that lets a super_admin edit other users' role/active status must hide/disable that control for the current user's own row.

## Supabase

- Live/authoritative project ref: **`nrioqwrhqczwomwgzmgp`** — matches `VITE_SUPABASE_URL` in `.env.local`. The Supabase CLI has been observed defaulting to a different, unrelated project (`pcsibltsngocrahcpelm`) in this environment — **always verify the CLI's linked project before running `supabase functions deploy`**, don't assume it matches the frontend target.
- Edge functions use a two-tier client pattern: an anon-key client scoped to the caller's JWT for identity/RLS-respecting reads, and a service-role client for privileged writes (see `admin-reset-password`, `admin-create-staff`).

## Working agreement

- Default to **not** committing, pushing, or deploying anything in this repo unless the specific task explicitly asks for it — this has been the standing expectation across essentially every task so far, even for complete, verified features.
- Temp passwords / secrets: never `console.log` them; surface only in UI with an explicit copy action.
