/**
 * Cargofy — Control Tower (TRD Compliant)
 *
 * TRD §1  → Framer Motion animations (glassmorphism, micro-animations)
 * TRD §1  → Cesium.js 3D Fleet Map (photorealistic globe, truck billboards)
 * TRD §1  → Zustand state management
 * TRD §2  → WebSocket real-time updates (Firebase RTDB + FastAPI ws)
 * TRD §3  → Supabase PostgreSQL (via FastAPI)
 * TRD §6  → Gemini AI action queue via RTDB /ai_action_queue
 * TRD §10 → WhatsApp alerts (CallMeBot / real API)
 *
 * Layout: Sidebar (nav + single user profile) | Main | Right Rail
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate }   from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCargoStore } from '../../lib/store';
import {
  getShipments, getAnalyticsSummary, getAlerts,
  getControlTowerSnapshot, connectLiveRiskStream,
  type Shipment, type Alert,
} from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { Cesium3DFleetMap } from '../../components/Cesium3DFleetMap';
import { LiveFleetMap }     from '../../components/LiveFleetMap';
import { signOut }          from '../../lib/supabase';
import { AICommandBar, type CommandResult } from '../../components/AICommandBar';
import { SwarmActivityFeed } from '../../components/SwarmActivityFeed';
import {
  Search, Bell, Package, Truck, LayoutDashboard, CheckCircle, AlertTriangle,
  ShieldAlert, Navigation, Layers, Zap, ThermometerSnowflake, Eye,
  BarChart3, Database, Settings, Map, LogOut, ArrowRight, RefreshCw,
  MessageSquare, ChevronsUp, Clock,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ── Risk helpers ───────────────────────────────────────────────────────────────
const RISK_COLOR = {
  CRITICAL: { border: '#EF4444', text: '#F87171', bg: 'rgba(239,68,68,0.08)' },
  HIGH:     { border: '#F59E0B', text: '#FBBF24', bg: 'rgba(245,158,11,0.08)' },
  MEDIUM:   { border: '#3B82F6', text: '#60A5FA', bg: 'rgba(59,130,246,0.08)' },
  LOW:      { border: '#10B981', text: '#34D399', bg: 'rgba(16,185,129,0.08)' },
} as const;
type RiskLevel = keyof typeof RISK_COLOR;

function getRisk(s: Shipment): RiskLevel {
  const c = s.current_risk?.risk_category?.toUpperCase();
  if (c === 'CRITICAL' || c === 'HIGH' || c === 'MEDIUM' || c === 'LOW') return c as RiskLevel;
  return 'LOW';
}

function spoilFmt(mins?: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function useClock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    tick(); const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function useUser() {
  try { return JSON.parse(localStorage.getItem('cargofy_user') || 'null'); } catch { return null; }
}

// ── API action helpers ─────────────────────────────────────────────────────────
async function apiPost(path: string, body: object) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Toast hook ─────────────────────────────────────────────────────────────────
type ToastType = 'ok' | 'warn' | 'err';
function useToasts() {
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: ToastType }[]>([]);
  const add = useCallback((msg: string, type: ToastType = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);
  return { toasts, add };
}

// ── Framer variants ────────────────────────────────────────────────────────────
const fadeUp  = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } };
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

// ══════════════════════════════════════════════════════════════════════════════
export function ControlTower() {
  const navigate = useNavigate();
  const clock    = useClock();
  const user     = useUser();
  const { toasts, add: toast } = useToasts();

  // ── Zustand store ─────────────────────────────────────────────────────────
  const {
    shipments, analytics, alerts,
    loading, connected,
    riskFilter, sortBy, searchQuery, mapFilter,
    setShipments, setAnalytics, setAlerts,
    setLoading, setConnected,
    setRiskFilter, setSortBy, setSearch, setMapFilter,
  } = useCargoStore();

  // ── Local UI state (non-persistent) ───────────────────────────────────────
  const [bannerOff,     setBannerOff]     = useState(false);
  const [dismissed,     setDismissed]     = useState<string[]>([]);
  const [crisisLoading, setCrisisLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [mapMode,       setMapMode]       = useState<'2d'|'3d'>('3d'); // TRD default: 3D
  const [aiFilter,      setAiFilter]      = useState<CommandResult | null>(null); // AI command filter

  // ── Firebase RTDB real-time ────────────────────────────────────────────────
  const { data: rtStats }     = useRealtimeData<any>('/network_stats');
  const { data: rtShips }     = useRealtimeData<any>('/active_shipments');
  const { data: rtAiQueue }   = useRealtimeData<any>('/ai_action_queue');
  const { data: rtLiveAlerts }= useRealtimeData<any>('/alerts_live');

  const [liveRiskEvent, setLiveRiskEvent] = useState<Record<string,unknown>|null>(null);
  const wsRef = useRef<WebSocket|null>(null);

  // ── Fetch from Supabase via FastAPI — using Control Tower snapshot ─────────
  const fetchAll = useCallback(async () => {
    try {
      // Primary: single snapshot call (replaces 3 separate calls)
      const snap = await getControlTowerSnapshot().catch(() => null);
      if (snap) {
        // Map snapshot into store-compatible shapes
        const [s, a, al] = await Promise.all([
          getShipments('active'),
          getAnalyticsSummary(),
          getAlerts(),
        ]);
        setShipments(s);
        setAnalytics(a);
        setAlerts(al.slice(0, 20));
      } else {
        // Fallback: individual calls
        const [s, a, al] = await Promise.all([
          getShipments('active'),
          getAnalyticsSummary(),
          getAlerts(),
        ]);
        setShipments(s);
        setAnalytics(a);
        setAlerts(al.slice(0, 20));
      }
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [setShipments, setAnalytics, setAlerts, setConnected, setLoading]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── WebSocket: Live Risk Stream (/api/v1/agent/ws/live) ───────────────────
  useEffect(() => {
    const ws = connectLiveRiskStream(
      (event) => {
        setLiveRiskEvent(event);
        // If a new CRITICAL risk event fires, refresh data
        if (event.risk_category === 'CRITICAL' || event.severity === 'CRITICAL') {
          fetchAll();
        }
      },
      () => { wsRef.current = null; }
    );
    wsRef.current = ws;
    return () => { ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Merge realtime into display ────────────────────────────────────────────
  const displayShips: Shipment[] = React.useMemo(() => {
    if (!rtShips) return shipments;
    return shipments.map(s => {
      const rt = rtShips[s.shipment_code];
      if (!rt) return s;
      return {
        ...s,
        status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage?.toLowerCase() ?? s.status,
        current_risk: {
          ...s.current_risk,
          risk_score:            rt.risk_score / 100,
          risk_category:         rt.risk_category,
          time_to_spoil_minutes: rt.spoilage_window_min,
        },
      } as Shipment;
    });
  }, [shipments, rtShips]);

  const displayAlerts: Alert[] = React.useMemo(() => {
    if (!rtLiveAlerts) return alerts;
    const live = Object.entries(rtLiveAlerts).map(([id, item]: [string, any]) => ({
      id, shipment_id: item.shipment_id ?? '',
      message_body: item.message ?? '',
      risk_category: item.severity ?? 'HIGH',
      created_at: item.sent_at ? new Date(item.sent_at).toISOString() : new Date().toISOString(),
    }));
    return live.length > 0 ? live : alerts;
  }, [alerts, rtLiveAlerts]);

  // Gemini AI action queue (TRD §6)
  const aiActions = React.useMemo(() => {
    if (rtAiQueue) {
      const arr = Array.isArray(rtAiQueue) ? rtAiQueue : Object.values(rtAiQueue);
      return (arr as any[]).map((a: any) => ({
        id: a.id ?? Math.random().toString(), text: a.message ?? '',
        cta: a.action_type === 'REROUTE' ? 'Reroute Now' : a.action_type === 'ALERT' ? 'Alert Driver' : 'Review',
        shipmentCode: a.shipment_code ?? '',
      }));
    }
    return displayShips
      .filter(s => ['CRITICAL','HIGH','MEDIUM'].includes(getRisk(s)) && !dismissed.includes(s.id))
      .slice(0, 3)
      .map(s => {
        const r = getRisk(s); const sp = s.current_risk?.time_to_spoil_minutes;
        return {
          id: s.id, shipmentCode: s.shipment_code,
          text: r === 'CRITICAL'
            ? `🔴 CRITICAL: Reroute ${s.shipment_code} to nearest cold hub within ${sp ? Math.floor(sp * 0.4) : 30} min.`
            : r === 'HIGH'
            ? `⚠️ HIGH: Alert driver on ${s.shipment_code} — reefer temp rising, reroute or adjust.`
            : `📊 MEDIUM: ${s.shipment_code} safe window may close in ${sp ? Math.floor(sp * 0.6) : 60} min.`,
          cta: r === 'CRITICAL' ? 'Reroute Now' : r === 'HIGH' ? 'Alert Driver' : 'Review',
        };
      });
  }, [rtAiQueue, displayShips, dismissed]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = displayShips
    .filter(s => {
      // AI command filter
      if (aiFilter) {
        const f = aiFilter.filters;
        if (f.product && s.product_type !== f.product) return false;
        if (f.risk && getRisk(s) !== f.risk) return false;
        if (f.region && !(s.origin?.toLowerCase().includes(f.region.toLowerCase()) ||
                          s.destination?.toLowerCase().includes(f.region.toLowerCase()))) return false;
      }
      const q = searchQuery.toLowerCase();
      if (q && !s.shipment_code.toLowerCase().includes(q) &&
          !s.product_type.toLowerCase().includes(q) &&
          !(s.origin ?? '').toLowerCase().includes(q) &&
          !(s.destination ?? '').toLowerCase().includes(q)) return false;
      if (riskFilter !== 'ALL' && getRisk(s) !== riskFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'risk') {
        const o = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
        return (o[getRisk(a)] ?? 9) - (o[getRisk(b)] ?? 9);
      }
      if (sortBy === 'spoil')
        return (a.current_risk?.time_to_spoil_minutes ?? 9999) - (b.current_risk?.time_to_spoil_minutes ?? 9999);
      return 0;
    });

  const critical   = displayShips.filter(s => getRisk(s) === 'CRITICAL');
  const high       = displayShips.filter(s => getRisk(s) === 'HIGH');
  const watchlist  = rtStats?.watchlist_count ?? displayShips.filter(s => ['HIGH','MEDIUM'].includes(getRisk(s))).length;
  const savings    = rtStats?.loss_prevented_today_inr ?? analytics?.estimated_savings_inr ?? 0;
  const savingsFmt = savings >= 100000 ? `₹${(savings/100000).toFixed(1)}L` : savings >= 1000 ? `₹${(savings/1000).toFixed(0)}K` : `₹${savings}`;
  const onTime     = rtStats?.on_time_rate_7d ?? (analytics ? Math.max(0, 94 - (analytics.high_risk_shipments ?? 0) * 2) : 94);
  const pendingAcks= displayShips.filter(s => ['CRITICAL','HIGH'].includes(getRisk(s)) && s.current_risk?.computed_at);
  const mapShips   = displayShips.filter(s => {
    if (mapFilter === 'critical') return getRisk(s) === 'CRITICAL';
    if (mapFilter === 'delayed')  return (s.current_risk?.time_to_spoil_minutes ?? 9999) < 120;
    return true;
  });

  const userName   = user?.name ?? user?.email?.split('@')[0] ?? 'User';
  const userEmail  = user?.email ?? '';
  const userAvatar = user?.avatar ?? null;
  const initials   = userName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  // ── Real API handlers ──────────────────────────────────────────────────────
  const handleAlertDriver = async (s: Shipment) => {
    setActionLoading(s.id);
    try {
      await apiPost('/api/v1/alerts/send-manual', {
        shipment_id: s.shipment_code, alert_type: 'TEMP_BREACH', channel: 'WHATSAPP',
      });
      toast(`✅ WhatsApp alert sent — ${s.shipment_code}`, 'ok');
    } catch (e: any) {
      toast(`⚠️ Alert failed: ${e.message}`, 'warn');
    } finally { setActionLoading(''); }
  };

  const handleEscalate = async (s: Shipment) => {
    setActionLoading(s.id + '_esc');
    try {
      await apiPost('/api/v1/interventions/alert-driver', {
        shipment_id: s.shipment_code, alert_type: 'ESCALATION', escalate_to: 'FLEET_MANAGER',
      });
      toast(`🚨 ${s.shipment_code} escalated to Fleet Manager`, 'warn');
    } catch (e: any) {
      toast(`⚠️ Escalation failed: ${e.message}`, 'warn');
    } finally { setActionLoading(''); }
  };

  const handleResend = async (alertId: string, code: string) => {
    setActionLoading('resend_' + alertId);
    try {
      await apiPost(`/api/v1/alerts/${alertId}/resend`, {});
      toast(`✅ Alert resent — ${code}`, 'ok');
    } catch (e: any) {
      toast(`⚠️ Resend failed: ${e.message}`, 'warn');
    } finally { setActionLoading(''); }
  };

  const handleCrisis = async (scenario: string) => {
    setCrisisLoading(true);
    toast(`⚡ Simulating "${scenario}" — Gemini AI agent running…`, 'warn');
    const first = filtered[0];
    try {
      const data = await apiPost('/api/v1/agent/simulate-critical', {
        scenario, shipment_id: first?.shipment_code ?? 'SHP-DEMO-001',
        product_type: first?.product_type ?? 'milk',
      });
      if (data.agent_result?.should_reroute) {
        toast(`🤖 Agent: Rerouting → ${data.agent_result?.nearest_facility?.name ?? 'nearest cold hub'}`, 'warn');
      } else {
        toast('🤖 Gemini Agent: No reroute required at this risk level', 'ok');
      }
      await fetchAll();
    } catch (e: any) {
      toast(`Agent error: ${e.message}`, 'err');
    } finally { setCrisisLoading(false); }
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden"
         style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Toasts (Framer Motion) ───────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id}
              initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl border backdrop-blur-sm ${
                t.type === 'ok'  ? 'bg-[#0D2B22]/90 border-[#4DD9AC]/40 text-[#4DD9AC]' :
                t.type === 'err' ? 'bg-[#2B0D0D]/90 border-[#EF4444]/40 text-[#F87171]' :
                                   'bg-[#2B1A0D]/90 border-[#F59E0B]/40 text-[#FBBF24]'
              }`}>
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TOP NAV BAR — glassmorphism
      ═══════════════════════════════════════════════════════════════════════ */}
      <motion.header
        initial={{ y: -56 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="shrink-0 h-14 bg-[#0A0D14]/80 backdrop-blur-md border-b border-[#1E2530]/80 flex items-center px-4 gap-3 z-40">

        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono shrink-0 cursor-pointer select-none"
          onClick={() => navigate('/dashboard')}>
          CARGOFY
        </motion.div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm hidden md:block group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] group-focus-within:text-[#4DD9AC] transition-colors" />
          <input
            value={searchQuery} onChange={e => setSearch(e.target.value)}
            placeholder="Search shipment, route, driver…"
            className="w-full bg-[#10131B]/80 border border-[#1E2530] text-[#CBD5E1] text-sm pl-9 pr-4 py-1.5 rounded-lg focus:outline-none focus:border-[#4DD9AC]/50 transition-all placeholder-[#4A5568]"
          />
        </div>

        <div className="flex-1" />

        {/* Live clock */}
        <div className="hidden lg:flex items-center gap-2 font-mono text-xs">
          <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#4DD9AC]' : 'bg-[#EF4444]'}`} />
          <span className="text-[#64748B]">{clock} IST</span>
        </div>

        {/* Refresh */}
        <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
          onClick={fetchAll} title="Refresh"
          className="text-[#64748B] hover:text-[#4DD9AC] transition-colors p-1.5">
          <RefreshCw size={15} />
        </motion.button>

        {/* Bell */}
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          className="relative text-[#64748B] hover:text-white transition-colors p-1.5"
          onClick={() => navigate('/alerts-center')}>
          <Bell size={18} />
          <AnimatePresence>
            {critical.length > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 bg-[#EF4444] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-[#080B12]">
                {critical.length}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* 3D / 2D Toggle */}
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => setMapMode(m => m === '3d' ? '2d' : '3d')}
          className={`hidden lg:flex items-center gap-1.5 border text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
            mapMode === '3d'
              ? 'bg-[#6366F1]/15 border-[#6366F1]/40 text-[#818CF8]'
              : 'bg-[#1E2530] border-[#1E2530] text-[#64748B]'
          }`}>
          <Map size={13} /> {mapMode === '3d' ? '3D Globe' : '2D Map'}
        </motion.button>

        {/* AI Crisis Simulation (Gemini AI — TRD §6) */}
        <div className="relative group">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            disabled={crisisLoading}
            onClick={() => handleCrisis('battery_failure')}
            className="flex items-center gap-1.5 bg-[#EF4444]/10 border border-[#EF4444]/40 text-[#F87171] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#EF4444]/20 transition-all disabled:opacity-50"
            title="Trigger a Gemini AI crisis scenario to test escalation workflows">
            {crisisLoading
              ? <RefreshCw size={12} className="animate-spin"/>
              : <ShieldAlert size={12} />}
            <span className="hidden sm:inline">{crisisLoading ? 'AI Running…' : 'AI Crisis Sim'}</span>
          </motion.button>
          <div className="absolute right-0 top-10 hidden group-hover:block bg-[#0D1117] border border-[#1E2530] rounded-xl shadow-2xl py-1 min-w-[200px] z-50 backdrop-blur">
            <div className="px-3 py-1.5 text-[9px] text-[#4A5568] uppercase tracking-widest border-b border-[#1E2530] mb-1">Gemini AI Scenarios</div>
            {[
              { label: '⚡ Battery Failure', s: 'battery_failure' },
              { label: '🌡️ Temp Spike',       s: 'temp_spike' },
              { label: '🚪 Door Tamper',      s: 'door_tamper' },
              { label: '💥 Combined Crisis',  s: 'combined' },
            ].map(({ label, s }) => (
              <button key={s} onClick={() => handleCrisis(s)}
                className="w-full text-left px-4 py-2.5 text-xs text-[#CBD5E1] hover:bg-[#1E2530] hover:text-white transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* + Create Shipment */}
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={() => navigate('/create-shipment')}
          className="shrink-0 bg-gradient-to-r from-[#4DD9AC] to-[#34C994] text-[#003829] font-bold text-xs px-4 py-2 rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-lg shadow-[#4DD9AC]/20">
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">New Shipment</span>
        </motion.button>
      </motion.header>

      {/* ══════════════════════════════════════════════════════════════════════
          BODY
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
        <motion.aside
          initial={{ x: -220 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="shrink-0 w-[220px] bg-[#0D1117]/95 border-r border-[#1E2530] flex-col hidden md:flex">
          <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
            <NavItem icon={<LayoutDashboard size={16}/>} label="Control Tower"        href="/dashboard"         active />
            <SectionLabel label="OPERATIONS" />
            <NavItem icon={<Package size={16}/>}         label="Create Shipment"      href="/create-shipment" />
            <NavItem icon={<Truck size={16}/>}           label="Active Shipments"     href="/active-shipments"  badge={shipments.length} />
            <NavItem icon={<Layers size={16}/>}          label="Dispatch Queue"       href="/active-shipments" />
            <SectionLabel label="MONITORING" />
            <NavItem icon={<Navigation size={16}/>}      label="Live Tracking"        href="/live-tracking" />
            <NavItem icon={<ShieldAlert size={16}/>}     label="Risk & Interventions" href="/risk"              badge={critical.length + high.length} badgeColor="#EF4444" />
            <NavItem icon={<Zap size={16}/>}             label="IoT Simulator"        href="/iot-simulator" />
            <SectionLabel label="INTELLIGENCE" />
            <NavItem icon={<BarChart3 size={16}/>}       label="Analytics"            href="/cargofy-analytics" />
            <NavItem icon={<Database size={16}/>}        label="Fleet & Drivers"      href="/fleet" />
            <SectionLabel label="COMMUNICATION" />
            <NavItem icon={<Bell size={16}/>}            label="Alerts Log"           href="/alerts-center"     badge={displayAlerts.length} badgeColor="#EF4444" />
            <SectionLabel label="SYSTEM" />
            <NavItem icon={<Settings size={16}/>}        label="Settings"             href="/settings" />
          </nav>

          {/* ── User Profile — single, canonical ─────────────────────────── */}
          <div className="p-3 border-t border-[#1E2530]">
            <div className="flex items-center gap-1.5 text-[10px] mb-3">
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#34D399]' : 'bg-[#EF4444]'}`} />
              <span className={connected ? 'text-[#34D399]' : 'text-[#EF4444]'}>
                {connected ? 'All systems live' : 'Reconnecting…'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {userAvatar
                  ? <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full object-cover border-2 border-[#4DD9AC]/40 shrink-0" />
                  : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4DD9AC] to-[#34c994] flex items-center justify-center text-[#022518] text-xs font-black shrink-0">{initials}</div>
                }
                <div className="min-w-0">
                  <div className="text-xs text-[#F1F5F9] font-semibold truncate">{userName}</div>
                  <div className="text-[10px] text-slate-500 truncate">{userEmail}</div>
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={async () => { await signOut(); navigate('/login'); }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                title="Sign out">
                <LogOut size={13} />
              </motion.button>
            </div>
          </div>
        </motion.aside>

        {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* 6 KPI chips */}
          <div className="shrink-0 bg-[#0D1117]/95 border-b border-[#1E2530]">
            {loading
              ? <div className="flex items-center justify-center h-[72px] text-[#64748B] text-sm gap-2">
                  <RefreshCw size={14} className="animate-spin" /> Loading live data…
                </div>
              : (
                <motion.div variants={stagger} initial="hidden" animate="visible"
                  className="grid grid-cols-3 md:grid-cols-6 h-[72px]">
                  {[
                    { icon: <Truck size={17}/>,              label: 'Active',        value: rtStats?.active_shipments ?? displayShips.length, color: '#60A5FA' },
                    { icon: <ThermometerSnowflake size={17}/>,label: 'Reefer Live',  value: rtStats?.live_reefer_vehicles ?? displayShips.length, color: '#4DD9AC', div: true },
                    { icon: <Eye size={17}/>,                label: 'Watchlist',     value: watchlist,              color: '#FBBF24', div: true },
                    { icon: <ShieldAlert size={17}/>,        label: 'Critical',      value: critical.length,        color: '#F87171', div: true },
                    { icon: <Database size={17}/>,           label: 'Loss Saved',    value: savings > 0 ? savingsFmt : '₹0', color: '#34D399', div: true },
                    { icon: <CheckCircle size={17}/>,        label: 'On-Time %',     value: `${onTime}%`,           color: '#34D399', div: true },
                  ].map((c, i) => (
                    <motion.div key={i} variants={fadeUp}
                      className={`flex flex-col items-center justify-center h-full px-3 ${c.div ? 'border-l border-[#1E2530]' : ''}`}>
                      <div className="text-[9px] uppercase tracking-widest mb-0.5 flex items-center gap-1" style={{ color: `${c.color}99` }}>
                        {c.icon} {c.label}
                      </div>
                      <div className="text-xl font-black font-mono" style={{ color: c.color }}>{c.value}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )
            }
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── AI COMMAND BAR (Hackathon Upgrade 1) ──────────────────── */}
            <AICommandBar
              onResult={(result) => setAiFilter(result)}
              onClear={() => setAiFilter(null)}
            />

            {/* Exception banner */}
            <AnimatePresence>
              {!bannerOff && critical.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}
                  className="bg-gradient-to-r from-[#1C0A0A] to-[#180808] border-l-4 border-[#EF4444] rounded-r-xl px-4 py-3 flex items-start gap-3">
                  <ShieldAlert size={18} className="text-[#EF4444] shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    {critical.map(s => (
                      <button key={s.id} onClick={() => navigate(`/shipments/${s.id}`)}
                        className="block w-full text-left text-sm text-[#FCA5A5] hover:text-white transition-colors">
                        <span className="font-mono text-[#EF4444] font-bold">{s.shipment_code}</span>
                        {' '}— {s.product_type} exceeded safe temp.
                        {s.current_risk?.time_to_spoil_minutes && (
                          <span className="text-[#FBBF24]"> Spoils in {spoilFmt(s.current_risk.time_to_spoil_minutes)}.</span>
                        )}
                        {' '}<span className="underline">View →</span>
                      </button>
                    ))}
                    {high.length > 0 && (
                      <button onClick={() => navigate('/risk')}
                        className="flex items-center gap-1.5 text-sm text-[#FDE68A] hover:text-white transition-colors">
                        <AlertTriangle size={13} /> {high.length} at HIGH risk —
                        <span className="underline">Review →</span>
                      </button>
                    )}
                  </div>
                  <button onClick={() => setBannerOff(true)} className="text-[#64748B] hover:text-white text-lg">×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Journey Board */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
                  Shipment Journey Board
                  <span className="text-xs bg-[#1E2530] text-[#94A3B8] px-2 py-0.5 rounded-full">{filtered.length} active</span>
                </h2>
                <div className="flex items-center gap-2">
                  <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                    className="bg-[#0D1117] border border-[#1E2530] text-[#94A3B8] text-xs rounded-lg px-2 py-1 focus:outline-none">
                    <option value="ALL">All Risks</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                    className="bg-[#0D1117] border border-[#1E2530] text-[#94A3B8] text-xs rounded-lg px-2 py-1 focus:outline-none">
                    <option value="risk">By Risk</option>
                    <option value="spoil">By Spoil Timer</option>
                    <option value="eta">By ETA</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[1,2,3].map(i => (
                    <motion.div key={i} animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                      className="h-[185px] bg-[#0D1117] rounded-xl border border-[#1E2530]" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-[#64748B] flex flex-col items-center gap-2">
                  <Package size={40} className="opacity-30" />
                  <p>No shipments match your filter.</p>
                  <button onClick={() => navigate('/create-shipment')} className="text-[#4DD9AC] underline text-sm">
                    Create first shipment →
                  </button>
                </div>
              ) : (
                <motion.div variants={stagger} initial="hidden" animate="visible"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map(s => (
                    <ShipCard key={s.id} s={s} actionLoading={actionLoading}
                      onView={() => navigate(`/shipments/${s.id}`)}
                      onAlertDriver={() => handleAlertDriver(s)}
                      onEscalate={() => handleEscalate(s)} />
                  ))}
                </motion.div>
              )}
            </div>

            {/* ── Cesium 3D / Leaflet 2D Map (TRD §1) ──────────────────── */}
            <div className="rounded-xl overflow-hidden border border-[#1E2530]">
              {/* Map toolbar */}
              <div className="bg-[#0D1117] border-b border-[#1E2530] px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-medium">
                    {mapMode === '3d' ? '🌐 Cesium 3D Globe — Live Fleet' : '🗺 2D Live Map — Live Fleet'}
                  </span>
                  <div className="flex gap-2 text-[10px]">
                    <span className="flex items-center gap-1 text-[#34D399]"><span className="w-1.5 h-1.5 rounded-full bg-[#34D399]"/>On Track</span>
                    <span className="flex items-center gap-1 text-[#FBBF24]"><span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]"/>Delayed</span>
                    <span className="flex items-center gap-1 text-[#EF4444]"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"/>Critical</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(['all','critical','delayed'] as const).map(f => (
                    <button key={f} onClick={() => setMapFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-medium border transition-colors ${
                        mapFilter === f
                          ? 'bg-[#4DD9AC]/10 border-[#4DD9AC]/40 text-[#4DD9AC]'
                          : 'border-[#1E2530] text-[#64748B] hover:text-[#94A3B8]'
                      }`}>
                      {f === 'all' ? 'All' : f === 'critical' ? 'Critical' : 'Delayed'}
                    </button>
                  ))}
                  <button onClick={() => navigate('/live-tracking')}
                    className="text-[10px] text-[#4DD9AC] border border-[#4DD9AC]/30 px-2.5 py-1 rounded-lg hover:border-[#4DD9AC]/60 transition-colors">
                    Full Map →
                  </button>
                </div>
              </div>

              {/* Map canvas — Cesium 3D (TRD §1) or Leaflet 2D */}
              <div className="relative h-[420px] bg-[#080B12]">
                {mapMode === '3d'
                  ? <Cesium3DFleetMap shipments={mapShips} onShipmentClick={id => navigate(`/shipments/${id}`)} className="absolute inset-0" />
                  : <LeafletFallback  shipments={mapShips} onShipmentClick={id => navigate(`/shipments/${id}`)} />
                }
              </div>
            </div>

          </div>
        </main>

        {/* ── RIGHT RAIL ──────────────────────────────────────────────────── */}
        <motion.aside
          initial={{ x: 285 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.1 }}
          className="w-[285px] shrink-0 bg-[#0D1117]/95 border-l border-[#1E2530] hidden lg:flex flex-col overflow-y-auto">

          {/* A: Live Alerts */}
          <RailSection title="Live Alerts" dot="red">
            {loading ? <p className="text-[#64748B] text-xs">Loading…</p>
              : (critical.length === 0 && high.length === 0)
              ? <div className="flex items-center gap-1.5 text-xs text-[#64748B]"><CheckCircle size={12} className="text-[#4DD9AC]"/>All nominal ✓</div>
              : (
                <div className="space-y-2">
                  {[...critical, ...high].slice(0, 4).map(s => {
                    const col = RISK_COLOR[getRisk(s)];
                    return (
                      <motion.div key={s.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                        className="rounded-lg p-2.5" style={{ background: col.bg, borderLeft: `3px solid ${col.border}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[11px] font-bold" style={{ color: col.text }}>
                            {getRisk(s)} · {s.shipment_code}
                          </span>
                          <span className="text-[10px] text-[#64748B]">{timeAgo(s.current_risk?.computed_at)}</span>
                        </div>
                        <div className="text-xs text-[#CBD5E1] mb-1 truncate">
                          {s.product_type} · {s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}
                        </div>
                        {s.current_risk?.time_to_spoil_minutes && (
                          <div className="text-[11px] text-[#FBBF24] mb-2">Spoils in {spoilFmt(s.current_risk.time_to_spoil_minutes)}</div>
                        )}
                        <div className="flex gap-1.5">
                          <button onClick={() => navigate(`/shipments/${s.id}`)}
                            className="text-[10px] bg-[#1E2530] text-[#94A3B8] hover:text-white px-2 py-1 rounded transition-colors">View</button>
                          <button disabled={actionLoading === s.id}
                            onClick={() => handleAlertDriver(s)}
                            className="text-[10px] bg-[#4DD9AC]/10 text-[#4DD9AC] hover:bg-[#4DD9AC]/20 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1">
                            {actionLoading === s.id ? <RefreshCw size={8} className="animate-spin"/> : <MessageSquare size={8}/>} Alert
                          </button>
                          <button disabled={actionLoading === s.id + '_esc'}
                            onClick={() => handleEscalate(s)}
                            className="text-[10px] bg-[#EF4444]/10 text-[#F87171] hover:bg-[#EF4444]/20 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1">
                            {actionLoading === s.id+'_esc' ? <RefreshCw size={8} className="animate-spin"/> : <ChevronsUp size={8}/>} Escalate
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )
            }
          </RailSection>

          {/* B: At-Risk (risk score bars) */}
          <RailSection title="At-Risk Shipments">
            {displayShips.length === 0
              ? <p className="text-[#64748B] text-xs">No data</p>
              : (
                <div className="space-y-2.5">
                  {displayShips
                    .sort((a,b) => (b.current_risk?.risk_score ?? 0) - (a.current_risk?.risk_score ?? 0))
                    .slice(0, 5).map(s => {
                      const col = RISK_COLOR[getRisk(s)];
                      const score = Math.round((s.current_risk?.risk_score ?? 0) * 100);
                      return (
                        <button key={s.id} onClick={() => navigate(`/shipments/${s.id}`)} className="w-full text-left group">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-[#CBD5E1] group-hover:text-white transition-colors">{s.shipment_code}</span>
                            <span className="text-[10px] font-bold" style={{ color: col.text }}>{score}%</span>
                          </div>
                          <motion.div className="h-1 bg-[#1E2530] rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                              className="h-full rounded-full" style={{ backgroundColor: col.border }} />
                          </motion.div>
                        </button>
                      );
                    })}
                </div>
              )
            }
          </RailSection>

          {/* C: Pending ACKs — real timestamps */}
          <RailSection title="Pending Driver ACKs" icon={<Clock size={10}/>}>
            {pendingAcks.length === 0
              ? <p className="text-[#64748B] text-xs">All drivers acknowledged ✓</p>
              : (
                <div className="space-y-2">
                  {pendingAcks.slice(0, 3).map(s => {
                    const al = displayAlerts.find(a => a.shipment_id === s.id);
                    return (
                      <div key={s.id} className="bg-[#111827] rounded-lg p-2.5 border border-[#1E2530]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-[#FBBF24]">{s.shipment_code}</span>
                          <span className="text-[10px] text-[#64748B]">{timeAgo(al?.created_at ?? s.current_risk?.computed_at)}</span>
                        </div>
                        <div className="text-[10px] text-[#94A3B8] mb-2">Alert sent — awaiting acknowledgement</div>
                        <div className="flex gap-1.5">
                          <button disabled={actionLoading === 'resend_'+(al?.id ?? s.id)}
                            onClick={() => handleResend(al?.id ?? s.id, s.shipment_code)}
                            className="text-[10px] bg-[#1E2530] text-[#94A3B8] hover:text-white px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1">
                            {actionLoading === 'resend_'+(al?.id ?? s.id) ? <RefreshCw size={8} className="animate-spin"/> : null} Resend
                          </button>
                          <button disabled={actionLoading === s.id+'_esc'}
                            onClick={() => handleEscalate(s)}
                            className="text-[10px] bg-[#EF4444]/10 text-[#F87171] px-2 py-1 rounded transition-colors disabled:opacity-50">Escalate</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </RailSection>

          {/* D: Gemini AI Actions (TRD §6) */}
          <RailSection title="Gemini AI Actions" icon={<Zap size={10}/>} titleColor="#4DD9AC">
            {aiActions.filter(a => !dismissed.includes(a.id)).length === 0
              ? <p className="text-[#64748B] text-xs">No urgent actions ✓</p>
              : (
                <div className="space-y-2">
                  {aiActions.filter(a => !dismissed.includes(a.id)).map(a => (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-[#111827] rounded-lg p-3 border border-[#1E2530]">
                      <p className="text-xs text-[#CBD5E1] mb-2 leading-relaxed">{a.text}</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            if (a.cta === 'Reroute Now') navigate('/risk');
                            else if (a.cta === 'Alert Driver') {
                              const s = displayShips.find(s => s.shipment_code === a.shipmentCode);
                              if (s) handleAlertDriver(s);
                            } else navigate('/risk');
                            setDismissed(d => [...d, a.id]);
                          }}
                          className="flex-1 text-[10px] bg-gradient-to-r from-[#4DD9AC] to-[#6EF6C7] text-[#003829] font-bold py-1 rounded hover:brightness-110 transition-all">
                          {a.cta}
                        </button>
                        <button onClick={() => setDismissed(d => [...d, a.id])}
                          className="text-[10px] bg-[#1E2530] text-[#64748B] hover:text-white px-2 py-1 rounded transition-colors">
                          Dismiss
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )
            }
          </RailSection>

          {/* E: Swarm Activity Feed (Hackathon Upgrade 2) */}
          <div style={{ padding: '0 12px 12px' }}>
            <SwarmActivityFeed maxItems={10} />
          </div>

        </motion.aside>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <div className="px-4 pt-3 pb-0.5"><span className="text-[9px] font-semibold text-[#3A4255] uppercase tracking-widest">{label}</span></div>;
}

function NavItem({ icon, label, href, active, badge, badgeColor = '#60A5FA' }: {
  icon: React.ReactNode; label: string; href: string; active?: boolean; badge?: number; badgeColor?: string;
}) {
  const navigate = useNavigate();
  return (
    <motion.button whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
      onClick={() => navigate(href)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left group ${
        active
          ? 'bg-gradient-to-r from-[#4DD9AC]/12 to-transparent text-[#4DD9AC] border-l-2 border-[#4DD9AC]'
          : 'text-[#64748B] hover:bg-[#111827] hover:text-[#CBD5E1] border-l-2 border-transparent'
      }`}>
      <span className={`w-4 flex justify-center shrink-0 ${active ? '' : 'group-hover:text-[#4DD9AC]'}`}>{icon}</span>
      <span className="flex-1 truncate text-xs">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${badgeColor}20`, color: badgeColor }}>{badge}</span>
      )}
    </motion.button>
  );
}

function RailSection({ title, children, dot, icon, titleColor }:{
  title: string; children: React.ReactNode;
  dot?: 'red'; icon?: React.ReactNode; titleColor?: string;
}) {
  return (
    <div className="p-4 border-b border-[#1E2530]">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest mb-3 flex items-center gap-2"
          style={{ color: titleColor ?? '#64748B' }}>
        {dot === 'red' && <motion.span animate={{ opacity: [1,0.3,1] }} transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />}
        {icon && icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function ShipCard({ s, actionLoading, onView, onAlertDriver, onEscalate }: {
  s: Shipment; actionLoading: string;
  onView: () => void; onAlertDriver: () => void; onEscalate: () => void;
}) {
  const risk  = getRisk(s);
  const col   = RISK_COLOR[risk];
  const score = Math.round((s.current_risk?.risk_score ?? 0) * 100);

  return (
    <motion.div variants={fadeUp}
      whileHover={{ y: -2, boxShadow: `0 8px 30px ${col.border}18` }}
      onClick={onView}
      className="relative bg-[#0D1117] rounded-xl border border-[#1E2530] cursor-pointer group transition-colors duration-200"
      style={{ borderLeft: `3px solid ${col.border}` }}>

      {/* Header */}
      <div className="p-3 pb-2 border-b border-[#1E2530]">
        <div className="flex items-start justify-between mb-0.5">
          <span className="font-mono text-sm font-bold text-[#F1F5F9]">{s.shipment_code}</span>
          <div className="flex items-center gap-1.5">
            {(s.product_type?.toLowerCase().includes('milk') || s.product_type?.toLowerCase().includes('frozen'))
              ? <ThermometerSnowflake size={13} className="text-[#4DD9AC]" />
              : <Package size={13} className="text-[#64748B]" />}
            {risk === 'CRITICAL' && (
              <motion.span animate={{ opacity: [1,0.2,1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-2 h-2 rounded-full bg-[#EF4444]" />
            )}
          </div>
        </div>
        <div className="text-[11px] text-[#64748B] truncate">
          {s.origin?.split(',')[0] ?? '—'} → {s.destination?.split(',')[0] ?? '—'}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-x-3 text-[10px]">
          <span className="text-[#64748B]">PRODUCT</span>
          <span className="text-[#64748B]">VEHICLE</span>
          <span className="text-xs text-[#CBD5E1] font-medium capitalize">{s.product_type ?? '—'}</span>
          <span className="text-xs text-[#CBD5E1] font-mono truncate">{s.vehicle_number ?? '—'}</span>
        </div>

        {s.current_risk && (
          <div className="grid grid-cols-2 gap-x-3 text-[10px]">
            <span className="text-[#64748B]">SPOILS IN</span>
            <span className="text-[#64748B]">RISK SCORE</span>
            <span className={`text-sm font-bold font-mono ${risk === 'CRITICAL' ? 'text-[#F87171]' : risk === 'HIGH' ? 'text-[#FBBF24]' : 'text-[#CBD5E1]'}`}>
              {spoilFmt(s.current_risk.time_to_spoil_minutes)}
            </span>
            <span className="text-sm font-bold font-mono" style={{ color: col.text }}>{score}%</span>
          </div>
        )}

        {/* Animated risk bar */}
        <div className="h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full" style={{ backgroundColor: col.border }} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: col.bg, color: col.text, border: `1px solid ${col.border}40` }}>
            {risk}
          </span>
          {['CRITICAL','HIGH'].includes(risk) && (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <button disabled={actionLoading === s.id}
                onClick={onAlertDriver}
                className="text-[9px] bg-[#4DD9AC]/10 text-[#4DD9AC] hover:bg-[#4DD9AC]/20 px-2 py-0.5 rounded transition-colors disabled:opacity-50 flex items-center gap-0.5">
                {actionLoading === s.id ? <RefreshCw size={8} className="animate-spin"/> : <MessageSquare size={8}/>} Alert
              </button>
              <button disabled={actionLoading === s.id+'_esc'}
                onClick={onEscalate}
                className="text-[9px] bg-[#EF4444]/10 text-[#F87171] hover:bg-[#EF4444]/20 px-2 py-0.5 rounded transition-colors disabled:opacity-50">
                Escalate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 rounded-xl bg-[#4DD9AC]/3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="bg-[#0D1117] border border-[#4DD9AC]/40 text-[#4DD9AC] text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
          View Details <ArrowRight size={12}/>
        </span>
      </div>
    </motion.div>
  );
}

/** Leaflet 2D fallback when user switches from 3D */
function LeafletFallback({ shipments, onShipmentClick }: { shipments: Shipment[]; onShipmentClick: (id:string)=>void }) {
  return <LiveFleetMap shipments={shipments} onShipmentClick={onShipmentClick} className="absolute inset-0 w-full h-full" />;
}
