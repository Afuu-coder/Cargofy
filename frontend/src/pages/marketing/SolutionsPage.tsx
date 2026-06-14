import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Menu, X, Droplet, Pill, AlertTriangle, ShieldCheck, FileCheck, CheckCircle2, ChevronDown
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

const INDUSTRY_DATA: Record<string, any> = {
  dairy: {
    title: "Cold Chain Intelligence Built for Dairy.",
    subtitle: "Milk, paneer, curd, butter — every dairy SKU has a tight temperature window and a short shelf life. Cargofy watches both.",
    problemHeadline: "Dairy's Cold Chain Is the Most Unforgiving in FMCG.",
    problemPoints: [
      "Safe window: 2°C–6°C — just 4 degrees",
      "Shelf life: 24–72 hours for fresh",
      "India's average ambient temp: 32–44°C in transit season",
      "Existing solutions alert AFTER breach — too late for fresh dairy"
    ],
    solutions: [
      "Predicts breach 18–35 min before it becomes a loss event",
      "Real-time temp monitoring every 5 min",
      "WhatsApp driver alert under 90 seconds",
      "Nearest cold hub in 11 km radius, on average",
      "FSSAI-ready compliance export"
    ],
    impact: "₹2.8L avg monthly savings · 68% reduction in dairy loss · 91% FSSAI compliance rate",
    dashboards: [
      {
        name: "Control Tower — Dairy View",
        points: [
          "Filter all shipments by product: Dairy",
          "Safe band indicator chip: 2–6°C (industry default pre-loaded)",
          "\"Morning dispatch window\" alert: warns if dispatching after 9AM in summer",
          "Shelf-life countdown shown on every dairy card",
          "FSSAI compliance status chip"
        ]
      },
      {
        name: "Risk Engine — Dairy Calibration",
        points: [
          "Dairy risk model trained on 2-6°C band",
          "+3°C deviation = HIGH risk (not just watchlist)",
          "Time-to-spoil calculated from: initial temp at loading + ambient + travel time",
          "Special flag: \"Door opened >3 min — dairy risk spike\""
        ]
      },
      {
        name: "Alerts — Dairy SOP",
        points: [
          "Pre-loaded WhatsApp template: \"[ALERT] Milk cargo temp: {temp}°C. Safe max 6°C. Check reefer now.\"",
          "Auto-escalate to dairy supervisor if unacknowledged in 8 min",
          "\"Night dispatch recommendation\" alert in summer months"
        ]
      },
      {
        name: "Compliance — Dairy Specific",
        points: [
          "FSSAI temperature log export",
          "Batch-wise temp compliance summary",
          "Loading and delivery temperature documented separately"
        ]
      }
    ],
    icon: Droplet
  },
  seafood: {
    title: "Cold Chain Intelligence Built for Seafood.",
    subtitle: "From harbour to plate, freshness is everything. Cargofy ensures perfect temperature and humidity for your catch.",
    problemHeadline: "Seafood Demands More Than Just Temperature Control.",
    problemPoints: [
      "Dual requirement: Strict 0°C–4°C band AND high humidity control",
      "Time out of water is the ultimate freshness clock",
      "Rejections at destination cost millions in lost premium value",
      "Export documentation requires flawless transit proof"
    ],
    solutions: [
      "Dual-axis tracking for temp and humidity simultaneously",
      "Harbour-to-destination countdown timers",
      "Predictive routing to avoid heatwave delays",
      "Automated export-ready compliance generation",
      "Immediate re-icing recommendations"
    ],
    impact: "Zero-rejection export rate · 45% reduction in spoiled catch · Fully traceable logistics",
    dashboards: [
      {
        name: "Control Tower — Seafood View",
        points: [
          "Humidity shown alongside temp on every seafood card",
          "\"Time out of water\" metric for live cargo",
          "Safe band pre-set: 0–4°C"
        ]
      },
      {
        name: "Risk Engine — Seafood Calibration",
        points: [
          "Dual-axis monitoring: temp AND humidity",
          "Humidity >75% triggers independent alert (separate from temp)",
          "\"Harbour to destination\" countdown for fresh catch",
          "Iced seafood vs refrigerated: different risk models"
        ]
      },
      {
        name: "Alerts — Seafood SOP",
        points: [
          "Pre-loaded template for humidity: \"[HUMIDITY WARNING] Humidity at {humidity}%. Seal all containers.\"",
          "Escalation to seafood buyer if delivery delay >45 min",
          "\"Accept or reject delivery\" flag sent to destination hub on HIGH risk"
        ]
      },
      {
        name: "Compliance — Seafood",
        points: [
          "FSSAI + export documentation-ready",
          "Cold chain certificate for premium seafood buyers"
        ]
      }
    ],
    icon: Droplet
  },
  pharma: {
    title: "Zero-Tolerance Cold Chain for Pharma.",
    subtitle: "Vaccines, biologics, and active ingredients require absolute precision. Cargofy delivers GDP-compliant peace of mind.",
    problemHeadline: "In Pharma, a 1-Degree Excursion means Quarantined Cargo.",
    problemPoints: [
      "Absolute strict bands: 2–8°C or -20°C with zero tolerance",
      "Regulatory bodies demand complete, tamper-proof logs",
      "Excursions require immediate quarantine and root-cause analysis",
      "High-value cargo makes every delayed alert a million-dollar risk"
    ],
    solutions: [
      "Sub-minute anomaly detection for temperature spikes",
      "Instant escalation chains bypassing driver to QP (Qualified Person)",
      "Automated quarantine signaling to destination facilities",
      "Immutable, digitally signed audit trails",
      "Multi-sensor reconciliation for absolute accuracy"
    ],
    impact: "100% GDP compliance · Zero regulatory fines · Complete chain of custody",
    dashboards: [
      {
        name: "Control Tower — Pharma View",
        points: [
          "GDP (Good Distribution Practice) compliance badge per shipment",
          "Excursion count shown prominently (zero tolerance)",
          "License + batch number displayed on shipment cards"
        ]
      },
      {
        name: "Risk Engine — Pharma Calibration",
        points: [
          "2–8°C (standard) or -20°C (frozen biologics) pre-set bands",
          "ANY breach triggers CRITICAL regardless of duration",
          "Zero tolerance mode: 1 minute above band = alert"
        ]
      },
      {
        name: "Alerts — Pharma SOP",
        points: [
          "Immediate escalation to Qualified Person (QP) on any breach",
          "\"Quarantine shipment\" flag sent to destination",
          "Regulatory documentation auto-attached to alert"
        ]
      },
      {
        name: "Compliance — Pharma",
        points: [
          "GDP-compliant temperature log",
          "Excursion report with impact assessment",
          "CDSCO-ready documentation",
          "Digital signature + chain of custody report"
        ]
      }
    ],
    icon: Pill
  }
};

export const SolutionsPage: React.FC = () => {
  const { slug } = useParams();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Default to dairy if not found
  const industryKey = slug && INDUSTRY_DATA[slug] ? slug : 'dairy';
  const data = INDUSTRY_DATA[industryKey];

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
              
              <div className="relative group">
                <Link to="/solutions" className="text-white border-b-2 border-[#4DD9AC] pb-1 text-sm font-medium flex items-center">
                  Solutions <ChevronDown className="ml-1 w-4 h-4" />
                </Link>
                {/* Simple Dropdown for Demo */}
                <div className="absolute left-0 mt-2 w-48 rounded-md shadow-lg bg-[#111622] border border-[#1E293B] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="py-1">
                    <Link to="/solutions/dairy" className="block px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#1A2133] hover:text-white">Dairy</Link>
                    <Link to="/solutions/seafood" className="block px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#1A2133] hover:text-white">Seafood</Link>
                    <Link to="/solutions/pharma" className="block px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#1A2133] hover:text-white">Pharma</Link>
                  </div>
                </div>
              </div>

              <Link to="/customer-stories" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Customers</Link>
              <Link to="/pricing" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">Pricing</Link>
              <Link to="/about" className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium">About</Link>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <Link to="/login" className="text-white hover:text-[#4DD9AC] transition-colors text-sm font-medium px-3 py-2">Login</Link>
              <Link to={`/signup?industry=${industryKey}`} style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-5 py-2.5 rounded-md font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(77,217,172,0.3)]">
                Book a Demo →
              </Link>
            </div>
            <div className="md:hidden flex items-center">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#94A3B8] hover:text-white">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 relative overflow-hidden" style={{ backgroundColor: '#05070A' }}>
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #4DD9AC 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-[#111622] border border-[#1E293B] text-[#4DD9AC] px-4 py-2 rounded-full font-mono text-sm mb-8">
            <data.icon className="w-4 h-4" /> CARGOFY FOR {industryKey.toUpperCase()}
          </div>
          <h1 style={{ fontFamily: FONTS.display }} className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
            {data.title.split('Built for ')[0]}<br/>
            <span style={{ color: COLORS.teal }}>Built for {data.title.split('Built for ')[1]}</span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-[#94A3B8] mx-auto mb-10 leading-relaxed max-w-2xl">
            {data.subtitle}
          </p>
          <div className="flex justify-center gap-4">
            <Link to={`/signup?industry=${industryKey}`} style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.4)]">
              Book a {industryKey.charAt(0).toUpperCase() + industryKey.slice(1)} Demo
            </Link>
          </div>
        </div>
      </section>

      {/* THE PROBLEM & SOLUTION */}
      <section className="py-24 bg-[#0A0D14] border-y border-[#1E293B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* The Problem */}
            <div className="p-8 md:p-12 border border-[#1E293B] rounded-2xl bg-[#05070A] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <AlertTriangle className="w-32 h-32 text-[#FF4D4D]" />
              </div>
              <h2 style={{ fontFamily: FONTS.display }} className="text-2xl md:text-3xl font-bold text-white mb-8 relative z-10">
                {data.problemHeadline}
              </h2>
              <ul className="space-y-6 relative z-10">
                {data.problemPoints.map((pt: string, i: number) => (
                  <li key={i} className="flex items-start">
                    <div className="bg-[#FF4D4D]/20 p-1 rounded mt-1 mr-4">
                      <X className="w-4 h-4 text-[#FF4D4D]" />
                    </div>
                    <span className="text-[#94A3B8] text-lg">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* How Cargofy Solves It */}
            <div className="p-8 md:p-12 border border-[#4DD9AC]/30 rounded-2xl bg-[#111622] relative overflow-hidden shadow-[0_0_50px_rgba(77,217,172,0.05)]">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <ShieldCheck className="w-32 h-32 text-[#4DD9AC]" />
              </div>
              <h2 style={{ fontFamily: FONTS.display }} className="text-2xl md:text-3xl font-bold text-white mb-8 relative z-10">
                How Cargofy Solves It
              </h2>
              <ul className="space-y-6 relative z-10">
                {data.solutions.map((pt: string, i: number) => (
                  <li key={i} className="flex items-start">
                    <div className="bg-[#4DD9AC]/20 p-1 rounded mt-1 mr-4">
                      <CheckCircle2 className="w-4 h-4 text-[#4DD9AC]" />
                    </div>
                    <span className="text-white text-lg">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* DASHBOARD DETAILS */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 style={{ fontFamily: FONTS.display }} className="text-3xl md:text-5xl font-bold text-white mb-4">
              {industryKey.toUpperCase()}-SPECIFIC DASHBOARD FEATURES
            </h2>
            <p className="text-xl text-[#94A3B8]">The platform naturally adapts to the physics of your product.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {data.dashboards.map((dash: any, i: number) => (
              <div key={i} className="border border-[#1E293B] bg-[#111622] p-8 rounded-xl hover:-translate-y-1 transition-transform shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#4DD9AC] opacity-50 group-hover:opacity-100 transition-opacity"></div>
                <h3 style={{ fontFamily: FONTS.display }} className="text-2xl font-bold text-white mb-6 pl-4">{dash.name}</h3>
                <ul className="space-y-4 pl-4">
                  {dash.points.map((pt: string, idx: number) => (
                    <li key={idx} className="flex items-start text-[#94A3B8]">
                      <span className="text-[#4DD9AC] mr-3 font-bold mt-1">→</span>
                      <span className="leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IMPACT BANNER */}
      <section className="py-16 border-y border-[#1E293B]" style={{ backgroundColor: '#05070A' }}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-sm text-[#94A3B8] font-bold uppercase tracking-widest mb-6">Industry Impact</div>
          <div className="text-2xl md:text-4xl font-bold text-white leading-relaxed max-w-4xl mx-auto" style={{ fontFamily: FONTS.display }}>
            {data.impact.split('·').map((stat: string, i: number, arr: any) => (
              <React.Fragment key={i}>
                <span className={i === 1 ? 'text-[#4DD9AC]' : ''}>{stat.trim()}</span>
                {i < arr.length - 1 && <span className="text-[#1E293B] mx-4">|</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-32 border-t border-[#1E293B] bg-[#080B12] text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 style={{ fontFamily: FONTS.display }} className="text-4xl font-bold text-white mb-8">
            Ready to secure your {industryKey} supply chain?
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link to={`/signup?industry=${industryKey}`} style={{ backgroundColor: COLORS.teal }} className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]">
              Book a Custom Demo →
            </Link>
            <Link to="/customer-stories" className="bg-[#111622] border border-[#1E293B] text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors">
              Read Industry Case Studies
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

export default SolutionsPage;
