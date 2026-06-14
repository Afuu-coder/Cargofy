import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

import { supabase } from "./supabase";

// Attach auth token if present
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token =
    data.session?.access_token || localStorage.getItem("cargofy_token");
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

/* ── Interfaces ─────────────────────────────────────────────────────────────── */

export interface Shipment {
  id: string;
  shipment_code: string;
  product_type: string;
  product_qty?: number;
  product_unit?: string;
  origin?: string;
  destination?: string;
  origin_lat?: number;
  origin_lng?: number;
  dest_lat?: number;
  dest_lng?: number;
  vehicle_number?: string;
  driver_phone?: string;
  expected_departure?: string;
  expected_arrival?: string;
  status: string;
  created_at?: string;
  current_location?: {
    lat: number;
    lng: number;
  };
  current_risk?: {
    risk_score?: number;
    risk_category?: string;
    temperature?: number;
    time_to_spoil_minutes?: number;
    computed_at?: string;
    explanation?: string;
    actions?: ActionItem[];
    estimated_loss_inr?: number;
  };
}

export interface ActionItem {
  priority: number;
  action: string;
  facility?: string;
  distance_km?: number;
}

export interface RiskResult {
  risk_score: number;
  risk_category: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  time_to_spoil_minutes: number;
  factors: {
    temp_factor: number;
    delay_factor: number;
    ambient_factor: number;
  };
  product_type: string;
  safe_max_temp: number;
  critical_temp: number;
  explanation?: string;
  actions?: ActionItem[];
  estimated_loss_inr?: number;
  nearby_facilities?: FacilityResult[];
}

export interface SensorPayload {
  temperature: number;
  humidity?: number;
  lat?: number;
  lng?: number;
  delay_minutes?: number;
  source?: string;
  // IoT GPS fields
  device_id?: string;
  speed_kmh?: number;
  door_status?: string;
  battery_pct?: number;
}

export interface SensorReading {
  id: string;
  recorded_at: string;
  temperature?: number;
  humidity?: number;
  delay_minutes?: number;
  source?: string;
  ambient_temp?: number;
  risk_computed?: Partial<RiskResult>;
}

export interface RiskEvent {
  id: string;
  shipment_id: string;
  risk_score: number;
  risk_category: string;
  time_to_spoil: number;
  explanation?: string;
  actions?: ActionItem[];
  alert_sent?: boolean;
  alert_sent_at?: string;
  created_at?: string;
}

export interface Alert {
  id: string;
  shipment_id?: string;
  shipment_code?: string;
  recipient_phone?: string;
  channel?: string;
  message_body?: string;
  delivered?: boolean;
  created_at?: string;
}

export interface FacilityResult {
  name: string;
  address: string;
  distance_km: number;
  lat: number;
  lng: number;
  place_id: string;
}

export interface CreateShipmentPayload {
  product_type: string;
  product_qty?: number;
  product_unit?: string;
  origin?: string;
  destination?: string;
  vehicle_number?: string;
  driver_phone?: string;
  owner_phone?: string;
  expected_departure?: string;
  expected_arrival?: string;
}

export interface AnalyticsSummary {
  source?: string;
  total_shipments: number;
  active_shipments: number;
  high_risk_shipments: number;
  total_alerts_sent: number;
  estimated_savings_inr: number;
  total_loss_prevented_inr?: number;
  avg_risk_score: number;
  risk_distribution?: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
}

export interface AuthResponse {
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  business_name?: string;
  token: string;
  is_new: boolean;
}

/* ── Auth Functions ─────────────────────────────────────────────────────────── */

export const login = (
  email: string,
  password: string,
  name?: string,
  phone?: string,
) =>
  api
    .post<AuthResponse>("/api/v1/auth/login", { email, password, name, phone })
    .then((r) => r.data);

export const signup = (payload: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  business_name?: string;
  business_type?: string;
}) =>
  api.post<AuthResponse>("/api/v1/auth/signup", payload).then((r) => r.data);

/* ── API Functions ──────────────────────────────────────────────────────────── */

// Shipments
export const getShipments = (status_filter = "all") =>
  api
    .get<Shipment[]>("/api/v1/shipments", { params: { status_filter } })
    .then((r) => r.data);

export const getShipment = (id: string) =>
  api.get<Shipment>(`/api/v1/shipments/${id}`).then((r) => r.data);

export const createShipment = (payload: CreateShipmentPayload) =>
  api.post<Shipment>("/api/v1/shipments", payload).then((r) => r.data);

export const updateShipmentOutcome = (
  id: string,
  outcome: "delivered" | "spoiled",
) =>
  api.put(`/api/v1/shipments/${id}/outcome`, { outcome }).then((r) => r.data);

export const getRoute = async (
  origin_lat: number,
  origin_lng: number,
  dest_lat: number,
  dest_lng: number,
  shipment_id: string = "temp",
) => {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin_lng},${origin_lat};${dest_lng},${dest_lat}?overview=full&geometries=geojson`;
  try {
    const res = await axios.get(url);
    if (res.data && res.data.routes && res.data.routes.length > 0) {
      return { route_geometry: res.data.routes[0].geometry };
    }
    return { route_geometry: null };
  } catch (error) {
    console.error("OSRM route fetch failed:", error);
    return { route_geometry: null };
  }
};

// Sensor readings
export const sendSensor = (id: string, payload: SensorPayload) =>
  api.post(`/api/v1/sensors/${id}/sensor`, payload).then((r) => r.data);

export const getSensorHistory = (id: string) =>
  api
    .get<SensorReading[]>(`/api/v1/shipments/${id}/sensors`)
    .then((r) => r.data);

// Risk
export const computeRisk = (payload: {
  temperature: number;
  delay_minutes: number;
  product_type: string;
  ambient_temp?: number;
  shipment_id?: string;
}) => api.post<RiskResult>("/api/v1/risk/compute", payload).then((r) => r.data);

export const getRiskEvents = (shipmentId: string) =>
  api
    .get<RiskEvent[]>(`/api/v1/shipments/${shipmentId}/risk-events`)
    .then((r) => r.data);

// Alerts
export const sendTestAlert = (phone: string, shipment_id?: string) =>
  api.post("/api/v1/alerts/test", { phone, shipment_id }).then((r) => r.data);

export const getAlerts = () =>
  api.get<Alert[]>("/api/v1/alerts").then((r) => r.data);

// Flow D: Manual dispatcher alert
export const sendManualAlert = (payload: {
  shipment_id: string;
  alert_type?: string;
  channel?: string;
  custom_note?: string;
  template_id?: string;
}) => api.post("/api/v1/alerts/send-manual", payload).then((r) => r.data);

// Live Firestore alert feed
export const getLiveAlerts = (severity?: string, status?: string) =>
  api
    .get<LiveAlert[]>("/api/v1/alerts/live", { params: { severity, status } })
    .then((r) => r.data);

// Alert thread (message timeline)
export const getAlertThread = (alertId: string) =>
  api
    .get<{
      alert_id: string;
      thread: ThreadEvent[];
    }>(`/api/v1/alerts/${alertId}/thread`)
    .then((r) => r.data);

// Resend alert
export const resendAlert = (alertId: string) =>
  api.post(`/api/v1/alerts/${alertId}/resend`).then((r) => r.data);

// Mark false positive
export const markAlertFalsePositive = (alertId: string, note?: string) =>
  api
    .post(`/api/v1/alerts/${alertId}/mark-false-positive`, { note })
    .then((r) => r.data);

export interface LiveAlert {
  id: string;
  shipment_id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  ack_status:
    | "SENT"
    | "DELIVERED"
    | "READ"
    | "UNREAD"
    | "ESCALATED"
    | "FALSE_POSITIVE"
    | "FAILED";
  sent_at: string;
  driver_name?: string;
  channel?: string;
  recipient_phone?: string;
  escalated_to?: string[];
  template_id?: string;
  risk_score_at_trigger?: number;
}

export interface ThreadEvent {
  type: string;
  occurred_at: string;
  content?: string;
  actor?: string;
  channel?: string;
}

// Facilities
export const getNearbyFacilities = (lat: number, lng: number, radius_km = 20) =>
  api
    .post<{
      facilities: FacilityResult[];
      count: number;
    }>("/api/v1/facilities/nearby", { lat, lng, radius_km })
    .then((r) => r.data);

// Analytics
export const getAnalyticsSummary = () =>
  api.get<AnalyticsSummary>("/api/v1/analytics/summary").then((r) => r.data);

/* ── Live Tracking API ──────────────────────────────────────────────────────── */

export interface LiveTrackingData {
  shipment_code: string;
  shipment_id: string;
  origin?: string;
  destination?: string;
  product_type?: string;
  vehicle_number?: string;
  stage: string;
  stage_rail: {
    stage: string;
    label: string;
    icon: string;
    completed: boolean;
    active: boolean;
  }[];
  position: {
    lat?: number;
    lng?: number;
    progress_pct: number;
    remaining_km: number;
  };
  eta: {
    eta_minutes: number;
    confidence: number;
    source: string;
    sla_deadline?: string;
  };
  risk: {
    risk_score?: number;
    risk_category?: string;
    spoilage_window_min?: number;
  };
  telemetry: {
    temperature?: number;
    humidity?: number;
    speed_kmh?: number;
    battery_pct?: number;
    door_status?: string;
    last_sync_ts?: number;
    silence_alert?: boolean;
  };
  route_geometry?: any;
  _rtdb_live: boolean;
}

export interface FleetPosition {
  shipment_code: string;
  lat?: number;
  lng?: number;
  stage: string;
  risk_category: string;
  risk_score?: number;
  speed_kmh?: number;
  eta_min?: number;
  progress_pct?: number;
  silence_alert?: boolean;
}

export const getTrackingData = (shipmentCode: string) =>
  api
    .get<LiveTrackingData>(`/api/v1/tracking/${shipmentCode}`)
    .then((r) => r.data);

export const getTrackingHistory = (
  shipmentCode: string,
  from?: string,
  to?: string,
) =>
  api
    .get(`/api/v1/tracking/${shipmentCode}/history`, {
      params: { from_ts: from, to_ts: to },
    })
    .then((r) => r.data);

export const getStageEvents = (shipmentCode: string) =>
  api.get(`/api/v1/tracking/${shipmentCode}/stage-events`).then((r) => r.data);

export const getFleetPositions = () =>
  api
    .get<{
      count: number;
      positions: FleetPosition[];
    }>("/api/v1/tracking/fleet/positions")
    .then((r) => r.data);

export const overrideStage = (
  shipmentCode: string,
  newStage: string,
  note = "",
  by = "dispatcher",
) =>
  api
    .post(`/api/v1/tracking/${shipmentCode}/stage-override`, {
      new_stage: newStage,
      note,
      override_by: by,
    })
    .then((r) => r.data);

export const getDynamicEta = (shipmentCode: string) =>
  api.get(`/api/v1/tracking/${shipmentCode}/eta`).then((r) => r.data);

export const checkSensorSilence = (thresholdMin = 10) =>
  api
    .get("/api/v1/tracking/check-silence", {
      params: { threshold_min: thresholdMin },
    })
    .then((r) => r.data);

export const simulateIoTTelemetry = (payload: {
  device_id: string;
  shipment_code: string;
  latitude: number;
  longitude: number;
  temperature: number;
  humidity?: number;
  speed_kmh?: number;
  door_status?: string;
  battery_pct?: number;
  timestamp?: string;
}) =>
  api.post("/api/v1/tracking/simulate/telemetry", payload).then((r) => r.data);

export const simulateJourney = (shipmentCode: string, steps = 10) =>
  api
    .post(`/api/v1/tracking/simulate/journey/${shipmentCode}`, null, {
      params: { steps },
    })
    .then((r) => r.data);

/* ── Risk & Interventions API ────────────────────────────────────────────── */

export interface RiskDetailResult {
  shipment_code: string;
  risk_score: number;
  risk_category: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  spoilage_probability_2h: number;
  time_to_spoil_min: number;
  factor_contributions: Record<string, number>;
  explanation_ops: string;
  source: string;
  computed_at: string;
}

export interface Intervention {
  id: string;
  shipment_id: string;
  type: string; // DRIVER_ALERT | ESCALATION | REROUTE | COLD_HUB | MONITOR
  triggered_by: string;
  risk_score_at_trigger: number;
  decision: string;
  actions_taken: string[];
  cold_hub?: {
    name: string;
    distance_km: number;
    diversion_min: number;
    address: string;
  };
  reroute?: {
    risk_reduction: number;
    spoilage_prob_reduction: number;
    sla_impact_min: number;
  };
  explanation_ops?: string;
  explanation_driver?: string;
  ack_status: string;
  created_at: string;
}

export interface FleetDashboardEntry {
  shipment_code: string;
  decision: string;
  ack_status: string;
  risk_score?: number;
  risk_category?: string;
  cold_hub?: any;
  reroute?: any;
  timestamp?: number;
}

export const computeRiskFull = (payload: {
  shipment_code: string;
  temperature: number;
  product_type: string;
  delay_minutes?: number;
  ambient_temp?: number;
  humidity?: number;
  reefer_health_pct?: number;
  door_open_min?: number;
  sensor_gaps_count?: number;
  breach_duration_min?: number;
  shelf_life_pct_remaining?: number;
  old_risk_category?: string;
  trigger_intervention?: boolean;
}) =>
  api
    .post<RiskDetailResult>("/api/v1/interventions/compute-risk", payload)
    .then((r) => r.data);

export const getInterventions = (shipmentCode: string) =>
  api
    .get<{
      shipment_code: string;
      count: number;
      interventions: Intervention[];
    }>(`/api/v1/interventions/${shipmentCode}`)
    .then((r) => r.data);

export const getRiskDetail = (shipmentCode: string) =>
  api
    .get<RiskDetailResult>(`/api/v1/interventions/${shipmentCode}/risk-detail`)
    .then((r) => r.data);

export const getAiActions = (shipmentCode: string) =>
  api
    .get(`/api/v1/interventions/${shipmentCode}/ai-actions`)
    .then((r) => r.data);

export const alertDriver = (payload: {
  shipment_code: string;
  message_template?: string;
  channel?: string;
}) =>
  api.post("/api/v1/interventions/alert-driver", payload).then((r) => r.data);

export const triggerAgent = (shipmentCode: string) =>
  api
    .post("/api/v1/interventions/trigger-agent", {
      shipment_code: shipmentCode,
    })
    .then((r) => r.data);

export const getRerouteImpact = (payload: {
  shipment_code: string;
  current_risk_score: number;
  remaining_km: number;
  alt_remaining_km: number;
  alt_duration_delta_min?: number;
}) =>
  api.post("/api/v1/interventions/reroute-impact", payload).then((r) => r.data);

export const getInterventionFleetDashboard = () =>
  api
    .get<{
      count: number;
      fleet: FleetDashboardEntry[];
    }>("/api/v1/interventions/fleet/dashboard")
    .then((r) => r.data);

export const acknowledgeAlert = (alertId: string, shipmentCode: string) =>
  api
    .post(`/api/v1/interventions/${alertId}/acknowledge`, null, {
      params: { shipment_code: shipmentCode },
    })
    .then((r) => r.data);

/* ── IoT Simulator API ───────────────────────────────────────────────────── */

export interface SimulatorEmitPayload {
  shipment_code: string;
  temperature: number;
  ambient_temp?: number;
  humidity?: number;
  delay_minutes?: number;
  reefer_health_pct?: number;
  door_open_minutes?: number;
  sensor_battery_pct?: number;
  session_id?: string;
}

export interface PreviewImpactResult {
  predicted_risk_score: number;
  current_risk_score: number;
  risk_delta: number;
  new_category: string;
  spoilage_window_min: number;
  spoilage_probability_2h: number;
  factor_contributions: Record<string, number>;
  alert_would_trigger: boolean;
  escalation_would_trigger: boolean;
  reroute_recommended: boolean;
  intervention_would_recommend: string;
  source: string;
}

// Flow A: Emit telemetry → Pub/Sub → full pipeline
export const simulatorEmit = (payload: SimulatorEmitPayload) =>
  api.post("/api/v1/simulator/emit", payload).then((r) => r.data);

// Flow D: Preview impact (Vertex AI only, no Pub/Sub)
export const simulatorPreviewImpact = (
  payload: SimulatorEmitPayload & { current_risk_score?: number },
) =>
  api
    .post<PreviewImpactResult>("/api/v1/simulator/preview-impact", payload)
    .then((r) => r.data);

// Flow B: Load preset
export const simulatorLoadPreset = (
  preset: string,
  shipmentCode: string,
  sessionId?: string,
) =>
  api
    .post("/api/v1/simulator/load-preset", {
      preset,
      shipment_code: shipmentCode,
      session_id: sessionId,
    })
    .then((r) => r.data);

// Flow C: Start playback
export const simulatorStartPlayback = (
  shipmentCode: string,
  speedMultiplier = 1,
  sessionId?: string,
) =>
  api
    .post("/api/v1/simulator/start-playback", {
      shipment_code: shipmentCode,
      speed_multiplier: speedMultiplier,
      session_id: sessionId,
    })
    .then((r) => r.data);

// Stop playback
export const simulatorStop = (shipmentCode: string) =>
  api
    .post(`/api/v1/simulator/stop-playback/${shipmentCode}`)
    .then((r) => r.data);

// Get RTDB sim state
export const getSimulatorState = (shipmentCode: string) =>
  api.get(`/api/v1/simulator/state/${shipmentCode}`).then((r) => r.data);

// Get session history
export const getSimulatorSession = (sessionId: string) =>
  api.get(`/api/v1/simulator/sessions/${sessionId}`).then((r) => r.data);

// List all presets
export const getSimulatorPresets = () =>
  api
    .get<{
      presets: Array<{ id: string; label: string; config: any }>;
    }>("/api/v1/simulator/presets")
    .then((r) => r.data);

/* ── Fleet & Drivers API (Part A) ─────────────────────────────────────────── */

export interface FleetDriver {
  id: string;
  name: string;
  phone: string;
  whatsapp_verified: boolean;
  status: "AVAILABLE" | "ACTIVE" | "FLAGGED" | "OFFLINE" | "SUSPENDED";
  region: string;
  product_certifications: string[];
  active_trip_id: string | null;
  ack_rate: number;
  avg_delay_minutes: number;
  excursion_count_30d: number;
  total_trips: number;
  performance_score: number;
  joined_at: string;
  last_seen_at: string;
  rank?: number;
}

export interface FleetVehicle {
  id: string;
  plate: string;
  type: string;
  manufacturer: string;
  model: string;
  capacity_kg: number;
  capacity_liters: number;
  reefer_system: string;
  reefer_health_score: number;
  reefer_temp_range_min: number;
  reefer_temp_range_max: number;
  paired_sensor_id: string | null;
  sensor_battery_pct: number;
  sensor_last_sync: string | null;
  status: "AVAILABLE" | "ACTIVE" | "MAINTENANCE" | "RETIRED";
  active_trip_id: string | null;
  last_service_date: string;
  next_service_date: string;
  service_interval_days: number;
  avg_temp_stability: number;
  total_trips: number;
  created_at: string;
  _live?: Record<string, any>;
}

export interface FleetHealthSummary {
  drivers: {
    total: number;
    available: number;
    active: number;
    flagged: number;
    offline: number;
  };
  vehicles: {
    total: number;
    available: number;
    active: number;
    maintenance: number;
    avg_reefer_health: number;
    need_service: number;
    no_iot_sensor: number;
    low_reefer: number;
  };
}

export interface ReeferHealth {
  vehicle_id: string;
  plate: string;
  current_score: number;
  health_score_pct: number;
  days_to_service_recommended: number;
  degradation_trend: "STABLE" | "DECLINING" | "CRITICAL";
  recommendation: string;
  source: string;
}

export const getFleetDrivers = (params?: {
  status?: string;
  region?: string;
}) =>
  api
    .get<{
      drivers: FleetDriver[];
      count: number;
    }>("/api/v1/fleet/drivers", { params })
    .then((r) => r.data);

export const getFleetDriver = (id: string) =>
  api.get<FleetDriver>(`/api/v1/fleet/drivers/${id}`).then((r) => r.data);

export const createFleetDriver = (body: {
  name: string;
  phone: string;
  region?: string;
  product_certifications?: string[];
}) => api.post<FleetDriver>("/api/v1/fleet/drivers", body).then((r) => r.data);

export const assignDriver = (driverId: string, shipmentId: string) =>
  api
    .post(`/api/v1/fleet/drivers/${driverId}/assign`, {
      shipment_id: shipmentId,
    })
    .then((r) => r.data);

export const unassignDriver = (driverId: string) =>
  api.delete(`/api/v1/fleet/drivers/${driverId}/assign`).then((r) => r.data);

export const getFleetVehicles = (params?: { status?: string }) =>
  api
    .get<{
      vehicles: FleetVehicle[];
      count: number;
    }>("/api/v1/fleet/vehicles", { params })
    .then((r) => r.data);

export const getFleetVehicle = (id: string) =>
  api.get<FleetVehicle>(`/api/v1/fleet/vehicles/${id}`).then((r) => r.data);

export const createFleetVehicle = (body: Partial<FleetVehicle>) =>
  api.post<FleetVehicle>("/api/v1/fleet/vehicles", body).then((r) => r.data);

export const pairSensor = (vehicleId: string, sensorId: string) =>
  api
    .post(`/api/v1/fleet/vehicles/${vehicleId}/pair-sensor`, {
      sensor_id: sensorId,
    })
    .then((r) => r.data);

export const getReeferHealth = (vehicleId: string) =>
  api
    .get<ReeferHealth>(`/api/v1/fleet/vehicles/${vehicleId}/reefer-health`)
    .then((r) => r.data);

export const getDriverLeaderboard = () =>
  api
    .get<{
      leaderboard: FleetDriver[];
      generated_at: string;
    }>("/api/v1/fleet/leaderboard")
    .then((r) => r.data);

export const getFleetHealthSummary = () =>
  api
    .get<FleetHealthSummary>("/api/v1/fleet/fleet-health-summary")
    .then((r) => r.data);

/* ── Active Shipments API (Part B) ────────────────────────────────────────── */

export interface ActiveShipmentItem {
  id: string;
  shipment_code: string;
  product_type: string;
  status: string;
  origin: string;
  destination: string;
  vehicle_number: string;
  driver_phone: string;
  expected_arrival: string | null;
  created_at: string | null;
  live: {
    temperature?: number;
    humidity?: number;
    lat?: number;
    lng?: number;
    speed_kmh?: number;
    progress_pct?: number;
    remaining_km?: number;
    eta_min?: number;
    spoilage_window_min?: number;
    stage?: string;
    last_sync_ts?: number;
  };
  risk: {
    score: number;
    category: string;
    time_to_spoil?: number | null;
    explanation?: string;
  };
}

export const getActiveShipments = (params?: {
  view?: "LIST" | "BOARD" | "CLUSTER";
  risk?: string;
  product?: string;
  stage?: string;
  route?: string;
  driver?: string;
  sort?: "ETA" | "RISK" | "SPOIL_TIME" | "SHIPMENT_ID";
  page?: number;
  limit?: number;
}) =>
  api
    .get<{
      shipments: ActiveShipmentItem[];
      total: number;
      page: number;
      limit: number;
    }>("/api/v1/shipments/active", { params })
    .then((r) => r.data);

export const getActiveCountByStage = () =>
  api
    .get<Record<string, number>>("/api/v1/shipments/active/count-by-stage")
    .then((r) => r.data);

export const bulkAlert = (
  shipmentIds: string[],
  templateId = "HIGH_RISK_ALERT",
) =>
  api
    .post("/api/v1/shipments/bulk-alert", {
      shipment_ids: shipmentIds,
      template_id: templateId,
    })
    .then((r) => r.data);

export const bulkReassign = (shipmentIds: string[], newVehicleId: string) =>
  api
    .post("/api/v1/shipments/bulk-reassign", {
      shipment_ids: shipmentIds,
      new_vehicle_id: newVehicleId,
    })
    .then((r) => r.data);

/* ── Shipment Detail API (Part C) ─────────────────────────────────────────── */

export interface ShipmentDetail {
  shipment: {
    id: string;
    shipment_code: string;
    product_type: string;
    status: string;
    origin: string;
    destination: string;
    risk_score: number;
    risk_category: string;
    expected_arrival: string | null;
    created_at: string | null;
  };
  live: ActiveShipmentItem["live"];
  route: {
    distance_km: number;
    completed_km: number;
    next_checkpoint: string;
    checkpoint_eta_min: number;
    delay_vs_plan_min: number;
    alternate_route_available: boolean;
    alternate_route_savings_min: number;
  };
  risk_detail: {
    score: number;
    category: string;
    factors: Record<string, number>;
    predictions: any[];
    explanation_ops: string;
    explanation_driver: string;
    time_to_spoil?: number | null;
  };
  nearest_cold_hub: {
    name: string;
    distance_km: number;
    diversion_min: number;
    capacity_available: boolean;
    risk_reduction_pct: number;
  };
  driver: { id: string | null; name: string; phone: string; ack_rate: number };
  vehicle: {
    id: string;
    plate: string;
    reefer_health: number;
    sensor_battery: number;
    gps_signal: string;
  };
}

export const getShipmentDetail = (id: string) =>
  api.get<ShipmentDetail>(`/api/v1/shipments/${id}/detail`).then((r) => r.data);

export const getShipmentTimeline = (id: string) =>
  api
    .get<{
      timeline: Array<{
        type: string;
        icon: string;
        title: string;
        description: string;
        timestamp: string;
      }>;
      shipment_code: string;
    }>(`/api/v1/shipments/${id}/timeline`)
    .then((r) => r.data);

export const getShipmentTelemetry = (
  id: string,
  params?: { metric?: "TEMP" | "HUMIDITY" | "ALL"; limit?: number },
) =>
  api
    .get<{
      telemetry: Array<{
        timestamp: string;
        temperature?: number;
        humidity?: number;
        ambient_temp?: number;
      }>;
      count: number;
    }>(`/api/v1/shipments/${id}/telemetry`, { params })
    .then((r) => r.data);

export const getShipmentCompliance = (id: string) =>
  api.get(`/api/v1/shipments/${id}/compliance`).then((r) => r.data);

export const getShipmentAlertsSent = (id: string) =>
  api.get(`/api/v1/shipments/${id}/alerts-sent`).then((r) => r.data);

export const getShipmentRiskDetail = (id: string) =>
  api.get(`/api/v1/shipments/${id}/risk-detail`).then((r) => r.data);

export const getShipmentPostDelivery = (id: string) =>
  api.get(`/api/v1/shipments/${id}/post-delivery-review`).then((r) => r.data);

export const submitPOD = (
  id: string,
  body: {
    photo_url?: string;
    signature_url?: string;
    delivered_by?: string;
    delivered_temp?: number;
  },
) =>
  api
    .post(`/api/v1/shipments/${id}/proof-of-delivery`, body)
    .then((r) => r.data);

export const addShipmentNote = (
  id: string,
  note: string,
  note_type = "GENERAL",
) =>
  api
    .post(`/api/v1/shipments/${id}/add-note`, { note, note_type })
    .then((r) => r.data);

export const updateShipmentStage = (
  id: string,
  new_stage: string,
  note?: string,
) =>
  api
    .put(`/api/v1/shipments/${id}/stage`, { new_stage, note })
    .then((r) => r.data);

// Legacy summary moved above — see line ~271

// 1. Overview — business leader view
export const getAnalyticsOverview = (period = "THIS_MONTH") =>
  api
    .get<AnalyticsOverview>("/api/v1/analytics/overview", {
      params: { period },
    })
    .then((r) => r.data);

// 2. Operations — ops manager view
export const getAnalyticsOperations = (period = "THIS_MONTH") =>
  api
    .get<AnalyticsOperations>("/api/v1/analytics/operations", {
      params: { period },
    })
    .then((r) => r.data);

// 3. Routes
export const getAnalyticsRoutes = (period = "THIS_MONTH") =>
  api
    .get<AnalyticsRoutes>("/api/v1/analytics/routes", { params: { period } })
    .then((r) => r.data);

// 4. Products
export const getAnalyticsProducts = (period = "THIS_MONTH") =>
  api
    .get<AnalyticsProducts>("/api/v1/analytics/products", {
      params: { period },
    })
    .then((r) => r.data);

// 5. Compliance
export const getAnalyticsCompliance = (
  period = "THIS_MONTH",
  page = 1,
  pageSize = 20,
  startDate?: string,
  endDate?: string,
) =>
  api
    .get<AnalyticsCompliance>("/api/v1/analytics/compliance", {
      params: {
        period,
        page,
        page_size: pageSize,
        start_date: startDate,
        end_date: endDate,
      },
    })
    .then((r) => r.data);

// 6. Post-delivery review
export const getPostDeliveryReview = (shipmentId: string) =>
  api.get(`/api/v1/analytics/post-delivery/${shipmentId}`).then((r) => r.data);

// 7. Export report
export const triggerAnalyticsExport = (body: {
  type: "COMPLIANCE" | "ROUTES" | "DRIVERS" | "OVERVIEW";
  period?: string;
  format?: "CSV" | "PDF";
  org_id?: string;
}) =>
  api
    .post<{
      job_id: string;
      status: string;
      download_url?: string;
    }>("/api/v1/analytics/export", body)
    .then((r) => r.data);

// 8. Poll export job
export const getExportStatus = (jobId: string) =>
  api
    .get<{
      job_id: string;
      status: string;
      download_url?: string;
    }>(`/api/v1/analytics/export/${jobId}`)
    .then((r) => r.data);

// 9. Trend prediction (Vertex AI)
export const getAnalyticsTrends = () =>
  api
    .get<AnalyticsTrendForecast>("/api/v1/analytics/trends/predict")
    .then((r) => r.data);

// See AnalyticsSummary above (line ~138)

export interface LossTrendPoint {
  date: string;
  daily_prevented: number;
  interventions: number;
}

export interface AnalyticsOverview {
  period: string;
  total_loss_prevented_inr: number;
  intervention_count: number;
  on_time_rate_pct: number;
  total_delivered: number;
  avg_risk_score: number;
  risk_distribution: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  loss_trend_30d: LossTrendPoint[];
  source?: string;
}

export interface AnalyticsOperations {
  period: string;
  excursion_heatmap: Array<{
    day_of_week: number;
    hour_of_day: number;
    excursion_count: number;
  }>;
  alert_response_times: Array<{
    type: string;
    avg_response_min: number;
    total: number;
  }>;
  driver_leaderboard: Array<{
    driver_id: string;
    total_trips: number;
    ack_rate: number;
    avg_delay_minutes: number;
    excursion_count: number;
    performance_score: number;
  }>;
}

export interface AnalyticsRoutes {
  period: string;
  route_performance: Array<{
    corridor: string;
    total_trips: number;
    avg_risk_score: number;
    excursion_count: number;
    on_time_pct: number;
    avg_delay_min: number;
  }>;
  corridor_heatmap: Array<{
    origin_city: string;
    destination_city: string;
    route_corridor: string;
    avg_risk: number;
    trip_count: number;
  }>;
}

export interface AnalyticsProducts {
  period: string;
  product_matrix: Array<{
    product_type: string;
    total_trips: number;
    total_excursions: number;
    avg_risk_score: number;
    avg_compliance_pct: number;
  }>;
}

export interface AnalyticsCompliance {
  period: string;
  summary: {
    temp_compliance_rate: number;
    overall_compliance: number;
    sla_rate: number;
    total_shipments: number;
  };
  shipment_log: Array<{
    id: string;
    product_type: string;
    route_corridor: string;
    compliance_pct: number;
    sla_met: boolean;
    max_temp_breach_min: number;
    total_excursions: number;
    delivered_at: string;
  }>;
  page: number;
  page_size: number;
}

export interface AnalyticsTrendForecast {
  source: string;
  predicted_critical_events_next_7d: Array<{ date: string; events: number }>;
  predicted_loss_risk_inr: number;
  high_risk_days: string[];
  recommended_actions: string[];
  confidence: number;
}

/* ── Blockchain Audit Trail API ─────────────────────────────────────────────── */

export interface BlockchainCertifyPayload {
  shipment_code: string;
  product_type: string;
  departure_time?: number; // Unix timestamp
  arrival_time?: number; // Unix timestamp
  min_temp: number;
  max_temp: number;
  max_risk_score: number; // 0–1
  reroute_count: number;
  whatsapp_sent: boolean;
  verdict?: "SAFE" | "SPOILED" | "PARTIAL";
  ipfs_hash?: string;
}

export interface BlockchainCertResult {
  success: boolean;
  tx_hash?: string;
  etherscan_url?: string;
  verdict: string;
  shipment_code: string;
  demo_mode?: boolean;
  error?: string;
}

export interface BlockchainVerifyResult {
  shipment_code: string;
  found: boolean;
  verdict?: string;
  min_temp?: number;
  max_temp?: number;
  max_risk_score?: number;
  reroute_count?: number;
  whatsapp_sent?: boolean;
  departure_time?: number;
  arrival_time?: number;
  tx_hash?: string;
  etherscan_url?: string;
  demo_mode?: boolean;
}

/** Issue an immutable integrity certificate on Ethereum Sepolia for a completed shipment */
export const certifyShipment = (payload: BlockchainCertifyPayload) =>
  api
    .post<BlockchainCertResult>("/api/v1/blockchain/certify", payload)
    .then((r) => r.data);

/** Publicly verify a shipment's on-chain certificate — no auth required */
export const verifyBlockchainCert = (shipmentCode: string) =>
  api
    .get<BlockchainVerifyResult>(`/api/v1/blockchain/verify/${shipmentCode}`)
    .then((r) => r.data);

/** Check blockchain integration status (contract address, demo mode, etc.) */
export const getBlockchainStatus = () =>
  api.get("/api/v1/blockchain/status").then((r) => r.data);

/* ── Autonomous Rerouting Agent API ─────────────────────────────────────────── */

export interface RerouteAgentPayload {
  shipment_code: string;
  current_risk_score?: number;
  force?: boolean;
}

export interface RerouteAgentResult {
  shipment_code: string;
  decision: string;
  recommendation?: string;
  cold_hub?: { name: string; distance_km: number; address: string };
  risk_reduction?: number;
  agent_steps?: string[];
  source: string;
}

/** Trigger the autonomous ADK rerouting agent for a shipment */
export const triggerRerouteAgent = (payload: RerouteAgentPayload) =>
  api
    .post<RerouteAgentResult>("/api/v1/agent/reroute", payload)
    .then((r) => r.data);

/** Demo: Simulate a CRITICAL cold-chain event (for hackathon demos) */
export const simulateCriticalEvent = (shipmentCode: string) =>
  api
    .post("/api/v1/agent/simulate-critical", { shipment_code: shipmentCode })
    .then((r) => r.data);

/* ── Control Tower Snapshot API ─────────────────────────────────────────────── */

export interface ControlTowerSnapshot {
  network_stats: Record<string, number | string>;
  exceptions: Array<{
    shipment_code: string;
    severity: string;
    message: string;
  }>;
  journey_board: Record<string, number>;
  ai_actions: Array<{
    id: string;
    type: string;
    description: string;
    shipment_code?: string;
  }>;
  generated_at: string;
}

/** Single call to get the full Control Tower state (replaces 3 separate calls) */
export const getControlTowerSnapshot = () =>
  api
    .get<ControlTowerSnapshot>("/api/v1/control-tower/snapshot")
    .then((r) => r.data);

/** 6 KPI network-stats chips (30s cache) */
export const getControlTowerNetworkStats = () =>
  api.get("/api/v1/control-tower/network-stats").then((r) => r.data);

/** CRITICAL + HIGH exception items for banner */
export const getControlTowerExceptions = () =>
  api.get("/api/v1/control-tower/exception-banner").then((r) => r.data);

/** Shipments grouped by stage for journey board */
export const getControlTowerJourneyBoard = () =>
  api.get("/api/v1/control-tower/journey-board").then((r) => r.data);

/** AI suggestions from DB for control tower */
export const getControlTowerAIActions = () =>
  api.get("/api/v1/control-tower/ai-actions").then((r) => r.data);

/* ── WebSocket: Live Risk Stream ─────────────────────────────────────────────── */

/**
 * Connect to the live risk WebSocket stream.
 * The backend broadcasts risk events as they happen across the entire fleet.
 *
 * @param onMessage - callback fired with each parsed event
 * @param onClose   - callback fired when socket closes
 * @returns WebSocket instance (call .close() to disconnect)
 *
 * Usage:
 *   const ws = connectLiveRiskStream(
 *     (event) => console.log(event),
 *     () => console.log('disconnected')
 *   );
 *   // later: ws.close();
 */
export function connectLiveRiskStream(
  onMessage: (event: Record<string, unknown>) => void,
  onClose?: () => void,
): WebSocket {
  const base = (
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
  ).replace(/^http/, "ws");
  const ws = new WebSocket(`${base}/api/v1/agent/ws/live`);

  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      /* ignore malformed */
    }
  };
  ws.onclose = () => onClose?.();
  ws.onerror = (err) => console.error("[LiveRiskStream] WS error", err);

  return ws;
}

export default api;
