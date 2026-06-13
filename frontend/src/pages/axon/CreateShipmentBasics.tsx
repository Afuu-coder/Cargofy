import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxonRouteMap, type RouteData } from '../../components/AxonRouteMap';

const WIZARD_API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000') + '/api/v1/shipments';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FormData {
  // Step 1 — Basics
  productType: string;
  productName: string;
  quantity: string;
  unit: string;
  tempMin: number;
  tempMax: number;
  shelfLife: string;
  priority: string;
  // Step 2 — Route
  origin: string;
  destination: string;
  routeNotes: string;
  // Step 3 — Logistics
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  deliveryTime: string;
  // Step 4 — Monitoring
  iotDevice: string;
  sensorType: string;
  telemetryFreq: number;
  alertTempAbove: number;
  alertMinutes: number;
  whatsappAlert: boolean;
  pushAlert: boolean;
  autoAlert: boolean;
  aiMode: string;
  simulate: boolean;
}

// ── Product configs ───────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 'dairy',    icon: '🥛', label: 'Dairy',    tempMin: 2,   tempMax: 6,   hint: '2°C – 6°C safe band' },
  { id: 'seafood',  icon: '🐟', label: 'Seafood',  tempMin: 0,   tempMax: 4,   hint: '0°C – 4°C on ice' },
  { id: 'produce',  icon: '🥦', label: 'Produce',  tempMin: 4,   tempMax: 10,  hint: '4°C – 10°C optimal' },
  { id: 'frozen',   icon: '🧊', label: 'Frozen',   tempMin: -20, tempMax: -15, hint: '-20°C – -15°C deep freeze' },
  { id: 'pharma',   icon: '💊', label: 'Pharma',   tempMin: 2,   tempMax: 8,   hint: '2°C – 8°C cold chain' },
  { id: 'fruits',   icon: '🍎', label: 'Fruits',   tempMin: 5,   tempMax: 12,  hint: '5°C – 12°C ripening control' },
  { id: 'meat',     icon: '🥩', label: 'Meat',     tempMin: 0,   tempMax: 4,   hint: '0°C – 4°C, strict hygiene' },
  { id: 'other',    icon: '📦', label: 'Other',    tempMin: 2,   tempMax: 8,   hint: 'Custom temp band' },
];

const ROUTE_PRESETS = [
  { from: 'Guwahati, Assam',     to: 'Shillong, Meghalaya',          dist: '98 km', dur: '~2h 30m' },
  { from: 'Guwahati, Assam',     to: 'Dimapur, Nagaland',            dist: '203 km', dur: '~4h 15m' },
  { from: 'Jorhat, Assam',       to: 'Kohima, Nagaland',             dist: '188 km', dur: '~3h 45m' },
  { from: 'Silchar, Assam',      to: 'Imphal, Manipur',              dist: '342 km', dur: '~7h 20m' },
  { from: 'Tezpur, Assam',       to: 'Itanagar, Arunachal Pradesh',  dist: '167 km', dur: '~3h 10m' },
];

const VEHICLES = [
  { id: 'AS-01-H-4521', type: 'Reefer Truck — 5 Ton',    status: 'Available', range: '-20°C to +10°C', capacity: '5000 kg', service: '4 days ago', stability: '98.2%' },
  { id: 'MN-01-A-3344', type: 'Insulated Van — 2 Ton',   status: 'Available', range: '0°C to +15°C',   capacity: '2000 kg', service: '12 days ago', stability: '95.1%' },
  { id: 'ML-03-B-1122', type: 'Reefer Truck — 3 Ton',    status: 'Available', range: '-20°C to +10°C', capacity: '3000 kg', service: '7 days ago',  stability: '97.4%' },
  { id: 'AR-01-D-9988', type: 'Cold Box Bike — 50 kg',   status: 'In Use',    range: '0°C to +8°C',    capacity: '50 kg',   service: '1 day ago',   stability: '99.1%' },
];

const DRIVERS = [
  { name: 'Ravi Kumar',   phone: '+919876543210', status: 'Available', ackRate: '96%', delay: '8 min',  trips: 0 },
  { name: 'Suresh Singh', phone: '+919876543211', status: 'Available', ackRate: '91%', delay: '14 min', trips: 0 },
  { name: 'Mohan Das',    phone: '+919876543212', status: 'In Use',    ackRate: '88%', delay: '22 min', trips: 1 },
  { name: 'Priya Nair',   phone: '+919876543213', status: 'Available', ackRate: '99%', delay: '5 min',  trips: 0 },
];

function generateShipmentCode() {
  const now = new Date();
  const y = now.getFullYear();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AXN-${y}-${suffix}`;
}

const TODAY = new Date().toISOString().split('T')[0];
const DEFAULT_TIME = '07:00';

// ── Main Component ────────────────────────────────────────────────────────────
export function CreateShipmentBasics() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [shipmentCode, setShipmentCode] = useState(generateShipmentCode);
  const [submitting, setSubmitting] = useState(false);
  const [createdShipment, setCreatedShipment] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // ── API State ────────────────────────────────────────────────────────────────
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Done, setStep1Done] = useState(false);
  const [step1Warnings, setStep1Warnings] = useState<string[]>([]);
  const [dispatchSuggestion, setDispatchSuggestion] = useState<any>(null);
  const [step3Loading, setStep3Loading] = useState(false);
  const [iotPaired, setIotPaired] = useState<any>(null);
  const [step4Loading, setStep4Loading] = useState(false);
  const [riskPreview, setRiskPreview] = useState<any>(null);
  const [step5Loading, setStep5Loading] = useState(false);

  const [form, setForm] = useState<FormData>({
    productType: 'dairy',
    productName: '',
    quantity: '',
    unit: 'kg',
    tempMin: 2,
    tempMax: 6,
    shelfLife: 'short',
    priority: 'high',
    origin: '',
    destination: '',
    routeNotes: '',
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    pickupDate: TODAY,
    pickupTime: DEFAULT_TIME,
    deliveryDate: TODAY,
    deliveryTime: '17:00',
    iotDevice: `IOT-${Math.floor(Math.random() * 9000 + 1000)}`,
    sensorType: 'temp_humidity',
    telemetryFreq: 5,
    alertTempAbove: 7,
    alertMinutes: 10,
    whatsappAlert: true,
    pushAlert: true,
    autoAlert: true,
    aiMode: 'suggest',
    simulate: false,
  });

  const set = useCallback(<K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }, []);

  // Auto-fill temp band when product changes
  useEffect(() => {
    const p = PRODUCTS.find(p => p.id === form.productType);
    if (p) { set('tempMin', p.tempMin); set('tempMax', p.tempMax); }
  }, [form.productType]);

  // ── Route auto-calc ─────────────────────────────────────────────────────────
  const routeInfo = ROUTE_PRESETS.find(
    r => r.from.toLowerCase().includes(form.origin.toLowerCase().split(',')[0]) &&
         r.to.toLowerCase().includes(form.destination.toLowerCase().split(',')[0])
  ) || (form.origin && form.destination ? { dist: '~— km (custom)', dur: 'Calculating...' } : null);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.productType) e.productType = 'Select a product type';
      if (!form.quantity) e.quantity = 'Enter quantity';
    }
    if (s === 2) {
      if (!form.origin) e.origin = 'Enter pickup location';
      if (!form.destination) e.destination = 'Enter destination';
    }
    if (s === 3) {
      if (!form.vehicleNumber) e.vehicleNumber = 'Select a vehicle';
      if (!form.driverPhone) e.driverPhone = 'Select a driver';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Step 1: Call backend /validate-step/1 when advancing from Step 1 ────────
  async function callStep1() {
    setStep1Loading(true);
    try {
      const res = await fetch(`${WIZARD_API}/validate-step/1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_type:      form.productType,
          product_name:      form.productName,
          quantity:          parseFloat(form.quantity) || 1,
          quantity_unit:     form.unit.toUpperCase(),
          shelf_life_class:  form.shelfLife.toUpperCase(),
          priority:          form.priority.toUpperCase(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setShipmentCode(data.shipment_id);
      set('tempMin', data.temp_band_min);
      set('tempMax', data.temp_band_max);
      setStep1Warnings(data.warnings || []);
      setStep1Done(true);
    } catch (err) {
      console.warn('Step 1 API failed — using local ID', err);
      setStep1Done(true); // allow progression
    } finally {
      setStep1Loading(false);
    }
  }

  // ── Step 3: Fetch ADK dispatch suggestion on entry ──────────────────────────
  async function fetchDispatchSuggestion() {
    if (dispatchSuggestion) return; // already fetched
    setStep3Loading(true);
    try {
      const params = new URLSearchParams({
        shipment_id:  shipmentCode,
        product_type: form.productType,
        quantity_kg:  String(parseFloat(form.quantity) || 500),
        pickup_hour:  new Date().getHours().toString(),
      });
      const res = await fetch(`${WIZARD_API}/suggest-assignment?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDispatchSuggestion(data);
      // Auto-fill form if not already set
      if (!form.vehicleNumber && data.vehicle_id) set('vehicleNumber', data.vehicle_id);
      if (!form.driverPhone  && data.driver_phone) set('driverPhone', data.driver_phone);
      if (!form.driverName   && data.driver_name)  set('driverName', data.driver_name);
    } catch {
      // silent — fallback to manual selection
    } finally {
      setStep3Loading(false);
    }
  }

  // ── Step 4: Pair IoT device ──────────────────────────────────────────────────
  async function callPairIot() {
    setStep4Loading(true);
    try {
      const res = await fetch(`${WIZARD_API}/pair-iot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipment_id:          shipmentCode,
          device_id:            form.simulate ? null : form.iotDevice,
          sensor_type:          form.sensorType.toUpperCase(),
          frequency_min:        form.telemetryFreq,
          temp_threshold_max:   form.alertTempAbove,
          breach_alert_min:     form.alertMinutes,
          alert_contacts:       form.driverPhone ? [form.driverPhone] : [],
          alert_channels:       [
            ...(form.whatsappAlert ? ['WHATSAPP'] : []),
            ...(form.pushAlert ? ['PUSH'] : []),
          ],
          ai_intervention_mode: form.aiMode.toUpperCase(),
          simulator_mode:       form.simulate,
        }),
      });
      if (res.ok) setIotPaired(await res.json());
    } catch {
      // silent — non-fatal
    } finally {
      setStep4Loading(false);
    }
  }

  // ── Step 5: Fetch Vertex AI risk preview ─────────────────────────────────────
  async function fetchRiskPreview() {
    if (riskPreview) return;
    setStep5Loading(true);
    try {
      const res = await fetch(`${WIZARD_API}/risk-preview/${shipmentCode}`);
      if (!res.ok) throw new Error();
      setRiskPreview(await res.json());
    } catch {
      // heuristic fallback shown inline
    } finally {
      setStep5Loading(false);
    }
  }

  function nextStep() {
    if (!validate(step)) return;
    if (step === 1 && !step1Done) { callStep1().then(() => setStep(2)); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 2) { setStep(3); fetchDispatchSuggestion(); return; }
    if (step === 3) { setStep(4); callPairIot(); return; }
    if (step === 4) { setStep(5); fetchRiskPreview(); return; }
    setStep(s => Math.min(s + 1, 5));
  }
  function prevStep() { setStep(s => Math.max(s - 1, 1)); }

  // ── Final Submit — calls /wizard/create ──────────────────────────────────────
  async function handleSubmit() {
    if (!validate(step)) return;
    setSubmitting(true);
    try {
      const pickup = form.pickupDate && form.pickupTime
        ? new Date(`${form.pickupDate}T${form.pickupTime}:00`).toISOString() : undefined;
      const delivery = form.deliveryDate && form.deliveryTime
        ? new Date(`${form.deliveryDate}T${form.deliveryTime}:00`).toISOString() : undefined;

      // Try wizard /create first; fall back to basic route
      let result: any;
      const routeSnapshot = (window as any).__axonRouteData as RouteData | undefined;
      try {
        const res = await fetch(`${WIZARD_API}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipment_id:       shipmentCode,
            product_type:      form.productType,
            product_name:      form.productName,
            quantity:          parseFloat(form.quantity) || 1,
            quantity_unit:     form.unit.toUpperCase(),
            priority:          form.priority.toUpperCase(),
            origin:            form.origin,
            origin_lat:        (window as any).__axonOriginLat || 26.1445,
            origin_lng:        (window as any).__axonOriginLng || 91.7362,
            destination:       form.destination,
            dest_lat:          (window as any).__axonDestLat || 25.5788,
            dest_lng:          (window as any).__axonDestLng || 91.8933,
            vehicle_number:    form.vehicleNumber || undefined,
            driver_phone:      form.driverPhone || undefined,
            driver_name:       form.driverName || undefined,
            iot_device_id:     iotPaired?.device_id || form.iotDevice,
            simulator_mode:    form.simulate,
            pickup_scheduled:  pickup,
            sla_deadline:      delivery,
            distance_km:       routeSnapshot?.distance_km,
            duration_min:      routeSnapshot?.duration_min,
            temp_band_min:     form.tempMin,
            temp_band_max:     form.tempMax,
            pre_dispatch_risk: riskPreview,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        result = await res.json();
      } catch (wizardErr) {
        // Fallback: just return a mock created shipment
        result = {
          id: Math.random().toString(36).slice(2),
          shipment_code: shipmentCode,
          status: 'active',
          created_at: new Date().toISOString(),
          message: 'Shipment created (offline mode)',
        };
      }
      setCreatedShipment(result);
      setStep(6);
    } catch (err: any) {
      setErrors({ submit: err?.message || 'Failed to create shipment. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Launch Screen ───────────────────────────────────────────────────────────
  if (step === 6 && createdShipment) {
    return <LaunchScreen shipment={createdShipment} form={form} onNavigate={navigate} />;
  }

  const selectedProduct = PRODUCTS.find(p => p.id === form.productType);
  const selectedVehicle = VEHICLES.find(v => v.id === form.vehicleNumber);
  const selectedDriver = DRIVERS.find(d => d.phone === form.driverPhone);

  return (
    <div className="flex flex-col h-screen bg-[#080B12] text-[#F1F5F9] overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-14 bg-[#0A0D14] border-b border-[#1E2530] flex items-center px-4 gap-4 z-40">
        <div className="text-[#4DD9AC] font-black text-xl tracking-tighter font-mono shrink-0 cursor-pointer" onClick={() => navigate('/dashboard')}>AXON</div>
        <div className="flex-1" />
        <div className="text-xs text-[#64748B] hidden md:block">Create Shipment Wizard</div>
        <button onClick={() => navigate('/dashboard')} className="text-xs text-[#64748B] hover:text-[#CBD5E1] transition-colors px-3 py-1.5 border border-[#1E2530] rounded">
          ← Back to Control Tower
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ───────────────────────────────────────────────── */}
        <aside className="shrink-0 w-[200px] bg-[#0D1117] border-r border-[#1E2530] flex-col hidden md:flex overflow-y-auto py-4">
          {[
            { n: 1, icon: '📦', label: 'Basics' },
            { n: 2, icon: '📍', label: 'Route' },
            { n: 3, icon: '🚚', label: 'Logistics' },
            { n: 4, icon: '📡', label: 'Monitoring' },
            { n: 5, icon: '📋', label: 'Review' },
          ].map(s => (
            <button
              key={s.n}
              onClick={() => { if (s.n <= step) setStep(s.n); }}
              disabled={s.n > step}
              className={`flex items-center gap-3 px-4 py-3 text-sm transition-all text-left border-l-2 ${
                s.n === step ? 'bg-[#4DD9AC]/10 text-[#4DD9AC] border-[#4DD9AC] font-semibold'
                  : s.n < step ? 'text-[#34D399] border-[#34D399]/40 hover:bg-[#111827] cursor-pointer'
                  : 'text-[#4A5568] border-transparent cursor-not-allowed'
              }`}
            >
              <span className="text-base w-5 text-center">{s.n < step ? '✓' : s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
          <div className="mt-auto p-4 border-t border-[#1E2530]">
            <div className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-2">Shipment Code</div>
            <div className="font-mono text-xs text-[#4DD9AC] flex items-center gap-2">
              {shipmentCode}
              <button onClick={() => { navigator.clipboard.writeText(shipmentCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="text-[#64748B] hover:text-[#4DD9AC] transition-colors">
                {copied ? '✓' : '⧉'}
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main  ──────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Form area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Step indicator */}
            <div className="shrink-0 bg-[#0D1117] border-b border-[#1E2530] px-6 py-4">
              <div className="flex items-center gap-0 max-w-xl">
                {['Basics','Route','Logistics','Monitoring','Review'].map((label, i) => {
                  const n = i + 1;
                  const done = n < step;
                  const active = n === step;
                  return (
                    <React.Fragment key={n}>
                      <div className="flex flex-col items-center gap-1">
                        <button
                          onClick={() => { if (done || active) setStep(n); }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 ${
                            done ? 'bg-[#4DD9AC] border-[#4DD9AC] text-[#003829]'
                              : active ? 'bg-transparent border-[#4DD9AC] text-[#4DD9AC] shadow-[0_0_10px_rgba(77,217,172,0.3)]'
                              : 'bg-transparent border-[#374151] text-[#4A5568]'
                          }`}
                        >
                          {done ? '✓' : n}
                        </button>
                        <span className={`text-[10px] font-medium whitespace-nowrap ${active ? 'text-[#4DD9AC]' : done ? 'text-[#34D399]' : 'text-[#4A5568]'}`}>{label}</span>
                      </div>
                      {i < 4 && (
                        <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${done ? 'bg-[#4DD9AC]' : 'bg-[#1E2530]'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Form content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                {errors.submit && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">{errors.submit}</div>
                )}

                {step === 1 && <Step1 form={form} set={set} errors={errors} selectedProduct={selectedProduct} warnings={step1Warnings} />}
                {step === 2 && <Step2 form={form} set={set} errors={errors} routeInfo={routeInfo} />}
                {step === 3 && <Step3 form={form} set={set} errors={errors} selectedVehicle={selectedVehicle} selectedDriver={selectedDriver} suggestion={dispatchSuggestion} suggestionLoading={step3Loading} />}
                {step === 4 && <Step4 form={form} set={set} errors={errors} iotPaired={iotPaired} loading={step4Loading} />}
                {step === 5 && <Step5 form={form} shipmentCode={shipmentCode} selectedProduct={selectedProduct} selectedVehicle={selectedVehicle} selectedDriver={selectedDriver} routeInfo={routeInfo} riskPreview={riskPreview} riskLoading={step5Loading} />}

              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 bg-[#0D1117] border-t border-[#1E2530] px-6 py-4 flex items-center justify-between">
              <button
                onClick={step === 1 ? () => navigate('/dashboard') : prevStep}
                className="px-5 py-2.5 text-sm text-[#64748B] hover:text-[#CBD5E1] border border-[#1E2530] hover:border-[#374151] rounded-lg transition-colors"
              >
                {step === 1 ? 'Cancel' : '← Back'}
              </button>

              <div className="flex items-center gap-2 text-[10px] text-[#4A5568]">
                Step {step} of 5
              </div>

              {step < 5 ? (
                <button
                  onClick={nextStep}
                  disabled={step1Loading}
                  className="px-6 py-2.5 bg-[#4DD9AC] text-[#003829] font-bold text-sm rounded-lg hover:bg-[#6EF6C7] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {step1Loading ? (
                    <><span className="w-4 h-4 border-2 border-[#003829]/30 border-t-[#003829] rounded-full animate-spin" />Validating...</>
                  ) : (
                    <>Continue → {['', 'Route', 'Logistics', 'Monitoring', 'Review'][step]}</>
                  )}
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 bg-gradient-to-r from-[#4DD9AC] to-[#6EF6C7] text-[#003829] font-bold text-sm rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60">
                  {submitting ? (
                    <><span className="w-4 h-4 border-2 border-[#003829]/30 border-t-[#003829] rounded-full animate-spin" />Creating...</>
                  ) : (
                    <>✅ Confirm & Dispatch</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* ── Right Preview Panel ──────────────────────────────────────── */}
          <aside className="w-[280px] shrink-0 bg-[#0D1117] border-l border-[#1E2530] flex-col hidden xl:flex overflow-y-auto p-4 gap-4">
            <div className="text-[10px] text-[#64748B] uppercase tracking-widest">Live Preview</div>

            {/* Preview card */}
            <div className="bg-[#111827] rounded-lg border border-[#1E2530] p-4">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3">Shipment Profile</div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{selectedProduct?.icon || '📦'}</span>
                <div>
                  <div className="font-mono text-sm text-[#4DD9AC]">{shipmentCode}</div>
                  <div className="text-xs text-[#64748B] capitalize">{form.productType} · {form.quantity || '—'} {form.unit}</div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <PreviewRow label="Priority" value={form.priority.toUpperCase()} color={form.priority === 'critical' ? '#F87171' : form.priority === 'high' ? '#FBBF24' : '#4DD9AC'} />
                <PreviewRow label="Temp Band" value={`${form.tempMin}°C – ${form.tempMax}°C`} />
                <PreviewRow label="Shelf Life" value={form.shelfLife} />
                <PreviewRow label="Origin" value={form.origin || '—'} />
                <PreviewRow label="Destination" value={form.destination || '—'} />
                {form.vehicleNumber && <PreviewRow label="Vehicle" value={form.vehicleNumber} />}
                {form.driverName && <PreviewRow label="Driver" value={form.driverName} />}
              </div>
            </div>

            {/* Temp band viz */}
            <div className="bg-[#111827] rounded-lg border border-[#1E2530] p-4">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3">Temperature Band</div>
              <TempBandViz min={form.tempMin} max={form.tempMax} />
            </div>

            {/* Risk preview */}
            <div className="bg-[#111827] rounded-lg border border-[#1E2530] p-4">
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-3">Risk Preview</div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Product sensitivity</span>
                  <span className={`font-bold ${form.productType === 'dairy' || form.productType === 'seafood' || form.productType === 'pharma' ? 'text-[#F87171]' : 'text-[#FBBF24]'}`}>
                    {form.productType === 'dairy' || form.productType === 'seafood' || form.productType === 'pharma' ? 'HIGH' : 'MEDIUM'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Route risk</span>
                  <span className="text-[#FBBF24] font-bold">MEDIUM</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Expected excursion</span>
                  <span className="text-[#CBD5E1] font-bold">18%</span>
                </div>
              </div>
              <div className="mt-3 bg-[#0F1F17] border border-[#1A3D2B] rounded p-3">
                <div className="text-[10px] text-[#4DD9AC] font-semibold mb-1 flex items-center gap-1">💡 Cargofy AI Insight</div>
                <div className="text-[11px] text-[#94A3B8] leading-relaxed">
                  {form.productType === 'dairy' ? 'Dairy shipments on this route had 3 excursions in 7 days. Consider night dispatch or tighter band.' : 'Set up IoT monitoring for real-time breach detection on this route.'}
                </div>
              </div>
            </div>

            {/* AI dispatch suggestion */}
            {form.pickupTime && parseInt(form.pickupTime) >= 9 && (
              <div className="bg-[#0F1A2E] border border-[#1E3A5F] rounded-lg p-4">
                <div className="text-[10px] text-[#60A5FA] font-semibold mb-2 flex items-center gap-1">💡 Cargofy AI Suggests</div>
                <div className="text-[11px] text-[#94A3B8] leading-relaxed mb-3">
                  Dispatch before 07:00 to avoid peak congestion. Current time ({form.pickupTime}) may add +28 min delay.
                </div>
                <button onClick={() => set('pickupTime', '06:30')} className="w-full text-[10px] bg-[#60A5FA]/10 text-[#60A5FA] border border-[#60A5FA]/30 py-1.5 rounded hover:bg-[#60A5FA]/20 transition-colors">
                  Accept — Set 06:30 Dispatch
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Basics ─────────────────────────────────────────────────────────────
function Step1({ form, set, errors, selectedProduct, warnings = [] }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-1">Shipment Basics</h2>
        <p className="text-sm text-[#64748B]">Define what you're shipping and its cold chain requirements.</p>
      </div>

      {/* Backend validation warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w: string, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-lg px-3 py-2">
              <span className="text-[#FBBF24] text-xs mt-0.5">⚠</span>
              <span className="text-xs text-[#FBBF24]">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Product type grid */}
      <FormSection label="Product Type" required error={errors.productType}>
        <div className="grid grid-cols-4 gap-2">
          {PRODUCTS.map(p => (
            <button
              key={p.id}
              onClick={() => set('productType', p.id)}
              className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                form.productType === p.id
                  ? 'bg-[#4DD9AC]/10 border-[#4DD9AC] shadow-[0_0_12px_rgba(77,217,172,0.2)]'
                  : 'bg-[#111827] border-[#1E2530] hover:border-[#374151]'
              }`}
            >
              <span className="text-2xl">{p.icon}</span>
              <span className={`text-[11px] font-medium ${form.productType === p.id ? 'text-[#4DD9AC]' : 'text-[#64748B]'}`}>{p.label}</span>
            </button>
          ))}
        </div>
        {selectedProduct && (
          <div className="mt-2 text-xs text-[#4DD9AC] bg-[#0F1F17] border border-[#1A3D2B] px-3 py-2 rounded">
            💡 Auto temp band: <strong>{selectedProduct.hint}</strong>
          </div>
        )}
      </FormSection>

      {/* Product name */}
      <FormSection label="Product Name" hint="e.g. Pasteurised Full Cream Milk">
        <input
          value={form.productName}
          onChange={e => set('productName', e.target.value)}
          placeholder="e.g. Full Cream Milk — Amul"
          className={Field}
        />
      </FormSection>

      {/* Quantity + unit */}
      <FormSection label="Quantity" required error={errors.quantity}>
        <div className="flex gap-2">
          <input
            value={form.quantity}
            onChange={e => set('quantity', e.target.value)}
            placeholder="500"
            type="number"
            min="0"
            className={`${Field} flex-1`}
          />
          <select value={form.unit} onChange={e => set('unit', e.target.value)} className={`${Field} !w-24`}>
            {['kg','g','litres','ml','units','boxes','packets'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </FormSection>

      {/* Temperature band */}
      <FormSection label="Safe Temperature Band" hint="Auto-filled based on product type">
        <TempBandViz min={form.tempMin} max={form.tempMax} />
        <div className="flex gap-4 mt-3">
          <div className="flex-1">
            <label className="block text-[10px] text-[#64748B] mb-1">Min °C</label>
            <input type="number" value={form.tempMin} onChange={e => set('tempMin', parseFloat(e.target.value))} className={Field} />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] text-[#64748B] mb-1">Max °C</label>
            <input type="number" value={form.tempMax} onChange={e => set('tempMax', parseFloat(e.target.value))} className={Field} />
          </div>
        </div>
      </FormSection>

      {/* Shelf life */}
      <FormSection label="Shelf Life Class">
        <div className="flex gap-2">
          {[{v:'fresh',l:'Fresh (<24h)'},{v:'short',l:'Short (1–3 days)'},{v:'extended',l:'Extended (3–7 days)'}].map(o => (
            <button key={o.v} onClick={() => set('shelfLife', o.v)}
              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${form.shelfLife===o.v ? 'bg-[#4DD9AC]/10 border-[#4DD9AC] text-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </FormSection>

      {/* Priority */}
      <FormSection label="Priority Level">
        <div className="flex gap-2">
          {[{v:'critical',l:'🔴 Critical',c:'#EF4444'},{v:'high',l:'🟠 High',c:'#F59E0B'},{v:'standard',l:'🟡 Standard',c:'#EAB308'},{v:'low',l:'🟢 Low',c:'#22C55E'}].map(o => (
            <button key={o.v} onClick={() => set('priority', o.v)}
              className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all text-center ${form.priority===o.v ? 'border-current' : 'bg-[#111827] border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}
              style={form.priority===o.v ? {backgroundColor:`${o.c}15`, color:o.c, borderColor:o.c} : {}}>
              {o.l}
            </button>
          ))}
        </div>
      </FormSection>
    </div>
  );
}
const NE_CITIES_COORDS: Record<string, {lat:number;lng:number}> = {
  'Guwahati, Assam':              {lat:26.1445,lng:91.7362},
  'Shillong, Meghalaya':          {lat:25.5788,lng:91.8933},
  'Dimapur, Nagaland':            {lat:25.9039,lng:93.7213},
  'Kohima, Nagaland':             {lat:25.6747,lng:94.1086},
  'Imphal, Manipur':              {lat:24.8170,lng:93.9368},
  'Itanagar, Arunachal Pradesh':  {lat:27.0844,lng:93.6053},
  'Agartala, Tripura':            {lat:23.8315,lng:91.2868},
  'Aizawl, Mizoram':              {lat:23.7272,lng:92.7176},
  'Silchar, Assam':               {lat:24.8333,lng:92.7789},
  'Jorhat, Assam':                {lat:26.7509,lng:94.2037},
  'Tezpur, Assam':                {lat:26.6338,lng:92.7958},
  'Dibrugarh, Assam':             {lat:27.4728,lng:94.9120},
};

const NE_CITIES = Object.keys(NE_CITIES_COORDS);

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return dv;
}

function Step2({ form, set, errors, routeInfo: _routeInfo }: any) {
  const [originLat, setOriginLat] = useState<number|undefined>();
  const [originLng, setOriginLng] = useState<number|undefined>();
  const [destLat,   setDestLat]   = useState<number|undefined>();
  const [destLng,   setDestLng]   = useState<number|undefined>();
  const [routeData, setRouteData] = useState<RouteData|null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [originSugs, setOriginSugs] = useState<{name:string;lat:number;lng:number}[]>([]);
  const [destSugs,   setDestSugs]   = useState<{name:string;lat:number;lng:number}[]>([]);
  const [originFocus, setOriginFocus] = useState(false);
  const [destFocus,   setDestFocus]   = useState(false);

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

  // Resolve lat/lng from city name
  const resolveCoords = useCallback((name: string): {lat:number;lng:number}|null => {
    const match = Object.entries(NE_CITIES_COORDS).find(([k]) => k.toLowerCase().startsWith(name.toLowerCase().split(',')[0]));
    return match ? match[1] : null;
  }, []);

  // Geocode using Mapbox
  const geocodeQuery = useCallback(async (q: string): Promise<{name:string;lat:number;lng:number}[]> => {
    if (!MAPBOX_TOKEN || q.length < 2) return [];
    // First check local
    const local = NE_CITIES.filter(c => c.toLowerCase().includes(q.toLowerCase())).slice(0,4).map(c => ({name:c,...NE_CITIES_COORDS[c]}));
    if (local.length >= 3) return local;
    try {
      const resp = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=IN&types=place,locality,address&limit=5&access_token=${MAPBOX_TOKEN}`
      );
      const data = await resp.json();
      const remote = (data.features || []).map((f:any) => ({
        name: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
      }));
      return [...local, ...remote].slice(0, 6);
    } catch { return local; }
  }, [MAPBOX_TOKEN]);

  const dOrigin = useDebounce(form.origin, 400);
  const dDest   = useDebounce(form.destination, 400);

  useEffect(() => {
    if (!dOrigin) { setOriginSugs([]); return; }
    geocodeQuery(dOrigin).then(setOriginSugs);
  }, [dOrigin, geocodeQuery]);

  useEffect(() => {
    if (!dDest) { setDestSugs([]); return; }
    geocodeQuery(dDest).then(setDestSugs);
  }, [dDest, geocodeQuery]);

  // Auto-resolve coords from text
  useEffect(() => {
    const c = resolveCoords(form.origin);
    if (c) { setOriginLat(c.lat); setOriginLng(c.lng); }
  }, [form.origin, resolveCoords]);

  useEffect(() => {
    const c = resolveCoords(form.destination);
    if (c) { setDestLat(c.lat); setDestLng(c.lng); }
  }, [form.destination, resolveCoords]);

  // Fetch Mapbox route when both coords are set
  useEffect(() => {
    if (!originLat || !originLng || !destLat || !destLng) return;
    if (!MAPBOX_TOKEN) return;
    setMapLoading(true);
    setRouteData(null);
    const coords = `${originLng},${originLat};${destLng},${destLat}`;
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
      `?alternatives=true&geometries=geojson&steps=false&overview=full` +
      `&annotations=duration,distance,congestion&access_token=${MAPBOX_TOKEN}`
    )
      .then(r => r.json())
      .then(data => {
        const routes = data.routes || [];
        if (!routes.length) { setMapLoading(false); return; }
        const primary = routes[0];
        const alt = routes[1];
        const congestion = primary.legs?.[0]?.annotation?.congestion || [];
        const severe = congestion.filter((c:string) => c === 'severe' || c === 'heavy').length;
        const risk = severe > 10 ? 'HIGH' : severe > 3 ? 'MEDIUM' : 'LOW';
        // Static cold hubs near midpoint
        const hubs = [
          {name:'Meghalaya Cold Hub',lat:25.5788,lng:91.8933,capacity_available:true,distance_from_route_km:2},
          {name:'Guwahati Logistics Park',lat:26.1445,lng:91.7362,capacity_available:true,distance_from_route_km:0},
        ].filter(h => {
          const dx = h.lng - (originLng+destLng)/2, dy = h.lat - (originLat+destLat)/2;
          return Math.sqrt(dx*dx+dy*dy) < 3;
        });
        const rd: RouteData = {
          distance_km: Math.round(primary.distance/100)/10,
          duration_min: Math.round(primary.duration/60),
          route_geometry: primary.geometry,
          route_risk_preview: risk as any,
          cold_hubs_on_route: hubs,
          alternate_route: alt ? {
            distance_km: Math.round(alt.distance/100)/10,
            duration_min: Math.round(alt.duration/60),
            geometry: alt.geometry,
          } : null,
        };
        setRouteData(rd);
        // Store for final submit payload
        (window as any).__axonRouteData  = rd;
        (window as any).__axonOriginLat  = originLat;
        (window as any).__axonOriginLng  = originLng;
        (window as any).__axonDestLat    = destLat;
        (window as any).__axonDestLng    = destLng;
      })
      .catch(() => {})
      .finally(() => setMapLoading(false));
  }, [originLat, originLng, destLat, destLng, MAPBOX_TOKEN]);

  const pickOrigin = (s:{name:string;lat:number;lng:number}) => {
    set('origin', s.name);
    setOriginLat(s.lat); setOriginLng(s.lng);
    setOriginSugs([]); setOriginFocus(false);
    (window as any).__axonOriginLat = s.lat;
    (window as any).__axonOriginLng = s.lng;
  };
  const pickDest = (s:{name:string;lat:number;lng:number}) => {
    set('destination', s.name);
    setDestLat(s.lat); setDestLng(s.lng);
    setDestSugs([]); setDestFocus(false);
    (window as any).__axonDestLat = s.lat;
    (window as any).__axonDestLng = s.lng;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-1">Origin &amp; Destination</h2>
        <p className="text-sm text-[#64748B]">Define the route — Mapbox calculates live distance, ETA and risk.</p>
      </div>

      {/* Quick route presets */}
      <div>
        <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">Quick Templates</div>
        <div className="flex flex-wrap gap-2">
          {ROUTE_PRESETS.slice(0,4).map(r => (
            <button key={r.from} onClick={() => { set('origin',r.from); set('destination',r.to); }}
              className="text-xs bg-[#111827] border border-[#1E2530] text-[#94A3B8] hover:border-[#4DD9AC]/50 hover:text-[#4DD9AC] px-3 py-1.5 rounded-lg transition-all">
              📍 {r.from.split(',')[0]} → {r.to.split(',')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Origin field */}
      <div className="relative">
        <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-1.5">
          Pickup Location <span className="text-red-400">*</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4DD9AC] text-sm">📍</span>
          <input
            value={form.origin}
            onChange={e => { set('origin', e.target.value); setOriginFocus(true); }}
            onFocus={() => setOriginFocus(true)}
            onBlur={() => setTimeout(() => setOriginFocus(false), 200)}
            placeholder="Search city or warehouse..."
            className={`w-full bg-[#111827] border ${errors.origin?'border-red-500':'border-[#1E2530]'} rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#F1F5F9] placeholder:text-[#374151] focus:outline-none focus:border-[#4DD9AC] transition-colors`}
          />
        </div>
        {errors.origin && <div className="text-red-400 text-xs mt-1">{errors.origin}</div>}
        {originFocus && originSugs.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-xl overflow-hidden">
            {originSugs.map(s => (
              <button key={s.name} onMouseDown={() => pickOrigin(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#4DD9AC]/10 hover:text-[#4DD9AC] transition-colors border-b border-[#1E2530] last:border-0">
                📍 {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Destination field */}
      <div className="relative">
        <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-1.5">
          Drop Location <span className="text-red-400">*</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">🏁</span>
          <input
            value={form.destination}
            onChange={e => { set('destination', e.target.value); setDestFocus(true); }}
            onFocus={() => setDestFocus(true)}
            onBlur={() => setTimeout(() => setDestFocus(false), 200)}
            placeholder="Search destination..."
            className={`w-full bg-[#111827] border ${errors.destination?'border-red-500':'border-[#1E2530]'} rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#F1F5F9] placeholder:text-[#374151] focus:outline-none focus:border-[#4DD9AC] transition-colors`}
          />
        </div>
        {errors.destination && <div className="text-red-400 text-xs mt-1">{errors.destination}</div>}
        {destFocus && destSugs.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-[#0D1117] border border-[#1E2530] rounded-lg shadow-xl overflow-hidden">
            {destSugs.map(s => (
              <button key={s.name} onMouseDown={() => pickDest(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#EF4444]/10 hover:text-[#F87171] transition-colors border-b border-[#1E2530] last:border-0">
                🏁 {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* THE MAP */}
      <AxonRouteMap
        originLat={originLat}
        originLng={originLng}
        destLat={destLat}
        destLng={destLng}
        originName={form.origin || 'Origin'}
        destName={form.destination || 'Destination'}
        routeData={routeData}
        loading={mapLoading}
        className="w-full"
        style={{ height: 340 }}
      />

      {/* Route stats if available */}
      {routeData && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {label:'Distance',  value:`${routeData.distance_km} km`, icon:'📏'},
            {label:'Transit',   value:`${routeData.duration_min} min`, icon:'⏱'},
            {label:'Route Risk',value:routeData.route_risk_preview||'LOW', icon:'🛡',
              color:routeData.route_risk_preview==='HIGH'?'#F97316':routeData.route_risk_preview==='MEDIUM'?'#FBBF24':'#34D399'},
          ].map(s => (
            <div key={s.label} className="bg-[#111827] border border-[#1E2530] rounded-lg p-3 text-center">
              <div className="text-base mb-1">{s.icon}</div>
              <div className="text-[10px] text-[#64748B] uppercase tracking-widest">{s.label}</div>
              <div className="font-mono font-bold text-sm mt-0.5" style={{color:s.color||'#F1F5F9'}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cold hubs */}
      {routeData?.cold_hubs_on_route && routeData.cold_hubs_on_route.length > 0 && (
        <div className="bg-[#0F1F17] border border-[#1A3D2B] rounded-lg p-4">
          <div className="text-[10px] text-[#4DD9AC] uppercase tracking-widest font-semibold mb-2">❄️ Cold Hubs On Route</div>
          <div className="space-y-2">
            {routeData.cold_hubs_on_route.map(h => (
              <div key={h.name} className="flex items-center justify-between text-xs">
                <span className="text-[#CBD5E1]">{h.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#64748B]">{h.distance_from_route_km} km detour</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    h.capacity_available ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#EF4444]/10 text-[#F87171]'
                  }`}>{h.capacity_available ? 'Available' : 'Full'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destination type */}
      <div>
        <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">Destination Type</div>
        <div className="flex flex-wrap gap-2">
          {['Retailer','Distributor','Cold Hub','Direct Customer'].map(t => (
            <button key={t} onClick={() => set('routeNotes', t)}
              className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${form.routeNotes===t ? 'bg-[#4DD9AC]/10 border-[#4DD9AC] text-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] text-[#64748B] hover:border-[#374151]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Logistics ──────────────────────────────────────────────────────────

function Step3({ form, set, errors, selectedVehicle, selectedDriver, suggestion, suggestionLoading }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-1">Logistics Assignment</h2>
        <p className="text-sm text-[#64748B]">Assign vehicle, driver and schedule.</p>
      </div>

      {/* ADK Suggestion banner */}
      {suggestionLoading && (
        <div className="flex items-center gap-2 bg-[#4DD9AC]/10 border border-[#4DD9AC]/25 rounded-lg px-4 py-3">
          <span className="w-3 h-3 border-2 border-[#4DD9AC]/30 border-t-[#4DD9AC] rounded-full animate-spin shrink-0" />
          <span className="text-xs text-[#4DD9AC]">🤖 ADK DispatchAgent analysing route and traffic…</span>
        </div>
      )}
      {!suggestionLoading && suggestion && (
        <div className="bg-[#4DD9AC]/05 border border-[#4DD9AC]/20 rounded-lg px-4 py-3 space-y-1">
          <div className="text-[10px] text-[#4DD9AC] uppercase tracking-widest font-bold">🤖 ADK Dispatch Suggestion</div>
          <div className="text-xs text-[#CBD5E1]">{suggestion.reasoning || 'Vehicle and driver auto-selected based on route, capacity, and availability.'}</div>
          {suggestion.eta_minutes && <div className="text-[11px] text-[#94A3B8]">Est. delivery: <span className="text-[#4DD9AC] font-semibold">{suggestion.eta_minutes} min</span></div>}
        </div>
      )}

      {/* Vehicle selection */}
      <FormSection label="Select Vehicle" required error={errors.vehicleNumber}>
        <div className="space-y-2">
          {VEHICLES.map(v => (
            <button key={v.id} onClick={() => set('vehicleNumber', v.id)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${form.vehicleNumber===v.id ? 'bg-[#4DD9AC]/10 border-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] hover:border-[#374151]'} ${v.status==='In Use' ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={v.status==='In Use'}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-sm font-bold text-[#F1F5F9]">🚛 {v.id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${v.status==='Available' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#EF4444]/10 text-[#F87171]'}`}>{v.status}</span>
              </div>
              <div className="text-xs text-[#64748B]">{v.type} · Capacity: {v.capacity}</div>
              <div className="text-xs text-[#4DD9AC]">Temp: {v.range} · Stability: {v.stability}</div>
            </button>
          ))}
        </div>
      </FormSection>

      {/* Driver selection */}
      <FormSection label="Select Driver" required error={errors.driverPhone}>
        <div className="space-y-2">
          {DRIVERS.map(d => (
            <button key={d.phone} onClick={() => { set('driverPhone', d.phone); set('driverName', d.name); }}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${form.driverPhone===d.phone ? 'bg-[#4DD9AC]/10 border-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] hover:border-[#374151]'} ${d.status==='In Use' ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={d.status==='In Use'}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-[#F1F5F9]">👤 {d.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${d.status==='Available' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#EF4444]/10 text-[#F87171]'}`}>{d.status}</span>
              </div>
              <div className="text-xs text-[#64748B]">{d.phone} · Ack rate: {d.ackRate} · Avg delay: {d.delay}</div>
            </button>
          ))}
        </div>
      </FormSection>

      {/* Schedule */}
      <FormSection label="Pickup Schedule">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">Pickup Date</label>
            <input type="date" value={form.pickupDate} onChange={e => set('pickupDate', e.target.value)} className={Field} min={TODAY} />
          </div>
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">Pickup Time</label>
            <input type="time" value={form.pickupTime} onChange={e => set('pickupTime', e.target.value)} className={Field} />
          </div>
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">Delivery Date</label>
            <input type="date" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} className={Field} min={form.pickupDate} />
          </div>
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">Delivery SLA</label>
            <input type="time" value={form.deliveryTime} onChange={e => set('deliveryTime', e.target.value)} className={Field} />
          </div>
        </div>
      </FormSection>
    </div>
  );
}

// ── Step 4: Monitoring ─────────────────────────────────────────────────────────
function Step4({ form, set, errors, iotPaired, loading: iotLoading }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-1">Monitoring Settings</h2>
        <p className="text-sm text-[#64748B]">Configure IoT, alerts and AI intervention rules.</p>
      </div>

      {/* IoT pairing status */}
      {iotLoading && (
        <div className="flex items-center gap-2 bg-[#60A5FA]/10 border border-[#60A5FA]/25 rounded-lg px-4 py-3">
          <span className="w-3 h-3 border-2 border-[#60A5FA]/30 border-t-[#60A5FA] rounded-full animate-spin shrink-0" />
          <span className="text-xs text-[#60A5FA]">📡 Pairing IoT device with Firebase RTDB…</span>
        </div>
      )}
      {!iotLoading && iotPaired && (
        <div className="flex items-center gap-3 bg-[#34D399]/08 border border-[#34D399]/25 rounded-lg px-4 py-3">
          <span className="text-[#34D399] text-lg">✓</span>
          <div>
            <div className="text-xs font-semibold text-[#34D399]">IoT Device Paired — {iotPaired.device_id}</div>
            <div className="text-[10px] text-[#64748B]">{iotPaired.message}</div>
          </div>
        </div>
      )}

      {/* Simulate toggle */}
      <div className="flex items-center justify-between bg-[#111827] border border-[#1E2530] rounded-lg p-4">
        <div>
          <div className="text-sm font-semibold text-[#F1F5F9]">Use IoT Simulator</div>
          <div className="text-xs text-[#64748B]">No hardware? Use our built-in IoT simulator for this shipment.</div>
        </div>
        <button onClick={() => set('simulate', !form.simulate)}
          className={`w-12 h-6 rounded-full transition-colors relative ${form.simulate ? 'bg-[#4DD9AC]' : 'bg-[#374151]'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.simulate ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {!form.simulate && (
        <FormSection label="IoT Device ID">
          <input value={form.iotDevice} onChange={e => set('iotDevice', e.target.value)} className={Field} placeholder="Scan or type device ID" />
        </FormSection>
      )}

      <FormSection label="Sensor Type">
        <div className="flex gap-2">
          {[{v:'temp_only',l:'🌡 Temp Only'},{v:'temp_humidity',l:'🌡💧 Temp + Humidity'},{v:'full_iot',l:'📡 Full IoT'}].map(o => (
            <button key={o.v} onClick={() => set('sensorType', o.v)}
              className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all text-center ${form.sensorType===o.v ? 'bg-[#4DD9AC]/10 border-[#4DD9AC] text-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] text-[#64748B]'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </FormSection>

      <FormSection label={`Telemetry Frequency: every ${form.telemetryFreq} min`}>
        <input type="range" min="1" max="30" step="1" value={form.telemetryFreq}
          onChange={e => set('telemetryFreq', parseInt(e.target.value))}
          className="w-full accent-[#4DD9AC]" />
        <div className="flex justify-between text-[10px] text-[#4A5568] mt-1">
          <span>1 min</span><span>5 min</span><span>15 min</span><span>30 min</span>
        </div>
      </FormSection>

      <FormSection label="Alert Thresholds">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">Alert if temp above °C</label>
            <input type="number" value={form.alertTempAbove} onChange={e => set('alertTempAbove', parseFloat(e.target.value))} className={Field} />
          </div>
          <div>
            <label className="block text-[10px] text-[#64748B] mb-1">For how many minutes</label>
            <input type="number" value={form.alertMinutes} onChange={e => set('alertMinutes', parseInt(e.target.value))} min="1" className={Field} />
          </div>
        </div>
        {/* Visual threshold bar */}
        <div className="mt-3 bg-[#080B12] rounded p-3">
          <div className="flex text-[10px] text-[#64748B] justify-between mb-1">
            <span>{form.tempMin - 1}°C</span><span className="text-[#34D399]">SAFE [{form.tempMin}–{form.tempMax}°C]</span><span>{form.alertTempAbove}°C ⚠</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex">
            <div className="bg-[#EF4444]/40 flex-1" />
            <div className="bg-[#34D399]/50 flex-[3]" />
            <div className="bg-[#FBBF24]/50 flex-1" />
            <div className="bg-[#EF4444]/60 flex-1" />
          </div>
        </div>
      </FormSection>

      <FormSection label="Alert Channels">
        {[{k:'whatsappAlert',l:'📱 WhatsApp alerts'},{k:'pushAlert',l:'🔔 Push notifications'},{k:'autoAlert',l:'🤖 Auto-alert driver on breach'}].map(o => (
          <label key={o.k} className="flex items-center gap-3 cursor-pointer py-2">
            <input type="checkbox" checked={(form as any)[o.k]} onChange={e => set(o.k as any, e.target.checked)} className="w-4 h-4 accent-[#4DD9AC]" />
            <span className="text-sm text-[#CBD5E1]">{o.l}</span>
          </label>
        ))}
      </FormSection>

      <FormSection label="AI Intervention Mode">
        <div className="space-y-2">
          {[{v:'monitor',l:'👁 Monitor Only',d:'Log events, no automated actions'},{v:'suggest',l:'💡 Suggest Actions',d:'AI recommends interventions for your approval'},{v:'auto',l:'⚡ Auto-Escalate',d:'AI acts automatically for CRITICAL events'}].map(o => (
            <button key={o.v} onClick={() => set('aiMode', o.v)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${form.aiMode===o.v ? 'bg-[#4DD9AC]/10 border-[#4DD9AC]' : 'bg-[#111827] border-[#1E2530] hover:border-[#374151]'}`}>
              <div className={`text-sm font-semibold mb-0.5 ${form.aiMode===o.v ? 'text-[#4DD9AC]' : 'text-[#F1F5F9]'}`}>{o.l}</div>
              <div className="text-xs text-[#64748B]">{o.d}</div>
            </button>
          ))}
        </div>
      </FormSection>
    </div>
  );
}

// ── Step 5: Review ─────────────────────────────────────────────────────────────
function Step5({ form, shipmentCode, selectedProduct, selectedVehicle, selectedDriver, routeInfo, riskPreview, riskLoading }: any) {
  const riskCategory = riskPreview?.risk_category || (riskLoading ? '…' : 'MEDIUM');
  const spoilageRisk = riskPreview?.spoilage_risk_pct ?? (riskLoading ? null : 42);
  const ambientTemp  = riskPreview?.ambient_temp_forecast;
  const riskColor    = riskCategory==='LOW'?'#34D399':riskCategory==='MEDIUM'?'#FBBF24':riskCategory==='HIGH'?'#F97316':'#EF4444';
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-1">Review & Dispatch</h2>
        <p className="text-sm text-[#64748B]">Confirm all details before dispatching this shipment.</p>
      </div>

      <div className="bg-[#111827] border border-[#1E2530] rounded-lg overflow-hidden">
        <div className="bg-[#0D1117] px-5 py-3 border-b border-[#1E2530]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[#4DD9AC] font-bold">{shipmentCode}</span>
            <span className="text-xs bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30 px-2 py-0.5 rounded-full font-semibold">{form.priority.toUpperCase()}</span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-5">
          <div>
            <ReviewBlock title={`${selectedProduct?.icon || '📦'} Product`} rows={[
              ['Type', `${form.productType} ${form.productName ? `— ${form.productName}` : ''}`],
              ['Quantity', `${form.quantity} ${form.unit}`],
              ['Temp Band', `${form.tempMin}°C to ${form.tempMax}°C`],
              ['Shelf Life', form.shelfLife],
            ]} />
          </div>
          <div>
            <ReviewBlock title="📍 Route" rows={[
              ['From', form.origin || '—'],
              ['To', form.destination || '—'],
              ['Distance', routeInfo?.dist || '—'],
              ['Est. Transit', routeInfo?.dur || '—'],
            ]} />
          </div>
          <div>
            <ReviewBlock title="🚚 Logistics" rows={[
              ['Vehicle', form.vehicleNumber || '—'],
              ['Driver', selectedDriver?.name || '—'],
              ['Pickup', `${form.pickupDate} ${form.pickupTime}`],
              ['Delivery SLA', `${form.deliveryDate} ${form.deliveryTime}`],
            ]} />
          </div>
          <div>
            <ReviewBlock title="📡 Monitoring" rows={[
              ['IoT Device', form.simulate ? 'Simulator' : form.iotDevice],
              ['Sensor', form.sensorType],
              ['Frequency', `Every ${form.telemetryFreq} min`],
              ['AI Mode', form.aiMode],
              ['Alerts', [form.whatsappAlert && 'WhatsApp', form.pushAlert && 'Push'].filter(Boolean).join(' + ') || 'None'],
            ]} />
          </div>
        </div>

        {/* Risk preview */}
        <div className="border-t border-[#1E2530] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-[#64748B] uppercase tracking-widest">Pre-Dispatch Risk Preview</div>
            {riskLoading && <span className="text-[10px] text-[#4DD9AC] flex items-center gap-1"><span className="w-2 h-2 border border-[#4DD9AC]/40 border-t-[#4DD9AC] rounded-full animate-spin"/>Vertex AI computing…</span>}
            {riskPreview && <span className="text-[10px] text-[#34D399]">✓ Vertex AI</span>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-[10px] text-[#64748B] mb-1">Route Health</div>
              {riskLoading
                ? <div className="h-5 w-16 mx-auto bg-[#1E2530] rounded animate-pulse" />
                : <div className="text-lg font-bold" style={{ color: riskColor }}>{riskCategory}</div>
              }
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[#64748B] mb-1">Excursion Risk</div>
              {riskLoading
                ? <div className="h-5 w-12 mx-auto bg-[#1E2530] rounded animate-pulse" />
                : <div className="text-lg font-bold text-[#F1F5F9]">{spoilageRisk !== null ? `${spoilageRisk}%` : '—'}</div>
              }
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[#64748B] mb-1">{ambientTemp != null ? 'Ambient Temp' : 'Nearest Cold Hub'}</div>
              {riskLoading
                ? <div className="h-5 w-14 mx-auto bg-[#1E2530] rounded animate-pulse" />
                : <div className="text-sm font-bold text-[#34D399]">{ambientTemp != null ? `${ambientTemp}°C` : '—'}</div>
              }
            </div>
          </div>
          <div className="mt-3 h-2 bg-[#1E2530] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#34D399] via-[#FBBF24] to-[#EF4444] rounded-full transition-all duration-700"
              style={{ width: `${spoilageRisk ?? 45}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-[#4A5568]">
            {riskPreview?.recommendation || `Overall dispatch risk: ${spoilageRisk ?? 45}% of critical threshold`}
          </div>
        </div>
      </div>

      <div className="bg-[#0F1F17] border border-[#1A3D2B] rounded-lg p-4 text-sm text-[#94A3B8]">
        <span className="text-[#4DD9AC] font-semibold">✓ Ready to dispatch.</span> On confirmation, the driver will be notified via WhatsApp and monitoring will activate immediately.
      </div>
    </div>
  );
}

// ── Launch Screen ─────────────────────────────────────────────────────────────
function LaunchScreen({ shipment, form, onNavigate }: { shipment: any; form: FormData; onNavigate: (p: string) => void }) {
  const selectedProduct = PRODUCTS.find(p => p.id === form.productType);

  return (
    <div className="min-h-screen bg-[#080B12] flex items-center justify-center p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-lg text-center">
        {/* Success icon with animation */}
        <div className="w-20 h-20 rounded-full bg-[#4DD9AC]/10 border-2 border-[#4DD9AC] flex items-center justify-center mx-auto mb-6 animate-pulse">
          <span className="text-4xl">✅</span>
        </div>

        <h1 className="text-2xl font-black text-[#F1F5F9] mb-2">Shipment Dispatched</h1>
        <p className="text-[#64748B] text-sm mb-6">Your shipment is now live. Monitoring is active.</p>

        {/* Shipment summary card */}
        <div className="bg-[#0D1117] border border-[#1E2530] rounded-xl p-5 text-left mb-6 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E2530] pb-3">
            <span className="font-mono text-[#4DD9AC] font-bold text-lg">{shipment.shipment_code}</span>
            <span className="text-xs bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/30 px-2 py-1 rounded-full font-semibold">ACTIVE</span>
          </div>
          <LaunchRow icon="🚚" label="Vehicle assigned" value={form.vehicleNumber || 'Unassigned'} />
          <LaunchRow icon="👤" label="Driver" value={form.driverName ? `${form.driverName} (notified via WhatsApp)` : 'Unassigned'} />
          <LaunchRow icon="📡" label="IoT Sensor" value={`${form.simulate ? 'Simulator' : form.iotDevice} — active every ${form.telemetryFreq} min`} />
          <LaunchRow icon="📍" label="Route" value={form.origin && form.destination ? `${form.origin.split(',')[0]} → ${form.destination.split(',')[0]}` : 'Defined'} />
          <LaunchRow icon="🌡" label="Monitoring" value={`${form.tempMin}°C – ${form.tempMax}°C · Alert if >{form.alertTempAbove}°C`} />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('/iot-simulator')}
            className="group flex items-center gap-3 bg-[#111827] border border-[#1E2530] hover:border-[#4DD9AC]/40 p-4 rounded-lg transition-all text-left">
            <span className="text-2xl">🎮</span>
            <div>
              <div className="text-sm font-semibold text-[#F1F5F9] group-hover:text-[#4DD9AC] transition-colors">Start Simulation</div>
              <div className="text-xs text-[#4A5568]">Simulate sensor data</div>
            </div>
          </button>
          <button onClick={() => onNavigate(`/shipments/${shipment.id}`)}
            className="group flex items-center gap-3 bg-[#111827] border border-[#1E2530] hover:border-[#4DD9AC]/40 p-4 rounded-lg transition-all text-left">
            <span className="text-2xl">📋</span>
            <div>
              <div className="text-sm font-semibold text-[#F1F5F9] group-hover:text-[#4DD9AC] transition-colors">Shipment Detail</div>
              <div className="text-xs text-[#4A5568]">View full details</div>
            </div>
          </button>
          <button onClick={() => onNavigate('/dashboard')}
            className="group flex items-center gap-3 bg-[#111827] border border-[#1E2530] hover:border-[#4DD9AC]/40 p-4 rounded-lg transition-all text-left">
            <span className="text-2xl">🗼</span>
            <div>
              <div className="text-sm font-semibold text-[#F1F5F9] group-hover:text-[#4DD9AC] transition-colors">Control Tower</div>
              <div className="text-xs text-[#4A5568]">Monitor all shipments</div>
            </div>
          </button>
          <button onClick={() => window.location.reload()}
            className="group flex items-center gap-3 bg-gradient-to-r from-[#4DD9AC]/20 to-transparent border border-[#4DD9AC]/30 hover:border-[#4DD9AC]/60 p-4 rounded-lg transition-all text-left">
            <span className="text-2xl">+</span>
            <div>
              <div className="text-sm font-semibold text-[#4DD9AC]">New Shipment</div>
              <div className="text-xs text-[#4A5568]">Create another</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Utility components & helpers ──────────────────────────────────────────────
const Field = "w-full bg-[#111827] border border-[#1E2530] text-[#F1F5F9] text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-[#4DD9AC]/60 transition-colors placeholder-[#4A5568]";

function FormSection({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-sm font-medium text-[#CBD5E1]">{label}</label>
        {required && <span className="text-[#EF4444] text-xs">*</span>}
        {hint && <span className="text-xs text-[#4A5568]">— {hint}</span>}
      </div>
      {children}
      {error && <div className="mt-1 text-xs text-[#F87171]">⚠ {error}</div>}
    </div>
  );
}

function TempBandViz({ min, max }: { min: number; max: number }) {
  const range = 50; // display range in °C
  const totalMin = Math.min(min - 5, -25);
  const totalMax = Math.max(max + 8, 15);
  const total = totalMax - totalMin;
  const safeLeft = ((min - totalMin) / total) * 100;
  const safeWidth = ((max - min) / total) * 100;
  return (
    <div>
      <div className="h-4 bg-[#EF4444]/20 rounded-full overflow-hidden flex relative">
        <div className="absolute inset-0 flex">
          <div style={{ width: `${safeLeft}%` }} className="bg-[#EF4444]/30" />
          <div style={{ width: `${safeWidth}%` }} className="bg-[#34D399]/50" />
          <div className="flex-1 bg-[#EF4444]/30" />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-[#64748B] mt-1">
        <span>Danger</span>
        <span className="text-[#34D399]">Safe: {min}°C – {max}°C</span>
        <span>Danger</span>
      </div>
    </div>
  );
}

function ReviewBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="text-[10px] text-[#4A5568] shrink-0 w-20 mt-0.5 capitalize">{k}</span>
            <span className="text-xs text-[#CBD5E1] font-medium break-all">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[#4A5568] text-[10px] shrink-0">{label}</span>
      <span className="text-right text-[11px] font-medium truncate max-w-[160px]" style={{ color: color || '#CBD5E1' }}>{value}</span>
    </div>
  );
}

function LaunchRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-[#64748B] uppercase tracking-wider">{label}</span>
        <div className="text-sm text-[#CBD5E1] font-medium">{value}</div>
      </div>
    </div>
  );
}
