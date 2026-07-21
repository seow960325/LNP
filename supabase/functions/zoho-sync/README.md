# zoho-sync

Read-only, one-way Zoho Books → Supabase mirror sync. The only Edge Function
that talks to Zoho and the only writer to the `zoho_*` mirror tables.

## Secrets (set via `supabase secrets set`, never committed)

| Secret | Where it comes from |
|---|---|
| `ZOHO_CLIENT_ID` | Zoho API console, Self Client |
| `ZOHO_CLIENT_SECRET` | Zoho API console, Self Client |
| `ZOHO_REFRESH_TOKEN` | Generated from the Self Client, READ-only scopes (see Phase 1 step-3 spec) |
| `ZOHO_ORG_ID` | `831281195` |
| `ZOHO_SYNC_TOKEN` | **Generate yourself** — any long random string (e.g. `openssl rand -hex 32`), unrelated to any Supabase key. This is the sole credential pg_cron presents to prove it's the trusted scheduler; the function no longer accepts the service-role key for this purpose. |
| `SUPABASE_URL` | Project settings |
| `SUPABASE_ANON_KEY` | Project settings — used to identify the "Sync now" caller via their own JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Project settings — sole writer to `zoho_*` tables. No longer compared against the incoming request; only used to build the admin client. |

```
supabase secrets set ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_REFRESH_TOKEN=... ZOHO_ORG_ID=831281195 ZOHO_SYNC_TOKEN=$(openssl rand -hex 32)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
for deployed Edge Functions — no need to set them by hand.

## Deploy

```
supabase functions deploy zoho-sync
```

Verify the CLI's linked project first (see project CLAUDE.md — the CLI has been observed
defaulting to an unrelated project in this environment).

`supabase/config.toml` sets `[functions.zoho-sync] verify_jwt = false`, so this persists across
deploys without needing `--no-verify-jwt` on every `deploy` call. This is required because
zoho-sync does its own auth inside the handler — `ZOHO_SYNC_TOKEN` for the pg_cron system
caller, session JWT + `is_admin_or_super()`/`is_shareholder()` for "Sync now" — and neither of
those is a Supabase-issued JWT that the platform's gateway-level pre-check would accept. With
the default `verify_jwt = true`, the gateway would reject the `ZOHO_SYNC_TOKEN` bearer before
it ever reached this code, since a random hex string isn't a valid signed JWT.

## Invocation

- **"Sync now"** (from the app): a normal authenticated `POST` with the user's session
  `Authorization: Bearer <user JWT>`. The function resolves the caller's role via the same
  `is_admin_or_super()`/`is_shareholder()` DB functions RLS uses (not a re-implemented copy),
  and rejects if the last logged sync ran less than 60s ago. Always incremental — this path
  cannot request `?mode=full`.
- **Nightly** (incremental): `pg_cron` + `pg_net`, calling the function with
  **`Authorization: Bearer <ZOHO_SYNC_TOKEN>`**. The function compares the bearer token to
  `ZOHO_SYNC_TOKEN` (Bearer-stripped, trimmed, constant-time) and, on an exact match, treats
  the caller as trusted and skips the role/rate checks. It no longer accepts the service-role
  key for this — `ZOHO_SYNC_TOKEN` is a separate, dedicated secret.
- **Weekly** (full reconcile): same trusted-caller auth, called with `?mode=full`. Ignores the
  incremental watermark, pulls every page for every endpoint, and deletes any mirror row whose
  Zoho id didn't come back — catches records hard-deleted on the Zoho side, which an
  upsert-only incremental sync can never see. `?mode=full` is rejected with 403 for any caller
  that isn't the trusted `ZOHO_SYNC_TOKEN` bearer.

### Scheduling nightly (incremental) + weekly (full reconcile)

Run in the Supabase SQL editor (privileged — David runs this, not the function):

```sql
-- one-time: enable the extensions if not already on
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- store ZOHO_SYNC_TOKEN in Vault rather than pasting it into the cron job body.
-- Use the SAME value you set via `supabase secrets set ZOHO_SYNC_TOKEN=...` above.
select vault.create_secret('<ZOHO_SYNC_TOKEN value>', 'zoho_sync_token');

select cron.schedule(
  'zoho-sync-nightly',
  '0 20 * * *',  -- 20:00 UTC = 04:00 MYT; adjust to taste
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/zoho-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zoho_sync_token'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'zoho-sync-weekly-full',
  '30 20 * * 0',  -- Sundays 20:30 UTC = 04:30 MYT Monday; after the nightly incremental run
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/zoho-sync?mode=full',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zoho_sync_token'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

To inspect/remove: `select * from cron.job;` / `select cron.unschedule('zoho-sync-nightly');` /
`select cron.unschedule('zoho-sync-weekly-full');`

## Response shape

```json
{ "ok": true, "ran_at": "2026-07-21T20:00:00.000Z", "records": 42, "api_calls": 7 }
```

Never returns tokens, PII, or raw Zoho payloads — the frontend only ever needs this small
status object for the "Last synced" label.

## Confirmed field mappings (verified against live Zoho payloads)

- `chartofaccounts` / `bankaccounts` balance -> `current_balance` (confirmed: chart of accounts
  only ever has `current_balance`; on bankaccounts, `balance`/`current_balance`/`bcy_balance`
  are all equal, so `current_balance` was picked for consistency with chartofaccounts).
- `expenses` amount -> `bcy_total` (base-currency total), never `total`, no fallback.
- `last_modified_time` filter -> "modified at/after" semantics, sent as
  `YYYY-MM-DDThh:mm:ss+0800` (Asia/Kuala_Lumpur, fixed UTC+8). The `+` is percent-encoded to
  `%2B` by `URLSearchParams`' serializer automatically (verified against Node/Deno's `URL`
  implementation) — Zoho would otherwise read a bare `+` as a space and silently ignore the
  filter.

Still worth one sanity check after backfill: compare `zoho_bank_accounts.current_balance` sum
against the ≈136,559 cash target, and Revenue/Net against ≈621,466 / ≈208,655.
