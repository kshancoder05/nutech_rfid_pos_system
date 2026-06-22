# N8N-BRANCHES.md — the 6 remaining branches, node by node

Base `apprpYxg7leO7JXKJ`. Every HTTP node: **Authentication = Predefined Credential Type →
Airtable Personal Access Token** (your existing `airtableTokenApi`). Build each by **copy-pasting an
existing node of the same verb** and changing only URL + body.

Add each action name as a new rule in **Route by action** (`{{ $json.body.action }}` equals …).

Legend: **(HTTP)** HTTP Request · **(Code)** Code · **(IF)** IF · **(Respond)** Respond to Webhook.

Reused expressions:
- READ filter: Send Query ON → `filterByFormula` + `maxRecords`.
- CREATE/UPDATE body: Send Body ON → JSON → "Using JSON" field.
- `$('NodeName').item.json` reads an upstream node; `$('Webhook').first().json.body` reads the input.

═══════════════════════════════════════════════════════════════════════
## 1) register-person   (portal Admin → Register)
═══════════════════════════════════════════════════════════════════════
Route output `register-person` → these 5 nodes in a line:

**① Build register (Code)**
```js
const b = $('Webhook').first().json.body;
const accountId = "ACC-" + Date.now().toString(36).toUpperCase().slice(-8);
const fk = { Student:"STUDENT_ID", Parent:"PARENT_ID", Personnel:"PERSONNEL_ID" }[b.ownerType];
const table = { Student:"STUDENT", Parent:"PARENT", Personnel:"PERSONNEL" }[b.ownerType];
let roleFields;
if (b.ownerType === "Student") roleFields = {
  "StudentID": b.roleId, "StudentName": b.ownerName, "Section": b.section || "",
  "Contact No.": b.contact || "", "Email": b.email || "", "Home Address": b.address || "",
  "PARENT_ID": b.parentId || "", "IsEnrolled": b.isEnrolled || "Yes",
  "Sex": b.sex || "", "Status": "Active" };
else if (b.ownerType === "Personnel") roleFields = {
  "Personnel_ID": b.roleId, "Personnel_Name": b.ownerName, "Contact_No.": b.contact || "",
  "Email": b.email || "", "Home_Address": b.address || "",
  "P_Role": b.pRole || "Staff", "Salary": b.salary || 0 };
else roleFields = {
  "ParentID": b.roleId, "ParentName": b.ownerName, "Contact Number": b.contact || "",
  "Email": b.email || "", "Home Address": b.address || "" };
return [{ json: { accountId, table, roleFields, accountFields: {
  "AccountID": accountId, "RFID UID": b.rfid || "", "FINGERPRINT_ID": b.fingerprint || "",
  "FACE_BIO_ID": b.face || "", "Balance": b.initialBalance || 0, "Status": "Active",
  "Owner Name": b.ownerName, "Owner Type": b.ownerType, [fk]: b.roleId } } }];
```
**② Create role row (HTTP · POST)**
URL `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.table }}`
Body `={{ JSON.stringify({ fields: $json.roleFields, typecast: true }) }}`
**③ Create account (HTTP · POST)**  URL `…/ACCOUNT`
Body `={{ JSON.stringify({ fields: $('Build register').item.json.accountFields, typecast: true }) }}`
**④ Log activity (HTTP · POST)**  URL `…/ACTIVITY_LOG`  (see §LOG recipe, Action `Register`)
**⑤ Respond register-person (Respond)**
`={{ JSON.stringify({ ok:true, accountId: $('Build register').item.json.accountId, roleId: $('Webhook').first().json.body.roleId }) }}`

═══════════════════════════════════════════════════════════════════════
## 2) gate-verify   (entrance · step 1 — card tap)
═══════════════════════════════════════════════════════════════════════
Route output `gate-verify`:

**① Find account (gate) (HTTP · GET)**  URL `…/ACCOUNT`, Send Query:
- `filterByFormula` = `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`
- `maxRecords` = `1`
**② Find DTR today (HTTP · GET)**  URL `…/DTR`, Send Query:
- `filterByFormula` =
  `={{ "AND({Account ID}='" + ($('Find account (gate)').item.json.records[0] ? $('Find account (gate)').item.json.records[0].fields.AccountID : "x") + "',DATETIME_FORMAT({Date},'YYYY-MM-DD')='" + $now.setZone('Asia/Manila').toFormat('yyyy-MM-dd') + "')" }}`
- `maxRecords` = `1`
**③ Build verify (Code)**
```js
const r = $('Find account (gate)').item.json.records;
if (!r || !r.length) return [{ json: { ok:false, reason:"Card not recognized" } }];
const a = r[0].fields;
const d = ($json.records && $json.records[0] ? $json.records[0].fields : {});
return [{ json: { ok:true, account: {
  accountId:a.AccountID, ownerName:a["Owner Name"], ownerType:a["Owner Type"],
  status:a.Status, face:a.FACE_BIO_ID || "",
  today:{ timeIn:d["Time In"]||"", breakOut:d["Break Out"]||"", breakIn:d["Break In"]||"", timeOut:d["Time Out"]||"" }
} } }];
```
**④ Respond gate-verify (Respond)**  `={{ JSON.stringify($json) }}`

═══════════════════════════════════════════════════════════════════════
## 3) gate-punch   (entrance · step 2 — after face match)
═══════════════════════════════════════════════════════════════════════
Route output `gate-punch`:

**① Find DTR today (punch) (HTTP · GET)**  URL `…/DTR`, Send Query:
- `filterByFormula` =
  `={{ "AND({Account ID}='" + $('Webhook').first().json.body.accountId + "',DATETIME_FORMAT({Date},'YYYY-MM-DD')='" + $now.setZone('Asia/Manila').toFormat('yyyy-MM-dd') + "')" }}`
- `maxRecords` = `1`
**② Build punch (Code)**
```js
const b = $('Webhook').first().json.body;
const slot = {timeIn:"Time In",breakOut:"Break Out",breakIn:"Break In",timeOut:"Time Out"}[b.field];
const existing = ($json.records || [])[0];
const fields = { [slot]: b.time };
if (b.field === "timeIn") fields["Status"] = b.status;          // Present / Tardy
return [{ json: {
  existingId: existing ? existing.id : "",
  create: !existing,
  fields: existing ? fields : {
    "Entry":"DTR-"+Date.now().toString(36).toUpperCase(), "Account ID":b.accountId,
    "Name":b.ownerName, "Department":b.ownerType,
    "Date":$now.setZone('Asia/Manila').toFormat('yyyy-MM-dd'), "Device":b.device, ...fields }
} }];
```
**③ DTR exists? (IF)** — condition: `={{ $json.create }}` is **false**
- **TRUE → Update DTR (HTTP · PATCH)** URL `=…/DTR/{{ $('Build punch').item.json.existingId }}`
  Body `={{ JSON.stringify({ fields: $('Build punch').item.json.fields }) }}`
- **FALSE → Create DTR (HTTP · POST)** URL `…/DTR`
  Body `={{ JSON.stringify({ fields: $('Build punch').item.json.fields, typecast:true }) }}`
**④ Create ATTENDANCE (HTTP · POST)**  (wire BOTH IF outputs into this)  URL `…/ATTENDANCE`
```
={{ JSON.stringify({ fields: {
  "Entry":"AT-"+Date.now().toString(36).toUpperCase(),
  "AccountID": $('Webhook').first().json.body.accountId,
  "Student": $('Webhook').first().json.body.ownerName,
  "Direction": $('Webhook').first().json.body.direction,
  "Method":"Card+Face", "Device": $('Webhook').first().json.body.device,
  "Timestamp": $now.toISO() }, typecast:true }) }}
```
**⑤ Log activity (HTTP · POST)**  Action `Attendance`.
**⑥ Respond gate-punch (Respond)**  `={{ JSON.stringify({ ok:true }) }}`

═══════════════════════════════════════════════════════════════════════
## 4) credit-request / credit-requests / credit-approve
═══════════════════════════════════════════════════════════════════════
### credit-request   (parent submits with proof)
**① Create credit row (HTTP · POST)**  URL `…/CREDIT_REQUESTS`
```
={{ JSON.stringify({ fields: {
  "Entry":"CR-"+Date.now().toString(36).toUpperCase(),
  "Requester": $json.body.requester, "Requester ID": $json.body.requesterId,
  "Target Account": $json.body.targetId, "Target Name": $json.body.targetName,
  "Amount": $json.body.amount, "Status":"Pending", "Requested": $now.toISO() },
  typecast:true }) }}
```
*(record id comes back as `{{ $json.id }}`)*
**② Strip prefix (Code)** — base64 needs the `data:` prefix removed:
```js
const raw = ($('Webhook').first().json.body.proof || "");
return [{ json: { recId: $json.id, b64: raw.replace(/^data:[^,]+,/, "") } }];
```
**③ Attach proof (HTTP · POST)** — Airtable **content** host, not api:
URL `=https://content.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.recId }}/Proof/uploadAttachment`
Body `={{ JSON.stringify({ contentType:"image/jpeg", filename:"proof.jpg", file: $json.b64 }) }}`
*(if no proof was sent, route around this node)*
**④ Respond credit-request (Respond)**  `={{ JSON.stringify({ ok:true, entry: $('Strip prefix').item.json.recId }) }}`

### credit-requests   (admin list)
**① List credit rows (HTTP · GET)** URL `…/CREDIT_REQUESTS`, Send Query:
- `filterByFormula` = `={{ "{Status}='" + ($('Webhook').first().json.body.status || "Pending") + "'" }}`
**② Map (Code)**
```js
return [{ json: { ok:true, requests: ($json.records||[]).map(r => ({
  entry:r.id, requester:r.fields.Requester, requesterId:r.fields["Requester ID"],
  targetName:r.fields["Target Name"], targetId:r.fields["Target Account"],
  amount:r.fields.Amount, status:r.fields.Status, requested:r.fields.Requested,
  proof: (r.fields.Proof && r.fields.Proof[0]) ? r.fields.Proof[0].url : null
})) } }];
```
**③ Respond credit-requests (Respond)**  `={{ JSON.stringify($json) }}`

### credit-approve   (admin decision)
**① Update credit row (HTTP · PATCH)** URL `=…/CREDIT_REQUESTS/{{ $('Webhook').first().json.body.entry }}`
Body `={{ JSON.stringify({ fields:{ "Status": $('Webhook').first().json.body.decision, "Decided By": $('Webhook').first().json.body.by } }) }}`
**② Approved? (IF)** — `={{ $('Webhook').first().json.body.decision }}` equals `Approved`
- **TRUE →**
  **Find account (credit) (HTTP·GET)** `…/ACCOUNT` filter `={{ "{AccountID}='" + $('Webhook').first().json.body.targetId + "'" }}`, maxRecords 1
  → **Add balance (HTTP·PATCH)** `=…/ACCOUNT/{{ $json.records[0].id }}`
    Body `={{ JSON.stringify({ fields:{ "Balance": ($json.records[0].fields.Balance||0) + $('Webhook').first().json.body.amount } }) }}`
  → **Log topup (HTTP·POST)** `…/TRANSACTIONS` (Type `Top-up`, Amount, AccountID, Created `$now.toISO()`)
  → **Log activity** (Action `Approve Credit`)
- **FALSE →** skip to respond
**③ Respond credit-approve (Respond)**  `={{ JSON.stringify({ ok:true }) }}`

═══════════════════════════════════════════════════════════════════════
## 5) Portal read actions — admin-overview / client-data / salary
═══════════════════════════════════════════════════════════════════════
All read-only: a few GETs feeding one Code shaper. Chain GETs in a line; the Code node reads each
by name.

### admin-overview
GETs: `Read ACCOUNT` (`…/ACCOUNT`), `Read TXN` (`…/TRANSACTIONS`),
`Read DTR` (`…/DTR` filter today), `Read MENU` (`…/MENU`) → **Build overview (Code)**:
```js
const acc = $('Read ACCOUNT').item.json.records || [];
const txn = $('Read TXN').item.json.records || [];
const dtr = $('Read DTR').item.json.records || [];
const menu= $('Read MENU').item.json.records || [];
const today = $now.setZone('Asia/Manila').toFormat('yyyy-MM-dd');
const todayTxn = txn.filter(t => (t.fields["Sale Date"]===today) && t.fields.Type==="Purchase");
return [{ json: { ok:true,
  kpis:{ people:acc.length,
    salesToday: todayTxn.reduce((s,t)=>s+(t.fields.Amount||0),0),
    txns: todayTxn.length,
    present: dtr.filter(d=>["Present","Tardy"].includes(d.fields.Status)).length },
  salesByDay: [],                       // optional: group txn by Sale Date
  recentTxns: txn.slice(-8).reverse().map(t=>({ ref:t.fields.TxnRef, name:t.fields.Student,
    type:t.fields.Type, amount:t.fields.Amount, time:t.fields.Created })),
  attendance: dtr.map(d=>({ name:d.fields.Name, dept:d.fields.Department,
    in:d.fields["Time In"], out:d.fields["Time Out"], status:d.fields.Status })),
  inventory: menu.map(m=>({ name:m.fields["Item Name"], price:m.fields.Price,
    category:m.fields.Category, available:m.fields.Available!==false })) } }];
```
→ **Respond admin-overview**.

### client-data {role,id}
**Find account (HTTP·GET)** `…/ACCOUNT` filter by the role FK:
`={{ "{" + ($('Webhook').first().json.body.role==='Parent'?'PARENT_ID':$('Webhook').first().json.body.role==='Personnel'?'PERSONNEL_ID':'STUDENT_ID') + "}='" + $('Webhook').first().json.body.id + "'" }}`
→ **Read TXN** filter `={{ "{AccountID}='" + $('Find account').item.json.records[0].fields.AccountID + "'" }}`
→ **Read DTR** filter `={{ "{Account ID}='" + $('Find account').item.json.records[0].fields.AccountID + "'" }}`
→ **Build bundle (Code)** → `{ ok:true, profile:{name,id,role,dept,status}, balance, receipts:[…], attendance:[…] }`
(Parent: also GET STUDENT where `{PARENT_ID}='id'`, bundle each child → `{ role:"Parent", children:[…] }`.)
→ **Respond client-data**.

### salary {id}
**Find account** (PERSONNEL_ID = id) → **Read TXN** filter
`={{ "AND({AccountID}='" + acct + "',{Type}='Purchase',DATETIME_FORMAT({Created},'YYYY-MM')='" + $now.toFormat('yyyy-MM') + "')" }}`
→ **Sum (Code)** → `{ ok:true, total, items:[{ref,items,amount,time}] }` → **Respond salary**.

═══════════════════════════════════════════════════════════════════════
## §LOG — the activity-log node (reused in several branches)
═══════════════════════════════════════════════════════════════════════
HTTP · POST `…/ACTIVITY_LOG`:
```
={{ JSON.stringify({ fields: {
  "Log Ref":"LOG-"+Date.now().toString(36).toUpperCase(), "Timestamp": $now.toISO(),
  "Actor": $('Webhook').first().json.body.by || "System",
  "Actor Role":"System", "Action":"<Register|Sale|Attendance|Approve Credit|…>",
  "Target Ref": "<id>", "Amount": <number or 0> }, typecast:true }) }}
```

## Build order (test each before the next)
1. register-person → register a person, confirm ACCOUNT + role row appear.
2. gate-verify → `curl … {"action":"gate-verify","rfid":"0A1B2C3D"}` returns Maria.
3. gate-punch → tap+face on the gate writes a DTR row.
4. credit-request / -requests / -approve.
5. admin-overview / client-data / salary (the portal dashboards light up).
Keep the workflow **Active**; one workflow owns `/cafeteria`; `typecast:true` on select writes.
