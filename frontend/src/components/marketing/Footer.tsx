import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Risk Score',           to: '/product/spoilage-risk-score' },
      { label: 'Gemini Alerts',        to: '/product/gemini-alerts' },
      { label: 'Live Dashboard',       to: '/product/live-dashboard' },
      { label: 'IoT Setup',            to: '/product/iot-integration' },
      { label: 'Route Reco',           to: '/product/route-recommendations' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Dairy MSME',        to: '/solutions/dairy-msme' },
      { label: 'Fresh Produce',     to: '/solutions/fruits-vegetables' },
      { label: 'Frozen Foods',      to: '/solutions/frozen-foods' },
      { label: 'Pharma',            to: '/solutions/pharma-cold-chain' },
      { label: 'FPO Cooperatives',  to: '/solutions/fpo-cooperatives' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', to: '/about' },
      { label: 'Pricing',  to: '/pricing' },
      { label: 'Contact',  to: '/contact' },
      { label: 'Login',    to: '/login' },
      { label: 'Sign Up',  to: '/signup' },
    ],
  },
];

export const MarketingFooter: React.FC = () => {
  return (
    <>
      <footer style={{ background: '#fff', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3.5rem 1.5rem 2rem' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10">

            {/* Brand col */}
            <div className="col-span-2 md:col-span-4 lg:col-span-2">
              <Link to="/" style={{ textDecoration: 'none' }}>
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: '1.375rem', color: '#0F6E56', letterSpacing: '-0.02em' }}>
                  ⬡ Cargofy
                </span>
              </Link>
              <p style={{ fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.65, maxWidth: '18rem', margin: '0.75rem 0 1.25rem' }}>
                India's AI-powered cold chain guardian for food &amp; dairy MSMEs.
                Predict. Protect. Prevent.
              </p>

              {/* Social */}
              <div style={{ display: 'flex', gap: '0.625rem' }}>
                {[
                  {
                    label: 'LinkedIn', href: 'https://linkedin.com',
                    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
                  },
                  {
                    label: 'Twitter', href: 'https://twitter.com',
                    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
                  },
                ].map(({ label, href, icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    style={{
                      width: 36, height: 36, borderRadius: '0.5rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid #E5E7EB', color: '#9CA3AF',
                      transition: 'all 0.15s',
                    }}
                    className="hover:text-[#0F6E56] hover:border-[#BDE9D9] hover:bg-[#E1F5EE]"
                  >
                    {icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Link columns */}
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p style={{
                  fontSize: '0.6875rem', fontWeight: 600, color: '#9CA3AF',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  marginBottom: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  {col.title}
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {col.links.map(({ label, to }) => (
                    <li key={label}>
                      <Link
                        to={to}
                        style={{ fontSize: '0.875rem', color: '#6B7280', textDecoration: 'none', transition: 'color 0.15s' }}
                        className="hover:text-[#0F6E56]"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={{
            marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #F3F4F6',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}>
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              © 2026 Cargofy Supply Chain AI. Made with ❄️ in India.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {[{ label: 'Privacy Policy', to: '/privacy' }, { label: 'Terms of Service', to: '/terms' }].map(({ label, to }) => (
                <Link key={label} to={to} style={{ fontSize: '0.75rem', color: '#9CA3AF', textDecoration: 'none' }} className="hover:text-[#0F6E56]">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/919999999999?text=Hi%20Cargofy%2C%20I%20want%20to%20book%20a%20demo"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 50,
          width: 56, height: 56, background: '#25D366', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px -4px rgba(37,211,102,0.5)',
          transition: 'transform 0.2s',
        }}
        className="hover:scale-110"
      >
        <MessageCircle size={26} color="#fff" fill="#fff" />
      </a>
    </>
  );
};

export default MarketingFooter;
