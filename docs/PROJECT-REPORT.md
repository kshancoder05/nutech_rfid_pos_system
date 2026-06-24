# NUTECH School POC — Full Project Report
**Unified Cashless Cafeteria POS + Two-Factor Access-Control Attendance**
Prepared for: Bernard P. Jocson — NUTECH / Apollo Solar Ventures, Lipa City
Date: 22 June 2026 · Status: Integration & testing phase

---

## 1. Executive summary

The system is a single, unified school platform that runs two functions on **one shared
backend**: a **cashless cafeteria POS** and a **two-factor (RFID + face) access-control
attendance** gate. One person = one **ACCOUNT** = one RFID card + one wallet + one face
record. The card UID is the primary key across every surface; face is a secondary check at
the gate.

**Where the project stands:**
- **Front-end apps:** built and working. Three HTML/PWA surfaces, all validated.
- **RFID hardware:** working on all three apps (POS confirmed; gate + portal fixed this
  session with auto-reconnect).
- **Fingerprint:** removed for now (DigitalPersona device offline). Card-only.
- **Airtable base:** built and seeded with test data; schema complete.
- **n8n workflow:** core POS branches built and working; access-control and portal-dashboard
  branches are in progress (specified, partially built).
- **Outstanding:** finish the remaining n8n branches, delete one Airtable column manually,
  end-to-end test, then flip apps from demo to live.

---

## 2. System architecture

```
  CAPTURE SURFACES                 ORCHESTRATION                 DATA
  ────────────────                 ─────────────                 ────
  portal.html  (PWA) ─┐
  gate.html    (gate) ─┼─ HTTPS POST ─► n8n workflow ─► Airtable base
  cafeteria-pos.html ─┘   {action,...}   "Route by action"     "Nutech POS"
                                          (single webhook)      apprpYxg7leO7JXKJ
```

- **One webhook path:** `https://bernard100.app.n8n.cloud/webhook/cafeteria`
- **One Switch** ("Route by action") fans every request to the correct branch by its
  `action` value.
- **One identity hub:** the **ACCOUNT** table. Role tables (STUDENT / PARENT / PERSONNEL)
  branch off it.

---

## 3. The three applications

### 3.1 cafeteria-pos.html — staffed cashier terminal
- **Purpose:** the canteen checkout. Tap card → see balance → ring up items → pay → receipt.
  Also top-up and card enrollment.
- **Hardware:** reads the Arduino + PN532 RFID over USB (Web Serial). **Confirmed working.**
- **State:** live (`DEMO_MODE:false`). Fingerprint checkout **removed** — card-only.
- **Backend actions used:** `verify`, `purchase`, `topup`, `enroll`, `menu`.

### 3.2 gate.html — entrance station (two-factor attendance)
- **Purpose:** RFID tap → identify person → 1:1 face match (browser camera, face-api.js)
  → write attendance (Time In/Out, Present/Tardy).
- **Hardware:** RFID via **USB HID** or **Arduino over Web Serial** (added + auto-reconnect
  this session); camera via getUserMedia.
- **State:** demo toggle in ⚙ settings; "Test connection" button added.
- **Backend actions used:** `gate-verify`, `gate-punch`.

### 3.3 portal.html — phone/PWA for everyone
- **Purpose:** role-based app. Admin (dashboard, register, cafeteria ordering, credit
  approvals, attendance, people, reports, settings); Parent (credit requests with proof);
  Student; Personnel (salary-deduction view).
- **Hardware:** RFID reader on the **Register** screen (USB HID or Arduino + Web Serial,
  auto-reconnect, auto-arm). Phones normally have no reader — used where the portal runs
  on a PC station.
- **State:** **Settings page added** with demo/live switch, webhook field, Test connection,
  and the POS-style RFID reader selector. Fingerprint capture removed.
- **Backend actions used:** `register-person`, `credit-request`, `credit-requests`,
  `credit-approve`, `admin-overview`, `client-data`, `salary`, `menu`, `account-info`.

**All three share:** the navy/gold (portal) and honey (POS) branding, a demo mode that runs
fully offline on sample data, and a live mode that talks to n8n. Demo vs live is a **toggle,
not an automatic fallback** — chosen ahead of time for predictability.

---

## 4. Hardware status

| Device | Where | Method | Status |
|---|---|---|---|
| Arduino + PN532 RFID | POS PC | Web Serial (USB, 115200) | ✅ Confirmed working |
| Arduino + PN532 RFID | Gate PC | Web Serial + auto-reconnect | ✅ Fixed this session |
| Arduino + PN532 RFID | Portal PC | Web Serial + auto-reconnect | ✅ Fixed this session |
| USB HID RFID reader | Gate / Portal | Keyboard-style UID + Enter | ✅ Supported |
| Camera (face match) | Gate | getUserMedia + face-api.js | ✅ Works (localhost/https, Chrome/Edge) |
| DigitalPersona 4500 fingerprint | — | local bridge (port 9001) | ⛔ Removed for now (device offline) |
| Magnetic gate relay | Gate | local relay bridge | ⚪ Theoretical (not built) |
| Receipt printer XP-58IIH | POS | print-bridge (port 9002) | ⚪ Optional |

**Critical constraint — one reader per page:** a USB reader is owned by a single browser
page at a time. On a single laptop, only one app can hold the Arduino at once (close the POS
tab before using the gate). In production each station has its own reader, so this is moot.

**Arduino sketches** (`bridges/arduino-rfid/`, `bridges/arduino-nfc/`): print one UID per
line at 115200 baud — the same contract all three apps expect.

---

## 5. Airtable base — "Nutech POS" (apprpYxg7leO7JXKJ)

**Identity hub**
- **ACCOUNT** — one row per person: AccountID (PK), RFID UID, FACE_BIO_ID (128-float JSON),
  Balance, Status (Active/Blocked/Lost Card), Owner Name, Owner Type, STUDENT_ID/PARENT_ID/
  PERSONNEL_ID links. *FINGERPRINT_ID column is to be deleted manually — see §8.*

**Role tables**
- **STUDENT** — StudentID (PK), Name, Section, Contact, Email, IsEnrolled, Address, Sex…
- **PARENT** — ParentID (PK), Name, Contact, Email, Address.
- **PERSONNEL** — Personnel_ID (PK), Name, Contact, Email, Role (Teacher/Staff), Salary.

**Cafeteria / money**
- **MENU** — Item, Price, Category, Available, Stock On Hand, Reorder Level, Stock Status (formula).
- **TRANSACTIONS** — TxnRef (PK), Type (Sale/Top-up), AccountID, Amount, Balance After,
  Items, By (cashier), Created, Sale Date (formula).
- **SALE_ITEMS** — one row per cart line: Item, Category, Qty, Unit Price, Line Total
  (formula), Cashier, Account ID. Powers per-item / per-cashier sales + stock decrement.

**Attendance**
- **DTR** — daily time record: Name, Department, Date, Time In/Out, Break, Status, Account ID.
- **ATTENDANCE** — raw taps: AccountID, RFID UID, Direction, Method (incl. Card+Face), Device, Timestamp.

**Workflow support**
- **CREDIT_REQUESTS** — parent top-up requests with photo proof: Requester, Target, Amount,
  Proof (attachment), Status, Decided By.
- **ACTIVITY_LOG** — audit trail: Actor, Actor Role, Action (Login/Sale/Top-up/Register/
  Attendance/Approve Credit/…), Target Ref, Details, Amount, Device.

**Legacy (superseded):** PEOPLE (old face table), REASSIGNMENTS.

**Seeded test fixtures** (delete when done):
| RFID | AccountID | Person | Type | Status |
|---|---|---|---|---|
| 0A1B2C3D | ACC-TEST-MARIA | Maria Santos (₱320) | Student | Active |
| 1B2C3D4E | ACC-TEST-RDC | R. dela Cruz (Teacher) | Personnel | Active |
| 2C3D4E5F | ACC-TEST-TROY | Troy Sato | Student | Lost Card (deny demo) |

---

## 6. n8n workflow — "Cafeteria POS — Nutech RFID System"

**Pattern:** every branch is HTTP Request nodes (raw Airtable REST API), Code nodes
(reshape), IF nodes (branch), and Respond nodes. Auth = the "Airtable Token API" credential,
carried automatically when nodes are copied. Base URL `api.airtable.com/v0/apprpYxg7leO7JXKJ/<TABLE>`.

### 6.1 Built & working
| Action | Function |
|---|---|
| `verify` | POS card tap → identity + balance |
| `purchase` | Ring up sale; deduct balance; **+ Split Cart → SALE_ITEMS → stock decrement → Log Activity** |
| `topup` | Add to wallet; log transaction |
| `enroll` | Link a blank card to an account |
| `menu` | Return menu items |
| `bio-enroll`, `bio-template` | (fingerprint — now unused, safe to delete) |
| `account-info` | Return a person's wallet/identity (**= "check balance"**) |
| `reassign` | Move a card to a new owner |
| `register` | (old — creates ACCOUNT only; superseded by `register-person`) |

### 6.2 In progress / to build (specified in docs)
| Action | Function | Notes |
|---|---|---|
| `gate-verify` | Gate tap → identity + face on file + today's punches | build first; curl-test Maria |
| `gate-punch` | After face match → write DTR + ATTENDANCE | IF: update vs create |
| `register-person` | Create ACCOUNT **and** role row together | replaces old `register` |
| `credit-request` | Parent request + photo upload (content.airtable.com) | |
| `credit-requests` | List pending requests | |
| `credit-approve` | Approve → credit wallet + log | IF on decision |
| `admin-overview` | Dashboard totals | **JSON-respond fix needed — see §7** |
| `client-data` | One person's history | |
| `salary` | Personnel monthly cafeteria spend | |
| nightly "mark Absent" | scheduled workflow | separate from webhook |

### 6.3 The "attendance" action (clarification)
The old single-tap `attendance` branch is **obsolete** — replaced by `gate-verify` +
`gate-punch`. Don't build it. The word "Attendance" elsewhere is just a value written into
ACTIVITY_LOG's **Action** field (a category label), not a Switch branch.

---

## 7. Known issue under test: "Invalid JSON in Response Body"

Several new Respond nodes throw this. **Cause:** in Respond-to-Webhook with *Respond With =
JSON*, handing it a pre-stringified value trips n8n's JSON validation. **Fix:** set
**Respond With → "First Incoming Item"** (removes the Response Body field entirely; n8n
serializes the upstream object itself). Apply to every Respond node. The upstream Code nodes
are correct — they already `return [{ json: {…} }]`.

Companion HTML symptom "Cannot reach n8n" = the workflow isn't **Active** yet (production URL
is dead until the top-right toggle is on). Both clear once the workflow is Active and the
Respond nodes use "First Incoming Item".

---

## 8. Outstanding tasks

**You (Bernard):**
1. **Delete the FINGERPRINT_ID column** in the ACCOUNT table (Airtable API can't delete
   fields — it's a 2-click manual step: column header ▸ Delete field). Field is empty; no
   data lost. STUDENT/PARENT/PERSONNEL have no fingerprint column.
2. **Finish the n8n branches** in §6.2, build order: gate-verify → gate-punch →
   register-person → credit trio → admin-overview/client-data/salary → nightly absent.
3. **Set every Respond node to "First Incoming Item"** (§7).
4. **Activate** the workflow; curl-test each branch with the test fixtures.
5. **Flip apps to live:** portal Settings → live; gate ⚙ → uncheck demo (POS already live).
6. (Optional) Delete unused `bio-enroll` / `bio-template` n8n branches.

**Already done (this session and prior):**
- All schema built + seeded; RFID working on all three apps with auto-reconnect; fingerprint
  removed from all apps; demo/live toggles on every app; POS-style reader UI in portal;
  full click-by-click n8n build guides written.

---

## 9. Testing approach (safe)

- Use the **test webhook URL** (`/webhook-test/cafeteria`) + "Listen for test event" while
  building — fires only while you watch, nothing goes live.
- Test **read-only branches first** (gate-verify, menu, account-info, the dashboards) — they
  can't harm data. Then **row-creating** branches (gate-punch, register, credit-request).
  Then **balance-changing** branches (topup, purchase, credit-approve) — only against Maria,
  noting her ₱320 starting balance.
- Eyeball the Airtable row after each write. Airtable keeps revision history as a safety net.
- Keep apps in **demo** until curl proves each branch.

---

## 10. Documentation index (docs/)
- **N8N-CLICKS.md** — click-by-click build of all branches (simplest).
- **N8N-BRANCHES.md** — exact URLs / filters / Code to paste.
- **N8N-NODE-TYPES.md** — node type of every node.
- **N8N-BUILD.md** — architecture.
- **N8N-CHECK-BALANCE.md** — balance lookup + Airtable connection explained.
- **PROJECT-REPORT.md** — this document.
- Plus HARDWARE.md, SETUP.md, CONNECTION-MANUAL.md, POC-ARCHITECTURE.md.

---

## 11. Go-live checklist
- [ ] FINGERPRINT_ID column deleted in Airtable
- [ ] All §6.2 branches built
- [ ] Every Respond node = "First Incoming Item"
- [ ] Workflow toggled **Active** (only one workflow owns `/cafeteria`)
- [ ] Each branch curl-tested against fixtures
- [ ] Apps flipped to live (portal + gate), Test connection ✓
- [ ] Test fixtures deleted, real students/menu loaded
- [ ] Each station has its own RFID reader
