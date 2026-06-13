import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAlerts, getShipments, sendTestAlert,
  sendManualAlert, resendAlert, markAlertFalsePositive, getLiveAlerts,
  type Alert, type Shipment, type LiveAlert,
} from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface EnrichedAlert extends Alert {
  severity:  'CRITICAL'|'HIGH'|'MEDIUM'|'LOW';
  alertType: string;
  typeIcon:  string;
  resolved:  boolean;
  acknowledged: boolean;
  escalated: boolean;
  driver:    string;
  channel:   string;
  triggerText: string;
  shipCode:  string;
  route:     string;
  productIcon: string;
  escalateCountdown: number; // seconds, 0 means escalated
  thread:    ThreadMsg[];
}

interface ThreadMsg {
  time: string; who: 'system'|'outbound'|'inbound'|'escalation';
  text: string; read?: boolean; name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCT_ICONS: Record<string,string> = { dairy:'🥛',milk:'🥛',seafood:'🐟',fish:'🐟',produce:'🥦',frozen:'🧊',pharma:'💊',fruits:'🍎',meat:'🥩',other:'📦' };
const pIcon = (t?:string) => PRODUCT_ICONS[t?.toLowerCase()??''] ?? '📦';

const ALERT_TYPES = [
  { key:'temp',     icon:'🌡', label:'Temperature Breach',  sev:'CRITICAL' as const },
  { key:'humid',    icon:'💧', label:'Humidity Spike',       sev:'HIGH' as const },
  { key:'delay',    icon:'⏱', label:'Delay Warning',        sev:'HIGH' as const },
  { key:'reefer',   icon:'❄️',  label:'Reefer Failure',      sev:'CRITICAL' as const },
  { key:'door',     icon:'🚪', label:'Door Open',            sev:'HIGH' as const },
  { key:'offline',  icon:'📡', label:'Driver Offline',       sev:'HIGH' as const },
  { key:'signal',   icon:'📶', label:'GPS Signal Lost',      sev:'MEDIUM' as const },
  { key:'sla',      icon:'📋', label:'SLA Risk',             sev:'MEDIUM' as const },
];

function pickType() { return ALERT_TYPES[Math.floor(Math.random()*ALERT_TYPES.length)]; }
function fmtTime(iso?: string|null) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
function fmtCountdown(s: number) {
  if (s <= 0) return 'ESCALATED';
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function sevColor(sev?: string) {
  const s = sev?.toUpperCase();
  return s==='CRITICAL'?'#EF4444': s==='HIGH'?'#F97316': s==='MEDIUM'?'#FBBF24':'#34D399';
}

const TEMPLATE_ALERTS = [
  { id:'t1', severity:'CRITICAL' as const, alertType:'Temperature Breach', typeIcon:'🌡',
    driver:'Ramesh Kumar', channel:'WhatsApp', shipCode:'AXN-2091', route:'Guwahati → Shillong',
    productIcon:'🥛', resolved:false, acknowledged:false, escalated:false,
    escalateCountdown:262,
    triggerText:'Cargo temp 9.8°C — 3.8° above safe max (6°C). Breach ongoing 22 min.',
    created_at: new Date(Date.now()-22*60000).toISOString(),
    delivered:false, shipment_id:'s1', shipment_code:'AXN-2091', recipient_phone:'+919876543210',
    channel_raw:'whatsapp', message_body:'⚠️ URGENT: Cargo temp 9.8°C — safe max 6°C.',
    thread:[
      {time:'08:22:04', who:'system'   as const, text:'Alert triggered — Temperature Breach on AXN-2091'},
      {time:'08:22:14', who:'outbound' as const, text:'⚠️ URGENT: Cargo temp 9.8°C — safe max 6°C. Please check reefer immediately. AXN-2091', read:false},
      {time:'08:24:00', who:'escalation' as const, text:'Auto-escalation triggered — no ack in 2 min. Escalating to Fleet Manager Sunil Mehta.'},
      {time:'08:24:05', who:'outbound' as const, text:'Driver Ramesh unresponsive. Temp breach on AXN-2091. Please call or take action.', read:true, name:'Sunil Mehta'},
      {time:'08:26:14', who:'inbound'  as const, text:'Calling driver now', name:'Sunil Mehta'},
    ]
  },
  { id:'t2', severity:'HIGH' as const, alertType:'Humidity Spike', typeIcon:'💧',
    driver:'Suresh Pandey', channel:'WhatsApp', shipCode:'AXN-3044', route:'Jorhat → Kohima',
    productIcon:'🐟', resolved:false, acknowledged:true, escalated:false,
    escalateCountdown:0,
    triggerText:'Humidity 84% — above 75% safe limit. Seafood packaging at risk.',
    created_at: new Date(Date.now()-75*60000).toISOString(),
    delivered:true, shipment_id:'s2', shipment_code:'AXN-3044', recipient_phone:'+919876543211',
    channel_raw:'whatsapp', message_body:'💧 Humidity alert: 84% detected.',
    thread:[
      {time:'07:45:00', who:'system'   as const, text:'Humidity spike detected — 84% on AXN-3044'},
      {time:'07:45:10', who:'outbound' as const, text:'💧 Humidity 84% — safe limit 75%. Check cargo packaging. Seafood SOP: seal open containers.', read:true},
      {time:'07:47:20', who:'inbound'  as const, text:'Checking packaging now', name:'Suresh Pandey'},
      {time:'07:52:00', who:'inbound'  as const, text:'Resealed the boxes. Humidity still 81% but dropping slowly.', name:'Suresh Pandey'},
    ]
  },
  { id:'t3', severity:'CRITICAL' as const, alertType:'Reefer Failure', typeIcon:'❄️',
    driver:'Dev Nair', channel:'WhatsApp', shipCode:'AXN-2841', route:'Dibrugarh → Itanagar',
    productIcon:'💊', resolved:false, acknowledged:false, escalated:true,
    escalateCountdown:0,
    triggerText:'Reefer compressor stopped. Temp rising at 1.2°C/min. Pharma cargo critical.',
    created_at: new Date(Date.now()-45*60000).toISOString(),
    delivered:true, shipment_id:'s3', shipment_code:'AXN-2841', recipient_phone:'+919876543215',
    channel_raw:'call', message_body:'🚨 CRITICAL: Reefer failure on AXN-2841.',
    thread:[
      {time:'06:58:00', who:'system'     as const, text:'Reefer failure alert — AXN-2841 pharma cargo'},
      {time:'06:58:14', who:'outbound'   as const, text:'🚨 CRITICAL: Reefer failure on AXN-2841. Stop immediately and call cold hub. Temp rising 1.2°C/min.', read:false},
      {time:'07:00:00', who:'escalation' as const, text:'Driver unresponsive after 2 min. Auto-escalated to Fleet Manager + Operations Lead.'},
      {time:'07:00:10', who:'outbound'   as const, text:'URGENT: Dev Nair (AXN-2841) not responding. Reefer failure. Please call immediately.', read:true, name:'Ananya Singh'},
      {time:'07:04:00', who:'inbound'    as const, text:'Called driver. He\'s pulled over at NH-37. Calling nearest cold hub now.', name:'Ananya Singh'},
    ]
  },
  { id:'t4', severity:'LOW' as const, alertType:'Delay Warning', typeIcon:'⏱',
    driver:'Anuj Sharma', channel:'Push', shipCode:'AXN-1998', route:'Mumbai → Pune',
    productIcon:'🍎', resolved:true, acknowledged:true, escalated:false,
    escalateCountdown:0,
    triggerText:'Delay +28 min — SLA at risk. Rerouted via Expressway alternate.',
    created_at: new Date(Date.now()-110*60000).toISOString(),
    delivered:true, shipment_id:'s4', shipment_code:'AXN-1998', recipient_phone:'+919876543213',
    channel_raw:'push', message_body:'⏱ Delay +28 min on AXN-1998.',
    thread:[
      {time:'06:10:00', who:'system'   as const, text:'Delay alert — AXN-1998 +28 min behind schedule'},
      {time:'06:10:10', who:'outbound' as const, text:'📍 Update: AXN-1998 delayed by 28 min. Current ETA revised. Please update route if possible.', read:true},
      {time:'06:11:30', who:'inbound'  as const, text:'On it. Taking alternate via Expressway inner ring.', name:'Anuj Sharma'},
      {time:'06:22:00', who:'system'   as const, text:'Resolved — Delivered on time. Resolution: 11 min 42 sec.'},
    ]
  },
  { id:'t5', severity:'MEDIUM' as const, alertType:'GPS Signal Lost', typeIcon:'📡',
    driver:'Priya Das', channel:'SMS', shipCode:'AXN-2094', route:'Silchar → Imphal',
    productIcon:'🥦', resolved:true, acknowledged:true, escalated:false,
    escalateCountdown:0,
    triggerText:'GPS signal lost for 12 min in tunnel zone. Signal restored auto.',
    created_at: new Date(Date.now()-140*60000).toISOString(),
    delivered:true, shipment_id:'s5', shipment_code:'AXN-2094', recipient_phone:'+919876543218',
    channel_raw:'sms', message_body:'📡 GPS signal lost on AXN-2094.',
    thread:[
      {time:'05:40:00', who:'system'  as const, text:'GPS signal lost — AXN-2094 in tunnel zone'},
      {time:'05:52:00', who:'system'  as const, text:'GPS signal restored. No action required.'},
    ]
  },
];

const TEMPLATES = [
  { id:'tpl1', icon:'🌡', name:'Temperature Excursion', product:'Dairy',
    body:'⚠️ URGENT: Your cargo is above safe temperature.\nCurrent: {temp}°C — Safe max: {safe_max}°C.\nPlease check reefer immediately.\nCargofy ID: {shipment_id}',
    vars:['{temp}','{safe_max}','{shipment_id}'], default:true },
  { id:'tpl2', icon:'⏱', name:'Transit Delay — SLA Warning', product:'All',
    body:'📍 Update: Your shipment {shipment_id} is delayed by {delay_min} min.\nCurrent ETA: {eta}.\nPlease update route if possible.',
    vars:['{shipment_id}','{delay_min}','{eta}'], default:false },
  { id:'tpl3', icon:'💧', name:'Humidity Spike', product:'Seafood',
    body:'💧 Humidity alert: {humidity}% detected.\nSafe limit: 75%. Check cargo packaging.\nSeafood SOP: seal any open containers.',
    vars:['{humidity}'], default:false },
  { id:'tpl4', icon:'🛣️', name:'Route Deviation', product:'All',
    body:'🛣️ Route deviation on {shipment_id}.\nYou appear off planned route.\nPlease confirm route or call dispatch.',
    vars:['{shipment_id}'], default:false },
  { id:'tpl5', icon:'✅', name:'Delivery Confirmation Request', product:'All',
    body:'✅ Please confirm delivery of {shipment_id} to {destination}.\nReply with POD or call.',
    vars:['{shipment_id}','{destination}'], default:false },
  { id:'tpl6', icon:'🚨', name:'Immediate Cooling Action', product:'Pharma',
    body:'🚨 CRITICAL: Cargo temp {temp}°C is too high.\nReduce reefer immediately or call +91 xxx.\nIf reefer fails, stop at nearest cold hub.',
    vars:['{temp}'], default:false },
];

const ESCALATION_MATRIX = [
  { level:'CRITICAL', product:'Dairy', steps:[
    {step:1, delay:'0 min',  who:'Driver',          how:'WhatsApp + Push'},
    {step:2, delay:'10 min', who:'Fleet Manager',   how:'WhatsApp + Call'},
    {step:3, delay:'15 min', who:'Operations Lead', how:'Call + SMS'},
    {step:4, delay:'25 min', who:'Director',        how:'Push + Email'},
  ]},
  { level:'HIGH', product:'Any Product', steps:[
    {step:1, delay:'0 min',  who:'Driver',          how:'WhatsApp'},
    {step:2, delay:'15 min', who:'Fleet Manager',   how:'WhatsApp'},
    {step:3, delay:'30 min', who:'Operations Lead', how:'SMS'},
  ]},
  { level:'WATCHLIST', product:'Any', steps:[
    {step:1, delay:'0 min',  who:'Driver',          how:'Push notification'},
    {step:2, delay:'30 min', who:'Dispatcher',      how:'Dashboard alert'},
  ]},
];

const TEAM = [
  {role:'Fleet Manager',      name:'Sunil Mehta',      phone:'+91 98100 21000'},
  {role:'Operations Lead',    name:'Ananya Singh',     phone:'+91 97200 44100'},
  {role:'Dispatcher (day)',   name:'Priya Nair',       phone:'+91 96100 32000'},
  {role:'Dispatcher (night)', name:'Ravi Kumar',       phone:'+91 95100 77000'},
  {role:'Director (on-call)', name:'Ramakrishnan V.',  phone:'+91 99100 55200'},
];

// ─────────────────────────────────────────────────────────────────────────────
// Alert Card
// ─────────────────────────────────────────────────────────────────────────────
function AlertCard({ alert: a, selected, onClick }: { alert: EnrichedAlert; selected: boolean; onClick: () => void }) {
  const color = sevColor(a.severity);
  const isCrit = a.severity === 'CRITICAL';

  return (
    <button onClick={onClick} className="w-full text-left rounded-xl p-4 border-l-4 relative overflow-hidden transition-all hover:brightness-105"
      style={{
        borderLeftColor: color,
        background: selected ? `${color}10` : a.resolved ? 'rgba(52,211,153,0.03)' : `${color}05`,
        boxShadow: selected ? `0 0 0 1px ${color}30, 0 4px 20px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
        animation: isCrit && !a.resolved && !a.escalated ? 'pulseBorder 2.5s ease-in-out infinite' : undefined,
      }}>
      {/* Escalation countdown badge */}
      {!a.resolved && !a.acknowledged && a.escalateCountdown > 0 && (
        <div className={`absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${a.escalateCountdown < 120 ? 'bg-[#EF4444]/20 text-[#F87171]' : 'bg-[#FBBF24]/15 text-[#FBBF24]'}`}>
          ⏰ escalate in {fmtCountdown(a.escalateCountdown)}
        </div>
      )}
      {a.escalated && !a.resolved && (
        <div className="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#A78BFA]/20 text-[#A78BFA]">🚨 ESCALATED</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-black" style={{color}}>{a.typeIcon} {a.severity}</span>
        <span className="text-[10px] text-[#64748B] ml-auto">{fmtTime(a.created_at)}</span>
      </div>
      <div className="text-xs font-semibold text-[#F1F5F9] mb-1">{a.alertType}</div>

      {/* Shipment info */}
      <div className="text-[10px] text-[#64748B] mb-2">
        {a.shipCode} · {a.productIcon} {a.route}
      </div>

      {/* Trigger text */}
      <div className="text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2 mb-2">{a.triggerText}</div>

      {/* Delivery status */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-[#64748B]">→ {a.driver}</span>
        <span className="text-[#64748B]">via {a.channel}</span>
        {a.resolved ? (
          <span className="ml-auto text-[#34D399] font-bold">✅ RESOLVED</span>
        ) : a.acknowledged ? (
          <span className="ml-auto text-[#60A5FA] font-bold">👁 ACK'd</span>
        ) : (
          <span className="ml-auto text-[#EF4444] font-bold">⚠️ UNREAD</span>
        )}
      </div>

      {/* Risk bar */}
      <div className="mt-2 h-0.5 bg-[#1E2530] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{width: a.resolved?'100%': a.acknowledged?'60%':'30%', background: a.resolved?'#34D399':color}}/>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function AlertDetail({ alert: a, onAction }: { alert: EnrichedAlert; onAction: (act: string, id: string) => void }) {
  const [reply, setReply] = useState('');
  const [noteMode, setNoteMode] = useState(false);
  const [thread, setThread] = useState<ThreadMsg[]>(a.thread);
  const navigate = useNavigate();
  const color = sevColor(a.severity);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setThread(a.thread); }, [a.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  const sendReply = () => {
    if (!reply.trim()) return;
    const msg: ThreadMsg = { time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}), who:'outbound', text:reply.trim(), read:false };
    setThread(t => [...t, msg]);
    setReply('');
  };

  return (
    <div className="flex flex-col h-full" style={{fontFamily:'Inter,sans-serif'}}>
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] bg-[#0A0D14] sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{color, background:`${color}18`}}>
              {a.typeIcon} {a.severity}
            </span>
            <span className="font-mono text-sm font-black text-[#F1F5F9]">{a.alertType}</span>
          </div>
          <button onClick={() => navigate(`/shipments/${a.shipment_id}`)} className="text-[10px] text-[#64748B] hover:text-[#4DD9AC] border border-[#1E2530] px-2 py-1 rounded transition-colors">
            {a.shipCode} →
          </button>
        </div>
        <div className="text-xs text-[#64748B]">{a.shipCode} · {a.productIcon} {a.route}</div>
        <div className="text-xs text-[#94A3B8] mt-1 leading-relaxed">{a.triggerText}</div>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {thread.map((msg, i) => {
          if (msg.who === 'system') return (
            <div key={i} className="flex justify-center">
              <span className="text-[10px] text-[#4A5568] bg-[#111827] border border-[#1E2530] px-3 py-1 rounded-full font-mono">{msg.time} · {msg.text}</span>
            </div>
          );
          if (msg.who === 'escalation') return (
            <div key={i} className="flex justify-center">
              <span className="text-[10px] text-[#A78BFA] bg-[#A78BFA]/08 border border-[#A78BFA]/25 px-3 py-1.5 rounded-lg font-semibold max-w-xs text-center">{msg.time} · 🚨 {msg.text}</span>
            </div>
          );
          const isOut = msg.who === 'outbound';
          return (
            <div key={i} className={`flex flex-col gap-0.5 ${isOut ? 'items-end' : 'items-start'}`}>
              {!isOut && msg.name && <span className="text-[9px] text-[#64748B] px-1">{msg.name}</span>}
              <div className={`max-w-[85%] px-3 py-2.5 rounded-xl text-xs leading-relaxed ${isOut
                ? 'bg-[#141F1A] border border-[#34D399]/20 text-[#F1F5F9] rounded-tr-sm'
                : 'bg-[#111827] border border-[#1E2530] text-[#CBD5E1] rounded-tl-sm'}`}>
                {msg.text}
              </div>
              <div className={`text-[9px] text-[#4A5568] px-1 flex items-center gap-1 ${isOut?'':'flex-row-reverse gap-1'}`}>
                <span>{msg.time}</span>
                {isOut && (
                  <span style={{color: msg.read?'#34D399':'#EF4444'}}>{msg.read ? '✓✓ Read' : '✓ Delivered · UNREAD'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="shrink-0 px-5 py-3 border-t border-[#1E2530]">
        <div className="text-[9px] text-[#64748B] uppercase tracking-widest mb-2">Quick Actions</div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[
            {icon:'📤', label:'Resend to Driver', act:'resend'},
            {icon:'📞', label:'Call Driver', act:'call'},
            {icon:'🚨', label:'Escalate Further', act:'escalate'},
            {icon:'✅', label:'Mark Resolved', act:'resolve'},
            {icon:'❌', label:'False Positive', act:'fp'},
            {icon:'📝', label:'Add Note', act:'note'},
          ].map(b=>(
            <button key={b.act} onClick={()=>b.act==='note'?setNoteMode(n=>!n):onAction(b.act, a.id)}
              className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#94A3B8] hover:text-[#F1F5F9] hover:border-[#374151] py-1.5 px-1 rounded-lg transition-colors text-center">
              {b.icon} {b.label}
            </button>
          ))}
        </div>

        {/* Reply box */}
        {noteMode && (
          <div className="flex gap-2 mb-2">
            <textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Add note or reply…"
              className="flex-1 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40 resize-none" rows={2}/>
            <button onClick={sendReply} className="bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 rounded-lg text-xs hover:bg-[#4DD9AC]/20 transition-colors">Send</button>
          </div>
        )}

        {/* Related links */}
        <div className="flex gap-2">
          <button onClick={()=>navigate(`/shipments/${a.shipment_id}`)} className="flex-1 text-[10px] text-[#64748B] border border-[#1E2530] py-1.5 rounded-lg hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 transition-colors">
            📦 Open Shipment Detail →
          </button>
          <button onClick={()=>navigate(`/live-tracking`)} className="flex-1 text-[10px] text-[#64748B] border border-[#1E2530] py-1.5 rounded-lg hover:text-[#60A5FA] hover:border-[#60A5FA]/30 transition-colors">
            📡 Live Tracking →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Editor
// ─────────────────────────────────────────────────────────────────────────────
function TemplateTab() {
  const [editId, setEditId] = useState<string|null>(null);
  const [previewId, setPreviewId] = useState<string|null>(null);
  const SAMPLE = {'{temp}':'9.8', '{safe_max}':'6', '{shipment_id}':'AXN-2091', '{delay_min}':'28', '{eta}':'14:40', '{humidity}':'84', '{destination}':'Shillong Hub'};

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold text-[#F1F5F9]">📤 Alert Templates</div>
        <button className="text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 py-1.5 rounded-lg hover:bg-[#4DD9AC]/20 transition-colors">+ Create New</button>
      </div>
      {TEMPLATES.map(t=>{
        const preview = t.body.replace(/\{[a-z_]+\}/g, m => SAMPLE[m as keyof typeof SAMPLE] ?? m);
        return (
          <div key={t.id} className={`bg-[#111827] border rounded-xl overflow-hidden ${editId===t.id?'border-[#4DD9AC]/40':'border-[#1E2530]'}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2530]">
              <div className="flex items-center gap-2">
                <span className="text-base">{t.icon}</span>
                <div>
                  <div className="text-xs font-bold text-[#F1F5F9]">{t.name}</div>
                  <div className="text-[10px] text-[#64748B]">Product: {t.product} {t.default&&'· Default'}</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={()=>setPreviewId(previewId===t.id?null:t.id)} className={`text-[10px] px-2 py-1 rounded border transition-colors ${previewId===t.id?'bg-[#60A5FA]/10 border-[#60A5FA]/30 text-[#60A5FA]':'border-[#1E2530] text-[#64748B]'}`}>👁 Preview</button>
                <button onClick={()=>setEditId(editId===t.id?null:t.id)} className={`text-[10px] px-2 py-1 rounded border transition-colors ${editId===t.id?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>✏️ Edit</button>
                {t.default&&<span className="text-[9px] px-2 py-1 bg-[#34D399]/10 border border-[#34D399]/25 text-[#34D399] rounded">Default</span>}
              </div>
            </div>
            <div className="px-4 py-3 font-mono text-[11px] text-[#64748B] whitespace-pre-wrap leading-relaxed">{t.body}</div>
            {t.vars.length > 0 && (
              <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
                {t.vars.map(v=><span key={v} className="text-[9px] bg-[#0D1117] border border-[#1E2530] text-[#A78BFA] px-1.5 py-0.5 rounded font-mono">{v}</span>)}
              </div>
            )}
            {previewId === t.id && (
              <div className="mx-4 mb-3 bg-[#0D2B22] border border-[#34D399]/20 rounded-lg p-3">
                <div className="text-[9px] text-[#34D399] uppercase tracking-widest mb-1.5 font-semibold">Preview with sample data</div>
                <div className="text-xs text-[#F1F5F9] whitespace-pre-wrap font-mono leading-relaxed">{preview}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation Matrix Tab
// ─────────────────────────────────────────────────────────────────────────────
function EscalationTab() {
  const levelColor = (l:string) => l==='CRITICAL'?'#EF4444':l==='HIGH'?'#F97316':'#FBBF24';

  return (
    <div className="px-5 py-4 space-y-5">
      <div className="text-sm font-bold text-[#F1F5F9] mb-2">📡 Escalation Matrix</div>
      {ESCALATION_MATRIX.map(rule=>{
        const color = levelColor(rule.level);
        return (
          <div key={rule.level} className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1E2530] flex items-center justify-between">
              <div>
                <span className="text-xs font-black" style={{color}}>{rule.level}</span>
                <span className="text-xs text-[#64748B] ml-2">— {rule.product}</span>
              </div>
              <button className="text-[10px] text-[#64748B] border border-[#1E2530] px-2 py-1 rounded hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 transition-colors">✏️ Edit Path</button>
            </div>
            <div className="px-4 py-3 space-y-2">
              {rule.steps.map((s,i)=>(
                <div key={i} className="flex items-center gap-3 text-xs">
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold shrink-0 text-[10px]" style={{borderColor:color, color}}>
                    {s.step}
                  </div>
                  <div className="text-[#94A3B8] w-14 shrink-0 font-mono">{s.delay}</div>
                  <div className="flex-1 font-semibold text-[#F1F5F9]">{s.who}</div>
                  <div className="text-[10px] text-[#64748B] bg-[#0D1117] border border-[#1E2530] px-2 py-0.5 rounded">{s.how}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Team */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2530] flex items-center justify-between">
          <div className="text-sm font-bold text-[#F1F5F9]">👥 Team Members</div>
          <button className="text-[10px] text-[#64748B] border border-[#1E2530] px-2 py-1 rounded hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 transition-colors">✏️ Edit Team</button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[#0D1117]">
            <tr>
              {['Role','Name','Contact'].map(h=><th key={h} className="px-4 py-2 text-left text-[#64748B] font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2530]">
            {TEAM.map(m=>(
              <tr key={m.name} className="hover:bg-[#0D1117] transition-colors">
                <td className="px-4 py-2.5 text-[#94A3B8]">{m.role}</td>
                <td className="px-4 py-2.5 font-semibold text-[#F1F5F9]">{m.name}</td>
                <td className="px-4 py-2.5 font-mono text-[#4DD9AC]">{m.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type MainTab = 'live'|'history'|'templates'|'escalation';

export function AlertsCenter() {
  const navigate = useNavigate();
  const [mainTab,    setMainTab]    = useState<MainTab>('live');
  const [liveFilter, setLiveFilter] = useState<'all'|'unresolved'|'pending'|'resolved'|'escalated'>('all');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<EnrichedAlert|null>(null);
  const [alerts,     setAlerts]     = useState<EnrichedAlert[]>([]);
  const [shipments,  setShipments]  = useState<Shipment[]>([]);
  const [toasts,     setToasts]     = useState<Array<{id:string;msg:string;type:'ok'|'warn'|'crit'}>>([]);
  const [sortKey,    setSortKey]    = useState<'created_at'|'severity'>('severity');
  const [sortDir,    setSortDir]    = useState<'asc'|'desc'>('desc');
  const [histSearch, setHistSearch] = useState('');

  // ── Firebase RTDB real-time hooks ────────────────────────────────────────────
  const { data: rtNetworkEvents }    = useRealtimeData<any>('/network_events');
  const { data: rtActiveShipments }  = useRealtimeData<any>('/active_shipments');
  const { data: rtAlertsLive }       = useRealtimeData<Record<string, any>>('/alerts_live');
  const seenRtEvents = useRef<Set<string>>(new Set());

  const toast = (msg:string, type:'ok'|'warn'|'crit'='ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 3500);
  };

  // Merge API alerts with template enhancements
  useEffect(()=>{
    Promise.all([getAlerts(), getShipments('all')]).then(([apiAlerts, ships]) => {
      setShipments(ships);
      const enriched: EnrichedAlert[] = apiAlerts.map((a, i) => {
        const t = ALERT_TYPES[i % ALERT_TYPES.length];
        const ship = ships.find(s => s.id === a.shipment_id || s.shipment_code === a.shipment_code);
        return {
          ...a,
          severity: t.sev,
          alertType: t.label, typeIcon: t.icon,
          resolved: false, acknowledged: !!(a.delivered), escalated: false,
          driver: ship?.driver_phone ?? 'Unknown Driver',
          channel: a.channel ?? 'WhatsApp',
          triggerText: a.message_body ?? 'Alert triggered by system',
          shipCode: a.shipment_code ?? ship?.shipment_code ?? 'N/A',
          route: `${ship?.origin?.split(',')[0] ?? '?'} → ${ship?.destination?.split(',')[0] ?? '?'}`,
          productIcon: pIcon(ship?.product_type),
          escalateCountdown: t.sev==='CRITICAL' ? 262 : t.sev==='HIGH' ? 620 : 0,
          thread: [{time: fmtTime(a.created_at), who:'outbound' as const, text: a.message_body ?? 'Alert sent', read: !!(a.delivered)}],
        } as EnrichedAlert;
      });
      const combined = [...TEMPLATE_ALERTS as unknown as EnrichedAlert[], ...enriched.slice(0,3)];
      setAlerts(combined);
      if (!selected && combined.length > 0) setSelected(combined[0]);
    }).catch(() => {
      setAlerts(TEMPLATE_ALERTS as unknown as EnrichedAlert[]);
      setSelected(TEMPLATE_ALERTS[0] as unknown as EnrichedAlert);
    });
  },[]);

  // ── Merge RTDB /alerts_live into alert list ──────────────────────────────────
  useEffect(() => {
    if (!rtAlertsLive) return;
    setAlerts(prev => {
      const existing = new Set(prev.map(a => a.id));
      const newLive: EnrichedAlert[] = Object.entries(rtAlertsLive)
        .filter(([id]) => !existing.has(id))
        .map(([id, raw]: [string, any]) => {
          const t = ALERT_TYPES.find(at => at.key === (raw.type||'').toLowerCase()) ?? ALERT_TYPES[0];
          const sev = (raw.severity ?? 'HIGH') as 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW';
          return {
            id, shipment_id: raw.shipment_id ?? '', shipment_code: raw.shipment_id,
            severity: sev, alertType: t.label, typeIcon: t.icon,
            resolved: raw.ack_status === 'FALSE_POSITIVE' || raw.ack_status === 'RESOLVED',
            acknowledged: raw.ack_status === 'READ' || raw.ack_status === 'ACKED',
            escalated: raw.ack_status === 'ESCALATED',
            driver: raw.driver_name ?? 'Driver',
            channel: raw.channel ?? 'WhatsApp',
            triggerText: raw.message?.slice(0, 120) ?? 'Alert from live feed',
            shipCode: raw.shipment_id ?? 'N/A', route: '—', productIcon: '📦',
            escalateCountdown: sev==='CRITICAL' ? 262 : sev==='HIGH' ? 620 : 0,
            thread: [{time: fmtTime(new Date(raw.sent_at ?? Date.now()).toISOString()),
                      who: 'outbound' as const, text: raw.message ?? '', read: raw.ack_status === 'READ'}],
            message_body: raw.message, delivered: raw.ack_status !== 'FAILED',
            created_at: new Date(raw.sent_at ?? Date.now()).toISOString(),
          } as EnrichedAlert;
        });
      if (newLive.length === 0) return prev;
      const updated = [...newLive, ...prev];
      // Toast for new critical/high
      newLive.forEach(a => {
        if (a.severity === 'CRITICAL') toast(`🚨 CRITICAL alert on ${a.shipCode}!`, 'crit');
        else if (a.severity === 'HIGH') toast(`⚠️ HIGH alert on ${a.shipCode}`, 'warn');
      });
      return updated;
    });
  }, [rtAlertsLive]);

  // ── Merge live Firebase RTDB network events into alert list ─────────────────
  useEffect(() => {
    if (!rtNetworkEvents) return;
    // rtNetworkEvents is a map of eventId -> { event_type, shipment_code, ... }
    Object.entries(rtNetworkEvents).forEach(([eventId, raw]: [string, any]) => {
      if (seenRtEvents.current.has(eventId)) return;
      seenRtEvents.current.add(eventId);
      const evType = raw?.event_type || 'EVENT';
      const shipCode = raw?.shipment_code || 'N/A';
      // Only inject visually important events
      if (['SHIPMENT_CREATED','TEMP_BREACH','RISK_ESCALATED','SPOILAGE_ALERT'].includes(evType)) {
        const sev: EnrichedAlert['severity'] =
          evType === 'SPOILAGE_ALERT' || evType === 'TEMP_BREACH' ? 'CRITICAL'
          : evType === 'RISK_ESCALATED' ? 'HIGH' : 'MEDIUM';
        const typeInfo = ALERT_TYPES.find(t => t.sev === sev) || ALERT_TYPES[0];
        const newAlert: EnrichedAlert = {
          id: eventId,
          shipment_id: raw.shipment_id || '',
          shipment_code: shipCode,
          message_body: raw.message || `${evType} event for ${shipCode}`,
          channel: 'System',
          delivered: false,
          created_at: raw.timestamp || new Date().toISOString(),
          severity: sev,
          alertType: typeInfo.label,
          typeIcon: typeInfo.icon,
          resolved: false,
          acknowledged: false,
          escalated: false,
          driver: raw.driver_phone || 'Auto-system',
          triggerText: raw.message || `${evType} triggered by Pub/Sub`,
          shipCode,
          route: raw.origin ? `${raw.origin} → ${raw.destination || '?'}` : 'Live Event',
          productIcon: pIcon(raw.product_type),
          escalateCountdown: sev === 'CRITICAL' ? 300 : sev === 'HIGH' ? 600 : 0,
          thread: [{ time: fmtTime(raw.timestamp), who: 'outbound' as const, text: raw.message || evType, read: false }],
        } as EnrichedAlert;
        setAlerts(prev => [newAlert, ...prev.slice(0, 49)]); // keep max 50
        if (sev === 'CRITICAL') toast(`🚨 ${evType}: ${shipCode}`, 'crit');
        else if (sev === 'HIGH') toast(`⚠ ${evType}: ${shipCode}`, 'warn');
      }
    });
  }, [rtNetworkEvents]);

  // ── Update existing alert risk data from RTDB active_shipments ───────────────
  useEffect(() => {
    if (!rtActiveShipments) return;
    setAlerts(prev => prev.map(a => {
      const rt = rtActiveShipments[a.shipCode];
      if (!rt) return a;
      const newSev: EnrichedAlert['severity'] =
        rt.risk_category === 'CRITICAL' ? 'CRITICAL'
        : rt.risk_category === 'HIGH' ? 'HIGH'
        : rt.risk_category === 'MEDIUM' ? 'MEDIUM' : 'LOW';
      return { ...a, severity: newSev };
    }));
  }, [rtActiveShipments]);

  // Countdown ticker
  useEffect(()=>{
    const timer = setInterval(()=>{
      setAlerts(prev => prev.map(a => {
        if (a.escalateCountdown > 0 && !a.resolved) {
          const next = a.escalateCountdown - 1;
          if (next === 0 && !a.escalated) toast(`🚨 Auto-escalating ${a.shipCode}!`, 'crit');
          return {...a, escalateCountdown: next, escalated: next===0 ? true : a.escalated};
        }
        return a;
      }));
    }, 1000);
    return () => clearInterval(timer);
  },[]);

  const handleAction = (act: string, id: string) => {
    const target = alerts.find(a => a.id === id);
    if (!target) return;

    if (act === 'resolve') {
      setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
      toast(`✅ ${target.shipCode} marked resolved`, 'ok');
    }
    if (act === 'fp') {
      markAlertFalsePositive(id, 'Marked false positive by dispatcher')
        .then(() => {
          setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
          toast('✅ Marked false positive — removed from live feed', 'ok');
        })
        .catch(() => {
          setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
          toast('✅ Marked false positive (local)', 'ok');
        });
    }
    if (act === 'escalate') {
      setAlerts(prev => prev.map(a => a.id === id ? {...a, escalated:true} : a));
      toast(`🚨 Escalated ${target.shipCode}`, 'warn');
    }
    if (act === 'resend') {
      resendAlert(id)
        .then(() => toast(`📤 Alert resent to ${target.driver}`, 'ok'))
        .catch(() => {
          // Fallback to sendTestAlert
          sendTestAlert(target.recipient_phone ?? '').catch(() => {});
          toast(`📤 Alert resent (fallback)`, 'ok');
        });
    }
    if (act === 'call') toast(`📞 Calling driver ${target.driver}…`, 'ok');
    if (act === 'note')  toast(`📝 Note saved`, 'ok');
  };


  const liveAlerts = alerts
    .filter(a => {
      if (liveFilter === 'unresolved') return !a.resolved && !a.acknowledged;
      if (liveFilter === 'pending')    return a.acknowledged && !a.resolved;
      if (liveFilter === 'resolved')   return a.resolved;
      if (liveFilter === 'escalated')  return a.escalated;
      return true;
    })
    .filter(a => !search || a.shipCode.toLowerCase().includes(search.toLowerCase()) || a.driver.toLowerCase().includes(search.toLowerCase()));

  const SEV_ORDER: Record<string,number> = {CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3};
  const sortedLive = [...liveAlerts].sort((a,b)=> SEV_ORDER[a.severity]- SEV_ORDER[b.severity]);

  const unresolvedCount  = alerts.filter(a=>!a.resolved && !a.acknowledged).length;
  const pendingAckCount  = alerts.filter(a=>a.acknowledged && !a.resolved).length;
  const resolvedToday    = alerts.filter(a=>a.resolved).length;

  const histFiltered = [...alerts]
    .filter(a => !histSearch || a.shipCode.toLowerCase().includes(histSearch.toLowerCase()) || a.alertType.toLowerCase().includes(histSearch.toLowerCase()))
    .sort((a,b) => sortDir==='desc' ? (new Date(b.created_at??0).getTime() - new Date(a.created_at??0).getTime()) : (new Date(a.created_at??0).getTime() - new Date(b.created_at??0).getTime()));

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      <style>{`
        @keyframes pulseBorder { 0%,100%{box-shadow:0 0 0 0px rgba(239,68,68,0.2),0 2px 8px rgba(0,0,0,0.2)} 50%{box-shadow:0 0 0 4px rgba(239,68,68,0.1),0 2px 8px rgba(0,0,0,0.2)} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Critical toast banner */}
      {toasts.filter(t=>t.type==='crit').map(t=>(
        <div key={t.id} className="w-full bg-[#EF4444] text-white text-sm font-bold px-5 py-3 flex items-center gap-3 shrink-0 z-50" style={{animation:'slideDown 0.3s ease'}}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"/>
          🚨 {t.msg}
          <button onClick={()=>setToasts(x=>x.filter(y=>y.id!==t.id))} className="ml-auto text-white/60 hover:text-white">✕</button>
        </div>
      ))}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.filter(t=>t.type!=='crit').map(t=>(
          <div key={t.id} style={{animation:'slideIn 0.3s ease'}}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl ${t.type==='ok'?'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B1200] border border-[#F97316]/40 text-[#FDBA74]'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Top Nav ───────────────────────────────────────────────── */}
      <header className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-5 py-3 flex items-center gap-4 z-40">
        <span className="text-[#4DD9AC] font-black text-xl tracking-tighter cursor-pointer" onClick={()=>navigate('/dashboard')}>AXON</span>
        <div className="h-5 w-px bg-[#1E2530]"/>
        <span className="text-sm text-[#94A3B8]">🔔 Alerts Center</span>
        <div className="flex items-center gap-2 text-xs">
          {unresolvedCount > 0 && <span className="text-[#F87171] font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse"/>🔴 {unresolvedCount} Unresolved</span>}
          {pendingAckCount > 0 && <span className="text-[#FBBF24] font-bold">🟡 {pendingAckCount} Pending Ack</span>}
          <span className="text-[#34D399]">✅ {resolvedToday} Resolved Today</span>
        </div>
        <div className="flex-1"/>
        <button onClick={()=>navigate('/dashboard')} className="text-[10px] border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">← Dashboard</button>
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-5 flex items-center gap-1">
        {([['live','🔴 Live Alerts'],['history','📋 History'],['templates','📤 Templates'],['escalation','📡 Escalation Matrix']] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setMainTab(k)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${mainTab===k?'border-[#4DD9AC] text-[#4DD9AC]':'border-transparent text-[#64748B] hover:text-[#94A3B8]'}`}>
            {l}
            {k==='live' && alerts.filter(a=>!a.resolved).length > 0 && (
              <span className="w-4 h-4 bg-[#EF4444] text-white text-[9px] rounded-full flex items-center justify-center font-bold">{alerts.filter(a=>!a.resolved).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      {mainTab === 'live' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Feed */}
          <div className="w-80 shrink-0 flex flex-col border-r border-[#1E2530] bg-[#0D1117] overflow-hidden">
            {/* Filter bar */}
            <div className="shrink-0 px-3 py-3 border-b border-[#1E2530] space-y-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search alerts…"
                className="w-full bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              <div className="flex gap-1 flex-wrap">
                {([['all','All'],['unresolved','🔴'],['pending','⏳'],['resolved','✅'],['escalated','🚨']] as const).map(([f,l])=>(
                  <button key={f} onClick={()=>setLiveFilter(f)}
                    className={`flex-1 text-[10px] py-1 rounded border transition-colors ${liveFilter===f?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {sortedLive.length === 0 ? (
                <div className="text-center text-[#4A5568] text-sm py-8">No alerts in this category.</div>
              ) : sortedLive.map(a => (
                <AlertCard key={a.id} alert={a} selected={selected?.id===a.id} onClick={()=>setSelected(a)}/>
              ))}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
            {selected ? (
              <AlertDetail alert={selected} onAction={handleAction}/>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <span className="text-5xl mb-4">🔔</span>
                <div className="text-lg font-semibold text-[#CBD5E1] mb-2">Select an alert</div>
                <div className="text-sm text-[#64748B]">Click any card to see communication thread, trigger details, and action buttons.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {mainTab === 'history' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-5">
            <div className="flex items-center gap-3 mb-4">
              <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="🔍 Search history…"
                className="w-64 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}
                className="text-xs border border-[#1E2530] text-[#64748B] px-3 py-2 rounded hover:text-white transition-colors">
                Time {sortDir==='desc'?'↓':'↑'}
              </button>
              <span className="text-xs text-[#4A5568]">{histFiltered.length} entries</span>
            </div>
            <div className="bg-[#111827] border border-[#1E2530] rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#0D1117]">
                  <tr>
                    {['Time','Shipment','Alert Type','Driver','Channel','Status','Resolution','Actions'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[#64748B] font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2530]">
                  {histFiltered.map((a,i)=>{
                    const color = sevColor(a.severity);
                    return (
                      <tr key={a.id} className={`${i%2===0?'bg-[#111827]':'bg-[#0D1117]'} hover:bg-[#1A2235] cursor-pointer transition-colors`}
                        onClick={()=>{ setSelected(a); setMainTab('live'); }}>
                        <td className="px-4 py-3 font-mono text-[#64748B]">{fmtTime(a.created_at)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-[#4DD9AC]">{a.shipCode}</td>
                        <td className="px-4 py-3">
                          <span style={{color}}>{a.typeIcon} {a.alertType}</span>
                        </td>
                        <td className="px-4 py-3 text-[#94A3B8]">{a.driver.split(' ').slice(0,2).join(' ')}</td>
                        <td className="px-4 py-3 text-[#64748B]">{a.channel}</td>
                        <td className="px-4 py-3">
                          {a.acknowledged ? <span className="text-[#34D399]">✅ Read</span> : <span className="text-[#EF4444]">🔴 Unread</span>}
                        </td>
                        <td className="px-4 py-3">
                          {a.resolved ? <span className="text-[#34D399]">✅ Resolved</span>
                          : a.escalated ? <span className="text-[#A78BFA]">🚨 Escalated</span>
                          : a.acknowledged ? <span className="text-[#60A5FA]">⏳ In Progress</span>
                          : <span className="text-[#F87171]">Pending</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-[9px] text-[#64748B] border border-[#1E2530] px-2 py-1 rounded hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 transition-colors">
                            View →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'templates' && (
        <div className="flex-1 overflow-y-auto"><TemplateTab/></div>
      )}

      {mainTab === 'escalation' && (
        <div className="flex-1 overflow-y-auto"><EscalationTab/></div>
      )}
    </div>
  );
}
