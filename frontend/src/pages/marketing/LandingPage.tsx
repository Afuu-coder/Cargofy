import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Menu, X, ChevronDown, EyeOff, Clock, FileX, Activity, BrainCircuit, 
  AlertTriangle, FileCheck, PlusSquare, MonitorPlay, Zap, Map, 
  Cpu, MessageSquareWarning, Droplet, Snowflake, Carrot, Factory, Pill, 
  ArrowRight, PlayCircle, ShieldAlert
} from 'lucide-react';

import { AnimatedIndiaMap } from '../../components/marketing/AnimatedIndiaMap';

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

export const LandingPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const TABS = [
    { id: 'monitor', label: 'Monitor', icon: Activity, title: 'Live IoT monitoring for every shipment.', desc: 'Temperature · Humidity · Location · Reefer health — updated every 5 minutes.' },
    { id: 'predict', label: 'Predict', icon: BrainCircuit, title: 'AI-powered spoilage prediction before breach becomes loss.', desc: 'Axon calculates time-to-spoil and risk score — and tells you exactly why.' },
    { id: 'intervene', label: 'Intervene', icon: Zap, title: 'One-tap alerts, reroutes, and cold hub recommendations.', desc: 'When risk rises, Axon tells you what to do — and helps you do it.' },
    { id: 'prove', label: 'Prove', icon: FileCheck, title: 'Full audit trail, compliance logs, and post-delivery reports.', desc: 'Every shipment, every excursion, every action — documented.' }
  ];

  return (
    <div style={{ backgroundColor: COLORS.bg, color: COLORS.textMain, fontFamily: FONTS.body, minHeight: '100vh' }}>
      
      {/* SECTION 1: NAV BAR */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#080B12]/90 backdrop-blur-md border-b border-[#1E293B] shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" style={{ fontFamily: 'monospace' }} className="text-2xl font-bold tracking-widest text-white hover:text-[#4DD9AC] transition-colors">
                AXON
              </Link>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/product" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Platform</Link>
              <Link to="/solutions" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Solutions</Link>
              <Link to="/customer-stories" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Customers</Link>
              <Link to="/about" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">About</Link>
              <Link to="/pricing" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Pricing</Link>
            </div>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center space-x-4">
              <Link to="/login" className="text-white hover:text-[#4DD9AC] transition-colors text-sm font-medium px-3 py-2">
                Login
              </Link>
              <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-5 py-2.5 rounded-md font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(77,217,172,0.3)]">
                Book a Demo →
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#94A3B8] hover:text-white">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* SECTION 2: HERO */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <AnimatedIndiaMap />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 style={{ fontFamily: FONTS.display }} className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-tight">
            Stop Cold Chain Loss.<br/>
            <span style={{ color: COLORS.teal }}>Before It Happens.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg md:text-xl text-[#94A3B8] mx-auto mb-10 leading-relaxed">
            Axon is India's first AI-powered cold chain intelligence platform. Monitor every perishable shipment in real time, predict spoilage before it occurs, and intervene — automatically.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-16">
            <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="w-full sm:w-auto text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(77,217,172,0.4)]">
              Book a Demo →
            </Link>
            <button style={{ borderColor: COLORS.border }} className="w-full sm:w-auto flex items-center justify-center bg-transparent border text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#111622] transition-colors">
              <PlayCircle className="w-5 h-5 mr-2" /> Watch 2-min Demo
            </button>
          </div>

          {/* Social Proof Strip */}
          <div className="pt-8 border-t border-[#1E293B]">
            <p className="text-sm font-medium text-[#94A3B8] uppercase tracking-wider mb-6">
              Trusted by leading FMCG, Dairy, and Pharma companies
            </p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="text-xl font-bold font-serif italic">Amul</div>
              <div className="text-xl font-bold tracking-widest">CIPLA</div>
              <div className="text-xl font-bold font-sans">Mother Dairy</div>
              <div className="text-xl font-bold tracking-tighter">Nestlé</div>
              <div className="text-xl font-bold italic">ITC Limited</div>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-4 md:gap-8 text-sm text-[#94A3B8]">
              <span><strong className="text-white">128+</strong> companies</span>
              <span className="hidden md:inline">•</span>
              <span><strong className="text-white">14</strong> states</span>
              <span className="hidden md:inline">•</span>
              <span><strong className="text-white">2.4M</strong> shipments monitored</span>
              <span className="hidden md:inline">•</span>
              <span><strong className="text-white" style={{ color: COLORS.teal }}>₹42Cr</strong> loss prevented</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: THE PROBLEM */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
              <span style={{ color: COLORS.red }}>₹92,000 Crore</span> Worth of Food Spoils Every Year in India's Supply Chain.
            </h2>
            <p className="text-xl text-[#94A3B8]">
              Most of It Is Preventable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="border p-8 rounded-xl hover:-translate-y-1 transition-transform">
              <EyeOff className="w-10 h-10 mb-6 text-[#FF4D4D]" />
              <h3 style={{ fontFamily: FONTS.display }} className="text-xl font-bold text-white mb-4">No Visibility</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                Ops teams find out about a temperature breach hours after it happened.
              </p>
            </div>
            <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="border p-8 rounded-xl hover:-translate-y-1 transition-transform">
              <Clock className="w-10 h-10 mb-6 text-[#FFB020]" />
              <h3 style={{ fontFamily: FONTS.display }} className="text-xl font-bold text-white mb-4">Too Late to Act</h3>
              <p className="text-[#94A3B8] leading-relaxed mb-4">
                By the time a temp breach is noticed, the damage is already done.
              </p>
              <div className="text-sm font-mono text-[#FFB020] bg-[#FFB020]/10 py-1 px-3 rounded inline-block">
                Average detection: 2h 40 min
              </div>
            </div>
            <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="border p-8 rounded-xl hover:-translate-y-1 transition-transform">
              <FileX className="w-10 h-10 mb-6 text-[#94A3B8]" />
              <h3 style={{ fontFamily: FONTS.display }} className="text-xl font-bold text-white mb-4">No Proof</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                When spoilage happens, there's no data to understand why. No audit trail. No accountability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: THE SOLUTION */}
      <section className="py-24" style={{ backgroundColor: COLORS.bg }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white max-w-4xl mx-auto leading-tight">
              Axon Gives You Eyes, Intelligence, and Control Across Every Cold Chain Shipment
            </h2>
          </div>

          <div className="flex flex-col lg:flex-row gap-12">
            <div className="lg:w-1/3 flex flex-col gap-4">
              {TABS.map((tab, index) => {
                const Icon = tab.icon;
                const isActive = activeTab === index;
                return (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(index)}
                    style={{ 
                      backgroundColor: isActive ? COLORS.surfaceHover : 'transparent',
                      borderColor: isActive ? COLORS.teal : COLORS.border
                    }}
                    className={`flex items-start text-left p-6 rounded-xl border transition-all duration-300 ${isActive ? 'shadow-[0_0_15px_rgba(77,217,172,0.1)]' : 'hover:bg-[#111622]'}`}
                  >
                    <Icon className={`w-6 h-6 mr-4 mt-1 flex-shrink-0 ${isActive ? 'text-[#4DD9AC]' : 'text-[#94A3B8]'}`} />
                    <div>
                      <h3 style={{ fontFamily: FONTS.display }} className={`text-xl font-bold mb-2 ${isActive ? 'text-white' : 'text-[#94A3B8]'}`}>
                        {tab.label}
                      </h3>
                      {isActive && <p className="text-sm text-[#94A3B8] leading-relaxed">{tab.title}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="lg:w-2/3">
              <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="w-full h-full min-h-[400px] border rounded-2xl p-8 relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#4DD9AC] opacity-5 blur-[100px] rounded-full pointer-events-none transition-opacity duration-700 group-hover:opacity-10"></div>
                
                <div>
                  <h4 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-4">
                    {TABS[activeTab].title}
                  </h4>
                  <p className="text-[#94A3B8] text-lg mb-8 max-w-lg">
                    {TABS[activeTab].desc}
                  </p>
                </div>
                
                {/* Abstract UI Mockup */}
                <div style={{ backgroundColor: '#080B12', borderColor: COLORS.border }} className="w-full h-64 border rounded-xl overflow-hidden relative shadow-2xl">
                  {/* Fake UI Header */}
                  <div className="w-full h-8 bg-[#111622] border-b border-[#1E293B] flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF4D4D]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#FFB020]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#4DD9AC]"></div>
                  </div>
                  {/* Fake Data Lines */}
                  <div className="p-6 space-y-4">
                    <div className="w-3/4 h-4 bg-[#1E293B] rounded animate-pulse"></div>
                    <div className="w-1/2 h-4 bg-[#1E293B] rounded animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-full h-24 mt-6 border border-[#1E293B] rounded flex items-end p-2 gap-2">
                       {/* Bar chart mockup */}
                       {[40, 70, 45, 90, 65, 30, 80].map((h, i) => (
                         <div key={i} className="flex-1 bg-[#4DD9AC]/20 rounded-t" style={{ height: `${h}%` }}>
                           <div className="w-full bg-[#4DD9AC] rounded-t" style={{ height: '4px' }}></div>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: METRICS */}
      <section className="py-16 border-y border-[#1E293B]" style={{ backgroundColor: '#0A0D14' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-[#1E293B] text-center">
            <div className="px-4">
              <div style={{ fontFamily: FONTS.display, color: COLORS.teal }} className="text-4xl md:text-5xl font-bold mb-2">₹42 Crore</div>
              <div className="text-white font-medium mb-1">Loss Prevented</div>
              <div className="text-xs text-[#94A3B8]">by Axon Users</div>
            </div>
            <div className="px-4">
              <div style={{ fontFamily: FONTS.display, color: COLORS.teal }} className="text-4xl md:text-5xl font-bold mb-2">94.8%</div>
              <div className="text-white font-medium mb-1">On-Time Compliance</div>
              <div className="text-xs text-[#94A3B8]">Cold Chain Avg</div>
            </div>
            <div className="px-4">
              <div style={{ fontFamily: FONTS.display, color: COLORS.teal }} className="text-4xl md:text-5xl font-bold mb-2">2.4 M</div>
              <div className="text-white font-medium mb-1">Shipments</div>
              <div className="text-xs text-[#94A3B8]">Monitored successfully</div>
            </div>
            <div className="px-4">
              <div style={{ fontFamily: FONTS.display, color: COLORS.teal }} className="text-4xl md:text-5xl font-bold mb-2">67%</div>
              <div className="text-white font-medium mb-1">Reduction</div>
              <div className="text-xs text-[#94A3B8]">in Excursion Duration</div>
            </div>
          </div>
          <p className="text-center text-[#94A3B8] text-xs mt-10">
            *Based on Axon customer data, 2024
          </p>
        </div>
      </section>

      {/* SECTION 6: HOW IT WORKS */}
      <section className="py-24" style={{ backgroundColor: COLORS.bg }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white">
              From Shipment to Delivery — Axon Never Blinks
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-[#4DD9AC]/10 via-[#4DD9AC]/50 to-[#4DD9AC]/10 z-0"></div>

            <div className="relative z-10 flex flex-col items-center text-center group">
              <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="w-24 h-24 rounded-full border-2 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-[#4DD9AC] transition-colors duration-500">
                <PlusSquare className="w-10 h-10 text-[#4DD9AC]" />
              </div>
              <h3 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-4">1. Create & Dispatch</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                Set up your shipment with product type, route, temperature thresholds, and assigned vehicle. Takes under 3 minutes.
              </p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center group">
              <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="w-24 h-24 rounded-full border-2 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-[#4DD9AC] transition-colors duration-500">
                <MonitorPlay className="w-10 h-10 text-[#4DD9AC]" />
              </div>
              <h3 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-4">2. Monitor in Real Time</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                IoT sensors or our simulator feed live telemetry. Axon's AI watches every signal and calculates spoilage risk continuously.
              </p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center group">
              <div style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="w-24 h-24 rounded-full border-2 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-[#4DD9AC] transition-colors duration-500">
                <ShieldAlert className="w-10 h-10 text-[#4DD9AC]" />
              </div>
              <h3 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-4">3. Intervene Early</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                If risk rises, Axon alerts your driver, suggests rerouting, and recommends the nearest cold hub — before damage is done.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: PRODUCT FEATURE HIGHLIGHTS */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-32">
          
          {/* Feature A */}
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="md:w-1/2">
              <div style={{ borderColor: COLORS.border }} className="aspect-video w-full border rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
                <img src="/images/axon_live_map.png" alt="Live Map & Dashboard UI" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="md:w-1/2">
              <h3 style={{ fontFamily: FONTS.display }} className="text-3xl font-bold text-white mb-6">Cold Chain Control Tower</h3>
              <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
                See your entire cold chain network at a glance. Active shipments, at-risk loads, live fleet positions, and exception queue — all in one screen.
              </p>
              <ul className="space-y-4">
                {['Live shipment journey board', 'Exception-first UI — critical issues surface instantly', 'AI-generated action recommendations', 'Real-time India logistics map'].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <div className="mr-3 mt-1 w-1.5 h-1.5 rounded-full bg-[#4DD9AC] flex-shrink-0"></div>
                    <span className="text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature B */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            <div className="md:w-1/2">
              <div style={{ borderColor: COLORS.border }} className="aspect-video w-full border rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
                <img src="/images/axon_risk_engine.png" alt="Risk Engine Analysis UI" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="md:w-1/2">
              <h3 style={{ fontFamily: FONTS.display }} className="text-3xl font-bold text-white mb-6">Spoilage Prediction Engine</h3>
              <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
                Axon calculates spoilage risk using 8+ live factors: cargo temperature, ambient conditions, humidity, transit delay, reefer health, and more.
              </p>
              <ul className="space-y-4">
                {['Risk score updated every 60 seconds', 'Factor-by-factor breakdown of what\'s driving risk', '"If you act now" vs "if you wait" outcome comparison', 'Operational language — no jargon'].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <div className="mr-3 mt-1 w-1.5 h-1.5 rounded-full bg-[#4DD9AC] flex-shrink-0"></div>
                    <span className="text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature C */}
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="md:w-1/2">
              <div style={{ borderColor: COLORS.border }} className="aspect-video w-full border rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
                <img src="/images/axon_iot_telemetry.png" alt="IoT Telemetry / Simulator UI" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="md:w-1/2">
              <h3 style={{ fontFamily: FONTS.display }} className="text-3xl font-bold text-white mb-6">IoT + Simulation</h3>
              <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
                Works with live IoT hardware or our built-in simulator. No sensors yet? Simulate any condition — heatwave, reefer failure, route delay — and see how Axon responds.
              </p>
              <ul className="space-y-4">
                {['Compatible with major IoT sensor providers', '8 scenario presets for immediate testing', 'Real-time risk response to every sensor change', 'Demo-ready — no hardware needed'].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <div className="mr-3 mt-1 w-1.5 h-1.5 rounded-full bg-[#4DD9AC] flex-shrink-0"></div>
                    <span className="text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature D */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            <div className="md:w-1/2">
              <div style={{ borderColor: COLORS.border }} className="aspect-video w-full border rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
                <img src="/images/axon_interventions.png" alt="Intervention & Alerts UI" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="md:w-1/2">
              <h3 style={{ fontFamily: FONTS.display }} className="text-3xl font-bold text-white mb-6">Intervention Engine</h3>
              <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
                When risk rises, Axon doesn't just warn — it acts. One-tap WhatsApp alerts, escalation chain management, and nearest cold hub recommendations with estimated spoilage impact shown before you decide.
              </p>
              <ul className="space-y-4">
                {['WhatsApp + Push + SMS alerts', 'Auto-escalation if driver doesn\'t acknowledge', 'Nearest cold storage with booking integration', 'Full SOP playbooks per alert type'].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <div className="mr-3 mt-1 w-1.5 h-1.5 rounded-full bg-[#4DD9AC] flex-shrink-0"></div>
                    <span className="text-white">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 8: INDUSTRIES / SOLUTIONS */}
      <section className="py-24 border-y border-[#1E293B]" style={{ backgroundColor: COLORS.bg }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white">
              Built for Every Perishable Category
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Droplet, title: 'Dairy', specs: '2–6°C band · Fresh shelf life mgmt' },
              { icon: Droplet, title: 'Seafood', specs: '0–4°C band · Humidity control', forceBlue: true },
              { icon: Pill, title: 'Pharma', specs: '2–8°C cold chain + docs compliance' },
              { icon: Snowflake, title: 'Frozen', specs: '-18°C deep freeze mgmt' },
              { icon: Carrot, title: 'F&V', specs: 'Multi-product temp zones' },
              { icon: Factory, title: 'FMCG', specs: 'Multi-SKU cold chain' }
            ].map((ind, i) => {
              const Icon = ind.icon;
              return (
                <div key={i} style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="border rounded-xl p-8 hover:-translate-y-1 transition-transform group cursor-pointer">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`p-3 rounded-lg bg-[#111622] border border-[#1E293B] group-hover:border-[#4DD9AC] transition-colors`}>
                      <Icon className={`w-6 h-6 ${ind.forceBlue ? 'text-blue-400' : 'text-[#4DD9AC]'}`} />
                    </div>
                    <h3 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white">{ind.title}</h3>
                  </div>
                  <div className="text-[#94A3B8] font-mono text-sm mb-6 pb-6 border-b border-[#1E293B]">
                    {ind.specs.split('·').map((s, idx) => <div key={idx} className="mb-1">{s.trim()}</div>)}
                  </div>
                  <Link to="/solutions" className="flex items-center text-[#4DD9AC] font-bold text-sm hover:underline">
                    Learn more <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 9: CUSTOMER STORIES */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white">
              Real Results From Real Cold Chains
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }} className="border rounded-xl p-8 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#4DD9AC] opacity-0 blur-[50px] rounded-full transition-opacity duration-500 group-hover:opacity-5"></div>
                <div>
                  <div className="h-8 w-24 bg-[#1E293B] rounded mb-8"></div> {/* Fake Logo */}
                  <p className="text-white text-xl font-medium leading-relaxed italic mb-8">
                    "We reduced cold chain loss by 71% in the first 3 months with Axon."
                  </p>
                  <p className="text-[#94A3B8] text-sm font-bold uppercase tracking-wider mb-1">
                    — Head of Supply Chain, Company {i}
                  </p>
                  <p className="text-[#64748B] text-sm mb-8">
                    North-East India Dairy Network
                  </p>
                </div>
                <div>
                  <div className="bg-[#4DD9AC]/10 text-[#4DD9AC] font-mono text-sm inline-block px-3 py-1 rounded mb-6">
                    ₹18L saved in first quarter
                  </div>
                  <Link to="/customer-stories" className="block w-full text-center border border-[#1E293B] text-white py-3 rounded hover:bg-[#1E293B] transition-colors font-bold text-sm">
                    Read Case Study →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 10: TRUST / INTEGRATIONS */}
      <section className="py-16 border-y border-[#1E293B]" style={{ backgroundColor: COLORS.bg }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-lg font-medium text-[#94A3B8] uppercase tracking-wider mb-10">
            Works With Your Existing Stack
          </h3>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-60">
            <div className="text-xl font-bold font-sans tracking-tight">WhatsApp Business</div>
            <div className="text-xl font-bold font-sans tracking-tight">Google Maps</div>
            <div className="text-2xl font-black font-sans">SAP</div>
            <div className="text-xl font-bold font-serif italic">Thermo King</div>
            <div className="text-xl font-bold font-mono">TELTONIKA</div>
            <div className="text-2xl font-black font-sans">AWS</div>
          </div>
        </div>
      </section>

      {/* SECTION 11: DEMO CTA SECTION */}
      <section className="py-32 relative overflow-hidden" style={{ backgroundColor: '#05070A' }}>
        {/* Subtle Route Map Texture */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"100%\\" height=\\"100%\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cpath d=\\"M0,100 Q200,50 400,150 T800,100 T1200,200\\" fill=\\"none\\" stroke=\\"%234DD9AC\\" stroke-width=\\"2\\" stroke-dasharray=\\"5,10\\"/%3E%3C/svg%3E")', backgroundSize: 'cover' }}></div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <h2 style={{ fontFamily: FONTS.display }} className="text-4xl md:text-6xl font-bold text-white mb-6">
            Ready to See Axon in Action?
          </h2>
          <p className="text-xl text-[#94A3B8] mb-12 max-w-2xl mx-auto leading-relaxed">
            Walk through a live cold chain scenario — watch how Axon detects, predicts, and prevents spoilage in real time. Takes 20 minutes. No setup required.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link to="/signup" style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]">
              Book a Free Demo →
            </Link>
            <Link to="/simulator" style={{ borderColor: COLORS.border }} className="bg-[#111622] border text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors">
              Try the Simulator (No Login) →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 12: FOOTER */}
      <footer className="pt-20 pb-10 border-t border-[#1E293B] bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 md:col-span-1">
              <div style={{ fontFamily: 'monospace' }} className="text-2xl font-bold tracking-widest text-white mb-6">AXON</div>
            </div>
            
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Platform</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/product" className="hover:text-white transition-colors">Control Tower</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Live Tracking</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Risk Engine</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">IoT Simulator</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Analytics</Link></li>
                <li><Link to="/product" className="hover:text-white transition-colors">Alerts Center</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Solutions</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/solutions" className="hover:text-white transition-colors">Dairy</Link></li>
                <li><Link to="/solutions" className="hover:text-white transition-colors">Seafood</Link></li>
                <li><Link to="/solutions" className="hover:text-white transition-colors">Pharma</Link></li>
                <li><Link to="/solutions" className="hover:text-white transition-colors">Frozen Goods</Link></li>
                <li><Link to="/solutions" className="hover:text-white transition-colors">FMCG</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Company</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link to="/customer-stories" className="hover:text-white transition-colors">Customers</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Press</Link></li>
                <li><Link to="/about" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Legal</h4>
              <ul className="space-y-4 text-[#94A3B8] text-sm">
                <li><Link to="/" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Security</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Compliance</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-[#1E293B] flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[#64748B] text-sm">
              © 2024 Axon Smart Supply Chain. All rights reserved.<br/>
              Built in India 🇮🇳 for the world's cold chains.
            </p>
            <div className="flex gap-6 text-[#64748B]">
              <a href="#" className="hover:text-white transition-colors text-sm">Twitter/X</a>
              <a href="#" className="hover:text-white transition-colors text-sm">LinkedIn</a>
              <a href="#" className="hover:text-white transition-colors text-sm">GitHub</a>
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

export default LandingPage;
