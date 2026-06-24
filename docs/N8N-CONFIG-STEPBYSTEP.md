# N8N-CONFIG-STEPBYSTEP.md — verified build guide

Verified against the LIVE Airtable base on 22 Jun 2026. Every field name and select
option below was read directly from the base — build to these exactly.

Base ID: **apprpYxg7leO7JXKJ**  ·  Webhook path: **/cafeteria**

---

## PART 0 — The verified Airtable schema (write to these exact names)

### ACCOUNT  (the identity hub)
| Field | Type | Notes |
|---|---|---|
| AccountID | text | primary key — **generated in n8n** |
| Owner Name | text | |
| Owner Type | singleSelect | **Student · Parent · Personnel** |
| RFID UID | text | uppercase hex |
| FACE_BIO_ID | long text | 128-float JSON descriptor |
| Balance | currency (₱) | number only |
| Status | singleSelect | **Active · Blocked · Lost Card** |
| STUDENT_ID / PARENT_ID / PERSONNEL_ID | text | role link (fill the one matching Owner Type) |
> FINGERPRINT_ID has been deleted — do **not** reference it anywhere.

### STUDENT
StudentID (text, PK) · StudentName · Section · Contact No. (phone) · Email ·
Sex (singleSelect **Male · Female**) · IsEnrolled · Home Address · PARENT_ID · Status

### PARENT
ParentID (text, PK) · ParentName · Contact Number · Email · Home Address

### PERSONNEL
Personnel_ID (text, PK) · Personnel_Name · Contact_No. (phone) · Email ·
P_Role (singleSelect **Teacher · Staff**) · Salary (currency) · Home_Address

### DTR  (attendance time record)
Entry (PK) · Name · Department · Date · Time In · Break Out · Break In · Time Out ·
Status (singleSelect Present/Tardy/Absent) · Device · **Account ID** (text)

### ATTENDANCE  (raw taps)
Entry (PK) · AccountID · RFID UID · Student · Direction · Method (incl. Card+Face) · Device · Timestamp

### MENU
Item Name (PK) · Price · Category · Available · Stock On Hand (number) ·
Reorder Level (number) · Stock Status (formula → "⚠ Reorder"/"Low"/"OK")

### TRANSACTIONS
TxnRef (PK) · Type · AccountID · Amount · Balance After · Items · By ·
Created (dateTime) · Sale Date (formula YYYY-MM-DD, Asia/Manila)

### SALE_ITEMS · CREDIT_REQUESTS · ACTIVITY_LOG
As previously built (line items, parent credit requests, audit log).

---

## PART 1 — The universal node pattern (every branch is made of these)

The workflow uses **raw HTTP Request nodes** to Airtable's REST API (not the built-in
Airtable node). Four node types only:

**A. HTTP Request — READ (GET)**
- Method GET · URL `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/<TABLE>`
- Authentication: **Predefined Credential Type → Airtable Token API** (your saved token)
- Send Query ON → add `filterByFormula` =
  `={{ "{FIELD}='" + $('Webhook').first().json.body.<key> + "'" }}`
  and `maxRecords` = 1

**B. HTTP Request — CREATE (POST)**
- Method POST · URL `…/<TABLE>` · same auth
- Send Body ON → JSON → `={{ JSON.stringify({ fields: {...}, typecast: true }) }}`

**C. HTTP Request — UPDATE (PATCH)**
- Method PATCH · URL `…/<TABLE>/{{ recordId }}` · same auth · JSON body as above

**D. Code / IF / Respond** — reshape data / branch / reply.

**Golden rules**
1. `typecast: true` on every create/update that writes a **singleSelect** (Owner Type,
   Status, Sex, P_Role, Direction, Method…). Without it the value is rejected.
2. **Every branch must end in a Respond to Webhook** node, or the request hangs.
3. Set Respond nodes to **Respond With → First Incoming Item** (avoids "Invalid JSON").
4. Copy/paste an existing node of the right type — it carries the Airtable credential.

---

## PART 2 — The webhook + Switch (the front door)

1. **Webhook** node: HTTP Method POST, Path `cafeteria`, Respond = "Using Respond to
   Webhook Node", CORS allowedOrigins `*`.
2. **Switch** node "Route by action", mode **Rules**. For each action add a rule:
   - Left value: `={{ $json.body.action }}`  ← must include **.body**, in expression (fx) mode
   - Operator: **String → is equal to**
   - Right value: the action name (exact case, no spaces)
   - Rename Output to the action name
3. Turn ON the **Fallback Output** → wire it to a Respond node returning
   `={{ JSON.stringify({ ok:false, reason:"unrouted", got: $json.body.action }) }}`.
   This makes any unbuilt/mistyped action reply instantly instead of hanging.

> If a request "hangs at Route by action": the matched branch has no Respond at its end,
> or the rule's left value isn't `{{ $json.body.action }}` in fx mode. The fallback reveals which.

---

## PART 3 — register-person  (step by step)

Payload the portal sends:
`{ action, ownerType, ownerName, roleId, contact, email, address, rfid, face,
   initialBalance, + (Student: section, sex, parentId, isEnrolled) (Personnel: pRole, salary) }`

Branch shape:
```
register-person ▸ Build register (Code) ▸ Create role row (POST) ▸ Create account (POST) ▸ Shape result (Code) ▸ Respond (Webhook)
```

### Step 1 — Switch
Add a rule: `={{ $json.body.action }}` is equal to `register-person`, rename output `register-person`.

### Step 2 — Build register (Code node)
```javascript
const b = $('Webhook').first().json.body;
const accountId = "ACC-" + Date.now().toString(36).toUpperCase();

const table     = b.ownerType === "Student"   ? "STUDENT"
                : b.ownerType === "Personnel" ? "PERSONNEL" : "PARENT";
const linkField = b.ownerType === "Student"   ? "STUDENT_ID"
                : b.ownerType === "Personnel" ? "PERSONNEL_ID" : "PARENT_ID";

const accountFields = {
  "AccountID":   accountId,
  "Owner Name":  b.ownerName,
  "Owner Type":  b.ownerType,
  "RFID UID":    b.rfid,
  "FACE_BIO_ID": b.face,
  "Balance":     b.initialBalance || 0,
  "Status":      "Active",
  [linkField]:   b.roleId
};

let roleFields;
if (table === "STUDENT") {
  roleFields = { "StudentID": b.roleId, "StudentName": b.ownerName,
    "Section": b.section || "", "Contact No.": b.contact || "", "Email": b.email || "",
    "Home Address": b.address || "", "Sex": b.sex || "Female",
    "IsEnrolled": b.isEnrolled || "Yes", "PARENT_ID": b.parentId || "", "Status": "Active" };
} else if (table === "PERSONNEL") {
  roleFields = { "Personnel_ID": b.roleId, "Personnel_Name": b.ownerName,
    "Contact_No.": b.contact || "", "Email": b.email || "", "Home_Address": b.address || "",
    "P_Role": b.pRole || "Teacher", "Salary": b.salary || 0 };
} else {
  roleFields = { "ParentID": b.roleId, "ParentName": b.ownerName,
    "Contact Number": b.contact || "", "Email": b.email || "", "Home Address": b.address || "" };
}

return [{ json: { accountId, table, roleFields, accountFields, body: b } }];
```

### Step 3 — Create role row (HTTP POST)
- URL: `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.table }}`
- Body: `={{ JSON.stringify({ fields: $json.roleFields, typecast: true }) }}`

### Step 4 — Create account (HTTP POST)
- URL: `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/ACCOUNT`
- Body: `={{ JSON.stringify({ fields: $('Build register').first().json.accountFields, typecast: true }) }}`
  (reference **Build register** by name — the role-row response changed `$json`)

### Step 5 — Shape result (Code)
```javascript
return [{ json: {
  ok: true,
  accountId: $('Build register').first().json.accountId,
  roleId: $('Webhook').first().json.body.roleId
}}];
```

### Step 6 — Respond (Respond to Webhook)
- Respond With: **First Incoming Item**

### Test
```bash
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
 -H "Content-Type: application/json" \
 -d '{"action":"register-person","ownerType":"Parent","ownerName":"Juan dela Cruz","roleId":"PAR-01","contact":"0912","email":"x@y.com","address":"Lipa","rfid":"577F4B06","face":"[]","initialBalance":600}'
```
→ `{ ok:true, accountId:"ACC-…", roleId:"PAR-01" }`, and a new PARENT row + ACCOUNT row appear.

---

## PART 4 — gate-verify  (read identity for the gate)

Payload: `{ action:"gate-verify", rfid }`
```
gate-verify ▸ Find account (gate) GET ▸ Find DTR today GET ▸ Build verify Code ▸ Respond
```
- **Find account (gate):** filter `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`, maxRecords 1
- **Find DTR today:** URL `…/DTR`, filter
  `={{ "AND({Account ID}='" + $('Find account (gate)').first().json.records[0].fields.AccountID + "',{Date}='" + $now.format('yyyy-MM-dd') + "')" }}`
- **Build verify (Code):**
```javascript
const recs = $('Find account (gate)').first().json.records || [];
if (!recs.length) return [{ json: { ok:false, reason:"Card not recognized" } }];
const a = recs[0].fields;
const dtr = ($('Find DTR today').first().json.records || [])[0];
return [{ json: { ok:true, account: {
  accountId: a.AccountID, ownerName: a["Owner Name"], ownerType: a["Owner Type"],
  status: a.Status, face: a.FACE_BIO_ID || "",
  today: dtr ? { hasIn: !!dtr.fields["Time In"], hasOut: !!dtr.fields["Time Out"], recordId: dtr.id } : null
}}}];
```
- **Respond:** First Incoming Item.

(Note: when reading raw Airtable GET responses the records are under `.json.records[0].fields`.)

---

## PART 5 — gate-punch  (write attendance after face match)

Payload: `{ action:"gate-punch", accountId, field, direction, status, time, ownerName, ownerType, device }`
```
gate-punch ▸ Find DTR (punch) GET ▸ Build punch Code ▸ DTR exists? IF
            ├ true  ▸ Update DTR PATCH ─┐
            └ false ▸ Create DTR POST ──┴▸ Create ATTENDANCE POST ▸ Respond
```
- **Find DTR (punch):** `…/DTR`, filter by `{Account ID}` = body.accountId AND `{Date}` = today.
- **Build punch (Code):** decide create vs update, map `field` → "Time In"/"Time Out", carry recordId.
- **Update DTR (PATCH):** URL `=…/DTR/{{ $json.recordId }}`, body sets the time field + Status.
- **Create DTR (POST):** `…/DTR`, body { Account ID, Name, Date, [time field], Status, Device }, typecast.
- **Create ATTENDANCE (POST):** `…/ATTENDANCE`, body { AccountID, Direction, Method:"Card+Face", Device, Timestamp }, typecast. Wire BOTH IF outputs into this.
- **Respond:** `={{ JSON.stringify({ ok:true }) }}` or First Incoming Item.

---

## PART 6 — Activation checklist
- [ ] Every branch ends in **Respond to Webhook** (First Incoming Item).
- [ ] Switch rule left values = `={{ $json.body.action }}` in fx mode; operator String = equal.
- [ ] Fallback Output wired to a Respond (so nothing hangs silently).
- [ ] `typecast: true` on every create/update writing a single-select.
- [ ] Create account references **Build register** by name (not `$json`).
- [ ] Only ONE workflow owns `/cafeteria`; workflow toggled **Active**.
- [ ] curl-test each branch; confirm the Airtable row; then flip the apps to live.
