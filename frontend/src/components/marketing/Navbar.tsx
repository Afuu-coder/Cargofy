import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';

const NAV = [
  {
    label: 'Product',
    to: '/product',
    children: [
      { label: 'Spoilage Risk Score',    to: '/product/spoilage-risk-score',    desc: 'How AI calculates 0–100 risk' },
      { label: 'Gemini Hinglish Alerts', to: '/product/gemini-alerts',          desc: 'AI explanations in your language' },
      { label: 'Live Dashboard',         to: '/product/live-dashboard',         desc: 'All shipments, one screen' },
      { label: 'IoT Integration',        to: '/product/iot-integration',        desc: 'Sensor setup guide' },
      { label: 'Route Recommendations',  to: '/product/route-recommendations',  desc: 'Smart rerouting system' },
    ],
  },
  {
    label: 'Solutions',
    to: '/solutions',
    children: [
      { label: 'Dairy & MSME',        to: '/solutions/dairy-msme',         desc: 'Milk, paneer, yogurt' },
      { label: 'Fruits & Vegetables', to: '/solutions/fruits-vegetables',  desc: 'Fresh produce' },
      { label: 'Frozen Foods',        to: '/solutions/frozen-foods',       desc: 'Sub-zero monitoring' },
      { label: 'Pharma Cold Chain',   to: '/solutions/pharma-cold-chain',  desc: 'Compliance & audit trail' },
      { label: 'FPO Cooperatives',    to: '/solutions/fpo-cooperatives',   desc: 'Farmer cooperatives' },
    ],
  },
  {
    label: 'Why Cargofy',
    to: '/why-cargofy',
    children: [
      { label: 'Cargofy vs FarEye',       to: '/why-cargofy/vs-fareye',        desc: 'Enterprise comparison' },
      { label: 'Cargofy vs Locus',        to: '/why-cargofy/vs-locus',         desc: 'Route platform comparison' },
      { label: 'Cargofy vs Basic GPS',    to: '/why-cargofy/vs-basic-gps',     desc: 'Why GPS alone fails' },
      { label: 'Open Innovation',      to: '/why-cargofy/open-innovation',  desc: 'Open API & architecture' },
    ],
  },
  { label: 'Pricing', to: '/pricing' },
  {
    label: 'Resources',
    to: '/resources',
    children: [
      { label: 'Blog',         to: '/resources/blog',          desc: 'Cold chain articles' },
      { label: 'Case Studies', to: '/resources/case-studies',  desc: 'MSME success stories' },
      { label: 'Whitepapers',  to: '/resources/whitepapers',   desc: 'Research & reports' },
      { label: 'API Docs',     to: '/resources/api-docs',      desc: 'Developer documentation' },
      { label: 'FAQs',         to: '/resources/faqs',          desc: 'Common questions' },
    ],
  },
  {
    label: 'About',
    to: '/about',
    children: [
      { label: 'Our Story',  to: '/about/company',  desc: 'Mission & founding story' },
      { label: 'Team',       to: '/about/team',     desc: 'Founders & advisors' },
      { label: 'Impact',     to: '/about/impact',   desc: 'SDG alignment & numbers' },
      { label: 'Careers',    to: '/about/careers',  desc: 'Open roles' },
      { label: 'Press',      to: '/about/press',    desc: 'Awards & media' },
    ],
  },
  { label: 'Contact', to: '/contact' },
];

export const MarketingNavbar: React.FC = () => {
  const navigate = useNavigate();
  const [scrolled,       setScrolled]       = useState(false);
  const [mobileOpen,     setMobileOpen]     = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white border-b border-gray-100 shadow-sm' : 'bg-transparent'
        }`}
        style={{ height: 64 }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: '1.375rem', color: '#0F6E56', letterSpacing: '-0.02em' }}>
              ⬡ Cargofy
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {NAV.map((item) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => item.children && setActiveDropdown(item.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  to={item.to}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.5rem 0.875rem',
                    fontSize: '0.9rem', fontWeight: 500,
                    color: scrolled ? '#374151' : '#1A1A1A',
                    borderRadius: '0.5rem',
                    transition: 'all 0.15s',
                    textDecoration: 'none',
                  }}
                  className="hover:text-[#0F6E56] hover:bg-[#E1F5EE]"
                >
                  {item.label}
                  {item.children && (
                    <ChevronDown
                      size={13}
                      style={{
                        opacity: 0.5,
                        transition: 'transform 0.2s',
                        transform: activeDropdown === item.label ? 'rotate(180deg)' : 'none',
                      }}
                    />
                  )}
                </Link>

                {/* Dropdown */}
                {item.children && activeDropdown === item.label && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, paddingTop: '0.5rem', width: '16rem', zIndex: 50 }}>
                    <div style={{ background: '#fff', border: '1px solid #F3F4F6', borderRadius: '0.75rem', boxShadow: '0 24px 48px -8px rgba(0,0,0,0.12)', padding: '0.375rem' }}>
                      {item.children.map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          style={{ display: 'flex', flexDirection: 'column', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', textDecoration: 'none', transition: 'background 0.15s' }}
                          className="hover:bg-[#E1F5EE] group"
                        >
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }} className="group-hover:text-[#0F6E56]">{child.label}</span>
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.125rem' }}>{child.desc}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-2.5">
            <Link to="/login" className="mkt-btn-ghost" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', color: scrolled ? '#374151' : '#1A1A1A' }}>
              Login
            </Link>
            <Link to="/signup" className="mkt-btn-primary" style={{ fontSize: '0.875rem', padding: '0.625rem 1.25rem' }}>
              Start Free →
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="lg:hidden p-2 rounded-lg hover:bg-[#E1F5EE] transition-colors"
            style={{ color: '#374151' }}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#fff', display: 'flex', flexDirection: 'column', paddingTop: 64, overflowY: 'auto' }}>
          <div style={{ flex: 1, padding: '1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {NAV.map((item) => (
              <div key={item.label}>
                <button
                  onClick={() => setMobileExpanded(mobileExpanded === item.label ? null : item.label)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.875rem 1rem', fontWeight: 600, fontSize: '1rem',
                    color: '#111827', borderRadius: '0.75rem',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: 'background 0.15s',
                  }}
                  className="hover:bg-[#E1F5EE] hover:text-[#0F6E56]"
                >
                  {item.label}
                  {item.children && (
                    <ChevronDown size={16} style={{ color: '#9CA3AF', transition: 'transform 0.2s', transform: mobileExpanded === item.label ? 'rotate(180deg)' : 'none' }} />
                  )}
                </button>

                {item.children && mobileExpanded === item.label && (
                  <div style={{ marginLeft: '1rem', borderLeft: '2px solid #BDE9D9', paddingLeft: '1rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {item.children.map((child) => (
                      <Link
                        key={child.to}
                        to={child.to}
                        onClick={() => setMobileOpen(false)}
                        style={{ padding: '0.5rem 0', fontSize: '0.9rem', color: '#6B7280', textDecoration: 'none', transition: 'color 0.15s' }}
                        className="hover:text-[#0F6E56]"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '1.5rem 1.25rem', borderTop: '1px solid #F3F4F6', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link to="/login"  className="mkt-btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setMobileOpen(false)}>Login</Link>
            <Link to="/signup" className="mkt-btn-primary"   style={{ justifyContent: 'center' }} onClick={() => setMobileOpen(false)}>Start Free — No Credit Card</Link>
          </div>
        </div>
      )}
    </>
  );
};

export default MarketingNavbar;
