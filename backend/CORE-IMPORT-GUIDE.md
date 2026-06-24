# Core workflow — import & setup

File: **cafeteria-core.json** — a clean, importable n8n workflow containing the core:
`Webhook → Route by action → verify · register-person · gate-verify · gate-punch` (+ fallback).
Built and field-checked against the live base **apprpYxg7leO7JXKJ** on 22 Jun 2026.

## 1. Import
1. In n8n: top-right **⋯ → Import from File** → choose `cafeteria-core.json`.
2. It drops in as a new workflow named *"Cafeteria POS — Nutech RFID (CORE rebuild)"*, inactive.

## 2. Set the Airtable credential (the one manual step)
Every HTTP node was created with a placeholder credential id. After import:
1. Open any HTTP Request node (e.g. **Find account (verify)**).
2. Under **Credential for Airtable Token API**, pick your existing **Airtable Token** credential
   (the same Personal Access Token you've used before).
3. n8n applies it — but confirm each HTTP node shows the credential (there are 9). If any shows
   "select credential", set it. (Tip: set one, then for the rest just choose the same from the dropdown.)

> If you don't have the token credential yet: Credentials → New → **Airtable Token API** →
> paste a PAT with `data.records:read`, `data.records:write`, `schema.bases:read` on this base.

## 3. Activate & test
1. Toggle the workflow **Active** (top-right).
2. Test each branch (production URL once active, or `/webhook-test/` + "Listen for test event"):

```bash
# verify (needs an ACCOUNT row with that RFID)
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" -d '{"action":"verify","rfid":"577F4B06"}'

# register-person (creates PARENT + ACCOUNT)
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" \
 -d '{"action":"register-person","ownerType":"Parent","ownerName":"Juan dela Cruz","roleId":"PAR-01","contact":"0912","email":"x@y.com","address":"Lipa","rfid":"577F4B06","face":"[]","initialBalance":600}'

# gate-verify
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" -d '{"action":"gate-verify","rfid":"577F4B06"}'

# gate-punch (time in)
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" \
 -d '{"action":"gate-punch","accountId":"ACC-XXXX","field":"timeIn","direction":"In","status":"Present","time":"07:42","ownerName":"Juan dela Cruz","ownerType":"Parent","device":"GATE-01"}'
```

A good order: **register-person first** (creates an account + card), then **verify** and
**gate-verify** with that same RFID, then **gate-punch** with the returned accountId.

## What's inside (verified field maps)
- **verify**: Find account (verify) GET ▸ Combine verify Code ▸ Respond.
- **register-person**: Build register Code ▸ Create role row POST (`/{{table}}`) ▸ Create account POST (`/ACCOUNT`) ▸ Shape register Code ▸ Respond. Writes Owner Type / Status / Sex / P_Role with `typecast:true`.
- **gate-verify**: Find account (gate) GET ▸ Find DTR today GET ▸ Build gate verify Code ▸ Respond.
- **gate-punch**: Find DTR (punch) GET ▸ Build punch Code ▸ DTR exists? IF → Update DTR / Create DTR → Create ATTENDANCE POST ▸ Respond.
- **Fallback output** → Respond fallback returns `{ok:false, reason:"unrouted action", got:<action>}` so nothing hangs silently.

## Notes verified against the live base
- ACCOUNT has **no FINGERPRINT_ID** — not referenced anywhere.
- `MENU.Category` is a **single-select** (not used in core, relevant when we add purchase).
- All field names match the live schema exactly (Account ID with a space in DTR, Contact No. with a period, etc.).
- Reads use the raw Airtable shape `…json.records[0].fields`.

## Next (when you're ready to expand)
Say "add the rest" and I'll extend this same workflow with: `topup, purchase, enroll, menu,
account-info, reassign, credit-request, credit-requests, credit-approve, admin-overview,
client-data, salary` — same import method, no rework of the core.
