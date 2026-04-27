import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getShipments, getSensorHistory, getRiskEvents, sendTestAlert, type Shipment, type SensorReading, type RiskEvent } from '../../lib/api';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { AxonRouteMap } from '../../components/AxonRouteMap';

// ── Helpers ────────────────────────────────────────────────────────────────────
const PRODUCT_ICONS: Record<string, string> = {
  dairy:'🥛', milk:'🥛', seafood:'🐟', fish:'🐟', produce:'🥦',
  vegetables:'🥦', frozen:'🧊', pharma:'💊', fruits:'🍎', meat:'🥩', other:'📦',
};
function pIcon(t?: string) { return PRODUCT_ICONS[t?.toLowerCase() ?? ''] ?? '📦'; }

function getRiskColor(cat?: string): string {
  const c = cat?.toUpperCase();
  return c === 'CRITICAL' ? '#EF4444' : c === 'HIGH' ? '#F97316' : c === 'MEDIUM' ? '#FBBF24' : '#34D399';
}
function getRiskCat(s: Shipment): string {
  return s.current_risk?.risk_category?.toUpperCase() ?? 'LOW';
}
function getRiskScore(s: Shipment): number {
  return Math.round(s.current_risk?.risk_score ?? 0);
}

const TEMP_BANDS: Record<string, [number, number]> = {
  dairy:[2,6], milk:[2,6], seafood:[0,4], fish:[0,4], pharma:[2,8],
  frozen:[-20,-15], produce:[4,10], fruits:[5,12], meat:[0,4], other:[2,8],
};
function getTempBand(type?: string): [number, number] {
  return TEMP_BANDS[type?.toLowerCase() ?? ''] ?? [2,8];
}

function fmtTime(iso?: string|null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
function fmtSpoil(mins?: number) {
  if (!mins) return '—';
  const h = Math.floor(mins/60), m = mins%60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ── SVG Live Map ───────────────────────────────────────────────────────────────
function LiveMap({
  shipment, progress, sensors, playbackPos, isPlayback, showLayers, fullscreen, onFullscreen,
}: {
  shipment: Shipment; progress: number; sensors: SensorReading[];
  playbackPos: number; isPlayback: boolean; showLayers: Record<string,boolean>;
  fullscreen: boolean; onFullscreen: () => void;
}) {
  const [truckAnim, setTruckAnim] = useState(progress);
  const animRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const target = isPlayback ? playbackPos : progress;
    clearInterval(animRef.current);
    animRef.current = setInterval(() => {
      setTruckAnim(prev => {
        if (Math.abs(prev - target) < 0.5) { clearInterval(animRef.current); return target; }
        return prev + (target - prev) * 0.04;
      });
    }, 60);
    return () => clearInterval(animRef.current);
  }, [progress, playbackPos, isPlayback]);

  const riskCat   = getRiskCat(shipment);
  const riskColor = getRiskColor(riskCat);
  const [tMin, tMax] = getTempBand(shipment.product_type);
  const latestTemp    = sensors[0]?.temperature;
  const isBreach      = latestTemp !== undefined && latestTemp > tMax;

  const W = 800, H = 340;
  // Bezier control points for NE India hill route shape
  const ox = 80, oy = 180;
  const dx = 720, dy = 120;
  const cx1 = 220, cy1 = 80;
  const cx2 = 580, cy2 = 200;

  // Quadratic bezier position at t
  function bezier(t: number): [number, number] {
    const u = 1 - t;
    const x = u*u*u*ox + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*dx;
    const y = u*u*u*oy + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*dy;
    return [x, y];
  }

  const truckPct = truckAnim / 100;
  const [tx, ty] = bezier(truckPct);

  // Checkpoint at 50%
  const [cpx, cpy] = bezier(0.5);
  const cpReached   = truckAnim >= 50;

  // Alternate route (offset)
  const altD = `M ${tx} ${ty} Q ${(tx + dx) / 2} ${Math.min(ty, dy) - 60} ${dx} ${dy}`;

  return (
    <div className="relative w-full h-full bg-[#080B12]">
      {/* Grid backdrop */}
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {Array.from({length:18}).map((_,i)=><line key={`h${i}`} x1={0} y1={i*20} x2={W} y2={i*20} stroke="#1E2530" strokeWidth="0.5"/>)}
        {Array.from({length:42}).map((_,i)=><line key={`v${i}`} x1={i*20} y1={0} x2={i*20} y2={H} stroke="#1E2530" strokeWidth="0.5"/>)}
      </svg>

      {/* Risk heatmap overlay */}
      {showLayers.riskHeatmap && riskCat !== 'LOW' && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 60% 50% at ${(tx/W*100).toFixed(0)}% ${(ty/H*100).toFixed(0)}%, ${riskColor}18 0%, transparent 70%)`,
        }}/>
      )}

      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {/* Full route ghost */}
        <path d={`M ${ox} ${oy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${dx} ${dy}`}
          fill="none" stroke="#1E2530" strokeWidth="5" strokeLinecap="round"/>

        {/* Completed route — teal solid */}
        {truckAnim > 0 && (
          <path d={`M ${ox} ${oy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${dx} ${dy}`}
            fill="none" stroke="#4DD9AC" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${truckAnim * 8} 10000`} opacity="0.9"/>
        )}

        {/* Remaining route — dashed blue */}
        <path d={`M ${tx} ${ty} C ${cx2} ${cy2}, ${dx} ${dy}, ${dx} ${dy}`}
          fill="none" stroke="rgba(96,165,250,0.6)" strokeWidth="3"
          strokeDasharray="8 6" strokeLinecap="round"/>

        {/* Alternate route (if risk HIGH+) */}
        {showLayers.altRoute && (riskCat === 'HIGH' || riskCat === 'CRITICAL') && (
          <path d={altD} fill="none" stroke="rgba(251,191,36,0.6)" strokeWidth="3"
            strokeDasharray="6 5" strokeLinecap="round"/>
        )}

        {/* Cold hub pins */}
        {showLayers.coldHubs && (
          <>
            <circle cx={380} cy={145} r="8" fill="#0D1A2E" stroke="#60A5FA" strokeWidth="1.5"/>
            <text x={380} y={149} textAnchor="middle" fontSize="8" fill="#60A5FA">🏭</text>
            <text x={380} y={162} textAnchor="middle" fontSize="7" fill="#60A5FA">Cold Hub</text>
          </>
        )}

        {/* Checkpoint marker */}
        {showLayers.checkpoints && (
          <>
            <polygon points={`${cpx},${cpy-10} ${cpx+9},${cpy+5} ${cpx-9},${cpy+5}`}
              fill={cpReached ? '#A78BFA' : '#1E2530'} stroke="#A78BFA" strokeWidth="1.5"
              opacity={cpReached ? 1 : 0.5}/>
            <text x={cpx} y={cpy - 16} textAnchor="middle" fontSize="8" fill="#A78BFA">Checkpoint</text>
          </>
        )}

        {/* Origin pin */}
        <circle cx={ox} cy={oy} r="12" fill="#0D1117" stroke="#4DD9AC" strokeWidth="2"/>
        <text x={ox} y={oy+4} textAnchor="middle" fontSize="10">🏭</text>
        <rect x={ox-28} y={oy+18} width={56} height={16} rx="3" fill="#0D1117" stroke="#1E2530" strokeWidth="1"/>
        <text x={ox} y={oy+30} textAnchor="middle" fontSize="8" fill="#64748B">
          {shipment.origin?.split(',')[0]?.slice(0,10) ?? 'Origin'}
        </text>

        {/* Destination pin */}
        <circle cx={dx} cy={dy} r="12" fill="#0D1117" stroke={progress >= 100 ? '#34D399' : '#EF4444'} strokeWidth="2"/>
        <text x={dx} y={dy+4} textAnchor="middle" fontSize="10">{progress >= 100 ? '✅' : '📍'}</text>
        <rect x={dx-30} y={dy+18} width={60} height={16} rx="3" fill="#0D1117" stroke="#1E2530" strokeWidth="1"/>
        <text x={dx} y={dy+30} textAnchor="middle" fontSize="8" fill="#64748B">
          {shipment.destination?.split(',')[0]?.slice(0,10) ?? 'Destination'}
        </text>

        {/* ETA chip near destination */}
        {shipment.expected_arrival && (
          <>
            <rect x={dx-25} y={dy-32} width={50} height={14} rx="4" fill="#FBBF24" opacity="0.9"/>
            <text x={dx} y={dy-22} textAnchor="middle" fontSize="7" fill="#003829" fontWeight="bold">
              ETA: {fmtTime(shipment.expected_arrival)}
            </text>
          </>
        )}

        {/* Animated truck */}
        {progress < 100 && (
          <g transform={`translate(${tx}, ${ty})`}>
            {/* Pulse ring */}
            <circle cx={0} cy={0} r={16} fill={riskColor} opacity={0.15}>
              <animate attributeName="r" values="14;20;14" dur="2s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite"/>
            </circle>
            {/* Glow */}
            <circle cx={0} cy={0} r={11} fill="#0D1117" stroke={riskColor} strokeWidth="2.5"
              style={{ filter: `drop-shadow(0 0 8px ${riskColor}80)` }}/>
            <text x={0} y={4} textAnchor="middle" fontSize="10">🚛</text>

            {/* Label bubble */}
            <g transform="translate(14, -24)">
              <rect x={0} y={0} width={82} height={20} rx="4" fill="#0D1117" stroke={riskColor} strokeWidth="1.2"/>
              <text x={6} y={13} fontSize="7.5" fill="#F1F5F9" fontFamily="monospace" fontWeight="bold">
                {shipment.shipment_code}
              </text>
              {latestTemp !== undefined && (
                <text x={48} y={13} fontSize="7.5" fill={isBreach ? '#F87171' : '#34D399'}>
                  {latestTemp.toFixed(1)}°{isBreach ? '🔴' : '✅'}
                </text>
              )}
            </g>

            {/* Speed indicator */}
            <g transform="translate(-60, 16)">
              <rect x={0} y={0} width={50} height={14} rx="3" fill="#111827" stroke="#1E2530" strokeWidth="1"/>
              <text x={4} y={10} fontSize="7" fill="#64748B">~48 km/h</text>
            </g>
          </g>
        )}

        {/* Delivered stamp */}
        {progress >= 100 && (
          <g transform={`translate(${W/2-60}, ${H/2-20})`}>
            <rect x={0} y={0} width={120} height={40} rx="8" fill="#0F1F17" stroke="#34D399" strokeWidth="2"/>
            <text x={60} y={26} textAnchor="middle" fontSize="13" fill="#34D399" fontWeight="bold">✅ DELIVERED</text>
          </g>
        )}
      </svg>

      {/* Map overlay controls */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <div className="bg-[#0D1117]/90 backdrop-blur border border-[#1E2530] rounded px-3 py-2">
          <div className="text-[9px] text-[#4DD9AC] font-mono tracking-widest mb-0.5">GPS LOCK: ACQUIRED</div>
          <div className="text-[11px] text-[#94A3B8]">{shipment.origin?.split(',')[0]} → {shipment.destination?.split(',')[0]}</div>
        </div>
        {isPlayback && (
          <div className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 rounded px-3 py-1.5">
            <div className="text-[9px] text-[#60A5FA] font-bold tracking-widest">▶ PLAYBACK MODE · {Math.round(playbackPos)}%</div>
          </div>
        )}
      </div>

      {/* Map controls top-right */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button onClick={onFullscreen} className="bg-[#0D1117]/90 backdrop-blur border border-[#1E2530] text-[#64748B] hover:text-white p-1.5 rounded transition-colors text-xs">
          {fullscreen ? '⤡' : '⤢'}
        </button>
      </div>

      {/* Risk badge if critical */}
      {(riskCat === 'CRITICAL' || riskCat === 'HIGH') && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse"
          style={{ background: `${riskColor}18`, border: `1px solid ${riskColor}50`, color: riskColor }}>
          <span className="w-2 h-2 rounded-full" style={{ background: riskColor }}/>
          {riskCat} RISK — {sensors[0]?.delay_minutes ? `+${sensors[0].delay_minutes} min delay` : 'Monitoring active'}
        </div>
      )}
    </div>
  );
}

// ── Stage Rail ─────────────────────────────────────────────────────────────────
const JOURNEY_STAGES = [
  { key:'created',     label:'Created',              icon:'📋' },
  { key:'picked',      label:'Pickup Scheduled',     icon:'📅' },
  { key:'loaded',      label:'Loaded & Sealed',      icon:'🔒' },
  { key:'departed',    label:'Departed Origin',      icon:'🚀' },
  { key:'transit',     label:'In Transit',           icon:'🚛', active:true },
  { key:'checkpoint',  label:'Midpoint Checkpoint',  icon:'⬡' },
  { key:'approaching', label:'Near Destination',     icon:'📍' },
  { key:'delivered',   label:'Delivered',            icon:'✅' },
];

function StageRail({ shipment, progress, sensors }: { shipment: Shipment; progress: number; sensors: SensorReading[] }) {
  const [popup, setPopup] = useState<string|null>(null);
  const latestSensor = sensors[sensors.length - 1];

  const completedKeys = progress >= 100
    ? JOURNEY_STAGES.map(s => s.key)
    : progress >= 70
      ? ['created','picked','loaded','departed','transit','checkpoint']
      : progress >= 50
        ? ['created','picked','loaded','departed','transit','checkpoint']
        : ['created','picked','loaded','departed','transit'];

  const activeKey = progress >= 100 ? 'delivered' : 'transit';

  const eventDetails: Record<string, { time?: string; detail: string }> = {
    created:    { time: fmtTime(shipment.created_at as any), detail: `Code: ${shipment.shipment_code} · System created` },
    picked:     { time: fmtTime(shipment.created_at as any), detail: `Driver: ${shipment.driver_phone ?? 'Assigned'}` },
    loaded:     { time: latestSensor ? fmtTime(latestSensor.recorded_at) : '--:--', detail: `${shipment.product_qty ? `${shipment.product_qty} ${shipment.product_unit}` : 'Cargo'} loaded · Cold seal applied` },
    departed:   { time: fmtTime(shipment.expected_departure as any) ?? '--:--', detail: `Route locked: NH-6 via Jorabat` },
    transit:    { time: '--:--', detail: `${progress}% complete · Next: Meghalaya Border checkpoint` },
    checkpoint: { time: '--:--', detail: `Midpoint reached · All sensors nominal` },
    approaching:{ time: '--:--', detail: `Within 20 km of destination` },
    delivered:  { time: fmtTime(shipment.expected_arrival as any) ?? '--:--', detail: 'Delivered & confirmed' },
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 relative">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-[#1E2530] z-0"/>

        <div className="space-y-1">
          {JOURNEY_STAGES.map((stage, i) => {
            const isDone   = completedKeys.includes(stage.key) && stage.key !== activeKey;
            const isActive = stage.key === activeKey;
            const isPending = !isDone && !isActive;
            const isOpen   = popup === stage.key;

            const dotColor = isDone ? '#4DD9AC' : isActive ? '#60A5FA' : '#374151';
            const lineColor = isDone ? '#4DD9AC' : '#1E2530';

            return (
              <div key={stage.key} className="relative pl-8">
                {/* Vertical connector line segment */}
                {i < JOURNEY_STAGES.length - 1 && (
                  <div className="absolute left-[11px] top-5 h-full w-px z-0" style={{ background: lineColor, opacity: isDone ? 0.8 : 0.3 }}/>
                )}

                {/* Dot */}
                <div className="absolute left-0 top-2 z-10">
                  {isActive ? (
                    <div className="relative">
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#60A5FA', background: '#0D1117' }}>
                        <div className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]"/>
                      </div>
                      <div className="absolute -inset-2 rounded-full bg-[#60A5FA] opacity-20 animate-ping"/>
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                      style={{ borderColor: dotColor, background: isDone ? dotColor : '#0D1117' }}>
                      {isDone && <span className="text-[8px] text-[#003829] font-black">✓</span>}
                    </div>
                  )}
                </div>

                {/* Content */}
                <button
                  onClick={() => setPopup(isOpen ? null : stage.key)}
                  disabled={isPending}
                  className={`w-full text-left py-2 px-2 rounded-lg transition-all ${!isPending ? 'hover:bg-[#111827] cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${isActive ? 'text-[#60A5FA]' : isDone ? 'text-[#F1F5F9]' : 'text-[#374151]'}`}>
                      {stage.icon} {stage.label}
                    </span>
                    {isActive && (
                      <span className="text-[9px] bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 px-1.5 py-0.5 rounded-full font-bold">
                        YOU ARE HERE
                      </span>
                    )}
                  </div>
                  {(isDone || isActive) && eventDetails[stage.key] && (
                    <div className="text-[10px] text-[#64748B] mt-0.5">{eventDetails[stage.key].time}</div>
                  )}
                </button>

                {/* Event popup */}
                {isOpen && !isPending && (
                  <div className="bg-[#111827] border border-[#1E2530] rounded-lg p-3 mb-2 text-xs">
                    <div className="font-semibold text-[#F1F5F9] mb-1">{stage.icon} {stage.label}</div>
                    {eventDetails[stage.key]?.time && (
                      <div className="text-[#4DD9AC] font-mono mb-1">{eventDetails[stage.key].time}</div>
                    )}
                    <div className="text-[#94A3B8] leading-relaxed">{eventDetails[stage.key]?.detail}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Telemetry sparkline ────────────────────────────────────────────────────────
function MiniSparkline({ sensors, tMin, tMax }: { sensors: SensorReading[]; tMin: number; tMax: number }) {
  if (sensors.length < 2) return <div className="h-16 flex items-center justify-center text-[#4A5568] text-xs">No data</div>;
  const pts = [...sensors].reverse();
  const temps = pts.map(r => r.temperature ?? 0);
  const vMin = Math.min(...temps, tMin - 1);
  const vMax = Math.max(...temps, tMax + 3);
  const W = 220, H = 56;
  const tx = (i: number) => (i / (pts.length - 1)) * W;
  const ty = (t: number) => H - ((t - vMin) / (vMax - vMin)) * H;
  const d = pts.map((r, i) => `${i === 0 ? 'M' : 'L'}${tx(i)} ${ty(r.temperature ?? 0)}`).join(' ');
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const safeY1 = ty(tMax), safeY2 = ty(tMin);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <rect x={0} y={safeY1} width={W} height={safeY2 - safeY1} fill="rgba(52,211,153,0.08)"/>
      <line x1={0} y1={safeY1} x2={W} y2={safeY1} stroke="#34D399" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5"/>
      <path d={area} fill="url(#spark)" opacity="0.2"/>
      <path d={d} fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinejoin="round"/>
      {pts.some(r => (r.temperature ?? 0) > tMax) && (
        <rect x={0} y={0} width={W} height={safeY1} fill="rgba(239,68,68,0.06)"/>
      )}
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA"/>
          <stop offset="100%" stopColor="transparent"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Playback bar ───────────────────────────────────────────────────────────────
function PlaybackBar({
  riskEvents, sensors, playbackPos, onScrub, isPlaying, onTogglePlay, speed, onSpeedChange, onExit,
}: {
  riskEvents: RiskEvent[]; sensors: SensorReading[]; playbackPos: number;
  onScrub: (v: number) => void; isPlaying: boolean; onTogglePlay: () => void;
  speed: number; onSpeedChange: (v: number) => void; onExit: () => void;
}) {
  // Event markers for risk events as pct of timeline
  const events = riskEvents.filter(r => r.created_at).map(re => {
    const allTimes = sensors.filter(s => s.recorded_at).map(s => new Date(s.recorded_at!).getTime());
    if (!allTimes.length) return null;
    const t    = new Date(re.created_at!).getTime();
    const mi   = Math.min(...allTimes), ma = Math.max(...allTimes);
    const pct  = ma > mi ? Math.round(((t - mi) / (ma - mi)) * 100) : 50;
    const cat  = re.risk_category?.toUpperCase();
    return { pct: Math.min(100, Math.max(0, pct)), label: `${cat} risk`, color: getRiskColor(cat) };
  }).filter(Boolean);

  return (
    <div className="shrink-0 bg-[#111827] border-t border-[#1E2530] px-6 py-3">
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#60A5FA] font-bold tracking-widest">▶ PLAYBACK</span>
          <button onClick={onExit} className="text-[9px] text-[#64748B] hover:text-[#F87171] border border-[#1E2530] px-2 py-0.5 rounded ml-2 transition-colors">[EXIT]</button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => onScrub(Math.max(0, playbackPos - 10))} className="text-[#64748B] hover:text-white transition-colors text-sm">⏮</button>
          <button onClick={onTogglePlay} className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isPlaying ? 'bg-[#60A5FA] text-[#001833]' : 'bg-[#1E2530] text-[#60A5FA]'}`}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => onScrub(Math.min(100, playbackPos + 10))} className="text-[#64748B] hover:text-white transition-colors text-sm">⏭</button>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1">
          {[1, 2, 5].map(s => (
            <button key={s} onClick={() => onSpeedChange(s)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${speed===s?'bg-[#60A5FA]/10 border-[#60A5FA]/30 text-[#60A5FA]':'border-[#1E2530] text-[#64748B]'}`}>
              {s}x
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs font-mono text-[#94A3B8]">
          {Math.round(playbackPos)}% of journey
        </div>
      </div>

      {/* Scrubber */}
      <div className="relative">
        {/* Event markers */}
        {events.map((ev, i) => ev && (
          <div key={i} className="absolute top-0 -translate-x-1/2 -translate-y-3 z-10" style={{ left: `${ev.pct}%` }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ev.color }}/>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] whitespace-nowrap" style={{ color: ev.color }}>{ev.label}</div>
          </div>
        ))}
        <input type="range" min="0" max="100" step="0.5" value={playbackPos}
          onChange={e => onScrub(parseFloat(e.target.value))}
          className="w-full accent-[#60A5FA]" style={{ height: '6px' }}/>
        <div className="flex justify-between text-[9px] text-[#4A5568] mt-1">
          <span>Start</span><span>50%</span><span>End</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function LiveTracking() {
  const navigate = useNavigate();

  const [shipments,  setShipments]  = useState<Shipment[]>([]);
  const [selected,   setSelected]   = useState<Shipment|null>(null);
  const [sensors,    setSensors]    = useState<SensorReading[]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(true);

  // Playback
  const [isPlayback,    setIsPlayback]    = useState(false);
  const [playbackPos,   setPlaybackPos]   = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [playSpeed,     setPlaySpeed]     = useState(1);

  // Layers
  const [showLayers, setShowLayers] = useState({ riskHeatmap:true, altRoute:true, coldHubs:true, checkpoints:true });
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [fullscreen,  setFullscreen]  = useState(false);

  // Actions
  const [toasts, setToasts] = useState<Array<{id:string;msg:string;type:'ok'|'warn'}>>([]);
  const [actionDone, setActionDone] = useState<Set<string>>(new Set());

  const pollRef     = useRef<ReturnType<typeof setInterval>>(undefined);
  const playRef     = useRef<ReturnType<typeof setInterval>>(undefined);
  const loadingOnce = useRef(false);

  const toast = (msg: string, type: 'ok'|'warn' = 'ok') => {
    const tid = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id:tid, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 3500);
  };

  const fetchShipments = useCallback(async () => {
    try {
      const data = await getShipments('active');
      setShipments(data);
      if (!loadingOnce.current && data.length > 0) {
        setSelected(data[0]);
        loadingOnce.current = true;
      }
      setConnected(true);
    } catch { setConnected(false); }
    finally { setLoading(false); }
  }, []);

  const fetchDetail = useCallback(async (ship: Shipment) => {
    try {
      const [sr, re] = await Promise.all([getSensorHistory(ship.id), getRiskEvents(ship.id)]);
      setSensors(sr);
      setRiskEvents(re);
    } catch { /* silent */ }
  }, []);

  const { data: rtActiveShipments } = useRealtimeData<any>('/active_shipments');
  // Live position/ETA/telemetry from the telemetry pipeline RTDB path
  const selectedCode = selected?.shipment_code ?? '';
  const { data: rtLive } = useRealtimeData<any>(
    selectedCode ? `/live_tracking/${selectedCode}` : null as any
  );

  const displayShipments = React.useMemo(() => {
    if (!rtActiveShipments) return shipments;
    return shipments.map(ship => {
      const rt = rtActiveShipments[ship.shipment_code];
      if (!rt) return ship;
      return {
        ...ship,
        status: rt.stage === 'IN_TRANSIT' ? 'active' : rt.stage.toLowerCase(),
        current_risk: {
          ...ship.current_risk,
          risk_score: rt.risk_score / 100,
          risk_category: rt.risk_category,
          time_to_spoil_minutes: rt.spoilage_window_min,
        }
      } as Shipment;
    });
  }, [shipments, rtActiveShipments]);

  useEffect(() => {
    fetchShipments();
    // Polling removed in favor of Firebase RTDB
  }, [fetchShipments]);

  useEffect(() => {
    if (selected) fetchDetail(selected);
    const t = setInterval(() => { if (selected) fetchDetail(selected); }, 12000);
    return () => clearInterval(t);
  }, [selected, fetchDetail]);

  // Playback ticker
  useEffect(() => {
    clearInterval(playRef.current);
    if (isPlayback && isPlaying) {
      playRef.current = setInterval(() => {
        setPlaybackPos(p => { if (p >= 100) { setIsPlaying(false); return 100; } return p + 0.3 * playSpeed; });
      }, 100);
    }
    return () => clearInterval(playRef.current);
  }, [isPlayback, isPlaying, playSpeed]);

  useEffect(() => { window.addEventListener('click', () => setShowLayerMenu(false)); return () => window.removeEventListener('click', () => setShowLayerMenu(false)); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#080B12] text-[#4DD9AC]" style={{fontFamily:'Inter,sans-serif'}}>
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#4DD9AC]/20 border-t-[#4DD9AC] rounded-full animate-spin mx-auto mb-3"/>
        <div className="text-sm text-[#64748B]">Acquiring GPS lock...</div>
      </div>
    </div>
  );

  const s           = selected ? displayShipments.find(x => x.id === selected.id) || selected : null;
  const riskCat     = s ? getRiskCat(s) : 'LOW';
  const riskColor   = getRiskColor(riskCat);
  const riskScore   = s ? getRiskScore(s) : 0;
  const latestSensor = sensors[0];
  const [tMin, tMax] = s ? getTempBand(s.product_type) : [2,8];
  const isBreach     = (latestSensor?.temperature ?? 0) > tMax;

  const tempColor = !isBreach ? '#34D399' : riskCat === 'CRITICAL' ? '#EF4444' : '#FBBF24';

  // ── Live values from RTDB pipeline (override statics when available) ────────
  const liveProgress   = rtLive?.progress_pct   ?? (s?.status === 'delivered' || s?.status === 'completed' ? 100
    : s?.status === 'active' ? 52 : s?.status === 'loaded' ? 15 : 5);
  const liveEtaMin     = rtLive?.eta_min;
  const liveRemKm      = rtLive?.remaining_km   ?? Math.round((100 - liveProgress) * 2.14);
  const liveTravelKm   = rtLive ? Math.round((rtLive.progress_pct ?? 0) / 100 * (liveRemKm + (rtLive.progress_pct / 100 * 200))) : Math.round(liveProgress * 2.14);
  const liveBattery    = rtLive?.battery_pct    != null ? `${Math.round(rtLive.battery_pct)}%` : '78%';
  const liveDoor       = rtLive?.door_status    ?? 'Closed';
  const liveSpeed      = rtLive?.speed_kmh      != null ? `${Math.round(rtLive.speed_kmh)} km/h` : '—';
  const liveSilence    = rtLive?.silence_alert   ?? false;
  const liveHumidity   = rtLive?.humidity       ?? latestSensor?.humidity;
  const liveAmbient    = latestSensor?.ambient_temp;
  const liveStage      = rtLive?.stage          ?? s?.status?.toUpperCase() ?? 'IN_TRANSIT';

  const progress = isPlayback ? playbackPos : liveProgress;

  function doAction(key: string, label: string, fn?: () => void) {
    setActionDone(a => new Set([...a, key]));
    toast(`${label}`);
    fn?.();
    setTimeout(() => setActionDone(a => { const n = new Set(a); n.delete(key); return n; }), 4000);
  }

  return (
    <div className={`flex flex-col bg-[#080B12] text-[#F1F5F9] overflow-hidden ${fullscreen ? 'fixed inset-0 z-50' : 'h-screen'}`} style={{ fontFamily:'Inter,sans-serif' }}>

      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl ${t.type==='ok'?'bg-[#0D2B22] border border-[#4DD9AC]/40 text-[#4DD9AC]':'bg-[#2B0D0D] border border-[#EF4444]/40 text-[#F87171]'}`}
            style={{animation:'slideIn 0.3s ease'}}>{t.msg}</div>
        ))}
      </div>

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-14 bg-[#0A0D14] border-b border-[#1E2530] flex items-center px-4 gap-4 z-40">
        <div className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono cursor-pointer" onClick={()=>navigate('/dashboard')}>AXON</div>
        <div className="h-5 w-px bg-[#1E2530]"/>
        <div className="text-sm text-[#64748B] flex items-center gap-2">
          <span className="text-[#4DD9AC]">📡</span> Live Tracking
        </div>
        <div className="flex-1"/>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#34D399] animate-pulse' : 'bg-[#EF4444]'}`}/>
          <span className={connected ? 'text-[#34D399]' : 'text-[#EF4444]'}>{connected ? 'LIVE · GPS ACTIVE' : 'RECONNECTING...'}</span>
        </div>
        {/* Layers control */}
        <div className="relative">
          <button onClick={e=>{e.stopPropagation();setShowLayerMenu(v=>!v);}}
            className="text-xs bg-[#111827] border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1.5">
            🗺 Layers
          </button>
          {showLayerMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#0D1117] border border-[#1E2530] rounded-lg py-1 min-w-[180px] z-30 shadow-2xl" onClick={e=>e.stopPropagation()}>
              {Object.entries({ riskHeatmap:'Risk Heatmap', altRoute:'Alternate Route', coldHubs:'Cold Hub Pins', checkpoints:'Checkpoint Markers' }).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 px-4 py-2 text-xs text-[#CBD5E1] hover:bg-[#1E2530] cursor-pointer">
                  <input type="checkbox" checked={showLayers[k as keyof typeof showLayers]} onChange={e=>setShowLayers(l=>({...l,[k]:e.target.checked}))} className="accent-[#4DD9AC]"/>
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* Playback toggle */}
        <button onClick={() => { setIsPlayback(p => { if (!p) { setPlaybackPos(0); setIsPlaying(false); } return !p; }); }}
          className={`text-xs px-3 py-1.5 rounded border font-medium transition-all ${isPlayback ? 'bg-[#60A5FA]/10 border-[#60A5FA]/40 text-[#60A5FA]' : 'bg-[#111827] border-[#1E2530] text-[#64748B] hover:text-white'}`}>
          {isPlayback ? '⏹ Live Mode' : '▶ Playback'}
        </button>
        <button onClick={()=>navigate('/active-shipments')} className="text-xs text-[#64748B] hover:text-[#CBD5E1] border border-[#1E2530] px-3 py-1.5 rounded transition-colors">← Shipments</button>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Multi-shipment selector + Stage rail ────────────────── */}
        <aside className="w-56 shrink-0 bg-[#0D1117] border-r border-[#1E2530] flex flex-col overflow-hidden">

          {/* Shipment selector */}
          <div className="shrink-0 border-b border-[#1E2530]">
            <div className="px-3 py-2 text-[10px] text-[#64748B] uppercase tracking-widest font-semibold flex items-center justify-between">
              <span>Active Shipments</span>
              <span className="bg-[#1E2530] text-[#94A3B8] px-1.5 py-0.5 rounded-full text-[9px]">{displayShipments.length}</span>
            </div>
            <div className="overflow-y-auto max-h-44">
              {displayShipments.length === 0 ? (
                <div className="text-center text-[#4A5568] text-xs py-4">No active shipments</div>
              ) : displayShipments.map(ship => {
                const cat   = getRiskCat(ship);
                const col   = getRiskColor(cat);
                const isSel = selected?.id === ship.id;
                return (
                  <button key={ship.id} onClick={() => setSelected(ship)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[#1E2530] transition-all ${isSel ? 'bg-[#4DD9AC]/5 border-l-2 border-l-[#4DD9AC]' : 'hover:bg-[#111827]'}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs font-bold text-[#F1F5F9]">{ship.shipment_code}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: col, background:`${col}15` }}>{cat}</span>
                    </div>
                    <div className="text-[10px] text-[#64748B]">
                      {pIcon(ship.product_type)} {ship.origin?.split(',')[0]} → {ship.destination?.split(',')[0]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stage tracker title */}
          {s && (
            <>
              <div className="shrink-0 px-3 py-2 border-b border-[#1E2530]">
                <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-0.5">Journey</div>
                <div className="font-mono text-xs font-bold text-[#4DD9AC]">{s.shipment_code}</div>
                <div className="text-[10px] text-[#94A3B8]">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
              </div>
              <StageRail shipment={s} progress={progress} sensors={sensors}/>
            </>
          )}
        </aside>

        {/* ── CENTER + RIGHT ─────────────────────────────────────────────── */}
        <div className="flex flex-1 min-w-0 overflow-hidden">

          {/* Center: Map + progress bar + action bar */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* MAP — fills most of center */}
            <div className="flex-1 min-h-0 relative">
              {s ? (
                <>
                  <AxonRouteMap 
                    originLat={s.origin_lat || undefined}
                    originLng={s.origin_lng || undefined}
                    destLat={s.dest_lat || undefined}
                    destLng={s.dest_lng || undefined}
                    originName={s.origin || 'Origin'}
                    destName={s.destination || 'Destination'}
                    routeData={null}
                    className="w-full h-full"
                  />
                  {/* Map overlay controls */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
                    <div className="bg-[#0D1117]/90 backdrop-blur border border-[#1E2530] rounded px-3 py-2">
                      <div className="text-[9px] text-[#4DD9AC] font-mono tracking-widest mb-0.5">GPS LOCK: ACQUIRED</div>
                      <div className="text-[11px] text-[#94A3B8]">{s.origin?.split(',')[0]} → {s.destination?.split(',')[0]}</div>
                    </div>
                    {isPlayback && (
                      <div className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 rounded px-3 py-1.5">
                        <div className="text-[9px] text-[#60A5FA] font-bold tracking-widest">▶ PLAYBACK MODE · {Math.round(playbackPos)}%</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Fullscreen control top-right */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                    <button onClick={() => setFullscreen(f=>!f)} className="bg-[#0D1117]/90 backdrop-blur border border-[#1E2530] text-[#64748B] hover:text-white p-1.5 rounded transition-colors text-xs pointer-events-auto">
                      {fullscreen ? '⤡' : '⤢'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-[#4A5568] text-sm">Select a shipment to track</div>
              )}
            </div>

            {/* Route progress bar */}
            {s && (
              <div className="shrink-0 bg-[#0D1117] border-t border-[#1E2530] px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-[#64748B]">
                    <span className="font-mono text-[#F1F5F9] font-semibold">{s.origin?.split(',')[0]}</span>
                    <span className="mx-2 text-[#374151]">──────</span>
                    <span className="font-mono text-[#94A3B8]">🚛 {progress.toFixed(1)}%</span>
                    <span className="mx-2 text-[#374151]">──────</span>
                    <span className="font-mono text-[#F1F5F9] font-semibold">{s.destination?.split(',')[0]}</span>
                  </div>
                  <div className={`text-xs font-bold px-3 py-1 rounded-full ${
                    liveEtaMin ? 'bg-[#4DD9AC]/10 text-[#4DD9AC]'
                    : sensors[0]?.delay_minutes && sensors[0].delay_minutes > 30 ? 'bg-[#EF4444]/10 text-[#F87171]'
                    : sensors[0]?.delay_minutes ? 'bg-[#FBBF24]/10 text-[#FBBF24]'
                    : 'bg-[#34D399]/10 text-[#34D399]'
                  }`}>
                    {liveEtaMin
                      ? `⏱ ETA: ${Math.floor(liveEtaMin / 60)}h ${liveEtaMin % 60}m`
                      : sensors[0]?.delay_minutes ? `⏰ +${sensors[0].delay_minutes} min delay`
                      : `✅ ETA: ${fmtTime(s.expected_arrival)}`}
                  </div>
                </div>
                <div className="h-3 bg-[#1E2530] rounded-full overflow-hidden relative">
                  <div className="h-full bg-gradient-to-r from-[#4DD9AC] to-[#6EF6C7] rounded-full transition-all duration-1000 relative" style={{ width:`${progress}%` }}>
                    <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-white/30 via-transparent"/>
                  </div>
                  {/* Truck marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-1000" style={{ left:`${progress}%` }}>
                    <div className="w-5 h-5 rounded-full bg-[#4DD9AC] border-2 border-[#0D1117] flex items-center justify-center text-[8px]">🚛</div>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-[#4A5568] mt-1">
                   <span>{Math.round(liveTravelKm)} km done</span>
                   <span>{Math.round(liveRemKm)} km remaining</span>
                 </div>
              </div>
            )}

            {/* Intervention action bar */}
            {s && (
              <div className="shrink-0 bg-[#0A0D14] border-t border-[#1E2530] px-4 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-[#64748B] uppercase tracking-widest mr-2">Quick Actions</span>
                {[
                  { k:'alert',   l:'⚠️ Alert Driver',   color:'#EF4444', fn:async()=>{ if(s.driver_phone){try{await sendTestAlert(s.driver_phone,s.id)}catch{}}doAction('alert','⚠️ Alert sent to driver','ok' as any)} },
                  { k:'call',    l:'📞 Call',            color:'#60A5FA', fn:()=>doAction('call','📞 Calling driver...') },
                  { k:'whatsapp',l:'💬 WhatsApp',        color:'#34D399', fn:()=>doAction('whatsapp','💬 WhatsApp sent') },
                  { k:'escalate',l:'🚨 Escalate',        color:'#F97316', fn:()=>doAction('escalate','🚨 Escalated to supervisor','warn' as any) },
                  { k:'reroute', l:'🛣️ Reroute',         color:'#A78BFA', fn:()=>doAction('reroute','🛣️ Reroute suggestion sent') },
                  { k:'coldhub', l:'🏭 Cold Hub',        color:'#60A5FA', fn:()=>doAction('coldhub','🏭 Cold hub navigation sent') },
                ].map(btn => {
                  const done = actionDone.has(btn.k);
                  return (
                    <button key={btn.k} onClick={btn.fn as any} disabled={done}
                      className="text-xs px-3 py-1.5 rounded border transition-all disabled:opacity-50"
                      style={{ color: btn.color, background:`${btn.color}0d`, borderColor:`${btn.color}35` }}>
                      {done ? '✓ Sent' : btn.l}
                    </button>
                  );
                })}
                <button onClick={() => navigate(s ? `/shipments/${s.id}` : '/active-shipments')}
                  className="ml-auto text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-3 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors">
                  📋 Full Detail →
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT: Telemetry + Risk Panel ────────────────────────────── */}
          <aside className="w-72 shrink-0 bg-[#0D1117] border-l border-[#1E2530] flex flex-col overflow-y-auto">

            {/* Live telemetry header */}
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#1E2530]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">Live Telemetry</span>
                <div className="flex items-center gap-1.5 text-[10px] text-[#34D399]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse"/>
                  {latestSensor ? `${Math.floor((Date.now() - new Date(latestSensor.recorded_at!).getTime()) / 1000)}s ago` : 'Waiting'}
                </div>
              </div>

              {/* Big temp reading */}
              <div className={`bg-[#111827] border rounded-lg p-4 mb-3 ${isBreach ? 'border-[#EF4444]/40' : 'border-[#1E2530]'}`}>
                <div className="text-[10px] text-[#64748B] mb-1">🌡 Cargo Temperature</div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-mono font-bold" style={{ color: tempColor }}>
                    {latestSensor?.temperature?.toFixed(1) ?? '—'}°C
                  </span>
                  {isBreach && <span className="text-xs text-[#F87171] mb-1">+{((latestSensor?.temperature ?? 0) - tMax).toFixed(1)}° above safe</span>}
                </div>
                <div className="text-[10px] text-[#4A5568] mt-1">Safe band: {tMin}°C – {tMax}°C</div>
              </div>

              {/* Other readings */}
              <div className="space-y-1.5">
                {[
                  { icon:'🌤', label:'Ambient Temp',   value: liveAmbient ? `${liveAmbient.toFixed(0)}°C` : '38°C', warn: (liveAmbient ?? 0) > 35 },
                   { icon:'💧', label:'Humidity',       value: liveHumidity ? `${(liveHumidity as number).toFixed(0)}%` : '—', warn: ((liveHumidity as number) ?? 0) > 75 },
                   { icon:'🚛', label:'Speed',          value: liveSpeed,    warn: false },
                   { icon:'🔋', label:'Sensor Battery', value: liveBattery,  warn: liveBattery !== '78%' && parseInt(liveBattery) < 20 },
                   { icon:'📡', label:'GPS Signal',     value: liveSilence ? '⚠️ No signal' : 'Strong', warn: liveSilence },
                   { icon:'🚪', label:'Door Status',    value: liveDoor,     warn: liveDoor === 'OPEN' || liveDoor === 'OPENED' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">{row.icon} {row.label}</span>
                    <span className={row.warn ? 'text-[#FBBF24] font-semibold' : 'text-[#94A3B8]'}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Temp breach banner */}
              {isBreach && (
                <div className="mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded px-3 py-2 text-[11px] text-[#F87171] font-semibold">
                  ⚠️ BREACH — {((latestSensor?.temperature ?? 0) - tMax).toFixed(1)}° above safe ceiling ({tMax}°C)
                </div>
              )}
            </div>

            {/* Mini sparkline */}
            <div className="shrink-0 px-4 py-3 border-b border-[#1E2530]">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">Temp (Last 30 min)</div>
              <MiniSparkline sensors={sensors.slice(0, 20)} tMin={tMin} tMax={tMax}/>
              <div className="flex justify-between text-[9px] text-[#4A5568] mt-1">
                <span>Oldest</span><span className="text-[#34D399]">Safe: {tMin}–{tMax}°C</span><span>Now</span>
              </div>
            </div>

            {/* Risk score */}
            {s && (
              <div className="shrink-0 px-4 py-3 border-b border-[#1E2530]">
                <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3">Risk Score</div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
                      <circle cx={30} cy={30} r={24} fill="none" stroke="#1E2530" strokeWidth="6"/>
                      <circle cx={30} cy={30} r={24} fill="none" stroke={riskColor} strokeWidth="6"
                        strokeDasharray={`${(riskScore/100)*150.8} 150.8`} strokeLinecap="round"
                        style={{ filter:`drop-shadow(0 0 6px ${riskColor}60)` }}/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-black font-mono" style={{color:riskColor}}>{riskScore}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: riskColor }}>{riskCat}</div>
                    {s.current_risk?.time_to_spoil_minutes && (
                      <div className="text-xs text-[#64748B]">Spoils in <span className="font-mono font-bold text-[#FBBF24]">{fmtSpoil(s.current_risk.time_to_spoil_minutes)}</span></div>
                    )}
                    <div className={`text-[10px] mt-0.5 font-semibold ${riskCat === 'CRITICAL' || riskCat === 'HIGH' ? 'text-[#F87171]' : 'text-[#34D399]'}`}>
                      {riskCat === 'CRITICAL' || riskCat === 'HIGH' ? '📈 WORSENING' : '📉 STABLE'}
                    </div>
                  </div>
                </div>

                {/* Risk factors */}
                <div className="space-y-1.5">
                  {[
                    { icon:'🌡', label:'Temp breach',    pts: isBreach ? 22 : 0 },
                    { icon:'⏱', label:'Transit delay',   pts: (sensors[0]?.delay_minutes ?? 0) > 0 ? 18 : 0 },
                    { icon:'🌤', label:'Ambient heat',   pts: (latestSensor?.ambient_temp ?? 0) > 32 ? 9 : 0 },
                    { icon:'🛣️', label:'Route congestion',pts: 7 },
                  ].filter(f => f.pts > 0).map(f => (
                    <div key={f.label} className="flex items-center justify-between text-xs">
                      <span className="text-[#94A3B8]">{f.icon} {f.label}</span>
                      <span className="font-mono text-[#F87171] font-bold">+{f.pts}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cold hub card — auto when risk > 40 */}
            {riskScore > 40 && s && (
              <div className="shrink-0 px-4 py-3 border-b border-[#1E2530]">
                <div className="bg-[#0F1A2E] border border-[#1E3A5F] rounded-lg p-3">
                  <div className="text-[10px] text-[#60A5FA] font-bold uppercase tracking-widest mb-2">🏭 Nearest Cold Hub</div>
                  <div className="text-xs font-semibold text-[#F1F5F9] mb-0.5">Meghalaya Cold Storage</div>
                  <div className="text-[11px] text-[#64748B] mb-0.5">11.2 km · 14 min diversion</div>
                  <div className="text-[11px] text-[#34D399] font-bold mb-2">Risk reduction: -28% · Capacity: Available</div>
                  <div className="flex gap-2">
                    <button onClick={() => doAction('navigate','🏭 Driver navigation sent')} className="flex-1 text-[10px] bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors">Navigate</button>
                    <button onClick={() => doAction('book','📋 Slot booked')} className="flex-1 text-[10px] bg-[#4DD9AC]/10 text-[#4DD9AC] border border-[#4DD9AC]/30 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors">Book Slot</button>
                  </div>
                </div>
              </div>
            )}

            {/* Navigate to detail */}
            {s && (
              <div className="shrink-0 p-4">
                <button onClick={() => navigate(`/shipments/${s.id}`)} className="w-full text-xs bg-[#111827] border border-[#1E2530] text-[#64748B] hover:text-[#4DD9AC] hover:border-[#4DD9AC]/30 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  📋 Full Shipment Detail →
                </button>
                <button onClick={() => navigate('/create-shipment')} className="w-full mt-2 text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] hover:bg-[#4DD9AC]/20 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  + Create New Shipment
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ── Playback Bar ──────────────────────────────────────────────────── */}
      {isPlayback && (
        <PlaybackBar
          riskEvents={riskEvents} sensors={sensors}
          playbackPos={playbackPos} onScrub={setPlaybackPos}
          isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(p => !p)}
          speed={playSpeed} onSpeedChange={setPlaySpeed}
          onExit={() => { setIsPlayback(false); setIsPlaying(false); }}
        />
      )}
    </div>
  );
}
