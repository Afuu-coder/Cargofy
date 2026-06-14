import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Target,
  Globe,
  Users,
  Navigation,
  Activity,
  ShieldCheck,
  Newspaper,
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

const TEAM = [
  {
    name: "Karan Mehta",
    role: "CEO & Co-founder",
    bg: "Background in supply chain consulting and Northeast India ops",
    initial: "K",
  },
  {
    name: "Aditi Rao",
    role: "CTO & Co-founder",
    bg: "Built IoT systems for cold storage networks across tier-2 India",
    initial: "A",
  },
  {
    name: "Sameer Singh",
    role: "Head of Product",
    bg: "Ex-Locus, 8 years in last-mile logistics product development",
    initial: "S",
  },
];

export const AboutPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 border-b border-[#1E293B] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#4DD9AC]/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1
            style={{ fontFamily: FONTS.display }}
            className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight"
          >
            We're Building India's <br />
            <span style={{ color: COLORS.teal }}>
              Cold Chain Intelligence Layer
            </span>
            .
          </h1>
          <p className="mt-6 text-xl md:text-2xl text-[#94A3B8] mx-auto leading-relaxed max-w-3xl">
            Every year, ₹92,000 crore worth of food is wasted in India's supply
            chain. We think most of it is preventable. Cargofy exists to prove
            it.
          </p>
        </div>
      </section>

      {/* ORIGIN STORY */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-2 bg-[#4DD9AC]"></div>
            <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest font-mono">
              The Problem We Couldn't Ignore
            </h2>
          </div>

          <div className="prose prose-lg prose-invert max-w-none space-y-6 text-[#94A3B8] leading-relaxed">
            <p>
              In 2023, our founders were working on supply chain tech for
              Northeast India — one of the country's most challenging logistics
              corridors. They kept hearing the exact same story from every
              distributor:
            </p>

            <div className="pl-6 border-l-2 border-[#1E293B] space-y-4 my-8 text-white font-serif italic text-xl">
              <p>"We found out about the breach 3 hours later."</p>
              <p>"The driver didn't call. The product was already gone."</p>
              <p>"We had no data. No proof. No way to know why."</p>
            </div>

            <p>
              Cold chain logistics in India had the same tracking tools as
              regular logistics — but different physics. A truck delay that
              costs you 30 minutes in Delhi costs you your entire dairy load on
              a 42°C day in Assam.
            </p>

            <p className="text-white text-xl font-bold mt-8">
              We built Cargofy because cold chain logistics needed its own
              operating system — one that understood temperature, spoilage,
              shelf life, and perishability as first-class concepts.
            </p>

            <p className="text-[#4DD9AC] font-mono text-lg mt-8 uppercase tracking-widest">
              Not a tracker. Not a dashboard. A spoilage prevention engine.
            </p>
          </div>
        </div>
      </section>

      {/* MISSION & VISION */}
      <section className="py-24 border-y border-[#1E293B] bg-[#05070A]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="bg-[#111622] border border-[#1E293B] p-10 rounded-2xl relative overflow-hidden">
              <Target className="absolute top-10 right-10 w-32 h-32 text-[#1E293B] opacity-30 pointer-events-none" />
              <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest mb-6 font-mono relative z-10">
                Our Mission
              </h2>
              <p
                className="text-2xl text-white leading-relaxed relative z-10"
                style={{ fontFamily: FONTS.display }}
              >
                Prevent food loss and pharmaceutical waste in India's cold chain
                by giving every logistics operator real-time intelligence and
                the tools to act on it.
              </p>
            </div>

            <div className="bg-[#111622] border border-[#1E293B] p-10 rounded-2xl relative overflow-hidden">
              <Globe className="absolute top-10 right-10 w-32 h-32 text-[#1E293B] opacity-30 pointer-events-none" />
              <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest mb-6 font-mono relative z-10">
                Our Vision
              </h2>
              <p
                className="text-2xl text-white leading-relaxed relative z-10"
                style={{ fontFamily: FONTS.display }}
              >
                A world where no perishable product is lost to a preventable
                temperature excursion — because every cold chain operator has
                the visibility, prediction, and tools to stop it in time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="py-24 bg-[#080B12]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              style={{ fontFamily: FONTS.display }}
              className="text-3xl md:text-5xl font-bold text-white mb-4"
            >
              Built by people who understand logistics.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {TEAM.map((member, idx) => (
              <div
                key={idx}
                className="bg-[#0A0D14] border border-[#1E293B] rounded-xl p-8 hover:-translate-y-1 transition-transform"
              >
                <div className="w-20 h-20 bg-[#111622] border border-[#1E293B] text-[#4DD9AC] rounded-full flex items-center justify-center text-2xl font-bold mb-6">
                  {member.initial}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {member.name}
                </h3>
                <div className="text-[#4DD9AC] font-mono text-xs uppercase tracking-widest mb-4">
                  {member.role}
                </div>
                <p className="text-[#94A3B8] leading-relaxed text-sm">
                  {member.bg}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              to="/about"
              className="inline-flex items-center text-[#94A3B8] hover:text-white transition-colors"
            >
              See all team members <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="py-24 bg-[#111622] border-y border-[#1E293B]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <h2 className="text-sm font-bold text-[#4DD9AC] uppercase tracking-widest font-mono mb-4">
              How We Build
            </h2>
            <h3
              style={{ fontFamily: FONTS.display }}
              className="text-4xl font-bold text-white"
            >
              Our Values
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="flex gap-6">
              <Activity className="w-8 h-8 text-[#4DD9AC] flex-shrink-0" />
              <div>
                <h4 className="text-xl font-bold text-white mb-3">
                  Operational First
                </h4>
                <p className="text-[#94A3B8] leading-relaxed">
                  We don't ship features. We ship tools that dispatchers
                  actually use at 3 AM during a critical excursion.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <ShieldCheck className="w-8 h-8 text-[#4DD9AC] flex-shrink-0" />
              <div>
                <h4 className="text-xl font-bold text-white mb-3">
                  Specific Over Vague
                </h4>
                <p className="text-[#94A3B8] leading-relaxed">
                  Our product speaks in shipment IDs, degrees Celsius, and
                  minutes — not "AI insights" and "smart logistics."
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <Navigation className="w-8 h-8 text-[#4DD9AC] flex-shrink-0" />
              <div>
                <h4 className="text-xl font-bold text-white mb-3">
                  India-Native
                </h4>
                <p className="text-[#94A3B8] leading-relaxed">
                  We build for Indian roads, Indian infrastructure, and Indian
                  supply chains — NE corridors, hill routes, monsoon delays, and
                  all.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <Target className="w-8 h-8 text-[#4DD9AC] flex-shrink-0" />
              <div>
                <h4 className="text-xl font-bold text-white mb-3">
                  Loss = Waste
                </h4>
                <p className="text-[#94A3B8] leading-relaxed">
                  Every prevented spoilage is food saved, CO₂ not emitted, and
                  working capital protected. We measure both.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INVESTORS & PRESS */}
      <section className="py-24 bg-[#0A0D14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Press */}
            <div>
              <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-widest mb-8 font-mono">
                In The News
              </h2>
              <div className="space-y-6 mb-8">
                <div className="border border-[#1E293B] rounded-lg p-6 bg-[#111622]">
                  <div className="text-[#4DD9AC] text-xs font-bold uppercase mb-2">
                    TechCrunch India
                  </div>
                  <p className="text-white italic">
                    "Cargofy is solving cold chain loss with unprecedented
                    precision..."
                  </p>
                </div>
                <div className="border border-[#1E293B] rounded-lg p-6 bg-[#111622]">
                  <div className="text-[#4DD9AC] text-xs font-bold uppercase mb-2">
                    YourStory
                  </div>
                  <p className="text-white italic">
                    "The Locus for perishables. How Cargofy is rethinking
                    logistics..."
                  </p>
                </div>
                <div className="border border-[#1E293B] rounded-lg p-6 bg-[#111622]">
                  <div className="text-[#4DD9AC] text-xs font-bold uppercase mb-2">
                    Logistics Insider
                  </div>
                  <p className="text-white italic">
                    "India's most important cold chain operating system..."
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <a
                  href="mailto:press@cargofy.in"
                  className="text-sm text-[#94A3B8] hover:text-white transition-colors underline"
                >
                  Press Kit
                </a>
                <a
                  href="mailto:press@cargofy.in"
                  className="text-sm text-[#94A3B8] hover:text-white transition-colors underline"
                >
                  Media Contact
                </a>
              </div>
            </div>

            {/* Careers */}
            <div>
              <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-widest mb-8 font-mono">
                Join Us
              </h2>
              <div className="bg-[#111622] border border-[#1E293B] rounded-xl p-8 h-[calc(100%-4rem)] flex flex-col">
                <p className="text-white text-lg mb-8 leading-relaxed">
                  We're a small team solving a big problem. If you care about
                  logistics, food systems, and building software that actually
                  runs in the real world — we want to hear from you.
                </p>
                <div className="space-y-4 mb-8 flex-1">
                  <div className="flex items-center justify-between text-[#94A3B8] border-b border-[#1E293B] pb-2">
                    <span>Full-Stack Engineer (React + Node)</span>
                    <span className="text-xs uppercase bg-[#1E293B] px-2 py-1 rounded">
                      Tech
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#94A3B8] border-b border-[#1E293B] pb-2">
                    <span>ML Engineer (Vertex AI / Python)</span>
                    <span className="text-xs uppercase bg-[#1E293B] px-2 py-1 rounded">
                      Data
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#94A3B8] border-b border-[#1E293B] pb-2">
                    <span>Logistics Solutions Engineer</span>
                    <span className="text-xs uppercase bg-[#1E293B] px-2 py-1 rounded">
                      Sales
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#94A3B8] pb-2">
                    <span>Customer Success (Ops background)</span>
                    <span className="text-xs uppercase bg-[#1E293B] px-2 py-1 rounded">
                      CS
                    </span>
                  </div>
                </div>
                <Link
                  to="/careers"
                  className="inline-flex items-center text-[#4DD9AC] hover:text-white font-bold transition-colors"
                >
                  See all open roles <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-32 border-t border-[#1E293B] bg-[#080B12] text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2
            style={{ fontFamily: FONTS.display }}
            className="text-4xl font-bold text-white mb-8"
          >
            Ready to see Cargofy in your cold chain?
          </h2>
          <div className="flex justify-center">
            <Link
              to="/signup"
              style={{ backgroundColor: COLORS.teal }}
              className="text-[#080B12] px-8 py-4 rounded-md font-bold text-lg hover:opacity-90 transition-all shadow-[0_0_20px_rgba(77,217,172,0.3)]"
            >
              Book a 20-min Demo →
            </Link>
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
            className="text-[#94A3B8] hover:text-white transition-colors text-sm font-medium"
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
            className="text-white border-b-2 border-[#4DD9AC] pb-1 text-sm font-medium"
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
    href="https://wa.me/919876543210"
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

export default AboutPage;
