import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  getShipments,
  simulatorEmit,
  sendSensor,
  computeRisk,
  type Shipment,
  type RiskResult,
} from "../lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface SensorState {
  temp: number; // °C — DS18B20+
  humidity: number; // % — AM2302/DHT22
  doorClosed: boolean; // Reed switch MK24
  delay: number; // transit delay minutes
  reefer: number; // reefer health %
}

interface GpsState {
  lat: number;
  lng: number;
  accuracy: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const TEMP_BANDS: Record<string, [number, number]> = {
  dairy: [2, 6],
  milk: [2, 6],
  seafood: [0, 4],
  fish: [0, 4],
  meat: [0, 4],
  pharma: [2, 8],
  frozen: [-20, -15],
  produce: [4, 10],
  fruits: [5, 12],
  other: [2, 8],
};
const getTempBand = (t?: string): [number, number] =>
  TEMP_BANDS[t?.toLowerCase() ?? ""] ?? [2, 8];

function estimateRisk(s: SensorState, productType: string): number {
  const [tMin, tMax] = getTempBand(productType);
  const tempF =
    s.temp > tMax
      ? Math.min(30, (s.temp - tMax) * 5)
      : s.temp < tMin
        ? Math.min(10, (tMin - s.temp) * 3)
        : 0;
  const delayF = Math.min(25, s.delay * 0.35);
  const humF = s.humidity > 80 ? Math.min(8, (s.humidity - 80) * 0.3) : 0;
  const doorF = !s.doorClosed && s.delay > 10 ? Math.min(10, s.delay * 0.3) : 0;
  const reeferF = s.reefer < 50 ? Math.min(15, (50 - s.reefer) * 0.4) : 0;
  return Math.min(
    100,
    Math.round(13 + tempF + delayF + humF + doorF + reeferF),
  );
}

function getRiskColor(score: number) {
  return score >= 75
    ? "#EF4444"
    : score >= 50
      ? "#F97316"
      : score >= 25
        ? "#FBBF24"
        : "#34D399";
}
function getRiskLabel(score: number) {
  return score >= 75
    ? "CRITICAL"
    : score >= 50
      ? "HIGH"
      : score >= 25
        ? "MEDIUM"
        : "LOW";
}

// ─────────────────────────────────────────────────────────────────────────────
// Big Slider (touch-friendly)
// ─────────────────────────────────────────────────────────────────────────────
function BigSlider({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  unit,
  safeMin,
  safeMax,
  warnAt,
  dangerAt,
  onChange,
}: {
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  safeMin?: number;
  safeMax?: number;
  warnAt?: number;
  dangerAt?: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const isDanger = dangerAt !== undefined && value >= dangerAt;
  const isWarn = !isDanger && warnAt !== undefined && value >= warnAt;
  const color = isDanger ? "#EF4444" : isWarn ? "#FBBF24" : "#4DD9AC";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#94A3B8] font-medium flex items-center gap-2">
          <span>{icon}</span>
          {label}
        </span>
        <span className="font-mono text-lg font-bold" style={{ color }}>
          {value % 1 === 0 ? value : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="relative h-8 flex items-center">
        <div className="absolute inset-x-0 h-3 bg-[#1E2530] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, background: color }}
          />
          {safeMin !== undefined && safeMax !== undefined && (
            <div
              className="absolute top-0 h-full border-x-2 border-[#34D399] bg-[#34D399]/10"
              style={{
                left: `${((safeMin - min) / (max - min)) * 100}%`,
                width: `${((safeMax - safeMin) / (max - min)) * 100}%`,
              }}
            />
          )}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
          style={{ touchAction: "none" }}
        />
      </div>
      {safeMin !== undefined && safeMax !== undefined && (
        <div className="text-[10px] text-[#34D399] mt-1 text-right">
          Safe zone: {safeMin}–{safeMax}
          {unit}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function MobileIoTController() {
  const location = useLocation();
  const preselectedCode = (location.state as any)?.shipmentCode as
    | string
    | undefined;

  // Shipments
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selShip, setSelShip] = useState<Shipment | null>(null);

  // Sensor state
  const [sensors, setSensors] = useState<SensorState>({
    temp: 4.0,
    humidity: 60,
    doorClosed: true,
    delay: 0,
    reefer: 100,
  });

  // Phone hardware state
  const [phoneBattery, setPhoneBattery] = useState<number | null>(null);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [bump, setBump] = useState(false);
  const [connected, setConnected] = useState(true);

  // Transmission
  const [autoTransmit, setAutoTransmit] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [transmitting, setTransmitting] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [txCount, setTxCount] = useState(0);

  // Risk
  const [riskScore, setRiskScore] = useState(13);
  const [apiRisk, setApiRisk] = useState<RiskResult | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const gpsWatchRef = useRef<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionId = useRef(`mobile_${Math.random().toString(36).slice(2, 10)}`);

  // ── Load shipments ─────────────────────────────────────────────────────────
  useEffect(() => {
    getShipments("active")
      .then((list) => {
        setShipments(list);
        if (preselectedCode) {
          const found = list.find((s) => s.shipment_code === preselectedCode);
          if (found) setSelShip(found);
          else if (list[0]) setSelShip(list[0]);
        } else if (list[0]) {
          setSelShip(list[0]);
        }
      })
      .catch(() => {});
  }, [preselectedCode]);

  // ── Phone battery ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const nav = navigator as any;
        if (nav.getBattery) {
          const bat = await nav.getBattery();
          setPhoneBattery(Math.round(bat.level * 100));
          bat.addEventListener("levelchange", () =>
            setPhoneBattery(Math.round(bat.level * 100)),
          );
        }
      } catch {}
    })();
  }, []);

  // ── Risk recompute ─────────────────────────────────────────────────────────
  useEffect(() => {
    const score = estimateRisk(sensors, selShip?.product_type ?? "dairy");
    setRiskScore(score);
    clearTimeout(apiDebounce.current!);
    apiDebounce.current = setTimeout(async () => {
      try {
        const r = await computeRisk({
          temperature: sensors.temp,
          delay_minutes: sensors.delay,
          product_type: selShip?.product_type ?? "dairy",
          ambient_temp: 32,
          shipment_id: selShip?.id,
        });
        setApiRisk(r);
      } catch {}
    }, 800);
  }, [sensors, selShip]);

  // ── GPS toggle ─────────────────────────────────────────────────────────────
  const toggleGps = useCallback(() => {
    if (gpsEnabled) {
      if (gpsWatchRef.current !== null)
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      setGpsEnabled(false);
      setGps(null);
    } else {
      setGpsEnabled(true);
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) =>
          setGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => {
          showToast("GPS not available", false);
          setGpsEnabled(false);
        },
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    }
  }, [gpsEnabled]);

  // ── Accelerometer (bump/shake) ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt(
        (acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2,
      );
      if (mag > 20) {
        setBump(true);
        setTimeout(() => setBump(false), 1000);
        showToast("📳 Bump detected! (vibration sensor)", false);
      }
    };
    window.addEventListener("devicemotion", handler as EventListener);
    return () =>
      window.removeEventListener("devicemotion", handler as EventListener);
  }, []);

  // ── Transmit function ──────────────────────────────────────────────────────
  const transmit = useCallback(async () => {
    setTransmitting(true);
    try {
      const payload = {
        shipment_code: selShip?.shipment_code ?? "MOBILE-SIM",
        temperature: sensors.temp,
        ambient_temp: 32,
        humidity: sensors.humidity,
        delay_minutes: sensors.delay,
        reefer_health_pct: sensors.reefer,
        door_open_minutes: sensors.doorClosed ? 0 : sensors.delay,
        sensor_battery_pct: phoneBattery ?? 80,
        gps_lat: gps?.lat,
        gps_lng: gps?.lng,
        session_id: sessionId.current,
        source: "mobile_pwa",
      };
      try {
        await simulatorEmit(payload);
      } catch {
        if (selShip) {
          await sendSensor(selShip.id, {
            temperature: sensors.temp,
            humidity: sensors.humidity,
            delay_minutes: sensors.delay,
            source: "mobile_pwa",
          });
        }
      }
      const now = new Date().toLocaleTimeString();
      setLastTx(now);
      setTxCount((c) => c + 1);
      setConnected(true);
      showToast(`✅ Transmitted at ${now}`);
    } catch {
      setConnected(false);
      showToast("⚠️ Transmission failed", false);
    } finally {
      setTransmitting(false);
    }
  }, [sensors, selShip, gps, phoneBattery]);

  // ── Auto-transmit ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    if (!autoTransmit) {
      setCountdown(30);
      return;
    }
    setCountdown(30);
    autoTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          transmit();
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [autoTransmit, transmit]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      if (gpsWatchRef.current !== null)
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    },
    [],
  );

  const finalScore = apiRisk ? Math.round(apiRisk.risk_score) : riskScore;
  const riskColor = getRiskColor(finalScore);
  const riskLabel = getRiskLabel(finalScore);
  const [tMin, tMax] = getTempBand(selShip?.product_type);
  const isBreach = sensors.temp > tMax;

  // Circular gauge math
  const RADIUS = 52;
  const CIRCUM = 2 * Math.PI * RADIUS;
  const dash = (finalScore / 100) * CIRCUM;

  return (
    <div
      className="min-h-screen bg-[#080B12] text-[#F1F5F9] flex flex-col"
      style={{
        fontFamily: "Inter, sans-serif",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-semibold text-center shadow-2xl transition-all ${
            toast.ok
              ? "bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]"
              : "bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0A0D14]/95 backdrop-blur border-b border-[#1E2530] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[#4DD9AC] font-black text-lg tracking-tighter font-mono">
              CARGOFY
            </span>
            <div className="flex items-center gap-1.5 bg-[#4DD9AC]/10 border border-[#4DD9AC]/25 px-2.5 py-1 rounded-full">
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#4DD9AC] animate-pulse" : "bg-[#EF4444]"}`}
              />
              <span className="text-[10px] font-bold text-[#4DD9AC] uppercase tracking-widest">
                IoT Node
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#64748B]">
            {phoneBattery !== null && (
              <div className="flex items-center gap-1">
                <span>🔋</span>
                <span
                  className={`font-mono font-bold ${phoneBattery < 20 ? "text-[#EF4444]" : phoneBattery < 40 ? "text-[#FBBF24]" : "text-[#34D399]"}`}
                >
                  {phoneBattery}%
                </span>
              </div>
            )}
            {bump && (
              <span className="text-[#FBBF24] animate-bounce font-bold text-base">
                📳
              </span>
            )}
          </div>
        </div>
        {/* Hardware info line */}
        <div className="text-[9px] text-[#374151] mt-1 font-mono">
          ESP32-WROOM-32D · DS18B20+ · AM2302 · Reed MK24 · {sessionId.current}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4 space-y-4">
        {/* ── Shipment Selector ── */}
        <div className="rounded-2xl border border-[#1E2530] bg-[#111827] p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-bold mb-2">
            Active Shipment
          </div>
          <select
            value={selShip?.id ?? ""}
            onChange={(e) => {
              const s = shipments.find((x) => x.id === e.target.value) ?? null;
              setSelShip(s);
            }}
            className="w-full bg-[#0D1117] border border-[#1E2530] rounded-xl px-3 py-3 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#4DD9AC]/40 appearance-none"
          >
            <option value="">— No shipment (demo mode) —</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shipment_code} · {s.product_type}
              </option>
            ))}
          </select>
          {selShip && (
            <div className="flex items-center justify-between mt-2 text-xs text-[#64748B]">
              <span>
                {selShip.origin?.split(",")[0]} →{" "}
                {selShip.destination?.split(",")[0]}
              </span>
              <span className="text-[#34D399] font-mono">
                Safe: {tMin}°C–{tMax}°C
              </span>
            </div>
          )}
        </div>

        {/* ── Live Sensor Cards ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Temp */}
          <div
            className={`rounded-2xl border p-3 text-center ${isBreach ? "border-[#EF4444]/40 bg-[#2B0D0D]" : "border-[#1E2530] bg-[#111827]"}`}
          >
            <div className="text-lg mb-1">🌡️</div>
            <div
              className="font-mono text-xl font-black"
              style={{
                color: isBreach
                  ? "#EF4444"
                  : sensors.temp > tMax * 0.8
                    ? "#FBBF24"
                    : "#4DD9AC",
              }}
            >
              {sensors.temp.toFixed(1)}
            </div>
            <div className="text-[9px] text-[#64748B] mt-0.5">°C · DS18B20</div>
          </div>
          {/* Humidity */}
          <div
            className={`rounded-2xl border p-3 text-center ${sensors.humidity > 80 ? "border-[#EF4444]/40 bg-[#2B0D0D]" : "border-[#1E2530] bg-[#111827]"}`}
          >
            <div className="text-lg mb-1">💧</div>
            <div
              className="font-mono text-xl font-black"
              style={{
                color:
                  sensors.humidity > 80
                    ? "#EF4444"
                    : sensors.humidity > 70
                      ? "#FBBF24"
                      : "#60A5FA",
              }}
            >
              {sensors.humidity}
            </div>
            <div className="text-[9px] text-[#64748B] mt-0.5">% · AM2302</div>
          </div>
          {/* Door */}
          <div
            className={`rounded-2xl border p-3 text-center ${!sensors.doorClosed ? "border-[#FBBF24]/40 bg-[#2B1F0D]" : "border-[#1E2530] bg-[#111827]"}`}
          >
            <div className="text-lg mb-1">🚪</div>
            <div
              className="font-mono text-sm font-black"
              style={{ color: sensors.doorClosed ? "#34D399" : "#FBBF24" }}
            >
              {sensors.doorClosed ? "SHUT" : "OPEN"}
            </div>
            <div className="text-[9px] text-[#64748B] mt-0.5">Reed MK24</div>
          </div>
        </div>

        {/* ── Risk Gauge ── */}
        <div className="rounded-2xl border border-[#1E2530] bg-[#111827] p-5 flex items-center gap-5">
          {/* SVG Gauge */}
          <div
            className="relative flex-shrink-0"
            style={{ width: 120, height: 120 }}
          >
            <svg viewBox="0 0 120 120" width={120} height={120}>
              <circle
                cx={60}
                cy={60}
                r={RADIUS}
                fill="none"
                stroke="#1E2530"
                strokeWidth={10}
              />
              <circle
                cx={60}
                cy={60}
                r={RADIUS}
                fill="none"
                stroke={riskColor}
                strokeWidth={10}
                strokeDasharray={`${dash} ${CIRCUM}`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                style={{
                  filter: `drop-shadow(0 0 8px ${riskColor}60)`,
                  transition: "stroke-dasharray 0.8s ease, stroke 0.5s",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-black text-2xl font-mono"
                style={{ color: riskColor }}
              >
                {finalScore}
              </span>
              <span className="text-[9px] text-[#64748B]">/ 100</span>
            </div>
          </div>
          {/* Risk text */}
          <div className="flex-1">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-1">
              Risk Level
            </div>
            <div
              className="text-2xl font-black mb-1"
              style={{ color: riskColor }}
            >
              {riskLabel}
            </div>
            {apiRisk?.time_to_spoil_minutes && (
              <div className="text-xs text-[#64748B]">
                Spoils in{" "}
                <span className="text-[#FBBF24] font-mono font-bold">
                  {Math.floor(apiRisk.time_to_spoil_minutes / 60)}h{" "}
                  {apiRisk.time_to_spoil_minutes % 60}m
                </span>
              </div>
            )}
            <div
              className={`text-xs font-bold mt-2 ${finalScore > 50 ? "text-[#F87171]" : finalScore > 25 ? "text-[#FBBF24]" : "text-[#34D399]"}`}
            >
              {finalScore > 50
                ? "📈 WORSENING"
                : finalScore > 25
                  ? "⚠️ MONITOR"
                  : "✅ STABLE"}
            </div>
          </div>
        </div>

        {/* ── Sensor Sliders ── */}
        <div className="rounded-2xl border border-[#1E2530] bg-[#111827] p-4 space-y-5">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-bold">
            Sensor Controls
          </div>

          <BigSlider
            icon="🌡️"
            label="Cargo Temp (DS18B20+)"
            value={sensors.temp}
            min={-5}
            max={25}
            step={0.1}
            unit="°C"
            safeMin={tMin}
            safeMax={tMax}
            warnAt={tMax}
            dangerAt={tMax + 2}
            onChange={(v) => setSensors((p) => ({ ...p, temp: v }))}
          />

          <BigSlider
            icon="💧"
            label="Humidity (AM2302/DHT22)"
            value={sensors.humidity}
            min={30}
            max={100}
            step={1}
            unit="%"
            warnAt={75}
            dangerAt={85}
            onChange={(v) => setSensors((p) => ({ ...p, humidity: v }))}
          />

          <BigSlider
            icon="❄️"
            label="Reefer Health"
            value={sensors.reefer}
            min={0}
            max={100}
            step={1}
            unit="%"
            safeMin={80}
            safeMax={100}
            warnAt={79}
            dangerAt={50}
            onChange={(v) => setSensors((p) => ({ ...p, reefer: v }))}
          />

          <BigSlider
            icon="⏱️"
            label="Transit Delay"
            value={sensors.delay}
            min={0}
            max={120}
            step={1}
            unit="m"
            warnAt={20}
            dangerAt={60}
            onChange={(v) => setSensors((p) => ({ ...p, delay: v }))}
          />

          {/* Door Reed Switch toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#94A3B8] font-medium">
              🚪 Door (Reed Switch MK24)
            </span>
            <button
              onClick={() =>
                setSensors((p) => ({ ...p, doorClosed: !p.doorClosed }))
              }
              className="relative flex items-center"
            >
              <div
                className={`w-16 h-8 rounded-full border-2 transition-all duration-300 flex items-center px-1 ${
                  sensors.doorClosed
                    ? "bg-[#34D399]/20 border-[#34D399]"
                    : "bg-[#FBBF24]/20 border-[#FBBF24]"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full transition-all duration-300 shadow-lg ${
                    sensors.doorClosed
                      ? "translate-x-8 bg-[#34D399]"
                      : "translate-x-0 bg-[#FBBF24]"
                  }`}
                />
              </div>
              <span
                className={`ml-2 text-xs font-bold w-14 ${sensors.doorClosed ? "text-[#34D399]" : "text-[#FBBF24]"}`}
              >
                {sensors.doorClosed ? "CLOSED" : "OPEN"}
              </span>
            </button>
          </div>
        </div>

        {/* ── GPS Section ── */}
        <div className="rounded-2xl border border-[#1E2530] bg-[#111827] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-bold">
              📍 GPS Location
            </div>
            <button
              onClick={toggleGps}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                gpsEnabled
                  ? "bg-[#4DD9AC]/20 border-[#4DD9AC]/50 text-[#4DD9AC]"
                  : "border-[#1E2530] text-[#64748B] hover:border-[#4DD9AC]/30"
              }`}
            >
              {gpsEnabled ? "⏹ Stop GPS" : "▶ Start GPS"}
            </button>
          </div>
          {gps ? (
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#0D1117] rounded-xl p-2">
                <div className="text-[#64748B] text-[9px] mb-1">LAT</div>
                <div className="text-[#4DD9AC] font-bold">
                  {gps.lat.toFixed(5)}
                </div>
              </div>
              <div className="bg-[#0D1117] rounded-xl p-2">
                <div className="text-[#64748B] text-[9px] mb-1">LNG</div>
                <div className="text-[#4DD9AC] font-bold">
                  {gps.lng.toFixed(5)}
                </div>
              </div>
              <div className="col-span-2 bg-[#0D1117] rounded-xl p-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
                <span className="text-[#64748B] text-[9px]">Accuracy: </span>
                <span className="text-[#34D399]">
                  ±{gps.accuracy.toFixed(0)}m
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#4A5568] text-center py-2">
              {gpsEnabled
                ? "Acquiring GPS fix…"
                : "Press Start GPS to use real phone location"}
            </div>
          )}
        </div>

        {/* ── Auto-Transmit ── */}
        <div className="rounded-2xl border border-[#1E2530] bg-[#111827] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#F1F5F9]">
                Auto-Transmit
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                Every 30 seconds to Cargofy
              </div>
            </div>
            <button
              onClick={() => setAutoTransmit((p) => !p)}
              className={`relative w-14 h-7 rounded-full border-2 transition-all duration-300 ${
                autoTransmit
                  ? "bg-[#4DD9AC]/20 border-[#4DD9AC]"
                  : "bg-[#1E2530] border-[#374151]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                  autoTransmit
                    ? "translate-x-7 bg-[#4DD9AC]"
                    : "translate-x-0.5 bg-[#374151]"
                }`}
              />
            </button>
          </div>
          {autoTransmit && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4DD9AC] rounded-full transition-all duration-1000"
                  style={{ width: `${((30 - countdown) / 30) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-[#4DD9AC] font-bold w-8 text-right">
                {countdown}s
              </span>
            </div>
          )}
          {lastTx && (
            <div className="mt-2 text-[10px] text-[#64748B]">
              Last TX:{" "}
              <span className="text-[#34D399] font-mono">{lastTx}</span> ·
              Total: <span className="font-mono text-[#94A3B8]">{txCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed Bottom: TRANSMIT BUTTON ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 p-4 bg-[#080B12]/95 backdrop-blur border-t border-[#1E2530]">
        {/* Alert bar */}
        {isBreach && (
          <div className="mb-3 flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3 py-2">
            <span className="text-[#EF4444] animate-pulse">⚠️</span>
            <span className="text-xs text-[#F87171] font-semibold">
              TEMP BREACH: {sensors.temp.toFixed(1)}°C (safe: {tMin}–{tMax}°C)
            </span>
          </div>
        )}

        <button
          onClick={transmit}
          disabled={transmitting}
          className="w-full py-4 rounded-2xl text-base font-black tracking-wide transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-3"
          style={{
            background: transmitting
              ? "#1E2530"
              : `linear-gradient(135deg, #4DD9AC, #3B82F6)`,
            color: transmitting ? "#64748B" : "#080B12",
            boxShadow: transmitting ? "none" : "0 0 30px rgba(77,217,172,0.25)",
          }}
        >
          {transmitting ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-[#64748B] border-t-transparent animate-spin" />
              Transmitting…
            </>
          ) : (
            <>📡 TRANSMIT TO CARGOFY</>
          )}
        </button>

        {/* Hardware footer */}
        <div className="text-center text-[9px] text-[#374151] font-mono mt-2">
          Cargofy-IoT-v1.0 · FreeRTOS · MQTT → Firebase RTDB · AMS1117-3.3V
        </div>
      </div>
    </div>
  );
}
