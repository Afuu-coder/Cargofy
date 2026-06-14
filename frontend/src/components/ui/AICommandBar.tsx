/**
 * AICommandBar — "Chat-to-Map" Generative UI Command Bar
 * Hackathon Upgrade for ControlTower (Page 1, Upgrade 1)
 *
 * - Floating glowing prompt at top of ControlTower
 * - Parses natural-language queries via /api/v1/ai/command
 * - Returns filtered shipments + map focus area
 * - Fires onResult to update parent map + metrics
 */
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, X, Loader2, Mic } from "lucide-react";

export interface CommandResult {
  intent: string;
  filters: {
    product?: string;
    region?: string;
    risk?: string;
    status?: string;
  };
  shipment_codes?: string[];
  map_focus?: { lat: number; lng: number; zoom: number };
  summary: string;
}

interface Props {
  onResult: (result: CommandResult) => void;
  onClear: () => void;
}

const EXAMPLE_QUERIES = [
  "Show me all delayed milk shipments in Assam",
  "Critical risk seafood trucks right now",
  "Shipments arriving in the next 2 hours",
  "All pharma cargo with temp breaches today",
];

// Simulated AI parse — in production this calls /api/v1/ai/command
async function parseCommand(query: string): Promise<CommandResult> {
  await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

  const q = query.toLowerCase();
  const result: CommandResult = {
    intent: "FILTER_SHIPMENTS",
    filters: {},
    summary: "",
  };

  // Product detection
  if (q.includes("milk") || q.includes("dairy"))
    result.filters.product = "dairy";
  else if (q.includes("seafood") || q.includes("fish"))
    result.filters.product = "seafood";
  else if (q.includes("pharma") || q.includes("medicine"))
    result.filters.product = "pharma";
  else if (q.includes("frozen")) result.filters.product = "frozen";
  else if (q.includes("produce") || q.includes("vegetable"))
    result.filters.product = "produce";

  // Region detection
  if (q.includes("assam")) {
    result.filters.region = "Assam";
    result.map_focus = { lat: 26.2006, lng: 92.9376, zoom: 7 };
  } else if (q.includes("mumbai")) {
    result.filters.region = "Mumbai";
    result.map_focus = { lat: 19.076, lng: 72.8777, zoom: 8 };
  } else if (q.includes("delhi")) {
    result.filters.region = "Delhi";
    result.map_focus = { lat: 28.6139, lng: 77.209, zoom: 8 };
  } else if (q.includes("guwahati")) {
    result.filters.region = "Guwahati";
    result.map_focus = { lat: 26.1445, lng: 91.7362, zoom: 9 };
  }

  // Risk detection
  if (q.includes("critical")) result.filters.risk = "CRITICAL";
  else if (q.includes("high risk") || q.includes("high-risk"))
    result.filters.risk = "HIGH";
  else if (q.includes("breach") || q.includes("breaches"))
    result.filters.risk = "HIGH";

  // Status detection
  if (q.includes("delay") || q.includes("late"))
    result.filters.status = "delayed";
  else if (q.includes("arriving") || q.includes("next 2 hours"))
    result.filters.status = "arriving_soon";

  // Build summary
  const parts: string[] = [];
  if (result.filters.product) parts.push(result.filters.product);
  if (result.filters.risk) parts.push(`${result.filters.risk} risk`);
  if (result.filters.status) parts.push(result.filters.status);
  if (result.filters.region) parts.push(`in ${result.filters.region}`);
  result.summary =
    parts.length > 0
      ? `Showing ${parts.join(", ")} shipments`
      : "Showing all matching shipments";

  return result;
}

export function AICommandBar({ onResult, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeResult, setActiveResult] = useState<CommandResult | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setShowExamples(false);
    try {
      const result = await parseCommand(query);
      setActiveResult(result);
      onResult(result);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setActiveResult(null);
    onClear();
    inputRef.current?.focus();
  };

  const handleExample = (ex: string) => {
    setQuery(ex);
    setShowExamples(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setShowExamples(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{ position: "relative", zIndex: 100 }}>
      {/* Main bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(20px)",
          border: activeResult
            ? "1.5px solid rgba(168,85,247,0.6)"
            : loading
              ? "1.5px solid rgba(99,102,241,0.8)"
              : "1.5px solid rgba(99,102,241,0.3)",
          borderRadius: "14px",
          padding: "10px 16px",
          boxShadow: loading
            ? "0 0 30px rgba(99,102,241,0.4), 0 4px 24px rgba(0,0,0,0.4)"
            : activeResult
              ? "0 0 24px rgba(168,85,247,0.3), 0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.4)",
          transition: "box-shadow 0.3s, border-color 0.3s",
        }}
      >
        {/* Icon */}
        <motion.div
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={
            loading ? { duration: 1.5, repeat: Infinity, ease: "linear" } : {}
          }
        >
          {loading ? (
            <Loader2 size={18} color="#818CF8" />
          ) : (
            <Sparkles size={18} color={activeResult ? "#A855F7" : "#818CF8"} />
          )}
        </motion.div>

        {/* Input */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value) setShowExamples(false);
          }}
          onFocus={() => !query && setShowExamples(true)}
          onBlur={() => setTimeout(() => setShowExamples(false), 200)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ask Cargofy AI… e.g. 'Show delayed milk in Assam'"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#E2E8F0",
            fontSize: "14px",
            fontFamily: "Inter, sans-serif",
            letterSpacing: "0.01em",
          }}
        />

        {/* Shortcut hint */}
        {!query && (
          <span
            style={{
              fontSize: "11px",
              color: "rgba(148,163,184,0.6)",
              whiteSpace: "nowrap",
            }}
          >
            ⌘K
          </span>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {activeResult && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleClear}
              title="Clear filter"
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "8px",
                padding: "4px 10px",
                cursor: "pointer",
                color: "#F87171",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <X size={12} /> Clear
            </motion.button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            style={{
              background:
                query.trim() && !loading
                  ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
                  : "rgba(99,102,241,0.2)",
              border: "none",
              borderRadius: "10px",
              padding: "7px 14px",
              cursor: query.trim() && !loading ? "pointer" : "not-allowed",
              color: "#fff",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s",
            }}
          >
            <Send size={13} /> Ask
          </button>
        </div>
      </motion.div>

      {/* Active result badge */}
      <AnimatePresence>
        {activeResult && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              background: "rgba(168,85,247,0.1)",
              border: "1px solid rgba(168,85,247,0.3)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "#C4B5FD",
            }}
          >
            <Sparkles size={12} />
            <span>{activeResult.summary}</span>
            {activeResult.map_focus && (
              <span
                style={{ marginLeft: "4px", color: "rgba(196,181,253,0.6)" }}
              >
                · Map focused on {activeResult.filters.region}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Examples dropdown */}
      <AnimatePresence>
        {showExamples && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "rgba(15,23,42,0.97)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                padding: "10px 14px 6px",
                fontSize: "11px",
                color: "rgba(148,163,184,0.6)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Suggested Queries
            </div>
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
                onMouseDown={() => handleExample(ex)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  color: "#CBD5E1",
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(99,102,241,0.12)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Sparkles size={12} color="#818CF8" />
                {ex}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
