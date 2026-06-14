/**
 * Cargofy — Fleet3DView Page
 *
 * Full-screen 3D real-time fleet visualization.
 * Shows all active trucks on a photorealistic Mapbox 3D map.
 * WebSocket connected — trucks flash RED on CRITICAL alerts.
 * AI Agent rerouting decisions auto-fly the camera to the affected truck.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CargoMap3D, type CargoMap3DHandle } from '../../components/CargoMap3D';
import { getShipments, type Shipment } from '../../lib/api';
import { ArrowLeft, Battery, Thermometer, DoorOpen, Zap, Bot, BellOff, Package, AlertTriangle, ShieldAlert, Link, ArrowRight } from 'lucide-react';

interface AgentEvent {
  event:        string;
  shipment_id?: string;
  risk_score?:  number;
  urgency?:     string;
  timestamp?:   string;
  facility?:    Record<string, unknown>;
}

export function Fleet3DView() {
  const navigate  = useNavigate();
  const [shipments, setShipments]   = useState<Shipment[]>([]);
  const [agentLog, setAgentLog]     = useState<AgentEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [crisisRunning, setCrisisRunning] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<string|null>(null);
  const mapHandle = useRef<CargoMap3DHandle>(null);
  const [toasts, setToasts]         = useState<Array<{ id: string; msg: string; color: string }>>([]);

  const addToast = (msg: string, color = '#4DD9AC') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, color }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  };

  // ── Fetch active shipments ────────────────────────────────────────────────
  useEffect(() => {
    getShipments('active')
      .then(s => setShipments(s))
      .catch(() => {/* use demo trucks in CargoMap3D */})
      .finally(() => setLoading(false));
  }, []);

  // ── Convert Shipment[] to TruckPosition[] ────────────────────────────────
  const trucks = shipments
    .filter(s => s.current_location?.lat && s.current_location?.lng)
    .map(s => ({
      shipment_code: s.shipment_code,
      product_type:  s.product_type || 'cargo',
      lat:           s.current_location!.lat,
      lng:           s.current_location!.lng,
      risk_score:    s.current_risk?.risk_score ?? 0.1,
      risk_category: s.current_risk?.risk_category ?? 'LOW',
      temperature:   s.current_risk?.temperature ?? 4.0,
      time_to_spoil: s.current_risk?.time_to_spoil_minutes ?? 240,
    }));

  // ── Handle WebSocket reroute events ──────────────────────────────────────
  const handleRerouteAlert = useCallback((event: AgentEvent) => {
    setAgentLog(prev => [event, ...prev].slice(0, 20));

    if (event.event === 'REROUTE_DECISION') {
      addToast(
        `🤖 Agent rerouting ${event.shipment_id || 'truck'} — Risk ${Math.round((event.risk_score || 0) * 100)}%`,
        '#EF4444'
      );
    }
  }, []);

  // ── Simulate crisis ───────────────────────────────────────────────────────
  const triggerCrisis = async (scenario: string) => {
    setCrisisRunning(true);
    addToast(`⚡ Triggering ${scenario}...`, '#F59E0B');
    try {
      const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const res  = await fetch(`${API}/api/v1/agent/simulate-critical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          shipment_id:  trucks[0]?.shipment_code || 'SHP-DEMO-001',
          product_type: trucks[0]?.product_type  || 'milk',
        }),
      });
      const data = await res.json();
      const facility = data.agent_result?.nearest_facility?.name || 'nearest cold hub';
      addToast(`🚚 CARGOFY AI: Rerouting to ${facility}`, '#EF4444');
    } catch {
      addToast('🤖 AI Agent triggered (demo mode — backend offline)', '#F59E0B');
    } finally {
      setCrisisRunning(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#080B12', color: '#F1F5F9',
      fontFamily: 'Inter, monospace',
    }}>

      {/* ── Toast container ────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 200,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: '#0D1117',
            border: `1px solid ${t.color}44`,
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, fontWeight: 600, color: t.color,
            boxShadow: `0 4px 20px ${t.color}22`,
            maxWidth: 340,
            animation: 'slideInRight 0.3s ease',
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header style={{
        height: 52, background: '#0A0D14',
        borderBottom: '1px solid #1E2530',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
        flexShrink: 0, zIndex: 100,
      }}>
        {/* Back */}
        <button onClick={() => navigate('/dashboard')} style={{
          background: 'none', border: '1px solid #1E2530', color: '#64748B',
          borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4
        }}>
          <ArrowLeft size={12}/> Dashboard
        </button>

        {/* Title */}
        <div style={{ color: '#4DD9AC', fontWeight: 900, fontSize: 15, fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
          CARGOFY
        </div>
        <div style={{ color: '#64748B', fontSize: 12 }}>
          / 3D Fleet Intelligence
        </div>

        <div style={{ flex: 1 }} />

        {/* Live stats */}
        <div style={{
          display: 'flex', gap: 16, fontSize: 12, color: '#94A3B8',
        }}>
          <span>
            <span style={{ color: '#4DD9AC', fontWeight: 700 }}>
              {loading ? '...' : (trucks.length || 5)}
            </span> trucks live
          </span>
          <span>
            <span style={{ color: '#EF4444', fontWeight: 700 }}>
              {trucks.filter(t => t.risk_category === 'CRITICAL').length || 1}
            </span> critical
          </span>
        </div>

        {/* Crisis scenario buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { label: <span style={{display:'flex',alignItems:'center',gap:4}}><Battery size={12}/> Battery</span>, s: 'battery_failure' },
            { label: <span style={{display:'flex',alignItems:'center',gap:4}}><Thermometer size={12}/> Temp</span>,    s: 'temp_spike' },
            { label: <span style={{display:'flex',alignItems:'center',gap:4}}><DoorOpen size={12}/> Door</span>,    s: 'door_tamper' },
            { label: <span style={{display:'flex',alignItems:'center',gap:4}}><Zap size={12}/> All</span>,     s: 'combined' },
          ].map(item => (
            <button key={item.s}
              onClick={() => triggerCrisis(item.s)}
              disabled={crisisRunning}
              style={{
                background: crisisRunning ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.1)',
                border: '1px solid #EF444444',
                color: '#F87171',
                borderRadius: 6, padding: '4px 8px',
                fontSize: 11, cursor: crisisRunning ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: crisisRunning ? 0.5 : 1,
              }}
            >
              {crisisRunning ? '...' : item.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main layout: Map + Agent Log sidebar ───────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── 3D Map (main area) ─────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>

          {/* Fleet truck list — click triggers cinematic camera swoop */}
          <div style={{ width:180, background:'#080B12', borderRight:'1px solid #1E2530', overflowY:'auto', flexShrink:0 }}>
            <div style={{ padding:'10px 12px', borderBottom:'1px solid #1E2530', fontSize:10, fontWeight:700, color:'#64748B', fontFamily:'monospace', letterSpacing:1 }}>
              🚚 FLEET — {trucks.length || 5} ACTIVE
            </div>
            {(trucks.length > 0 ? trucks : [
              { shipment_code:'SHP-MH-001', risk_category:'CRITICAL', product_type:'milk',   lat:19.076, lng:72.877 },
              { shipment_code:'SHP-DL-002', risk_category:'MEDIUM',   product_type:'pharma', lat:28.613, lng:77.209 },
              { shipment_code:'SHP-KA-003', risk_category:'LOW',      product_type:'fish',   lat:12.971, lng:77.594 },
              { shipment_code:'SHP-TN-004', risk_category:'HIGH',     product_type:'fruits', lat:13.082, lng:80.270 },
              { shipment_code:'SHP-WB-005', risk_category:'LOW',      product_type:'dairy',  lat:22.572, lng:88.363 },
            ] as any[]).map((t: any) => {
              const col = t.risk_category==='CRITICAL'?'#EF4444':t.risk_category==='HIGH'?'#F97316':t.risk_category==='MEDIUM'?'#FBBF24':'#34D399';
              const isSel = selectedTruck === t.shipment_code;
              return (
                <button key={t.shipment_code} onClick={() => {
                  setSelectedTruck(t.shipment_code);
                  mapHandle.current?.focusTruck(t.shipment_code);
                }} style={{
                  width:'100%', textAlign:'left', padding:'10px 12px',
                  background: isSel ? `${col}12` : 'transparent',
                  borderBottom:'1px solid #1E2530',
                  borderLeft: isSel ? `3px solid ${col}` : '3px solid transparent',
                  cursor:'pointer', display:'flex', flexDirection:'column', gap:3,
                }}>
                  <div style={{ fontFamily:'monospace', fontSize:10, fontWeight:700, color: isSel ? col : '#F1F5F9' }}>{t.shipment_code}</div>
                  <div style={{ fontSize:9, color:'#64748B' }}>{t.product_type?.toUpperCase()}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:col }}>{t.risk_category}</div>
                  {isSel && <div style={{ fontSize:8, color:'#4DD9AC', marginTop:2 }}>🎬 TRACKING — GOD MODE</div>}
                </button>
              );
            })}
            {selectedTruck && (
              <button onClick={() => { setSelectedTruck(null); mapHandle.current?.resetCamera(); }}
                style={{ width:'100%', padding:'8px 12px', fontSize:9, color:'#64748B', background:'#111827', borderTop:'1px solid #1E2530', cursor:'pointer' }}>
                ↩ Reset Camera
              </button>
            )}
          </div>

          <div style={{ flex:1, position:'relative' }}>
          <CargoMap3D
            ref={mapHandle}
            trucks={trucks.length > 0 ? trucks : undefined}
            onRerouteAlert={handleRerouteAlert}
          />
          </div>
        </div>

        {/* ── Agent Log Sidebar ─────────────────────────────────────────── */}
        <div style={{
          width: 280, background: '#0A0D14',
          borderLeft: '1px solid #1E2530',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #1E2530',
            fontSize: 11, fontWeight: 700, color: '#64748B',
            fontFamily: 'monospace', letterSpacing: 1,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <Bot size={14}/> AGENT ACTIVITY LOG
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {agentLog.length === 0 ? (
              <div style={{
                padding: '24px 12px', textAlign: 'center',
                fontSize: 11, color: '#334155',
              }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><BellOff size={24}/></div>
                No agent events yet.
                <br />Trigger a crisis scenario to see the AI agent respond in real-time.
              </div>
            ) : (
              agentLog.map((event, i) => (
                <div key={i} style={{
                  background: event.event === 'REROUTE_DECISION' ? 'rgba(239,68,68,0.06)' : 'rgba(16,19,27,0.8)',
                  border: `1px solid ${event.event === 'REROUTE_DECISION' ? '#EF444433' : '#1E2530'}`,
                  borderRadius: 6, padding: '8px 10px',
                  marginBottom: 6, fontSize: 11,
                }}>
                  <div style={{
                    color: event.event === 'REROUTE_DECISION' ? '#F87171' : '#94A3B8',
                    fontWeight: 700, marginBottom: 3, fontFamily: 'monospace',
                  }}>
                    {event.event.replace(/_/g, ' ')}
                  </div>
                  {event.shipment_id && (
                    <div style={{ color: '#64748B', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Package size={10}/> {event.shipment_id}
                    </div>
                  )}
                  {event.risk_score !== undefined && (
                    <div style={{ color: '#F87171', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={10}/> Risk: {Math.round(event.risk_score * 100)}%
                    </div>
                  )}
                  {event.urgency && (
                    <div style={{ color: '#F59E0B', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldAlert size={10}/> {event.urgency}
                    </div>
                  )}
                  <div style={{ color: '#334155', fontSize: 9, marginTop: 3 }}>
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString('en-IN') : new Date().toLocaleTimeString('en-IN')}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Blockchain badge */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid #1E2530',
            fontSize: 10, color: '#334155',
            fontFamily: 'monospace',
          }}>
            <div style={{ color: '#4DD9AC', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link size={12}/> Sepolia Testnet
            </div>
            <div>Each trip auto-mints an immutable certificate on Ethereum Sepolia.</div>
            <div style={{ marginTop: 4 }}>
              <a
                href="https://sepolia.etherscan.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#6366F1', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                View on Etherscan <ArrowRight size={10}/>
              </a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
