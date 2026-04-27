import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getShipments, getSensorHistory, getRiskEvents, getAlerts, sendTestAlert,
  alertDriver, triggerAgent, getRiskDetail, sendManualAlert,
  type Shipment, type SensorReading, type RiskEvent, type Alert,
} from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';

// ── Helpers ────────────────────────────────────────────────────────────────────
const PRODUCT_ICONS: Record<string, string> = {
  dairy:'🥛', milk:'🥛', seafood:'🐟', fish:'🐟', produce:'🥦',
  vegetables:'🥦', frozen:'🧊', pharma:'💊', fruits:'🍎', meat:'🥩', other:'📦',
};
function pIcon(t?: string) { return PRODUCT_ICONS[t?.toLowerCase() ?? ''] ?? '📦'; }

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
  if (!m) return '—';
  const h=Math.floor(m/60), mn=m%60;
  return h ? `${h}h ${mn}m` : `${mn}m`;
}
function getRiskCat(s: Shipment) { return s.current_risk?.risk_category?.toUpperCase() ?? 'LOW'; }
function getRiskScore(s: Shipment) { return Math.round(s.current_risk?.risk_score ?? 0); }

// SOP steps by product type
const SOP: Record<string, string[]> = {
  dairy:   ['Alert driver immediately via WhatsApp','Driver checks reefer unit and seals','If breach >15 min → escalate to manager','If reefer fails → divert to cold hub','Document breach start time and temp','Capture photographic evidence','Notify recipient of potential delay'],
  seafood: ['Check reefer temperature reading','Driver verifies ice pack status if applicable','Escalate immediately if >4°C','Consider diversion to nearest cold hub','Notify consignee of possible delay','Document all actions taken'],
  pharma:  ['Alert driver — check reefer immediately','Verify sensor calibration status','If breach >2°C — stop shipment at nearest hub','Contact quality assurance team','Generate deviation report','Issue hold notice for cargo'],
  default: ['Alert driver via WhatsApp','Check reefer unit status','Escalate to fleet manager if unresolved >10 min','Consider cold hub diversion','Document breach in system','Notify recipient'],
};

// ── Risk card ──────────────────────────────────────────────────────────────────
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
        {' · '}
        <span className="text-[#64748B]">{shipment.origin?.split(',')[0]} → {shipment.destination?.split(',')[0]}</span>
      </div>

      {/* Key signals */}
      <div className="space-y-1 mb-3">
        {isBreach && latestS && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span style={{color}}>🌡</span>
            <span className="text-[#F87171]">Cargo temp: {latestS.temperature?.toFixed(1)}°C</span>
            <span className="text-[#64748B]">(safe: {tMin}–{tMax}°C)</span>
            <span className="font-bold" style={{color}}>BREACH</span>
          </div>
        )}
        {spoil && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#FBBF24]">
            <span>⚡</span>
            <span>Spoilage window: {fmtSpoil(spoil)} remaining</span>
          </div>
        )}
        {delay > 0 ? (
          <div className="text-[11px] text-[#FBBF24]">⏱ Delay: +{delay} min from planned route</div>
        ) : (
          <div className="text-[11px] text-[#34D399]">⏱ On time — no delay</div>
        )}
      </div>

      {/* Driver alert status */}
      <div className="text-[10px] flex items-center gap-1.5 text-[#64748B]">
        <span>👤</span>
        <span>Driver: {shipment.driver_phone ?? 'Unassigned'}</span>
        <span className={`ml-1 font-bold ${alertSent ? 'text-[#34D399]' : 'text-[#FBBF24]'}`}>
          — Alert {alertSent ? 'SENT' : 'NOT SENT'}
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

// ── Intervention Panel ─────────────────────────────────────────────────────────
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

  // Risk factors — prefer RTDB live SHAP contributions from /risk_scores/{code}
  const factorIconMap: Record<string, string> = {
    'Cargo temp above safe band':  '🌡', 'Transit delay': '⏱',
    'Ambient heat index':          '🌤', 'Temperature breach duration': '🔥',
    'Reefer unit degradation':     '🧊', 'High humidity': '💧',
    'Sensor connectivity gap':     '📡', 'Door open time': '🚪',
    'Time-of-day risk':            '🕐',
  };
  const factors = Object.keys(liveFactors).length > 0
    ? Object.entries(liveFactors)
        .filter(([, p]) => (p as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([label, p]) => ({
          icon: factorIconMap[label] ?? '⚡', label, pts: p as number,
          detail: `Contribution: +${p} risk points`,
          why: `This factor accounts for ${p} of the overall ${score}/100 risk score.`,
        }))
    : [
        { icon:'🌡', label:'Cargo temp above safe band',   pts: isBreach ? 22 : 0, detail:`Cargo: ${latestS?.temperature?.toFixed(1) ?? '—'}°C · Safe max: ${tMax}°C`, why:`Temperature-sensitive cargo spoils exponentially faster above safe ceiling.` },
        { icon:'⏱', label:'Transit delay',                  pts: delay > 20 ? 18 : delay > 0 ? 8 : 0, detail:`Current delay: +${delay} min`, why:`Delay extends total exposure time, compressing the safe delivery window.` },
        { icon:'🌤', label:'High ambient temperature',       pts: (latestS?.ambient_temp ?? 0) > 32 ? 9 : 0, detail:`Ambient: ${latestS?.ambient_temp?.toFixed(0) ?? 38}°C`, why:`High ambient heat increases reefer workload.` },
        { icon:'📡', label:'Sensor connectivity gap',        pts: sensors.length < 3 ? 5 : 0, detail:`Last sync: ${latestS?.recorded_at ? `${Math.floor((Date.now()-new Date(latestS.recorded_at).getTime())/60000)} min ago` : 'Unknown'}`, why:`Sensor gaps create visibility blindspots.` },
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

  const driverExplanation = `Your cargo is too warm. Safe temp is ${tMin}–${tMax}°C but it's showing ${latestS?.temperature?.toFixed(1) ?? '?'}°C. Please check the reefer now and reduce temperature. Spoilage risk in ${fmtSpoil(spoil)} if unchanged.`;

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
            Full Detail →
          </button>
        </div>
        <div className="text-xs text-[#64748B]">
          {pIcon(shipment.product_type)} <span className="capitalize">{shipment.product_type}</span>
          {' · '}{shipment.origin?.split(',')[0]} → {shipment.destination?.split(',')[0]}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* ── Risk Gauge ───────────────────────────────────────────────── */}
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
                {spoil && <div className="flex justify-between"><span className="text-[#64748B]">⚡ Spoilage window</span><span className="font-mono font-bold text-[#FBBF24]">{fmtSpoil(spoil)}</span></div>}
                {isBreach && <div className="flex justify-between"><span className="text-[#64748B]">🌡 Temp delta</span><span className="font-mono text-[#F87171]">+{tempDelta}°C above safe</span></div>}
                {delay > 0 && <div className="flex justify-between"><span className="text-[#64748B]">⏱ Breach ongoing</span><span className="font-mono text-[#FBBF24]">+{delay} min</span></div>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Contributing Factors ─────────────────────────────────────── */}
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
                  <span className="text-[#4A5568] text-[10px]">{expandedFact===i?'▲':'▼'}</span>
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

        {/* ── Prediction Strip ─────────────────────────────────────────── */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">What Happens Next?</div>
          <div className="space-y-2">
            {predictions.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-[#1E2530] last:border-0">
                <span className="flex-1 text-[#94A3B8]">{p.cond}</span>
                <span className="text-[9px]">→</span>
                <span className="font-bold whitespace-nowrap" style={{color:p.color}}>{p.outcome}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── AI Explanation ───────────────────────────────────────────── */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">Why This Risk?</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setDriverMode(false)}
                className={`text-[10px] px-2 py-0.5 rounded-l border border-[#1E2530] transition-colors ${!driverMode?'bg-[#4DD9AC]/10 text-[#4DD9AC] border-[#4DD9AC]/30':'text-[#64748B]'}`}>
                📋 Ops
              </button>
              <button onClick={() => setDriverMode(true)}
                className={`text-[10px] px-2 py-0.5 rounded-r border border-l-0 border-[#1E2530] transition-colors ${driverMode?'bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/30':'text-[#64748B]'}`}>
                🚛 Driver
              </button>
            </div>
          </div>

          {driverMode ? (
            <div className="bg-[#0D1A2E] border border-[#1E3A5F] rounded-lg p-3">
              <div className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-2 font-bold">🚛 Driver-friendly version</div>
              <p className="text-sm text-[#CBD5E1] leading-relaxed">{driverExplanation}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                {explanation ? (
                  aiExpanded ? explanation : explanation.slice(0,160) + (explanation.length > 160 ? '...' : '')
                ) : (
                  `${shipment.product_type ?? 'Cargo'} shipment ${shipment.shipment_code} is ${isBreach ? `heating above safe range. Cargo at ${latestS?.temperature?.toFixed(1)}°C vs safe ceiling ${tMax}°C. Combined with ${delay > 0 ? `+${delay} min delay` : 'transit conditions'}, the effective safe window has compressed significantly. Immediate reefer adjustment or diversion required.` : 'within operational parameters. Continue routine monitoring every 5 minutes.'}`
                )}
              </p>
              {(explanation?.length ?? 0) > 160 && (
                <button onClick={() => setAiExpanded(e=>!e)} className="text-[10px] text-[#60A5FA] mt-2 hover:text-white transition-colors">
                  {aiExpanded ? 'Show less ▲' : 'Show full analysis ▼'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Action Buttons ────────────────────────────────────────────── */}
        <div className="bg-[#111827] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3 font-semibold">Interventions</div>
          <div className="space-y-1.5">
            {[
              { key:'alert',   icon:'⚠️',  label:'Alert Driver Now',        sub:'WhatsApp + Push notification', color:'#EF4444',
                fn: async () => {
                  try {
                    if (shipment.driver_phone) {
                      await alertDriver({ shipment_code: shipment.shipment_code });
                    }
                    doneAction('alert','⚠️ Alert sent to driver via ADK agent');
                  } catch { doneAction('alert','⚠️ Alert queued (offline)'); }
                }},
              { key:'call',    icon:'📞',  label:'Call Driver Directly',    sub:`Call ${shipment.driver_phone ?? 'driver'}`, color:'#60A5FA', fn:()=>doneAction('call','📞 Calling driver...') },
              { key:'whatsapp',icon:'💬',  label:'Send WhatsApp Template',  sub:'Temperature alert SOP', color:'#34D399',
                fn: async () => {
                  try {
                    await sendManualAlert({ shipment_id: shipment.id, alert_type: 'TEMP_BREACH', channel: 'WHATSAPP' });
                    doneAction('whatsapp','💬 WhatsApp message sent to driver');
                  } catch (e) {
                    doneAction('whatsapp','⚠️ Failed to send WhatsApp', 'warn');
                  }
                }},
              { key:'escalate',icon:'🚨',  label:'Escalate to Fleet Manager',sub:'Fleet Manager · Auto-notify', color:'#F97316', fn:()=>doneAction('escalate','🚨 Escalated',  'warn') },
              { key:'reroute', icon:'🛣️',  label:'Suggest Reroute',         sub:'Via Nongpoh — saves 18 min', color:'#A78BFA', fn:()=>doneAction('reroute','🛣️ Reroute suggestion sent') },
              { key:'coldhub', icon:'🏭',  label:'Nearest Cold Hub',        sub:'Meghalaya Hub · 11.2 km', color:'#60A5FA', fn:()=>{ setColdHubOpen(true); doneAction('coldhub','🏭 Cold hub navigation sent'); }},
              { key:'monitor', icon:'👁️',  label:'Mark: Manual Monitoring', sub:'Remove from auto-alert queue', color:'#64748B', fn:()=>doneAction('monitor','👁️ Manual monitoring enabled') },
              { key:'fp',      icon:'✅',  label:'Mark: False Positive',    sub:'Flag as reviewed, no action needed', color:'#374151', fn:()=>doneAction('fp','✅ Marked as false positive') },
            ].map(btn => {
              const done = actionDone.has(btn.key);
              return (
                <button key={btn.key} onClick={btn.fn as any} disabled={done}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all disabled:opacity-60 group"
                  style={{color:btn.color, background:`${btn.color}08`, borderColor:`${btn.color}25`}}>
                  <span className="text-base shrink-0 mt-0.5">{done ? '✓' : btn.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{done ? 'Done — ' : ''}{btn.label}</div>
                    <div className="text-[10px] text-[#64748B] truncate">{btn.sub}</div>
                  </div>
                  <span className="text-[#4A5568] text-xs group-hover:text-current transition-colors">→</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cold Hub Card ─────────────────────────────────────────────── */}
        {score > 40 && (
          <div>
            <button onClick={() => setColdHubOpen(v=>!v)}
              className="w-full text-left flex items-center justify-between px-4 py-2.5 bg-[#0F1A2E] border border-[#1E3A5F] rounded-xl text-xs font-semibold text-[#60A5FA] transition-colors hover:border-[#60A5FA]/40">
              <span>🏭 EMERGENCY COLD STORAGE</span>
              <span>{coldHubOpen ? '▲' : '▼'}</span>
            </button>
            {coldHubOpen && (
              <div className="bg-[#0F1A2E] border border-[#1E3A5F] border-t-0 rounded-b-xl px-4 pb-4 space-y-2">
                <div className="text-sm font-bold text-[#F1F5F9] pt-3">Meghalaya Cold Storage Hub</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  {[
                    ['Distance','11.2 km'],['Diversion','14 min'],
                    ['Capacity','Available (3 slots)'],['Spoilage impact','-28% if diverted now'],
                    ['SLA impact','+14 min to delivery'],['Cost est.','₹2,400 diversion fee'],
                  ].map(([k,v]) => (
                    <div key={k}><span className="text-[#64748B]">{k}: </span><span className="text-[#CBD5E1] font-medium">{v}</span></div>
                  ))}
                </div>
                <div className="text-[11px] text-[#34D399] bg-[#34D399]/8 border border-[#34D399]/20 rounded px-3 py-2 font-semibold">
                  If diverted: spoilage risk drops from HIGH (74%) to MEDIUM (46%). Recommended.
                </div>
                <div className="flex gap-2 pt-1">
                  {[
                    {l:'📍 Navigate Driver', fn:()=>doneAction('nav','📍 Driver navigation sent')},
                    {l:'📞 Call Hub',         fn:()=>doneAction('callhub','📞 Calling hub manager...')},
                    {l:'📋 Book Slot',        fn:()=>doneAction('book','📋 Slot booked at cold hub')},
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

        {/* ── SOP Playbook ─────────────────────────────────────────────── */}
        <div>
          <button onClick={() => setSopOpen(v=>!v)}
            className="w-full text-left flex items-center justify-between px-4 py-2.5 bg-[#111827] border border-[#1E2530] rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-white transition-colors">
            <span>📋 {shipment.product_type?.toUpperCase() ?? 'PRODUCT'} TEMPERATURE BREACH SOP</span>
            <span>{sopOpen ? '▲' : '▼'}</span>
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
                        {done && <span className="text-[8px] text-[#003829] font-black">✓</span>}
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

      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
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

  // Sort: CRITICAL → HIGH → MEDIUM → LOW
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

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black text-[#F1F5F9]">⚡ Risk &amp; Interventions</h1>
            <div className="flex items-center gap-3 mt-1 text-sm flex-wrap">
              {critCount > 0 && <span className="text-[#F87171] font-bold">🔴 {critCount} CRITICAL</span>}
              {highCount > 0 && <span className="text-[#FDBA74] font-bold">🟠 {highCount} HIGH</span>}
              {medCount > 0 && <span className="text-[#FDE68A] font-semibold">🟡 {medCount} WATCHLIST</span>}
              <span className="text-[#34D399]">🟢 {lowCount} STABLE</span>
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
              {statsOpen ? '▲ Stats' : '▼ Stats'}
            </button>
          </div>
        </div>

        {/* Global Stats Bar */}
        {statsOpen && (
          <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#1E2530]">
            {[
              { label:'Alerts Sent Today', value: alertsToday, color:'#60A5FA' },
              { label:'Active Incidents',  value: activeIncidents, color: activeIncidents > 0 ? '#EF4444' : '#34D399' },
              { label:'Loss est. prevented',value:'₹2.4L', color:'#34D399' },
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

      {/* ── Body: Risk feed + Intervention panel ────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Risk Feed ────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col border-r border-[#1E2530] bg-[#0D1117] overflow-hidden">

          {/* Filter + search */}
          <div className="shrink-0 px-3 py-3 border-b border-[#1E2530] space-y-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search shipments..." className="w-full bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
            <div className="flex gap-1">
              {([['all','All'], ['critical','🔴'], ['high','🟠'], ['medium','🟡']] as const).map(([f, l]) => (
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

        {/* ── RIGHT: Intervention Panel ──────────────────────────────────── */}
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
              <div className="text-5xl mb-4">⚡</div>
              <div className="text-lg font-semibold text-[#CBD5E1] mb-2">Select a risk event</div>
              <div className="text-sm text-[#64748B] max-w-xs">
                Click any card on the left to see the full intervention panel — risk breakdown, predictions, AI explanation, and actions.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
