# School RFID System — Proof-of-Concept Architecture

**Demo goal:** two subsystems that share one student identity.
1. **Attendance** — demonstrated on the **Dahua ASI3213A-W** face/card terminal.
2. **Cashless cafeteria payments** — demonstrated on the **POS app**.

Both read and write the **same Airtable base** (`Nutech RFID System`), tied together by one shared key.

---

## The one rule that ties it together

> **The card UID (`RFID UID`) is the single shared identity.**

It lives on the **ACCOUNT** table as plain text, and it is the same value the Dahua reads, the POS taps, and Airtable matches. Get this right and everything lines up automatically. The ACCOUNT table is the **hub / source of truth**; every other table hangs off it.

```
                         ┌──────────────────────────┐
   Dahua ASI3213A-W ───► │   AIRTABLE                │ ◄─── POS app (cafeteria)
   (face + card)         │   ACCOUNT  ← the hub      │      (card tap)
   attendance            │   key = RFID UID (text)   │      payments
        │                │   • Owner Name / Type     │           │
        │                │   • Balance, Status       │           │
        ▼                │                           │           ▼
   ATTENDANCE table      │   ATTENDANCE  TRANSACTIONS│      TRANSACTIONS table
   (check in/out)        └──────────────────────────┘      (top-ups, purchases)
              both flows go through n8n  (one webhook: /cafeteria)
```

---

## Subsystem A — Attendance (Dahua)

**On the device:** a student is enrolled once with **face + card + name** on the terminal's touchscreen. Day to day, they look at the camera (or tap the card) and the Dahua records a check-in.

**Into Airtable:** the terminal sends each check-in to n8n, which looks up the card in ACCOUNT and writes a row to the new **ATTENDANCE** table (who, in/out, method, device, timestamp).

n8n action: **`attendance`** — payload `{ action:"attendance", rfid, direction, method, device }` → finds the ACCOUNT by `RFID UID` → appends to ATTENDANCE → returns the student name.

**Two ways to feed it (pick per how polished the demo needs to be):**
- **Simplest for the POC** — show the Dahua doing face recognition live on its own screen, and trigger the matching Airtable row with a simple POST to the `attendance` endpoint (a script, or even the card tapped into a tiny helper). Proves the end-to-end path without deep device integration.
- **Real integration** — configure the Dahua's **HTTP event push** to post access events to the n8n webhook, or use the **Dahua HTTP API / NetSDK** (needs a small connector to translate the device's event format), or the **DSS Pro OpenAPI** if that platform is in play. These need the device's IP + credentials and a bit of mapping work; not required to demo the concept.

> What the device can't hold: contact / parent details (its person record only has name, card, face, user ID, validity), and the face template never leaves the device. Rich info lives in Airtable; the face stays on the Dahua. They're joined by the card UID.

---

## Subsystem B — Cashless payments (POS app)

Unchanged and already working: tap a card → the app calls n8n → n8n reads/writes ACCOUNT + logs to TRANSACTIONS → the app prints a numbered receipt on the XP-58IIH.

n8n actions in play: `verify`, `purchase`, `topup`, `account-info`, `register`, `reassign`, `menu`, plus the optional `bio-enroll` / `bio-template` for fingerprint (deferred).

The POS identifies a student from **ACCOUNT alone** (`RFID UID` → `Owner Name`), so it does **not** depend on the STUDENT table being linked — which matters given the schema note below.

---

## Airtable data model (finalized)

| Table | Role | Key |
|---|---|---|
| **ACCOUNT** | **Hub / source of truth** — card, owner, wallet, status | `RFID UID` + `AccountID` (both text) |
| **ATTENDANCE** | Check-in/out log from the Dahua | `RFID UID`, `AccountID` (text) |
| **TRANSACTIONS** | Cafeteria ledger (top-ups, purchases) | `AccountID` (text) |
| **REASSIGNMENTS** | Card-ownership change audit | `AccountID` (text) |
| **STUDENT / PARENT** | Optional richer detail (contact, grade, section) | linked to ACCOUNT |

**Design choice for the POC: text keys, not linked records.** n8n matches and writes by text (`{RFID UID}='…'`). Keeping ACCOUNT, ATTENDANCE, TRANSACTIONS on plain-text keys is what makes the demo reliable. The STUDENT/PARENT link fields are fine for clicking around in Airtable, but nothing the two demos *need* depends on them.

### One cleanup to do in the Airtable UI (not doable via API)
The base picked up a few linked-record conversions that should be reverted for a clean demo:
- **`STUDENT.StudentName`** is currently a *linked-record* field — it should be a plain **Single line text** field (a name, not a link).
- There's a stray **`STUDENT 2`** link field on ACCOUNT that can be deleted.
- `STUDENT.AccountID` / `PARENT.AccountID` became links — either leave them (the POS ignores them) or switch back to Single line text for consistency.

Field *type* changes can't be done through the API, so these are quick manual fixes in the Airtable interface. None of them block the demo because both systems run off ACCOUNT.

---

## What registration looks like for the POC

For the demo, the cleanest onboarding is **form-first**, with the face added on the device:
1. In the POS app's **Enroll → Register a new card**, tap the card and enter name/type/ID. n8n generates the `ACC-…` ID and creates the ACCOUNT row (wallet = ₱0, Active).
2. Enroll that same person's **face on the Dahua**, using the **same card number** (and ideally device User ID = the AccountID).
3. Now: the Dahua knows them by face for attendance, and the POS knows them by card for payments — same identity.

---

## Demo script (suggested)

1. **Register** a student in the POS app (creates the ACCOUNT). Enroll their face on the Dahua with the same card.
2. **Attendance:** student faces the Dahua → check-in appears in the **ATTENDANCE** table.
3. **Top-up:** load ₱100 onto the card in the POS → balance updates, TRANSACTIONS row + `LD-…` receipt.
4. **Purchase:** build an order, tap the card → balance deducts, `OR-…` receipt prints on the XP-58IIH.
5. Show that attendance and payments both point to the **same student** in ACCOUNT.

---

## Quick test for the attendance endpoint (no device needed)
Records an attendance row for a known card, exactly as the Dahua push would:
```
curl -X POST https://bernard100.app.n8n.cloud/webhook/cafeteria \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"attendance\",\"rfid\":\"0009558453\",\"direction\":\"In\",\"method\":\"Face\"}"
```
