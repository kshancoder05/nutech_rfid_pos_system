# Cafeteria POS — Setup Guide

Two files:
- **cafeteria-pos.html** — the terminal (cashier/admin run this in a browser)
- **cafeteria-pos.n8n.json** — the backend workflow (import into n8n)

The app ships in **Demo mode** so you can try the whole flow with no backend. Flip the switch in **Settings** to go live.

---

## 1. Airtable schema

Your three tables, extended with the two pieces a cashless wallet actually needs (a **Balance** on each student and a **Transactions** ledger).

### Students
| Field | Type | Notes |
|---|---|---|
| Student ID | Single line text | e.g. `2026-0418` |
| RFID UID | Single line text | written during enrollment; the lookup key for every tap |
| Student Name | Single line text | |
| Grade Level | Single line text / Single select | |
| Section | Single line text | |
| Balance | Currency / Number | the wallet "load" |
| Status | Single select | `Active`, `Blocked`, `Lost Card` |

### Parents
| Field | Type | Notes |
|---|---|---|
| Parent Name | Single line text | |
| Relation | Single select | Mother / Father / Guardian |
| Student | Link to **Students** | better than free-text name (the app still works either way) |
| Contact Number | Phone | for the optional low-balance SMS below |

### Menu  *(your "Cafeteria" products)*
| Field | Type |
|---|---|
| Item Name | Single line text |
| Price | Currency / Number |
| Category | Single select (Meals / Snacks / Drinks) |
| Available | Checkbox |

### Transactions  *(the ledger — every top-up and purchase)*
| Field | Type |
|---|---|
| Type | Single select (`Purchase` / `Top-up`) |
| Student ID | Single line text |
| Student Name | Single line text |
| Amount | Currency / Number |
| Items | Long text (JSON of the order) |
| Balance After | Currency / Number |
| By | Single line text (cashier/terminal) |
| Created | Created time |

> Field names must match **exactly** (including spaces) — the workflow reads them by name.

---

## 2. Import the n8n workflow

1. n8n → **Import from File** → `cafeteria-pos.n8n.json`.
2. **Credentials:** create an **Airtable Personal Access Token** credential with scopes `data.records:read` and `data.records:write`, on the right base.
3. Open each **HTTP Request** node and pick that credential (the dropdown is already set to Airtable token type).
4. **Find & replace** `appXXXXXXXXXXXXXX` in every HTTP node URL with your real **Base ID** (starts with `app…`, visible in the Airtable API docs for your base).
5. **Activate** the workflow, then copy the **Production** URL of the `Webhook` node — you only need the base part, e.g. `https://bernard100.app.n8n.cloud/webhook`.

The whole thing is one webhook, `/cafeteria`, that receives `{ action, ... }` and a Switch routes to: `verify`, `purchase`, `topup`, `enroll`, `menu`.

---

## 3. Point the app at n8n

Open the app → **⚙ Settings** → turn **Demo mode off** → paste your webhook base URL → **Test connection**. (Or edit the `CONFIG` block at the top of the HTML once and host it.)

---

## 4. The RFID reader

Use any **USB HID "keyboard-emulation" reader** (the common 125 kHz EM4100 or 13.56 MHz MIFARE USB readers). They type the card's UID and press Enter — the app listens globally for that, so **no driver or pairing is needed**. Just plug it in and tap; the page captures the tap even when no field is focused.

If your reader outputs a different format than what's stored, enroll the card once (Enroll tab) and the exact UID it emits gets saved to the student — so reads always match afterward.

---

## 5. One thing to decide before go-live: CORS

The browser calls n8n directly. On n8n Cloud, add an **`Access-Control-Allow-Origin`** response header (set it to your hosting domain, or `*` while testing) on the `Webhook` node's options, **or** put the app behind the same domain. Without this, live calls are blocked by the browser. Demo mode is unaffected.
