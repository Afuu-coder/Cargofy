import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getShipments, getSensorHistory, getRiskEvents, getAlerts, sendTestAlert,
  alertDriver, triggerAgent, getRiskDetail, sendManualAlert,
  triggerRerouteAgent, simulateCriticalEvent,
  type Shipment, type SensorReading, type RiskEvent, type Alert,
} from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import {
  Bot, Sparkles, Loader2, CheckCheck, GitBranch, Navigation, Map, TrendingDown, Clock, Zap, ShieldCheck, PhoneCall, MessageSquare, RotateCcw, ChevronRight, Building2, Truck
} from 'lucide-react';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PRODUCT_ICONS: Record<string, string> = {
  dairy:'ðŸ¥›', milk:'ðŸ¥›', seafood:'ðŸŸ', fish:'ðŸŸ', produce:'ðŸ¥¦',
  vegetables:'ðŸ¥¦', frozen:'ðŸ§Š', pharma:'ðŸ’Š', fruits:'ðŸŽ', meat:'ðŸ¥©', other:'ðŸ“¦',
};
function pIcon(t?: string) { return PRODUCT_ICONS[t?.toLowerCase() ?? ''] ?? 'ðŸ“¦'; }

const TEMP_BANDS: Record<string, [number,number]> = {
  dairy:[2,6], milk:[2,6], seafood:[0,4], fish:[0,4], pharma:[2,8],
  frozen:[-20,-15], produce:[4,10], fruits:[5,12], meat:[0,4], other:[2,8],
};
function getTempBand(type?: string): [number,number] {
  return TEMP_BANDS[type?.toLowerCase() ?? ''] ?? [2,8];
}

function getRiskColor(cat?: string) {
  const c = cat?.toUpperCase();
  return c==='CRITICAL'?'#EF4444':c==='HIGH'?'#F97316':c==='MEDIUM'?'#FBBF24':'#34D399';
}
function getRiskBg(cat?: string) {
  const c = cat?.toUpperCase();
  return c==='CRITICAL'?'rgba(239,68,68,0.05)':c==='HIGH'?'rgba(249,115,22,0.04)':c==='MEDIUM'?'rgba(251,191,36,0.04)':'rgba(52,211,153,0.04)';
}
function fmtTime(iso?: string|null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
function fmtSpoil(m?: number) {
  if (!m) return 'â€”';
  const h=Math.floor(m/60), mn=m%60;
  return h ? `${h}h ${mn}m` : `${mn}m`;
}
function getRiskCat(s: Shipment) { return s.current_risk?.risk_category?.toUpperCase() ?? 'LOW'; }
function getRiskScore(s: Shipment) { return Math.round(s.current_risk?.risk_score ?? 0); }

// SOP steps by product type
const SOP: Record<string, string[]> = {
  dairy:   ['Alert driver immediately via WhatsApp','Driver checks reefer unit and seals','If breach >15 min â†’ escalate to manager','If reefer fails â†’ divert to cold hub','Document breach start time and temp','Capture photographic evidence','Notify recipient of potential delay'],
  seafood: ['Check reefer temperature reading','Driver verifies ice pack status if applicable','Escalate immediately if >4Â°C','Consider diversion to nearest cold hub','Notify consignee of possible delay','Document all actions taken'],
  pharma:  ['Alert driver â€” check reefer immediately','Verify sensor calibration status','If breach >2Â°C â€” stop shipment at nearest hub','Contact quality assurance team','Generate deviation report','Issue hold notice for cargo'],
  default: ['Alert driver via WhatsApp','Check reefer unit status','Escalate to fleet manager if unresolved >10 min','Consider cold hub diversion','Document breach in system','Notify recipient'],
};

// â”€â”€ Risk card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RiskCard({
  shipment, sensors, riskEvts, alerts, selected, onSelect,
}: {
  shipment: Shipment; sensors: SensorReading[]; riskEvts: RiskEvent[];
  alerts: Alert[]; selected: boolean; onSelect: () => void;
}) {
  const cat      = getRiskCat(shipment);
  const score    = getRiskScore(shipment);
  const color    = getRiskColor(cat);
  const bg       = getRiskBg(cat);
  const [tMin,tMax] = getTempBand(shipment.product_type);
  const latestS  = sensors[0];
  const isBreach = (latestS?.temperature ?? 0) > tMax;
  const isCrit   = cat === 'CRITICAL';
  const isHigh   = cat === 'HIGH';
  const spoil    = shipment.current_risk?.time_to_spoil_minutes;
  const delay    = latestS?.delay_minutes ?? 0;

  // Alert status for this shipment
  const myAlerts = alerts.filter(a => a.shipment_id === shipment.id || a.shipment_code === shipment.shipment_code);
  const lastAlert = myAlerts[0];
  const alertSent = riskEvts.some(r => r.alert_sent);

  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl p-4 border-l-4 relative overflow-hidden transition-all hover:brightness-105"
      style={{
        background: selected ? `${color}10` : bg,
        borderLeftColor: color,
        boxShadow: selected ? `0 0 0 1px ${color}30, 0 4px 24px rgba(0,0,0,0.3)` : '0 2px 12px rgba(0,0,0,0.2)',
        animation: isCrit ? 'pulseBorder 3s ease-in-out infinite' : undefined,
      }}
    >
      {/* Watermark */}
      <div className="absolute right-3 top-3 text-4xl opacity-5 pointer-events-none select-none">{pIcon(shipment.product_type)}</div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-black text-[#F1F5F9]">{shipment.shipment_code}</span>
          {isCrit && <span className="w-2 h-2 rounded-full animate-pulse" style={{background:color}}/>}
        </div>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:`${color}20`,color}}>
          {cat === 'MEDIUM' ? 'WATCHLIST' : cat}
        </span>
      </div>

      {/* Route */}
      <div className="text-xs text-[#94A3B8] mb-2">
        {pIcon(shipment.product_type)} <span className="capitalize">{shipment.product_type}</span>
        {' Â· '}
        <span className="text-[#64748B]">{shipment.origin?.split(',')[0]} â†’ {shipment.destination?.split(',')[0]}</span>
      </div>

      {/* Key signals */}
      <div className="space-y-1 mb-3">
        {isBreach && latestS && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span style={{color}}>ðŸŒ¡</span>
            <span className="text-[#F87171]">Cargo temp: {latestS.temperature?.toFixed(1)}Â°C</span>
            <span className="text-[#64748B]">(safe: {tMin}â€“{tMax}Â°C)</span>
            <span className="font-bold" style={{color}}>BREACH</span>
          </div>
        )}
        {spoil && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
            <span>âš¡</span>
            <span>Spoilage window: {fmtSpoil(spoil)} remaining</span>
          </div>
        )}
        {delay > 0 ? (
          <div className="text-[11px] text-[#FBBF24]">â± Delay: +{delay} min from planned route</div>
        ) : (
          <div className="text-[11px] text-[#34D399]">â± On time â€” no delay</div>
        )}
      </div>

      {/* Driver alert status */}
      <div className="text-[10px] flex items-center gap-1.5 text-[#64748B]">
        <span>ðŸ‘¤</span>
        <span>Driver: {shipment.driver_phone ?? 'Unassigned'}</span>
        <span className={`ml-1 font-bold ${alertSent ? 'text-[#34D399]' : 'text-[#FBBF24]'}`}>
          â€” Alert {alertSent ? 'SENT' : 'NOT SENT'}
        </span>
      </div>

      {/* Score bar */}
      <div className="mt-3 h-1 bg-[#1E2530] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{width:`${score}%`, background:color}}/>
      </div>
      <div className="flex justify-between text-[9px] mt-0.5">
        <span className="text-[#4A5568]">Risk</span>
        <span className="font-mono font-bold" style={{color}}>{score}/100</span>
      </div>
    </button>
  );
}

// â”€â”€ Intervention Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── AI Countermeasure Engine ─────────────────────────────────────────────────
type CMStep = {
  id: string; label: string; icon: string;
  detail: string; auto: boolean; delay: number; color: string;
};
const CM_STEPS: CMStep[] = [
  { id:'s1', label:'Threat Assessment',     icon:'🔍', detail:'Gemini ADK scans 47 IoT telemetry parameters — Severity: CRITICAL',  auto:true,  delay:0,    color:'#A78BFA' },
  { id:'s2', label:'Driver WhatsApp Alert',  icon:'📲', detail:'Auto-dispatched to +91-98XX-XXXXX — ACK within 45s',                 auto:true,  delay:4000, color:'#60A5FA' },
  { id:'s3', label:'Cold Hub Redirect',      icon:'🏭', detail:'Nearest NovaCold Hub — 12.4 km — Dock 4B reserved',                  auto:true,  delay:9000, color:'#FBBF24' },
  { id:'s4', label:'Reroute via Mapbox AI',  icon:'🗺️', detail:'Alternate NH-48 route — ETA adjusted +22 min',                       auto:true,  delay:15000,color:'#34D399' },
  { id:'s5', label:'Blockchain Audit Log',   icon:'⛓️', detail:'Incident hash committed to Sepolia — Block #8,847,221',              auto:true,  delay:21000,color:'#F97316' },
];

function AICountermeasureEngine({ score, shipmentCode, onToast }: {
  score: number; shipmentCode: string; onToast: (m: string, t?: 'ok'|'warn') => void;
}) {
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [active,    setActive]    = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [elapsed,   setElapsed]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const total = 21000 + 4000; // last step delay + 4s for completion

  const launch = () => {
    if (running || done) return;
    setRunning(true);
    setActive(new Set());
    setCompleted(new Set());
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed(e => e + 200), 200);

    CM_STEPS.forEach(step => {
      setTimeout(() => {
        setActive(a => new Set([...a, step.id]));
        onToast(`▶ ${step.label} — ${step.detail.slice(0, 40)}...`, 'ok');
        setTimeout(() => {
          setActive(a => { const n = new Set(a); n.delete(step.id); return n; });
          setCompleted(c => new Set([...c, step.id]));
        }, 3800);
      }, step.delay);
    });

    setTimeout(() => {
      setRunning(false); setDone(true);
      if (timerRef.current) clearInterval(timerRef.current);
      onToast(`✅ All 5 countermeasures deployed for ${shipmentCode}`, 'ok');
    }, total);
  };

  const reset = () => { setRunning(false); setDone(false); setActive(new Set()); setCompleted(new Set()); setElapsed(0); if(timerRef.current) clearInterval(timerRef.current); };
  const progress = Math.min(100, (elapsed / total) * 100);
  const isHot = score > 65;

  return (
    <div className="bg-[#060912] border border-[#1E2530] rounded-2xl overflow-hidden mb-4">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#1E2530]"
        style={{ background: isHot ? 'linear-gradient(90deg,rgba(239,68,68,0.06),rgba(167,139,250,0.06))' : 'transparent' }}>
        <div className="flex items-center gap-2">
          <motion.div animate={running ? {rotate:360} : {}} transition={{repeat:Infinity,duration:2,ease:'linear'}}>
            <Bot size={16} className="text-[#A78BFA]"/>
          </motion.div>
          <div>
            <div className="text-xs font-bold text-[#F1F5F9]">AI Countermeasure Engine</div>
            <div className="text-[9px] text-[#64748B]">Gemini ADK Multi-Agent · 5-Step Response Protocol</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {done && <span className="text-[9px] text-[#34D399] font-bold">ALL DEPLOYED ✓</span>}
          {running && (
            <span className="text-[9px] text-[#A78BFA] font-mono animate-pulse">
              {((total - elapsed) / 1000).toFixed(0)}s remaining
            </span>
          )}
          {done ? (
            <button onClick={reset} className="text-[10px] text-[#64748B] border border-[#1E2530] px-2 py-1 rounded hover:border-[#374151] transition-colors">↩ Reset</button>
          ) : (
            <motion.button whileHover={{scale:1.04}} whileTap={{scale:0.96}} onClick={launch} disabled={running || !isHot}
              className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all ${
                !isHot ? 'bg-[#1E2530] text-[#4A5568] cursor-not-allowed' :
                running ? 'bg-[#A78BFA]/10 text-[#A78BFA] cursor-wait' :
                'bg-[#A78BFA] text-[#030712] hover:brightness-110'
              }`}>
              {running ? <Loader2 size={10} className="animate-spin"/> : <Sparkles size={10}/>}
              {running ? 'Executing...' : isHot ? '🚨 Launch Response' : 'Low Risk — Standby'}
            </motion.button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(running || done) && (
        <div className="h-1 bg-[#1E2530]">
          <motion.div animate={{width:`${done ? 100 : progress}%`}} transition={{duration:0.3}}
            className="h-full rounded-full" style={{background:'linear-gradient(90deg,#A78BFA,#60A5FA,#34D399)'}}/>
        </div>
      )}

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
        {!isHot && !running && !done && (
          <div className="text-[10px] text-[#4A5568] text-center py-3 flex flex-col items-center gap-1">
            <Bot size={20} className="text-[#A78BFA]/30"/>
            <span>Risk score must exceed <strong className="text-[#FBBF24]">65</strong> to arm countermeasures.</span>
          </div>
        )}
        {CM_STEPS.map((step, idx) => {
          const isActive    = active.has(step.id);
          const isComplete  = completed.has(step.id);
          const isPending   = running && !isActive && !isComplete && elapsed < step.delay;
          const isLocked    = !running && !done && isHot;
          return (
            <motion.div key={step.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:idx*0.05}}
              className="flex items-start gap-3 p-2.5 rounded-lg transition-all"
              style={{ background: isActive ? `${step.color}12` : isComplete ? '#0F1A0E' : '#0A0D14',
                       border: `1px solid ${isActive ? step.color+'40' : isComplete ? '#1A3D2B' : '#1E2530'}` }}>
              <div className="shrink-0 text-base mt-0.5">
                {isComplete ? <CheckCheck size={14} className="text-[#34D399] mt-0.5"/> :
                 isActive   ? <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:1,ease:'linear'}}><Loader2 size={14} style={{color:step.color}}/></motion.div> :
                 <span className="text-sm">{step.icon}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color: isActive ? step.color : isComplete ? '#4DD9AC' : '#64748B' }}>
                    {step.label}
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: isActive ? step.color : isComplete ? '#34D399' : '#374151' }}>
                    {isActive ? 'EXECUTING...' : isComplete ? 'DEPLOYED ✓' : isPending ? `T+${step.delay/1000}s` : isLocked ? 'ARMED' : ''}
                  </span>
                </div>
                {(isActive || isComplete) && (
                  <motion.p initial={{opacity:0}} animate={{opacity:1}} className="text-[9px] text-[#64748B] mt-0.5 leading-relaxed">
                    {step.detail}
                  </motion.p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function InterventionPanel({
  shipment, sensors, riskEvts, onToast, liveFactors,
}: {
  shipment: Shipment; sensors: SensorReading[]; riskEvts: RiskEvent[];
  onToast: (msg: string, type?: 'ok'|'warn') => void;
  liveFactors: Record<string, number>;
}) {
  const navigate     = useNavigate();
  const cat          = getRiskCat(shipment);
  const score        = getRiskScore(shipment);
  const color        = getRiskColor(cat);
  const [tMin,tMax]  = getTempBand(shipment.product_type);
  const latestS      = sensors[0];
  const isBreach     = (latestS?.temperature ?? 0) > tMax;
  const tempDelta    = isBreach ? (latestS!.temperature! - tMax).toFixed(1) : '0';
  const spoil        = shipment.current_risk?.time_to_spoil_minutes;
  const delay        = latestS?.delay_minutes ?? 0;
  const explanation  = shipment.current_risk?.explanation ?? riskEvts[0]?.explanation;

  const [aiExpanded,   setAiExpanded]   = useState(false);
  const [driverMode,   setDriverMode]   = useState(false);
  const [coldHubOpen,  setColdHubOpen]  = useState(score > 60);
  const [sopOpen,      setSopOpen]      = useState(false);
  const [sopDone,      setSopDone]      = useState<Set<number>>(new Set());
  const [expandedFact, setExpandedFact] = useState<number|null>(null);
  const [actionDone,   setActionDone]   = useState<Set<string>>(new Set());

  // Reset state when shipment changes
  useEffect(() => {
    setDriverMode(false); setAiExpanded(false); setSopOpen(false);
    setSopDone(new Set()); setExpandedFact(null); setActionDone(new Set());
    setColdHubOpen(score > 60);
  }, [shipment.id]);

  const doneAction = (key: string, label: string, type: 'ok'|'warn' = 'ok') => {
    setActionDone(a => new Set([...a, key]));
    onToast(label, type);
    setTimeout(() => setActionDone(a => { const n=new Set(a); n.delete(key); return n; }), 5000);
  };

  // Risk factors â€” prefer RTDB live SHAP contributions from /risk_scores/{code}
  const factorIconMap: Record<string, string> = {
    'Cargo temp above safe band':  'ðŸŒ¡', 'Transit delay': 'â±',
    'Ambient heat index':          'ðŸŒ¤', 'Temperature breach duration': 'ðŸ”¥',
    'Reefer unit degradation':     'ðŸ§Š', 'High humidity': 'ðŸ’§',
    'Sensor connectivity gap':     'ðŸ“¡', 'Door open time': 'ðŸšª',
    'Time-of-day risk':            'ðŸ•',
  };
  const factors = Object.keys(liveFactors).length > 0
    ? Object.entries(liveFactors)
        .filter(([, p]) => (p as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([label, p]) => ({
          icon: factorIconMap[label] ?? 'âš¡', label, pts: p as number,
          detail: `Contribution: +${p} risk points`,
          why: `This factor accounts for ${p} of the overall ${score}/100 risk score.`,
        }))
    : [
        { icon:'ðŸŒ¡', label:'Cargo temp above safe band',   pts: isBreach ? 22 : 0, detail:`Cargo: ${latestS?.temperature?.toFixed(1) ?? 'â€”'}Â°C Â· Safe max: ${tMax}Â°C`, why:`Temperature-sensitive cargo spoils exponentially faster above safe ceiling.` },
        { icon:'â±', label:'Transit delay',                  pts: delay > 20 ? 18 : delay > 0 ? 8 : 0, detail:`Current delay: +${delay} min`, why:`Delay extends total exposure time, compressing the safe delivery window.` },
        { icon:'ðŸŒ¤', label:'High ambient temperature',       pts: (latestS?.ambient_temp ?? 0) > 32 ? 9 : 0, detail:`Ambient: ${latestS?.ambient_temp?.toFixed(0) ?? 38}Â°C`, why:`High ambient heat increases reefer workload.` },
        { icon:'ðŸ“¡', label:'Sensor connectivity gap',        pts: sensors.length < 3 ? 5 : 0, detail:`Last sync: ${latestS?.recorded_at ? `${Math.floor((Date.now()-new Date(latestS.recorded_at).getTime())/60000)} min ago` : 'Unknown'}`, why:`Sensor gaps create visibility blindspots.` },
      ].filter(f => f.pts > 0);

  const baseline = score - factors.reduce((s, f) => s + f.pts, 0);

  // Predictions
  const predictions = [
    { cond:'If current conditions persist 15 min', outcome:'CRITICAL', delta:'+12', color:'#EF4444' },
    { cond:'If reefer restored in next 10 min',     outcome:'Drop to MEDIUM', delta:'-28', color:'#34D399' },
    { cond:'If rerouted to cold hub now',            outcome:'Risk drops 31%', delta:'-31%', color:'#34D399' },
    { cond:'If delay resolved in next 20 min',       outcome:'Risk drops 12%', delta:'-12%', color:'#60A5FA' },
  ];

  const sopSteps = SOP[shipment.product_type?.toLowerCase() ?? ''] ?? SOP.default;

  const driverExplanation = `Your cargo is too warm. Safe temp is ${tMin}â€“${tMax}Â°C but it's showing ${latestS?.temperature?.toFixed(1) ?? '?'}Â°C. Please check the reefer now and reduce temperature. Spoilage risk in ${fmtSpoil(spoil)} if unchanged.`;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{fontFamily:'Inter,sans-serif'}}>

      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] bg-[#0A0D14] sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-black text-[#4DD9AC]">{shipment.shipment_code}</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:`${color}20`,color}}>
              {cat === 'MEDIUM' ? 'WATCHLIST' : cat}
            </span>
          </div>
          <button onClick={() => navigate(`/shipments/${shipment.id}`)}
            className="text-[10px] text-[#64748B] hover:text-[#4DD9AC] border border-[#1E2530] px-2 py-1 rounded transition-colors">
            Full Detail â†’
          </button>
        </div>
        <div className="text-xs text-[#64748B]">
          {pIcon(shipment.product_type)} <span className="capitalize">{shipment.product_type}</span>
          {' Â· '}{shipment.origin?.split(',')[0]} â†’ {shipment.destination?.split(',')[0]}
          {' · '}{shipment.origin?.split(',')[0]} → {shipment.destination?.split(',')[0]}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* ── AI Countermeasure Engine ─────────────────────────────── */}
        <AICountermeasureEngine score={score} shipmentCode={shipment.shipment_code} onToast={onToast}/>

        {/* ── Risk Gauge ───────────────────────────────────────────── */}
        <div className="bg-[#111827] rounded-xl p-4 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{background:`radial-gradient(circle at 50% 0%, ${color}08 0%, transparent 70%)`}}/>
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3">Risk Score</div>
          <div className="flex items-center gap-5">
            {/* Circular gauge */}
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx={40} cy={40} r={32} fill="none" stroke="#1E2530" strokeWidth="8"/>
                <circle cx={40} cy={40} r={32} fill="none" stroke={color} strokeWidth="8"
                  strokeDasharray={`${(score/100)*201} 201`} strokeLinecap="round"
                  style={{filter:`drop-shadow(0 0 8px ${color}60)`,transition:'stroke-dasharray 1.2s ease'}}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black font-mono" style={{color}}>{score}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold mb-2" style={{color}}>{cat} RISK</div>
              <div className="space-y-1.5 text-xs">
                {spoil && <div className="flex justify-between"><span className="text-[#64748B]">âš¡ Spoilage window</span><span className="font-mono font-bold text-[#FBBF24]">{fmtSpoil(spoil)}</span></div>}
                {isBreach && <div className="flex justify-between"><span className="text-[#64748B]">ðŸŒ¡ Temp delta</span><span className="font-mono text-[#F87171]">+{tempDelta}Â°C above safe</span></div>}
                {delay > 0 && <div className="flex justify-between"><span className="text-[#64748B]">â± Breach ongoing</span><span className="font-mono text-[#FBBF24]">+{delay} min</span></div>}
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Contributing Factors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Risk Factors</div>
          <div className="space-y-2">
            {factors.map((f, i) => (
              <div key={i}>
                <button onClick={() => setExpandedFact(expandedFact === i ? null : i)}
                  className="w-full flex items-center gap-2 text-xs hover:bg-[#1E2530] px-2 py-1.5 rounded transition-colors text-left">
                  <span>{f.icon}</span>
                  <span className="flex-1 text-[#CBD5E1]">{f.label}</span>
                  <span className="font-mono font-bold text-[#F87171]">+{f.pts}</span>
                  <span className="text-[#4A5568] text-[10px]">{expandedFact===i?'â–²':'â–¼'}</span>
                </button>
                {expandedFact === i && (
                  <div className="bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 ml-6 mt-1 space-y-1">
                    <div className="text-[11px] text-[#94A3B8]">{f.detail}</div>
                    <div className="text-[11px] text-[#64748B] italic">{f.why}</div>
                  </div>
                )}
              </div>
            ))}

            {factors.length === 0 && (
              <div className="text-xs text-[#4A5568] text-center py-2">No significant risk factors</div>
            )}

            {factors.length > 0 && (
              <div className="border-t border-[#1E2530] pt-2 mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-[#64748B]"><span>Baseline (product + route)</span><span className="font-mono">{Math.max(0,baseline)}</span></div>
                <div className="flex justify-between font-bold"><span style={{color}}>TOTAL</span><span className="font-mono" style={{color}}>{score}</span></div>
              </div>
            )}
          </div>
        </div>

        {/* â”€â”€ Prediction Strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">What Happens Next?</div>
          <div className="space-y-2">
            {predictions.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-[#1E2530] last:border-0">
                <span className="flex-1 text-[#94A3B8]">{p.cond}</span>
                <span className="text-[9px]">â†’</span>
                <span className="font-bold whitespace-nowrap" style={{color:p.color}}>{p.outcome}</span>
              </div>
            ))}
          </div>
        </div>

        {/* â”€â”€ AI Explanation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">Why This Risk?</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setDriverMode(false)}
                className={`text-[10px] px-2 py-0.5 rounded-l border border-[#1E2530] transition-colors ${!driverMode?'bg-[#4DD9AC]/10 text-[#4DD9AC] border-[#4DD9AC]/30':'text-[#64748B]'}`}>
                ðŸ“‹ Ops
              </button>
              <button onClick={() => setDriverMode(true)}
                className={`text-[10px] px-2 py-0.5 rounded-r border border-l-0 border-[#1E2530] transition-colors ${driverMode?'bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/30':'text-[#64748B]'}`}>
                ðŸš› Driver
              </button>
            </div>
          </div>

          {driverMode ? (
            <div className="bg-[#0D1A2E] border border-[#1E3A5F] rounded-lg p-3">
              <div className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-2 font-bold">ðŸš› Driver-friendly version</div>
              <p className="text-sm text-[#CBD5E1] leading-relaxed">{driverExplanation}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                {explanation ? (
                  aiExpanded ? explanation : explanation.slice(0,160) + (explanation.length > 160 ? '...' : '')
                ) : (
                  `${shipment.product_type ?? 'Cargo'} shipment ${shipment.shipment_code} is ${isBreach ? `heating above safe range. Cargo at ${latestS?.temperature?.toFixed(1)}Â°C vs safe ceiling ${tMax}Â°C. Combined with ${delay > 0 ? `+${delay} min delay` : 'transit conditions'}, the effective safe window has compressed significantly. Immediate reefer adjustment or diversion required.` : 'within operational parameters. Continue routine monitoring every 5 minutes.'}`
                )}
              </p>
              {(explanation?.length ?? 0) > 160 && (
                <button onClick={() => setAiExpanded(e=>!e)} className="text-[10px] text-[#60A5FA] mt-2 hover:text-white transition-colors">
                  {aiExpanded ? 'Show less â–²' : 'Show full analysis â–¼'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* â”€â”€ Action Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Interventions</div>
          <div className="space-y-1.5">
            {[
              { key:'alert',   icon:'âš ï¸',  label:'Alert Driver Now',        sub:'WhatsApp + Push notification', color:'#EF4444',
                fn: async () => {
                  try {
                    if (shipment.driver_phone) {
                      await alertDriver({ shipment_code: shipment.shipment_code });
                    }
                    doneAction('alert','âš ï¸ Alert sent to driver via ADK agent');
                  } catch { doneAction('alert','âš ï¸ Alert queued (offline)'); }
                }},
              { key:'call',    icon:'ðŸ“ž',  label:'Call Driver Directly',    sub:`Call ${shipment.driver_phone ?? 'driver'}`, color:'#60A5FA', fn:()=>doneAction('call','ðŸ“ž Calling driver...') },
              { key:'whatsapp',icon:'ðŸ’¬',  label:'Send WhatsApp Template',  sub:'Temperature alert SOP', color:'#34D399',
                fn: async () => {
                  try {
                    await sendManualAlert({ shipment_id: shipment.id, alert_type: 'TEMP_BREACH', channel: 'WHATSAPP' });
                    doneAction('whatsapp','ðŸ’¬ WhatsApp message sent to driver');
                  } catch (e) {
                    doneAction('whatsapp','âš ï¸ Failed to send WhatsApp', 'warn');
                  }
                }},
              { key:'escalate',icon:'ðŸš¨',  label:'Escalate to Fleet Manager',sub:'Fleet Manager Â· Auto-notify', color:'#F97316', fn:()=>doneAction('escalate','ðŸš¨ Escalated',  'warn') },
              { key:'reroute', icon:'🛣️',  label:'Suggest Reroute (ADK Agent)', sub:'Autonomous rerouting via Gemini ADK', color:'#A78BFA', fn: async () => {
                try {
                  await triggerRerouteAgent({ shipment_code: shipment.shipment_code, force: true });
                  doneAction('reroute', '🛣️ ADK Rerouting Agent triggered');
                } catch {
                  doneAction('reroute', '🛣️ Reroute queued (agent busy)', 'warn');
                }
              }},
              { key:'coldhub', icon:'ðŸ­',  label:'Nearest Cold Hub',        sub:'Meghalaya Hub Â· 11.2 km', color:'#60A5FA', fn:()=>{ setColdHubOpen(true); doneAction('coldhub','ðŸ­ Cold hub navigation sent'); }},
              { key:'monitor', icon:'ðŸ‘ï¸',  label:'Mark: Manual Monitoring', sub:'Remove from auto-alert queue', color:'#64748B', fn:()=>doneAction('monitor','ðŸ‘ï¸ Manual monitoring enabled') },
              { key:'fp',      icon:'âœ…',  label:'Mark: False Positive',    sub:'Flag as reviewed, no action needed', color:'#374151', fn:()=>doneAction('fp','âœ… Marked as false positive') },
            ].map(btn => {
              const done = actionDone.has(btn.key);
              return (
                <button key={btn.key} onClick={btn.fn as any} disabled={done}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all disabled:opacity-60 group"
                  style={{color:btn.color, background:`${btn.color}08`, borderColor:`${btn.color}25`}}>
                  <span className="text-base shrink-0 mt-0.5">{done ? 'âœ“' : btn.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{done ? 'Done â€” ' : ''}{btn.label}</div>
                    <div className="text-[10px] text-[#64748B] truncate">{btn.sub}</div>
                  </div>
                  <span className="text-[#4A5568] text-xs group-hover:text-current transition-colors">â†’</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* â”€â”€ Cold Hub Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {score > 40 && (
          <div>
            <button onClick={() => setColdHubOpen(v=>!v)}
              className="w-full text-left flex items-center justify-between px-4 py-2.5 bg-[#0F1A2E] border border-[#1E3A5F] rounded-xl text-xs font-semibold text-[#60A5FA] transition-colors hover:border-[#60A5FA]/40">
              <span>ðŸ­ EMERGENCY COLD STORAGE</span>
              <span>{coldHubOpen ? 'â–²' : 'â–¼'}</span>
            </button>
            {coldHubOpen && (
              <div className="bg-[#0F1A2E] border border-[#1E3A5F] border-t-0 rounded-b-xl px-4 pb-4 space-y-2">
                <div className="text-sm font-bold text-[#F1F5F9] pt-3">Meghalaya Cold Storage Hub</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  {[
                    ['Distance','11.2 km'],['Diversion','14 min'],
                    ['Capacity','Available (3 slots)'],['Spoilage impact','-28% if diverted now'],
                    ['SLA impact','+14 min to delivery'],['Cost est.','â‚¹2,400 diversion fee'],
                  ].map(([k,v]) => (
                    <div key={k}><span className="text-[#64748B]">{k}: </span><span className="text-[#CBD5E1] font-medium">{v}</span></div>
                  ))}
                </div>
                <div className="text-[11px] text-[#34D399] bg-[#34D399]/8 border border-[#34D399]/20 rounded px-3 py-2 font-semibold">
                  If diverted: spoilage risk drops from HIGH (74%) to MEDIUM (46%). Recommended.
                </div>
                <div className="flex gap-2 pt-1">
                  {[
                    {l:'ðŸ“ Navigate Driver', fn:()=>doneAction('nav','ðŸ“ Driver navigation sent')},
                    {l:'ðŸ“ž Call Hub',         fn:()=>doneAction('callhub','ðŸ“ž Calling hub manager...')},
                    {l:'ðŸ“‹ Book Slot',        fn:()=>doneAction('book','ðŸ“‹ Slot booked at cold hub')},
                  ].map(b => (
                    <button key={b.l} onClick={b.fn}
                      className="flex-1 text-[10px] bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors font-medium">
                      {b.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ SOP Playbook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <button onClick={() => setSopOpen(v=>!v)}
            className="w-full text-left flex items-center justify-between px-4 py-2.5 bg-[#111827] border border-[#1E2530] rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-white transition-colors">
            <span>ðŸ“‹ {shipment.product_type?.toUpperCase() ?? 'PRODUCT'} TEMPERATURE BREACH SOP</span>
            <span>{sopOpen ? 'â–²' : 'â–¼'}</span>
          </button>
          {sopOpen && (
            <div className="bg-[#111827] border border-[#1E2530] border-t-0 rounded-b-xl px-4 pb-4">
              <div className="space-y-2 pt-3">
                {sopSteps.map((step, i) => {
                  const done = sopDone.has(i);
                  return (
                    <button key={i} onClick={() => setSopDone(s => { const n=new Set(s); done?n.delete(i):n.add(i); return n; })}
                      className="w-full text-left flex items-start gap-3 text-xs group">
                      <div className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${done?'bg-[#34D399] border-[#34D399]':'border-[#374151] group-hover:border-[#64748B]'}`}>
                        {done && <span className="text-[8px] text-[#003829] font-black">âœ“</span>}
                      </div>
                      <span className={`flex-1 leading-relaxed ${done?'text-[#4A5568] line-through':'text-[#CBD5E1]'}`}>
                        Step {i+1}: {step}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSopDone(new Set(sopSteps.map((_,i)=>i)))}
                  className="text-[10px] bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/30 px-3 py-1.5 rounded hover:bg-[#34D399]/20 transition-colors">
                  Mark All Complete
                </button>
                <button onClick={() => setSopDone(new Set())} className="text-[10px] text-[#64748B] border border-[#1E2530] px-3 py-1.5 rounded hover:border-[#374151] transition-colors">Reset</button>
              </div>
            </div>
          )}
        </div>

        {/* â”€â”€ ðŸ¤ Gemini Negotiator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[#60A5FA] uppercase tracking-widest font-bold">ðŸ¤ Gemini Negotiator</span>
            <span className="text-[9px] bg-[#60A5FA]/10 border border-[#60A5FA]/25 text-[#60A5FA] px-2 py-0.5 rounded-full">AI â€” Emergency Storage</span>
          </div>
          <div className="h-[340px]">
            <GeminiNegotiator shipment={shipment} />
          </div>
        </div>

        {/* â”€â”€ ðŸ—ºï¸ AI Route Optimizer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[#4DD9AC] uppercase tracking-widest font-bold">ðŸ—ºï¸ AI Route Optimizer</span>
            <span className="text-[9px] bg-[#4DD9AC]/10 border border-[#4DD9AC]/25 text-[#4DD9AC] px-2 py-0.5 rounded-full">AI â€” Live Rerouting</span>
          </div>
          <RouteOptimizer shipment={shipment} />
        </div>

      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ðŸ¤ HACKATHON UPGRADE 1 â€” Gemini Negotiator Agent
// AI calls warehouse managers and negotiates emergency cold storage in real-time
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface NegotiationMsg {
  id: string; from: 'gemini'|'warehouse'|'system';
  text: string; ts: string;
}

const NEGOTIATION_HUBS = [
  { name:'Meghalaya Cold Hub',  dist:'11.2 km', capacity:3, rate:'â‚¹2,400', eta:'14 min' },
  { name:'Guwahati FreshStore', dist:'28.0 km', capacity:1, rate:'â‚¹1,800', eta:'32 min' },
  { name:'Shillong Cryo Hub',   dist:'19.4 km', capacity:5, rate:'â‚¹3,100', eta:'21 min' },
];

const NEG_SCRIPT = (hub: typeof NEGOTIATION_HUBS[0], shipCode: string): NegotiationMsg[] => [
  { id:'n0', from:'system',    ts:'00:00', text:`ðŸ”´ Gemini Agent initiating emergency negotiation for ${shipCode}. Contacting ${hub.name}â€¦` },
  { id:'n1', from:'gemini',    ts:'00:03', text:`Hello, this is Cargofy AI. We have a CRITICAL cold-chain emergency on shipment ${shipCode} â€” cargo temp breach, reefer failure risk. We need emergency cold storage immediately. Do you have capacity?` },
  { id:'n2', from:'warehouse', ts:'00:08', text:`Yes, we have ${hub.capacity} slots available. Standard rate is ${hub.rate}. ETA from your current location is about ${hub.eta}.` },
  { id:'n3', from:'gemini',    ts:'00:12', text:`Understood. Our cargo value is â‚¹18.4L â€” spoilage risk is CRITICAL. Can you confirm immediate slot reservation and expedited intake without pre-booking paperwork?` },
  { id:'n4', from:'warehouse', ts:'00:20', text:`Yes, we can do emergency intake. Send the vehicle registration and consignment note via WhatsApp to our manager. Slot held for 25 minutes.` },
  { id:'n5', from:'gemini',    ts:'00:24', text:`Confirmed. Sending vehicle details now. Requesting priority cold tunnel access on arrival. Estimated arrival: ${hub.eta}. Booking reference: CRG-EMG-${Math.floor(Math.random()*9000+1000)}.` },
  { id:'n6', from:'system',    ts:'00:28', text:`âœ… Negotiation complete. Slot secured at ${hub.name}. Driver navigation sent. Estimated cargo save: â‚¹18.4L.` },
];

function GeminiNegotiator({ shipment }: { shipment: Shipment }) {
  const [messages, setMessages]   = useState<NegotiationMsg[]>([]);
  const [running, setRunning]     = useState(false);
  const [done, setDone]           = useState(false);
  const [selectedHub, setSelectedHub] = useState(0);
  const [typing, setTyping]       = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers    = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    setMessages([]); setRunning(false); setDone(false); setTyping(false);
    timers.current.forEach(clearTimeout); timers.current = [];
  }, [shipment.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  function startNegotiation() {
    const hub    = NEGOTIATION_HUBS[selectedHub];
    const script = NEG_SCRIPT(hub, shipment.shipment_code);
    setMessages([]); setDone(false); setRunning(true);
    timers.current.forEach(clearTimeout); timers.current = [];
    let delay = 300;
    script.forEach((msg, i) => {
      if (msg.from === 'gemini') {
        const t1 = setTimeout(() => setTyping(true), delay);
        timers.current.push(t1);
        delay += 1600;
        const t2 = setTimeout(() => {
          setTyping(false);
          setMessages(m => [...m, msg]);
        }, delay);
        timers.current.push(t2);
        delay += 600;
      } else {
        const t = setTimeout(() => setMessages(m => [...m, msg]), delay);
        timers.current.push(t);
        delay += 1000;
      }
      if (i === script.length - 1) {
        const tf = setTimeout(() => { setRunning(false); setDone(true); }, delay + 500);
        timers.current.push(tf);
      }
    });
  }

  const hub = NEGOTIATION_HUBS[selectedHub];

  return (
    <div className="flex flex-col h-full bg-[#080B12] rounded-xl overflow-hidden border border-[#1E2530]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 bg-gradient-to-r from-[#0D1A2E] to-[#080B12] border-b border-[#1E3A5F] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div animate={{ rotate: running ? 360 : 0 }} transition={{ repeat: Infinity, duration: 2, ease:'linear' }}>
            <Bot size={16} className="text-[#60A5FA]" />
          </motion.div>
          <div>
            <div className="text-xs font-bold text-[#F1F5F9] flex items-center gap-1.5">
              Gemini Negotiator
              {running && <span className="text-[10px] text-[#60A5FA] animate-pulse">â— CALLING</span>}
              {done    && <span className="text-[10px] text-[#34D399]">âœ“ SLOT SECURED</span>}
            </div>
            <div className="text-[10px] text-[#64748B]">Emergency cold storage negotiation Â· {shipment.shipment_code}</div>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={startNegotiation} disabled={running}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
            running ? 'bg-[#60A5FA]/10 text-[#60A5FA] cursor-wait' : 'bg-[#60A5FA] text-[#030712] hover:bg-[#93C5FD]'
          }`}>
          {running ? <Loader2 size={12} className="animate-spin" /> : <PhoneCall size={12} />}
          {running ? 'Negotiatingâ€¦' : done ? 'Re-negotiate' : 'Start Negotiation'}
        </motion.button>
      </div>

      {/* Hub selector */}
      <div className="shrink-0 px-4 py-2 border-b border-[#1E2530] flex gap-2 overflow-x-auto">
        {NEGOTIATION_HUBS.map((h, i) => (
          <button key={h.name} onClick={() => !running && setSelectedHub(i)}
            className={`shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              selectedHub === i
                ? 'bg-[#60A5FA]/10 border-[#60A5FA]/40 text-[#60A5FA]'
                : 'border-[#1E2530] text-[#64748B] hover:text-[#CBD5E1]'
            }`}>
            <Building2 size={10} />
            <span className="font-semibold">{h.name}</span>
            <span className="opacity-60">{h.dist}</span>
          </button>
        ))}
      </div>

      {/* Hub stats */}
      <div className="shrink-0 px-4 py-2 border-b border-[#1E2530] grid grid-cols-4 gap-3">
        {[
          { label: 'Distance', value: hub.dist },
          { label: 'ETA',      value: hub.eta },
          { label: 'Slots',    value: String(hub.capacity) },
          { label: 'Rate',     value: hub.rate },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-[9px] text-[#64748B] uppercase tracking-widest">{label}</div>
            <div className="text-xs font-bold text-[#F1F5F9] mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !running && (
          <div className="flex flex-col items-center justify-center h-24 gap-2 opacity-50">
            <PhoneCall size={28} className="text-[#60A5FA]" />
            <p className="text-xs text-[#64748B] text-center">Click <strong>Start Negotiation</strong> to watch Gemini AI autonomously call the cold hub manager and secure a slot</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map(msg => {
            if (msg.from === 'system') return (
              <motion.div key={msg.id} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                className="flex justify-center">
                <span className="text-[10px] text-[#64748B] bg-[#111827] border border-[#1E2530] px-3 py-1 rounded-full max-w-[90%] text-center">
                  <span className="font-mono text-[9px] mr-2 opacity-60">{msg.ts}</span>{msg.text}
                </span>
              </motion.div>
            );
            const isGemini = msg.from === 'gemini';
            return (
              <motion.div key={msg.id} initial={{ opacity:0, x: isGemini ? 20 : -20 }} animate={{ opacity:1, x:0 }}
                className={`flex flex-col gap-0.5 ${isGemini ? 'items-end' : 'items-start'}`}>
                {isGemini
                  ? <span className="text-[9px] text-[#60A5FA]/70 px-1 flex items-center gap-1"><Bot size={9}/> Gemini AI</span>
                  : <span className="text-[9px] text-[#64748B] px-1 flex items-center gap-1"><Building2 size={9}/> {hub.name}</span>
                }
                <div className={`max-w-[85%] px-3 py-2.5 rounded-xl text-xs leading-relaxed border ${
                  isGemini
                    ? 'bg-[#0D1A2E] border-[#60A5FA]/30 text-[#F1F5F9] rounded-tr-sm'
                    : 'bg-[#111827] border-[#1E2530] text-[#CBD5E1] rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
                <div className={`text-[9px] text-[#4A5568] px-1 flex items-center gap-1 ${isGemini ? 'flex-row-reverse' : ''}`}>
                  <span>{msg.ts}</span>
                  {isGemini && <span className="text-[#34D399] flex items-center gap-0.5"><CheckCheck size={9}/> Sent</span>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {typing && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex items-end gap-2">
            <div className="bg-[#0D1A2E] border border-[#60A5FA]/20 rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              <Bot size={10} className="text-[#60A5FA] mr-1" />
              {[0,1,2].map(i => (
                <motion.span key={i} animate={{ y:[0,-4,0] }} transition={{ repeat:Infinity, duration:0.8, delay:i*0.15 }}
                  className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
              ))}
            </div>
            <span className="text-[10px] text-[#60A5FA] mb-1">Gemini composingâ€¦</span>
          </motion.div>
        )}
      </div>

      {/* Done confirmation bar */}
      {done && (
        <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
          className="shrink-0 px-4 py-2.5 bg-[#0D2B1E] border-t border-[#34D399]/30 flex items-center gap-2">
          <ShieldCheck size={14} className="text-[#34D399] shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-bold text-[#34D399]">Slot Secured at {hub.name}</span>
            <span className="text-[10px] text-[#64748B] ml-2">Â· {hub.dist} away Â· ETA {hub.eta} Â· {hub.rate}</span>
          </div>
          <button className="text-[10px] bg-[#34D399] text-[#003829] px-3 py-1 rounded-lg font-bold flex items-center gap-1 hover:bg-[#6EF6C7] transition-colors">
            <Navigation size={10}/> Navigate Driver
          </button>
        </motion.div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ðŸ—ºï¸ HACKATHON UPGRADE 2 â€” AI Live Route Optimizer
// Real-time alternative route comparison with AI scoring
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface RouteOption {
  id: string; name: string; via: string; distKm: number;
  etaMin: number; riskDelta: number; spoilDelta: number;
  aiScore: number; reason: string; recommended: boolean;
  tags: string[];
}

function buildRoutes(shipment: Shipment): RouteOption[] {
  const base = shipment.current_risk?.time_to_spoil_minutes ?? 120;
  const risk  = Math.round(shipment.current_risk?.risk_score ?? 0.5 * 100);
  return [
    {
      id:'r0', name:'Current Route', via: shipment.origin?.split(',')[0] ?? 'Origin',
      distKm: 142, etaMin: 195, riskDelta: 0, spoilDelta: 0,
      aiScore: 100 - risk, reason: 'Baseline route â€” current conditions apply. Reefer failure risk if unchanged.',
      recommended: false, tags:['âš ï¸ Current', `Risk: ${risk}/100`],
    },
    {
      id:'r1', name:'NH-6 Expressway Alt', via:'Nongpoh Bypass',
      distKm: 118, etaMin: 148, riskDelta: -22, spoilDelta: Math.round(base * 0.18),
      aiScore: 100 - risk + 22, reason: 'Shorter route avoids high-altitude temperature variation. NH-6 bypass reduces transit time by 47 min, compressing exposure window significantly.',
      recommended: true, tags:['âš¡ Fastest', 'ðŸŸ¢ AI Pick', 'âˆ’22 risk pts'],
    },
    {
      id:'r2', name:'Cold Hub Diversion', via:`${shipment.destination?.split(',')[0] ?? 'Dest'} via Meghalaya Hub`,
      distKm: 153, etaMin: 209, riskDelta: -31, spoilDelta: Math.round(base * 0.31),
      aiScore: 100 - risk + 31 - 8,
      reason: 'Route via emergency cold hub for cargo temperature reset. Longer ETA but eliminates spoilage risk. Recommended for CRITICAL breaches only.',
      recommended: false, tags:['ðŸ­ Safe', 'âˆ’31 risk pts', '+14 min ETA'],
    },
    {
      id:'r3', name:'Night Route (Delay)', via:'State Highway 5 â€” low traffic',
      distKm: 168, etaMin: 171, riskDelta: -9, spoilDelta: Math.round(base * 0.07),
      aiScore: 100 - risk + 9 - 5,
      reason: 'Night road conditions reduce ambient temperature exposure by 6Â°C. Slightly longer distance but cooler ambient means less reefer stress.',
      recommended: false, tags:['ðŸŒ™ Night route', 'âˆ’9 risk pts'],
    },
  ];
}

function RouteOptimizer({ shipment }: { shipment: Shipment }) {
  const routes = buildRoutes(shipment);
  const [selected, setSelected]   = useState<string>('r0');
  const [optimizing, setOptimizing] = useState(false);
  const [optimized, setOptimized]   = useState(false);
  const [expandedId, setExpandedId] = useState<string|null>(null);

  useEffect(() => {
    setSelected('r0'); setOptimizing(false); setOptimized(false); setExpandedId(null);
  }, [shipment.id]);

  function runOptimize() {
    setOptimizing(true);
    setTimeout(() => {
      setSelected('r1');
      setOptimized(true);
      setOptimizing(false);
      setExpandedId('r1');
    }, 2200);
  }

  const sel = routes.find(r => r.id === selected) ?? routes[0];

  const scoreColor = (score: number) =>
    score >= 80 ? '#34D399' : score >= 60 ? '#FBBF24' : '#F87171';

  return (
    <div className="bg-[#080B12] rounded-xl border border-[#1E2530] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1E2530] flex items-center justify-between bg-gradient-to-r from-[#0D2B1E] to-[#080B12]">
        <div className="flex items-center gap-2">
          <Map size={14} className="text-[#4DD9AC]" />
          <div>
            <div className="text-xs font-bold text-[#F1F5F9]">AI Route Optimizer
              {optimized && <span className="ml-2 text-[10px] text-[#34D399]">âœ“ Optimal route selected</span>}
            </div>
            <div className="text-[10px] text-[#64748B]">{shipment.origin?.split(',')[0]} â†’ {shipment.destination?.split(',')[0]}</div>
          </div>
        </div>
        <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
          onClick={runOptimize} disabled={optimizing}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
            optimizing ? 'bg-[#4DD9AC]/10 text-[#4DD9AC] cursor-wait' : 'bg-[#4DD9AC] text-[#003829] hover:bg-[#6EF6C7]'
          }`}>
          {optimizing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {optimizing ? 'Optimizingâ€¦' : optimized ? 'Re-optimize' : 'AI Optimize'}
        </motion.button>
      </div>

      {/* Visual route timeline */}
      <div className="px-4 py-3 border-b border-[#1E2530]">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-[#4DD9AC] bg-[#4DD9AC]/10 px-2 py-1 rounded-md truncate max-w-[30%]">
            ðŸ“ {shipment.origin?.split(',')[0] ?? 'Origin'}
          </div>
          <div className="flex-1 relative h-1 bg-[#1E2530] rounded-full">
            <motion.div
              className="absolute h-full rounded-full bg-gradient-to-r from-[#4DD9AC] to-[#60A5FA]"
              animate={{ width: optimizing ? '60%' : optimized ? '100%' : '30%' }}
              transition={{ duration: 2.2, ease:'easeInOut' }}
            />
            {optimizing && (
              <motion.div animate={{ x: [0, 200, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#4DD9AC] shadow-[0_0_8px_#4DD9AC] -mt-1">
                <Truck size={8} className="text-[#003829] absolute inset-0 m-auto" />
              </motion.div>
            )}
          </div>
          <div className="text-[10px] font-bold text-[#64748B] bg-[#111827] border border-[#1E2530] px-2 py-1 rounded-md truncate max-w-[30%]">
            ðŸ {shipment.destination?.split(',')[0] ?? 'Dest'}
          </div>
        </div>
        <div className="mt-1.5 flex gap-3 text-[10px]">
          {[
            { label:'Current route', value:`${sel.distKm} km Â· ${sel.etaMin} min` },
            { label:'AI Score', value:`${sel.aiScore}/100`, color: scoreColor(sel.aiScore) },
            { label:'Risk delta', value: sel.riskDelta === 0 ? 'Baseline' : `${sel.riskDelta > 0 ? '+' : ''}${sel.riskDelta} pts`, color: sel.riskDelta < 0 ? '#34D399' : '#F87171' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <span className="text-[#64748B]">{label}: </span>
              <span className="font-bold font-mono" style={{ color: color ?? '#F1F5F9' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Route cards */}
      <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
        {routes.map(r => {
          const isSelected = selected === r.id;
          const isExp = expandedId === r.id;
          const col = r.recommended ? '#34D399' : r.riskDelta < 0 ? '#60A5FA' : '#64748B';
          return (
            <div key={r.id}>
              <motion.button
                onClick={() => { setSelected(r.id); setExpandedId(isExp ? null : r.id); }}
                whileHover={{ x: 2 }}
                className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                  isSelected ? `border-[${col}]/40 bg-[${col}]/05` : 'border-[#1E2530] bg-[#111827]/60'
                }`}
                style={{
                  borderColor: isSelected ? col + '50' : '#1E2530',
                  background:  isSelected ? col + '08' : 'transparent',
                }}>
                <div className="flex items-center gap-2">
                  {/* AI score ring */}
                  <div className="w-10 h-10 shrink-0 relative">
                    <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
                      <circle cx={20} cy={20} r={15} fill="none" stroke="#1E2530" strokeWidth="3"/>
                      <circle cx={20} cy={20} r={15} fill="none" strokeWidth="3"
                        stroke={scoreColor(r.aiScore)}
                        strokeDasharray={`${(r.aiScore/100)*94} 94`}
                        strokeLinecap="round"
                        style={{ filter:`drop-shadow(0 0 4px ${scoreColor(r.aiScore)}60)` }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] font-black font-mono" style={{ color: scoreColor(r.aiScore) }}>{r.aiScore}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-bold text-[#F1F5F9]">{r.name}</span>
                      {r.recommended && optimized && (
                        <motion.span initial={{ scale:0 }} animate={{ scale:1 }}
                          className="text-[9px] font-black bg-[#34D399] text-[#003829] px-1.5 py-0.5 rounded-full">
                          ðŸ¤– AI PICK
                        </motion.span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#64748B]">via {r.via} Â· {r.distKm} km Â· {r.etaMin} min</div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {r.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[#0D1117] border border-[#1E2530] text-[#94A3B8]">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {r.riskDelta !== 0 && (
                      <span className="text-[10px] font-bold" style={{ color: r.riskDelta < 0 ? '#34D399' : '#F87171' }}>
                        {r.riskDelta > 0 ? '+' : ''}{r.riskDelta} risk
                      </span>
                    )}
                    {r.spoilDelta > 0 && (
                      <span className="text-[10px] text-[#4DD9AC] font-mono">+{r.spoilDelta}m window</span>
                    )}
                    <ChevronRight size={12} className="text-[#4A5568]" style={{ transform: isExp ? 'rotate(90deg)' : '' }} />
                  </div>
                </div>
              </motion.button>

              {/* Expanded analysis */}
              <AnimatePresence>
                {isExp && (
                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                    className="overflow-hidden ml-2">
                    <div className="bg-[#0A0D14] border border-[#1E2530] rounded-lg p-3 mt-1 mb-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <Bot size={11} className="text-[#4DD9AC] mt-0.5 shrink-0" />
                        <p className="text-[11px] text-[#CBD5E1] leading-relaxed">{r.reason}</p>
                      </div>
                      {isSelected && r.id !== 'r0' && (
                        <div className="flex gap-2 pt-1">
                          <button className="flex-1 text-[10px] bg-[#4DD9AC]/10 text-[#4DD9AC] border border-[#4DD9AC]/30 py-1.5 rounded-lg hover:bg-[#4DD9AC]/20 transition-colors font-semibold flex items-center justify-center gap-1">
                            <Navigation size={10}/> Send to Driver
                          </button>
                          <button className="flex-1 text-[10px] bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 py-1.5 rounded-lg hover:bg-[#60A5FA]/20 transition-colors font-semibold flex items-center justify-center gap-1">
                            <MessageSquare size={10}/> Notify Recipient
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function RiskInterventions() {
  const [shipments,  setShipments]  = useState<Shipment[]>([]);
  const [sensorMap,  setSensorMap]  = useState<Record<string,SensorReading[]>>({});
  const [riskMap,    setRiskMap]    = useState<Record<string,RiskEvent[]>>({});
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [selected,   setSelected]   = useState<Shipment|null>(null);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<'all'|'critical'|'high'|'medium'>('all');
  const [search,     setSearch]     = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [toasts,     setToasts]     = useState<Array<{id:string;msg:string;type:'ok'|'warn'}>>([]);
  const [statsOpen,  setStatsOpen]  = useState(true);
  const { data: rtActiveShipments } = useRealtimeData<Record<string, any>>('/active_shipments');
  // Per-shipment live risk score from /risk_scores/{code}
  const selectedCode = selected?.shipment_code ?? '';
  const { data: rtRiskScore } = useRealtimeData<any>(
    selectedCode ? `/risk_scores/${selectedCode}` : null as any
  );
  // Per-shipment live AI action from /ai_actions/{code}
  const { data: rtAiAction } = useRealtimeData<any>(
    selectedCode ? `/ai_actions/${selectedCode}` : null as any
  );
  // Live factor contributions from RTDB /risk_scores (override static Gemini)
  const liveFactors: Record<string, number> = rtRiskScore?.factors ?? {};
  const liveExplanation = rtAiAction?.explanation_ops ?? undefined;
  const liveColdHub     = rtAiAction?.cold_hub        ?? null;
  const liveReroute     = rtAiAction?.reroute         ?? null;

  const toast = (msg: string, type: 'ok'|'warn' = 'ok') => {
    const tid = Math.random().toString(36).slice(2);
    setToasts(t => [...t, {id:tid,msg,type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 3500);
  };

  const displayShipments = React.useMemo(() => {
    if (!rtActiveShipments || shipments.length === 0) return shipments;
    return shipments.map(s => {
      const rt = rtActiveShipments[s.shipment_code];
      if (!rt) return s;
      return {
        ...s,
        status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage.toLowerCase(),
        current_risk: {
          ...s.current_risk,
          risk_score: rt.risk_score / 100,
          risk_category: rt.risk_category,
        }
      } as Shipment;
    });
  }, [shipments, rtActiveShipments]);

  const fetchAll = useCallback(async () => {
    try {
      const [ships, alts] = await Promise.all([getShipments('all'), getAlerts()]);
      setShipments(ships);
      setAlerts(alts);
      // Fetch detail for high-risk shipments
      const highRisk = ships.filter(s => {
        const cat = s.current_risk?.risk_category?.toUpperCase();
        return cat === 'CRITICAL' || cat === 'HIGH' || cat === 'MEDIUM';
      });
      for (const s of highRisk.slice(0, 8)) {
        try {
          const [sr, re] = await Promise.all([getSensorHistory(s.id), getRiskEvents(s.id)]);
          setSensorMap(m => ({...m, [s.id]: sr}));
          setRiskMap(m => ({...m, [s.id]: re}));
        } catch { /* silent */ }
      }
      if (!selected && highRisk.length > 0) setSelected(highRisk[0]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => {
    fetchAll();
    // Replaced polling with useRealtimeData!
  }, [fetchAll]);

  // Sort: CRITICAL â†’ HIGH â†’ MEDIUM â†’ LOW
  const sortedShips = [...displayShipments].sort((a, b) => {
    const order: Record<string,number> = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
    return (order[getRiskCat(a)] ?? 4) - (order[getRiskCat(b)] ?? 4);
  });

  const filteredShips = sortedShips.filter(s => {
    const cat = getRiskCat(s);
    const matchFilter = filter === 'all' ? true
      : filter === 'critical' ? cat === 'CRITICAL'
      : filter === 'high' ? cat === 'HIGH'
      : cat === 'MEDIUM';
    const matchSearch = !search || s.shipment_code.toLowerCase().includes(search.toLowerCase())
      || (s.product_type ?? '').toLowerCase().includes(search.toLowerCase())
      || (s.origin ?? '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const critCount = sortedShips.filter(s => getRiskCat(s) === 'CRITICAL').length;
  const highCount = sortedShips.filter(s => getRiskCat(s) === 'HIGH').length;
  const medCount  = sortedShips.filter(s => getRiskCat(s) === 'MEDIUM').length;
  const lowCount  = sortedShips.filter(s => getRiskCat(s) === 'LOW').length;

  // Global stats mock
  const alertsToday = alerts.length;
  const activeIncidents = critCount + highCount;

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#080B12] text-[#4DD9AC]" style={{fontFamily:'Inter,sans-serif'}}>
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#4DD9AC]/20 border-t-[#4DD9AC] rounded-full animate-spin mx-auto mb-3"/>
        <div className="text-sm text-[#64748B]">Loading risk data...</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      {/* Pulsing border keyframe */}
      <style>{`
        @keyframes pulseBorder {
          0%,100% { box-shadow: 0 0 0 0px rgba(239,68,68,0.3), 0 2px 12px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 0 0 3px rgba(239,68,68,0.15), 0 2px 12px rgba(0,0,0,0.2); }
        }
        @keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; }}
      `}</style>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl ${t.type==='ok'?'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]'}`}
            style={{animation:'slideIn 0.3s ease'}}>{t.msg}</div>
        ))}
      </div>

      {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black text-[#F1F5F9]">âš¡ Risk &amp; Interventions</h1>
            <div className="flex items-center gap-3 mt-1 text-sm flex-wrap">
              {critCount > 0 && <span className="text-[#F87171] font-bold">ðŸ”´ {critCount} CRITICAL</span>}
              {highCount > 0 && <span className="text-[#FDBA74] font-bold">ðŸŸ  {highCount} HIGH</span>}
              {medCount > 0 && <span className="text-[#FDE68A] font-semibold">ðŸŸ¡ {medCount} WATCHLIST</span>}
              <span className="text-[#34D399]">ðŸŸ¢ {lowCount} STABLE</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAutoRefresh(v=>!v)}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors ${autoRefresh?'bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399]':'border-[#1E2530] text-[#64748B]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh?'bg-[#34D399] animate-pulse':'bg-[#64748B]'}`}/>
              Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button onClick={() => setStatsOpen(v=>!v)}
              className="text-xs border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">
              {statsOpen ? 'â–² Stats' : 'â–¼ Stats'}
            </button>
          </div>
        </div>

        {/* Global Stats Bar */}
        {statsOpen && (
          <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#1E2530]">
            {[
              { label:'Alerts Sent Today', value: alertsToday, color:'#60A5FA' },
              { label:'Active Incidents',  value: activeIncidents, color: activeIncidents > 0 ? '#EF4444' : '#34D399' },
              { label:'Loss est. prevented',value:'â‚¹2.4L', color:'#34D399' },
              { label:'Avg response time', value:'4.2 min', color:'#FBBF24' },
            ].map(s => (
              <div key={s.label} className="bg-[#111827] border border-[#1E2530] rounded-lg px-4 py-3">
                <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-1">{s.label}</div>
                <div className="text-xl font-black font-mono" style={{color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* â”€â”€ Body: Risk feed + Intervention panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* â”€â”€ LEFT: Risk Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="w-80 shrink-0 flex flex-col border-r border-[#1E2530] bg-[#0D1117] overflow-hidden">

          {/* Filter + search */}
          <div className="shrink-0 px-3 py-3 border-b border-[#1E2530] space-y-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ðŸ” Search shipments..." className="w-full bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
            <div className="flex gap-1">
              {([['all','All'], ['critical','ðŸ”´'], ['high','ðŸŸ '], ['medium','ðŸŸ¡']] as const).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 text-[10px] py-1 rounded border transition-colors ${filter===f?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {filteredShips.length === 0 ? (
              <div className="text-center text-[#4A5568] text-sm py-8">
                {search ? 'No shipments match your search.' : 'No shipments in this category.'}
              </div>
            ) : filteredShips.map(s => (
              <RiskCard key={s.id}
                shipment={s}
                sensors={sensorMap[s.id] ?? []}
                riskEvts={riskMap[s.id] ?? []}
                alerts={alerts}
                selected={selected?.id === s.id}
                onSelect={() => setSelected(s)}
              />
            ))}
          </div>
        </div>

        {/* â”€â”€ RIGHT: Intervention Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
          {selected ? (
            <InterventionPanel
              shipment={selected}
              sensors={sensorMap[selected.id] ?? []}
              riskEvts={riskMap[selected.id] ?? []}
              onToast={toast}
              liveFactors={liveFactors}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-5xl mb-4">âš¡</div>
              <div className="text-lg font-semibold text-[#CBD5E1] mb-2">Select a risk event</div>
              <div className="text-sm text-[#64748B] max-w-xs">
                Click any card on the left to see the full intervention panel â€” risk breakdown, predictions, AI explanation, and actions.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
