import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Menu, X, CheckCircle2, XCircle, ChevronDown, HelpCircle, Calculator, 
  ArrowRight, ShieldCheck, Zap, BarChart3, Radio, Building2, Bell, FileText, Map
} from 'lucide-react';

const FONTS = {
  display: '"Syne", sans-serif',
  body: '"DM Sans", sans-serif',
};

const COLORS = {
  bg: '#080B12',
  surface: '#111622',
  surfaceHover: '#1A2133',
  teal: '#4DD9AC',
  red: '#FF4D4D',
  amber: '#FFB020',
  textMain: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#1E293B'
};

const FAQS = [
  { q: "Is there a free trial for the Growth plan?", a: "Yes — 14-day full access, no credit card required." },
  { q: "Can I upgrade mid-month?", a: "Yes. Charges are prorated based on the days remaining in your billing cycle." },
  { q: "Do you charge per shipment or per user?", a: "Starter and Growth are shipment-based. Enterprise is fully custom." },
  { q: "What IoT sensors does Cargofy support?", a: "Teltonika, Trakker, Monnit, and any MQTT-compatible sensor. We also offer our own certified sensor kit (optional)." },
  { q: "Is WhatsApp integration included?", a: "Push alerts are included in all plans. WhatsApp is included in Growth and above." },
  { q: "Can we export compliance data for audits?", a: "The Growth plan exports PDF compliance reports. Enterprise gets PDF + Excel + API access." },
  { q: "Is there a setup fee?", a: "No setup fees on Starter or Growth. Enterprise may include an implementation fee for custom enterprise workflows." }
];

export const PricingPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // ROI Calculator State
  const [shipments, setShipments] = useState(500);
  const [value, setValue] = useState(45000);
  const [spoilage, setSpoilage] = useState(4.2);

  // ROI Calculations
  const currentLoss = (shipments * value * (spoilage / 100));
  const expectedLoss = currentLoss * 0.3; // 70% reduction
  const monthlySavings = currentLoss - expectedLoss;
  const growthCost = 12999;
  const roi = ((monthlySavings - growthCost) / growthCost) * 100;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ backgroundColor: COLORS.bg, color: COLORS.textMain, fontFamily: FONTS.body, minHeight: '100vh' }}>
      
      {/* SECTION 1: NAV BAR (Reused) */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#080B12]/90 backdrop-blur-md border-b border-[#1E293B] shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" style={{ fontFamily: 'monospace' }} className="text-2xl font-bold tracking-widest text-white hover:text-[#4DD9AC] transition-colors">CARGOFY</Link>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/product" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Platform</Link>
              <Link to="/solutions" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Solutions</Link>
              <Link to="/customer-stories" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Customers</Link>
              <Link to="/pricing" className="text-white border-b-2 border-[#4DD9AC] pb-1 text-sm font-medium">Pricing</Link>
              <Link to="/about" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">About</Link>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <Link to="/login" className="text-white hover:text-[#4DD9AC] transition-colors text-sm font-medium px-3 py-2">Login</Link>
              <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-5 py-2.5 rounded-md font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(77,217,172,0.3)]">Book a Demo →</Link>
            </div>
            <div className="md:hidden flex items-center">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#94A3B8] hover:text-white">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* SECTION 1: HERO */}
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 border-b border-[#1E293B] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#4DD9AC]/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 style={{ fontFamily: FONTS.display }} className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
            Simple, Transparent <span style={{ color: COLORS.teal }}>Pricing</span>.
          </h1>
          <p className="mt-4 text-lg md:text-xl text-[#94A3B8] mx-auto mb-4 leading-relaxed max-w-2xl">
            Built for Cold Chain Operations of Every Size.<br/>
            Start free. Scale as you grow. No surprise charges. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
            <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.4)]">
              Start Free Trial
            </Link>
            <Link to="/signup" className="bg-[#111622] border border-[#1E293B] text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors">
              Talk to Sales →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 2: PLAN COMPARISON TABLE */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0A0D14] shadow-2xl hide-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="p-8 w-1/4"></th>
                  <th className="p-8 border-l border-[#1E293B] w-1/4">
                    <div style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-2">STARTER</div>
                    <div className="text-4xl font-bold text-[#4DD9AC] mb-2">₹0</div>
                    <div className="text-[#94A3B8] text-sm">Free forever</div>
                  </th>
                  <th className="p-8 border-l border-[#1E293B] w-1/4 bg-[#111622] relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-[#4DD9AC]"></div>
                    <div style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-2 flex items-center gap-2">GROWTH <Zap className="w-5 h-5 text-[#4DD9AC]"/></div>
                    <div className="text-4xl font-bold text-white mb-2">₹12,999<span className="text-lg text-[#94A3B8] font-normal">/mo</span></div>
                    <div className="text-[#94A3B8] text-sm">Billed annually</div>
                  </th>
                  <th className="p-8 border-l border-[#1E293B] w-1/4">
                    <div style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-2">ENTERPRISE</div>
                    <div className="text-4xl font-bold text-white mb-2">Custom</div>
                    <div className="text-[#94A3B8] text-sm">Contact Sales</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {[
                  { feature: "Shipments/month", s: "Up to 50", g: "Up to 500", e: "Unlimited" },
                  { feature: "Active users", s: "3", g: "15", e: "Unlimited" },
                  { feature: "IoT devices", s: "2", g: "25", e: "Unlimited" },
                  { feature: "Alert channels", s: "Push only", g: "Push + WhatsApp", e: "All channels" },
                  { feature: "Live tracking", s: "✅", g: "✅", e: "✅" },
                  { feature: "Risk engine", s: "Basic (manual)", g: <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#4DD9AC] shrink-0" /> AI-powered</div>, e: <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#4DD9AC] shrink-0" /> AI-powered</div>, highlightGrowth: true },
                  { feature: "IoT Simulator", s: "✅", g: "✅", e: "✅" },
                  { feature: "Spoilage prediction", s: "❌", g: "✅", e: "✅" },
                  { feature: "Analytics", s: "Basic", g: "Full 5-tab", e: "Custom reports", highlightGrowth: true },
                  { feature: "Cold hub recs", s: "❌", g: "✅", e: "✅" },
                  { feature: "Compliance export", s: "❌", g: "PDF only", e: "PDF + Excel + API" },
                  { feature: "Driver profiles", s: "5 drivers", g: "50 drivers", e: "Unlimited" },
                  { feature: "Fleet management", s: "Basic", g: "Full", e: "Full" },
                  { feature: "SLA monitoring", s: "❌", g: "✅", e: "✅" },
                  { feature: "API access", s: "❌", g: "Read-only", e: "Full read/write" },
                  { feature: "Support", s: "Community", g: "Email (48h)", e: "Dedicated CSM" },
                  { feature: "Uptime SLA", s: "Standard", g: "99.5%", e: "99.9%" }
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#111622]/50 transition-colors">
                    <td className="p-5 px-8 text-white font-medium">{row.feature}</td>
                    <td className="p-5 px-8 border-l border-[#1E293B] text-[#94A3B8]">
                      {row.s === '✅' ? <CheckCircle2 className="w-5 h-5 text-[#4DD9AC]" /> : row.s === '❌' ? <XCircle className="w-5 h-5 text-[#FF4D4D] opacity-50" /> : row.s}
                    </td>
                    <td className={`p-5 px-8 border-l border-[#1E293B] bg-[#111622]/50 ${row.highlightGrowth ? 'text-[#4DD9AC] font-bold' : 'text-white'}`}>
                      {row.g === '✅' ? <CheckCircle2 className="w-5 h-5 text-[#4DD9AC]" /> : row.g === '❌' ? <XCircle className="w-5 h-5 text-[#FF4D4D] opacity-50" /> : row.g}
                    </td>
                    <td className="p-5 px-8 border-l border-[#1E293B] text-white">
                      {row.e === '✅' ? <CheckCircle2 className="w-5 h-5 text-[#4DD9AC]" /> : row.e === '❌' ? <XCircle className="w-5 h-5 text-[#FF4D4D] opacity-50" /> : row.e}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="p-8 border-t border-[#1E293B]"></td>
                  <td className="p-8 border-l border-t border-[#1E293B]">
                    <Link to="/signup" className="block w-full text-center border border-[#4DD9AC] text-[#4DD9AC] py-3 rounded hover:bg-[#4DD9AC]/10 font-bold transition-colors">Start Free</Link>
                  </td>
                  <td className="p-8 border-l border-t border-[#1E293B] bg-[#111622]">
                    <Link to="/signup" className="block w-full text-center bg-[#4DD9AC] text-[#080B12] py-3 rounded hover:opacity-90 font-bold transition-opacity">Start Trial</Link>
                  </td>
                  <td className="p-8 border-l border-t border-[#1E293B]">
                    <Link to="/signup" className="block w-full text-center border border-[#1E293B] bg-[#1E293B] text-white py-3 rounded hover:bg-[#2A3B52] font-bold transition-colors">Contact Sales</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 3: ADD-ON MODULES */}
      <section className="py-24 border-t border-[#1E293B]" style={{ backgroundColor: '#05070A' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-4xl font-bold text-white mb-4">
              Optional Add-on Modules
            </h2>
            <p className="text-[#94A3B8]">Available exclusively on Growth & Enterprise plans.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <BarChart3 className="text-[#4DD9AC]"/>, name: 'Advanced Analytics Pack', price: '₹2,999/mo', desc: 'Custom dashboards, raw data export, BI tool integration' },
              { icon: <Radio className="text-[#4DD9AC]"/>, name: 'IoT Hardware Pairing', price: '₹499/device/mo', desc: 'Sensor provisioning + remote diagnostics + replacement SLA' },
              { icon: <Building2 className="text-[#4DD9AC]"/>, name: 'Cold Hub Network Access', price: '₹1,999/mo', desc: 'Priority booking at 40+ partner cold hubs across India' },
              { icon: <Bell className="text-[#4DD9AC]"/>, name: 'WhatsApp Premium Alerts', price: '₹1,499/mo', desc: 'Unlimited WhatsApp messages + read receipts + driver ack tracking' },
              { icon: <FileText className="text-[#4DD9AC]"/>, name: 'Compliance Suite', price: '₹3,999/mo', desc: 'Automated compliance reports + e-signature + audit-ready export' },
              { icon: <Map className="text-[#4DD9AC]"/>, name: 'Route Intelligence', price: '₹2,499/mo', desc: 'AI route optimization + traffic-aware ETA + alternate route auto-suggest' }
            ].map((addon, i) => (
              <div key={i} className="border border-[#1E293B] rounded-xl p-6 bg-[#080B12] hover:border-[#4DD9AC]/50 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-3xl">{addon.icon}</div>
                  <div className="bg-[#111622] text-[#4DD9AC] px-3 py-1 rounded text-sm font-bold font-mono border border-[#1E293B]">{addon.price}</div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{addon.name}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed">{addon.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: ROI CALCULATOR */}
      <section className="py-24 border-y border-[#1E293B]" style={{ backgroundColor: COLORS.bg }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border border-[#1E293B] rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row bg-[#0A0D14]">
            
            {/* Input Side */}
            <div className="p-10 md:w-1/2 border-b md:border-b-0 md:border-r border-[#1E293B]">
              <div className="flex items-center gap-3 mb-8">
                <Calculator className="w-6 h-6 text-[#4DD9AC]" />
                <h2 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white">Calculate Your Cargofy ROI</h2>
              </div>

              <div className="space-y-8">
                <div>
                  <label className="block text-[#94A3B8] mb-2 font-medium">How many cold chain shipments per month?</label>
                  <input 
                    type="range" min="50" max="5000" step="50" 
                    value={shipments} onChange={(e) => setShipments(Number(e.target.value))}
                    className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#4DD9AC]"
                  />
                  <div className="mt-2 text-white font-mono text-xl">{shipments.toLocaleString()} shipments</div>
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-2 font-medium">Average value of goods per shipment? (₹)</label>
                  <input 
                    type="range" min="10000" max="500000" step="5000" 
                    value={value} onChange={(e) => setValue(Number(e.target.value))}
                    className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#4DD9AC]"
                  />
                  <div className="mt-2 text-white font-mono text-xl">₹ {value.toLocaleString()}</div>
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-2 font-medium">Your current spoilage/loss rate? (%)</label>
                  <input 
                    type="range" min="0.5" max="15.0" step="0.1" 
                    value={spoilage} onChange={(e) => setSpoilage(Number(e.target.value))}
                    className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#4DD9AC]"
                  />
                  <div className="mt-2 text-white font-mono text-xl">{spoilage.toFixed(1)} %</div>
                </div>
              </div>
            </div>

            {/* Output Side */}
            <div className="p-10 md:w-1/2 bg-[#111622] flex flex-col justify-center">
              <h3 className="text-sm font-bold text-[#94A3B8] uppercase tracking-wider mb-8">Your Estimated Results With Cargofy</h3>
              
              <div className="space-y-4 mb-10">
                <div className="flex justify-between items-center">
                  <span className="text-[#94A3B8]">Current monthly loss:</span>
                  <span className="text-white font-mono">₹ {currentLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#94A3B8]">Expected loss after Cargofy:</span>
                  <span className="text-[#4DD9AC] font-mono">₹ {expectedLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-[#1E293B]">
                  <span className="text-white font-bold">Monthly Savings:</span>
                  <span className="text-[#4DD9AC] font-bold font-mono text-xl">₹ {monthlySavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#64748B]">Cargofy cost (Growth plan):</span>
                  <span className="text-[#64748B] font-mono">- ₹ {growthCost.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-[#0A0D14] p-4 rounded-lg border border-[#1E293B]">
                  <div className="text-[#94A3B8] text-xs uppercase mb-1">Estimated ROI</div>
                  <div className="text-3xl font-bold text-[#4DD9AC] font-mono">{roi.toLocaleString(undefined, { maximumFractionDigits: 0 })}%</div>
                </div>
                <div className="bg-[#0A0D14] p-4 rounded-lg border border-[#1E293B]">
                  <div className="text-[#94A3B8] text-xs uppercase mb-1">Payback Period</div>
                  <div className="text-3xl font-bold text-white font-mono">&lt; 1 mo</div>
                </div>
              </div>

              <Link to="/signup" className="w-full text-center bg-white text-[#080B12] py-4 rounded-lg font-bold hover:bg-[#4DD9AC] transition-colors shadow-lg">
                Book a Demo to Get Custom Report →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: FAQ */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white">
              Frequently Asked Questions
            </h2>
          </div>
          
          <div className="space-y-6">
            {FAQS.map((faq, idx) => (
              <div key={idx} className="bg-[#111622] border border-[#1E293B] rounded-xl p-6 hover:border-[#4DD9AC]/30 transition-colors">
                <div className="flex gap-4 items-start">
                  <HelpCircle className="w-6 h-6 text-[#4DD9AC] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-bold text-lg mb-2">{faq.q}</h3>
                    <p className="text-[#94A3B8] leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6: BOTTOM CTA */}
      <section className="py-32 border-t border-[#1E293B] bg-[#080B12]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 style={{ fontFamily: FONTS.display }} className="text-4xl md:text-5xl font-bold text-white mb-6">
            Not sure which plan is right?
          </h2>
          <p className="text-xl text-[#94A3B8] mb-12 max-w-2xl mx-auto leading-relaxed">
            Talk to our team. We'll show you exactly how Cargofy maps to your cold chain operation — and what you'd save.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link to="/signup" className="bg-transparent border border-[#1E293B] text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#111622] transition-colors">
              Book a 20-min Call →
            </Link>
            <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]">
              Start Free →
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER (Reused) */}
      <footer className="pt-20 pb-10 border-t border-[#1E293B] bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 md:col-span-1">
              <div style={{ fontFamily: 'monospace' }} className="text-2xl font-bold tracking-widest text-white mb-6">CARGOFY</div>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Platform</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/product" className="hover:text-white transition-colors">Control Tower</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Live Tracking</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Risk Engine</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">IoT Simulator</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Analytics</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Solutions</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/solutions/dairy" className="hover:text-white transition-colors">Dairy</Link></li>
                <li><Link to="/solutions/seafood" className="hover:text-white transition-colors">Seafood</Link></li>
                <li><Link to="/solutions/pharma" className="hover:text-white transition-colors">Pharma</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Company</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link to="/customer-stories" className="hover:text-white transition-colors">Customers</Link></li>
                <li><Link to="/about" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Legal</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#1E293B] flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[#64748B] text-sm">© 2024 Cargofy Smart Supply Chain. Built in India.</p>
            <div className="flex gap-6 text-[#64748B]">
              <a href="#" className="hover:text-white transition-colors text-sm">Twitter/X</a>
              <a href="#" className="hover:text-white transition-colors text-sm">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>
      {/* WhatsApp Chat Widget */}
      <a href="https://wa.me/1234567890" target="_blank" rel="noreferrer" className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      </a>
    </div>
  );
};

export default PricingPage;
