import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getShipments, type Shipment } from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import {
  Search, Bell, Map, Settings, Package, Truck, LayoutDashboard, Activity, CheckCircle, AlertTriangle, ShieldAlert,
  Navigation, Layers, ChevronDown, Zap, Shield, ThermometerSnowflake, Route, Eye, Clock, BarChart3, Database, MessageSquareWarning, ArrowRight, X, Filter, SlidersHorizontal, Download, MoreVertical, ExternalLink, FileText, Brain, Link, TrendingUp
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────
type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ViewMode  = 'list' | 'board' | 'route';
type SortKey   = 'risk' | 'eta' | 'spoil' | 'id' | 'sync' | 'sla' | 'ai_predict';

// ── Blockchain Oracle helpers ─────────────────────────────────────────────────
// Deterministic per-shipment hash → stable across renders
function getContractAddress(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) { h = (h * 31 + code.charCodeAt(i)) >>> 0; }
  return '0x' + h.toString(16).padStart(8, 'a') + '...c' + (h % 999).toString().padStart(3,'0');
}

function getBlockchainStatus(s: Shipment): 'LOCKED' | 'BREACH' | 'PENDING' {
  const risk = s.current_risk?.risk_category?.toUpperCase();
  if (risk === 'CRITICAL') return 'BREACH';
  if (!s.vehicle_number) return 'PENDING';
  return 'LOCKED';
}

// ── AI Failure Prediction ─────────────────────────────────────────────────────
interface AIPrediction {
  shipmentId: string;
  failureRisk: number;    // 0-100
  failureReason: string;
  timeToFail: string;
}

function computeAIPredictions(ships: Shipment[]): Record<string, AIPrediction> {
  const map: Record<string, AIPrediction> = {};
  ships.forEach(s => {
    const risk = s.current_risk?.risk_score ?? 0;
    const spoil = s.current_risk?.time_to_spoil_minutes ?? 9999;
    // Simulate multi-factor score: risk + spoil urgency + vehicle age proxy
    let score = Math.round(risk * 100);
    if (spoil < 60) score = Math.min(100, score + 30);
    else if (spoil < 120) score = Math.min(100, score + 15);
    // Deterministic jitter per vehicle for realism
    const vHash = (s.vehicle_number || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    score = Math.min(100, Math.max(0, score + (vHash % 20) - 10));

    const reasons = [
      score > 70 ? 'Compressor degradation pattern' : null,
      spoil < 90 ? 'Thermal window closing fast' : null,
      risk > 0.6 ? 'Repeated sensor anomalies' : null,
      score > 50 ? 'Heatwave correlation detected' : null,
      'Normal wear detected',
    ].filter(Boolean) as string[];

    const timeToFail = score > 80 ? '< 1 hour' : score > 60 ? '1–2 hours' : score > 40 ? '2–4 hours' : '> 4 hours';

    map[s.id] = {
      shipmentId: s.id,
      failureRisk: score,
      failureReason: reasons[0],
      timeToFail,
    };
  });
  return map;
}

const RISK_META: Record<RiskLevel, { color: string; bg: string; border: string; rowBg: string }> = {
  CRITICAL: { color: '#F87171', bg: 'rgba(239,68,68,0.12)', border: '#EF4444', rowBg: 'rgba(239,68,68,0.04)' },
  HIGH:     { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: '#F59E0B', rowBg: 'rgba(251,191,36,0.03)' },
  MEDIUM:   { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: '#3B82F6', rowBg: '' },
  LOW:      { color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: '#10B981', rowBg: '' },
};

const STAGE_META: Record<string, { color: string; label: string }> = {
  active:       { color: '#4DD9AC', label: 'In Transit' },
  pickup:       { color: '#6B7280', label: 'Pickup Pending' },
  loaded:       { color: '#60A5FA', label: 'Loaded' },
  watchlist:    { color: '#FBBF24', label: 'Watchlist' },
  near_dest:    { color: '#A78BFA', label: 'Near Destination' },
  delivered:    { color: '#34D399', label: 'Delivered' },
};

function getRisk(s: Shipment): RiskLevel {
  const cat = s.current_risk?.risk_category?.toUpperCase();
  if (cat === 'CRITICAL' || cat === 'HIGH' || cat === 'MEDIUM' || cat === 'LOW') return cat as RiskLevel;
  return 'LOW';
}

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  dairy: <ThermometerSnowflake size={14} />, milk: <ThermometerSnowflake size={14} />,
  seafood: <ThermometerSnowflake size={14} />, fish: <ThermometerSnowflake size={14} />,
  frozen: <ThermometerSnowflake size={14} />, meat: <ThermometerSnowflake size={14} />,
  produce: <Package size={14} />, vegetables: <Package size={14} />, pharma: <Activity size={14} />,
  fruits: <Package size={14} />, other: <Package size={14} />,
};

function getIcon(type: string): React.ReactNode {
  return PRODUCT_ICONS[type?.toLowerCase()] || <Package size={16} />;
}

function formatSpoil(mins?: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTemp(s: Shipment) {
  const r = getRisk(s);
  const col = r === 'CRITICAL' ? '#F87171' : r === 'HIGH' ? '#FBBF24' : '#34D399';
  const temp = s.current_risk?.temperature;
  return { value: temp != null ? `${temp.toFixed(1)}°C` : '—', color: col };
}


// NE India route groupings for cluster view
const ROUTE_CLUSTERS = [
  { region: 'Northeast India', routes: [
    { name: 'Guwahati → Shillong', origins: ['guwahati'], dests: ['shillong'] },
    { name: 'Guwahati → Dimapur', origins: ['guwahati'], dests: ['dimapur'] },
    { name: 'Jorhat → Kohima',    origins: ['jorhat'],   dests: ['kohima'] },
    { name: 'Silchar → Imphal',   origins: ['silchar'],  dests: ['imphal'] },
    { name: 'Tezpur → Itanagar',  origins: ['tezpur'],   dests: ['itanagar'] },
    { name: 'Dibrugarh → Itanagar', origins: ['dibrugarh'], dests: ['itanagar'] },
  ]},
];

// ── Main component ────────────────────────────────────────────────────────────
export function ActiveShipments() {
  const navigate = useNavigate();

  // Data
  const [shipments, setShipments]   = useState<Shipment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [connected, setConnected]   = useState(true);

  // View
  const [view, setView]             = useState<ViewMode>('list');
  const [sortBy, setSortBy]         = useState<SortKey>('risk');
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort]     = useState(false);

  // Filters
  const [filterRisk, setFilterRisk]       = useState<string[]>([]);
  const [filterProduct, setFilterProduct] = useState<string[]>([]);
  const [filterStage, setFilterStage]     = useState<string[]>([]);
  const [search, setSearch]               = useState('');

  // Selection
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [toasts, setToasts]       = useState<Array<{id:string;msg:string;type:'ok'|'warn'}>>([]);

  // AI Predictive Sort state
  const [aiPredictActive, setAiPredictActive] = useState(false);
  const [aiLoading,       setAiLoading]       = useState(false);
  const [aiPredictions,   setAiPredictions]   = useState<Record<string, AIPrediction>>({});

  // Context menu
  const [ctxMenu, setCtxMenu]     = useState<{x:number;y:number;ship:Shipment}|null>(null);

  // Expanded clusters
  const [expanded, setExpanded]   = useState<Set<string>>(new Set(['Northeast India']));

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const addToast = (msg: string, type: 'ok'|'warn' = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, {id, msg, type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  // Realtime
  const { data: rtActiveShipments } = useRealtimeData<any>('/active_shipments');

  const fetchData = useCallback(async () => {
    try {
      const data = await getShipments('active');
      setShipments(data);
      setConnected(true);
    } catch { setConnected(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    // Polling removed in favor of Firebase RTDB
  }, [fetchData]);

  useEffect(() => {
    const close = () => { setCtxMenu(null); setShowSort(false); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // ── Merge Realtime Data ───────────────────────────────────────────────────
  const displayShipments = React.useMemo(() => {
    if (!rtActiveShipments) return shipments;
    return shipments.map(s => {
      const rt = rtActiveShipments[s.shipment_code];
      if (!rt) return s;
      return {
        ...s,
        status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage.toLowerCase(),
        current_location: rt.current_location || s.current_location,
        current_risk: {
          ...s.current_risk,
          risk_score: rt.risk_score / 100,
          risk_category: rt.risk_category,
          time_to_spoil_minutes: rt.spoilage_window_min,
        }
      } as Shipment;
    });
  }, [shipments, rtActiveShipments]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = displayShipments.filter(s => {
    const q = search.toLowerCase();
    if (q && ![s.shipment_code, s.product_type, s.origin||'', s.destination||''].some(v => v.toLowerCase().includes(q))) return false;
    if (filterRisk.length && !filterRisk.includes(getRisk(s))) return false;
    if (filterProduct.length && !filterProduct.includes(s.product_type?.toLowerCase())) return false;
    if (filterStage.length && !filterStage.includes(s.status)) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'ai_predict') {
      const pa = (aiPredictions as any)[a.id]?.failureRisk ?? 0;
      const pb = (aiPredictions as any)[b.id]?.failureRisk ?? 0;
      return pb - pa;
    }
    if (sortBy === 'risk') { const o = {CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}; return (o[getRisk(a)]??9)-(o[getRisk(b)]??9); }
    if (sortBy === 'spoil') return (a.current_risk?.time_to_spoil_minutes||9999)-(b.current_risk?.time_to_spoil_minutes||9999);
    if (sortBy === 'id') return a.shipment_code.localeCompare(b.shipment_code);
    return 0;
  });

  const critical = filtered.filter(s => getRisk(s) === 'CRITICAL');
  const high     = filtered.filter(s => getRisk(s) === 'HIGH');

  // Active filter chips
  const chips: Array<{label:string; clear:()=>void}> = [
    ...filterRisk.map(r => ({ label: `Risk: ${r}`, clear: () => setFilterRisk(f => f.filter(x => x !== r)) })),
    ...filterProduct.map(p => ({ label: `Product: ${p}`, clear: () => setFilterProduct(f => f.filter(x => x !== p)) })),
    ...(search ? [{ label: `Search: "${search}"`, clear: () => setSearch('') }] : []),
  ];

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(s => s.id)));
  }

  function exportCSV() {
    const rows = filtered.filter(s => selected.size === 0 || selected.has(s.id));
    const csv  = ['Shipment ID,Product,Origin,Destination,Risk,Status,Blockchain,AI Failure Risk']
      .concat(rows.map(s => `${s.shipment_code},${s.product_type},${s.origin||''},${s.destination||''},${getRisk(s)},${s.status},${getBlockchainStatus(s)},${aiPredictions[s.id]?.failureRisk ?? 'N/A'}%`))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cargofy_shipments.csv'; a.click();
    addToast('Exported as CSV');
  }

  // ── AI Predict Sort handler ────────────────────────────────────────────────
  async function handleAIPredict() {
    setAiLoading(true);
    setAiPredictActive(true);
    setSortBy('ai_predict');
    addToast('🤖 BigQuery ML analyzing fleet telemetry…', 'warn');
    // Simulate async ML inference (1.5s)
    await new Promise(r => setTimeout(r, 1500));
    const predictions = computeAIPredictions(displayShipments);
    setAiPredictions(predictions);
    setAiLoading(false);
    addToast(`✅ AI sorted ${Object.keys(predictions).length} trucks by failure probability`);
  }

  function clearAIPredict() {
    setAiPredictActive(false);
    setSortBy('risk');
    setAiPredictions({});
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      {/* ── Toasts ─────────────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-xl animate-slide-in ${t.type==='ok'?'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]'}`}>{t.msg}</div>
        ))}
      </div>

      {/* ── Context menu ────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div className="fixed z-50 bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-2xl py-1 min-w-[200px]"
          style={{left:ctxMenu.x,top:ctxMenu.y}} onClick={e=>e.stopPropagation()}>
          {[
            { icon: <ExternalLink size={14} />, label:'Open Detail Page',    action:()=>navigate(`/shipments/${ctxMenu.ship.id}`) },
            { icon: <Map size={14} />, label:'Open Live Tracking',  action:()=>navigate('/live-tracking') },
            null,
            { icon: <AlertTriangle size={14} className="text-[#FBBF24]" />, label:'Send Driver Alert',   action:()=>{ addToast(`Alert sent to driver on ${ctxMenu.ship.shipment_code}`); setCtxMenu(null); } },
            { icon: <MessageSquareWarning size={14} />, label:'Send WhatsApp',       action:()=>{ addToast(`WhatsApp sent for ${ctxMenu.ship.shipment_code}`); setCtxMenu(null); } },
            null,
            { icon: <FileText size={14} />, label:'Add Incident Note',   action:()=>{ addToast('Note modal coming soon'); setCtxMenu(null); } },
            { icon: <Route size={14} />, label:'Suggest Reroute',     action:()=>navigate('/live-tracking') },
            null,
            { icon: <CheckCircle size={14} className="text-[#34D399]" />, label:'Mark as Delivered',   action:()=>{ addToast(`${ctxMenu.ship.shipment_code} marked delivered`); setCtxMenu(null); } },
            { icon: <Download size={14} />, label:'Export Shipment',     action:()=>exportCSV() },
          ].map((item, i) => item === null ? (
            <div key={i} className="border-b border-[#1E2530] my-1" />
          ) : (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#CBD5E1] hover:bg-[#1E2530] hover:text-white transition-colors">
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-14 bg-[#0A0D14] border-b border-[#1E2530] flex items-center px-4 gap-4 z-40">
        <div className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono cursor-pointer" onClick={()=>navigate('/dashboard')}>CARGOFY</div>
        <div className="relative flex-1 max-w-sm hidden md:block group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] group-focus-within:text-[#4DD9AC] transition-colors" />
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search shipment, product, route..." className="w-full bg-[#10131B] border border-[#1E2530] text-[#CBD5E1] text-sm pl-9 pr-4 py-1.5 rounded focus:outline-none focus:border-[#4DD9AC]/50 transition-colors placeholder-[#4A5568]" />
        </div>
        <div className="flex-1"/>
        <div className="hidden lg:flex items-center gap-2 text-[#4DD9AC] font-mono text-xs">
          <span className={`w-1.5 h-1.5 rounded-full ${connected?'bg-[#4DD9AC] animate-pulse':'bg-[#EF4444]'}`}/>
          {connected ? 'LIVE' : 'RECONNECTING'}
        </div>
        <button onClick={()=>navigate('/create-shipment')} className="bg-[#4DD9AC] text-[#003829] font-bold text-xs px-4 py-2 rounded hover:bg-[#6EF6C7] active:scale-95 transition-all flex items-center gap-1.5">
          <span>+</span><span className="hidden sm:inline">Create Shipment</span>
        </button>
        <button onClick={()=>{localStorage.removeItem('cargofy_authed');navigate('/login');}} className="w-8 h-8 rounded-full bg-[#4DD9AC]/20 border border-[#4DD9AC]/30 flex items-center justify-center text-[#4DD9AC] text-sm font-bold" title="Logout">R</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <aside className="shrink-0 w-[220px] bg-[#0D1117] border-r border-[#1E2530] flex-col hidden md:flex overflow-y-auto">
          <nav className="flex-1 py-3 space-y-0.5">
            {[
              {icon: <LayoutDashboard size={18} />, label:'Control Tower',href:'/dashboard'},
              null,
              {icon: <Package size={18} />, label:'Create Shipment',href:'/create-shipment'},
              {icon: <Truck size={18} />, label:'Active Shipments',href:'/active-shipments',active:true,badge:shipments.length},
              {icon: <Layers size={18} />, label:'Dispatch Queue',href:'/active-shipments'},
              null,
              {icon: <Navigation size={18} />, label:'Live Tracking',href:'/live-tracking'},
              {icon: <ShieldAlert size={18} />, label:'Risk & Interventions',href:'/risk',badge:(critical.length+high.length)||undefined,badgeRed:true},
              {icon: <Zap size={18} />, label:'Mobile IoT Node',href:'/mobile'},

              null,
              {icon: <BarChart3 size={18} />, label:'Analytics',href:'/cargofy-analytics'},
              {icon: <Database size={18} />, label:'Fleet & Drivers',href:'/fleet'},
              null,
              {icon: <Bell size={18} />, label:'Alerts Log',href:'/alerts-center'},
              {icon: <Settings size={18} />, label:'Settings',href:'/settings'},
            ].map((item, i) => item === null ? (
              <div key={i} className="px-4 pt-2 pb-0">
                <div className="border-t border-[#1E2530]"/>
              </div>
            ) : (
              <button key={item.label} onClick={()=>navigate(item.href!)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all text-left ${item.active?'bg-[#4DD9AC]/10 text-[#4DD9AC] border-l-2 border-[#4DD9AC]':'text-[#64748B] hover:bg-[#111827] hover:text-[#CBD5E1] border-l-2 border-transparent'}`}>
                <span className="flex items-center justify-center w-5 shrink-0">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeRed?'bg-[#EF4444]/20 text-[#F87171]':'bg-[#60A5FA]/20 text-[#60A5FA]'}`}>{item.badge}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-[#1E2530]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#34D399] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse"/>
              <span>99.2% uptime · All systems live</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#4DD9AC]/20 border border-[#4DD9AC]/40 flex items-center justify-center text-[#4DD9AC] text-xs font-bold">R</div>
              <div><div className="text-xs text-[#F1F5F9] font-medium">Ravi Kumar</div><div className="text-[10px] text-[#4DD9AC]">Ops Manager</div></div>
            </div>
          </div>
        </aside>

        {/* ── Main ──────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── Page header ──────────────────────────────────────────── */}
          <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-bold text-[#F1F5F9] flex items-center gap-3">
                  Active Shipments
                  <span className="text-sm font-mono bg-[#1E2530] text-[#94A3B8] px-2 py-0.5 rounded-full">{filtered.length} total</span>
                </h1>
                <div className="flex items-center gap-4 mt-1 text-sm">
                  <span className="text-[#F87171] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse"/>
                    {critical.length} CRITICAL
                  </span>
                  <span className="text-[#FBBF24]">·</span>
                  <span className="text-[#FBBF24]">{high.length} WATCHLIST</span>
                  <span className="text-[#64748B]">·</span>
                  <span className="text-[#34D399]">{filtered.length - critical.length - high.length} STABLE</span>
                </div>
              </div>

              {/* View mode toggle */}
              <div className="flex bg-[#111827] border border-[#1E2530] rounded-lg p-0.5">
                {(['list','board','route'] as ViewMode[]).map(m => (
                  <button key={m} onClick={()=>setView(m)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all capitalize flex items-center gap-1.5 ${view===m?'bg-[#4DD9AC] text-[#003829]':'text-[#64748B] hover:text-[#CBD5E1]'}`}>
                    {m === 'list' ? <><LayoutDashboard size={14}/> List</> : m === 'board' ? <><Layers size={14}/> Board</> : <><Route size={14}/> Routes</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={e=>{e.stopPropagation();setShowFilter(s=>!s);}}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition-all ${showFilter?'bg-[#4DD9AC]/10 border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#111827] border-[#1E2530] text-[#64748B] hover:text-[#CBD5E1]'}`}>
                <Filter size={14} /> Filter {chips.length > 0 && <span className="w-4 h-4 bg-[#4DD9AC] text-[#003829] rounded-full text-[9px] flex items-center justify-center font-bold">{chips.length}</span>}
              </button>

              <div className="relative">
                <button onClick={e=>{e.stopPropagation();setShowSort(s=>!s);}}
                  className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#1E2530] bg-[#111827] text-xs font-medium text-[#64748B] hover:text-[#CBD5E1] transition-all">
                  <SlidersHorizontal size={14} /> Sort
                </button>
                {showSort && (
                  <div className="absolute top-full left-0 mt-1 bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-2xl z-30 py-1 min-w-[220px]" onClick={e=>e.stopPropagation()}>
                    {([
                      {k:'risk',       l:'Risk Score (highest)'},
                      {k:'spoil',      l:'Time to Spoil (least)'},
                      {k:'eta',        l:'ETA (soonest)'},
                      {k:'id',         l:'Shipment ID'},
                      {k:'sync',       l:'Last Sensor Sync'},
                      {k:'sla',        l:'SLA Deadline'},
                    ] as {k:SortKey;l:string}[]).map(o => (
                      <button key={o.k} onClick={()=>{setSortBy(o.k);setShowSort(false);}}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${sortBy===o.k?'text-[#4DD9AC] bg-[#4DD9AC]/5':'text-[#CBD5E1] hover:bg-[#1E2530]'}`}>
                        {sortBy===o.k && '● '}{o.l}
                      </button>
                    ))}
                    <div className="border-t border-[#1E2530] mt-1 pt-1">
                      <button onClick={()=>{handleAIPredict();setShowSort(false);}}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                          sortBy==='ai_predict' ? 'text-[#A855F7] bg-[#A855F7]/10' : 'text-[#CBD5E1] hover:bg-[#1E2530]'
                        }`}>
                        <Brain size={13} className="text-[#A855F7]" />
                        🤖 AI Predictive Sort
                        <span className="ml-auto text-[10px] bg-[#A855F7]/20 text-[#A855F7] px-1.5 py-0.5 rounded">BigQuery ML</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Predict Quick Button */}
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={aiPredictActive ? clearAIPredict : handleAIPredict}
                disabled={aiLoading}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-bold transition-all ${
                  aiPredictActive
                    ? 'bg-[#A855F7]/15 border-[#A855F7]/50 text-[#C084FC]'
                    : 'bg-[#111827] border-[#7C3AED]/40 text-[#7C3AED] hover:bg-[#7C3AED]/10'
                } disabled:opacity-60`}>
                {aiLoading
                  ? <><Brain size={13} className="animate-pulse" /> Analyzing…</>
                  : aiPredictActive
                  ? <><X size={13} /> Clear AI Sort</>
                  : <><Brain size={13} /> AI Predict Failures</>}
              </motion.button>

              <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#1E2530] bg-[#111827] text-xs font-medium text-[#64748B] hover:text-[#CBD5E1] transition-all">
                <Download size={14} /> Export CSV
              </button>
              <button onClick={()=>navigate('/create-shipment')} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-xs font-medium text-[#4DD9AC] hover:bg-[#4DD9AC]/20 transition-all ml-auto">
                + Create Shipment
              </button>
            </div>

            {/* Active filter chips */}
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {chips.map((c,i) => (
                  <div key={i} className="flex items-center gap-1 bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] text-xs px-2 py-0.5 rounded-full">
                    {c.label} <button onClick={c.clear} className="hover:text-white transition-colors">✕</button>
                  </div>
                ))}
                <button onClick={()=>{setFilterRisk([]);setFilterProduct([]);setFilterStage([]);setSearch('');}} className="text-xs text-[#64748B] hover:text-[#F87171] transition-colors">Clear all</button>
              </div>
            )}
          </div>

          {/* ── Content area ─────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden relative">

            {/* AI Predict Banner */}
            <AnimatePresence>
              {aiPredictActive && !aiLoading && Object.keys(aiPredictions).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-r from-[#1a0b2e] to-[#110b2d] border-b border-[#7C3AED]/40 px-6 py-3 flex items-center gap-3"
                >
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                    <Brain size={16} className="text-[#A855F7]" />
                  </motion.div>
                  <div className="flex-1">
                    <span className="text-xs font-bold text-[#C084FC]">BigQuery ML Active</span>
                    <span className="text-xs text-[#7C3AED] ml-2">·</span>
                    <span className="text-xs text-[#94A3B8] ml-2">
                      Sorted by 2-hour failure probability. Top truck:{' '}
                      <span className="text-[#F87171] font-mono font-bold">
                        {filtered[0]?.vehicle_number || filtered[0]?.shipment_code || '—'}
                      </span>
                      {' '}has{' '}
                      <span className="text-[#F87171] font-bold">
                        {(aiPredictions as any)[filtered[0]?.id]?.failureRisk ?? 0}%
                      </span>
                      {' '}failure risk ({(aiPredictions as any)[filtered[0]?.id]?.failureReason})
                    </span>
                  </div>
                  <button onClick={clearAIPredict} className="text-[#64748B] hover:text-[#F87171] transition-colors text-lg">×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Filter drawer */}
            {showFilter && (
              <div className="shrink-0 w-72 bg-[#0D1117] border-r border-[#1E2530] overflow-y-auto p-5 space-y-5" onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#F1F5F9]">Filter Shipments</span>
                  <button onClick={()=>setShowFilter(false)} className="text-[#64748B] hover:text-white transition-colors">✕</button>
                </div>

                <FilterGroup label="Risk Level" options={['CRITICAL','HIGH','MEDIUM','LOW']} selected={filterRisk} onChange={setFilterRisk}
                  colors={{CRITICAL:'#EF4444',HIGH:'#FBBF24',MEDIUM:'#60A5FA',LOW:'#34D399'}} />

                <FilterGroup label="Product Type" options={['dairy','seafood','produce','frozen','pharma','fruits','meat']} selected={filterProduct} onChange={setFilterProduct} icons={PRODUCT_ICONS} />

                <FilterGroup label="Stage" options={['active','loaded','pickup','near_dest','delivered']} selected={filterStage} onChange={setFilterStage}
                  labels={{active:'In Transit',loaded:'Loaded',pickup:'Pickup Pending',near_dest:'Near Destination',delivered:'Delivered'}} />

                <div className="flex gap-2 pt-2">
                  <button onClick={()=>{setFilterRisk([]);setFilterProduct([]);setFilterStage([]);}} className="flex-1 py-2 text-xs border border-[#1E2530] text-[#64748B] hover:text-white rounded-lg transition-colors">Clear All</button>
                  <button onClick={()=>setShowFilter(false)} className="flex-1 py-2 text-xs bg-[#4DD9AC] text-[#003829] font-bold rounded-lg hover:bg-[#6EF6C7] transition-colors">Apply</button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-[#64748B] text-sm">Loading shipments...</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-[#64748B]">
                  <Package size={48} className="mb-3 opacity-50" />
                  <div className="text-sm">No shipments match your filters.</div>
                  <button onClick={()=>{setFilterRisk([]);setFilterProduct([]);setSearch('');}} className="mt-2 text-[#4DD9AC] text-sm underline">Clear filters</button>
                </div>
              ) : view === 'list' ? (
                <ListView filtered={filtered} selected={selected} onToggle={toggleSelect} onSelectAll={selectAll} navigate={navigate} addToast={addToast} setCtxMenu={setCtxMenu} />
              ) : view === 'board' ? (
                <BoardView filtered={filtered} navigate={navigate} addToast={addToast} setCtxMenu={setCtxMenu} />
              ) : (
                <RouteClusterView filtered={filtered} navigate={navigate} expanded={expanded} setExpanded={setExpanded} />
              )}
            </div>
          </div>

          {/* ── Bulk action bar ───────────────────────────────────────── */}
          {selected.size > 0 && (
            <div className="shrink-0 bg-[#0D231A] border-t border-[#4DD9AC]/30 px-6 py-3 flex items-center gap-3">
              <span className="text-sm text-[#4DD9AC] font-semibold shrink-0 flex items-center gap-1.5"><CheckCircle size={16}/> {selected.size} selected</span>
              <div className="flex-1 flex flex-wrap gap-2">
                {[
                  {icon: <Bell size={14}/>, l:'Alert All Drivers',  a:()=>{addToast(`Alerts sent to ${selected.size} drivers`);setSelected(new Set());}},
                  {icon: <ShieldAlert size={14}/>, l:'Escalate All',       a:()=>{addToast(`${selected.size} shipments escalated`,'warn');setSelected(new Set());}},
                  {icon: <Download size={14}/>, l:'Export Selected',    a:()=>{exportCSV();setSelected(new Set());}},
                  {icon: <CheckCircle size={14}/>, l:'Mark Delivered',     a:()=>{addToast(`${selected.size} shipments marked delivered`);setSelected(new Set());}},
                ].map(btn => (
                  <button key={btn.l} onClick={btn.a} className="flex items-center gap-1.5 text-xs bg-[#111827] border border-[#1E2530] text-[#CBD5E1] hover:border-[#4DD9AC]/40 hover:text-[#4DD9AC] px-3 py-1.5 rounded transition-all">{btn.icon}{btn.l}</button>
                ))}
              </div>
              <button onClick={()=>setSelected(new Set())} className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#F87171] transition-colors shrink-0"><X size={14}/> Cancel</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── LIST VIEW ─────────────────────────────────────────────────────────────────
function ListView({ filtered, selected, onToggle, onSelectAll, navigate, addToast, setCtxMenu }: {
  filtered: Shipment[]; selected: Set<string>; onToggle:(id:string)=>void; onSelectAll:()=>void;
  navigate:(p:string)=>void; addToast:(m:string,t?:'ok'|'warn')=>void;
  setCtxMenu:(m:{x:number;y:number;ship:Shipment}|null)=>void;
}) {
  const [hovered, setHovered] = useState<string|null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#0D1117] border-b border-[#1E2530] text-[10px] uppercase tracking-widest text-[#64748B]">
            <th className="w-10 px-4 py-3 text-left">
              <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={onSelectAll} className="accent-[#4DD9AC]" />
            </th>
            <th className="px-3 py-3 text-left font-semibold">Shipment ID</th>
            <th className="px-3 py-3 text-left font-semibold">Product</th>
            <th className="px-3 py-3 text-left font-semibold">Route</th>
            <th className="px-3 py-3 text-left font-semibold">Stage</th>
            <th className="px-3 py-3 text-left font-semibold">Risk</th>
            <th className="px-3 py-3 text-left font-semibold">Spoil Timer</th>
            <th className="px-3 py-3 text-left font-semibold">Live Temp</th>
            <th className="px-3 py-3 text-left font-semibold">Driver</th>
            <th className="px-3 py-3 text-left font-semibold">Vehicle</th>
            <th className="px-3 py-3 text-left font-semibold">🔗 Blockchain</th>
            <th className="px-3 py-3 text-left font-semibold">SLA</th>
            <th className="px-3 py-3 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(s => {
            const risk = getRisk(s);
            const rm   = RISK_META[risk];
            const temp = formatTemp(s);
            const isHovered  = hovered === s.id;
            const isSelected = selected.has(s.id);
            const stage = STAGE_META[s.status] || STAGE_META['active'];

            return (
              <tr
                key={s.id}
                className="border-b border-[#1E2530] cursor-pointer transition-colors relative group"
                style={{ background: isSelected ? 'rgba(77,217,172,0.05)' : rm.rowBg || undefined, borderLeft: `3px solid ${isHovered || isSelected ? rm.border : 'transparent'}` }}
                onMouseEnter={()=>setHovered(s.id)} onMouseLeave={()=>setHovered(null)}
                onClick={()=>navigate(`/shipments/${s.id}`)}
                onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,ship:s});}}
              >
                <td className="px-4 py-3.5" onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={()=>onToggle(s.id)} className="accent-[#4DD9AC]" />
                </td>
                <td className="px-3 py-3.5">
                  <span className="font-mono text-sm font-bold text-[#F1F5F9]">{s.shipment_code}</span>
                </td>
                <td className="px-3 py-3.5">
                  <span className="text-sm">{getIcon(s.product_type)}</span>
                  <span className="text-xs text-[#CBD5E1] ml-1.5 capitalize">{s.product_type}</span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="text-xs text-[#CBD5E1] max-w-[150px] truncate">
                    {s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:stage.color}}/>
                    <span className="text-xs text-[#94A3B8]">{stage.label}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{background:rm.bg,color:rm.color}}>
                    {risk}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span className={`text-sm font-mono font-bold ${risk==='CRITICAL'?'text-[#F87171]':risk==='HIGH'?'text-[#FBBF24]':'text-[#CBD5E1]'}`}>
                    {formatSpoil(s.current_risk?.time_to_spoil_minutes)}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span className="text-sm font-mono font-bold" style={{color:temp.color}}>{temp.value}</span>
                </td>
                <td className="px-3 py-3.5 max-w-[110px]">
                  <div className="text-xs text-[#CBD5E1] truncate">{s.driver_phone ? 'Ramesh K.' : '—'}</div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="font-mono text-xs text-[#64748B]">{s.vehicle_number || '—'}</span>
                </td>
                <td className="px-3 py-3.5">
                  {(() => {
                    const status = getBlockchainStatus(s);
                    const addr   = getContractAddress(s.shipment_code);
                    if (status === 'BREACH') return (
                      <span title={`Contract: ${addr}`}
                        className="flex items-center gap-1 w-max text-[10px] font-bold text-[#F87171] bg-[#EF4444]/10 border border-[#EF4444]/30 px-2 py-0.5 rounded-md animate-pulse">
                        ⛓️ SLA BREACH
                      </span>
                    );
                    if (status === 'PENDING') return (
                      <span title={`Contract: ${addr}`}
                        className="flex items-center gap-1 w-max text-[10px] font-medium text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2 py-0.5 rounded-md">
                        ⏳ Pending
                      </span>
                    );
                    return (
                      <span title={`Contract: ${addr}`}
                        className="flex items-center gap-1 w-max text-[10px] font-bold text-[#A78BFA] bg-[#7C3AED]/10 border border-[#7C3AED]/30 px-2 py-0.5 rounded-md">
                        🔗 Locked
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-3.5">
                  {risk === 'CRITICAL' ? (
                    <span className="flex items-center gap-1 w-max text-[11px] font-bold text-[#F87171] bg-[#EF4444]/10 px-2 py-0.5 rounded"><ShieldAlert size={12}/> AT RISK</span>
                  ) : (
                    <span className="flex items-center gap-1 w-max text-[11px] text-[#34D399] bg-[#34D399]/10 px-2 py-0.5 rounded"><CheckCircle size={12}/> OK</span>
                  )}
                </td>
                <td className="px-3 py-3.5" onClick={e=>e.stopPropagation()}>
                  {isHovered ? (
                    <div className="flex items-center gap-1">
                      <button onClick={()=>navigate(`/shipments/${s.id}`)} className="text-[10px] text-[#60A5FA] hover:text-white bg-[#60A5FA]/10 px-1.5 py-0.5 rounded transition-colors">Track</button>
                      <button onClick={()=>addToast(`Alert sent for ${s.shipment_code}`)} className="text-[10px] text-[#FBBF24] hover:text-white bg-[#FBBF24]/10 px-1.5 py-0.5 rounded transition-colors">Alert</button>
                      <button onClick={e=>{e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,ship:s});}}
                        className="text-[#64748B] hover:text-white transition-colors px-1"><MoreVertical size={16}/></button>
                    </div>
                  ) : (
                    <button onClick={e=>{e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,ship:s});}} className="text-[#64748B] hover:text-white transition-colors px-2"><MoreVertical size={16}/></button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── BOARD VIEW ────────────────────────────────────────────────────────────────
const BOARD_COLS = [
  { key:'pickup',   label:'Pickup Pending', color:'#6B7280' },
  { key:'loaded',   label:'Loaded',         color:'#60A5FA' },
  { key:'active',   label:'In Transit',     color:'#4DD9AC' },
  { key:'watchlist',label:'Watchlist',      color:'#FBBF24' },
  { key:'near_dest',label:'Near Dest',      color:'#A78BFA' },
  { key:'delivered',label:'Delivered',      color:'#34D399' },
];

function BoardView({ filtered, navigate, addToast, setCtxMenu }: {
  filtered: Shipment[]; navigate:(p:string)=>void;
  addToast:(m:string,t?:'ok'|'warn')=>void;
  setCtxMenu:(m:{x:number;y:number;ship:Shipment}|null)=>void;
}) {
  // Distribute shipments across board columns based on status
  const colMap: Record<string, Shipment[]> = {};
  BOARD_COLS.forEach(c => colMap[c.key] = []);
  filtered.forEach(s => {
    const risk = getRisk(s);
    if (risk === 'CRITICAL' || risk === 'HIGH') { colMap['watchlist'].push(s); return; }
    colMap[s.status] = colMap[s.status] || [];
    (colMap[s.status] || (colMap['active'] = colMap['active'] || []) && colMap['active']).push(s);
  });

  return (
    <div className="flex gap-3 p-4 overflow-x-auto h-full">
      {BOARD_COLS.map(col => {
        const cards = colMap[col.key] || [];
        return (
          <div key={col.key} className="shrink-0 w-60 bg-[#0D1117] rounded-xl border border-[#1E2530] flex flex-col">
            <div className="px-3 py-2.5 border-b border-[#1E2530] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{backgroundColor:col.color}}/>
                <span className="text-xs font-semibold text-[#F1F5F9]">{col.label}</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1E2530] text-[#94A3B8]">{cards.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {cards.length === 0 ? (
                <div className="text-center text-[#4A5568] text-xs py-6">No shipments</div>
              ) : cards.map(s => (
                <BoardCard key={s.id} shipment={s} navigate={navigate} addToast={addToast} setCtxMenu={setCtxMenu} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ shipment:s, navigate, addToast, setCtxMenu }: {
  shipment:Shipment; navigate:(p:string)=>void;
  addToast:(m:string,t?:'ok'|'warn')=>void;
  setCtxMenu:(m:{x:number;y:number;ship:Shipment}|null)=>void;
}) {
  const risk = getRisk(s);
  const rm   = RISK_META[risk];

  return (
    <div
      className="bg-[#111827] rounded-lg border cursor-pointer hover:shadow-lg transition-all"
      style={{borderColor:rm.border, borderLeftWidth:'3px'}}
      onClick={()=>navigate(`/shipments/${s.id}`)}
      onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,ship:s});}}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs font-bold text-[#F1F5F9]">{s.shipment_code}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background:rm.bg,color:rm.color}}>{risk}</span>
        </div>
        <div className="text-xs text-[#64748B] flex items-center gap-1 mb-2">
          <span>{getIcon(s.product_type)}</span>
          <span className="capitalize">{s.product_type}</span>
          {s.product_qty && <><span>·</span><span>{s.product_qty} {s.product_unit}</span></>}
        </div>
        <div className="text-xs text-[#94A3B8] mb-2 truncate">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>

        {s.current_risk && (
          <div className="border-t border-[#1E2530] pt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#64748B]">Spoils in</span>
              <span className={`font-mono font-bold ${risk==='CRITICAL'?'text-[#F87171]':risk==='HIGH'?'text-[#FBBF24]':'text-[#CBD5E1]'}`}>
                {formatSpoil(s.current_risk.time_to_spoil_minutes)}
              </span>
            </div>
            {s.vehicle_number && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] truncate"><Truck size={12}/> {s.vehicle_number}</div>
            )}
          </div>
        )}

        {/* Blockchain Oracle Badge */}
        <div className="mt-2">
          {(() => {
            const status = getBlockchainStatus(s);
            const addr   = getContractAddress(s.shipment_code);
            if (status === 'BREACH') return (
              <div title={addr} className="flex items-center gap-1.5 text-[10px] font-bold text-[#F87171] bg-[#EF4444]/10 border border-[#EF4444]/30 px-2 py-1 rounded-lg w-full justify-center animate-pulse">
                ⛓️ Smart Contract — SLA BREACH
              </div>
            );
            if (status === 'PENDING') return (
              <div title={addr} className="flex items-center gap-1.5 text-[10px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2 py-1 rounded-lg w-full justify-center">
                ⏳ Deploying Contract…
              </div>
            );
            return (
              <div title={addr} className="flex items-center gap-1.5 text-[10px] font-bold text-[#A78BFA] bg-[#7C3AED]/10 border border-[#7C3AED]/30 px-2 py-1 rounded-lg w-full justify-center">
                🔗 Smart Contract Locked
              </div>
            );
          })()}
        </div>

        <div className="flex gap-1.5 mt-2.5 border-t border-[#1E2530] pt-2">
          <button onClick={e=>{e.stopPropagation();navigate(`/shipments/${s.id}`);}}
            className="flex-1 text-[10px] bg-[#1E2530] text-[#94A3B8] hover:text-white py-1 rounded transition-colors">Track</button>
          <button onClick={e=>{e.stopPropagation();addToast(`Alert sent for ${s.shipment_code}`);}}
            className="flex-1 text-[10px] bg-[#FBBF24]/10 text-[#FBBF24] hover:bg-[#FBBF24]/20 py-1 rounded transition-colors">Alert</button>
        </div>
      </div>
    </div>
  );
}

// ── ROUTE CLUSTER VIEW ────────────────────────────────────────────────────────
function RouteClusterView({ filtered, navigate, expanded, setExpanded }: {
  filtered: Shipment[]; navigate:(p:string)=>void;
  expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  function toggleExpand(key: string) {
    setExpanded(e => { const n = new Set(e); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="p-6 space-y-4">
      {ROUTE_CLUSTERS.map(region => (
        <div key={region.region}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-bold text-[#F1F5F9] uppercase tracking-widest">{region.region}</span>
            <div className="flex-1 h-px bg-[#1E2530]"/>
          </div>
          <div className="space-y-2">
            {region.routes.map(route => {
              const key = route.name;
              const routeShips = filtered.filter(s =>
                route.origins.some(o => (s.origin||'').toLowerCase().includes(o)) &&
                route.dests.some(d => (s.destination||'').toLowerCase().includes(d))
              );
              // If no ships on this specific route, show other ships in a catch-all "Other" group
              const isExp = expanded.has(key);
              const critical = routeShips.filter(s => getRisk(s) === 'CRITICAL').length;
              const high     = routeShips.filter(s => getRisk(s) === 'HIGH').length;

              if (routeShips.length === 0) return null;

              return (
                <div key={key} className="bg-[#0D1117] border border-[#1E2530] rounded-xl overflow-hidden">
                  <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#111827] transition-colors text-left"
                    onClick={()=>toggleExpand(key)}>
                    <span className="text-sm transition-transform" style={{transform:isExp?'rotate(90deg)':'rotate(0)'}}>▶</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-[#F1F5F9]">{route.name}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-[#1E2530] text-[#94A3B8] px-2 py-0.5 rounded-full font-mono">{routeShips.length} shipments</span>
                      {critical > 0 && <span className="text-[11px] font-bold text-[#F87171] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse"/>{critical} critical</span>}
                      {high > 0 && <span className="text-[11px] font-bold text-[#FBBF24]">{high} watchlist</span>}
                      {critical === 0 && high === 0 && <span className="flex items-center gap-1 text-[11px] text-[#34D399]"><CheckCircle size={12}/> all stable</span>}
                    </div>
                  </button>

                  {isExp && (
                    <div className="border-t border-[#1E2530]">
                      {routeShips.map(s => {
                        const risk = getRisk(s);
                        const rm   = RISK_META[risk];
                        return (
                          <div key={s.id}
                            className="flex items-center gap-4 px-5 py-3 border-b border-[#1E2530] last:border-b-0 hover:bg-[#111827] cursor-pointer transition-colors"
                            style={{borderLeft:`3px solid ${rm.border}`}}
                            onClick={()=>navigate(`/shipments/${s.id}`)}>
                            <span className="font-mono text-sm font-bold text-[#F1F5F9] w-28 shrink-0">{s.shipment_code}</span>
                            <span className="text-sm">{getIcon(s.product_type)}</span>
                            <span className="text-xs text-[#94A3B8] capitalize w-20 shrink-0">{s.product_type}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded shrink-0" style={{background:rm.bg,color:rm.color}}>{risk}</span>
                            {s.current_risk?.time_to_spoil_minutes && (
                              <span className="text-xs text-[#64748B]">Spoils in <span className="text-[#FBBF24] font-mono font-bold">{formatSpoil(s.current_risk.time_to_spoil_minutes)}</span></span>
                            )}
                            <div className="ml-auto flex items-center gap-1 text-xs text-[#4DD9AC]">View <ArrowRight size={14}/></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Catch-all: unclustered shipments */}
            {(() => {
              const clustered = new Set(region.routes.flatMap(r =>
                filtered.filter(s => r.origins.some(o=>(s.origin||'').toLowerCase().includes(o)) && r.dests.some(d=>(s.destination||'').toLowerCase().includes(d))).map(s=>s.id)
              ));
              const others = filtered.filter(s => !clustered.has(s.id));
              if (!others.length) return null;
              const key = 'Other Routes';
              const isExp = expanded.has(key);
              return (
                <div className="bg-[#0D1117] border border-[#1E2530] rounded-xl overflow-hidden">
                  <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#111827] transition-colors text-left" onClick={()=>toggleExpand(key)}>
                    <span className="text-sm" style={{transform:isExp?'rotate(90deg)':'rotate(0)'}}>▶</span>
                    <div className="flex-1"><div className="font-semibold text-sm text-[#F1F5F9]">{key}</div></div>
                    <span className="text-xs bg-[#1E2530] text-[#94A3B8] px-2 py-0.5 rounded-full font-mono">{others.length} shipments</span>
                  </button>
                  {isExp && (
                    <div className="border-t border-[#1E2530]">
                      {others.map(s => {
                        const risk = getRisk(s); const rm = RISK_META[risk];
                        return (
                          <div key={s.id} className="flex items-center gap-4 px-5 py-3 border-b border-[#1E2530] last:border-b-0 hover:bg-[#111827] cursor-pointer transition-colors"
                            style={{borderLeft:`3px solid ${rm.border}`}} onClick={()=>navigate(`/shipments/${s.id}`)}>
                            <span className="font-mono text-sm font-bold text-[#F1F5F9] w-28 shrink-0">{s.shipment_code}</span>
                            <span className="text-sm">{getIcon(s.product_type)}</span>
                            <span className="text-xs text-[#94A3B8] capitalize">{s.product_type}</span>
                            <span className="text-xs text-[#64748B]">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded ml-auto" style={{background:rm.bg,color:rm.color}}>{risk}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── FilterGroup ───────────────────────────────────────────────────────────────
function FilterGroup({ label, options, selected, onChange, colors, icons, labels }: {
  label: string; options: string[]; selected: string[];
  onChange: (v:string[])=>void;
  colors?: Record<string,string>; icons?: Record<string,React.ReactNode>; labels?: Record<string,string>;
}) {
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x=>x!==v) : [...selected, v]);
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-2 font-semibold">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = selected.includes(o);
          const col = colors?.[o];
          return (
            <button key={o} onClick={()=>toggle(o)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${on?'border-current font-semibold':'border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}
              style={on&&col?{backgroundColor:`${col}15`,color:col,borderColor:col}:{}}>
              {icons?.[o] && <span>{icons[o]}</span>}
              <span className="capitalize">{labels?.[o] || o}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
