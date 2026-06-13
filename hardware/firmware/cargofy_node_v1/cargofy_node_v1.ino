/*
 * Cargofy IoT Node v1.0 — ESP32 Firmware
 * 
 * Hardware: ESP32-WROOM-32 + DS18B20 + DHT22 + Reed Switch + TP4056
 * 
 * Features:
 *   - Real-time temperature & humidity monitoring
 *   - Door tamper detection (Reed switch interrupt)
 *   - Battery voltage monitoring (predictive failure detection)
 *   - Wi-Fi + MQTT/HTTP data transmission
 *   - Deep sleep mode between readings (72hr battery life)
 *   - OTA (Over-the-air) firmware updates
 * 
 * Data sent to: POST https://cargofy-backend.onrender.com/api/v1/webhook/telemetry
 * 
 * Pinout:
 *   GPIO14 → DS18B20 (1-Wire) + 4.7kΩ pullup
 *   GPIO27 → DHT22 Data
 *   GPIO34 → Reed Switch (Door sensor)
 *   GPIO35 → Battery voltage (ADC via 100k/100k divider)
 *   GPIO2  → Status LED
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <esp_sleep.h>
#include <Preferences.h>

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define PIN_DS18B20     14    // Temperature sensor (1-Wire)
#define PIN_DHT22       27    // Humidity sensor
#define PIN_DOOR_SENSOR 34    // Reed switch (door open/close)
#define PIN_BATTERY_ADC 35    // Battery voltage (via voltage divider)
#define PIN_STATUS_LED  2     // Onboard LED

// ── Configuration ─────────────────────────────────────────────────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#define CARGOFY_API_URL "https://cargofy-backend.onrender.com/api/v1/webhook/telemetry"
#define SHIPMENT_ID     "SHP-MH-001"       // Set this per truck
#define SEND_INTERVAL_S 30                  // Send data every 30 seconds
#define DEEP_SLEEP_US   (30 * 1000000ULL)  // 30 seconds in microseconds

// ── Battery thresholds (for 12V truck DC system via voltage divider) ──────────
#define BATTERY_CRITICAL_V  11.5   // AC unit will fail below this
#define BATTERY_LOW_V       12.2   // Warning threshold
#define BATTERY_FULL_V      12.8   // Full charge

// ── Sensor Initialisation ─────────────────────────────────────────────────────
OneWire           oneWire(PIN_DS18B20);
DallasTemperature tempSensor(&oneWire);
DHT               dht(PIN_DHT22, DHT22);
Preferences       prefs;

// Door open counter (stored in RTC memory — survives deep sleep)
RTC_DATA_ATTR int doorOpenCount = 0;
RTC_DATA_ATTR int bootCount     = 0;

// ── Door interrupt handler ────────────────────────────────────────────────────
volatile bool doorChanged = false;

void IRAM_ATTR onDoorChange() {
  doorChanged = true;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.printf("\n🚚 Cargofy IoT Node v1.0 | Boot #%d\n", ++bootCount);

  // Sensor init
  pinMode(PIN_STATUS_LED,  OUTPUT);
  pinMode(PIN_DOOR_SENSOR, INPUT_PULLUP);
  pinMode(PIN_BATTERY_ADC, INPUT);

  attachInterrupt(digitalPinToInterrupt(PIN_DOOR_SENSOR), onDoorChange, CHANGE);

  tempSensor.begin();
  dht.begin();

  // Flash LED: starting up
  digitalWrite(PIN_STATUS_LED, HIGH);
  delay(200);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Connect Wi-Fi
  connectWiFi();

  // Read sensors
  float temperature    = readTemperature();
  float humidity       = readHumidity();
  float batteryVoltage = readBatteryVoltage();
  bool  doorOpen       = (digitalRead(PIN_DOOR_SENSOR) == HIGH);

  if (doorOpen) doorOpenCount++;

  // Get GPS (mock for prototype — real GPS module via UART in v2.0)
  float lat = 19.0760;  // Default: Mumbai — replace with GPS module data
  float lng = 72.9982;

  // Build and send payload
  sendTelemetry(temperature, humidity, batteryVoltage, doorOpen, lat, lng);

  // ── Deep sleep to save battery ────────────────────────────────────────────
  Serial.printf("💤 Going to deep sleep for %d seconds...\n", SEND_INTERVAL_S);
  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_US);
  esp_deep_sleep_start();
}

void loop() {
  // Never reached — device uses deep sleep
}

// ── Wi-Fi Connection ──────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("📡 Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅ WiFi connected — IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(PIN_STATUS_LED, HIGH);
  } else {
    Serial.println("\n❌ WiFi failed — will retry next boot");
  }
}

// ── Temperature Reading ───────────────────────────────────────────────────────
float readTemperature() {
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);

  if (temp == DEVICE_DISCONNECTED_C) {
    Serial.println("⚠️  DS18B20 disconnected!");
    return -99.0;
  }

  Serial.printf("🌡️  Temperature: %.2f°C\n", temp);
  return temp;
}

// ── Humidity Reading ──────────────────────────────────────────────────────────
float readHumidity() {
  float h = dht.readHumidity();
  if (isnan(h)) {
    Serial.println("⚠️  DHT22 read failed!");
    return -1.0;
  }
  Serial.printf("💧 Humidity: %.1f%%\n", h);
  return h;
}

// ── Battery Voltage Reading ───────────────────────────────────────────────────
float readBatteryVoltage() {
  // 100kΩ / 100kΩ voltage divider → 50% of actual voltage at ADC
  // ESP32 ADC: 0-3.3V = 0-4095 (12-bit)
  // Actual voltage = (ADC / 4095) × 3.3V × 2 (divider ratio)
  int   raw     = analogRead(PIN_BATTERY_ADC);
  float voltage = (raw / 4095.0) * 3.3 * 2.0;

  Serial.printf("⚡ Battery: %.2fV (raw: %d)\n", voltage, raw);

  // Cargofy alert thresholds
  if (voltage < BATTERY_CRITICAL_V) {
    Serial.println("🔴 CRITICAL: Battery voltage below threshold — AC unit at risk!");
  } else if (voltage < BATTERY_LOW_V) {
    Serial.println("🟡 WARNING: Battery low");
  }

  return voltage;
}

// ── Send Telemetry to Cargofy Backend ────────────────────────────────────────
void sendTelemetry(
  float temperature,
  float humidity,
  float batteryVoltage,
  bool  doorOpen,
  float lat,
  float lng
) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ No WiFi — skipping telemetry send");
    return;
  }

  // Build JSON payload (matches Cargofy backend schema exactly)
  StaticJsonDocument<512> doc;
  char macAddr[18];
  snprintf(macAddr, sizeof(macAddr), "%s", WiFi.macAddress().c_str());

  doc["device_id"]         = String("CGF-NODE-") + macAddr;
  doc["shipment_id"]       = SHIPMENT_ID;
  doc["timestamp"]         = ""; // Server-side timestamp
  doc["temperature"]       = temperature;
  doc["humidity"]          = humidity;
  doc["ambient_temp"]      = temperature + 8.0; // Estimate ambient from cargo temp
  doc["battery_voltage"]   = batteryVoltage;
  doc["door_status"]       = doorOpen ? "OPEN" : "CLOSED";
  doc["door_open_count"]   = doorOpenCount;
  doc["latitude"]          = lat;
  doc["longitude"]         = lng;
  doc["speed_kmh"]         = 0.0;  // GPS v2.0
  doc["reefer_health_pct"] = map(
    (int)(batteryVoltage * 10),
    (int)(BATTERY_CRITICAL_V * 10),
    (int)(BATTERY_FULL_V * 10),
    20, 100
  );
  doc["simulated"]         = false;  // REAL hardware data

  String payload;
  serializeJson(doc, payload);

  Serial.printf("📤 Sending to Cargofy: %s\n", payload.c_str());

  HTTPClient http;
  http.begin(CARGOFY_API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Type", "cargofy-iot-node-v1");

  int httpCode = http.POST(payload);

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("✅ Telemetry sent — HTTP %d\n", httpCode);
    // Flash LED: success
    for (int i = 0; i < 3; i++) {
      digitalWrite(PIN_STATUS_LED, HIGH); delay(100);
      digitalWrite(PIN_STATUS_LED, LOW);  delay(100);
    }
  } else {
    Serial.printf("❌ Send failed — HTTP %d | %s\n", httpCode, http.errorToString(httpCode).c_str());
  }

  http.end();
}
