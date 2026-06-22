# N8N-CLICKS.md — build all 6 branches, click by click

Pair this with **N8N-BRANCHES.md** (which has the exact URLs / formulas / Code to paste).
This file is the *motion*: where to click, what to copy, what to wire. Nothing in your existing
workflow is modified — every branch below is **added** off the `Route by action` node.

## The motion you repeat for every branch
1. **Add the Route output:** double-click `Route by action` → Add Routing Rule →
   `{{ $json.body.action }}` **is equal to** `<action>` → turn on Rename Output → type `<action>`.
2. **Copy an existing node of the right verb** (don't build from scratch):
   - need a **GET/read** → copy `Find account (verify)`
   - need a **POST/create** → copy `Log purchase`
   - need a **PATCH/update** → copy `Deduct balance`
   - need a **Code** → copy `Validate purchase`
   - need a **Respond** → copy `Respond verify`
   - need an **IF** → copy `Purchase OK?`
3. **Paste, rename, wire** (drag from the previous node's right dot to the new node's left dot).
4. **Open it and change only** the URL / filter / body (from N8N-BRANCHES.md).
5. After the last node, wire a **Respond**.

Tip: copy/paste keeps the Airtable credential, so auth is never wrong. You're only ever changing
the URL and the JSON/filter text.

Reusable settings on every HTTP node:
- **Read (GET):** Send Query ON → params `filterByFormula` (+ `maxRecords`=1).
- **Create (POST)/Update (PATCH):** Send Body ON → JSON → paste the body expression.

═══════════════════════════════════════════════════════════════
## BRANCH 1 — `gate-verify`  (build this first, 4 nodes)
═══════════════════════════════════════════════════════════════
Route output: `gate-verify`

| # | Node (copy from) | Rename to | Change |
|---|---|---|---|
| 1 | `Find account (verify)` (GET) | **Find account (gate)** | filter → `{RFID UID}` = `body.rfid` |
| 2 | `Find account (verify)` (GET) | **Find DTR today** | URL → `…/DTR`; filter → today (see doc §2) |
| 3 | `Validate purchase` (Code) | **Build verify** | paste Build verify JS |
| 4 | `Respond verify` (Respond) | **Respond gate-verify** | body → `={{ JSON.stringify($json) }}` |

Wire: `gate-verify ▸ Find account (gate) ▸ Find DTR today ▸ Build verify ▸ Respond gate-verify`.
**Test:** Execute workflow, then
`curl -X POST <webhook>/cafeteria -H "Content-Type: application/json" -d '{"action":"gate-verify","rfid":"0A1B2C3D"}'`
→ should return Maria Santos. ✅ once this works, the rest is the same motion.

═══════════════════════════════════════════════════════════════
## BRANCH 2 — `gate-punch`  (7 nodes, has one IF + a merge)
═══════════════════════════════════════════════════════════════
Route output: `gate-punch`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Find account (verify)` (GET) | **Find DTR (punch)** | URL `…/DTR`; filter today by `body.accountId` |
| 2 | `Validate purchase` (Code) | **Build punch** | paste Build punch JS |
| 3 | `Purchase OK?` (IF) | **DTR exists?** | condition `={{ $json.create }}` is **false** |
| 4 | `Deduct balance` (PATCH) | **Update DTR** | URL `=…/DTR/{{ $('Build punch').item.json.existingId }}` |
| 5 | `Log purchase` (POST) | **Create DTR** | URL `…/DTR`; body from doc |
| 6 | `Log purchase` (POST) | **Create ATTENDANCE** | URL `…/ATTENDANCE`; body from doc |
| 7 | `Respond verify` (Respond) | **Respond gate-punch** | body `={{ JSON.stringify({ok:true}) }}` |

Wiring (note the **merge** — both IF outputs go into the same node 6):
```
gate-punch ▸ Find DTR (punch) ▸ Build punch ▸ DTR exists?
   ├─ true  ▸ Update DTR  ─┐
   └─ false ▸ Create DTR  ─┴▸ Create ATTENDANCE ▸ Respond gate-punch
```
(You can drop a `Log activity` POST between ATTENDANCE and Respond if you want the audit row.)
**Test:** `{"action":"gate-punch","accountId":"ACC-TEST-MARIA","field":"timeIn","direction":"In","status":"Present","time":"07:42","ownerName":"Maria Santos","ownerType":"Student","device":"GATE-01"}`
→ a DTR row appears with Time In 07:42.

═══════════════════════════════════════════════════════════════
## BRANCH 3 — `register-person`  (5 nodes, all in a line)
═══════════════════════════════════════════════════════════════
Route output: `register-person`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Validate purchase` (Code) | **Build register** | paste Build register JS |
| 2 | `Log purchase` (POST) | **Create role row** | URL `=…/{{ $json.table }}`; body `$json.roleFields` |
| 3 | `Log purchase` (POST) | **Create account** | URL `…/ACCOUNT`; body `accountFields` |
| 4 | `Log purchase` (POST) | **Log activity** | URL `…/ACTIVITY_LOG`; Action `Register` |
| 5 | `Respond verify` (Respond) | **Respond register-person** | body from doc |

Wire straight through: `register-person ▸ Build register ▸ Create role row ▸ Create account ▸ Log activity ▸ Respond register-person`.
**Test:** register a Student via the portal (or curl the payload) → one ACCOUNT row **and** one STUDENT row appear with the same ID.

═══════════════════════════════════════════════════════════════
## BRANCH 4 — `credit-request`  (4 nodes)
═══════════════════════════════════════════════════════════════
Route output: `credit-request`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Log purchase` (POST) | **Create credit row** | URL `…/CREDIT_REQUESTS`; body from doc |
| 2 | `Validate purchase` (Code) | **Strip prefix** | paste base64 strip JS |
| 3 | `Log purchase` (POST) | **Attach proof** | URL = `content.airtable.com/.../{{recId}}/Proof/uploadAttachment` |
| 4 | `Respond verify` (Respond) | **Respond credit-request** | body `{ ok:true, entry }` |

Wire: `credit-request ▸ Create credit row ▸ Strip prefix ▸ Attach proof ▸ Respond credit-request`.
> Node 3 is the only node whose URL host is `content.airtable.com`, not `api.airtable.com`.

═══════════════════════════════════════════════════════════════
## BRANCH 5 — `credit-requests`  (3 nodes)
═══════════════════════════════════════════════════════════════
Route output: `credit-requests`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Find account (verify)` (GET) | **List credit rows** | URL `…/CREDIT_REQUESTS`; filter `{Status}` = body.status (no maxRecords) |
| 2 | `Validate purchase` (Code) | **Map** | paste Map JS |
| 3 | `Respond verify` (Respond) | **Respond credit-requests** | body `={{ JSON.stringify($json) }}` |

Wire: `credit-requests ▸ List credit rows ▸ Map ▸ Respond credit-requests`.

═══════════════════════════════════════════════════════════════
## BRANCH 6 — `credit-approve`  (6 nodes, one IF)
═══════════════════════════════════════════════════════════════
Route output: `credit-approve`

| # | Copy from | Rename to | Change |
|---|---|---|---|
| 1 | `Deduct balance` (PATCH) | **Update credit row** | URL `=…/CREDIT_REQUESTS/{{ body.entry }}`; set Status/Decided By |
| 2 | `Purchase OK?` (IF) | **Approved?** | `={{ body.decision }}` equals `Approved` |
| 3 | `Find account (verify)` (GET) | **Find account (credit)** | filter `{AccountID}` = body.targetId |
| 4 | `Deduct balance` (PATCH) | **Add balance** | Balance + body.amount |
| 5 | `Log purchase` (POST) | **Log topup** | URL `…/TRANSACTIONS`; Type `Top-up` |
| 6 | `Respond verify` (Respond) | **Respond credit-approve** | body `{ ok:true }` |

Wiring:
```
credit-approve ▸ Update credit row ▸ Approved?
   ├─ true  ▸ Find account (credit) ▸ Add balance ▸ Log topup ▸ Respond credit-approve
   └─ false ▸ ────────────────────────────────────────────────▸ Respond credit-approve
```
(both IF outputs end at the same Respond node.)

═══════════════════════════════════════════════════════════════
## BRANCH 7–9 — portal reads: `admin-overview`, `client-data`, `salary`
═══════════════════════════════════════════════════════════════
Same motion — a chain of **GET** nodes feeding one **Code** then **Respond**. No IF, no writes.

**admin-overview** (6 nodes): 4 GETs in a row → Build overview (Code) → Respond.
`Read ACCOUNT ▸ Read TXN ▸ Read DTR ▸ Read MENU ▸ Build overview ▸ Respond admin-overview`

**client-data** (5 nodes): `Find account ▸ Read TXN ▸ Read DTR ▸ Build bundle ▸ Respond client-data`

**salary** (4 nodes): `Find account ▸ Read TXN (month) ▸ Sum ▸ Respond salary`

(All Code/filters are in N8N-BRANCHES.md §5.)

═══════════════════════════════════════════════════════════════
## Suggested order + final checks
═══════════════════════════════════════════════════════════════
1. `gate-verify`  → curl test returns Maria
2. `gate-punch`   → DTR row appears
3. `register-person` → ACCOUNT + role row
4. `credit-request` → `credit-requests` → `credit-approve`
5. `admin-overview` → `client-data` → `salary`  (portal dashboards light up)

Before testing live:
- Workflow is **Active**; only one workflow owns `/cafeteria`.
- Every Airtable node shows the **airtableTokenApi** credential.
- `typecast:true` is on creates that write single-selects.
- Then flip apps off demo: portal `DEMO_MODE:false`, gate ⚙ uncheck demo.

When a branch misbehaves, open it, click the node, **Execute node**, and read the red error — it's
almost always a field-name typo or a missing `={{ }}` around an expression. Paste it to me and I'll
spot it.
