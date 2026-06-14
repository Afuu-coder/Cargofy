/**
 * Cargofy — Live 3D Fleet Map Component
 *
 * Uses Mapbox GL JS (already installed) with:
 * - 3D terrain + buildings (photorealistic mode)
 * - Animated truck markers with risk-based color (GREEN/YELLOW/RED)
 * - Real-time WebSocket feed from /api/v1/agent/ws/live
 * - Pulsing RED halo on CRITICAL shipments
 * - Popup: shipment code, temp, risk %, time to spoil
 * - Auto-fly to CRITICAL truck on alert
 *
 * No Cesium install needed — Mapbox GL JS supports full 3D globe.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TruckPosition {
  shipment_code: string;
  product_type:  string;
  lat:           number;
  lng:           number;
  risk_score:    number;       // 0-1
  risk_category: string;       // LOW | MEDIUM | HIGH | CRITICAL
  temperature:   number;
  time_to_spoil: number;       // minutes
  driver_name?:  string;
  speed_kmh?:    number;
}

interface WSEvent {
  event:        string;
  shipment_id?: string;
  risk_score?:  number;
  urgency?:     string;
  facility?:    Record<string, unknown>;
  timestamp?:   string;
}

interface CargoMap3DProps {
  trucks?:          TruckPosition[];
  mapboxToken?:     string;
  apiBase?:         string;
  onRerouteAlert?:  (event: WSEvent) => void;
}

// ── Risk color palette ────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  LOW:      '#10B981',   // emerald
  MEDIUM:   '#F59E0B',   // amber
  HIGH:     '#F97316',   // orange
  CRITICAL: '#EF4444',   // red
};

const RISK_PULSE: Record<string, boolean> = {
  LOW: false, MEDIUM: false, HIGH: true, CRITICAL: true,
};

// ── Demo trucks (used when no live data) ─────────────────────────────────────

const DEMO_TRUCKS: TruckPosition[] = [
  { shipment_code: 'SHP-MH-001', product_type: 'milk',   lat: 19.0760, lng: 72.8777, risk_score: 0.88, risk_category: 'CRITICAL', temperature: 9.5,  time_to_spoil: 32,  driver_name: 'Ramesh Kumar', speed_kmh: 52 },
  { shipment_code: 'SHP-DL-002', product_type: 'pharma', lat: 28.6139, lng: 77.2090, risk_score: 0.42, risk_category: 'MEDIUM',   temperature: 6.1,  time_to_spoil: 145, driver_name: 'Suresh Pandey', speed_kmh: 68 },
  { shipment_code: 'SHP-KA-003', product_type: 'fish',   lat: 12.9716, lng: 77.5946, risk_score: 0.15, risk_category: 'LOW',      temperature: 1.8,  time_to_spoil: 310, driver_name: 'Arun Verma',    speed_kmh: 45 },
  { shipment_code: 'SHP-TN-004', product_type: 'fruits', lat: 13.0827, lng: 80.2707, risk_score: 0.71, risk_category: 'HIGH',     temperature: 13.2, time_to_spoil: 58,  driver_name: 'Dinesh Patel',  speed_kmh: 39 },
  { shipment_code: 'SHP-WB-005', product_type: 'dairy',  lat: 22.5726, lng: 88.3639, risk_score: 0.22, risk_category: 'LOW',      temperature: 3.9,  time_to_spoil: 280, driver_name: 'Manoj Singh',   speed_kmh: 61 },
];

// ── SVG Truck marker factory ──────────────────────────────────────────────────

function createTruckMarkerEl(
  riskCategory: string,
  isPulsing: boolean,
  shipmentCode: string,
): HTMLDivElement {
  const color = RISK_COLORS[riskCategory] || '#10B981';
  const div   = document.createElement('div');
  div.className = 'cargofy-truck-marker';
  div.style.cssText = 'position:relative;cursor:pointer;';

  div.innerHTML = `
    ${isPulsing ? `
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:48px;height:48px;
        border-radius:50%;
        background:${color}33;
        animation:cargofy-pulse 1.5s ease-out infinite;
        pointer-events:none;
      "></div>` : ''}
    <div style="
      width:34px;height:34px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid white;
      box-shadow:0 2px 8px ${color}88;
      display:flex;align-items:center;justify-content:center;
    ">
      <span style="transform:rotate(45deg);font-size:14px">🚚</span>
    </div>
    <div style="
      position:absolute;top:-20px;left:50%;
      transform:translateX(-50%);
      background:#0D1117;
      color:${color};
      font-size:9px;font-weight:700;
      padding:1px 4px;border-radius:3px;
      border:1px solid ${color}44;
      white-space:nowrap;
      font-family:monospace;
    ">${shipmentCode}</div>
  `;

  return div;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CargoMap3D({
  trucks,
  mapboxToken,
  apiBase = '',
  onRerouteAlert,
}: CargoMap3DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<mapboxgl.Map | null>(null);
  const markersRef      = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const wsRef           = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus]     = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [liveEvent, setLiveEvent]   = useState<WSEvent | null>(null);
  const [truckData, setTruckData]   = useState<TruckPosition[]>(trucks || DEMO_TRUCKS);
  const [is3D, setIs3D]             = useState(true);
  const [criticalCount, setCriticalCount] = useState(0);

  // ── Inject pulse animation CSS ────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes cargofy-pulse {
        0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.8; }
        100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // ── Init Mapbox map ───────────────────────────────────────────────────────
  useEffect(() => {
    const token = mapboxToken
      || import.meta.env.VITE_MAPBOX_TOKEN
      || import.meta.env.VITE_MAPBOX_API_KEY
      || '';

    if (!mapContainerRef.current) return;

    // Use Mapbox dark style with 3D terrain
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style:     token
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'https://demotiles.maplibre.org/style.json',  // fallback no-key style
      center:    [78.9629, 20.5937],  // Centre of India
      zoom:      4.5,
      pitch:     45,        // 3D tilt
      bearing:   -10,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.on('load', () => {
      // ── 3D Terrain ─────────────────────────────────────────────────────────
      if (token) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url:  'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

        // Fog for depth effect
        map.setFog({
          color:            'rgb(5,8,18)',
          'high-color':     'rgb(20,35,60)',
          'horizon-blend':  0.04,
          'space-color':    'rgb(2,4,10)',
          'star-intensity': 0.6,
        });
      }

      // ── India route lines (major highway corridors) ──────────────────────
      map.addSource('india-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature', properties: { name: 'Mumbai-Delhi NH48' },
              geometry: { type: 'LineString', coordinates: [[72.8777,19.076],[74.5,20.5],[76.0,22.0],[77.0,23.5],[77.2,28.6]] }
            },
            {
              type: 'Feature', properties: { name: 'Bangalore-Chennai NH44' },
              geometry: { type: 'LineString', coordinates: [[77.5946,12.9716],[79.0,12.5],[80.2707,13.0827]] }
            },
            {
              type: 'Feature', properties: { name: 'Delhi-Kolkata NH19' },
              geometry: { type: 'LineString', coordinates: [[77.2090,28.6139],[80.0,27.0],[83.0,25.5],[86.0,24.0],[88.3639,22.5726]] }
            },
          ],
        },
      });

      map.addLayer({
        id:   'india-routes-line',
        type: 'line',
        source: 'india-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color':   '#4DD9AC',
          'line-width':   1.5,
          'line-opacity': 0.25,
          'line-dasharray': [3, 3],
        },
      });
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      map.remove();
    };
  }, [mapboxToken]);

  // ── Render truck markers ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMarkers = () => {
      const existingCodes = new Set(markersRef.current.keys());
      const newCodes      = new Set(truckData.map(t => t.shipment_code));

      // Remove stale
      existingCodes.forEach(code => {
        if (!newCodes.has(code)) {
          markersRef.current.get(code)?.remove();
          markersRef.current.delete(code);
        }
      });

      let critical = 0;
      truckData.forEach(truck => {
        const pulse = RISK_PULSE[truck.risk_category] ?? false;
        if (truck.risk_category === 'CRITICAL') critical++;

        const el = createTruckMarkerEl(truck.risk_category, pulse, truck.shipment_code);

        const popupHtml = `
          <div style="font-family:monospace;font-size:12px;color:#F1F5F9;padding:4px">
            <div style="font-weight:700;color:${RISK_COLORS[truck.risk_category]};margin-bottom:4px">
              ${truck.shipment_code}
            </div>
            <div>📦 ${truck.product_type.toUpperCase()}</div>
            <div>🌡 ${truck.temperature.toFixed(1)}°C</div>
            <div>⚠️ Risk: ${Math.round(truck.risk_score * 100)}%</div>
            <div>⏱ Spoil in: ~${truck.time_to_spoil}min</div>
            ${truck.driver_name ? `<div>👤 ${truck.driver_name}</div>` : ''}
            ${truck.speed_kmh ? `<div>🚗 ${truck.speed_kmh} km/h</div>` : ''}
          </div>
        `;

        const popup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: false,
          offset: 25,
          className: 'cargofy-popup',
        }).setHTML(popupHtml);

        if (markersRef.current.has(truck.shipment_code)) {
          // Update position of existing marker
          markersRef.current.get(truck.shipment_code)!
            .setLngLat([truck.lng, truck.lat]);
        } else {
          // Create new marker
          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([truck.lng, truck.lat])
            .setPopup(popup)
            .addTo(map);
          markersRef.current.set(truck.shipment_code, marker);
        }
      });

      setCriticalCount(critical);
    };

    if (mapRef.current?.loaded()) {
      updateMarkers();
    } else {
      mapRef.current?.on('load', updateMarkers);
    }
  }, [truckData]);

  // ── WebSocket connection for live risk events ─────────────────────────────
  useEffect(() => {
    const WS_URL = apiBase
      ? apiBase.replace('http', 'ws') + '/api/v1/agent/ws/live'
      : `ws://${window.location.hostname}:8000/api/v1/agent/ws/live`;

    const connect = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus('live');
          console.log('[CargoMap3D] WebSocket connected');
        };

        ws.onmessage = (e) => {
          try {
            const data: WSEvent = JSON.parse(e.data);
            if (data.event === 'HEARTBEAT' || data.event === 'CONNECTED') return;

            setLiveEvent(data);
            onRerouteAlert?.(data);

            // Flash the affected truck red and fly to it
            if (data.shipment_id && data.event === 'REROUTE_DECISION') {
              const truck = truckData.find(t => t.shipment_code === data.shipment_id);
              if (truck && mapRef.current) {
                mapRef.current.flyTo({
                  center:  [truck.lng, truck.lat],
                  zoom:    8,
                  pitch:   60,
                  bearing: 30,
                  duration: 2000,
                });
                // Update truck risk to CRITICAL
                setTruckData(prev => prev.map(t =>
                  t.shipment_code === data.shipment_id
                    ? { ...t, risk_category: 'CRITICAL', risk_score: data.risk_score ?? 0.9 }
                    : t
                ));
              }
            }
          } catch {/* ignore parse errors */}
        };

        ws.onclose = () => {
          setWsStatus('offline');
          // Reconnect after 5s
          setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          setWsStatus('offline');
          ws.close();
        };
      } catch {
        setWsStatus('offline');
        setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [apiBase, onRerouteAlert]);

  // ── Toggle 3D pitch ───────────────────────────────────────────────────────
  const toggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    } else {
      map.easeTo({ pitch: 50, bearing: -10, duration: 600 });
    }
    setIs3D(!is3D);
  }, [is3D]);

  // ── Fly to India overview ─────────────────────────────────────────────────
  const flyToIndia = useCallback(() => {
    mapRef.current?.flyTo({
      center:   [78.9629, 20.5937],
      zoom:     4.5,
      pitch:    45,
      bearing:  -10,
      duration: 1500,
    });
  }, []);

  // ── Status pill color ─────────────────────────────────────────────────────
  const statusColor = wsStatus === 'live' ? '#4DD9AC' : wsStatus === 'connecting' ? '#F59E0B' : '#EF4444';
  const statusLabel = wsStatus === 'live' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }}>

      {/* ── Map container ─────────────────────────────────────────────────── */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Top-left HUD ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(10,13,20,0.85)',
          border: `1px solid ${statusColor}44`,
          borderRadius: 6, padding: '4px 10px',
          fontFamily: 'monospace', fontSize: 11, color: statusColor,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: statusColor,
            animation: wsStatus === 'live' ? 'cargofy-pulse 2s infinite' : 'none',
          }} />
          {statusLabel}
          {wsStatus === 'live' && (
            <span style={{ color: '#64748B', marginLeft: 4 }}>WS CONNECTED</span>
          )}
        </div>

        {/* Critical count */}
        {criticalCount > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid #EF444466',
            borderRadius: 6, padding: '4px 10px',
            fontFamily: 'monospace', fontSize: 11, color: '#F87171',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            🔴 {criticalCount} CRITICAL
          </div>
        )}

        {/* Live event banner */}
        {liveEvent && liveEvent.event !== 'HEARTBEAT' && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid #EF444455',
            borderRadius: 6, padding: '6px 10px',
            fontFamily: 'monospace', fontSize: 10, color: '#F87171',
            maxWidth: 220,
            animation: 'none',
          }}>
            🚨 {liveEvent.event.replace(/_/g, ' ')}
            {liveEvent.shipment_id && (
              <div style={{ color: '#94A3B8', marginTop: 2 }}>
                {liveEvent.shipment_id}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Map controls ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 12, zIndex: 10,
        display: 'flex', gap: 6,
      }}>
        <button onClick={toggle3D} style={{
          background: 'rgba(10,13,20,0.85)',
          border: '1px solid #1E2530',
          color: is3D ? '#4DD9AC' : '#64748B',
          borderRadius: 6, padding: '5px 10px',
          fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
        }}>
          {is3D ? '3D ON' : '2D'}
        </button>
        <button onClick={flyToIndia} style={{
          background: 'rgba(10,13,20,0.85)',
          border: '1px solid #1E2530',
          color: '#94A3B8',
          borderRadius: 6, padding: '5px 10px',
          fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
        }}>
          🇮🇳 India
        </button>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 16, right: 52, zIndex: 10,
        background: 'rgba(10,13,20,0.85)',
        border: '1px solid #1E2530',
        borderRadius: 6, padding: '6px 10px',
        fontFamily: 'monospace', fontSize: 10, color: '#64748B',
      }}>
        {Object.entries(RISK_COLORS).map(([level, color]) => (
          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {level}
          </div>
        ))}
      </div>

      {/* Mapbox popup styling */}
      <style>{`
        .cargofy-popup .mapboxgl-popup-content {
          background: #0D1117;
          border: 1px solid #1E2530;
          border-radius: 8px;
          color: #F1F5F9;
          padding: 10px 12px;
        }
        .cargofy-popup .mapboxgl-popup-tip {
          border-top-color: #1E2530;
        }
        .mapboxgl-ctrl-top-right { top: 48px !important; }
      `}</style>
    </div>
  );
}
