# N8N-WORKFLOW-REFERENCE.md — every action, every node, full config

Complete reference for the **Cafeteria POS — Nutech RFID System** workflow.
Field names verified against the live base (apprpYxg7leO7JXKJ) on 22 Jun 2026.
**Every node below shows its full configuration** — method, URL, filter, body, and Code.

- Webhook: `POST https://bernard100.app.n8n.cloud/webhook/cafeteria`
- Routed by the **Switch** on `={{ $json.body.action }}`.

---

## CONVENTIONS (apply to every node)

**Auth** — every HTTP Request node: Authentication = *Predefined Credential Type* →
*Airtable Token API*.

**Three HTTP shapes** (the URL host is always `https://api.airtable.com/v0/apprpYxg7leO7JXKJ`
except the credit-proof upload, which uses `content.airtable.com`):

- **GET (read):** Method GET, `…/<TABLE>`, **Send Query = ON**, add params:
  - `filterByFormula` (expression below) · `maxRecords` = `1` for single lookups.
- **POST (create):** Method POST, `…/<TABLE>`, **Send Body = ON**, Body Content Type = JSON,
  JSON = `={{ JSON.stringify({ fields:{...}, typecast:true }) }}`
- **PATCH (update):** Method PATCH, `…/<TABLE>/{{ recordId }}`, Body as above.

**Reads return** the raw Airtable response → reference rows as
`$('NodeName').first().json.records[0].fields.<Field>`.

**Respond to Webhook** nodes: **Respond With = First Incoming Item** (or a JSON expression
where shown). Every branch MUST end in one.

**`typecast:true`** is required on any write touching a single-select: Owner Type, Status,
Sex, P_Role, Direction, Method, Action, Actor Role, Type.

**Switch** "Route by action", mode Rules. Each rule: left `={{ $json.body.action }}` (fx mode),
operator **String → is equal to**, right = the action name, Rename Output = the action name.
Turn ON **Fallback Output** → wire to a Respond returning
`={{ JSON.stringify({ ok:false, reason:"unrouted", got:$json.body.action }) }}`.

**Verified field names** — ACCOUNT: AccountID · Owner Name · Owner Type · RFID UID ·
FACE_BIO_ID · Balance · Status · STUDENT_ID · PARENT_ID · PERSONNEL_ID. STUDENT: StudentID ·
StudentName · Section · Contact No. · Email · Sex · IsEnrolled · Home Address · PARENT_ID ·
Status. PARENT: ParentID · ParentName · Contact Number · Email · Home Address. PERSONNEL:
Personnel_ID · Personnel_Name · Contact_No. · Email · P_Role · Salary · Home_Address. MENU:
Item Name · Price · Category · Available · Stock On Hand · Reorder Level · Stock Status. DTR:
Entry · Name · Department · Date · Time In · Break Out · Break In · Time Out · Status · Device ·
Account ID. ATTENDANCE: Entry · AccountID · RFID UID · Student · Direction · Method · Device ·
Timestamp. TRANSACTIONS: TxnRef · Type · AccountID · Amount · Balance After · Items · By ·
Created · Sale Date. SALE_ITEMS: Line Ref · TxnRef · Item Name · Category · Qty · Unit Price ·
Line Total · Cashier · Account ID · Created. CREDIT_REQUESTS: Entry · Requester · Requester ID ·
Target Account · Target Name · Amount · Proof · Status · Requested · Decided By · Note.
ACTIVITY_LOG: Log Ref · Timestamp · Actor · Actor Role · Action · Target Ref · Details ·
Amount · Device.

═══════════════════════════════════════════════════════════════════
# GROUP A — CAFETERIA / MONEY
═══════════════════════════════════════════════════════════════════

## 1. `verify`
**Payload:** `{ action:"verify", rfid }`
**Chain:** `Find account (verify) GET ▸ Combine verify Code ▸ Respond verify`

### Node — Find account (verify)  [HTTP GET]
- URL: `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/ACCOUNT`
- filterByFormula: `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`
- maxRecords: `1`

### Node — Combine verify  [Code]
```javascript
const recs = $('Find account (verify)').first().json.records || [];
if(!recs.length) return [{ json:{ ok:false, reason:"Card not recognized" }}];
const a = recs[0].fields;
return [{ json:{ ok:true,
  accountId: a.AccountID, rfid: a["RFID UID"],
  ownerName: a["Owner Name"], ownerType: a["Owner Type"],
  balance: a.Balance || 0, status: a.Status,
  student: { name: a["Owner Name"], balance: a.Balance || 0 }
}}];
```
### Node — Respond verify  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 2. `purchase`
**Payload:** `{ action:"purchase", accountId, items:[{name,price,qty,category}], total, payMode, by }`
**Chain:**
```
Find account (purchase) GET ▸ Validate purchase Code ▸ Purchase OK? IF
  ├ true ▸ Deduct balance PATCH ▸ Log purchase POST ▸ Split Cart Code
  │        ▸ create SALE_ITEMS POST ▸ Find MENU item GET ▸ Compute new stock Code
  │        ▸ Update MENU stock PATCH ▸ Log Activity (Sale) POST ▸ Respond purchase
  └ false ▸ Respond purchase declined
```

### Node — Find account (purchase)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.accountId + "'" }}`
- maxRecords: `1`

### Node — Validate purchase  [Code]
```javascript
const b = $('Webhook').first().json.body;
const recs = $('Find account (purchase)').first().json.records || [];
if(!recs.length) return [{ json:{ ok:false, reason:"Account not found" }}];
const rec = recs[0]; const bal = rec.fields.Balance || 0;
const isWallet = b.payMode !== "salary";
const ok = !isWallet || bal >= b.total;
return [{ json:{
  ok, reason: ok ? "" : "Not enough balance",
  recordId: rec.id, newBalance: isWallet ? bal - b.total : bal,
  total: b.total, items: b.items || [], by: b.by || "POS", accountId: b.accountId
}}];
```
### Node — Purchase OK?  [IF]
- Condition: `={{ $json.ok }}` · Boolean · is **true**

### Node — Deduct balance  [HTTP PATCH]  (true branch)
- URL: `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/ACCOUNT/{{ $('Validate purchase').first().json.recordId }}`
- Body: `={{ JSON.stringify({ fields:{ "Balance": $('Validate purchase').first().json.newBalance } }) }}`

### Node — Log purchase  [HTTP POST]
- URL: `…/TRANSACTIONS`
- Body:
```
={{ JSON.stringify({ fields:{
  "TxnRef": "OR-" + $now.toMillis(),
  "Type": "Sale",
  "AccountID": $('Validate purchase').first().json.accountId,
  "Amount": $('Validate purchase').first().json.total,
  "Balance After": $('Validate purchase').first().json.newBalance,
  "Items": ($('Validate purchase').first().json.items||[]).map(i=>i.name+(i.qty>1?" x"+i.qty:"")).join(", "),
  "By": $('Validate purchase').first().json.by
}, typecast:true }) }}
```
### Node — Split Cart  [Code]  (fans out one item per line)
```javascript
const v = $('Validate purchase').first().json;
const ref = $('Log purchase').first().json.fields ? $('Log purchase').first().json.fields.TxnRef : ("OR-"+Date.now());
return (v.items||[]).map(i => ({ json:{
  txnRef: ref, item: i.name, category: i.category||"",
  qty: i.qty||1, price: i.price||0, cashier: v.by, accountId: v.accountId
}}));
```
### Node — create SALE_ITEMS  [HTTP POST]  (runs once per item)
- URL: `…/SALE_ITEMS`
- Body:
```
={{ JSON.stringify({ fields:{
  "Line Ref": "LI-" + $now.toMillis() + "-" + $itemIndex,
  "TxnRef": $json.txnRef,
  "Item Name": $json.item, "Category": $json.category,
  "Qty": $json.qty, "Unit Price": $json.price,
  "Cashier": $json.cashier, "Account ID": $json.accountId
}, typecast:true }) }}
```
### Node — Find MENU item  [HTTP GET]
- URL: `…/MENU`
- filterByFormula: `={{ "{Item Name}='" + $json.item + "'" }}`
- maxRecords: `1`

### Node — Compute new stock  [Code]
```javascript
const m = ($('Find MENU item').first().json.records||[])[0];
if(!m) return [{ json:{ skip:true }}];
const onHand = m.fields["Stock On Hand"] || 0;
const qty = $('Split Cart').first().json.qty || 1;
return [{ json:{ skip:false, recordId:m.id, newStock: Math.max(0, onHand - qty) }}];
```
### Node — Update MENU stock  [HTTP PATCH]
- URL: `=…/MENU/{{ $json.recordId }}`
- Body: `={{ JSON.stringify({ fields:{ "Stock On Hand": $json.newStock } }) }}`

### Node — Log Activity (Sale)  [HTTP POST]
- URL: `…/ACTIVITY_LOG`
- Body:
```
={{ JSON.stringify({ fields:{
  "Log Ref": "LOG-" + $now.toMillis(),
  "Actor": $('Validate purchase').first().json.by, "Actor Role": "Cashier",
  "Action": "Sale", "Target Ref": $('Validate purchase').first().json.accountId,
  "Amount": $('Validate purchase').first().json.total
}, typecast:true }) }}
```
### Node — Respond purchase  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true, txnId: $('Log purchase').first().json.fields.TxnRef, balanceAfter: $('Validate purchase').first().json.newBalance }) }}`
### Node — Respond purchase declined  [Respond to Webhook]  (false branch)
- Body: `={{ JSON.stringify({ ok:false, reason: $('Validate purchase').first().json.reason }) }}`

---

## 3. `topup`
**Payload:** `{ action:"topup", accountId, amount, by }`
**Chain:** `Find account (topup) GET ▸ Validate topup Code ▸ Topup OK? IF ├true▸ Add to balance PATCH ▸ Log topup POST ▸ Respond topup └false▸ Respond topup declined`

### Node — Find account (topup)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.accountId + "'" }}`
- maxRecords: `1`
### Node — Validate topup  [Code]
```javascript
const b=$('Webhook').first().json.body;
const r=($('Find account (topup)').first().json.records||[])[0];
if(!r) return [{json:{ok:false,reason:"Account not found"}}];
return [{json:{ ok:true, recordId:r.id,
  newBalance:(r.fields.Balance||0)+Number(b.amount),
  amount:Number(b.amount), accountId:b.accountId, by:b.by||"POS" }}];
```
### Node — Topup OK?  [IF]
- Condition: `={{ $json.ok }}` is **true**
### Node — Add to balance  [HTTP PATCH]
- URL: `=…/ACCOUNT/{{ $('Validate topup').first().json.recordId }}`
- Body: `={{ JSON.stringify({ fields:{ "Balance": $('Validate topup').first().json.newBalance } }) }}`
### Node — Log topup  [HTTP POST]
- URL: `…/TRANSACTIONS`
- Body:
```
={{ JSON.stringify({ fields:{
  "TxnRef":"LD-"+$now.toMillis(), "Type":"Top-up",
  "AccountID":$('Validate topup').first().json.accountId,
  "Amount":$('Validate topup').first().json.amount,
  "Balance After":$('Validate topup').first().json.newBalance,
  "By":$('Validate topup').first().json.by
}, typecast:true }) }}
```
### Node — Respond topup  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true, balanceAfter: $('Validate topup').first().json.newBalance }) }}`
### Node — Respond topup declined  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:false, reason: $('Validate topup').first().json.reason }) }}`

---

## 4. `enroll`
**Payload:** `{ action:"enroll", accountId, rfid }`  (link a blank card to an account)
**Chain:** `Find account (enroll) GET ▸ Validate enroll Code ▸ Enroll OK? IF ├true▸ Write RFID to account PATCH ▸ Respond enroll └false▸ Respond enroll declined`

### Node — Find account (enroll)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.accountId + "'" }}`
- maxRecords: `1`
### Node — Validate enroll  [Code]
```javascript
const b=$('Webhook').first().json.body;
const r=($('Find account (enroll)').first().json.records||[])[0];
if(!r) return [{json:{ok:false,reason:"Account not found"}}];
if(!b.rfid) return [{json:{ok:false,reason:"No card UID"}}];
return [{json:{ ok:true, recordId:r.id, rfid:b.rfid, accountId:b.accountId }}];
```
### Node — Enroll OK?  [IF]
- Condition: `={{ $json.ok }}` is **true**
### Node — Write RFID to account  [HTTP PATCH]
- URL: `=…/ACCOUNT/{{ $('Validate enroll').first().json.recordId }}`
- Body: `={{ JSON.stringify({ fields:{ "RFID UID": $('Validate enroll').first().json.rfid } }) }}`
### Node — Respond enroll  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true, accountId: $('Validate enroll').first().json.accountId, rfid: $('Validate enroll').first().json.rfid }) }}`
### Node — Respond enroll declined  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:false, reason: $('Validate enroll').first().json.reason }) }}`

---

## 5. `menu`
**Payload:** `{ action:"menu" }`
**Chain:** `List menu GET ▸ Map menu Code ▸ Respond menu`

### Node — List menu  [HTTP GET]
- URL: `…/MENU`
- **Send Query = OFF** (fetch all rows; no filter, no maxRecords)
### Node — Map menu  [Code]
```javascript
const rows = $('List menu').first().json.records || [];
return [{ json:{ ok:true, menu: rows.map(r=>({
  name: r.fields["Item Name"], price: r.fields.Price||0,
  category: r.fields.Category||"", available: r.fields.Available!==false,
  stock: r.fields["Stock On Hand"], stockStatus: r.fields["Stock Status"]
})) }}];
```
### Node — Respond menu  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 6. `account-info`
**Payload:** `{ action:"account-info", accountId | rfid }`
**Chain:** `Find account (info) GET ▸ Build account-info Code ▸ Respond account-info`

### Node — Find account (info)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula:
```
={{ $('Webhook').first().json.body.accountId
   ? "{AccountID}='" + $('Webhook').first().json.body.accountId + "'"
   : "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}
```
- maxRecords: `1`
### Node — Build account-info  [Code]
```javascript
const r=($('Find account (info)').first().json.records||[])[0];
if(!r) return [{json:{ok:false,reason:"Account not found"}}];
const a=r.fields;
return [{json:{ ok:true, account:{
  accountId:a.AccountID, ownerName:a["Owner Name"], ownerType:a["Owner Type"],
  balance:a.Balance||0, status:a.Status, rfid:a["RFID UID"]
}}}];
```
### Node — Respond account-info  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 7. `reassign`
**Payload:** `{ action:"reassign", rfid, newAccountId, by }`
**Chain:** `Find account (reassign) GET ▸ Find new account GET ▸ Validate reassign Code ▸ Reassign OK? IF ├true▸ Clear old card PATCH ▸ Set new card PATCH ▸ Log reassign POST ▸ Respond reassign └false▸ Respond reassign declined`

### Node — Find account (reassign)  [HTTP GET]  (the card's current owner)
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`
- maxRecords: `1`
### Node — Find new account  [HTTP GET]  (the target owner)
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.newAccountId + "'" }}`
- maxRecords: `1`
### Node — Validate reassign  [Code]
```javascript
const b=$('Webhook').first().json.body;
const oldR=($('Find account (reassign)').first().json.records||[])[0];
const newR=($('Find new account').first().json.records||[])[0];
if(!newR) return [{json:{ok:false,reason:"Target account not found"}}];
return [{json:{ ok:true,
  oldRecordId: oldR ? oldR.id : null,
  newRecordId: newR.id, rfid:b.rfid, by:b.by||"Admin",
  newAccountId:b.newAccountId
}}];
```
### Node — Reassign OK?  [IF]
- Condition: `={{ $json.ok }}` is **true**
### Node — Clear old card  [HTTP PATCH]  (only if oldRecordId exists)
- URL: `=…/ACCOUNT/{{ $('Validate reassign').first().json.oldRecordId }}`
- Body: `={{ JSON.stringify({ fields:{ "RFID UID": "" } }) }}`
- (If oldRecordId is null, this node errors — guard with an IF on `oldRecordId`, or skip.)
### Node — Set new card  [HTTP PATCH]
- URL: `=…/ACCOUNT/{{ $('Validate reassign').first().json.newRecordId }}`
- Body: `={{ JSON.stringify({ fields:{ "RFID UID": $('Validate reassign').first().json.rfid } }) }}`
### Node — Log reassign  [HTTP POST]
- URL: `…/ACTIVITY_LOG`
- Body:
```
={{ JSON.stringify({ fields:{
  "Log Ref":"LOG-"+$now.toMillis(), "Actor":$('Validate reassign').first().json.by,
  "Actor Role":"Admin", "Action":"Reassign",
  "Target Ref":$('Validate reassign').first().json.newAccountId,
  "Details":"Card "+$('Validate reassign').first().json.rfid
}, typecast:true }) }}
```
### Node — Respond reassign  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true, accountId: $('Validate reassign').first().json.newAccountId, rfid: $('Validate reassign').first().json.rfid }) }}`
### Node — Respond reassign declined  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:false, reason: $('Validate reassign').first().json.reason }) }}`

═══════════════════════════════════════════════════════════════════
# GROUP B — ACCESS CONTROL (gate)
═══════════════════════════════════════════════════════════════════

## 8. `gate-verify`
**Payload:** `{ action:"gate-verify", rfid }`
**Chain:** `Find account (gate) GET ▸ Find DTR today GET ▸ Build verify Code ▸ Respond gate-verify`

### Node — Find account (gate)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{RFID UID}='" + $('Webhook').first().json.body.rfid + "'" }}`
- maxRecords: `1`
### Node — Find DTR today  [HTTP GET]
- URL: `…/DTR`
- filterByFormula:
```
={{ "AND({Account ID}='" + ($('Find account (gate)').first().json.records[0]?.fields.AccountID || "") + "',{Date}='" + $now.format('yyyy-MM-dd') + "')" }}
```
- maxRecords: `1`
### Node — Build verify  [Code]
```javascript
const recs=$('Find account (gate)').first().json.records||[];
if(!recs.length) return [{json:{ok:false,reason:"Card not recognized"}}];
const a=recs[0].fields;
const dtr=($('Find DTR today').first().json.records||[])[0];
return [{json:{ ok:true, account:{
  accountId:a.AccountID, ownerName:a["Owner Name"], ownerType:a["Owner Type"],
  status:a.Status, face:a.FACE_BIO_ID||"",
  today: dtr ? { hasIn:!!dtr.fields["Time In"], hasOut:!!dtr.fields["Time Out"], recordId:dtr.id } : null
}}}];
```
### Node — Respond gate-verify  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 9. `gate-punch`
**Payload:** `{ action:"gate-punch", accountId, field:"timeIn"|"timeOut", direction, status, time, ownerName, ownerType, device }`
**Chain:**
```
Find DTR (punch) GET ▸ Build punch Code ▸ DTR exists? IF
  ├ true ▸ Update DTR PATCH ─┐
  └ false ▸ Create DTR POST ─┴▸ Create ATTENDANCE POST ▸ Log activity POST ▸ Respond gate-punch
```
### Node — Find DTR (punch)  [HTTP GET]
- URL: `…/DTR`
- filterByFormula:
```
={{ "AND({Account ID}='" + $('Webhook').first().json.body.accountId + "',{Date}='" + $now.format('yyyy-MM-dd') + "')" }}
```
- maxRecords: `1`
### Node — Build punch  [Code]
```javascript
const b=$('Webhook').first().json.body;
const dtr=($('Find DTR (punch)').first().json.records||[])[0];
const col = b.field==="timeOut" ? "Time Out" : "Time In";
return [{json:{
  exists: !!dtr, recordId: dtr ? dtr.id : null, col, time: b.time, status: b.status,
  fields: { "Account ID":b.accountId, "Name":b.ownerName, "Department":b.ownerType,
            "Date": $now.format('yyyy-MM-dd'), [col]: b.time, "Status": b.status, "Device": b.device },
  body: b
}}];
```
### Node — DTR exists?  [IF]
- Condition: `={{ $json.exists }}` is **true**
### Node — Update DTR  [HTTP PATCH]  (true)
- URL: `=…/DTR/{{ $('Build punch').first().json.recordId }}`
- Body: `={{ JSON.stringify({ fields:{ [$('Build punch').first().json.col]: $('Build punch').first().json.time, "Status": $('Build punch').first().json.status } }) }}`
### Node — Create DTR  [HTTP POST]  (false)
- URL: `…/DTR`
- Body: `={{ JSON.stringify({ fields: $('Build punch').first().json.fields, typecast:true }) }}`
### Node — Create ATTENDANCE  [HTTP POST]  (both IF outputs wire here)
- URL: `…/ATTENDANCE`
- Body:
```
={{ JSON.stringify({ fields:{
  "AccountID": $('Build punch').first().json.body.accountId,
  "Direction": $('Build punch').first().json.body.direction,
  "Method": "Card+Face",
  "Device": $('Build punch').first().json.body.device,
  "Timestamp": $now.toISO()
}, typecast:true }) }}
```
### Node — Log activity  [HTTP POST]  (optional)
- URL: `…/ACTIVITY_LOG`
- Body:
```
={{ JSON.stringify({ fields:{
  "Log Ref":"LOG-"+$now.toMillis(), "Actor":$('Build punch').first().json.body.ownerName,
  "Actor Role":"Gate", "Action":"Attendance",
  "Target Ref":$('Build punch').first().json.body.accountId, "Device":$('Build punch').first().json.body.device
}, typecast:true }) }}
```
### Node — Respond gate-punch  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true }) }}`

═══════════════════════════════════════════════════════════════════
# GROUP C — REGISTRATION
═══════════════════════════════════════════════════════════════════

## 10. `register-person`
**Payload:** `{ action:"register-person", ownerType, ownerName, roleId, contact, email, address, rfid, face, initialBalance, +(Student: section,sex,parentId,isEnrolled)(Personnel: pRole,salary) }`
**Chain:** `Build register Code ▸ Create role row POST ▸ Create account POST ▸ Shape result Code ▸ Respond register`

### Node — Build register  [Code]
```javascript
const b=$('Webhook').first().json.body;
const accountId="ACC-"+Date.now().toString(36).toUpperCase();
const table=b.ownerType==="Student"?"STUDENT":b.ownerType==="Personnel"?"PERSONNEL":"PARENT";
const linkField=b.ownerType==="Student"?"STUDENT_ID":b.ownerType==="Personnel"?"PERSONNEL_ID":"PARENT_ID";
const accountFields={ "AccountID":accountId, "Owner Name":b.ownerName, "Owner Type":b.ownerType,
  "RFID UID":b.rfid, "FACE_BIO_ID":b.face, "Balance":b.initialBalance||0, "Status":"Active", [linkField]:b.roleId };
let roleFields;
if(table==="STUDENT") roleFields={ "StudentID":b.roleId, "StudentName":b.ownerName, "Section":b.section||"",
  "Contact No.":b.contact||"", "Email":b.email||"", "Home Address":b.address||"", "Sex":b.sex||"Female",
  "IsEnrolled":b.isEnrolled||"Yes", "PARENT_ID":b.parentId||"", "Status":"Active" };
else if(table==="PERSONNEL") roleFields={ "Personnel_ID":b.roleId, "Personnel_Name":b.ownerName,
  "Contact_No.":b.contact||"", "Email":b.email||"", "Home_Address":b.address||"", "P_Role":b.pRole||"Teacher", "Salary":b.salary||0 };
else roleFields={ "ParentID":b.roleId, "ParentName":b.ownerName, "Contact Number":b.contact||"",
  "Email":b.email||"", "Home Address":b.address||"" };
return [{json:{ accountId, table, roleFields, accountFields, body:b }}];
```
### Node — Create role row  [HTTP POST]
- URL: `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.table }}`
- Body: `={{ JSON.stringify({ fields: $json.roleFields, typecast:true }) }}`
### Node — Create account  [HTTP POST]
- URL: `…/ACCOUNT`
- Body: `={{ JSON.stringify({ fields: $('Build register').first().json.accountFields, typecast:true }) }}`
### Node — Shape result  [Code]
```javascript
return [{json:{ ok:true,
  accountId:$('Build register').first().json.accountId,
  roleId:$('Webhook').first().json.body.roleId
}}];
```
### Node — Respond register  [Respond to Webhook]
- Respond With: **First Incoming Item**

═══════════════════════════════════════════════════════════════════
# GROUP D — CREDIT (parent top-up requests)
═══════════════════════════════════════════════════════════════════

## 11. `credit-request`
**Payload:** `{ action:"credit-request", requester, requesterId, targetName, targetId, amount, proof }`
**Chain:** `Create credit row POST ▸ Strip prefix Code ▸ Attach proof POST ▸ Respond credit-request`

### Node — Create credit row  [HTTP POST]
- URL: `…/CREDIT_REQUESTS`
- Body:
```
={{ JSON.stringify({ fields:{
  "Entry":"CR-"+$now.toMillis(),
  "Requester":$('Webhook').first().json.body.requester,
  "Requester ID":$('Webhook').first().json.body.requesterId,
  "Target Name":$('Webhook').first().json.body.targetName,
  "Target Account":$('Webhook').first().json.body.targetId,
  "Amount":$('Webhook').first().json.body.amount,
  "Status":"Pending", "Requested":$now.toISO()
}, typecast:true }) }}
```
### Node — Strip prefix  [Code]
```javascript
const b=$('Webhook').first().json.body;
const recId=$('Create credit row').first().json.id;
const base64=(b.proof||"").replace(/^data:.*;base64,/,"");
return [{json:{ recId, base64, filename:"proof.jpg", entry:$('Create credit row').first().json.fields.Entry }}];
```
### Node — Attach proof  [HTTP POST]  (host = content.airtable.com)
- URL: `=https://content.airtable.com/v0/apprpYxg7leO7JXKJ/{{ $json.recId }}/Proof/uploadAttachment`
- Auth: Airtable Token API
- Body: `={{ JSON.stringify({ contentType:"image/jpeg", filename:$json.filename, file:$json.base64 }) }}`
### Node — Respond credit-request  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true, entry: $('Strip prefix').first().json.entry }) }}`
> Skip Strip prefix + Attach proof if `proof` is empty (guard with an IF on `$json.body.proof`).

---

## 12. `credit-requests`
**Payload:** `{ action:"credit-requests", status }`
**Chain:** `List credit rows GET ▸ Map Code ▸ Respond credit-requests`

### Node — List credit rows  [HTTP GET]
- URL: `…/CREDIT_REQUESTS`
- filterByFormula: `={{ $('Webhook').first().json.body.status ? "{Status}='" + $('Webhook').first().json.body.status + "'" : "" }}`
- (no maxRecords)
### Node — Map  [Code]
```javascript
const rows=$('List credit rows').first().json.records||[];
return [{json:{ ok:true, requests: rows.map(r=>({
  entry:r.fields.Entry, requester:r.fields.Requester, requesterId:r.fields["Requester ID"],
  targetName:r.fields["Target Name"], targetId:r.fields["Target Account"],
  amount:r.fields.Amount, status:r.fields.Status, requested:r.fields.Requested,
  proof:(r.fields.Proof&&r.fields.Proof[0])?r.fields.Proof[0].url:null
})) }}];
```
### Node — Respond credit-requests  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 13. `credit-approve`
**Payload:** `{ action:"credit-approve", entry, decision, by, amount, targetId }`
**Chain:**
```
Find credit row GET ▸ Update credit row PATCH ▸ Approved? IF
  ├ true ▸ Find account (credit) GET ▸ Add balance PATCH ▸ Log topup POST ▸ Respond credit-approve
  └ false ▸ ───────────────────────────────────────────▸ Respond credit-approve
```
### Node — Find credit row  [HTTP GET]
- URL: `…/CREDIT_REQUESTS`
- filterByFormula: `={{ "{Entry}='" + $('Webhook').first().json.body.entry + "'" }}`
- maxRecords: `1`
### Node — Update credit row  [HTTP PATCH]
- URL: `=…/CREDIT_REQUESTS/{{ $('Find credit row').first().json.records[0].id }}`
- Body: `={{ JSON.stringify({ fields:{ "Status":$('Webhook').first().json.body.decision, "Decided By":$('Webhook').first().json.body.by } }) }}`
### Node — Approved?  [IF]
- Condition: `={{ $('Webhook').first().json.body.decision }}` · String · is equal to · `Approved`
### Node — Find account (credit)  [HTTP GET]  (true)
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.targetId + "'" }}`
- maxRecords: `1`
### Node — Add balance  [HTTP PATCH]
- URL: `=…/ACCOUNT/{{ $('Find account (credit)').first().json.records[0].id }}`
- Body: `={{ JSON.stringify({ fields:{ "Balance": ($('Find account (credit)').first().json.records[0].fields.Balance||0) + Number($('Webhook').first().json.body.amount) } }) }}`
### Node — Log topup  [HTTP POST]
- URL: `…/TRANSACTIONS`
- Body:
```
={{ JSON.stringify({ fields:{
  "TxnRef":"LD-"+$now.toMillis(), "Type":"Top-up",
  "AccountID":$('Webhook').first().json.body.targetId,
  "Amount":$('Webhook').first().json.body.amount, "By":$('Webhook').first().json.body.by
}, typecast:true }) }}
```
### Node — Respond credit-approve  [Respond to Webhook]
- Body: `={{ JSON.stringify({ ok:true }) }}`  (wire BOTH IF outputs here)

═══════════════════════════════════════════════════════════════════
# GROUP E — PORTAL DASHBOARDS (read aggregations)
═══════════════════════════════════════════════════════════════════

## 14. `admin-overview`
**Payload:** `{ action:"admin-overview" }`
**Chain:** `Read ACCOUNT GET ▸ Read TXN GET ▸ Read DTR GET ▸ Read MENU GET ▸ Build overview Code ▸ Respond admin-overview`

### Node — Read ACCOUNT  [HTTP GET]   URL `…/ACCOUNT`   · Send Query OFF (all rows)
### Node — Read TXN      [HTTP GET]   URL `…/TRANSACTIONS` · Send Query OFF
### Node — Read DTR      [HTTP GET]   URL `…/DTR`         · Send Query OFF
### Node — Read MENU     [HTTP GET]   URL `…/MENU`        · Send Query OFF
> Airtable returns max 100 rows/page. For larger tables add `pageSize`/pagination later; fine for the POC.

### Node — Build overview  [Code]
```javascript
const acc=$('Read ACCOUNT').first().json.records||[];
const txn=$('Read TXN').first().json.records||[];
const dtr=$('Read DTR').first().json.records||[];
const menu=$('Read MENU').first().json.records||[];
const today=$now.format('yyyy-MM-dd');
// group sales by day (last 5 distinct)
const byDay={};
txn.filter(t=>t.fields.Type==="Sale").forEach(t=>{const d=t.fields["Sale Date"]||"";byDay[d]=(byDay[d]||0)+(t.fields.Amount||0);});
const salesByDay=Object.keys(byDay).sort().slice(-5).map(d=>({d,total:byDay[d]}));
return [{json:{ ok:true,
  kpis:{
    people: acc.length,
    salesToday: txn.filter(t=>t.fields.Type==="Sale"&&t.fields["Sale Date"]===today).reduce((s,t)=>s+(t.fields.Amount||0),0),
    txns: txn.filter(t=>t.fields["Sale Date"]===today).length,
    present: dtr.filter(d=>d.fields.Date===today).length
  },
  salesByDay,
  recentTxns: txn.slice(-8).reverse().map(t=>({ref:t.fields.TxnRef,name:t.fields.AccountID,type:t.fields.Type,amount:t.fields.Amount,time:t.fields.Created})),
  attendance: dtr.filter(d=>d.fields.Date===today).map(d=>({name:d.fields.Name,dept:d.fields.Department,in:d.fields["Time In"]||"",out:d.fields["Time Out"]||"",status:d.fields.Status})),
  inventory: menu.map(m=>({name:m.fields["Item Name"],price:m.fields.Price,category:m.fields.Category,available:m.fields.Available!==false}))
}}];
```
### Node — Respond admin-overview  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 15. `client-data`
**Payload:** `{ action:"client-data", role, id }`
**Chain:** `Find account (client) GET ▸ Read TXN (client) GET ▸ Read DTR (client) GET ▸ Build bundle Code ▸ Respond client-data`

### Node — Find account (client)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.id + "'" }}`
- maxRecords: `1`
### Node — Read TXN (client)  [HTTP GET]
- URL: `…/TRANSACTIONS`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.id + "'" }}`
### Node — Read DTR (client)  [HTTP GET]
- URL: `…/DTR`
- filterByFormula: `={{ "{Account ID}='" + $('Webhook').first().json.body.id + "'" }}`
### Node — Build bundle  [Code]
```javascript
const a=($('Find account (client)').first().json.records||[])[0];
if(!a) return [{json:{ok:false,reason:"No record found"}}];
const f=a.fields;
const txn=$('Read TXN (client)').first().json.records||[];
const dtr=$('Read DTR (client)').first().json.records||[];
return [{json:{ ok:true,
  profile:{name:f["Owner Name"], id:f.AccountID, role:f["Owner Type"], status:f.Status},
  balance: f.Balance!=null ? f.Balance : null,
  receipts: txn.slice(-10).reverse().map(t=>({ref:t.fields.TxnRef,type:t.fields.Type,amount:t.fields.Amount,items:t.fields.Items||"—",time:t.fields.Created})),
  attendance: dtr.slice(-10).reverse().map(d=>({date:d.fields.Date,timeIn:d.fields["Time In"]||"",timeOut:d.fields["Time Out"]||"",status:d.fields.Status}))
}}];
```
### Node — Respond client-data  [Respond to Webhook]
- Respond With: **First Incoming Item**

---

## 16. `salary`
**Payload:** `{ action:"salary", id }`
**Chain:** `Find account (salary) GET ▸ Read TXN (month) GET ▸ Sum Code ▸ Respond salary`

### Node — Find account (salary)  [HTTP GET]
- URL: `…/ACCOUNT`
- filterByFormula: `={{ "{AccountID}='" + $('Webhook').first().json.body.id + "'" }}`
- maxRecords: `1`
### Node — Read TXN (month)  [HTTP GET]
- URL: `…/TRANSACTIONS`
- filterByFormula:
```
={{ "AND({AccountID}='" + $('Webhook').first().json.body.id + "',{Type}='Sale',DATETIME_FORMAT({Created},'YYYY-MM')='" + $now.format('yyyy-MM') + "')" }}
```
### Node — Sum  [Code]
```javascript
const txn=$('Read TXN (month)').first().json.records||[];
const items=txn.map(t=>({ref:t.fields.TxnRef,items:t.fields.Items||"",amount:t.fields.Amount||0,time:t.fields.Created}));
return [{json:{ ok:true, total: items.reduce((s,i)=>s+i.amount,0), items }}];
```
### Node — Respond salary  [Respond to Webhook]
- Respond With: **First Incoming Item**

═══════════════════════════════════════════════════════════════════
# APPENDIX — testing & gotchas
═══════════════════════════════════════════════════════════════════
- **$now (Luxon):** `$now.format('yyyy-MM-dd')`, `$now.toISO()`, `$now.toMillis()`, `$now.format('yyyy-MM')`.
- **$itemIndex** is available in nodes that run once-per-item (e.g. create SALE_ITEMS after Split Cart).
- **Reads** are under `.json.records[0].fields` — never `.json.fields`.
- **Reference by name** (`$('NodeName')`) whenever another HTTP node runs in between — `$json` is the latest response.
- **filterByFormula:** field in `{ }`, value in single quotes; combine with `AND( )`.
- **typecast:true** on every single-select write (Owner Type, Status, Sex, P_Role, Direction, Method, Action, Actor Role, Type).
- **Every branch ends in Respond** (First Incoming Item). Switch **Fallback Output** → its own Respond.
- **Test:** `/webhook-test/cafeteria` + "Listen for test event" while building; `/webhook/cafeteria` once Active.
