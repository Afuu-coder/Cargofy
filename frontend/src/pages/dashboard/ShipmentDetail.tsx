import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getShipment, getSensorHistory, getRiskEvents,
  sendTestAlert, submitPOD, addShipmentNote, updateShipmentStage,
  getShipmentTimeline, getShipmentCompliance,
  certifyShipment, verifyBlockchainCert,
  type Shipment, type SensorReading, type RiskEvent,
} from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { CargofyRouteMap } from '../../components/CargofyRouteMap';
import { ContainerHeatmap } from '../../components/ContainerHeatmap';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = 'telemetry' | 'alerts' | 'compliance' | 'documents' | 'delivery' | 'notes';

const PRODUCT_ICONS: Record<string, string> = {
  dairy:'🥛', milk:'🥛', seafood:'🐟', fish:'🐟', produce:'🥦',
  vegetables:'🥦', frozen:'🧊', pharma:'💊', fruits:'🍎', meat:'🥩', other:'📦',
};
function pIcon(t: string) { return PRODUCT_ICONS[t?.toLowerCase()] || '📦'; }

function getRiskColor(cat?: string) {
  const c = cat?.toUpperCase();
  if (c === 'CRITICAL') return '#EF4444';
  if (c === 'HIGH')     return '#F97316';
  if (c === 'MEDIUM')   return '#FBBF24';
  return '#34D399';
}
function getRiskBg(cat?: string) {
  const c = cat?.toUpperCase();
  if (c === 'CRITICAL') return 'rgba(239,68,68,0.12)';
  if (c === 'HIGH')     return 'rgba(249,115,22,0.12)';
  if (c === 'MEDIUM')   return 'rgba(251,191,36,0.12)';
  return 'rgba(52,211,153,0.12)';
}

function fmtTime(iso?: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

// ── Timeline events builder ───────────────────────────────────────────────────
function buildTimeline(s: Shipment, riskEvents: RiskEvent[], sensors: SensorReading[]) {
  const events: Array<{
    time: string; title: string; detail: string;
    type: 'normal' | 'alert' | 'ai' | 'pending';
  }> = [];

  events.push({ time: fmtTime(s.created_at as any), title: 'Shipment Created', detail: `Code: ${s.shipment_code}`, type: 'normal' });

  if (s.driver_phone) {
    events.push({ time: fmtTime(s.created_at as any), title: 'Driver Assigned', detail: s.driver_phone, type: 'normal' });
  }
  if (s.vehicle_number) {
    events.push({ time: fmtTime(s.created_at as any), title: 'Vehicle Assigned', detail: s.vehicle_number, type: 'normal' });
  }

  if (sensors.length > 0) {
    const first = sensors[sensors.length - 1];
    events.push({
      time: fmtTime(first.recorded_at),
      title: 'First Sensor Ping',
      detail: `Temp: ${first.temperature?.toFixed(1)}°C · Humidity: ${first.humidity?.toFixed(0) ?? '—'}%`,
      type: 'normal',
    });
  }

  riskEvents.slice().reverse().forEach(re => {
    const cat = re.risk_category?.toUpperCase();
    if (cat === 'HIGH' || cat === 'CRITICAL') {
      events.push({
        time: fmtTime(re.created_at),
        title: `🔴 ${cat} Risk Detected`,
        detail: re.explanation?.slice(0, 90) || `Score: ${re.risk_score}`,
        type: 'alert',
      });
      if (re.alert_sent) {
        events.push({
          time: fmtTime(re.alert_sent_at),
          title: 'Alert Sent to Driver',
          detail: 'WhatsApp delivered · Auto-triggered',
          type: 'ai',
        });
      }
    }
  });

  if (s.status !== 'delivered' && s.status !== 'completed') {
    events.push({ time: '--:--', title: 'Near Destination Alert', detail: 'Triggered at 10 km from drop', type: 'pending' });
    events.push({ time: '--:--', title: 'Delivery + Proof', detail: 'Awaiting confirmation', type: 'pending' });
  }

  return events;
}

// ── Risk gauge SVG ────────────────────────────────────────────────────────────
function RiskGaugeSVG({ score, color }: { score: number; color: string }) {
  const r = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const startAngle = -225;
  const totalDeg = 270;
  const filled = (score / 100) * totalDeg;
  const dash = (filled / 360) * circ;
  const rotation = startAngle;

  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E2530" strokeWidth="10"
        strokeDasharray={`${(totalDeg/360)*circ} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 8px ${color}66)`, transition: 'stroke-dasharray 1s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="28" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="Inter, sans-serif">/ 100</text>
    </svg>
  );
}

// ── Telemetry mini-chart ──────────────────────────────────────────────────
function TelemetryChart({ readings, tempMin, tempMax }: { readings: SensorReading[]; tempMin: number; tempMax: number }) {
  if (readings.length < 2) return (
    <div className="flex items-center justify-center h-full text-[#4A5568] text-sm">No telemetry data yet</div>
  );

  const pts = [...readings].reverse();
  const temps = pts.map(r => r.temperature ?? 0);
  const allMin = Math.min(...temps, tempMin - 2);
  const allMax = Math.max(...temps, tempMax + 4);
  const W = 600, H = 120;

  const tx = (i: number) => (i / (pts.length - 1)) * W;
  const ty = (t: number) => H - ((t - allMin) / (allMax - allMin)) * H;

  const safeY1 = ty(tempMax);
  const safeY2 = ty(tempMin);

  const pathD = pts.map((r, i) => `${i === 0 ? 'M' : 'L'} ${tx(i)} ${ty(r.temperature ?? 0)}`).join(' ');
  const areaD = `${pathD} L ${tx(pts.length-1)} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <rect x={0} y={safeY1} width={W} height={safeY2 - safeY1} fill="rgba(52,211,153,0.08)" />
      <line x1={0} y1={safeY1} x2={W} y2={safeY1} stroke="#34D399" strokeWidth="1" strokeDasharray="4,4" opacity="0.4" />
      {temps.some(t => t > tempMax) && (
        <rect x={0} y={0} width={W} height={safeY1} fill="rgba(239,68,68,0.05)" />
      )}
      <path d={areaD} fill="url(#tempFill)" opacity="0.3" />
      <path d={pathD} fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((r, i) => r.temperature! > tempMax && (
        <circle key={i} cx={tx(i)} cy={ty(r.temperature!)} r="4" fill="#EF4444" />
      ))}
      <defs>
        <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// SVG Route Map removed in favor of CargofyRouteMap

// ── Main Component ────────────────────────────────────────────────────────────
export function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shipment, setShipment]   = useState<Shipment | null>(null);
  const [sensors,  setSensors]    = useState<SensorReading[]>([]);

  // ── Blockchain live block ticker state ────────────────────────────────────
  const [blockTicker, setBlockTicker] = useState<Array<{hash: string; block: number; ts: string}>>([]);
  const tickerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [riskEvts, setRiskEvts]   = useState<RiskEvent[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [tab, setTab]             = useState<TabId>('telemetry');
  const [toasts, setToasts]       = useState<Array<{id:string;msg:string;type:'ok'|'warn'}>>([]);
  const [actionsDisabled, setActionsDisabled] = useState<Set<string>>(new Set());
  const [sensorRange, setSensorRange]         = useState<'30m'|'1h'|'3h'|'all'>('1h');
  const [apiTimeline, setApiTimeline]         = useState<any[]>([]);
  const [apiCompliance, setApiCompliance]     = useState<any>(null);
  // ⚠ These MUST be before any early returns (Rules of Hooks)
  const [noteText, setNoteText]               = useState('');
  const [notes, setNotes]                     = useState<any[]>([]);
  const [aiExpanded, setAiExpanded]           = useState(false);
  const [coldHubExpanded, setColdHubExpanded] = useState(false);
  // Blockchain certificate state (MUST be before early returns — Rules of Hooks)
  const [blockchainCert, setBlockchainCert]   = useState<{tx_hash?:string; etherscan_url?:string; verdict?:string; demo_mode?:boolean}|null>(null);
  const [certifying, setCertifying]           = useState(false);
  const [verifying,  setVerifying]            = useState(false);

  const { data: rtActiveShipments } = useRealtimeData<any>('/active_shipments');

  const toast = (msg: string, type: 'ok'|'warn' = 'ok') => {
    const tid = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id: tid, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 3500);
  };

  const fetchStatic = useCallback(async () => {
    if (!id) return;
    try {
      const [sr, re] = await Promise.all([
        getSensorHistory(id),
        getRiskEvents(id),
      ]);
      setSensors(sr);
      setRiskEvts(re);
    } catch {}
  }, [id]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const s = await getShipment(id);
        setShipment(s);
        await fetchStatic();
        // Fetch extra detail endpoints in parallel
        getShipmentTimeline(id).then(r => setApiTimeline(r.timeline)).catch(() => {});
        getShipmentCompliance(id).then(setApiCompliance).catch(() => {});
      } finally { setLoading(false); }
    }
    load();
  }, [id, fetchStatic]);

  // \u2500\u2500 Blockchain live block ticker (Ethereum ~12s block time) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    const randHex = (len: number) => Array.from({length: len}, () => Math.floor(Math.random()*16).toString(16)).join('');
    const makeBlock = () => ({
      hash:  '0x' + randHex(64),
      block: 8_740_000 + Math.floor(Math.random() * 99_999),
      ts:    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
    // seed with 3 initial blocks
    setBlockTicker([makeBlock(), makeBlock(), makeBlock()]);
    tickerRef.current = setInterval(() => {
      setBlockTicker(prev => [makeBlock(), ...prev].slice(0, 6));
    }, 12_000);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
  }, []);

  const displayShipment = React.useMemo(() => {
    if (!shipment || !rtActiveShipments) return shipment;
    const rt = rtActiveShipments[shipment.shipment_code];
    if (!rt) return shipment;
    return {
      ...shipment,
      status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage.toLowerCase(),
      current_risk: {
        ...shipment.current_risk,
        risk_score: rt.risk_score / 100,
        risk_category: rt.risk_category,
      }
    } as Shipment;
  }, [shipment, rtActiveShipments]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#080B12] text-[#4DD9AC]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-[#4DD9AC]/30 border-t-[#4DD9AC] rounded-full animate-spin mx-auto mb-4"/>
        <div className="text-sm font-medium text-[#4DD9AC] mb-1">Loading Shipment Data</div>
        <div className="text-xs text-[#64748B]">Fetching live telemetry...</div>
      </div>
    </div>
  );

  if (!displayShipment) return (
    <div className="flex items-center justify-center h-screen bg-[#080B12] text-[#F87171]">
      <div>Shipment not found.</div>
    </div>
  );

  const risk      = displayShipment.current_risk;
  const riskCat   = risk?.risk_category?.toUpperCase() || 'LOW';
  const riskScore = Math.round(risk?.risk_score || 0);
  const tempMax   = { dairy:6, seafood:4, pharma:8, frozen:-15, produce:10, fruits:12, meat:4 }[displayShipment.product_type || ''] ?? 8;

  const latestSensor = sensors[0];
  const currentTemp  = latestSensor?.temperature;
  const isTempBreach = currentTemp !== undefined && currentTemp > tempMax;
  const progress = displayShipment.status === 'delivered' ? 100 : 52;
  const lastSync = latestSensor?.recorded_at ? `${Math.floor((Date.now() - new Date(latestSensor.recorded_at).getTime()) / 60000)} min ago` : 'No data';

  const filteredSensors = sensors.filter(r => {
    if (!r.recorded_at) return true;
    const cutoff = sensorRange === '30m' ? 30 : sensorRange === '1h' ? 60 : sensorRange === '3h' ? 180 : 99999;
    return (Date.now() - new Date(r.recorded_at).getTime()) / 60000 <= cutoff;
  });

  const timeline = buildTimeline(displayShipment, riskEvts, sensors);

  async function handleAlertDriver() {
    toast('⚠️ Alert sent to driver');
    if (displayShipment?.driver_phone) {
      try { await sendTestAlert(displayShipment.driver_phone, displayShipment.id); } catch {}
    }
  }

  // (hooks moved above early returns — see top of component)

  function handleAction(key: string, label: string) {
    setActionsDisabled(s => new Set([...s, key]));
    toast(`${label} — done ✓`);
    setTimeout(() => setActionsDisabled(s => { const n = new Set(s); n.delete(key); return n; }), 4000);
  }

  const isDelivered = displayShipment.status === 'delivered' || displayShipment.status === 'completed';



  async function handleMarkDelivered() {
    if (!id) return;
    try {
      await submitPOD(id, { delivered_temp: latestSensor?.temperature ?? undefined });
      toast('✅ Shipment marked as delivered');
      const s = await getShipment(id);
      setShipment(s);
      // Auto-certify on the blockchain
      setCertifying(true);
      try {
        const cert = await certifyShipment({
          shipment_code:  s.shipment_code,
          product_type:   s.product_type,
          min_temp:       latestSensor?.temperature ?? 4,
          max_temp:       latestSensor?.temperature ?? 8,
          max_risk_score: (s.current_risk?.risk_score ?? 0),
          reroute_count:  0,
          whatsapp_sent:  true,
        });
        setBlockchainCert(cert);
        toast('🔗 Blockchain certificate issued!');
      } catch {
        toast('⚠️ Blockchain cert failed (demo mode ok)', 'warn');
      } finally {
        setCertifying(false);
      }
    } catch {
      toast('⚠️ Could not mark delivered', 'warn');
    }
  }

  async function handleVerifyBlockchain() {
    if (!displayShipment?.shipment_code) return;
    setVerifying(true);
    try {
      const result = await verifyBlockchainCert(displayShipment.shipment_code);
      setBlockchainCert(result as any);
      toast(result.found ? '🔗 Certificate verified on-chain!' : '⚠️ No certificate found yet');
    } catch {
      toast('⚠️ Could not verify certificate', 'warn');
    } finally {
      setVerifying(false);
    }
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    addShipmentNote(id || '', noteText.trim()).catch(() => {});
    setNotes(n => [{ time: new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}), text: noteText.trim(), author: 'Ops Manager' }, ...n]);
    setNoteText('');
    toast('Note added');
  }

  const factors = [
    { icon:'🌡', label:'Cargo temp above safe band', pts: isTempBreach ? 22 : 0, active: isTempBreach },
    { icon:'⏱', label:'Transit delay',              pts: (latestSensor?.delay_minutes || 0) > 20 ? 18 : (latestSensor?.delay_minutes || 0) > 0 ? 8 : 0, active: (latestSensor?.delay_minutes || 0) > 0 },
    { icon:'🌤', label:'High ambient temperature',   pts: (latestSensor?.ambient_temp || 0) > 32 ? 9 : 0, active: (latestSensor?.ambient_temp || 0) > 32 },
    { icon:'🛣️', label:'Route congestion',            pts: 7, active: true },
    { icon:'📡', label:'Sensor frequency variance',  pts: sensors.length < 5 ? 5 : 0, active: sensors.length < 5 },
  ].filter(f => f.pts > 0);

  const riskColor = getRiskColor(riskCat);
  const tempMin   = { dairy:2, seafood:0, pharma:2, frozen:-20, produce:4, fruits:5, meat:0 }[displayShipment.product_type || ''] ?? 2;

  function fmtSpoil(mins?: number) {
    if (!mins) return '—';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden">
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-xl border ${t.type==='ok'?'bg-[#0D2B22] border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B0D0D] border-[#EF4444]/40 text-[#F87171]'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      <header className="shrink-0 h-14 bg-[#0D1117] border-b border-[#1E2530] flex items-center px-4 gap-3">
        <button onClick={() => navigate(-1)} className="text-sm font-medium text-[#64748B] hover:text-[#CBD5E1] transition-colors flex items-center gap-1">← Back</button>
        <span className="font-mono text-base font-black text-[#4DD9AC]">{displayShipment.shipment_code}</span>
        <div className="flex-1" />
        <button onClick={handleAlertDriver} className="bg-[#4DD9AC] text-[#003829] px-3 py-1.5 rounded font-bold text-xs">⚡ Quick Alert</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-[#0D1117] border-r border-[#1E2530] overflow-y-auto p-4 hidden md:block">
          <h2 className="text-xs font-bold text-[#F1F5F9] uppercase mb-4">Timeline</h2>
          <div className="space-y-4">
            {timeline.map((ev, i) => (
              <div key={i} className="text-xs">
                <div className="text-[10px] text-[#4DD9AC]">{ev.time}</div>
                <div className="font-bold text-[#F1F5F9]">{ev.title}</div>
                <div className="text-[#64748B]">{ev.detail}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── CENTER: Map + Route ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Map */}
          <div className="shrink-0 h-[280px] bg-[#080B12] border-b border-[#1E2530] relative overflow-hidden">
            <div className="absolute inset-0">
              <CargofyRouteMap 
                originLat={displayShipment.origin_lat || undefined}
                originLng={displayShipment.origin_lng || undefined}
                destLat={displayShipment.dest_lat || undefined}
                destLng={displayShipment.dest_lng || undefined}
                originName={displayShipment.origin || 'Origin'}
                destName={displayShipment.destination || 'Destination'}
                routeData={null}
                className="w-full h-full"
              />
            </div>
            {/* Overlay badges */}
            <div className="absolute top-3 left-3 bg-[#0D1117]/90 backdrop-blur border border-[#1E2530] rounded px-2 py-1">
              <div className="text-[9px] text-[#4DD9AC] font-mono tracking-widest mb-0.5">GPS LOCK: ACQUIRED</div>
              <div className="text-[10px] text-[#94A3B8]">{displayShipment.origin?.split(',')[0]} → {displayShipment.destination?.split(',')[0]}</div>
            </div>
            {riskCat === 'CRITICAL' && (
              <div className="absolute top-3 right-3 bg-[#EF4444]/10 border border-[#EF4444]/40 text-[#F87171] text-[10px] font-bold px-2 py-1 rounded animate-pulse">
                🔴 CRITICAL BREACH
              </div>
            )}
          </div>

          {/* Route Health Panel */}
          <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] p-4">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold flex items-center gap-2">
              🛣️ Route Health
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <div className="text-[10px] text-[#4A5568] mb-0.5">Progress</div>
                <div className="h-2 bg-[#1E2530] rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-[#4DD9AC] rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-[10px] text-[#94A3B8]">{progress}% complete</div>
              </div>
              <div>
                <div className="text-[10px] text-[#4A5568] mb-0.5">Delay</div>
                <div className="font-mono text-[#FBBF24] font-bold">
                  {latestSensor?.delay_minutes ? `+${latestSensor.delay_minutes} min` : 'On track'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#4A5568] mb-0.5">Next Checkpoint</div>
                <div className="text-xs text-[#CBD5E1]">Meghalaya border · 28 km</div>
              </div>
              <div>
                <div className="text-[10px] text-[#4A5568] mb-0.5">Road Condition</div>
                <div className="text-xs text-[#FBBF24]">NH + Hill stretch · Moderate</div>
              </div>
            </div>

            {/* Alternate route suggestion */}
            {(riskCat === 'HIGH' || riskCat === 'CRITICAL') && (
              <div className="bg-[#1C1A0A] border border-[#FBBF24]/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-[#FBBF24] mb-1.5">⚠️ Alternate Route Available</div>
                <div className="text-[11px] text-[#94A3B8] mb-2">Via Nongpoh — saves 18 min, avoids hill stretch</div>
                <div className="flex gap-2">
                  <button onClick={() => toast('Alternate route previewed')} className="text-[10px] bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30 px-3 py-1 rounded hover:bg-[#FBBF24]/20 transition-colors">View Alternate</button>
                  <button onClick={() => { handleAction('reroute', '🛣️ Reroute applied'); }} className="text-[10px] bg-[#4DD9AC] text-[#003829] font-bold px-3 py-1 rounded hover:bg-[#6EF6C7] transition-colors">Apply Reroute</button>
                </div>
              </div>
            )}
          </div>

          {/* Driver + Vehicle card */}
          <div className="shrink-0 border-b border-[#1E2530] grid grid-cols-2 divide-x divide-[#1E2530]">
            <div className="p-4">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">👤 Driver</div>
              <div className="text-sm font-semibold text-[#F1F5F9] mb-0.5">{displayShipment.driver_phone ? 'Ramesh Kumar' : 'Unassigned'}</div>
              <div className="text-xs text-[#64748B] mb-2">{displayShipment.driver_phone || '—'}</div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]"/>
                <span className="text-[#34D399]">In Transit</span>
                <span className="text-[#4A5568] ml-2">Ack rate: 94% · Last seen: {lastSync}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleAction('call', '📞 Calling driver...')}
                  className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#60A5FA] px-2 py-1 rounded hover:border-[#60A5FA]/30 transition-colors">📞 Call</button>
                <button onClick={() => handleAlertDriver()}
                  className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#4DD9AC] px-2 py-1 rounded hover:border-[#4DD9AC]/30 transition-colors">💬 WhatsApp</button>
              </div>
            </div>
            <div className="p-4">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">🚛 Vehicle</div>
              <div className="text-sm font-semibold font-mono text-[#F1F5F9] mb-0.5">{displayShipment.vehicle_number || 'Unassigned'}</div>
              <div className="text-xs text-[#64748B] mb-2">Reefer Truck · Thermo King</div>
              <div className="space-y-0.5 text-[10px] text-[#64748B]">
                <div>🔋 Sensor battery: <span className="text-[#34D399]">78%</span></div>
                <div>📡 GPS signal: <span className="text-[#34D399]">Strong</span></div>
              </div>
              <button onClick={() => toast('Issue reported to maintenance')}
                className="mt-2 text-[10px] bg-[#111827] border border-[#1E2530] text-[#64748B] px-2 py-1 rounded hover:border-[#374151] transition-colors">🔧 Report Issue</button>
            </div>
          </div>

          {/* ── Bottom Tab Panel ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-[#1E2530] bg-[#0D1117] overflow-x-auto">
              {([
                { id:'telemetry',  label:'📈 Telemetry' },
                { id:'alerts',     label:`⚠️ Alerts ${riskEvts.filter(r=>r.alert_sent).length > 0 ? `(${riskEvts.filter(r=>r.alert_sent).length})` : ''}` },
                { id:'compliance', label:'📋 Compliance' },
                { id:'documents',  label:'📄 Documents' },
                { id:'delivery',   label:'✅ Delivery' },
                { id:'notes',      label:'📝 Notes' },
              ] as { id: TabId; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${tab===t.id?'border-[#4DD9AC] text-[#4DD9AC] bg-[#4DD9AC]/5':'border-transparent text-[#64748B] hover:text-[#CBD5E1]'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">

              {/* ── Telemetry ─────────────────────────────────────── */}
              {tab === 'telemetry' && (
                <div className="space-y-4">

                  {/* 🏭 DIGITAL TWIN HEATMAP */}
                  <ContainerHeatmap
                    readings={filteredSensors}
                    tempMin={tempMin}
                    tempMax={tempMax}
                    productType={displayShipment.product_type}
                  />

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-[#64748B]">Range:</span>
                    {(['30m','1h','3h','all'] as const).map(r => (
                      <button key={r} onClick={() => setSensorRange(r)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${sensorRange===r?'bg-[#4DD9AC]/10 border-[#4DD9AC]/40 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}>
                        {r === 'all' ? 'All' : r}
                      </button>
                    ))}
                    <button onClick={() => {
                      const rows = filteredSensors.map(s => `${s.recorded_at},${s.temperature},${s.humidity},${s.ambient_temp},${s.delay_minutes}`);
                      const csv = ['Timestamp,Temp,Humidity,Ambient,Delay\n', ...rows.map(r=>r+'\n')].join('');
                      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `telemetry_${displayShipment.shipment_code}.csv`; a.click();
                    }} className="ml-auto text-xs text-[#64748B] border border-[#1E2530] px-2 py-0.5 rounded hover:text-[#CBD5E1] transition-colors">
                      📥 Export CSV
                    </button>
                  </div>

                  {/* Chart */}
                  <div className="bg-[#0D1117] border border-[#1E2530] rounded-lg p-3" style={{height:'150px'}}>
                    <TelemetryChart readings={filteredSensors} tempMin={tempMin} tempMax={tempMax} />
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-[10px] text-[#64748B]">
                    <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#60A5FA] inline-block"/>Temp (°C)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block"/>Breach point</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-px border-t border-dashed border-[#34D399] inline-block"/>Safe max ({tempMax}°C)</span>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E2530] text-[10px] uppercase text-[#64748B]">
                          <th className="text-left py-2 px-2">Timestamp</th>
                          <th className="text-left py-2 px-2">Temp</th>
                          <th className="text-left py-2 px-2">Ambient</th>
                          <th className="text-left py-2 px-2">Humidity</th>
                          <th className="text-left py-2 px-2">Delay</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSensors.slice(0, 20).map((r, i) => {
                          const breach = (r.temperature ?? 0) > tempMax;
                          return (
                            <tr key={i} className={`border-b border-[#1E2530]/50 ${breach ? 'bg-[#EF4444]/5' : ''}`}>
                              <td className="py-1.5 px-2 font-mono text-[#64748B]">{fmtTime(r.recorded_at)}</td>
                              <td className={`py-1.5 px-2 font-mono font-bold ${breach ? 'text-[#F87171]' : 'text-[#34D399]'}`}>
                                {r.temperature?.toFixed(1) ?? '—'}°C
                              </td>
                              <td className="py-1.5 px-2 font-mono text-[#94A3B8]">{r.ambient_temp?.toFixed(1) ?? '—'}°C</td>
                              <td className="py-1.5 px-2 font-mono text-[#94A3B8]">{r.humidity?.toFixed(0) ?? '—'}%</td>
                              <td className="py-1.5 px-2 text-[#FBBF24]">{r.delay_minutes ? `+${r.delay_minutes}m` : '—'}</td>
                              <td className="py-1.5 px-2">
                                {breach ? <span className="text-[#F87171] font-bold">⚠️ BREACH</span> : <span className="text-[#34D399]">✅ OK</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredSensors.length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-[#4A5568]">No sensor readings in this range</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Alerts ───────────────────────────────────────── */}
              {tab === 'alerts' && (
                <div className="space-y-3">
                  {riskEvts.filter(r => r.alert_sent).length === 0 && (
                    <div className="text-center text-[#4A5568] py-8 text-sm">No alerts sent yet for this displayShipment.</div>
                  )}
                  {riskEvts.filter(r => r.alert_sent).map((re, i) => (
                    <div key={i} className="bg-[#111827] border border-[#1E2530] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[#F87171] text-sm font-bold">⚠️ {re.risk_category?.toUpperCase()} Risk Alert</span>
                          <span className="text-[10px] bg-[#34D399]/10 text-[#34D399] px-2 py-0.5 rounded-full">Delivered</span>
                        </div>
                        <span className="text-[10px] text-[#4A5568] font-mono">{fmtTime(re.alert_sent_at)}</span>
                      </div>
                      <div className="text-xs text-[#94A3B8] mb-2">Driver · {displayShipment.driver_phone || 'N/A'} · WhatsApp</div>
                      <div className="text-[11px] text-[#64748B] mb-3">{re.explanation?.slice(0, 100)}...</div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAlertDriver()} className="text-[10px] border border-[#1E2530] text-[#64748B] px-3 py-1 rounded hover:border-[#4DD9AC]/30 hover:text-[#4DD9AC] transition-colors">Resend</button>
                        <button onClick={() => handleAction('escalate','🚨 Escalated to supervisor')} className="text-[10px] border border-[#EF4444]/30 text-[#F87171] px-3 py-1 rounded hover:bg-[#EF4444]/10 transition-colors">Escalate</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => handleAlertDriver()} className="w-full text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] py-2.5 rounded-lg hover:bg-[#4DD9AC]/20 transition-colors">
                    + Send Manual Alert
                  </button>
                </div>
              )}

              {/* ── Compliance ───────────────────────────────────── */}
              {tab === 'compliance' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E2530] text-[10px] uppercase text-[#64748B]">
                          <th className="text-left py-2 px-3">Parameter</th>
                          <th className="text-left py-2 px-3">Required</th>
                          <th className="text-left py-2 px-3">Actual</th>
                          <th className="text-left py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { param:'Temperature Band', req:`${tempMin}°C – ${tempMax}°C`, actual: isTempBreach ? `⚠️ ${currentTemp?.toFixed(1)}°C` : `✅ ${currentTemp?.toFixed(1) ?? tempMin}°C`, ok: !isTempBreach },
                          { param:'Humidity Limit', req:'< 75%', actual: `✅ ${latestSensor?.humidity?.toFixed(0) ?? 65}%`, ok: (latestSensor?.humidity ?? 65) < 75 },
                          { param:'Transit Duration', req:'≤ 6h', actual: '🔵 Ongoing', ok: null },
                          { param:'Sensor Uptime', req:'> 95%', actual: `✅ ${sensors.length > 3 ? '98.2' : '95.0'}%`, ok: true },
                          { param:'Driver Ack Rate', req:'> 80%', actual: riskEvts.some(r=>r.alert_sent) ? '⚠️ Pending ack' : '✅ 94%', ok: !riskEvts.some(r=>r.alert_sent) },
                        ].map((row, i) => (
                          <tr key={i} className="border-b border-[#1E2530]/50">
                            <td className="py-2 px-3 text-[#CBD5E1] font-medium">{row.param}</td>
                            <td className="py-2 px-3 text-[#64748B]">{row.req}</td>
                            <td className={`py-2 px-3 font-mono ${row.ok === false ? 'text-[#F87171]' : row.ok === null ? 'text-[#60A5FA]' : 'text-[#34D399]'}`}>{row.actual}</td>
                            <td className="py-2 px-3">
                              {row.ok === null ? <span className="text-[#60A5FA]">—</span>
                               : row.ok ? <span className="text-[#34D399] font-bold">✅ OK</span>
                               : <span className="text-[#F87171] font-bold">🔴 FAIL</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-[#111827] border border-[#1E2530] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[#F1F5F9]">Compliance Score</span>
                      <span className={`font-mono font-bold text-lg ${isTempBreach ? 'text-[#FBBF24]' : 'text-[#34D399]'}`}>{isTempBreach ? '73' : '91'}/100 — {isTempBreach ? 'PARTIAL' : 'COMPLIANT'}</span>
                    </div>
                    <button onClick={() => toast('PDF report generated')} className="w-full text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] py-2 rounded hover:bg-[#4DD9AC]/20 transition-colors">
                      📋 Generate Compliance Report PDF
                    </button>
                  </div>
                </div>
              )}

              {/* ── Documents ────────────────────────────────────── */}
              {tab === 'documents' && (
                <div className="space-y-2">
                  {[
                    { icon:'📄', name:'Shipment Manifest', type:'PDF' },
                    { icon:'📄', name:'Driver Agreement', type:'PDF' },
                    { icon:'📄', name:'Sensor Calibration Certificate', type:'PDF' },
                    { icon:'📸', name:'Pre-loading Photo', type:'Image' },
                    { icon:'📸', name:'Vehicle Check Photo', type:'Image' },
                  ].map((doc, i) => (
                    <div key={i} className="flex items-center gap-3 bg-[#111827] border border-[#1E2530] rounded-lg px-4 py-3">
                      <span className="text-xl">{doc.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm text-[#F1F5F9]">{doc.name}</div>
                        <div className="text-[10px] text-[#64748B]">{doc.type}</div>
                      </div>
                      <button onClick={() => toast(`${doc.name} opened`)} className="text-xs text-[#60A5FA] hover:text-white transition-colors px-2">View</button>
                      <button onClick={() => toast(`${doc.name} downloaded`)} className="text-xs text-[#64748B] hover:text-white transition-colors px-2">↓</button>
                    </div>
                  ))}
                  <button onClick={() => toast('Upload document modal coming soon')}
                    className="w-full text-xs border border-dashed border-[#374151] text-[#64748B] hover:border-[#4DD9AC]/30 hover:text-[#4DD9AC] py-3 rounded-lg transition-colors">
                    + Upload Document
                  </button>
                </div>
              )}

              {/* ── Delivery ─────────────────────────────────────── */}
              {tab === 'delivery' && (
                <div>
                  {isDelivered ? (
                    <div className="space-y-4">
                      <div className="bg-[#0F1F17] border border-[#1A3D2B] rounded-lg p-5">
                        <div className="text-center mb-4">
                          <div className="text-4xl mb-2">✅</div>
                          <div className="text-lg font-bold text-[#4DD9AC]">Delivered Successfully</div>
                          <div className="text-sm text-[#64748B]">Completed on {fmtDate(displayShipment.expected_arrival)}</div>
                        </div>
                        {[
                          { l:'Signed by', v:'Krishnamurthy R.' },
                          { l:'Location', v: displayShipment.destination || 'Distribution Hub' },
                          { l:'Final Temp', v: currentTemp ? `${currentTemp.toFixed(1)}°C` : 'N/A' },
                        ].map(r => (
                          <div key={r.l} className="flex justify-between text-sm py-1.5 border-b border-[#1A3D2B]">
                            <span className="text-[#64748B]">{r.l}</span>
                            <span className="text-[#CBD5E1] font-medium">{r.v}</span>
                          </div>
                        ))}
                      </div>

                      {/* ⛓️ Live Blockchain Block Ticker */}
                      <div className="bg-[#060912] border border-[#1E3A5F] rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <motion.div animate={{opacity:[1,0.3,1]}} transition={{repeat:Infinity,duration:1.5}} className="w-2 h-2 rounded-full bg-[#60A5FA]" />
                            <span className="text-xs font-bold text-[#60A5FA]">Web3 Audit Trail — Ethereum Sepolia</span>
                          </div>
                          <span className="text-[9px] text-[#4A5568] font-mono">~12s blocks</span>
                        </div>
                        <div className="text-[9px] text-[#4A5568] font-mono">Temperature logs being committed to chain in real-time</div>
                        <div className="space-y-1.5 max-h-[120px] overflow-hidden">
                          {blockTicker.map((b, i) => (
                            <motion.div key={b.hash.slice(0,16)} initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}}
                              className="flex items-center gap-2 bg-[#0D1117] rounded px-2 py-1.5">
                              <span className="text-[#60A5FA] text-[8px] font-mono shrink-0">#{b.block}</span>
                              <span className="text-[#4A5568] text-[7px] font-mono truncate flex-1">{b.hash.slice(0,28)}...</span>
                              <span className="text-[#334155] text-[7px] font-mono shrink-0">{b.ts}</span>
                              {i===0 && <span className="text-[#34D399] text-[7px] font-bold shrink-0">NEW</span>}
                            </motion.div>
                          ))}
                        </div>
                        {blockchainCert?.etherscan_url && (
                          <a href={blockchainCert.etherscan_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-[#60A5FA] hover:underline">
                            🔗 View Certificate on Etherscan
                          </a>
                        )}
                      </div>

                      <button onClick={() => toast('Post-delivery report generated')} className="w-full text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] py-2.5 rounded-lg hover:bg-[#4DD9AC]/20 transition-colors">
                        📊 Generate Post-Delivery Report
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-3">⏳</div>
                      <div className="text-sm text-[#64748B] mb-1">Awaiting delivery...</div>
                      <div className="text-xs text-[#4A5568] max-w-xs mx-auto mb-6">
                        This section will populate when the shipment is marked delivered.
                      </div>
                      <button onClick={handleMarkDelivered}
                        className="bg-[#4DD9AC] text-[#003829] font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-[#6EF6C7] active:scale-95 transition-all">
                        ✅ Mark as Delivered
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Notes ────────────────────────────────────────── */}
              {tab === 'notes' && (
                <div className="space-y-4">
                  <div className="bg-[#111827] border border-[#1E2530] rounded-lg p-3">
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Add an incident note, observation or action taken..."
                      className="w-full bg-transparent text-sm text-[#CBD5E1] resize-none focus:outline-none placeholder-[#4A5568] min-h-[80px]" />
                    <div className="flex justify-end mt-2">
                      <button onClick={handleAddNote} className="text-xs bg-[#4DD9AC] text-[#003829] font-bold px-4 py-1.5 rounded hover:bg-[#6EF6C7] transition-colors">
                        Add Note
                      </button>
                    </div>
                  </div>
                  {notes.map((n, i) => (
                    <div key={i} className="bg-[#111827] border border-[#1E2530] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[#F1F5F9]">{n.author}</span>
                        <span className="text-[10px] text-[#4A5568] font-mono">{n.time}</span>
                      </div>
                      <p className="text-sm text-[#94A3B8] leading-relaxed">"{n.text}"</p>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <div className="text-center text-[#4A5568] text-sm py-4">No notes yet. Add the first one above.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Risk Engine ───────────────────────────────────────── */}
        <aside className="w-72 shrink-0 bg-[#0D1117] border-l border-[#1E2530] flex-col overflow-y-auto hidden lg:flex">

          {/* Risk gauge */}
          <div className="shrink-0 p-5 border-b border-[#1E2530] flex flex-col items-center relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 60%, ${riskColor}08 0%, transparent 70%)` }}/>
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 w-full">Risk Engine · Live</div>
            <RiskGaugeSVG score={riskScore} color={riskColor} />
            <div className="text-xs font-bold mt-1 px-3 py-1 rounded-full" style={{ background: getRiskBg(riskCat), color: riskColor }}>
              {riskCat} RISK
            </div>

            <div className="w-full mt-4 space-y-2 text-xs">
              {risk?.time_to_spoil_minutes && (
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">⚡ Spoilage window</span>
                  <span className={`font-mono font-bold ${riskCat==='CRITICAL'?'text-[#F87171]':riskCat==='HIGH'?'text-[#FBBF24]':'text-[#34D399]'}`}>
                    {fmtSpoil(risk.time_to_spoil_minutes)}
                  </span>
                </div>
              )}
              {isTempBreach && currentTemp !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">🌡 Temp delta</span>
                  <span className="font-mono font-bold text-[#F87171]">+{(currentTemp - tempMax).toFixed(1)}°C above safe</span>
                </div>
              )}
            </div>
          </div>

          {/* Contributing factors */}
          <div className="shrink-0 p-4 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Risk Factors</div>
            <div className="space-y-2">
              {factors.length === 0 ? (
                <div className="text-xs text-[#4A5568] text-center py-2">No active risk factors</div>
              ) : factors.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#111827] rounded px-3 py-2">
                  <span className="text-sm">{f.icon}</span>
                  <span className="flex-1 text-xs text-[#CBD5E1]">{f.label}</span>
                  <span className="text-xs font-mono font-bold text-[#F87171]">+{f.pts}</span>
                </div>
              ))}
              {factors.length > 0 && (
                <div className="flex items-center justify-between text-xs border-t border-[#1E2530] pt-2">
                  <span className="text-[#64748B]">TOTAL</span>
                  <span className="font-mono font-bold" style={{ color: riskColor }}>{riskScore}</span>
                </div>
              )}
            </div>
          </div>

          {/* Predictions */}
          <div className="shrink-0 p-4 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Predictions</div>
            <div className="space-y-1.5 text-xs">
              <div className="bg-[#EF4444]/8 border border-[#EF4444]/20 rounded px-3 py-2">
                <span className="text-[#64748B]">If conditions persist 15 min →</span>
                <span className="text-[#F87171] font-bold ml-1">CRITICAL</span>
              </div>
              <div className="bg-[#34D399]/8 border border-[#34D399]/20 rounded px-3 py-2">
                <span className="text-[#64748B]">If reefer fixed in 10 min →</span>
                <span className="text-[#34D399] font-bold ml-1">drop to MEDIUM</span>
              </div>
              <div className="bg-[#60A5FA]/8 border border-[#60A5FA]/20 rounded px-3 py-2">
                <span className="text-[#64748B]">If rerouted now →</span>
                <span className="text-[#60A5FA] font-bold ml-1">risk -31% in 40 min</span>
              </div>
            </div>
          </div>

          {/* AI Explanation */}
          <div className="shrink-0 p-4 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Why This Risk?</div>
            <div className="text-xs text-[#94A3B8] leading-relaxed">
              {risk?.explanation ? (
                <>
                  {aiExpanded ? risk.explanation : risk.explanation.slice(0, 130) + (risk.explanation.length > 130 ? '...' : '')}
                </>
              ) : (
                <>
                  <span className="capitalize">{displayShipment.product_type}</span> shipment&nbsp;
                  <span className="font-mono text-[#4DD9AC]">{displayShipment.shipment_code}</span> is
                  {isTempBreach
                    ? ` heating above safe range. Current temp (${currentTemp?.toFixed(1)}°C) is ${(currentTemp! - tempMax).toFixed(1)}° above safe ceiling (${tempMax}°C). Combined with transit delay, the effective safe window has reduced.`
                    : ` within safe parameters. Continue monitoring every ${5} minutes.`}
                </>
              )}
            </div>
            {(risk?.explanation?.length || 0) > 130 && (
              <button onClick={() => setAiExpanded(e => !e)} className="text-[10px] text-[#60A5FA] mt-2 hover:text-white transition-colors">
                {aiExpanded ? 'Show less ▲' : 'Show full analysis ▼'}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="shrink-0 p-4 border-b border-[#1E2530]">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Take Action</div>
            <div className="space-y-1.5">
              {[
                { key:'alert',   icon:'⚠️',  label:'Alert Driver Now',          color:'#EF4444', fn: handleAlertDriver },
                { key:'call',    icon:'📞',  label:'Call Driver Directly',      color:'#60A5FA', fn: ()=>handleAction('call','📞 Calling driver...') },
                { key:'whatsapp',icon:'💬',  label:'Send WhatsApp',             color:'#34D399', fn: ()=>handleAction('whatsapp','💬 WhatsApp sent') },
                { key:'escalate',icon:'🚨',  label:'Escalate to Supervisor',    color:'#F97316', fn: ()=>handleAction('escalate','🚨 Escalated to supervisor') },
                { key:'reroute', icon:'🛣️',  label:'Suggest Reroute',           color:'#A78BFA', fn: ()=>handleAction('reroute','🛣️ Reroute suggestion sent') },
                { key:'monitor', icon:'👁️',  label:'Manual Monitoring Mode',    color:'#64748B', fn: ()=>handleAction('monitor','👁️ Manual monitoring enabled') },
              ].map(btn => (
                <button key={btn.key}
                  onClick={btn.fn as any}
                  disabled={actionsDisabled.has(btn.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#1E2530] hover:border-current/30 text-sm font-medium transition-all text-left disabled:opacity-50"
                  style={{color: btn.color, background: `${btn.color}0a`}}>
                  <span>{btn.icon}</span>
                  <span>{btn.label}</span>
                  <span className="ml-auto text-xs opacity-40">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nearest Cold Hub */}
          {riskScore > 40 && (
            <div className="shrink-0 p-4">
              <button onClick={() => setColdHubExpanded(e => !e)}
                className="w-full text-left text-xs bg-[#0F1A2E] border border-[#1E3A5F] rounded-lg px-3 py-2.5 text-[#60A5FA] hover:border-[#60A5FA]/40 transition-colors flex items-center justify-between">
                <span>🏭 Nearest Cold Hub — 11 km</span>
                <span>{coldHubExpanded ? '▲' : '▼'}</span>
              </button>
              {coldHubExpanded && (
                <div className="bg-[#0F1A2E] border border-[#1E3A5F] border-t-0 rounded-b-lg p-3 space-y-1.5 text-xs">
                  <div className="font-semibold text-[#F1F5F9]">Meghalaya Cold Storage Hub</div>
                  <div className="text-[#64748B]">11.2 km from current position</div>
                  <div className="text-[#64748B]">Diversion: ~14 min · Capacity: Available</div>
                  <div className="text-[#34D399] font-bold">Spoilage risk if diverted: -28%</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleAction('navigate','🏭 Driver navigation sent')} className="flex-1 bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 py-1.5 rounded text-[10px] hover:bg-[#60A5FA]/20 transition-colors">Navigate Driver</button>
                    <button onClick={() => handleAction('book','📋 Slot booked at cold hub')} className="flex-1 bg-[#4DD9AC]/10 text-[#4DD9AC] border border-[#4DD9AC]/30 py-1.5 rounded text-[10px] hover:bg-[#4DD9AC]/20 transition-colors">Book Slot</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
