# 📟 Cargofy IoT Sensor Node — Hardware Design

## Overview

The Cargofy IoT Sensor Node is a custom-designed, production-ready hardware module for cold chain telemetry. It continuously monitors **temperature**, **humidity**, **battery level**, and **door status** inside refrigerated trucks and containers, transmitting data to the Cargofy cloud platform via Wi-Fi.

---

## Specifications

| Spec | Detail |
|---|---|
| **MCU** | ESP32-WROOM-32D (dual-core 240MHz, Wi-Fi + BLE) |
| **Temperature Sensor** | DS18B20 waterproof probe (±0.5°C, -55°C to +125°C) |
| **Humidity Sensor** | AM2302 / DHT22 (0-100% RH, ±2% accuracy) |
| **Door Detection** | MK24 Reed switch (magnetic, normally open) |
| **Power Management** | TC4056A / TP4056 LiPo charger IC |
| **Voltage Regulator** | AMS1117-3.3V (or low-Iq equivalent) |
| **Battery** | 3.7V 2000mAh LiPo cell (JST-PH-2P connector) |
| **Programming Port** | Micro USB (dual: programming + charging) |
| **PCB Dimensions** | 60mm × 40mm, 2-layer FR4 |
| **Enclosure Rating** | IP65 (dust-tight, water jet resistant) |
| **Estimated Battery Life** | ~72 hours continuous operation |
| **Unit Cost** | ~₹650 ($8 USD) for BOM components |

---

## PCB Design

The PCB was designed in **KiCad** and is included as `Cargofy_IoT_Node.kicad_pcb`.

![PCB Layout](cargofy_iot_node_pcb_diagram%20pcb.png)

---

## Bill of Materials (17 Components)

| # | Ref | Component | Part Number | Qty | Package | Purpose |
|---|---|---|---|---|---|---|
| 1 | U1 | ESP32-WROOM-32 | ESP32-WROOM-32D | 1 | Module | MCU and Wi-Fi |
| 2 | J3 | Waterproof temp probe | DS18B20+ | 1 | 3-pin header/probe | Cold-chain temperature |
| 3 | J4 | Humidity sensor | AM2302 / DHT22 | 1 | 4-pin header | Humidity monitoring |
| 4 | U2 | LiPo charger | TC4056A / TP4056 | 1 | SOP-8 | USB LiPo charging |
| 5 | U4 | 3.3V regulator | AMS1117-3.3 | 1 | SOT-223 | 3.3V power rail |
| 6 | BT1 | LiPo battery connector | JST-PH-2P | 1 | TH | 3.7V 2000mAh battery input |
| 7 | J5 | Reed switch input | MK24 | 1 | 2-pin header | Door open/closed detection |
| 8 | R15 | Pullup resistor | 4.7kΩ | 1 | 0402 | DS18B20 data line pullup |
| 9 | R18, R19 | Voltage divider | 100kΩ | 2 | 0402 | Battery ADC voltage divider |
| 10 | R13, R14 | LED resistors | 330Ω | 2 | 0402 | LED current limiting |
| 11 | C2, C7, C10 | Bulk capacitors | 10µF | 3 | 0805 | Bulk decoupling |
| 12 | C5, C6, C9, C11 | Bypass capacitors | 100nF | 4 | 0402 | High-frequency decoupling |
| 13 | D3 | Green LED | 0402 green | 1 | 0402 | Connected status indicator |
| 14 | D4 | Red LED | 0402 red | 1 | 0402 | Alert/error indicator |
| 15 | J1 | Micro USB connector | USB-B-Micro | 1 | SMD/TH | Programming and charging |
| 16 | SW1 | Reset button | 4×4mm tact | 1 | SMD | EN reset |
| 17 | SW2 | Boot button | 4×4mm tact | 1 | SMD | GPIO0 boot mode |

---

## Telemetry Data Transmitted

Every **30 seconds**, the node transmits the following payload to the Cargofy backend:

```json
{
  "device_id": "CARGOFY-NODE-001",
  "timestamp": "2026-06-14T17:30:00Z",
  "temperature_c": 4.2,
  "humidity_pct": 78.5,
  "battery_voltage": 3.82,
  "battery_pct": 85,
  "door_open": false,
  "gps_lat": 19.0760,
  "gps_lon": 72.8777,
  "signal_rssi": -67
}
```

---

## Deployment Notes

1. **Flash firmware** via Micro USB using Arduino IDE or PlatformIO
2. **Configure Wi-Fi** credentials and Cargofy API endpoint in firmware
3. **Mount** inside the refrigerated container near the ceiling for optimal temperature readings
4. **Attach** the DS18B20 probe to the container wall or product pallet
5. **Mount** the MK24 reed switch on the container door frame with a magnet on the door

---

*Designed for the FAR AWAY 2026 Hackathon — Logistics & Transit Theme*
