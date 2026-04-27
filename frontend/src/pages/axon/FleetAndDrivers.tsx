import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getShipments, getFleetDrivers, getFleetVehicles, getFleetHealthSummary,
  getDriverLeaderboard, assignDriver, unassignDriver, createFleetDriver, createFleetVehicle,
  type Shipment, type FleetDriver, type FleetVehicle, type FleetHealthSummary,
} from '../../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Static data (enriched with real shipment context)
// ─────────────────────────────────────────────────────────────────────────────
interface Driver {
  id: string; name: string; phone: string; waVerified: boolean;
  status: 'available' | 'active' | 'flagged' | 'critical';
  activeShip?: string; lastTrip: string; joined: string; location: string;
  trips: number; ackRate: number; avgDelay: number; excursions: number;
  slaBreachRate: number; score: number; flagReason?: string;
  tripHistory: TripRow[]; alertHistory: AlertRow[];
  products: string[];
}
interface TripRow { code: string; icon: string; route: string; duration: string; onTime: boolean; delayMin?: number; excursions: number; }
interface AlertRow { time: string; ship: string; type: string; ackMin: number; }

interface Vehicle {
  id: string; plate: string; type: string; maker: string;
  capacity: string; reeferSystem: string; tempRange: string;
  status: 'available' | 'active' | 'maintenance';
  activeShip?: string; reeferHealth: number; reeferFault?: boolean;
  sensorId?: string; sensorBattery?: number; lastPing?: string;
  gpsSignal: string; calibrationValid: boolean;
  lastService: string; nextService: string; serviceOverdue: boolean;
  currentTemp?: number; avgTempStability: string;
  doorSeal: boolean; compressor: boolean;
  compatibility: string[];
  tripHistory: VehicleTripRow[];
}
interface VehicleTripRow { code: string; duration: string; avgTemp: string; tempOk: boolean; breaches: number; }

const DRIVERS: Driver[] = [
  {
    id:'DRV-0042', name:'Ramesh Kumar', phone:'+91 98765 43210', waVerified:true,
    status:'available', lastTrip:'2 days ago', joined:'March 2022', location:'Guwahati',
    trips:48, ackRate:96, avgDelay:8, excursions:1, slaBreachRate:2.1, score:98,
    products:['Dairy','Seafood','Frozen'],
    tripHistory:[
      {code:'AXN-2041',icon:'🥛',route:'GHY→SHL',duration:'4h 02m',onTime:true,excursions:0},
      {code:'AXN-1998',icon:'💊',route:'BOM→PUN',duration:'2h 18m',onTime:true,excursions:0},
      {code:'AXN-1847',icon:'🐟',route:'CCU→PAT',duration:'6h 44m',onTime:false,delayMin:18,excursions:1},
      {code:'AXN-1721',icon:'🥦',route:'DEL→JAI',duration:'3h 55m',onTime:true,excursions:0},
      {code:'AXN-1680',icon:'🥛',route:'GHY→SHL',duration:'4h 28m',onTime:true,excursions:0},
    ],
    alertHistory:[
      {time:'2 days ago', ship:'AXN-1847', type:'Temp breach',    ackMin:2},
      {time:'5 days ago', ship:'AXN-1680', type:'Delay warning',  ackMin:1},
      {time:'8 days ago', ship:'AXN-1600', type:'Humidity alert', ackMin:3},
    ],
  },
  {
    id:'DRV-0051', name:'Suresh Pandey', phone:'+91 97234 11200', waVerified:true,
    status:'active', activeShip:'AXN-2087', lastTrip:'Active now', joined:'July 2021', location:'En route',
    trips:41, ackRate:94, avgDelay:11, excursions:2, slaBreachRate:3.4, score:94,
    products:['Dairy','Produce','Fruits'],
    tripHistory:[
      {code:'AXN-2044',icon:'🐟',route:'CCU→PAT',duration:'5h 10m',onTime:true,excursions:1},
      {code:'AXN-1920',icon:'🥛',route:'GHY→SHL',duration:'4h 12m',onTime:true,excursions:0},
      {code:'AXN-1810',icon:'🍎',route:'MUM→PUN',duration:'2h 05m',onTime:true,excursions:0},
      {code:'AXN-1742',icon:'🥦',route:'DEL→JAI',duration:'3h 40m',onTime:false,delayMin:12,excursions:1},
      {code:'AXN-1700',icon:'🥛',route:'GHY→SHL',duration:'4h 22m',onTime:true,excursions:0},
    ],
    alertHistory:[
      {time:'3 days ago', ship:'AXN-2044', type:'Humidity spike', ackMin:4},
    ],
  },
  {
    id:'DRV-0064', name:'Anuj Sharma', phone:'+91 96400 55100', waVerified:true,
    status:'available', lastTrip:'1 day ago', joined:'Nov 2022', location:'Kolkata',
    trips:36, ackRate:89, avgDelay:14, excursions:3, slaBreachRate:4.8, score:88,
    products:['Dairy','Frozen'],
    tripHistory:[
      {code:'AXN-2010',icon:'🧊',route:'SIL→GUW',duration:'4h 55m',onTime:true,excursions:0},
      {code:'AXN-1905',icon:'🥛',route:'GHY→SHL',duration:'4h 08m',onTime:false,delayMin:9,excursions:1},
      {code:'AXN-1800',icon:'🧊',route:'CCU→PAT',duration:'5h 30m',onTime:true,excursions:2},
      {code:'AXN-1650',icon:'🥛',route:'GHY→SHL',duration:'4h 20m',onTime:true,excursions:0},
      {code:'AXN-1600',icon:'🧊',route:'SIL→GUW',duration:'4h 44m',onTime:true,excursions:0},
    ],
    alertHistory:[
      {time:'1 day ago',  ship:'AXN-1905', type:'Delay warning',  ackMin:6},
      {time:'4 days ago', ship:'AXN-1800', type:'Temp breach',    ackMin:3},
    ],
  },
  {
    id:'DRV-0071', name:'Dev Nair', phone:'+91 96100 22100', waVerified:true,
    status:'flagged', lastTrip:'3 hrs ago', joined:'Jan 2023', location:'Dibrugarh',
    trips:29, ackRate:72, avgDelay:28, excursions:6, slaBreachRate:11.2, score:61,
    flagReason:'3 unacknowledged alerts this week',
    products:['Dairy'],
    tripHistory:[
      {code:'AXN-2841',icon:'💊',route:'DIB→ITA',duration:'7h 22m',onTime:false,delayMin:42,excursions:3},
      {code:'AXN-1960',icon:'🥛',route:'GHY→SHL',duration:'4h 50m',onTime:false,delayMin:30,excursions:2},
      {code:'AXN-1820',icon:'🥛',route:'GHY→SHL',duration:'5h 10m',onTime:false,delayMin:25,excursions:1},
    ],
    alertHistory:[
      {time:'3 hrs ago', ship:'AXN-2841', type:'Reefer failure', ackMin:999},
      {time:'1 day ago', ship:'AXN-1960', type:'Temp breach',    ackMin:999},
      {time:'2 days ago',ship:'AXN-1820', type:'Delay warning',  ackMin:18},
    ],
  },
  {
    id:'DRV-0082', name:'Bikash Roy', phone:'+91 95200 31400', waVerified:true,
    status:'critical', lastTrip:'Today', joined:'May 2023', location:'Route NE-7',
    trips:31, ackRate:61, avgDelay:35, excursions:9, slaBreachRate:16.4, score:48,
    flagReason:'6 open alerts · Repeated SLA breaches',
    products:['Dairy'],
    tripHistory:[
      {code:'AXN-2099',icon:'🥛',route:'SIL→GUW',duration:'6h 10m',onTime:false,delayMin:55,excursions:4},
      {code:'AXN-1990',icon:'🥛',route:'GHY→SHL',duration:'5h 44m',onTime:false,delayMin:44,excursions:3},
      {code:'AXN-1870',icon:'🥛',route:'SIL→GUW',duration:'6h 00m',onTime:false,delayMin:35,excursions:2},
    ],
    alertHistory:[
      {time:'2 hrs ago', ship:'AXN-2099', type:'Temp breach',    ackMin:999},
      {time:'5 hrs ago', ship:'AXN-2099', type:'Humidity spike', ackMin:42},
      {time:'1 day ago', ship:'AXN-1990', type:'Reefer warning', ackMin:999},
    ],
  },
];

const VEHICLES: Vehicle[] = [
  {
    id:'VEH-0019', plate:'MH-12-AB-3391', type:'Reefer Truck (Large)', maker:'Ashok Leyland',
    capacity:'5,000 kg / 22,000 L', reeferSystem:'Thermo King T-680', tempRange:'-20°C to +10°C',
    status:'available', reeferHealth:98, sensorId:'IoT-4821', sensorBattery:78,
    lastPing:'2 min ago', gpsSignal:'Strong', calibrationValid:true,
    lastService:'8 days ago', nextService:'Oct 28 (20 days)', serviceOverdue:false,
    currentTemp:3.2, avgTempStability:'±0.3°C', doorSeal:true, compressor:true,
    compatibility:['Dairy','Seafood','Frozen','Pharma'],
    tripHistory:[
      {code:'AXN-2041',duration:'4h 02m',avgTemp:'3.8°C',tempOk:true,breaches:1},
      {code:'AXN-1998',duration:'2h 18m',avgTemp:'4.1°C',tempOk:true,breaches:0},
      {code:'AXN-1847',duration:'6h 44m',avgTemp:'3.6°C',tempOk:true,breaches:0},
      {code:'AXN-1721',duration:'3h 55m',avgTemp:'3.9°C',tempOk:true,breaches:0},
      {code:'AXN-1680',duration:'4h 28m',avgTemp:'4.0°C',tempOk:true,breaches:0},
    ],
  },
  {
    id:'VEH-0023', plate:'TN-01-AB-4521', type:'Reefer Truck (Large)', maker:'Tata Motors',
    capacity:'8,000 kg / 32,000 L', reeferSystem:'Carrier Transicold', tempRange:'-18°C to +12°C',
    status:'active', activeShip:'AXN-2091', reeferHealth:68, sensorId:'IoT-2044', sensorBattery:55,
    lastPing:'5 min ago', gpsSignal:'Moderate', calibrationValid:true,
    lastService:'24 days ago', nextService:'Nov 2 (4 days)', serviceOverdue:false,
    currentTemp:9.8, avgTempStability:'±1.2°C', doorSeal:true, compressor:false,
    compatibility:['Dairy','Seafood','Meat'],
    tripHistory:[
      {code:'AXN-2091',duration:'Active',avgTemp:'9.8°C',tempOk:false,breaches:1},
      {code:'AXN-2010',duration:'5h 00m',avgTemp:'5.4°C',tempOk:true,breaches:1},
      {code:'AXN-1940',duration:'4h 30m',avgTemp:'4.8°C',tempOk:true,breaches:0},
    ],
  },
  {
    id:'VEH-0031', plate:'KA-09-DC-7744', type:'Insulated Van', maker:'Force Traveller',
    capacity:'1,000 kg / 4,000 L', reeferSystem:'N/A — Insulated only', tempRange:'Ambient +2°C buffer',
    status:'available', reeferHealth:0, sensorBattery:0,
    lastPing:'N/A', gpsSignal:'N/A', calibrationValid:false,
    lastService:'3 days ago', nextService:'Nov 15 (17 days)', serviceOverdue:false,
    currentTemp:undefined, avgTempStability:'N/A', doorSeal:true, compressor:false,
    compatibility:['Produce','Fruits'],
    tripHistory:[
      {code:'AXN-1920',duration:'3h 10m',avgTemp:'Ambient',tempOk:true,breaches:0},
      {code:'AXN-1810',duration:'2h 40m',avgTemp:'Ambient',tempOk:true,breaches:0},
    ],
  },
  {
    id:'VEH-0038', plate:'AS-01-BC-1110', type:'Reefer Truck (Medium)', maker:'Eicher',
    capacity:'4,000 kg / 18,000 L', reeferSystem:'Thermo King V-500', tempRange:'-15°C to +8°C',
    status:'maintenance', reeferHealth:0, reeferFault:true, sensorId:'IoT-0092', sensorBattery:90,
    lastPing:'2 hrs ago', gpsSignal:'Parked', calibrationValid:true,
    lastService:'Overdue', nextService:'OVERDUE', serviceOverdue:true,
    currentTemp:undefined, avgTempStability:'N/A', doorSeal:false, compressor:false,
    compatibility:['Dairy','Meat'],
    tripHistory:[
      {code:'AXN-2010',duration:'4h 55m',avgTemp:'6.2°C',tempOk:false,breaches:3},
      {code:'AXN-1900',duration:'5h 20m',avgTemp:'5.8°C',tempOk:true,breaches:1},
    ],
  },
  {
    id:'VEH-0044', plate:'WB-08-EF-2291', type:'Reefer Truck (Large)', maker:'Ashok Leyland',
    capacity:'6,000 kg / 26,000 L', reeferSystem:'Carrier Vector 1850', tempRange:'-25°C to +12°C',
    status:'available', reeferHealth:94, sensorId:'IoT-3302', sensorBattery:88,
    lastPing:'1 min ago', gpsSignal:'Strong', calibrationValid:true,
    lastService:'6 days ago', nextService:'Nov 5 (7 days)', serviceOverdue:false,
    currentTemp:4.1, avgTempStability:'±0.4°C', doorSeal:true, compressor:true,
    compatibility:['Dairy','Seafood','Frozen','Pharma','Meat'],
    tripHistory:[
      {code:'AXN-2060',duration:'3h 44m',avgTemp:'4.2°C',tempOk:true,breaches:0},
      {code:'AXN-1970',duration:'5h 15m',avgTemp:'3.9°C',tempOk:true,breaches:0},
      {code:'AXN-1890',duration:'4h 30m',avgTemp:'4.1°C',tempOk:true,breaches:0},
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const statusBadge = (s: Driver['status']) => {
  const M = { available:['✅','#34D399'], active:['🔵','#60A5FA'], flagged:['⚠️','#FBBF24'], critical:['🔴','#EF4444'] };
  return M[s] ?? ['','#94A3B8'];
};
const vsBadge = (s: Vehicle['status']) => {
  const M = { available:['✅','#34D399'], active:['🔵','#60A5FA'], maintenance:['🔧','#A78BFA'] };
  return M[s] ?? ['','#94A3B8'];
};
const scoreColor = (n: number) => n >= 90 ? '#34D399' : n >= 80 ? '#4DD9AC' : n >= 60 ? '#FBBF24' : '#EF4444';
const reeferColor = (n: number) => n >= 90 ? '#34D399' : n >= 80 ? '#4DD9AC' : n >= 60 ? '#FBBF24' : '#EF4444';

function Stat({ label, value, color, sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div>
      <div className="text-[10px] text-[#64748B] uppercase tracking-widest">{label}</div>
      <div className="text-base font-black font-mono mt-0.5" style={{color:color??'#F1F5F9'}}>{value}</div>
      {sub && <div className="text-[10px] text-[#4A5568]">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function DriverDetail({ driver: d, onClose }: { driver: Driver; onClose: () => void }) {
  const [sbadge, scolor] = statusBadge(d.status);
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{fontFamily:'Inter,sans-serif'}}>
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] sticky top-0 bg-[#0A0D14] z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4DD9AC]/20 to-[#60A5FA]/20 border border-[#1E2530] flex items-center justify-center text-lg">👤</div>
            <div>
              <div className="font-bold text-[#F1F5F9]">{d.name}</div>
              <div className="text-[10px] text-[#64748B]">{d.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{color:scolor, background:`${scolor}18`}}>{sbadge} {d.status.toUpperCase()}</span>
            <button onClick={onClose} className="text-[#4A5568] hover:text-white text-lg leading-none">×</button>
          </div>
        </div>
        <div className="text-xs text-[#94A3B8] space-y-0.5 mt-2">
          <div>📞 {d.phone} · 💬 WhatsApp {d.waVerified ? '✅':'❌'}</div>
          <div>📍 {d.location} · 🗓 Joined {d.joined}</div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Performance metrics */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3">📊 Performance Metrics</div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total Trips" value={String(d.trips)}/>
            <Stat label="Performance Score" value={String(d.score)} color={scoreColor(d.score)}/>
            <Stat label="Alert Ack Rate" value={`${d.ackRate}%`} color={d.ackRate>=90?'#34D399':d.ackRate>=75?'#FBBF24':'#EF4444'} sub="Network avg: 84%"/>
            <Stat label="Avg Delay" value={`${d.avgDelay} min`} color={d.avgDelay<=12?'#34D399':d.avgDelay<=20?'#FBBF24':'#EF4444'} sub="Network avg: 18 min"/>
            <Stat label="Excursions" value={String(d.excursions)} color={d.excursions<=2?'#34D399':d.excursions<=5?'#FBBF24':'#EF4444'} sub="Network avg: 4.2"/>
            <Stat label="SLA Breach Rate" value={`${d.slaBreachRate}%`} color={d.slaBreachRate<=4?'#34D399':d.slaBreachRate<=10?'#FBBF24':'#EF4444'}/>
          </div>
          {/* Score bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#64748B]">Overall Score</span>
              <span className="font-mono font-bold" style={{color:scoreColor(d.score)}}>{d.score}/100</span>
            </div>
            <div className="h-2 bg-[#1E2530] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{width:`${d.score}%`, background:scoreColor(d.score)}}/>
            </div>
          </div>
        </div>

        {/* Current trip */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-2">🚛 Current Trip</div>
          {d.activeShip ? (
            <button onClick={()=>navigate(`/shipments/${d.activeShip}`)} className="text-xs text-[#60A5FA] font-mono font-bold hover:underline">{d.activeShip} →</button>
          ) : (
            <div className="text-xs text-[#4A5568] italic">No active trip assigned</div>
          )}
        </div>

        {/* Trip history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">📦 Trip History (last {d.tripHistory.length})</div>
          <div className="divide-y divide-[#1E2530]">
            {d.tripHistory.map((t,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[#0D1117] transition-colors">
                <span className="font-mono text-[#4DD9AC] w-18 shrink-0">{t.code}</span>
                <span className="text-lg shrink-0">{t.icon}</span>
                <span className="text-[#64748B] w-16 shrink-0">{t.route}</span>
                <span className="text-[#94A3B8]">{t.duration}</span>
                <span className="ml-auto" style={{color:t.onTime?'#34D399':'#FBBF24'}}>{t.onTime?'✅ On time':`⚠️ +${t.delayMin}m`}</span>
                <span className="text-[10px]" style={{color:t.excursions===0?'#34D399':'#F87171'}}>{t.excursions===0?'No exc.':`${t.excursions} exc.`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alert response history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">🔔 Alert Response History</div>
          <div className="divide-y divide-[#1E2530]">
            {d.alertHistory.map((a,i)=>{
              const acked = a.ackMin < 999;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <span style={{color:acked?'#34D399':'#EF4444'}}>{acked?'✅':'❌'}</span>
                  <span className="text-[#94A3B8]">{acked?`Acked in ${a.ackMin} min`:'Not acknowledged'}</span>
                  <span className="font-mono text-[#4DD9AC]">{a.ship}</span>
                  <span className="text-[#64748B]">{a.type}</span>
                  <span className="ml-auto text-[#4A5568] text-[10px]">{a.time}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Products */}
        <div className="flex gap-2 flex-wrap">
          {d.products.map(p=><span key={p} className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#94A3B8] px-2 py-1 rounded-full">✅ {p} certified</span>)}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {icon:'📞',label:'Call Driver',    color:'#34D399'},
            {icon:'💬',label:'WhatsApp',       color:'#4DD9AC'},
            {icon:'📤',label:'Assign Trip',    color:'#60A5FA'},
            {icon:'⚠️',label:'Flag Driver',    color:'#FBBF24'},
            {icon:'📋',label:'Perf. Report',   color:'#A78BFA'},
            {icon:'🚚',label:'View Shipment',  color:'#F97316'},
          ].map(b=>(
            <button key={b.label} className="text-xs py-2 px-3 rounded-lg border border-[#1E2530] bg-[#111827] font-semibold hover:brightness-110 transition-all text-left"
              style={{color:b.color}}>
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function VehicleDetail({ vehicle: v, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [sbadge, scolor] = vsBadge(v.status);
  const rHealth = v.reeferFault ? 0 : v.reeferHealth;
  const rColor  = v.reeferFault ? '#EF4444' : reeferColor(rHealth);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{fontFamily:'Inter,sans-serif'}}>
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#1E2530] sticky top-0 bg-[#0A0D14] z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#60A5FA]/20 to-[#A78BFA]/20 border border-[#1E2530] flex items-center justify-center text-lg">🚛</div>
            <div>
              <div className="font-bold font-mono text-[#F1F5F9] text-lg">{v.plate}</div>
              <div className="text-[10px] text-[#64748B]">{v.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{color:scolor, background:`${scolor}18`}}>{sbadge} {v.status.toUpperCase()}</span>
            <button onClick={onClose} className="text-[#4A5568] hover:text-white text-lg leading-none">×</button>
          </div>
        </div>
        <div className="text-xs text-[#94A3B8] space-y-0.5 mt-1">
          <div>{v.type} · {v.maker} · {v.capacity}</div>
          {v.activeShip && <div className="text-[#60A5FA] font-semibold">→ Active on {v.activeShip}</div>}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Specs */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3">🔧 Specifications</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[['Reefer System', v.reeferSystem],['Temp Range', v.tempRange],['Capacity', v.capacity],['Manufacturer', v.maker]].map(([l,val])=>(
              <div key={l}>
                <div className="text-[#64748B]">{l}</div>
                <div className="font-semibold text-[#F1F5F9]">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reefer health */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3">❄️ Reefer Health</div>
          {v.reeferFault ? (
            <div className="text-sm font-bold text-[#EF4444] mb-2">⚠️ FAULT DETECTED — MAINTENANCE REQUIRED</div>
          ) : v.reeferHealth === 0 ? (
            <div className="text-sm text-[#64748B] mb-2">N/A — Insulated van</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#94A3B8]">Health Score</span>
                <span className="font-mono font-bold text-sm" style={{color:rColor}}>{v.reeferHealth}%</span>
              </div>
              <div className="h-3 bg-[#1E2530] rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-700" style={{width:`${v.reeferHealth}%`, background:rColor}}/>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Avg Temp Stability', v.avgTempStability],
              ['Door Seal', v.doorSeal?'✅ Intact':'❌ Compromised'],
              ['Compressor', v.compressor?'✅ Normal':'❌ Fault'],
              ['Current Temp', v.currentTemp != null ? `${v.currentTemp}°C` : 'N/A'],
            ].map(([l,val])=>(
              <div key={l}>
                <div className="text-[#64748B]">{l}</div>
                <div className="font-semibold text-[#F1F5F9]">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Service */}
        <div className={`border rounded-xl p-4 ${v.serviceOverdue?'bg-[#1A0D0D] border-[#EF4444]/30':'bg-[#111827] border-[#1E2530]'}`}>
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-2">🗓 Maintenance</div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-[#64748B]">Last service</span><span className="text-[#F1F5F9]">{v.lastService}</span></div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Next service</span>
              <span className="font-bold" style={{color:v.serviceOverdue?'#EF4444':'#34D399'}}>{v.nextService}</span>
            </div>
          </div>
        </div>

        {/* IoT sensor */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl p-4">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold mb-3">📡 IoT Sensor</div>
          {v.sensorId ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['Sensor ID', v.sensorId],
                ['Battery', v.sensorBattery ? `${v.sensorBattery}%` : 'N/A'],
                ['Last Ping', v.lastPing ?? 'N/A'],
                ['GPS Signal', v.gpsSignal],
                ['Calibration', v.calibrationValid ? '✅ Valid' : '⚠️ Expired'],
              ].map(([l,val])=>(
                <div key={l}>
                  <div className="text-[#64748B]">{l}</div>
                  <div className="font-semibold text-[#F1F5F9]">{val}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#FBBF24] font-semibold">⚠️ No IoT device paired — assign sensor first</div>
          )}
        </div>

        {/* Trip history */}
        <div className="bg-[#111827] border border-[#1E2530] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2530] text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">📦 Trip History</div>
          <div className="divide-y divide-[#1E2530]">
            {v.tripHistory.map((t,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="font-mono text-[#4DD9AC] w-18 shrink-0">{t.code}</span>
                <span className="text-[#94A3B8]">{t.duration}</span>
                <span className="text-[#64748B]">Avg: {t.avgTemp}</span>
                <span className="ml-auto" style={{color:t.tempOk?'#34D399':'#F87171'}}>{t.tempOk?'✅':'⚠️'}</span>
                <span style={{color:t.breaches===0?'#34D399':'#F87171'}}>{t.breaches===0?'No breach':`${t.breaches} breach`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Compatibility */}
        <div className="flex gap-2 flex-wrap">
          {v.compatibility.map(p=><span key={p} className="text-[10px] bg-[#111827] border border-[#1E2530] text-[#4DD9AC] px-2 py-1 rounded-full">{p} ✅</span>)}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {icon:'📤',label:'Assign to Shipment', color:'#4DD9AC'},
            {icon:'🔧',label:'Schedule Service',    color:'#A78BFA'},
            {icon:'📡',label:'Live Sensor View',    color:'#60A5FA'},
            {icon:'⚠️',label:'Flag Issue',          color:'#FBBF24'},
            {icon:'📋',label:'Vehicle Report',      color:'#F97316'},
          ].map(b=>(
            <button key={b.label} className="text-xs py-2 px-3 rounded-lg border border-[#1E2530] bg-[#111827] font-semibold hover:brightness-110 transition-all text-left"
              style={{color:b.color}}>
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Driver Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddDriverModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name:'', phone:'', license:'', exp:'', pharma:false, dairy:true, seafood:false, frozen:false, notes:'' });
  const [step, setStep] = useState<'form'|'done'>('form');

  const submit = () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setStep('done');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl w-96 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9]">➕ Add New Driver</div>
          <button onClick={onClose} className="text-[#64748B] hover:text-white text-lg">×</button>
        </div>
        {step === 'done' ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-4xl">✅</span>
            <div className="text-sm font-bold text-[#34D399]">Driver Added!</div>
            <div className="text-xs text-[#64748B]">{form.name} has been added to the fleet.</div>
            <button onClick={onClose} className="mt-2 text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-4 py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {[['Full Name','name','text','Ramesh Kumar'],['Phone Number','phone','tel','+91 98765 43210'],['Driver License No.','license','text','DL-14 2019 0388041'],['Experience (years)','exp','number','3']].map(([l,k,t,ph])=>(
              <div key={k}>
                <div className="text-[10px] text-[#64748B] mb-1">{l}</div>
                <input type={t} placeholder={ph} value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              </div>
            ))}
            <div>
              <div className="text-[10px] text-[#64748B] mb-1.5">Product Training</div>
              <div className="flex flex-wrap gap-2">
                {[['dairy','🥛 Dairy'],['seafood','🐟 Seafood'],['frozen','🧊 Frozen'],['pharma','💊 Pharma']].map(([k,l])=>(
                  <label key={k} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${(form as any)[k]?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>
                    <input type="checkbox" checked={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.checked}))} className="hidden"/>
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#64748B] mb-1">Notes</div>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes…" rows={2}
                className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40 resize-none"/>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 border border-[#1E2530] text-[#64748B] text-xs py-2 rounded-lg hover:border-[#374151]">Cancel</button>
              <button onClick={submit} className="flex-1 bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] text-xs py-2 rounded-lg font-semibold hover:bg-[#4DD9AC]/20 transition-colors">Add Driver</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Vehicle Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddVehicleModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ plate:'', type:'reefer', maker:'', capacity:'', sensorId:'', reeferSystem:'' });
  const [step, setStep] = useState<'form'|'done'>('form');

  const submit = () => {
    if (!form.plate.trim()) return;
    setStep('done');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#111827] border border-[#1E2530] rounded-2xl w-96 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2530]">
          <div className="text-sm font-bold text-[#F1F5F9]">➕ Add New Vehicle</div>
          <button onClick={onClose} className="text-[#64748B] hover:text-white text-lg">×</button>
        </div>
        {step === 'done' ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <span className="text-4xl">🚛</span>
            <div className="text-sm font-bold text-[#4DD9AC]">Vehicle Added!</div>
            <div className="text-xs text-[#64748B]">{form.plate} registered to your fleet.</div>
            <button onClick={onClose} className="mt-2 text-xs bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-4 py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {[['Vehicle Plate','plate','text','MH-12-AB-0000'],['Manufacturer','maker','text','Ashok Leyland'],['Capacity (kg)','capacity','text','5000 kg / 22000 L'],['Reefer System','reeferSystem','text','Thermo King T-680'],['IoT Sensor ID','sensorId','text','IoT-0000 (optional)']].map(([l,k,t,ph])=>(
              <div key={k}>
                <div className="text-[10px] text-[#64748B] mb-1">{l}</div>
                <input type={t} placeholder={ph} value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-[#0D1117] border border-[#1E2530] rounded-lg px-3 py-2 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              </div>
            ))}
            <div>
              <div className="text-[10px] text-[#64748B] mb-1">Vehicle Type</div>
              <div className="flex gap-2">
                {[['reefer','🚛 Reefer Truck'],['van','🚐 Insulated Van'],['flatbed','📦 Flatbed']].map(([k,l])=>(
                  <button key={k} onClick={()=>setForm(f=>({...f,type:k}))}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${form.type===k?'bg-[#60A5FA]/10 border-[#60A5FA]/30 text-[#60A5FA]':'border-[#1E2530] text-[#64748B]'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 border border-[#1E2530] text-[#64748B] text-xs py-2 rounded-lg hover:border-[#374151]">Cancel</button>
              <button onClick={submit} className="flex-1 bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs py-2 rounded-lg font-semibold hover:bg-[#60A5FA]/20 transition-colors">Add Vehicle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function FleetAndDrivers() {
  const navigate = useNavigate();
  const [tab,           setTab]     = useState<'drivers'|'vehicles'>('drivers');
  const [dSearch,       setDSearch] = useState('');
  const [vSearch,       setVSearch] = useState('');
  const [dFilter,       setDFilter] = useState<'all'|'available'|'active'|'flagged'>('all');
  const [vFilter,       setVFilter] = useState<'all'|'available'|'active'|'maintenance'>('all');
  const [selDriver,     setSelDriver]   = useState<Driver|null>(DRIVERS[0]);
  const [selVehicle,    setSelVehicle]  = useState<Vehicle|null>(VEHICLES[0]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddVehicle,setShowAddVehicle] = useState(false);
  const [lbSort,        setLbSort]       = useState<keyof Driver>('score');
  const [lbDir,         setLbDir]        = useState<'asc'|'desc'>('desc');
  const [shipments,     setShipments]    = useState<Shipment[]>([]);
  const [liveDrivers,   setLiveDrivers]  = useState<FleetDriver[]>([]);
  const [liveVehicles,  setLiveVehicles] = useState<FleetVehicle[]>([]);
  const [fleetSummary,  setFleetSummary] = useState<FleetHealthSummary|null>(null);

  useEffect(() => {
    getShipments('all').then(setShipments).catch(() => {});
    // Load live fleet data; fall back silently to static DRIVERS/VEHICLES
    getFleetDrivers().then(r => setLiveDrivers(r.drivers)).catch(() => {});
    getFleetVehicles().then(r => setLiveVehicles(r.vehicles)).catch(() => {});
    getFleetHealthSummary().then(setFleetSummary).catch(() => {});
  }, []);

  // Merge: prefer live API, fall back to static data
  const mergedDrivers: Driver[] = liveDrivers.length > 0
    ? liveDrivers.map(ld => {
        const stat = DRIVERS.find(d => d.id === ld.id || d.phone.replace(/\s/g,'') === ld.phone.replace(/\s/g,''));
        return stat
          ? { ...stat, trips: ld.total_trips, ackRate: ld.ack_rate, avgDelay: ld.avg_delay_minutes, excursions: ld.excursion_count_30d, score: ld.performance_score, status: ld.status.toLowerCase() as Driver['status'], activeShip: ld.active_trip_id ?? undefined }
          : { ...DRIVERS[0], id: ld.id, name: ld.name, phone: ld.phone, status: ld.status.toLowerCase() as Driver['status'], trips: ld.total_trips, ackRate: ld.ack_rate, avgDelay: ld.avg_delay_minutes, excursions: ld.excursion_count_30d, score: ld.performance_score };
      })
    : DRIVERS;

  const mergedVehicles: Vehicle[] = liveVehicles.length > 0
    ? liveVehicles.map(lv => {
        const stat = VEHICLES.find(v => v.id === lv.id || v.plate === lv.plate);
        return stat
          ? { ...stat, reeferHealth: lv.reefer_health_score, status: lv.status.toLowerCase() as Vehicle['status'], sensorId: lv.paired_sensor_id ?? undefined, sensorBattery: lv.sensor_battery_pct }
          : { ...VEHICLES[0], id: lv.id, plate: lv.plate, reeferHealth: lv.reefer_health_score, status: lv.status.toLowerCase() as Vehicle['status'], maker: lv.manufacturer };
      })
    : VEHICLES;

  // Enrich drivers with active shipment code from Postgres
  const enrichedDrivers = mergedDrivers.map(d => {
    const activeShip = shipments.find(s => s.driver_phone === d.phone && s.status === 'active');
    return activeShip ? {...d, activeShip: activeShip.shipment_code, status: 'active' as const} : d;
  });

  const filteredDrivers = enrichedDrivers
    .filter(d => dFilter==='all' || d.status===dFilter || (dFilter==='flagged' && (d.status==='flagged'||d.status==='critical')))
    .filter(d => !dSearch || d.name.toLowerCase().includes(dSearch.toLowerCase()) || d.phone.includes(dSearch));

  const filteredVehicles = mergedVehicles
    .filter(v => vFilter==='all' || v.status===vFilter)
    .filter(v => !vSearch || v.plate.toLowerCase().includes(vSearch.toLowerCase()) || v.maker.toLowerCase().includes(vSearch.toLowerCase()));

  const lbSorted = [...enrichedDrivers].sort((a,b) => {
    const av = a[lbSort] as number, bv = b[lbSort] as number;
    return lbDir==='desc' ? bv-av : av-bv;
  });

  const dAvail   = fleetSummary?.drivers.available ?? enrichedDrivers.filter(d=>d.status==='available').length;
  const dActive  = fleetSummary?.drivers.active    ?? enrichedDrivers.filter(d=>d.status==='active').length;
  const dFlagged = fleetSummary?.drivers.flagged   ?? enrichedDrivers.filter(d=>d.status==='flagged'||d.status==='critical').length;

  const vAvail   = fleetSummary?.vehicles.available    ?? mergedVehicles.filter(v=>v.status==='available').length;
  const vActive  = fleetSummary?.vehicles.active       ?? mergedVehicles.filter(v=>v.status==='active').length;
  const vMaint   = fleetSummary?.vehicles.maintenance  ?? mergedVehicles.filter(v=>v.status==='maintenance').length;
  const avgReefer = fleetSummary?.vehicles.avg_reefer_health ?? Math.round(mergedVehicles.filter(v=>v.reeferHealth>0).reduce((s,v)=>s+v.reeferHealth,0)/Math.max(mergedVehicles.filter(v=>v.reeferHealth>0).length,1));
  const needService = VEHICLES.filter(v=>v.serviceOverdue||v.nextService.includes('7 days')||v.nextService.includes('4 days')).length;
  const noIoT = VEHICLES.filter(v=>!v.sensorId).length;

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{fontFamily:'Inter,sans-serif'}}>

      {/* Modals */}
      {showAddDriver  && <AddDriverModal  onClose={()=>setShowAddDriver(false)}/>}
      {showAddVehicle && <AddVehicleModal onClose={()=>setShowAddVehicle(false)}/>}

      {/* ── Top Nav ───────────────────────────────────────────────── */}
      <header className="shrink-0 bg-[#0A0D14] border-b border-[#1E2530] px-5 py-3 flex items-center gap-4 z-40">
        <span className="text-[#4DD9AC] font-black text-xl tracking-tighter cursor-pointer" onClick={()=>navigate('/dashboard')}>AXON</span>
        <div className="h-5 w-px bg-[#1E2530]"/>
        <span className="text-sm text-[#94A3B8]">🚛 Fleet & Drivers</span>
        <div className="flex-1"/>
        <button onClick={()=>navigate('/dashboard')} className="text-[10px] border border-[#1E2530] text-[#64748B] hover:text-white px-3 py-1.5 rounded transition-colors">← Dashboard</button>
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-5 flex items-center gap-1">
        {([['drivers','👤 Drivers'],['vehicles','🚛 Vehicles']] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${tab===k?'border-[#4DD9AC] text-[#4DD9AC]':'border-transparent text-[#64748B] hover:text-[#94A3B8]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── DRIVERS TAB ───────────────────────────────────────────── */}
      {tab === 'drivers' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Top stats + list */}
          <div className="flex flex-col w-[55%] shrink-0 border-r border-[#1E2530] overflow-hidden">
            {/* Stats header */}
            <div className="shrink-0 px-4 py-3 border-b border-[#1E2530] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-[#F1F5F9]">DRIVERS</span>
                <span className="text-[#64748B]">{enrichedDrivers.length} total</span>
                <span className="text-[#34D399]">✅ {dAvail} Available</span>
                <span className="text-[#60A5FA]">🔵 {dActive} Active</span>
                {dFlagged > 0 && <span className="text-[#EF4444]">🔴 {dFlagged} Flagged</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setShowLeaderboard(s=>!s)} className="text-[10px] border border-[#1E2530] text-[#A78BFA] hover:border-[#A78BFA]/40 px-2.5 py-1.5 rounded transition-colors">🏆 Leaderboard</button>
                <button onClick={()=>setShowAddDriver(true)} className="text-[10px] bg-[#4DD9AC]/10 border border-[#4DD9AC]/30 text-[#4DD9AC] px-2.5 py-1.5 rounded hover:bg-[#4DD9AC]/20 transition-colors">+ Add Driver</button>
              </div>
            </div>

            {/* Search + filter */}
            <div className="shrink-0 px-4 py-2.5 border-b border-[#1E2530] flex gap-2">
              <input value={dSearch} onChange={e=>setDSearch(e.target.value)} placeholder="🔍 Search driver…"
                className="flex-1 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-1.5 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              {(['all','available','active','flagged'] as const).map(f=>(
                <button key={f} onClick={()=>setDFilter(f)}
                  className={`text-[10px] px-2.5 py-1.5 rounded border capitalize transition-colors ${dFilter===f?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>
                  {f}
                </button>
              ))}
            </div>

            {/* Leaderboard */}
            {showLeaderboard && (
              <div className="shrink-0 border-b border-[#1E2530] overflow-x-auto">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-[#A78BFA] font-bold uppercase tracking-widest">🏆 Leaderboard — October 2024</span>
                  <div className="flex gap-1">
                    {(['score','ackRate','avgDelay','excursions'] as const).map(k=>(
                      <button key={k} onClick={()=>{ if(lbSort===k) setLbDir(d=>d==='asc'?'desc':'asc'); else{setLbSort(k);setLbDir('desc');} }}
                        className={`text-[9px] px-2 py-1 rounded border transition-colors ${lbSort===k?'bg-[#A78BFA]/10 border-[#A78BFA]/30 text-[#A78BFA]':'border-[#1E2530] text-[#64748B]'}`}>
                        {k==='ackRate'?'Ack%':k==='avgDelay'?'Delay':k==='excursions'?'Exc.':'Score'} {lbSort===k?(lbDir==='desc'?'↓':'↑'):''}
                      </button>
                    ))}
                  </div>
                </div>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-[#1E2530]">
                    {lbSorted.map((d,i)=>{
                      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1);
                      return (
                        <tr key={d.id} className="hover:bg-[#111827] transition-colors cursor-pointer" onClick={()=>setSelDriver(d)}>
                          <td className="px-4 py-2 text-center">{medal}</td>
                          <td className="px-2 py-2 font-semibold text-[#F1F5F9]">{d.name}</td>
                          <td className="px-2 py-2 text-[#64748B]">{d.trips}</td>
                          <td className="px-2 py-2 font-mono" style={{color:d.ackRate>=90?'#34D399':d.ackRate>=75?'#FBBF24':'#EF4444'}}>{d.ackRate}%</td>
                          <td className="px-2 py-2 font-mono" style={{color:d.avgDelay<=12?'#34D399':d.avgDelay<=25?'#FBBF24':'#EF4444'}}>{d.avgDelay}m</td>
                          <td className="px-2 py-2 font-mono" style={{color:d.excursions<=2?'#34D399':d.excursions<=5?'#FBBF24':'#EF4444'}}>{d.excursions}</td>
                          <td className="px-3 py-2 font-mono font-bold" style={{color:scoreColor(d.score)}}>{d.score}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Driver list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1E2530]">
              {filteredDrivers.map(d=>{
                const [badge, color] = statusBadge(d.status);
                const isSel = selDriver?.id === d.id;
                return (
                  <button key={d.id} onClick={()=>setSelDriver(d)} className="w-full text-left px-4 py-3.5 transition-colors hover:bg-[#111827] relative"
                    style={{ background:isSel?'#111827':'transparent', borderLeft:`3px solid ${d.status==='active'?'#60A5FA':d.status==='flagged'?'#FBBF24':d.status==='critical'?'#EF4444':'transparent'}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">👤</span>
                        <span className="font-semibold text-sm text-[#F1F5F9]">{d.name}</span>
                        {d.flagReason && <span className="text-[9px] text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">{d.status==='critical'?'🔴':'⚠️'}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold" style={{color}}>Ack: {d.ackRate}%{d.ackRate<75?' ⚠️':''}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{color, background:`${color}15`}}>{badge} {d.status.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                      <span>{d.phone} · 💬 {d.waVerified?'WA ✓':'WA ✗'}</span>
                      <span>{d.activeShip ? `Trip: ${d.activeShip} active` : `Last trip: ${d.lastTrip}`}</span>
                      <span style={{color:d.avgDelay>25?'#F87171':'#64748B'}}>Delay avg: {d.avgDelay} min{d.avgDelay>25?' ⚠️':''}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
            {selDriver
              ? <DriverDetail driver={selDriver} onClose={()=>setSelDriver(null)}/>
              : <div className="flex flex-col items-center justify-center h-full text-center px-8"><span className="text-5xl mb-4">👤</span><div className="text-[#64748B]">Select a driver to view their profile</div></div>
            }
          </div>
        </div>
      )}

      {/* ── VEHICLES TAB ──────────────────────────────────────────── */}
      {tab === 'vehicles' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT */}
          <div className="flex flex-col w-[55%] shrink-0 border-r border-[#1E2530] overflow-hidden">
            {/* Fleet health summary */}
            <div className="shrink-0 px-4 py-3 border-b border-[#1E2530]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">🚛 Fleet Health Overview</span>
                <div className="flex gap-2">
                  <button onClick={()=>setShowAddVehicle(true)} className="text-[10px] bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] px-2.5 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors">+ Add Vehicle</button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  {label:'Total', value:String(VEHICLES.length), color:'#F1F5F9'},
                  {label:'Available', value:String(vAvail), color:'#34D399'},
                  {label:'Active', value:String(vActive), color:'#60A5FA'},
                  {label:'Maintenance', value:String(vMaint), color:'#A78BFA'},
                  {label:'Avg Reefer', value:`${avgReefer}%`, color:reeferColor(avgReefer)},
                ].map(s=>(
                  <div key={s.label} className="bg-[#111827] border border-[#1E2530] rounded-lg px-2.5 py-2">
                    <div className="text-[9px] text-[#64748B] uppercase">{s.label}</div>
                    <div className="font-black font-mono text-sm" style={{color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>
              {(needService > 0 || noIoT > 0) && (
                <div className="flex gap-2 mt-2">
                  {needService > 0 && <span className="text-[9px] text-[#FBBF24] bg-[#FBBF24]/08 border border-[#FBBF24]/25 px-2.5 py-1 rounded-full">⚠️ {needService} vehicles service due soon</span>}
                  {noIoT > 0 && <span className="text-[9px] text-[#F97316] bg-[#F97316]/08 border border-[#F97316]/25 px-2.5 py-1 rounded-full">⚠️ {noIoT} vehicles without IoT sensor</span>}
                </div>
              )}
            </div>

            {/* Search + filter */}
            <div className="shrink-0 px-4 py-2.5 border-b border-[#1E2530] flex gap-2">
              <input value={vSearch} onChange={e=>setVSearch(e.target.value)} placeholder="🔍 Search vehicle…"
                className="flex-1 bg-[#111827] border border-[#1E2530] rounded-lg px-3 py-1.5 text-xs text-[#CBD5E1] placeholder-[#4A5568] focus:outline-none focus:border-[#4DD9AC]/40"/>
              {(['all','available','active','maintenance'] as const).map(f=>(
                <button key={f} onClick={()=>setVFilter(f)}
                  className={`text-[10px] px-2.5 py-1.5 rounded border capitalize transition-colors ${vFilter===f?'bg-[#4DD9AC]/10 border-[#4DD9AC]/30 text-[#4DD9AC]':'border-[#1E2530] text-[#64748B]'}`}>
                  {f}
                </button>
              ))}
            </div>

            {/* Vehicle list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1E2530]">
              {filteredVehicles.map(v=>{
                const [badge, color] = vsBadge(v.status);
                const rh = v.reeferFault ? 0 : v.reeferHealth;
                const rc = v.reeferFault ? '#EF4444' : reeferColor(rh);
                const isSel = selVehicle?.id === v.id;
                return (
                  <button key={v.id} onClick={()=>setSelVehicle(v)} className="w-full text-left px-4 py-3.5 transition-colors hover:bg-[#111827]"
                    style={{ background:isSel?'#111827':'transparent', borderLeft:`3px solid ${v.status==='maintenance'?'#EF4444':v.status==='active'?'#60A5FA':'transparent'}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{v.type.includes('Van')?'🚐':'🚛'}</span>
                        <span className="font-mono font-bold text-sm text-[#F1F5F9]">{v.plate}</span>
                        <span className="text-[10px] text-[#64748B]">{v.type.split('(')[0].trim()}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{color, background:`${color}15`}}>{badge} {v.status.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B] gap-3">
                      <span>{v.maker} · {v.capacity.split('/')[0].trim()}</span>
                      {v.reeferHealth > 0 && (
                        <span className="flex items-center gap-1.5">
                          Reefer:
                          <div className="w-16 h-1.5 bg-[#1E2530] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${rh}%`, background:rc}}/>
                          </div>
                          <span className="font-mono font-bold" style={{color:rc}}>{v.reeferFault?'FAULT':`${rh}%`}</span>
                        </span>
                      )}
                      {v.sensorId ? <span className="text-[#34D399]">✅ {v.sensorId}</span> : <span className="text-[#FBBF24]">⚠️ No sensor</span>}
                      <span style={{color:v.serviceOverdue?'#EF4444':'#64748B'}}>Svc: {v.serviceOverdue?'OVERDUE':v.lastService}</span>
                      {v.currentTemp != null && <span style={{color:v.currentTemp > 8?'#EF4444':'#34D399'}}>Temp: {v.currentTemp}°C</span>}
                      {v.activeShip && <span className="text-[#60A5FA]">→ {v.activeShip}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 min-w-0 bg-[#080B12] overflow-hidden">
            {selVehicle
              ? <VehicleDetail vehicle={selVehicle} onClose={()=>setSelVehicle(null)}/>
              : <div className="flex flex-col items-center justify-center h-full text-center px-8"><span className="text-5xl mb-4">🚛</span><div className="text-[#64748B]">Select a vehicle to view its health profile</div></div>
            }
          </div>
        </div>
      )}
    </div>
  );
}
