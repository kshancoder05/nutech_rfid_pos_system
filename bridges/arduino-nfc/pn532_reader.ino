/*  Cafeteria POS — Arduino NFC reader (PN532 "NFC Module V3")
 *  Reads 13.56 MHz NFC/MIFARE cards and prints each UID over USB serial,
 *  one UID per line — the SAME output contract as the RC522 sketch, so the
 *  POS app's "Arduino over USB" (Web Serial) mode reads it with NO changes.
 *
 *  Library: "Adafruit PN532" (Library Manager) — also pulls in "Adafruit BusIO".
 *  Board:   Arduino Uno.
 *
 *  Set the PN532 V3 module's interface switches to I2C (see the mode table
 *  printed on the board), then wire I2C:
 *      PN532 VCC -> 5V        PN532 GND -> GND
 *      PN532 SDA -> A4        PN532 SCL -> A5
 *      PN532 IRQ -> D2        PN532 RSTO-> D3   (RSTO optional; -1 if unused)
 *
 *  Baud must match CONFIG.ARDUINO_BAUD in the app (115200).
 */

#include <Wire.h>
#include <Adafruit_PN532.h>

#define PN532_IRQ   2
#define PN532_RESET 3
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET);

String   lastUid  = "";
uint32_t lastSeen = 0;

void setup() {
  Serial.begin(115200);
  nfc.begin();
  if (!nfc.getFirmwareVersion()) {
    // PN532 not found — check wiring and the I2C/SPI switch on the module
    while (1) { delay(1000); }
  }
  nfc.SAMConfig();           // configure to read passive tags
}

void loop() {
  uint8_t uidBytes[7];
  uint8_t uidLen = 0;

  // wait up to 100ms for a card in the field
  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uidBytes, &uidLen, 100)) {
    String uid = "";
    for (uint8_t i = 0; i < uidLen; i++) {
      if (uidBytes[i] < 0x10) uid += "0";
      uid += String(uidBytes[i], HEX);
    }
    uid.toUpperCase();

    uint32_t now = millis();
    if (uid != lastUid || now - lastSeen > 1500) {   // debounce repeats
      Serial.println(uid);     // newline-terminated UID -> the app reads this
      lastUid  = uid;
      lastSeen = now;
    }
  }
}
