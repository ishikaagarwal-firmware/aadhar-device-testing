/*
 * esp32-bridge.ino - Serial Relay, Command Checker, and Hardware Wake-up for Quectel L89
 * 
 * Connections:
 * - L89 RXD -> ESP32 GPIO 17 (TX2)
 * - L89 TXD -> ESP32 GPIO 16 (RX2)
 * - L89 VCC -> ESP32 3.3V
 * - L89 GND -> ESP32 GND (Common Ground)
 * - L89 RST -> ESP32 GPIO 33
 * - Onboard LED -> ESP32 GPIO 2 (Blinks when GPS sends data)
 * - Extra TTL Serial1 -> GPIO 18 (RX1) and GPIO 19 (TX1)
 */

#define RXD2 16       // Connected to L89 TXD (GPIO 16)
#define TXD2 17       // Connected to L89 RXD (GPIO 17)
#define RST_PIN 33    // Connected to L89 RST (GPIO 33)
#define ONBOARD_LED 2 // ESP32 Dev Board Onboard LED

#define RXD1 18       // Serial1 RX Pin (GPIO 18)
#define TXD1 19       // Serial1 TX Pin (GPIO 19)

unsigned long lastBlinkTime = 0;
bool ledState = false;
bool gpsForwardingEnabled = true;
bool mockEncryptionEnabled = false; // Mock device mode simulation
unsigned long lastEncryptedPacketTime = 0;

// Separate line buffers to intercept commands from USB and TTL without cross-talk
String usbBuffer = "";
String ttlBuffer = "";

// NMEA Parsed State Variables
String gpsSentenceBuffer = "";
String currentLatitude = "26.776066"; // Haryana/Rajasthan area default fallback
String currentLongitude = "75.839216";
String currentAccuracy = "1.17";
bool gpsHasLock = false;


// Helper to get MAC-based Serial Number dynamically using Arduino built-in API
String getSerialNumber() {
  uint64_t mac = ESP.getEfuseMac();
  char serialNum[17];
  snprintf(serialNum, sizeof(serialNum), "0000%02X%02X%02X%02X%02X%02X", 
           (uint8_t)(mac), 
           (uint8_t)(mac >> 8), 
           (uint8_t)(mac >> 16), 
           (uint8_t)(mac >> 24), 
           (uint8_t)(mac >> 32), 
           (uint8_t)(mac >> 40));
  return String(serialNum);
}

void detectGpsConfig() {
  int rxPins[] = {16, 17};
  int txPins[] = {17, 16};
  long baudRates[] = {9600, 115200};
  
  Serial.println("[BOOT] Starting GPS Autodetect (Pins & Baud)...");
  
  for (int pinIdx = 0; pinIdx < 2; pinIdx++) {
    int rx = rxPins[pinIdx];
    int tx = txPins[pinIdx];
    
    for (int baudIdx = 0; baudIdx < 2; baudIdx++) {
      long baud = baudRates[baudIdx];
      
      Serial.print("[BOOT] Trying RX=");
      Serial.print(rx);
      Serial.print(", TX=");
      Serial.print(tx);
      Serial.print(" @ ");
      Serial.print(baud);
      Serial.println(" baud...");
      
      Serial2.begin(baud, SERIAL_8N1, rx, tx);
      
      // Wait for up to 1500ms to see if we get any '$' characters (NMEA start)
      unsigned long start = millis();
      bool detected = false;
      while (millis() - start < 1500) {
        if (Serial2.available() > 0) {
          char c = Serial2.read();
          if (c == '$') {
            detected = true;
            break;
          }
        }
        delay(1);
      }
      
      if (detected) {
        Serial.print("[BOOT] GPS detected! Locked to RX=");
        Serial.print(rx);
        Serial.print(", TX=");
        Serial.print(tx);
        Serial.print(" @ ");
        Serial.print(baud);
        Serial.println(" baud.");
        return; // Success! Serial2 remains configured
      }
      
      // Release pins before trying the next configuration
      Serial2.end();
      delay(50);
    }
  }
  
  // Fallback to default
  Serial.println("[BOOT] GPS detection failed. Falling back to default: RX=16, TX=17 @ 9600");
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
}

void setup() {
  // 1. Initialize Serial Communication to Computer (9600 to match BOB plain text mode)
  Serial.begin(9600);
  
  // 2. Initialize Serial1 (USB/TTL on Pins 18 and 19) at 9600
  Serial1.begin(9600, SERIAL_8N1, RXD1, TXD1);
  
  // 3. Configure and Release Reset Pin
  // Drive active high to enable the board level-shifters/buffers on shields
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);   // Reset
  delay(150);
  digitalWrite(RST_PIN, HIGH);  // Drive active high to enable level-shifter
  
  // 4. Configure Onboard LED for status indicators
  pinMode(ONBOARD_LED, OUTPUT);
  digitalWrite(ONBOARD_LED, LOW);
  
  delay(1000);
  
  // 5. Detect and lock onto GPS configuration dynamically (pins & baud)
  detectGpsConfig();
}

void loop() {
  bool receivedData = false;
  
  // 1. Forward raw GPS data: L89 GPS Module -> ESP32 -> USB (Serial) & TTL (Serial1)
  while (Serial2.available() > 0) {
    char c = Serial2.read();
    if (gpsForwardingEnabled) {
      Serial.write(c);
      Serial1.write(c);
      receivedData = true;
    }
    parseGPSChar(c);
  }

  
  // 2. Forward commands: Computer (USB Serial) -> ESP32 -> L89 GPS Module (and check locally)
  while (Serial.available() > 0) {
    char c = Serial.read();
    Serial2.write(c);            // Pass through to GPS
    handleIncomingChar(c, true); // Process locally
  }

  // 3. Forward commands: TTL (Serial1) -> ESP32 -> L89 GPS Module (and check locally)
  while (Serial1.available() > 0) {
    char c = Serial1.read();
    Serial2.write(c);             // Pass through to GPS
    handleIncomingChar(c, false); // Process locally
  }
  
  // 4. Onboard LED Activity Indicator (Blinks on GPS communication)
  if (receivedData) {
    unsigned long now = millis();
    if (now - lastBlinkTime > 100) {
      ledState = !ledState;
      digitalWrite(ONBOARD_LED, ledState ? HIGH : LOW);
      lastBlinkTime = now;
    }
  } else {
    if (millis() - lastBlinkTime > 1000) {
      digitalWrite(ONBOARD_LED, LOW);
    }
  }

  // 5. Send mock encrypted packets periodically in SBI mode
  if (mockEncryptionEnabled && !gpsForwardingEnabled) {
    unsigned long now = millis();
    if (now - lastEncryptedPacketTime > 3000) {
      String challengeStr = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDzByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD";
      Serial.println(challengeStr);
      Serial1.println(challengeStr);
      lastEncryptedPacketTime = now;
    }
  }
}

// Helper to handle serial character inputs and detect commands
void handleIncomingChar(char c, bool fromDefaultSerial) {
  String &buffer = fromDefaultSerial ? usbBuffer : ttlBuffer;
  
  if (c == '\n' || c == '\r') {
    if (buffer.length() > 0) {
      buffer.trim();
      
      // Check for SBI unlock key / challenge response
      if (buffer.indexOf("BPCDDzBy") != -1) {
        String challenge = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDzByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD";
        if (fromDefaultSerial) {
          Serial.println(challenge);
        } else {
          Serial1.println(challenge);
        }
      }
      else if (buffer.indexOf("BPCDDnBy") != -1) {
        String challenge = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDnByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD";
        if (fromDefaultSerial) {
          Serial.println(challenge);
        } else {
          Serial1.println(challenge);
        }
      }
      // Check if the command line contains get_device_info
      else if (buffer.indexOf("get_device_info") != -1) {
        // Exact JSON Response format from the original BOB firmware, incorporating MAC-based serial
        String serialStr = getSerialNumber();
        String jsonResponse = "{\"status\":\"success\",\"command\":\"get_device_info\",\"data\":{\"serial_number\":\"" + serialStr + "\",\"firmware_version\":\"1.8.7\",\"make\":\"RAIVENS\",\"device_status\":\"active\",\"battery_voltage\":\"3.95V\",\"signal_strength\":\"85%\"}}";
        
        // Reply back to the specific port where the request originated
        if (fromDefaultSerial) {
          Serial.println(jsonResponse);
        } else {
          Serial1.println(jsonResponse);
        }
      }
      else if (buffer.indexOf("get_location") != -1) {
        // Return active or fallback location in exact BOB JSON response format
        String jsonResponse = "{\"status\":\"success\",\"command\":\"get_location\",\"data\":{\"latitude\":\"" + currentLatitude + "\",\"longitude\":\"" + currentLongitude + "\",\"accuracy\":\"" + currentAccuracy + "\"}}";
        if (fromDefaultSerial) {
          Serial.println(jsonResponse);
        } else {
          Serial1.println(jsonResponse);
        }
      }
      else if (buffer.indexOf("get_raw_gps_data") != -1) {
        gpsForwardingEnabled = true;
        if (fromDefaultSerial) {
          Serial.println("Raw GPS data output enabled and saved");
        } else {
          Serial1.println("Raw GPS data output enabled and saved");
        }
      }
      else if (buffer.indexOf("stop_raw_gps_data") != -1) {
        gpsForwardingEnabled = false;
        if (fromDefaultSerial) {
          Serial.println("Raw GPS data output disabled and saved");
        } else {
          Serial1.println("Raw GPS data output disabled and saved");
        }
      }
      else if (buffer.indexOf("enable_encryption") != -1) {
        mockEncryptionEnabled = true;
        String jsonResponse = "{\"status\":\"success\",\"command\":\"enable_encryption\",\"message\":\"Encryption enabled and saved\"}";
        if (fromDefaultSerial) {
          Serial.println(jsonResponse);
        } else {
          Serial1.println(jsonResponse);
        }
      }
      else if (buffer.indexOf("disable_encryption") != -1) {
        mockEncryptionEnabled = false;
        String jsonResponse = "{\"status\":\"success\",\"command\":\"disable_encryption\",\"message\":\"Encryption disabled and saved\"}";
        if (fromDefaultSerial) {
          Serial.println(jsonResponse);
        } else {
          Serial1.println(jsonResponse);
        }
      }
      
      buffer = "";
    }
  } else {
    buffer += c;
  }
}

// NMEA Helpers
String getField(String data, char separator, int index) {
  int found = 0;
  int strIndex[] = { 0, -1 };
  int maxIndex = data.length() - 1;

  for (int i = 0; i <= maxIndex && found <= index; i++) {
    if (data.charAt(i) == separator || i == maxIndex) {
      found++;
      strIndex[0] = strIndex[1] + 1;
      strIndex[1] = (i == maxIndex) ? i + 1 : i;
    }
  }
  return found > index ? data.substring(strIndex[0], strIndex[1]) : "";
}

void parseGGASentence(String sentence) {
  String quality = getField(sentence, ',', 6);
  if (quality.length() > 0 && quality != "0") {
    String latRaw = getField(sentence, ',', 2);
    String latDir = getField(sentence, ',', 3);
    String lonRaw = getField(sentence, ',', 4);
    String lonDir = getField(sentence, ',', 5);
    String hdopRaw = getField(sentence, ',', 8);
    
    if (latRaw.length() > 5 && lonRaw.length() > 5) {
      // Parse Latitude (DDMM.MMMMM)
      double latDeg = latRaw.substring(0, 2).toFloat();
      double latMin = latRaw.substring(2).toFloat();
      double latitude = latDeg + (latMin / 60.0);
      if (latDir == "S") latitude = -latitude;
      
      // Parse Longitude (DDDMM.MMMMM)
      double lonDeg = lonRaw.substring(0, 3).toFloat();
      double lonMin = lonRaw.substring(3).toFloat();
      double longitude = lonDeg + (lonMin / 60.0);
      if (lonDir == "W") longitude = -longitude;
      
      currentLatitude = String(latitude, 6);
      currentLongitude = String(longitude, 6);
      if (hdopRaw.length() > 0) {
        currentAccuracy = hdopRaw;
      }
      gpsHasLock = true;
    }
  } else {
    gpsHasLock = false;
  }
}

void parseGPSChar(char c) {
  if (c == '\n' || c == '\r') {
    if (gpsSentenceBuffer.length() > 0) {
      gpsSentenceBuffer.trim();
      if (gpsSentenceBuffer.startsWith("$") && gpsSentenceBuffer.indexOf("GGA") != -1) {
        parseGGASentence(gpsSentenceBuffer);
      }
      gpsSentenceBuffer = "";
    }
  } else if (c != '\r') {
    gpsSentenceBuffer += c;
  }
}

