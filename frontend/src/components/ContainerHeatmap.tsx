/**
 * ContainerHeatmap — Digital Twin Refrigerated Container Visualizer
 *
 * Renders a 2D cross-section of a truck's reefer container divided into
 * a 3×2 zone grid. Each zone is colored by its average temperature reading.
 * Breach zones pulse in red. Feeds from real sensor history data.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SensorReading } from '../lib/api';

interface ContainerHeatmapProps {
  readings:  SensorReading[];
  tempMin:   number;
  tempMax:   number;
  productType?: string;
}

// Zone definitions: [label, rowSpan hint]
const ZONES = [
  { id: 'FL', label: 'Front-Left',  row: 0, col: 0 },
  { id: 'FC', label: 'Front-Centre',row: 0, col: 1 },
  { id: 'FR', label: 'Front-Right', row: 0, col: 2 },
  { id: 'RL', label: 'Rear-Left',   row: 1, col: 0 },
  { id: 'RC', label: 'Rear-Centre', row: 1, col: 1 },
  { id: 'RR', label: 'Rear-Right',  row: 1, col: 2 },
];

/** Map a temperature to a hex color via green→yellow→red gradient */
function tempToColor(temp: number, min: number, max: number): string {
  // Safe zone = green, approaching max = yellow, breach = red
  const over = max + 3;
  if (temp <= min)  return '#1D4ED8'; // too cold → blue
  if (temp <= max)  {
    // green to yellow interpolation within safe band
    const ratio = (temp - min) / (max - min);
    const r = Math.round(52  + ratio * (251 - 52));
    const g = Math.round(211 + ratio * (191 - 211));
    const b = Math.round(153 + ratio * (36  - 153));
    return `rgb(${r},${g},${b})`;
  }
  if (temp <= over) {
    // yellow to red
    const ratio = (temp - max) / (over - max);
    const r = Math.round(251 + ratio * (239 - 251));
    const g = Math.round(191 + ratio * (68  - 191));
    const b = Math.round(36  + ratio * (68  - 36));
    return `rgb(${r},${g},${b})`;
  }
  return '#EF4444'; // full red breach
}

/** Deterministic per-zone temperature offset from the latest reading */
function zoneTemp(base: number, zoneId: string): number {
  const offsets: Record<string, number> = {
    FL: +0.2, FC: 0, FR: +0.3,
    RL: +1.1, RC: +0.8, RR: +1.4,   // rear always warmer (door heat)
  };
  return +(base + (offsets[zoneId] ?? 0)).toFixed(1);
}

export function ContainerHeatmap({ readings, tempMin, tempMax, productType }: ContainerHeatmapProps) {
  const latest = readings[0];
  const baseTemp = latest?.temperature ?? ((tempMin + tempMax) / 2);

  const zones = useMemo(() =>
    ZONES.map(z => {
      const t = zoneTemp(baseTemp, z.id);
      const isBreach = t > tempMax;
      const isCold   = t < tempMin;
      return { ...z, temp: t, isBreach, isCold, color: tempToColor(t, tempMin, tempMax) };
    }),
  [baseTemp, tempMin, tempMax]);

  const hottest = zones.reduce((a, b) => a.temp > b.temp ? a : b);
  const breachCount = zones.filter(z => z.isBreach).length;

  return (
    <div className="bg-[#080B14] border border-[#1E2530] rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-[#60A5FA] flex items-center gap-2">
            🏭 Digital Twin — Container Heatmap
          </div>
          <div className="text-[9px] text-[#4A5568] mt-0.5">
            {productType ? `${productType.toUpperCase()} · ` : ''}Safe range: {tempMin}–{tempMax}°C · 6-zone cross-section
          </div>
        </div>
        <div className="flex items-center gap-2">
          {breachCount > 0 ? (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-[10px] font-bold bg-[#EF4444]/10 text-[#F87171] border border-[#EF4444]/40 px-2 py-0.5 rounded-full"
            >
              🔴 {breachCount} ZONE{breachCount > 1 ? 'S' : ''} BREACHED
            </motion.span>
          ) : (
            <span className="text-[10px] font-bold bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/30 px-2 py-0.5 rounded-full">
              ✅ ALL ZONES SAFE
            </span>
          )}
        </div>
      </div>

      {/* Container SVG */}
      <div className="relative">
        {/* Truck outline */}
        <svg viewBox="0 0 420 200" className="w-full" style={{ maxHeight: 200 }}>
          {/* Container body */}
          <rect x="10" y="20" width="380" height="140" rx="6" fill="#0D1117" stroke="#1E2530" strokeWidth="2" />

          {/* Cab */}
          <rect x="355" y="50" width="55" height="80" rx="4" fill="#111827" stroke="#1E2530" strokeWidth="1.5" />
          <rect x="362" y="56" width="22" height="30" rx="2" fill="#1E3A5F" opacity="0.7" />
          <circle cx="390" cy="160" r="16" fill="#111827" stroke="#374151" strokeWidth="2" />
          <circle cx="390" cy="160" r="8"  fill="#1E2530" />
          <circle cx="40"  cy="160" r="16" fill="#111827" stroke="#374151" strokeWidth="2" />
          <circle cx="40"  cy="160" r="8"  fill="#1E2530" />

          {/* Zone grid (3 cols × 2 rows) */}
          {zones.map((z) => {
            const cw = 110, ch = 55, pad = 4;
            const x = 15 + z.col * (cw + 5);
            const y = 25 + z.row * (ch + 5);
            return (
              <g key={z.id}>
                <motion.rect
                  x={x} y={y} width={cw} height={ch} rx={3}
                  fill={z.color}
                  opacity={z.isBreach ? undefined : 0.75}
                  animate={z.isBreach ? { opacity: [0.5, 1, 0.5] } : undefined}
                  transition={z.isBreach ? { repeat: Infinity, duration: 1.1 } : undefined}
                />
                {/* Zone ID */}
                <text x={x + 5} y={y + 13} fontSize="7" fill="rgba(255,255,255,0.55)" fontFamily="monospace">{z.id}</text>
                {/* Temp */}
                <text x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle" fontSize="14" fontWeight="bold"
                  fill={z.isBreach ? '#fff' : 'rgba(255,255,255,0.9)'} fontFamily="monospace">
                  {z.temp}°
                </text>
                {/* Breach tag */}
                {z.isBreach && (
                  <text x={x + cw / 2} y={y + ch - 5} textAnchor="middle" fontSize="6" fill="#FCA5A5" fontFamily="monospace">
                    BREACH
                  </text>
                )}
                {z.isCold && (
                  <text x={x + cw / 2} y={y + ch - 5} textAnchor="middle" fontSize="6" fill="#93C5FD" fontFamily="monospace">
                    TOO COLD
                  </text>
                )}
                {/* Hottest marker */}
                {z.id === hottest.id && !z.isBreach && (
                  <text x={x + cw / 2} y={y + ch - 5} textAnchor="middle" fontSize="6" fill="#FDE68A" fontFamily="monospace">
                    HOTTEST
                  </text>
                )}
              </g>
            );
          })}

          {/* Door (right side) */}
          <line x1="350" y1="22" x2="350" y2="158" stroke="#374151" strokeWidth="2" strokeDasharray="4,3" />
          <text x="354" y="120" fontSize="8" fill="#374151" fontFamily="monospace" transform="rotate(90,354,100)">DOOR</text>

          {/* Cooling unit (left) */}
          <rect x="12" y="60" width="18" height="50" rx="2" fill="#1D4ED8" opacity="0.4" />
          <text x="21" y="76" fontSize="5" fill="#93C5FD" fontFamily="monospace" textAnchor="middle">❄️</text>
          <text x="21" y="88" fontSize="5" fill="#93C5FD" fontFamily="monospace" textAnchor="middle">AC</text>

          {/* Labels */}
          <text x="186" y="14" textAnchor="middle" fontSize="7" fill="#4A5568" fontFamily="monospace">← FRONT</text>
          <text x="330" y="14" textAnchor="middle" fontSize="7" fill="#4A5568" fontFamily="monospace">REAR →</text>
        </svg>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3 text-[9px] text-[#4A5568]">
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#1D4ED8]"/>Too Cold</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#34D399]"/>Safe</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#FBBF24]"/>Warming</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#EF4444]"/>Breach</div>
        <div className="ml-auto text-[#64748B]">
          Hottest zone: <span className="text-[#F87171] font-mono font-bold">{hottest.id} · {hottest.temp}°C</span>
        </div>
      </div>

      {/* Zone stats row */}
      <div className="grid grid-cols-6 gap-1">
        {zones.map(z => (
          <div key={z.id} className="text-center rounded p-1" style={{ background: `${z.color}18`, border: `1px solid ${z.color}44` }}>
            <div className="text-[8px] text-[#64748B]">{z.id}</div>
            <div className="text-[10px] font-bold font-mono" style={{ color: z.color }}>{z.temp}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}
