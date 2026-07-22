# Zoho sync runbook
- Function uses GLOBAL DC: accounts.zoho.com + zohoapis.com/books/v3. Self Client MUST be api-console.zoho.com (.com).
- OAuth exchange REQUIRES redirect_uri=https://www.zoho.com; codes single-use, expire in minutes.
- CLIENT_ID/SECRET + REFRESH_TOKEN must be from the SAME Self Client.
- zoho_sync_log timestamp column = ran_at (not created_at).
- Trusted auth = Bearer <ZOHO_SYNC_TOKEN>; same value in Edge secret AND Vault('zoho_sync_token').
- Cron (UTC; MYT=UTC+8): daily 0 16, 0 4; weekly full 30 16 * * 6.
## Mint token (scope ZohoBooks.fullaccess.all)
1. api-console.zoho.com > Self Client > Generate Code > scope ZohoBooks.fullaccess.all > Create > copy CODE
2. ops/zoho-mint.sh <CODE>
3. ops/sync-now.sh
Check: select ran_at,endpoint,ok,note from public.zoho_sync_log order by ran_at desc limit 15;
