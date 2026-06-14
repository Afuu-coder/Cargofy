import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  getShipments, computeRisk, sendSensor,
  simulatorEmit, simulatorLoadPreset, simulatorStartPlayback, simulatorStop, simulatorPreviewImpact,
  getRoute,
  type Shipment, type RiskResult, type PreviewImpactResult,
} from '../../lib/api';
import { WhatsAppSetupModal, WhatsAppBadge } from '../../components/WhatsAppSetupModal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────
interface SimState {
  temp:     number;  // cargo temp °C
  ambient:  number;  // ambient temp °C
  humidity: number;  // %
  delay:    number;  // minutes
  reefer:   number;  // % health 0-100
  doorOpen: number;  // minutes open this trip
  battery:  number;  // %
  gpsStale: number;  // minutes since last fix
}

interface TelemetryPoint { t: number; temp: number; ambient: number; humidity: number; }
interface SavedScenario   { name: string; state: SimState; ts: number; }

const PRESETS: Record<string, { label: string; icon: string; state: SimState }> = {
  normal:       { label:'Normal Transit',    icon:'🟢', state:{ temp:4.0,  ambient:28, humidity:60, delay:0,   reefer:100, doorOpen:0, battery:95, gpsStale:0  }},
  mild_delay:   { label:'Mild Delay',        icon:'🟡', state:{ temp:4.5,  ambient:30, humidity:65, delay:20,  reefer:100, doorOpen:0, battery:90, gpsStale:0  }},
  heatwave:     { label:'Heatwave',          icon:'🔥', state:{ temp:7.2,  ambient:42, humidity:68, delay:15,  reefer:85,  doorOpen:0, battery:80, gpsStale:2  }},
  reefer_fail:  { label:'Reefer Failure',    icon:'❄️',  state:{ temp:12.0, ambient:38, humidity:72, delay:45,  reefer:20,  doorOpen:5, battery:70, gpsStale:5  }},
  traffic:      { label:'Traffic',           icon:'🚧', state:{ temp:5.8,  ambient:36, humidity:66, delay:60,  reefer:95,  doorOpen:0, battery:85, gpsStale:1  }},
  door_open:    { label:'Door Open',         icon:'🚪', state:{ temp:11.0, ambient:39, humidity:78, delay:10,  reefer:90,  doorOpen:20, battery:88, gpsStale:0 }},
  humidity_surge:{ label:'Humidity Surge',   icon:'💧', state:{ temp:5.5,  ambient:34, humidity:89, delay:5,   reefer:92,  doorOpen:3, battery:82, gpsStale:1  }},
  multi_crit:   { label:'Multi-Factor CRIT', icon:'🔴', state:{ temp:14.0, ambient:44, humidity:85, delay:90,  reefer:15,  doorOpen:30, battery:20, gpsStale:15 }},
};

const PRODUCT_ICONS: Record<string,string> = { dairy:'🥛',milk:'🥛',seafood:'🐟',fish:'🐟',produce:'🥦',frozen:'🧊',pharma:'💊',fruits:'🍎',meat:'🥩',other:'📦' };
const pIcon = (t?:string) => PRODUCT_ICONS[t?.toLowerCase()??'']??'📦';

const TEMP_BANDS: Record<string,[number,number]> = {
  dairy:[2,6],milk:[2,6],seafood:[0,4],fish:[0,4],pharma:[2,8],frozen:[-20,-15],produce:[4,10],fruits:[5,12],meat:[0,4],other:[2,8],
};
const getTempBand = (t?:string):[number,number] => TEMP_BANDS[t?.toLowerCase()??'']??[2,8];

function getRiskColor(cat?:string){ const c=cat?.toUpperCase(); return c==='CRITICAL'?'#EF4444':c==='HIGH'?'#F97316':c==='MEDIUM'?'#FBBF24':'#34D399'; }
function getRiskCat(score:number){ return score>=75?'CRITICAL':score>=50?'HIGH':score>=25?'MEDIUM':'LOW'; }

// Local risk estimator (fast, no network, mirrors backend logic roughly)
function estimateRisk(s: SimState, productType: string): { score:number; cat:string; spoilMin:number; factors: Record<string,number> } {
  const [tMin,tMax] = getTempBand(productType);
  const tempFactor = s.temp > tMax ? Math.min(30, (s.temp - tMax) * 5) : s.temp < tMin ? Math.min(10, (tMin - s.temp) * 3) : 0;
  const delayFactor = Math.min(25, s.delay * 0.35);
  const ambFactor   = s.ambient > 38 ? Math.min(15, (s.ambient - 38) * 2) : s.ambient > 32 ? Math.min(8, (s.ambient - 32) * 1.2) : 0;
  const reeferFactor = s.reefer < 50 ? Math.min(15, (50 - s.reefer) * 0.4) : s.reefer < 80 ? Math.min(5, (80 - s.reefer) * 0.2) : 0;
  const doorFactor   = s.doorOpen > 10 ? Math.min(10, s.doorOpen * 0.3) : 0;
  const humFactor    = s.humidity > 80 ? Math.min(8, (s.humidity - 80) * 0.3) : 0;
  const sensorFactor = s.battery < 30 ? 5 : s.gpsStale > 10 ? 5 : 0;
  const baseline = 13;
  const score = Math.min(100, Math.round(baseline + tempFactor + delayFactor + ambFactor + reeferFactor + doorFactor + humFactor + sensorFactor));
  const cat = getRiskCat(score);

  // Rough spoilage estimate in minutes
  const tempExcess = Math.max(0, s.temp - tMax);
  const spoilRate = tempExcess > 0 ? 1 + tempExcess * 0.4 + (100 - s.reefer) * 0.01 : 0.2;
  const spoilMin  = spoilRate > 0 ? Math.round(120 / spoilRate) : 480;

  return {
    score,
    cat,
    spoilMin: Math.min(480, spoilMin),
    factors:  { tempFactor, delayFactor, ambFactor, reeferFactor, doorFactor, humFactor, sensorFactor, baseline },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider component
// ─────────────────────────────────────────────────────────────────────────────
function Slider({
  icon, label, value, min, max, step = 1, unit, safeMin, safeMax,
  warnThresh, dangerThresh, onChange,
}: {
  icon:string; label:string; value:number; min:number; max:number; step?:number;
  unit:string; safeMin?:number; safeMax?:number; warnThresh?:number; dangerThresh?:number;
  onChange:(v:number)=>void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const isWarn    = warnThresh !== undefined && value >= warnThresh && (dangerThresh === undefined || value < dangerThresh);
  const isDanger  = dangerThresh !== undefined && value >= dangerThresh;
  const isSafe    = !isWarn && !isDanger;
  const thumbColor = isDanger ? '#EF4444' : isWarn ? '#FBBF24' : '#34D399';

  const status = isDanger ? { label:'BREACH', color:'#EF4444' }
               : isWarn   ? { label:'WARNING', color:'#FBBF24' }
               :             { label:'SAFE',    color:'#34D399' };

  // Safe band markers (as % on track)
  const safePctMin = safeMin !== undefined ? ((safeMin - min)/(max - min)*100) : null;
  const safePctMax = safeMax !== undefined ? ((safeMax - min)/(max - min)*100) : null;

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-[#CBD5E1] flex items-center gap-1.5">
          <span>{icon}</span>{label}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{color:status.color,background:`${status.color}18`}}>
            {status.label}
          </span>
          <span className="font-mono text-sm font-bold" style={{color:thumbColor}}>
            {value % 1 === 0 ? value : value.toFixed(1)}{unit}
          </span>
        </div>
      </div>
      <div className="relative h-5 flex items-center">
        {/* Track */}
        <div className="absolute inset-x-0 h-2 bg-[#1E2530] rounded-full overflow-hidden">
          {/* Fill */}
          <div className="h-full rounded-full transition-all duration-150" style={{width:`${pct}%`, background:thumbColor}}/>
          {/* Safe band overlay */}
          {safePctMin !== null && safePctMax !== null && (
            <div className="absolute top-0 h-full rounded-sm border-x-2 border-[#34D399] bg-[#34D399]/10"
              style={{left:`${safePctMin}%`, width:`${safePctMax - safePctMin}%`}}/>
          )}
        </div>
        {/* Threshold tick */}
        {safeMax !== undefined && (
          <div className="absolute top-0 bottom-0 w-px bg-[#4DD9AC]" style={{left:`${safePctMax}%`}}/>
        )}
        {/* Native range input */}
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"/>
      </div>
      <div className="flex justify-between text-[9px] text-[#374151] mt-0.5">
        <span>{min}{unit}</span>
        {safeMin !== undefined && safeMax !== undefined && (
          <span className="text-[#34D399]">Safe: {safeMin}–{safeMax}{unit}</span>
        )}
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Simulation Map
// ─────────────────────────────────────────────────────────────────────────────
function SimulatorMap({ risk, state, progress, shipment, lat, lng }: { 
  risk:{score:number;cat:string}; 
  state:SimState; 
  progress:number; 
  shipment:Shipment|null;
  lat?: number;
  lng?: number;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const routeRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    if (mapContainer.current) {
      mapContainer.current.innerHTML = ''; // Ensure container is empty before initialization
    }

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [78.9629, 20.5937],
      zoom: 4,
      pitch: 45,
      attributionControl: false,
    });
    
    mapRef.current = map;

    map.on('load', () => {
      map.setFog({ color: 'rgb(4, 8, 18)', 'high-color': 'rgb(15, 30, 60)', 'horizon-blend': 0.08 });
      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Route and Markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !shipment) return;
    const map = mapRef.current;

    // Fetch and draw route if origin/dest exist
    const olat = Number(shipment.origin_lat);
    const olng = Number(shipment.origin_lng);
    const dlat = Number(shipment.dest_lat);
    const dlng = Number(shipment.dest_lng);

    if (olat && dlat) {
      getRoute(olat, olng, dlat, dlng, shipment.shipment_code).then((data: any) => {
        if (!mapRef.current) return;
        const geom = data.route_geometry;
        if (!geom) return;
        
        if (map.getSource('route')) {
          (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geom);
        } else {
          map.addSource('route', { type: 'geojson', data: geom });
          map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 
              'line-color': '#4DD9AC', 
              'line-width': 4, 
              'line-opacity': 0.8,
              'line-dasharray': [2, 1]
            }
          });
        }
        
        // Fit map to route on first load
        if (!routeRef.current) {
          const coords = geom.coordinates;
          const bounds = coords.reduce((acc: any, coord: any) => acc.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
          map.fitBounds(bounds, { padding: 80, duration: 2000 });
          routeRef.current = geom;
        }
      }).catch(err => console.error("Route fetch failed:", err));
    }

    // Update Truck Marker
    const markerLat = lat || olat || 20.5937;
    const markerLng = lng || olng || 78.9629;

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="absolute inset-0 rounded-full bg-[#4DD9AC]/30 animate-ping"></div>
        <div class="relative w-9 h-9 bg-[#0D1117] border-2 border-[#4DD9AC] rounded-full shadow-[0_0_15px_rgba(77,217,172,0.6)] flex items-center justify-center text-lg">
          🚛
        </div>
      `;
      
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([markerLng, markerLat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([markerLng, markerLat]);
      // Optional: Smoothly center on truck if it moves too far
      // map.easeTo({ center: [markerLng, markerLat], duration: 1000 });
    }

  }, [shipment, lat, lng, mapLoaded]);

  const color = getRiskColor(risk.cat);

  return (
    <div className="relative w-full h-full bg-[#080B12]">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* HUD Overlay */}
      <div className="absolute top-4 left-4 z-10 space-y-2 pointer-events-none">
        <div className="bg-[#0D1117]/80 backdrop-blur border border-[#1E2530] px-3 py-2 rounded-lg">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-bold mb-1">Active Tracker</div>
          <div className="font-mono text-sm font-bold text-[#4DD9AC]">{shipment?.shipment_code || 'SIM-MODE'}</div>
          <div className="text-[10px] text-[#94A3B8]">{lat?.toFixed(4)}, {lng?.toFixed(4)}</div>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] text-[10px] font-bold uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse"/>
        🎮 Live Map Simulation
      </div>

      {risk.cat !== 'LOW' && (
        <div className="absolute bottom-4 right-4 px-3 py-1 rounded text-xs font-bold" style={{color, background:`${color}15`, border:`1px solid ${color}40`}}>
          {risk.cat} RISK
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Telemetry Graph
// ─────────────────────────────────────────────────────────────────────────────
function TelemetryGraph({ points, tMin, tMax }: { points: TelemetryPoint[]; tMin:number; tMax:number }) {
  if (points.length < 2) return (
    <div className="flex items-center justify-center h-full text-[#4A5568] text-xs">Move a slider to begin telemetry stream…</div>
  );
  const W=800, H=90;
  const allTemps = points.flatMap(p=>[p.temp, p.ambient]);
  const vMin = Math.min(...allTemps, tMin - 2);
  const vMax = Math.max(...allTemps, tMax + 4);
  const tx = (i:number) => (i/(points.length-1))*W;
  const ty = (v:number) => H - ((v-vMin)/(vMax-vMin))*H;

  const tempD   = points.map((p,i)=>`${i===0?'M':'L'}${tx(i)} ${ty(p.temp)}`).join(' ');
  const ambD    = points.map((p,i)=>`${i===0?'M':'L'}${tx(i)} ${ty(p.ambient)}`).join(' ');
  const safeY1  = ty(tMax), safeY2 = ty(tMin);
  const areaD   = `${tempD} L${W} ${H} L0 ${H} Z`;
  const isBreach = points[points.length-1].temp > tMax;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Safe band */}
      <rect x={0} y={safeY1} width={W} height={Math.max(0,safeY2-safeY1)} fill="rgba(52,211,153,0.06)"/>
      <line x1={0} y1={safeY1} x2={W} y2={safeY1} stroke="#34D399" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.6"/>
      {/* Breach shading */}
      {isBreach && <rect x={0} y={0} width={W} height={safeY1} fill="rgba(239,68,68,0.05)"/>}
      {/* Fill area */}
      <path d={areaD} fill="url(#tgFill)" opacity="0.15"/>
      {/* Ambient line */}
      <path d={ambD} fill="none" stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" strokeLinejoin="round"/>
      {/* Temp line */}
      <path d={tempD} fill="none" stroke={isBreach?'#EF4444':'#60A5FA'} strokeWidth="2.5" strokeLinejoin="round"
        style={{filter:`drop-shadow(0 0 4px ${isBreach?'#EF444460':'#60A5FA40'})`}}/>
      {/* Latest point dot */}
      <circle cx={tx(points.length-1)} cy={ty(points[points.length-1].temp)} r={4}
        fill={isBreach?'#EF4444':'#60A5FA'} stroke="#0D1117" strokeWidth="2"/>
      <defs>
        <linearGradient id="tgFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA"/>
          <stop offset="100%" stopColor="transparent"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation Data
// ─────────────────────────────────────────────────────────────────────────────
const SIM_ROUTES = [
  { id: 'guw_shl', name: 'Guwahati → Shillong', olat: 26.1445, olng: 91.7362, dlat: 25.5788, dlng: 91.8933, dist: '98km' },
  { id: 'shl_agt', name: 'Shillong → Agartala', olat: 25.5788, olng: 91.8933, dlat: 23.8315, dlng: 91.2868, dist: '445km' },
  { id: 'guw_jor', name: 'Guwahati → Jorhat', olat: 26.1445, olng: 91.7362, dlat: 26.7509, dlng: 94.2037, dist: '304km' },
  { id: 'sil_imp', name: 'Silchar → Imphal', olat: 24.8333, olng: 92.7789, dlat: 24.8170, dlng: 93.9368, dist: '260km' },
];

const DEFAULT_STATE: SimState = PRESETS.normal.state;

export function IoTSimulator() {
  const navigate = useNavigate();

  const [shipments,    setShipments]    = useState<Shipment[]>([]);
  const [selShip,      setSelShip]      = useState<Shipment|null>(null);
  const [simState,     setSimState]     = useState<SimState>(DEFAULT_STATE);
  const [activePreset, setActivePreset] = useState<string>('normal');
  const [risk,         setRisk]         = useState<{score:number;cat:string;spoilMin:number;factors:Record<string,number>}>({ score:13, cat:'LOW', spoilMin:480, factors:{} });
  const [telemetry,    setTelemetry]    = useState<TelemetryPoint[]>([]);
  const [simRunning,   setSimRunning]   = useState(false);
  const [simPaused,    setSimPaused]    = useState(false);
  const [simTime,      setSimTime]      = useState(0); // seconds
  const [simSpeed,     setSimSpeed]     = useState(1);
  const [simProgress,  setSimProgress]  = useState(52); // truck % on route
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [saveModal,    setSaveModal]    = useState(false);
  const [saveName,     setSaveName]     = useState('');
  const [toasts,       setToasts]       = useState<Array<{id:string;msg:string;type:'ok'|'warn'}>>([]);
  const [apiRisk,      setApiRisk]      = useState<RiskResult|null>(null);
  const [previewImpact, setPreviewImpact] = useState<PreviewImpactResult|null>(null);
  const [apiLoading,   setApiLoading]   = useState(false);
  const [graphRange,   setGraphRange]   = useState<'15m'|'30m'|'all'>('all');
  const [sessionId,    setSessionId]    = useState<string>(`sim_${Math.random().toString(36).slice(2,10)}`);
  const [curLat,       setCurLat]       = useState<number|undefined>(undefined);
  const [curLng,       setCurLng]       = useState<number|undefined>(undefined);

  const simRef   = useRef<ReturnType<typeof setInterval>>(undefined);
  const apiRef   = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const toast = (msg:string, type:'ok'|'warn'='ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000);
  };

  // Load shipments
  useEffect(()=>{
    getShipments('active').then(s=>{ setShipments(s); if(s[0]) setSelShip(s[0]); }).catch(()=>{});
  },[]);

  // Load saved scenarios from localStorage
  useEffect(()=>{
    try { const s = JSON.parse(localStorage.getItem('cargofy_sim_scenarios')||'[]'); setSavedScenarios(s); } catch {}
  },[]);

  // Compute risk whenever sim state changes
  const computeLocalRisk = useCallback((s:SimState, productType:string) => {
    const r = estimateRisk(s, productType);
    setRisk(r);
    // Add telemetry point
    setTelemetry(pts=>[...pts.slice(-200), { t:Date.now(), temp:s.temp, ambient:s.ambient, humidity:s.humidity }]);
  },[]);

  // Debounced API call for accurate risk
  const callApiRisk = useCallback((s:SimState, productType:string, shipId?:string) => {
    clearTimeout(apiRef.current);
    apiRef.current = setTimeout(async () => {
      setApiLoading(true);
      try {
        const r = await computeRisk({ temperature:s.temp, delay_minutes:s.delay, product_type:productType, ambient_temp:s.ambient, shipment_id:shipId });
        setApiRisk(r);
      } catch {} finally { setApiLoading(false); }
    }, 600);
  }, []);

  const updateState = useCallback((patch: Partial<SimState>) => {
    setSimState(prev => {
      const next = {...prev,...patch};
      const pt = selShip?.product_type ?? 'dairy';
      computeLocalRisk(next, pt);
      callApiRisk(next, pt, selShip?.id);
      return next;
    });
    setActivePreset('');
  }, [selShip, computeLocalRisk, callApiRisk]);

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setSimState(p.state);
    setActivePreset(key);
    const pt = selShip?.product_type ?? 'dairy';
    computeLocalRisk(p.state, pt);
    // Flow B: call real backend preset endpoint
    if (selShip) {
      simulatorLoadPreset(key.toUpperCase(), selShip.shipment_code, sessionId)
        .then(r => {
          if (r.config) {
            // Backend confirmed; also trigger preview
            callApiRisk(p.state, pt, selShip.id);
          }
        })
        .catch(() => callApiRisk(p.state, pt, selShip?.id));
    } else {
      callApiRisk(p.state, pt, undefined);
    }
    toast(`✅ Preset "${p.label}" applied`);
  };

  // Simulation timer
  useEffect(()=>{
    clearInterval(simRef.current);
    if (simRunning && !simPaused) {
      simRef.current = setInterval(()=>{
        setSimTime(t=>t+1);
        setSimProgress(p=>Math.min(100, p + (0.05 * simSpeed)));
      }, 1000);
    }
    return ()=>clearInterval(simRef.current);
  },[simRunning, simPaused, simSpeed]);

  const resetSim = () => {
    setSimRunning(false); setSimPaused(false); setSimTime(0); setSimProgress(52);
    setSimState(DEFAULT_STATE); setActivePreset('normal');
    setTelemetry([]); setApiRisk(null);
    computeLocalRisk(DEFAULT_STATE, selShip?.product_type ?? 'dairy');
    toast('🔄 Simulation reset');
  };

  const saveScenario = () => {
    if (!saveName.trim()) return;
    const s: SavedScenario = { name:saveName.trim(), state:simState, ts:Date.now() };
    const updated = [s, ...savedScenarios.slice(0,9)];
    setSavedScenarios(updated);
    localStorage.setItem('cargofy_sim_scenarios', JSON.stringify(updated));
    setSaveModal(false); setSaveName('');
    toast('💾 Scenario saved!');
  };

  const commitToShipment = async () => {
    if (!selShip) { toast('Select a shipment first', 'warn'); return; }
    try {
      // Flow A: emit to Pub/Sub telemetry-stream (same as real IoT)
      await simulatorEmit({
        shipment_code:      selShip.shipment_code,
        temperature:        simState.temp,
        ambient_temp:       simState.ambient,
        humidity:           simState.humidity,
        delay_minutes:      simState.delay,
        reefer_health_pct:  simState.reefer,
        door_open_minutes:  simState.doorOpen,
        sensor_battery_pct: simState.battery,
        session_id:         sessionId,
      });
      toast(`✅ Telemetry emitted to pipeline for ${selShip.shipment_code}`);
    } catch {
      // Fallback to direct sensor write
      try {
        await sendSensor(selShip.id, { temperature: simState.temp, humidity: simState.humidity, delay_minutes: simState.delay, source: 'simulator' });
        toast(`✅ Sensor data committed to ${selShip.shipment_code}`);
      } catch { toast('⚠️ Could not commit to shipment', 'warn'); }
    }
  };

  const handlePlayback = async () => {
    if (!selShip) { toast('Select a shipment first', 'warn'); return; }
    if (simRunning) {
      setSimRunning(false); setSimPaused(false);
      simulatorStop(selShip.shipment_code).catch(() => {});
      toast('⏹ Playback stopped');
    } else {
      setSimRunning(true); setSimPaused(false);
      try {
        await simulatorStartPlayback(selShip.shipment_code, simSpeed, sessionId);
        toast(`▶ Playback started at ${simSpeed}x speed`);
      } catch { toast('▶ Playback running (local mode)'); }
    }
  };

  // Derived values
  const [tMin,tMax] = getTempBand(selShip?.product_type);
  const isBreach    = simState.temp > tMax;
  const finalScore  = apiRisk ? Math.round(apiRisk.risk_score) : risk.score;
  const finalCat    = apiRisk ? apiRisk.risk_category : risk.cat;
  const finalSpoil  = apiRisk ? apiRisk.time_to_spoil_minutes : risk.spoilMin;
  const riskColor   = getRiskColor(finalCat);
  const explanation = apiRisk?.explanation;

  // Filtered telemetry points
  const filteredTelemetry = graphRange === '15m'
    ? telemetry.filter(p => Date.now() - p.t < 15*60*1000)
    : graphRange === '30m'
      ? telemetry.filter(p => Date.now() - p.t < 30*60*1000)
      : telemetry;

  // Real-time tracking for map
  const { data: rtActiveShipments } = useRealtimeData<any>('/active_shipments');
  useEffect(() => {
    if (selShip && rtActiveShipments && rtActiveShipments[selShip.shipment_code]) {
      const rt = rtActiveShipments[selShip.shipment_code];
      setCurLat(rt.lat);
      setCurLng(rt.lng);
      setSimProgress(rt.progress || 0);
    }
  }, [selShip, rtActiveShipments]);

  // Alert preview
  const alerts = [
    { fire: isBreach, label:'Auto alert to driver', detail:`WhatsApp: "Temp breach ${simState.temp.toFixed(1)}°C"` },
    { fire: simState.delay > 15 && isBreach, label:'Escalation', detail:'Fleet Manager notified (breach >15 min)' },
    { fire: finalScore > 60, label:'Cold hub recommendation', detail:'Meghalaya Hub (11km)' },
    { fire: finalScore >= 90, label:'Auto reroute', detail:'Would trigger at 90+ risk score' },
  ];

  const fmtTime = (s:number) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const lossRisk = Math.round((finalScore/100) * 18000);
  const lossSaved = Math.round(lossRisk * 0.82);

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      {/* Keyframes */}
      <style>{`@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t=>(
          <div key={t.id} style={{animation:'slideIn 0.3s ease'}}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl ${t.type==='ok'?'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Save modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F1F5F9] mb-3">💾 Save Scenario</h3>
            <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Scenario name…"
              className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40 mb-3"/>
            <div className="flex gap-2">
              <button onClick={saveScenario} className="flex-1 bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] text-xs py-2 rounded-lg hover:bg-[#4DD9AC]/20 transition-colors">Save</button>
              <button onClick={()=>setSaveModal(false)} className="flex-1 border border-[#1E2530] text-[#64748B] text-xs py-2 rounded-lg hover:border-[#374151] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Setup Modal */}
      {showWhatsAppModal && (
        <WhatsAppSetupModal
          onClose={() => setShowWhatsAppModal(false)}
          onSuccess={(phone) => {
            toast(`✅ WhatsApp alerts enabled for ${phone.slice(0,4)}****${phone.slice(-3)}`, 'ok');
            setShowWhatsAppModal(false);
          }}
        />
      )}

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-13 bg-[#0A0D14] border-b border-[#1E2530] flex items-center px-4 gap-4 z-40 py-3">
        <div className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono cursor-pointer" onClick={()=>navigate('/dashboard')}>CARGOFY</div>
        <div className="h-5 w-px bg-[#1E2530]"/>
        <div className="text-sm text-[#A78BFA] flex items-center gap-2">
          <span>🎮</span> IoT Simulator
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-[#A78BFA]/8 border border-[#A78BFA]/25 text-[#A78BFA] px-2.5 py-1 rounded-full font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse"/>
          SIMULATION MODE
        </div>
        <div className="flex-1"/>
        {/* Sim controls */}
        <div className="flex items-center gap-1">
          {[1,2,5,10].map(s=>(
            <button key={s} onClick={()=>setSimSpeed(s)} className={`text-[10px] px-2 py-1 rounded border transition-colors ${simSpeed===s?'bg-[#A78BFA]/10 border-[#A78BFA]/30 text-[#A78BFA]':'border-[#1E2530] text-[#64748B]'}`}>{s}x</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {!simRunning ? (
            <button onClick={handlePlayback} className="text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors">▶ Start</button>
          ) : simPaused ? (
            <button onClick={() => setSimPaused(false)} className="text-xs bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] px-3 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors">▶ Resume</button>
          ) : (
            <button onClick={() => setSimPaused(true)} className="text-xs bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] px-3 py-1.5 rounded hover:bg-[#FBBF24]/20 transition-colors">⏸ Pause</button>
          )}
          <button onClick={resetSim} className="text-xs border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">🔄 Reset</button>
          {simRunning && <span className="font-mono text-xs text-[#64748B]">{fmtTime(simTime)}</span>}
        </div>
        <WhatsAppBadge onClick={() => setShowWhatsAppModal(true)} />
        <button onClick={()=>setSaveModal(true)} className="text-xs border border-[#1E2530] text-[#64748B] hover:text-[#4DD9AC] px-3 py-1.5 rounded transition-colors">💾 Save</button>
        <button onClick={commitToShipment} className="text-xs bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#F87171] hover:bg-[#EF4444]/20 px-3 py-1.5 rounded transition-colors">📡 Commit to Shipment</button>
        <button onClick={()=>navigate('/risk')} className="text-xs border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">← Risk Console</button>
      </header>

      {/* ── Main Body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Controls ───────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 bg-[#0D1117] border-r border-[#1E2530] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">

            {/* Shipment selector */}
            <div className="px-4 py-3 border-b border-[#1E2530]">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">Simulate For</div>
              <select value={selShip?.id ?? ''}
                onChange={e=>{ const s=shipments.find(x=>x.id===e.target.value)||null; setSelShip(s); if(s) computeLocalRisk(simState, s.product_type); }}
                className="w-full bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] focus:outline-none focus:border-[#4DD9AC]/40 mb-2">
                <option value="">— Virtual Shipment —</option>
                {shipments.map(s=>(
                  <option key={s.id} value={s.id}>{s.shipment_code} · {pIcon(s.product_type)} {s.product_type}</option>
                ))}
              </select>
              {selShip && (
                <div className="bg-[#111827] rounded-lg p-3 text-[11px] space-y-1">
                  <div className="flex justify-between"><span className="text-[#64748B]">Product</span><span className="font-semibold">{pIcon(selShip.product_type)} {selShip.product_type}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">Route</span><span className="text-[#94A3B8]">{selShip.origin?.split(',')[0]} → {selShip.destination?.split(',')[0]}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">Safe band</span><span className="text-[#34D399]">{tMin}°C – {tMax}°C</span></div>
                </div>
              )}
            </div>

            {/* Scenario presets */}
            <div className="px-4 py-3 border-b border-[#1E2530]">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">Scenario Presets</div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(PRESETS).map(([key, p])=>(
                  <button key={key} onClick={()=>applyPreset(key)}
                    className={`text-left px-2.5 py-2 rounded-lg border text-[11px] transition-all ${activePreset===key?'bg-[#4DD9AC]/10 border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#111827] border-[#1E2530] text-[#94A3B8] hover:border-[#374151] hover:text-white'}`}>
                    <div className="font-semibold">{p.icon} {p.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sensor sliders */}
            <div className="px-4 py-3 border-b border-[#1E2530] space-y-5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">Sensor Controls</div>
                <button onClick={()=>{ if(activePreset) applyPreset(activePreset); else applyPreset('normal'); }}
                  className="text-[9px] text-[#64748B] border border-[#1E2530] px-2 py-0.5 rounded hover:text-white transition-colors">↺ Reset</button>
              </div>

              <Slider icon="🌡" label="Cargo Temperature" value={simState.temp} min={-5} max={25} step={0.1} unit="°C"
                safeMin={tMin} safeMax={tMax} warnThresh={tMax} dangerThresh={tMax + 2}
                onChange={v=>updateState({temp:v})}/>
              <Slider icon="🌤" label="Ambient Temperature" value={simState.ambient} min={10} max={50} step={1} unit="°C"
                warnThresh={32} dangerThresh={40}
                onChange={v=>updateState({ambient:v})}/>
              <Slider icon="💧" label="Humidity" value={simState.humidity} min={30} max={100} step={1} unit="%"
                warnThresh={75} dangerThresh={85}
                onChange={v=>updateState({humidity:v})}/>
              <Slider icon="⏱" label="Transit Delay" value={simState.delay} min={0} max={120} step={1} unit="m"
                warnThresh={20} dangerThresh={60}
                onChange={v=>updateState({delay:v})}/>
              <Slider icon="❄️" label="Reefer Health" value={simState.reefer} min={0} max={100} step={1} unit="%"
                safeMin={80} safeMax={100} warnThresh={79} dangerThresh={50}
                onChange={v=>{ /* invert for reefer — lower is danger */ updateState({reefer:v}); }}/>
              <Slider icon="🚪" label="Door Open Time" value={simState.doorOpen} min={0} max={60} step={1} unit="m"
                warnThresh={5} dangerThresh={20}
                onChange={v=>updateState({doorOpen:v})}/>
              <Slider icon="🔋" label="Sensor Battery" value={simState.battery} min={0} max={100} step={1} unit="%"
                warnThresh={29} dangerThresh={15}
                onChange={v=>updateState({battery:v})}/>
              <Slider icon="📡" label="GPS Stale Time" value={simState.gpsStale} min={0} max={30} step={1} unit="m"
                warnThresh={5} dangerThresh={15}
                onChange={v=>updateState({gpsStale:v})}/>
            </div>

            {/* Saved scenarios */}
            {savedScenarios.length > 0 && (
              <div className="px-4 py-3">
                <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">Saved Scenarios</div>
                <div className="space-y-1.5">
                  {savedScenarios.slice(0,5).map((s,i)=>(
                    <button key={i} onClick={()=>{ setSimState(s.state); computeLocalRisk(s.state, selShip?.product_type??'dairy'); setActivePreset(''); toast(`📂 Loaded: ${s.name}`); }}
                      className="w-full text-left flex items-center justify-between px-3 py-2 bg-[#111827] border border-[#1E2530] rounded-lg hover:border-[#374151] transition-colors">
                      <span className="text-xs text-[#CBD5E1]">{s.name}</span>
                      <span className="text-[9px] text-[#4A5568]">{new Date(s.ts).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── CENTER: Map ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Map */}
          <div className="flex-1 min-h-0">
            <SimulatorMap risk={{score:finalScore, cat:finalCat}} state={simState} progress={simProgress} shipment={selShip} lat={curLat} lng={curLng}/>
          </div>

          {/* Telemetry graph strip */}
          <div className="shrink-0 h-36 bg-[#0D1117] border-t border-[#1E2530] px-4 pt-2 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse"/>
                Live Telemetry Stream
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="w-3 h-0.5 bg-[#60A5FA] inline-block rounded"/>Temp
                  <span className="w-3 h-0.5 bg-[#F97316] inline-block rounded"/>Ambient
                  <span className="w-3 h-0.5 bg-[#34D399] inline-block rounded" style={{opacity:0.6}}/>Safe band
                </div>
                <div className="flex gap-1">
                  {(['15m','30m','all'] as const).map(r=>(
                    <button key={r} onClick={()=>setGraphRange(r)} className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${graphRange===r?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-20">
              <TelemetryGraph points={filteredTelemetry} tMin={tMin} tMax={tMax}/>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Risk Response ─────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 bg-[#0D1117] border-l border-[#1E2530] flex flex-col overflow-y-auto">

          {/* Risk score gauge */}
          <div className="px-4 py-4 border-b border-[#1E2530]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">Live Risk Score</div>
              {apiLoading && <span className="text-[9px] text-[#4DD9AC] animate-pulse">Computing…</span>}
            </div>
            <div className="flex items-center gap-4">
              {/* Gauge */}
              <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                  <circle cx={32} cy={32} r={26} fill="none" stroke="#1E2530" strokeWidth="7"/>
                  <circle cx={32} cy={32} r={26} fill="none" stroke={riskColor} strokeWidth="7"
                    strokeDasharray={`${(finalScore/100)*163.4} 163.4`} strokeLinecap="round"
                    style={{filter:`drop-shadow(0 0 6px ${riskColor}60)`, transition:'stroke-dasharray 0.8s ease, stroke 0.5s ease'}}/>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black font-mono" style={{color:riskColor, transition:'color 0.5s'}}>{finalScore}</span>
                </div>
              </div>
              <div>
                <div className="font-bold text-sm mb-1" style={{color:riskColor, transition:'color 0.5s'}}>{finalCat} RISK</div>
                <div className="text-xs text-[#64748B]">Spoils in <span className="font-mono font-bold text-[#FBBF24]">{finalSpoil ? `${Math.floor(finalSpoil/60)}h ${finalSpoil%60}m` : '—'}</span></div>
                <div className={`text-[10px] font-bold mt-0.5 ${finalScore>50?'text-[#F87171]':'text-[#34D399]'}`}>
                  {finalScore > 50 ? '📈 WORSENING' : finalScore > 25 ? '⚠️ MONITOR' : '✅ STABLE'}
                </div>
              </div>
            </div>
            {/* Score bar */}
            <div className="mt-3 h-2 bg-[#1E2530] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{width:`${finalScore}%`, background:riskColor}}/>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="px-4 py-3 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">Risk Factors (Live)</div>
            <div className="space-y-2">
              {[
                { icon:'🌡', label:'Temp breach',     pts: Math.round(risk.factors.tempFactor ?? 0) },
                { icon:'⏱', label:'Delay',            pts: Math.round(risk.factors.delayFactor ?? 0) },
                { icon:'🌤', label:'Ambient heat',    pts: Math.round(risk.factors.ambFactor ?? 0) },
                { icon:'❄️', label:'Reefer degraded', pts: Math.round(risk.factors.reeferFactor ?? 0) },
                { icon:'🚪', label:'Door exposure',   pts: Math.round(risk.factors.doorFactor ?? 0) },
                { icon:'💧', label:'Humidity surge',  pts: Math.round(risk.factors.humFactor ?? 0) },
                { icon:'📡', label:'Sensor gap',      pts: Math.round(risk.factors.sensorFactor ?? 0) },
              ].filter(f=>f.pts>0).map(f=>(
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  <span className="w-5">{f.icon}</span>
                  <span className="flex-1 text-[#94A3B8]">{f.label}</span>
                  <div className="w-20 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${Math.min(100,f.pts/30*100)}%`, background:riskColor, transition:'width 0.5s ease'}}/>
                  </div>
                  <span className="font-mono font-bold text-[#F87171] w-8 text-right">+{f.pts}</span>
                </div>
              ))}
              <div className="border-t border-[#1E2530] pt-2 flex justify-between text-xs font-bold">
                <span style={{color:riskColor}}>TOTAL</span>
                <span className="font-mono" style={{color:riskColor}}>{finalScore}</span>
              </div>
            </div>
          </div>

          {/* Alert preview */}
          <div className="px-4 py-3 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">What Would Trigger?</div>
            <div className="space-y-2">
              {alerts.map((a,i)=>(
                <div key={i} className={`flex items-start gap-2 text-[11px] ${a.fire?'text-[#F1F5F9]':'text-[#4A5568]'}`}>
                  <span className={a.fire?'text-[#34D399]':'text-[#EF4444]'}>{a.fire?'✅':'❌'}</span>
                  <div>
                    <div className="font-semibold">{a.label}</div>
                    <div style={{color:a.fire?'#94A3B8':'#374151'}} className="text-[10px]">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decision impact */}
          <div className="px-4 py-3 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">If You Intervene Now</div>
            <div className="space-y-2 text-[11px]">
              <div className="bg-[#0D2B22] border border-[#34D399]/20 rounded-lg px-3 py-2">
                <div className="text-[#34D399] font-semibold">→ Alert driver + check reefer</div>
                <div className="text-[#64748B]">Risk: {finalScore} → ~{Math.max(10,finalScore-22)} · Spoilage -82%</div>
              </div>
              <div className="bg-[#0F1A2E] border border-[#60A5FA]/20 rounded-lg px-3 py-2">
                <div className="text-[#60A5FA] font-semibold">→ Divert to cold hub (11km)</div>
                <div className="text-[#64748B]">Risk: {finalScore} → ~{Math.max(10,finalScore-31)} · +14 min</div>
              </div>
              <div className="bg-[#2B0D0D] border border-[#EF4444]/20 rounded-lg px-3 py-2">
                <div className="text-[#F87171] font-semibold">→ Do nothing</div>
                <div className="text-[#64748B]">Risk critical in ~15 min · Loss: ₹{lossRisk.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Financial impact */}
          <div className="px-4 py-3 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">Financial Impact</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-[#64748B]">Current loss risk</span><span className="font-mono text-[#F87171] font-bold">₹{lossRisk.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">If intervened now</span><span className="font-mono text-[#34D399]">₹{Math.round(lossRisk*0.18).toLocaleString()} (saved ₹{lossSaved.toLocaleString()})</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">If rerouted</span><span className="font-mono text-[#34D399]">₹{Math.round(lossRisk*0.12).toLocaleString()}</span></div>
              <div className="flex justify-between text-[10px] text-[#64748B]"><span>CO₂ impact</span><span>+2.4 kg if rerouted</span></div>
            </div>
          </div>

          {/* AI explanation */}
          {explanation && (
            <div className="px-4 py-3 border-b border-[#1E2530]">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2 font-semibold">AI Risk Analysis</div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">{explanation.slice(0,220)}{explanation.length>220?'..':''}</p>
            </div>
          )}

          {/* Commit button */}
          <div className="p-4">
            <button onClick={commitToShipment}
              className="w-full bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#F87171] hover:bg-[#EF4444]/20 text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold mb-2">
              📡 Commit Sensor Data to Shipment
            </button>
            <button onClick={()=>navigate('/risk')}
              className="w-full bg-[#111827] border border-[#1E2530] text-[#64748B] hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
              ⚡ Go to Risk Console →
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
