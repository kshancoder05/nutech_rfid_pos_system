/*  Cafeteria POS — Fingerprint Bridge
 *  ----------------------------------------------------------------------
 *  A small LOCAL service that runs on the POS machine, drives the
 *  DigitalPersona U.are.U 4500, and exposes a tiny HTTP API the browser
 *  POS app calls. The browser cannot talk to the scanner directly — this
 *  bridge is the link.
 *
 *  Endpoints:
 *    GET  /status          -> { ok, connected, device }
 *    POST /enroll          -> { ok, template }            (capture 4 reads, build template)
 *    POST /verify {template}-> { ok, match, score }       (capture 1 read, compare)
 *
 *  Run:
 *    npm install
 *    npm start                 # simulation mode (no device needed) — for testing
 *    SIMULATE=false npm start   # real device (after wiring the SDK below)
 *
 *  IMPORTANT — the device driver/runtime is NOT this file. Install the
 *  DigitalPersona U.are.U runtime/SDK from DigitalPersona/HID first, then
 *  fill in the three dp* functions marked "INTEGRATION SEAM" below.
 */

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());                 // let the POS web page (localhost) call this
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 9001;
const SIMULATE = process.env.SIMULATE !== "false";   // default ON until SDK is wired

/* =====================================================================
 * INTEGRATION SEAM — replace these with real U.are.U SDK calls.
 *
 * On Windows the usual path is the DigitalPersona U.are.U SDK:
 *   - FingerprintReader / Capture to acquire samples
 *   - Build an enrollment FMD (template) from 4 samples on /enroll
 *   - Create a verification FMD from 1 sample and compare to the stored
 *     template with the SDK matcher (returns a dissimilarity score) on /verify
 * Wrap those calls (native addon, edge-js to .NET, or a child process that
 * runs a small SDK helper exe) and return the values shown below.
 * ===================================================================== */

async function dpStatus() {
  if (SIMULATE) return { connected: true, device: "DigitalPersona 4500 (SIMULATED)" };
  // return { connected: <reader present?>, device: "DigitalPersona 4500" };
  throw new Error("DigitalPersona SDK not wired — set SIMULATE=true to test the chain");
}

async function dpCaptureEnroll() {
  if (SIMULATE) {
    // a fake but stable-looking base64 template
    return Buffer.from("SIMULATED-FMD-" + Date.now()).toString("base64");
  }
  // 1) capture 4 good samples  2) build enrollment FMD  3) return base64 string
  throw new Error("dpCaptureEnroll not implemented");
}

async function dpCaptureVerify(templateB64) {
  if (SIMULATE) {
    // pretend the finger matches; flip to test the decline path
    return { match: true, score: 100 };
  }
  // 1) capture 1 sample  2) build verification FMD
  // 3) compare against templateB64 with the SDK matcher
  // 4) return { match: score <= threshold, score }
  throw new Error("dpCaptureVerify not implemented");
}

/* ===================================================================== */

app.get("/status", async (_req, res) => {
  try { const s = await dpStatus(); res.json({ ok: true, ...s }); }
  catch (e) { res.json({ ok: false, connected: false, reason: e.message }); }
});

app.post("/enroll", async (_req, res) => {
  try {
    const template = await dpCaptureEnroll();
    res.json({ ok: true, template });
  } catch (e) { res.json({ ok: false, reason: e.message }); }
});

app.post("/verify", async (req, res) => {
  try {
    const template = req.body && req.body.template;
    if (!template) return res.json({ ok: false, match: false, reason: "No template provided" });
    const r = await dpCaptureVerify(template);
    res.json({ ok: true, ...r });
  } catch (e) { res.json({ ok: false, match: false, reason: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Fingerprint bridge on http://localhost:${PORT}  (SIMULATE=${SIMULATE})`);
});
