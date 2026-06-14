/**
 * Cargofy — Global Zustand Store (TRD §1)
 * Single source of truth for all dashboard state.
 */
import { create } from "zustand";
import { type Shipment, type AnalyticsSummary, type Alert } from "./api";

interface CargoStore {
  // Data
  shipments: Shipment[];
  analytics: AnalyticsSummary | null;
  alerts: Alert[];
  loading: boolean;
  connected: boolean;

  // UI filters (persisted across page navigation)
  riskFilter: string;
  sortBy: "risk" | "spoil" | "eta";
  searchQuery: string;
  mapFilter: "all" | "critical" | "delayed";

  // Actions
  setShipments: (s: Shipment[]) => void;
  setAnalytics: (a: AnalyticsSummary) => void;
  setAlerts: (a: Alert[]) => void;
  setLoading: (v: boolean) => void;
  setConnected: (v: boolean) => void;
  setRiskFilter: (v: string) => void;
  setSortBy: (v: "risk" | "spoil" | "eta") => void;
  setSearch: (v: string) => void;
  setMapFilter: (v: "all" | "critical" | "delayed") => void;

  // Realtime merge helper
  mergeRealtimeShipment: (code: string, rt: any) => void;
}

export const useCargoStore = create<CargoStore>((set) => ({
  shipments: [],
  analytics: null,
  alerts: [],
  loading: true,
  connected: true,
  riskFilter: "ALL",
  sortBy: "risk",
  searchQuery: "",
  mapFilter: "all",

  setShipments: (s) => set({ shipments: s }),
  setAnalytics: (a) => set({ analytics: a }),
  setAlerts: (a) => set({ alerts: a }),
  setLoading: (v) => set({ loading: v }),
  setConnected: (v) => set({ connected: v }),
  setRiskFilter: (v) => set({ riskFilter: v }),
  setSortBy: (v) => set({ sortBy: v }),
  setSearch: (v) => set({ searchQuery: v }),
  setMapFilter: (v) => set({ mapFilter: v }),

  mergeRealtimeShipment: (code, rt) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.shipment_code === code
          ? {
              ...s,
              status:
                rt.stage === "IN_TRANSIT"
                  ? "active"
                  : (rt.stage?.toLowerCase() ?? s.status),
              current_risk: {
                ...s.current_risk,
                risk_score: rt.risk_score / 100,
                risk_category: rt.risk_category,
                time_to_spoil_minutes: rt.spoilage_window_min,
              },
            }
          : s,
      ),
    })),
}));
