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
- Schema is a single squashed baseline: `supabase/migrations/20260101000000_remote_baseline.sql`. Old migrations live in `supabase/migrations_archive/` (not applied). Write new schema changes as new migrations on top of the baseline, don't edit it in place.
- Docker is installed on TUF — validate schema changes locally with `supabase db reset` before pushing to remote.

## Payroll & staff data

- Payroll is outsourced to "Payroll Panda Sdn Bhd" — individual salaries are NOT in `zoho_bank_transactions` by name. Payee prefix `BPO - <name>` = part-timer; `Claims - <name>` = employed staff. In that table, `customer_payment`/debit rows are incoming parent fees (student names), not outgoing payroll.
- Active teaching staff: Loo Min Hui, Lydia, Pang Kai Xuan, Saranjit Kaur A/P Jeswant Singh (+ Pravena, tentative). Lim Pei Tien and Tam You Sheng are shareholders, not staff.
- `staff_members.display_name` is the admin-editable short label used for roster chips.

## Working agreement

- Default to **not** committing, pushing, or deploying anything in this repo unless the specific task explicitly asks for it — this has been the standing expectation across essentially every task so far, even for complete, verified features.
- Temp passwords / secrets: never `console.log` them; surface only in UI with an explicit copy action.

## Standing operational rules (session 6 — learned the hard way)

### 不要让 David 重复手动步骤
- 会重复的流程（mint token / 触发 sync / 查 log / 设 secret），**第一次就写成脚本**。可复用命令放 `ops/`（见 ops/RUNBOOK.md），可复用 SQL 放 runbook。引用它们——绝不叫 David 重贴 ID/secret/token/project-ref 或同一条 query。
- **绝不发含 `<...>` 尖括号的命令**——bash 把 `<` 当重定向，会报 "syntax error near unexpected token newline"。用读 env 的脚本，或清楚标注的填空。
- 宁可一条脚本，也不要多步 paste。

### Zoho sync — 硬事实（别再重新发现；细节见 ops/RUNBOOK.md）
- Function 用**全球 DC**：accounts.zoho.com + www.zohoapis.com/books/v3。Self Client 必须建在 api-console.zoho.com（.com），不是 .eu/.in。
- OAuth code→token **必须带 `redirect_uri=https://www.zoho.com`**；缺了 = "token exchange returned no access_token"。code 单次使用、几分钟过期。
- CLIENT_ID/SECRET 和 REFRESH_TOKEN 必须来自**同一个 Self Client**；不确定就三个一起重生成。
- Scope = `ZohoBooks.fullaccess.all`（function 代码只读，安全）。
- 无人值守 auth = `Bearer <ZOHO_SYNC_TOKEN>`；同一值要同时在 Edge secret 和 Vault('zoho_sync_token')。不一致 → 落到 user 路径 → 401 "Invalid or expired session"。
- `zoho_sync_log` 时间列是 `ran_at`（不是 created_at）。
- pg_net 默认 5 秒超时 → net._http_response 可能显示 null，但 function 会跑完；看 `zoho_sync_log` 为准。
- Mint：`ops/zoho-mint.sh <CODE>`；触发：`ops/sync-now.sh`。

### Invoices
- 两张表：本地 `invoices`（app 草稿）vs `zoho_invoices`（Zoho 镜像，真实数据）。/invoices 和学生页都读 `zoho_invoices`。
- Cron：zoho-sync-daily-0000 (0 16 UTC)、-daily-1200 (0 4 UTC)、-weekly-full (30 16 * * 6)。UTC，MYT=UTC+8。
