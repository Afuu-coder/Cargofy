# Cargofy - Autonomous Cold Chain Intelligence Platform

FAR AWAY 2026 Hackathon - Logistics and Transit x Agentic and Autonomous Systems

GitHub: https://github.com/Afuu-coder/Cargofy

---

## The Real Problem

Every night in India, truckloads of milk, medicines, and fresh produce silently spoil.

- Rs.92,000 crore lost annually to cold chain failures (ASSOCHAM 2024)
- 40% of India perishables spoil before reaching consumers
- No alarm goes off. No driver notified. No rerouting happens.

Existing solutions only send alerts AFTER the damage is done.
Cargofy does not alert. It ACTS.

```
Traditional:  Temperature rises -> Alert sent -> Human decides -> Action (too late)
Cargofy:      Temperature rises -> AI Agent -> Route found -> Driver WhatsApp'd -> Crisis avoided
```

---

## Architecture

```
IoT Sensor / Simulator -> FastAPI Backend -> Risk Engine (Gemini) -> Rerouting Agent (Google ADK)
                                                                          |
                              +-------------------------------------------+
                              |                     |                      |
                      WhatsApp Alert          WebSocket 3D Map     Blockchain Cert
                      (CallMeBot FREE)        (Mapbox GL 3D)       (Ethereum Sepolia)
```

Cross-theme: Logistics and Transit + Agentic and Autonomous Systems

---

## Key Features

1. Autonomous Rerouting Agent (Google ADK + Gemini 2.0 Flash)
   - Battery failure prediction BEFORE temperature rises
   - POST /api/v1/agent/simulate-critical (4 demo scenarios)
   - WebSocket ws://localhost:8000/api/v1/agent/ws/live

2. 3D Fleet Visualization (/fleet-3d)
   - Mapbox GL JS with 3D terrain, pitch 45, fog, star field
   - Risk-colored animated truck markers (GREEN/AMBER/ORANGE/RED)
   - Pulsing halo on CRITICAL shipments
   - Auto flyTo camera on REROUTE_DECISION event

3. ULIP / PM Gati Shakti Integration
   - GET /api/v1/ulip/vehicle/{plate} - Vahan compliance check
   - GET /api/v1/ulip/driver/{license} - Sarathi driver record

4. Free WhatsApp Alerts (CallMeBot - zero cost)
   - "Bhai, milk 35 minute mein kharab! Right lo - Vashi Cold Hub jaao"

5. Blockchain Audit Trail (Ethereum Sepolia)
   - CargofyShipmentAudit.sol - Solidity smart contract
   - SAFE / SPOILED / PARTIAL verdict - immutable on-chain
   - POST /api/v1/blockchain/certify
   - GET /api/v1/blockchain/verify/{code} + Etherscan link

6. PCB Hardware Design (Bonus)
   - ESP32-WROOM-32 + DS18B20 + DHT22 + TP4056
   - Rs.650/unit, IP65, 72hr battery life
   - See hardware/ folder

---

## Tech Stack

| Layer        | Technology                                               |
|--------------|----------------------------------------------------------|
| Backend      | FastAPI + SQLAlchemy + PostgreSQL                        |
| AI Engine    | Google ADK 1.31 + Gemini 2.0 Flash + Gemma 2            |
| Real-time    | Firebase RTDB + WebSockets                               |
| Data         | Google Pub/Sub + BigQuery                                |
| Maps         | Google Maps API + Mapbox GL JS (3D)                      |
| WhatsApp     | CallMeBot (FREE) + Twilio + Meta API                     |
| Frontend     | React + TypeScript + Vite                                |
| Blockchain   | Ethereum Sepolia (Solidity + web3.py)                    |
| Govt APIs    | ULIP Vahan + Sarathi                                     |
| Hardware     | ESP32 + DS18B20 + TP4056 PCB (60x40mm, 2-layer)         |

---

## Quick Start

```bash
git clone https://github.com/Afuu-coder/Cargofy.git
cd Cargofy/backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Test Agent (no API key needed):
```bash
curl -X POST http://localhost:8000/api/v1/agent/simulate-critical \
  -H "Content-Type: application/json" \
  -d "{\"scenario\": \"battery_failure\", \"shipment_id\": \"SHP-DEMO-001\"}"
```

---

## 90-Second Demo

1. (0-10s)  Open /fleet-3d. 5 trucks on 3D India map.
2. (10-25s) Click "Battery Failure". Truck MH-001 goes RED. Camera flies to it.
3. (25-45s) Agent sidebar shows REROUTE_DECISION. WhatsApp arrives on phone.
4. (45-60s) Show ULIP: GET /api/v1/ulip/vehicle/MH12AB1234 -> compliance check.
5. (60-75s) Show blockchain: POST /certify -> tx_hash + Etherscan URL.
6. (75-90s) Show GitHub: 9 meaningful commits. "Every feature shipped, not promised."

---

## Repository Structure

```
Cargofy/
|-- backend/app/
|   |-- agents/     <- rerouting_agent.py, dispatch_agent.py
|   |-- routers/    <- 25+ API routers (ulip, rerouting, blockchain...)
|   +-- services/   <- 23 services (AI, Maps, WhatsApp, BigQuery, RTDB...)
|-- frontend/src/
|   |-- components/ <- CargoMap3D.tsx (3D fleet map + WebSocket)
|   +-- pages/axon/ <- 13 dashboard pages
|-- blockchain/
|   +-- contracts/  <- CargofyShipmentAudit.sol
|-- hardware/
|   |-- README.md   <- PCB specs, BOM (18 components)
|   +-- firmware/   <- cargofy_node_v1.ino (ESP32 sketch)
```

---

FAR AWAY 2026 | Real problem -> Real system -> Real demo