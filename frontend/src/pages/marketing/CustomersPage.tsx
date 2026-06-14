import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Quote,
  CheckCircle2,
  TrendingDown,
  Clock,
  ShieldCheck,
} from "lucide-react";

const FONTS = {
  display: '"Syne", sans-serif',
  body: '"DM Sans", sans-serif',
};

const COLORS = {
  bg: "#080B12",
  surface: "#111622",
  surfaceHover: "#1A2133",
  teal: "#4DD9AC",
  red: "#FF4D4D",
  amber: "#FFB020",
  textMain: "#F8FAFC",
  textMuted: "#94A3B8",
  border: "#1E293B",
};

const CASE_STUDIES = [
  {
    id: "northeast-dairy",
    logo: "ND",
    name: "Northeast Dairy Network",
    industry: "Dairy",
    size: "Enterprise",
    region: "Northeast India",
    quote:
      "We went from finding out about a breach 3 hours later to getting alerted in under 4 minutes. That changed everything for our NE India dairy network.",
    author: "VP Operations",
    featured: true,
    challenge:
      "Temperature breaches going undetected for hours on the Guwahati to Shillong route. By the time the destination hub found out, the entire load of fresh milk and paneer had spoiled. The existing GPS trackers only showed location, not reefer health.",
    solution: [
      "Control Tower deployed for real-time visibility across 140 vehicles.",
      "WhatsApp alert integration set up for instant driver notification.",
      "Risk Engine calibrated specifically for the 2–6°C dairy band.",
    ],
    results: {
      lossRed: "71%",
      saved: "₹2.8L",
      alert: "4.2 min",
      comp: "91%",
    },
    longQuote:
      "Before Cargofy, we had to rely on drivers calling us when something felt wrong. Now the system tells us what's wrong, why it's wrong, and what to do — before the driver even notices.",
  },
  {
    id: "coastal-catch",
    logo: "CC",
    name: "Coastal Catch Exports",
    industry: "Seafood",
    size: "Mid-Market",
    region: "Kochi & Chennai",
    quote: "Zero rejections at the port since we switched to Cargofy.",
    author: "Head of Logistics",
    featured: false,
    challenge:
      "High rejection rates at export hubs due to undocumented temperature and humidity fluctuations during transit from harbour to processing facilities.",
    solution: [
      "Dual-axis IoT monitoring for both temperature and humidity.",
      "Automated compliance export generation for immediate port clearance.",
    ],
    results: {
      lossRed: "84%",
      saved: "₹12L",
      alert: "2.1 min",
      comp: "100%",
    },
    longQuote:
      "The export documentation used to take us a full day to compile. Now, Cargofy generates the exact compliance certificate the buyers want before the truck even backs into the loading bay.",
  },
  {
    id: "bharat-pharma",
    logo: "BP",
    name: "Bharat Pharma Distributors",
    industry: "Pharma",
    size: "Enterprise",
    region: "Pan-India",
    quote:
      "A 1-degree excursion is unacceptable. Cargofy ensures we never have to guess.",
    author: "Director of Quality Assurance",
    featured: false,
    challenge:
      "Transporting high-value biologics required absolute 2–8°C adherence. Their previous system relied on USB loggers checked at the destination, leading to quarantined cargo that could have been saved with an early intervention.",
    solution: [
      "Zero-tolerance monitoring mode activated.",
      "Automated escalation protocols directly to the Qualified Person (QP).",
      "Cold Hub network integrated for emergency diversions.",
    ],
    results: {
      lossRed: "100%",
      saved: "₹4.5Cr",
      alert: "45 sec",
      comp: "100%",
    },
    longQuote:
      "We had a reefer failure near Pune with ₹45 Lakh worth of vaccines. Cargofy caught it in 45 seconds, escalated it, and successfully routed the driver to a partner cold hub just 8km away. It paid for itself in one day.",
  },
];

export const CustomersPage: React.FC = () => {
  const { slug } = useParams();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const featured = CASE_STUDIES.find((c) => c.featured) || CASE_STUDIES[0];
  const filteredStudies =
    filter === "All"
      ? CASE_STUDIES
      : CASE_STUDIES.filter((c) => c.industry === filter);

  // If a slug is provided, render the Detail View
  if (slug) {
    const study = CASE_STUDIES.find((c) => c.id === slug);
    if (!study)
      return (
        <div className="p-20 text-white text-center">
          Case Study not found.{" "}
          <Link to="/customer-stories" className="text-[#4DD9AC] underline">
            Go back
          </Link>
        </div>
      );

    return (
      <div
        style={{
          backgroundColor: COLORS.bg,
          color: COLORS.textMain,
          fontFamily: FONTS.body,
          minHeight: "100vh",
        }}
      >
        <NavBar
          scrolled={scrolled}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        {/* DETAIL HERO */}
        <section className="pt-32 pb-16 lg:pt-48 lg:pb-16 border-b border-[#1E293B]">
          <div className="max-w-4xl mx-auto px-4">
            <Link
              to="/customer-stories"
              className="text-[#94A3B8] hover:text-white mb-8 inline-block transition-colors font-mono text-sm"
            >
              ← Back to all stories
            </Link>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-[#111622] border border-[#1E293B] flex items-center justify-center font-bold text-2xl text-white">
                {study.logo}
              </div>
              <div>
                <h1
                  style={{ fontFamily: FONTS.display }}
                  className="text-3xl md:text-5xl font-bold text-white mb-2"
                >
                  {study.name}
                </h1>
                <div className="flex gap-3 text-[#94A3B8] text-sm font-mono">
                  <span>{study.industry}</span> • <span>{study.size}</span> •{" "}
                  <span>{study.region}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DETAIL CONTENT */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 space-y-16">
            <div>
              <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest mb-4">
                The Challenge
              </h2>
              <p className="text-[#94A3B8] text-lg leading-relaxed mb-6">
                {study.challenge}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest mb-4">
                How They Use Cargofy
              </h2>
              <ul className="space-y-4">
                {study.solution.map((s, i) => (
                  <li key={i} className="flex items-start">
                    <ArrowRight className="w-5 h-5 text-[#4DD9AC] mr-3 mt-1 flex-shrink-0" />
                    <span className="text-white text-lg">{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8 border border-[#1E293B] rounded-2xl bg-[#0A0D14]">
              <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest mb-8">
                The Results
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-[#111622] border border-[#1E293B] rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    {study.results.lossRed}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Loss Reduction
                  </div>
                </div>
                <div className="bg-[#111622] border border-[#1E293B] rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-[#4DD9AC] mb-1">
                    {study.results.saved}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Saved/mo
                  </div>
                </div>
                <div className="bg-[#111622] border border-[#1E293B] rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    {study.results.alert}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Alert Time
                  </div>
                </div>
                <div className="bg-[#111622] border border-[#1E293B] rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    {study.results.comp}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Compliance
                  </div>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-[#4DD9AC] pl-8 py-2">
              <p className="text-2xl text-white italic leading-relaxed mb-6">
                "{study.longQuote}"
              </p>
              <div className="text-[#94A3B8] font-mono text-sm">
                — {study.author}, {study.name}
              </div>
            </div>

            <div className="pt-8 border-t border-[#1E293B] flex items-center gap-4">
              <span className="text-[#94A3B8] text-sm font-bold uppercase tracking-widest">
                Share:
              </span>
              <a
                href="#"
                className="text-[#94A3B8] hover:text-[#4DD9AC] font-medium text-sm transition-colors border border-[#1E293B] px-4 py-2 rounded inline-block"
              >
                Twitter/X
              </a>
              <a
                href="#"
                className="text-[#94A3B8] hover:text-[#4DD9AC] font-medium text-sm transition-colors border border-[#1E293B] px-4 py-2 rounded inline-block"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </section>

        {/* DETAIL CTA */}
        <section className="py-24 border-t border-[#1E293B] bg-[#0A0D14] text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h2
              style={{ fontFamily: FONTS.display }}
              className="text-4xl font-bold text-white mb-8"
            >
              Want similar results?
            </h2>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <Link
                to="/signup"
                style={{ backgroundColor: COLORS.teal }}
                className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]"
              >
                Book a Demo →
              </Link>
              <Link
                to="/pricing"
                className="bg-[#111622] border border-[#1E293B] text-white px-8 py-4 rounded-md font-bold text-lg hover:bg-[#1A2133] transition-colors"
              >
                See Pricing
              </Link>
            </div>
          </div>
        </section>

        <Footer />
        <WhatsAppWidget />
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.textMain,
        fontFamily: FONTS.body,
        minHeight: "100vh",
      }}
    >
      <NavBar
        scrolled={scrolled}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* HERO */}
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 border-b border-[#1E293B] text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1
            style={{ fontFamily: FONTS.display }}
            className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight"
          >
            Results That Speak for{" "}
            <span style={{ color: COLORS.teal }}>Themselves</span>.
          </h1>
          <p className="mt-4 text-lg md:text-xl text-[#94A3B8] mx-auto mb-12 leading-relaxed max-w-2xl">
            India's leading FMCG, dairy, seafood, and pharma companies trust
            Cargofy to protect their cold chain every day.
          </p>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8 font-mono text-sm font-bold text-white uppercase tracking-wider">
            <span className="bg-[#111622] border border-[#1E293B] px-4 py-2 rounded-full">
              ₹42 Crore saved
            </span>
            <span className="bg-[#111622] border border-[#1E293B] px-4 py-2 rounded-full">
              2.4M shipments monitored
            </span>
            <span className="bg-[#111622] border border-[#1E293B] px-4 py-2 rounded-full">
              14 states
            </span>
            <span className="bg-[#111622] border border-[#1E293B] px-4 py-2 rounded-full">
              94.8% cold compliance
            </span>
          </div>
        </div>
      </section>

      {/* LOGO WALL */}
      <section className="py-12 border-b border-[#1E293B] bg-[#0A0D14]">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-widest mb-8">
            Trusted by India's Leading Cold Chain Operations
          </p>
          <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            <div className="text-xl font-bold font-serif italic">Amul</div>
            <div className="text-xl font-bold tracking-widest">CIPLA</div>
            <div className="text-xl font-bold font-sans">Mother Dairy</div>
            <div className="text-xl font-bold tracking-tighter">Nestlé</div>
            <div className="text-xl font-bold italic">ITC Limited</div>
          </div>
        </div>
      </section>

      {/* FEATURED CASE STUDY */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border border-[#1E293B] rounded-2xl bg-[#111622] relative overflow-hidden flex flex-col md:flex-row group">
            {/* Left/Content */}
            <div className="p-8 md:p-12 md:w-2/3 z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-[#1E293B] rounded flex items-center justify-center font-bold text-white">
                  {featured.logo}
                </div>
                <div className="text-[#4DD9AC] font-bold text-sm tracking-widest uppercase">
                  FEATURED STORY
                </div>
              </div>
              <p className="text-2xl md:text-3xl text-white italic leading-relaxed mb-6 font-light">
                "{featured.quote}"
              </p>
              <div className="text-[#94A3B8] font-mono text-sm mb-12">
                — {featured.author}, {featured.name}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <div className="border border-[#1E293B] bg-[#0A0D14] rounded p-4 text-center">
                  <div className="text-2xl font-bold text-white mb-1">
                    {featured.results.lossRed}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Loss Red.
                  </div>
                </div>
                <div className="border border-[#1E293B] bg-[#0A0D14] rounded p-4 text-center">
                  <div className="text-2xl font-bold text-[#4DD9AC] mb-1">
                    {featured.results.saved}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Saved/mo
                  </div>
                </div>
                <div className="border border-[#1E293B] bg-[#0A0D14] rounded p-4 text-center">
                  <div className="text-2xl font-bold text-white mb-1">
                    {featured.results.alert}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Alert Resp.
                  </div>
                </div>
                <div className="border border-[#1E293B] bg-[#0A0D14] rounded p-4 text-center">
                  <div className="text-2xl font-bold text-white mb-1">
                    {featured.results.comp}
                  </div>
                  <div className="text-[#94A3B8] text-xs uppercase">
                    Compliance
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <Link
                  to={`/customer-stories/${featured.id}`}
                  className="inline-flex items-center text-[#4DD9AC] font-bold hover:text-white transition-colors"
                >
                  Read Full Story <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
                <div className="text-[#94A3B8] text-sm border-l border-[#1E293B] pl-6">
                  Industry: {featured.industry}
                </div>
              </div>
            </div>

            {/* Right/Visual */}
            <div className="md:w-1/3 bg-[#05070A] border-l border-[#1E293B] p-8 flex items-center justify-center relative">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at center, #4DD9AC 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              ></div>
              <Quote className="w-48 h-48 text-[#1E293B] opacity-50 relative z-10 group-hover:scale-110 transition-transform duration-700" />
            </div>
          </div>
        </div>
      </section>

      {/* GRID */}
      <section className="py-12 bg-[#05070A]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 mb-12 border-b border-[#1E293B] pb-6">
            {["All", "Dairy", "Seafood", "Pharma"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-2 rounded-md font-bold text-sm transition-colors ${filter === cat ? "bg-[#1E293B] text-white" : "text-[#94A3B8] hover:text-white"}`}
              >
                {cat === "All" ? "All Industries" : cat}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {filteredStudies.map((study) => (
              <div
                key={study.id}
                className="border border-[#1E293B] bg-[#111622] rounded-xl p-8 hover:border-[#4DD9AC]/50 transition-colors flex flex-col h-full"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#1E293B] rounded flex items-center justify-center font-bold text-white text-xs">
                      {study.logo}
                    </div>
                    <div className="text-white font-bold">{study.name}</div>
                  </div>
                  <div className="text-[#94A3B8] text-xs font-mono border border-[#1E293B] px-2 py-1 rounded">
                    {study.industry}
                  </div>
                </div>

                <div className="mb-6 flex-1">
                  <div className="text-[#4DD9AC] text-xs font-bold uppercase tracking-widest mb-2">
                    Challenge:
                  </div>
                  <p className="text-[#94A3B8] italic">
                    "{study.challenge.substring(0, 100)}..."
                  </p>
                </div>

                <div className="mb-8">
                  <div className="text-[#4DD9AC] text-xs font-bold uppercase tracking-widest mb-3">
                    Result:
                  </div>
                  <div className="space-y-2 text-sm text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#FF4D4D]"></div>{" "}
                      Before: High unmonitored risk
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#4DD9AC]"></div>{" "}
                      After: {study.results.comp} Compliance
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-[#1E293B] mb-6 flex justify-between font-mono text-sm text-white">
                  <span>{study.results.saved} saved/mo</span>
                  <span className="text-[#4DD9AC]">
                    {study.results.lossRed} loss reduction
                  </span>
                </div>

                <Link
                  to={`/customer-stories/${study.id}`}
                  className="mt-auto inline-flex items-center text-[#94A3B8] hover:text-[#4DD9AC] font-bold transition-colors"
                >
                  Read Case Study <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="py-24 border-t border-[#1E293B] bg-[#080B12]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-widest mb-12">
            CARGOFY BY THE NUMBERS
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <div
                style={{ fontFamily: FONTS.display }}
                className="text-5xl font-bold text-white mb-2"
              >
                2.4M+
              </div>
              <div className="text-[#94A3B8]">Shipments Monitored</div>
            </div>
            <div>
              <div
                style={{ fontFamily: FONTS.display }}
                className="text-5xl font-bold text-[#4DD9AC] mb-2"
              >
                ₹42Cr+
              </div>
              <div className="text-[#94A3B8]">Loss Prevented</div>
            </div>
            <div>
              <div
                style={{ fontFamily: FONTS.display }}
                className="text-5xl font-bold text-white mb-2"
              >
                14
              </div>
              <div className="text-[#94A3B8]">States Covered</div>
            </div>
            <div>
              <div
                style={{ fontFamily: FONTS.display }}
                className="text-5xl font-bold text-white mb-2"
              >
                67%
              </div>
              <div className="text-[#94A3B8]">
                Avg. Reduction in Excursion Time
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppWidget />
    </div>
  );
};

// Extracted sub-components to keep code clean
const NavBar = ({ scrolled, mobileMenuOpen, setMobileMenuOpen }: any) => (
  <nav
    className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-[#080B12]/90 backdrop-blur-md border-b border-[#1E293B] shadow-lg" : "bg-transparent"}`}
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-20">
        <div className="flex-shrink-0 flex items-center">
          <Link
            to="/"
            style={{ fontFamily: "monospace" }}
            className="text-2xl font-bold tracking-widest text-white hover:text-[#4DD9AC] transition-colors"
          >
            CARGOFY
          </Link>
        </div>
        <div className="hidden md:flex items-center space-x-8">
          <Link
            to="/product"
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
          >
            Platform
          </Link>
          <Link
            to="/solutions"
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
          >
            Solutions
          </Link>
          <Link
            to="/customer-stories"
            className="text-white border-b-2 border-[#4DD9AC] pb-1 text-sm font-medium"
          >
            Customers
          </Link>
          <Link
            to="/pricing"
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
          >
            Pricing
          </Link>
          <Link
            to="/about"
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
          >
            About
          </Link>
        </div>
        <div className="hidden md:flex items-center space-x-4">
          <Link
            to="/login"
            className="text-white hover:text-[#4DD9AC] transition-colors text-sm font-medium px-3 py-2"
          >
            Login
          </Link>
          <Link
            to="/signup"
            style={{ backgroundColor: COLORS.teal }}
            className="text-[#080B12] px-5 py-2.5 rounded-md font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(77,217,172,0.3)]"
          >
            Book a Demo →
          </Link>
        </div>
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-[#94A3B8] hover:text-white"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  </nav>
);

const Footer = () => (
  <footer className="pt-20 pb-10 border-t border-[#1E293B] bg-[#080B12]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
        <div className="col-span-2 md:col-span-1">
          <div
            style={{ fontFamily: "monospace" }}
            className="text-2xl font-bold tracking-widest text-white mb-6"
          >
            CARGOFY
          </div>
        </div>
        <div>
          <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
            Platform
          </h4>
          <ul className="space-y-4 text-[#94A3B8] text-sm">
            <li>
              <Link
                to="/product"
                className="hover:text-white transition-colors"
              >
                Control Tower
              </Link>
            </li>
            <li>
              <Link
                to="/product"
                className="hover:text-white transition-colors"
              >
                Risk Engine
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
            Solutions
          </h4>
          <ul className="space-y-4 text-[#94A3B8] text-sm">
            <li>
              <Link
                to="/solutions/dairy"
                className="hover:text-white transition-colors"
              >
                Dairy
              </Link>
            </li>
            <li>
              <Link
                to="/solutions/pharma"
                className="hover:text-white transition-colors"
              >
                Pharma
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
            Company
          </h4>
          <ul className="space-y-4 text-[#94A3B8] text-sm">
            <li>
              <Link to="/about" className="hover:text-white transition-colors">
                About
              </Link>
            </li>
            <li>
              <Link
                to="/customer-stories"
                className="hover:text-white transition-colors"
              >
                Customers
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">
            Legal
          </h4>
          <ul className="space-y-4 text-[#94A3B8] text-sm">
            <li>
              <Link to="/" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="pt-8 border-t border-[#1E293B] flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[#64748B] text-sm">
          © 2024 Cargofy Smart Supply Chain. Built in India.
        </p>
      </div>
    </div>
  </footer>
);

const WhatsAppWidget = () => (
  <a
    href="https://wa.me/1234567890"
    target="_blank"
    rel="noreferrer"
    className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
  >
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="css-i6dzq1"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
    </svg>
  </a>
);

export default CustomersPage;
