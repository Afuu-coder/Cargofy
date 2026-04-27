import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getShipments, getAlerts, getAnalyticsSummary, getAnalyticsOverview,
  getAnalyticsOperations, getAnalyticsRoutes, getAnalyticsProducts,
  getAnalyticsCompliance, getAnalyticsTrends, triggerAnalyticsExport,
  type Shipment, type Alert, type AnalyticsSummary,
  type AnalyticsOverview, type AnalyticsOperations, type AnalyticsRoutes,
  type AnalyticsProducts, type AnalyticsCompliance, type AnalyticsTrendForecast,
} from '../../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  teal:   '#4DD9AC', blue:  '#60A5FA', purple: '#A78BFA',
  amber:  '#FBBF24', red:   '#EF4444', orange:'#F97316',
  green:  '#34D399', slate: '#64748B',
};

function kfmt(n: number) {
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n/1000).toFixed(1)}K`;
  return `₹${n}`;
}

const HOURS   = ['0h','2h','4h','6h','8h','10h','12h','14h','16h','18h','20h','22h'];
const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HEAT_COLORS = ['rgba(55,65,81,0.3)','rgba(77,217,172,0.25)','rgba(251,191,36,0.5)','rgba(239,68,68,0.7)'];

// ─────────────────────────────────────────────────────────────────────────────
// SVG Loss Prevention Chart
// ─────────────────────────────────────────────────────────────────────────────
function LossTrendChart({ totalPrevented }: { totalPrevented: number }) {
  const [hover, setHover] = useState<{i:number;x:number;y:number}|null>(null);
  const seed = totalPrevented || 1420000;
  const base = Math.round(seed / 30);

  const pts = Array.from({length:30}).map((_,i) => {
    const noise = Math.sin(i*0.7)*0.3 + Math.cos(i*0.4)*0.2 + (Math.random()-0.5)*0.25;
    return Math.max(0.1, base * (0.6 + noise));
  });

  const maxV = Math.max(...pts);
  const W=560, H=180, padL=44, padB=24, padT=10, padR=8;
  const iW = W - padL - padR, iH = H - padB - padT;
  const tx = (i:number) => padL + (i/(pts.length-1))*iW;
  const ty = (v:number) => padT + iH - (v/maxV)*iH;

  const linePath = pts.map((v,i)=>`${i===0?'M':'L'}${tx(i)} ${ty(v)}`).join(' ');
  const areaPath = `${linePath} L${tx(pts.length-1)} ${padT+iH} L${padL} ${padT+iH} Z`;

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxV*f, y: ty(maxV*f) }));
  const xLabels = [1,8,15,22,30].map(d => ({ d, x: tx(d-1) }));

  return (
    <div className="relative w-full" style={{height:200}}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" onMouseLeave={()=>setHover(null)}>
        <defs>
          <linearGradient id="lgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.teal} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={C.teal} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid */}
        {yLabels.map(l=>(
          <g key={l.v}>
            <line x1={padL} y1={l.y} x2={W-padR} y2={l.y} stroke="#1E2530" strokeWidth="0.8"/>
            <text x={padL-4} y={l.y+3} textAnchor="end" fontSize="7.5" fill="#4A5568" fontFamily="monospace">
              {l.v>=100000?`${(l.v/100000).toFixed(0)}L`:l.v>=1000?`${(l.v/1000).toFixed(0)}K`:'0'}
            </text>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#lgFill)"/>
        {/* Line */}
        <path d={linePath} fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinejoin="round"
          style={{filter:`drop-shadow(0 0 5px ${C.teal}50)`}}/>
        {/* Hover dots */}
        {pts.map((v,i)=>(
          <rect key={i} x={tx(i)-5} y={padT} width={10} height={iH}
            fill="transparent" onMouseEnter={()=>setHover({i,x:tx(i),y:ty(v)})}/>
        ))}
        {hover && (
          <>
            <line x1={hover.x} y1={padT} x2={hover.x} y2={padT+iH} stroke={C.teal} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"/>
            <circle cx={hover.x} cy={hover.y} r={4} fill={C.teal} stroke="#0D1117" strokeWidth="2"/>
          </>
        )}
        {/* X axis labels */}
        {xLabels.map(l=>(
          <text key={l.d} x={l.x} y={H-6} textAnchor="middle" fontSize="7.5" fill="#4A5568" fontFamily="monospace">
            Day {l.d}
          </text>
        ))}
      </svg>
      {hover && (
        <div className="absolute bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-2 text-xs pointer-events-none z-10 shadow-xl"
          style={{left: Math.min(hover.x * 100/560 + 2, 70) + '%', top:'10%', transform:'translateX(-50%)'}}>
          <div className="text-[#4DD9AC] font-bold">Day {hover.i+1}</div>
          <div className="text-[#F1F5F9]">{kfmt(Math.round(pts[hover.i]))} prevented</div>
          <div className="text-[#64748B]">{Math.round(2+Math.random()*3)} interventions</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Overview
// ─────────────────────────────────────────────────────────────────────────────
function TabOverview({ summary, shipments, alerts, overview }: {
  summary: AnalyticsSummary|null; shipments: Shipment[]; alerts: Alert[];
  overview?: AnalyticsOverview|null;
}) {
  const prevented  = overview?.total_loss_prevented_inr ?? summary?.estimated_savings_inr ?? 1420000;
  const totalShips = summary?.total_shipments ?? shipments.length;
  const activeShips= summary?.active_shipments ?? 0;
  const highRisk   = summary?.high_risk_shipments ?? 0;
  const alertsSent = summary?.total_alerts_sent ?? alerts.length;
  const avgRisk    = overview?.avg_risk_score ?? summary?.avg_risk_score ?? 42;
  const onTime     = overview?.on_time_rate_pct ?? 94.2;

  const kpis = [
    { icon:'💰', label:'Loss Prevented',   value:kfmt(prevented),          trend:'+12%', up:true,  color:C.teal   },
    { icon:'🚚', label:'Shipments Total',  value:totalShips.toString(),     trend:'+8%',  up:true,  color:C.blue   },
    { icon:'✅', label:'On-Time Rate',     value:`${onTime}%`,              trend:'+2.1%',up:true,  color:C.green  },
    { icon:'⚡', label:'Alert Resolve',    value:'89%',                     trend:'+4%',  up:true,  color:C.purple },
    { icon:'🥗', label:'Meals Preserved',  value:'4,200',                   trend:'+800', up:true,  color:C.orange },
    { icon:'🌱', label:'CO₂ Waste Avoided',value:'1.8 ton',                 trend:'-0.3', up:false, color:C.green  },
    { icon:'⏱', label:'Avg Alert Time',   value:'4.2 min',                 trend:'-2.1', up:false, color:C.teal   },
    { icon:'📦', label:'Incidents',        value:highRisk.toString(),        trend:'-6',   up:false, color:C.amber  },
  ];

  return (
    <div className="space-y-6">
      {/* Hero KPI strip */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-4">📅 This Month's Impact</div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {kpis.map(k=>(
            <div key={k.label} className="bg-[#0D1117] rounded-xl p-3 border border-[#1E2530]">
              <div className="text-lg mb-1">{k.icon}</div>
              <div className="text-lg font-black font-mono" style={{color:k.color}}>{k.value}</div>
              <div className="text-[9px] text-[#64748B] mt-0.5 leading-tight">{k.label}</div>
              <div className={`text-[9px] font-bold mt-1 ${k.up?'text-[#34D399]':'text-[#F87171]'}`}>
                {k.up?'↑':'↓'} {k.trend} vs last mo
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loss trend chart */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-[#F1F5F9]">₹ Loss Prevented per Day</div>
              <div className="text-[11px] text-[#64748B]">Last 30 days · Hover for daily breakdown</div>
            </div>
            <div className="text-[10px] text-[#4DD9AC] bg-[#4DD9AC]/10 border border-[#4DD9AC]/25 px-2.5 py-1 rounded-full font-bold">
              TOTAL {kfmt(prevented)}
            </div>
          </div>
          <LossTrendChart totalPrevented={prevented}/>
          <div className="flex gap-4 text-[9px] text-[#64748B] mt-2">
            <span><span className="inline-block w-3 h-0.5 bg-[#4DD9AC] rounded mr-1"/>Loss prevented</span>
            <span><span className="inline-block w-3 h-0.5 bg-[#1E2530] rounded mr-1"/>Grid</span>
          </div>
        </div>

        {/* KPI cards */}
        <div className="space-y-3">
          {[
            { label:'Avg Spoilage Risk Score', value:`${Math.round(avgRisk)} / 100`, sub:'↓ 8pts vs last month', good:true },
            { label:'Excursions This Month',   value:String(highRisk * 3 + 25), sub:'↓ 6 vs last month', good:true },
            { label:'Successful Reroutes',     value:'12 / 14', sub:'86% success rate', good:true },
            { label:'SLA Compliance Rate',     value:'91.4%', sub:'↑ 2.1% vs last', good:true },
            { label:'Sensor Uptime',           value:'98.7%', sub:'↑ 0.4% vs last', good:true },
            { label:'Driver Alert Ack Rate',   value:'87.3%', sub:'↑ 4.1% vs last', good:true },
          ].map((k,i)=>(
            <div key={i} className="bg-[#111827] border border-[#1E2530] rounded-xl px-4 py-3">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest">{k.label}</div>
              <div className="text-xl font-black font-mono text-[#F1F5F9] mt-0.5">{k.value}</div>
              <div className={`text-[10px] font-semibold ${k.good?'text-[#34D399]':'text-[#F87171]'}`}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* With vs Without Axon */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-4">📊 With vs. Without Axon (estimated)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2530]">
                <th className="text-left py-2 px-3 text-[#64748B] font-semibold">Metric</th>
                <th className="text-center py-2 px-3 text-[#4DD9AC] font-semibold">WITH Axon</th>
                <th className="text-center py-2 px-3 text-[#EF4444] font-semibold">WITHOUT Axon</th>
                <th className="text-center py-2 px-3 text-[#FBBF24] font-semibold">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2530]">
              {[
                ['Spoilage rate',       '3.2%',     '9.8%',    '-67%'],
                ['Loss per shipment',   '₹420',     '₹1,140',  '-63%'],
                ['Alert response',      '4.2 min',  '28+ min', '-85%'],
                ['On-time delivery',    '94.2%',    '81.3%',   '+12.9pp'],
                ['Avg risk score',      String(Math.round(avgRisk)), '78', `${77-Math.round(avgRisk)} pts better`],
              ].map(([m,w,wo,d])=>(
                <tr key={m} className="hover:bg-[#0D1117] transition-colors">
                  <td className="px-3 py-2.5 text-[#94A3B8] font-semibold">{m}</td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-[#4DD9AC]">{w}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-[#EF4444]">{wo}</td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-[#FBBF24]">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Operations
// ─────────────────────────────────────────────────────────────────────────────
function TabOperations({ alerts, operations, drivers }: {
  alerts: Alert[];
  operations?: AnalyticsOperations|null;
  drivers?: any[];
}) {
  const [sortDriver, setSortDriver] = useState<keyof any>('rank');
  const [hoverCell,  setHoverCell]  = useState<{d:number;h:number}|null>(null);

  const sortedDrivers = [...(drivers ?? [])].sort((a,b)=>{
    if (sortDriver === 'ackRate') return b.ackRate - a.ackRate;
    if (sortDriver === 'avgDelay') return a.avgDelay - b.avgDelay;
    if (sortDriver === 'excursions') return a.excursions - b.excursions;
    return a.rank - b.rank;
  });

  // Merge live BQ response times if available
  const liveResolutionTimes = (operations?.alert_response_times ?? []).length > 0
    ? operations!.alert_response_times.map(r => ({
        type: r.type, min: r.avg_response_min,
        color: r.avg_response_min < 5 ? C.teal : r.avg_response_min < 10 ? C.orange : C.red,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Aging */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
          <div className="text-sm font-bold text-[#F1F5F9] mb-4">⏱ Shipment Stage Aging</div>
          <div className="space-y-3">
            {[
              { stage:'Pickup Pending', avg:'28 min', sla:'<30min', ok:true },
              { stage:'Loaded',         avg:'47 min', sla:'<60min', ok:true },
              { stage:'In Transit',     avg:'4h 12min', sla:'<6h', ok:true },
              { stage:'Near Destination', avg:'34 min', sla:'<45min', ok:true },
              { stage:'Awaiting POD',   avg:'1h 48min', sla:'<1h',  ok:false },
            ].map(s=>(
              <div key={s.stage} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${s.ok?'border-[#1E2530] bg-[#0D1117]':'border-[#EF4444]/30 bg-[#EF4444]/05'}`}>
                <div>
                  <div className="text-xs font-semibold text-[#CBD5E1]">{s.stage}</div>
                  <div className="text-[10px] text-[#64748B]">SLA: {s.sla}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold" style={{color:s.ok?'#34D399':'#EF4444'}}>{s.avg}</span>
                  <span>{s.ok?'✅':'🔴'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alert-to-resolution bars */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
          <div className="text-sm font-bold text-[#F1F5F9] mb-4">⚡ Alert-to-Resolution Time</div>
          <div className="space-y-4">
            {(liveResolutionTimes.length > 0 ? liveResolutionTimes : []).map(a=>(
              <div key={a.type}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[#94A3B8]">{a.type}</span>
                  <span className="font-mono font-bold" style={{color:a.color}}>{a.min} min</span>
                </div>
                <div className="h-2 bg-[#1E2530] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width:`${(a.min/20)*100}%`, background:a.color}}/>
                </div>
              </div>
            ))}
            <div className="text-[10px] text-[#64748B] pt-2 border-t border-[#1E2530]">
              Industry benchmark: ~28 min avg response. Axon: 4.2 min. <span className="text-[#34D399] font-bold">-85% faster.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Excursion heatmap */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-1">🗓 Excursions by Time of Day</div>
        <div className="text-[11px] text-[#64748B] mb-4">Hover cells for details · Highest risk window highlights in red</div>
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Header */}
            <div className="grid gap-1 mb-1" style={{gridTemplateColumns:'48px repeat(12, 40px)'}}>
              <div/>
              {HOURS.map(h=><div key={h} className="text-[9px] text-[#4A5568] text-center font-mono">{h}</div>)}
            </div>
            {([] as number[][]).map((row, di)=>(
              <div key={di} className="grid gap-1 mb-1" style={{gridTemplateColumns:'48px repeat(12, 40px)'}}>
                <div className="text-[10px] text-[#64748B] flex items-center pr-2">{DAYS[di]}</div>
                {row.map((val, hi)=>{
                  const hovering = hoverCell?.d===di && hoverCell?.h===hi;
                  return (
                    <div key={hi} className="relative h-7 rounded-sm cursor-pointer transition-all"
                      style={{background:HEAT_COLORS[val], outline:hovering?`1px solid ${C.teal}`:'none'}}
                      onMouseEnter={()=>setHoverCell({d:di,h:hi})}
                      onMouseLeave={()=>setHoverCell(null)}>
                      {hovering && val > 0 && (
                        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#0D1117] border border-[#1E2530] rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                          <div className="text-[#F1F5F9] font-semibold">{DAYS[di]} {HOURS[hi]}</div>
                          <div style={{color:HEAT_COLORS[val]}}>{['No risk','Low risk','Moderate','High risk'][val]} ({val===0?'0':val===1?'1-2':val===2?'3-5':'6+'} events)</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-3 mt-3 text-[9px] text-[#64748B]">
              {['No risk','Low','Moderate','High frequency'].map((l,i)=>(
                <span key={l} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{background:HEAT_COLORS[i]}}/>
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 bg-[#FBBF24]/08 border border-[#FBBF24]/25 rounded-lg px-4 py-2.5 text-[11px] text-[#FDE68A]">
          💡 <strong>Insight:</strong> Highest risk window is 2 PM–5 PM on weekdays. Consider scheduling dairy shipments before noon.
        </div>
      </div>

      {/* Driver leaderboard */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9]">🏆 Driver Performance Leaderboard</div>
          <div className="flex gap-2">
            {[['rank','Rank'],['ackRate','Ack %'],['avgDelay','Delay'],['excursions','Events']].map(([k,l])=>(
              <button key={k} onClick={()=>setSortDriver(k as any)}
                className={`text-[9px] px-2 py-1 rounded border transition-colors ${sortDriver===k?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[#0D1117]">
            <tr>
              {['Rank','Driver','Trips','Ack Rate','Avg Delay','Excursions'].map(h=>(
                <th key={h} className="px-4 py-2.5 text-left text-[#64748B] font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2530]">
            {sortedDrivers.map((d,i)=>{
              const isTop3 = d.rank <= 3;
              const isBad  = d.ackRate < 75;
              return (
                <tr key={d.name} className={`transition-colors ${i%2===0?'bg-[#111827]':'bg-[#0D1117]'} hover:bg-[#1A2235]`}>
                  <td className="px-4 py-3 text-lg">{typeof d.medal==='string'&&d.medal.length===1?d.medal:d.medal}</td>
                  <td className="px-4 py-3 font-semibold text-[#F1F5F9]">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-[#94A3B8]">{d.trips}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold" style={{color:d.ackRate>=90?'#34D399':d.ackRate>=75?'#FBBF24':'#EF4444'}}>
                      {d.ackRate}% {isBad?'⚠️':''}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{color:d.avgDelay>25?'#EF4444':'#94A3B8'}}>
                    {d.avgDelay} min {d.avgDelay>25?'⚠️':''}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold" style={{color:d.excursions>5?'#EF4444':d.excursions>2?'#FBBF24':'#34D399'}}>
                    {d.excursions}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Routes
// ─────────────────────────────────────────────────────────────────────────────
function TabRoutes({ routesData }: { routesData?: any[] }) {
  const data = routesData ?? [];
  const [sortKey, setSortKey] = useState<string>('avgRisk');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [expanded, setExpanded] = useState<string|null>(null);

  const togSort = (k:string) => {
    if (sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const sorted = [...data].sort((a,b)=>{
    const av = (a as any)[sortKey], bv = (b as any)[sortKey];
    return sortDir==='asc' ? av-bv : bv-av;
  });

  const insights = [
    { type:'warn', text:'Guwahati→Shillong has highest avg risk (68/100). Hill stretch after Jorabat drives 64% of excursions.', rec:'Schedule pre-6AM departures.' },
    { type:'warn', text:'Siliguri→Guwahati shows 18 excursions this month. Avg breach duration: 28 min — longest network-wide.', rec:'Mandatory reefer check at Siliguri hub.' },
    { type:'ok',   text:'Delhi→Jaipur improved 12 points vs last month. Night dispatch policy implemented 18 Oct is working.', rec:'' },
  ];

  return (
    <div className="space-y-6">
      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((ins,i)=>(
          <div key={i} className={`rounded-xl p-4 border ${ins.type==='warn'?'bg-[#1A1200] border-[#FBBF24]/25':'bg-[#0D2419] border-[#34D399]/25'}`}>
            <div className="text-base mb-1">{ins.type==='warn'?'⚠️':'✅'}</div>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{ins.text}</p>
            {ins.rec && <p className="text-[10px] text-[#FBBF24] mt-2 font-semibold">Suggest: {ins.rec}</p>}
          </div>
        ))}
      </div>

      {/* Route table */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9]">🛣️ Route Performance</div>
          <div className="text-[10px] text-[#64748B]">Click column headers to sort · Click row to expand</div>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[#0D1117]">
            <tr>
              {[['route','Route'],['trips','Trips'],['avgRisk','Avg Risk'],['excursions','Excursions'],['onTime','On-Time'],['perf','Perf']].map(([k,l])=>(
                <th key={k} onClick={()=>togSort(k)}
                  className="px-4 py-3 text-left text-[#64748B] font-semibold cursor-pointer hover:text-[#F1F5F9] transition-colors select-none">
                  {l} {sortKey===k?(sortDir==='asc'?'↑':'↓'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2530]">
            {sorted.map((r,i)=>(
              <React.Fragment key={r.route}>
                <tr onClick={()=>setExpanded(expanded===r.route?null:r.route)}
                  className={`cursor-pointer transition-colors ${i%2===0?'bg-[#111827]':'bg-[#0D1117]'} hover:bg-[#1A2235]`}>
                  <td className="px-4 py-3 font-mono font-bold text-[#F1F5F9]">{r.route}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{r.trips}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${r.avgRisk}%`, background:r.perfColor}}/>
                      </div>
                      <span className="font-mono font-bold" style={{color:r.perfColor}}>{r.avgRisk}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{color:r.excursions>10?'#EF4444':r.excursions>5?'#FBBF24':'#34D399'}}>{r.excursions}</td>
                  <td className="px-4 py-3 font-mono text-[#94A3B8]">{r.onTime}%</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{color:r.perfColor, background:`${r.perfColor}18`}}>{r.perf}</span>
                  </td>
                </tr>
                {expanded===r.route && (
                  <tr>
                    <td colSpan={6} className="bg-[#0F1A2E] border-b border-[#1E3A5F]">
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-2 font-semibold">Top Excursion Causes</div>
                          {['Temperature breach (afternoon peak)','Reefer degradation mid-route','Loading delays at origin hub'].map((c,ci)=>(
                            <div key={ci} className="text-[11px] text-[#94A3B8] flex items-center gap-1.5 mb-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0"/>
                              {c}
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-2 font-semibold">Checkpoint Performance</div>
                          {['Dispatch hub: 94% pass','Midway zone: 78% pass ⚠️','Delivery hub: 91% pass'].map((c,ci)=>(
                            <div key={ci} className="text-[11px] text-[#94A3B8] mb-1">{c}</div>
                          ))}
                        </div>
                        <div>
                          <div className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-2 font-semibold">Suggested Improvements</div>
                          <div className="text-[11px] text-[#34D399] leading-relaxed">
                            Pre-dawn dispatch · Mandatory reefer inspection · Add checkpoint sensor at {r.route.split('→')[1]?.trim()} hub
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Corridor visual — SVG India map abstraction */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-4">🗺️ Corridor Risk Map (India)</div>
        <div className="relative bg-[#0D1117] rounded-xl overflow-hidden" style={{height:280}}>
          <svg viewBox="0 0 600 280" className="w-full h-full" style={{fontFamily:'monospace'}}>
            {/* Simplified India silhouette dots */}
            {[220,230,225,240,255,260,270,280,285,270,260,250,240,230,220].map((x,i,arr)=>(
              <ellipse key={i} cx={x} cy={40+i*14} rx={arr[i]*0.3} ry={6} fill="#1E2530" opacity="0.3"/>
            ))}
            {/* Route lines */}
            {([] as Array<{route:string;trips:number;avgRisk:number;excursions:number;onTime:number;perf:string;perfColor:string}>).map(r=>{
              const coords: Record<string,[number,number]> = {
                'Guwahati':[440,120],'Shillong':[470,140],'Siliguri':[420,145],'Kolkata':[390,185],
                'Patna':[330,165],'Delhi':[260,130],'Jaipur':[240,155],'Mumbai':[220,220],
                'Pune':[225,235],'Dibrugarh':[470,105],'Itanagar':[490,115],'Imphal':[480,170],'Silchar':[455,175],
              };
              const [from,to] = r.route.split('→').map(s=>s.trim());
              const fp=coords[from]||[280,180], tp=coords[to]||[300,200];
              const thickness = Math.max(1.5, r.trips/30);
              return (
                <g key={r.route}>
                  <line x1={fp[0]} y1={fp[1]} x2={tp[0]} y2={tp[1]}
                    stroke={r.perfColor} strokeWidth={thickness} opacity="0.8"
                    strokeLinecap="round"
                    style={{filter:`drop-shadow(0 0 4px ${r.perfColor}60)`}}/>
                  <circle cx={fp[0]} cy={fp[1]} r={4} fill={r.perfColor} opacity="0.9"/>
                  <circle cx={tp[0]} cy={tp[1]} r={4} fill={r.perfColor} opacity="0.9"/>
                  <text x={(fp[0]+tp[0])/2} y={(fp[1]+tp[1])/2-4} fontSize="7" fill={r.perfColor} textAnchor="middle">
                    {r.avgRisk}
                  </text>
                </g>
              );
            })}

            {/* Legend */}
            <text x={10} y={20}  fontSize="8" fill="#64748B">Route avg risk score shown on line</text>
            {[['#34D399','Good (≤35)'],['#FBBF24','Fair (36-60)'],['#EF4444','Poor (>60)']].map(([col,lab],i)=>(
              <g key={col} transform={`translate(10,${240+i*16})`}>
                <rect x={0} y={0} width={12} height={6} rx="2" fill={col}/>
                <text x={16} y={6} fontSize="7.5" fill="#94A3B8">{lab}</text>
              </g>
            ))}
            <text x={10} y={235} fontSize="7.5" fill="#4A5568">Line thickness = shipment volume</text>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Products
// ─────────────────────────────────────────────────────────────────────────────
function TabProducts({ products }: { products?: AnalyticsProducts|null }) {
  // Merge live BQ product matrix with static enrichment data
  const mergedProducts = (products?.product_matrix ?? []).length > 0
    ? products!.product_matrix.map(p => {
        const enrich = ([] as Array<{name:string;sensitivity:number;color:string;icon:string;rec:string;peak:string}>).find(d => d.name.toLowerCase() === p.product_type?.toLowerCase());
        return {
          name: p.product_type,
          excursions: p.total_excursions,
          sensitivity: enrich?.sensitivity ?? 70,
          risk: Math.round(p.avg_risk_score),
          color: enrich?.color ?? C.blue,
          icon: enrich?.icon ?? '📦',
          vol: p.total_trips,
          rec: enrich?.rec ?? 'Monitor closely.',
          peak: enrich?.peak ?? '—',
        };
      })
    : [];
  const maxEx = Math.max(...mergedProducts.map(p => p.excursions), 1);
  const [hover, setHover] = useState<string|null>(null);

  return (
    <div className="space-y-6">
      {/* Risk matrix */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-1">🫧 Product Sensitivity vs Network Risk</div>
        <div className="text-[11px] text-[#64748B] mb-4">Bubble size = shipment volume · Hover for details</div>
        <div className="relative bg-[#0D1117] rounded-xl overflow-hidden" style={{height:300, padding:20}}>
          <svg viewBox="0 0 560 260" className="w-full h-full" style={{fontFamily:'Inter,sans-serif'}}>
            {/* Axes */}
            <line x1={60} y1={10} x2={60} y2={230} stroke="#1E2530" strokeWidth="1"/>
            <line x1={60} y1={230} x2={540} y2={230} stroke="#1E2530" strokeWidth="1"/>

            {/* Axis labels */}
            <text x={300} y={255} textAnchor="middle" fontSize="9" fill="#64748B">Network Risk →</text>
            <text x={20} y={130} textAnchor="middle" fontSize="9" fill="#64748B" transform="rotate(-90,20,130)">Sensitivity →</text>

            {/* Quadrant lines */}
            <line x1={60} y1={120} x2={540} y2={120} stroke="#1E2530" strokeWidth="0.5" strokeDasharray="4,4"/>
            <line x1={300} y1={10} x2={300} y2={230} stroke="#1E2530" strokeWidth="0.5" strokeDasharray="4,4"/>

            {/* Quadrant labels */}
            <text x={180} y={100} textAnchor="middle" fontSize="7.5" fill="#34D399" opacity="0.6">HIGH SENS · LOW RISK</text>
            <text x={420} y={100} textAnchor="middle" fontSize="7.5" fill="#EF4444" opacity="0.6">HIGH SENS · HIGH RISK</text>
            <text x={180} y={210} textAnchor="middle" fontSize="7.5" fill="#4A5568">LOW SENS · LOW RISK</text>
            <text x={420} y={210} textAnchor="middle" fontSize="7.5" fill="#FBBF24" opacity="0.6">LOW SENS · HIGH RISK</text>

            {/* Bubbles */}
            {mergedProducts.map(p=>{
              const cx = 60 + (p.risk/100) * 480;
              const cy = 230 - (p.sensitivity/100) * 220;
              const r  = Math.max(12, Math.min(28, p.vol * 0.28));
              const isH = hover === p.name;
              return (
                <g key={p.name} onMouseEnter={()=>setHover(p.name)} onMouseLeave={()=>setHover(null)} style={{cursor:'pointer'}}>
                  <circle cx={cx} cy={cy} r={r} fill={p.color} opacity={isH?0.9:0.6}
                    style={{filter:isH?`drop-shadow(0 0 10px ${p.color})`:'none', transition:'all 0.2s'}}/>
                  <text x={cx} y={cy+3} textAnchor="middle" fontSize={r > 18 ? '12' : '9'}>{p.icon}</text>
                  <text x={cx} y={cy+r+10} textAnchor="middle" fontSize="7.5" fill={p.color}>{p.name}</text>
                  {isH && (
                    <g>
                      <rect x={cx-50} y={cy-r-42} width={100} height={36} rx="4" fill="#0D1117" stroke={p.color} strokeWidth="1"/>
                      <text x={cx} y={cy-r-28} textAnchor="middle" fontSize="8" fill="#F1F5F9" fontWeight="bold">{p.name}</text>
                      <text x={cx} y={cy-r-16} textAnchor="middle" fontSize="7.5" fill="#94A3B8">{p.excursions} excursions · {p.vol} trips</text>
                      <text x={cx} y={cy-r-6} textAnchor="middle" fontSize="7" fill={p.color}>Risk: {p.risk} · Sensitivity: {p.sensitivity}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Excursion frequency bars */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-4">📊 Excursion Frequency by Product</div>
        <div className="space-y-3">
          {[...mergedProducts].sort((a,b)=>b.excursions-a.excursions).map(p=>(
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-16 text-xs text-[#94A3B8] text-right shrink-0">{p.icon} {p.name}</span>
              <div className="flex-1 h-5 bg-[#0D1117] rounded-full overflow-hidden relative">
                <div className="h-full rounded-full transition-all duration-700" style={{width:`${(p.excursions/maxEx)*100}%`, background:p.color, opacity:0.8}}/>
                <div className="absolute inset-0 flex items-center px-2">
                  <span className="text-[10px] font-mono font-bold" style={{color:p.color}}>{p.excursions} excursions</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mergedProducts.filter(p=>p.excursions>5).map(p=>(
          <div key={p.name} className="bg-[#0D1117] border border-[#1E2530] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{p.icon}</span>
              <span className="text-sm font-bold" style={{color:p.color}}>💡 {p.name}</span>
            </div>
            <div className="text-[11px] text-[#64748B] mb-1">Peak excursion: {p.peak}</div>
            <div className="text-[11px] text-[#94A3B8]">Recommendation: {p.rec}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Compliance
// ─────────────────────────────────────────────────────────────────────────────
function TabCompliance({ shipments, compliance, onExport, exporting }: {
  shipments: Shipment[];
  compliance?: AnalyticsCompliance|null;
  onExport?: (type: 'COMPLIANCE'|'ROUTES'|'DRIVERS'|'OVERVIEW') => void;
  exporting?: boolean;
}) {
  const [exportRange, setExportRange] = useState<[string,string]>(['2024-10-01','2024-10-31']);

  const handleExport = (type: string) => {
    if (onExport) onExport('COMPLIANCE');
  };

  type ComplianceMetric = { label: string; value: number; target: number; unit: string };
  const complianceMetrics: ComplianceMetric[] = [];
  const overallScore = complianceMetrics.length
    ? Math.round(complianceMetrics.reduce((s,m)=>s + Math.min(m.value/m.target*100,100),0)/complianceMetrics.length * 0.944)
    : 94;

  return (
    <div className="space-y-6">
      {/* Compliance score header */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-sm font-bold text-[#F1F5F9]">📋 Compliance Dashboard — October 2024</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">Audit-ready summary. Target ranges shown per metric.</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black font-mono text-[#34D399]">{overallScore} / 100</div>
            <div className="text-[10px] text-[#34D399] font-bold uppercase tracking-widest">✅ COMPLIANT</div>
          </div>
        </div>
        {/* Score grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {complianceMetrics.map(m=>{
            const passing = m.value >= m.target;
            return (
              <div key={m.label} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${passing?'border-[#1E2530] bg-[#0D1117]':'border-[#FBBF24]/30 bg-[#1A1200]'}`}>
                <div>
                  <div className="text-xs font-semibold text-[#CBD5E1]">{m.label}</div>
                  <div className="text-[10px] text-[#64748B]">Target: ≥{m.target}{m.unit}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${Math.min(100,(m.value/100)*100)}%`, background:passing?'#34D399':'#FBBF24'}}/>
                  </div>
                  <span className="font-mono font-bold w-14 text-right" style={{color:passing?'#34D399':'#FBBF24'}}>{m.value}{m.unit}</span>
                  <span>{passing?'✅':'⚠️'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-shipment compliance log */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9]">📊 Per-Shipment Compliance Log</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0D1117]">
              <tr>
                {['Shipment','Product','Temp','Humidity','On-Time','POD','Overall'].map(h=>(
                  <th key={h} className="px-4 py-2.5 text-left text-[#64748B] font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2530]">
              {(compliance?.shipment_log?.length ? compliance.shipment_log.slice(0,8)
                : shipments.length ? shipments.slice(0,8)
                : Array.from({length:5}).map((_,i) => ({
                    id:String(i), shipment_code:`AXN-${2000+i*91}`,
                    product_type:['dairy','seafood','pharma','produce','frozen'][i%5],
                    status:'delivered', compliance_pct: 80 + i*4,
                    sla_met: i < 4, max_temp_breach_min: i * 3, total_excursions: i,
                  }))
              ).map((s: any, i)=> {
                const overall  = (s.compliance_pct ?? 90) >= 90 && (s.sla_met ?? true);
                const tempPass = (s.max_temp_breach_min ?? 0) === 0;
                const humPass  = (s.compliance_pct ?? 90) >= 85;
                const otPass   = s.sla_met ?? true;
                const podPass  = (s.compliance_pct ?? 90) >= 80;
                return (
                  <tr key={s.id} className={`${i%2===0?'bg-[#111827]':'bg-[#0D1117]'} hover:bg-[#1A2235] transition-colors`}>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#4DD9AC]">{s.shipment_code}</td>
                    <td className="px-4 py-2.5 text-[#94A3B8] capitalize">{s.product_type}</td>
                    <td className="px-4 py-2.5">{tempPass?'✅ PASS':'⚠️ FAIL'}</td>
                    <td className="px-4 py-2.5">{humPass?'✅ PASS':'⚠️ FAIL'}</td>
                    <td className="px-4 py-2.5">{otPass?'✅ PASS':'⚠️ FAIL'}</td>
                    <td className="px-4 py-2.5">{podPass?'✅ PASS':'⚠️ FAIL'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${overall?'bg-[#34D399]/15 text-[#34D399]':'bg-[#EF4444]/15 text-[#F87171]'}`}>
                        {overall?'✅ PASS':'❌ FAIL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export panel */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-4">📤 Export Options</div>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <div className="text-[10px] text-[#64748B] mb-1">Date range: From</div>
            <input type="date" value={exportRange[0]} onChange={e=>setExportRange([e.target.value,exportRange[1]])}
              className="bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] focus:outline-none focus:border-[#4DD9AC]/40"/>
          </div>
          <div>
            <div className="text-[10px] text-[#64748B] mb-1">To</div>
            <input type="date" value={exportRange[1]} onChange={e=>setExportRange([exportRange[0],e.target.value])}
              className="bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] focus:outline-none focus:border-[#4DD9AC]/40"/>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { icon:'📄', label:'Full Compliance Report', sub:'PDF · Audit ready', color:C.teal },
            { icon:'📊', label:'Shipment Data', sub:'Excel · All fields', color:C.blue },
            { icon:'🗂️', label:'Excursion Log', sub:'CSV · With timestamps', color:C.purple },
            { icon:'📋', label:'Driver Performance', sub:'PDF · Leaderboard', color:C.orange },
            { icon:'📈', label:'Route Analytics', sub:'PDF · With corridor map', color:C.amber },
            { icon:'🔒', label:'Compliance Certificate', sub:'PDF · Shareable', color:C.green },
          ].map(ex=>(
            <button key={ex.label} onClick={()=>handleExport(ex.label)} disabled={exporting}
              className="flex items-start gap-3 p-3 bg-[#0D1117] border border-[#1E2530] rounded-xl hover:border-[#374151] transition-colors text-left disabled:opacity-60">
              <span className="text-xl shrink-0">{ex.icon}</span>
              <div>
                <div className="text-xs font-semibold" style={{color:ex.color}}>{ex.label}</div>
                <div className="text-[10px] text-[#4A5568]">{ex.sub}</div>
              </div>
            </button>
          ))}
        </div>
        {exporting && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#4DD9AC]">
            <div className="w-4 h-4 border-2 border-[#4DD9AC]/20 border-t-[#4DD9AC] rounded-full animate-spin"/>
            Generating report…
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: AI Forecast (Vertex AI)
// ─────────────────────────────────────────────────────────────────────────────
function TabTrends({ trends }: { trends: AnalyticsTrendForecast|null }) {
  const today = new Date();

  const MOCK_EVENTS = Array.from({length:7}).map((_,i)=>({
    date: new Date(today.getTime()+(i+1)*86400000).toISOString().slice(0,10),
    events: Math.max(0, 3 + Math.round(Math.sin(i*0.9)*2)),
  }));

  const events = trends?.predicted_critical_events_next_7d?.length
    ? trends.predicted_critical_events_next_7d
    : MOCK_EVENTS;

  const maxE = Math.max(...events.map(e=>e.events), 1);
  const lossRisk = trends?.predicted_loss_risk_inr ?? 420000;
  const confidence = (trends?.confidence ?? 0.72) * 100;
  const highDays = trends?.high_risk_days ?? [];
  const recs = trends?.recommended_actions ?? [
    'Schedule dairy shipments before 10 AM — afternoon temperature peaks predicted mid-week.',
    'Pre-inspect reefer units on Guwahati corridor — elevated risk Tuesday/Wednesday.',
    'Increase dispatch frequency for seafood — demand spike expected Thursday.',
  ];
  const isMock = !trends || trends.source === 'mock';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-bold text-[#F1F5F9]">🔮 7-Day AI Risk Forecast</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">
              Powered by {isMock ? 'demo data' : 'Vertex AI · Gemini 2.0 Flash'} ·
              Confidence: <span style={{color: confidence > 70 ? '#34D399' : '#FBBF24'}}>{confidence.toFixed(0)}%</span>
              {isMock && <span className="ml-2 text-[#A78BFA] text-[9px] uppercase tracking-widest font-bold">DEMO</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#64748B]">Predicted Loss Risk</div>
            <div className="text-2xl font-black font-mono" style={{color:'#EF4444'}}>
              {lossRisk >= 100000 ? `₹${(lossRisk/100000).toFixed(1)}L` : `₹${(lossRisk/1000).toFixed(0)}K`}
            </div>
            <div className="text-[9px] text-[#64748B]">next 7 days</div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-2 h-28 mt-2">
          {events.map((e, i) => {
            const isHigh = highDays.includes(e.date);
            const h = Math.max(8, (e.events / maxE) * 100);
            const day = new Date(e.date).toLocaleDateString('en-IN',{weekday:'short'});
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] font-mono font-bold" style={{color: isHigh ? '#EF4444' : '#64748B'}}>
                  {e.events}
                </div>
                <div className="w-full rounded-t-md transition-all" style={{
                  height: `${h}%`,
                  background: isHigh ? '#EF444490' : '#4DD9AC40',
                  border: `1px solid ${isHigh ? '#EF4444' : '#4DD9AC'}50`,
                  boxShadow: isHigh ? '0 0 8px #EF444440' : undefined,
                }}/>
                <div className="text-[9px] text-[#4A5568] font-mono">{day}</div>
                {isHigh && <div className="text-[8px] text-[#EF4444] font-bold">⚠</div>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[9px] text-[#64748B]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#4DD9AC40] border border-[#4DD9AC50]"/> Normal</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#EF444490] border border-[#EF4444]"/> High Risk Day</span>
        </div>
      </div>

      {/* High risk days alert */}
      {highDays.length > 0 && (
        <div className="bg-[#1A0F0F] border border-[#EF4444]/30 rounded-xl p-4">
          <div className="text-sm font-bold text-[#F87171] mb-2">🚨 High-Risk Days Predicted</div>
          <div className="flex flex-wrap gap-2">
            {highDays.map(d => (
              <span key={d} className="font-mono text-xs bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#F87171] px-2.5 py-1 rounded-lg font-bold">{d}</span>
            ))}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-2">
            Increase monitoring frequency and pre-position cold hubs on these days.
          </div>
        </div>
      )}

      {/* Recommended actions */}
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl p-5">
        <div className="text-sm font-bold text-[#F1F5F9] mb-4">💡 AI Recommended Actions</div>
        <div className="space-y-3">
          {recs.map((rec, i) => (
            <div key={i} className="flex items-start gap-3 bg-[#0D1117] rounded-xl px-4 py-3 border border-[#1E2530]">
              <div className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                style={{background:'#4DD9AC20', color:'#4DD9AC', border:'1px solid #4DD9AC40'}}>
                {i+1}
              </div>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">{rec}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Peak Risk Day', value: highDays[0]?.slice(5) ?? 'Wed', icon:'📅', color:'#EF4444' },
          { label:'Events Predicted', value: String(events.reduce((s,e)=>s+e.events,0)), icon:'⚡', color:'#FBBF24' },
          { label:'Forecast Horizon', value: '7 Days', icon:'🔭', color:'#60A5FA' },
          { label:'Model Confidence', value: `${confidence.toFixed(0)}%`, icon:'🤖', color:'#34D399' },
        ].map(k => (
          <div key={k.label} className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
            <div className="text-xl mb-1">{k.icon}</div>
            <div className="text-xl font-black font-mono" style={{color:k.color}}>{k.value}</div>
            <div className="text-[10px] text-[#64748B] mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'overview'|'operations'|'routes'|'products'|'compliance'|'trends';

export function AxonAnalytics() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState<'7d'|'30d'|'90d'|'all'>('30d');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [summary,   setSummary]   = useState<AnalyticsSummary|null>(null);
  const [overview,  setOverview]  = useState<AnalyticsOverview|null>(null);
  const [operations,setOperations]= useState<AnalyticsOperations|null>(null);
  const [routes,    setRoutes]    = useState<AnalyticsRoutes|null>(null);
  const [products,  setProducts]  = useState<AnalyticsProducts|null>(null);
  const [compliance,setCompliance]= useState<AnalyticsCompliance|null>(null);
  const [trends,    setTrends]    = useState<AnalyticsTrendForecast|null>(null);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  // Map date range selector to API period string
  const periodMap: Record<string, string> = {
    '7d': '7D', '30d': '30D', '90d': '90D', 'all': '90D',
  };
  const period = periodMap[dateRange] || 'THIS_MONTH';

  useEffect(() => {
    setLoading(true);
    // Always fetch Postgres summary + shipments for fallback
    Promise.all([
      getShipments('all'), getAlerts(), getAnalyticsSummary(),
    ]).then(([s, a, sm]) => {
      setShipments(s); setAlerts(a); setSummary(sm);
    }).catch(() => {});

    // Fetch all BQ tabs in parallel
    Promise.allSettled([
      getAnalyticsOverview(period),
      getAnalyticsOperations(period),
      getAnalyticsRoutes(period),
      getAnalyticsProducts(period),
      getAnalyticsCompliance(period),
      getAnalyticsTrends(),
    ]).then(([ovR, opR, rtR, prR, cmR, trR]) => {
      if (ovR.status === 'fulfilled') setOverview(ovR.value);
      if (opR.status === 'fulfilled') setOperations(opR.value);
      if (rtR.status === 'fulfilled') setRoutes(rtR.value);
      if (prR.status === 'fulfilled') setProducts(prR.value);
      if (cmR.status === 'fulfilled') setCompliance(cmR.value);
      if (trR.status === 'fulfilled') setTrends(trR.value);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const TABS: Array<{key:Tab; icon:string; label:string}> = [
    {key:'overview',   icon:'💰', label:'Overview'},
    {key:'operations', icon:'⚙️', label:'Operations'},
    {key:'routes',     icon:'🛣️', label:'Routes'},
    {key:'products',   icon:'📦', label:'Products'},
    {key:'compliance', icon:'📋', label:'Compliance'},
    {key:'trends',     icon:'🔮', label:'AI Forecast'},
  ];

  // Merge live BQ data into enrichment static data
  const liveDrivers = (operations?.driver_leaderboard ?? []).length > 0
    ? operations!.driver_leaderboard.map((d, i) => ({
        rank: i + 1,
        name: d.driver_id,
        trips: d.total_trips,
        ackRate: d.ack_rate,
        avgDelay: d.avg_delay_minutes,
        excursions: d.excursion_count,
        medal: ['🥇','🥈','🥉'][i] ?? String(i+1),
      }))
    : [];

  const liveRoutes = (routes?.route_performance ?? []).length > 0
    ? routes!.route_performance.map(r => ({
        route: r.corridor.replace('-','→'),
        trips: r.total_trips,
        avgRisk: Math.round(r.avg_risk_score),
        excursions: r.excursion_count,
        onTime: r.on_time_pct,
        perf: r.avg_risk_score > 60 ? 'Poor' : r.avg_risk_score > 35 ? 'Fair' : r.avg_risk_score > 20 ? 'Good' : 'Great',
        perfColor: r.avg_risk_score > 60 ? '#EF4444' : r.avg_risk_score > 35 ? '#FBBF24' : r.avg_risk_score > 20 ? '#4DD9AC' : '#34D399',
      }))
    : [];

  // Wire Export
  const handleExportBQ = async (type: 'COMPLIANCE'|'ROUTES'|'DRIVERS'|'OVERVIEW') => {
    setExporting(true);
    try {
      const res = await triggerAnalyticsExport({ type, period, format: 'CSV' });
      if (res.download_url) {
        const a = document.createElement('a');
        a.href = res.download_url;
        a.download = `axon_${type.toLowerCase()}_${period}.csv`;
        a.click();
      }
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-5 py-3 flex items-center gap-4 z-40">
        <span className="text-[#4DD9AC] font-black text-xl tracking-tighter cursor-pointer" onClick={()=>navigate('/dashboard')}>AXON</span>
        <div className="h-5 w-px bg-[#1E2530]"/>
        <span className="text-sm text-[#94A3B8]">📊 Analytics</span>
        <div className="flex-1"/>
        {/* Date range */}
        <div className="flex gap-1">
          {([['7d','7D'],['30d','30D'],['90d','90D'],['all','All']] as const).map(([k,l])=>(
            <button key={k} onClick={()=>setDateRange(k)}
              className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${dateRange===k?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={()=>navigate('/dashboard')} className="text-[10px] border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">
          ← Dashboard
        </button>
      </header>

      {/* ── Section Tabs ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-5 flex items-center gap-1">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${tab===t.key?'border-[#4DD9AC] text-[#4DD9AC]':'border-transparent text-[#64748B] hover:text-[#94A3B8]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
        <div className="ml-auto py-2">
          {loading && <span className="text-[10px] text-[#4DD9AC] animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 bg-[#4DD9AC] rounded-full animate-pulse"/>Loading data…</span>}
        </div>
      </div>

      {/* ── Main Scroll Area ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-5 py-6">
          {tab==='overview'   && <TabOverview summary={summary} shipments={shipments} alerts={alerts} overview={overview}/>}
          {tab==='operations' && <TabOperations alerts={alerts} operations={operations} drivers={liveDrivers}/>}
          {tab==='routes'     && <TabRoutes routesData={liveRoutes}/>}
          {tab==='products'   && <TabProducts products={products}/>}
          {tab==='compliance' && <TabCompliance shipments={shipments} compliance={compliance} onExport={handleExportBQ} exporting={exporting}/>}
          {tab==='trends'     && <TabTrends trends={trends}/>}
        </div>
      </div>
    </div>
  );
}
