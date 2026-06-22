# School POC — Cashless Cafeteria + Access-Control Attendance

One installable web app + one n8n workflow + one Airtable base. Three ways to recognise a
person (RFID card, fingerprint, face) all resolve to a single **ACCOUNT**, so the same identity
serves both the cashless cafeteria and the entrance attendance gate.

```
  Capture surfaces            Logic              Source of truth
  ────────────────       ──────────────        ────────────────
  portal.html  ┐
  gate.html    ├──HTTPS──►  n8n workflow  ──►   Airtable base
  cafeteria-pos┘            (/cafeteria)        (apprpYxg7leO7JXKJ)
```

## Folder map

### apps/  — the things people actually use
| File | What it is | Who uses it |
|---|---|---|
| **portal.html** | The PWA. Admin dashboards + **self-service for every role**: Students/Parents/Personnel **order from the menu**, parents **load credit with proof of payment**, personnel see **salary deductions**, and Admin **registers accounts** and views **reports**. | Everyone (role-based login) |
| manifest.json, sw.js, icon.svg | PWA support — make `portal.html` installable + offline. **Keep next to portal.html.** | — |
| **gate.html** | Two-factor entrance station: **RFID tap + face match (same account)** → mark Present/Tardy + open the (theoretical) magnetic gate. | Guard / entrance kiosk |
| **cafeteria-pos.html** | Staffed cashier terminal: tap card → fingerprint confirm → charge, print receipt, cash top-ups, enroll cards. *Optional — only if you run a counter.* | Cashier |

> Menu ordering = portal (self-service). Cashier terminal = cafeteria-pos. They don't overlap.

### reports/
- **sf2_export.py** — fills the DepEd **School Form 2** from DTR attendance data (CSV or live Airtable).
- **SF2_sample_filled.xlsx** — sample output. (You supply the blank `SF2.xlsx` template to fill.)

### bridges/  — local hardware helpers (run on the station PC, only for live hardware)
- **fingerprint-bridge/** — Node service driving the DigitalPersona 4500 (port 9001).
- **print-bridge/** — silent thermal printing to the XP-58IIH (port 9002).
- **arduino-rfid/**, **arduino-nfc/** — sketches that stream card UIDs over USB (Web Serial).

### backend/
- **cafeteria-pos.n8n.json** — importable n8n workflow (the "Route by action" switchboard).

### docs/
- **POC-ARCHITECTURE.md**, **CONNECTION-MANUAL.md**, **SETUP.md** — setup + wiring.
- **system-concept.html** — one-page stakeholder overview (prints to PDF).
- **attendance-legacy.html** — older single-factor facial station; superseded by `gate.html`.

## Running it (demo)

Serve the folder from `localhost` (camera, Web Serial, and PWA install all require it):

```bash
cd school-poc/apps
python -m http.server 8080
# then open http://localhost:8080/portal.html  (and /gate.html)
```

All three apps boot in **DEMO mode** with sample data — no backend needed.

## Going live

1. Build/finish the n8n actions (see **docs/POC-ARCHITECTURE.md** for the full list).
2. Flip each app to live:
   - `portal.html` → set `DEMO_MODE: false` in the CONFIG block.
   - `gate.html` → ⚙ Settings → uncheck Demo mode.
   - `cafeteria-pos.html` → already `DEMO_MODE: false`.
   All three already point at `https://bernard100.app.n8n.cloud/webhook/cafeteria`.

## Test fixtures (seeded in the live base)

| Tap UID | Person | Type | Status | Expected |
|---|---|---|---|---|
| `0A1B2C3D` | Maria Santos · 2026-0500 | Student | Active | Present + gate opens · ₱320 wallet |
| `1B2C3D4E` | R. dela Cruz · EMP-014 | Personnel | Active | Time In / break cycle · salary-deduct |
| `2C3D4E5F` | Troy Sato · 2026-0130 | Student | Lost Card | **Denied** — gate stays shut |

## Identity model (Airtable)

`ACCOUNT` is the hub (AccountID, RFID UID, FINGERPRINT_ID, FACE_BIO_ID, Balance, Status, Owner
Type) and branches to **STUDENT / PARENT / PERSONNEL**. POS writes `TRANSACTIONS` + `SALE_ITEMS`
(+ decrements `MENU.Stock On Hand`); the gate writes `DTR` + `ATTENDANCE`; everything significant
logs to `ACTIVITY_LOG`.
