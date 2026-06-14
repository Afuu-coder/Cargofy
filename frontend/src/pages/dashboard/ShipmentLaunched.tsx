import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CheckCircle,
  ArrowRight,
  Truck,
  User,
  Cpu,
  Map,
  Clock,
  Plus,
  ExternalLink,
  Bell,
  Play,
  Activity,
  Shield,
  Zap,
  Copy,
  Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LaunchedState {
  shipmentCode?: string;
  origin?: string;
  destination?: string;
  productType?: string;
  vehicleId?: string;
  driverName?: string;
  etaMinutes?: number;
  sensorId?: string;
  txHash?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Particle (confetti dot)
// ─────────────────────────────────────────────────────────────────────────────
const COLOURS = ["#4DD9AC", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444"];
function Particle({ delay }: { delay: number }) {
  const x = Math.random() * 100;
  const size = Math.random() * 6 + 4;
  const colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
  return (
    <div
      className="absolute rounded-full opacity-0 pointer-events-none"
      style={{
        left: `${x}%`,
        top: "-8px",
        width: size,
        height: size,
        background: colour,
        animation: `particleFall 2.4s ease-in forwards`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function ShipmentLaunched() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LaunchedState;

  // Fallback demo values if no state passed
  const shipmentCode = state.shipmentCode ?? "AXN-2024-0948";
  const origin = state.origin ?? "Guwahati";
  const destination = state.destination ?? "Shillong";
  const productType = state.productType ?? "Dairy";
  const vehicleId = state.vehicleId ?? "MH-12-AB-3391";
  const driverName = state.driverName ?? "Ramesh Kumar";
  const etaMinutes = state.etaMinutes ?? 187;
  const txHash = state.txHash ?? "0x4f3c8a...f1e20b";

  const [copied, setCopied] = useState(false);
  const [pings, setPings] = useState(0);
  const [showParticles, setShowParticles] = useState(true);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ETA in hh:mm
  const etaH = Math.floor(etaMinutes / 60);
  const etaM = etaMinutes % 60;
  const etaStr = etaH > 0 ? `${etaH}h ${etaM}m` : `${etaM}m`;

  useEffect(() => {
    // Confetti particles fade after 3s
    const t = setTimeout(() => setShowParticles(false), 3000);
    // IoT sensor ping counter
    pingRef.current = setInterval(() => setPings((p) => p + 1), 1800);
    return () => {
      clearTimeout(t);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, []);

  function copyCode() {
    navigator.clipboard?.writeText(shipmentCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const checklist = [
    { icon: Truck, label: "Vehicle Assigned", value: vehicleId, ok: true },
    { icon: User, label: "Driver", value: driverName, ok: true },
    {
      icon: Cpu,
      label: "IoT Sensor",
      value: `Active · ${pings} pings`,
      ok: true,
      pulse: true,
    },
    { icon: Map, label: "Route", value: "Locked & Optimised", ok: true },
    { icon: Shield, label: "Blockchain", value: txHash, ok: true },
    { icon: Clock, label: "ETA", value: etaStr, ok: !!etaMinutes },
  ];

  return (
    <>
      {/* Inject particle animation once */}
      <style>{`
        @keyframes particleFall {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(90vh) rotate(720deg); }
        }
        @keyframes scaleIn {
          0%   { opacity:0; transform: scale(0.5); }
          60%  { transform: scale(1.15); }
          100% { opacity:1; transform: scale(1); }
        }
        @keyframes slideUp {
          0%   { opacity:0; transform: translateY(30px); }
          100% { opacity:1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="relative w-full min-h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden flex items-center justify-center p-4"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {/* Particles */}
        {showParticles && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {Array.from({ length: 40 }, (_, i) => (
              <Particle key={i} delay={i * 0.06} />
            ))}
          </div>
        )}

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse, rgba(77,217,172,0.12) 0%, transparent 70%)",
            }}
          />
        </div>

        {/* Card */}
        <div
          className="relative z-10 w-full max-w-4xl rounded-2xl border border-[#1E2530] overflow-hidden"
          style={{
            background: "rgba(17,24,39,0.95)",
            backdropFilter: "blur(20px)",
            animation: "slideUp 0.5s ease forwards",
          }}
        >
          {/* Top gradient stripe */}
          <div
            className="h-1 w-full"
            style={{
              background: "linear-gradient(90deg, #4DD9AC, #3B82F6, #8B5CF6)",
            }}
          />

          <div className="grid md:grid-cols-12 gap-0">
            {/* ── Left Column ── */}
            <div className="md:col-span-7 p-8 md:p-10 flex flex-col gap-7 border-r border-[#1E2530]">
              {/* Success badge */}
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(77,217,172,0.15)",
                    border: "2px solid rgba(77,217,172,0.35)",
                    animation:
                      "scaleIn 0.6s cubic-bezier(.175,.885,.32,1.275) forwards",
                  }}
                >
                  <CheckCircle size={32} color="#4DD9AC" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[#F1F5F9] tracking-tight">
                    Shipment Dispatched!
                  </h1>
                  <p className="text-[#4DD9AC] text-xs font-semibold uppercase tracking-widest mt-1">
                    All systems live · AI monitoring active
                  </p>
                </div>
              </div>

              {/* Shipment code card */}
              <div
                className="rounded-xl border border-[#1E2530] p-5"
                style={{ background: "#111827" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xl text-[#4DD9AC] font-bold">
                    {shipmentCode}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-[#1E2530] text-[#94A3B8] px-2 py-1 rounded-md uppercase tracking-wider font-medium">
                      {productType}
                    </span>
                    <button
                      onClick={copyCode}
                      className="p-1.5 rounded-lg transition-all hover:bg-[#1E2530]"
                      title="Copy shipment code"
                    >
                      {copied ? (
                        <Check size={14} color="#4DD9AC" />
                      ) : (
                        <Copy size={14} color="#64748B" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] text-[#64748B] uppercase mb-1 tracking-wider">
                      Origin
                    </p>
                    <p className="text-sm font-semibold text-[#F1F5F9]">
                      {origin}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-px bg-gradient-to-r from-[#4DD9AC] to-[#3B82F6]" />
                      <ArrowRight size={14} color="#4DD9AC" />
                    </div>
                    <span className="text-[9px] text-[#4DD9AC] mt-0.5">
                      {etaStr}
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] text-[#64748B] uppercase mb-1 tracking-wider">
                      Destination
                    </p>
                    <p className="text-sm font-semibold text-[#F1F5F9]">
                      {destination}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    navigate("/mobile", { state: { shipmentCode } })
                  }
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-[#080B12] transition-all hover:opacity-90 hover:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #4DD9AC, #3B82F6)",
                  }}
                >
                  <Play size={15} /> Start Simulation
                </button>
                <button
                  onClick={() => navigate(`/shipment/${shipmentCode}`)}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-[#F1F5F9] border border-[#1E2530] transition-all hover:bg-[#1E2530] hover:scale-[0.98]"
                >
                  <ExternalLink size={15} /> Open Detail
                </button>
                <button
                  onClick={() => navigate("/alerts")}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium text-[#94A3B8] border border-[#1E2530] transition-all hover:border-[#4DD9AC]/40 hover:text-[#4DD9AC] hover:scale-[0.98]"
                >
                  <Bell size={15} /> View Alerts
                </button>
                <button
                  onClick={() => navigate("/create-shipment")}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium text-[#94A3B8] border border-[#1E2530] transition-all hover:border-[#3B82F6]/40 hover:text-[#3B82F6] hover:scale-[0.98]"
                >
                  <Plus size={15} /> Create Another
                </button>
              </div>
            </div>

            {/* ── Right Column: Operational Checklist ── */}
            <div className="md:col-span-5 p-6 flex flex-col gap-5">
              <div>
                <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-widest">
                  Operational Status
                </h3>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                {checklist.map(({ icon: Icon, label, value, ok, pulse }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3 p-3 rounded-xl border border-[#1E2530] bg-[#0D1117]"
                  >
                    <div className="relative flex-shrink-0 mt-0.5">
                      <Icon size={16} color={ok ? "#4DD9AC" : "#EF4444"} />
                      {pulse && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#4DD9AC] animate-ping" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#64748B] uppercase tracking-wider">
                        {label}
                      </p>
                      <p
                        className={`text-xs font-mono mt-0.5 truncate ${label === "Blockchain" ? "text-[#94A3B8]" : "text-[#F1F5F9]"}`}
                      >
                        {value}
                      </p>
                    </div>
                    <div className="ml-auto flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${ok ? "bg-[#4DD9AC]" : "bg-[#EF4444]"} ${pulse ? "animate-pulse" : ""}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Live data ticker */}
              <div className="mt-auto p-3 rounded-xl border border-[#4DD9AC]/20 bg-[#4DD9AC]/05">
                <div className="flex items-center gap-2 mb-1">
                  <Activity size={12} color="#4DD9AC" />
                  <span className="text-[10px] text-[#4DD9AC] font-bold uppercase tracking-wider">
                    AI Agent Active
                  </span>
                </div>
                <p className="text-[10px] text-[#64748B]">
                  Monitoring temperature, route deviation & driver behaviour.
                  Intervention threshold: 75/100 risk.
                </p>
              </div>

              {/* Back to dashboard */}
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-[#64748B] border border-[#1E2530] transition-all hover:bg-[#1E2530] hover:text-[#F1F5F9] flex items-center justify-center gap-2"
              >
                <Zap size={12} /> Back to Command Hub
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
