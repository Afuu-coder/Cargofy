/**
 * AxonRouteMap — Beautiful interactive Mapbox GL map
 * Shows origin → destination route with:
 *   · Dark "Axon" satellite-streets style
 *   · Animated dashed route line with pulsing glow
 *   · Custom origin (green) and destination (red) markers
 *   · Cold hub markers along the route
 *   · Animated truck dot travelling the route
 *   · Distance / duration / risk badge overlay
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

export interface RouteData {
  distance_km: number;
  duration_min: number;
  route_geometry?: GeoJSON.Geometry;
  route_risk_preview?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cold_hubs_on_route?: Array<{
    name: string;
    lat: number;
    lng: number;
    capacity_available: boolean;
    distance_from_route_km: number;
  }>;
  alternate_route?: {
    distance_km: number;
    duration_min: number;
    geometry?: GeoJSON.Geometry;
  } | null;
}

interface Props {
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  originName?: string;
  destName?: string;
  routeData?: RouteData | null;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const RISK_COLORS: Record<string, string> = {
  LOW:      '#34D399',
  MEDIUM:   '#FBBF24',
  HIGH:     '#F97316',
  CRITICAL: '#EF4444',
};

// SVG marker HTML factories
function makeMarker(color: string, icon: string, size = 36) {
  return `<div style="
    width:${size}px; height:${size}px;
    background:${color};
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    border:3px solid #fff;
    box-shadow:0 0 12px ${color}99, 0 2px 8px #00000088;
    display:flex; align-items:center; justify-content:center;
    position:relative;
    animation: markerPop 0.4s cubic-bezier(0.34,1.56,0.64,1);
  ">
    <span style="transform:rotate(45deg);font-size:${size * 0.38}px;position:absolute;">${icon}</span>
  </div>`;
}

function makeTruckMarker() {
  return `<div style="
    width:28px; height:28px;
    background:linear-gradient(135deg,#1E293B,#0F172A);
    border-radius:50%;
    border:2px solid #4DD9AC;
    box-shadow:0 0 16px #4DD9AC88;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;
  ">🚛</div>`;
}

function makeHubMarker(available: boolean) {
  const c = available ? '#4DD9AC' : '#6B7280';
  return `<div style="
    width:20px;height:20px;
    background:${c}22;
    border:2px solid ${c};
    border-radius:4px;
    display:flex;align-items:center;justify-content:center;
    font-size:10px;
    box-shadow:0 0 8px ${c}55;
  ">❄️</div>`;
}

export function AxonRouteMap({
  originLat, originLng, destLat, destLng,
  originName = 'Origin', destName = 'Destination',
  routeData, loading = false, className = '', style,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);
  const truckRef     = useRef<mapboxgl.Marker | null>(null);
  const animRef      = useRef<number>(0);
  const [mapReady, setMapReady] = useState(false);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [91.74, 26.14],   // Guwahati default
      zoom: 6,
      pitch: 25,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // ── Add fog/atmosphere
      map.setFog({
        color:           'rgb(4, 8, 18)',
        'high-color':    'rgb(15, 30, 60)',
        'horizon-blend': 0.08,
        'space-color':   'rgb(2, 4, 10)',
        'star-intensity': 0.25,
      });

      // ── Tint water dark teal
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#0A1A2E');
      }
      // ── Tint roads
      ['road-minor', 'road-street', 'road-primary', 'road-secondary-tertiary'].forEach(lyr => {
        if (map.getLayer(lyr)) {
          map.setPaintProperty(lyr, 'line-color', '#1E2A3A');
        }
      });

      // ── Add sources (empty initially)
      map.addSource('route-primary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('route-alt', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Alternate route (muted)
      map.addLayer({
        id: 'route-alt-line',
        type: 'line',
        source: 'route-alt',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color':   '#374151',
          'line-width':   3,
          'line-opacity': 0.5,
          'line-dasharray': [4, 6],
        },
      });

      // Route glow (wide, translucent)
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-primary',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color':   '#4DD9AC',
          'line-width':   16,
          'line-opacity': 0.15,
          'line-blur':    8,
        },
      });

      // Route fill (solid)
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-primary',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#4DD9AC',
          'line-width': 4,
          'line-opacity': 0.95,
        },
      });

      // Route animated dash overlay
      map.addLayer({
        id: 'route-dash',
        type: 'line',
        source: 'route-primary',
        layout: { 'line-join': 'round', 'line-cap': 'butt' },
        paint: {
          'line-color':      '#FFFFFF',
          'line-width':      2,
          'line-opacity':    0.6,
          'line-dasharray':  [0, 4, 3],
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Animated dash effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current!;
    let step = 0;
    const dashArraySeq = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
      [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5],
      [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
      [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5], [0, 4, 3],
    ];
    let last = 0;
    function animate(ts: number) {
      if (ts - last > 80) {
        step = (step + 1) % dashArraySeq.length;
        if (map.getLayer('route-dash')) {
          map.setPaintProperty('route-dash', 'line-dasharray', dashArraySeq[step]);
        }
        last = ts;
      }
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [mapReady]);

  // ── Update route when data changes ────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    truckRef.current?.remove();
    truckRef.current = null;
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    clearMarkers();

    const hasOrigin = originLat != null && originLng != null;
    const hasDest   = destLat   != null && destLng   != null;

    // Origin marker
    if (hasOrigin) {
      const el = document.createElement('div');
      el.innerHTML = makeMarker('#4DD9AC', '📍');
      const m = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([originLng!, originLat!])
        .setPopup(new mapboxgl.Popup({ offset: 30, className: 'axon-popup' })
          .setHTML(`<div style="background:#0D1117;color:#F1F5F9;padding:8px 12px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;border:1px solid #1E2530;">
            <div style="color:#4DD9AC;font-weight:700;margin-bottom:2px;">📍 Origin</div>
            <div>${originName}</div>
          </div>`))
        .addTo(map);
      markersRef.current.push(m);
    }

    // Destination marker
    if (hasDest) {
      const el = document.createElement('div');
      el.innerHTML = makeMarker('#EF4444', '🏁');
      const m = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([destLng!, destLat!])
        .setPopup(new mapboxgl.Popup({ offset: 30, className: 'axon-popup' })
          .setHTML(`<div style="background:#0D1117;color:#F1F5F9;padding:8px 12px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;border:1px solid #1E2530;">
            <div style="color:#EF4444;font-weight:700;margin-bottom:2px;">🏁 Destination</div>
            <div>${destName}</div>
          </div>`))
        .addTo(map);
      markersRef.current.push(m);
    }

    // Route geometry
    if (routeData?.route_geometry) {
      const geom = routeData.route_geometry as GeoJSON.LineString;
      (map.getSource('route-primary') as mapboxgl.GeoJSONSource)?.setData({
        type: 'Feature',
        properties: {},
        geometry: geom,
      } as GeoJSON.Feature);

      // Alternate route
      if (routeData.alternate_route?.geometry) {
        (map.getSource('route-alt') as mapboxgl.GeoJSONSource)?.setData({
          type: 'Feature',
          properties: {},
          geometry: routeData.alternate_route.geometry as GeoJSON.Geometry,
        } as GeoJSON.Feature);
      } else {
        (map.getSource('route-alt') as mapboxgl.GeoJSONSource)?.setData({
          type: 'FeatureCollection', features: [],
        });
      }

      // Fit bounds to route
      if (geom.coordinates && geom.coordinates.length > 0) {
        const bounds = geom.coordinates.reduce(
          (b, coord) => b.extend(coord as [number, number]),
          new mapboxgl.LngLatBounds(
            geom.coordinates[0] as [number, number],
            geom.coordinates[0] as [number, number],
          )
        );
        map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 1200 });
      }

      // Animated truck at midpoint
      if (geom.coordinates.length > 1) {
        const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)] as [number, number];
        const el = document.createElement('div');
        el.innerHTML = makeTruckMarker();
        const truck = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(mid)
          .addTo(map);
        truckRef.current = truck;
        markersRef.current.push(truck);
      }
    } else {
      // Clear route
      (map.getSource('route-primary') as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection', features: [],
      });
      (map.getSource('route-alt') as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection', features: [],
      });

      // Fly to midpoint between origin and dest
      if (hasOrigin && hasDest) {
        map.flyTo({
          center: [(originLng! + destLng!) / 2, (originLat! + destLat!) / 2],
          zoom: 7,
          duration: 1000,
        });
      } else if (hasOrigin) {
        map.flyTo({ center: [originLng!, originLat!], zoom: 9, duration: 800 });
      }
    }

    // Cold hub markers
    routeData?.cold_hubs_on_route?.forEach(hub => {
      const el = document.createElement('div');
      el.innerHTML = makeHubMarker(hub.capacity_available);
      const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([hub.lng, hub.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20, className: 'axon-popup' })
          .setHTML(`<div style="background:#0D1117;color:#F1F5F9;padding:8px 12px;border-radius:8px;font-size:11px;font-family:Inter,sans-serif;border:1px solid #1E2530;">
            <div style="color:#4DD9AC;font-weight:700;margin-bottom:4px;">❄️ Cold Hub</div>
            <div style="font-weight:600">${hub.name}</div>
            <div style="color:#94A3B8;margin-top:2px">${hub.distance_from_route_km} km detour</div>
            <div style="margin-top:4px;padding:2px 6px;border-radius:4px;display:inline-block;
              background:${hub.capacity_available ? '#4DD9AC22' : '#EF444422'};
              color:${hub.capacity_available ? '#4DD9AC' : '#F87171'};font-size:10px;font-weight:700">
              ${hub.capacity_available ? '● Available' : '● Full'}
            </div>
          </div>`))
        .addTo(map);
      markersRef.current.push(m);
    });

  }, [mapReady, originLat, originLng, destLat, destLng, routeData, originName, destName, clearMarkers]);

  const riskColor = RISK_COLORS[routeData?.route_risk_preview ?? 'LOW'];

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}
      style={{ background: '#080B12', border: '1px solid #1E2530', ...style }}>

      {/* Map container */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%', minHeight: '320px' }} />

      {/* Top-left: Axon badge */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        background: 'rgba(8,11,18,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid #1E2530', borderRadius: 8,
        padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: '#4DD9AC', fontWeight: 800, fontFamily: 'monospace', fontSize: 13 }}>AXON</span>
        <span style={{ color: '#374151', fontSize: 10 }}>│</span>
        <span style={{ color: '#64748B', fontSize: 10, fontFamily: 'Inter,sans-serif' }}>ROUTE INTELLIGENCE</span>
      </div>

      {/* Route stats overlay */}
      {routeData && (
        <div style={{
          position: 'absolute', bottom: 28, left: 12, right: 12, zIndex: 10,
          background: 'rgba(8,11,18,0.90)', backdropFilter: 'blur(12px)',
          border: '1px solid #1E2530', borderRadius: 12,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 0,
          fontFamily: 'Inter,sans-serif',
        }}>
          <StatPill icon="📏" label="Distance" value={`${routeData.distance_km} km`} />
          <Divider />
          <StatPill icon="⏱" label="ETA" value={`${routeData.duration_min} min`} />
          <Divider />
          <StatPill
            icon="🛡"
            label="Route Risk"
            value={routeData.route_risk_preview ?? 'LOW'}
            valueColor={riskColor}
          />
          {routeData.cold_hubs_on_route && routeData.cold_hubs_on_route.length > 0 && (
            <>
              <Divider />
              <StatPill icon="❄️" label="Cold Hubs" value={`${routeData.cold_hubs_on_route.length} nearby`} valueColor="#4DD9AC" />
            </>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(8,11,18,0.80)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, borderRadius: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid #1E2530', borderTopColor: '#4DD9AC',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#4DD9AC', fontSize: 13, fontFamily: 'Inter,sans-serif', fontWeight: 600 }}>
            Calculating route…
          </div>
          <div style={{ color: '#64748B', fontSize: 11, fontFamily: 'Inter,sans-serif' }}>
            Mapbox Directions API
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !originLat && !destLat && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 32 }}>🗺️</div>
          <div style={{ color: '#4DD9AC', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>
            Enter locations to preview route
          </div>
          <div style={{ color: '#374151', fontSize: 11, fontFamily: 'Inter,sans-serif' }}>
            Real-time Mapbox routing will appear here
          </div>
        </div>
      )}

      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes markerPop {
          0%   { transform: rotate(-45deg) scale(0); }
          80%  { transform: rotate(-45deg) scale(1.1); }
          100% { transform: rotate(-45deg) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .axon-popup .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .axon-popup .mapboxgl-popup-tip { display: none !important; }
        .mapboxgl-ctrl-attrib { display: none !important; }
      `}</style>
    </div>
  );
}

function StatPill({ icon, label, value, valueColor = '#F1F5F9' }: {
  icon: string; label: string; value: string; valueColor?: string;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontSize: 14 }}>{icon}</div>
      <div style={{ color: '#64748B', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: valueColor, fontSize: 12, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 32, background: '#1E2530', margin: '0 8px', flexShrink: 0 }} />;
}
