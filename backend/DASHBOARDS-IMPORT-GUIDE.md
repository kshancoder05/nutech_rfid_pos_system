# cafeteria-core-dash.json — CORE + Cafeteria + Dashboards

Adds the three portal dashboard read-branches. Everything that already worked is
**byte-for-byte unchanged** — verified: the first 9 Switch rules and their wires are preserved,
and every non-switch prior node is identical. Only the Switch gained 3 new rules (and the
fallback output moved to slot 12).

**Now contains (12 actions + fallback):**
- Core: `verify` · `register-person` · `gate-verify` · `gate-punch`
- Cafeteria: `menu` · `account-info` · `topup` · `purchase` · `enroll`
- Dashboards: `admin-overview` · `client-data` · `salary`

69 nodes. Path `/cafeteria`.

## Import (replacing the previous)
1. **Deactivate** the current workflow (keep as backup).
2. Import `cafeteria-core-dash.json`.
3. Assign your **Airtable Token** credential to the HTTP nodes (now 31).
4. Toggle **Active**.

## Test the new branches
```bash
# admin-overview — dashboard totals (reads ACCOUNT/TRANSACTIONS/DTR/MENU)
curl -X POST .../cafeteria -d '{"action":"admin-overview"}'

# client-data — one account's profile + history
curl -X POST .../cafeteria -d '{"action":"client-data","role":"Student","id":"ACC-XXXX"}'

# salary — personnel monthly cafeteria spend
curl -X POST .../cafeteria -d '{"action":"salary","id":"ACC-XXXX"}'
```

## Verified-schema handling baked in
- Raw Airtable GET returns single-selects as **objects** `{name:"..."}` — the Build/Sum Code
  nodes use a `sel()` helper to read `.name` for Owner Type, Status, Type, Category. So
  dashboard text shows the option name, not `[object Object]`.
- `salesToday` / `txns` use the **Sale Date** formula (already YYYY-MM-DD, Asia/Manila).
- `present` counts DTR rows where `Date` = today.
- All reads are GET-all (Send Query OFF) for the overview; client/salary use filterByFormula.
- These are **read-only** — they never write, so they can't harm data.

## Notes
- Airtable returns max 100 rows/page. For the POC the overview reads are fine; if a table grows
  past 100 rows we'll add pagination.
- `admin-overview` returns `{ ok, kpis, salesByDay, recentTxns, attendance, inventory }` — the
  exact shape `portal.html` expects for the Admin dashboard.
- `client-data` falls back gracefully in the app to `account-info` if needed; here it returns the
  full bundle directly.

## Next
Say "add the rest" for `reassign` + the credit branches (`credit-request`, `credit-requests`,
`credit-approve`) to complete all 16 actions — same append-only method.
