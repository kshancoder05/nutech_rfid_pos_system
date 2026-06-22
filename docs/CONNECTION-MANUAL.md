# Cafeteria POS — Connection Manual

A step-by-step guide to wiring everything together. Do the parts **in order**. Part 1 is the only required one — the rest are optional add-ons.

---

## The big picture (what talks to what)

```
   CARD READER ──types card number──►  ┌─────────────────┐
                                       │   POS APP       │
   FINGERPRINT ──(helper program)───►  │  (web page in   │ ──► n8n (cloud) ──► AIRTABLE
     scanner                           │   Chrome, on    │      = the brain      = the
                                       │   the laptop)   │ ◄──   that decides    database
   PRINTER  ◄──(Windows driver)──────  └─────────────────┘
```

- The **POS app** is the hub. It runs in Chrome on the till laptop.
- **n8n** is the brain in the cloud. The app asks it questions ("who owns this card?", "charge ₱55").
- **Airtable** is your database. n8n reads and writes it.
- The **card reader** types the card number into the app.
- The **fingerprint scanner** is reached through a small helper program (a "bridge") on the laptop.
- The **printer** prints through Windows.

---

## Part 1 — Connect the app to your database (REQUIRED)
### App → n8n → Airtable

This is the core. Once this works, the POS is usable.

**Step 1 — Get your Airtable key**
1. Go to **airtable.com** → your account → **Builder hub** → **Personal access tokens** → **Create token**.
2. Give it a name (e.g. "Cafeteria POS").
3. Add scopes: **`data.records:read`** and **`data.records:write`**.
4. Under "Access," add the base **Nutech RFID System**.
5. Click **Create**, then **copy the token** (it starts with `pat…`). Keep it private — treat it like a password.

**Step 2 — Set up n8n**
1. Open n8n → **Import from File** → choose `cafeteria-pos.n8n.json`.
2. Create an **Airtable credential** using the token from Step 1.
3. Open each **HTTP Request** node (the ones named "Find account…", "Deduct balance," "Log purchase," etc.) and pick that credential.
4. Turn the workflow **ON** with the **Active** toggle (top-right).
5. Copy the **Production** webhook address. You only need the part ending in `/webhook`, e.g.
   `https://bernard100.app.n8n.cloud/webhook`
6. **Allow the browser to call it (CORS):** open the **Webhook** node → Options → add a Response Header
   **`Access-Control-Allow-Origin`** = `*` (you can tighten this to your page's address later).

**Step 3 — Point the app at n8n**
1. Open `cafeteria-pos.html` in **Chrome** (served from localhost — see Part 5).
2. Click the **gear (Settings)** → turn **Demo mode OFF**.
3. Paste the webhook address into **"n8n webhook base URL"**.
4. Click **Test connection** → it should say it loaded the menu. Done.

> ⚠️ Two things prevent this from connecting:
> - The address **must start with `https://`** (not `http://`).
> - The workflow **must be Active**.
> If either is wrong you'll see *"not registered for GET requests."* That message also appears if you simply open the webhook link in a browser — that's normal, the app is what sends the correct request.

---

## Part 2 — Make card taps work (RFID)

Your reader already reads cards. Two things make a tap actually *do* something:

**A. Tap into the right place.**
The reader "types" the card number wherever your cursor is. So before tapping, **click an empty part of the POS page** (not a text box, not a chat window). If a text box is selected, the number goes there instead. (That's why a card number sometimes lands in the wrong window.)

**B. Enroll each card once.**
A new card isn't linked to anyone yet, so a tap returns "Card not recognized." To link it:
1. Settings → **RFID reader = USB HID reader** (the default).
2. Open the **Enroll Card** tab → **tap the card** (its number appears) → type the **Student ID** → **Link**.
3. Now tapping that card on the **Point of Sale** screen shows the student and balance.

*(Using the Arduino/PN532 reader instead? Settings → RFID reader = **Arduino over USB** → **Connect Arduino** → pick the port. Then enroll cards the same way.)*

---

## Part 3 — Fingerprint scanner (OPTIONAL)
### U.are.U 4500 → the app

Skip this if you're not using fingerprints yet — **the POS works fully without it.**

1. **Install the driver/SDK** on the laptop: the DigitalPersona U.are.U SDK from **HID Global** (`sdk.hidglobal.com`). This lets the laptop talk to the scanner.
2. **Install Node.js** (`nodejs.org`, the LTS version) — the helper program needs it.
3. Put the **`fingerprint-bridge`** folder on the laptop. Open a terminal there and run:
   - `npm install`  (once)
   - `npm start`  → it shows `…on http://localhost:9001`. **Leave this window open.**
4. In the app: Settings → **Fingerprint bridge URL** = `http://localhost:9001` → **Check scanner**.
5. To use it: turn on **"Require fingerprint to pay."** To enroll a finger: in the Enroll tab, after linking a card, click **"Capture fingerprint for this card."**

> It starts in **simulation mode** so you can test the flow before the real scanner is wired in. The actual scanner needs the SDK calls added to the bridge — that's a developer step.

---

## Part 4 — Receipt printer (OPTIONAL)
### XP-58IIH

1. Install the **XP-58IIH driver** (Xprinter), set it as the **default printer**, set paper to **58mm**.
2. App → Settings → **Print method = Browser** → **Test print**.
3. For silent printing (no dialog each sale), launch Chrome with the kiosk flag:
   `chrome.exe --kiosk-printing --app=http://localhost:8080/cafeteria-pos.html`
4. *(Advanced: run `print-bridge` on port 9002 for crisp text + auto-cut.)*

---

## Part 5 — The one rule that makes it all work: open from `localhost`

**Do not double-click the HTML file.** That opens it as `file://`, which blocks the card reader (Arduino mode) and the helper programs.

Instead, **serve the page** from the folder it's in:
- In a terminal in the app folder, run one of:
  - `python -m http.server 8080`, or
  - `npx serve`
- Then open **`http://localhost:8080/cafeteria-pos.html`** in Chrome.

This single step is what lets the Arduino reader and the bridges connect.

---

## Daily startup (once everything is set up)

1. Plug in the devices (reader, scanner, printer).
2. *(If using them)* start the fingerprint bridge and print bridge.
3. Start the local web server, then open the page in Chrome.
4. Tap a card to begin.

*(This is the part worth turning into a single double-click — ask and I'll make a `start.bat`.)*

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| *"not registered for GET requests"* | Use the **https** webhook address, make sure the workflow is **Active**, and test from the app — not by opening the link in a browser. |
| Card number appears in the wrong window | Click the POS page first; make sure no text box is selected. |
| *"Card not recognized"* | Enroll the card first (Part 2B). |
| Test connection fails (not the GET error) | Add the **CORS header** on the Webhook node (Part 1, Step 2.6); confirm Demo mode is OFF and the URL is right. |
| Fingerprint "bridge not reachable" / scanner not found | Make sure the bridge window is running, and the page is opened from **http://localhost**. |
| Arduino reader won't connect | Use **Chrome/Edge**, open the page from **localhost**, and close the Arduino IDE Serial Monitor (it holds the port). |

---

### Reference (already set for you)
- Airtable base: **Nutech RFID System** (`apprpYxg7leO7JXKJ`)
- n8n webhook path: **`/cafeteria`** (one address handles everything)
- Fingerprint bridge: port **9001** · Print bridge: port **9002**
