import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getShipments, getAnalyticsSummary, getAlerts, type Shipment, type AnalyticsSummary, type Alert } from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { LiveFleetMap } from '../../components/LiveFleetMap';

// ── Risk helpers ──────────────────────────────────────────────────────────────
const RISK_COLOR = {
  CRITICAL: { border: '#EF4444', text: '#F87171', bg: 'rgba(239,68,68,0.08)', label: 'CRITICAL' },
  HIGH:     { border: '#F59E0B', text: '#FBBF24', bg: 'rgba(245,158,11,0.08)', label: 'HIGH' },
  MEDIUM:   { border: '#3B82F6', text: '#60A5FA', bg: 'rgba(59,130,246,0.08)', label: 'MEDIUM' },
  LOW:      { border: '#10B981', text: '#34D399', bg: 'rgba(16,185,129,0.08)', label: 'LOW' },
} as const;

type RiskLevel = keyof typeof RISK_COLOR;

function getRisk(s: Shipment): RiskLevel {
  const cat = s.current_risk?.risk_category?.toUpperCase();
  if (cat === 'CRITICAL' || cat === 'HIGH' || cat === 'MEDIUM' || cat === 'LOW') return cat as RiskLevel;
  return 'LOW';
}

function getProductIcon(type: string): string {
  const icons: Record<string, string> = {
    milk: '🥛', dairy: '🧀', fish: '🐟', meat: '🥩',
    produce: '🥦', fruits: '🍎', vegetables: '🥕',
    frozen: '🧊', pharma: '💊', flowers: '🌸',
  };
  return icons[type?.toLowerCase()] || '📦';
}

function formatETA(s: Shipment): string {
  if (!s.current_risk?.computed_at) return '—';
  const arr = (s as any).expected_arrival;
  if (!arr) return '—';
  const ms = new Date(arr).getTime() - Date.now();
  if (ms < 0) return 'Overdue';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatSpoilTimer(mins?: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ── Context Menu ─────────────────────────────────────────────────────────────
interface CtxMenu { x: number; y: number; shipment: Shipment }

// ── Main Component ────────────────────────────────────────────────────────────
export function ControlTower() {
  const navigate = useNavigate();
  const clock = useLiveClock();

  // State
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'risk' | 'eta' | 'spoil'>('risk');
  const [mapFilter, setMapFilter] = useState<'all' | 'critical' | 'delayed'>('all');
  const [aiDismissed, setAiDismissed] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string; type: 'ok' | 'warn' }>>([]);
  const [crisisLoading, setCrisisLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const addToast = (msg: string, type: 'ok' | 'warn' = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  // ── Simulate Crisis (Demo button) ──────────────────────────────────────────
  const simulateCrisis = async (scenario: string = 'battery_failure') => {
    setCrisisLoading(true);
    addToast(`Triggering ${scenario} scenario...`, 'warn');
    try {
      const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const res = await fetch(`${API}/api/v1/agent/simulate-critical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          shipment_id: filtered[0]?.shipment_code || 'SHP-DEMO-001',
          product_type: filtered[0]?.product_type || 'milk',
        }),
      });
      const data = await res.json();
      if (data.agent_result?.should_reroute) {
        addToast(`CARGOFY AGENT: Rerouting to ${data.agent_result?.nearest_facility?.name || 'nearest cold hub'}`, 'warn');
      } else {
        addToast('Agent assessed risk — no reroute needed', 'ok');
      }
    } catch {
      addToast('Demo mode: Agent triggered (backend offline)', 'warn');
    } finally {
      setCrisisLoading(false);
    }
  };

  // ── Fetch data ─────────────────────────────────────────────────────────────
  // ── Realtime Firebase Data ──────────────────────────────────────────────────
  const { data: rtNetworkStats } = useRealtimeData<any>('/network_stats');
  const { data: rtActiveShipments } = useRealtimeData<any>('/active_shipments');
  const { data: rtAiActions } = useRealtimeData<any>('/ai_action_queue');
  const { data: rtAlertsLive } = useRealtimeData<any>('/alerts_live');

  // ── Fetch Initial Data (Fallback / Base) ───────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [ships, stats, alertsData] = await Promise.all([
        getShipments('active'),
        getAnalyticsSummary(),
        getAlerts(),
      ]);
      setShipments(ships);
      setAnalytics(stats);
      setAlerts(alertsData.slice(0, 10));
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Removed 8s polling: setInterval is gone, relying on Firebase RTDB for live updates
  }, [fetchAll]);

  // ── Merge Realtime Data into Component State ───────────────────────────────
  
  // 1. Network Stats
  const displayAnalytics = rtNetworkStats ? {
    ...analytics,
    active_shipments: rtNetworkStats.active_shipments || 0,
    estimated_savings_inr: rtNetworkStats.loss_prevented_today_inr || 0,
    high_risk_shipments: rtNetworkStats.critical_count + rtNetworkStats.watchlist_count || 0,
  } as AnalyticsSummary : analytics;

  // 2. Shipments
  const displayShipments = React.useMemo(() => {
    if (!rtActiveShipments) return shipments;
    // rtActiveShipments is an object keyed by shipment_code
    return shipments.map(s => {
      const rt = rtActiveShipments[s.shipment_code];
      if (!rt) return s;
      return {
        ...s,
        status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage.toLowerCase(),
        current_risk: {
          ...s.current_risk,
          risk_score: rt.risk_score / 100, // RTDB stores it as int (score * 100)
          risk_category: rt.risk_category,
          time_to_spoil_minutes: rt.spoilage_window_min,
        }
      } as Shipment;
    });
  }, [shipments, rtActiveShipments]);

  // 3. Alerts
  const displayAlerts = React.useMemo(() => {
    if (!rtAlertsLive) return alerts;
    const liveArray = Object.keys(rtAlertsLive).map(id => {
      const item = rtAlertsLive[id];
      if (!item) return null;
      return {
        id,
        shipment_id: item.shipment_id || '',
        message_body: item.message || '',
        risk_category: item.severity || 'HIGH',
        created_at: item.sent_at ? new Date(item.sent_at).toISOString() : new Date().toISOString(),
      };
    }).filter(Boolean) as any[];
    return liveArray.length > 0 ? liveArray : alerts;
  }, [alerts, rtAlertsLive]);

  // 4. AI Actions
  const displayAiActions = rtAiActions ? (Array.isArray(rtAiActions) ? rtAiActions : Object.values(rtAiActions)).map((a: any) => ({
    id: a.id || Math.random().toString(),
    text: a.message || '',
    cta: a.action_type === 'REROUTE' ? 'Reroute' : a.action_type === 'ALERT' ? 'Alert Driver' : 'Review'
  })) : null;

  // Close context menu on click elsewhere
  useEffect(() => {
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────
  const filtered = displayShipments
    .filter(s => {
      const q = searchQuery.toLowerCase();
      if (q && !s.shipment_code.toLowerCase().includes(q) &&
          !s.product_type.toLowerCase().includes(q) &&
          !(s.origin || '').toLowerCase().includes(q) &&
          !(s.destination || '').toLowerCase().includes(q)) return false;
      if (riskFilter !== 'ALL' && getRisk(s) !== riskFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'risk') {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (order[getRisk(a)] ?? 9) - (order[getRisk(b)] ?? 9);
      }
      if (sortBy === 'spoil') {
        return (a.current_risk?.time_to_spoil_minutes ?? 9999) - (b.current_risk?.time_to_spoil_minutes ?? 9999);
      }
      return 0;
    });

  const criticalShipments = displayShipments.filter(s => getRisk(s) === 'CRITICAL');
  const highShipments = displayShipments.filter(s => getRisk(s) === 'HIGH');
  const watchlistCount = rtNetworkStats ? rtNetworkStats.watchlist_count : displayShipments.filter(s => ['HIGH', 'MEDIUM'].includes(getRisk(s))).length;
  const pendingAcks = displayShipments.filter(s => s.current_risk && ['CRITICAL', 'HIGH'].includes(getRisk(s)));

  const computedAiSuggestions = displayAiActions || displayShipments
    .filter(s => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(getRisk(s)) && !aiDismissed.includes(s.id))
    .slice(0, 3)
    .map(s => {
      const risk = getRisk(s);
      const spoil = s.current_risk?.time_to_spoil_minutes;
      if (risk === 'CRITICAL') return {
        id: s.id,
        text: `Shift ${s.shipment_code} to nearest cold hub within ${spoil ? Math.floor(spoil * 0.4) : 30} min to prevent total spoilage.`,
        cta: 'Escalate Now'
      };
      if (risk === 'HIGH') return {
        id: s.id,
        text: `Alert driver on ${s.shipment_code} — reefer temp rising. Adjust settings or reroute.`,
        cta: 'Alert Driver'
      };
      return {
        id: s.id,
        text: `${s.shipment_code} safe transit window may close in ${spoil ? Math.floor(spoil * 0.6) : 60} min.`,
        cta: 'Review'
      };
    });
    
  const aiSuggestions = computedAiSuggestions.filter(a => !aiDismissed.includes(a.id));

  // Map shipments for visual (SVG India map placeholder with dots)
  const mapShipments = displayShipments.filter(s => {
    if (mapFilter === 'critical') return getRisk(s) === 'CRITICAL';
    if (mapFilter === 'delayed') return (s.current_risk?.time_to_spoil_minutes ?? 9999) < 120;
    return true;
  });

  const savings = displayAnalytics?.estimated_savings_inr ?? 0;
  const savingsDisplay = savings >= 100000 ? `₹${(savings / 100000).toFixed(1)}L` :
                         savings >= 1000 ? `₹${(savings / 1000).toFixed(0)}K` : `₹${savings}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Toast container ─────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-xl animate-slide-in ${t.type === 'ok' ? 'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]' : 'bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Context Menu ────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: '👁 View Details', action: () => navigate(`/shipments/${ctxMenu.shipment.id}`) },
            { label: '📢 Alert Driver', action: () => { addToast(`Alert sent to driver on ${ctxMenu.shipment.shipment_code}`); setCtxMenu(null); } },
            { label: '⚠️ Escalate', action: () => { addToast(`${ctxMenu.shipment.shipment_code} escalated`, 'warn'); setCtxMenu(null); } },
            { label: '🗺 Reroute', action: () => navigate('/live-tracking') },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              className="w-full text-left px-4 py-2 text-sm text-[#CBD5E1] hover:bg-[#1E2530] hover:text-white transition-colors">
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TOP NAV BAR
      ═══════════════════════════════════════════════════════════════════════ */}
      <header className="shrink-0 h-14 bg-[#0A0D14] border-b border-[#1E2530] flex items-center px-4 gap-4 z-40">
        {/* Logo */}
        <div className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono shrink-0 cursor-pointer" onClick={() => navigate('/dashboard')}>
        CARGOFY
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs hidden md:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] text-sm">🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search shipment ID, route, driver..."
            className="w-full bg-[#10131B] border border-[#1E2530] text-[#CBD5E1] text-sm pl-9 pr-4 py-1.5 rounded focus:outline-none focus:border-[#4DD9AC]/50 transition-colors placeholder-[#4A5568]"
          />
        </div>

        <div className="flex-1" />

        {/* Live clock */}
        <div className="hidden lg:flex items-center gap-2 text-[#4DD9AC] font-mono text-xs">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#4DD9AC] animate-pulse' : 'bg-[#EF4444]'}`} />
          <span>{connected ? 'LIVE' : 'RECONNECTING'}</span>
          <span className="text-[#64748B] ml-1">{clock} IST</span>
        </div>

        {/* Notification bell */}
        <button
          className="relative text-[#64748B] hover:text-[#F1F5F9] transition-colors p-1"
          onClick={() => navigate('/alerts-center')}
        >
          <span className="text-xl">🔔</span>
          {criticalShipments.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#EF4444] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {criticalShipments.length}
            </span>
          )}
        </button>

        {/* 3D Fleet View button */}
        <button
          onClick={() => navigate('/fleet-3d')}
          className="hidden lg:flex items-center gap-1.5 bg-[#6366F1]/10 border border-[#6366F1]/30 text-[#818CF8] font-bold text-xs px-3 py-2 rounded hover:bg-[#6366F1]/20 active:scale-95 transition-all"
        >
          <span>🌐</span>
          <span>3D Fleet View</span>
        </button>

        {/* Team */}
        <div className="hidden lg:flex items-center gap-2 bg-[#10131B] border border-[#1E2530] rounded px-3 py-1.5 text-xs text-[#94A3B8] cursor-pointer hover:border-[#4DD9AC]/40 transition-colors">
          <span>⚙</span>
          <span>Cargofy Ops — India</span>
          <span>▾</span>
        </div>

        {/* 🚨 DEMO: Simulate Crisis Button */}
        <div className="relative group">
          <button
            onClick={() => simulateCrisis('battery_failure')}
            disabled={crisisLoading}
            className="shrink-0 bg-[#EF4444]/10 border border-[#EF4444]/40 text-[#F87171] font-bold text-xs px-3 py-2 rounded hover:bg-[#EF4444]/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {crisisLoading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <span>🚨</span>
            )}
            <span className="hidden sm:inline">{crisisLoading ? 'Agent Running...' : 'Simulate Crisis'}</span>
          </button>
          {/* Dropdown */}
          <div className="absolute right-0 top-10 hidden group-hover:block bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-2xl py-1 min-w-[180px] z-50">
            {[
              { label: '⚡ Battery Failure', s: 'battery_failure' },
              { label: '🌡️ Temp Spike', s: 'temp_spike' },
              { label: '🚪 Door Tamper', s: 'door_tamper' },
              { label: '💥 Combined Crisis', s: 'combined' },
            ].map(item => (
              <button key={item.s} onClick={() => simulateCrisis(item.s)}
                className="w-full text-left px-4 py-2 text-xs text-[#CBD5E1] hover:bg-[#1E2530] hover:text-white transition-colors">
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Create CTA */}
        <button
          onClick={() => navigate('/create-shipment')}
          className="shrink-0 bg-[#4DD9AC] text-[#003829] font-bold text-xs px-4 py-2 rounded hover:bg-[#6EF6C7] active:scale-95 transition-all flex items-center gap-1.5"
        >
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">Create Shipment</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => { localStorage.removeItem('axon_authed'); navigate('/login'); }}
          className="w-8 h-8 rounded-full bg-[#4DD9AC]/20 border border-[#4DD9AC]/30 flex items-center justify-center text-[#4DD9AC] text-sm font-bold shrink-0"
          title="Logout"
        >
          R
        </button>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          BODY — Sidebar + Main + Right Rail
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
        <aside className="shrink-0 w-[220px] bg-[#0D1117] border-r border-[#1E2530] flex-col hidden md:flex">
          <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">

            {/* Control Tower — active */}
            <NavItem icon="🗼" label="Control Tower" href="/dashboard" active />

            <NavSection label="OPERATIONS" />
            <NavItem icon="📦" label="Create Shipment" href="/create-shipment" />
            <NavItem icon="🚚" label="Active Shipments" href="/active-shipments" badge={shipments.length} />
            <NavItem icon="📋" label="Dispatch Queue" href="/active-shipments" />

            <NavSection label="MONITORING" />
            <NavItem icon="📡" label="Live Tracking" href="/live-tracking" />
            <NavItem icon="⚠️" label="Risk & Interventions" href="/risk" badge={criticalShipments.length + highShipments.length} badgeColor="#EF4444" />
            <NavItem icon="🔬" label="IoT Simulator" href="/iot-simulator" />

            <NavSection label="INTELLIGENCE" />
            <NavItem icon="📊" label="Analytics" href="/axon-analytics" />
            <NavItem icon="💰" label="Fleet & Drivers" href="/fleet" />

            <NavSection label="COMMUNICATION" />
            <NavItem icon="🔔" label="Alerts Log" href="/alerts-center" badge={alerts.length} badgeColor="#EF4444" />

            <NavSection label="SYSTEM" />
            <NavItem icon="⚙️" label="Settings" href="/settings" />
          </nav>

          {/* Bottom section */}
          <div className="p-3 border-t border-[#1E2530]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#34D399] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
              <span>99.2% uptime · All systems live</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#4DD9AC]/20 border border-[#4DD9AC]/40 flex items-center justify-center text-[#4DD9AC] text-xs font-bold">R</div>
              <div>
                <div className="text-xs text-[#F1F5F9] font-medium">Ravi Kumar</div>
                <div className="text-[10px] text-[#4DD9AC]">Ops Manager</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {/* ── NETWORK STATUS STRIP ─────────────────────────────────── */}
          <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530]">
            {loading ? (
              <div className="flex items-center justify-center h-[72px] text-[#64748B] text-sm">Loading live data...</div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 h-[72px]">
                <StatChip icon="🚚" label="Active Shipments"     value={displayAnalytics?.active_shipments ?? 0}   color="#60A5FA" />
                <StatChip icon="❄️" label="Reefer Vehicles Live"  value={rtNetworkStats?.live_reefer_vehicles || displayShipments.length} color="#4DD9AC" divider />
                <StatChip icon="👁" label="Watchlist"             value={watchlistCount}                     color="#FBBF24" divider />
                <StatChip icon="🚨" label="Critical Excursions"   value={criticalShipments.length}          color="#F87171" divider />
                <StatChip icon="💰" label="Loss Prevented"        value={savings > 0 ? savingsDisplay : '₹0'} color="#34D399" divider />
                <StatChip icon="✅" label="On-Time Performance"   value={`${rtNetworkStats ? rtNetworkStats.on_time_rate_7d : (displayAnalytics ? 94 - displayAnalytics.high_risk_shipments * 2 : 94)}%`} color="#34D399" divider />
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">

            {/* ── EXCEPTION BANNER ─────────────────────────────────── */}
            {!bannerDismissed && criticalShipments.length > 0 && (
              <div className="shrink-0 bg-[#1C0A0A] border-l-4 border-[#EF4444] rounded-r-lg px-4 py-3 flex items-start gap-3 animate-pulse-border relative">
                <span className="text-[#EF4444] text-lg shrink-0 mt-0.5">🚨</span>
                <div className="flex-1 space-y-1">
                  {criticalShipments.map(s => (
                    <button key={s.id}
                      onClick={() => navigate(`/shipments/${s.id}`)}
                      className="block w-full text-left text-sm text-[#FCA5A5] hover:text-white transition-colors">
                      <span className="font-mono text-[#EF4444] font-bold">{s.shipment_code}</span>
                      {' '}— {s.product_type} shipment exceeded safe temp band.{' '}
                      {s.current_risk?.time_to_spoil_minutes && (
                        <span className="text-[#FBBF24]">Spoils in {formatSpoilTimer(s.current_risk.time_to_spoil_minutes)}.</span>
                      )}{' '}
                      <span className="underline">View →</span>
                    </button>
                  ))}
                  {highShipments.length > 0 && (
                    <button onClick={() => navigate('/risk')} className="block text-sm text-[#FDE68A] hover:text-white transition-colors">
                      ⚠️ {highShipments.length} shipment(s) at HIGH risk — driver response pending.{' '}
                      <span className="underline">Review →</span>
                    </button>
                  )}
                </div>
                <button onClick={() => setBannerDismissed(true)} className="text-[#64748B] hover:text-[#F1F5F9] transition-colors shrink-0 text-lg leading-none">×</button>
              </div>
            )}

            {/* ── JOURNEY BOARD ────────────────────────────────────── */}
            <div className="shrink-0">
              {/* Board header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-[#F1F5F9] flex items-center gap-2">
                  <span>Shipment Journey Board</span>
                  <span className="text-xs bg-[#1E2530] text-[#94A3B8] px-2 py-0.5 rounded-full">{filtered.length} active</span>
                </h2>
                <div className="flex items-center gap-2">
                  {/* Risk filter */}
                  <select
                    value={riskFilter}
                    onChange={e => setRiskFilter(e.target.value)}
                    className="bg-[#0D1117] border border-[#1E2530] text-[#94A3B8] text-xs rounded px-2 py-1 focus:outline-none"
                  >
                    <option value="ALL">All Risks</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-[#0D1117] border border-[#1E2530] text-[#94A3B8] text-xs rounded px-2 py-1 focus:outline-none"
                  >
                    <option value="risk">Sort: Risk</option>
                    <option value="eta">Sort: ETA</option>
                    <option value="spoil">Sort: Spoil Timer</option>
                  </select>
                </div>
              </div>

              {/* Cards grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1,2,3].map(i => <div key={i} className="h-[190px] bg-[#0D1117] rounded-lg animate-pulse border border-[#1E2530]" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-[#64748B]">
                  <div className="text-3xl mb-2">📦</div>
                  <div>No active shipments match your filter.</div>
                  <button onClick={() => navigate('/create-shipment')} className="mt-3 text-[#4DD9AC] underline text-sm">Create a shipment →</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map(s => <ShipmentCard key={s.id} shipment={s} onNavigate={navigate} onCtxMenu={setCtxMenu} addToast={addToast} />)}
                </div>
              )}
            </div>

            {/* ── MINI LIVE MAP ─────────────────────────────────────── */}
            <div className="shrink-0 rounded-lg overflow-hidden border border-[#1E2530] mt-4">
              <div className="relative h-[400px] bg-[#080B12]">
                <LiveFleetMap
                  shipments={mapShipments}
                  onShipmentClick={(id) => navigate(`/shipments/${id}`)}
                  className="absolute inset-0 w-full h-full"
                />

                {/* Map overlay text */}
                <div className="absolute z-10 top-3 left-3 bg-[#0D1117]/90 backdrop-blur px-3 py-1.5 rounded flex items-center gap-3 border border-[#1E2530] pointer-events-none">
                  <span className="text-xs text-[#94A3B8] font-medium uppercase tracking-widest">Live Fleet Map</span>
                  <div className="flex gap-2 text-[10px]">
                    <span className="flex items-center gap-1 text-[#34D399]"><span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />On Track</span>
                    <span className="flex items-center gap-1 text-[#FBBF24]"><span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />Delayed</span>
                    <span className="flex items-center gap-1 text-[#EF4444]"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />Critical</span>
                  </div>
                </div>

                {/* Map bottom controls */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <div className="flex gap-1">
                    {(['all','critical','delayed'] as const).map(f => (
                      <button key={f} onClick={() => setMapFilter(f)}
                        className={`px-3 py-1 rounded text-[10px] uppercase tracking-wider font-medium transition-colors border ${mapFilter === f ? 'bg-[#4DD9AC]/10 border-[#4DD9AC]/40 text-[#4DD9AC]' : 'bg-[#0D1117]/80 border-[#1E2530] text-[#64748B] hover:text-[#94A3B8]'}`}>
                        {f === 'all' ? 'All Routes' : f === 'critical' ? 'Critical Only' : 'Delayed'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => navigate('/live-tracking')}
                    className="bg-[#0D1117]/90 border border-[#1E2530] text-[#4DD9AC] text-xs px-3 py-1 rounded hover:border-[#4DD9AC]/40 transition-colors">
                    Open Full Map →
                  </button>
                </div>
              </div>
            </div>

          </div>
        </main>

        {/* ── RIGHT RAIL ───────────────────────────────────────────────────── */}
        <aside className="w-[300px] shrink-0 bg-[#0D1117] border-l border-[#1E2530] flex-col hidden lg:flex overflow-y-auto">

          {/* Section A: Live Alerts */}
          <div className="p-4 border-b border-[#1E2530]">
            <h3 className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
              Live Alerts Needing Response
            </h3>
            {loading ? <div className="text-[#64748B] text-xs">Loading...</div> :
              (criticalShipments.length === 0 && highShipments.length === 0) ? (
                <div className="text-[#64748B] text-xs py-2">✅ No active alerts — all shipments nominal.</div>
              ) : (
                <div className="space-y-2">
                  {[...criticalShipments, ...highShipments].slice(0, 4).map(s => {
                    const risk = getRisk(s);
                    const col = RISK_COLOR[risk];
                    return (
                      <div key={s.id} className="rounded p-2.5" style={{ background: col.bg, borderLeft: `3px solid ${col.border}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold" style={{ color: col.text }}>{risk} · {s.shipment_code}</span>
                          <span className="text-[10px] text-[#64748B]">just now</span>
                        </div>
                        <div className="text-xs text-[#CBD5E1] mb-1">{s.product_type} · {s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                        {s.current_risk?.time_to_spoil_minutes && (
                          <div className="text-[11px] text-[#FBBF24] mb-2">Spoils in {formatSpoilTimer(s.current_risk.time_to_spoil_minutes)}</div>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => navigate(`/shipments/${s.id}`)} className="text-[10px] bg-[#1E2530] text-[#94A3B8] hover:text-white px-2 py-1 rounded transition-colors">View</button>
                          <button onClick={() => { addToast(`Alert sent to driver on ${s.shipment_code}`); }} className="text-[10px] bg-[#4DD9AC]/10 text-[#4DD9AC] hover:bg-[#4DD9AC]/20 px-2 py-1 rounded transition-colors">Alert Driver</button>
                          <button onClick={() => { addToast(`${s.shipment_code} escalated`, 'warn'); }} className="text-[10px] bg-[#EF4444]/10 text-[#F87171] hover:bg-[#EF4444]/20 px-2 py-1 rounded transition-colors">Escalate</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          {/* Section B: At-Risk Shipments */}
          <div className="p-4 border-b border-[#1E2530]">
            <h3 className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest mb-3">At-Risk Shipments</h3>
            <div className="space-y-2">
              {displayShipments
                .sort((a,b) => (b.current_risk?.risk_score ?? 0) - (a.current_risk?.risk_score ?? 0))
                .slice(0,5)
                .map(s => {
                  const risk = getRisk(s);
                  const col = RISK_COLOR[risk];
                  const score = Math.round((s.current_risk?.risk_score ?? 0) * 100);
                  return (
                    <button key={s.id} onClick={() => navigate(`/shipments/${s.id}`)}
                      className="w-full text-left group">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-xs text-[#CBD5E1] group-hover:text-white transition-colors">{s.shipment_code}</span>
                        <span className="text-[10px] font-bold" style={{ color: col.text }}>{score}%</span>
                      </div>
                      <div className="h-1 bg-[#1E2530] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: col.border }} />
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Section C: Pending Acks */}
          <div className="p-4 border-b border-[#1E2530]">
            <h3 className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest mb-3">Pending Driver Acks</h3>
            {pendingAcks.length === 0 ? (
              <div className="text-[#64748B] text-xs">All drivers acknowledged.</div>
            ) : (
              <div className="space-y-2">
                {pendingAcks.slice(0, 3).map(s => (
                  <div key={s.id} className="bg-[#111827] rounded p-2.5 border border-[#1E2530]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-[#FBBF24]">{s.shipment_code}</span>
                      <span className="text-[10px] text-[#EF4444]">18 min ago</span>
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mb-2">Alert sent — awaiting acknowledgement</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => addToast(`Resent alert to ${s.shipment_code} driver`)} className="text-[10px] bg-[#1E2530] text-[#94A3B8] hover:text-white px-2 py-1 rounded transition-colors">Resend</button>
                      <button onClick={() => addToast(`${s.shipment_code} escalated to manager`, 'warn')} className="text-[10px] bg-[#EF4444]/10 text-[#F87171] px-2 py-1 rounded transition-colors">Escalate</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section D: AI Suggested Actions */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold text-[#4DD9AC] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span>💡</span> AI Suggested Actions
            </h3>
            {aiSuggestions.length === 0 ? (
              <div className="text-[#64748B] text-xs">No urgent actions at this time.</div>
            ) : (
              <div className="space-y-2">
                {aiSuggestions.map(s => (
                  <div key={s.id} className="bg-[#111827] rounded p-3 border border-[#1E2530]">
                    <p className="text-xs text-[#CBD5E1] mb-2 leading-relaxed">{s.text}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { addToast(`Action taken on ${s.id.slice(0,8)}...`); setAiDismissed(d => [...d, s.id]); }}
                        className="flex-1 text-[10px] bg-gradient-to-r from-[#4DD9AC] to-[#6EF6C7] text-[#003829] font-bold py-1 rounded hover:opacity-90 transition-opacity"
                      >
                        {s.cta}
                      </button>
                      <button
                        onClick={() => setAiDismissed(d => [...d, s.id])}
                        className="text-[10px] bg-[#1E2530] text-[#64748B] hover:text-white px-2 py-1 rounded transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </aside>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavSection({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <span className="text-[9px] font-semibold text-[#4A5568] uppercase tracking-widest">{label}</span>
    </div>
  );
}

function NavItem({ icon, label, href, active, badge, badgeColor = '#60A5FA' }: {
  icon: string; label: string; href: string; active?: boolean; badge?: number; badgeColor?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all text-left ${
        active
          ? 'bg-[#4DD9AC]/10 text-[#4DD9AC] border-l-2 border-[#4DD9AC]'
          : 'text-[#64748B] hover:bg-[#111827] hover:text-[#CBD5E1] border-l-2 border-transparent'
      }`}
    >
      <span className="text-base w-5 text-center shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${badgeColor}20`, color: badgeColor }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function StatChip({ icon, label, value, color, divider }: {
  icon: string; label: string; value: string | number; color: string; divider?: boolean;
}) {
  return (
    <div className={`flex items-center justify-center flex-col h-full px-4 ${divider ? 'border-l border-[#1E2530]' : ''}`}>
      <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-0.5 flex items-center gap-1">
        <span>{icon}</span> {label}
      </div>
      <div className="text-xl font-black font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function ShipmentCard({ shipment: s, onNavigate, onCtxMenu, addToast }: {
  shipment: Shipment;
  onNavigate: (path: string) => void;
  onCtxMenu: (m: CtxMenu) => void;
  addToast: (msg: string, type?: 'ok' | 'warn') => void;
}) {
  const risk = getRisk(s);
  const col = RISK_COLOR[risk];
  const score = Math.round((s.current_risk?.risk_score ?? 0) * 100);

  return (
    <div
      className="relative bg-[#0D1117] rounded-lg border border-[#1E2530] cursor-pointer group hover:border-[#2E3B4E] hover:shadow-2xl transition-all duration-200"
      style={{ borderLeft: `3px solid ${col.border}` }}
      onClick={() => onNavigate(`/shipments/${s.id}`)}
      onContextMenu={e => { e.preventDefault(); onCtxMenu({ x: e.clientX, y: e.clientY, shipment: s }); }}
    >
      {/* Card header */}
      <div className="p-3 pb-2 border-b border-[#1E2530]">
        <div className="flex items-start justify-between mb-1">
          <span className="font-mono text-sm font-bold text-[#F1F5F9]">{s.shipment_code}</span>
          <div className="flex items-center gap-2">
            <span className="text-base">{getProductIcon(s.product_type)}</span>
            {risk === 'CRITICAL' && <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />}
          </div>
        </div>
        <div className="text-xs text-[#64748B] truncate">
          {s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="text-[10px] text-[#64748B]">PRODUCT</div>
          <div className="text-[10px] text-[#64748B]">VEHICLE</div>
          <div className="text-xs text-[#CBD5E1] font-medium capitalize">{s.product_type}</div>
          <div className="text-xs text-[#CBD5E1] font-mono truncate">{s.vehicle_number || '—'}</div>
        </div>

        {s.current_risk && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="text-[10px] text-[#64748B]">SPOILS IN</div>
            <div className="text-[10px] text-[#64748B]">RISK SCORE</div>
            <div className={`text-sm font-bold font-mono ${risk === 'CRITICAL' ? 'text-[#F87171]' : risk === 'HIGH' ? 'text-[#FBBF24]' : 'text-[#CBD5E1]'}`}>
              {formatSpoilTimer(s.current_risk.time_to_spoil_minutes)}
            </div>
            <div className="text-sm font-bold font-mono" style={{ color: col.text }}>{score}%</div>
          </div>
        )}

        {/* Risk score bar */}
        <div>
          <div className="h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: col.border }} />
          </div>
        </div>

        {/* Risk badge */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: col.bg, color: col.text, border: `1px solid ${col.border}40` }}>
            {risk}
          </span>
          <span className="text-[10px] text-[#64748B]">{s.status}</span>
        </div>
      </div>

      {/* Hover overlay CTA */}
      <div className="absolute inset-0 rounded-lg bg-[#4DD9AC]/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="bg-[#0D1117] border border-[#4DD9AC]/40 text-[#4DD9AC] text-xs px-3 py-1.5 rounded font-medium">
          View Details →
        </span>
      </div>
    </div>
  );
}
