# N8N-NODE-TYPES.md — what *type* each node is

The build guide names nodes; this file says **which n8n node type** each one is and its settings.
There are only **four** node types in this whole workflow:

| Type | n8n node | What it does | When to use |
|---|---|---|---|
| **Code** | "Code" (JavaScript) | shape/compute data in JS | any "Build…", "Split…", "Compute…", "Map…", "Sum…" step |
| **HTTP** | "HTTP Request" | call the Airtable REST API | every "Find…", "Read…", "Create…", "Update…", "List…" step |
| **IF** | "IF" | branch true/false | every "… OK?", "… exists?", "Approved?" step |
| **Respond** | "Respond to Webhook" | send the JSON reply | every "Respond …" step |

> Rule of thumb: **talks to Airtable → HTTP Request. Thinks in JS → Code. Branches → IF. Replies → Respond.**
> Your existing POS branches already follow this exact pattern.

---

## The purchase write-hooks chain — every node typed

Existing branch (unchanged):
`Find account (purchase)`(HTTP) → `Validate purchase`(Code) → `Purchase OK?`(IF) →
`Deduct balance`(HTTP) → `Log purchase`(HTTP) → `Respond purchase`(Respond)

You add a second wire **out of `Log purchase`** into these new nodes:

### 1. `Split cart` — **Code node**
- Add node → search **"Code"** → Language: JavaScript.
- Paste:
```js
const v = $('Validate purchase').item.json;       // your existing node's output
const items = $('Webhook').first().json.body.items || [];
return items.map((it, i) => ({ json: {
  lineRef: v.receiptNo + "-" + (i + 1),
  txnRef:  v.receiptNo,
  name: it.name, qty: it.qty, price: it.price,
  accountId: v.accountId, cashier: "Cashier"
}}));
```
- Returning an **array** = n8n fans out to one item per cart line.

### 2. `Create SALE_ITEMS` — **HTTP Request node**  ← this is the one you asked about
- Add node → search **"HTTP Request"**.
- **Method:** POST
- **URL:** `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/SALE_ITEMS`
- **Authentication:** Predefined Credential Type → **Airtable Personal Access Token** (the same
  `airtableTokenApi` credential your existing nodes use — pick it from the dropdown).
- **Send Body:** ON → Body Content Type: **JSON** → **Using JSON** =
```
={{ JSON.stringify({ fields: {
  "Line Ref": $json.lineRef, "TxnRef": $json.txnRef, "Item Name": $json.name,
  "Qty": $json.qty, "Unit Price": $json.price, "Cashier": $json.cashier,
  "Account ID": $json.accountId, "Created": $now.toISO()
} }) }}
```
- Because `Split cart` emitted N items, **n8n runs this node N times** → N rows. No loop.

> **This is an HTTP Request node, not an "Airtable node."** n8n *does* ship a built-in Airtable
> node, but your whole workflow uses raw HTTP Request calls (more control, one credential). Stay
> consistent — copy an existing node like `Log purchase` and just change the URL + body.

### 3. `Find MENU item` — **HTTP Request node** (read, to get the current stock)
- **Method:** GET
- **URL:** `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/MENU`
- Auth: same Airtable credential.
- **Send Query:** ON → add two params:
  - `filterByFormula` = `={{ "{Item Name}='" + $json.name + "'" }}`
  - `maxRecords` = `1`

### 4. `Compute new stock` — **Code node**
```js
const menu = $json.records?.[0];
const line = $('Split cart').item.json;
return [{ json: {
  recordId: menu ? menu.id : null,
  newStock: menu ? (Number(menu.fields["Stock On Hand"] || 0) - line.qty) : null
}}];
```

### 5. `Update MENU stock` — **HTTP Request node** (PATCH)
- **Method:** PATCH
- **URL:** `=https://api.airtable.com/v0/apprpYxg7leO7JXKJ/MENU/{{ $json.recordId }}`
- Auth: same.
- **Send Body:** JSON = `={{ JSON.stringify({ fields: { "Stock On Hand": $json.newStock } }) }}`

### 6. `Log activity (Sale)` — **HTTP Request node** (POST)
- POST `https://api.airtable.com/v0/apprpYxg7leO7JXKJ/ACTIVITY_LOG`, JSON body:
```
={{ JSON.stringify({ fields: {
  "Log Ref": "LOG-" + Date.now().toString(36).toUpperCase(),
  "Timestamp": $now.toISO(), "Actor": "Cashier", "Actor Role": "Cashier",
  "Action": "Sale", "Target Ref": $('Validate purchase').item.json.accountId,
  "Amount": $('Validate purchase').item.json.total
}, typecast: true }) }}
```

That's the whole hooks branch: **Code → HTTP → HTTP → Code → HTTP → HTTP.** No IF, no Respond
(the cashier was already answered by `Respond purchase`).

---

## The same typing for every other new branch

Read it as: **(HTTP)** = HTTP Request, **(Code)** = Code, **(IF)** = IF, **(Respond)** = Respond to Webhook.

**register-person**
`Build register`(Code) → `Create role row`(HTTP POST, URL uses `{{ $json.roleTable }}`) →
`Create account`(HTTP POST /ACCOUNT) → `Log activity`(HTTP POST /ACTIVITY_LOG) →
`Respond register-person`(Respond)

**gate-verify**
`Find account (gate)`(HTTP GET /ACCOUNT) → `Find DTR today`(HTTP GET /DTR) →
`Build verify`(Code) → `Respond gate-verify`(Respond)

**gate-punch**
`Find DTR today`(HTTP GET /DTR) → `Build punch`(Code) → `DTR exists?`(IF) →
 true → `Update DTR`(HTTP PATCH /DTR/{{id}})   false → `Create DTR`(HTTP POST /DTR)
 → (both continue to) `Create ATTENDANCE`(HTTP POST /ATTENDANCE) →
`Log activity`(HTTP POST) → `Respond gate-punch`(Respond)

**credit-request**
`Create credit row`(HTTP POST /CREDIT_REQUESTS) → `Attach proof`(HTTP POST to
`content.airtable.com/.../uploadAttachment`) → `Respond credit-request`(Respond)

**credit-requests**
`List credit rows`(HTTP GET /CREDIT_REQUESTS, filter Status) → `Map`(Code) → `Respond`(Respond)

**credit-approve**
`Update credit row`(HTTP PATCH) → `Approved?`(IF) →
 true → `Find account`(HTTP GET) → `Add balance`(HTTP PATCH) → `Log topup`(HTTP POST /TRANSACTIONS)
 → `Log activity`(HTTP POST) → `Respond`(Respond)

**admin-overview**
`Read ACCOUNT`(HTTP GET) → `Read TRANSACTIONS`(HTTP GET) → `Read DTR`(HTTP GET) →
`Read MENU`(HTTP GET) → `Build overview`(Code) → `Respond`(Respond)
*(chain the four GETs one after another; each later Code can reference any earlier node by name.)*

**client-data**
`Find account`(HTTP GET) → `Read TRANSACTIONS`(HTTP GET) → `Read DTR`(HTTP GET) →
`Build bundle`(Code) → `Respond`(Respond)

**salary**
`Find account`(HTTP GET) → `Read TRANSACTIONS (month)`(HTTP GET) → `Sum`(Code) → `Respond`(Respond)

---

## Fastest way to build each HTTP node: duplicate an existing one

You already have ~23 correctly-configured Airtable HTTP nodes. To make a new one:
1. Click an existing node that's the right verb (e.g. `Log purchase` for a POST create, `Find
   account (purchase)` for a GET read, `Deduct balance` for a PATCH update).
2. **Copy → Paste** it.
3. Change only the **URL** (table name) and the **JSON body / filterByFormula**.
4. The credential carries over, so auth is already correct.

That's the trick — you're never configuring an Airtable node from scratch, just cloning the pattern
you already have and swapping the table + fields.
