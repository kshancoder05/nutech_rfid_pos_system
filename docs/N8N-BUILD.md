# N8N-BUILD.md — completing the workflow for the full system

Your live workflow (**"Cafeteria POS — Nutech RFID System"**) already handles the POS. This guide
adds everything else, using the **exact same node pattern** you already have, against base
`apprpYxg7leO7JXKJ`.

- **Existing Route-by-action outputs:** `verify, purchase, topup, enroll, menu, bio-enroll,
  bio-template, account-info, reassign, register, attendance`
- **To add:** `register-person`, `gate-verify`, `gate-punch`, `credit-request`, `credit-requests`,
  `credit-approve`, `admin-overview`, `client-data`, `salary`
- **To extend:** `purchase` (add report write-hooks)
- **Plus:** one separate nightly "mark Absent" workflow, and one new table (`CREDIT_REQUESTS`).

---

## Where each change attaches (your real nodes)

**You only modify two existing things:** the **Route by action** Switch (add outputs) and the
**purchase** branch (append report hooks at `Log purchase`). Everything else is new nodes on new
Switch outputs — you don't touch existing branch logic.

### The ONE existing branch you modify — purchase write-hooks
*("Split cart", "Create SALE_ITEMS", etc. below are all **new** nodes you add — only `Log purchase` already exists.)*
Today the chain is:
`Find account (purchase) → Validate purchase → Purchase OK? → Deduct balance → Log purchase → Respond purchase`

Add a **second** wire **out of `Log purchase`** (it keeps its existing wire to `Respond purchase`,
so the cashier still gets an instant reply). The new branch:
`Log purchase → Split cart (NEW Code node) → Create SALE_ITEMS → Find MENU item → Compute new stock → Update MENU stock → Log activity (Sale)`
You change **nothing inside** the existing nodes — you only drag one new connection off `Log purchase`.

### New Switch outputs — add to the "Route by action" node
Open **Route by action**, and for each action below add a rule exactly like the existing ones
(`{{ $json.body.action }}` **equals** the string). Each new output begins a fresh chain:

| Add Switch output | Chain that hangs off it |
|---|---|
| `register-person` | Build register (Code) → Create role row → Create account → Log activity → **Respond** |
| `gate-verify` | Find account (gate) → Find DTR today → Build verify (Code) → **Respond** |
| `gate-punch` | Find DTR today → Build punch (Code) → DTR exists? (IF) → [Update DTR \| Create DTR] → Create ATTENDANCE → Log activity → **Respond** |
| `credit-request` | Create credit row → Attach proof (content API) → **Respond** |
| `credit-requests` | List credit rows → Map (Code) → **Respond** |
| `credit-approve` | Update credit row → Approved? (IF) → [Find account → Add balance → Log topup → Log activity] → **Respond** |
| `admin-overview` | Read ACCOUNT / TRANSACTIONS / DTR / MENU → Build overview (Code) → **Respond** |
| `client-data` | Find account → Read TRANSACTIONS → Read DTR → Build bundle (Code) → **Respond** |
| `salary` | Find account → Read TRANSACTIONS (month) → Sum (Code) → **Respond** |

### Two existing outputs to retire/repurpose (optional)
- **`register`** (old): `Find account (register) → Validate register → Register OK? → Create account`.
  It only made an ACCOUNT. **Leave it alone** if the cashier POS still calls `register`; the portal
  uses the new `register-person`. Delete only if nothing calls `register`.
- **`attendance`** (old single-tap): `Find account (attendance) → Validate attendance → Attendance OK? → Create attendance`.
  Superseded by `gate-verify` + `gate-punch`. **Tip:** reuse its `Create attendance` node as the
  `Create ATTENDANCE` step inside `gate-punch`, then delete the rest of the old branch.

> So: **1 branch modified** (purchase, +1 wire off `Log purchase`), **the Switch modified**
> (+9 outputs), and everything else is net-new nodes. No other existing node changes.

---

## 0) Reusable node recipes

Everything below is built from four recipes that mirror your existing nodes. Set them once in your
head; the actions just repeat them.

**AT-READ** — HTTP Request, `GET`
`https://api.airtable.com/v0/apprpYxg7leO7JXKJ/<TABLE>`
Auth: `predefinedCredentialType` → `airtableTokenApi`. Send Query = ON:
- `filterByFormula` = `={{ "{<FIELD>}='" + $('Webhook').first().json.body.<key> + "'" }}`
- `maxRecords` = `1` (omit to get many)

**AT-CREATE** — HTTP Request, `POST` `.../<TABLE>`, Send Body = JSON:
`={{ JSON.stringify({ fields: { ... }, typecast: true }) }}`
(`typecast:true` lets single-selects like a new Method create themselves.)

**AT-UPDATE** — HTTP Request, `PATCH` `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/<TABLE>/{{ recordId }}`,
Body JSON: `={{ JSON.stringify({ fields: { ... } }) }}`

**RESPOND** — Respond to Webhook, Respond With = JSON,
Body: `={{ JSON.stringify({ ok: true, ... }) }}`

> Field names are case- and space-exact. Watch two gotchas: `PERSONNEL."Email "` has a **trailing
> space**, and `STUDENT."Contact No."` / `PERSONNEL."Contact_No."` differ. Rename them in Airtable
> first if you want clean expressions.

---

## 1) `register-person` — one account + the role row

Add a Switch output `register-person`, then:

**① Code "Build register"** — generate the account + decide the role table:
```js
const b = $('Webhook').first().json.body;
const accountId = "ACC-" + Date.now().toString(36).toUpperCase().slice(-8);
const tableByType = { Student:"STUDENT", Parent:"PARENT", Personnel:"PERSONNEL" };
const fkByType    = { Student:"STUDENT_ID", Parent:"PARENT_ID", Personnel:"PERSONNEL_ID" };
let roleFields;
if (b.ownerType === "Student") roleFields = {
  "StudentID": b.roleId, "StudentName": b.ownerName, "Section": b.section,
  "Contact No.": b.contact, "Email": b.email, "Home Address": b.address,
  "PARENT_ID": b.parentId, "IsEnrolled": b.isEnrolled || "Yes", "Sex": b.sex, "Status": "Active"
};
else if (b.ownerType === "Personnel") roleFields = {
  "Personnel_ID": b.roleId, "Personnel_Name": b.ownerName, "Contact_No.": b.contact,
  "Email ": b.email, "Home_Address": b.address, "P_Role": b.pRole, "Salary": b.salary || 0
};
else roleFields = {
  "ParentID": b.roleId, "ParentName": b.ownerName,
  "Contact Number": b.contact, "Email": b.email, "Home Address": b.address
};
return [{ json: {
  accountId, ownerType: b.ownerType,
  roleTable: tableByType[b.ownerType], roleFields,
  accountFields: {
    "AccountID": accountId, "RFID UID": b.rfid || "", "FINGERPRINT_ID": b.fingerprint || "",
    "FACE_BIO_ID": b.face || "", "Balance": b.initialBalance || 0, "Status": "Active",
    "Owner Name": b.ownerName, "Owner Type": b.ownerType,
    [fkByType[b.ownerType]]: b.roleId
  }
}}];
```
**② AT-CREATE role row** — dynamic table URL
`=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.roleTable }}`
Body: `={{ JSON.stringify({ fields: $json.roleFields, typecast: true }) }}`

**③ AT-CREATE ACCOUNT** — POST `/ACCOUNT`
Body: `={{ JSON.stringify({ fields: $('Build register').item.json.accountFields, typecast: true }) }}`

**④ AT-CREATE ACTIVITY_LOG** (see recipe in §A) — Action `Register`.

**⑤ RESPOND** — `={{ JSON.stringify({ ok:true, accountId: $('Build register').item.json.accountId, roleId: $('Webhook').first().json.body.roleId }) }}`

> This **replaces** the old `register` branch (which only made an ACCOUNT). Point the portal at
> `register-person` (it already sends this payload).

---

## 2) `purchase` — add the report write-hooks

Keep your existing purchase chain. **After "Respond purchase"** (so the cashier isn't slowed),
chain these — nodes after a Respond node still execute:

**① Code "Split cart"** (NEW node — turns the multi-item cart into one n8n item per line, because SALE_ITEMS stores one row per item):
```js
const v = $('Validate purchase').item.json;        // your existing validate node
const items = v.itemsArray || $('Webhook').first().json.body.items || [];
return items.map((it, i) => ({ json: {
  lineRef: v.receiptNo + "-" + (i+1), txnRef: v.receiptNo,
  name: it.name, qty: it.qty, price: it.price,
  cashier: "Cashier", accountId: v.accountId
}}));
```
**② AT-CREATE SALE_ITEMS** (runs once per item):
`fields`: `"Line Ref":{{lineRef}}, "TxnRef":{{txnRef}}, "Item Name":{{name}}, "Qty":{{qty}},
"Unit Price":{{price}}, "Cashier":{{cashier}}, "Account ID":{{accountId}}, "Created":$now.toISO()`

**③ Stock decrement** (per item): AT-READ `MENU` by `{Item Name}` → Code `newStock = (stock||0) - qty`
→ AT-UPDATE `MENU/{{recordId}}` `{ "Stock On Hand": newStock }`.

**④ AT-CREATE ACTIVITY_LOG** — Action `Sale`, `Amount` = total, `Details` = items summary.

---

## 3) Access control — `gate-verify` + `gate-punch`

Two outputs. (You can retire the old single `attendance` output.)

### `gate-verify` {rfid}
**① AT-READ ACCOUNT** by `{RFID UID}` = `body.rfid` (maxRecords 1).
**② AT-READ DTR (today)** — Send Query, no maxRecords:
`filterByFormula` =
`={{ "AND({Account ID}='" + $json.records[0].fields.AccountID + "', DATETIME_FORMAT({Date},'YYYY-MM-DD')='" + $now.toFormat("yyyy-MM-dd") + "')" }}`
**③ Code "Build verify"** → if no account: `{ok:false,reason:"Card not recognized"}`; else:
```js
const a = $('Find account (gate)').item.json.records[0];
const dtr = ($json.records[0]||{}).fields || {};
return [{ json: { ok:true, account: {
  accountId: a.fields.AccountID, ownerName: a.fields["Owner Name"],
  ownerType: a.fields["Owner Type"], status: a.fields.Status,
  face: a.fields.FACE_BIO_ID || "",
  today: { timeIn:dtr["Time In"], breakOut:dtr["Break Out"],
           breakIn:dtr["Break In"], timeOut:dtr["Time Out"] }
}}}];
```
**④ RESPOND** the `$json`. (The browser does the 1:1 face match against `account.face`.)

### `gate-punch` {accountId, field, direction, status, time, ownerName, ownerType, method, device}
**① AT-READ DTR (today)** by Account ID + Date (as above) → get recordId if present.
**② Code "Build punch"** — map the slot + decide create/update:
```js
const b = $('Webhook').first().json.body;
const slot = {timeIn:"Time In",breakOut:"Break Out",breakIn:"Break In",timeOut:"Time Out"}[b.field];
const existing = ($json.records||[])[0];
const fields = { [slot]: b.time };
if (b.field === "timeIn") fields["Status"] = b.status;       // Present / Tardy
return [{ json: { existingId: existing?.id || "", create: !existing,
  fields: existing ? fields : {
    "Entry":"DTR-"+Date.now().toString(36).toUpperCase(),
    "Account ID": b.accountId, "Name": b.ownerName, "Department": b.ownerType,
    "Date": $now.toFormat("yyyy-MM-dd"), "Device": b.device, ...fields }
}}];
```
**③ IF** `create` → AT-CREATE `DTR` (`fields`); **ELSE** → AT-UPDATE `DTR/{{existingId}}` (`fields`).
**④ AT-CREATE ATTENDANCE** — `"Entry":"AT-"+…, "AccountID":{{accountId}}, "Student":{{ownerName}},
"Direction":{{direction}}, "Method":"Card+Face", "Device":{{device}}, "Timestamp":$now.toISO()` (typecast).
**⑤ AT-CREATE ACTIVITY_LOG** — Action `Attendance`.
**⑥ RESPOND** `{ ok:true }`.

---

## 4) Parent credit — `credit-request` / `credit-requests` / `credit-approve`

**First create the table `CREDIT_REQUESTS`:** Entry (primary), Requester, Requester ID,
Target Account, Target Name, Amount (currency ₱), Proof (attachment), Status
(Pending/Approved/Rejected), Requested (dateTime), Decided By, Note.

### `credit-request` {requester, requesterId, targetName, targetId, amount, proof(base64)}
**① AT-CREATE CREDIT_REQUESTS** — Status `Pending`, Requested `$now.toISO()` (leave Proof empty).
**② Attach the proof** — Airtable attachments need an upload, not base64-in-fields. Use the content
API with the new record id + the Proof field id:
`POST https://content.airtable.com/v0/apprpYxg7leO7JXKJ/{{recordId}}/{{ProofFieldId}}/uploadAttachment`
Body: `{ "contentType":"image/jpeg", "filename":"proof.jpg", "file":"<base64 without the data: prefix>" }`
(Strip the `data:image/...;base64,` prefix in a Code node first.)
**③ RESPOND** `{ ok:true, entry }`.

### `credit-requests` {status}
AT-READ `CREDIT_REQUESTS` `filterByFormula` `={{ "{Status}='" + ($json.body.status||"Pending") + "'" }}`
(no maxRecords) → Code maps to `{ requests:[...] }` → RESPOND.

### `credit-approve` {entry, decision, by, amount, targetId}
**① AT-UPDATE CREDIT_REQUESTS** row → `Status` = decision, `Decided By` = by.
**② IF decision = Approved** → reuse your **topup** logic: AT-READ ACCOUNT by `{AccountID}` =
targetId → AT-UPDATE Balance += amount → AT-CREATE TRANSACTIONS (`Type:"Top-up"`) → AT-CREATE
ACTIVITY_LOG (`Approve Credit`).
**③ RESPOND** `{ ok:true }`.

---

## 5) Portal reads — `admin-overview`, `client-data`, `salary`

These are read-only; each is a few AT-READs feeding one Code node that shapes the JSON the portal
expects (documented at the top of `portal.html`).

**`admin-overview`** — AT-READ: ACCOUNT (count), TRANSACTIONS (Type=Purchase, last 7 days), DTR
(today), MENU (all). Code → `{ kpis:{people,salesToday,txns,present}, salesByDay:[...],
recentTxns:[...], attendance:[...], inventory:[...] }`.

**`client-data`** {role,id} — AT-READ ACCOUNT by the role FK (`{STUDENT_ID}='id'` etc.) →
TRANSACTIONS by `{AccountID}` → DTR by `{Account ID}`. Code → `{ profile, balance, receipts:[],
attendance:[] }`. For Parent: AT-READ STUDENT by `{PARENT_ID}='id'`, then bundle each child →
`{ role:"Parent", profile, children:[...] }`.

**`salary`** {id} — AT-READ TRANSACTIONS where `AND({AccountID}='<acct of id>', {Type}='Purchase',
DATETIME_FORMAT({Created},'YYYY-MM')='<this month>')` → Code sums → `{ total, items:[...] }`.

> These can be optimized later (Airtable views, caching). For the POC, raw reads are fine.

---

## A) ACTIVITY_LOG create recipe (used everywhere)

AT-CREATE `/ACTIVITY_LOG`, fields:
`"Log Ref":"LOG-"+Date.now().toString(36).toUpperCase(), "Timestamp":$now.toISO(),
"Actor":<cashier/admin/device>, "Actor Role":<Cashier|Admin|System|…>, "Action":<one of the options>,
"Target Ref":<AccountID/Item>, "Details":<text>, "Amount":<number|null>, "Device":<device>` (typecast).

## B) Nightly "mark Absent" (separate workflow)

Schedule Trigger (daily, ~6pm Manila) → AT-READ STUDENT (and PERSONNEL) where active → for each,
AT-READ DTR today; **IF none** → AT-CREATE DTR `{ Status:"Absent", Date:today, Account ID, Name,
Department }`. (Loop with SplitInBatches; this one is heavier — build it last.)

---

## Activation checklist

- [ ] Each new HTTP Request node uses the **airtableTokenApi** credential (same as existing nodes).
- [ ] `typecast:true` on creates that write single-selects (Method, Status, Action…).
- [ ] New Switch outputs match the action strings the apps send (exact case).
- [ ] Workflow **Active**; only one workflow owns `/cafeteria`.
- [ ] Smoke test each action with curl, e.g.:
      `curl -X POST .../webhook/cafeteria -H "Content-Type: application/json" -d '{"action":"gate-verify","rfid":"0A1B2C3D"}'`
- [ ] Then flip the apps off demo (portal `DEMO_MODE:false`, gate ⚙ uncheck demo).
