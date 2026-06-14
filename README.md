<div align="center">

<img src="https://img.shields.io/badge/Cargofy-Cold%20Chain%20Intelligence-0ea5e9?style=for-the-badge&logo=truck&logoColor=white" alt="Cargofy" />

# 🚚 Cargofy — Autonomous Cold Chain Intelligence Platform

### _Predict. Reroute. Protect. Powered by Google Cloud & Gemini AI._

[![Live Demo](https://img.shields.io/badge/🌍%20Live%20Demo-cargofy--live--2026.web.app-0ea5e9?style=for-the-badge)](https://cargofy-live-2026.web.app)
[![Cloud Run API](https://img.shields.io/badge/☁️%20API-Cloud%20Run-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cargofy-backend-772437580307.asia-south1.run.app)
[![Firebase](https://img.shields.io/badge/🔥%20Hosted-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://cargofy-live-2026.web.app)
[![Blockchain](https://img.shields.io/badge/🔗%20Blockchain-Sepolia%20Testnet-6366f1?style=for-the-badge&logo=ethereum&logoColor=white)](#-blockchain-audit-trail)

<br/>

> **Cargofy** is a full-stack autonomous cold chain intelligence platform that predicts spoilage **before it happens**, autonomously reroutes trucks to the nearest cold hub, and alerts drivers via WhatsApp — all without any human intervention. Built for India's ₹92,000 crore cold chain crisis.

<br/>

![React](https://img.shields.io/badge/React%2018-TypeScript-61DAFB?style=flat-square&logo=react) ![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi) ![Gemini](https://img.shields.io/badge/Gemini%202.0-Flash-4285F4?style=flat-square&logo=google) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase) ![Mapbox](https://img.shields.io/badge/Mapbox-3D%20GL-000000?style=flat-square&logo=mapbox) ![Solidity](https://img.shields.io/badge/Solidity-0.8.19-363636?style=flat-square&logo=solidity)

</div>

---

## 📌 Table of Contents

- [⚠️ The Real Problem](#️-the-real-problem)
- [🎯 Chosen Themes](#-chosen-themes)
- [✨ Features](#-features)
- [🏗️ Architecture & Approach](#️-architecture--approach)
- [🧠 How the Solution Works](#-how-the-solution-works)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
- [📟 Hardware — IoT Sensor Node](#-hardware--iot-sensor-node)
- [🔗 Blockchain Audit Trail](#-blockchain-audit-trail)
- [🚀 Getting Started](#-getting-started)
- [🌐 Deployment](#-deployment)
- [💡 Assumptions Made](#-assumptions-made)
- [🔮 Future Roadmap](#-future-roadmap)

---

## ⚠️ The Real Problem

Every night in India, truckloads of milk, life-saving medicines, and fresh produce **silently spoil** — and nobody knows until it's too late.

| Statistic | Impact |
|---|---|
| **₹92,000 crore** | Lost annually to cold chain failures (ASSOCHAM 2024) |
| **40%** | Of India's perishables spoil before reaching consumers |
| **76%** | Of Indian cold chain trucks lack real-time monitoring |
| **Zero** | Existing platforms that autonomously ACT on spoilage risk |

Existing solutions are **purely reactive** — they send alerts *after* the damage is done. A human must read the alert, decide what to do, and act. By then, the milk is curdled, the medicine is ineffective, and the produce is rotting.

```
Traditional:  Temperature rises → Alert sent → Human reads → Human decides → Action (TOO LATE ❌)
Cargofy:      Temperature rises → AI Predicts Failure → Route Calculated → Driver WhatsApp'd → Crisis Avoided ✅
```

**Cargofy does not just alert. It ACTS — autonomously.**

---

## 🎯 Chosen Themes

**FAR AWAY 2026 Hackathon**

| Theme | How Cargofy Addresses It |
|---|---|
| **Logistics & Transit** | End-to-end cold chain shipment management with live tracking, fleet management, risk scoring, and automated interventions |
| **Agentic & Autonomous Systems** | Google ADK-powered AI agent that autonomously detects risk, calculates reroutes, and dispatches WhatsApp alerts without any human in the loop |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Autonomous Rerouting Agent** | Google ADK + Gemini 2.0 Flash agent that predicts battery/AC failure and autonomously reroutes trucks to the nearest cold hub |
| 🗺️ **3D Fleet Visualization** | Mapbox GL JS map with 3D terrain, fog, pitch — animated truck markers colored by risk level (Green → Amber → Orange → Red) |
| 📊 **Control Tower Dashboard** | Real-time command center showing fleet health, active alerts, risk scores, and AI agent decisions via WebSocket |
| 🚚 **Shipment Lifecycle Management** | Create, track, and manage cold chain shipments with a step-by-step wizard — from pickup to delivery |
| 📈 **Analytics & Reporting** | Deep analytics on spoilage rates, risk trends, fleet utilization, temperature compliance, and route performance |
| ⚡ **Risk Engine** | Multi-factor risk scoring combining temperature, humidity, battery level, door status, ETA deviation, and weather conditions |
| 🚨 **Alerts Center** | Centralized alert management with severity levels, auto-escalation rules, and resolution tracking |
| 📱 **WhatsApp Alerts** | Instant automated WhatsApp messages to drivers via CallMeBot API — zero cost, no Twilio, no credit card |
| 🚛 **Fleet & Driver Management** | Complete vehicle and driver registry with compliance tracking, trip history, and performance scores |
| 🔗 **Blockchain Audit Trail** | Immutable on-chain shipment certificates on Ethereum Sepolia — recording temperature, risk, verdict (SAFE/SPOILED/PARTIAL) |
| 🌡️ **IoT Simulator** | Built-in telemetry simulator for demoing without physical hardware — generates realistic temperature, humidity, GPS, and battery data |
| 📟 **Custom PCB Hardware** | Production-ready ESP32 IoT node PCB design (KiCad) with DS18B20 temperature probe, DHT22 humidity, reed switch for door detection |
| 🔐 **Authentication** | Supabase Auth with email/password login and signup |
| 🌐 **Marketing Website** | 6 polished marketing pages: Landing, Product, Solutions, Pricing, About, Customers |

---

## 🏗️ Architecture & Approach

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                           │
│                                                                 │
│   Landing Page → Login → Control Tower Dashboard                │
│   (React 18 + TypeScript + Vite + Mapbox GL JS 3D)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS
          ┌────────────────┴──────────────────┐
          │                                   │
          ▼                                   ▼
┌──────────────────┐              ┌───────────────────────┐
│ Firebase Hosting │              │  Cloud Run (FastAPI)   │
│  (Global CDN)    │              │  asia-south1           │
│                  │              │  cargofy-backend       │
│  React SPA       │              └──────┬────────────────┘
│  dist/ files     │                     │
└──────────────────┘          ┌──────────┼──────────┐
          │                   │          │          │
          ▼                   ▼          ▼          ▼
┌──────────────────┐  ┌────────────┐ ┌────────┐ ┌──────────────┐
│ Supabase Auth    │  │ Gemini 2.0 │ │ Mapbox │ │  CallMeBot   │
│ + PostgreSQL DB  │  │ Flash +    │ │ GL JS  │ │  WhatsApp    │
│                  │  │ Google ADK │ │ 3D     │ │  (FREE)      │
└──────────────────┘  └────────────┘ └────────┘ └──────────────┘
          │                   │
          ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│ Firebase RTDB    │  │ Ethereum Sepolia │
│ Live telemetry   │  │ Smart Contract   │
│ + risk scores    │  │ Audit Trail      │
└──────────────────┘  └──────────────────┘
```

### Design Philosophy

**1. Agentic-First Architecture**
The AI agent doesn't just advise — it autonomously detects critical conditions, computes optimal reroutes, and dispatches WhatsApp messages to drivers. Zero human-in-the-loop for time-critical interventions.

**2. Real Production Hardware**
The project includes a KiCad PCB design for a custom ESP32-based IoT sensor node, with a full BOM (17 components, ₹650/unit). This is not a hypothetical — it's a production-ready 60×40mm board.

**3. Immutable Accountability**
Every shipment gets a blockchain certificate on Ethereum Sepolia. Temperature, risk scores, AI agent intervention count, and the final verdict (SAFE/SPOILED/PARTIAL) are permanently recorded on-chain.

**4. India-First Design**
Route calculations, cold hub databases, WhatsApp messaging (India's #1 communication app), and Hindi/English bilingual alerts — everything is designed for India's logistics reality.

---

## 🧠 How the Solution Works

### The Autonomous Intervention Flow

```
  ┌──────────────┐
  │ IoT Sensor / │     Every 30 seconds, telemetry data flows in:
  │ Simulator    │     temperature, humidity, battery, GPS, door status
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ Risk Engine  │     Multi-factor scoring: temp drift rate, battery
  │ (Python)     │     voltage curve, weather forecast, ETA deviation
  └──────┬───────┘
         │ risk_score > 70?
         ▼
  ┌──────────────┐
  │ Gemini 2.0   │     "Battery voltage dropping at 0.3V/hr. At current
  │ Flash Agent  │      rate, AC compressor will fail in ~45 minutes.
  │ (Google ADK) │      Nearest cold hub: Vashi Cold Storage, 12 km east."
  └──────┬───────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│WhatsApp│ │Dashboard │     Real-time WebSocket update to Control Tower
│ Alert  │ │ Update   │     + camera auto-flies to the truck on the 3D map
└────────┘ └──────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Single-page application |
| **3D Maps** | Mapbox GL JS (3D terrain, fog, pitch) | Fleet visualization with risk-colored markers |
| **Backend** | FastAPI (Python 3.11) | REST API with 20+ routers |
| **Database** | Supabase (PostgreSQL) + SQLAlchemy | Persistent storage for shipments, fleet, users |
| **Real-time** | Firebase RTDB + WebSockets | Live telemetry and risk score streaming |
| **AI Agent** | Google ADK 1.31 + Gemini 2.0 Flash | Autonomous rerouting and predictive analysis |
| **WhatsApp** | CallMeBot API (FREE) | Driver alerts — zero cost, no Twilio |
| **Blockchain** | Ethereum Sepolia (Solidity 0.8.19) | Immutable shipment audit certificates |
| **Hosting** | Firebase Hosting (CDN) + Cloud Run | Global frontend delivery + auto-scaling API |
| **Auth** | Supabase Auth | Email/password authentication |
| **Hardware** | ESP32 + DS18B20 + DHT22 + TP4056 | Custom IoT sensor node (KiCad PCB) |

---

## 📁 Project Structure

```
Cargofy/
├── backend/
│   ├── app/
│   │   ├── agents/                # AI agents
│   │   │   ├── cargofy_agent.py       # Main rerouting agent (Google ADK + Gemini)
│   │   │   ├── dispatch_agent.py      # Dispatch coordination agent
│   │   │   └── control_tower_agent.py # Control tower AI assistant
│   │   ├── routers/               # 20+ FastAPI endpoint routers
│   │   │   ├── auth.py                # Login, signup, token management
│   │   │   ├── shipments.py           # CRUD shipment operations
│   │   │   ├── shipment_detail.py     # Detailed shipment view
│   │   │   ├── tracking.py            # Live GPS tracking
│   │   │   ├── risk.py                # Risk score computation
│   │   │   ├── alerts.py              # Alert management & escalation
│   │   │   ├── analytics.py           # Analytics & reporting
│   │   │   ├── fleet.py               # Fleet & driver management
│   │   │   ├── control_tower.py       # Control tower aggregation
│   │   │   ├── interventions.py       # Risk intervention actions
│   │   │   ├── rerouting.py           # Autonomous rerouting endpoints
│   │   │   ├── blockchain.py          # Blockchain certify & verify
│   │   │   ├── simulator.py           # IoT telemetry simulator
│   │   │   ├── facilities.py          # Cold hub facility lookup
│   │   │   ├── wizard.py              # Shipment creation wizard
│   │   │   └── ...                    # webhook, notification, sensor, etc.
│   │   ├── services/              # Business logic layer
│   │   │   ├── gemini_service.py      # Gemini AI integration
│   │   │   ├── risk_engine.py         # Multi-factor risk scoring
│   │   │   ├── whatsapp_service.py    # CallMeBot WhatsApp alerts
│   │   │   ├── mapbox_service.py      # Mapbox routing & geocoding
│   │   │   ├── weather_service.py     # OpenWeather integration
│   │   │   ├── alert_service.py       # Alert creation & delivery
│   │   │   ├── cache_service.py       # Redis/Memorystore caching
│   │   │   └── ...                    # 15+ more services
│   │   ├── models/                # SQLAlchemy database models
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   ├── core/                  # Config, settings, constants
│   │   ├── db/                    # Database session management
│   │   └── main.py               # FastAPI app entry point
│   └── tests/                     # API tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── maps/              # 3D visualization components
│   │   │   │   ├── CargoMap3D.tsx     # Main 3D fleet map (Mapbox GL)
│   │   │   │   ├── LiveFleetMap.tsx   # Real-time fleet tracking map
│   │   │   │   ├── CargofyRouteMap.tsx # Route visualization
│   │   │   │   ├── Cesium3DFleetMap.tsx # Cesium.js 3D globe view
│   │   │   │   └── ContainerHeatmap.tsx # Container temperature heatmap
│   │   │   ├── ui/                # Shared UI components
│   │   │   │   ├── AICommandBar.tsx   # AI-powered command palette
│   │   │   │   ├── RiskBadge.tsx      # Color-coded risk indicators
│   │   │   │   ├── SwarmActivityFeed.tsx # Real-time activity stream
│   │   │   │   └── WhatsAppSetupModal.tsx # WhatsApp configuration
│   │   │   └── marketing/         # Marketing page components
│   │   ├── pages/
│   │   │   ├── dashboard/         # 12 dashboard pages
│   │   │   │   ├── ControlTower.tsx       # Command center overview
│   │   │   │   ├── ActiveShipments.tsx    # All active shipments list
│   │   │   │   ├── ShipmentDetail.tsx     # Individual shipment deep-dive
│   │   │   │   ├── LiveTracking.tsx       # Real-time GPS tracking
│   │   │   │   ├── Fleet3DView.tsx        # 3D fleet visualization
│   │   │   │   ├── FleetAndDrivers.tsx    # Vehicle & driver management
│   │   │   │   ├── AlertsCenter.tsx       # Alert management console
│   │   │   │   ├── RiskInterventions.tsx  # Risk actions & AI interventions
│   │   │   │   ├── CargofyAnalytics.tsx   # Analytics & charts
│   │   │   │   ├── CreateShipmentBasics.tsx # Shipment wizard (step 1)
│   │   │   │   ├── CreateShipmentReview.tsx # Shipment wizard (step 2)
│   │   │   │   └── ShipmentLaunched.tsx   # Shipment confirmation
│   │   │   ├── marketing/         # 6 marketing pages
│   │   │   │   ├── LandingPage.tsx
│   │   │   │   ├── ProductPage.tsx
│   │   │   │   ├── SolutionsPage.tsx
│   │   │   │   ├── PricingPage.tsx
│   │   │   │   ├── AboutPage.tsx
│   │   │   │   └── CustomersPage.tsx
│   │   │   └── auth/              # Authentication pages
│   │   │       ├── Login.tsx
│   │   │       └── Signup.tsx
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── lib/                   # API client, Supabase config, state store
│   │   └── utils/                 # Risk utilities, formatters
│   └── public/                    # Static assets & images
├── blockchain/
│   └── contracts/
│       └── CargofyShipmentAudit.sol  # Solidity smart contract (249 lines)
├── hardware/
│   ├── Cargofy_IoT_Node.kicad_pcb   # KiCad PCB design file
│   ├── bom.csv                       # Bill of Materials (17 components)
│   └── cargofy_iot_node_pcb_diagram pcb.png  # PCB layout diagram
├── docs/
│   └── cargofy_architecture.md       # Full system architecture document
├── docker-compose.yml                # Multi-service Docker setup
└── README.md
```

---

## 🔌 API Endpoints

The backend exposes **20+ API routers** under `/api/v1/`:

| Router | Prefix | Description |
|---|---|---|
| Auth | `/api/v1/auth` | User registration, login, token management |
| Shipments | `/api/v1/shipments` | Create, list, update, delete shipments |
| Shipment Detail | `/api/v1/shipments` | Deep shipment details with telemetry history |
| Shipment Wizard | `/api/v1/shipments` | Multi-step shipment creation wizard |
| Tracking | `/api/v1/tracking` | Live GPS tracking and location history |
| Sensors | `/api/v1/sensors` | IoT sensor data ingestion |
| Alerts | `/api/v1/alerts` | Alert creation, management, and escalation |
| Analytics | `/api/v1/analytics` | Dashboards, charts, trend data |
| Risk | `/api/v1/risk` | Risk score computation and history |
| Explain | `/api/v1/explain` | AI-generated risk explanations (Gemini) |
| Fleet & Drivers | `/api/v1/fleet` | Vehicle & driver CRUD and compliance |
| Control Tower | `/api/v1/control-tower` | Aggregated operational overview |
| Interventions | `/api/v1/interventions` | Risk intervention actions & history |
| Facilities | `/api/v1/facilities` | Cold hub and warehouse lookup |
| Simulator | `/api/v1/simulator` | IoT telemetry simulation for demos |
| Agent | `/api/v1/agent` | Autonomous rerouting agent triggers |
| Blockchain | `/api/v1/blockchain` | Certify shipments & verify on-chain |
| Webhooks | `/api/v1/webhook` | External webhook handlers |
| Notifications | `/api/v1/notify` | Push and WhatsApp notification dispatch |
| Pub/Sub | `/api/v1/pubsub` | Google Pub/Sub webhook handlers |

---

## 📟 Hardware — IoT Sensor Node

Cargofy includes a **production-ready custom PCB design** for a cold chain IoT sensor node.

### Specifications

| Spec | Detail |
|---|---|
| **MCU** | ESP32-WROOM-32D (Wi-Fi + BLE) |
| **Temperature** | DS18B20 waterproof probe (±0.5°C accuracy) |
| **Humidity** | AM2302 / DHT22 sensor |
| **Door Detection** | MK24 Reed switch (magnetic door sensor) |
| **Power** | TP4056 LiPo charger + AMS1117-3.3V regulator |
| **Battery** | 3.7V 2000mAh LiPo (JST-PH-2P connector) |
| **Programming** | Micro USB (programming + charging) |
| **PCB Size** | 60mm × 40mm, 2-layer |
| **Enclosure** | IP65 rated (waterproof) |
| **Battery Life** | ~72 hours continuous operation |
| **Unit Cost** | ₹650 (~$8 USD) |

### Bill of Materials (17 components)

| # | Component | Part Number | Qty | Purpose |
|---|---|---|---|---|
| 1 | ESP32-WROOM-32D | ESP32-WROOM-32D | 1 | MCU and Wi-Fi |
| 2 | Temperature probe | DS18B20+ | 1 | Cold-chain temperature |
| 3 | Humidity sensor | AM2302 / DHT22 | 1 | Humidity |
| 4 | LiPo charger | TC4056A / TP4056 | 1 | USB LiPo charging |
| 5 | 3.3V regulator | AMS1117-3.3 | 1 | Power regulation |
| 6 | LiPo battery connector | JST-PH-2P | 1 | Battery input |
| 7 | Reed switch | MK24 | 1 | Door open/closed detection |
| 8 | Pullup resistor | 4.7kΩ | 1 | DS18B20 data line |
| 9 | ADC divider resistors | 100kΩ | 2 | Battery voltage monitoring |
| 10 | LED resistors | 330Ω | 2 | LED current limiting |
| 11 | Bulk capacitors | 10µF | 3 | Power decoupling |
| 12 | Bypass capacitors | 100nF | 4 | High-frequency decoupling |
| 13 | Status LED (green) | 0402 | 1 | Connected indicator |
| 14 | Alert LED (red) | 0402 | 1 | Error/alert indicator |
| 15 | Micro USB connector | USB-B-Micro | 1 | Programming & charging |
| 16 | Reset button | 4×4mm tact | 1 | EN reset |
| 17 | Boot button | 4×4mm tact | 1 | GPIO0 boot mode |

---

## 🔗 Blockchain Audit Trail

The `CargofyShipmentAudit.sol` smart contract (Solidity 0.8.19) deploys on **Ethereum Sepolia Testnet** and creates immutable audit certificates for every completed shipment.

### Certificate Data Recorded On-Chain

```solidity
struct ShipmentCertificate {
    string  shipmentCode;       // e.g. "SHP-MH-001"
    string  productType;        // e.g. "milk", "pharma"
    address certifiedBy;        // Cargofy backend wallet
    uint256 departureTime;      // Unix timestamp
    uint256 arrivalTime;        // Unix timestamp
    int16   minTempTenths;      // Min temp × 10 (e.g. 42 = 4.2°C)
    int16   maxTempTenths;      // Max temp × 10 (e.g. 95 = 9.5°C)
    uint8   maxRiskScore;       // 0-100 (peak risk during journey)
    uint8   rerouteCount;       // Times AI agent intervened
    bool    whatsappAlertSent;  // Was driver alerted?
    Verdict verdict;            // SAFE | SPOILED | PARTIAL | UNKNOWN
    string  ipfsMetadataHash;   // Full telemetry log on IPFS
}
```

### Verdict Types

| Verdict | Meaning |
|---|---|
| `SAFE` | Shipment completed within all temperature and time thresholds |
| `SPOILED` | Critical temperature breach detected — goods compromised |
| `PARTIAL` | Minor deviations detected but goods likely salvageable |
| `UNKNOWN` | Insufficient telemetry data for determination |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+ and **pip**
- A **Supabase** project (free tier works)
- API keys: Gemini, Mapbox (optional), CallMeBot (optional)

### 1. Clone the Repository

```bash
git clone https://github.com/Afuu-coder/Cargofy.git
cd Cargofy
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
cp .env.example .env           # Fill in your API keys
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev                    # Opens at http://localhost:5173
```

### 4. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Required
DATABASE_URL=postgresql://...          # Supabase connection string
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key

# Optional (enhanced features)
MAPBOX_API_KEY=your-mapbox-token       # 3D map visualization
CALLMEBOT_API_KEY=your-key             # WhatsApp alerts
CALLMEBOT_PHONE=+91xxxxxxxxxx
FIREBASE_DB_URL=https://xxx.firebaseio.com  # Real-time telemetry
BLOCKCHAIN_RPC_URL=https://sepolia.infura.io/v3/xxx
BLOCKCHAIN_PRIVATE_KEY=0x...
```

### 5. Trigger an Agentic Demo

```bash
curl -X POST http://localhost:8000/api/v1/agent/simulate-critical \
  -H "Content-Type: application/json" \
  -d '{"scenario": "battery_failure", "shipment_id": "SHP-DEMO-001"}'
```

Watch the 3D map fly to the truck, risk levels spike to RED, and a WhatsApp alert fire to the driver! 🚨

---

## 🌐 Deployment

| Service | Platform | Region | URL |
|---|---|---|---|
| **Frontend** | Firebase Hosting (CDN) | Global | [cargofy-live-2026.web.app](https://cargofy-live-2026.web.app) |
| **Backend API** | Google Cloud Run | asia-south1 (Mumbai) | Auto-scaling, HTTPS |
| **Database** | Supabase PostgreSQL | — | Managed PostgreSQL |
| **Real-time DB** | Firebase RTDB | — | Live telemetry streaming |
| **Blockchain** | Ethereum Sepolia | — | Testnet smart contract |

---

## 💡 Assumptions Made

1. **IoT Telemetry is Simulated** — The built-in simulator generates realistic cold chain telemetry (temperature, humidity, GPS, battery). The custom PCB design is provided for physical deployment.
2. **WhatsApp via CallMeBot** — Uses the free CallMeBot API for WhatsApp alerts. Production deployments would use Meta Business API.
3. **Blockchain on Testnet** — The smart contract runs on Sepolia testnet. Production would deploy to Ethereum mainnet or a permissioned chain.
4. **India-Focused Routes** — Route calculations and cold hub databases are seeded with Indian geography (Mumbai, Delhi, Pune, etc.).

---

## 🔮 Future Roadmap

- [ ] **Multi-tenant Organization Support** — Multiple logistics companies on one platform
- [ ] **Physical IoT Deployment** — Manufacture and deploy the ESP32 PCB nodes
- [ ] **Mainnet Blockchain** — Deploy smart contract to Polygon for low-gas production use
- [ ] **Meta WhatsApp Business API** — Upgrade from CallMeBot to official Meta API
- [ ] **ML Spoilage Prediction** — Train custom models on historical telemetry for better accuracy
- [ ] **Mobile App** — React Native driver app with push notifications
- [ ] **Regulatory Compliance** — FSSAI temperature logging compliance reports

---

<div align="center">

**Built with ❤️ for FAR AWAY 2026 Hackathon**

_Real problem → Real system → Real demo_

[![GitHub](https://img.shields.io/badge/GitHub-Afuu--coder-181717?style=flat-square&logo=github)](https://github.com/Afuu-coder)

</div>