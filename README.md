<div align="center">

<img src="https://img.shields.io/badge/Axon-Cold%20Chain%20Intelligence-00d4aa?style=for-the-badge" alt="Axon"/>

# 🧠 Axon — Cold Chain Intelligence Platform

### *Stop Cold Chain Loss. Before It Happens.*

**India's first AI-powered cold chain intelligence platform.**  
Monitor every perishable shipment in real time, predict spoilage before it occurs, and intervene — automatically.

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-axon--802101774295.asia--south1.run.app-00d4aa?style=for-the-badge)](https://axon-802101774295.asia-south1.run.app)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud%20Run-Deployed-4285F4?style=flat-square&logo=googlecloud)](https://cloud.google.com/run)
[![Gemini AI](https://img.shields.io/badge/Gemini%20AI-Powered-8E44AD?style=flat-square&logo=google)](https://deepmind.google/technologies/gemini/)

</div>

---

## 🚨 The Problem

Every year in India:
- **₹92,000 Crore** worth of food is wasted due to cold chain failure
- **40%** of perishables spoil before reaching consumers
- **No real-time system** exists to monitor, predict, or intervene in cold chain breakdowns
- Dairy, pharma, seafood, and produce industries lose billions — silently

**Axon solves this.**

---

## ✨ What is Axon?

Axon is an end-to-end cold chain operations platform that gives logistics managers a **single pane of glass** to:

| Capability | Description |
|------------|-------------|
| 🗺️ **Live Tracking** | Real-time shipment GPS + route visualization on Mapbox |
| 🤖 **AI Risk Engine** | Spoilage probability scored every 60 seconds using Google Gemini |
| ⚡ **Auto Interventions** | One-tap or automated WhatsApp alerts via Twilio to drivers |
| 📡 **IoT Simulator** | Test any cold chain scenario without physical hardware |
| 📊 **Analytics Dashboard** | Business intelligence — savings, trends, state-wise heatmaps |
| 🚛 **Fleet Management** | Full driver and vehicle lifecycle management |
| 🔔 **Alert Center** | Multi-channel alert system (WhatsApp, in-app, SMS) |

---

## 🏗️ Architecture

```
axon-app/
├── 📂 backend/                    # FastAPI Python Backend
│   ├── app/
│   │   ├── agents/                # AI agents (risk scoring, intervention)
│   │   │   └── risk_agent.py
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic settings (reads from .env)
│   │   │   └── security.py        # JWT auth
│   │   ├── db/
│   │   │   └── session.py         # SQLAlchemy session factory
│   │   ├── models/
│   │   │   └── models.py          # User, Shipment, SensorReading, RiskEvent, Alert
│   │   ├── routers/               # 22 API route modules
│   │   │   ├── auth.py            # Login, register, JWT
│   │   │   ├── shipments.py       # CRUD + lifecycle
│   │   │   ├── tracking.py        # Live GPS + route engine
│   │   │   ├── risk.py            # Risk scoring API
│   │   │   ├── interventions.py   # Intervention engine
│   │   │   ├── iot_simulator.py   # IoT telemetry simulator
│   │   │   ├── simulator.py       # Full route simulation
│   │   │   ├── fleet.py           # Drivers & vehicles
│   │   │   ├── analytics.py       # Business analytics
│   │   │   ├── alerts.py          # Alert management
│   │   │   ├── control_tower.py   # Dashboard aggregator
│   │   │   └── ...               # (15 more routers)
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── services/              # 21 service modules
│   │   │   ├── risk_engine.py     # Core AI risk computation
│   │   │   ├── simulator_service.py # Route + telemetry simulation
│   │   │   ├── intervention_agent.py # Automated intervention logic
│   │   │   ├── alert_service.py   # Multi-channel alert dispatch
│   │   │   ├── whatsapp_service.py # Twilio WhatsApp integration
│   │   │   ├── firebase_rtdb.py   # Firebase Realtime DB sync
│   │   │   ├── mapbox_service.py  # Route calculation
│   │   │   ├── gemini_service.py  # Google Gemini AI calls
│   │   │   ├── bigquery_service.py # Analytics pipeline
│   │   │   └── ...               # (12 more services)
│   │   └── main.py               # App entrypoint, CORS, static SPA
│   │
│   ├── scripts/
│   │   ├── seed.py               # Demo data seeder (auto-runs in prod)
│   │   └── seed_demo.py          # Extended demo scenarios
│   │
│   ├── secrets/                  # 🔒 Firebase service account (gitignored)
│   ├── static/                   # Built React SPA (served by FastAPI)
│   ├── Dockerfile                # Multi-stage production build
│   ├── start.sh                  # Auto-seed + uvicorn startup script
│   ├── requirements.txt
│   ├── .env.example              # Environment variable template
│   └── pyrightconfig.json
│
├── 📂 frontend/                   # React + Vite Frontend (TypeScript)
│   ├── public/
│   │   └── images/               # AI-generated UI mockups
│   ├── src/
│   │   ├── components/
│   │   │   ├── axon/             # Dashboard UI components
│   │   │   │   ├── ShipmentCard.tsx
│   │   │   │   ├── RiskGauge.tsx
│   │   │   │   ├── FleetMap.tsx
│   │   │   │   └── ...
│   │   │   └── marketing/        # Landing page components
│   │   │       ├── AnimatedIndiaMap.tsx  # SVG India map with parallax
│   │   │       ├── HeroSection.tsx
│   │   │       └── ...
│   │   ├── pages/
│   │   │   ├── axon/             # Dashboard pages
│   │   │   │   ├── ControlTower.tsx    # Main dashboard
│   │   │   │   ├── LiveTracking.tsx    # Mapbox live map
│   │   │   │   ├── RiskInterventions.tsx
│   │   │   │   ├── IoTSimulator.tsx
│   │   │   │   ├── Analytics.tsx
│   │   │   │   ├── FleetDrivers.tsx
│   │   │   │   └── ...
│   │   │   └── marketing/
│   │   │       └── LandingPage.tsx     # Public marketing page
│   │   ├── hooks/                # Custom React hooks
│   │   ├── lib/
│   │   │   └── api.ts            # Axios client with JWT interceptors
│   │   └── utils/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── 📂 docs/
│   └── axon_architecture.md      # System architecture document
│
├── docker-compose.yml            # Local development compose
└── README.md
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **FastAPI** | 0.115 | REST API framework |
| **SQLAlchemy** | 2.0 | ORM (SQLite in demo, PostgreSQL in prod) |
| **Pydantic** | 2.10 | Data validation & settings |
| **Uvicorn** | 0.32 | ASGI server |
| **Python-JOSE** | 3.3 | JWT authentication |
| **Passlib** | 1.7 | Password hashing |

### AI & Cloud
| Technology | Purpose |
|-----------|---------|
| **Google Gemini API** | AI risk explanation & intervention suggestions |
| **Vertex AI** | Advanced ML model hosting |
| **Google ADK** | Agent Development Kit |
| **Firebase Realtime DB** | Real-time telemetry sync |
| **Google BigQuery** | Analytics data warehouse |
| **Google Cloud Pub/Sub** | Event streaming pipeline |
| **Google Cloud Run** | Serverless container deployment |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 18 | UI framework |
| **TypeScript** | 5.x | Type safety |
| **Vite** | 8.x | Build tool |
| **Mapbox GL JS** | 3.x | Interactive maps & routing |
| **Tailwind CSS** | 3.x | Utility-first styling |
| **Axios** | 1.x | HTTP client |
| **Recharts** | 2.x | Data visualization |

### Integrations
| Service | Purpose |
|---------|---------|
| **Twilio WhatsApp** | Driver alert SMS/WhatsApp |
| **OpenWeatherMap** | Real-time weather for risk scoring |
| **Mapbox Directions** | Route optimization |
| **OSRM** | Open-source route matching |

---

## 🚀 Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Mapbox public token (free at mapbox.com)
- (Optional) Google Gemini API key for AI features

### 1. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Seed demo data
python scripts/seed.py

# Start server
uvicorn app.main:app --reload --port 8000
```

📍 Backend API: http://localhost:8000  
📚 API Docs (Swagger): http://localhost:8000/docs

### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Set VITE_MAPBOX_TOKEN=your_mapbox_token

# Start dev server
npm run dev
```

📍 Frontend: http://localhost:3000

### 3. Using Docker Compose (Easiest)
```bash
# From axon-app/ root
docker-compose up
```

---

## ☁️ Deployment (Google Cloud Run)

The frontend is built and bundled inside the backend's `static/` folder, served by FastAPI as a single unified service.

```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Copy build into backend/static
xcopy /E /I /Y dist ..\backend\static

# 3. Deploy to Cloud Run
cd ..\backend
gcloud run deploy axon \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=sqlite:///./axon.db"
```

The `start.sh` startup script automatically:
1. Creates database tables (`create_all`)
2. Seeds demo data if DB is empty
3. Starts the uvicorn server

---

## 🔑 Environment Variables

Copy `backend/.env.example` and fill in your values:

```env
# Core
DATABASE_URL=sqlite:///./axon.db      # or postgresql://...
SECRET_KEY=your-secret-key
ENVIRONMENT=development

# Google AI
GEMINI_API_KEY=your-gemini-key
VERTEX_AI_PROJECT=your-gcp-project
GOOGLE_MAPS_API_KEY=your-maps-key

# Firebase
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase_service_account.json
FIREBASE_DB_URL=https://your-project.firebaseio.com

# Twilio (WhatsApp Alerts)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Mapbox
MAPBOX_API_KEY=pk.eyJ1...
```

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | User authentication |
| `GET` | `/shipments/` | List all shipments |
| `POST` | `/shipments/` | Create new shipment |
| `GET` | `/control-tower/summary` | Dashboard KPIs |
| `GET` | `/tracking/{id}/live` | Live GPS + route |
| `GET` | `/risk/{id}` | AI risk score |
| `POST` | `/interventions/{id}/intervene` | Trigger intervention |
| `POST` | `/iot-simulator/push` | Simulate IoT telemetry |
| `GET` | `/analytics/overview` | Business analytics |
| `GET` | `/fleet/drivers` | Driver management |
| `GET` | `/alerts/` | Alert history |

Full interactive API docs at: `{base_url}/docs`

---

## 🎯 Key Demo Flows

### 1. Cold Chain Crisis Scenario
1. Open IoT Simulator → Select shipment AXN-2091
2. Raise temperature to 12°C via slider
3. Watch risk score jump to CRITICAL (91%+)
4. See AI explanation populate automatically
5. Click "Intervene" → WhatsApp alert fires to driver

### 2. Live Tracking
1. Navigate to Live Tracking
2. See all 6 shipments on Mapbox map with color-coded routes
3. Click any truck icon → Shipment detail popup
4. Watch position update in real-time

### 3. Analytics
1. Navigate to Analytics
2. See ₹0 loss prevented (demo baseline)
3. View spoilage trend chart & state-wise heatmap

---

## 🏢 Target Clients

- **Dairy**: Amul, Mother Dairy, Heritage Foods
- **Pharma**: CIPLA, Dr. Reddy's, Sun Pharma
- **Produce**: ITC Agri, Reliance Fresh, BigBasket
- **Seafood**: Marine Product Export Development Authority

---

## 📈 Business Model

| Plan | Price | Features |
|------|-------|---------|
| **Starter** | ₹2,999/mo | 5 shipments, basic tracking |
| **Pro** | ₹9,999/mo | 50 shipments, AI risk engine, WhatsApp alerts |
| **Enterprise** | Custom | Unlimited, custom integrations, SLA |

---

## 👨‍💻 Author

**Afjal Quraishi**  
B.Tech CSE — DUIET  
📧 afjalambani@gmail.com  
🔗 [GitHub @Afuu-coder](https://github.com/Afuu-coder)

---

## 📄 License

This project is proprietary software. All rights reserved © 2026 Afjal Quraishi / Axon Platform.

---

<div align="center">

**Made with ❤️ in India 🇮🇳**  
*Protecting India's Cold Chain — One Shipment at a Time*

</div>
