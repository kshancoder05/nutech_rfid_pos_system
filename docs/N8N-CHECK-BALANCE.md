# N8N-CHECK-BALANCE.md — the simplest branch + how Airtable is wired

## What "check balance" is
Reading a person's wallet. In your workflow this is the **`account-info`** action —
it already exists. You do NOT need to build a new "check-balance" branch; the apps
call `account-info` and read `.account.balance` from the answer.

If you want a friendly alias named `check-balance`, it's a 3-node copy (below).

## How the Airtable connection works (every node, same way)
Your workflow does NOT use n8n's built-in "Airtable" node. It uses plain **HTTP Request**
nodes pointed at Airtable's REST API. Three things make the connection:

1. **URL** — `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/<TABLE>`
   Your base id is **apprpYxg7leO7JXKJ**. Table is the table's name or id, e.g. `/ACCOUNT`.
2. **Auth** — every node uses *Predefined Credential Type* → *Airtable Token API*
   (the credential you already set once). Copy/paste a node and the auth comes with it.
3. **Read vs write**:
   - **Read (GET):** turn on *Send Query*, add param `filterByFormula`, value:
     `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`  (+ `maxRecords`=1)
   - **Write (PATCH/POST):** turn on *Send Body* → JSON → the body expression.

That's the entire Airtable connection. Nothing else to configure.

Verified live just now: base apprpYxg7leO7JXKJ → ACCOUNT table holds the 3 test
accounts (Maria / R. dela Cruz / Troy). The token + base path are correct.

## Build `check-balance` (optional alias — 3 nodes)
Route output: `check-balance`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Find account (verify)` (GET) | **Find account (balance)** | filter `{AccountID}` = `body.accountId` (or `{RFID UID}` = `body.rfid`) |
| 2 | `Validate purchase` (Code) | **Shape balance** | paste JS below |
| 3 | `Respond verify` (Respond) | **Respond balance** | body `={{ JSON.stringify($json) }}` |

Wire: `check-balance ▸ Find account (balance) ▸ Shape balance ▸ Respond balance`.

**Shape balance** Code:
```javascript
const r = $('Find account (balance)').first();
if(!r || !r.json || !r.json.fields){
  return [{ json: { ok:false, reason:"Account not found" } }];
}
const f = r.json.fields;
return [{ json: {
  ok: true,
  accountId: f.AccountID,
  ownerName: f["Owner Name"],
  ownerType: f["Owner Type"],
  status:    f.Status,
  balance:   f.Balance || 0
}}];
```

**Test:**
```bash
curl -X POST https://bernard100.app.n8n.cloud/webhook-test/cafeteria \
  -H "Content-Type: application/json" \
  -d '{"action":"check-balance","rfid":"0A1B2C3D"}'
# → { ok:true, ownerName:"Maria Santos", balance:320, status:"Active" }
```

## Already-built actions the apps use for balance (no work needed)
- **account-info** {accountId | rfid} → `{ ok, account:{ ownerName, balance, status, ... } }`
- **verify** (POS tap) → returns balance alongside identity
- **gate-verify** (gate tap) → returns identity + today's punches (balance optional)

So "check balance" is effectively done through `account-info`. Build the `check-balance`
alias only if you want the word to appear as its own action.
