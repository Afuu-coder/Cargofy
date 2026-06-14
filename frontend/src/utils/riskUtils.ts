/**
 * Shared utilities for risk colors, date formatting, and number helpers
 */

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── Risk colors ────────────────────────────────────────────────────────────────

export const RISK_COLORS: Record<
  RiskCategory,
  {
    bg: string;
    text: string;
    border: string;
    hex: string;
  }
> = {
  LOW: { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", hex: "#22c55e" },
  MEDIUM: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B", hex: "#f59e0b" },
  HIGH: { bg: "#FEE2E2", text: "#991B1B", border: "#F87171", hex: "#f97316" },
  CRITICAL: {
    bg: "#FEE2E2",
    text: "#7F1D1D",
    border: "#EF4444",
    hex: "#ef4444",
  },
};

export function getRiskHex(category?: string): string {
  return RISK_COLORS[(category as RiskCategory) ?? "LOW"]?.hex ?? "#22c55e";
}

export function getRiskBg(category?: string): string {
  return RISK_COLORS[(category as RiskCategory) ?? "LOW"]?.bg ?? "#E1F5EE";
}

// ── Date / time helpers ────────────────────────────────────────────────────────

/** Format ISO string as "16 Apr, 02:45" */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format ISO string as "02:45 AM" */
export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format "Xh Ymin" from minutes */
export function formatMinutes(mins?: number): string {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** Short Indian-locale currency: 24800 → "₹24.8K" */
export function formatINR(amount?: number): string {
  if (amount == null) return "—";
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

/** Product type to emoji */
export const PRODUCT_EMOJI: Record<string, string> = {
  milk: "🥛",
  fish: "🐟",
  frozen: "❄️",
  produce: "🥦",
  pharma: "💊",
  fruits: "🍎",
  vegetables: "🥕",
  other: "📦",
};
export function getProductEmoji(type?: string): string {
  return PRODUCT_EMOJI[type ?? ""] ?? "📦";
}
