import React from 'react';
import { MarketingNavbar } from './Navbar';
import { MarketingFooter } from './Footer';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

/**
 * MarketingLayout — wraps all public/marketing pages with
 * light-mode Navbar and Footer. The body background is overridden
 * to white (#F9FAFB) for the public site, separate from the
 * dark-mode dashboard body style.
 */
export const MarketingLayout: React.FC<MarketingLayoutProps> = ({ children }) => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F9FAFB', color: '#1A1A1A' }}>
      <MarketingNavbar />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
};

export default MarketingLayout;
