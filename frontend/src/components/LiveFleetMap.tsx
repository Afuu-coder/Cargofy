import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { type Shipment } from '../lib/api';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface Props {
  shipments: Shipment[];
  onShipmentClick: (id: string) => void;
  className?: string;
}

export function LiveFleetMap({ shipments, onShipmentClick, className = '' }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: mapboxgl.Marker }>({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [78.9629, 20.5937], // India center
      zoom: 4,
      pitch: 30,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // Add fog/atmosphere
      map.setFog({
        color: 'rgb(4, 8, 18)',
        'high-color': 'rgb(15, 30, 60)',
        'horizon-blend': 0.08,
        'space-color': 'rgb(2, 4, 10)',
        'star-intensity': 0.25,
      });

      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#0A1A2E');
      }
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      Object.values(markersRef.current).forEach(m => m.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Update markers
    const currentIds = new Set(shipments.map(s => s.id));
    
    // Remove old markers
    for (const id in markersRef.current) {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }

    // Add or update markers
    shipments.forEach(s => {
      const lat = s.origin_lat || 20.5937 + (Math.random() - 0.5) * 10;
      const lng = s.origin_lng || 78.9629 + (Math.random() - 0.5) * 10;
      
      const risk = (s.current_risk?.risk_category || 'LOW').toUpperCase();
      let color = '#34D399'; // Track
      let icon = '🚛';
      
      if (risk === 'CRITICAL') { color = '#EF4444'; icon = '🚨'; }
      else if (risk === 'HIGH') { color = '#FBBF24'; icon = '⚠️'; }
      else if (risk === 'MEDIUM') { color = '#FDE68A'; icon = '🚚'; }

      if (!markersRef.current[s.id]) {
        const el = document.createElement('div');
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.background = `rgba(13, 17, 23, 0.9)`;
        el.style.border = `2px solid ${color}`;
        el.style.borderRadius = '50%';
        el.style.boxShadow = `0 0 10px ${color}88`;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '12px';
        el.style.cursor = 'pointer';
        el.innerHTML = icon;
        el.onclick = () => onShipmentClick(s.id);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 20, className: 'axon-popup' }).setHTML(`
            <div style="background:#0D1117;color:#F1F5F9;padding:8px 12px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;border:1px solid #1E2530;">
              <div style="color:${color};font-weight:700;margin-bottom:2px;">${s.shipment_code}</div>
              <div style="color:#94A3B8;font-size:10px;">${s.origin?.split(',')[0]} → ${s.destination?.split(',')[0]}</div>
              <div style="margin-top:4px;font-size:10px;font-weight:600;color:${color}">${risk} RISK</div>
            </div>
          `))
          .addTo(map);

        markersRef.current[s.id] = marker;
      } else {
        // Update existing marker position
        markersRef.current[s.id].setLngLat([lng, lat]);
      }
    });

  }, [shipments, mapReady, onShipmentClick]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', minHeight: '300px' }} />
      <style>{`
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
