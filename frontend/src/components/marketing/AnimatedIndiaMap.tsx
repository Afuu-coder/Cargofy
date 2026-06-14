import React, { useEffect, useRef, useState } from "react";

const GEO = { minLng: 68.1, maxLng: 97.4, minLat: 7.9, maxLat: 37.6 };
const VW = 520,
  VH = 580;

function project(lng: number, lat: number): [number, number] {
  return [
    ((lng - GEO.minLng) / (GEO.maxLng - GEO.minLng)) * VW,
    ((GEO.maxLat - lat) / (GEO.maxLat - GEO.minLat)) * VH,
  ];
}

function geoToPath(geometry: any): string {
  const renderRings = (rings: number[][][]) =>
    rings
      .map(
        (ring) =>
          ring
            .map(([lng, lat], i) => {
              const [x, y] = project(lng, lat);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join("") + "Z",
      )
      .join(" ");

  if (geometry.type === "Polygon") return renderRings(geometry.coordinates);
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates.map((p: any) => renderRings(p)).join(" ");
  return "";
}

const CITIES = [
  { id: "del", lat: 28.61, lng: 77.21, crit: false, r: 5.5 },
  { id: "mum", lat: 19.08, lng: 72.88, crit: true, r: 5.5 },
  { id: "blr", lat: 12.97, lng: 77.59, crit: false, r: 5 },
  { id: "chn", lat: 13.08, lng: 80.27, crit: true, r: 4.5 },
  { id: "hyd", lat: 17.39, lng: 78.48, crit: false, r: 4 },
  { id: "ccu", lat: 22.57, lng: 88.36, crit: false, r: 5 },
  { id: "ghy", lat: 26.14, lng: 91.74, crit: true, r: 3.5 },
  { id: "ahm", lat: 23.03, lng: 72.57, crit: false, r: 4 },
  { id: "lko", lat: 26.85, lng: 80.95, crit: false, r: 3.5 },
  { id: "pun", lat: 18.52, lng: 73.85, crit: false, r: 3 },
  { id: "coi", lat: 9.93, lng: 76.27, crit: false, r: 3 },
  { id: "jai", lat: 26.91, lng: 75.79, crit: false, r: 3 },
];

const ROUTES = [
  ["del", "mum"],
  ["del", "ccu"],
  ["mum", "blr"],
  ["blr", "chn"],
  ["chn", "hyd"],
  ["hyd", "mum"],
  ["del", "lko"],
  ["lko", "ccu"],
  ["ccu", "ghy"],
  ["mum", "ahm"],
  ["blr", "coi"],
  ["del", "jai"],
  ["jai", "ahm"],
];
const CRIT = new Set([0, 2, 4, 8]);

export const AnimatedIndiaMap: React.FC = () => {
  const [paths, setPaths] = useState<string[]>([]);
  const groupRef = useRef<SVGGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch real India GeoJSON with state boundaries
  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
    )
      .then((r) => r.json())
      .then((data) => {
        const p = data.features
          .map((f: any) => geoToPath(f.geometry))
          .filter(Boolean);
        setPaths(p);
      })
      .catch(() => {
        /* silently fail — fallback outline still shows */
      });
  }, []);

  // Cursor parallax
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let tx = 0,
      ty = 0,
      cx = 0,
      cy = 0,
      af: number;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 28;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 18;
    };
    const tick = () => {
      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;
      if (groupRef.current)
        groupRef.current.style.transform = `translate(${cx}px,${cy}px)`;
      af = requestAnimationFrame(tick);
    };
    el.addEventListener("mousemove", onMove);
    af = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(af);
    };
  }, []);

  // Pre-project cities
  const cities = CITIES.map((c) => ({
    ...c,
    ...(() => {
      const [x, y] = project(c.lng, c.lat);
      return { x, y };
    })(),
  }));
  const getCity = (id: string) => cities.find((c) => c.id === id)!;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {/* Atmospheric glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 70% at 62% 48%, rgba(77,217,172,0.06) 0%, transparent 68%)",
        }}
      />

      <svg
        viewBox={`-20 -20 ${VW + 40} ${VH + 40}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="fill" cx="40%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#182534" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#080B12" stopOpacity="0.08" />
          </radialGradient>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softglow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g ref={groupRef} style={{ willChange: "transform" }}>
          {/* State fills */}
          {paths.map((d, i) => (
            <path key={`fill-${i}`} d={d} fill="url(#fill)" />
          ))}

          {/* State borders */}
          {paths.map((d, i) => (
            <path
              key={`border-${i}`}
              d={d}
              fill="none"
              stroke="#4DD9AC"
              strokeWidth="0.7"
              strokeOpacity="0.35"
            />
          ))}

          {/* Outer outline glow */}
          {paths.map((d, i) => (
            <path
              key={`glow-${i}`}
              d={d}
              fill="none"
              stroke="#4DD9AC"
              strokeWidth="2"
              strokeOpacity="0.08"
              filter="url(#softglow)"
            />
          ))}

          {/* Routes */}
          {ROUTES.map(([fid, tid], i) => {
            const f = getCity(fid),
              t = getCity(tid);
            if (!f || !t) return null;
            const color = CRIT.has(i) ? "#FF6B6B" : "#4DD9AC";
            const dur = `${2.2 + (i % 5) * 0.6}s`;
            return (
              <g key={`route-${i}`}>
                <line
                  x1={f.x}
                  y1={f.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={color}
                  strokeWidth="0.6"
                  strokeOpacity="0.15"
                  strokeDasharray="5 8"
                />
                <circle r="2.5" fill={color} filter="url(#glow)">
                  <animateMotion
                    dur={dur}
                    repeatCount="indefinite"
                    path={`M${f.x},${f.y}L${t.x},${t.y}`}
                    calcMode="linear"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.08;0.92;1"
                    dur={dur}
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })}

          {/* City nodes */}
          {cities.map((city) => {
            const color = city.crit ? "#FF6B6B" : "#4DD9AC";
            const dur = city.crit ? "2s" : "3.2s";
            return (
              <g key={city.id}>
                {/* Pulse halo */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.r + 5}
                  fill={color}
                  opacity="0"
                >
                  <animate
                    attributeName="r"
                    values={`${city.r + 3};${city.r + 11};${city.r + 3}`}
                    dur={dur}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.08;0;0.08"
                    dur={dur}
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Outer ring */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.r + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.9"
                  opacity="0.45"
                />
                {/* Core */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.r - 1}
                  fill={color}
                  opacity="0.95"
                  filter="url(#glow)"
                />
                {/* Dark hole */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.r - 3.2}
                  fill="#080B12"
                  opacity="0.9"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Left fade so text is readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, #080B12 28%, rgba(8,11,18,0.7) 52%, rgba(8,11,18,0.15) 75%, transparent 100%)",
        }}
      />
      {/* Top/bottom fades */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, #080B12 0%, transparent 10%, transparent 82%, #080B12 100%)",
        }}
      />
    </div>
  );
};
