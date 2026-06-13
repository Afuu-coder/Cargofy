# Cargofy IoT Node — PCB Hardware Design

## 🔧 Cargofy IoT Sensor Node v1.0

A compact, low-power IoT sensor node designed for cold-chain truck refrigeration units.
Transmits real-time temperature, humidity, door status, and battery voltage to the Cargofy cloud backend via Wi-Fi/MQTT.

---

## 📐 Board Specifications

| Parameter | Value |
|-----------|-------|
| **Board Size** | 60mm × 40mm |
| **Layers** | 2-layer PCB |
| **MCU** | ESP32-WROOM-32 |
| **Supply Voltage** | 3.7V LiPo or 5V USB |
| **Operating Temp** | -40°C to +85°C |
| **Connectivity** | Wi-Fi 802.11 b/g/n |
| **Enclosure Rating** | IP65 (condensation-proof) |
| **Battery Life** | ~72 hours on 2000mAh LiPo |
| **Deep Sleep Current** | ~10µA |

---

## 🧩 Component Architecture

```
                    ┌─────────────────────────────────────┐
                    │      CARGOFY IoT NODE v1.0           │
                    │                                       │
  LiPo Battery ──→  │  TP4056 ──→ 3.3V LDO ──→ ESP32     │
  USB 5V      ──→  │  (Charger)    (AMS1117)   WROOM-32  │
                    │                    │                  │
  DS18B20 ────────→│  GPIO14 ←──────────┘                  │
  (Temp Probe)      │  (1-Wire + 4.7kΩ pullup)             │
                    │                                       │
  DHT22 ──────────→│  GPIO27 ←── Humidity Sensor          │
                    │                                       │
  Reed Switch ────→│  GPIO34 ←── Door Open/Close          │
  (Door Sensor)     │                                       │
                    │  GPIO35 ←── Battery Voltage Divider  │
                    │  (100kΩ/100kΩ voltage divider)        │
                    │                                       │
                    │  Status LEDs: GPIO2 (Green/Red)      │
                    │  Reset Button: EN pin                 │
                    └─────────────────────────────────────┘
                                    │
                                    │ Wi-Fi / MQTT
                                    ▼
                         Cargofy Backend API
                    POST /api/v1/webhook/telemetry
```

---

## 📋 Bill of Materials (BOM)

| # | Component | Part Number | Qty | Purpose |
|---|-----------|-------------|-----|---------|
| 1 | **ESP32-WROOM-32** | ESP32-WROOM-32D | 1 | Main MCU + Wi-Fi |
| 2 | **DS18B20** | DS18B20+ (waterproof) | 1 | Temperature sensor (-55°C to +125°C) |
| 3 | **DHT22** | AM2302 | 1 | Humidity sensor (0-100% RH) |
| 4 | **TP4056** | TC4056A | 1 | LiPo battery charger IC |
| 5 | **AMS1117-3.3** | AMS1117-3.3V | 1 | 3.3V LDO voltage regulator |
| 6 | **LiPo Battery** | 3.7V 2000mAh | 1 | Power source |
| 7 | **Reed Switch** | MK24 | 1 | Door open/close detection |
| 8 | **Resistor 4.7kΩ** | 0402 SMD | 1 | DS18B20 1-Wire pullup |
| 9 | **Resistor 100kΩ** | 0402 SMD | 2 | Battery voltage divider |
| 10 | **Resistor 330Ω** | 0402 SMD | 2 | LED current limiting |
| 11 | **Capacitor 10µF** | 0805 SMD | 3 | Decoupling capacitors |
| 12 | **Capacitor 100nF** | 0402 SMD | 4 | High-freq decoupling |
| 13 | **LED Green** | 0402 SMD | 1 | Status: connected |
| 14 | **LED Red** | 0402 SMD | 1 | Status: alert/error |
| 15 | **Micro USB Port** | USB-B-Micro | 1 | Programming + charging |
| 16 | **JST 2-pin** | JST-PH-2P | 1 | LiPo battery connector |
| 17 | **Button (Reset)** | 4×4mm SMD | 1 | ESP32 EN reset |
| 18 | **Button (Boot)** | 4×4mm SMD | 1 | ESP32 GPIO0 boot mode |

**Estimated BOM Cost: ₹480–₹650 per unit (bulk pricing)**

---

## ⚡ Circuit Design Details

### Power Management
```
USB 5V → TP4056 (Charger) → LiPo 3.7V → AMS1117 → 3.3V Rail → ESP32
                                    ↓
                           Voltage Divider (100k/100k)
                                    ↓
                           GPIO35 (ADC) → Battery % reading
                           Sends battery_voltage to Cargofy API
```

> **Key Innovation:** The voltage divider on GPIO35 allows Cargofy's AI to monitor refrigeration unit battery in real-time. When voltage drops below 11.5V, the Autonomous Rerouting Agent triggers BEFORE temperature rises. This is Cargofy's unique "Predictive Battery Failure" feature.

### Temperature Sensing
```
DS18B20 → GPIO14 (1-Wire protocol)
         ← 4.7kΩ pullup to 3.3V
Accuracy: ±0.5°C from -10°C to +85°C
Range: -55°C to +125°C (covers frozen cargo)
```

### Door Tamper Detection
```
Reed Switch → GPIO34 (INPUT_PULLUP)
LOW  = Door CLOSED (magnet present)
HIGH = Door OPEN   (magnet removed)
Triggers interrupt → immediate telemetry push
```

---

## 📡 Firmware Data Payload

The IoT node sends this JSON to Cargofy backend every 30 seconds:

```json
{
  "device_id": "CGF-NODE-{MAC_ADDRESS}",
  "shipment_id": "SHP-MH-001",
  "timestamp": "2024-06-13T18:00:00Z",
  "temperature": 4.2,
  "humidity": 65.3,
  "ambient_temp": 38.0,
  "battery_voltage": 12.4,
  "door_status": "CLOSED",
  "door_open_count": 2,
  "latitude": 19.0760,
  "longitude": 72.9982,
  "speed_kmh": 48.0,
  "reefer_health_pct": 94,
  "simulated": false
}
```

**Endpoint:** `POST https://cargofy-backend.onrender.com/api/v1/webhook/telemetry`

---

## 🏭 Manufacturing

### PCB Fabrication (JLCPCB)
- **Process:** FR4, 1.6mm thickness, HASL finish
- **Min trace width:** 0.2mm
- **Min hole size:** 0.3mm
- **Color:** Green soldermask, white silkscreen
- **Cost:** ~₹150/board (5 units minimum order)

### Gerber Files
Located in `hardware/gerbers/` directory:
- `cargofy_node_v1.0-F_Cu.gbr` — Front copper layer
- `cargofy_node_v1.0-B_Cu.gbr` — Back copper layer
- `cargofy_node_v1.0-F_SilkS.gbr` — Front silkscreen
- `cargofy_node_v1.0-Edge_Cuts.gbr` — Board outline
- `cargofy_node_v1.0.drl` — Drill file

---

## 🛡️ Enclosure

IP65-rated ABS enclosure (60×40×20mm):
- Waterproof seal for condensation-prone truck environments
- DS18B20 probe extends outside through grommet
- Magnetic mount for easy truck installation

---

## 📊 Why Hardware Matters for Cargofy

| Software Simulator | Physical IoT Node |
|-------------------|------------------|
| Runs on laptop | Runs in real truck |
| Simulated data | Real sensor data |
| Demo only | Production ready |
| Free | ₹650/unit |

The Cargofy backend accepts **identical API payloads** from both the software simulator and the physical IoT node — making it trivial to switch from demo to production.

---

*Designed for FAR AWAY 2026 Hackathon — Cargofy Team*
*PCB design tool: EasyEDA Pro | Schematic: see `schematic.json`*
