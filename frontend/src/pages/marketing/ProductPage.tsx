import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  PlayCircle,
  Map,
  PlusSquare,
  MapPin,
  BrainCircuit,
  Cpu,
  MessageSquareWarning,
  Warehouse,
  LineChart,
  FileCheck,
  Truck,
  CheckCircle2,
  XCircle,
  Server,
  Shield,
  Zap,
} from "lucide-react";

const FONTS = {
  display: '"Syne", sans-serif',
  body: '"DM Sans", sans-serif',
};

const COLORS = {
  bg: "#080B12",
  surface: "#111622",
  surfaceHover: "#1A2133",
  teal: "#4DD9AC",
  red: "#FF4D4D",
  amber: "#FFB020",
  textMain: "#F8FAFC",
  textMuted: "#94A3B8",
  border: "#1E293B",
};

const MODULES = [
  {
    id: "control-tower",
    icon: Map,
    title: "Your Cold Chain. At a Glance. Right Now.",
    name: "Control Tower",
    desc: "The Control Tower is your post-login home screen. Not a dashboard of charts — a live operational command center.",
    bullets: [
      "Live shipment journey board (all active shipments by stage)",
      "Network status strip (vehicles live, critical count, loss prevented)",
      "Exception banner (only shows when something needs action)",
      "AI-recommended action queue",
      "Mini live India map with fleet positions",
      "Right-rail alert feed with 1-tap response actions",
    ],
    chips: [
      "Instant visibility across all active shipments",
      "Exception-first — critical issues surface automatically",
      "AI action queue tells you what to do next",
    ],
    color: "#4DD9AC",
  },
  {
    id: "dispatch",
    icon: PlusSquare,
    title: "Create a Shipment in Under 3 Minutes.",
    name: "Shipment Creation & Dispatch",
    desc: "Our 5-step wizard guides you through everything: product type, route, vehicle assignment, IoT setup, and thresholds. No training required.",
    bullets: [
      "Step 1: Shipment basics (product, quantity, temp band)",
      "Step 2: Origin & destination (map autocomplete + route preview)",
      "Step 3: Vehicle & driver assignment (with real-time availability)",
      "Step 4: Monitoring setup (IoT device or simulator mode)",
      "Step 5: Review, risk preview, and dispatch",
    ],
    chips: [
      "After dispatch: shipment launch screen with driver notification confirmation — not a generic success toast.",
    ],
    color: "#3B82F6",
  },
  {
    id: "tracking",
    icon: MapPin,
    title: "Journey Tracking — Not Just a Dot on a Map.",
    name: "Live Tracking",
    desc: "Cargofy tracks every shipment across 9 operational stages. At each stage, the map, ETA, and telemetry update accordingly. Like Swiggy order tracking — but for B2B cold chain.",
    bullets: [
      "Stage-aware live map with animated truck position",
      "Route health panel: progress %, ETA drift, delay analysis",
      "Driver & vehicle card with direct call/WhatsApp",
      "Playback mode: rewind any shipment's journey",
      "Multi-shipment sidebar: monitor all active shipments from one screen",
    ],
    chips: [],
    color: "#8B5CF6",
  },
  {
    id: "risk",
    icon: BrainCircuit,
    title: "Know Spoilage is Coming — Before It Arrives.",
    name: "AI Risk & Spoilage Engine",
    desc: "Cargofy calculates a real-time risk score (0–100) for every active shipment using 8+ live factors.",
    bullets: [
      "Risk score updated every 60 seconds",
      "Time-to-spoil estimate",
      "Factor-by-factor contribution breakdown",
      '"What happens if you act now vs wait" predictions',
      "Plain-English explanation: no jargon, no AI buzzwords",
    ],
    chips: [
      "Factors: Cargo temp, Ambient temp, Humidity, Delay, Reefer health, Congestion, Sensor uptime, Door events",
    ],
    color: "#F59E0B",
  },
  {
    id: "simulator",
    icon: Cpu,
    title: "Test Any Scenario — No Hardware Required.",
    name: "IoT Simulator",
    desc: "Cargofy's built-in simulator lets you model any cold chain condition: heatwave, reefer failure, humidity surge, route delay, or any combination.",
    bullets: [
      "Map route changes color instantly",
      "Risk score updates live",
      "Alert preview shows which notifications would fire",
      "Spoilage window recalculates",
      "Intervention suggestions appear",
    ],
    chips: [
      "8 presets: Normal, Mild Delay, Heatwave, Reefer Fail, Traffic, Door Open, Humidity Surge, Multi-Factor Critical",
    ],
    color: "#10B981",
  },
  {
    id: "alerts",
    icon: MessageSquareWarning,
    title: "From Breach to Response in Under 5 Minutes.",
    name: "Alerts & Escalation",
    desc: "Cargofy's alert engine triggers instantly when thresholds are exceeded. Every alert has a communication thread, escalation ladder, and SOP playbook — built in.",
    bullets: [
      "WhatsApp Business API (primary — drivers always have it)",
      "Push notification (in-app) & SMS fallback",
      "If driver doesn't acknowledge in X minutes → escalate to manager",
      "Full audit: who received, when delivered, when read, responses",
      "Templates by product: Dairy, Seafood, Pharma, Frozen SOPs",
    ],
    chips: [],
    color: "#EF4444",
  },
  {
    id: "hub",
    icon: Warehouse,
    title: "Nearest Safe Storage — When You Need It Most.",
    name: "Cold Hub Recommendations",
    desc: "When risk rises above threshold, Cargofy automatically suggests the nearest cold storage facility.",
    bullets: [
      "Distance from current truck position",
      "Estimated diversion time & capacity availability",
      "Spoilage risk reduction (% if diverted)",
      "SLA impact estimate",
      "One-tap driver navigation & hub booking integration",
    ],
    chips: [],
    color: "#06B6D4",
  },
  {
    id: "analytics",
    icon: LineChart,
    title: "Prove the Value — Every Month.",
    name: "Analytics & ROI Dashboard",
    desc: "5 analytics tabs designed for different stakeholders.",
    bullets: [
      "Overview: Loss prevented, on-time compliance, ROI",
      "Operations: Alert-to-resolution, driver ack rates, excursion heatmaps",
      "Routes: Risk score by corridor, worst-performing routes",
      "Products: Excursion frequency, risk sensitivity matrix",
      "Compliance: Per-parameter pass/fail log, export",
    ],
    chips: [],
    color: "#3B82F6",
  },
  {
    id: "compliance",
    icon: FileCheck,
    title: "Every Excursion. Every Action. Documented.",
    name: "Compliance & Audit Trail",
    desc: "Cargofy maintains a full, tamper-proof compliance log for every shipment.",
    bullets: [
      "Temperature compliance timeline",
      "Excursion start/end times and durations",
      "Alerts sent + driver response + escalation records",
      "Sensor calibration certificates & Handoff logs",
      "Proof of delivery with photo/signature",
    ],
    chips: [
      "One-click export for Customer SLAs, Regulatory audits, Insurance claims",
    ],
    color: "#10B981",
  },
  {
    id: "fleet",
    icon: Truck,
    title: "Know Your People and Vehicles — Before Dispatch.",
    name: "Fleet & Driver Management",
    desc: "Complete profiles for resources before they hit the road.",
    bullets: [
      "Driver: Alert acknowledgement rate, avg delay, excursion history",
      "Vehicle: Reefer health score (live), maintenance schedule",
      "Fleet: Available vs active vs maintenance status",
      "Vehicles with degraded reefer health flag",
      "Vehicles without paired IoT sensor flag",
    ],
    chips: [],
    color: "#8B5CF6",
  },
];

export const ProductPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToModule = (id: string) => {
    const element = document.getElementById(`module-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.textMain,
        fontFamily: FONTS.body,
        minHeight: "100vh",
      }}
    >
      {/* SECTION 1: NAV BAR (Reused from LandingPage) */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-[#080B12]/90 backdrop-blur-md border-b border-[#1E293B] shadow-lg" : "bg-transparent"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0 flex items-center">
              <Link
                to="/"
                style={{ fontFamily: "monospace" }}
                className="text-2xl font-bold tracking-widest text-white hover:text-[#4DD9AC] transition-colors"
              >
                CARGOFY
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link
                to="/product"
                className="text-white border-b-2 border-[#4DD9AC] pb-1 text-sm font-medium"
              >
                Platform
              </Link>
              <Link
                to="/solutions"
                className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
              >
                Solutions
              </Link>
              <Link
                to="/customer-stories"
                className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
              >
                Customers
              </Link>
              <Link
                to="/pricing"
                className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
              >
                Pricing
              </Link>
              <Link
                to="/about"
                className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
              >
                About
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <Link
                to="/login"
                className="text-white hover:text-[#4DD9AC] transition-colors text-sm font-medium px-3 py-2"
              >
                Login
              </Link>
              <Link
                to="/signup"
                style={{ backgroundColor: COLORS.teal }}
                className="text-[#080B12] px-5 py-2.5 rounded-md font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(77,217,172,0.3)]"
              >
                Book a Demo →
              </Link>
            </div>
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-[#94A3B8] hover:text-white"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* SECTION 1: PAGE HERO */}
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 border-b border-[#1E293B]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1
            style={{ fontFamily: FONTS.display }}
            className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight"
          >
            The Cold Chain <br />
            <span style={{ color: COLORS.teal }}>Operating System</span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-[#94A3B8] mx-auto mb-10 leading-relaxed max-w-2xl">
            Cargofy is not just a monitoring tool. It's a full operational
            platform — from shipment creation to delivery proof — built
            specifically for temperature-sensitive logistics.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => scrollToModule("control-tower")}
              className="bg-[#111622] border border-[#1E293B] text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors"
            >
              Explore the Platform
            </button>
            <Link
              to="/signup"
              style={{ backgroundColor: COLORS.teal }}
              className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.4)]"
            >
              Book a Demo →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 2: PLATFORM OVERVIEW DIAGRAM */}
      <section className="py-20" style={{ backgroundColor: "#05070A" }}>
        <div className="max-w-6xl mx-auto px-4 overflow-x-auto pb-8 hide-scrollbar">
          <div className="min-w-[800px] flex flex-col gap-12 items-center">
            {/* Top Row */}
            <div className="flex items-center gap-4 justify-between w-full">
              {[
                { id: "dispatch", title: "CREATE", desc: "Shipment wizard" },
                { id: "fleet", title: "DISPATCH", desc: "Vehicle & driver" },
                {
                  id: "tracking",
                  title: "MONITOR",
                  desc: "Live IoT + AI risk",
                },
                {
                  id: "alerts",
                  title: "INTERVENE",
                  desc: "Risk alerts + reroute",
                },
              ].map((step, i) => (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => scrollToModule(step.id)}
                    className="flex flex-col items-center p-6 border border-[#1E293B] rounded-xl bg-[#0A0D14] hover:border-[#4DD9AC] hover:-translate-y-1 transition-all flex-1 group"
                  >
                    <span className="text-[#4DD9AC] font-bold tracking-widest text-sm mb-2">
                      {step.title}
                    </span>
                    <span className="text-[#94A3B8] text-center text-sm">
                      {step.desc}
                    </span>
                  </button>
                  {i < 3 && (
                    <ArrowRight className="w-6 h-6 text-[#1E293B] flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Arrows pointing down at ends */}
            <div className="flex justify-between w-full px-16 relative">
              <ArrowRight className="w-6 h-6 text-[#1E293B] absolute left-16 top-0 rotate-90" />
              <ArrowRight className="w-6 h-6 text-[#1E293B] absolute right-16 top-0 rotate-90" />
            </div>

            {/* Bottom Row (Reversed logic conceptually, arrows point left) */}
            <div className="flex items-center gap-4 justify-between w-full">
              {[
                {
                  id: "compliance",
                  title: "DELIVER",
                  desc: "Proof of delivery",
                },
                { id: "tracking", title: "TRACK", desc: "Live map + stage" },
                { id: "analytics", title: "REPORT", desc: "Analytics + ROI" },
                { id: "compliance", title: "REVIEW", desc: "Audit & export" },
              ].map((step, i) => (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => scrollToModule(step.id)}
                    className="flex flex-col items-center p-6 border border-[#1E293B] rounded-xl bg-[#0A0D14] hover:border-[#4DD9AC] hover:-translate-y-1 transition-all flex-1 group"
                  >
                    <span className="text-[#4DD9AC] font-bold tracking-widest text-sm mb-2">
                      {step.title}
                    </span>
                    <span className="text-[#94A3B8] text-center text-sm">
                      {step.desc}
                    </span>
                  </button>
                  {i < 3 && (
                    <div className="text-[#1E293B] text-2xl font-bold flex-shrink-0">
                      ←
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: MODULE-BY-MODULE BREAKDOWN */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-32">
          {MODULES.map((mod, index) => {
            const Icon = mod.icon;
            const isEven = index % 2 === 0;

            return (
              <div
                id={`module-${mod.id}`}
                key={mod.id}
                className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-16 items-center scroll-mt-32`}
              >
                {/* Text Content */}
                <div className="lg:w-1/2">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-lg bg-[#111622] border border-[#1E293B]">
                      <Icon className="w-6 h-6" style={{ color: mod.color }} />
                    </div>
                    <h2 className="text-[#94A3B8] font-mono text-sm tracking-widest uppercase">
                      Module {index + 1}: {mod.name}
                    </h2>
                  </div>

                  <h3
                    style={{ fontFamily: FONTS.display }}
                    className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight"
                  >
                    {mod.title}
                  </h3>
                  <p className="text-xl text-[#94A3B8] mb-8 leading-relaxed">
                    {mod.desc}
                  </p>

                  <ul className="space-y-4 mb-8">
                    {mod.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-start">
                        <ArrowRight
                          className="w-5 h-5 mr-3 mt-1 flex-shrink-0"
                          style={{ color: mod.color }}
                        />
                        <span className="text-white text-lg">{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  {mod.chips.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-10">
                      {mod.chips.map((chip, i) => (
                        <div
                          key={i}
                          className="bg-[#111622] border border-[#1E293B] text-[#94A3B8] text-sm px-4 py-2 rounded-full flex items-center"
                        >
                          <Zap className="w-4 h-4 mr-2 text-[#FFB020]" />
                          {chip}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-6 border-t border-[#1E293B]">
                    <Link
                      to="/signup"
                      className="inline-flex items-center font-bold text-lg hover:opacity-80 transition-opacity"
                      style={{ color: mod.color }}
                    >
                      Book a Demo for {mod.name} →
                    </Link>
                  </div>
                </div>

                {/* Abstract UI Mockup */}
                <div className="lg:w-1/2 w-full">
                  <div className="aspect-square md:aspect-video lg:aspect-[4/3] w-full rounded-2xl border border-[#1E293B] bg-[#0A0D14] shadow-2xl relative overflow-hidden flex items-center justify-center group">
                    {/* Background glow based on module color */}
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 blur-[100px] rounded-full opacity-10 transition-opacity duration-700 group-hover:opacity-20 pointer-events-none"
                      style={{ backgroundColor: mod.color }}
                    ></div>

                    {/* Stylized Wireframe UI to represent "Screenshot" without using stock imagery */}
                    <div className="absolute inset-4 border border-[#1E293B] rounded-xl bg-[#111622] overflow-hidden flex flex-col">
                      <div className="h-10 border-b border-[#1E293B] flex items-center px-4 justify-between bg-[#080B12]">
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-[#FF4D4D]"></div>
                          <div className="w-3 h-3 rounded-full bg-[#FFB020]"></div>
                          <div className="w-3 h-3 rounded-full bg-[#4DD9AC]"></div>
                        </div>
                        <div className="text-xs font-mono text-[#94A3B8] opacity-50">
                          CARGOFY_{mod.name.toUpperCase().replace(/\s/g, "_")}
                        </div>
                      </div>

                      <div className="flex-1 p-6 relative flex flex-col gap-4">
                        {/* Abstract UI Elements based on module index */}
                        <div className="flex gap-4 mb-2">
                          <div className="h-24 w-1/3 rounded-lg border border-[#1E293B] bg-[#080B12] p-4 flex flex-col justify-between">
                            <div className="w-8 h-8 rounded-full bg-[#1E293B]"></div>
                            <div className="w-1/2 h-2 rounded bg-[#1E293B]"></div>
                          </div>
                          <div className="h-24 w-1/3 rounded-lg border border-[#1E293B] bg-[#080B12] p-4 flex flex-col justify-between">
                            <div className="w-8 h-8 rounded-full bg-[#1E293B]"></div>
                            <div className="w-3/4 h-2 rounded bg-[#1E293B]"></div>
                          </div>
                          <div className="h-24 w-1/3 rounded-lg border border-[#1E293B] bg-[#080B12] p-4 flex flex-col justify-between">
                            <div
                              className="w-8 h-8 rounded-full"
                              style={{ backgroundColor: `${mod.color}30` }}
                            ></div>
                            <div
                              className="w-2/3 h-2 rounded"
                              style={{ backgroundColor: mod.color }}
                            ></div>
                          </div>
                        </div>

                        <div className="flex-1 rounded-lg border border-[#1E293B] bg-[#080B12] relative overflow-hidden flex items-center justify-center">
                          <Icon
                            className="w-32 h-32 opacity-10 absolute"
                            style={{ color: mod.color }}
                          />

                          {/* Animated skeleton rows */}
                          <div className="w-full h-full p-6 flex flex-col gap-4 justify-center">
                            {[1, 2, 3, 4].map((row) => (
                              <div
                                key={row}
                                className="w-full h-8 flex gap-4 items-center"
                              >
                                <div className="w-8 h-8 rounded bg-[#1E293B]"></div>
                                <div className="flex-1 h-3 rounded bg-[#1E293B]"></div>
                                <div className="w-24 h-3 rounded bg-[#1E293B]"></div>
                                <div
                                  className="w-16 h-4 rounded-full"
                                  style={{
                                    backgroundColor:
                                      row === 2 ? `${mod.color}50` : "#1E293B",
                                  }}
                                ></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 4: PLATFORM COMPARISON TABLE */}
      <section
        className="py-24 border-y border-[#1E293B]"
        style={{ backgroundColor: "#05070A" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              style={{ fontFamily: FONTS.display }}
              className="text-3xl md:text-5xl font-bold text-white mb-4"
            >
              How Cargofy Compares
            </h2>
            <p className="text-xl text-[#94A3B8]">
              The only platform purpose-built for the complexities of the cold
              chain.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0A0D14]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B]">
                  <th className="p-6 text-[#94A3B8] font-medium w-2/5">
                    Feature
                  </th>
                  <th className="p-6 border-l border-[#1E293B] bg-[#111622] text-[#4DD9AC] font-bold text-center w-1/5">
                    CARGOFY
                  </th>
                  <th className="p-6 border-l border-[#1E293B] text-white font-medium text-center w-1/5">
                    Generic TMS
                  </th>
                  <th className="p-6 border-l border-[#1E293B] text-white font-medium text-center w-1/5">
                    GPS-Only Tracker
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {[
                  {
                    feature: "Cold chain specific",
                    cargofy: "yes",
                    c1: "no",
                    c2: "no",
                  },
                  {
                    feature: "Real-time IoT integration",
                    cargofy: "yes",
                    c1: "partial",
                    c2: "yes",
                  },
                  {
                    feature: "Built-in spoilage prediction",
                    cargofy: "yes",
                    c1: "no",
                    c2: "no",
                  },
                  {
                    feature: "AI risk scoring (live)",
                    cargofy: "yes",
                    c1: "no",
                    c2: "partial",
                  },
                  {
                    feature: "WhatsApp alert integration",
                    cargofy: "yes",
                    c1: "yes",
                    c2: "yes",
                  },
                  {
                    feature: "Cold hub recommendations",
                    cargofy: "yes",
                    c1: "no",
                    c2: "no",
                  },
                  {
                    feature: "Shipment stage tracking",
                    cargofy: "yes",
                    c1: "yes",
                    c2: "partial",
                  },
                  {
                    feature: "Compliance export",
                    cargofy: "yes",
                    c1: "partial",
                    c2: "yes",
                  },
                  {
                    feature: "IoT Simulator (no hardware)",
                    cargofy: "yes",
                    c1: "no",
                    c2: "no",
                  },
                  {
                    feature: "India-optimised routes",
                    cargofy: "yes",
                    c1: "partial",
                    c2: "yes",
                  },
                  {
                    feature: "Built-in SOP playbooks",
                    cargofy: "yes",
                    c1: "no",
                    c2: "no",
                  },
                ].map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-[#111622] transition-colors"
                  >
                    <td className="p-6 text-white font-medium">
                      {row.feature}
                    </td>
                    <td className="p-6 border-l border-[#1E293B] bg-[#111622] text-center">
                      <CheckCircle2 className="w-6 h-6 text-[#4DD9AC] mx-auto" />
                    </td>
                    <td className="p-6 border-l border-[#1E293B] text-center">
                      {row.c1 === "yes" ? (
                        <CheckCircle2 className="w-6 h-6 text-[#94A3B8] mx-auto opacity-50" />
                      ) : row.c1 === "partial" ? (
                        <span className="text-[#FFB020] font-bold">
                          Partial
                        </span>
                      ) : (
                        <XCircle className="w-6 h-6 text-[#FF4D4D] mx-auto opacity-50" />
                      )}
                    </td>
                    <td className="p-6 border-l border-[#1E293B] text-center">
                      {row.c2 === "yes" ? (
                        <CheckCircle2 className="w-6 h-6 text-[#94A3B8] mx-auto opacity-50" />
                      ) : row.c2 === "partial" ? (
                        <span className="text-[#FFB020] font-bold">
                          Partial
                        </span>
                      ) : (
                        <XCircle className="w-6 h-6 text-[#FF4D4D] mx-auto opacity-50" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 5: TECHNICAL SPECS (for CTOs) */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2
              style={{ fontFamily: FONTS.display }}
              className="text-3xl md:text-4xl font-bold text-white mb-4"
            >
              Built for Enterprise Scale
            </h2>
            <p className="text-xl text-[#94A3B8]">
              Technical specifications for IT & Engineering leadership.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 border border-[#1E293B] rounded-xl bg-[#111622]">
              <Server className="w-10 h-10 text-[#4DD9AC] mb-6" />
              <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider font-mono">
                Architecture
              </h3>
              <ul className="space-y-4 text-[#94A3B8]">
                <li>
                  <strong className="text-white">Cloud-native:</strong> runs on
                  Google Cloud Platform
                </li>
                <li>
                  <strong className="text-white">Real-time pipeline:</strong>{" "}
                  Pub/Sub → Dataflow → Firebase
                </li>
                <li>
                  <strong className="text-white">AI/ML:</strong> Vertex AI for
                  risk scoring & anomaly detection
                </li>
                <li>
                  <strong className="text-white">API-first:</strong> REST API +
                  Webhooks for all events
                </li>
                <li>
                  <strong className="text-white">IoT:</strong> MQTT / HTTP
                  ingestion endpoints
                </li>
                <li>
                  <strong className="text-white">Integrations:</strong> SAP,
                  Oracle, Tally, WhatsApp, Maps
                </li>
              </ul>
            </div>

            <div className="p-8 border border-[#1E293B] rounded-xl bg-[#111622]">
              <Zap className="w-10 h-10 text-[#FFB020] mb-6" />
              <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider font-mono">
                Performance
              </h3>
              <ul className="space-y-4 text-[#94A3B8]">
                <li>
                  <strong className="text-white">Ingestion latency:</strong>{" "}
                  &lt; 3 seconds
                </li>
                <li>
                  <strong className="text-white">Risk score updates:</strong>{" "}
                  every 60 seconds
                </li>
                <li>
                  <strong className="text-white">Alert delivery:</strong> &lt;
                  90 seconds from trigger
                </li>
                <li>
                  <strong className="text-white">Map updates:</strong> every 30
                  seconds
                </li>
                <li>
                  <strong className="text-white">Uptime SLA:</strong> 99.9%
                  guarantee
                </li>
              </ul>
            </div>

            <div className="p-8 border border-[#1E293B] rounded-xl bg-[#111622]">
              <Shield className="w-10 h-10 text-[#3B82F6] mb-6" />
              <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider font-mono">
                Security
              </h3>
              <ul className="space-y-4 text-[#94A3B8]">
                <li>
                  <strong className="text-white">Encryption:</strong> TLS 1.3
                  (transit) & AES-256 (rest)
                </li>
                <li>
                  <strong className="text-white">Access:</strong> Role-based
                  access control (RBAC)
                </li>
                <li>
                  <strong className="text-white">Compliance:</strong> SOC 2 Type
                  II (in process)
                </li>
                <li>
                  <strong className="text-white">Privacy:</strong> GDPR
                  compliant for EU customers
                </li>
                <li>
                  <strong className="text-white">Audit:</strong> Full immutable
                  logs for user actions
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: BOTTOM CTA */}
      <section
        className="py-32 border-t border-[#1E293B] relative overflow-hidden"
        style={{ backgroundColor: "#05070A" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#4DD9AC]/10 via-[#080B12] to-[#080B12] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <h2
            style={{ fontFamily: FONTS.display }}
            className="text-4xl md:text-6xl font-bold text-white mb-8 leading-tight"
          >
            Everything Your Cold Chain Needs. <br />
            In One Platform.
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link
              to="/signup"
              style={{ backgroundColor: COLORS.teal }}
              className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]"
            >
              Book a Demo →
            </Link>
            <Link
              to="/pricing"
              style={{ borderColor: COLORS.border }}
              className="bg-[#111622] border text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors"
            >
              View Pricing
            </Link>
            <Link
              to="/signup"
              style={{ borderColor: COLORS.border }}
              className="bg-transparent border text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#111622] transition-colors"
            >
              Book a Demo →
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER (Reused) */}
      <footer className="pt-20 pb-10 border-t border-[#1E293B] bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 md:col-span-1">
              <div
                style={{ fontFamily: "monospace" }}
                className="text-2xl font-bold tracking-widest text-white mb-6"
              >
                CARGOFY
              </div>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
                Platform
              </h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    Control Tower
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    Live Tracking
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    Risk Engine
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    IoT Simulator
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    Analytics
                  </Link>
                </li>
                <li>
                  <Link
                    to="/product"
                    className="hover:text-white transition-colors"
                  >
                    Alerts Center
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
                Solutions
              </h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li>
                  <Link
                    to="/solutions"
                    className="hover:text-white transition-colors"
                  >
                    Dairy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/solutions"
                    className="hover:text-white transition-colors"
                  >
                    Seafood
                  </Link>
                </li>
                <li>
                  <Link
                    to="/solutions"
                    className="hover:text-white transition-colors"
                  >
                    Pharma
                  </Link>
                </li>
                <li>
                  <Link
                    to="/solutions"
                    className="hover:text-white transition-colors"
                  >
                    Frozen Goods
                  </Link>
                </li>
                <li>
                  <Link
                    to="/solutions"
                    className="hover:text-white transition-colors"
                  >
                    FMCG
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
                Company
              </h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li>
                  <Link
                    to="/about"
                    className="hover:text-white transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    to="/customer-stories"
                    className="hover:text-white transition-colors"
                  >
                    Customers
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Press
                  </Link>
                </li>
                <li>
                  <Link
                    to="/about"
                    className="hover:text-white transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
                Legal
              </h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Security
                  </Link>
                </li>
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Compliance
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#1E293B] flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[#64748B] text-sm">
              © 2024 Cargofy Smart Supply Chain. All rights reserved.
              <br />
              Built in India for the world's cold chains.
            </p>
            <div className="flex gap-6 text-[#64748B]">
              <a
                href="#"
                className="hover:text-white transition-colors text-sm"
              >
                Twitter/X
              </a>
              <a
                href="#"
                className="hover:text-white transition-colors text-sm"
              >
                LinkedIn
              </a>
              <a
                href="#"
                className="hover:text-white transition-colors text-sm"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
      {/* WhatsApp Chat Widget */}
      <a
        href="https://wa.me/1234567890"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="css-i6dzq1"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
      </a>
    </div>
  );
};

export default ProductPage;
