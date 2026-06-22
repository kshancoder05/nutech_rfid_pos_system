/*  Cafeteria POS — Receipt Print Bridge (XP-58IIH, 58mm ESC/POS)
 *  ----------------------------------------------------------------------
 *  Optional local service for SILENT receipt printing with auto-cut.
 *  The POS app POSTs a receipt object; this service formats ESC/POS and
 *  prints it. (If you prefer no extra service, the app's "Browser" print
 *  mode works with just the Windows driver + Chrome --kiosk-printing.)
 *
 *  Endpoints:
 *    GET  /status   -> { ok, connected }
 *    POST /print    -> { ok }            body = receipt JSON from the app
 *
 *  Run:
 *    npm install
 *    npm start                              # SIMULATION: prints to console
 *    SIMULATE=false PRINTER_IFACE="printer:XP-58" npm start   # real printer
 *
 *  PRINTER_IFACE options (node-thermal-printer):
 *    "printer:XP-58"           Windows: the installed printer's exact name
 *                              (Devices & Printers). Most robust on a laptop.
 *    "//localhost/XP-58"       a shared Windows printer
 *    "tcp://192.168.1.50"      network/Ethernet models
 *  For raw USB instead, swap to the escpos + escpos-usb libraries.
 */

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 9002;
const SIMULATE = process.env.SIMULATE !== "false";
const IFACE = process.env.PRINTER_IFACE || "printer:XP-58";
const peso = n => "P" + Number(n || 0).toLocaleString("en-PH");  // printer-safe peso

function consoleReceipt(r) {
  const L = [];
  L.push("        " + (r.store || ""));
  L.push("      Cafeteria Receipt");
  L.push("--------------------------------");
  L.push(r.datetime || "");
  L.push("Ref: " + (r.ref || "-"));
  L.push("Student: " + (r.student || "-") + "  (" + (r.account || "-") + ")");
  L.push("--------------------------------");
  (r.items || []).forEach(it => L.push(`${it.qty}x ${it.name}   ${peso(it.price * it.qty)}`));
  L.push("--------------------------------");
  L.push("TOTAL: " + peso(r.total));
  L.push("Paid via RFID wallet");
  L.push("Balance: " + peso(r.balanceAfter));
  L.push("--------------------------------");
  L.push("     " + (r.footer || ""));
  return L.join("\n");
}

async function printReal(r) {
  // Lazy-require so SIMULATE works without the dependency installed
  const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,         // XP-58IIH speaks ESC/POS
    interface: IFACE,
    width: 32,                        // 58mm = 32 characters
    removeSpecialCharacters: false,
    options: { timeout: 5000 }
  });
  if (!(await printer.isPrinterConnected())) throw new Error("Printer not connected (" + IFACE + ")");

  printer.alignCenter(); printer.bold(true); printer.setTextDoubleHeight();
  printer.println(r.store || "Cafeteria");
  printer.setTextNormal(); printer.bold(false);
  printer.println("Cafeteria Receipt");
  printer.drawLine();
  printer.alignLeft();
  printer.println(r.datetime || "");
  printer.println("Ref: " + (r.ref || "-"));
  printer.println("Student: " + (r.student || "-"));
  printer.println("ID: " + (r.account || "-"));
  printer.drawLine();
  (r.items || []).forEach(it =>
    printer.tableCustom([
      { text: it.qty + "x", width: 0.15 },
      { text: it.name, width: 0.55 },
      { text: peso(it.price * it.qty), width: 0.30, align: "RIGHT" }
    ]));
  printer.drawLine();
  printer.bold(true);
  printer.tableCustom([{ text: "TOTAL", width: 0.6 }, { text: peso(r.total), width: 0.4, align: "RIGHT" }]);
  printer.bold(false);
  printer.println("Paid via RFID wallet");
  printer.tableCustom([{ text: "Balance", width: 0.6 }, { text: peso(r.balanceAfter), width: 0.4, align: "RIGHT" }]);
  printer.drawLine();
  printer.alignCenter(); printer.println(r.footer || "");
  printer.cut();
  await printer.execute();
}

app.get("/status", async (_req, res) => {
  if (SIMULATE) return res.json({ ok: true, connected: true, device: "XP-58IIH (SIMULATED)" });
  try {
    const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
    const p = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: IFACE });
    res.json({ ok: true, connected: await p.isPrinterConnected() });
  } catch (e) { res.json({ ok: false, connected: false, reason: e.message }); }
});

app.post("/print", async (req, res) => {
  const r = req.body || {};
  try {
    if (SIMULATE) { console.log("\n----- RECEIPT (SIMULATED) -----\n" + consoleReceipt(r) + "\n--------------------------------\n"); }
    else { await printReal(r); }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, reason: e.message }); }
});

app.listen(PORT, () => console.log(`Print bridge on http://localhost:${PORT}  (SIMULATE=${SIMULATE}, iface=${IFACE})`));
