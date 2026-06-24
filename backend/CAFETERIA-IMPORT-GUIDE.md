# cafeteria-core-plus.json — CORE + Cafeteria

Extends the proven core with the cafeteria branches. The four core branches
(verify, register-person, gate-verify, gate-punch) are **byte-for-byte identical** to the
core you already tested — verified by diff. Field maps checked against the live base.

**Now contains (9 actions + fallback):**
- Core: `verify` · `register-person` · `gate-verify` · `gate-punch`
- Cafeteria: `menu` · `account-info` · `topup` · `purchase` · `enroll`

53 nodes. Path `/cafeteria`.

## Import (replacing the core)
Because only ONE workflow can own `/cafeteria`:
1. **Deactivate** the current core workflow (keep it as backup — don't delete yet).
2. Import `cafeteria-core-plus.json` (⋯ → Import from File).
3. Assign your **Airtable Token** credential to the HTTP nodes (now 22 of them — set one, pick the same on the rest).
4. Toggle **Active**.

## Test the new cafeteria branches
```bash
# menu — returns items with name/price/category/available/stock
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" -d '{"action":"menu"}'

# account-info (by accountId or rfid)
curl -X POST .../cafeteria -d '{"action":"account-info","rfid":"577F4B06"}'

# topup — add ₱100 (needs an existing ACCOUNT)
curl -X POST .../cafeteria -d '{"action":"topup","accountId":"ACC-XXXX","amount":100,"by":"POS"}'

# purchase — buy from wallet (decrements balance, logs txn + line items + stock)
curl -X POST .../cafeteria -d '{"action":"purchase","accountId":"ACC-XXXX","items":[{"name":"Lugaw","price":30,"qty":1,"category":"Meals"}],"total":30,"payMode":"wallet","by":"POS"}'

# enroll — link a blank card to an account
curl -X POST .../cafeteria -d '{"action":"enroll","accountId":"ACC-XXXX","rfid":"0A1B2C3D"}'
```

## Verified-schema notes baked into the build
- **MENU.Category** = single-select → `menu` reads `.Category.name`; `Create SALE_ITEMS` writes Category with `typecast:true`.
- **MENU.Available** = checkbox → `menu` returns `available: r.fields.Available === true`.
- **Formula fields never written:** Stock Status, Sale Date, Line Total (auto-computed).
- **TRANSACTIONS.Created** is dateTime; we let Airtable default it (we don't set it), so Sale Date computes correctly. (If you want an explicit Created, add `"Created": $now.toISO()` to the Log nodes.)
- `purchase` decrements stock for the **first cart line** via Find MENU item → Compute new stock → Update MENU stock. (Multi-line stock for every item is a later enhancement; balance + txn + SALE_ITEMS already cover all lines.)

## Core integrity
Diff confirmed: all 19 core-branch nodes identical in params, type, and connections; the
Switch's first four outputs and their wires are unchanged. The cafeteria actions were appended
as outputs 5–9, fallback moved to output 10.

## Next
Say "add the rest" for `reassign` + the portal branches (`credit-request`, `credit-requests`,
`credit-approve`, `admin-overview`, `client-data`, `salary`) — same append-only method.
