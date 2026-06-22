# Cafeteria POS — Setup (live: Nutech RFID System)

Files:
- **cafeteria-pos.html** — the terminal (browser)
- **cafeteria-pos.n8n.json** — the backend workflow
- **arduino-rfid/rfid_reader.ino** — Arduino RFID firmware (RC522)
- **fingerprint-bridge/** — local service for the DigitalPersona 4500
- **print-bridge/** — local ESC/POS service for the XP-58IIH receipt printer

Ships in **Demo mode** (sample data, no backend, simulated hardware). Flip the switch in Settings to go live.

---

## Your base — already built
Base: **Nutech RFID System** (`apprpYxg7leO7JXKJ`)
ACCOUNT = card identity + wallet (`RFID UID`, `Balance`, `Status`, `Fingerprint Template`, `Bio Enrolled`); STUDENT links by `AccountID`; MENU = products; TRANSACTIONS = ledger.
**Every tap:** card → ACCOUNT by `RFID UID` → STUDENT by `AccountID`.

## 1. n8n
Import `cafeteria-pos.n8n.json`, attach an Airtable PAT credential (read+write) to the HTTP nodes, activate, copy the webhook base. App → Settings → Demo off → paste URL → Test connection.

## 2. RFID via Arduino (optional)
Wire an RC522, upload `rfid_reader.ino`, then Settings → RFID reader → Arduino over USB → Connect. The USB HID reader still works with no setup.

## 3. Fingerprint (DigitalPersona 4500, optional)
Install the DigitalPersona runtime, run `fingerprint-bridge` (`npm install && npm start`), set the bridge URL in Settings, enroll prints in the Enroll tab, toggle "Require fingerprint to pay." Matching stays local. Biometric data — get consent.

---

## 4. Receipt printer (XP-58IIH)

The XP-58IIH is a 58mm ESC/POS printer. Plug its USB cable into the laptop. You have two ways to print — pick one in **Settings → Receipt printer → Print method**.

### Method A — Browser (simplest, recommended for a laptop)
Uses the installed Windows driver. No extra service.
1. Install the **XP-58IIH / Xprinter driver** (from the CD or xprinter.net). The printer appears in **Devices & Printers**.
2. Set it as the **default printer**. In its preferences set paper to **58mm** so margins are right.
3. In the app keep **Print method = Browser**, set the receipt **header/footer**, and leave **Auto-print on each sale** on.
4. **For no print dialog** (a real POS line), launch Chrome with kiosk printing:
   ```
   chrome.exe --kiosk-printing --app=http://localhost:8080/cafeteria-pos.html
   ```
   With that flag, each sale prints silently to the default printer.

### Method B — ESC/POS bridge (silent, with auto-cut)
Crisp text mode and a paper cut after each receipt.
1. Still install the Windows driver (gives the bridge a printer name to target).
2. Run the bridge:
   ```
   cd print-bridge
   npm install
   npm start                                  # SIMULATION: prints to the console
   SIMULATE=false PRINTER_IFACE="printer:XP-58" npm start
   ```
   Set `PRINTER_IFACE` to the printer's exact name from Devices & Printers.
3. In the app: Print method = **ESC/POS bridge**, set the bridge URL (`http://localhost:9002`), then **Test print**.

Either way, every confirmed sale produces a receipt with the store header, line items, total, "Paid via RFID wallet," the new balance, and your footer. There's also a **Print receipt** button on the payment confirmation, and **Test print** in Settings.

---

## 5. Before go-live
- Enroll each existing account once (captures the real card UID; set a starting balance).
- **Serve the page from `http://localhost`** on the till PC — this gives a secure context for Web Serial (Arduino) and lets the page reach the local bridges without mixed-content blocking. A one-liner works: `npx serve` or `python -m http.server 8080` in the app folder.
- **CORS for n8n:** add `Access-Control-Allow-Origin` on the Webhook node. Both local bridges already send CORS headers.
- Ports in use: n8n webhook (cloud), fingerprint bridge `9001`, print bridge `9002`.
