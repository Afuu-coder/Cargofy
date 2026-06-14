# 🏗️ CARGOFY — Master Backend Architecture & Infrastructure

**Document Type:** Complete System Reference  
**Stack:** Google Cloud Platform · Google ADK · Gemma 2 · Vertex AI · Cloud Run · Firebase · Mapbox · Pub/Sub · BigQuery · Dataflow

---

## 🌐 Complete System Architecture

```mermaid
flowchart TD
    subgraph External Inputs
        IoT[IoT Sensors / MQTT]
        GPS[GPS Devices]
        WA[WhatsApp Webhooks]
        API[User API calls]
    end

    subgraph Ingestion Layer
        IoTBroker[Cloud IoT Core / MQTT Broker]
        Gateway[API Gateway - Cloud Run]
    end

    subgraph Stream Processing Layer
        DFTelemetry[Dataflow: cargofy-telemetry-pipeline]
        DFEvents[Dataflow: events-to-bigquery]
    end

    subgraph Intelligence Layer
        VertexModels[Vertex AI Endpoints]
        ADKAgents[Google ADK Agents]
        Gemma[Gemma 2 via Vertex AI]
    end

    subgraph Microservices Layer
        GatewaySVC(cargofy-gateway-svc)
        ShipmentSVC(cargofy-shipment-svc)
        TrackingSVC(cargofy-tracking-svc)
        RiskSVC(cargofy-risk-svc)
        AlertsSVC(cargofy-alerts-svc)
        SimulatorSVC(cargofy-simulator-svc)
        AnalyticsSVC(cargofy-analytics-svc)
        FleetSVC(cargofy-fleet-svc)
        WebhookSVC(cargofy-webhook-svc)
        InterventionSVC(cargofy-intervention-svc)
        NotificationSVC(cargofy-notification-svc)
        ControlTowerSVC(cargofy-control-tower-svc)
    end

    subgraph Data Layer
        RTDB[(Firebase RTDB)]
        Firestore[(Firestore)]
        BQ[(BigQuery)]
        Redis[(Cloud Memorystore)]
        GCS[(Cloud Storage)]
    end

    IoT --> IoTBroker
    GPS --> IoTBroker
    WA --> Gateway
    API --> Gateway

    IoTBroker -->|telemetry-stream| DFTelemetry
    Gateway -->|ops-events| DFEvents

    DFTelemetry --> VertexModels
    DFEvents --> BQ

    GatewaySVC --> ShipmentSVC
    GatewaySVC --> FleetSVC
    GatewaySVC --> AnalyticsSVC
    
    ShipmentSVC -.-> Firestore
    FleetSVC -.-> Firestore
    AnalyticsSVC -.-> BQ

    DFTelemetry -.-> RTDB
    AlertsSVC -.-> RTDB
    
    AlertsSVC --> NotificationSVC
    NotificationSVC --> WA
```

---

## 🛠️ All Cloud Run Microservices

| Service | Language | Memory | Min Instances | Purpose |
|---|---|---|---|---|
| `cargofy-gateway-svc` | Node.js | 256MB | 2 | Auth + routing |
| `cargofy-shipment-svc` | Node.js | 512MB | 2 | Shipment CRUD + detail |
| `cargofy-tracking-svc` | Node.js | 512MB | 2 | Live tracking API |
| `cargofy-risk-svc` | Python | 1GB | 2 | Risk score API + explanations |
| `cargofy-alerts-svc` | Node.js | 512MB | 2 | Alert creation + delivery |
| `cargofy-simulator-svc` | Node.js | 256MB | 1 | Synthetic telemetry emitter |
| `cargofy-analytics-svc` | Python | 1GB | 1 | BigQuery analytics API |
| `cargofy-fleet-svc` | Node.js | 256MB | 1 | Driver + vehicle management |
| `cargofy-intervention-svc` | Python | 512MB | 1 | Execute intervention actions |
| `cargofy-webhook-svc` | Node.js | 128MB | 1 | WhatsApp webhook handler |
| `cargofy-notification-svc` | Node.js | 128MB | 1 | FCM + SMS dispatcher |
| `cargofy-control-tower-svc` | Node.js | 512MB | 2 | Control Tower aggregation |
| `cargofy-report-generator` | Python | 2GB | 0 | PDF/Excel report generation (Job) |

---

## 📨 Pub/Sub Topics & Subscriptions

- **telemetry-stream**: IoT Core, cargofy-simulator-svc → Dataflow (cargofy-telemetry-pipeline)
- **ops-events**: All services → Dataflow (events-to-bigquery)
- **shipment-created**: cargofy-shipment-svc → cargofy-alerts-svc, cargofy-tracking-svc, cargofy-iot-svc, Firebase-sync
- **risk-state-changed**: Dataflow → cargofy-alerts-svc, cargofy-intervention-svc, Firebase-sync
- **alert-events**: cargofy-alerts-svc → Firebase-sync, cargofy-analytics-svc
- **stage-changed**: cargofy-tracking-svc → cargofy-alerts-svc, Firebase-sync, cargofy-analytics-svc
- **vehicle-health-alerts**: Vertex AI health prediction job → cargofy-alerts-svc
- **intervention-taken**: cargofy-intervention-svc → cargofy-analytics-svc, Firebase-sync

---

## 🔥 Firebase Realtime Database: Schema

```json
{
  "network_stats": {},
  "live_tracking": {},
  "risk_scores": {},
  "alerts_live": {},
  "ai_action_queue": [],
  "simulator_states": {},
  "vehicle_health": {},
  "driver_location": {},
  "stage_events": {}
}
```

---

## 🗄️ Firestore Collections

- `shipments` → Core shipment documents
- `wizard_drafts` → Auto-saved wizard state
- `drivers` → Driver profiles
- `vehicles` → Vehicle profiles
- `iot_pairings` → Device ↔ shipment pairing
- `stage_events` → Journey milestone log
- `shipment_telemetry` → IoT telemetry history
- `alerts` → All alerts ever sent
- `alert_templates` → WhatsApp/SMS templates
- `interventions` → All intervention actions
- `shipment_notes` → Dispatcher incident notes
- `cold_hubs` → Cold storage hub directory
- `simulator_sessions` → Active simulator state
- `simulator_presets` → Preset configurations
- `organizations` → Multi-tenant orgs
- `users` → User accounts + roles
- `escalation_configs` → Per-org escalation rules
- `sla_configs` → Per-product SLA thresholds

---

## 🤖 Vertex AI Models Summary

1. **spoilage-risk-model**: XGBoost Regressor + Classifier
2. **eta-predictor**: XGBoost Regressor
3. **reefer-health-model**: Gradient Boosting Classifier
4. **trend-forecaster**: AutoML Time Series (BQML)
5. **Gemma 2 (gemma-2-9b-it)**: Risk explanation text, alert message generation, AI action copy

---

## 🔐 Authentication & Authorization

All Cloud Run services validate JWT from Firebase Auth. User roles are stored as custom claims.

---

## 🗺️ Mapbox Services Used

- **Directions API**: Route calculation with traffic
- **Map Matching API**: Snap GPS to road
- **Geocoding API**: Address autocomplete
- **Isochrone API**: Cold hub reachability circles
- **Matrix API**: Multi-hub distance calculation
- **Optimization API**: Multi-stop route optimization

---

## ⚡ Performance Targets

- **Live tracking data**: < 200ms
- **IoT telemetry → Firebase RTDB**: < 5 seconds end-to-end
- **Risk score update**: < 10 seconds from telemetry
- **Alert delivery (WhatsApp)**: < 90 seconds from trigger
