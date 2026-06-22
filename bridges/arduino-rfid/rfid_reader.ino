/*  Cafeteria POS — Arduino RFID reader
 *  Reads an RC522 module and prints each card UID over USB serial,
 *  one UID per line. The POS web app reads this via the Web Serial API.
 *
 *  Library: "MFRC522" by GithubCommunity (install via Library Manager)
 *  Board:   Arduino Uno / Nano (any 5V AVR works; RC522 is 3.3V powered)
 *
 *  Wiring (Uno):
 *    RC522 SDA(SS) -> D10      RC522 SCK  -> D13
 *    RC522 MOSI    -> D11      RC522 MISO -> D12
 *    RC522 RST     -> D9       RC522 3.3V -> 3.3V   RC522 GND -> GND
 *
 *  Baud rate must match CONFIG.ARDUINO_BAUD in the app (115200).
 */

#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN  10
#define RST_PIN 9

MFRC522 rfid(SS_PIN, RST_PIN);

String   lastUid  = "";
uint32_t lastSeen = 0;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  // Serial.println("READY");   // uncomment for a boot signal
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  // debounce: ignore the same card repeating within 1.5s
  uint32_t now = millis();
  if (uid != lastUid || now - lastSeen > 1500) {
    Serial.println(uid);     // newline-terminated UID -> the app reads this
    lastUid  = uid;
    lastSeen = now;
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
