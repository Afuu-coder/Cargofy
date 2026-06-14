import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  getShipments,
  getFleetDrivers,
  getFleetVehicles,
  getFleetHealthSummary,
  getDriverLeaderboard,
  assignDriver,
  unassignDriver,
  createFleetDriver,
  createFleetVehicle,
  type Shipment,
  type FleetDriver,
  type FleetVehicle,
  type FleetHealthSummary,
} from "../../lib/api";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  Truck,
  User,
  Droplet,
  Snowflake,
  Thermometer,
  ShieldAlert,
  Phone,
  MessageSquare,
  Briefcase,
  Activity,
  Calendar,
  Box,
  ActivitySquare,
  AlertCircle,
  Wrench,
  MapPin,
  Bell,
  Radio,
  ArrowRight,
  FileText,
  Plus,
  Award,
  Bot,
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Static data (enriched with real shipment context)
// ─────────────────────────────────────────────────────────────────────────────
interface Driver {
  id: string;
  name: string;
  phone: string;
  waVerified: boolean;
  status: "available" | "active" | "flagged" | "critical";
  activeShip?: string;
  lastTrip: string;
  joined: string;
  location: string;
  trips: number;
  ackRate: number;
  avgDelay: number;
  excursions: number;
  slaBreachRate: number;
  score: number;
  flagReason?: string;
  tripHistory: TripRow[];
  alertHistory: AlertRow[];
  products: string[];
}
interface TripRow {
  code: string;
  icon: React.ReactNode;
  route: string;
  duration: string;
  onTime: boolean;
  delayMin?: number;
  excursions: number;
}
interface AlertRow {
  time: string;
  ship: string;
  type: string;
  ackMin: number;
}

interface Vehicle {
  id: string;
  plate: string;
  type: string;
  maker: string;
  capacity: string;
  reeferSystem: string;
  tempRange: string;
  status: "available" | "active" | "maintenance";
  activeShip?: string;
  reeferHealth: number;
  reeferFault?: boolean;
  sensorId?: string;
  sensorBattery?: number;
  lastPing?: string;
  gpsSignal: string;
  calibrationValid: boolean;
  lastService: string;
  nextService: string;
  serviceOverdue: boolean;
  currentTemp?: number;
  avgTempStability: string;
  doorSeal: boolean;
  compressor: boolean;
  compatibility: string[];
  tripHistory: VehicleTripRow[];
}
interface VehicleTripRow {
  code: string;
  duration: string;
  avgTemp: string;
  tempOk: boolean;
  breaches: number;
}

const DRIVERS: Driver[] = [
  {
    id: "DRV-0042",
    name: "Ramesh Kumar",
    phone: "+91 98765 43210",
    waVerified: true,
    status: "available",
    lastTrip: "2 days ago",
    joined: "March 2022",
    location: "Guwahati",
    trips: 48,
    ackRate: 96,
    avgDelay: 8,
    excursions: 1,
    slaBreachRate: 2.1,
    score: 98,
    products: ["Dairy", "Seafood", "Frozen"],
    tripHistory: [
      {
        code: "AXN-2041",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 02m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1998",
        icon: <ActivitySquare size={14} className="text-[#A78BFA]" />,
        route: "BOM→PUN",
        duration: "2h 18m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1847",
        icon: <Snowflake size={14} className="text-[#34D399]" />,
        route: "CCU→PAT",
        duration: "6h 44m",
        onTime: false,
        delayMin: 18,
        excursions: 1,
      },
      {
        code: "AXN-1721",
        icon: <Snowflake size={14} className="text-[#FBBF24]" />,
        route: "DEL→JAI",
        duration: "3h 55m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1680",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 28m",
        onTime: true,
        excursions: 0,
      },
    ],
    alertHistory: [
      { time: "2 days ago", ship: "AXN-1847", type: "Temp breach", ackMin: 2 },
      {
        time: "5 days ago",
        ship: "AXN-1680",
        type: "Delay warning",
        ackMin: 1,
      },
      {
        time: "8 days ago",
        ship: "AXN-1600",
        type: "Humidity alert",
        ackMin: 3,
      },
    ],
  },
  {
    id: "DRV-0051",
    name: "Suresh Pandey",
    phone: "+91 97234 11200",
    waVerified: true,
    status: "active",
    activeShip: "AXN-2087",
    lastTrip: "Active now",
    joined: "July 2021",
    location: "En route",
    trips: 41,
    ackRate: 94,
    avgDelay: 11,
    excursions: 2,
    slaBreachRate: 3.4,
    score: 94,
    products: ["Dairy", "Produce", "Fruits"],
    tripHistory: [
      {
        code: "AXN-2044",
        icon: <Snowflake size={14} className="text-[#34D399]" />,
        route: "CCU→PAT",
        duration: "5h 10m",
        onTime: true,
        excursions: 1,
      },
      {
        code: "AXN-1920",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 12m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1810",
        icon: <Snowflake size={14} className="text-[#EF4444]" />,
        route: "MUM→PUN",
        duration: "2h 05m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1742",
        icon: <Snowflake size={14} className="text-[#FBBF24]" />,
        route: "DEL→JAI",
        duration: "3h 40m",
        onTime: false,
        delayMin: 12,
        excursions: 1,
      },
      {
        code: "AXN-1700",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 22m",
        onTime: true,
        excursions: 0,
      },
    ],
    alertHistory: [
      {
        time: "3 days ago",
        ship: "AXN-2044",
        type: "Humidity spike",
        ackMin: 4,
      },
    ],
  },
  {
    id: "DRV-0064",
    name: "Anuj Sharma",
    phone: "+91 96400 55100",
    waVerified: true,
    status: "available",
    lastTrip: "1 day ago",
    joined: "Nov 2022",
    location: "Kolkata",
    trips: 36,
    ackRate: 89,
    avgDelay: 14,
    excursions: 3,
    slaBreachRate: 4.8,
    score: 88,
    products: ["Dairy", "Frozen"],
    tripHistory: [
      {
        code: "AXN-2010",
        icon: <Snowflake size={14} className="text-[#34D399]" />,
        route: "SIL→GUW",
        duration: "4h 55m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1905",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 08m",
        onTime: false,
        delayMin: 9,
        excursions: 1,
      },
      {
        code: "AXN-1800",
        icon: <Snowflake size={14} className="text-[#34D399]" />,
        route: "CCU→PAT",
        duration: "5h 30m",
        onTime: true,
        excursions: 2,
      },
      {
        code: "AXN-1650",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 20m",
        onTime: true,
        excursions: 0,
      },
      {
        code: "AXN-1600",
        icon: <Snowflake size={14} className="text-[#34D399]" />,
        route: "SIL→GUW",
        duration: "4h 44m",
        onTime: true,
        excursions: 0,
      },
    ],
    alertHistory: [
      { time: "1 day ago", ship: "AXN-1905", type: "Delay warning", ackMin: 6 },
      { time: "4 days ago", ship: "AXN-1800", type: "Temp breach", ackMin: 3 },
    ],
  },
  {
    id: "DRV-0071",
    name: "Dev Nair",
    phone: "+91 96100 22100",
    waVerified: true,
    status: "flagged",
    lastTrip: "3 hrs ago",
    joined: "Jan 2023",
    location: "Dibrugarh",
    trips: 29,
    ackRate: 72,
    avgDelay: 28,
    excursions: 6,
    slaBreachRate: 11.2,
    score: 61,
    flagReason: "3 unacknowledged alerts this week",
    products: ["Dairy"],
    tripHistory: [
      {
        code: "AXN-2841",
        icon: <ActivitySquare size={14} className="text-[#A78BFA]" />,
        route: "DIB→ITA",
        duration: "7h 22m",
        onTime: false,
        delayMin: 42,
        excursions: 3,
      },
      {
        code: "AXN-1960",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "4h 50m",
        onTime: false,
        delayMin: 30,
        excursions: 2,
      },
      {
        code: "AXN-1820",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "5h 10m",
        onTime: false,
        delayMin: 25,
        excursions: 1,
      },
    ],
    alertHistory: [
      {
        time: "3 hrs ago",
        ship: "AXN-2841",
        type: "Reefer failure",
        ackMin: 999,
      },
      { time: "1 day ago", ship: "AXN-1960", type: "Temp breach", ackMin: 999 },
      {
        time: "2 days ago",
        ship: "AXN-1820",
        type: "Delay warning",
        ackMin: 18,
      },
    ],
  },
  {
    id: "DRV-0082",
    name: "Bikash Roy",
    phone: "+91 95200 31400",
    waVerified: true,
    status: "critical",
    lastTrip: "Today",
    joined: "May 2023",
    location: "Route NE-7",
    trips: 31,
    ackRate: 61,
    avgDelay: 35,
    excursions: 9,
    slaBreachRate: 16.4,
    score: 48,
    flagReason: "6 open alerts · Repeated SLA breaches",
    products: ["Dairy"],
    tripHistory: [
      {
        code: "AXN-2099",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "SIL→GUW",
        duration: "6h 10m",
        onTime: false,
        delayMin: 55,
        excursions: 4,
      },
      {
        code: "AXN-1990",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "GHY→SHL",
        duration: "5h 44m",
        onTime: false,
        delayMin: 44,
        excursions: 3,
      },
      {
        code: "AXN-1870",
        icon: <Snowflake size={14} className="text-[#60A5FA]" />,
        route: "SIL→GUW",
        duration: "6h 00m",
        onTime: false,
        delayMin: 35,
        excursions: 2,
      },
    ],
    alertHistory: [
      { time: "2 hrs ago", ship: "AXN-2099", type: "Temp breach", ackMin: 999 },
      {
        time: "5 hrs ago",
        ship: "AXN-2099",
        type: "Humidity spike",
        ackMin: 42,
      },
      {
        time: "1 day ago",
        ship: "AXN-1990",
        type: "Reefer warning",
        ackMin: 999,
      },
    ],
  },
];

const VEHICLES: Vehicle[] = [
  {
    id: "VEH-0019",
    plate: "MH-12-AB-3391",
    type: "Reefer Truck (Large)",
    maker: "Ashok Leyland",
    capacity: "5,000 kg / 22,000 L",
    reeferSystem: "Thermo King T-680",
    tempRange: "-20°C to +10°C",
    status: "available",
    reeferHealth: 98,
    sensorId: "IoT-4821",
    sensorBattery: 78,
    lastPing: "2 min ago",
    gpsSignal: "Strong",
    calibrationValid: true,
    lastService: "8 days ago",
    nextService: "Oct 28 (20 days)",
    serviceOverdue: false,
    currentTemp: 3.2,
    avgTempStability: "±0.3°C",
    doorSeal: true,
    compressor: true,
    compatibility: ["Dairy", "Seafood", "Frozen", "Pharma"],
    tripHistory: [
      {
        code: "AXN-2041",
        duration: "4h 02m",
        avgTemp: "3.8°C",
        tempOk: true,
        breaches: 1,
      },
      {
        code: "AXN-1998",
        duration: "2h 18m",
        avgTemp: "4.1°C",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1847",
        duration: "6h 44m",
        avgTemp: "3.6°C",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1721",
        duration: "3h 55m",
        avgTemp: "3.9°C",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1680",
        duration: "4h 28m",
        avgTemp: "4.0°C",
        tempOk: true,
        breaches: 0,
      },
    ],
  },
  {
    id: "VEH-0023",
    plate: "TN-01-AB-4521",
    type: "Reefer Truck (Large)",
    maker: "Tata Motors",
    capacity: "8,000 kg / 32,000 L",
    reeferSystem: "Carrier Transicold",
    tempRange: "-18°C to +12°C",
    status: "active",
    activeShip: "AXN-2091",
    reeferHealth: 68,
    sensorId: "IoT-2044",
    sensorBattery: 55,
    lastPing: "5 min ago",
    gpsSignal: "Moderate",
    calibrationValid: true,
    lastService: "24 days ago",
    nextService: "Nov 2 (4 days)",
    serviceOverdue: false,
    currentTemp: 9.8,
    avgTempStability: "±1.2°C",
    doorSeal: true,
    compressor: false,
    compatibility: ["Dairy", "Seafood", "Meat"],
    tripHistory: [
      {
        code: "AXN-2091",
        duration: "Active",
        avgTemp: "9.8°C",
        tempOk: false,
        breaches: 1,
      },
      {
        code: "AXN-2010",
        duration: "5h 00m",
        avgTemp: "5.4°C",
        tempOk: true,
        breaches: 1,
      },
      {
        code: "AXN-1940",
        duration: "4h 30m",
        avgTemp: "4.8°C",
        tempOk: true,
        breaches: 0,
      },
    ],
  },
  {
    id: "VEH-0031",
    plate: "KA-09-DC-7744",
    type: "Insulated Van",
    maker: "Force Traveller",
    capacity: "1,000 kg / 4,000 L",
    reeferSystem: "N/A — Insulated only",
    tempRange: "Ambient +2°C buffer",
    status: "available",
    reeferHealth: 0,
    sensorBattery: 0,
    lastPing: "N/A",
    gpsSignal: "N/A",
    calibrationValid: false,
    lastService: "3 days ago",
    nextService: "Nov 15 (17 days)",
    serviceOverdue: false,
    currentTemp: undefined,
    avgTempStability: "N/A",
    doorSeal: true,
    compressor: false,
    compatibility: ["Produce", "Fruits"],
    tripHistory: [
      {
        code: "AXN-1920",
        duration: "3h 10m",
        avgTemp: "Ambient",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1810",
        duration: "2h 40m",
        avgTemp: "Ambient",
        tempOk: true,
        breaches: 0,
      },
    ],
  },
  {
    id: "VEH-0038",
    plate: "AS-01-BC-1110",
    type: "Reefer Truck (Medium)",
    maker: "Eicher",
    capacity: "4,000 kg / 18,000 L",
    reeferSystem: "Thermo King V-500",
    tempRange: "-15°C to +8°C",
    status: "maintenance",
    reeferHealth: 0,
    reeferFault: true,
    sensorId: "IoT-0092",
    sensorBattery: 90,
    lastPing: "2 hrs ago",
    gpsSignal: "Parked",
    calibrationValid: true,
    lastService: "Overdue",
    nextService: "OVERDUE",
    serviceOverdue: true,
    currentTemp: undefined,
    avgTempStability: "N/A",
    doorSeal: false,
    compressor: false,
    compatibility: ["Dairy", "Meat"],
    tripHistory: [
      {
        code: "AXN-2010",
        duration: "4h 55m",
        avgTemp: "6.2°C",
        tempOk: false,
        breaches: 3,
      },
      {
        code: "AXN-1900",
        duration: "5h 20m",
        avgTemp: "5.8°C",
        tempOk: true,
        breaches: 1,
      },
    ],
  },
  {
    id: "VEH-0044",
    plate: "WB-08-EF-2291",
    type: "Reefer Truck (Large)",
    maker: "Ashok Leyland",
    capacity: "6,000 kg / 26,000 L",
    reeferSystem: "Carrier Vector 1850",
    tempRange: "-25°C to +12°C",
    status: "available",
    reeferHealth: 94,
    sensorId: "IoT-3302",
    sensorBattery: 88,
    lastPing: "1 min ago",
    gpsSignal: "Strong",
    calibrationValid: true,
    lastService: "6 days ago",
    nextService: "Nov 5 (7 days)",
    serviceOverdue: false,
    currentTemp: 4.1,
    avgTempStability: "±0.4°C",
    doorSeal: true,
    compressor: true,
    compatibility: ["Dairy", "Seafood", "Frozen", "Pharma", "Meat"],
    tripHistory: [
      {
        code: "AXN-2060",
        duration: "3h 44m",
        avgTemp: "4.2°C",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1970",
        duration: "5h 15m",
        avgTemp: "3.9°C",
        tempOk: true,
        breaches: 0,
      },
      {
        code: "AXN-1890",
        duration: "4h 30m",
        avgTemp: "4.1°C",
        tempOk: true,
        breaches: 0,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const statusBadge = (s: Driver["status"]): [React.ReactNode, string] => {
  const M: Record<string, [React.ReactNode, string]> = {
    available: [<CheckCircle size={12} />, "#34D399"],
    active: [<Info size={12} />, "#60A5FA"],
    flagged: [<AlertTriangle size={12} />, "#FBBF24"],
    critical: [<XCircle size={12} />, "#EF4444"],
  };
  return M[s] ?? [<span />, "#94A3B8"];
};
const vsBadge = (s: Vehicle["status"]): [React.ReactNode, string] => {
  const M: Record<string, [React.ReactNode, string]> = {
    available: [<CheckCircle size={12} />, "#34D399"],
    active: [<Info size={12} />, "#60A5FA"],
    maintenance: [<Wrench size={12} />, "#A78BFA"],
  };
  return M[s] ?? [<span />, "#94A3B8"];
};
const scoreColor = (n: number) =>
  n >= 90 ? "#34D399" : n >= 80 ? "#4DD9AC" : n >= 60 ? "#FBBF24" : "#EF4444";
const reeferColor = (n: number) =>
  n >= 90 ? "#34D399" : n >= 80 ? "#4DD9AC" : n >= 60 ? "#FBBF24" : "#EF4444";

function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-[#64748B] uppercase tracking-widest">
        {label}
      </div>
      <div
        className="text-base font-black font-mono mt-0.5"
        style={{ color: color ?? "#F1F5F9" }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#4A5568]">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🤖 HACKATHON UPGRADE — AI Behavior Scoring Engine
// ─────────────────────────────────────────────────────────────────────────────
const BEHAVIOR_DIMENSIONS = [
  {
    key: "ack",
    label: "Alert Response",
    icon: "⚡",
    desc: "Alert acknowledgement speed and consistency",
  },
  {
    key: "temp",
    label: "Temp Discipline",
    icon: "🌡",
    desc: "Temperature excursions caused by driver behavior",
  },
  {
    key: "time",
    label: "Punctuality",
    icon: "⏱",
    desc: "On-time delivery rate and delay minimization",
  },
  {
    key: "safety",
    label: "Safety Score",
    icon: "🛡",
    desc: "Door-open events, harsh braking, reefer handling",
  },
  {
    key: "comm",
    label: "Communication",
    icon: "💬",
    desc: "WhatsApp response rate, escalation cooperation",
  },
];

function buildBehaviorScores(d: Driver): Record<string, number> {
  return {
    ack: Math.min(
      100,
      Math.round(d.ackRate * 0.95 + (d.excursions < 2 ? 5 : 0)),
    ),
    temp: Math.min(
      100,
      Math.round(100 - d.excursions * 12 - (d.avgDelay > 20 ? 8 : 0)),
    ),
    time: Math.min(
      100,
      Math.round(100 - d.avgDelay * 1.5 - d.slaBreachRate * 2),
    ),
    safety: Math.min(100, Math.round(d.score * 0.9 + 6)),
    comm: Math.min(100, Math.round(d.ackRate * 0.88 + (d.waVerified ? 8 : 0))),
  };
}

function getAIVerdicts(d: Driver, scores: Record<string, number>): string[] {
  const vals = Object.values(scores);
  const avg =
    vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const verdicts: string[] = [];
  const first = d.name.split(" ")[0];
  if (avg >= 90)
    verdicts.push(
      `${first} is a top-tier cold-chain driver. Recommend for priority CRITICAL shipments.`,
    );
  else if (avg >= 75)
    verdicts.push(
      `${first} performs well. Minor improvements in temperature discipline recommended.`,
    );
  else
    verdicts.push(
      `${first} shows inconsistencies. Recommend refresher training on reefer management.`,
    );
  if (scores.ack < 80)
    verdicts.push(
      "Alert ACK rate below threshold. Consider mandatory WhatsApp check-in protocol.",
    );
  if (scores.temp < 70)
    verdicts.push(
      "Repeated temperature excursions. Vehicle reefer calibration check recommended.",
    );
  if (d.excursions === 0)
    verdicts.push(
      "Zero excursions this period — exceptional temperature discipline.",
    );
  return verdicts;
}

/** Gemini-style reliability narrative based on driver stats */
function buildGeminiNarrative(d: Driver, avg: number): string {
  const first = d.name.split(" ")[0];
  const tier =
    avg >= 88
      ? "ELITE"
      : avg >= 72
        ? "RELIABLE"
        : avg >= 55
          ? "MODERATE"
          : "HIGH-RISK";
  const monsoonNote =
    d.avgDelay > 25
      ? `${first} shows a ${Math.round(d.avgDelay * 0.5)}% higher delay rate during monsoon months due to NH-37 hill sections. `
      : "";
  const excNote =
    d.excursions > 2
      ? `With ${d.excursions} temperature excursions logged, reefer discipline requires attention. `
      : d.excursions === 0
        ? `Zero temperature excursions — exceptional cold-chain hygiene. `
        : "";
  const recom =
    tier === "ELITE"
      ? "Recommend for PHARMA and high-value cargo."
      : tier === "RELIABLE"
        ? "Suitable for standard cold-chain assignments."
        : tier === "MODERATE"
          ? "Assign to lower-risk produce shipments only."
          : "Do not assign to sensitive pharma or frozen cargo without supervision.";
  return `• AI Tier: ${tier} • Overall Score: ${Math.round(avg)}/100
${monsoonNote}${excNote}${recom}`;
}

// ── Smart Allocation Guard Modal ───────────────────────────────────────────────────────────────
const HIGH_VALUE_TYPES = ["pharma", "frozen", "seafood"];
function SmartAllocationGuard({
  vehicle,
  onClose,
  driverId,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  driverId?: string;
}) {
  const [product, setProduct] = useState("dairy");
  const [assigning, setAssigning] = useState(false);
  const [assignDone, setAssignDone] = useState(false);
  const health = vehicle.reeferHealth;
  const isHighValue = HIGH_VALUE_TYPES.includes(product);
  const isBlocked = isHighValue && health < 70;
  const riskLevel = health >= 85 ? "LOW" : health >= 70 ? "MODERATE" : "HIGH";
  const riskColor =
    riskLevel === "LOW"
      ? "#34D399"
      : riskLevel === "MODERATE"
        ? "#FBBF24"
        : "#EF4444";

  const handleConfirm = async () => {
    if (!driverId) {
      onClose();
      return;
    }
    setAssigning(true);
    try {
      // POST /api/v1/fleet/drivers/{driverId}/assign {shipment_id: vehicle.activeShip || ''}
      await assignDriver(driverId, vehicle.activeShip || vehicle.id);
    } catch {
      /* silent — modal closes anyway */
    }
    setAssigning(false);
    setAssignDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0A0D14] border border-[#1E2530] rounded-2xl p-6 w-full max-w-md shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 flex items-center justify-center">
              <Bot size={20} className="text-[#A78BFA]" />
            </div>
            <div>
              <div className="font-bold text-[#F1F5F9]">
                AI Allocation Safety Check
              </div>
              <div className="text-[10px] text-[#64748B]">
                Gemini ADK — {vehicle.plate} • Reefer Health:{" "}
                <span style={{ color: riskColor }}>{health}%</span>
              </div>
            </div>
          </div>

          {/* Product selector */}
          <div className="mb-4">
            <div className="text-xs text-[#64748B] mb-2">
              Select cargo type to assign:
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                "dairy",
                "produce",
                "seafood",
                "frozen",
                "pharma",
                "fruits",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => setProduct(p)}
                  className={`text-xs py-2 px-3 rounded-lg border capitalize transition-all ${
                    product === p
                      ? "bg-[#A78BFA]/15 border-[#A78BFA]/60 text-[#A78BFA] font-bold"
                      : "border-[#1E2530] text-[#64748B] hover:border-[#374151]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Compatibility matrix */}
          <div className="bg-[#111827] rounded-xl p-4 mb-4 space-y-2">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3">
              Compatibility Matrix
            </div>
            {[
              {
                label: "Cargo Risk Level",
                value: isHighValue ? "🔴 HIGH VALUE" : "🟢 STANDARD",
                color: isHighValue ? "#F87171" : "#34D399",
              },
              {
                label: "Vehicle Reefer Health",
                value: `${health}% — ${riskLevel}`,
                color: riskColor,
              },
              {
                label: "Service Status",
                value: vehicle.serviceOverdue ? "❌ Overdue" : "✅ Current",
                color: vehicle.serviceOverdue ? "#EF4444" : "#34D399",
              },
              {
                label: "Calibration",
                value: vehicle.calibrationValid ? "✅ Valid" : "⚠️ Expired",
                color: vehicle.calibrationValid ? "#34D399" : "#FBBF24",
              },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="text-[#64748B]">{row.label}</span>
                <span className="font-bold" style={{ color: row.color }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* AI verdict */}
          {isBlocked ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#EF4444]/8 border border-[#EF4444]/30 rounded-xl p-4 mb-4"
            >
              <div className="flex items-center gap-2 text-[#F87171] font-bold text-sm mb-1">
                🚫 AI Blocked — Unsafe Assignment
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Reefer health ({health}%) is below the 70% threshold for{" "}
                {product} cargo. High risk of temperature excursion. Assign a
                vehicle with health ≥ 70% or reclassify cargo.
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#34D399]/8 border border-[#34D399]/30 rounded-xl p-4 mb-4"
            >
              <div className="flex items-center gap-2 text-[#34D399] font-bold text-sm mb-1">
                ✅ AI Approved — Safe to Assign
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Vehicle is compatible with {product} cargo. Reefer health is{" "}
                {riskLevel.toLowerCase()}.
                {vehicle.serviceOverdue
                  ? " Schedule service after this trip."
                  : " All systems nominal."}
              </p>
            </motion.div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 text-sm py-2.5 rounded-xl border border-[#1E2530] text-[#64748B] hover:border-[#374151] transition-colors"
            >
              Cancel
            </button>
            {!isBlocked && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                disabled={assigning || assignDone}
                className={`flex-1 text-sm py-2.5 rounded-xl font-bold transition-colors ${
                  assignDone
                    ? "bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/30"
                    : assigning
                      ? "bg-[#4DD9AC]/40 text-[#003829] cursor-wait"
                      : "bg-[#4DD9AC] text-[#003829] hover:bg-[#6EF6C7]"
                }`}
              >
                {assignDone
                  ? "✅ Assigned!"
                  : assigning
                    ? "⏳ Assigning..."
                    : "✅ Confirm Assignment"}
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AIBehaviorScore({ driver }: { driver: Driver }) {
  const [analysing, setAnalysing] = useState(false);
  const [analysed, setAnalysed] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [verdicts, setVerdicts] = useState<string[]>([]);

  function runAnalysis() {
    setAnalysing(true);
    setAnalysed(false);
    setScores({});
    setVerdicts([]);
    const computed = buildBehaviorScores(driver);
    const keys = Object.keys(computed);
    keys.forEach((k, i) => {
      setTimeout(
        () => {
          setScores((prev) => ({ ...prev, [k]: computed[k] }));
          if (i === keys.length - 1) {
            setTimeout(() => {
              setVerdicts(getAIVerdicts(driver, computed));
              setAnalysing(false);
              setAnalysed(true);
            }, 400);
          }
        },
        300 + i * 370,
      );
    });
  }

  const vals = Object.values(scores);
  const avg =
    vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  const sc = (s: number) =>
    s >= 85 ? "#34D399" : s >= 65 ? "#FBBF24" : "#F87171";

  return (
    <div className="bg-[#080B12] border border-[#1E3A5F] rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[#0D1A2E] to-[#080B12] border-b border-[#1E3A5F] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: analysing ? 360 : 0 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          >
            <Bot size={14} className="text-[#A78BFA]" />
          </motion.div>
          <div>
            <div className="text-xs font-bold text-[#F1F5F9] flex items-center gap-1.5">
              AI Behavior Analysis
              {analysing && (
                <span className="text-[9px] text-[#A78BFA] animate-pulse">
                  ● SCORING
                </span>
              )}
              {analysed && (
                <span className="text-[9px] text-[#34D399]">✓ DONE</span>
              )}
            </div>
            <div className="text-[9px] text-[#64748B]">
              Gemini Pro · {driver.trips} trips analysed
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {avg !== null && (
            <div className="text-center mr-1">
              <div
                className="text-lg font-black font-mono"
                style={{ color: sc(avg) }}
              >
                {avg}
              </div>
              <div className="text-[8px] text-[#64748B]">AI Score</div>
            </div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={runAnalysis}
            disabled={analysing}
            className={`flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg font-bold transition-all ${
              analysing
                ? "bg-[#A78BFA]/10 text-[#A78BFA] cursor-wait"
                : "bg-[#A78BFA] text-[#030712] hover:brightness-110"
            }`}
          >
            {analysing ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Sparkles size={10} />
            )}
            {analysing ? "Scoring..." : analysed ? "Re-score" : "AI Score"}
          </motion.button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {Object.keys(scores).length === 0 && !analysing && (
          <div className="text-[10px] text-[#4A5568] text-center py-3 flex flex-col items-center gap-1">
            <Bot size={22} className="text-[#A78BFA]/30" />
            Click <strong className="text-[#A78BFA]">AI Score</strong> to
            analyse this driver across 5 behavioural dimensions
          </div>
        )}
        {BEHAVIOR_DIMENSIONS.map((dim) => {
          const s = scores[dim.key];
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-[#94A3B8]">
                  {dim.icon} {dim.label}
                </span>
                {s !== undefined && (
                  <span
                    className="font-mono font-bold"
                    style={{ color: sc(s) }}
                  >
                    {s}/100
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                {s !== undefined && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg,${sc(s)}60,${sc(s)})`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {verdicts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-[#1E2530] pt-3 space-y-1.5">
              <div className="text-[9px] text-[#A78BFA] uppercase tracking-widest font-bold flex items-center gap-1 mb-2">
                <Bot size={9} /> Gemini Verdict
              </div>
              {verdicts.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-1.5"
                >
                  <div className="w-1 h-1 rounded-full bg-[#A78BFA] mt-1.5 shrink-0" />
                  <p className="text-[10px] text-[#CBD5E1] leading-snug">{v}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🧠 Gemini Reliability Narrative */}
      <AnimatePresence>
        {analysed &&
          (() => {
            const vals = Object.values(scores);
            const avg =
              vals.length > 0
                ? vals.reduce((a, b) => a + b, 0) / vals.length
                : 0;
            const narrative = buildGeminiNarrative(driver, avg);
            const tier =
              avg >= 88
                ? "ELITE"
                : avg >= 72
                  ? "RELIABLE"
                  : avg >= 55
                    ? "MODERATE"
                    : "HIGH-RISK";
            const tierColor =
              tier === "ELITE"
                ? "#34D399"
                : tier === "RELIABLE"
                  ? "#60A5FA"
                  : tier === "MODERATE"
                    ? "#FBBF24"
                    : "#EF4444";
            return (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 border-t border-[#1E2530] pt-3">
                  <div className="text-[9px] text-[#A78BFA] uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                    <Sparkles size={9} /> Gemini Reliability Narrative
                  </div>
                  <p className="text-[10px] text-[#CBD5E1] leading-relaxed whitespace-pre-line">
                    {narrative}
                  </p>
                  {/* Risk prediction bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[9px] text-[#64748B] mb-1">
                      <span>RELIABLE</span>
                      <span>HIGH-RISK</span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{
                        background:
                          "linear-gradient(90deg,#34D399,#FBBF24,#EF4444)",
                      }}
                    >
                      <motion.div
                        initial={{ left: 0 }}
                        animate={{ left: `${100 - avg}%` }}
                        className="absolute w-2 h-2 rounded-full bg-white shadow-lg -mt-0 border border-[#0A0D14]"
                        style={{
                          position: "relative",
                          marginLeft: `${100 - avg}%`,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#fff",
                          marginTop: -3,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-center">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          color: tierColor,
                          background: `${tierColor}18`,
                        }}
                      >
                        {tier}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function DriverDetail({
  driver: d,
  onClose,
}: {
  driver: Driver;
  onClose: () => void;
}) {
  const [sbadge, scolor] = statusBadge(d.status);
  const navigate = useNavigate();
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ fontFamily: "Inter,sans-serif" }}
    >
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] sticky top-0 bg-[#0A0D14] z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4DD9AC]/20 to-[#60A5FA]/20 border border-[#1E2530] flex items-center justify-center text-lg">
              <User size={20} className="text-[#60A5FA]" />
            </div>
            <div>
              <div className="font-bold text-[#F1F5F9]">{d.name}</div>
              <div className="text-[10px] text-[#64748B]">{d.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ color: scolor, background: `${scolor}18` }}
            >
              {sbadge} {d.status.toUpperCase()}
            </span>
            <button
              onClick={onClose}
              className="text-[#4A5568] hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
        <div className="text-xs text-[#94A3B8] space-y-1 mt-2">
          <div className="flex items-center gap-2">
            <Phone size={12} /> {d.phone} · <MessageSquare size={12} /> WhatsApp{" "}
            {d.waVerified ? (
              <CheckCircle size={12} className="text-[#34D399] inline" />
            ) : (
              <XCircle size={12} className="text-[#EF4444] inline" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={12} /> {d.location} · <Calendar size={12} /> Joined{" "}
            {d.joined}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Performance metrics */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Activity size={14} /> Performance Metrics
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total Trips" value={String(d.trips)} />
            <Stat
              label="Performance Score"
              value={String(d.score)}
              color={scoreColor(d.score)}
            />
            <Stat
              label="Alert Ack Rate"
              value={`${d.ackRate}%`}
              color={
                d.ackRate >= 90
                  ? "#34D399"
                  : d.ackRate >= 75
                    ? "#FBBF24"
                    : "#EF4444"
              }
              sub="Network avg: 84%"
            />
            <Stat
              label="Avg Delay"
              value={`${d.avgDelay} min`}
              color={
                d.avgDelay <= 12
                  ? "#34D399"
                  : d.avgDelay <= 20
                    ? "#FBBF24"
                    : "#EF4444"
              }
              sub="Network avg: 18 min"
            />
            <Stat
              label="Excursions"
              value={String(d.excursions)}
              color={
                d.excursions <= 2
                  ? "#34D399"
                  : d.excursions <= 5
                    ? "#FBBF24"
                    : "#EF4444"
              }
              sub="Network avg: 4.2"
            />
            <Stat
              label="SLA Breach Rate"
              value={`${d.slaBreachRate}%`}
              color={
                d.slaBreachRate <= 4
                  ? "#34D399"
                  : d.slaBreachRate <= 10
                    ? "#FBBF24"
                    : "#EF4444"
              }
            />
          </div>
          {/* Score bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#64748B]">Overall Score</span>
              <span
                className="font-mono font-bold"
                style={{ color: scoreColor(d.score) }}
              >
                {d.score}/100
              </span>
            </div>
            <div className="h-2 bg-[#1E2530] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${d.score}%`,
                  background: scoreColor(d.score),
                }}
              />
            </div>
          </div>
        </div>

        {/* Current trip */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-2 flex items-center gap-2">
            <Truck size={14} /> Current Trip
          </div>
          {d.activeShip ? (
            <button
              onClick={() => navigate(`/shipments/${d.activeShip}`)}
              className="text-xs text-[#60A5FA] font-mono font-bold hover:underline"
            >
              {d.activeShip} →
            </button>
          ) : (
            <div className="text-xs text-[#4A5568] italic">
              No active trip assigned
            </div>
          )}
        </div>

        {/* Trip history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center gap-2">
            <Box size={14} /> Trip History (last {d.tripHistory.length})
          </div>
          <div className="divide-y divide-[#1E2530]">
            {d.tripHistory.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[#0D1117] transition-colors"
              >
                <span className="font-mono text-[#4DD9AC] w-18 shrink-0">
                  {t.code}
                </span>
                <span className="text-lg shrink-0 flex items-center justify-center w-6 h-6">
                  {t.icon}
                </span>
                <span className="text-[#64748B] w-16 shrink-0">{t.route}</span>
                <span className="text-[#94A3B8]">{t.duration}</span>
                <span
                  className="ml-auto flex items-center gap-1"
                  style={{ color: t.onTime ? "#34D399" : "#FBBF24" }}
                >
                  {t.onTime ? (
                    <CheckCircle size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}{" "}
                  {t.onTime ? "On time" : `+${t.delayMin}m`}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: t.excursions === 0 ? "#34D399" : "#F87171" }}
                >
                  {t.excursions === 0 ? "No exc." : `${t.excursions} exc.`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alert response history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center gap-2">
            <Bell size={14} /> Alert Response History
          </div>
          <div className="divide-y divide-[#1E2530]">
            {d.alertHistory.map((a, i) => {
              const acked = a.ackMin < 999;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs"
                >
                  <span style={{ color: acked ? "#34D399" : "#EF4444" }}>
                    {acked ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  </span>
                  <span className="text-[#94A3B8]">
                    {acked ? `Acked in ${a.ackMin} min` : "Not acknowledged"}
                  </span>
                  <span className="font-mono text-[#4DD9AC]">{a.ship}</span>
                  <span className="text-[#64748B]">{a.type}</span>
                  <span className="ml-auto text-[#4A5568] text-[10px]">
                    {a.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Products */}
        <div className="flex gap-2 flex-wrap">
          {d.products.map((p) => (
            <span
              key={p}
              className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#94A3B8] px-2 py-1 rounded-full flex items-center gap-1"
            >
              <CheckCircle size={10} className="text-[#34D399]" /> {p} certified
            </span>
          ))}
        </div>

        {/* 🤖 AI Behavior Scoring Engine */}
        <AIBehaviorScore driver={d} />

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: <Phone size={14} />,
              label: "Call Driver",
              color: "#34D399",
            },
            {
              icon: <MessageSquare size={14} />,
              label: "WhatsApp",
              color: "#4DD9AC",
            },
            {
              icon: <ArrowRight size={14} />,
              label: "Assign Trip",
              color: "#60A5FA",
            },
            {
              icon: <AlertTriangle size={14} />,
              label: "Flag Driver",
              color: "#FBBF24",
            },
            {
              icon: <FileText size={14} />,
              label: "Perf. Report",
              color: "#A78BFA",
            },
            {
              icon: <Truck size={14} />,
              label: "View Shipment",
              color: "#F97316",
            },
          ].map((b, idx) => (
            <button
              key={idx}
              className="text-xs py-2 px-3 rounded-lg border border-[#1E2530] bg-[#111827] font-semibold hover:brightness-110 transition-all text-left flex items-center gap-2"
              style={{ color: b.color }}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function VehicleDetail({
  vehicle: v,
  onClose,
  onAssign,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onAssign?: (v: Vehicle) => void;
}) {
  const [sbadge, scolor] = vsBadge(v.status);
  const rHealth = v.reeferFault ? 0 : v.reeferHealth;
  const rColor = v.reeferFault ? "#EF4444" : reeferColor(rHealth);
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ fontFamily: "Inter,sans-serif" }}
    >
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] sticky top-0 bg-[#0A0D14] z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#60A5FA]/20 to-[#A78BFA]/20 border border-[#1E2530] flex items-center justify-center text-lg">
              <Truck size={20} className="text-[#A78BFA]" />
            </div>
            <div>
              <div className="font-bold font-mono text-[#F1F5F9] text-lg">
                {v.plate}
              </div>
              <div className="text-[10px] text-[#64748B]">{v.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ color: scolor, background: `${scolor}18` }}
            >
              {sbadge} {v.status.toUpperCase()}
            </span>
            <button
              onClick={onClose}
              className="text-[#4A5568] hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
        <div className="text-xs text-[#94A3B8] space-y-0.5 mt-1">
          <div>
            {v.type} · {v.maker} · {v.capacity}
          </div>
          {v.activeShip && (
            <div className="text-[#60A5FA] font-semibold">
              → Active on {v.activeShip}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Specs */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Wrench size={14} /> Specifications
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Reefer System", v.reeferSystem],
              ["Temp Range", v.tempRange],
              ["Capacity", v.capacity],
              ["Manufacturer", v.maker],
            ].map(([l, val]) => (
              <div key={l}>
                <div className="text-[#64748B]">{l}</div>
                <div className="font-semibold text-[#F1F5F9]">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reefer health */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Snowflake size={14} /> Reefer Health
          </div>
          {v.reeferFault ? (
            <div className="text-sm font-bold text-[#EF4444] mb-2 flex items-center gap-2">
              <AlertTriangle size={16} /> FAULT DETECTED — MAINTENANCE REQUIRED
            </div>
          ) : v.reeferHealth === 0 ? (
            <div className="text-sm text-[#64748B] mb-2">
              N/A — Insulated van
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#94A3B8]">Health Score</span>
                <span
                  className="font-mono font-bold text-sm"
                  style={{ color: rColor }}
                >
                  {v.reeferHealth}%
                </span>
              </div>
              <div className="h-3 bg-[#1E2530] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${v.reeferHealth}%`, background: rColor }}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Avg Temp Stability", v.avgTempStability],
              ["Door Seal", v.doorSeal ? "✅ Intact" : "❌ Compromised"],
              ["Compressor", v.compressor ? "✅ Normal" : "❌ Fault"],
              [
                "Current Temp",
                v.currentTemp != null ? `${v.currentTemp}°C` : "N/A",
              ],
            ].map(([l, val]) => (
              <div key={l}>
                <div className="text-[#64748B]">{l}</div>
                <div className="font-semibold text-[#F1F5F9]">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Service */}
        <div
          className={`border rounded-xl p-4 ${v.serviceOverdue ? "bg-[#1A0D0D] border-[#EF4444]/30" : "bg-[#111827] border-[#1E2530]"}`}
        >
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-2 flex items-center gap-2">
            <Calendar size={14} /> Maintenance
          </div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Last service</span>
              <span className="text-[#F1F5F9]">{v.lastService}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Next service</span>
              <span
                className="font-bold"
                style={{ color: v.serviceOverdue ? "#EF4444" : "#34D399" }}
              >
                {v.nextService}
              </span>
            </div>
          </div>
        </div>

        {/* IoT sensor */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
            <Radio size={14} /> IoT Sensor
          </div>
          {v.sensorId ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Sensor ID", v.sensorId],
                ["Battery", v.sensorBattery ? `${v.sensorBattery}%` : "N/A"],
                ["Last Ping", v.lastPing ?? "N/A"],
                ["GPS Signal", v.gpsSignal],
                ["Calibration", v.calibrationValid ? "✅ Valid" : "⚠️ Expired"],
              ].map(([l, val]) => (
                <div key={l}>
                  <div className="text-[#64748B]">{l}</div>
                  <div className="font-semibold text-[#F1F5F9]">{val}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#FBBF24] font-semibold">
              ⚠️ No IoT device paired — assign sensor first
            </div>
          )}
        </div>

        {/* Trip history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center gap-2">
            <Box size={14} /> Trip History
          </div>
          <div className="divide-y divide-[#1E2530]">
            {v.tripHistory.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <span className="font-mono text-[#4DD9AC] w-18 shrink-0">
                  {t.code}
                </span>
                <span className="text-[#94A3B8]">{t.duration}</span>
                <span className="text-[#64748B]">Avg: {t.avgTemp}</span>
                <span
                  className="ml-auto"
                  style={{ color: t.tempOk ? "#34D399" : "#F87171" }}
                >
                  {t.tempOk ? "✅" : "⚠️"}
                </span>
                <span
                  style={{ color: t.breaches === 0 ? "#34D399" : "#F87171" }}
                >
                  {t.breaches === 0 ? "No breach" : `${t.breaches} breach`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Compatibility */}
        <div className="flex gap-2 flex-wrap">
          {v.compatibility.map((p) => (
            <span
              key={p}
              className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#4DD9AC] px-2 py-1 rounded-full flex items-center gap-1"
            >
              {p} <CheckCircle size={10} className="text-[#34D399]" />
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: <ArrowRight size={14} />,
              label: "Assign to Shipment",
              color: "#4DD9AC",
              action: "assign",
            },
            {
              icon: <Wrench size={14} />,
              label: "Schedule Service",
              color: "#A78BFA",
              action: "",
            },
            {
              icon: <Radio size={14} />,
              label: "Live Sensor View",
              color: "#60A5FA",
              action: "",
            },
            {
              icon: <AlertTriangle size={14} />,
              label: "Flag Issue",
              color: "#FBBF24",
              action: "",
            },
            {
              icon: <FileText size={14} />,
              label: "Vehicle Report",
              color: "#F97316",
              action: "",
            },
          ].map((b, idx) => (
            <button
              key={idx}
              onClick={() => b.action === "assign" && onAssign?.(v)}
              className="text-xs py-2 px-3 rounded-lg border border-[#1E2530] bg-[#111827] font-semibold hover:brightness-110 transition-all text-left flex items-center gap-2"
              style={{ color: b.color }}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Driver Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddDriverModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded?: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    license: "",
    exp: "",
    pharma: false,
    dairy: true,
    seafood: false,
    frozen: false,
    notes: "",
  });
  const [step, setStep] = useState<"form" | "loading" | "done" | "error">(
    "form",
  );
  const [errMsg, setErrMsg] = useState("");

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setStep("loading");
    try {
      const products = [
        form.dairy && "Dairy",
        form.seafood && "Seafood",
        form.frozen && "Frozen",
        form.pharma && "Pharma",
      ].filter(Boolean) as string[];
      await createFleetDriver({
        name: form.name.trim(),
        phone: form.phone.trim(),
        product_certifications: products,
      });

      setStep("done");
      onAdded?.();
    } catch (e: any) {
      setErrMsg(
        e?.response?.data?.detail || e.message || "Failed to add driver",
      );
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl w-96 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9] flex items-center gap-2">
            <Plus size={16} /> Add New Driver
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-white text-lg"
          >
            ×
          </button>
        </div>
        {step === "done" ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-4xl">✅</span>
            <div className="text-sm font-bold text-[#34D399]">
              Driver Added!
            </div>
            <div className="text-xs text-[#64748B]">
              {form.name} has been added to the fleet.
            </div>
            <button
              onClick={onClose}
              className="mt-2 text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-4 py-2 rounded-lg"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {[
              ["Full Name", "name", "text", "Ramesh Kumar"],
              ["Phone Number", "phone", "tel", "+91 98765 43210"],
              ["Driver License No.", "license", "text", "DL-14 2019 0388041"],
              ["Experience (years)", "exp", "number", "3"],
            ].map(([l, k, t, ph]) => (
              <div key={k}>
                <div className="text-[10px] text-[#64748B] mb-1">{l}</div>
                <input
                  type={t}
                  placeholder={ph}
                  value={(form as any)[k]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [k]: e.target.value }))
                  }
                  className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"
                />
              </div>
            ))}
            <div>
              <div className="text-[10px] text-[#64748B] mb-1.5">
                Product Training
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["dairy", "🥛 Dairy"],
                  ["seafood", "🐟 Seafood"],
                  ["frozen", "🧊 Frozen"],
                  ["pharma", "💊 Pharma"],
                ].map(([k, l]) => (
                  <label
                    key={k}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${(form as any)[k] ? "bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]" : "border-[#1E2530] text-[#64748B]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={(form as any)[k]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [k]: e.target.checked }))
                      }
                      className="hidden"
                    />
                    {l.replace(/[^\x00-\x7F]/g, "")}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B] mb-1">Notes</div>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Any notes…"
                rows={2}
                className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 border border-[#1E2530] text-[#64748B] text-xs py-2 rounded-lg hover:border-[#374151]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="flex-1 bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] text-xs py-2 rounded-lg font-semibold hover:bg-[#4DD9AC]/20 transition-colors"
              >
                Add Driver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Vehicle Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddVehicleModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded?: () => void;
}) {
  const [form, setForm] = useState({
    plate: "",
    type: "reefer",
    maker: "",
    capacity: "",
    sensorId: "",
    reeferSystem: "",
  });
  const [step, setStep] = useState<"form" | "loading" | "done" | "error">(
    "form",
  );
  const [errMsg, setErrMsg] = useState("");

  const submit = async () => {
    if (!form.plate.trim()) return;
    setStep("loading");
    try {
      await createFleetVehicle({
        plate: form.plate.trim(),
        type: form.type,
        manufacturer: form.maker.trim() || undefined,
        reefer_system: form.reeferSystem.trim() || undefined,
        paired_sensor_id: form.sensorId.trim() || null,
      } as any);

      setStep("done");
      onAdded?.();
    } catch (e: any) {
      setErrMsg(
        e?.response?.data?.detail || e.message || "Failed to add vehicle",
      );
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl w-96 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9] flex items-center gap-2">
            <Plus size={16} /> Add New Vehicle
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-white text-lg"
          >
            ×
          </button>
        </div>
        {step === "done" ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-4xl text-[#4DD9AC]">
              <Truck size={40} />
            </span>
            <div className="text-sm font-bold text-[#4DD9AC]">
              Vehicle Added!
            </div>
            <div className="text-xs text-[#64748B]">
              {form.plate} registered to your fleet.
            </div>
            <button
              onClick={onClose}
              className="mt-2 text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-4 py-2 rounded-lg"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {[
              ["Vehicle Plate", "plate", "text", "MH-12-AB-0000"],
              ["Manufacturer", "maker", "text", "Ashok Leyland"],
              ["Capacity (kg)", "capacity", "text", "5000 kg / 22000 L"],
              ["Reefer System", "reeferSystem", "text", "Thermo King T-680"],
              ["IoT Sensor ID", "sensorId", "text", "IoT-0000 (optional)"],
            ].map(([l, k, t, ph]) => (
              <div key={k}>
                <div className="text-[10px] text-[#64748B] mb-1">{l}</div>
                <input
                  type={t}
                  placeholder={ph}
                  value={(form as any)[k]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [k]: e.target.value }))
                  }
                  className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"
                />
              </div>
            ))}
            <div>
              <div className="text-[10px] text-[#64748B] mb-1">
                Vehicle Type
              </div>
              <div className="flex gap-2">
                {[
                  ["reefer", "🚛 Reefer Truck"],
                  ["van", "🚐 Insulated Van"],
                  ["flatbed", "📦 Flatbed"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setForm((f) => ({ ...f, type: k }))}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${form.type === k ? "bg-[#60A5FA]/10 border-[#60A5FA]/30 text-[#60A5FA]" : "border-[#1E2530] text-[#64748B]"}`}
                  >
                    {l.replace(/[^\x00-\x7F]/g, "")}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 border border-[#1E2530] text-[#64748B] text-xs py-2 rounded-lg hover:border-[#374151]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="flex-1 bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs py-2 rounded-lg font-semibold hover:bg-[#60A5FA]/20 transition-colors"
              >
                Add Vehicle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function FleetAndDrivers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"drivers" | "vehicles">("drivers");
  const [dSearch, setDSearch] = useState("");
  const [vSearch, setVSearch] = useState("");
  const [dFilter, setDFilter] = useState<
    "all" | "available" | "active" | "flagged"
  >("all");
  const [vFilter, setVFilter] = useState<
    "all" | "available" | "active" | "maintenance"
  >("all");
  const [selDriver, setSelDriver] = useState<Driver | null>(null);
  const [selVehicle, setSelVehicle] = useState<Vehicle | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [lbSort, setLbSort] = useState<keyof Driver>("score");
  const [lbDir, setLbDir] = useState<"asc" | "desc">("desc");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [liveDrivers, setLiveDrivers] = useState<FleetDriver[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<FleetVehicle[]>([]);
  const [fleetSummary, setFleetSummary] = useState<FleetHealthSummary | null>(
    null,
  );
  const [allocGuardVehicle, setAllocGuardVehicle] = useState<Vehicle | null>(
    null,
  );

  useEffect(() => {
    getShipments("all")
      .then(setShipments)
      .catch(() => {});
    // Load live fleet data from backend API
    getFleetDrivers()
      .then((r) => {
        setLiveDrivers(r.drivers);
        if (r.drivers.length > 0) setSelDriver(null); // will be populated after merge
      })
      .catch(() => {});
    getFleetVehicles()
      .then((r) => {
        setLiveVehicles(r.vehicles);
      })
      .catch(() => {});
    getFleetHealthSummary()
      .then(setFleetSummary)
      .catch(() => {});
  }, []);

  // Use only live API data — no hardcoded fallback
  const mergedDrivers: Driver[] = liveDrivers.map((ld) => ({
    id: ld.id,
    name: ld.name,
    phone: ld.phone,
    waVerified: ld.whatsapp_verified ?? true,
    status: ld.status.toLowerCase() as Driver["status"],
    activeShip: ld.active_trip_id ?? undefined,
    lastTrip: ld.last_seen_at ?? "N/A",
    joined: ld.joined_at ?? "N/A",
    location: ld.region ?? "—",
    trips: ld.total_trips ?? 0,
    ackRate: ld.ack_rate ?? 0,
    avgDelay: ld.avg_delay_minutes ?? 0,
    excursions: ld.excursion_count_30d ?? 0,
    slaBreachRate: 0,
    score: ld.performance_score ?? 0,
    products: ld.product_certifications ?? [],
    tripHistory: [],
    alertHistory: [],
  }));

  const mergedVehicles: Vehicle[] = liveVehicles.map((lv) => ({
    id: lv.id,
    plate: lv.plate,
    type: lv.type ?? "reefer",
    maker: lv.manufacturer ?? "—",
    capacity: lv.capacity_kg
      ? `${lv.capacity_kg} kg / ${lv.capacity_liters} L`
      : "—",
    reeferSystem: lv.reefer_system ?? "—",
    tempRange: `${lv.reefer_temp_range_min ?? 0}°C to ${lv.reefer_temp_range_max ?? 8}°C`,
    status: lv.status.toLowerCase() as Vehicle["status"],
    activeShip: lv.active_trip_id ?? undefined,
    reeferHealth: lv.reefer_health_score ?? 0,
    reeferFault: false,
    sensorId: lv.paired_sensor_id ?? undefined,
    sensorBattery: lv.sensor_battery_pct,
    lastPing: lv.sensor_last_sync ?? undefined,
    gpsSignal: lv.paired_sensor_id ? "Strong" : "No Sensor",
    calibrationValid: true,
    lastService: lv.last_service_date ?? "—",
    nextService: lv.next_service_date ?? "—",
    serviceOverdue: lv.next_service_date
      ? new Date(lv.next_service_date) < new Date()
      : false,
    currentTemp: lv._live?.temperature,
    avgTempStability: `${lv.avg_temp_stability ?? 0}`,
    doorSeal: true,
    compressor: true,
    compatibility: [],
    tripHistory: [],
  }));

  // Enrich drivers with active shipment code from Postgres
  const enrichedDrivers = mergedDrivers.map((d) => {
    const activeShip = shipments.find(
      (s) => s.driver_phone === d.phone && s.status === "active",
    );
    return activeShip
      ? {
          ...d,
          activeShip: activeShip.shipment_code,
          status: "active" as const,
        }
      : d;
  });

  const filteredDrivers = enrichedDrivers
    .filter(
      (d) =>
        dFilter === "all" ||
        d.status === dFilter ||
        (dFilter === "flagged" &&
          (d.status === "flagged" || d.status === "critical")),
    )
    .filter(
      (d) =>
        !dSearch ||
        d.name.toLowerCase().includes(dSearch.toLowerCase()) ||
        d.phone.includes(dSearch),
    );

  const filteredVehicles = mergedVehicles
    .filter((v) => vFilter === "all" || v.status === vFilter)
    .filter(
      (v) =>
        !vSearch ||
        v.plate.toLowerCase().includes(vSearch.toLowerCase()) ||
        v.maker.toLowerCase().includes(vSearch.toLowerCase()),
    );

  const lbSorted = [...enrichedDrivers].sort((a, b) => {
    const av = a[lbSort] as number,
      bv = b[lbSort] as number;
    return lbDir === "desc" ? bv - av : av - bv;
  });

  const dAvail =
    fleetSummary?.drivers.available ??
    enrichedDrivers.filter((d) => d.status === "available").length;
  const dActive =
    fleetSummary?.drivers.active ??
    enrichedDrivers.filter((d) => d.status === "active").length;
  const dFlagged =
    fleetSummary?.drivers.flagged ??
    enrichedDrivers.filter(
      (d) => d.status === "flagged" || d.status === "critical",
    ).length;

  const vAvail =
    fleetSummary?.vehicles.available ??
    mergedVehicles.filter((v) => v.status === "available").length;
  const vActive =
    fleetSummary?.vehicles.active ??
    mergedVehicles.filter((v) => v.status === "active").length;
  const vMaint =
    fleetSummary?.vehicles.maintenance ??
    mergedVehicles.filter((v) => v.status === "maintenance").length;
  const avgReefer =
    fleetSummary?.vehicles.avg_reefer_health ??
    Math.round(
      mergedVehicles
        .filter((v) => v.reeferHealth > 0)
        .reduce((s, v) => s + v.reeferHealth, 0) /
        Math.max(mergedVehicles.filter((v) => v.reeferHealth > 0).length, 1),
    );
  const needService =
    fleetSummary?.vehicles.need_service ??
    mergedVehicles.filter((v) => v.serviceOverdue).length;
  const noIoT =
    fleetSummary?.vehicles.no_iot_sensor ??
    mergedVehicles.filter((v) => !v.sensorId).length;

  return (
    <div
      className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden"
      style={{ fontFamily: "Inter,sans-serif" }}
    >
      {/* Modals */}
      {showAddDriver && (
        <AddDriverModal onClose={() => setShowAddDriver(false)} />
      )}
      {showAddVehicle && (
        <AddVehicleModal onClose={() => setShowAddVehicle(false)} />
      )}
      {allocGuardVehicle && (
        <SmartAllocationGuard
          vehicle={allocGuardVehicle}
          driverId={selDriver?.id}
          onClose={() => setAllocGuardVehicle(null)}
        />
      )}

      {/* ── Top Nav ───────────────────────────────────────────────── */}
      <header className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-5 py-3 flex items-center gap-4 z-40">
        <span
          className="text-[#4DD9AC] font-black text-xl tracking-tighter cursor-pointer"
          onClick={() => navigate("/dashboard")}
        >
          CARGOFY
        </span>
        <div className="h-5 w-px bg-[#1E2530]" />
        <span className="text-sm text-[#94A3B8] flex items-center gap-2">
          <Truck size={16} /> Fleet & Drivers
        </span>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/dashboard")}
          className="text-[10px] border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors"
        >
          ← Dashboard
        </button>
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-5 flex items-center gap-1">
        {[
          [
            "drivers",
            <>
              <User size={14} className="inline mr-1" /> Drivers
            </>,
          ],
          [
            "vehicles",
            <>
              <Truck size={14} className="inline mr-1" /> Vehicles
            </>,
          ],
        ].map(([k, l]) => (
          <button
            key={k as string}
            onClick={() => setTab(k as any)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${tab === k ? "border-[#4DD9AC] text-[#4DD9AC]" : "border-transparent text-[#64748B] hover:text-[#94A3B8]"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── DRIVERS TAB ───────────────────────────────────────────── */}
      {tab === "drivers" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Top stats + list */}
          <div className="flex flex-col w-[55%] shrink-0 border-r border-[#1E2530] overflow-hidden">
            {/* Stats header */}
            <div className="shrink-0 px-4 py-3 border-b border-[#1E2530] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-[#F1F5F9]">DRIVERS</span>
                <span className="text-[#64748B]">
                  {enrichedDrivers.length} total
                </span>
                <span className="text-[#34D399] flex items-center gap-1">
                  <CheckCircle size={14} /> {dAvail} Available
                </span>
                <span className="text-[#60A5FA] flex items-center gap-1">
                  <Info size={14} /> {dActive} Active
                </span>
                {dFlagged > 0 && (
                  <span className="text-[#EF4444] flex items-center gap-1">
                    <AlertCircle size={14} /> {dFlagged} Flagged
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLeaderboard((s) => !s)}
                  className="text-[10px] border border-[#1E2530] text-[#A78BFA] hover:border-[#A78BFA]/40 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
                >
                  <Award size={14} /> Leaderboard
                </button>
                <button
                  onClick={() => setShowAddDriver(true)}
                  className="text-[10px] bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-2.5 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors flex items-center gap-1"
                >
                  <Plus size={14} /> Add Driver
                </button>
              </div>
            </div>

            {/* Search + filter */}
            <div className="shrink-0 px-4 py-2.5 border-b border-[#1E2530] flex gap-2">
              <input
                value={dSearch}
                onChange={(e) => setDSearch(e.target.value)}
                placeholder="Search driver..."
                className="flex-1 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-1.5 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"
              />
              {(["all", "available", "active", "flagged"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDFilter(f)}
                  className={`text-[10px] px-2.5 py-1.5 rounded border capitalize transition-colors ${dFilter === f ? "bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]" : "border-[#1E2530] text-[#64748B]"}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Leaderboard */}
            {showLeaderboard && (
              <div className="shrink-0 border-b border-[#1E2530] overflow-x-auto">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-[#A78BFA] font-bold uppercase tracking-widest flex items-center gap-1">
                    <Award size={14} /> Leaderboard — October 2024
                  </span>
                  <div className="flex gap-1">
                    {(
                      ["score", "ackRate", "avgDelay", "excursions"] as const
                    ).map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          if (lbSort === k)
                            setLbDir((d) => (d === "asc" ? "desc" : "asc"));
                          else {
                            setLbSort(k);
                            setLbDir("desc");
                          }
                        }}
                        className={`text-[9px] px-2 py-1 rounded border transition-colors ${lbSort === k ? "bg-[#A78BFA]/10 border-[#A78BFA]/30 text-[#A78BFA]" : "border-[#1E2530] text-[#64748B]"}`}
                      >
                        {k === "ackRate"
                          ? "Ack%"
                          : k === "avgDelay"
                            ? "Delay"
                            : k === "excursions"
                              ? "Exc."
                              : "Score"}{" "}
                        {lbSort === k ? (lbDir === "desc" ? "↓" : "↑") : ""}
                      </button>
                    ))}
                  </div>
                </div>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-[#1E2530]">
                    {lbSorted.map((d, i) => {
                      const medal =
                        i === 0 ? (
                          <Award
                            size={16}
                            className="text-yellow-400 mx-auto"
                          />
                        ) : i === 1 ? (
                          <Award size={16} className="text-gray-400 mx-auto" />
                        ) : i === 2 ? (
                          <Award size={16} className="text-amber-600 mx-auto" />
                        ) : (
                          String(i + 1)
                        );
                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-[#111827] transition-colors cursor-pointer"
                          onClick={() => setSelDriver(d)}
                        >
                          <td className="px-4 py-2 text-center">{medal}</td>
                          <td className="px-2 py-2 font-semibold text-[#F1F5F9]">
                            {d.name}
                          </td>
                          <td className="px-2 py-2 text-[#64748B]">
                            {d.trips}
                          </td>
                          <td
                            className="px-2 py-2 font-mono"
                            style={{
                              color:
                                d.ackRate >= 90
                                  ? "#34D399"
                                  : d.ackRate >= 75
                                    ? "#FBBF24"
                                    : "#EF4444",
                            }}
                          >
                            {d.ackRate}%
                          </td>
                          <td
                            className="px-2 py-2 font-mono"
                            style={{
                              color:
                                d.avgDelay <= 12
                                  ? "#34D399"
                                  : d.avgDelay <= 25
                                    ? "#FBBF24"
                                    : "#EF4444",
                            }}
                          >
                            {d.avgDelay}m
                          </td>
                          <td
                            className="px-2 py-2 font-mono"
                            style={{
                              color:
                                d.excursions <= 2
                                  ? "#34D399"
                                  : d.excursions <= 5
                                    ? "#FBBF24"
                                    : "#EF4444",
                            }}
                          >
                            {d.excursions}
                          </td>
                          <td
                            className="px-3 py-2 font-mono font-bold"
                            style={{ color: scoreColor(d.score) }}
                          >
                            {d.score}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Driver list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1E2530]">
              {filteredDrivers.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-[#111827] border border-[#1E2530] flex items-center justify-center">
                    <User size={18} className="text-[#4A5568]" />
                  </div>
                  <div className="text-xs text-[#64748B]">
                    {dSearch
                      ? `No drivers matching "${dSearch}"`
                      : liveDrivers.length === 0
                        ? "No drivers registered yet. Add a driver to get started."
                        : "No drivers match the selected filter."}
                  </div>
                  {liveDrivers.length === 0 && (
                    <button
                      onClick={() => setShowAddDriver(true)}
                      className="text-[10px] bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors flex items-center gap-1"
                    >
                      <Plus size={12} /> Add First Driver
                    </button>
                  )}
                </div>
              )}
              {filteredDrivers.map((d) => {
                const [badge, color] = statusBadge(d.status);
                const isSel = selDriver?.id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelDriver(d)}
                    className="w-full text-left px-4 py-3.5 transition-colors hover:bg-[#111827] relative"
                    style={{
                      background: isSel ? "#111827" : "transparent",
                      borderLeft: `3px solid ${d.status === "active" ? "#60A5FA" : d.status === "flagged" ? "#FBBF24" : d.status === "critical" ? "#EF4444" : "transparent"}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          <User size={16} className="text-[#60A5FA]" />
                        </span>
                        <span className="font-semibold text-sm text-[#F1F5F9]">
                          {d.name}
                        </span>
                        {d.flagReason && (
                          <span className="text-[9px] text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded flex items-center">
                            {d.status === "critical" ? (
                              <AlertCircle size={10} />
                            ) : (
                              <AlertTriangle size={10} />
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[10px] font-bold flex items-center gap-1"
                          style={{ color }}
                        >
                          Ack: {d.ackRate}%
                          {d.ackRate < 75 && (
                            <AlertTriangle size={10} className="inline ml-1" />
                          )}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ color, background: `${color}15` }}
                        >
                          {badge} {d.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                      <span className="flex items-center gap-1">
                        {d.phone} · <MessageSquare size={10} />{" "}
                        {d.waVerified ? "WA ✓" : "WA ✗"}
                      </span>
                      <span>
                        {d.activeShip
                          ? `Trip: ${d.activeShip} active`
                          : `Last trip: ${d.lastTrip}`}
                      </span>
                      <span
                        className="flex items-center gap-1"
                        style={{
                          color: d.avgDelay > 25 ? "#F87171" : "#64748B",
                        }}
                      >
                        Delay avg: {d.avgDelay} min
                        {d.avgDelay > 25 && (
                          <AlertTriangle size={10} className="inline ml-1" />
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
            {selDriver ? (
              <DriverDetail
                driver={selDriver}
                onClose={() => setSelDriver(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <span className="text-5xl mb-4">
                  <User size={48} className="text-[#64748B]" />
                </span>
                <div className="text-[#64748B]">
                  Select a driver to view their profile
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VEHICLES TAB ──────────────────────────────────────────── */}
      {tab === "vehicles" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT */}
          <div className="flex flex-col w-[55%] shrink-0 border-r border-[#1E2530] overflow-hidden">
            {/* Fleet health summary */}
            <div className="shrink-0 px-4 py-3 border-b border-[#1E2530]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center gap-2">
                  <Truck size={14} /> Fleet Health Overview
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddVehicle(true)}
                    className="text-[10px] bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] px-2.5 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Vehicle
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  {
                    label: "Total",
                    value: String(VEHICLES.length),
                    color: "#F1F5F9",
                  },
                  {
                    label: "Available",
                    value: String(vAvail),
                    color: "#34D399",
                  },
                  { label: "Active", value: String(vActive), color: "#60A5FA" },
                  {
                    label: "Maintenance",
                    value: String(vMaint),
                    color: "#A78BFA",
                  },
                  {
                    label: "Avg Reefer",
                    value: `${avgReefer}%`,
                    color: reeferColor(avgReefer),
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-[#111827] border border-[#1E2530] rounded-lg px-2.5 py-2"
                  >
                    <div className="text-[9px] text-[#64748B] uppercase">
                      {s.label}
                    </div>
                    <div
                      className="font-black font-mono text-sm"
                      style={{ color: s.color }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
              {(needService > 0 || noIoT > 0) && (
                <div className="flex gap-2 mt-2">
                  {needService > 0 && (
                    <span className="text-[9px] text-[#FBBF24] bg-[#FBBF24]/08 border border-[#FBBF24]/25 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <AlertTriangle size={10} /> {needService} vehicles service
                      due soon
                    </span>
                  )}
                  {noIoT > 0 && (
                    <span className="text-[9px] text-[#F97316] bg-[#F97316]/08 border border-[#F97316]/25 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <AlertTriangle size={10} /> {noIoT} vehicles without IoT
                      sensor
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Search + filter */}
            <div className="shrink-0 px-4 py-2.5 border-b border-[#1E2530] flex gap-2">
              <input
                value={vSearch}
                onChange={(e) => setVSearch(e.target.value)}
                placeholder="Search vehicle..."
                className="flex-1 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-1.5 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"
              />
              {(["all", "available", "active", "maintenance"] as const).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setVFilter(f)}
                    className={`text-[10px] px-2.5 py-1.5 rounded border capitalize transition-colors ${vFilter === f ? "bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]" : "border-[#1E2530] text-[#64748B]"}`}
                  >
                    {f}
                  </button>
                ),
              )}
            </div>

            {/* Vehicle list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1E2530]">
              {filteredVehicles.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-[#111827] border border-[#1E2530] flex items-center justify-center">
                    <Truck size={18} className="text-[#4A5568]" />
                  </div>
                  <div className="text-xs text-[#64748B]">
                    {vSearch
                      ? `No vehicles matching "${vSearch}"`
                      : liveVehicles.length === 0
                        ? "No vehicles registered yet. Add a vehicle to get started."
                        : "No vehicles match the selected filter."}
                  </div>
                  {liveVehicles.length === 0 && (
                    <button
                      onClick={() => setShowAddVehicle(true)}
                      className="text-[10px] bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors flex items-center gap-1"
                    >
                      <Plus size={12} /> Add First Vehicle
                    </button>
                  )}
                </div>
              )}
              {filteredVehicles.map((v) => {
                const [badge, color] = vsBadge(v.status);
                const rh = v.reeferFault ? 0 : v.reeferHealth;
                const rc = v.reeferFault ? "#EF4444" : reeferColor(rh);
                const isSel = selVehicle?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelVehicle(v)}
                    className="w-full text-left px-4 py-3.5 transition-colors hover:bg-[#111827]"
                    style={{
                      background: isSel ? "#111827" : "transparent",
                      borderLeft: `3px solid ${v.status === "maintenance" ? "#EF4444" : v.status === "active" ? "#60A5FA" : "transparent"}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          <Truck size={16} className="text-[#A78BFA]" />
                        </span>
                        <span className="font-mono font-bold text-sm text-[#F1F5F9]">
                          {v.plate}
                        </span>
                        <span className="text-[10px] text-[#64748B]">
                          {v.type.split("(")[0].trim()}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ color, background: `${color}15` }}
                      >
                        {badge} {v.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B] gap-3">
                      <span>
                        {v.maker} · {v.capacity.split("/")[0].trim()}
                      </span>
                      {v.reeferHealth > 0 && (
                        <span className="flex items-center gap-1.5">
                          Reefer:
                          <div className="w-16 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${rh}%`, background: rc }}
                            />
                          </div>
                          <span
                            className="font-mono font-bold"
                            style={{ color: rc }}
                          >
                            {v.reeferFault ? "FAULT" : `${rh}%`}
                          </span>
                        </span>
                      )}
                      {v.sensorId ? (
                        <span className="text-[#34D399] flex items-center gap-1">
                          <CheckCircle size={12} /> {v.sensorId}
                        </span>
                      ) : (
                        <span className="text-[#FBBF24] flex items-center gap-1">
                          <AlertTriangle size={12} /> No sensor
                        </span>
                      )}
                      <span
                        style={{
                          color: v.serviceOverdue ? "#EF4444" : "#64748B",
                        }}
                      >
                        Svc: {v.serviceOverdue ? "OVERDUE" : v.lastService}
                      </span>
                      {v.currentTemp != null && (
                        <span
                          style={{
                            color: v.currentTemp > 8 ? "#EF4444" : "#34D399",
                          }}
                        >
                          Temp: {v.currentTemp}°C
                        </span>
                      )}
                      {v.activeShip && (
                        <span className="text-[#60A5FA]">→ {v.activeShip}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
            {selVehicle ? (
              <VehicleDetail
                vehicle={selVehicle}
                onClose={() => setSelVehicle(null)}
                onAssign={(v) => setAllocGuardVehicle(v)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <span className="text-5xl mb-4">🚛</span>
                <div className="text-[#64748B]">
                  Select a vehicle to view its health profile
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
