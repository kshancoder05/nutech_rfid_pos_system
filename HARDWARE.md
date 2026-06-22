# HARDWARE.md — devices, wiring, and what each app uses

Three capture devices feed the system: the **laptop/tablet camera** (face), a **DigitalPersona
4500** (fingerprint, USB), and a **PN532 NFC reader on an Arduino** (RFID, USB). They all resolve
to one `ACCOUNT`.

## Status at a glance

| Device | How it connects | Real now? |
|---|---|---|
| Camera (face) | Browser `getUserMedia` + face-api.js, **in the page** | ✅ Real (toggle "Use real camera") |
| PN532 RFID on Arduino | Arduino → USB → **Web Serial API** in the browser | ✅ Real (Chrome/Edge) |
| DigitalPersona 4500 | USB → **local Node bridge** (`localhost:9001`) | ⚠️ Bridge runs in SIMULATE until the U.are.U SDK is wired |
| Magnetic gate relay | needs a **local relay bridge/controller** | ⛔ Theoretical — browser can't pull a relay |
| XP-58IIH printer (POS only) | USB → **local print bridge** (`localhost:9002`) | ✅ via bridge |

## Which app uses which device

| App | Camera | RFID (PN532) | Fingerprint (4500) | Printer | Gate relay |
|---|---|---|---|---|---|
| **gate.html** (entrance) | ✅ face match | ✅ tap | — | — | ✅ (when bridged) |
| **cafeteria-pos.html** (cashier) | — | ✅ tap | ✅ confirm pay | ✅ receipts | — |
| **portal.html** (PWA) | capture on register* | capture on register* | capture on register* | — | — |
| attendance-legacy.html | ✅ face | — | — | — | — |

\* In `portal.html` the registration screen's card/fingerprint/face capture is **simulated** right
now. To capture for real, it reuses the same paths the POS and gate use (Web Serial, the
fingerprint bridge, the camera) — wire those when you move registration to live hardware.

## Shared requirements (all local hardware)

- Serve the page from **`http://localhost`** (or HTTPS). `file://` blocks camera + Web Serial.
- **Chrome or Edge** — Web Serial isn't in Firefox/Safari.
- Camera + Web Serial can run **together** in one page. The fingerprint/print/relay bridges are
  separate `localhost` services, so they don't conflict.

```bash
cd school-poc/apps
python -m http.server 8080
# open http://localhost:8080/gate.html  (or portal.html / cafeteria-pos.html)
```

---

## 1) Camera — facial scan

- Uses the device's own camera via `navigator.mediaDevices.getUserMedia`; **face-api.js** runs the
  recognition in the browser (no server, no install).
- `gate.html` does a **1:1 match**: the tapped card identifies the account, then the live face is
  compared to that account's stored `FACE_BIO_ID` descriptor. Toggle **⚙ → "Use real camera"** to
  switch from the simulated match to the real one.
- Enrollment stores a **128-float descriptor as JSON** in `ACCOUNT.FACE_BIO_ID` (not a photo — a
  photo can't be matched). The face is enrolled via the registration/attendance camera flow.
- First real use downloads the face-api models from the CDN, so the **first match needs internet**;
  after that it's cached.

## 2) DigitalPersona 4500 — fingerprint (USB, via bridge)

A browser **cannot** read a USB fingerprint reader directly, so a small local service does it:

```bash
cd school-poc/bridges/fingerprint-bridge
npm install
npm start                 # SIMULATE mode — pretends to capture, for testing the chain
# SIMULATE=false npm start # real device, AFTER the SDK is wired (below)
```

- Exposes `GET /status`, `POST /enroll`, `POST /verify` on **`http://localhost:9001`**; the POS
  calls these after a card tap when "Require fingerprint to pay" is on.
- To make it real: install the **DigitalPersona U.are.U SDK/runtime** (from HID/DigitalPersona),
  then fill the three `dp*` functions in `server.js` (marked *INTEGRATION SEAM*) with real SDK calls
  and run with `SIMULATE=false`. It's .NET-native on Windows, so a small C#/.NET helper is the
  least-glue option.

## 3) PN532 RFID on Arduino — card tap (USB → Web Serial)

The Arduino reads the card and **prints the UID over USB serial, one line per tap**; the app reads
that stream with the Web Serial API (Settings → RFID input → *Arduino over USB* → Connect).

- **Board:** Arduino **Uno** (the sketch's default) or **Mega** — both fine.
- **PN532 ↔ Arduino is wired over I²C** (this is the module's I²C mode — set the module's mode
  switches accordingly), per `bridges/arduino-nfc/pn532_reader.ino`:

  | PN532 | Arduino **Uno** | Arduino **Mega** |
  |---|---|---|
  | VCC | 5V | 5V |
  | GND | GND | GND |
  | SDA | A4 | 20 (SDA) |
  | SCL | A5 | 21 (SCL) |
  | IRQ | D2 | D2 |
  | RSTO | D3 (optional) | D3 (optional) |

- **Arduino ↔ PC is USB serial at 115200 baud** — this must match `ARDUINO_BAUD` in the app.
- Library: **Adafruit PN532** (+ Adafruit BusIO) via the Arduino Library Manager.
- The PN532 outputs **hex** UIDs; if a card was ever enrolled on a different reader that emitted
  decimal, re-enroll it on the PN532 so the stored UID matches.
- (There's also an RC522/SPI sketch in `arduino-rfid/` with the same one-UID-per-line output, if you
  use that module instead.)

## 4) Magnetic gate relay — theoretical → real

The gate "opens" visually in `gate.html`, but a webpage can't drive a physical lock. To make it
real, add a **local relay bridge** (same pattern as the fingerprint bridge): on a granted entry the
gate calls e.g. `POST http://localhost:9003/open`, and that service pulses a USB/GPIO relay wired to
the maglock. Until then, treat the gate animation as the signal.

## Quick pre-test checklist

- [ ] Pages served from `http://localhost`, opened in **Chrome/Edge**.
- [ ] PN532 module switches set to **I²C**; wired per the table; **Adafruit PN532** library installed.
- [ ] Arduino sketch flashed; app Settings → *Arduino over USB* → **Connect** → tap a test card.
- [ ] (POS) fingerprint bridge running on `:9001`; print bridge on `:9002` if printing.
- [ ] (Gate) keep **Use real camera off** until a real face is enrolled in `FACE_BIO_ID`.
- [ ] Test cards: `0A1B2C3D` (Maria), `1B2C3D4E` (dela Cruz), `2C3D4E5F` (Troy / lost-card deny).
