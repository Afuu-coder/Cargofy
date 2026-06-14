/**
 * LiveFleetMap — 2D Mapbox GL fleet map
 * Uses Mapbox GL JS with the dark-v11 style.
 * Markers glow by risk level; popups show shipment details.
 */
import React, { useEffect, useRef, useState } from "react";
import { type Shipment } from "../../lib/api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface Props {
  shipments: Shipment[];
  onShipmentClick: (id: string) => void;
  className?: string;
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: "#EF4444",
  HIGH: "#F59E0B",
  MEDIUM: "#3B82F6",
  LOW: "#10B981",
};

function getRiskColor(s: Shipment): string {
  const cat = s.current_risk?.risk_category?.toUpperCase() ?? "LOW";
  return RISK_COLORS[cat] ?? "#10B981";
}

function getRiskCategory(s: Shipment): string {
  const cat = s.current_risk?.risk_category?.toUpperCase() ?? "LOW";
  return ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(cat) ? cat : "LOW";
}

export function LiveFleetMap({
  shipments,
  onShipmentClick,
  className = "",
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const popupRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);

  // ── Load Mapbox GL JS from CDN ──────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    if (!document.getElementById("mapbox-css")) {
      const link = document.createElement("link");
      link.id = "mapbox-css";
      link.rel = "stylesheet";
      link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
      document.head.appendChild(link);
    }

    const load = () => {
      if ((window as any).mapboxgl) {
        initMap();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
      script.onload = initMap;
      script.onerror = () => setLoadErr(true);
      document.head.appendChild(script);
    };

    load();

    return () => {
      // Clean up markers
      Object.values(markersRef.current).forEach((m: any) => m.remove());
      markersRef.current = {};
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  function initMap() {
    if (!mapContainer.current || mapRef.current) return;
    const mbgl = (window as any).mapboxgl;
    if (!mbgl) return;

    mbgl.accessToken = MAPBOX_TOKEN;

    const map = new mbgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [91.5, 26.0], // Northeast India
      zoom: 5.5,
      pitch: 40,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(
      new mbgl.NavigationControl({ showCompass: true }),
      "top-right",
    );
    map.addControl(
      new mbgl.ScaleControl({ maxWidth: 100, unit: "metric" }),
      "bottom-left",
    );

    map.on("load", () => {
      // Subtle fog
      map.setFog({
        color: "rgb(4, 8, 18)",
        "high-color": "rgb(15, 30, 60)",
        "horizon-blend": 0.05,
        "space-color": "rgb(2, 4, 10)",
        "star-intensity": 0.3,
      });

      // Darken water
      if (map.getLayer("water")) {
        map.setPaintProperty("water", "fill-color", "#060E1C");
      }

      mapRef.current = map;
      setMapReady(true);
    });

    map.on("error", () => setLoadErr(true));
  }

  // ── Update markers whenever shipments or map changes ──────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mbgl = (window as any).mapboxgl;
    if (!mbgl) return;
    const map = mapRef.current;

    const currentIds = new Set(
      shipments.filter((s) => hasCoords(s)).map((s) => s.id),
    );

    // Remove stale markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    shipments.forEach((s) => {
      const lat = s.current_location?.lat ?? s.origin_lat;
      const lng = s.current_location?.lng ?? s.origin_lng;
      if (lat == null || lng == null) return;

      const color = getRiskColor(s);
      const risk = getRiskCategory(s);
      const isCrit = risk === "CRITICAL";
      const spoilMin = s.current_risk?.time_to_spoil_minutes;

      if (!markersRef.current[s.id]) {
        // Custom marker element
        const el = document.createElement("div");
        el.style.cssText = `
          width:${isCrit ? 36 : 30}px;
          height:${isCrit ? 36 : 30}px;
          background:rgba(13,17,23,0.92);
          border:2.5px solid ${color};
          border-radius:50%;
          box-shadow:0 0 ${isCrit ? 18 : 10}px ${color}88, 0 0 4px ${color}44;
          display:flex;align-items:center;justify-content:center;
          font-size:${isCrit ? 18 : 15}px;
          cursor:pointer;
          transition:transform 0.15s ease;
        `;
        el.textContent = isCrit ? "🚨" : risk === "HIGH" ? "⚠️" : "🚛";
        el.title = s.shipment_code;

        if (isCrit) {
          el.style.animation = "cesiumPulse 1.8s ease-in-out infinite";
        }

        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.25)";
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
        });

        // Popup
        const popup = new mbgl.Popup({
          offset: 20,
          closeButton: false,
          className: "cargofy-mapbox-popup",
        }).setHTML(`
          <div style="
            background:#0D1117;
            border:1px solid ${color}50;
            border-radius:12px;
            padding:12px 14px;
            font-family:'Inter',sans-serif;
            min-width:180px;
            box-shadow:0 8px 32px rgba(0,0,0,0.5);
          ">
            <div style="font-family:monospace;font-weight:700;font-size:13px;color:${color};margin-bottom:4px;">
              ${s.shipment_code}
            </div>
            <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">
              ${(s.origin ?? "").split(",")[0] || "—"} → ${(s.destination ?? "").split(",")[0] || "—"}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:10px;font-weight:700;color:${color};background:${color}18;padding:2px 7px;border-radius:20px;">
                ${risk} RISK
              </span>
              ${
                s.current_risk?.risk_score != null
                  ? `<span style="font-size:10px;color:#64748B;">Score: ${s.current_risk.risk_score.toFixed(0)}</span>`
                  : ""
              }
            </div>
            ${
              spoilMin != null
                ? `<div style="margin-top:6px;font-size:10px;color:#FBBF24;">
                   ⏱ Spoils in ${Math.floor(spoilMin / 60)}h ${spoilMin % 60}m
                 </div>`
                : ""
            }
            ${
              s.vehicle_number
                ? `<div style="margin-top:4px;font-size:10px;color:#64748B;">🚛 ${s.vehicle_number}</div>`
                : ""
            }
            <div style="margin-top:8px;border-top:1px solid #1E2530;padding-top:6px;">
              <span style="font-size:9px;color:#4A5568;">Click marker to open detail</span>
            </div>
          </div>
        `);

        const marker = new mbgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => onShipmentClick(s.id));

        markersRef.current[s.id] = marker;
      } else {
        // Update position
        markersRef.current[s.id].setLngLat([lng, lat]);
      }
    });

    // Auto-fit bounds if we have markers
    const coords = shipments
      .filter(hasCoords)
      .map((s) => [
        s.current_location?.lng ?? s.origin_lng!,
        s.current_location?.lat ?? s.origin_lat!,
      ]);

    if (coords.length > 1 && coords.length <= 30) {
      try {
        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new (window as any).mapboxgl.LngLatBounds(
            coords[0] as [number, number],
            coords[0] as [number, number],
          ),
        );
        map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1200 });
      } catch {}
    }
  }, [shipments, mapReady, onShipmentClick]);

  const shipsWithCoords = shipments.filter(hasCoords);

  // Fallback: if no Mapbox token, use Leaflet/OSM
  if (!MAPBOX_TOKEN) {
    return (
      <LeafletFallback
        shipments={shipments}
        onShipmentClick={onShipmentClick}
        className={className}
      />
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapContainer}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "300px",
          background: "#080B12",
        }}
      />

      {/* Loading */}
      {!mapReady && !loadErr && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080B12] z-10 pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-[#4DD9AC]/20 border-t-[#4DD9AC] animate-spin" />
          <div className="text-xs text-[#64748B]">Loading map…</div>
        </div>
      )}

      {/* No GPS overlay */}
      {mapReady && shipments.length > 0 && shipsWithCoords.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="bg-[#0D1117]/90 border border-[#1E2530] rounded-xl px-5 py-4 text-center backdrop-blur-sm">
            <div className="text-3xl mb-2">📍</div>
            <div className="text-sm text-[#94A3B8] font-medium">
              No GPS coordinates yet
            </div>
            <div className="text-xs text-[#4A5568] mt-1">
              Truck markers appear once IoT/GPS data arrives
            </div>
          </div>
        </div>
      )}

      {/* Error fallback */}
      {loadErr && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080B12] z-10 pointer-events-none">
          <div className="text-3xl">🗺️</div>
          <div className="text-xs text-[#F87171] font-medium">
            Map failed to load
          </div>
        </div>
      )}

      <style>{`
        .cargofy-mapbox-popup .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .cargofy-mapbox-popup .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-ctrl-attrib { display: none !important; }
        @keyframes cesiumPulse {
          0%, 100% { box-shadow: 0 0 10px #EF444488; }
          50%       { box-shadow: 0 0 24px #EF4444CC, 0 0 6px #EF444488; }
        }
      `}</style>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function hasCoords(s: Shipment): boolean {
  return !!(
    (s.current_location?.lat && s.current_location?.lng) ||
    (s.origin_lat && s.origin_lng)
  );
}

// ── OSM Leaflet Fallback (no token needed) ────────────────────────────────────
function LeafletFallback({
  shipments,
  onShipmentClick,
  className = "",
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (mapRef.current) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const init = () => {
      if ((window as any).L) {
        setupMap();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = setupMap;
      document.head.appendChild(s);
    };

    const setupMap = () => {
      if (!mapContainer.current || mapRef.current) return;
      const L = (window as any).L;
      const map = L.map(mapContainer.current, {
        center: [26, 91.5],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 },
      ).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    };

    init();
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = mapRef.current;
    shipments.forEach((s) => {
      const lat = s.current_location?.lat ?? s.origin_lat;
      const lng = s.current_location?.lng ?? s.origin_lng;
      if (!lat || !lng) return;
      const color = getRiskColor(s);
      if (!markersRef.current[s.id]) {
        const icon = L.divIcon({
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;background:rgba(13,17,23,0.92);border:2.5px solid ${color};border-radius:50%;box-shadow:0 0 10px ${color}66;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;">🚛</div>`,
        });
        markersRef.current[s.id] = L.marker([lat, lng], { icon })
          .addTo(map)
          .on("click", () => onShipmentClick(s.id));
      } else {
        markersRef.current[s.id].setLatLng([lat, lng]);
      }
    });
  }, [shipments, mapReady, onShipmentClick]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapContainer}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "300px",
          background: "#080B12",
        }}
      />
      <style>{`.leaflet-control-attribution{display:none!important}.leaflet-container{background:#080B12!important}`}</style>
    </div>
  );
}
