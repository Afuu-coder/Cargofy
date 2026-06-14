/**
 * SwarmActivityFeed — Live AI Agent Activity Ticker
 * Hackathon Upgrade for ControlTower (Page 1, Upgrade 2)
 *
 * Shows a real-time feed of what the multi-agent swarm is doing:
 * - Risk assessment agent
 * - WhatsApp negotiator
 * - Route optimizer
 * - Blockchain oracle
 */
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ChevronDown, ChevronUp, Zap, Activity } from "lucide-react";

export interface SwarmEvent {
  id: string;
  agent: string;
  action: string;
  shipment_code?: string;
  timestamp: string;
  severity: "info" | "warning" | "success" | "critical";
  icon: string;
}

const AGENT_COLORS: Record<string, string> = {
  "Risk Agent": "#F59E0B",
  "WhatsApp Bot": "#10B981",
  "Route Optimizer": "#6366F1",
  "Blockchain Oracle": "#8B5CF6",
  "Spoilage Predictor": "#EF4444",
  "Fleet Monitor": "#3B82F6",
};

const SEVERITY_COLORS = {
  info: {
    bg: "rgba(99,102,241,0.1)",
    border: "rgba(99,102,241,0.3)",
    text: "#818CF8",
  },
  warning: {
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.3)",
    text: "#FBBF24",
  },
  success: {
    bg: "rgba(16,185,129,0.1)",
    border: "rgba(16,185,129,0.3)",
    text: "#34D399",
  },
  critical: {
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
    text: "#F87171",
  },
};

// Simulated live events — in production this reads from Supabase realtime /ai_action_queue
const SIMULATED_EVENTS: Omit<SwarmEvent, "id" | "timestamp">[] = [
  {
    agent: "Risk Agent",
    action: "Computed risk score 87/100 for cargo SHP-004",
    shipment_code: "SHP-004",
    severity: "critical",
    icon: "🔴",
  },
  {
    agent: "WhatsApp Bot",
    action: "Pinged driver +91-9876-123456 for Temp Breach ACK",
    shipment_code: "SHP-007",
    severity: "warning",
    icon: "💬",
  },
  {
    agent: "Route Optimizer",
    action: "Found alternate NH-27 route — saves 22 min ETA",
    shipment_code: "SHP-004",
    severity: "success",
    icon: "🗺️",
  },
  {
    agent: "Blockchain Oracle",
    action: "SLA contract 0xA3f...c12 updated — penalty flagged",
    shipment_code: "SHP-002",
    severity: "warning",
    icon: "⛓️",
  },
  {
    agent: "Spoilage Predictor",
    action: "Milk cargo SHP-011: 94 min to spoilage threshold",
    shipment_code: "SHP-011",
    severity: "critical",
    icon: "🧪",
  },
  {
    agent: "Fleet Monitor",
    action: "Vehicle MH-12 compressor anomaly detected — flagged",
    shipment_code: "SHP-009",
    severity: "warning",
    icon: "🚛",
  },
  {
    agent: "Risk Agent",
    action: "Batch re-scored 14 shipments after weather API update",
    severity: "info",
    icon: "⚡",
  },
  {
    agent: "WhatsApp Bot",
    action: "Negotiated emergency cold storage at Meghalaya Hub",
    severity: "success",
    icon: "🤝",
  },
  {
    agent: "Route Optimizer",
    action: "Analyzing congestion on NH-37 near Jorhat...",
    severity: "info",
    icon: "📡",
  },
  {
    agent: "Blockchain Oracle",
    action: "Deployed SLA contract for SHP-017 on Sepolia testnet",
    shipment_code: "SHP-017",
    severity: "success",
    icon: "✅",
  },
];

function makeEvent(): SwarmEvent {
  const template =
    SIMULATED_EVENTS[Math.floor(Math.random() * SIMULATED_EVENTS.length)];
  return {
    ...template,
    id: Math.random().toString(36).slice(2),
    timestamp: new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

interface Props {
  maxItems?: number;
}

export function SwarmActivityFeed({ maxItems = 12 }: Props) {
  const [events, setEvents] = useState<SwarmEvent[]>(() =>
    Array.from({ length: 5 }, makeEvent),
  );
  const [collapsed, setCollapsed] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // Simulate live events arriving every 3-7 seconds
  useEffect(() => {
    const tick = () => {
      const evt = makeEvent();
      setEvents((prev) => [evt, ...prev].slice(0, maxItems));
      setNewCount((n) => n + 1);
      setTimeout(() => setNewCount((n) => Math.max(0, n - 1)), 3000);
    };
    const interval = setInterval(tick, 3000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [maxItems]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      style={{
        background: "rgba(10, 15, 30, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: "16px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(15,23,42,0.6)",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid rgba(99,102,241,0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Activity size={15} color="#818CF8" />
          </motion.div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#C7D2FE",
              letterSpacing: "0.03em",
            }}
          >
            Swarm Activity
          </span>
          {/* Live pulse */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10B981",
              }}
            />
            <span style={{ fontSize: "11px", color: "#34D399" }}>LIVE</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {newCount > 0 && (
            <motion.span
              key={newCount}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              style={{
                background: "rgba(99,102,241,0.3)",
                border: "1px solid rgba(99,102,241,0.5)",
                borderRadius: "999px",
                padding: "1px 7px",
                fontSize: "11px",
                color: "#818CF8",
              }}
            >
              +{newCount}
            </motion.span>
          )}
          {collapsed ? (
            <ChevronDown size={14} color="#64748B" />
          ) : (
            <ChevronUp size={14} color="#64748B" />
          )}
        </div>
      </div>

      {/* Feed */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            ref={feedRef}
            style={{ maxHeight: "320px", overflowY: "auto", padding: "8px 0" }}
          >
            <AnimatePresence initial={false}>
              {events.map((evt, i) => {
                const sev = SEVERITY_COLORS[evt.severity];
                const agentColor = AGENT_COLORS[evt.agent] || "#818CF8";
                return (
                  <motion.div
                    key={evt.id}
                    initial={{ opacity: 0, x: -16, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start",
                      padding: "8px 14px",
                      background:
                        i === 0 && newCount > 0 ? sev.bg : "transparent",
                      borderBottom: "1px solid rgba(30,41,59,0.5)",
                      transition: "background 0.3s",
                    }}
                  >
                    {/* Icon */}
                    <span
                      style={{ fontSize: "16px", lineHeight: 1, flexShrink: 0 }}
                    >
                      {evt.icon}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Agent + timestamp */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "2px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: agentColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          [{evt.agent}]
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            color: "rgba(100,116,139,0.7)",
                          }}
                        >
                          {evt.timestamp}
                        </span>
                      </div>

                      {/* Action text */}
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#94A3B8",
                          margin: 0,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {evt.action}
                      </p>

                      {/* Shipment badge */}
                      {evt.shipment_code && (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: "4px",
                            background: sev.bg,
                            border: `1px solid ${sev.border}`,
                            borderRadius: "5px",
                            padding: "1px 7px",
                            fontSize: "10px",
                            color: sev.text,
                          }}
                        >
                          {evt.shipment_code}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
